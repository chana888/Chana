package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chana/internal/database"
	"chana/internal/harnessbridge"

	"go.uber.org/zap"
)

type harnessWorkspaceFeed struct {
	Version int                             `json:"version"`
	Items   []database.WorkspaceProjectSync `json:"items"`
}

func syncHarnessWorkspaceFeed(db *database.DB, data []byte, username string) error {
	var feed harnessWorkspaceFeed
	if err := json.Unmarshal(data, &feed); err != nil {
		return fmt.Errorf("解析 Harness 工作区快照: %w", err)
	}
	if feed.Version != 1 || feed.Items == nil {
		return fmt.Errorf("Harness 工作区快照版本或列表无效")
	}
	seen := make(map[string]bool, len(feed.Items))
	// 完整校验后才写库，损坏或不完整的快照不会解除现有项目连接。
	for i := range feed.Items {
		item := &feed.Items[i]
		if item.Removed || item.ProjectID != "" {
			return fmt.Errorf("Harness 工作区快照包含非预期的控制字段")
		}
		if err := database.ValidateWorkspaceProjectSync(item); err != nil {
			return err
		}
		if seen[item.WorkspaceID] {
			return fmt.Errorf("Harness 工作区快照包含重复 ID")
		}
		seen[item.WorkspaceID] = true
	}
	user, err := db.GetRBACUserByUsername(username)
	if err != nil {
		return fmt.Errorf("查找 Harness 项目归属用户: %w", err)
	}
	access, err := db.ResolveRBACAccess(user.ID)
	if err != nil {
		return err
	}
	if !access.User.Enabled || !access.Permissions["project:write"] || access.PermissionScopes["project:write"] != database.RBACScopeAll {
		return fmt.Errorf("Harness 同步归属用户需要启用且具有全局项目写权限")
	}
	for _, item := range feed.Items {
		if _, err := db.SyncWorkspaceProject(item, user.ID); err != nil {
			return fmt.Errorf("同步工作区 %s: %w", item.WorkspaceID, err)
		}
	}
	bindings, err := db.ListWorkspaceProjectBindings()
	if err != nil {
		return err
	}
	for _, binding := range bindings {
		if !seen[binding.WorkspaceID] {
			if _, err := db.SyncWorkspaceProject(database.WorkspaceProjectSync{
				WorkspaceID: binding.WorkspaceID, Removed: true,
			}, user.ID); err != nil {
				return err
			}
		}
	}
	return db.ArchiveProjectsOutsideWorkspaces()
}

func (a *App) startHarnessProjectSync() {
	feedPath := strings.TrimSpace(os.Getenv("DRT_HARNESS_WORKSPACE_FEED"))
	if feedPath == "" {
		return
	}
	owner := strings.TrimSpace(os.Getenv("DRT_HARNESS_WORKSPACE_OWNER"))
	if !filepath.IsAbs(feedPath) || owner == "" {
		a.logger.Logger.Error("Harness 同步配置需要绝对快照路径及归属用户名")
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.harnessSyncCancel = cancel
	a.harnessSyncDone = make(chan struct{})
	go func() {
		defer close(a.harnessSyncDone)
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		var lastData []byte
		var lastError string
		for {
			// 锁内读取快照，避免平台新增时旧快照将刚创建的项目错误归档。
			harnessbridge.LifecycleMu.Lock()
			file, err := os.Open(feedPath)
			var data []byte
			if err == nil {
				data, err = io.ReadAll(io.LimitReader(file, 16*1024*1024+1))
				file.Close()
				if err == nil && len(data) > 16*1024*1024 {
					err = fmt.Errorf("Harness 工作区快照超过大小限制")
				}
			}
			if err == nil && !bytes.Equal(data, lastData) {
				err = syncHarnessWorkspaceFeed(a.db, data, owner)
				if err == nil {
					lastData = data
					a.logger.Logger.Info("Harness 工作区项目同步完成")
				}
			}
			harnessbridge.LifecycleMu.Unlock()
			if err != nil && !os.IsNotExist(err) {
				if err.Error() != lastError {
					a.logger.Logger.Warn("Harness 项目同步失败，自动重试", zap.Error(err))
				}
				lastError = err.Error()
			} else {
				lastError = ""
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
