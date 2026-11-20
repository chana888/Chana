# 代码审计 · 秒杀入口卡

> 完整模块：`D:\Desktop\Claude\tools\codeaudit\`。本卡是入口决策树。

## 拿到源码先做这 4 件事（顺序别换）

```
1. 定形态  pom.xml→Java  composer.json→PHP  go.mod→Go  Gemfile→Ruby
          package.json→Node  *.csproj→.NET  requirements.txt→Python
          只有 *.js bundle/小程序包/APK → 前端审计线（独立且高产）
2. 找入口  路由注解/路由文件/中间件注册 → 列全部可达端点（后续一切的地基）
3. 划边界  鉴权配置（permitAll/白名单/中间件顺序）→ 标出「无需鉴权」的端点
4. 顺数据流 入口参数 → 逐层传递 → 落到 Sink → 中间有没有净化
```

## 分语言 → 加载哪本手册

| 形态 | 加载 |
|---|---|
| Java / Spring / RuoYi | `tools/knowledge_base/techniques/kb_java_audit_deep_2026.md`（450行）+ `kb_ruoyi_audit_poc_2026.md` |
| PHP / ThinkPHP / Laravel | `tools/knowledge_base/techniques/kb_php_audit_deep_2026.md`（460行） |
| Go | `tools/codeaudit/PLAYBOOK_go.md` |
| Node/TS · Python · Ruby · .NET · C/C++ | `tools/codeaudit/PLAYBOOK_langs_extra.md` |
| 前端 bundle / 小程序 / APK | `tools/codeaudit/PLAYBOOK_frontend_miniprogram.md` |
| 方法论总纲（含 N-day diff） | `tools/knowledge_base/techniques/kb_code_audit_source_2026.md` |

## 用什么扫

```
semgrep  首选，装得动跑得快 YAML 好写 → tools/codeaudit/rules/ + run_semgrep.py
CodeQL   只在 semgrep 明显不够且目标是大 Java 库时上（建库慢，别默认用）
Secrets  trufflehog / gitleaks --only-verified
N-day    git diff v1 v2 补丁 diff（修了什么=漏洞在哪）
选型矩阵 → tools/codeaudit/TOOLCHAIN.md
```

## ★ 扫到之后必须过这一关（否则全是误报）

```
L0 静态命中  file:line              ← semgrep 给到这
L1 路由可达  能写出完整 HTTP 请求    ← 纯静态推理，审计者自己完成，别跳过
L2 动态实证  真实请求+响应 / DNSLog  ← 必须发包，只有这级能进报告
L3 影响闭环  真实敏感数据 / RCE 取证  ← 高危
```
每类漏洞的验证动作表 + 误报抑制清单 → `tools/codeaudit/VERIFY_LOOP.md`

## 扫描器找不到什么（别高估 SAST）

**授权逻辑缺陷（越权类）SAST 原理上找不出来** —— 没有 tainted data flow，
本质是「缺了一道本该有的归属校验」，SAST 没有这个先验。此类**召回率天然≈0，必须人工审**。
（基准：`audit/RuoYi-Vue/AUDIT_REPORT_20260815.md` 的 H1/H2/H3/H7/H8 全是这类）

## 三个最高频的误报陷阱

- **路由没注册**（死代码 / `@Profile("dev")` / `@ConditionalOnProperty`）
- **前置鉴权有效**（先 grep 鉴权配置，再判"未授权"）
- **半路被净化**（`parseInt` / 白名单 / 参数化 / 转义 夹在 source 与 sink 之间）

## 与 S1/S2/S3 的衔接

审计产出的**端点清单+鉴权边界**→S2 世界模型；**L1 的完整请求**→S3 验证队列；**高危链**→S3 的 P0 假设。
反向：S1/S2 黑盒发现的异常，回源码定位成因、推变体。
