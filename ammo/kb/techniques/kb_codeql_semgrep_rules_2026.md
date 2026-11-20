---
name: kb-codeql-semgrep-rules
description: CodeQL/Semgrep 自动审计规则编写专题纵深——QL 语法、TaintTracking 污点配置、自定义 query、grep-rule 正则挖掘、误报压制、CI 集成、10 条可复制规则库
tags: [代码审计, SAST, 白盒, CodeQL, Semgrep, QL, taint-tracking, grep-rule]
date: 2026-08-14
---

# CodeQL / Semgrep 自动审计规则编写专题纵深

> 定位：比 `kb_code_audit_source_2026.md`（工具链概览）**深一层的规则编写专题**。
> 读者：已有白盒审计基础（入口点→数据流→Sink），目标是自己写规则批量扫源码。
> 铁律：写完规则必须 `--test`/靶场闭环验证；工具输出=线索，Burp 验证=结论。

## 0. 三层规则体系选型

| 层 | 工具 | 能力 | 误报 | 适用 |
|----|------|------|------|------|
| L1 | grep-rule/graudit | 正则找危险函数 | 极高 | 海量源码初筛、锚点 |
| L2 | Semgrep | AST+结构化匹配+taint | 中 | 已知模式批量扫、补盲区 |
| L3 | CodeQL | 全链路污点+路径图 | 低 | 深挖数据流、出报告、N-day 复现 |

铁律：L1 收敛线索 → L2 批量过滤 → L3 确认数据流，三层串联才闭环。

## 1. CodeQL 深入

### 1.1 QL 语法基础

```ql
import java
predicate isDanger(Method m) { m.getName() = "exec" }      // 谓词=逻辑声明
exists(MethodAccess m | m.getMethod().getName() = "exec")  // 量词 exists/forall
```

要点：头部元数据注释(`@kind`/`@id`/`@problem.severity`)必需；谓词间=逻辑与，同名重复谓词=逻辑或；`from...where...select` 三段式声明求值，select 多列时末列是路径标签。

### 1.2 数据流与污点分析（2025 新范式 ConfigSig）

```ql
// 三件套：模块实现 ConfigSig → TaintTracking::Global 实例化 → flowPath 查询（完整模板见 §6.1 R1）。
module XCfg implements DataFlow::ConfigSig { predicate isSource(Node n) { n instanceof RemoteFlowSource } }
module XFlow = TaintTracking::Global<XCfg>;
import XFlow::PathGraph
from XFlow::PathNode s, XFlow::PathNode k where XFlow::flowPath(s, k)
select k.getNode(), s, k, "注入", s.getNode(), "用户输入"
```

ConfigSig 六谓词：`isSource`(起点：`RemoteFlowSource`/`LocalFlowSource`/`ActiveThreatModelSource`)、`isSink`、`isBarrier`(阻断)、`isAdditionalFlowStep`(保值传播)、`isAdditionalTaintStep`(仅污点，如拼接/Base64)、`isSanitizer`(净化)。新旧映射：`isAdditionalFlowStep`≈旧 `isAdditionalTaintStep`；`isBarrier`≈旧 `isSanitizer`。旧式 `extends TaintTracking::Configuration`+`hasFlowPath(PathNode)` 仍兼容。坑：`hasFlowPath` 用 `PathNode`、`hasFlow` 用 `Node`；污点步后继用 `getALocalSource()` 追回局部变量（全局变量传播更严）；命中停在 `PropWrite` 时补 `pred=write.getRhs() and succ=write.getBase()`。

### 1.3 库建模 sourceModel/sinkModel/summaryModel

CodeQL 读不到依赖 jar，第三方库必须建模，写 `*.model.yml`（各语言同构）：

```yaml
extensions:
  - addsTo: { pack: codeql/java-all, extensible: sourceModel, data: [
      ["org.apache.http.client.methods","HttpGet",False,"HttpGet","(String)","","Argument[0]","remote","manual"],
      ["org.mybatis","SqlSession",False,"selectList","(String,...)","","Argument[0]","sql-injection","manual"],
      ["com.example","CipherUtil",False,"decrypt","(String)","","Argument[0]","ReturnValue","taint","manual"] ] }
```

Access Path(第7列)：`ReturnValue` / `Argument[N]` / `Argument[this]`(接收者) / `.Property[Name]` / `.Element`(集合元素)。kind：source 用 `remote`/`file`/`database`/`commandargs`/`environment`/`stdin`；sink 用 `sql-injection`/`command-injection`/`path-injection`/`code-injection`/`xss`/`url-redirection`。威胁模型：`remote`/`local`/`android`；只信远程用 `ActiveThreatModelSource`，`--threat-model` 可关 local 源降噪。先挂 `codeql-community-packs`（GitHub 发布）再写规则，避免漏报。

### 1.4 常用库速查 + CLI

| 语言 | 数据流库 | 预置 source |
|------|---------|------------|
| Java | `semmle.code.java.dataflow.TaintTracking` | `...FlowSources`(`RemoteFlowSource`) |
| Python | `semmle.python.dataflow.new.TaintTracking` | `semmle.python.Concepts` |
| JS | `semmle.javascript.dataflow.TaintTracking` | `...FlowSources` |
| Go | `semmle.go.dataflow.TaintTracking` | `...security.dataflow.FlowSources` |

```bash
codeql database create /tmp/db --language=java --source-root=/path/src --command="mvn -B -DskipTests compile" --overwrite
codeql database analyze /tmp/db codeql/java-queries --additional-packs=./my-queries --format=sarif-latest -o out.sarif
# 单条调试：codeql query run --database=/tmp/db my-rule.ql --format=sarif-latest -o out.sarif
```

抄作业首选：`codeql/<lang>/ql/src/Security/CWE-*/` 的 `SqlInjection.ql`/`UnsafeDeserialization.ql`/`XSS.ql` 全是现成 Config，改 source/sink 即可。

## 2. Semgrep 规则编写

### 2.1 YAML 结构与匹配操作符

```yaml
rules:
  - id: java-eval-code-injection        # 命名：lang-vuln-子类
    languages: [java]
    severity: ERROR
    patterns:                           # 所有子模式 AND
      - pattern: (ScriptEngine $e).eval($CODE)
      - pattern-not: (ScriptEngine $e).eval("...")  # 排除常量
      - metavariable-regex:             # 元变量内容约束
          metavariable: $CODE
          regex: .*(request|param|input|user).*
```

操作符对照：`pattern`单模式 / `patterns`AND / `pattern-either`OR / `pattern-inside`限定外层(如 Controller 方法) / `pattern-not-inside`排除外层(跳 @Test) / `pattern-not`负匹配 / `pattern-regex`正则 / `metavariable-regex`元变量正则(比 pattern-regex+focus 抗格式干扰) / `metavariable-pattern`元变量嵌套模式 / `metavariable-comparison`数值比较(`$PORT>1024`) / `focus-metavariable`收窄定位(可多值，集合语义) / `fix`自动修复模板。

### 2.2 taint 模式（数据流漏洞正解）

```yaml
rules:
  - id: python-ssrf
    languages: [python]
    severity: ERROR
    mode: taint
    pattern-sources:
      - pattern: (flask.Request $req).args.get(...)
      - pattern: django.http.request.$REQ.GET.get(...)
    pattern-sanitizers:
      - pattern: urllib.parse.urlparse(...)   # 解析≠安全，谨慎用
    pattern-sinks:
      - pattern-either:
          - pattern: requests.get($URL, ...)
          - pattern: requests.post($URL, ...)
          - pattern: urllib.request.urlopen($URL, ...)
    options:
      taint_assume_safe_booleans: true   # 布尔不污
      taint_assume_safe_numbers: true    # 数字不污
```

四个操作符：`pattern-sources`(必填)/`pattern-sinks`(必填)/`pattern-sanitizers`(可选)/`pattern-propagators`(可选,跨容器/字段)。**source 和 sink 的同名元变量不做统一**。降误报 options：`taint_assume_safe_booleans/numbers/indexes/functions`、`taint_only_propagate_through_assignments`、`exact:true`(只算匹配表达式本身)。

### 2.3 撰写技巧与性能

1. 窄起步逐步放宽：先写精确命中真实漏洞的模式，跑库确认 100% 准确再放宽；2 条 100% 规则优于 200 条 50%。
2. 先测试后优化：`semgrep --test` 必须有正例(漏洞命中)+反例(安全不命中)；避免 `$FUNC(...)` 过度泛化，锁定具体危险函数；`focus-metavariable` 收窄报告点，少用多个 `pattern-regex` 扫大文件。
3. 规则入 git+review；`# nosemgrep` 抑制率过高=规则该改；一文件一规则。

## 3. grep-rule 正则挖掘

### 3.1 危险函数正则库

```bash
grep -rEn "mysql_query|mysqli_query|->query\(|createQuery|\.Raw\(|cursor\.execute\(.*%|\.exec\(.*\+"   # SQLi
grep -rEn "system\(|shell_exec|passthru|popen\(|proc_open|Runtime\.exec|ProcessBuilder|exec\.Command|os\.system|subprocess\.Popen|eval\(|assert\(|jshell"  # RCE/表达式
grep -rEn "include\(|require\(|move_uploaded_file|file_put_contents|zip_entry_read|os\.path\.join\(.*request"  # 文件/LFI/穿越
grep -rEn "unserialize\(|pickle\.loads|readObject|yaml\.load\(|parseObject|XMLDecoder"                    # 反序列化
grep -rEn "curl_init|file_get_contents\(.*http|requests\.(get|post)|urlopen|http\.Get|openConnection\(|RestTemplate"  # SSRF
```

### 3.2 挖掘技巧与误报压制

1. 分轮扫：注入类(SQL/命令/LDAP)→XSS/CSRF/SSRF→反序列化/上传/硬编码，每轮收敛到几十条。
2. 永远 `-n -C 5` 看前后文，判断有无 `prepare`/`intval`/白名单净化；变量回溯：命中 `$X` 后 `grep -rn "$X\s*="` 上游找赋值，`git log -S` 找新增调用点(N-day)。
3. 压制：`grep -v "TODO\|/\*"` 剔注释；二次收敛 `| grep -E "request|param|getParameter|body|input"` 只看外部可控；排除 `vendor`/`node_modules`/`tests`；安全命中登记 `audit-ignore.txt`。

## 4. 误报压制统一方法论（三层通用）

| 手法 | CodeQL | Semgrep | grep |
|------|--------|---------|------|
| 类型净化 | `isBarrier`(int/long/Enum) | `taint_assume_safe_numbers/booleans` | `grep -v` 数字参数 |
| 白名单函数 | `isSanitizer` 匹配净化方法 | `pattern-sanitizers` | `grep -v "intval\|prepare"` |
| 上下文过滤 | 补真实传播步 | `pattern-inside`/`pattern-not-inside` | `-C 5` 人工判 |
| 忽略清单 | 配置排除路径 | `.semgrepignore`/`nosemgrep` | `audit-ignore.txt` |

核心：**每条静态报告默认按"可疑线索"看待**，过三关——① source 外部可控？② sink 真执行？③ 中间有净化/强类型？CodeQL 报"无法检测路径"多为中间步骤未建模（漏报），不是没漏洞。

## 5. CI 集成

### 5.1 GitHub Actions + CodeQL Action v3

```yaml
name: "CodeQL"
on: [push, pull_request, workflow_dispatch]
permissions: { actions: read, contents: read, security-events: write }
jobs:
  codeql:
    runs-on: ubuntu-latest
    strategy: { fail-fast: false, matrix: { language: [java-kotlin, python, javascript] } }
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: ${{ matrix.language }}, queries: security-extended }
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

2025 增量：`init@v3` 自动 diff-informed 分析(PR 只扫改动可达代码)，CLI 优先用缓存 overlay-base 库提速 20-58%，diff 算不出回退全量；私有仓库需 GitHub Advanced Security。

### 5.2 本地扫描 + SCA 联动

```bash
codeql database create db --language=python --source-root=./src
semgrep --config p/default --config ./custom-rules/ --json ./src
semgrep --config ./custom-rules/ --test           # 规则自测
semgrep ci --config p/owasp-top-ten --sarif --output semgrep.sarif
trivy fs --scanners vuln ./   # SCA 版本 → grep sink → CodeQL 确认 → 黑盒打
# 第三方 SARIF 回灌 Security tab：github/codeql-action/upload-sarif@v3
```

## 6. 规则库实战（10 条可复制规则）

> CodeQL 规则需自带头部元数据（`@kind path-problem`+`@id`，模板见 §6.1 R1）；每条标原理/压制/验证。

### 6.1 CodeQL · Java SQLi（path-problem 完整模板）

```ql
/**
 * @kind path-problem
 * @id java/sqli-custom
 * @problem.severity error
 */
// R1 原理：用户输入进 JdbcTemplate.queryForObject 首参=注入。压制：整数当 barrier。验证：拼接 SQL 命中。
import java
import semmle.code.java.dataflow.FlowSources
module SqlCfg implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node n) { n instanceof RemoteFlowSource }
  predicate isSink(DataFlow::Node n) {
    exists(MethodAccess m |
      m.getMethod().hasQualifiedName("org.springframework.jdbc.core","JdbcTemplate","queryForObject")
      and n.asExpr() = m.getArgument(0))
  }
  predicate isBarrier(DataFlow::Node n) {
    n.asExpr().getType().hasName("Integer") or n.asExpr().getType().hasName("int")
  }
}
module SqlFlow = TaintTracking::Global<SqlCfg>;
import SqlFlow::PathGraph
from SqlFlow::PathNode s, SqlFlow::PathNode k
where SqlFlow::flowPath(s, k)
select k.getNode(), s, k, "SQLi: $@ 流入 JdbcTemplate", s.getNode(), "用户输入"
```

### 6.2 CodeQL · Python 反序列化

```ql
// R2 原理：远程数据进 pickle/yaml.loads → RCE（官方 UnsafeDeserialization 简化版）。
import python
import semmle.python.dataflow.new.TaintTracking
module DeserCfg implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node n) { n instanceof semmle.python.Concepts::RemoteFlowSource }
  predicate isSink(DataFlow::Node n) {
    exists(Call c |
      c.getFunction().(Name).getId() = "loads" and
      c.getFunction().(Attr).getObject().(Name).getId() in ["pickle","yaml"] and
      n.asExpr() = c.getArg(0))
  }
}
module DeserFlow = TaintTracking::Global<DeserCfg>;
from DeserFlow::PathNode s, DeserFlow::PathNode k
where DeserFlow::flowPath(s, k)
select k.getNode(), s, k, "反序列化: $@ 进 loads", s.getNode(), "外部输入"
```

### 6.3 CodeQL · Java SSRF（Go 变体见注释）

```ql
// R3 原理：用户 URL 直入 openConnection/HttpClient.send。验证：http.Get(userUrl) 命中。Go 变体：import go，sink 改 http.Get 的 Argument[0]。
import java
import semmle.code.java.dataflow.FlowSources
module SsrfCfg implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node n) { n instanceof RemoteFlowSource }
  predicate isSink(DataFlow::Node n) {
    exists(MethodAccess m |
      m.getMethod().getName() = "openConnection" and n.asExpr() = m.getQualifier())
  }
}
module SsrfFlow = TaintTracking::Global<SsrfCfg>;
import SsrfFlow::PathGraph
from SsrfFlow::PathNode s, SsrfFlow::PathNode k
where SsrfFlow::flowPath(s, k)
select k.getNode(), s, k, "SSRF: $@ 流入 URL 请求", s.getNode(), "用户输入"
```

### 6.4 Semgrep · Java 命令注入（taint）

```yaml
# R4 原理：req 参数进 exec/ProcessBuilder。压制：数字/布尔不污。验证：req 拼接入 exec 命中。
rules:
  - id: java-cmd-injection-taint
    languages: [java]
    severity: ERROR
    message: 用户输入到达命令执行函数，可能命令注入 (CWE-78)
    metadata: { cwe: "CWE-78" }
    mode: taint
    pattern-sources:
      - pattern: (HttpServletRequest $REQ).getParameter(...)
    pattern-sinks:
      - pattern-either:
          - pattern: Runtime.getRuntime().exec(...)
          - pattern: (ProcessBuilder $P).command(...)
    options:
      taint_assume_safe_booleans: true
      taint_assume_safe_numbers: true
```

### 6.5 Semgrep · Python eval（跨语言通用变体见注释）

```yaml
# R5 原理：请求变量进 eval/exec。压制：字面量排除。验证：eval(user_input) 命中、eval("1+1") 不命中。
# 跨语言通用：languages 加 [javascript, typescript, php, ruby, java]，补 new Function($X)/ScriptEngine.eval($X) sink。
rules:
  - id: python-eval-code-injection
    languages: [python]
    severity: ERROR
    message: eval/exec 接收非常量表达式，可能任意代码执行 (CWE-95)
    metadata: { cwe: "CWE-95" }
    patterns:
      - pattern-either:
          - pattern: eval($CODE)
          - pattern: exec($CODE)
      - pattern-not: eval("...")
      - pattern-not: exec("...")
      - metavariable-regex:
          metavariable: $CODE
          regex: .*(request|input|arg|param|query|body).*
```

### 6.6 Semgrep · PHP SSRF / 命令注入

```yaml
# R6 原理：$_GET/$_POST 进 curl/file_get_contents(SSRF) 或 system/exec(RCE)。压制：filter_var IP 校验/escapeshellarg 净化。
rules:
  - id: php-ssrf-cmd
    languages: [php]
    severity: ERROR
    message: 用户输入进入远程请求或命令执行 (CWE-918/CWE-78)
    metadata: { cwe: "CWE-918" }
    mode: taint
    pattern-sources:
      - pattern-either:
          - pattern: $_GET[...]
          - pattern: $_POST[...]
          - pattern: $_REQUEST[...]
    pattern-sinks:
      - pattern-either:
          - pattern: curl_exec(...)
          - pattern: file_get_contents($URL)
          - pattern: fopen($URL, ...)
          - pattern: system($CMD)
          - pattern: exec($CMD)
          - pattern: shell_exec($CMD)
    pattern-sanitizers:
      - pattern: filter_var($X, FILTER_VALIDATE_IP)
      - pattern: escapeshellarg($X)
```

### 6.7 Semgrep · JS DOM XSS

```yaml
# R7 原理：DOM sink 接收非常量。压制：排除硬编码。验证：el.innerHTML = userInput 命中。
rules:
  - id: js-dom-xss
    languages: [javascript, typescript]
    severity: ERROR
    message: 不可信数据写入 innerHTML/outerHTML，DOM XSS (CWE-79)
    metadata: { cwe: "CWE-79" }
    mode: taint
    pattern-sources:
      - pattern: (document $D).querySelector($SEL).value
      - pattern: (location $L).search
    pattern-sinks:
      - pattern-either:
          - pattern: $EL.innerHTML = $X
          - pattern: $EL.outerHTML = $X
          - pattern: (document $D).write($X)
```

### 6.8 Semgrep · Java 路径穿越（Zip Slip/上传）

```yaml
# R8 原理：用户文件名/zip 条目直接拼 new File。验证：new File(ROOT+name) 命中。
rules:
  - id: java-path-traversal
    languages: [java]
    severity: WARNING
    message: 用户控制的路径进入文件操作，路径穿越 (CWE-22)
    metadata: { cwe: "CWE-22" }
    mode: taint
    pattern-sources:
      - pattern: (HttpServletRequest $REQ).getParameter(...)
      - pattern: (MultipartFile $F).getOriginalFilename()
    pattern-sinks:
      - pattern-either:
          - pattern: new File($PATH)
          - pattern: (Paths $P).get($PATH)
          - pattern: (FileOutputStream $F).<...>(new File($PATH))
    pattern-sanitizers:
      - pattern: $X.toPath().normalize()
```

### 6.9 Semgrep · Java 反序列化

```yaml
# R9 原理：请求体/参数直接 readObject/parseObject。验证：读 cookie→readObject 命中。
rules:
  - id: java-insecure-deserialization
    languages: [java]
    severity: ERROR
    message: 不可信数据进入反序列化，可能 RCE (CWE-502)
    metadata: { cwe: "CWE-502" }
    mode: taint
    pattern-sources:
      - pattern: (HttpServletRequest $REQ).getInputStream()
      - pattern: (Cookie $C).getValue()
    pattern-sinks:
      - pattern-either:
          - pattern: (ObjectInputStream $O).readObject()
          - pattern: com.alibaba.fastjson.JSON.parseObject($DATA, ...)
          - pattern: (ObjectMapper $M).readValue($DATA, ...)
```

### 6.10 grep-rule · 四类高危锚点一键集（L1 初筛）

```bash
# R10 命中=线索，转 R1-R9 确认。二次收敛到外部可控变量。
grep -rEn --include="*.{php,java,py,js,go,rb}" \
  -e "unserialize\(|pickle\.loads|readObject|yaml\.load|parseObject|XMLDecoder" \
  -e "Runtime\.exec|ProcessBuilder|os\.system|subprocess\.Popen|shell_exec|passthru" \
  -e "curl_init|file_get_contents\(|requests\.(get|post)|openConnection\(|http\.Get|Client\.Do" \
  -e "innerHTML|outerHTML|document\.write|eval\(" \
  --exclude-dir=vendor --exclude-dir=node_modules --exclude-dir=tests . \
  | grep -E "request|param|input|user|getParameter|\\\$_GET|\\\$_POST|req"
```

## 7. 测试验证方法与判定门槛

### 7.1 规则自测

```bash
# Semgrep 内置测试：tests/ 下建同名测试文件，用 // ruleid: id（应命中）与 // ok: id（不应命中）注释断言
semgrep --config ./rules/ --test        # 断言全通过
# CodeQL：复制官方 query 改参数 → 目标库跑 → 人工复核 10 条；命中率<50% 就补 barrier
```

### 7.2 判定门槛（SRC 报告四关）

1. 可复现(规则命中+人工确认+Burp/DNSLog 复现)。2. 有利用链(source→传播→sink 全链路)。3. 有明确影响(读库/执行/内网/敏感数据)。4. 有实证(完整请求/响应+payload 存档)。默认不构成漏洞：死代码/未注册路由、前置鉴权挡住 source、无真实数据流的纯正则匹配。

### 7.3 规则维护循环

```
新 N-day → grep 锚点 → Semgrep 快扫 → CodeQL 深挖 → 命中沉淀规则库 → 误报加 barrier/pattern-not → /rem 复盘
```

## Sources

- CodeQL 数据流/污点官方指南（ConfigSig、TaintTracking::Global、path 查询）：https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-java/ ；https://codeql.github.com/docs/write-codeql-queries/path-queries/
- CodeQL isAdditionalTaintStep：https://codeql.github.com/codeql-standard-libraries/java/semmle/code/java/dataflow/internal/tainttracking1/TaintTrackingImpl.qll/predicate.TaintTrackingImpl%24Configuration%24isAdditionalTaintStep.2.html
- CodeQL 社区实践（NodeJS taint/PropWrite 传播）：https://github.com/github/codeql/discussions/18373 ；https://github.com/github/codeql/discussions/12840
- Python CWE-502 实现：https://github.com/github/codeql/discussions/16891
- 模型规范+威胁模型：https://deepwiki.com/github/codeql/7.1.1-model-specification-format ；https://deepwiki.com/github/codeql/7.1.2-threat-model-categorization
- CodeQL Community Packs：https://github.blog/security/vulnerability-research/announcing-codeql-community-packs/
- Semgrep taint 模式：https://semgrep.dev/docs/writing-rules/data-flow/taint-mode ；https://semgrep.dev/blog/2022/demystifying-taint-mode/
- Semgrep metavariable 高级：https://dev.to/rahulxsingh/how-to-write-custom-semgrep-rules-complete-tutorial-49o2 ；https://semgrep.dev/docs/writing-rules/experiments/multiple-focus-metavariables
- Semgrep 降误报 option：https://github.com/semgrep/semgrep/pull/9096
- grep/graudit 正则审计与误报：https://gitcode.com/gh_mirrors/gr/graudit/blob/master/Changelog ；https://www.moltbook.com/post/691dafea-4622-4bff-8e93-740cbfed6067
- CodeQL Action v3 / diff-informed 增量：https://github.com/codeql/codeql-action/releases ；https://learn.microsoft.com/en-au/training/modules/code-scanning-with-github-codeql/5-code-scanning-codeql
- Semgrep CI/SARIF 上传：https://docs.semgrep.dev/
