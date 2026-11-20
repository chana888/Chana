// dsh 工作区自动同步：读取 dsh 的 workspace 存储文件，把每个工作区同步为平台同名项目。
// 用户在 dsh（对话引擎）里新建/改名工作区 → 平台项目管理自动出现/更新同名项目；
// 工作区删除 → 平台项目自动解除连接。无需任何手动操作或外部插件。
package app

import (
	"crypto/sha256"
	"fmt"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
)

// dshWorkspaceStoreFile dsh 工作区存储文件路径（config.dsh.workspace_store 为空时的默认值）。
func (a *App) dshWorkspaceStoreFile() string {
	if p := a.config.Dsh.WorkspaceStore; p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".dsh", "storages", "workspace.json")
}

// SyncDshWorkspacesOnce 读 dsh 工作区快照并同步为平台项目（单次）。
func (a *App) SyncDshWorkspacesOnce() {
	path := a.dshWorkspaceStoreFile()
	if path == "" {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return // dsh 未初始化或未使用：静默跳过
	}
	feed, err := buildHarnessWorkspaceFeed(raw)
	if err != nil {
		a.logger.Warn("dsh 工作区快照解析失败", zap.Error(err))
		return
	}
	if err := syncHarnessWorkspaceFeed(a.db, feed, "admin"); err != nil {
		a.logger.Warn("dsh 工作区同步失败", zap.Error(err))
	}
}

// buildHarnessWorkspaceFeed 把 dsh 的 workspace.json（unit/global/tables 结构）
// 转换为平台同步 feed：{version:1, items:[{workspace_id,path,title}]}。
func buildHarnessWorkspaceFeed(raw []byte) ([]byte, error) {
	var store struct {
		Tables struct {
			Workspaces map[string]struct {
				Path  string `json:"path"`
				Title string `json:"title"`
			} `json:"workspaces"`
		} `json:"tables"`
	}
	if err := json.Unmarshal(raw, &store); err != nil {
		return nil, err
	}
	type item struct {
		WorkspaceID string `json:"workspace_id"`
		Path        string `json:"path"`
		Title       string `json:"title"`
	}
	feed := struct {
		Version int    `json:"version"`
		Items   []item `json:"items"`
	}{Version: 1, Items: []item{}}
	for id, w := range store.Tables.Workspaces {
		feed.Items = append(feed.Items, item{WorkspaceID: id, Path: w.Path, Title: w.Title})
	}
	if len(feed.Items) == 0 {
		return nil, fmt.Errorf("dsh 工作区列表为空")
	}
	return json.Marshal(feed)
}

// watchDshWorkspaces 周期同步（文件内容变化时才触发入库）。
func (a *App) watchDshWorkspaces() {
	if a.config.Dsh.BaseURL == "" {
		return // 未启用 dsh 集成时不同步
	}
	last := ""
	path := a.dshWorkspaceStoreFile()
	for {
		if raw, err := os.ReadFile(path); err == nil {
			sum := sha256.Sum256(raw)
			digest := hex.EncodeToString(sum[:])
			if digest != last {
				a.SyncDshWorkspacesOnce()
				last = digest
				a.logger.Info("dsh 工作区已同步到平台项目")
			}
		}
		time.Sleep(30 * time.Second)
	}
}
