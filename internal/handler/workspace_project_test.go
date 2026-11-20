package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"chana/internal/database"
	"chana/internal/security"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func TestWorkspaceProjectSyncRequiresGlobalWriteScope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewDB(filepath.Join(t.TempDir(), "workspace-handler.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	user, err := db.CreateRBACUser("workspace-admin", "Workspace Admin", "hash", true, nil)
	if err != nil {
		t.Fatal(err)
	}
	h := NewProjectHandler(db, zap.NewNop())
	cases := []struct {
		name    string
		session security.Session
		want    int
	}{
		{"read only", security.Session{UserID: user.ID, Scope: database.RBACScopeAll, Permissions: map[string]bool{"project:read": true}}, http.StatusForbidden},
		{"assigned writer", security.Session{UserID: user.ID, Scope: database.RBACScopeAssigned, Permissions: map[string]bool{"project:write": true}}, http.StatusForbidden},
		{"global read cannot widen write", security.Session{UserID: user.ID, Scope: database.RBACScopeAll,
			Permissions:      map[string]bool{"project:read": true, "project:write": true},
			PermissionScopes: map[string]string{"project:read": database.RBACScopeAll, "project:write": database.RBACScopeOwn}}, http.StatusForbidden},
		{"global writer", security.Session{UserID: user.ID, Scope: database.RBACScopeAll, Permissions: map[string]bool{"project:write": true}}, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.Use(func(c *gin.Context) {
				c.Set(security.ContextSessionKey, tc.session)
				c.Next()
			})
			router.Use(security.RBACMiddleware(db))
			router.POST("/api/projects/workspaces/sync", h.SyncWorkspaceProject)
			router.GET("/api/projects/:id", h.GetProject)
			router.GET("/api/projects/:id/stats", h.GetProjectStats)
			router.GET("/api/projects/workspaces/:workspaceId", h.GetWorkspaceProject)
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodPost, "/api/projects/workspaces/sync", bytes.NewBufferString(`{"workspace_id":"workspace-a","path":"/test2"}`))
			r.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status=%d want=%d body=%s", w.Code, tc.want, w.Body.String())
			}
		})
	}
	count, err := db.CountProjects("", "")
	if err != nil || count != 1 {
		t.Fatalf("unauthorized requests created projects: count=%d err=%v", count, err)
	}
}

func TestWorkspaceProjectLookupChecksBoundProjectAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewDB(filepath.Join(t.TempDir(), "workspace-read.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	result, err := db.SyncWorkspaceProject(database.WorkspaceProjectSync{WorkspaceID: "workspace-private", Path: "/private"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SetResourceOwner("project", result.Project.ID, "owner"); err != nil {
		t.Fatal(err)
	}
	h := NewProjectHandler(db, zap.NewNop())
	for _, userID := range []string{"owner", "other"} {
		router := gin.New()
		router.Use(func(c *gin.Context) {
			c.Set(security.ContextSessionKey, security.Session{UserID: userID, Scope: database.RBACScopeOwn, Permissions: map[string]bool{"project:read": true}})
			c.Next()
		})
		router.Use(security.RBACMiddleware(db))
		router.GET("/api/projects/workspaces/:workspaceId", h.GetWorkspaceProject)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/projects/workspaces/workspace-private", nil))
		want := http.StatusForbidden
		if userID == "owner" {
			want = http.StatusOK
		}
		if w.Code != want {
			t.Fatalf("user=%s status=%d want=%d body=%s", userID, w.Code, want, w.Body.String())
		}
	}
}
