# 请求输入与证据交接

## 输入

HAR 使用 `log.entries`，保留 `request` 和 `response`。`--context` 为整批默认账号标签；不同角色分开导出，或为每条添加 `_context`。不可将 Token 或真实密码当 context。

自定义 JSON 用 `requests` 数组，每条包含完整 `url`、`method`、`context`；请求头可为对象或 HAR 形式的 name/value 数组。正文使用 HAR `postData`，或 `content_type` 加 `body`：

```json
{
  "requests": [{
    "url": "https://example.invalid/app/api/profile",
    "method": "POST",
    "context": "account-a",
    "headers": {"Content-Type": "application/json"},
    "content_type": "application/json",
    "body": {"displayName": "测试账号"},
    "response": {"status": 200, "content": {"mimeType": "application/json", "text": "{\"ok\":true}"}}
  }]
}
```

`--raw` 接一个完整 Burp 请求文件：请求行、原始 Header、空行和 Body。HTTP/2 二进制不是该输入格式，须导出文本原包或 HAR。工具不会发送这些请求。抓包来源使用当前环境实际可用工具；没有抓包能力时记录缺口。

`--js-analysis` 接 `pentest-sop/scripts/recon/analyze-js.cjs` 输出的 requests；`--path-review` 接 `review-paths.py` 输出的 responses。这两类是待捕获候选，与真实请求分开记录。动态拼接、相对 baseURL、未知请求封装由原始源码与正常请求补齐，不编造地址。

输入原包可能含凭据，保留在当前工作区受限目录。输出主要保存字段、类型与出处，结构摘要仍可能含敏感路径，交付前按项目规则检查。禁止将不同目标、租户或用户的原包混入同一台账。

## 输出与交接

`triage.json` 保存 requests、hypotheses、warnings 和 summary。`hypotheses.json` 保存状态及证据历史，和范围、工作区绑定；result 更新只修改台账，再运行 plan 才会刷新计划中的状态摘要。

交接包必须包含：

- 功能操作覆盖表相对路径，关联 action_id、页面控件/动作、前置业务状态、账号/租户、UI 变化和真实 requestId。被阻塞、纯客户端/缓存、抓包失败与未执行分别标记；triage.py 不自动读取此表，交接双方人工核对，重放不能冒充正常 UI 触发。

- 当前目标范围、项目工作区及账号/租户短标签；不携带实际凭据。
- 原包文件相对路径与条目号；静态来源补 JS 文件、行号或路径复核状态。
- request_key、hypothesis_id、方法、字段位置、前提条件和副作用标记。
- 已测条件、正常与对照响应、证据文件与 SHA-256；缺口或受阻原因。
- 下一步只需要补齐的证据，避免重复资产收集或重复同一验证。

recon 提供入口与正常请求，vulnerability-triage 提供证据假设，复核角色核对当前上下文与影响，reporting-remediation 只采用独立核实的结果。协调者不能仅凭角色摘要、HTTP 状态、版本命中、优先分数或 supported 状态确认漏洞。

台账中的 pending/blocked/inconclusive 是工作状态，不能自动降成 not_supported。证据仅支持具体账号、对象、方法与当前时间下的结果；没有响应正文时，状态码本身不证明访问权限或敏感数据影响。
