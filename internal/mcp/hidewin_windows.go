//go:build windows

package mcp

import (
	"os/exec"
	"syscall"
)

// hideWindow 让 Windows 上启动的 MCP 子进程不弹出控制台窗口。
// 2026-08-23 本地部署修复: 平台 exec.Command 拉起 python/npx MCP 时默认弹 cmd 窗口。
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
