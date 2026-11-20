---
name: request-triage
description: 离线分析已有 HAR、Burp 原始请求、JS 索引和路径复核结果，保留字段与出处并建立证据台账。适用于已有抓包需要整理或交接的安全评估；不发网络请求、不自动重放、不判定漏洞。
---

<!-- CHANA-WORKFLOW-GOVERNANCE:BEGIN -->
## 工作流交接门

request-triage 只接收 D0 已完成的功能动作覆盖表和真实捕获请求。静态 JS/路径候选必须标记 `static`，先回到对应页面补正常请求；不得把接口数量、URL 去重或重放结果当作功能覆盖。导入请求时必须核对项目/会话、账号角色、功能、方法、字段位置、请求和响应证据哈希；原包或响应变更会使旧假设和任务失效并回到 `pending`。`supported` 不等于 confirmed，主 Agent 必须独立复核影响后落库。
<!-- CHANA-WORKFLOW-GOVERNANCE:END -->

# 请求分析与证据交接

同时接收功能动作覆盖表和原包的交接说明；现有 triage.py 只解析请求证据，不自动读取功能表。缺动作/前置状态/角色/正文或只有静态候选时，按 [功能操作手册](../vps-browser-workflow/references/function-discovery.md) 增量补正常页面操作，不能用重放代替已点击，不能自动发包或把 URL 数当功能覆盖。

在已有正常业务请求时整理方法、参数位置、账号角色与出处，并生成需要人工复核的假设。仅有 JS 路径或扫描响应时先列补抓包任务，不能声称接口已验证。

所有输入与输出必须位于当前项目工作区。`--scope` 使用用户已指定的精确 origin 与路径前缀，不能从历史目标推导范围。账号用不含凭据的短标签；原包保留在受限证据目录，摘要不复制 Cookie、Token、密码或附件正文。

读取 [输入格式与交接要求](references/request-evidence.md)，选择已有输入执行离线分析：

```text
python3 /opt/chana/app/skills/request-triage/scripts/triage.py plan --workspace /当前项目绝对路径 --scope https://example.invalid/app/ --context account-a --har evidence/account-a.har --out recon/triage.json --ledger recon/hypotheses.json
```

可重复指定 `--har`、`--requests`、`--raw`、`--js-analysis`、`--path-review`。各自格式见参考文件；`--js-analysis` 接 Acorn 助手输出，`--path-review` 接响应复核助手输出，不接 dirsearch 原生 JSON。相对原始请求没有协议时，工具只在已指定范围内唯一匹配 Host；有歧义须先补上下文。

分析后的处理规则：

- 对照原包检查方法、字段位置和角色。重复参数、嵌套 DTO 与业务分发分别保留，不能只按 URL 去重。
- 优先分数只决定复核顺序，不代表严重度。参数名命中规则只是分析假设，不证明真实影响。
- 支付、短信、审批、上传、写入及未知分发请求带副作用标记，不能进入自动重放或变异队列；GET 同样可能有副作用。
- 发现 429 或持续错误时记录限制。纯静态候选须补正常请求；解析失败、未知账号、缺少对照对象须保留缺口。
- 需要复核时按候选 `skill` 路由至既有专项，使用当前实际可用的浏览和抓包能力。不能为了补流程猜造认证头、缺失响应或接口。

复核结果写回台账：

```text
python3 /opt/chana/app/skills/request-triage/scripts/triage.py result --workspace /当前项目绝对路径 --id 假设ID --status blocked --note 缺少第二个受控测试账号
```

状态为 `pending`、`supported`、`not_supported`、`blocked`、`inconclusive`；后四种通过 result 更新。`supported` 与 `not_supported` 必须提供 `--evidence` 的真实证据文件。`supported` 仅支持某个假设，不能自动写入 confirmed 漏洞；确认仍需独立复核可复现链路、真实响应及明确影响。`not_supported` 仅适用于所测上下文，不是全站无问题结论。

交付 `recon/triage.json`、`recon/hypotheses.json` 和参考文件定义的证据交接包。变更后的请求指纹会重新标为 pending；单批文件上限 40MB、正文解析上限 2MB、请求上限 5000 条，超限时分批，不能声称截断后的覆盖完整。
