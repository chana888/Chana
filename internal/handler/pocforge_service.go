package handler

// POC 工厂 —— 服务层导出方法（2026-10-06 二开）
//
// 目的：让 MCP（dsh / 内置 agent）与 Web 端复用同一套 LLM 提示词、同一套模板校验、
// 同一个模板目录，避免出现「网页能生成、agent 生成不了」的双份实现。
// HTTP 处理函数 Generate/ListTemplates/SaveTemplate 保持不变。

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// PocTemplateInfo 模板库条目（MCP 摘要用）
type PocTemplateInfo struct {
	Name       string    `json:"name"`
	Size       int64     `json:"size"`
	ModifiedAt time.Time `json:"modified_at"`
	Summary    string    `json:"summary"`
}

// NormalizePocSeverity 收敛严重等级取值（下拉/模板只认这五档）
func NormalizePocSeverity(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "critical", "high", "medium", "low", "info":
		return s
	default:
		return "high"
	}
}

// GenerateTemplate 由漏洞证据生成 nuclei 模板（MCP 与 HTTP 共用）
func (h *PocForgeHandler) GenerateTemplate(ctx context.Context, title, severity, evidence, extra string) (string, []string, error) {
	if h == nil || h.openAIClient == nil || h.cfg == nil {
		return "", nil, fmt.Errorf("PoC 工厂未启用：缺少可用的 LLM 配置")
	}
	title = strings.TrimSpace(title)
	evidence = strings.TrimSpace(evidence)
	if title == "" || evidence == "" {
		return "", nil, fmt.Errorf("title 与 evidence 必填")
	}
	severity = NormalizePocSeverity(severity)

	userPrompt := fmt.Sprintf(`漏洞标题：%s
漏洞等级：%s

漏洞证据（请求/响应/利用过程，构造模板的唯一依据）：
%s`, title, severity, evidence)
	if strings.TrimSpace(extra) != "" {
		userPrompt += "\n\n补充要求：" + strings.TrimSpace(extra)
	}

	requestBody := map[string]interface{}{
		"model": h.cfg.OpenAI.Model,
		"messages": []map[string]interface{}{
			{"role": "system", "content": pocGenerateSystemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"temperature":           0.2,
		"max_completion_tokens": 4000,
	}
	var apiResponse struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	callCtx, cancel := context.WithTimeout(ctx, 150*time.Second)
	defer cancel()
	if err := h.openAIClient.ChatCompletion(callCtx, requestBody, &apiResponse); err != nil {
		return "", nil, fmt.Errorf("AI 生成失败: %w", err)
	}
	if len(apiResponse.Choices) == 0 {
		return "", nil, fmt.Errorf("AI 未返回有效结果")
	}
	tpl := stripYamlFence(strings.TrimSpace(apiResponse.Choices[0].Message.Content))
	return tpl, validateTemplate(tpl), nil
}

// ListTemplateInfos 列出模板库（按修改时间倒序）
func (h *PocForgeHandler) ListTemplateInfos() ([]PocTemplateInfo, error) {
	if h == nil {
		return nil, fmt.Errorf("PoC 工厂未启用")
	}
	entries, err := os.ReadDir(h.templateDir)
	if err != nil {
		return nil, fmt.Errorf("读取模板目录失败: %w", err)
	}
	items := make([]PocTemplateInfo, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		summary := ""
		if data, err := os.ReadFile(filepath.Join(h.templateDir, e.Name())); err == nil {
			summary = templateSummary(string(data))
		}
		items = append(items, PocTemplateInfo{
			Name:       e.Name(),
			Size:       info.Size(),
			ModifiedAt: info.ModTime(),
			Summary:    summary,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ModifiedAt.After(items[j].ModifiedAt) })
	return items, nil
}

// SaveTemplateContent 保存模板到模板库（复用 HTTP 端同款名称/格式校验）
func (h *PocForgeHandler) SaveTemplateContent(name, content string) (string, error) {
	if h == nil {
		return "", fmt.Errorf("PoC 工厂未启用")
	}
	name = strings.TrimSuffix(strings.TrimSpace(name), ".yaml")
	name = strings.TrimSuffix(name, ".yml")
	if !pocTemplateNameRe.MatchString(name) {
		return "", fmt.Errorf("模板名非法：仅允许字母数字开头，可含 _ . -，最长100字符")
	}
	if strings.TrimSpace(content) == "" {
		return "", fmt.Errorf("模板内容为空")
	}
	if w := validateTemplate(content); len(w) == 1 && strings.HasPrefix(w[0], "模板格式无效") {
		return "", fmt.Errorf("%s", w[0])
	}
	full := name + ".yaml"
	if err := os.WriteFile(filepath.Join(h.templateDir, full), []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("写入失败: %w", err)
	}
	return full, nil
}

// TemplateDir 暴露模板目录（MCP 回显用）
func (h *PocForgeHandler) TemplateDir() string {
	if h == nil {
		return ""
	}
	return h.templateDir
}
