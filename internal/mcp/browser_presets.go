// 内置浏览器 MCP 预置：让 local-browser / vps-browser 直接出现在平台 MCP 管理页。
package mcp

import (
	"encoding/json"
	"os"
	"path/filepath"

	"chana/internal/config"
)

const (
	browserMCPURL         = "http://127.0.0.1:18862/mcp"
	browserMCPTokenHeader = "X-Chana-Vps-Token"
)

// RegisterBrowserPresets 注册内置浏览器 MCP 预置条目（local-browser 与 vps-browser）。
//
// 两种部署形态共用同一座桥与 Chrome 扩展（见仓库 vps-browser/ 与 local-browser/）：
//   - local-browser：平台搭在本机，控制本机日常 Chrome（local-browser/start 脚本启动桥）
//   - vps-browser：平台搭在 VPS，控制虚拟桌面 Chrome（vps-browser/install.sh 部署）
//
// 行为：仅注入内存、默认停用（ExternalMCPEnable=false），不覆盖用户已配置的同名条目，
// 不写回配置文件；用户在 MCP 管理页编辑或启用后按普通外部 MCP 持久化。
// 访问令牌自动发现：环境变量 CHANA_BROWSER_TOKEN 优先，其次候选路径的
// vps-browser/server/.runtime/config.json（start 脚本 / install.sh 生成）。
func RegisterBrowserPresets(m *ExternalMCPManager) {
	existing := m.GetConfigs()
	token := discoverBrowserMCPToken()
	for _, name := range []string{"local-browser", "vps-browser"} {
		if _, ok := existing[name]; ok {
			continue
		}
		_ = m.AddOrUpdateConfig(name, config.ExternalMCPServerConfig{
			Type:             "http",
			URL:              browserMCPURL,
			Headers:          map[string]string{browserMCPTokenHeader: token},
			ExternalMCPEnable: false,
		})
	}
}

// discoverBrowserMCPToken 自动发现浏览器桥的访问令牌。
func discoverBrowserMCPToken() string {
	if t := os.Getenv("CHANA_BROWSER_TOKEN"); t != "" {
		return t
	}
	var candidates []string
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates,
			filepath.Join(filepath.Dir(exe), "vps-browser", "server", ".runtime", "config.json"),
			filepath.Join(filepath.Dir(exe), ".runtime", "config.json"))
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "vps-browser", "server", ".runtime", "config.json"))
	}
	candidates = append(candidates, "/opt/chana-vps-browser/.runtime/config.json")
	for _, p := range candidates {
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var c struct {
			Token string `json:"token"`
		}
		if json.Unmarshal(b, &c) == nil && c.Token != "" {
			return c.Token
		}
	}
	return ""
}
