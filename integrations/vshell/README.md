# vShell C2（服务端不随仓库分发）

vShell C2 是**独立产品**：官方编译版服务端免费发放，但源码不公开、带独立授权，因此仓库默认
不提交其二进制（Linux 单体约 27MB，另需约 37MB 的 `www/` 前端资源）。

## 放置服务端（二选一）

1. 放到仓库内本地目录（**已被 .gitignore 忽略，不会提交**）：

```text
integrations/vshell/server/
├── vshell-server-standalone-linux     # 或 vshell-server-standalone.exe
└── www/                               # 面板前端资源（与服务端同目录）
```

2. 用参数直接指定官方服务端路径（推荐，保持仓库干净）。

> 平台按 Linux/Windows 运行环境选择对应服务端：本仓库示例的 Linux 版来自自有服务器，
> Windows 部署请使用官方 Windows 编译版。

## 一键部署

```bash
./scripts/deploy-vshell.sh                    # 自动使用 integrations/vshell/server/ 下的服务端
./scripts/deploy-vshell.sh --binary /opt/vshell/vshell-server-standalone-linux
```

```powershell
.\scripts\deploy-vshell.ps1
.\scripts\deploy-vshell.ps1 -Binary D:\vshell\vshell-server-standalone.exe
```

脚本会：

1. 生成随机管理 Token；
2. 启动服务端（`-a 127.0.0.1 -p 8095 -ap 8084 -t <token>`）；
3. 等待面板端口就绪；
4. 调用 `scripts/setup-vshell.*` 把 `vshell:` 段写入 `config.yaml`。

之后重启平台，侧栏 vShell 即可免二次登录使用。

## 远程 / 隔离部署

服务端只监听回环时，用
`ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@host` 建隧道，`config.yaml` 的 `url` 保持
`http://127.0.0.1:8095`。

## 授权提醒

vShell 服务端为第三方授权产品。**未经授权不得再分发**：请勿把官方二进制提交到公开仓库，
如需随仓库分发，请先确认你拥有再分发授权（可考虑 GitHub Releases 私密附件或自建下载源）。
完整排障见 [`docs/zh-CN/integrations.md`](../../docs/zh-CN/integrations.md)。
