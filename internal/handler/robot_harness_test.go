package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chana/internal/config"
	"chana/internal/database"
	"chana/internal/harnessbridge"
	"chana/internal/security"
	"go.uber.org/zap"
)

func TestWechatHarnessPermissionsPersistenceAndWorkspace(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "robot.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.BootstrapRBAC("hash", security.PermissionCatalog); err != nil {
		t.Fatal(err)
	}
	calls := 0
	workspace := t.TempDir()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var req harnessbridge.RobotRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Error(err)
		}
		if req.ProjectID != "" && (req.WorkspaceID != "workspace-test" || req.Path != workspace) {
			t.Error("项目未使用真实工作区")
		}
		fmt.Fprintln(w, `{"type":"session","session_id":"session-test"}`)
		fmt.Fprintln(w, `{"type":"final","text":"Harness 验收回复"}`)
	}))
	defer srv.Close()
	key := filepath.Join(t.TempDir(), "key")
	_ = os.WriteFile(key, []byte("test-key"), 0600)
	t.Setenv("DRT_HARNESS_ROBOT_RPC", srv.URL)
	t.Setenv("DRT_HARNESS_ROBOT_RPC_KEY", key)
	h := &AgentHandler{db: db, config: &config.Config{}, logger: zap.NewNop(), tasks: NewAgentTaskManager()}
	for _, role := range []string{database.RBACSystemRoleAdmin, database.RBACSystemRoleOperator} {
		user, err := db.CreateRBACUser("test-"+role, role, "hash", true, []string{role})
		if err != nil {
			t.Fatal(err)
		}
		access, err := db.ResolveRBACAccess(user.ID)
		if err != nil {
			t.Fatal(err)
		}
		conv, err := db.CreateConversation("微信验收", database.ConversationCreateMeta{Source: "robot:wechat"})
		if err != nil {
			t.Fatal(err)
		}
		if err := db.SetResourceOwner("conversation", conv.ID, user.ID); err != nil {
			t.Fatal(err)
		}
		if err := db.AssignResourceToUser(user.ID, "conversation", conv.ID); err != nil {
			t.Fatal(err)
		}
		if role == database.RBACSystemRoleAdmin {
			result, err := db.SyncWorkspaceProject(database.WorkspaceProjectSync{WorkspaceID: "workspace-test", Path: workspace, Title: "验收项目"}, user.ID)
			if err != nil {
				t.Fatal(err)
			}
			_ = db.SetConversationProjectID(conv.ID, result.Project.ID)
		}
		response, id, err := h.ProcessMessageForRobot(context.Background(), "wechat", robotPrincipal(access), conv.ID, "测试", "默认", "eino_single")
		if role == database.RBACSystemRoleOperator {
			if err == nil || !strings.Contains(err.Error(), "管理员") {
				t.Fatalf("受限用户未触发 Harness 管理员限制: %v", err)
			}
			continue
		}
		if err != nil || id != conv.ID || response != "Harness 验收回复" {
			t.Fatalf("Harness 调用失败: %v", err)
		}
		messages, _ := db.GetMessages(conv.ID)
		if len(messages) != 2 || messages[1].Content != response {
			t.Fatal("微信回复未落盘")
		}
		if h.tasks.GetTaskSnapshot(conv.ID) != nil {
			t.Fatal("已完成任务仍占用运行槽位")
		}
		completed := h.tasks.GetCompletedTasks()
		if len(completed) != 1 || completed[0].ConversationID != conv.ID || completed[0].Status != "completed" {
			t.Fatal("已完成任务未正确保存到历史")
		}
		_ = os.Rename(workspace, workspace+"-moved")
		t.Cleanup(func() { _ = os.Rename(workspace+"-moved", workspace) })
		if _, _, err := h.ProcessMessageForRobot(context.Background(), "wechat", robotPrincipal(access), conv.ID, "测试", "默认", "eino_single"); err == nil {
			t.Fatal("已删除目录被再次执行")
		}
	}
	if calls != 1 {
		t.Fatalf("未通过校验的调用到达 Harness: %d", calls)
	}
}

func TestWechatDedicatedProjectNewExistingRestartAndCommands(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "wechat.db"), zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.BootstrapRBAC("hash", security.PermissionCatalog); err != nil {
		t.Fatal(err)
	}
	user, err := db.CreateRBACUser("wechat-admin", "微信管理员", "hash", true, []string{database.RBACSystemRoleAdmin})
	if err != nil {
		t.Fatal(err)
	}
	access, err := db.ResolveRBACAccess(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	p, err := db.SyncWorkspaceProject(database.WorkspaceProjectSync{WorkspaceID: "wechat-root", Path: root, Title: "Wechat"}, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	other, err := db.SyncWorkspaceProject(database.WorkspaceProjectSync{WorkspaceID: "other-root", Path: t.TempDir(), Title: "其他项目"}, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("DRT_HARNESS_ROBOT_RPC", "http://127.0.0.1:3094")
	t.Setenv("DRT_HARNESS_WECHAT_PROJECT_ID", p.Project.ID)
	if err := db.CreateRobotBindingCode(user.ID, hashRobotBindingCode("WECHAT-TEST"), time.Now().Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ConsumeRobotBindingCode("wechat", "bound-admin", hashRobotBindingCode("WECHAT-TEST")); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{}
	cfg.Project.Enabled = true
	h := NewRobotHandler(cfg, db, nil, zap.NewNop())
	conv, _ := h.getOrCreateConversation("wechat", "bound-admin", "测试", access)
	if conv == "" {
		t.Fatal("微信默认对话创建失败")
	}
	assertProject := func(id string) {
		t.Helper()
		got, err := db.GetConversationProjectID(id)
		if err != nil || got != p.Project.ID {
			t.Fatalf("对话归属错误：%q %v", got, err)
		}
	}
	assertProject(conv)
	if err := db.SetConversationProjectID(conv, other.Project.ID); err != nil {
		t.Fatal(err)
	}
	restored := NewRobotHandler(cfg, db, nil, zap.NewNop())
	id, created := restored.getOrCreateConversation("wechat", "bound-admin", "", access)
	if created || id != conv {
		t.Fatal("服务重启后没有恢复原微信对话")
	}
	assertProject(id)
	if reply := restored.cmdBindProject("wechat", "bound-admin", other.Project.ID); !strings.Contains(reply, "固定") {
		t.Fatal("微信可以切到其他工作区")
	}
	if reply := restored.cmdUnbindProject("wechat", "bound-admin"); !strings.Contains(reply, "固定") {
		t.Fatal("微信可以解除专用工作区")
	}
	before, _ := db.ListWorkspaceProjectBindings()
	if reply := restored.cmdNewProject("wechat", "bound-admin", "额外顶层项目"); !strings.Contains(reply, "子目录") {
		t.Fatal("微信新建项目绕过专用目录")
	}
	after, _ := db.ListWorkspaceProjectBindings()
	if len(after) != len(before) {
		t.Fatal("微信产生多余工作区")
	}
	assertProject(restored.clearConversation("wechat", "bound-admin", access))
	if wechatFixedProjectID("wecom") != "" {
		t.Fatal("微信配置影响其他机器人")
	}
	key := filepath.Join(t.TempDir(), "key")
	if err := os.WriteFile(key, []byte("test-key"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DRT_HARNESS_ROBOT_RPC_KEY", key)
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var req harnessbridge.RobotRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Error(err)
		}
		if req.ProjectID != p.Project.ID || req.WorkspaceID != "wechat-root" || req.Path != root {
			t.Error("微信原生请求未使用专用工作区")
		}
		fmt.Fprintln(w, `{"type":"final","text":"专用项目回复"}`)
	}))
	defer srv.Close()
	t.Setenv("DRT_HARNESS_ROBOT_RPC", srv.URL)
	agent := &AgentHandler{db: db, config: cfg, logger: zap.NewNop(), tasks: NewAgentTaskManager()}
	response, newID, err := agent.ProcessMessageForRobot(context.Background(), "wechat", robotPrincipal(access), "", "自动新建对话", "默认", "eino_single")
	if err != nil || response != "专用项目回复" {
		t.Fatalf("自动创建微信对话失败：%v", err)
	}
	assertProject(newID)
	if calls != 1 {
		t.Fatal("微信原生执行次数错误")
	}
	if err := os.Rename(root, root+"-moved"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Rename(root+"-moved", root) })
	if _, err := validateWechatProject(db, robotPrincipal(access)); err == nil {
		t.Fatal("已删除微信目录被继续使用")
	}
	if got := restored.clearConversation("wechat", "bound-admin", access); got != "" {
		t.Fatal("删除目录后仍创建微信对话")
	}
	if reply := restored.HandleMessage("wechat", "bound-admin", "你好"); !strings.Contains(reply, "目录不存在") {
		t.Fatal("目录已删除时未返回明确原因")
	}
	if reply := restored.cmdNew("wechat", "bound-admin"); !strings.Contains(reply, "目录不存在") {
		t.Fatal("新对话掩盖已删除目录错误")
	}
}

func TestWechatHarnessModeRemainsNative(t *testing.T) {
	t.Setenv("DRT_HARNESS_ROBOT_RPC", "http://127.0.0.1:3094")
	h := NewRobotHandler(&config.Config{}, nil, nil, zap.NewNop())
	if !strings.Contains(h.cmdModes("wechat", "test"), "Harness") {
		t.Fatal("微信模式显示错误")
	}
	_ = h.cmdSwitchMode("wechat", "test", "eino_single")
	if !strings.Contains(h.executionModeLabel("wechat", "test"), "Harness") {
		t.Fatal("微信退回旧引擎")
	}
}
