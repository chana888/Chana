# vShell C2 服务端（Linux / Windows 双版本随仓库提供）

vShell C2 是独立产品。本目录附带 **Linux 与 Windows 两个平台的服务端 + `www/` 前端资源**
（来自自有部署，已脱敏：不含授权文件、配置、日志、备份与任何服务器标识；品牌已统一为 vShell，
图标使用本项目品牌图），用于让仓库开箱即可部署 vShell 页面。

```text
integrations/vshell/server/
├── vshell-server-standalone-linux        # Linux 服务端（sha256 见 SHA256SUMS）
├── SHA256SUMS
├── www/                                  # Linux 面板前端资源（与服务端同目录）
└── windows/
    ├── vshell-server-standalone.exe      # Windows 服务端（sha256 见 windows/SHA256SUMS）
    ├── SHA256SUMS
    └── www/                              # Windows 面板前端资源
```

- **授权提醒**：vShell 为第三方授权产品，仓库内二进制仅供已获授权者使用；如需再分发请自行确认授权
- 其他版本/官方更新请从官方渠道获取，替换对应目录文件即可

## 默认账号

- 面板默认账号（Linux / Windows 版一致）：**`admin / admin123`**（首次登录后请立即修改）
- 推荐用 Token 免登录：`http://127.0.0.1:8095/?token=<deploy-vshell 输出的 Token>`

## 一键部署

Windows：

```powershell
.\scripts\deploy-vshell.ps1        # 自动使用 integrations\vshell\server\windows\ 下的服务端
```

Linux / macOS：

```bash
./scripts/deploy-vshell.sh         # 自动使用 integrations/vshell/server/ 下的服务端
```

脚本会生成随机管理 Token、启动 `-a 127.0.0.1 -p 8095 -ap 8084 -t <token>`、等待面板端口，
并把 `vshell:` 段写入 `config.yaml`。之后重启平台即可。

远程/隔离部署：服务端只监听回环时，用
`ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@host` 建隧道。

完整排障见 [`docs/zh-CN/integrations.md`](../../docs/zh-CN/integrations.md)。
