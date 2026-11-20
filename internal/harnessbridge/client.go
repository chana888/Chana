package harnessbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// LifecycleMu 串行化平台修改与快照入库，避免同一工作区产生两个项目。
var LifecycleMu sync.Mutex

func Enabled() bool { return strings.TrimSpace(os.Getenv("DRT_HARNESS_WORKSPACE_RPC")) != "" }

type Command struct {
	Operation   string `json:"operation"`
	ProjectID   string `json:"project_id,omitempty"`
	WorkspaceID string `json:"workspace_id,omitempty"`
	Path        string `json:"path,omitempty"`
	Title       string `json:"title,omitempty"`
}

type Result struct {
	WorkspaceID string `json:"workspace_id"`
	Path        string `json:"path"`
	Title       string `json:"title"`
	Error       string `json:"error"`
}

func Call(ctx context.Context, command Command) (*Result, error) {
	key, err := os.ReadFile(os.Getenv("DRT_HARNESS_WORKSPACE_RPC_KEY"))
	if err != nil {
		return nil, fmt.Errorf("读取工作区接口凭据失败: %w", err)
	}
	data, err := json.Marshal(command)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, os.Getenv("DRT_HARNESS_WORKSPACE_RPC")+"/command", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workspace-Key", strings.TrimSpace(string(key)))
	client := &http.Client{Timeout: 8 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Harness 工作区操作失败: %w", err)
	}
	defer resp.Body.Close()
	var result Result
	if err := json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&result); err != nil {
		return nil, fmt.Errorf("Harness 返回无效响应: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s", result.Error)
	}
	return &result, nil
}
