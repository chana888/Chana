package handler

import (
	"database/sql"
	"errors"
	"net/http"

	"chana/internal/database"
	"chana/internal/security"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// SyncWorkspaceProject 仅允许具有全局项目写权限的用户同步共享 Harness 工作区。
func (h *ProjectHandler) SyncWorkspaceProject(c *gin.Context) {
	session, ok := security.CurrentSession(c)
	if !ok || !session.Permissions["project:write"] || session.ScopeFor("project:write") != database.RBACScopeAll {
		c.JSON(http.StatusForbidden, gin.H{"error": "同步 Harness 工作区需要全局项目写权限"})
		return
	}
	var input database.WorkspaceProjectSync
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.ValidateWorkspaceProjectSync(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.db.SyncWorkspaceProject(input, session.UserID)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			c.JSON(http.StatusNotFound, gin.H{"error": "工作区绑定或指定项目不存在"})
		case errors.Is(err, database.ErrWorkspaceProjectConflict):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			h.logger.Error("同步 Harness 工作区失败", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "同步工作区失败"})
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

// GetWorkspaceProject 查询绑定时继续校验对应项目的读取权限。
func (h *ProjectHandler) GetWorkspaceProject(c *gin.Context) {
	session, ok := security.CurrentSession(c)
	if !ok || !session.Permissions["project:read"] {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权读取项目"})
		return
	}
	result, err := h.db.GetWorkspaceProject(c.Param("workspaceId"))
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "工作区绑定不存在"})
		return
	}
	if err != nil {
		h.logger.Error("查询 Harness 工作区绑定失败", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询工作区失败"})
		return
	}
	if !h.db.UserCanAccessResource(session.UserID, session.ScopeFor("project:read"), "project", result.Project.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权读取该工作区项目"})
		return
	}
	c.JSON(http.StatusOK, result)
}
