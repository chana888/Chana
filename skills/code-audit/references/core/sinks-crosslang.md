# SINKS.md — 跨语言 Sink 速查总表

> **怎么用**：拿到源码 → 先判语言 → 查本表对应**行**（漏洞类型）与**列**（语言）→ 抄该行的 `rg`/`grep` 去定位 → 回到该语言的 `PLAYBOOK_*.md` 判"这处写法危不危险"。
>
> 本表是**线索生成器，不是结论生成器**。命中一个 sink ≠ 有漏洞 —— 每个 sink 都必须回答三个问题才能进报告：
> ① **source 可控吗**（用户输入 / 上游服务 / 配置文件 / 数据库回读）
> ② **中间有净化吗**（参数化 / 白名单 / 转义 / 类型强转）
> ③ **危害闭合了吗**（能读到什么、能写到哪、能否反弹/外带）
>
> 三问缺一 → 卡在 L1，**不算漏洞**（见 `VERIFY_LOOP.md` 四级闭环）。

---

## 0. 语言 → 手册 → 规则 路由

查表前先确认你这门语言在本模块里有没有**专用手册**和**本地规则**，有就别只看本表：

| 语言 | 实战手册 | 本地 semgrep 规则 | 专用扫描器 |
|------|---------|------------------|-----------|
| **Java** | `PLAYBOOK_java.md` | `rules/java-ruoyi.yml`(13) `java-spring.yml`(9) `java-injection.yml`(6) `java-deserialization.yml`(11) `java-ssrf-file.yml`(9) | semgrep + CodeQL |
| **PHP** | `PLAYBOOK_php.md` | `rules/php-thinkphp.yml`(12) | semgrep + phpstan/psalm |
| **Go** | `PLAYBOOK_go.md` | —（用 gosec） | `bin/gosec.exe`（G101-G602 全谱） |
| **Node/TS** | `PLAYBOOK_langs_extra.md` §1 | — | semgrep + njsscan + retire.js |
| **Python** | `PLAYBOOK_langs_extra.md` §2 | — | semgrep + bandit |
| **Ruby** | `PLAYBOOK_langs_extra.md` §3 | — | semgrep + brakeman |
| **C#/.NET** | `PLAYBOOK_langs_extra.md` §4 | — | semgrep + security-code-scan |
| **C/C++** | `PLAYBOOK_langs_extra.md` §5 | — | semgrep + CodeQL + ASan/UBSan |
| **前端/小程序** | `PLAYBOOK_frontend_miniprogram.md` | `measured-gaps.yml`（v-html 一条） | — |
| **跨语言通用** | `rules/generic-secrets.yml`(9) `generic-unauth.yml`(6) `measured-gaps.yml`(7) | — | — |

> ★ **写 `pattern-regex` 前必读两条硬约束**（违反了会**静默 0 命中且引擎不报错**）：Windows 源码树是 CRLF，禁止裸 `\n`（一律 `\r?\n`）；多条正则不能用 `patterns:` 平铺（那是 AND 语义，须包 `pattern-either:`）。详见 `SKILL.md` §5。

---

## 1. 主表（22 类 × 8 语言）

### 1.1 命令执行 / 代码执行

| 语言 | Sink 写法 | 定位命令 | 判危险的要点 |
|------|----------|---------|-------------|
| **Java** | `Runtime.getRuntime().exec($CMD)` / `new ProcessBuilder($CMD)` / `$P.command($CMD)` | `rg 'Runtime\.getRuntime\(\)\.exec\|new ProcessBuilder\|\.command\('` | ★ Java 的 `exec(String)` **不做 shell 解析**，`;` `&&` 无效 —— 但**空格分隔多参**仍可换参数执行；`exec(String[])` 首元素可控才是真 RCE。**拼 `sh -c` / `cmd /c` 才是完整命令注入** |
| **PHP** | `eval($C)` / `assert($C)` / `create_function` / `call_user_func($F,...)` / `$F(...)$ARGS` / `system` / `exec` / `shell_exec` / `passthru` / `popen` / `proc_open` / 反引号 | `rg 'eval\(|assert\(|call_user_func|system\(|exec\(|shell_exec|passthru|`'` | 动态函数名调用（`$F(...)`）是 PHP 最隐蔽的一条；回调参数可控 = 任意函数调用 |
| **Go** | `exec.Command(name, args...)` / `exec.CommandContext` | `rg 'exec\.Command'` + `gosec G204` | ★ **与 Java/PHP 判定完全不同**：Go 不经过 shell，`; \| &&` 全部无效 → **必须 name 本身可控才是命令注入**；`exec.Command("sh","-c",x)` 才是完整注入。G204 只报"子进程调用带变量"，**误报率天然高**，必须人工看是不是 `sh -c` |
| **Node/TS** | `child_process.exec` / `execSync` / `spawn('sh',['-c',x])` / `fork`+`execArgv` | `rg 'child_process\|execSync\|spawn\('` | `exec` 走 shell；`spawn` 不走 shell（除非显式 `sh -c`） |
| **Python** | `os.system` / `os.popen` / `subprocess.*(shell=True)` | `rg 'os\.system\|os\.popen\|shell=True'` | `shell=False` + list 参数 = 安全；`shell=True` 即注入 |
| **Ruby** | `system` / 反引号 / `exec` / `IO.popen` / `Open3` / `%x()` | `rg 'system\(\|\`\|IO\.popen\|Open3\|%x\('` | Ruby 的 `system("cmd")` 单字符串走 shell |
| **C#/.NET** | `Process.Start(f,"/c "+x)` / `psi.Arguments` 拼接 | `rg 'Process\.Start\|ProcessStartInfo'` | 关键看 `UseShellExecute` + 是否拼 `/c` |
| **C/C++** | `system` / `popen` / `execl("/bin/sh","-c",x)` | `rg 'system\(\|popen\(\|execl\('` | 直接 RCE |

### 1.2 注入类（SQL / NoSQL / LDAP / XPath / 日志 / 表达式）

| 语言 | SQL 注入 | 定位命令 | 同族其它注入 |
|------|---------|---------|-------------|
| **Java** | `Statement.executeQuery($SQL)` / `Connection.prepareStatement($SQL)` / `JdbcTemplate.query($SQL,...)` / **MyBatis `${}`** | `rg '\$\{' --glob '*.xml'` + `rg 'Statement\|JdbcTemplate\|createStatement'` | ★ **MyBatis `${}` vs `#{}` 是 Java 审计第一分水岭**：`#{}` = PreparedStatement 占位符（安全）；`${}` = 字符串直插（注入）。见 `java-injection.yml: java-mybatis-annotation-dollar-injection`。另：`$SQL += $X` 拼接（`java-sql-string-concat-sink`）、LDAP `InitialDirContext.search`、XPath `XPath.compile`、**日志注入 `Logger.info($MSG)`**（CRLF 伪造日志行） |
| **PHP** | `mysql_query("…$x")` / `mysqli_query` 拼接 / PDO `query` 非 `prepare` | `rg 'mysql_query\|mysqli_query\|\->query\('` | ThinkPHP：`Db::query("…".$x)`、`where("…$x")`、`order($x)` raw |
| **Go** | `db.Query("…"+x)` / `fmt.Sprintf` 拼 SQL / `db.Raw` | `rg 'db\.Query\|db\.Exec\|Sprintf.*SELECT'` + `gosec G201/G202` | G201=format string、G202=字符串连接。`database/sql` 的 `?` 占位符是安全的 |
| **Node/TS** | `db.query("…"+x)` / 模板串 `${x}` | `rg 'query\(\|\.raw\('` | NoSQL：`Model.find(req.body)` 直传 → `$where` 注入 |
| **Python** | `cursor.execute("…%s"%x)` / f-string / `.raw` | `rg 'execute\(\|\.raw\('` | Django `extra()` / `RawSQL`；NoSQL：`find(request.json)` |
| **Ruby** | `where("…#{x}")` / `find_by_sql` / `order(params)` | `rg 'where\(\|find_by_sql\|order\('` | `order(params)` 是 Rails 经典注入点 |
| **C#/.NET** | `new SqlCommand("…"+x)` / `CommandText=` / Dapper 拼接 | `rg 'SqlCommand\|CommandText'` | LINQ Dynamic：`OrderBy(string)` |
| **C/C++** | 裸驱动 `sqlite3_exec` / `mysql_query` | `rg 'sqlite3_exec\|mysql_query'` | — |

**表达式注入**（常被漏，独立列出）：

| 语言 | Sink | 危害 |
|------|------|------|
| **Java** | `SpelExpressionParser.parseExpression($EXPR)` / `@Value("#{"+$X+"}")` / OGNL / MVEL / **`Velocity.evaluate`** | SpEL → 任意代码执行（`T(java.lang.Runtime)`）；Spring 全家桶高发 |
| **PHP** | `preg_replace` 带 `/e`（旧） / `assert("…$x")` | — |
| **Go** | `text/template` + 用户模板串 | 见 §1.3 |
| **Node/TS** | `jsonata().evaluate` / `jsonpath` | 读取任意对象属性 |
| **C#/.NET** | `System.Linq.Dynamic.Core` / `DynamicExpression` / `DynamicExpresso` / `OrderBy(string)` | 等同 SpEL |

### 1.3 模板注入 SSTI

| 语言 | Sink | 定位命令 | 要点 |
|------|------|---------|------|
| **Java** | FreeMarker `new Template($NAME,new StringReader($TPL),...)` / `Configuration.getTemplate($NAME)` / `processTemplate`；**Velocity `.vm` 模板本体** | `rg 'getTemplate\|processTemplate\|new Template\('` + `rg --files -g '*.vm'` | ★ **Velocity 双面性**：① Java 侧 `Velocity.evaluate(用户串)` = 直接 SSTI；② **`.vm` 模板文件本体**被用户可填字段污染 = 生成物污染（RuoYi 代码生成器 RY-017），危害是**写入任意 Java 代码**（需"生成→部署"两步，属条件 RCE）。见 `measured-gaps.yml: ruoyi-velocity-vm-codegen-injection` |
| **PHP** | Twig `render` 用户模板 / Smarty `{php}` | `rg 'render\(\|fetch\('` | ThinkPHP 自带模板引擎，注意 `fetch($tpl)` |
| **Go** | `text/template`（**无自动转义**）vs `html/template`（有） | `rg 'text/template\|template\.New\|template\.Parse'` + `gosec G203` | ★ 用错包是核心：`text/template` 渲染进 HTML = XSS；模板串可控 = SSTI |
| **Node/TS** | `ejs.render(tpl)` / `pug.compile` / **`handlebars.compile(AST对象)`** | `rg 'ejs\.render\|pug\.compile\|handlebars'` | handlebars 传 **AST 对象**（非字符串）可直接 RCE，且不需要原型污染 |
| **Python** | `render_template_string` / `jinja2.Template` | `rg 'render_template_string\|jinja2\.Template'` | Jinja2 → `{{''.__class__.__mro__}}` 链 |
| **Ruby** | `ERB.new(tpl).result` / `render inline:` | `rg 'ERB\.new\|render inline'` | — |

### 1.4 反序列化（按语言差异极大，★ 是重点）

| 语言 | Sink | 定位命令 | 要点 |
|------|------|---------|------|
| **Java** | `ObjectInputStream.readObject()` / `readUnshared()` / **Fastjson `JSON.parseObject`** / **Jackson `activateDefaultTyping`** / `readValue` / SnakeYAML `new Yaml().load` / XStream `fromXML` / `XMLDecoder.readObject` / Hessian `readObject` / `RedisTemplate` 序列化器 | `rg 'readObject\|parseObject\|activateDefaultTyping\|fromXML\|XMLDecoder\|Yaml\(\)'` | ★★ Java 是本表**最高价值**语言，链最多：<br>· **Fastjson**：`JSON.parseObject($DATA)` 本身不危 —— 危的是 `$DATA` 含 `@type` 且 `setAutoTypeSupport(true)` / `JSONReader.Feature.SupportAutoType`（见 `java-fastjson-autotype-enabled`）；<br>· **Jackson**：`activateDefaultTyping` / `enableDefaultTyping` 开启才带类型信息；<br>· **原生**：`new ObjectInputStream($IN).readObject()` 直接高危；<br>· 利用链生成用 `tools/javachain/jchain.py` |
| **PHP** | `unserialize($x)` / `session_start` 反序列化 / **`phar://` 触发** | `rg 'unserialize\|\bphar://'` | ★ 两端至少一端可控（**POP 链 source + gadget 必须同时成立**）。`phar://` 是隐藏触发点：只要 `file_exists`/`filesize` 等任一文件函数作用于 phar 路径即触发反序列化（无需 `unserialize` 显式调用） |
| **Go** | `gob.Decode` / `yaml.v2` `!!` 标签 / `json.Unmarshal` 进 `interface{}` | `rg 'gob\.NewDecoder\|yaml\.Unmarshal'` | ★ `encoding/gob` 是 Go 里最接近"反序列化漏洞"的点；**`encoding/xml` 默认不解析外部实体 → XXE 基本不成立，别误报** |
| **Node/TS** | `node-serialize.unserialize`（`_$$ND_FUNC$$_`）/ `funcster` / `cryo.parse` / **RSC Flight 协议（CVE-2025-55182）** | `rg 'unserialize\|node-serialize\|funcster'` | — |
| **Python** | `pickle.loads` / `yaml.load`(无 Loader) / `unsafe_load` / `marshal.loads` / `dill` | `rg 'pickle\.loads\|yaml\.load\|marshal\.loads'` | `yaml.safe_load` 才是安全版 |
| **Ruby** | `YAML.load` / `Marshal.load` / `Oj.load` | `rg 'YAML\.load\|Marshal\.load\|Oj\.load'` | ★ **Psych 4 起 `YAML.load` = safe_load** —— 必须先看 Ruby 版本，老版本才是洞 |
| **C#/.NET** | **`BinaryFormatter`** / `LosFormatter` / `ObjectStateFormatter` / `NetDataContractSerializer` / `SoapFormatter` / `TypeNameHandling≠None` / `XamlReader` / `YamlDotNet` | `rg 'BinaryFormatter\|LosFormatter\|TypeNameHandling'` | `BinaryFormatter` 命中即可疑到接近定论 |
| **C/C++** | 自研 `unserialize` / protobuf 解码器 | 人工读 | — |

**缓存/会话反序列化**（独立一类，常漏）：

| 语言 | Sink | 要点 |
|------|------|------|
| **Java** | Redis `RedisTemplate` 默认 JDK 序列化 / Shiro `rememberMe` | Shiro `rememberMe=deleteMe` → `tools/shiro/shiro_pyke/shirokit.py` |
| **PHP** | 框架 session handler / `session.serialize_handler` | — |
| **Python** | Flask session（`SECRET_KEY` 弱 → 伪造 → pickle） | — |
| **Ruby** | `ActiveSupport::Cache`（7.1+ 仍是 `:marshal_7_1`）/ signed cookie + `secret_key_base` | `secret_key_base` 泄露 → cookie 伪造 |
| **C#/.NET** | **ViewState（无 MAC 或 machineKey 泄露）** | 查 `aka.ms/exposed-machine-keys` |

### 1.5 SSRF / XXE

| 语言 | SSRF Sink | 定位命令 | XXE |
|------|----------|---------|-----|
| **Java** | `URL.openConnection()` / `openStream()` / `RestTemplate.getForObject($URL,...)` / `HttpClient.execute($URL)` / `Request.Get.create($URL)` | `rg 'openConnection\|RestTemplate\|HttpClient\|new URL\('` | `DocumentBuilderFactory` / `SAXParserFactory` / `XMLInputFactory` 未关 `disallow-doctype-decl` / `XMLReader` 未关外部实体 → 默认开启，**Java XXE 高发** |
| **PHP** | `curl_exec` / `file_get_contents($url)` / `fsockopen` / `fopen($url)` | `rg 'curl_exec\|file_get_contents\(\$'` | `libxml_disable_entity_loader(false)`（PHP<8 默认开）→ `<!ENTITY xxe SYSTEM "file:///etc/passwd">` |
| **Go** | `http.Get($url)` / `http.NewRequest` / `client.Do` | `rg 'http\.Get\|http\.Post\|NewRequest'` + `gosec G107/G704` | ★ **`encoding/xml` 默认不解析外部实体 → Go XXE 基本不成立，禁止误报** |
| **Node/TS** | `fetch` / `axios.*` / `http.get` / `got` / `request` | `rg 'axios\|fetch\(\|http\.get'` | `libxmljs` / `xml2js` 老版本 |
| **Python** | `requests.*` / `urlopen` / `httpx` / `aiohttp` | `rg 'requests\.\|urlopen\|httpx'` | `lxml` 默认 parser / `minidom` |
| **Ruby** | **`open(url)`（Kernel#open！）** / `Net::HTTP` / `Faraday` | `rg 'Kernel#open\|Net::HTTP\|Faraday'` | `Nokogiri` 老版本 `NOENT` |
| **C#/.NET** | `WebClient.DownloadString` / `HttpClient.GetAsync` / `WebRequest.Create` | `rg 'HttpClient\|WebRequest\|WebClient'` | `XmlDocument.LoadXml` / `DtdProcessing` 未禁 |
| **C/C++** | `curl_easy_setopt(CURLOPT_URL, 用户串)` | `rg 'CURLOPT_URL'` | `libxml2` `XML_PARSE_NOENT` |

### 1.6 文件类（路径穿越 / 任意读 / 任意写删 / 上传 / Zip Slip）

| 语言 | 路径穿越 Sink | 定位命令 | 上传 / Zip Slip |
|------|--------------|---------|----------------|
| **Java** | `new File($PATH)` / `new FileInputStream($PATH)` / `Files.readAllBytes($PATH)` / `Paths.get($PATH)` / `FileUtils.readFileToString` | `rg 'new File\(\|new FileInputStream\|Files\.\|Paths\.get\|FileUtils\.'` | ★ **上传三件套**：`MultipartFile.getOriginalFilename()`（**文件名可控，是最高频入口**）→ `transferTo($DEST)` / `Files.copy($IN,$PATH)`；★ **`new File(filePath)` 单变量启发式**（`java-arbitrary-file-read-heuristic`）；★ **Zip Slip**：`new File($DIR, $ENTRY.getName())`（`java-zip-slip`）。判读：`replaceAll("\\.\\.")` **不等于安全**（`....//` 可绕），`FileNameUtils.getExtension` 白名单才安全 |
| **PHP** | `include($x)` / `require($x)` / `file_get_contents` / `readfile` / `unlink` | `rg 'include\|require\|file_get_contents\|readfile'` | ★ **文件包含是 PHP 第一大类**：`include($_GET['x'])` → LFI/RFI；配合 `php://filter` 链读源码 / `php://input` RCE / `data://`。手册 `kb_wiki96_file_inclusion_poc_2026.md`。上传：`move_uploaded_file($TMP, $DEST)`，后缀白名单看 `pathinfo`/`explode('.')` 取法（`$F['name'][-1]` 取最后一段易绕） |
| **Go** | `os.Open($p)` / `ioutil.ReadFile` / `filepath.Join(root,x)` / `http.Dir("/")` / `http.ServeFile` | `rg 'os\.Open\|ReadFile\|filepath\.Join\|http\.Dir'` + `gosec G304/G305/G110/G111` | ★ **`filepath.Join` 不做 `../` 过滤**（与 Java `Path.Combine` 同理）；`http.Dir("/")` 把根目录当静态服务（G111）；Zip Slip 用 `io.Copy` 而非 `io.CopyN`（G110 Zip 炸弹） |
| **Node/TS** | `fs.readFile('/d/'+x)` / `path.join(dir,x)` / `sendFile` / `res.download` / `fs.createReadStream` | `rg 'fs\.\|sendFile\|download'` | — |
| **Python** | `open('/d/'+x)` / `os.path.join` / `send_file` | `rg 'open\(.*\+|send_file\|os\.path\.join'` | — |
| **Ruby** | `File.join(root,x)` / `File.read` / `send_file` / `File.delete` / `FileUtils.cp` | `rg 'File\.read\|File\.join\|send_file'` | — |
| **C#/.NET** | `"/data/"+x` / `Server.MapPath` / **`Path.Combine`**（绝对路径丢弃前缀！）/ `File.ReadAllText` / `return File(path)` / `File.Delete` | `rg 'Path\.Combine\|MapPath\|File\.ReadAll'` | ★ `Path.Combine(base, "/etc/passwd")` → 返回 `/etc/passwd`，**前缀被静默丢弃**，是高频真洞 |
| **C/C++** | `sprintf(path,"%s/%s",d,x)` / `fopen` / `unlink` / `rename` | `rg 'fopen\|sprintf.*%s/%s\|unlink'` | — |

### 1.7 鉴权 / 会话类（★ SAST 只能给线索，给不了结论）

> 这一整类**没有 tainted data flow**，静态引擎原理上无法证明"本该有的校验缺失"。规则包在这里交付的是**「这里缺一道校验」的位置清单**，不是「这里能被越权利用」的结论 —— 必须人工收敛 + 动态验证。实测：宽面枚举规则在 16 条 authz 真相上命中 5 条（31%），但全库打 31 处 → **精确率 16%**。详见 `GROUND_TRUTH_ruoyi.md` §2.1。

| 语言 | 缺鉴权面 | 定位命令 | 会话/JWT |
|------|---------|---------|---------|
| **Java** | Controller 方法**有 `@GetMapping` 但无 `@PreAuthorize`/`@Secured`**；`SecurityConfig` 里 `permitAll` 通配 `/**`；`@Anonymous` 注解；WebSecurity 忽略路径清单 | `rg '@GetMapping\|@PostMapping\|@RequestMapping'` 再看有没有 `@PreAuthorize`；`rg 'permitAll\|antMatchers\|requestMatchers\|ignoring\(\)'` | ★ **JWT 硬编码密钥** `Jwts.signWith(SignatureAlgorithm.HS512, "固定串")` / `setSigningKey("…")`（RuoYi 默认密钥 `abcdefghijklmnopqrstuvwxyz`）→ 任意 token 伪造。见 `java-ruoyi.yml: ruoyi-jwt-hardcoded-secret` |
| **PHP** | 无统一鉴权框架，看**每个入口文件是否 `session_start` + 校验**；ThinkPHP 中间件未挂；`__construct` 里漏 `parent::__construct()` 导致鉴权失效 | `rg 'session_start\|middleware\|__construct'` | **变量覆盖**（`extract($_GET)` / `$$k=$v` / `foreach($_GET as $k=>$v) $$k=$v`）可覆写 `$isAdmin` 类标志 → `php-variable-overwrite` |
| **Go** | **中间件漏挂分组**（四种模式：整个 `r.Group` 没 `.Use(auth)` / 单个路由写在鉴权组外 / `r.With()` 用错 / `http.HandleFunc` 裸注册）；`return` 写在错误分支外导致继续执行 | `rg 'r\.Group\|\.Use\(\|HandleFunc'` + 对照每个组 | JWT：`jwt.Parse` 未校验 `alg` / 错误分支 `if err != nil {}` **空着不 return** |
| **Node/TS** | NestJS Guard 未挂 / Koa 中间件顺序 | `rg '@UseGuards\|app.use'` | `jsonwebtoken` `verify(...,{algorithms:['none']})` |
| **Python** | Django 中间件顺序 / FastAPI `Depends` 漏挂 | `rg 'MIDDLEWARE\|Depends\('` | `jwt.decode(verify_signature=False)` / Flask `SECRET_KEY` 弱 |
| **Ruby** | `before_action` 漏 `only/except` | `rg 'before_action'` | `secret_key_base` 泄露 → cookie 伪造 |
| **C#/.NET** | `[AllowAnonymous]` 误用 / 中间件顺序 | `rg 'AllowAnonymous\|UseAuthorization'` | JWT `ValidateIssuerSigningKey=false` |
| **跨语言** | **XFF 头信任**：`getHeader("x-forwarded-for")` 直取不校验代理链 | `rg 'x-forwarded-for\|X-Forwarded-For\|Proxy-Client-IP'` | 若该值参与 **IP 白/黑名单判定** → 伪造头绕过；若仅入**审计日志** → 污染溯源。见 `java-spring.yml: java-trusted-xff-header` |

### 1.8 其余（原型污染 / Mass Assignment / 弱随机 / 硬编码 / 内存安全 / 配置）

| 漏洞类型 | 各语言要点 |
|---------|-----------|
| **原型污染** | Node：`_.merge` / `_.set` / `Object.assign` / `deepmerge` / `$.extend(true)` / `mergeConfig`。★ **必须 source + gadget 同时成立**；只有读侧影响（崩溃/异常）**只能报 DoS，不能报 RCE** |
| **Mass Assignment** | **Java**：`@RequestBody $T $OBJ` 直接进 `update$Xxx($OBJ)`，用户可覆写 `roleId`/`deptId`/`status`/`createBy` 提权（`java-spring-mass-assignment`）；**RuoYi 系统管理类接口高发**。**Node**：NestJS `@Body()` 无 `whitelist`（`stripProtoKeys` **只删 `__proto__`**）/ `c.Bind`。**Python**：DRF serializer 未 validated 字段。**Ruby**：`params[:x]` 直接 update / `permit!` / `to_unsafe_h`。**C#**：`[FromBody]` + `[BindNever]`/`[Editable(false)]` **对 JSON 无效**，只有 `[JsonIgnore]`/DTO 有效 |
| **弱随机（安全上下文）** | **Java**：安全类里用 `new Random()`（非 `SecureRandom`）→ 验证码/令牌可预测（`java-weak-prng-in-security-context`）。**Go**：`math/rand`（gosec G404）。**C#**：`Random` 非 `RandomNumberGenerator`。**Python**：`random` 非 `secrets`。★ 定位技巧：**`new Random()` 满世界都是**，必须限定在类名带 `captcha\|token\|verify\|otp\|nonce\|sign\|secret` 语义的类里才不是噪声 |
| **硬编码凭据/密钥** | 通用：云 AK/SK、平台 token、连接串口令、私钥块、签名密钥、SQL 种子默认口令、弱默认口令（`rules/generic-secrets.yml` 9 条）。**Java 专有**：Druid `ruoyi:123456`、数据源口令、JWT 密钥。**Go**：`gosec G101`。★ `generic-private-key-no-pem-header` 实测精确率 **100%** |
| **调试/控制台暴露** | **Java**：Actuator `management.endpoints.web.exposure.include: *`（`java-spring-actuator-exposed`）、Druid `/druid/*` 未授权、Swagger 生产暴露。**Go**：`net/http/pprof`（G108）、`0.0.0.0` 绑定（G102）。**Python**：`app.run(debug=True)`（Werkzeug PIN）/ Django `DEBUG=True`。**Ruby**：`consider_all_requests_local=true`。**C#**：`customErrors mode="Off"` / `debug="true"` |
| **安全配置缺陷** | **Java**：CSRF `csrf().disable()`（`java-spring-csrf-disabled`）、开放重定向 `new RedirectView($URL)` / `sendRedirect`。**Go**：`net/http` 未设超时（G112/G114）、HTTP 请求走私（G113 冲突头/裸 LF）、`ssh.InsecureIgnoreHostKey`（G106）。**XSS 过滤器放行**：`excludes: /system/notice`（`generic-xss-filter-excluded-endpoint`，需与前端 `v-html` 交叉确认才成立） |
| **格式化字符串** | **C/C++ 专有**：`printf(user)` / `fprintf(f,user)` / `syslog(_,user)` / `sprintf(b,user)` |
| **内存安全** | **C/C++ 专有**：`strcpy`/`strcat`/`sprintf`/`gets`/`memcpy` 长度失控；整数溢出；UAF/double free；off-by-one。★ **静态只能出候选，必须 ASan/UBSan/Valgrind 复现才算数**。编译期 `-D_FORTIFY_SOURCE=2 -fstack-protector-strong` 只**缓解**不算修复 |
| **运行时/框架 N-day** | Node：`path-to-regexp`/`qs`/`express`/`koa`/`fastify`/`busboy`。Python：Django `_connector`/`values()`/`python-multipart`。Ruby：`actionpack`/`rack`/`sinatra`。C#：`Kestrel`（CVE-2025-55315 走私 9.9）/`System.Text.Json`。C：`libxml2`/`libarchive`/`curl`。★ **先核版本对 NVD，再打**；"装了但模块没启用"要先确认可达性 |

---

## 2. 快速定级口诀（读完表再读这 9 条）

1. **有 OOB/DNSLog 可确认的**（命令执行 / SSRF / XXE / 模板注入）→ 直接打，一条链到 RCE。
2. **纯注入类**（SQL/NoSQL/LDAP）→ 先判是否参数化，再判是否需要盲注外带。
3. **反序列化类**（除 C/C++）→ 判"攻击者能否控制序列化字节流"，能则直接高危。**Java 额外一步**：看是原生（`ObjectInputStream`）还是 Fastjson/Jackson（需 autotype/typing 开启）；**Ruby 额外一步**：先看 Ruby/Psych 版本，`YAML.load` 在 Psych 4 上不是洞。
4. **沙箱类**（`vm`/`vm2`/`sandboxjs`/`enclave-vm`）→ context 里出现**任一宿主对象引用**即一票否决；**"换个沙箱库"不是修复**。
5. **原型污染类** → 必须 **source + gadget 同时成立**；只有读侧影响只能报 DoS。
6. **模板类** → 先看 `compile()` 的实参**类型能否是 object（AST）**；能则不需要原型污染也能 RCE。
7. **配置即漏洞类**（不依赖代码逻辑）→ ViewState 的 machineKey 查 `aka.ms/exposed-machine-keys`、`enableViewStateMac="false"`、Django `DEBUG=True`、`app.run(debug=True)`、Actuator `exposure.include: *`：命中即定级。
8. **C/C++ 内存类** → 静态只能出候选，**必须 ASan/UBSan/Valgrind 复现**才算数。
9. **第三方控件类**（Telerik/Sitecore/Umbraco/CMS/备份软件）→ 先核版本对 NVD，**"装了但模块没启用"要先确认可达性再报**。

---

## 3. 语言特异的"不许误报"清单（反过来的坑）

有些写法**看着像洞，实际是安全设计**。本模块在基准真相上踩过这些，列出来防止重复：

| 语言 | 看着像洞 | 实际为什么不是 |
|------|---------|--------------|
| **Java** | MyBatis `#{}` | PreparedStatement 占位符，安全；只有 `${}` 才是注入 |
| **Java** | `MultipartFile.transferTo()` | Spring 上传标准 API，RuoYi 处有扩展名 + MIME **双白名单** |
| **Java** | `params.dataScope` | MyBatis 数据权限占位符，**服务端拼装且拼前清空** |
| **Java** | `invokeTarget` | quartz 反射调用，有**白名单 + 黑名单**双重校验 |
| **Java** | `Constants.RESOURCE_PREFIX + "/" + dir` | 拼的是**对外 URL 前缀**，不是文件系统落地路径 |
| **Java** | `vAllowed.get(name).contains(paramName)` | 表单属性白名单校验，与 Referer/域名匹配无关 |
| **Java** | `request.getRemoteAddr()` | 直接取 socket 来源，不可伪造（对比 `getHeader("X-Forwarded-For")`） |
| **Go** | `exec.Command("cmd", args...)` 参数可控 | Go **不经过 shell**，`;`/`&&` 无效 —— 必须 name 本身可控 |
| **Go** | `encoding/xml` 解析用户 XML | Go **默认不解析外部实体**，XXE 基本不成立 |
| **Go** | `encoding/json` 反序列化 | 默认安全；风险在 `map[string]interface{}` + 类型断言导致的逻辑绕过 |
| **Go** | `filepath.Join` | 它**不**过滤 `../` —— 这个是真洞，不是 FP（反向列出，提醒别放过） |
| **Ruby** | `YAML.load` | Psych 4 起等同 `safe_load`，先看版本 |
| **C#** | `[BindNever]` / `[Editable(false)]` | **对 JSON 绑定无效**，只有 `[JsonIgnore]`/DTO 有效（反向列出，提醒别放过） |
| **PHP** | `htmlspecialchars($x)` | 只防 XSS，**不防 SQLi**，别当作净化 |
| **PHP** | `addslashes($x)` | 宽字节注入（GBK）可绕，`mysql_real_escape_string` 才基本可靠 |

---

## 4. 与四级闭环的衔接

本表产出的全部是 **L0（静态命中）**。往下走：

```
L0 本表定位 sink        → 三问：source 可控？净化有效？危害闭合？
L1 路由可达             ★ 卡在这里一律不算漏洞 —— 必须找到真实可访问的入口
L2 动态实证             真实请求 + 响应证据（Burp 包）
L3 影响闭环             说明读到什么/写到哪/影响哪些真实对象
```

完整闭环定义与抬升手法见 `VERIFY_LOOP.md`。
