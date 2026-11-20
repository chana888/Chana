package harnessbridge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// RobotEnabled 明确配置微信通道后才改用 Harness，其他机器人保留其配置。
func RobotEnabled(platform string) bool {
	return strings.TrimSpace(platform) == "wechat" && strings.TrimSpace(os.Getenv("DRT_HARNESS_ROBOT_RPC")) != ""
}

type RobotRequest struct {
	OwnerID        string `json:"owner_id"`
	ConversationID string `json:"conversation_id"`
	ProjectID      string `json:"project_id,omitempty"`
	WorkspaceID    string `json:"workspace_id,omitempty"`
	Path           string `json:"path,omitempty"`
	Message        string `json:"message"`
}

type RobotEvent struct {
	Type      string                 `json:"type"`
	Message   string                 `json:"message"`
	Text      string                 `json:"text"`
	SessionID string                 `json:"session_id"`
	Cwd       string                 `json:"cwd"`
	Data      map[string]interface{} `json:"data"`
}

// RunRobot 消费同一 Harness 原生会话的持久事件；连接取消即中止原生执行，故障不回落旧引擎。
func RunRobot(ctx context.Context, request RobotRequest, progress func(RobotEvent)) (string, error) {
	endpoint := strings.TrimRight(strings.TrimSpace(os.Getenv("DRT_HARNESS_ROBOT_RPC")), "/")
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "http" || parsed.Hostname() != "127.0.0.1" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("Harness 机器人接口必须使用服务器回环地址")
	}
	keyPath := os.Getenv("DRT_HARNESS_ROBOT_RPC_KEY")
	if keyPath == "" {
		keyPath = os.Getenv("DRT_HARNESS_WORKSPACE_RPC_KEY")
	}
	key, err := os.ReadFile(keyPath)
	if err != nil {
		return "", fmt.Errorf("读取 Harness 机器人接口凭据失败")
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/run", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Harness-Key", strings.TrimSpace(string(key)))
	client := &http.Client{Transport: &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 6 * time.Second}).DialContext, ResponseHeaderTimeout: 8 * time.Second}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", fmt.Errorf("Harness 服务连接失败: %w", err)
	}
	defer resp.Body.Close()
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 4096), 4*1024*1024)
	for scanner.Scan() {
		var event RobotEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			return "", fmt.Errorf("Harness 返回无效执行事件")
		}
		switch event.Type {
		case "error":
			return "", fmt.Errorf("Harness: %s", event.Message)
		case "final":
			if resp.StatusCode != http.StatusOK || strings.TrimSpace(event.Text) == "" {
				return "", fmt.Errorf("Harness 没有返回有效回复")
			}
			return event.Text, nil
		case "heartbeat":
		default:
			if progress != nil {
				progress(event)
			}
		}
	}
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("Harness 回复中断: %w", err)
	}
	return "", fmt.Errorf("Harness 回复缺少本轮完成事件（HTTP %d）", resp.StatusCode)
}
