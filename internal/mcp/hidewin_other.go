//go:build !windows

package mcp

import "os/exec"

// hideWindow 非 Windows 平台无控制台窗口概念，空实现。
func hideWindow(cmd *exec.Cmd) {}
