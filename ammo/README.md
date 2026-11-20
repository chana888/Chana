# ammo · 弹药库

渗透测试弹药与知识库，**随仓库自包含**——克隆即用，不依赖任何外部机器。

## 目录

| 目录 | 内容 |
|------|------|
| `kb/quick-ref/` | 秒杀卡（每卡≤50行：SQLi/指纹 N-day/主动探测/WAF 绕过/工具链速查） |
| `kb/techniques/` | 深度手册（Java 反序列化/中间件 RCE/内网横向/隧道 C2/WAF 绕过/代码审计等） |
| `kb/fingerprint/` | 指纹→本地 POC 匹配指南 |
| `kb/srcwiki_poc/` | src-wiki POC 归档（4700+ 篇，24 分类索引，A/B 级可直接打） |
| `kb/payloads/` | payload 集（WebShell/wiki96 镜像/exp 集合） |
| `kb/rce_getshell/` | RCE 总纲与攻击面手册 |
| `kb/edu/` `kb/edu_systems/` | 教育行业系统专项（正方/金智/联奕等） |
| `tools/shiro/shiro_pyke/` | **shirokit**：Shiro key 爆破(1106 keys)+15 链+RCE 一体化（Python 纯标准库 + 内置 JRE 运行时 jar） |
| `tools/dnslog_helper/` | DNSLog 外带确认（get/watch/probe 一条龙） |
| `tools/javachain/` | 反序列化链生成客户端（native/shiro/hessian/xstream/fastjson/jdbc-h2；需自部署 javachain 服务，凭据走环境变量 JCHAIN_USER/JCHAIN_PASS） |
| `tools/fastjson_exp/` | Fastjson 探测与利用（CVE-2026-16723 AutoType 关闭兜底） |

## 第三方工具（一键安装）

```bash
bash ammo/setup-ammo.sh                # sqlmap + dirsearch + nuclei
bash ammo/setup-ammo.sh --nuclei-templates   # 另下 nuclei 模板库(~600MB)
# Windows: powershell -File ammo\setup-ammo.ps1
```

## 用法速查

```bash
# Shiro 一体化（爆破→链→RCE→内存马）
python ammo/tools/shiro/shiro_pyke/shirokit.py scan <url>

# SQLi（手工确认后）
sqlmap -u "<url>" --data="<post>" --batch --dump

# 指纹命中 → N-day 直打
grep -ri "<产品名>" ammo/kb/srcwiki_poc/ --include="_index.md"

# DNSLog 外带
python ammo/tools/dnslog_helper/dnslog.py probe --type log4j --watch 600
```
