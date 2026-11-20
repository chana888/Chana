package knowledge

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	openai "github.com/meguminnnnnnnnn/go-openai"
	"go.uber.org/zap"
)

// EmbeddingBlockedError 只包含可公开的诊断，不回显供应商响应中的凭据。
type EmbeddingBlockedError struct {
	Reason  string    `json:"reason"`
	Message string    `json:"message"`
	Since   time.Time `json:"since"`
}

func (e *EmbeddingBlockedError) Error() string { return e.Message }

func classifyEmbeddingError(err error) (reason string, retryable bool) {
	if err == nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "", false
	}
	var apiErr *openai.APIError
	var requestErr *openai.RequestError
	status := 0
	message := strings.ToLower(err.Error())
	if errors.As(err, &apiErr) {
		status = apiErr.HTTPStatusCode
		message = strings.ToLower(fmt.Sprint(apiErr.Code) + " " + apiErr.Type + " " + apiErr.Message)
	} else if errors.As(err, &requestErr) {
		status = requestErr.HTTPStatusCode
	}
	for _, marker := range []string{"insufficient_quota", "quota_exceeded", "insufficient_balance", "balance_not_enough", "insufficient balance", "billing_hard_limit", "credit balance", "余额不足", "无可用资源包", "额度用尽", "配额已耗尽"} {
		if strings.Contains(message, marker) {
			return "quota_exhausted", false
		}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden || strings.Contains(message, "invalid_api_key") {
		return "authentication_failed", false
	}
	if status == http.StatusNotFound || strings.Contains(message, "model_not_found") || strings.Contains(message, "invalid_model") {
		return "configuration_error", false
	}
	if status > 0 {
		return "", status == http.StatusTooManyRequests || status == http.StatusRequestTimeout || status >= 500 && status <= 599
	}
	var netErr net.Error
	if errors.As(err, &netErr) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return "", true
	}
	return "", false
}

func embeddingBlockedMessage(reason string) string {
	switch reason {
	case "quota_exhausted":
		return "嵌入服务余额不足或资源包已用尽，向量索引已暂停。补充额度后恢复索引，或更换有效的嵌入配置；已归档案例仍可关键词检索。"
	case "authentication_failed":
		return "嵌入服务鉴权失败，向量索引已暂停。请检查 API 密钥和模型访问权限，修复后恢复索引。"
	default:
		return "嵌入模型或接口地址不可用，向量索引已暂停。请检查嵌入配置，修复后恢复索引。"
	}
}

func (e *Embedder) attachStateStore(ctx context.Context, db *sql.DB) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS knowledge_embedding_state (
		config_id TEXT PRIMARY KEY, reason TEXT NOT NULL, blocked_at TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("初始化嵌入暂停状态失败: %w", err)
	}
	var reason, since string
	err := db.QueryRowContext(ctx, `SELECT reason,blocked_at FROM knowledge_embedding_state WHERE config_id=?`, e.configID).Scan(&reason, &since)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("读取嵌入暂停状态失败: %w", err)
	}
	e.stateDB = db
	if err == nil {
		at, parseErr := time.Parse(time.RFC3339Nano, since)
		if parseErr != nil {
			return fmt.Errorf("读取嵌入暂停时间失败: %w", parseErr)
		}
		e.blocked = &EmbeddingBlockedError{Reason: reason, Message: embeddingBlockedMessage(reason), Since: at}
	}
	return nil
}

func (e *Embedder) BlockedState() *EmbeddingBlockedError {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.blocked == nil {
		return nil
	}
	state := *e.blocked
	return &state
}

func (e *Embedder) block(reason string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.blocked == nil {
		e.blocked = &EmbeddingBlockedError{Reason: reason, Message: embeddingBlockedMessage(reason), Since: time.Now().UTC()}
		if e.stateDB != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_, err := e.stateDB.ExecContext(ctx, `INSERT INTO knowledge_embedding_state(config_id,reason,blocked_at) VALUES(?,?,?)
				ON CONFLICT(config_id) DO UPDATE SET reason=excluded.reason,blocked_at=excluded.blocked_at`, e.configID, reason, e.blocked.Since.Format(time.RFC3339Nano))
			if err != nil && e.logger != nil {
				e.logger.Error("持久化嵌入暂停状态失败", zap.Error(err))
			}
		}
		if e.logger != nil {
			e.logger.Warn("嵌入通道已暂停，等待手动恢复或配置修复", zap.String("reason", reason))
		}
	}
	state := *e.blocked
	return &state
}

// Resume 仅解除暂停，不删除任何知识或向量；下一次真实调用仍会重新判定服务状态。
func (e *Embedder) Resume(ctx context.Context) error {
	select {
	case e.callSlot <- struct{}{}:
		defer func() { <-e.callSlot }()
	case <-ctx.Done():
		return ctx.Err()
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.stateDB != nil {
		if _, err := e.stateDB.ExecContext(ctx, `DELETE FROM knowledge_embedding_state WHERE config_id=?`, e.configID); err != nil {
			return fmt.Errorf("恢复嵌入通道失败: %w", err)
		}
	}
	e.blocked = nil
	return nil
}
