package database

import (
	"database/sql"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"go.uber.org/zap"
)

func newWorkspaceProjectTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := NewDB(filepath.Join(t.TempDir(), "workspaces.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestWorkspaceProjectLifecycleIsIdempotentAndPreservesResults(t *testing.T) {
	db := newWorkspaceProjectTestDB(t)
	input := WorkspaceProjectSync{WorkspaceID: "workspace-test2", Path: "/opt/chana-home/test2"}
	first, err := db.SyncWorkspaceProject(input, "")
	if err != nil {
		t.Fatal(err)
	}
	if !first.Created || first.Project.Name != "test2" || first.Binding.State != "active" {
		t.Fatalf("unexpected initial result: %+v %+v", first.Project, first.Binding)
	}
	again, err := db.SyncWorkspaceProject(input, "")
	if err != nil {
		t.Fatal(err)
	}
	if again.Created || again.Project.ID != first.Project.ID || !again.Project.UpdatedAt.Equal(first.Project.UpdatedAt) {
		t.Fatalf("replay created or changed project: %+v", again)
	}
	input.Title = "test2-renamed"
	input.Path = "/opt/chana-home/renamed"
	renamed, err := db.SyncWorkspaceProject(input, "")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Project.ID != first.Project.ID || renamed.Project.Name != input.Title || renamed.Binding.Path != input.Path {
		t.Fatalf("rename lost project identity: %+v %+v", renamed.Project, renamed.Binding)
	}
	renamed.Project.Description = "保留项目成果"
	if err := db.UpdateProject(renamed.Project); err != nil {
		t.Fatal(err)
	}
	fact, err := db.UpsertProjectFact(&ProjectFact{ProjectID: first.Project.ID, FactKey: "acceptance.result", Summary: "保留事实关联"})
	if err != nil {
		t.Fatal(err)
	}
	detached, err := db.SyncWorkspaceProject(WorkspaceProjectSync{WorkspaceID: input.WorkspaceID, Removed: true}, "")
	if err != nil {
		t.Fatal(err)
	}
	if detached.Binding.State != "detached" || detached.Project.Status != "archived" || detached.Project.Description != "保留项目成果" {
		t.Fatalf("remove changed project results: %+v %+v", detached.Project, detached.Binding)
	}
	kept, err := db.GetProjectFact(fact.ID)
	if err != nil || kept.ProjectID != first.Project.ID {
		t.Fatalf("删除工作区后事实关联丢失: %+v, %v", kept, err)
	}
	restored, err := db.SyncWorkspaceProject(input, "")
	if err != nil {
		t.Fatal(err)
	}
	if restored.Project.ID != first.Project.ID || restored.Binding.State != "active" || restored.Project.Status != "active" {
		t.Fatal("restore must reuse the original project")
	}
	count, err := db.CountProjects("", "")
	if err != nil || count != 1 {
		t.Fatalf("project count = %d, err = %v", count, err)
	}
	queried, err := db.GetWorkspaceProject(input.WorkspaceID)
	if err != nil || queried.Project.ID != first.Project.ID {
		t.Fatalf("lookup = %+v, err = %v", queried, err)
	}
}

func TestWorkspaceProjectExplicitBindingAndConflict(t *testing.T) {
	db := newWorkspaceProjectTestDB(t)
	existing, err := db.CreateProject(&Project{Name: "existing"})
	if err != nil {
		t.Fatal(err)
	}
	input := WorkspaceProjectSync{WorkspaceID: "workspace-a", Path: "/existing", ProjectID: existing.ID}
	bound, err := db.SyncWorkspaceProject(input, "")
	if err != nil || bound.Created || bound.Project.ID != existing.ID {
		t.Fatalf("explicit binding = %+v, err = %v", bound, err)
	}
	input.WorkspaceID = "workspace-b"
	if _, err := db.SyncWorkspaceProject(input, ""); !errors.Is(err, ErrWorkspaceProjectConflict) {
		t.Fatalf("second binding error = %v", err)
	}
	input.WorkspaceID = "workspace-a"
	input.ProjectID = "different-project"
	if _, err := db.SyncWorkspaceProject(input, ""); !errors.Is(err, ErrWorkspaceProjectConflict) {
		t.Fatalf("rebind error = %v", err)
	}
	if _, err := db.SyncWorkspaceProject(WorkspaceProjectSync{WorkspaceID: "never-created", Removed: true}, ""); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("unknown removal error = %v", err)
	}
}

func TestWorkspaceProjectIdentityUsesIDRatherThanFolderName(t *testing.T) {
	db := newWorkspaceProjectTestDB(t)
	a, err := db.SyncWorkspaceProject(WorkspaceProjectSync{WorkspaceID: "workspace-a", Path: "/a/test2"}, "")
	if err != nil {
		t.Fatal(err)
	}
	b, err := db.SyncWorkspaceProject(WorkspaceProjectSync{WorkspaceID: "workspace-b", Path: "/b/test2"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if a.Project.ID == b.Project.ID || a.Project.Name != b.Project.Name {
		t.Fatal("different workspaces with the same folder name must keep distinct project identities")
	}
}

func TestWorkspaceProjectCreationRollsBackOnInvalidOwner(t *testing.T) {
	db := newWorkspaceProjectTestDB(t)
	input := WorkspaceProjectSync{WorkspaceID: "workspace-a", Path: "/test2"}
	if _, err := db.SyncWorkspaceProject(input, "missing-user"); err == nil {
		t.Fatal("invalid owner must fail the assignment foreign key")
	}
	count, err := db.CountProjects("", "")
	if err != nil || count != 0 {
		t.Fatalf("failed transaction left a project: count=%d err=%v", count, err)
	}
	if _, err := db.GetWorkspaceProject(input.WorkspaceID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("failed transaction left a binding: %v", err)
	}
	user, err := db.CreateRBACUser("workspace-owner", "Workspace Owner", "hash", true, nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := db.SyncWorkspaceProject(input, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !db.UserCanAccessResource(user.ID, RBACScopeOwn, "project", result.Project.ID) {
		t.Fatal("created project lacks its owner's access")
	}
}

func TestWorkspaceProjectConcurrentCreation(t *testing.T) {
	db := newWorkspaceProjectTestDB(t)
	input := WorkspaceProjectSync{WorkspaceID: "workspace-concurrent", Path: "/test2"}
	var wg sync.WaitGroup
	errorsCh := make(chan error, 12)
	ids := make(chan string, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := db.SyncWorkspaceProject(input, "")
			if err != nil {
				errorsCh <- err
				return
			}
			ids <- result.Project.ID
		}()
	}
	wg.Wait()
	close(errorsCh)
	close(ids)
	for err := range errorsCh {
		t.Error(err)
	}
	var expectedID string
	for id := range ids {
		if expectedID == "" {
			expectedID = id
		} else if id != expectedID {
			t.Fatalf("concurrent sync produced duplicate projects: %s != %s", id, expectedID)
		}
	}
	count, err := db.CountProjects("", "")
	if err != nil || count != 1 {
		t.Fatalf("concurrent project count=%d err=%v", count, err)
	}
}

func TestHarnessProjectsExcludeLegacyAndDeletedWorkspaces(t *testing.T) {
	t.Setenv("DRT_HARNESS_WORKSPACE_FEED", "/tmp/workspaces.json")
	db := newWorkspaceProjectTestDB(t)
	owner, err := db.CreateRBACUser("project-owner", "项目用户", "hash", true, nil)
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := db.CreateProject(&Project{Name: "旧独立项目"})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SetResourceOwner("project", legacy.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.UpsertProjectFact(&ProjectFact{ProjectID: legacy.ID, FactKey: "legacy.fact", Summary: "旧项目事实"}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"test2", "test3", "root", "removed"} {
		input := WorkspaceProjectSync{WorkspaceID: "workspace-" + name, Path: "/opt/chana-home/" + name, Title: name}
		result, err := db.SyncWorkspaceProject(input, owner.ID)
		if err != nil {
			t.Fatal(err)
		}
		if name == "removed" {
			if _, err := db.SyncWorkspaceProject(WorkspaceProjectSync{WorkspaceID: input.WorkspaceID, Removed: true}, owner.ID); err != nil {
				t.Fatal(err)
			}
		} else if name == "test2" {
			result.Project.Name, result.Project.Status = "错误名称", "archived"
			if err := db.UpdateProject(result.Project); err != nil {
				t.Fatal(err)
			}
			corrected, err := db.SyncWorkspaceProject(input, owner.ID)
			if err != nil || corrected.Project.Name != name || corrected.Project.Status != "active" {
				t.Fatalf("工作区未纠正项目状态: %+v %v", corrected, err)
			}
		}
	}
	for _, scope := range []string{RBACScopeAll, RBACScopeOwn} {
		list, err := db.ListProjectsForAccess("", "", 50, 0, owner.ID, scope)
		if err != nil || len(list) != 3 {
			t.Fatalf("项目列表与工作区不一致: %d %v", len(list), err)
		}
		for _, p := range list {
			if p.Name != "test2" && p.Name != "test3" && p.Name != "root" {
				t.Fatalf("多余项目: %s", p.Name)
			}
		}
		count, err := db.CountProjectsForAccess("", "", owner.ID, scope)
		if err != nil || count != 3 {
			t.Fatalf("项目计数不一致: %d %v", count, err)
		}
		page, err := db.ListProjectsForAccess("active", "", 1, 1, owner.ID, scope)
		if err != nil || len(page) != 1 {
			t.Fatalf("项目分页不一致: %d %v", len(page), err)
		}
		summary, err := db.GetProjectDashboardSummaryForAccess(10, owner.ID, scope)
		if err != nil || summary.Totals.ActiveProjects != 3 || summary.Totals.TotalFacts != 0 {
			t.Fatalf("作战摘要混入旧项目: %+v %v", summary, err)
		}
	}
	count, err := db.CountProjects("", "旧独立项目")
	if err != nil || count != 0 {
		t.Fatalf("搜索仍有多余项目: %d %v", count, err)
	}
	if _, err := db.GetProject(legacy.ID); err != nil {
		t.Fatal("历史记录不应被破坏", err)
	}
	active, err := db.GetWorkspaceProject("workspace-test2")
	if err != nil {
		t.Fatal(err)
	}
	assets := []*Asset{{Host: "legacy.example", ProjectID: legacy.ID}, {Host: "active.example", ProjectID: active.Project.ID}}
	if _, err := db.UpsertAssets(assets, ""); err != nil {
		t.Fatal(err)
	}
	for _, asset := range assets {
		got, err := db.GetAsset(asset.ID, RBACListAccess{})
		if err != nil {
			t.Fatal(err)
		}
		if got.ProjectID != asset.ProjectID {
			t.Fatal("不能破坏资产历史关联")
		}
		if asset.ProjectID == legacy.ID && got.ProjectName != "" {
			t.Fatal("资产详情仍显示旧项目")
		}
		if asset.ProjectID == active.Project.ID && got.ProjectName != "test2" {
			t.Fatal("活动资产缺少工作区项目名")
		}
	}
	for _, bulk := range []bool{false, true} {
		var list []*Asset
		if bulk {
			list, _, err = db.ListAssetsForOperation(10, AssetListFilter{}, RBACListAccess{})
		} else {
			list, _, err = db.ListAssets(10, 0, AssetListFilter{}, RBACListAccess{})
		}
		if err != nil || len(list) != 2 {
			t.Fatalf("资产数据不应减少: %d %v", len(list), err)
		}
		for _, asset := range list {
			if asset.ProjectName != "" && asset.ProjectName != "test2" {
				t.Fatal("资产列表或导出仍显示旧项目", asset.ProjectName)
			}
		}
	}
	if _, err := db.Exec(`UPDATE workspace_project_bindings SET state='detached'`); err != nil {
		t.Fatal(err)
	}
	count, err = db.CountProjects("", "")
	if err != nil || count != 0 {
		t.Fatalf("空工作区列表应返回零项目: %d %v", count, err)
	}
}
