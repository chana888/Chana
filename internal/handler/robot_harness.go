package handler

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"chana/internal/authctx"
	"chana/internal/database"
	"chana/internal/harnessbridge"
)

func harnessAdminAccess(access *database.RBACAccess) bool {
	if access == nil || !access.User.Enabled {
		return false
	}
	for _, role := range access.Roles {
		if role.ID == database.RBACSystemRoleAdmin && role.IsSystem {
			return true
		}
	}
	return false
}

func wechatFixedProjectID(platform string) string {
	if !harnessbridge.RobotEnabled(platform) {
		return ""
	}
	return strings.TrimSpace(os.Getenv("DRT_HARNESS_WECHAT_PROJECT_ID"))
}

func validateWechatProject(db *database.DB, principal authctx.Principal) (string, error) {
	projectID := wechatFixedProjectID("wechat")
	if projectID == "" {
		return "", nil
	}
	if !principal.HasPermission("project:read") || !db.UserCanAccessResource(principal.UserID, principal.ScopeFor("project:read"), "project", projectID) {
		return "", fmt.Errorf("无权使用微信专用项目")
	}
	binding, err := db.GetProjectWorkspaceBinding(projectID)
	if err != nil || binding.State != "active" {
		return "", fmt.Errorf("微信专用工作区已删除或未绑定，请恢复工作区后重新配置，不会自动创建替代项目")
	}
	info, err := os.Stat(binding.Path)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("微信专用目录不存在，不会自动重建已删除目录")
	}
	return projectID, nil
}

func ensureWechatConversationProject(db *database.DB, principal authctx.Principal, conversationID string) error {
	projectID, err := validateWechatProject(db, principal)
	if err != nil || projectID == "" {
		return err
	}
	current, err := db.GetConversationProjectID(conversationID)
	if err != nil {
		return err
	}
	if current == projectID {
		return nil
	}
	if !principal.HasPermission("chat:write") || !db.UserCanAccessResource(principal.UserID, principal.ScopeFor("chat:write"), "conversation", conversationID) {
		return fmt.Errorf("无权将当前对话绑定微信专用项目")
	}
	return db.SetConversationProjectID(conversationID, projectID)
}

func (h *AgentHandler) processWechatHarness(ctx context.Context, principal authctx.Principal, conversationID, message, role string) (string, string, error) {
	// 当前共享 Harness 有服务器工具权限，只允许已绑定的平台管理员调用，不能扩大受限账号权限。
	access, err := h.db.ResolveRBACAccess(principal.UserID)
	if err != nil || !harnessAdminAccess(access) {
		return "", conversationID, fmt.Errorf("微信 Harness 需要绑定平台管理员账号")
	}
	if err := ensureWechatConversationProject(h.db, principal, conversationID); err != nil {
		return "", conversationID, err
	}
	projectID, err := h.db.GetConversationProjectID(conversationID)
	if err != nil {
		return "", conversationID, fmt.Errorf("获取微信对话项目失败: %w", err)
	}
	request := harnessbridge.RobotRequest{OwnerID: principal.UserID, ConversationID: conversationID, ProjectID: projectID, Message: message}
	if projectID != "" {
		if !principal.HasPermission("project:read") || !h.db.UserCanAccessResource(principal.UserID, principal.ScopeFor("project:read"), "project", projectID) {
			return "", conversationID, fmt.Errorf("无权使用此项目")
		}
		binding, err := h.db.GetProjectWorkspaceBinding(projectID)
		if err != nil || binding.State != "active" {
			return "", conversationID, fmt.Errorf("项目工作区已删除或未绑定，请在微信重新绑定现有项目")
		}
		info, err := os.Stat(binding.Path)
		if err != nil || !info.IsDir() {
			return "", conversationID, fmt.Errorf("项目目录不存在，不会自动重建已删除目录")
		}
		request.WorkspaceID, request.Path = binding.WorkspaceID, binding.Path
	}
	// 角色只增加任务说明，不改变 RBAC 权限；原生工具集合由 Harness preset 管理。
	if h.config != nil && role != "" && role != "默认" {
		if r, ok := h.config.Roles[role]; ok && r.Enabled && strings.TrimSpace(r.UserPrompt) != "" {
			request.Message = r.UserPrompt + "\n\n" + message
		}
	}
	taskCtx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	if _, err := h.tasks.StartTask(conversationID, message, cancel); err != nil {
		return "", conversationID, fmt.Errorf("当前会话已有任务或无法启动任务: %w", err)
	}
	status := "failed"
	defer func() { h.tasks.FinishTask(conversationID, status) }()
	if _, err := h.db.AddMessage(conversationID, "user", message, nil); err != nil {
		return "", conversationID, fmt.Errorf("保存微信消息失败: %w", err)
	}
	assistant, err := h.db.AddMessage(conversationID, "assistant", "Harness 处理中...", nil)
	if err != nil {
		return "", conversationID, fmt.Errorf("保存助手消息失败: %w", err)
	}
	h.tasks.SetHitlAssistantMessageID(conversationID, assistant.ID)
	response, runErr := harnessbridge.RunRobot(taskCtx, request, func(event harnessbridge.RobotEvent) {
		data := event.Data
		if data == nil {
			data = map[string]interface{}{}
		}
		data["engine"] = "harness"
		if event.Type == "session" {
			data["sessionId"], data["cwd"] = event.SessionID, event.Cwd
		}
		enriched := enrichProgressEventData(data, conversationID, assistant.ID)
		_ = h.db.AddProcessDetail(assistant.ID, conversationID, event.Type, event.Message, enriched)
		h.publishProgressToTaskEventBus(conversationID, event.Type, event.Message, enriched)
	})
	if runErr != nil {
		content := "Harness 执行失败: " + runErr.Error()
		if errors.Is(runErr, context.Canceled) || errors.Is(runErr, context.DeadlineExceeded) {
			status = "cancelled"
			content = "Harness 任务已取消或超时。"
		}
		_ = h.db.UpdateAssistantMessageFinalize(assistant.ID, content, nil, "")
		h.publishProgressToTaskEventBus(conversationID, status, content, nil)
		return "", conversationID, runErr
	}
	if err := h.db.UpdateAssistantMessageFinalize(assistant.ID, response, nil, ""); err != nil {
		return "", conversationID, fmt.Errorf("Harness 已完成，但回复存档失败: %w", err)
	}
	status = "completed"
	h.publishProgressToTaskEventBus(conversationID, "done", "Harness 执行完成", nil)
	return response, conversationID, nil
}

func (h *RobotHandler) executionModeLabel(platform, userID string) string {
	if harnessbridge.RobotEnabled(platform) {
		return "Harness（与网页共用原生引擎）"
	}
	return robotAgentModeLabel(h.getAgentMode(platform, userID))
}
