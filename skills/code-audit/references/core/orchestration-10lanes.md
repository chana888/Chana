# 10 路子审计编排协议（平台版核心）

> **本文件是代码审计会话的执行总纲**：主审计 agent 按本协议把审计拆成 10 路子审计（反序列化×2、RCE×3、SQL×1、SSRF/XXE×1、文件类×1、认证越权×1、配置供应链×1），
> 每路独立找 sink 并深挖，最后由主审计汇总去重、对高价值 sink（RCE/反序列化）做数据流回溯，判定真实危害。
> 范式（2026 共识）：**静态分析圈定候选 source/sink → 分域子审计（发现+初判）→ 污点传播追踪确认可利用性**。不靠单次通读代码找漏洞。
>
> 配套文件：`agent.md`（D1-D10 维度/状态机/防幻觉）、`sinks-crosslang.md`（22类×8语言 sink 总表）、`verify-loop.md`（L0-L3 实证闭环）。

## 深度纪律（先读，违反=审计不合格）

1. **细致条款**：真实深度审计以小时计，工具调用数百步起步。**禁止在 15 分钟内宣布"审计完成"**；项目大不是降级理由，是分模块逐路更仔细的理由。
2. **全量覆盖不采样**：每路 grep/semgrep 的命中**全部过目并逐条记录**，不许"抽查前 20 条"式采样。搜索路径必须覆盖插件/扩展/SDK/示例/配置（见 agent.md 模块覆盖矩阵）。
3. **每命中必看上下文**：任何 sink 命中必须 `read_file`/`grep -C` 看前后 ≥30 行——路由注册、鉴权注解、净化调用都在上下文里。
4. **高置信度原则**：只把"明确的漏洞模式 + 攻击者可控输入路径"记为候选；纯理论/配置偏好明确标"不构成"。
5. **每路必交产物**：没产出 findings 的路必须写明"扫描了什么模式、多少命中、为何全部排除"，不许留空。

## 阶段 0：侦察（一次性，供 10 路共用）

```bash
cd <项目根>
find . -name "*.java" -o -name "*.py" -o -name "*.go" -o -name "*.php" -o -name "*.js" -o -name "*.ts" | grep -v node_modules | grep -v vendor | wc -l  # 规模
cat pom.xml 2>/dev/null | grep -A2 "<artifactId>" | head -60   # 或 package.json / go.mod / requirements.txt / composer.json
find . -path ./node_modules -prune -o -type d -print | grep -vE "node_modules|vendor|\.git|dist|build|target" | head -40
```

产出：语言清单、框架识别（Spring/SpringBoot/ThinkPHP/Django/Gin/…）、模块目录清单（写入各路 [搜索路径]）、危险依赖版本初判（fastjson/log4j/shiro/struts 版本号记下）。

## 阶段 A+B：10 路 sink 扫描与分域子审计

每路先跑扫描模式拿命中清单，再**逐条深挖**（读上下文→找 source→初判可疑度）。
并发建议：10 路的扫描命令可用 `execute` 后台并发（`&` + 收结果），深挖阶段逐路串行做。

### A1 路：Java 反序列化（★高价值，最仔细）

```bash
grep -rn --include="*.java" -E "ObjectInputStream|readObject\(|readUnshared|XMLDecoder" <路径>
grep -rn --include="*.java" -E "XStream|HessianServlet|@HessianService|KryoSerializer|SerializationUtils\.deserialize" <路径>
grep -rn -E "rememberMe|Abstract rememberMeManager|CookieRememberMeManager" --include="*.java" <路径>   # Shiro
grep -rn -E "JSON\.parseObject|parse\(|@type|autoTypeSupport|ParserConfig" --include="*.java" --include="*.properties" --include="*.yml" <路径>  # Fastjson
grep -rn -E "enableDefaultTyping|activateDefaultTyping|ObjectMapper" --include="*.java" <路径>  # Jackson polymorphic
```
深挖：入口是否 HTTP 可达（Controller/RPC/Hessian 端点）；classpath 有哪些 gadget 依赖（commons-collections/beanutils/rome/shiro 自身）→ 对照 `languages/java_gadget_chains.md`（107+ 链）；Fastjson 版本对照 `languages/java_fastjson.md`。

### A2 路：非 Java 反序列化

```bash
# Python
grep -rn --include="*.py" -E "pickle\.loads?|cPickle|yaml\.load\(|yaml\.unsafe_load|jsonpickle\.decode|dill\.loads?" <路径>
# PHP
grep -rn --include="*.php" -E "unserialize\(|__wakeup|__destruct|__toString|phar://" <路径>
# Node/Ruby/.NET
grep -rn --include="*.js" -E "node-serialize|serialize\.unserialize|eval\(Buffer" <路径>
grep -rn --include="*.rb" -E "Marshal\.load|Oj\.load" <路径>
grep -rn --include="*.cs" -E "BinaryFormatter|ObjectStateFormatter|ViewState|JavaScriptSerializer|NetDataContractSerializer|LosFormatter" <路径>
```
深挖：yaml.load 有无 Loader=SafeLoader；unserialize 的输入是否用户可控（cookie/参数/缓存/数据库回读链）；PHP gadget 链（`__destruct` 类清单）。

### B1 路：RCE·命令注入

```bash
grep -rn --include="*.java" -E "Runtime\.getRuntime\(\)\.exec|ProcessBuilder|\.start\(\)" <路径>
grep -rn --include="*.py" -E "os\.system|subprocess|commands\.|os\.popen|eval\(|exec\(" <路径>
grep -rn --include="*.php" -E "system\(|passthru|shell_exec|exec\(|popen\(|proc_open|pcntl_exec|\`.*\\$" <路径>
grep -rn --include="*.go" -E "exec\.Command|exec\.CommandContext|syscall\.Exec" <路径>
grep -rn --include="*.cs" -E "Process\.Start|ProcessStartInfo|Cmd\.Execute|" <路径>
```
深挖：命令参数是否拼接（String cmd = "ping " + ip）；有无白名单/escapeshellarg/shlex.quote；shell=True 且字符串参数。

### B2 路：RCE·表达式与模板注入（SSTI/SpEL/OGNL）

```bash
grep -rn --include="*.java" -E "SpelExpressionParser|parseExpression|Ognl\.|OgnlUtil|MVEL|ScriptEngine|getEngineByName|GroovyShell|GroovyClassLoader" <路径>
grep -rn --include="*.java" --include="*.xml" -E "freemarker\.(template|core)|Configuration\.setClassForTemplateLoading|Template\b|velocityEngine|VelocityEngine" <路径>
grep -rn --include="*.py" -E "render_template_string|Jinja2\(|from_string|Template\(" <路径>
grep -rn --include="*.php" -E "Twig.*render|Smarty|->fetch\(|->display\(" <路径>
```
深挖：模板名/模板内容是否用户可控（JeecgBoot queryFieldBySql 类 SSTI 就是 sql 参数进 Freemarker）；SpEL 表达式入参点。

### B3 路：RCE·JNDI/动态加载/脚本入口

```bash
grep -rn --include="*.java" -E "InitialContext|lookup\(|JndiTemplate|RMI|ldap://" <路径>
grep -rn --include="*.java" -E "Class\.forName|URLClassLoader|defineClass|loadClass|reflect\.Reflect" <路径>
grep -rn -E "jdbc:(mysql|postgresql|h2|derby)|autoDeserialize|allowLoadLocalInfile" --include="*.java" --include="*.yml" --include="*.properties" <路径>  # JDBC 反序列化/恶意连接串
grep -rn -E "groovyConsole|bsh\.servlet|ScriptServlet|/jmx-console|/manager/html" --include="*.xml" --include="*.java" -r <路径>  # 中间件脚本入口
```
深挖：lookup 参数可控性（低版本 JDK + 出网 = 直接 RCE）；defineClass 字节码来源；H2/Derby 连接串用户可控（JDBC RCE）。

### C 路：SQL 注入

```bash
grep -rn -E '\$\{' --include="*.xml" <路径> | grep -viE "mapper|result|#\{" | head   # MyBatis ${}（排除注解位置误报后逐条看）
grep -rn --include="*.java" -E "Statement|createQuery\(|createNativeQuery|jdbcTemplate\.(query|update|execute)" <路径> | grep -E "\\+|concat|String\.format" 
grep -rn --include="*.py" -E "\.execute\(|\.executemany\(|text\(" <路径> | grep -E "%s\\s*%|\\+|f'" 
grep -rn --include="*.php" -E "mysql_query|mysqli_query|->query\(|->exec\(" <路径> | grep -E "\\$"
grep -rn -E "orderBy|sortName|sortField|order\[" --include="*.java" --include="*.xml" <路径>  # 排序字段注入（正方系通杀位）
```
深挖：`${}` 与 `#{}` 区分（`#{}` 预编译不算）；order by / like / in 无法参数化的位置；预编译失效场景（表名/列名拼接）。

### D 路：SSRF + XXE

```bash
grep -rn -E "URL\(|HttpClient|openConnection|RestTemplate|WebClient|OkHttp|Jsoup\.connect" --include="*.java" <路径>
grep -rn -E "requests\.(get|post)|urlopen|httpx\.|aiohttp|curl_exec|file_get_contents\(.{0,10}http" --include="*.py" --include="*.php" <路径>
grep -rn -E "DocumentBuilderFactory|SAXParser|XMLReader|XMLInputFactory|etree\.parse|simplexml|libxml" --include="*.java" --include="*.py" --include="*.php" <路径>
```
深挖：URL 参数可控→内网探测/云元数据（169.254.169.254/100.100.100.200）；XXE 看 setFeature/disallow-doctype-decl 有无关闭；图片/头像/导出/webhook 类功能是 SSRF 高发位。

### E 路：文件类（上传/穿越/任意读写/包含）

```bash
grep -rn -E "MultipartFile|transferTo|File\(|Paths\.get|Files\.(write|copy|move)|new FileWriter|FileUtils\.(write|copy)" --include="*.java" <路径>
grep -rn -E "move_uploaded_file|\$_FILES|fopen\(|file_put_contents|include\s*\(?\s*\\$|require\s*\(?\s*\\$|readfile\(" --include="*.php" <路径>
grep -rn -E "open\(|os\.path\.join|send_file|send_from_directory|shutil\.(copy|move)" --include="*.py" <路径>
grep -rn -E "ZipEntry|getName\(\)|tarfile|extractall" --include="*.java" --include="*.py" <路径>  # Zip Slip
```
深挖：上传后缀黑白名单校验逻辑（绕过点：大小写/双写/%00/解析漏洞/Content-Type 只判头）；保存路径拼用户输入；下载接口 id→path 映射可控（任意文件读）；include/require 动态包含。

### F 路：认证/越权/业务逻辑

```bash
grep -rn -E "@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping" --include="*.java" <路径> | wc -l   # 端点总数
grep -rLn -E "@RequiresPermissions|@PreAuthorize|@RequiresRoles|checkPermission|getLoginUser" --include="*Controller.java" <路径>  # 无权限注解的 Controller（再人工分公共/遗漏）
grep -rn -E "permitAll|excludePathPatterns|addPathPatterns|WhiteList|ignore-url|noAuth" --include="*.java" --include="*.yml" <路径>  # 鉴权白名单
grep -rn -E "secret|password|apikey|api_key|access_key|token" --include="*.yml" --include="*.properties" --include="*.py" --include="*.go" <路径> | grep -vE "\\\$\{|env\.|getenv" | head -40  # 硬编码
grep -rn -E "AES|DES|Cipher\.getInstance|ECB|MD5|sha1\(" --include="*.java" --include="*.py" <路径> | grep -iE "ecb|des/|md5|secretkey" | head -30  # 加密误用
```
深挖：**端点-权限矩阵**（agent.md Phase 1 方法）：逐 Controller 列 {路径, 方法, 鉴权, 归属校验}；IDOR 找"id 入参 + 查询无归属过滤"；水平越权对照前台/后台两套接口。

### G 路：配置/供应链/已知组件漏洞

```bash
grep -rn -E "management\.endpoints|actuator" --include="*.yml" --include="*.properties" <路径>
grep -rn -E "druid|swagger|api-docs|knife4j" --include="*.yml" --include="*.xml" <路径>
cat pom.xml 2>/dev/null | grep -E "fastjson|log4j|shiro|struts|commons-collections|spring-<|druid|xstream" -A1   # 版本对照 N-day
ls -la .env* config/*.yml 2>/dev/null; cat .env 2>/dev/null | head -20
grep -rn -E "spring\.cloud\.gateway|route\.uri|RewritePath" --include="*.yml" <路径>  # 网关 SpEL/路由注入位
```
深挖：依赖版本对照 `/opt/ammo/kb/srcwiki_poc/`（开发框架漏洞/_index.md、CVE 索引）——fastjson/log4j/shiro/struts/spring 命中版本直接取 POC 验证条件；actuator 暴露端点清单（env/heapdump 直接高危）。

### 每路输出格式（写会话文件 `audit/lane_<路名>.md`）

```markdown
## A1 Java反序列化
- 扫描模式: <实际执行的命令>
- 命中总数: N（全部过目，M 条排除原因：…）
- 候选 findings:
  | # | file:line | 片段摘要 | 可控输入点 | 初判 | 可疑度(高/中/低) |
- 排除项与理由: …（如 "readObject 只用于内部缓存序列化，输入非用户可控"）
```

## 阶段 C：主审计汇总

1. 合并 10 路 findings，同 file:line 去重；同类漏洞聚簇（如同一个 Controller 多个注入点）
2. 生成总 sink 清单表（路 × 候选数 × 高可疑数），对照 D1-D10 覆盖矩阵标已覆盖维度
3. **强制覆盖检查**：D1(注入)+D2(认证)+D3(授权)+D4(RCE) 未覆盖不得进报告阶段（agent.md 门控）

## 阶段 D：高价值深挖（★主审计核心职责）

对 **A1/A2/B1/B2/B3 全部候选** + C/D/E/F 路高可疑候选，逐条做数据流回溯：

1. **Source 定位**：从 sink 向上追——HTTP 参数/Header/Cookie/文件上传/数据库回读/RPC/消息队列，哪条是攻击者可控
2. **净化检查**：传播路径上的过滤/白名单/参数化/类型转换，能否实际拦住（看实现不看名字，`filter()` 可能是摆设）
3. **路由可达性（L0→L1）**：拼出完整 HTTP 请求（方法+路径+参数+鉴权前置）；三个前缀陷阱必查：context-path / 网关前缀 / 前端代理前缀（verify-loop §2）
4. **利用链成立判定**：RCE/反序列化类要写到"攻击者发送什么 → 触发什么 gadget/命令 → 达成什么"完整链条
5. **N-day 联动**：G 路版本命中 → 从 `/opt/ammo/kb/srcwiki_poc/` 取对应 POC 请求包，与代码条件（配置开关/版本号）交叉验证

## 阶段 E：判定与产出

- 每条走 `verify-loop.md` L0-L3 阶梯：**卡在 L1（路由推不出/鉴权拦死/输入不可控）一律归档"未成立"，不进报告**
- 确认有危害的 → `record_vulnerability` 逐条落库（title/severity/type/target/POC/影响/修复建议），报告附 **Burp 原始请求包格式**（L1 可推演的给完整请求，L2 需实测的标注"待动态验证"并给验证步骤）
- 纯理论/配置项/信息级 → 明确写"不构成漏洞"与原因（对照渗透脑判定门槛，防水洞）
- 审计报告结构：执行摘要 → 项目画像 → 10 路覆盖矩阵 → 确认漏洞（含利用链）→ 未成立项与排除理由 → 修复优先级

## 运行环境（平台 VPS）

- Linux，`grep -rn --include` 是主力；无 rg 时不要写 rg 命令
- **semgrep 1.179 已装**：语义规则补充 grep 盲区——`semgrep scan --config p/java --json -o /tmp/sg.json <路径>`（大项目按模块分批跑，p/generic、p/python、p/php 同理）；命中同样逐条过目
- Docker 已停用：`core/docker_verification.md` 的沙箱动态验证**跳过**，L2 动态实证改为——授权场景下联动渗透会话实测，或给出可执行的验证请求由用户确认后实测
- 长命令/Payload 一律先 `write_file` 到会话目录再执行（渗透脑 Shell 分工条款）
