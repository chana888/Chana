package mcp

import (
	"testing"

	"chana/internal/config"
)

func TestRegisterBrowserPresets(t *testing.T) {
	t.Setenv("CHANA_BROWSER_TOKEN", "")
	m := NewExternalMCPManager(nil)

	RegisterBrowserPresets(m)
	cfgs := m.GetConfigs()
	for _, name := range []string{"local-browser", "vps-browser"} {
		cfg, ok := cfgs[name]
		if !ok {
			t.Fatalf("预置条目缺失: %s", name)
		}
		if cfg.ExternalMCPEnable {
			t.Errorf("%s 应默认停用", name)
		}
		if cfg.URL != browserMCPURL {
			t.Errorf("%s URL 异常: %s", name, cfg.URL)
		}
		if _, has := cfg.Headers[browserMCPTokenHeader]; !has {
			t.Errorf("%s 缺少鉴权 header", name)
		}
	}
}

func TestRegisterBrowserPresetsNoOverride(t *testing.T) {
	m := NewExternalMCPManager(nil)
	custom := config.ExternalMCPServerConfig{Type: "http", URL: "http://192.0.2.9:9999/mcp", ExternalMCPEnable: true}
	_ = m.AddOrUpdateConfig("local-browser", custom)

	RegisterBrowserPresets(m)
	got := m.GetConfigs()["local-browser"]
	if got.URL != custom.URL || !got.ExternalMCPEnable {
		t.Fatalf("预置覆盖了用户配置: %+v", got)
	}
}

func TestDiscoverBrowserMCPTokenEnvFirst(t *testing.T) {
	t.Setenv("CHANA_BROWSER_TOKEN", "env-token")
	if got := discoverBrowserMCPToken(); got != "env-token" {
		t.Fatalf("环境变量优先失败: %q", got)
	}
}
