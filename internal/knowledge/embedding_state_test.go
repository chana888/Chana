package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"chana/internal/config"
	"chana/internal/database"
	openai "github.com/meguminnnnnnnnn/go-openai"
	"go.uber.org/zap"
)

func TestClassifyEmbeddingErrors(t *testing.T) {
	for _, tc := range []struct {
		status      int
		code        any
		msg, reason string
		retry       bool
	}{
		{429, nil, "余额不足或无可用资源包,请充值。", "quota_exhausted", false},
		{429, "insufficient_quota", "quota", "quota_exhausted", false},
		{429, "rate_limit_exceeded", "Too many requests", "", true},
		{401, nil, "invalid key", "authentication_failed", false},
		{403, nil, "denied", "authentication_failed", false},
		{404, "model_not_found", "model", "configuration_error", false},
		{400, nil, "bad input 429", "", false},
		{503, nil, "unavailable", "", true},
	} {
		err := fmt.Errorf("包装: %w", &openai.APIError{HTTPStatusCode: tc.status, Code: tc.code, Message: tc.msg})
		reason, retry := classifyEmbeddingError(err)
		if reason != tc.reason || retry != tc.retry {
			t.Fatalf("%d: %s %t", tc.status, reason, retry)
		}
	}
	if _, retry := classifyEmbeddingError(context.Canceled); retry {
		t.Fatal("取消不应重试")
	}
	if _, retry := classifyEmbeddingError(errors.New("document 429 is invalid")); retry {
		t.Fatal("内容中的状态数字不应触发重试")
	}
}

func newStateTestEmbedder(t *testing.T, cfg *config.KnowledgeConfig) *Embedder {
	t.Helper()
	e, err := NewEmbedder(context.Background(), cfg, nil, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestEmbeddingPermanentBlockPersistsAndRecovers(t *testing.T) {
	f := newArchiveTestFixture(t)
	var requests atomic.Int32
	var unavailable atomic.Bool
	unavailable.Store(true)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if unavailable.Load() {
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`{"error":{"message":"余额不足或无可用资源包,请充值。"}}`))
			return
		}
		var req struct {
			Input []string `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Error(err)
			return
		}
		data := make([]map[string]any, len(req.Input))
		for i := range req.Input {
			data[i] = map[string]any{"index": i, "embedding": []float64{1, 0, 0}}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": data})
	}))
	defer server.Close()
	cfg := &config.KnowledgeConfig{}
	cfg.Embedding.Model, cfg.Embedding.BaseURL, cfg.Embedding.APIKey = "embedding-test", server.URL, "test-only"
	cfg.Indexing.MaxRetries, cfg.Indexing.RetryDelayMs = 3, 1
	e := newStateTestEmbedder(t, cfg)
	idx, err := NewIndexer(context.Background(), f.knowledge.DB, e, zap.NewNop(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	f.archive.indexer = idx
	for i := 0; i < 3; i++ {
		_, err := f.source.CreateVulnerability(&database.Vulnerability{Title: "访问控制测试案例", Status: "confirmed", Evidence: "测试证据"})
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := f.archive.Reconcile(context.Background()); err == nil {
		t.Fatal("首轮应报告暂停")
	}
	if requests.Load() != 1 {
		t.Fatalf("余额不足调用了 %d 次", requests.Load())
	}
	if err := f.archive.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 1 {
		t.Fatal("后续对账仍请求供应商")
	}
	retriever := NewRetriever(f.knowledge.DB, e, &RetrievalConfig{TopK: 5}, zap.NewNop())
	found, err := retriever.Search(context.Background(), &SearchRequest{Query: "访问控制", RiskType: "已确认漏洞"})
	if err != nil || len(found) != 3 {
		t.Fatalf("暂停期间归档检索失败: %d %v", len(found), err)
	}
	// 模拟进程重启，同一配置直接读取持久化暂停状态。
	e2 := newStateTestEmbedder(t, cfg)
	idx2, err := NewIndexer(context.Background(), f.knowledge.DB, e2, zap.NewNop(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e2.EmbedText(context.Background(), "test"); err == nil {
		t.Fatal("重启后暂停丢失")
	}
	if requests.Load() != 1 {
		t.Fatal("重启后再次发包")
	}
	changed := *cfg
	changed.Embedding.APIKey = "different-test-key"
	e3 := newStateTestEmbedder(t, &changed)
	if err := e3.attachStateStore(context.Background(), f.knowledge.DB); err != nil {
		t.Fatal(err)
	}
	if e3.BlockedState() != nil {
		t.Fatal("新配置错误继承旧暂停")
	}
	unavailable.Store(false)
	if err := idx2.ResumeEmbedding(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.archive.indexer = idx2
	if err := f.archive.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if e2.BlockedState() != nil {
		t.Fatal("恢复后仍暂停")
	}
	var vectors int
	if err := f.knowledge.QueryRow(`SELECT COUNT(DISTINCT item_id) FROM knowledge_embeddings`).Scan(&vectors); err != nil || vectors != 3 {
		t.Fatalf("恢复未补齐: %d %v", vectors, err)
	}
	// 对同一正文重建失败时，已有向量必须保持不变。
	unavailable.Store(true)
	if err := idx2.RebuildIndex(context.Background()); err == nil {
		t.Fatal("重建失败被标为成功")
	}
	if err := f.knowledge.QueryRow(`SELECT COUNT(DISTINCT item_id) FROM knowledge_embeddings`).Scan(&vectors); err != nil || vectors != 3 {
		t.Fatal("余额失败删除了已有索引")
	}
}

func TestEmbeddingRateLimitRetryAndCancellation(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if requests.Add(1) < 3 {
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`{"error":{"message":"Too many requests","code":"rate_limit_exceeded"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":[{"index":0,"embedding":[1,0]}]}`))
	}))
	defer server.Close()
	cfg := &config.KnowledgeConfig{}
	cfg.Embedding.Model, cfg.Embedding.BaseURL, cfg.Embedding.APIKey = "embedding-test", server.URL, "test-only"
	cfg.Indexing.MaxRetries, cfg.Indexing.RetryDelayMs = 3, 1
	e := newStateTestEmbedder(t, cfg)
	if _, err := e.EmbedText(context.Background(), "test"); err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 3 || e.BlockedState() != nil {
		t.Fatal("普通限流错误被永久暂停")
	}
	e.rateLimitDelay = time.Hour
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := e.EmbedText(ctx, "cancel"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("限速等待未响应取消: %v", err)
	}
	if requests.Load() != 3 {
		t.Fatal("取消后仍发包")
	}
}

func TestIndexStatusExcludesInactiveItems(t *testing.T) {
	f := newArchiveTestFixture(t)
	_, err := f.knowledge.Exec(`INSERT INTO knowledge_base_items(id,category,title,file_path,content,is_active,created_at,updated_at)
		VALUES('active','test','test','','body',1,datetime('now'),datetime('now')),('inactive','test','test','','body',0,datetime('now'),datetime('now'))`)
	if err != nil {
		t.Fatal(err)
	}
	m := NewManager(f.knowledge.DB, f.archive.basePath, zap.NewNop())
	state, err := m.GetIndexStatus()
	if err != nil || state["total_items"] != 1 {
		t.Fatalf("停用项计入总数: %v %v", state, err)
	}
}
