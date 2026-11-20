package app

// 平台作业面 MCP 工具（2026-10-06 二开）
//
// 背景：dsh（DeepSeek Harness）取代 Hermes 作为平台 agent 后，需要能直接驱动
// chana平台的项目管理 / 资产导入 / PoC 工厂；原有内置工具只覆盖了漏洞与单条资产，
// 项目 CRUD、批量资产导入、PoC 生成这三块只在 Web REST 层存在。
// 本文件把这些能力补成 MCP 工具，供 mcp__drt__* 直接调用。
//
// 新增工具必须同步三处，否则 mcpToolAuthorizer 的 default 分支会改变安全语义：
//   1) internal/mcp/builtin/constants.go  （常量 + IsBuiltinTool + GetAllBuiltinTools）
//   2) internal/app/mcp_authorization.go  （case 授权策略）
//   3) 本文件 + internal/app/app.go 的注册点

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"chana/internal/authctx"
	"chana/internal/database"
	"chana/internal/handler"
	"chana/internal/mcp"
	"chana/internal/mcp/builtin"

	"go.uber.org/zap"
)

// platformAssetImportBatchMax 单次 import_assets 上限（平台硬上限为 100000）
const platformAssetImportBatchMax = 50000

// dshWorkspaceTag dsh 复用会话的标题前缀（bind_project_workspace 用它找回旧会话）
const dshWorkspaceTag = "[dsh]"

func platformPrincipal(ctx context.Context) (authctx.Principal, error) {
	p, ok := authctx.PrincipalFromContext(ctx)
	if !ok {
		return authctx.Principal{}, fmt.Errorf("missing authenticated principal")
	}
	return p, nil
}

// registerPlatformTools 注册「平台作业面」工具：项目 CRUD / 批量资产导入 /
// PoC 工厂 / 会话工作区绑定。
func registerPlatformTools(mcpServer *mcp.Server, db *database.DB, pocForge *handler.PocForgeHandler, logger *zap.Logger) {
	if mcpServer == nil || db == nil {
		if logger != nil {
			logger.Warn("平台作业面 MCP 工具未注册（mcpServer 或 db 为空）")
		}
		return
	}
	registerProjectCRUDTools(mcpServer, db, logger)
	registerAssetImportTool(mcpServer, db, logger)
	registerPocForgeTools(mcpServer, db, pocForge, logger)
	registerWorkspaceBindTool(mcpServer, db, logger)
	if logger != nil {
		logger.Info("平台作业面 MCP 工具注册成功", zap.Strings("tools", []string{
			builtin.ToolListProjects, builtin.ToolGetProject, builtin.ToolCreateProject,
			builtin.ToolUpdateProject, builtin.ToolDeleteProject, builtin.ToolImportAssets,
			builtin.ToolGeneratePoc, builtin.ToolListPocTemplates, builtin.ToolSavePocTemplate,
			builtin.ToolBindProjectWorkspace,
		}))
	}
}

// ---------------------------------------------------------------------------
// 项目管理
// ---------------------------------------------------------------------------

func registerProjectCRUDTools(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	registerListProjectsTool(mcpServer, db, logger)
	registerGetProjectTool(mcpServer, db, logger)
	registerCreateProjectTool(mcpServer, db, logger)
	registerUpdateProjectTool(mcpServer, db, logger)
	registerDeleteProjectTool(mcpServer, db, logger)
}

func registerListProjectsTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolListProjects,
		Description:      "列出平台上的渗透项目。项目是资产、漏洞、PoC 的归属容器：先用本工具拿到 project_id，再做资产导入、会话绑定与漏洞归档。",
		ShortDescription: "列出渗透项目",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"search": map[string]interface{}{"type": "string", "description": "按名称/描述关键词搜索"},
				"status": map[string]interface{}{"type": "string", "description": "按状态筛选（如 active、archived、completed）"},
				"limit":  map[string]interface{}{"type": "integer", "description": "返回条数上限，默认 50，最大 200"},
				"offset": map[string]interface{}{"type": "integer", "description": "分页偏移，默认 0"},
			},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		principal, err := platformPrincipal(ctx)
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		limit := intArg(args, "limit", 50)
		if limit <= 0 || limit > 200 {
			limit = 50
		}
		offset := intArg(args, "offset", 0)
		if offset < 0 {
			offset = 0
		}
		projects, err := db.ListProjectsForAccess(
			strings.TrimSpace(strArg(args, "status")),
			strings.TrimSpace(strArg(args, "search")),
			limit, offset, principal.UserID, principal.ScopeFor("project:read"))
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		var b strings.Builder
		b.WriteString(fmt.Sprintf("项目数: %d (limit=%d offset=%d)\n\n", len(projects), limit, offset))
		if len(projects) == 0 {
			b.WriteString("（暂无项目，可用 create_project 新建）\n")
		}
		for _, p := range projects {
			b.WriteString(fmt.Sprintf("- id=%s | %s | status=%s", p.ID, p.Name, p.Status))
			if p.Description != "" {
				b.WriteString(" | " + truncateRunes(strings.ReplaceAll(p.Description, "\n", " "), 100))
			}
			b.WriteString("\n")
		}
		b.WriteString("\n下一步：import_assets 导入资产 / bind_project_workspace 绑定会话后记录漏洞。")
		return textResult(b.String(), false), nil
	})
}

func registerGetProjectTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolGetProject,
		Description:      "读取单个渗透项目的完整信息（含 scope 范围定义 JSON）。",
		ShortDescription: "读取项目详情",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "string", "description": "项目 ID（必需）"},
			},
			"required": []string{"id"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		id := strings.TrimSpace(strArg(args, "id"))
		if id == "" {
			return textResult("错误: id 必填", true), nil
		}
		p, err := db.GetProject(id)
		if err != nil {
			return textResult("错误: 项目不存在或读取失败: "+err.Error(), true), nil
		}
		var b strings.Builder
		b.WriteString(fmt.Sprintf("项目ID: %s\n名称: %s\n状态: %s\n", p.ID, p.Name, p.Status))
		if p.Description != "" {
			b.WriteString("描述: " + p.Description + "\n")
		}
		if p.ScopeJSON != "" {
			b.WriteString("授权范围(ScopeJSON): " + p.ScopeJSON + "\n")
		}
		b.WriteString(fmt.Sprintf("固定(Pinned): %v\n", p.Pinned))
		if !p.CreatedAt.IsZero() {
			b.WriteString("创建时间: " + p.CreatedAt.Format("2006-01-02 15:04:05") + "\n")
		}
		return textResult(b.String(), false), nil
	})
}

func registerCreateProjectTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolCreateProject,
		Description:      "创建渗透项目。开始一次新的授权测试时先建项目，后续资产、会话、漏洞、PoC 都归属到它。",
		ShortDescription: "创建渗透项目",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"name":        map[string]interface{}{"type": "string", "description": "项目名称（必需）"},
				"description": map[string]interface{}{"type": "string", "description": "项目描述：目标背景、授权来源、测试范围概要"},
				"scope_json":  map[string]interface{}{"type": "string", "description": "授权范围定义（JSON 字符串），如 {\"domains\":[\"a.example.com\"]}"},
				"status":      map[string]interface{}{"type": "string", "description": "状态，默认 active"},
			},
			"required": []string{"name"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		principal, err := platformPrincipal(ctx)
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		name := strings.TrimSpace(strArg(args, "name"))
		if name == "" {
			return textResult("错误: name 必填", true), nil
		}
		status := strings.TrimSpace(strArg(args, "status"))
		if status == "" {
			status = "active"
		}
		p := &database.Project{
			Name:        name,
			Description: strings.TrimSpace(strArg(args, "description")),
			ScopeJSON:   strings.TrimSpace(strArg(args, "scope_json")),
			Status:      status,
		}
		created, err := db.CreateProject(p)
		if err != nil {
			return textResult("错误: 创建项目失败: "+err.Error(), true), nil
		}
		if principal.UserID != "" {
			_ = db.SetResourceOwner("project", created.ID, principal.UserID)
			_ = db.AssignResourceToUser(principal.UserID, "project", created.ID)
		}
		return textResult(fmt.Sprintf("项目已创建\nid=%s\n名称: %s\n状态: %s\n\n下一步：import_assets 导入资产，bind_project_workspace 绑定会话。",
			created.ID, created.Name, created.Status), false), nil
	})
}

func registerUpdateProjectTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolUpdateProject,
		Description:      "更新渗透项目（仅覆盖显式传入的字段，未传字段保持不变）。",
		ShortDescription: "更新项目",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id":          map[string]interface{}{"type": "string", "description": "项目 ID（必需）"},
				"name":        map[string]interface{}{"type": "string", "description": "新名称"},
				"description": map[string]interface{}{"type": "string", "description": "新描述"},
				"scope_json":  map[string]interface{}{"type": "string", "description": "新的授权范围 JSON"},
				"status":      map[string]interface{}{"type": "string", "description": "新状态"},
				"pinned":      map[string]interface{}{"type": "boolean", "description": "是否置顶"},
			},
			"required": []string{"id"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		id := strings.TrimSpace(strArg(args, "id"))
		if id == "" {
			return textResult("错误: id 必填", true), nil
		}
		p, err := db.GetProject(id)
		if err != nil {
			return textResult("错误: 项目不存在: "+err.Error(), true), nil
		}
		changed := []string{}
		if v, ok := args["name"].(string); ok && strings.TrimSpace(v) != "" {
			p.Name = strings.TrimSpace(v)
			changed = append(changed, "name")
		}
		if v, ok := args["description"].(string); ok {
			p.Description = strings.TrimSpace(v)
			changed = append(changed, "description")
		}
		if v, ok := args["scope_json"].(string); ok {
			p.ScopeJSON = strings.TrimSpace(v)
			changed = append(changed, "scope_json")
		}
		if v, ok := args["status"].(string); ok && strings.TrimSpace(v) != "" {
			p.Status = strings.TrimSpace(v)
			changed = append(changed, "status")
		}
		if v, ok := args["pinned"].(bool); ok {
			p.Pinned = v
			changed = append(changed, "pinned")
		}
		if len(changed) == 0 {
			return textResult("未提供任何可更新字段（name/description/scope_json/status/pinned）", true), nil
		}
		if err := db.UpdateProject(p); err != nil {
			return textResult("错误: 更新失败: "+err.Error(), true), nil
		}
		return textResult(fmt.Sprintf("项目 %s 已更新，字段: %s", p.ID, strings.Join(changed, ", ")), false), nil
	})
}

func registerDeleteProjectTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolDeleteProject,
		Description:      "删除渗透项目。不可逆：仅在用户明确要求删除某个项目时调用。",
		ShortDescription: "删除项目（不可逆）",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "string", "description": "项目 ID（必需）"},
			},
			"required": []string{"id"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		id := strings.TrimSpace(strArg(args, "id"))
		if id == "" {
			return textResult("错误: id 必填", true), nil
		}
		if _, err := db.GetProject(id); err != nil {
			return textResult("错误: 项目不存在: "+err.Error(), true), nil
		}
		if err := db.DeleteProject(id); err != nil {
			return textResult("错误: 删除失败: "+err.Error(), true), nil
		}
		if logger != nil {
			logger.Warn("项目已通过 MCP 删除", zap.String("project_id", id))
		}
		return textResult("项目已删除: "+id, false), nil
	})
}

// ---------------------------------------------------------------------------
// 批量资产导入
// ---------------------------------------------------------------------------

func registerAssetImportTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name: builtin.ToolImportAssets,
		Description: "批量导入资产到资产库（FOFA/测绘结果、子域名清单、端口扫描结果）。" +
			"去重键 = domain|port|protocol，domain 为空则退 ip，再退 host；已存在的资产会被更新而不是重复插入。" +
			"单次上限 50000 条，超过请分批调用。字段名与 /api/assets/import 一致。",
		ShortDescription: "批量导入资产",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"project_id": map[string]interface{}{"type": "string", "description": "归属项目 ID（强烈建议传，便于按项目聚合）"},
				"source":     map[string]interface{}{"type": "string", "description": "来源标记，如 fofa、hunter、quake、manual"},
				"source_query": map[string]interface{}{
					"type": "string", "description": "来源查询语句或批次说明"},
				"assets": map[string]interface{}{
					"type":        "array",
					"description": "资产数组。每项支持 host/ip/port/protocol/domain/title/server/country/province/city/tags/status/criticality/business_system/environment 等字段；至少要有 host 或 ip。",
					"items": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"host":     map[string]interface{}{"type": "string", "description": "原始 host（可含 scheme/端口）"},
							"ip":       map[string]interface{}{"type": "string", "description": "IP 地址"},
							"port":     map[string]interface{}{"type": "integer", "description": "端口，0-65535"},
							"protocol": map[string]interface{}{"type": "string", "description": "协议，小写，如 http、https、ssh、rdp"},
							"domain":   map[string]interface{}{"type": "string", "description": "域名（必须是合法域名，填 eTLD+1 会导致误合并）"},
							"title":    map[string]interface{}{"type": "string", "description": "页面标题"},
							"server":   map[string]interface{}{"type": "string", "description": "指纹/中间件信息"},
							"country":  map[string]interface{}{"type": "string", "description": "国家"},
							"tags":     map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}, "description": "标签，最多 30 个"},
							"status":   map[string]interface{}{"type": "string", "description": "状态，默认 active"},
						},
					},
				},
			},
			"required": []string{"assets"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		principal, err := platformPrincipal(ctx)
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		rawAssets, ok := args["assets"]
		if !ok {
			return textResult("错误: assets 必填", true), nil
		}
		encoded, err := json.Marshal(rawAssets)
		if err != nil {
			return textResult("错误: assets 序列化失败: "+err.Error(), true), nil
		}
		var assets []*database.Asset
		if err := json.Unmarshal(encoded, &assets); err != nil {
			return textResult("错误: assets 格式非法（应为对象数组）: "+err.Error(), true), nil
		}
		if len(assets) == 0 {
			return textResult("错误: assets 为空数组", true), nil
		}
		if len(assets) > platformAssetImportBatchMax {
			return textResult(fmt.Sprintf("错误: 单次最多 %d 条，当前 %d 条，请分批调用", platformAssetImportBatchMax, len(assets)), true), nil
		}

		projectID := strings.TrimSpace(strArg(args, "project_id"))
		source := strings.TrimSpace(strArg(args, "source"))
		sourceQuery := strings.TrimSpace(strArg(args, "source_query"))
		invalid := make([]string, 0)
		for i, a := range assets {
			if a == nil {
				invalid = append(invalid, fmt.Sprintf("#%d 空对象", i))
				continue
			}
			if projectID != "" && strings.TrimSpace(a.ProjectID) == "" {
				a.ProjectID = projectID
			}
			if source != "" && strings.TrimSpace(a.Source) == "" {
				a.Source = source
			}
			if sourceQuery != "" && strings.TrimSpace(a.SourceQuery) == "" {
				a.SourceQuery = sourceQuery
			}
			if strings.TrimSpace(a.Status) == "" {
				a.Status = "active"
			}
			if strings.TrimSpace(a.Host) == "" && strings.TrimSpace(a.IP) == "" {
				invalid = append(invalid, fmt.Sprintf("#%d 缺 host/ip", i))
			}
		}
		if len(invalid) > 0 {
			show := invalid
			if len(show) > 10 {
				show = show[:10]
			}
			return textResult(fmt.Sprintf("错误: %d 条资产不合法（至少需要 host 或 ip），未导入任何数据。示例: %s",
				len(invalid), strings.Join(show, "; ")), true), nil
		}

		allowGlobal := principal.ScopeFor("asset:write") == database.RBACScopeAll
		result, err := db.UpsertAssets(assets, principal.UserID, allowGlobal)
		if err != nil {
			return textResult("错误: 导入失败（整批事务回滚）: "+err.Error(), true), nil
		}
		return textResult(fmt.Sprintf("资产导入完成\n提交: %d 条\n新增: %d\n更新: %d\n跳过: %d\n归属项目: %s",
			len(assets), result.Created, result.Updated, result.Skipped,
			orDash(projectID)), false), nil
	})
}

// ---------------------------------------------------------------------------
// POC 工厂
// ---------------------------------------------------------------------------

func registerPocForgeTools(mcpServer *mcp.Server, db *database.DB, pocForge *handler.PocForgeHandler, logger *zap.Logger) {
	registerGeneratePocTool(mcpServer, db, pocForge, logger)
	registerListPocTemplatesTool(mcpServer, pocForge, logger)
	registerSavePocTemplateTool(mcpServer, pocForge, logger)
}

func registerGeneratePocTool(mcpServer *mcp.Server, db *database.DB, pocForge *handler.PocForgeHandler, logger *zap.Logger) {
	tool := mcp.Tool{
		Name: builtin.ToolGeneratePoc,
		Description: "由漏洞信息生成 nuclei v3 检测模板（PoC）。" +
			"最省事的方式是只传 vulnerability_id，工具会自动从漏洞记录里取标题/等级/证据；" +
			"也可以直接传 title + evidence。生成后可 save_poc_template 存库，供批量验证使用。",
		ShortDescription: "生成 nuclei PoC 模板",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"vulnerability_id": map[string]interface{}{"type": "string", "description": "漏洞 ID：从漏洞记录自动提取证据（推荐）"},
				"title":            map[string]interface{}{"type": "string", "description": "漏洞标题（未传 vulnerability_id 时必填）"},
				"evidence":         map[string]interface{}{"type": "string", "description": "漏洞证据：原始请求/响应、利用过程、回显（未传 vulnerability_id 时必填）"},
				"severity":         map[string]interface{}{"type": "string", "description": "严重等级 critical/high/medium/low/info", "enum": []string{"critical", "high", "medium", "low", "info"}},
				"extra":            map[string]interface{}{"type": "string", "description": "补充要求，如指定路径、匹配特征、避免误报的约束"},
				"save_as":          map[string]interface{}{"type": "string", "description": "可选：生成后直接以此名保存到模板库（不含扩展名）"},
			},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		if pocForge == nil {
			return textResult("错误: PoC 工厂未启用（缺少 LLM 配置）", true), nil
		}
		title := strings.TrimSpace(strArg(args, "title"))
		evidence := strings.TrimSpace(strArg(args, "evidence"))
		severity := strings.TrimSpace(strArg(args, "severity"))
		origin := ""

		if vid := strings.TrimSpace(strArg(args, "vulnerability_id")); vid != "" {
			v, err := db.GetVulnerability(vid)
			if err != nil {
				return textResult("错误: 漏洞不存在或读取失败: "+err.Error(), true), nil
			}
			if title == "" {
				title = v.Title
			}
			if severity == "" {
				severity = v.Severity
			}
			if evidence == "" {
				evidence = vulnerabilityEvidenceText(v)
			}
			origin = fmt.Sprintf("漏洞 %s（%s）", v.ID, v.Title)
		}
		if title == "" || evidence == "" {
			return textResult("错误: 需要提供 vulnerability_id，或同时提供 title 与 evidence", true), nil
		}

		tpl, warnings, err := pocForge.GenerateTemplate(ctx, title, severity, evidence, strArg(args, "extra"))
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		fatal := false
		var b strings.Builder
		if origin != "" {
			b.WriteString("来源: " + origin + "\n")
		}
		b.WriteString("等级: " + handler.NormalizePocSeverity(severity) + "\n")
		if len(warnings) > 0 {
			b.WriteString("校验提示: " + strings.Join(warnings, "；") + "\n")
			if len(warnings) == 1 && strings.HasPrefix(warnings[0], "模板格式无效") {
				fatal = true
			}
		} else {
			b.WriteString("校验: 通过\n")
		}
		b.WriteString("\n--- nuclei 模板 ---\n" + tpl + "\n")

		if saveAs := strings.TrimSpace(strArg(args, "save_as")); saveAs != "" && !fatal {
			name, err := pocForge.SaveTemplateContent(saveAs, tpl)
			if err != nil {
				b.WriteString("\n保存模板库失败: " + err.Error() + "\n")
			} else {
				b.WriteString("\n已保存到模板库: " + name + "\n")
				if logger != nil {
					logger.Info("MCP 生成并保存 PoC 模板", zap.String("name", name))
				}
			}
		} else if !fatal {
			b.WriteString("\n如需留存，调用 save_poc_template(name, content) 存库。\n")
		}
		return textResult(b.String(), fatal), nil
	})
}

func registerListPocTemplatesTool(mcpServer *mcp.Server, pocForge *handler.PocForgeHandler, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolListPocTemplates,
		Description:      "列出 PoC 模板库中已有的 nuclei 模板（按修改时间倒序），用于复用而不是重复生成。",
		ShortDescription: "列出 PoC 模板库",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"keyword": map[string]interface{}{"type": "string", "description": "按模板名/摘要关键词过滤"},
				"limit":   map[string]interface{}{"type": "integer", "description": "返回条数上限，默认 50，最大 200"},
			},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		if pocForge == nil {
			return textResult("错误: PoC 工厂未启用", true), nil
		}
		items, err := pocForge.ListTemplateInfos()
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		keyword := strings.ToLower(strings.TrimSpace(strArg(args, "keyword")))
		limit := intArg(args, "limit", 50)
		if limit <= 0 || limit > 200 {
			limit = 50
		}
		var b strings.Builder
		b.WriteString(fmt.Sprintf("模板目录: %s\n", pocForge.TemplateDir()))
		shown := 0
		for _, it := range items {
			if keyword != "" && !strings.Contains(strings.ToLower(it.Name+" "+it.Summary), keyword) {
				continue
			}
			if shown >= limit {
				break
			}
			shown++
			b.WriteString(fmt.Sprintf("- %s | %d B | %s", it.Name, it.Size, it.ModifiedAt.Format("2006-01-02 15:04")))
			if it.Summary != "" {
				b.WriteString(" | " + truncateRunes(strings.ReplaceAll(it.Summary, "\n", " "), 120))
			}
			b.WriteString("\n")
		}
		if shown == 0 {
			b.WriteString("（无匹配模板）\n")
		}
		b.WriteString(fmt.Sprintf("\n共 %d 个模板，命中 %d 个。", len(items), shown))
		return textResult(b.String(), false), nil
	})
}

func registerSavePocTemplateTool(mcpServer *mcp.Server, pocForge *handler.PocForgeHandler, logger *zap.Logger) {
	tool := mcp.Tool{
		Name:             builtin.ToolSavePocTemplate,
		Description:      "把 nuclei 模板保存到平台模板库（落盘到模板目录，供批量验证与后续复用）。同名会覆盖。",
		ShortDescription: "保存 PoC 模板到库",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"name":    map[string]interface{}{"type": "string", "description": "模板名（不含扩展名，字母数字开头，可含 _ . -）"},
				"content": map[string]interface{}{"type": "string", "description": "nuclei YAML 全文（必需）"},
			},
			"required": []string{"name", "content"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		if pocForge == nil {
			return textResult("错误: PoC 工厂未启用", true), nil
		}
		name := strings.TrimSpace(strArg(args, "name"))
		content := strArg(args, "content")
		if name == "" || strings.TrimSpace(content) == "" {
			return textResult("错误: name 与 content 必填", true), nil
		}
		full, err := pocForge.SaveTemplateContent(name, content)
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		if logger != nil {
			logger.Info("MCP 保存 PoC 模板", zap.String("name", full))
		}
		return textResult("已保存: "+full, false), nil
	})
}

// ---------------------------------------------------------------------------
// 会话工作区绑定
// ---------------------------------------------------------------------------

func registerWorkspaceBindTool(mcpServer *mcp.Server, db *database.DB, logger *zap.Logger) {
	tool := mcp.Tool{
		Name: builtin.ToolBindProjectWorkspace,
		Description: "把当前作业会话绑定到某个渗透项目，返回 conversation_id。" +
			"record_vulnerability / list_vulnerabilities 需要会话或项目上下文才能工作：" +
			"调用本工具拿到 conversation_id 后，在这两个工具里显式传入即可按项目归档与查询漏洞。" +
			"同一项目会复用已存在的 [dsh] 会话，不会每次新建。",
		ShortDescription: "绑定项目工作区（返回 conversation_id）",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"project_id": map[string]interface{}{"type": "string", "description": "要绑定的项目 ID（必需）"},
				"title":      map[string]interface{}{"type": "string", "description": "可选：新建会话时的标题"},
				"reuse":      map[string]interface{}{"type": "boolean", "description": "是否复用已有 [dsh] 会话，默认 true"},
			},
			"required": []string{"project_id"},
		},
	}
	mcpServer.RegisterTool(tool, func(ctx context.Context, args map[string]interface{}) (*mcp.ToolResult, error) {
		principal, err := platformPrincipal(ctx)
		if err != nil {
			return textResult("错误: "+err.Error(), true), nil
		}
		projectID := strings.TrimSpace(strArg(args, "project_id"))
		if projectID == "" {
			return textResult("错误: project_id 必填", true), nil
		}
		proj, err := db.GetProject(projectID)
		if err != nil {
			return textResult("错误: 项目不存在: "+err.Error(), true), nil
		}

		reuse := true
		if v, ok := args["reuse"].(bool); ok {
			reuse = v
		}
		if reuse {
			convs, err := db.ListConversationsForAccess(100, 0, "", "", projectID, principal.UserID, principal.ScopeFor("chat:read"))
			if err == nil {
				for _, c := range convs {
					if c != nil && strings.HasPrefix(strings.TrimSpace(c.Title), dshWorkspaceTag) {
						return textResult(fmt.Sprintf("已复用工作区会话\nproject_id=%s (%s)\nconversation_id=%s\n标题: %s\n\n记录漏洞时请带上 conversation_id=%s。",
							projectID, proj.Name, c.ID, c.Title, c.ID), false), nil
					}
				}
			} else if logger != nil {
				logger.Debug("工作区会话查询失败，改为新建", zap.Error(err))
			}
		}

		title := strings.TrimSpace(strArg(args, "title"))
		if title == "" {
			title = fmt.Sprintf("%s %s", dshWorkspaceTag, proj.Name)
		}
		conv, err := db.CreateConversation(title, database.ConversationCreateMeta{ProjectID: projectID})
		if err != nil {
			return textResult("错误: 创建工作区会话失败: "+err.Error(), true), nil
		}
		if principal.UserID != "" {
			_ = db.SetResourceOwner("conversation", conv.ID, principal.UserID)
			_ = db.AssignResourceToUser(principal.UserID, "conversation", conv.ID)
		}
		return textResult(fmt.Sprintf("已新建工作区会话\nproject_id=%s (%s)\nconversation_id=%s\n标题: %s\n\n记录漏洞时请带上 conversation_id=%s。",
			projectID, proj.Name, conv.ID, conv.Title, conv.ID), false), nil
	})
}

// ---------------------------------------------------------------------------

// vulnerabilityEvidenceText 把漏洞记录拼成 PoC 生成所需的证据文本（与前端
// vulnPocEvidence 的口径保持一致，保证网页端与 agent 端生成的模板质量一致）。
func vulnerabilityEvidenceText(v *database.Vulnerability) string {
	if v == nil {
		return ""
	}
	lines := make([]string, 0, 12)
	add := func(k, val string) {
		if val = strings.TrimSpace(val); val != "" {
			lines = append(lines, k+"："+val)
		}
	}
	add("漏洞标题", v.Title)
	add("漏洞类型", v.Type)
	add("影响资产", v.Target)
	add("危害等级", v.Severity)
	add("前置条件", v.Preconditions)
	add("复现步骤", v.ReproSteps)
	add("影响说明", v.Impact)
	if ev := strings.TrimSpace(v.Evidence); ev != "" {
		if len(lines) > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, "漏洞证据（原始请求/响应/回显，构造模板的唯一依据）：")
		lines = append(lines, ev)
	}
	return strings.Join(lines, "\n")
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "(未指定)"
	}
	return s
}
