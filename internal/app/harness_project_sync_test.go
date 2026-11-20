package app

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"chana/internal/database"
	"chana/internal/security"

	"go.uber.org/zap"
)

func newHarnessSyncTestDB(t *testing.T) *database.DB {
	t.Helper()
	db, err := database.NewDB(filepath.Join(t.TempDir(), "harness-sync.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.BootstrapRBAC("test-hash", security.PermissionCatalog); err != nil {
		t.Fatal(err)
	}
	return db
}

func harnessSyncTestFeed(t *testing.T, items ...database.WorkspaceProjectSync) []byte {
	t.Helper()
	if items == nil {
		items = []database.WorkspaceProjectSync{}
	}
	data, err := json.Marshal(harnessWorkspaceFeed{Version: 1, Items: items})
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestHarnessWorkspaceFeedLifecycle(t *testing.T) {
	db := newHarnessSyncTestDB(t)
	item := database.WorkspaceProjectSync{WorkspaceID: "workspace-test2", Path: "/opt/chana-home/test2", Title: "test2"}
	if err := syncHarnessWorkspaceFeed(db, harnessSyncTestFeed(t, item), "admin"); err != nil {
		t.Fatal(err)
	}
	first, err := db.GetWorkspaceProject(item.WorkspaceID)
	if err != nil {
		t.Fatal(err)
	}
	item.Title = "renamed-test2"
	item.Path = "/opt/chana-home/renamed-test2"
	if err := syncHarnessWorkspaceFeed(db, harnessSyncTestFeed(t, item), "admin"); err != nil {
		t.Fatal(err)
	}
	renamed, err := db.GetWorkspaceProject(item.WorkspaceID)
	if err != nil || renamed.Project.ID != first.Project.ID || renamed.Project.Name != item.Title || renamed.Binding.Path != item.Path {
		t.Fatalf("rename result=%+v err=%v", renamed, err)
	}
	renamed.Project.Description = "保留的项目成果"
	if err := db.UpdateProject(renamed.Project); err != nil {
		t.Fatal(err)
	}
	if err := syncHarnessWorkspaceFeed(db, harnessSyncTestFeed(t), "admin"); err != nil {
		t.Fatal(err)
	}
	detached, err := db.GetWorkspaceProject(item.WorkspaceID)
	if err != nil || detached.Binding.State != "detached" || detached.Project.Description != "保留的项目成果" {
		t.Fatalf("missing workspace damaged project: result=%+v err=%v", detached, err)
	}
	if err := syncHarnessWorkspaceFeed(db, harnessSyncTestFeed(t, item), "admin"); err != nil {
		t.Fatal(err)
	}
	restored, err := db.GetWorkspaceProject(item.WorkspaceID)
	if err != nil || restored.Project.ID != first.Project.ID || restored.Binding.State != "active" {
		t.Fatalf("restore result=%+v err=%v", restored, err)
	}
	if count, err := db.CountProjects("", ""); err != nil || count != 1 {
		t.Fatalf("lifecycle duplicated project: count=%d err=%v", count, err)
	}
}

func TestHarnessWorkspaceFeedRejectsInvalidSnapshotBeforeAnyWrite(t *testing.T) {
	db := newHarnessSyncTestDB(t)
	initial := database.WorkspaceProjectSync{WorkspaceID: "workspace-a", Path: "/original", Title: "original"}
	if err := syncHarnessWorkspaceFeed(db, harnessSyncTestFeed(t, initial), "admin"); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		data string
	}{
		{"malformed", `{"version":1,"items":[`},
		{"null list", `{"version":1,"items":null}`},
		{"missing list", `{"version":1}`},
		{"unsupported version", `{"version":2,"items":[]}`},
		{"duplicate IDs", `{"version":1,"items":[{"workspace_id":"workspace-b","path":"/b"},{"workspace_id":"workspace-b","path":"/b2"}]}`},
		{"trimmed duplicate IDs", `{"version":1,"items":[{"workspace_id":"workspace-b","path":"/b"},{"workspace_id":" workspace-b ","path":"/b2"}]}`},
		{"invalid later item", `{"version":1,"items":[{"workspace_id":"workspace-a","path":"/renamed","title":"renamed"},{"workspace_id":"workspace-b","path":""}]}`},
		{"removed control", `{"version":1,"items":[{"workspace_id":"workspace-a","path":"/original","removed":true}]}`},
		{"project binding control", `{"version":1,"items":[{"workspace_id":"workspace-b","path":"/b","project_id":"arbitrary-project"}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := syncHarnessWorkspaceFeed(db, []byte(tc.data), "admin"); err == nil {
				t.Fatal("invalid snapshot accepted")
			}
			current, err := db.GetWorkspaceProject(initial.WorkspaceID)
			if err != nil || current.Binding.State != "active" || current.Project.Name != initial.Title || current.Binding.Path != initial.Path {
				t.Fatalf("invalid snapshot mutated existing project: result=%+v err=%v", current, err)
			}
			if count, err := db.CountProjects("", ""); err != nil || count != 1 {
				t.Fatalf("invalid snapshot wrote a project: count=%d err=%v", count, err)
			}
		})
	}
}

func TestHarnessWorkspaceFeedRequiresEnabledGlobalWriter(t *testing.T) {
	db := newHarnessSyncTestDB(t)
	if err := syncHarnessWorkspaceFeed(db, harnessSyncTestFeed(t, database.WorkspaceProjectSync{WorkspaceID: "workspace-a", Path: "/a"}), "admin"); err != nil {
		t.Fatal(err)
	}
	readAll, err := db.UpsertRBACRole("", "read-all", "", database.RBACScopeAll, []string{"project:read"})
	if err != nil {
		t.Fatal(err)
	}
	writeOwn, err := db.UpsertRBACRole("", "write-own", "", database.RBACScopeOwn, []string{"project:write"})
	if err != nil {
		t.Fatal(err)
	}
	writeAssigned, err := db.UpsertRBACRole("", "write-assigned", "", database.RBACScopeAssigned, []string{"project:write"})
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		username string
		enabled  bool
		roles    []string
	}{
		{"no-permission", true, nil},
		{"global-reader", true, []string{readAll.ID}},
		{"own-writer", true, []string{writeOwn.ID}},
		{"assigned-writer", true, []string{writeAssigned.ID}},
		{"mixed-scopes", true, []string{readAll.ID, writeOwn.ID}},
		{"disabled-admin", false, []string{database.RBACSystemRoleAdmin}},
	}
	feed := harnessSyncTestFeed(t, database.WorkspaceProjectSync{WorkspaceID: "workspace-b", Path: "/b"})
	for _, tc := range cases {
		t.Run(tc.username, func(t *testing.T) {
			if _, err := db.CreateRBACUser(tc.username, tc.username, "test-hash", tc.enabled, tc.roles); err != nil {
				t.Fatal(err)
			}
			if err := syncHarnessWorkspaceFeed(db, feed, tc.username); err == nil {
				t.Fatal("unauthorized snapshot accepted")
			}
			current, err := db.GetWorkspaceProject("workspace-a")
			if err != nil || current.Binding.State != "active" {
				t.Fatalf("unauthorized sync detached project: result=%+v err=%v", current, err)
			}
			if count, err := db.CountProjects("", ""); err != nil || count != 1 {
				t.Fatalf("unauthorized sync wrote project: count=%d err=%v", count, err)
			}
		})
	}
	if err := syncHarnessWorkspaceFeed(db, feed, "missing-user"); err == nil {
		t.Fatal("missing owner accepted")
	}
}
