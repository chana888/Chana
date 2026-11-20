package handler

// POC 生成与批量刷洞（2026-10-04 二开第七轮）
// 三步流水线：①LLM 从漏洞证据生成 nuclei YAML 模板（可保存模板库/单目标自测）
// ②复用 /api/fofa/search 拉资产（前端直调） ③nuclei 并发批量验证 + 一键落库漏洞管理。

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"chana/internal/config"
	openaiClient "chana/internal/openai"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const (
	pocTaskTTL       = time.Hour         // 完成任务保留时长
	pocTargetTimeout = 150 * time.Second // 单目标 nuclei 超时
	pocMaxTargets    = 2000
)

// PocForgeHandler POC 工厂
type PocForgeHandler struct {
	cfg          *config.Config
	logger       *zap.Logger
	openAIClient *openaiClient.Client
	templateDir  string
	nucleiPath   string

	mu    sync.RWMutex
	tasks map[string]*PocBatchTask
}

// PocBatchResult 单目标验证结果
type PocBatchResult struct {
	Target      string    `json:"target"`
	Status      string    `json:"status"` // hit / miss / error
	MatchedAt   string    `json:"matched_at,omitempty"`
	Extracted   []string  `json:"extracted,omitempty"`
	CurlCommand string    `json:"curl_command,omitempty"`
	MatcherName string    `json:"matcher_name,omitempty"`
	Error       string    `json:"error,omitempty"`
	At          time.Time `json:"at"`
}

// PocBatchTask 批量任务（内存态，前端轮询）
type PocBatchTask struct {
	ID           string           `json:"id"`
	TemplateName string           `json:"template_name"`
	Status       string           `json:"status"` // running / done / error / canceled
	Total        int              `json:"total"`
	Done         int              `json:"done"`
	Hits         int              `json:"hits"`
	Errors       int              `json:"errors"`
	Concurrency  int              `json:"concurrency"`
	StartedAt    time.Time        `json:"started_at"`
	FinishedAt   *time.Time       `json:"finished_at,omitempty"`
	Results      []PocBatchResult `json:"results"`
	LogTail      []string         `json:"log_tail"`

	cancel context.CancelFunc
}

func NewPocForgeHandler(cfg *config.Config, logger *zap.Logger) *PocForgeHandler {
	llmHTTPClient := &http.Client{Timeout: 3 * time.Minute}
	var llmCfg *config.OpenAIConfig
	if cfg != nil {
		llmCfg = &cfg.OpenAI
	}
	dir := os.Getenv("DRT_POC_TEMPLATE_DIR")
	if dir == "" {
		dir = "/opt/chana/app/poc_templates"
	}
	h := &PocForgeHandler{
		cfg:          cfg,
		logger:       logger,
		openAIClient: openaiClient.NewClient(llmCfg, llmHTTPClient, logger),
		templateDir:  dir,
		tasks:        make(map[string]*PocBatchTask),
	}
	_ = os.MkdirAll(h.templateDir, 0o755)
	h.nucleiPath = findNucleiBinary()
	h.ensureNucleiBinary() // 缺失时后台自动获取（开箱即用）
	return h
}

// nucleiExecutableName 当前平台的目标文件名。
func nucleiExecutableName() string {
	// 仓库自带命名：nuclei-<os>-<arch>[.exe]（ammo/tools/ 内随仓库分发）
	name := fmt.Sprintf("nuclei-%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func findNucleiBinary() string {
	candidates := []string{}
	if p, err := exec.LookPath(nucleiExecutableName()); err == nil && p != "" {
		candidates = append(candidates, p)
	}
	// 仓库自包含布局：ammo/tools/ 下随仓库或自动获取的二进制
	candidates = append(candidates,
		filepath.Join("ammo", "tools", nucleiExecutableName()),
		filepath.Join(".", nucleiExecutableName()),
		"/usr/local/bin/nuclei", "/usr/bin/nuclei", "/root/go/bin/nuclei", "/usr/local/sbin/nuclei")
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

// ensureNucleiBinary 缺失时后台自动下载 nuclei 到 ammo/tools/（开箱即用）。
// 下载源为官方 GitHub Releases 固定稳定版；失败不影响平台其他功能，
// 手动放置二进制到 ammo/tools/ 后重启即可。
func (h *PocForgeHandler) ensureNucleiBinary() {
	if h.nucleiPath != "" {
		return
	}
	go func() {
		p, err := downloadNuclei()
		if err != nil {
			h.logger.Warn("nuclei 自动获取失败（可手动放置 ammo/tools/ 后重启）", zap.Error(err))
			return
		}
		h.mu.Lock()
		h.nucleiPath = p
		h.mu.Unlock()
		h.logger.Info("nuclei 已自动就绪（POC 工厂可用）", zap.String("path", p))
	}()
}

const nucleiAutoVersion = "3.4.2"

func downloadNuclei() (string, error) {
	plat := map[string]string{
		"windows/amd64": "windows_amd64", "linux/amd64": "linux_amd64",
		"darwin/amd64": "darwin_amd64", "darwin/arm64": "darwin_arm64",
	}[runtime.GOOS+"/"+runtime.GOARCH]
	if plat == "" {
		return "", fmt.Errorf("nuclei 自动获取暂不支持 %s/%s，请手动安装", runtime.GOOS, runtime.GOARCH)
	}
	dest := filepath.Join("ammo", "tools", nucleiExecutableName())
	if st, err := os.Stat(dest); err == nil && !st.IsDir() {
		return dest, nil
	}
	url := fmt.Sprintf("https://github.com/projectdiscovery/nuclei/releases/download/v%s/nuclei_v%s_%s.zip",
		nucleiAutoVersion, nucleiAutoVersion, plat)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载 nuclei HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 128<<20))
	if err != nil {
		return "", err
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}
	want := nucleiExecutableName()
	for _, f := range zr.File {
		if strings.HasSuffix(f.Name, want) && !f.FileInfo().IsDir() {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			content, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return "", err
			}
			if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
				return "", err
			}
			perm := os.FileMode(0o755)
			if err := os.WriteFile(dest, content, perm); err != nil {
				return "", err
			}
			return dest, nil
		}
	}
	return "", fmt.Errorf("压缩包中未找到 %s", want)
}

// ==================== ① LLM 生成模板 ====================

type pocGenerateRequest struct {
	Title    string `json:"title" binding:"required"`
	Severity string `json:"severity"`
	Evidence string `json:"evidence" binding:"required"`
	Extra    string `json:"extra"`
}

const pocGenerateSystemPrompt = `你是「nuclei 模板生成专家」。任务：根据用户提供的漏洞信息，生成一个 nuclei v3 YAML 检测模板。

输出要求（非常重要）：
1) 只输出一个 YAML 模板本身：不要解释文字、不要 markdown 代码块（禁止用三个反引号包裹）
2) 结构：id / info(name, severity, tags, reference 可选) / http(requests + matchers)；纯网络协议漏洞可用 tcp
3) 安全铁规则（模板会被用于批量无害验证）：
   - 检测 payload 必须零副作用：禁止写文件、执行系统命令、增删改数据、创建/删除账号、发送会破坏业务状态的请求
   - 允许的验证手法：无害回显（算术计算如 7*7→49、固定字符串 echo）、错误信息回显、响应头/页面指纹、状态码+关键字组合
   - RCE/SQLi 类漏洞必须降级为无害探测（如 Freemarker/OGNL/SpEL 用算术回显、SQLi 用算术表达式回显），绝不用 sleep 长延时轰炸
   - 禁止依赖 interactsh/OOB 外带（批量验证时已禁用）
4) matchers 必须严格防误报：优先 body 关键字 + status 双条件；回显类匹配唯一标记（算术结果、随机定值）
5) requests 的 method/path/headers/body 严格按用户证据构造，保留证据里的路径与参数名
6) id 命名：产品名或缩写-CVE编号或漏洞英文缩写-detect，全小写连字符，如 jeecg-cve-2023-4450-ssti
7) info.severity 按用户提供的等级（critical/high/medium/low），未提供默认 high`

// Generate LLM 生成 nuclei 模板
func (h *PocForgeHandler) Generate(c *gin.Context) {
	var req pocGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：title 与 evidence 必填，" + err.Error()})
		return
	}
	severity := strings.ToLower(strings.TrimSpace(req.Severity))
	switch severity {
	case "critical", "high", "medium", "low", "info":
	default:
		severity = "high"
	}

	userPrompt := fmt.Sprintf(`漏洞标题：%s
漏洞等级：%s

漏洞证据（请求/响应/利用过程，构造模板的唯一依据）：
%s`, req.Title, severity, req.Evidence)
	if strings.TrimSpace(req.Extra) != "" {
		userPrompt += "\n\n补充要求：" + req.Extra
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
	ctx, cancel := context.WithTimeout(c.Request.Context(), 150*time.Second)
	defer cancel()
	if err := h.openAIClient.ChatCompletion(ctx, requestBody, &apiResponse); err != nil {
		h.logger.Warn("POC生成：LLM调用失败", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 生成失败: " + err.Error()})
		return
	}
	if len(apiResponse.Choices) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 未返回有效结果"})
		return
	}
	tpl := stripYamlFence(strings.TrimSpace(apiResponse.Choices[0].Message.Content))
	warnings := validateTemplate(tpl)
	if len(warnings) == 1 && strings.HasPrefix(warnings[0], "模板格式无效") {
		c.JSON(http.StatusBadGateway, gin.H{"error": warnings[0], "raw": tpl})
		return
	}
	c.JSON(http.StatusOK, gin.H{"template": tpl, "warnings": warnings})
}

// stripYamlFence 剥掉 LLM 可能加的 ```yaml 围栏
func stripYamlFence(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	lines := strings.Split(s, "\n")
	// 去首行 ```yaml / ```
	if len(lines) > 0 {
		lines = lines[1:]
	}
	// 去尾行 ```
	if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "```" {
		lines = lines[:len(lines)-1]
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

// validateTemplate 基本有效性 + 危险 payload 提示
func validateTemplate(tpl string) []string {
	var warnings []string
	hasID := regexp.MustCompile(`(?m)^id:\s*\S+`).MatchString(tpl)
	// nuclei v3 有多种请求引擎段：网络侧 http/tcp/websocket/dns，
	// 主机侧取证常用 code/javascript/file，无头浏览器用 headless。
	// 只认前四种会把合法的主机侧模板误判为格式无效（dsh 联调实测踩到）。
	hasEngine := false
	for _, eng := range []string{
		"http:", "tcp:", "websocket:", "dns:",
		"code:", "javascript:", "file:", "headless:", "network:",
	} {
		if strings.Contains(tpl, eng) {
			hasEngine = true
			break
		}
	}
	if !hasID || !hasEngine {
		return []string{"模板格式无效：缺少 id 字段或请求引擎段（http/tcp/websocket/dns/code/javascript/file/headless/network），请重试或手工修正"}
	}
	// 危险关键字提示（不阻断，交给人工确认）
	dangerPatterns := []struct {
		re   string
		desc string
	}{
		{`(?i)rm\s+-rf`, "包含 rm -rf 类命令"},
		{`(?i)drop\s+table|delete\s+from|truncate\s+table`, "包含删除/清空数据类 SQL"},
		{`(?i)insert\s+into|update\s+\S+\s+set`, "包含写入数据类 SQL"},
		{`(?i)shutdown|reboot|halt\b`, "包含关机/重启命令"},
		{`(?i)mkfs|dd\s+if=|:\(\)\{`, "包含破坏性系统命令"},
		{`(?i)useradd|adduser|net\s+user`, "包含创建账号命令"},
	}
	for _, p := range dangerPatterns {
		if regexp.MustCompile(p.re).MatchString(tpl) {
			warnings = append(warnings, "⚠ "+p.desc+"，批量验证前请人工确认无害")
		}
	}
	if strings.Contains(tpl, "{{interactsh") || strings.Contains(tpl, "interactsh_url") {
		warnings = append(warnings, "⚠ 模板使用了 interactsh/OOB，批量验证时已禁用外带，可能无法命中")
	}
	if regexp.MustCompile(`(?i)sleep\s*\(\s*[0-9]{2,}`).MatchString(tpl) {
		warnings = append(warnings, "⚠ 使用了长延时 sleep，批量场景会拖慢验证并可能触发告警")
	}
	return warnings
}

// ==================== ② 模板库 ====================

var pocTemplateNameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$`)

type pocSaveTemplateRequest struct {
	Name    string `json:"name" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// ListTemplates 列出模板库
func (h *PocForgeHandler) ListTemplates(c *gin.Context) {
	entries, err := os.ReadDir(h.templateDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取模板目录失败: " + err.Error()})
		return
	}
	type tplItem struct {
		Name       string    `json:"name"`
		Size       int64     `json:"size"`
		ModifiedAt time.Time `json:"modified_at"`
		Snippet    string    `json:"snippet"`
	}
	items := make([]tplItem, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		snippet := ""
		if data, err := os.ReadFile(filepath.Join(h.templateDir, e.Name())); err == nil {
			snippet = templateSummary(string(data))
		}
		items = append(items, tplItem{Name: e.Name(), Size: info.Size(), ModifiedAt: info.ModTime(), Snippet: snippet})
	}
	c.JSON(http.StatusOK, gin.H{"templates": items, "count": len(items), "nuclei_path": h.nucleiPath})
}

// templateSummary 抽 id/name/severity 做摘要
func templateSummary(content string) string {
	var id, name, sev string
	for _, line := range strings.Split(content, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "id:") && id == "" {
			id = strings.TrimSpace(strings.TrimPrefix(t, "id:"))
		}
		if strings.Contains(t, "name:") && name == "" {
			name = strings.TrimSpace(strings.TrimPrefix(t, "name:"))
		}
		if strings.HasPrefix(t, "severity:") && sev == "" {
			sev = strings.TrimSpace(strings.TrimPrefix(t, "severity:"))
		}
	}
	parts := []string{}
	if id != "" {
		parts = append(parts, id)
	}
	if name != "" {
		parts = append(parts, name)
	}
	if sev != "" {
		parts = append(parts, sev)
	}
	return strings.Join(parts, " · ")
}

// GetTemplate 读单个模板
func (h *PocForgeHandler) GetTemplate(c *gin.Context) {
	name := c.Param("name")
	path, err := h.safeTemplatePath(name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"name": name, "content": string(data)})
}

// SaveTemplate 保存模板
func (h *PocForgeHandler) SaveTemplate(c *gin.Context) {
	var req pocSaveTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSuffix(strings.TrimSpace(req.Name), ".yaml")
	name = strings.TrimSuffix(name, ".yml")
	if !pocTemplateNameRe.MatchString(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模板名非法：仅允许字母数字开头，可含 _ . -，最长100字符"})
		return
	}
	if w := validateTemplate(req.Content); len(w) == 1 && strings.HasPrefix(w[0], "模板格式无效") {
		c.JSON(http.StatusBadRequest, gin.H{"error": w[0]})
		return
	}
	full := name + ".yaml"
	path := filepath.Join(h.templateDir, full)
	if err := os.WriteFile(path, []byte(req.Content), 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"name": full, "saved": true})
}

// DeleteTemplate 删除模板
func (h *PocForgeHandler) DeleteTemplate(c *gin.Context) {
	name := c.Param("name")
	path, err := h.safeTemplatePath(name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := os.Remove(path); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在或删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// safeTemplatePath 防路径穿越
func (h *PocForgeHandler) safeTemplatePath(name string) (string, error) {
	if strings.Contains(name, "..") || strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return "", fmt.Errorf("模板名非法")
	}
	if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
		name += ".yaml"
	}
	if !pocTemplateNameRe.MatchString(strings.TrimSuffix(strings.TrimSuffix(name, ".yaml"), ".yml")) {
		return "", fmt.Errorf("模板名非法")
	}
	return filepath.Join(h.templateDir, name), nil
}

// ==================== ③ 单目标自测 / 批量刷洞 ====================

type pocTestRequest struct {
	Template string `json:"template" binding:"required"`
	Target   string `json:"target" binding:"required"`
}

type pocBatchRequest struct {
	Template     string   `json:"template" binding:"required"`
	TemplateName string   `json:"template_name"`
	Targets      []string `json:"targets" binding:"required"`
	Concurrency  int      `json:"concurrency"`
}

// nucleiJSONLine nuclei -jsonl 输出行
type nucleiJSONLine struct {
	TemplateID   string `json:"template-id"`
	TemplatePath string `json:"template-path"`
	Info         struct {
		Name     string `json:"name"`
		Severity string `json:"severity"`
	} `json:"info"`
	Type             string   `json:"type"`
	Host             string   `json:"host"`
	MatchedAt        string   `json:"matched-at"`
	ExtractedResults []string `json:"extracted-results"`
	MatcherName      string   `json:"matcher-name"`
	CURLCommand      string   `json:"curl-command"`
	Timestamp        string   `json:"timestamp"`
}

// writeTempTemplate 写临时模板文件，返回路径与清理函数
func writeTempTemplate(content string) (string, func(), error) {
	tmpDir, err := os.MkdirTemp("", "pocforge-*")
	if err != nil {
		return "", nil, err
	}
	path := filepath.Join(tmpDir, "tpl.yaml")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		os.RemoveAll(tmpDir)
		return "", nil, err
	}
	return path, func() { os.RemoveAll(tmpDir) }, nil
}

// validateNucleiTemplate nuclei -validate 编译校验（不发请求）
func (h *PocForgeHandler) validateNucleiTemplate(tplPath string) (string, error) {
	if h.nucleiPath == "" {
		return "", fmt.Errorf("服务器未安装 nuclei（PATH / /usr/local/bin 均未找到）")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, h.nucleiPath, "-t", tplPath, "-validate", "-no-color", "-duc")
	var out, errB bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errB
	err := cmd.Run()
	if err != nil {
		msg := strings.TrimSpace(errB.String())
		if msg == "" {
			msg = strings.TrimSpace(out.String())
		}
		if len(msg) > 800 {
			msg = msg[len(msg)-800:]
		}
		return msg, fmt.Errorf("模板编译校验失败")
	}
	return "", nil
}

// runNucleiOnce 对单目标执行一次 nuclei，解析 -jsonl 命中行
func (h *PocForgeHandler) runNucleiOnce(ctx context.Context, tplPath, target string) ([]PocBatchResult, string, error) {
	if h.nucleiPath == "" {
		return nil, "", fmt.Errorf("服务器未安装 nuclei")
	}
	cctx, cancel := context.WithTimeout(ctx, pocTargetTimeout)
	defer cancel()
	args := []string{
		"-u", target,
		"-t", tplPath,
		"-jsonl", "-silent", "-no-color", "-duc", "-ni",
		"-timeout", "10", "-retries", "1",
	}
	cmd := exec.CommandContext(cctx, h.nucleiPath, args...)
	var out, errB bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errB
	if err := cmd.Run(); err != nil {
		// 有命中行但退出码非 0（如部分请求失败）仍解析结果
		if out.Len() == 0 {
			msg := strings.TrimSpace(errB.String())
			if len(msg) > 300 {
				msg = msg[len(msg)-300:]
			}
			if cctx.Err() == context.DeadlineExceeded {
				msg = "目标验证超时(" + pocTargetTimeout.String() + ") " + msg
			}
			return nil, msg, err
		}
	}
	var results []PocBatchResult
	sc := bufio.NewScanner(&out)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	now := time.Now()
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var jl nucleiJSONLine
		if err := json.Unmarshal([]byte(line), &jl); err != nil || jl.TemplateID == "" {
			continue
		}
		results = append(results, PocBatchResult{
			Target:      target,
			Status:      "hit",
			MatchedAt:   jl.MatchedAt,
			Extracted:   jl.ExtractedResults,
			CurlCommand: jl.CURLCommand,
			MatcherName: jl.MatcherName,
			At:          now,
		})
	}
	return results, "", nil
}

// Validate 仅编译校验模板（不发请求）
func (h *PocForgeHandler) Validate(c *gin.Context) {
	var req struct {
		Template string `json:"template" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if w := validateTemplate(req.Template); len(w) == 1 && strings.HasPrefix(w[0], "模板格式无效") {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": w[0]})
		return
	}
	tplPath, cleanup, err := writeTempTemplate(req.Template)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"valid": false, "error": err.Error()})
		return
	}
	defer cleanup()
	if msg, err := h.validateNucleiTemplate(tplPath); err != nil {
		c.JSON(http.StatusOK, gin.H{"valid": false, "error": err.Error(), "detail": msg})
		return
	}
	c.JSON(http.StatusOK, gin.H{"valid": true})
}

// Test 单目标自测（同步）
func (h *PocForgeHandler) Test(c *gin.Context) {
	var req pocTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target := strings.TrimSpace(req.Target)
	tplPath, cleanup, err := writeTempTemplate(req.Template)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "临时文件写入失败: " + err.Error()})
		return
	}
	defer cleanup()

	start := time.Now()
	if msg, err := h.validateNucleiTemplate(tplPath); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"hit": false, "error": err.Error(), "detail": msg, "duration_ms": time.Since(start).Milliseconds()})
		return
	}
	results, errMsg, runErr := h.runNucleiOnce(c.Request.Context(), tplPath, target)
	c.JSON(http.StatusOK, gin.H{
		"hit":         len(results) > 0,
		"results":     results,
		"error":       errMsg,
		"run_error":   runErrStr(runErr),
		"duration_ms": time.Since(start).Milliseconds(),
		"target":      target,
	})
}

func runErrStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// StartBatch 启动批量任务（异步）
func (h *PocForgeHandler) StartBatch(c *gin.Context) {
	var req pocBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 目标清洗去重
	seen := make(map[string]bool)
	targets := make([]string, 0, len(req.Targets))
	for _, t := range req.Targets {
		t = strings.TrimSpace(t)
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		targets = append(targets, t)
	}
	if len(targets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无有效目标"})
		return
	}
	if len(targets) > pocMaxTargets {
		targets = targets[:pocMaxTargets]
	}
	conc := req.Concurrency
	if conc < 1 {
		conc = 10
	}
	if conc > 30 {
		conc = 30
	}
	tplPath, cleanup, err := writeTempTemplate(req.Template)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "临时文件写入失败: " + err.Error()})
		return
	}
	if msg, err := h.validateNucleiTemplate(tplPath); err != nil {
		cleanup()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "detail": msg})
		return
	}

	// 过期任务清理
	h.gcTasks()

	idBytes := make([]byte, 8)
	_, _ = rand.Read(idBytes)
	id := hex.EncodeToString(idBytes)
	ctx, cancel := context.WithCancel(context.Background())
	task := &PocBatchTask{
		ID:           id,
		TemplateName: strings.TrimSpace(req.TemplateName),
		Status:       "running",
		Total:        len(targets),
		Concurrency:  conc,
		StartedAt:    time.Now(),
		cancel:       cancel,
	}
	h.mu.Lock()
	h.tasks[id] = task
	h.mu.Unlock()

	go h.runBatch(ctx, task, tplPath, targets, cleanup)

	c.JSON(http.StatusOK, gin.H{"task_id": id, "total": len(targets), "concurrency": conc})
}

// runBatch worker 池并发验证
func (h *PocForgeHandler) runBatch(ctx context.Context, task *PocBatchTask, tplPath string, targets []string, cleanup func()) {
	defer cleanup()
	sem := make(chan struct{}, task.Concurrency)
	var wg sync.WaitGroup
	for _, tgt := range targets {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		go func(t string) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()
			results, errMsg, err := h.runNucleiOnce(ctx, tplPath, t)
			h.mu.Lock()
			defer h.mu.Unlock()
			task.Done++
			switch {
			case len(results) > 0:
				task.Hits++
				task.Results = append(task.Results, results...)
			case err != nil:
				task.Errors++
				task.Results = append(task.Results, PocBatchResult{Target: t, Status: "error", Error: errMsg, At: time.Now()})
				if len(task.LogTail) < 200 {
					task.LogTail = append(task.LogTail, t+" :: "+errMsg)
				}
			default:
				task.Results = append(task.Results, PocBatchResult{Target: t, Status: "miss", At: time.Now()})
			}
		}(tgt)
	}
	wg.Wait()
	now := time.Now()
	h.mu.Lock()
	if ctx.Err() != nil {
		task.Status = "canceled"
	} else {
		task.Status = "done"
	}
	task.FinishedAt = &now
	h.mu.Unlock()
}

// GetBatch 查询任务
func (h *PocForgeHandler) GetBatch(c *gin.Context) {
	id := c.Param("id")
	h.mu.RLock()
	task, ok := h.tasks[id]
	h.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在（或已过期清理，任务结果保留1小时）"})
		return
	}
	h.mu.RLock()
	snapshot := PocBatchTask{
		ID: task.ID, TemplateName: task.TemplateName, Status: task.Status,
		Total: task.Total, Done: task.Done, Hits: task.Hits, Errors: task.Errors,
		Concurrency: task.Concurrency, StartedAt: task.StartedAt, FinishedAt: task.FinishedAt,
		Results: task.Results, LogTail: task.LogTail,
	}
	h.mu.RUnlock()
	c.JSON(http.StatusOK, snapshot)
}

// CancelBatch 取消任务
func (h *PocForgeHandler) CancelBatch(c *gin.Context) {
	id := c.Param("id")
	h.mu.RLock()
	task, ok := h.tasks[id]
	h.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}
	if task.cancel != nil {
		task.cancel()
	}
	c.JSON(http.StatusOK, gin.H{"canceling": true})
}

// gcTasks 清理过期任务
func (h *PocForgeHandler) gcTasks() {
	cutoff := time.Now().Add(-pocTaskTTL)
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, t := range h.tasks {
		if t.FinishedAt != nil && t.FinishedAt.Before(cutoff) {
			delete(h.tasks, id)
		}
	}
}
