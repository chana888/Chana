package database

import (
	"database/sql"
	"errors"
	"fmt"
	"path"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
)

var ErrWorkspaceProjectConflict = errors.New("工作区已经绑定其他项目")

type WorkspaceProjectSync struct {
	WorkspaceID string `json:"workspace_id"`
	Path        string `json:"path"`
	Title       string `json:"title"`
	ProjectID   string `json:"project_id,omitempty"`
	Removed     bool   `json:"removed"`
}

type WorkspaceProjectBinding struct {
	WorkspaceID string    `json:"workspace_id"`
	ProjectID   string    `json:"project_id"`
	Path        string    `json:"path"`
	Title       string    `json:"title"`
	State       string    `json:"state"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type WorkspaceProjectResult struct {
	Project *Project                 `json:"project"`
	Binding *WorkspaceProjectBinding `json:"binding"`
	Created bool                     `json:"created"`
}

func ValidateWorkspaceProjectSync(input *WorkspaceProjectSync) error {
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.Path = strings.TrimSpace(input.Path)
	input.Title = strings.TrimSpace(input.Title)
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	if input.WorkspaceID == "" || len(input.WorkspaceID) > 128 || strings.IndexFunc(input.WorkspaceID, unicode.IsControl) >= 0 {
		return fmt.Errorf("workspace_id 无效")
	}
	if input.Removed {
		return nil
	}
	if input.Path == "" || len(input.Path) > 4096 || strings.IndexFunc(input.Path, unicode.IsControl) >= 0 {
		return fmt.Errorf("工作区 path 无效")
	}
	if input.Title == "" {
		input.Title = path.Base(strings.ReplaceAll(input.Path, "\\", "/"))
	}
	if input.Title == "." || input.Title == "/" || len([]rune(input.Title)) > 200 || strings.IndexFunc(input.Title, unicode.IsControl) >= 0 {
		return fmt.Errorf("工作区 title 无效")
	}
	return nil
}

func (db *DB) ensureWorkspaceProjectTable() error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS workspace_project_bindings (
		workspace_id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL UNIQUE,
		path TEXT NOT NULL,
		title TEXT NOT NULL,
		state TEXT NOT NULL DEFAULT 'active',
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`)
	return err
}

func scanWorkspaceProject(row *sql.Row) (*WorkspaceProjectResult, error) {
	result := &WorkspaceProjectResult{Project: &Project{}, Binding: &WorkspaceProjectBinding{}}
	p, b := result.Project, result.Binding
	var pinned int
	var pc, pu, bc, bu string
	err := row.Scan(&p.ID, &p.Name, &p.Description, &p.ScopeJSON, &p.Status, &pinned, &pc, &pu,
		&b.WorkspaceID, &b.ProjectID, &b.Path, &b.Title, &b.State, &bc, &bu)
	if err != nil {
		return nil, err
	}
	p.Pinned = pinned != 0
	p.CreatedAt, p.UpdatedAt = parseDBTime(pc), parseDBTime(pu)
	b.CreatedAt, b.UpdatedAt = parseDBTime(bc), parseDBTime(bu)
	return result, nil
}

const workspaceProjectSelect = `SELECT p.id, p.name, COALESCE(p.description,''), COALESCE(p.scope_json,''),
	p.status, p.pinned, p.created_at, p.updated_at,
	b.workspace_id, b.project_id, b.path, b.title, b.state, b.created_at, b.updated_at
	FROM workspace_project_bindings b JOIN projects p ON p.id = b.project_id WHERE b.workspace_id = ?`

func (db *DB) ListWorkspaceProjectBindings() ([]WorkspaceProjectBinding, error) {
	if err := db.ensureWorkspaceProjectTable(); err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT workspace_id, project_id, path, title, state FROM workspace_project_bindings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var bindings []WorkspaceProjectBinding
	for rows.Next() {
		var binding WorkspaceProjectBinding
		if err := rows.Scan(&binding.WorkspaceID, &binding.ProjectID, &binding.Path, &binding.Title, &binding.State); err != nil {
			return nil, err
		}
		bindings = append(bindings, binding)
	}
	return bindings, rows.Err()
}

// GetWorkspaceProject 以稳定的工作区 ID 查找跨模块共享项目。
func (db *DB) GetWorkspaceProject(workspaceID string) (*WorkspaceProjectResult, error) {
	if err := db.ensureWorkspaceProjectTable(); err != nil {
		return nil, err
	}
	return scanWorkspaceProject(db.QueryRow(workspaceProjectSelect, strings.TrimSpace(workspaceID)))
}

// SyncWorkspaceProject 在同一事务中建立项目与映射；删除工作区后归档项目，保留成果关联。
func (db *DB) SyncWorkspaceProject(input WorkspaceProjectSync, ownerUserID string) (*WorkspaceProjectResult, error) {
	if err := ValidateWorkspaceProjectSync(&input); err != nil {
		return nil, err
	}
	if err := db.ensureWorkspaceProjectTable(); err != nil {
		return nil, err
	}
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	// 先取得 SQLite 写锁，避免并发回调同时读到不存在后重复创建项目。
	if _, err := tx.Exec(`UPDATE workspace_project_bindings SET updated_at = updated_at WHERE workspace_id = ?`, input.WorkspaceID); err != nil {
		return nil, err
	}
	result, err := scanWorkspaceProject(tx.QueryRow(workspaceProjectSelect, input.WorkspaceID))
	now := time.Now()
	created := false
	if errors.Is(err, sql.ErrNoRows) {
		if input.Removed {
			return nil, sql.ErrNoRows
		}
		projectID := input.ProjectID
		if projectID == "" {
			projectID = uuid.NewString()
			_, err = tx.Exec(`INSERT INTO projects (id,name,description,scope_json,status,pinned,created_at,updated_at,owner_user_id)
				VALUES (?,?,'','','active',0,?,?,?)`, projectID, input.Title, now, now, strings.TrimSpace(ownerUserID))
			if err != nil {
				return nil, err
			}
			if strings.TrimSpace(ownerUserID) != "" {
				_, err = tx.Exec(`INSERT INTO rbac_resource_assignments (id,user_id,resource_type,resource_id,created_at)
					VALUES (?,?,'project',?,?)`, uuid.NewString(), ownerUserID, projectID, now)
				if err != nil {
					return nil, err
				}
			}
			created = true
		} else {
			var exists int
			if err := tx.QueryRow(`SELECT 1 FROM projects WHERE id = ?`, projectID).Scan(&exists); err != nil {
				return nil, err
			}
			var boundWorkspace string
			if err := tx.QueryRow(`SELECT workspace_id FROM workspace_project_bindings WHERE project_id = ?`, projectID).Scan(&boundWorkspace); err == nil {
				return nil, ErrWorkspaceProjectConflict
			} else if !errors.Is(err, sql.ErrNoRows) {
				return nil, err
			}
		}
		_, err = tx.Exec(`INSERT INTO workspace_project_bindings (workspace_id,project_id,path,title,state,created_at,updated_at)
			VALUES (?,?,?,?,'active',?,?)`, input.WorkspaceID, projectID, input.Path, input.Title, now, now)
		if err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	} else {
		b := result.Binding
		if input.ProjectID != "" && input.ProjectID != b.ProjectID {
			return nil, ErrWorkspaceProjectConflict
		}
		if input.Removed {
			if b.State != "detached" {
				_, err = tx.Exec(`UPDATE workspace_project_bindings SET state = 'detached', updated_at = ? WHERE workspace_id = ?`, now, input.WorkspaceID)
			}
			if err == nil {
				_, err = tx.Exec(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ? AND status != 'archived'`, now, b.ProjectID)
			}
		} else {
			_, err = tx.Exec(`UPDATE workspace_project_bindings SET path = ?, title = ?, state = 'active', updated_at = ? WHERE workspace_id = ?`,
				input.Path, input.Title, now, input.WorkspaceID)
		}
		if err != nil {
			return nil, err
		}
	}
	// 工作区始终决定项目名称与是否存在，首次绑定与后续同步采用相同规则。
	if !input.Removed {
		_, err = tx.Exec(`UPDATE projects SET name = ?, status = 'active', updated_at = ?
			WHERE id = (SELECT project_id FROM workspace_project_bindings WHERE workspace_id = ?)
			AND (name != ? OR status != 'active')`, input.Title, now, input.WorkspaceID, input.Title)
		if err != nil {
			return nil, err
		}
	}
	result, err = scanWorkspaceProject(tx.QueryRow(workspaceProjectSelect, input.WorkspaceID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	result.Created = created
	return result, nil
}

// GetProjectWorkspaceBinding 按共享项目标识查找工作区，包含可重试清理的已解绑记录。
func (db *DB) GetProjectWorkspaceBinding(projectID string) (*WorkspaceProjectBinding, error) {
	if err := db.ensureWorkspaceProjectTable(); err != nil {
		return nil, err
	}
	var binding WorkspaceProjectBinding
	err := db.QueryRow(`SELECT workspace_id,project_id,path,title,state FROM workspace_project_bindings WHERE project_id = ?`, projectID).
		Scan(&binding.WorkspaceID, &binding.ProjectID, &binding.Path, &binding.Title, &binding.State)
	return &binding, err
}

// PurgeDetachedWorkspaceProjects 删除已解除连接（workspace 消失）的工作区项目及其业务数据。
// 与归档不同：这里的语义是“工作区删除 = 项目删除”，漏洞/资产/事实/队列等一并删除，
// 避免漏洞管理里残留空项目分组。
func (db *DB) PurgeDetachedWorkspaceProjects() (int, error) {
	if err := db.ensureWorkspaceProjectTable(); err != nil {
		return 0, err
	}
	rows, err := db.Query(`SELECT project_id FROM workspace_project_bindings WHERE state != 'active'`)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	purged := 0
	for _, projectID := range ids {
		stmts := []string{
			`DELETE FROM project_fact_edges WHERE project_id = ?`,
			`DELETE FROM project_facts WHERE project_id = ?`,
			`DELETE FROM vulnerabilities WHERE project_id = ?`,
			`DELETE FROM assets WHERE project_id = ?`,
			`DELETE FROM batch_task_queues WHERE project_id = ?`,
			`UPDATE webshell_connections SET project_id = NULL WHERE project_id = ?`,
			`UPDATE c2_listeners SET project_id = NULL WHERE project_id = ?`,
			`UPDATE workflow_runs SET project_id = NULL WHERE project_id = ?`,
			`UPDATE conversations SET project_id = NULL WHERE project_id = ?`,
			`DELETE FROM rbac_resource_assignments WHERE resource_type = 'project' AND resource_id = ?`,
			`DELETE FROM workspace_project_bindings WHERE project_id = ?`,
			`DELETE FROM projects WHERE id = ?`,
		}
		for _, q := range stmts {
			if _, err := db.Exec(q, projectID); err != nil {
				if strings.Contains(strings.ToLower(err.Error()), "no such table") {
					continue
				}
				return purged, err
			}
		}
		db.removeProjectScopedDirs(projectID)
		purged++
	}
	return purged, nil
}

// 完整工作区快照提交后，撤下没有工作区的独立旧项目，保留原始成果。
func (db *DB) ArchiveProjectsOutsideWorkspaces() error {
	_, err := db.Exec(`UPDATE projects SET status = 'archived', updated_at = ?
		WHERE status != 'archived' AND NOT EXISTS (
			SELECT 1 FROM workspace_project_bindings b WHERE b.project_id = projects.id AND b.state = 'active'
		)`, time.Now())
	return err
}
