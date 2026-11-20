# 子域名全量收集流水线（无 key 免费源，2026-11-19 icbcasia.com 实测 50→89 +78%）

## 流水线（按性价比排序，全走代理 --proxy http://127.0.0.1:7897）

1. **crt.sh 证书透明**（主力）：`curl -s --proxy http://127.0.0.1:7897 "https://crt.sh/?q=%25.<域>&output=json"`，取 name_value 按行去重
2. **OneForAll**：`cd D:/Desktop/One_Fox/tools/gui_shouji/oneforall && python oneforall.py --target <域> run`
   依赖装法：`pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --proxy http://127.0.0.1:7897`（TUN 劫持直连必失败）
   csv 导出 Permission denied → 直接读 `results/result.sqlite3`（表名：域名的 . 变 _）
3. **hackertarget**：`curl --proxy … "https://api.hackertarget.com/hostsearch/?q=<域>"`（免费限速；常出内网命名真名 + 历史 IP/内网 IP）
4. **rapiddns**：`curl … "https://rapiddns.io/subdomain/<域>?full=1"` + 正则 `([a-z0-9_-]+(\.[a-z0-9_-]+)*\.<域>)`；**有拼接噪声**（aliyun.*、第三方域名要 DNS 实测证伪）
5. **urlscan.io**：`curl … "https://urlscan.io/api/v1/search/?q=domain:<域>&size=1000"`
6. **OTX**：`otx.alienvault.com/api/v1/indicators/domain/<域>/passive_dns`（银行域实测 0 条，备用）
7. **Wayback CDX**：`web.archive.org/cdx/search/cdx?url=*.<域>&output=text&fl=original&collapse=urlkey&limit=20000`（要 `-L -m 120`；历史下线资产）
8. **DNS 全记录**（dnspython）：NS/MX/SOA/TXT/SRV 枚举 + AXFR 尝试（权威 NS 上试一把）；**SPF 的 `ip4:` 段=自有段（拿去 PTR 反查），include:=关联域链**
9. **C 段 PTR 反查**：dnspython 64 线程查 `<段>.in-addr.arpa` PTR——挖出 DNS 查询拿不到的基础设施真名与内网命名规范
10. **命名规律定向爆破**：从 PTR/hackertarget 真名提炼命名法（如 `hk{机房}{组}-i{N}`、`smtp{N}`）→ 80 线程 A 记录枚举

## 前置必查
- **泛解析**：随机 16 字母子域查 A，有记录=泛解析，爆破结果按该 IP 过滤
- 合并输出按 `子域↔来源集合` 记账，多源交叉验证去噪

## 增强项（需 key/付费，按需）
FOFA（余额制）/ Quake API / SecurityTrails / DNSDB / Censys / **App 抓包**（最真实 API 域名面）/ ZoomEye

## 实测坑
- pip 走 TUN 直连任何 https 镜像都 SSLEOFError → 一律显式 `--proxy`
- OneForAll 免 key 模式弱于 crt.sh（数据源大半要 key）
- 测绘器经境外代理访问银行站 title=Error 是 WAF 拦代理出口，≠站挂；真实测试走国内直连
- 产物惯例：`tmp/<域>_final_subdomains.txt` + 各源原始包 tmp/ 留档
