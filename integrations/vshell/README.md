# vShell C2 服务端（Linux 版随仓库提供）

vShell C2 是独立产品。本目录附带**Linux 版服务端与 `www/` 前端资源**（来自自有部署，已脱敏：
不含授权文件、配置、日志、备份与任何服务器标识），用于让仓库开箱即可部署 vShell 页面。

```text
integrations/vshell/server/
├── vshell-server-standalone-linux   # 服务端（sha256 见 SHA256SUMS）
├── SHA256SUMS
└── www/                             # 面板前端资源（与服务端同目录）
```

- **Windows 部署**需要官方 Windows 编译版：把它放到本目录或用 `-Binary` 指定
- **授权提醒**：vShell 为第三方授权产品，仓库内二进制仅供已获授权者使用；如需再分发请自行确认授权
- 其他版本/官方更新请从官方渠道获取，替换本目录文件即可

## 一键部署

```bash
./scripts/deploy-vshell.sh                    # 自动使用本目录服务端
```

```powershell
.\scripts\deploy-vshell.ps1                   # 自动使用本目录的 exe（需自备）
```

脚本会生成随机管理 Token、启动 `-a 127.0.0.1 -p 8095 -ap 8084 -t <token>`、等待面板端口，并把
`vshell:` 段写入 `config.yaml`。之后重启平台即可。

远程/隔离部署：服务端只监听回环时，用
`ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@host` 建隧道。

完整排障见 [`docs/zh-CN/integrations.md`](../../docs/zh-CN/integrations.md)。
