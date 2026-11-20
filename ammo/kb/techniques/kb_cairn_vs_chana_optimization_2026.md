# Cairn vs chana 对标：chana 优化行动清单（2026-10-18）

> 依据：Cairn 源码级分析（[[kb_cairn_agent_pentest_2026]]，TCH 唯一 AK 引擎）× chana 现状（R1-R20 + 2026-10-18 双诊断实测数据）
> 核心结论：**chana 的四个实测痛点（慢/上下文膨胀/提示词肥胖/多Agent没落地）在 Cairn 里全部被同一个设计决策解决——任务级小会话 + 图状态外置**。方法论脚手架（S1-S3/台账/换面）不砍，砍的是它们占据上下文的方式。

## 两套架构的本质差异

| 维度 | Cairn（AK 引擎） | chana（现状） |
|---|---|---|
| 会话模型 | **每任务全新会话**，只注入该任务所需 | 单会话长跑，tool/result 全留主上下文 |
| 单会话上下文 | explore≈2KB（1 个 intent+相关 facts） | 331-436KB（无 compact，末段延迟 5 倍） |
| 每轮固定提示词 | <3KB（纯输出格式约定） | AGENTS.md 39.6KB + system_pentest.md 39KB ≈ 26K token |
| 状态存放 | 服务端 SQLite 图（Fact/Intent），跨任务跨 worker 共享 | workflow.json 台账（但 agent 绕过它手动 json 读） |
| 并行协调 | 结构性：多 worker claim 图上 Intent，黑板协调 | 提示词性：D0 四车道写在治理块，subagent 实际 0-5 次/会话 |
| 任务边界 | 300s 硬超时 + 两阶段 conclude 兜底 | 无超时，turn 能跑到机器挂（artex 三连挂实证） |
| 失败产出 | 强制返回一条客观 Fact（否定结论也算） | not_supported 桶记账，但缺结构化事实落盘 |
| 隔离 | 每项目独立 Kali 容器，worker 折腾不死宿主 | dsh 直接宿主机 root + danger-full-access |
| 人工介入 | Hint 一等公民原语（复盘实证：第4天0flag→注Hint→第5天AK） | 用户直接对话（打断式），无任务级注入通道 |

## P0 —— 直接对准今天双诊断的三个痛点

### P0-1 验证任务下沉独立子会话（抄 Cairn 的 explore 任务模型）
- **痛点对应**：130-193 步/任务 × 首 token 4-5s = 13-17 分钟纯等模型；上下文 331-436KB 膨胀；新会话 workflow.py 零调用。
- **Cairn 做法**：explore 任务 = 独立 claude 进程，上下文只有 1 个 Intent + 图摘要（~2KB），干完只回一条 Fact。主调度（reason）另开小会话。
- **chana 改法**：D2 验证不再由主会话亲自打——主会话派发「假设卡」（假设描述+相关事实引用+预算）给独立 dsh session（后台 job 已有能力），主会话只轮询收结论。台账由子会话结束时写（workflow.py close），不是主会话中间态维护。
- **收益**：主会话上下文恒小（只积累 Fact 卡）；模型等待并行化（3 个假设=3 个子会话同时等首 token）；agent 绕过台账问题消失（写入动作绑定在子会话收尾，由 gate 强制）。

### P0-2 任务预算 + 两阶段 conclude
- **痛点对应**：turn 无边界（artex 扫描 turn 把 VPS 打到 load 140 三连挂）；杀子进程无效（活 turn 当崩溃，nohup 更猛参数重启）。
- **Cairn 做法**：每任务 300s 硬超时 → kill 进程保 session → 同 session 续跑注入收尾提示词（"立即停止，仅基于已确认信息输出 JSON 总结"）→ 前 90% 工作折算成一条 Fact 落袋。
- **chana 改法**：给 dsh turn 加步骤/token/时长三重预算（dsh 侧或 bridge 插件计时），超限 → 注入 conclude 提示词收尾（dsh session 文件持久，天然支持续跑同 session）→ 结论写台账后正常结束。**turn 结束=子进程自然收链**，不再出现"孤儿 harvest 进程"和"error 后 nohup 复活"。
- **配套**：预算按任务类型分级（探测 30 步 / 验证 80 步 / 全网扫描禁本地跑只许提交到 47）。

### P0-3 提示词减半（继续 R20 的"克制"路线）
- **痛点对应**：26K token 起步成本 × 每步都付；gov3→4→4.1 层层加码未瘦身。
- **Cairn 哲学的本地化**：不是学它"零方法论"（deepseek-flash 中端模型仍需脚手架），是学**分层注入**——每轮强制的只留"节奏+指路+判定门槛"，细节全部下沉按需加载。
- **chana 改法**：system_pentest.md 39KB → 目标 ≤12KB。保留：S1/S2/S3 节奏表、指纹→查库四路径、Java 三件套表、判定门槛负面清单、L1-L5、Burp 包铁律、运维硬约束。移出（→skills 按需 cat）：WAF 绕过细节、中间件速查、指挥官协议全文、D0 车道操作细节（这些 workflow-gates.md 已有）。AGENTS.md 39.6KB 同步审计——工具表/环境说明留，重复的方法论段删（与 system_pentest.md 二选一）。
- **验证**：改完跑一次同题任务对比步数×延迟（今天的 step_analyze.py 直接复用）。

## P1 —— 结构性升级

### P1-1 Fact 化落盘（否定结论也是产出）
- Cairn explore 强制返回一条客观 Fact："对 /search 测了常见注入 payload，无可利用迹象"——这条 Fact 让全系统不重复踩坑。
- chana 台账已有假设桶，缺的是**假设终态的结构化事实**。改法：workflow.py close 时强制每个假设产出一条 `{hypothesis_id, verdict, evidence_ref, confidence}`，evidence_ref 指文件不内联。下个会话开局读图（Fact 卡列表）而非读全量台账 JSON。

### P1-2 Intent 状态机防重复派发
- Cairn：intent 有 open→claimed(heartbeat)→done 状态；调度器见 `explore_running` 直接跳过，同方向绝不双开。
- chana gov4.1 的 effort 配额管的是桶级投入，管不住两个 subagent 同时打同一假设。台账假设加 `claimed_by/started_at/heartbeat` 三字段，派发前 check，超时心跳自动释放回 open。

### P1-3 任务级 Hint 注入通道
- Cairn 复盘最硬的数据：纯自动化第 4 天 0 flag（边际成本 52→284→∞ 元/flag），人工注入 Hint 后第 5 天 AK。
- chana 是交互式产品但只有"打断式"介入。加一个**非打断通道**：平台侧"给当前任务注入提示"→ 写一条 `type=hint` 的 Fact 入台账 → 主会话下轮读取（reason 的"新情况"触发条件之一就是 Hint 数增加）。人在 agent 干活时给的判断，不打断、不丢、必然被消费。

## P2 —— 远期

- **P2-1 执行隔离**：Cairn worker 在一次性容器里折腾不死宿主；chana dsh 是宿主机 root（artex 事故根因）。VPS 3.6G 跑不动 Kali 容器——折中方案：agent 自写脚本先过 wrapper（并发 clamp 已做，加 timeout/资源 ulimit 包装层），或重量级扫描任务一律提交 <your-attack-server> 远程执行。
- **P2-2 完成判定升级**：Cairn 的 complete{from:[Fact引用]} 是"引用式证明"；chana 的 L1-L5 判定靠 pentest_report.py 正则映射。中期可把"作业完成"改成事实组合校验：L3 达标 = 存在{命令执行证据 Fact + OOB 回连 Fact + 落库漏洞记录}三引用。

## 不抄的部分（明确边界）

- **零方法论提示词**：Cairn 赌 opus/gpt 顶级模型；chana 主力 deepseek-flash，S1-S3 脚手架是正收益（Cairn 自己第 3 天后也断崖，结构兜底对顶级模型同样必要）。
- **纯黑板上脑**：chana 的 RAG/skills/骨架库是真实资产（JeecgBoot 实战 5 洞验证），Cairn 反 RAG 是因为比赛封闭题+模型自带；SRC 开放场景知识库召回有实证价值。
- **完全无报告概念**：chana 面向 SRC 交付（Burp 包/判定门槛），结构化结论必须比 Cairn 严。

## 落地顺序建议

1. P0-3 提示词减半（半天，纯文件改动热生效，立即降本提速）
2. P0-2 任务预算+conclude（1 天，bridge 插件 + dsh session 续跑）
3. P0-1 子会话下沉（2-3 天，D2 验证链路改造，动 workflow.py + gate）
4. P1-1/1-2 随 P0-1 顺带（都在台账 schema 上）
5. P1-3 Hint 通道（平台前端 + 一条 API）
