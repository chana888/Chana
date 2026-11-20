# ChanaAgent · 刹那

> AI 原生红队作业平台 —— 多智能体渗透编排 · 工作流硬治理 · 攻击面管理 · POC 工厂 · 知识体系

ChanaAgent 的前身是 [CyberStrike](https://github.com/CyberStrikeus/cyberstrike)（Apache-2.0），
本项目在其基础上完成了大量工程化与实战化改造，血缘与致谢见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。

## ✨ 核心特性

- **多智能体渗透引擎** — 基于字节跳动 [Eino](https://github.com/cloudwego/eino) 的多代理编排，
  D0→D3 分层工作流（探测 → 战略 → 战术 → 收口），角色化协作（编排 / 渗透 / 横向移动 / 信息收集 / OPSEC…）
- **工作流硬治理** — 台账门禁（`workflow.py`）+ 工具调用拦截（workflow-gate 插件）+ 投入配额与"换面"机制，
  机器强制对抗注意力单一、假进度、"测穿了"幻觉等 agent 病态行为
- **攻击面管理** — FOFA / Hunter 资产测绘、股权穿透、供应链分析、资产库
- **POC 工厂** — AI 从漏洞证据生成 nuclei 模板 → 编译校验 → FOFA 扩面 → 并发批量验证 → 命中一键落库
- **三层知识体系 + 自带弹药库** — quick-ref 秒杀卡 / skills 决策树 / techniques 深度手册，
  外加项目黑板、事实库、骨架库的多层记忆；[`ammo/`](ammo/README.md) 自包含弹药库
  （shirokit 反序列化一体化 / DNSLog / srcwiki POC 4700+ / payload 集，第三方工具一键安装）
- **MCP 联邦** — GSL5 (GodzillaSuper) WebShell 管理、任意外部 MCP 服务器接入
- **浏览器控制（双模式）** — **VPS 模式**：常驻虚拟桌面 Chrome，人工远程桌面 + agent MCP 共享登录态（[`vps-browser/`](vps-browser/README.md)）；**本地模式**：直接控制本机日常 Chrome，三步接入（[`local-browser/`](local-browser/README.md)）。两种模式均自动预置进平台 MCP 管理页（默认停用，桥就绪后一键启用）
- **HITL AI 围栏** — 高危动作人工审批兜底
- **漏洞管理** — 按站点自动分组、复现包铁律（Burp 原始请求包，可直接重放）
- **平台能力** — RBAC 权限、独立登录页与会话管理、机器人接入、代码审计管线、视觉分析

## 🚀 快速开始

### 构建

```bash
# Go >= 1.25
go build -o chana ./cmd/server
```

### 配置

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml`：
- `ai.channels.*` — 填入你自己的模型 API Key（DeepSeek / GLM / Qwen / 兼容 OpenAI 协议的任意端点）
- `server.host / server.port` — 监听地址（默认 `0.0.0.0:8080`）
- 其余段（MCP / 机器人 / 知识库 / 审计）见 `docs/zh-CN/configuration.md`

### 启动

```bash
./chana --https
```

浏览器打开 `https://127.0.0.1:8080/`（自签证书首次需手动信任），首次启动会初始化管理员账户（详见部署文档）。
> 注意：登录流程要求 HTTPS，使用 `--http` 启动时登录页会提示“请通过 HTTPS 入口登录”。

Windows 下也可以用一键脚本：`python init.py`（自检 → 建运行目录 → 提示配 Key → 启动 → 验证），
PowerShell 等价命令 `./init.ps1`。

### 可选集成（不随仓库分发）

| 组件 | 作用 | 接入文档 |
|------|------|---------|
| DeepSeek Harness (dsh) | 对话/Agent 运行时，Harness 页依赖它 | [docs/zh-CN/integrations.md](docs/zh-CN/integrations.md) |
| vShell C2 | 内网隧道 / C2 面板，侧栏 vShell 页依赖它 | [docs/zh-CN/integrations.md](docs/zh-CN/integrations.md) |

两个组件均需单独获取并启动，`scripts/` 下有 `setup-dsh.*` / `setup-vshell.*` 一键写入配置。

## 📁 目录结构

| 目录 | 说明 |
|------|------|
| `cmd/server/` | 主程序入口 |
| `internal/` | Go 后端（API / 多代理引擎 / 治理 / 数据层…） |
| `web/` | 前端（templates + static） |
| `agents/` `roles/` `prompts/` | 智能体角色定义 / 任务角色配置 / 系统提示词 |
| `skills/` | 技能库（决策树 + 参考手册 + 脚本） |
| `knowledge_base/` | 技术知识库 |
| `vps-browser/` | 浏览器栈服务端（Chrome 扩展 + MCP 桥 + 远程桌面网关，VPS 一键部署） |
| `local-browser/` | 本地浏览器接入（复用同一桥与扩展，控制本机 Chrome） |
| `plugins/` `mcp-servers/` | 平台插件与 MCP 服务 |
| `tools/` | 外部工具接入清单（yaml 描述符） |
| `ammo/` | 渗透弹药库（知识 + 自研工具 + 第三方一键安装，自包含） |
| `AGENTS-TEMPLATE.md` | dsh 全局工作指引模板（部署时复制到 dsh 主目录作 AGENTS.md） |
| `docs/` | 中英双语文档（部署 / 配置 / 架构 / 安全模型 / 贡献规范） |

## 📚 文档

完整文档在 [`docs/`](docs/README.md)（[中文](docs/zh-CN/) | [English](docs/en-US/)）：
部署指南、配置参考、架构说明、安全模型、开发者指南、测试指南、贡献规范。

## 🤝 致谢

- [CyberStrike](https://github.com/CyberStrikeus/cyberstrike) — 本项目的基石
- [GSL5 / GodzillaSuper](https://github.com/Xaaaa-bip/GodzillaSuper) — WebShell 管理
- [Eino](https://github.com/cloudwego/eino) — Go AI 编排框架
- 更多见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)

## ⚠️ 免责声明

本平台仅供**已获得书面授权**的安全测试、攻防演练与安全研究使用。
使用者须遵守所在地区法律法规，并对自己的行为承担全部责任。
未经授权对第三方系统进行测试是违法行为。开发者和贡献者不对任何滥用行为承担责任。

## License

[Apache-2.0](LICENSE)（包含第三方组件的原有许可，见 LICENSE 与 ACKNOWLEDGEMENTS.md）
