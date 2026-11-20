// 平台 AI 通道自动同步到 dsh（Harness）：系统设置保存通道后，模型出现在 dsh 对话切换目录。
// 设计与 154 部署的 platform-model-sync 一致：
//   - 托管路由前缀 chana-model-，只增删改该前缀，不触碰用户手动配置的供应商
//   - 密钥走 dsh 原生凭据服务（credentials/set），不进入浏览器可读的 settings
//   - GLM（open.bigmodel.cn）自动附加 zai thinkingFormat 与 reasoning_content 回放兼容
package app

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"chana/internal/config"
	"chana/internal/logger"

	"go.uber.org/zap"
)

const (
	dshModelRoutePrefix = "chana-model-"
	dshProfileNS        = "llm-pi-ai"
	dshDefaultNS        = "agent-default-model"
)

// dshKnownModelLimits 官方硬边界（host, model）→(contextWindow, maxTokens)，用户填写的更大值会被收敛。
var dshKnownModelLimits = map[[2]string][2]int{
	{"api.deepseek.com", "deepseek-flash"}: {1000000, 393216},
	{"api.deepseek.com", "deepseek-v4-pro"}: {1000000, 393216},
	{"open.bigmodel.cn", "glm-5.3"}:        {1000000, 131072},
	{"dashscope.aliyuncs.com", "qwen3-max"}: {262144, 65536},
}

type dshNativeClient struct {
	base   string
	http   *http.Client
	logger *logger.Logger
}

func (a *App) dshSyncEnabled() bool {
	return a.config.Dsh.BaseURL != "" && a.config.Dsh.Token != ""
}

func newDshNativeClient(base, token string, logger *logger.Logger) (*dshNativeClient, error) {
	jar, _ := cookiejar.New(nil)
	c := &dshNativeClient{base: strings.TrimRight(base, "/"), http: &http.Client{Timeout: 10 * time.Second, Jar: jar}, logger: logger}
	login, err := http.NewRequest(http.MethodGet, c.base+"/?token="+url.QueryEscape(token), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(login)
	if err != nil {
		return nil, fmt.Errorf("dsh 登录失败: %w", err)
	}
	resp.Body.Close()
	return c, nil
}

// call 调 dsh 原生 client API（client-request 信封）。
func (c *dshNativeClient) call(method string, args map[string]interface{}) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"type": "client-request", "rpcId": randomID(), "method": method,
		"payload": map[string]interface{}{"args": args},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, c.base+"/api/"+method, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	var envelope struct {
		Result struct {
			OK    bool                   `json:"ok"`
			Value map[string]interface{} `json:"value"`
			Error struct{ Code string `json:"code"` } `json:"error"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("dsh 响应解析失败(%s): %s", method, string(raw[:min(len(raw), 120)]))
	}
	if !envelope.Result.OK {
		return nil, fmt.Errorf("dsh 拒绝 %s: %s", method, envelope.Result.Error.Code)
	}
	return envelope.Result.Value, nil
}

func randomID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func min(a, b int) int { if a < b { return a }; return b }

// dshModelRoute 通道 ID → 托管路由名。
func dshModelRoute(channelID string) string {
	sum := sha256.Sum256([]byte(channelID))
	return dshModelRoutePrefix + hex.EncodeToString(sum[:])[:12]
}

// dshChannelProfiles 从平台通道配置生成 dsh provider profiles 与密钥。
func dshChannelProfiles(cfg *config.Config) (map[string]map[string]interface{}, map[string]string, []string) {
	profiles := map[string]map[string]interface{}{}
	secrets := map[string]string{}
	skipped := []string{}
	for id, ch := range cfg.AI.Channels {
		model := strings.TrimSpace(ch.Model)
		base := strings.TrimRight(strings.TrimSpace(ch.BaseURL), "/")
		key := strings.TrimSpace(ch.APIKey)
		if id == "" || model == "" || base == "" || key == "" {
			skipped = append(skipped, id+"(未填写完整)")
			continue
		}
		parsed, err := url.Parse(base)
		if err != nil || parsed.Host == "" {
			skipped = append(skipped, id+"(地址格式错误)")
			continue
		}
		route := dshModelRoute(id)
		ref := "CHANA_MODEL_" + strings.ToUpper(strings.TrimPrefix(route, dshModelRoutePrefix)) + "_API_KEY"
		name := strings.TrimSpace(ch.Name)
		if name == "" {
			name = model
		}
		profile := map[string]interface{}{
			"displayName": name,
			"apiKeyEnv":   ref,
			"api":         map[bool]string{true: "anthropic-messages", false: "openai-completions"}[ch.Provider == "claude"],
			"baseURL":     base,
			"models":      []map[string]interface{}{{"id": model, "name": model}},
			"defaultInput": []string{"text"},
		}
		limits, known := dshKnownModelLimits[[2]string{parsed.Hostname(), model}]
		type budget struct{ source string; dest, modelDest string; hard int }
		for _, b := range []budget{{"total", "defaultContextWindow", "contextWindow", 0}, {"completion", "defaultMaxTokens", "maxTokens", 1}} {
			var value int
			if b.source == "total" {
				value = ch.MaxTotalTokens
			} else {
				value = ch.MaxCompletionTokens
			}
			if known && value > limits[b.hard] {
				value = limits[b.hard]
			}
			if value > 0 {
				profile[b.dest] = value
				profile["models"].([]map[string]interface{})[0][b.modelDest] = value
			}
		}
		if ch.Provider != "claude" {
			compat := map[string]interface{}{
				"supportsDeveloperRole": false,
				"supportsStore":         false,
				"maxTokensField":        "max_tokens",
			}
			if parsed.Hostname() == "open.bigmodel.cn" {
				compat["thinkingFormat"] = "zai"
				compat["requiresReasoningContentOnAssistantMessages"] = true
			}
			profile["compat"] = compat
		}
		profiles[route] = profile
		secrets[ref] = key
	}
	return profiles, secrets, skipped
}

var dshSyncMu sync.Mutex

// SyncDshModels 把平台 AI 通道同步到 dsh（幂等，只管 chana-model- 前缀）。
// 失败只记日志，绝不阻塞调用方；密钥不落任何日志。
func (a *App) SyncDshModels(reason string) {
	if !a.dshSyncEnabled() {
		return
	}
	dshSyncMu.Lock()
	defer dshSyncMu.Unlock()
	client, err := newDshNativeClient(a.config.Dsh.BaseURL, a.config.Dsh.Token, a.logger)
	if err != nil {
		a.logger.Warn("dsh 模型同步：连接失败", zap.String("reason", reason), zap.Error(err))
		return
	}
	profiles, secrets, skipped := dshChannelProfiles(a.config)
	// 1. 密钥先进原生凭据服务
	for ref, value := range secrets {
		if _, err := client.call("credentials/set", map[string]interface{}{"ref": ref, "value": value}); err != nil {
			a.logger.Warn("dsh 模型同步：凭据写入失败", zap.String("ref", ref), zap.Error(err))
			return
		}
	}
	// 2. settings/mutate 同步 provider（冲突重试）
	for attempt := 0; attempt < 3; attempt++ {
		desc, err := client.call("settings/describe", map[string]interface{}{})
		if err != nil {
			a.logger.Warn("dsh 模型同步：settings/describe 失败", zap.Error(err)); return
		}
		ns := findNamespace(desc, dshProfileNS)
		if ns == nil {
			a.logger.Warn("dsh 模型同步：未找到 llm-pi-ai 命名空间"); return
		}
		current := currentProviders(ns)
		var ops []map[string]interface{}
		for route, profile := range profiles {
			if !jsonEqual(current[route], profile) {
				ops = append(ops, mutation("set", route, profile))
			}
		}
		for route := range current {
			if strings.HasPrefix(route, dshModelRoutePrefix) {
				if _, keep := profiles[route]; !keep {
					ops = append(ops, mutation("unset", route, nil))
				}
			}
		}
		if len(ops) == 0 {
			break
		}
		args := map[string]interface{}{"ns": dshProfileNS, "ops": ops, "expectedRevision": ns["revision"]}
		if _, err := client.call("settings/mutate", args); err != nil {
			if attempt == 2 || !strings.Contains(err.Error(), "conflict") {
				a.logger.Warn("dsh 模型同步：settings/mutate 失败", zap.Error(err)); return
			}
			continue
		}
		break
	}
	// 3. 平台默认通道 → dsh 默认模型
	if def := a.config.AI.DefaultChannel; def != "" {
		if route := dshModelRoute(strings.TrimSpace(def)); profiles[route] != nil {
			model := profiles[route]["models"].([]map[string]interface{})[0]["id"].(string)
			selection := map[string]interface{}{"provider": route, "model": model}
			if desc, err := client.call("settings/describe", map[string]interface{}{}); err == nil {
				if ns := findNamespace(desc, dshDefaultNS); ns != nil {
					current, _ := ns["value"].(map[string]interface{})
					var ops []map[string]interface{}
					for k, v := range selection {
						if cur, _ := current[k]; !jsonEqual(cur, v) {
							ops = append(ops, map[string]interface{}{"op": "set", "path": []string{k}, "value": v})
						}
					}
					if _, has := current["reasoningEffort"]; has {
						ops = append(ops, map[string]interface{}{"op": "unset", "path": []string{"reasoningEffort"}})
					}
					if len(ops) > 0 {
						ops = append(ops[:0:0], ops...)
						client.call("settings/mutate", map[string]interface{}{"ns": dshDefaultNS, "ops": ops, "expectedRevision": ns["revision"]})
					}
				}
			}
		}
	}
	// 4. 目录验证
	catalog, err := client.call("session/modelCatalog", map[string]interface{}{})
	if err == nil {
		groups, _ := catalog["groups"].([]interface{})
		found := 0
		for _, g := range groups {
			if group, ok := g.(map[string]interface{}); ok {
				if _, managed := profiles[group["id"].(string)]; managed {
					found++
				}
			}
		}
		a.logger.Info("dsh 模型同步完成", zap.String("reason", reason),
			zap.Int("channels", len(profiles)), zap.Int("in_catalog", found), zap.Strings("skipped", skipped))
	}
}

func findNamespace(desc map[string]interface{}, ns string) map[string]interface{} {
	namespaces, _ := desc["namespaces"].([]interface{})
	for _, n := range namespaces {
		if row, ok := n.(map[string]interface{}); ok && row["ns"] == ns {
			return row
		}
	}
	return nil
}

func currentProviders(ns map[string]interface{}) map[string]interface{} {
	user, _ := ns["user"].(map[string]interface{})
	if user == nil {
		return map[string]interface{}{}
	}
	providers, _ := user["providers"].(map[string]interface{})
	if providers == nil {
		return map[string]interface{}{}
	}
	return providers
}

func mutation(op, route string, value map[string]interface{}) map[string]interface{} {
	m := map[string]interface{}{"op": op, "path": []string{"providers", route}}
	if value != nil {
		m["value"] = value
	}
	return m
}

func jsonEqual(a, b interface{}) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}
