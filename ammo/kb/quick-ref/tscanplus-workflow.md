# TscanPlus 工作流整合（不重复原则）

TscanPlus MCP 10 工具对照现有工具链，**5 个独有能力整合**，2 个可选补充，3 个重复不整合。

## ✅ 独有能力（整合，现有工具链无对应）

| 能力 | 工作流位置 | 调用（mcp__tscanplus__） |
|------|-----------|------------------------|
| **url_scan 自动指纹** | S1 指纹识别 | `url_scan({targets, finger:"full", poc_check:false})` → FingerDir.yaml 380条指纹库，替代手动判指纹 |
| **ip_scan 四合一联动** | S1 资产面铺开 | `ip_scan({target, ip_finger:true, poc_check:true, pwd_check:true, ports:"Top100"})` → 单 IP 端口+指纹+POC+弱口令一步 |
| **pwd_crack 弱口令引擎** | S1-E 认证侧批量 | `pwd_crack({targets:"host:port", services:"all", thread:10})` → WeakPass.yaml **10733 条真实设备弱口令**(深信服/绿盟/华为/H3C/Citrix等) |
| **poc_scan 内置 8800+** | S1 POC 全量兜底 | `poc_scan({targets, poc_full:true})` → Nuclei 引擎内置全量(激活码已配); `poc_level` 按等级 |
| **ak_verify 云凭据验证** | S3 云凭据 | `ak_verify({kind, provider, access_key, secret_key})` → **14 OSS + 12 服务器 + 微信/钉钉/飞书/高德/萤石/绿盟** 官方API验凭据有效性 |

## ⚠️ 可选补充（不主整合）

- **tscan_scan 一键综合**：`tscan_scan({targets, modules:"port,url,poc,crack,dir,js", smart_scan:true})` → 重点目标全攻击面一次铺开
- **cyber_search 多引擎**：`cyber_search({query, field:"domain", engines:"hunter,quake"})` → FOFA 之外 hunter/quake key 已配

## ❌ 重复（不整合，现有已有）

- `dir_scan` → 已有 dirsearch（`tools/dirsearch-0.4.3`）
- `subdomain_scan` → 已有 FOFA 子域 API
- `cyber_search` 的 fofa 引擎 → 已有 FOFA API（仅 hunter/quake 作补充）
- `js_scan` → 知识库前端审计方法论已有（getfrontend/SecretFinder），需要现成工具时可用

## 触发规则

1. 指纹命中产品 → `url_scan(finger:full)` 自动识别 → `tscan_poc_search.py <产品>` 搜外部 POC → `poc_scan` 精确打
2. 外部 2027 无匹配 → `poc_scan({poc_full:true})` 内置 8800+ 兜底
3. 拿到的 AK/SK → `ak_verify` 先验有效性 → 有效才走 cf 利用链（不浪费轮次）
4. 单 IP 多服务 → `ip_scan` 四合一铺开 → 命中端口再深度测
5. 弱口令爆破成功 → RedCmd 验证命令确认，不擅自改密
