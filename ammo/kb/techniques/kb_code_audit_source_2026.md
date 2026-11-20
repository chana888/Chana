---
name: kb-code-audit-source
description: 源码代码审计实战手册(Java/PHP/Go)：入口点→数据流→Sink→可达性验证，补丁diff挖N-day，Semgrep/CodeQL工具链
tags: [代码审计, 白盒, Java, PHP, Go, CodeQL, Semgrep]
date: 2026-08-14
---

# 源码代码审计实战手册（Java / PHP / Go）

> 读者画像：黑盒渗透熟练（SQLi/反序列化/WAF绕过），有 jadx 但未系统做过白盒。本手册目标：拿到源码/反编译产物后，30 分钟内定位可被黑盒验证的高危链路。

## 1. 审计方法论

### 1.1 核心四步：入口点 → 数据流 → Sink → 可达性

```
入口点(source)  →  中间变换(传播)  →  危险函数(sink)  →  可达性验证
HTTP参数/Header     字符串拼接/解码       执行/查询/IO/反序列化    该路径能否被外部真实触发
Cookie/上传文件     类型转换/编码
```

- **入口点清单**（优先找）：`@RequestParam/@RequestBody`、`request.getParameter`、Header（`X-Forwarded-For`/`Referer`）、`getPart()`文件、`readObject`/`ObjectInputStream`、数据库读出后二次入 sink（二阶注入）。
- **Sink 分类速查**：
  | 类别 | Java | PHP | Go |
  |------|------|-----|----|
  | 命令执行 | `Runtime.exec`/`ProcessBuilder` | `system`/`exec`/`shell_exec`/`popen` | `os/exec` |
  | SQL | `Statement.executeQuery` | `mysqli_query`/`->query` | `db.Query`(拼接) |
  | SSRF | `URL.openConnection`/`HttpClient` | `curl_init`/`file_get_contents` | `http.Get`/`Client.Do` |
  | 反序列化 | `ObjectInputStream.readObject` | `unserialize` | `gob.Decode`/`json`+`interface{}` |
  | 文件 | `new File(path)`/上传 | `move_uploaded_file`/`include` | `os.WriteFile`/`http.ServeFile` |
  | JNDI/表达式 | `InitialContext.lookup`/`SpelExpressionParser` | `eval`/`assert`/`preg_replace /e` | `text/template`(未转义) |
- **可达性验证（最高优先）**：静态找全链 ≠ 漏洞。必须判断 source 是否被路由注册（`@GetMapping`/路由表）、是否有前置鉴权、sink 是否在死代码/旧版本分支。最终用 Burp 发真实请求复现。

### 1.2 源码→部署 jar 落地验证

黑盒转白盒最常用链路：
1. **拿到 jar/war** → `jar tf xxx.jar | grep -E "Controller|ServiceImpl"` 看包结构。
2. **jadx 反编译**（`D:\Download\jadx\jadx-gui-1.5.5.exe`）：jadx 能把 class 还原成近似源码，重点看 lambda/字符串常量（混淆时字符串是唯一线索）。
3. 反编译产物里 `String` 常量往往暴露路径/密钥/SQL，先 `grep -rE "(Runtime|exec|JdbcTemplate|select|/api|secret)"` 建索引。
4. **编译差异坑**：jadx 不还原泛型、局部变量名、switch 表，反编译的 `if` 可能是原 `switch`，读逻辑时留意。

## 2. Java 审计

### 2.1 Spring 漏洞模式

**SpEL 表达式注入（sink）**——用户输入进表达式解析器即 RCE（CVE-2024-38808 是同类 DoS，历史多次 SpEL DoS）：
```java
// 审计点：parseExpression 的入参是否可控
ExpressionParser parser = new SpelExpressionParser();
Object v = parser.parseExpression(userInput)   // userInput 可控 → 任意 SpEL
  .getValue(context);
// 利用: ${T(java.lang.Runtime).getRuntime().exec('id')}
//      #{''.getClass().forName('java.lang.Runtime')...}
```
**审计切入点**：`grep -rn "parseExpression\|SpelExpressionParser\|ExpressionParser"`；`@Value`/`@PreAuthorize` 里的 `#{...}` 若拼用户输入同样危险；Spring Data `@Query` SpEL（`?#{...}`）拼参也中招。

**参数绑定 Mass Assignment / 类型转换**：
```java
// @RequestBody 绑定整个对象，多余字段被自动 set → 越权/提权
@PostMapping("/user/update")
public User update(@RequestBody User u) {   // 攻击者可多传 role="admin"
    userService.save(u);
}
// 修复参考: @JsonIgnoreProperties / DTO 白名单字段
```
**审计切入点**：找 `@RequestBody` + `save/update` 方法，对照实体是否有 `role/isAdmin/status` 等敏感字段。

**Spring Security 鉴权绕过**（过滤器链匹配与 Controller 路径解析不一致）：
```java
// 配置放行了 /admin/**，但 Controller 同时映射了这些变体 → 绕过
registry.addPathPatterns("/admin/**").permitAll();   // 但下面这些都被放行
// GET /admin;/manage   /admin/../manage   /admin%20/manage   //admin/manage
```
**审计切入点**：`SecurityFilterChain` 的 `antMatchers/requestMatchers` 与 `@GetMapping` 路径一一对照；注意 `;`(分号路径参数)、`..;/`(Tomcat 归一化)、双重 URL 编码、`//`、`%2e`。Shiro 同理：`/**` 拦截器顺序 + `PathMatchingFilterChainResolver` 的 `:` 分隔符绕过。

### 2.2 常用 Sink 与审计点

| Sink | 代码特征 | 一句话审计法 |
|------|---------|-------------|
| 命令执行 | `Runtime.getRuntime().exec(str)` / `new ProcessBuilder(cmd)` | 入参拼过 `bash -c`/`|`/`;`？参数数组模式(`exec(cmd, args)`)相对安全 |
| 反射 | `Class.forName(x).getMethod(y).invoke` | 反射的目标类/方法名是否可控→可调任意方法 |
| 反序列化 | `ObjectInputStream.readObject()` / `XMLDecoder` / `SnakeYAML load` / `Fastjson JSON.parseObject` | 序列化数据是否来自请求体/Redis 等外部可控 |
| JNDI | `new InitialContext().lookup(url)` | url 可控 → `ldap://恶意`（见 JNDI 注入手册） |
| 文件上传 | `MultipartFile.transferTo(path)` | 文件名直接拼路径 → 目录穿越/写 webshell |
| SSRF | `URL.openConnection()` / `RestTemplate`/`HttpClient` 请求 URL | URL 来自用户且未校验 host → 内网探测/云元数据 |

### 2.3 Fastjson / Jackson 反序列化审计

- **Fastjson**：`JSON.parseObject(str, Xxx.class)` 无 `Feature` 限制时，`@type` 字段可控 → autoType 链。审计点：`grep -rn "parseObject\|JSON.parse"`，且确认项目未设 `safeMode`/`autoTypeSupport=false`。有 JSON 接口 + `@type` 报错 = 白盒确认反序列化点（用 DNSLog Inet4Address 验证）。
- **Jackson**：默认 `defaultTyping` 开启时（`enableDefaultTyping`/`activateDefaultTyping`）支持多态反序列化，配合 gadget（如 `com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl`）打 RCE。审计点：`grep -rn "enableDefaultTyping\|activateDefaultTyping\|@JsonTypeInfo"`。
- **SnakeYAML / XStream**：`new Yaml().load(str)`、`xstream.fromXML(str)` 均是高危 sink。

## 3. PHP 审计

### 3.1 弱类型与变量覆盖
```php
// 弱类型 ==：'0e4620974...' == md5 0e 开头字符串 → 真；'abc' == 0 → true
if ($_POST['pass'] == $admin_pass) {...}        // 传 0 或数组可绕过
// 变量覆盖
extract($_POST);            // POST role=admin → $role='admin'
foreach ($_GET as $k=>$v) { $$k = $v; }         // $where/$id 被覆盖
parse_str($_SERVER['QUERY_STRING']);            // 同上
```
**审计切入点**：`grep -rn "extract\|parse_str\|\$\$"`；所有 `==`（非 `===`）比较处。

### 3.2 文件包含与上传
```php
include($_GET['page'] . '.php');   // LFI: php://filter 读源码 / data:// RCE / 日志包含
$ext = pathinfo($_FILES['f']['name'], PATHINFO_EXTENSION);
if (!in_array($ext, ['jpg','png'])) die();      // 黑名单 → 大小写/双写/.user.ini/图片马绕过
move_uploaded_file($tmp, $dir . '/' . $name);   // $name 可控 → 目录穿越
```
**审计切入点**：`include/require` 动态路径、`move_uploaded_file`/`upload_*`、`file_put_contents`。注意 `is_file/getimagesize($path)` 传入 `phar://` 会触发 PHAR 反序列化（phpwcms 1.10.8 案例）。

### 3.3 反序列化 POP 链构造（sink-first）
1. **先找 sink 魔术方法**：`__destruct`(→`file_put_contents`/`unlink`/`exec`)、`__wakeup`、`__call`、`__toString`(→`include`/`preg_replace`)、`__invoke`。
2. **反推属性**：sink 方法里调用的属性名，找同名属性可被外部 set 的类。
3. **链式拼接**：中间类 A 的魔术方法里 `->call($this->b)`，让 `$b` 指向含 sink 的类 B。用 `php -r` 本地生成 payload 验证。
```php
class A { public $b; function __destruct(){ $this->b->exec(); } }  // 触发点
class B { function exec(){ system($_GET['cmd']); } }               // sink
// payload: O:1:"A":1:{s:1:"b";O:1:"B":0:{}}
```
**审计切入点**：`grep -rn "__destruct\|__wakeup\|__call\|__toString"` 收集全部魔术方法 → 对每个方法里的危险调用向上回溯属性来源。**通配技巧**：WordPress 系先查 `unserialize`/`maybe_unserialize` 是否对用户输入开放，再全局搜 gadget 类（`grep -rln "__destruct"`）。

### 3.4 SQLi 与 CMS 审计流程
```php
$sql = "SELECT * FROM news WHERE id=" . $_GET['id'];   // 数字型注入
$res = $conn->query($sql);
// 预编译($stmt->prepare) 存在 = 安全；字符串拼接 = 注入
```
**审计切入点**：`grep -rnE "(query|exec|mysqli_query|->where|DB::)" ` 逐个看是否 `prepare`。CMS 流程：**建索引**（目录结构+路由）→ **grep 高危函数**（`eval/system/unserialize/include/\$_GET/\$_POST/\$_FILES`）→ **审计鉴权**（admin 控制器是否统一有 `is_admin` 校验）→ **从已知入口打补丁 diff**（见 §7）。

## 4. Go 审计

### 4.1 SSRF / 命令执行
```go
// SSRF: 用户输入直接构造 URL
url := fmt.Sprintf("http://%s.%s/storage/%s.json", tenantID, fileID, id)
resp, _ := http.Get(url)            // → 打内网/云元数据 169.254.169.254
// 且响应体里的 Download 字段又二次 http.Get → 二次 SSRF
// 命令执行
cmd := exec.Command("bash", "-c", userInput)   // CRITICAL
```
**审计切入点**：`grep -rn "http.Get\|http.Post\|Client.Do\|NewRequest"`；`exec.Command` 是否数组模式且含 `-c`/`sh`。Warden(开源 Go 网关)做法可参考：DNS 解析 + 封锁 RFC1918/环回/元数据地址。

### 4.2 反序列化（gob）与框架模式
```go
dec := gob.NewDecoder(req.Body); dec.Decode(&v)   // gob 不校验类型 → 注意文档格式可控性
var m interface{}
json.Unmarshal(data, &m)            // interface{} + 后续类型断言 → 潜在类型混淆
```
- **gin**：`c.Query`/`c.Param` 直接入 sink 最危险；`c.Bind` 做 mass assignment（struct 绑定时多余 JSON 字段进结构体）。
- **echo**：`c.FormValue`/`c.QueryParam` 同理；`c.Bind` 绑定 struct 检查敏感字段。
- **模板**：`text/template` 未转义 = XSS/注入；`template.HTML` 包装用户输入 = 直接 XSS。
- **并发坑**：handler 共享全局 map 无锁 = 数据竞争（CVE-2024-35571 类），虽非直接注入但可导致逻辑绕过。

## 5. 自动化工具链

### 5.1 Semgrep（规则即代码，最快上手）
```yaml
# 自定义规则: Java 命令执行污点
rules:
  - id: java-cmd-injection
    languages: [java]
    message: 用户输入进入 Runtime.exec，可能命令注入
    severity: ERROR
    mode: taint
    pattern-sources:
      - pattern: |
          (HttpServletRequest $req).getParameter(...)
    pattern-sinks:
      - patterns:
          - pattern-either:
              - pattern: Runtime.getRuntime().exec(...)
              - pattern: new ProcessBuilder(...)
              - pattern: (ProcessBuilder $p).command(...)
    metadata: { cwe: "CWE-78" }
```
```bash
semgrep --config p/java --config p/default --json /path/to/src   # 官方规则包
semgrep --config /path/my-rule.yml --json /path/to/src           # 自定义
# 常见官方规则 ID 参考: command-injection-formatted-runtime-call / command-injection-process-builder
```
**用法**：先跑 `p/default` 全量，再针对目标技术栈（Spring/Fastjson/ThinkPHP）写 3-5 条 taint 规则补盲区。

### 5.2 CodeQL（真正的污点分析引擎）
```ql
import java
import semmle.code.java.dataflow.FlowSources
class CmdInjectionConfig extends TaintTracking::Configuration {
  CmdInjectionConfig() { this = "CmdInjectionConfig" }
  override predicate isSource(DataFlow::Node n) { n instanceof RemoteFlowSource }
  override predicate isSink(DataFlow::Node n) {
    exists(MethodAccess m |
      m.getMethod().hasQualifiedName("java.lang", "Runtime", "exec") and
      n.asExpr() = m.getArgument(0))
  }
}
from CmdInjectionConfig c, DataFlow::PathNode s, DataFlow::PathNode k
where c.hasFlowPath(s, k)
select s.getNode(), k.getNode(), "用户输入到命令执行"
```
```bash
codeql database create /tmp/db --language=java --source-root=/path/src
codeql query run --database=/tmp/db myquery.ql
codeql database analyze /tmp/db codeql/java-queries --format=sarif-latest -o out.sarif
```
**要点**：CodeQL 内置大量 sink kind（`command-injection`/`jndi-injection`/`sql-injection`/`path-injection`/`template-injection`）。模型扩展（`sourceModel`/`sinkModel`）可给第三方库定义 source。坑：未建模的中间步骤会漏报（如 `Base64.getDecoder().wrap()`），发现漏报就补 `pathProblem`/额外 step。官方 codeql-community-packs 补了数百个第三方 API 模型。

### 5.3 其他工具
- **Fortify / Checkmarx**：商业级，静态规则全，误报多，适合出报告；Checkmarx 的 Query Browser 可写自定义查询。
- **Seay（PHP 源码审计系统）**：一键扫 PHP，内置正则规则集（`grep 高危函数+变量回溯`），Windows 上直接跑，适合 PHP CMS 初筛。
- **依赖 SCA**：`owasp dependency-check --scan target/`（Java）；`grype dir:./` 或 `trivy fs .`（Go/全语言）；目的是把 CVE 版本与 sink 代码关联（有漏洞版本 + 有调用点 = 实锤）。

### 5.4 联合 Burp 半自动验证（白盒→黑盒闭环）
1. CodeQL/Semgrep 出可疑链 → 记录 `URL 路由 + 参数 + sink 文件:行号`。
2. 用 Burp 抓对应接口真实请求，在参数位置替换 payload（注入/SSRF/DNSLog 外带）。
3. 命中回显/DNSLog 回连 = 实锤；静默无回显 → 换 DNSLog/布尔盲注验证，或回到静态继续深挖。
4. 把 `{文件:行号 → HTTP 请求 → 响应证据}` 存档进报告。

## 6. 补丁 Diff 挖 N-day 方法论

> 铁律：**每个补丁都是"认罪书"**——diff 里新增的校验就是漏洞位置。

### 6.1 流程（源码级）
1. **拿两版本源码**：`git clone` 后 `git tag` 列出版本；或直接 `git diff v1.2.3 v1.2.4`。
2. **对比版本 diff → 定位新增校验**：
   ```bash
   git log --oneline --grep="CVE\|security\|fix" v1.2.4    # 先看 commit 消息
   git diff v1.2.3 v1.2.4 --stat                            # 看改了哪些文件
   git show <fix_commit> --stat && git show <fix_commit>   # 精读补丁
   git log -p --follow <危险文件>                           # 追溯某个文件历史
   ```
3. **逆向绕过**：补丁新增的校验就是拦截点。分析它拦了什么（黑名单/白名单/长度/类型/正则），用黑盒思路绕过（编码/大小写/参数污染/分块/幽灵比特）。例：补丁加 `if (url.startsWith("http"))` → 用 `http:` 大小写/`https://https://` 双协议绕过。
4. **GitHub compare 技巧**：
   - `https://github.com/{org}/{repo}/compare/v1.2.3...v1.2.4`（版本对比，秒级）
   - 官方 releases 页 `View full changelog` 链接即 compare。
   - 无 tag 时用 commit 哈希 compare：`compare/{sha1}...{sha2}`。
   - 用 `git log --author` / 提交时间过滤出安全团队的 commit（常见关键词：`security`/`vuln`/`CVE`/`sanitize`/`validate`/`fix`/`guard`）。
   - 看 **发布说明 release notes** 中提及的安全修复项，只 diff 对应文件。
5. **工具加速**：二进制场景用 BinDiff/Diaphora/Ghidriff（函数级 diff，找"新增 basic block"= 新增 if 校验）；源码场景直接 `git diff` + AI 读补丁（PatchLeaks 类工具已把"patch→PoC"自动化）。

### 6.2 实战案例参考
- **ActiveMQ CVE-2026-41044**：diff 前 5.19.2 用字符串拼接 `"vm://" + broker.getBrokerName()`，修复版改成不可变 `URI` + 删除未过滤的 setter——**confused deputy（两个 setter 只过滤了一个）**是补丁绕过高发模式。
- **方法**：看到补丁"新增过滤"要反问——同样的值是否还有第二条路（另一个 setter/另一个入口）没过滤。

## 7. 常见坑与绕过

- **误报控制（静态≠漏洞）**：① 依赖死代码：Controller 是否注册路由、方法是否被 `@Deprecated`/接口未暴露；② sink 在旧版本分支（看 maven 依赖锁定版本）；③ 前置鉴权：`@PreAuthorize`/Shiro 拦截是否拦住 source；④ 数据类型：`getParameter` 后是否有 `Integer.parseInt`/白名单净化（sanitizer 阻断 taint）。**CodeQL 报"无法检测路径"通常是中间步骤未建模**，不代表没漏洞。
- **编译/反编译差异**：jadx 不还原 lambda 内联细节与泛型擦除；混淆后字段名乱、字符串加密。应对：先 `grep` 字符串常量（路径/库名/SQL 关键字是锚点），再反查引用它的方法。
- **混淆对抗**：ProGuard 混淆规则文件（`proguard-rules.pro`）常保留 `keep` 的类名——被 keep 的往往是入口/反射目标，优先审计；字符串解密函数（`a(byte[])`）集中解密后才是真实逻辑。
- **审计漏报高发点**：参数校验只做前端（`v-model`/JS 校验）、`@JsonIgnore` 的字段仍然可被序列化注入、`get/set` 自动调用的隐式转换、`Integer` 与 `int` 空指针差异、日志函数二次入参（log injection→命令）。
- **不要停在线索**：单点可疑（一个 header/一个未授权接口）不构成漏洞，必须闭环到真实影响（提权/读数据/RCE 外带）。

## 8. 实战靶场与资源

- **Java**：
  - `vulhub`（源码级环境，Docker 一键起）`https://github.com/vulhub/vulhub` — Fastjson/Shiro/Log4j/Spring 全部带环境。
  - WebGoat（OWASP，含 SQLi/XSS/反序列化教学，源码可读）。
  - spring-boot 漏洞靶场 `https://github.com/JoyChou93/java-sec-code` — 配套安全代码对比。
- **PHP**：
  - `Pikachu`（含反序列化/变量覆盖/RCE）、`sqli-labs`、`upload-labs`、`PHPChallenge`（在线 POP 链挑战，适合练 gadget）。
  - WordPress 插件 CVE 复盘（`grep unserialize/maybe_unserialize` 练手）。
- **Go**：`vulnerable-go-app`（Gin，200+ 漏洞，Snyk 出品，配扫描工具对照）。
- **CodeQL 官方教程**：`https://codeql.github.com/docs/`（QL 语言 + Java taint 分析）、codeql-community-packs（`https://github.blog/security/vulnerability-research/announcing-codeql-community-packs/`）。
- **Semgrep 规则库**：`https://semgrep.dev/docs/cheat-sheets/java-command-injection`、`p/default` 规则包。

---

## Sources

- CVE-2024-38808 Spring SpEL DoS 审计视角：https://github.com/advisories/GHSA-9cmq-m9j5-mvww ；https://security-tracker.debian.org/tracker/CVE-2024-38808
- CodeQL Java taint analysis（ConfigSig/source/sink/library models）：https://github.com/github/codeql/discussions/17241 ；https://raw.githubusercontent.com/github/codeql/main/docs/codeql/codeql-language-guides/customizing-library-models-for-java.rst
- CodeQL Community Packs：https://github.blog/security/vulnerability-research/announcing-codeql-community-packs/
- PHP unserialize/POP 链 CVE 复盘：CVE-2024-10932（Backup Migration）https://avd.aquasec.com/nvd/2024/cve-2024-10932/ ；CVE-2025-7384（CF7）https://github.com/Dungsocool/CVE-2025-7384 ；CVE-2026-71294（Cotonti）https://vuldb.com/cve/CVE-2026-71294
- Go SSRF/命令执行：https://snyk.io/articles/how-to-avoid-ssrf-vulnerability-in-go-applications/ ；https://github.com/ryanmcmorrowsnyk/vulnerable-go-app
- 补丁 diff 挖 N-day：https://www.originhq.com/research/patch-diffing-pipeline ；https://github.com/hatlesswizard/PatchLeaks ；N-day→N-hour 趋势 https://thehackernews.com/2026/07/n-day-is-becoming-n-hour-patching.html
- Semgrep Java 命令注入速查：https://semgrep.dev/docs/cheat-sheets/java-command-injection
