# 信息收集命令链 (S0, 固化工具)

**目的**: 拿到目标→资产测绘→URL池→指纹→进 S1。工具固定，找不到=流程错误。

## 存活探测（CLI 已装: tools/httpx/httpx.exe v1.10.0）
```
# 批量存活+标题+状态码+技术指纹
tools/httpx/httpx.exe -l urls.txt -title -status-code -tech-detect -o alive.txt
# 管道配合 gau/katana
cat urls.txt | tools/httpx/httpx.exe -silent -title -tech-detect
# 端口探测
tools/httpx/httpx.exe -l urls.txt -ports 80,443,8080,8443 -o alive.txt
```

## 资产测绘（GUI 批量）
```
# TscanPlus (存活+端口+指纹+漏洞, 固定路径)
D:\Desktop\TscanPlus_Win_Amd64.exe
```

## URL 收集（被动，已装）
```
tools/gau/gau.exe <domain> | grep -iE "\.(js|php|jsp|asp|aspx|json|api|do)" > urls.txt
```

## 爬取（主动，已装）
```
tools/katana/katana.exe -u <url> -d 2 -jc -o urls.txt     # -jc 含 JS 文件
```

## JS 主动分析提取（核心: 拿全接口，比 gau/katana 全）
```
# 拉 JS → 提取 API路径/参数/子域（含页面未直接触发的接口）
python tools/js_api_extract.py <target_url> --out api.txt
python tools/js_api_extract.py -l js_urls.txt              # 已有 JS 列表
# SPA 动态接口/需登录态 → Blueprint browser_evaluate 补（见下）
# → 提取完必须人工读代码: 接口语义/密钥/加密逻辑/鉴权 → js-manual-analysis.md
```

## 子域名/关联资产
```
# FOFA 语法 → fofa-site-search.md（内容指纹+归属组合, 避免 host 条件）
```

## FOFA 中间件/组件目标 query 清单（练手找站用）
**坑**: 搜 header="X-Application-Context" 前 20 条全是 aliyun/dingtalk 云边缘资产(不可测)。要用 **app= 指纹直搜**。
```
app="NACOS" && country="CN"                    # Nacos 未授权/默认口令(CVE-2021-29441)
app="XXL-JOB" && country="CN"                  # XXL-JOB 默认口令 admin/123456→RCE
body="druid" && title="Druid" && country="CN"  # Druid 未授权监控台
body="rememberMe=deleteMe"                     # Shiro 反序列化
app="SPRING-BOOT" && body="/actuator"          # Actuator 暴露
header="X-Application-Context" && domain="edu.cn"  # 教育行业 SpringBoot(避开云厂商)
app="ThingsBoard" || body="thingsboard.org"    # IoT 平台默认口令
```
**筛选原则**: 裸 IP:端口 优先(中小型自建,可直打)；跳过 aliyun/taobao/dingtalk/qcloud 大厂；选能确认组件指纹的。
```bash
python .claude/skills/fofa-api/fofa.py search '<query>' --key <KEY> --months 3 --size 30
```

## 指纹识别
```
# FingerScan = Burp 插件（非 CLI）: Burp→Extensions→Add→选 JAR
#   加载 tools/FingerScan/FingerScan-v3.0.11.jar（同目录自动建工作目录）
# 响应头/JS 特征命中 → fingerprint-nday.md 打 N-day
```

## 前端 API 提取（Blueprint browser_evaluate）
```
# SPA 动态加载/需登录态的接口 → 浏览器内提取（CLAUDE.md JS 优先）
# browser_evaluate: 遍历 window 上 ajax/fetch 封装、接口清单、Vue Router 路由表
# browser_snapshot 先看页面结构 → evaluate 触发真实请求 → Burp 抓包验证
```

→ 返回 S2: {资产清单, 指纹, 存活端口, URL池, API列表}
