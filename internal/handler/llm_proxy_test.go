package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chana/internal/config"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// 确认未指定模型的真实代理请求使用当前通道，显式模型仍可正常传递。
func TestLLMProxyConfiguredModel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, requested, expected string
	}{
		{"默认模型", "", "configured-model"},
		{"空白模型", "  ", "configured-model"},
		{"显式模型", "explicit-model", "explicit-model"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			captured := make(chan string, 1)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body struct {
					Model string `json:"model"`
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				captured <- body.Model
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"ok"}}]}`))
			}))
			defer upstream.Close()
			h := NewLLMProxyHandler(&config.OpenAIConfig{BaseURL: upstream.URL + "/v1", Model: "configured-model", APIKey: "local-test-key"}, zap.NewNop())
			router := gin.New()
			router.POST("/completion", h.ChatCompletions)
			body, _ := json.Marshal(OpenAICompatibleChatRequest{Model: tc.requested, Messages: []LLMProxyMessage{{Role: "user", Content: "ok"}}})
			req := httptest.NewRequest(http.MethodPost, "/completion", strings.NewReader(string(body)))
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != http.StatusOK {
				t.Fatalf("代理状态异常：%d %s", response.Code, response.Body.String())
			}
			select {
			case model := <-captured:
				if model != tc.expected {
					t.Fatalf("发往上游的模型为 %q，预期 %q", model, tc.expected)
				}
			default:
				t.Fatal("请求未到达上游")
			}
		})
	}
}

func TestLLMProxyRejectsUnconfiguredDefault(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &LLMProxyHandler{logger: zap.NewNop()}
	router := gin.New()
	router.POST("/completion", h.ChatCompletions)
	req := httptest.NewRequest(http.MethodPost, "/completion", strings.NewReader(`{"messages":[{"role":"user","content":"ok"}]}`))
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("未配置模型应明确返回不可用：%d", response.Code)
	}
}
