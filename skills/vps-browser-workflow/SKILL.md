---
name: vps-browser-workflow
description: 使用用户安装的 MCP Chrome Extension 在 VPS Chrome 中读取页面结构、点击填写功能、捕获正常业务请求，并保留人工暂停、覆盖证据与能力缺口。适用于 mcp__chrome_mcp__ 工具已连接的浏览器任务。
---

# 浏览器功能发现与交接（VPS / 本地两种部署形态通用）

本技能适用于两种部署形态（工具集一致）：**vps-browser**（VPS 虚拟桌面 Chrome）与 **local-browser**（本机 Chrome）。按会话实际接入的服务名使用工具前缀。

**仅需要操作目标页面功能时使用本 MCP**：点击菜单/页签、填写表单、分页/排序/滚动、查看详情/预览、登录交接，或采集这些正常动作触发的请求。JS/源码、离线原包和证据分析、情报查询、路径/端口探测以及专项工具验证继续使用各自工具，不需要先调用浏览器状态；补正常功能请求或当前页面状态时再回到本流程。

ChanaAgent Harness 的工具前缀为 `mcp__chrome_mcp__*`；平台 Eino 入口的同一外部服务工具名形如 `vps-browser__chrome_click_element`。使用当前工具目录的对应名称和 schema，不混用两个入口的前缀。

先读 workflow-agent.md（仓库内 `vps-browser/server/workflow-agent.md`，标准部署路径 `/opt/chana-vps-browser/workflow-agent.md`）；使用实际工具目录，不套最新版参数。

1. `mcp__chrome_mcp__vps_browser_status` 检查状态；manual 时暂停，用户完成并明确交接后 resume。
2. `get_windows_and_tabs` 确认浏览器来源与活跃页。`chrome_page_snapshot` 读取结构和 ref，`chrome_get_interactive_elements` 找文字/选择器；当前页面工具主要作用于活跃标签；iframe 内元素用带 frameId 的 selector 或带 frame 的 ref 点击（坐标点击仅顶层，2026-10-13 实测）。
3. 每个可达模块按正常业务动作点击、填表、查询、筛选、分页、排序、详情和预览。用 `chrome_click_element`、`chrome_fill_or_select`、`chrome_keyboard`；切页后重新读取 ref。详见 [功能操作与动态接口发现](references/function-discovery.md)。
4. 动作前开始 `chrome_network_debugger_start`，正常动作后停止并保存实际结果。动作后分别核对预期 UI 变化与可归因的正常业务请求；纯客户端/缓存行为记 `ui_only`，抓包失败或归因不明记 `inconclusive`。缺失、截断或只有列表元数据时记录抓包缺口；不能编造请求、头或响应，也不能把工具 success 当功能成功。
5. JS/路径候选、功能动作和真实请求互相核对，维护当前项目 `recon/function-coverage.json` 和 `recon/workflow.json`，通过 D0/D1 后再进入授权验证。
6. 共享浏览器只由一个任务操作；先保存本轮证据再交接。人工切入时停止；超时后核对是否已发送，禁止自动重发写请求。

`chrome_network_request` 不能替代完整原包重放；文件/协议字节、独立多账号隔离和 iframe 特例需按实际能力留缺口。工具 success 不能代替 UI 生效和正常请求证据。截图路径由浏览器用户可写范围决定，不能因为 Harness root 可写就认定 MCP 可写。
