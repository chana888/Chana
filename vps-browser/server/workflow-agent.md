# VPS Chrome 与 MCP Chrome Extension

**仅需要操作目标页面功能时使用本 MCP**：点击菜单/页签、填写表单、分页/排序/滚动、查看详情/预览、登录交接，或采集这些正常动作触发的请求。JS/源码、离线原包和证据分析、情报查询、路径/端口探测以及专项工具验证继续使用各自工具，不需要先调用浏览器状态；补正常功能请求或当前页面状态时再回到本流程。

ChanaAgent Harness 的工具前缀为 `mcp__chrome_mcp__*`；平台 Eino 入口的同一外部服务工具名形如 `vps-browser__chrome_click_element`。使用当前工具目录的对应名称和 schema，不混用两个入口的前缀。

需要目标功能交互时使用的浏览器工具为 `mcp__chrome_mcp__*`。当前使用用户已经安装的 MCP Chrome Extension 0.0.19，原生桥接为 `127.0.0.1:12306/mcp`；Agent 通过保留人工暂停与鉴权的 `127.0.0.1:18862/mcp` 接入，不直接绕过接入层。

- 先调用 `vps_browser_status` 检查连接和人工状态。`manual` 时停止读取、点击和抓包；用户在远程浏览器完成登录并明确交接后调用 `vps_browser_control(action="resume")`。
- `get_windows_and_tabs` 读取窗口和当前活跃标签。0.0.19 的页面操作主要作用于当前活跃页，不得假设支持最新版任意 `tabId/frameId` 参数。必要时 `chrome_switch_tab` 选择有真实 ID 的页；没有 ID 时按已知入口 `chrome_navigate` 选择现有标签，并核对返回 URL，不能导航用户无关页面。
- 读结构用 `chrome_page_snapshot`，找控件用 `chrome_get_interactive_elements`；点击用 `chrome_click_element`，填表/选择用 `chrome_fill_or_select`，键盘用 `chrome_keyboard`。快照 `ref` 会过期，切页或 DOM 更新后重新读取。
- 点击后分别核对预期 UI 变化和增量正常业务请求。纯客户端/缓存行为标记 `ui_only`；请求缺失、抓包失败或归因不明标记 `inconclusive`，不能把工具 success 当功能生效，也不能把无请求当作漏洞验证成功。iframe（2026-10-13 实测，扩展补丁 iframe-docref-20261012）：内容在子 frame 时，点击用带 frameId 的 CSS selector 或带 frame 的 ref，两者实测可用；useCDP+coordinates 坐标点击不支持 iframe 内元素（仅顶层）。frameId 以当前 tab 快照实测为准、跨标签不复用；外层选择器未命中先查子 frame，不得断言功能不存在；仍禁止猜坐标或直接调 Vue 方法后计为正常点击。
- 必须使用坐标时，只用最近实际测得的 viewport 坐标；当前 `chrome_click_element` 支持 `coordinates` 与 `useCDP`。截图坐标缩放必须核实，当前模型不支持读图时不得凭截图猜坐标。
- 网络正文捕获用 `chrome_network_debugger_start` → 正常 UI 动作 → `chrome_network_debugger_stop`；轻量请求捕获用 `chrome_network_capture_start/stop`。开始前明确当前页，停止后检查实际 URL、方法、请求头、正文和响应是否可用、是否截断。缺失字段如实保留，不伪装原始包。
- 完整流程仍为 D0 逐文件 JS/路径/功能/正常请求收集 → D1 风险假设 → D2 分工验证 → D3 复核与学习。JS 先离线提取，再由 AI 解释调用链和排序候选，最后用浏览器正常功能确认；没有真实业务请求不准拼造接口或认证头。采用短首轮（小站 4-6 分钟、中型 SPA 6-10 分钟）和 3-5 分钟增量轮，连续一轮无新增才转验证，未覆盖项记为缺口。
- `chrome_network_request` 不是 Burp 原包重放。只有本次明确授权验证、真实捕获请求和风险假设齐备时才允许按实际能力验证；副作用请求不得自动重发，不能自动构造 Authorization、租户、签名或绕过人工暂停。
- 截图使用 `chrome_screenshot`；需要图像输出可用 `storeBase64=true,savePng=false`，避免直接写 root 专属项目目录。证据保存到浏览器可写的受限中转目录，再按实际项目交接。
- 多个 Agent 共用 Chrome；同一时间只有一个任务操作页面，其他任务处理已保存证据。用户打开远程浏览器会进入人工暂停。重连只重建 MCP 连接，不解除暂停、不重启 Chrome、不自动重试写操作。
- 0.0.19 没有 `chrome_read_page`、`chrome_computer`、`chrome_javascript`；旧 Blueprint 的 `browser_*`、`vps_network_requests`、`vps_request_replay/export` 已退役，不得调用。只有当前工具目录可作为能力依据。
- 实测操作纪律（2026-10-13 两轮真实目标验证）：首读为空≠失败——新标签/详情页/懒加载区块异步渲染，等 3-5 秒重读一次再下结论（实测 OA 详情首读空、重读完整）；层级判定不能只看 URL——左侧分类导航常纯客户端切换（URL 不变），以快照内容变化为准，SPA hash 明文参数（wid/name 等）是稳定回访定位符；selector 偶发时序竞态重试一次即好，两次失败才记 inconclusive；`[role=tab][aria-selected=true]` 之类全局选择器只命中第一个 tablist，需限定容器。
