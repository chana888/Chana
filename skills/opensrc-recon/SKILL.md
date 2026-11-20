---
name: opensrc-recon
description: 开源版资产探测与网络请求铁律。AI 做资产发现用 a_scan.py; 所有 curl/网络请求默认 60 秒超时, 大任务异步执行。
---

# opensrc-recon — 资产探测与请求铁律(开源版)

## 资产探测(替代 Des_workflow A 线)
平台已移除 Des_workflow A/B 线, 资产发现使用内置精简工具:

### a_scan.py(一键 A 线精简版)
位置: `tools/opensrc/a_scan.py`(依赖同目录 fscan 二进制)

```
python tools/opensrc/a_scan.py --target <IP/域名/CIDR>
python tools/opensrc/a_scan.py --target <目标> --ports "80,443,8080"
python tools/opensrc/a_scan.py --target <目标> --spray-only   # 只做路由探测
```

三阶段:
1. 端口扫描: fscan 默认常用端口(1000 常用子集), 不爆破不扫 ping
2. Web 识别: 对 http 服务取 status/title/长度 + 指纹(nginx/tomcat/spring/shiro 等)
3. 路由探测: 常见路由字典(~50 路径: /admin /api /swagger /actuator /druid 等)

输出: 资产清单写 `a_scan_result_<目标>.txt`, 包含端口/服务/URL/指纹/路由。

### 规则
- 先理解目标功能与范围；D0 可主动探资产，运行 a_scan 前按本轮依据设置端口/路径、速率、预算和停止条件，不默认扫描全部端口。
- 路由命中需比较正文、随机不存在路径基线和跳转，不把 200/301 当作真实敏感端点。
- 403 记录鉴权/链路现象；相关验证进入 D1 后才执行，不自动触发绕过。

## 网络请求铁律(所有 AI 发起的网络请求)
1. **默认 60 秒超时**: 所有 curl 必须带 `-m 60`(或更小); 禁止无超时同步请求
2. **异步优先**: 超过 60s 的任务(大范围扫描/批量请求)用 exec 后台执行,
   拿 execution_id 后 wait_tool_execution 轮询, 不阻塞对话
3. **按任务选择工具**：静态源码/JS/已有证据分析不调用 Chrome MCP；仅实际点击、填写、切页、登录交接或采集正常功能请求时使用 `mcp__chrome_mcp__*`。
   动作后分别确认 UI 变化和可归因的正常请求；纯客户端/缓存记 `ui_only`，捕获失败或无法归因记 `inconclusive`。纯头/状态/路径探测用 HTTP 客户端。
4. curl 标配: `curl -s -m 60 -k -H "User-Agent: Mozilla/5.0 ..."`
5. 禁止: 无超时请求、同步等待长任务、重复轮询高频请求

## 与浏览器 MCP 的分工
- 资产发现/接口枚举/指纹: a_scan.py + curl(快)
- 正常页面功能操作与请求采集：`mcp__chrome_mcp__*`，先读 `vps-browser-workflow`。
- 资产发现 → D1 假设登记 → D2 使用已有原包或专项工具验证 → 复核落库；只有需要补正常功能动作时才调用浏览器。
