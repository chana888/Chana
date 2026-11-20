package database

import (
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

// 工作区删除后，项目及其漏洞应一并删除，而不是仅归档。
func TestPurgeDetachedWorkspaceProjects(t *testing.T) {
	db, err := NewDB(filepath.Join(t.TempDir(), "purge.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	result, err := db.SyncWorkspaceProject(WorkspaceProjectSync{
		WorkspaceID: "ws-purge",
		Path:        "/tmp/ws-purge",
		Title:       "待删项目",
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	projectID := result.Project.ID

	if _, err := db.Exec(`INSERT INTO vulnerabilities (id,title,severity,status,project_id,created_at,updated_at)
		VALUES ('v1','测试漏洞','high','open',?,datetime('now'),datetime('now'))`, projectID); err != nil {
		t.Fatal(err)
	}

	if _, err := db.SyncWorkspaceProject(WorkspaceProjectSync{WorkspaceID: "ws-purge", Removed: true}, ""); err != nil {
		t.Fatal(err)
	}

	purged, err := db.PurgeDetachedWorkspaceProjects()
	if err != nil {
		t.Fatal(err)
	}
	if purged != 1 {
		t.Fatalf("purged=%d want 1", purged)
	}

	var projects, vulns, bindings int
	if err := db.QueryRow(`SELECT COUNT(*) FROM projects WHERE id = ?`, projectID).Scan(&projects); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM vulnerabilities WHERE project_id = ?`, projectID).Scan(&vulns); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM workspace_project_bindings WHERE project_id = ?`, projectID).Scan(&bindings); err != nil {
		t.Fatal(err)
	}
	if projects != 0 || vulns != 0 || bindings != 0 {
		t.Fatalf("cleanup incomplete: projects=%d vulns=%d bindings=%d", projects, vulns, bindings)
	}
}
