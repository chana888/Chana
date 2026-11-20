# vShell C2（服务端不随仓库分发）

vShell C2 是**独立产品**：官方编译版服务端免费发放，但源码不公开，且单个二进制约 500MB
（超过 GitHub 单文件 100MB 限制），带独立授权，因此**无法打包进本仓库**。

本目录保留接入说明；实际部署请把官方服务端放到任意路径，然后执行：

```bash
./scripts/deploy-vshell.sh --binary /opt/vshell/vshell-server-standalone-linux
```

Windows：

```powershell
.\scripts\deploy-vshell.ps1 -Binary D:\vshell\vshell-server-standalone.exe
```

脚本会：

1. 用随机管理 Token 启动服务端（`-a 127.0.0.1 -p 8095 -ap 8084 -t <token>`）；
2. 等待面板端口就绪；
3. 调用 `scripts/setup-vshell.*` 把 `vshell:` 段写入 `config.yaml`。

之后重启平台，侧栏 vShell 即可免二次登录使用。

远程/隔离部署：服务端只监听回环时，用
`ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@host` 建隧道，`config.yaml` 的 `url` 不变。

完整排障见 [`docs/zh-CN/integrations.md`](../../docs/zh-CN/integrations.md)。
