---
name: attack-surface-recon
description: >-
  侦察/攻击面测绘:被动whois/amass/crt.sh/FOFA/Shodan,主动subfinder/httpx/naabu/katana/nuclei,DNS地域/CDN/Nginx catch-all/宝塔/UniApp指纹。先浏览功能再定向测绘,认知写入项目黑板。Use when starting recon, asset mapping, fingerprinting, or CDN/DNS bypass discovery.
tags: [渗透测试, penetration-testing, 红队]
---

<!-- CHANA-WORKFLOW-GOVERNANCE:BEGIN -->
## 发现先行

本 Skill 只负责 D0 攻击面收集，包括在真实入口上少量 JSON 结构/类型对照、Cookie 行为识别和定向 DNSLog/OOB 主动寻找信号；无需先有组件名、版本或特征报错。按 `pentest-sop/references/workflow-gates.md` 的“D0 定向组件主动探测”执行预算、对照与回连归因。必须逐文件保留 JS 来源和处理状态、路径随机基线、真实功能动作和请求上下文；候选与真实可达接口分开。出现信号自动交 D1 登记并按门控继续 D2，未经核对的静态候选不能直接进入利用；一轮扫描或接口数量不代表覆盖完成。
<!-- CHANA-WORKFLOW-GOVERNANCE:END -->

## JS 与接口分析分层

JS 分析不是只有离线正则或 AST 提取：先逐文件离线提取路径、方法、参数、SourceMap 和源码位置，再由 AI 阅读 `js-analysis.json` 及关键源码，串联“页面/路由 → 业务函数 → 请求封装 → baseURL/网关 → 接口”，解释字符串拼接、运行时配置、懒加载和租户/签名来源，按业务价值排序候选；最后回到浏览器操作正常功能，确认真实 URL、方法、字段和认证上下文。AI 输出与静态路径都只是候选，未捕获真实请求前不得当作可达接口。

## 功能操作与动态接口发现（2026-10-11）

需要实际操作目标功能时，使用 VPS MCP Chrome Extension；JS/源码、已保存请求、路径/端口探测和专项工具验证独立运行，不要求整个任务经过浏览器。按当前账号/租户逐模块实际点击菜单、子页签、详情和弹窗，执行适用的正常查询、筛选、分页、排序、下拉/级联、滚动和预览；有副作用动作仅在授权受控对象上执行。菜单打开或读过 JS 不能当成功能覆盖。

详细动作、增量抓包、缓存与无请求判断、账号/状态缺口和完成判据见 `/opt/chana/app/skills/vps-browser-workflow/references/function-discovery.md`。当前项目维护 `recon/function-coverage.json`，记录页面/动作/前置状态/真实 requestId/证据/新 JS/缺口/下一步，并交接 `recon/functions-<站点>` fact。静态候选回到对应正常功能补抓；不能只按 URL 去重或声称已发现所有接口。单点验证仅覆盖相关模块，多个任务共用浏览器时由当前控制任务操作，其他任务使用既有产物增量分析。

## 请求证据交接（2026-10-11）

已有正常业务抓包后转 [request-triage](../request-triage/SKILL.md)，交接出处、方法、字段、账号角色和缺口。实际浏览/抓包工具以当前工具清单为准；缺少能力时记录缺口，不凭空构造请求或反复调用未安装工具。

> **chana VPS 适配（2026-10-11，优先于下方工作机示例）**：当前平台是 **Linux VPS**，不是 Windows。下方 Windows 适配和整段 terminal 示例只是其他环境资料，不能直接照抄执行。
> - 站点发现先读 `/opt/chana/app/skills/pentest-sop/references/js-path-discovery.md`，按逐文件 JS/懒加载/真实请求与基线校准/栈和业务定向路径发现执行。
> - 2026-10-11 已核对全局命令 nmap、dirsearch、wafw00f、httpx、nuclei、sqlmap；ffuf 和 katana 未安装。其他示例工具使用前检查当前工具清单与命令路径，缺失不反复调用；不把工作机的 workflow_scan_a/workflow_launch_b 当作 VPS 已接通能力。
> - 浏览器用当前工具清单中实际可用的工具，在目标专用页操作，不能导航平台自身页。JS 离线助手为 `node /opt/chana/app/skills/pentest-sop/scripts/recon/analyze-js.cjs`；完整输入/输出格式见上述手册。它不执行目标代码、不发网络请求，也不能代替人工读调用链。
> - 保留来源/方法/参数/认证上下文/分发值；路径命中后分析正文、跳转与随机不存在基线。403、200、等长度不单独定性。默认 ≤5 req/s、并发 5，限流/持续 5xx 降速或停，禁止跨授权扩面或有副作用的请求。
> - 未分析文件、高价值模块未验证、缺账号/解析失败/预算延期都落 recon fact，不能声称已全站排除。

> **历史 Windows 工作机适配（不适用于本 VPS）**: 工作机 shell=cmd，无 Git Bash。以下历史浏览器示例不属于当前 ChanaAgent 工具入口。
> - **禁止**在 exec/terminal 中写 nmap/subfinder/httpx/naabu/katana/nuclei/amass 等 Linux 二进制命令（未安装，必失败）——以下 terminal 示例仅作思路参考
> - 端口/服务扫描、目录爆破、指纹：一律 `workflow_scan_a`（A线 fscan→spray→ehole，异步），产出查 `workflow_status`/`workflow_check`
> - JS/路由/API 深挖：`workflow_launch_b`（B线）或离线解析工具；需要实际操作目标功能时才回到当前 `mcp__chrome_mcp__*` 工具目录
> - 当前页面交互不使用历史 `chrome-devtools__*`/`browser_*` 入口；具体点击、填写、切页和正常请求捕获按 `vps-browser-workflow` 执行
> - 被动收集（2026-08-06 新增工具，Windows 原生 python/powershell 已就绪）：
>   `icp-scan`（ICP备案反查）· `dns-enum`（批量DNS解析）· `supply-chain-collect`（FOFA供应链反查，需 FOFA key）
>   · `xiaolanben-search`（小蓝本股权穿透，使用当前可用情报 API 或已有结果）· `sg-code-search`（代码泄露搜索）
>   · `quake-tool`（Quake 数据分类/质检）；产出 JSON 可粘贴到"信息收集→被动收集"页签一键导入资产库
> - 在线测绘四引擎（FOFA/ZoomEye/Quake/Shodan）走平台"信息收集"页面，AI 侧不要再 exec 手写
> - 静态页面/JS 分析使用 curl.exe 或离线解析；不要用浏览器 MCP 代替静态分析
> - 命令执行测试用 exec（cmd 语法）或 execute

## 侦察 / 攻击面测绘

```
=== 侦察/攻击面测绘(开局第一动作,60%战时在这,别裸奔进利用;端口/指纹等立即 upsert_project_fact) ===
被动先行(不碰目标,全部执行):
  terminal: whois {domain} | grep -iE 'org|name|email|registrant'
  terminal: amass intel -asn {ASN} -d {domain}
  chrome_navigate: https://crt.sh/?q=%.{domain} (证书透明挖子域)
  terminal: curl -s "https://crt.sh/?q=%.{domain}&output=json" | python3 -c "import sys,json;[print(x['name_value']) for x in json.load(sys.stdin)]" | sort -u
  terminal: dig +short {domain} @114.114.114.114; dig +short {domain} @8.8.8.8 (对比差异=CDN)
  terminal: curl -s "https://web.archive.org/cdx/search/cdx?url=*.{domain}/*&output=text&fl=original&collapse=urlkey" | head -100
  chrome_navigate: https://fofa.info/result?qbase64=$(echo -n 'domain="{domain}"' | base64)
  chrome_navigate: https://www.shodan.io/search?query=hostname:{domain}
主动流水线(逐步执行):
  terminal: subfinder -d {domain} -silent | tee subs.txt; amass enum -d {domain} -passive >> subs.txt; sort -u subs.txt -o subs.txt
  terminal: cat subs.txt | dnsx -silent | tee alive_subs.txt
  terminal: cat alive_subs.txt | httpx -silent -title -status-code -tech-detect -cdn | tee httpx_out.txt
  terminal: naabu -l alive_subs.txt -top-ports 1000 -silent | tee ports.txt; nmap -sCV -iL <(head -20 alive_subs.txt) -oN nmap_out.txt
  terminal: katana -list alive_subs.txt -silent -d 3 | tee urls.txt; gau {domain} >> urls.txt
  terminal: cat urls.txt | grep -iE '\.(js|json)$' | httpx -silent -mc 200 | while read u; do curl -s "$u" | grep -oiE '(api|secret|key|token|password|aws|endpoint)[^"]*'; done
  terminal: ffuf -u https://{target}/FUZZ -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -mc 200,301,302,403 -fs {catch-all-size}
  terminal: nuclei -l alive_subs.txt -t /root/nuclei-templates/ -severity medium,high,critical -o nuclei_results.txt
  → httpx输出识别到框架/版本 → 立即触发 `component-vuln-intel` 搜索序列
🚨DNS地域限制绕过: 国内CDN(987dns/dnspod/阿里云)常对海外DNS返0.0.0.0,用114.114.114.114解析才拿到真实IP。多DNS对比: dig @1.1.1.1 vs @114.114.114.114 vs @8.8.8.8,差异即CDN地域策略。真实IP藏在国内DNS结果中。
🚨CDN响应过滤绕过(GCCDN/PWS等): CDN对特定URL模式(admin路径/actuator)返502而非转发后端响应:
  指纹识别: Server: PWS/x.x.x.x | Via: 1.1 PS-XXX-XXXX:N (W) | X-Px: ms CS-XXX-XXXXnone(origin) | 通配*.gccdn.net CNAME
  502≠不存在: 502=后端响应被CDN过滤, 404=路径真不存在, 403=CDN路由拒绝。用502/404/403差异枚举存活端点
  路径穿越确认: /api/v1/v/..;/..;/actuator/env → 502(存在被过滤) vs /api/v1/v/..;/..;/xxxx → 404(Tomcat原生不存在)
  CDN节点多端口: 扫CDN IP的3000-9200端口(8000/8080/9090常代理同一后端但规则可能不同,9200可能是独立nginx)
  绕过尝试矩阵(本session全测均失败,记录防重复): URL编码/双编码/大小写/分号后缀/TE空格走私/HTTP管线化/Accept-Encoding/Range
  有效信息提取: 即使502,POST actuator/env仍可能被后端执行(盲写属性)→需配合refresh触发(若refresh 404则链断)
🚨Nginx Catch-All陷阱: PHP CMS配rewrite全路由→所有路径返200同大小=catch-all(不是文件存在!)。识别: 用3个随机路径对比size一致=catch-all。真正存活路径用.php后缀测(nginx `location ~ \.php$`直通FastCGI，不存在返真404)。
🚨Pure-FTPd puredb损坏≠认证绕过: "Unable to read the indexed puredb file"=虚拟用户db坏了，所有用户名(包括匿名)都触发421断连。PAM系统用户认证也走puredb先→全部失败。不是攻击面，跳过。
🚨同IP多站横向: 反查IP(SecurityTrails/微步/VirusTotal)找同服务器其他域名→其中弱站(独立nginx配置返真404=可枚举)突破→宝塔面板统一管理=横向所有站。
指纹优先级: 一旦httpx/wappalyzer识别出框架版本 → 立即转 `component-vuln-intel` 联网情报。先测绘清攻击面,再Reason选最肥的边,不要看到一个洞就一头扎进去。
🚨DNS通配符CDN识别: 所有子域名(包括不存在的随机子域)都解析到CDN=通配符DNS(*.domain → CDN CNAME)。此时枚举子域名无意义,所有IP都是CDN节点。
  验证: dig random123456.target.com → 如果也有A记录且指向已知CDN IP = 通配符。真实源IP需从其他渠道获取(历史DNS/证书透明/同服务器其他域名/邮件头/SSRF)
🚨宝塔面板(BT Panel)识别: Cookie名为32位hex hash(如789d6d2de16419a1e8bbfea926c8996e) + 302跳/login + nginx反代 + "入口校验失败"页面 = BT Panel随机安全入口
  Windows版: IIS+nginx共存, 8888端口面板, 888端口phpMyAdmin(可能), /index.html可能泄露站点配置(反向代理目标URL/站点名)
  攻击: 入口路径爆破(8位随机字母数字) | 历史CVE(API key未授权/phar反序列化) | 面板默认FTP/MySQL账户复用
🚨Nginx 404差分指纹: 当nginx catch-all重写掩盖真实路径时,比较响应大小——真实nginx 404(146B)=文件在磁盘存在但location块deny, catch-all(大页面)=路由未匹配。批量探测CMS标志路径(/caches/configs/, /phpcms/modules/, /statics/等)区分响应大小即可确认CMS类型。详见references/nginx-404-differential-fingerprinting.md
🚨UniApp/DCloud APK逆向快速路径: assets/apps/__UNI__*/www/app-service.js = 全部业务逻辑(JS混淆); assets/zlsioh.dat = 加密配置(API域名); lib/arm64-v8a/libirzlemnr.so = 解密库。JS用RC4+base64解混淆(提取a0G数组+a0m解码器); .so中strings搜16字符随机串=可能密钥, 搜`x数字.数字.数字.数字x`格式=硬编码IP(通常是DCloud HTTPDNS基础设施而非目标API)。详见references/uniapp-dcloud-apk-reversing.md
```
