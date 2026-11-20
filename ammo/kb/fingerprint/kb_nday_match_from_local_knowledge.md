---
name: nday-match-from-local-knowledge
description: 指纹命中后自动从本地知识库 knowledge_base/ 匹配对应产品POC，优先打N-day再进功能点
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ed740f5-e7d6-4949-8758-01dc32016c50
---

在渗透测试中，当指纹识别命中具体产品/框架时，默认按以下流程自动匹配本地知识库：

## 执行规则

1. **指纹命中 → 自动查统一知识库**（2026-08-13 整合后）
   - 主索引 `<workdir>/tools/knowledge_base/README.md` → 检索导图按场景直查
   - `srcwiki_poc/{对应分类}/_index.md` — 4756 篇 POC（OA系统/OA产品/中间件/开发框架/应用服务器/CVE-2026）
   - `src/` + `techniques/` — SRC 方法论 + 漏洞利用技术（OA/SpringBoot/反序列化/三件套）
   - `rce_getshell/` — RCE/getshell 手册 + 2022-2026 CVE 索引（`kb_middleware_cve_index_2022_2026.md`）
   - `fingerprint/kb_java_component_fingerprint_2026.md` — Java 组件精准指纹识别卡

2. **匹配流程**
   ```
   指纹命中 → 读取对应 *_poc.md → 按P0→P1→P2优先级测试 → 确认漏洞 → 汇报
   ```

3. **测试约束**
   - 先用只读/低破坏方式验证（DNS外带/时间延迟/报错回显）
   - 确认存在后再决定是否深度利用
   - 不执行 INSERT/DELETE/DROP/UPDATE 等增删改
   - sqlmap 用 --technique 不比 --os-shell

4. **无匹配时**
   - 知识库无该产品条目 → WebSearch 找POC → 测试 → 结果回写到 knowledge_base 补全
   - 补全后下次同产品直接命中

**Why:** 之前花了大量token从全网收集OA/框架/RCE知识并落盘到 knowledge_base/，但这些文件没有被自动引用。加此规则后，每次指纹命中会自动读取对应的本地POC文件，省去重复搜索的token。

**How to apply:** 每次做完路径发现和指纹识别后，先 Grep/Glob 搜索 knowledge_base/ 下是否有对应产品的 md 文件，有则优先读取并按优先级打 N-day。相关记忆：[[nday-first-if-present]] [[pentest-more-hands-on]] [[路径发现综合方法论]]
