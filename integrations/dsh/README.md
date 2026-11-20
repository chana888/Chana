# DeepSeek Harness (dsh) 运行时（固定版本）

本目录用于**把 dsh 作为本仓库的依赖部署**，避免用户手动全局安装：

- `package.json` 固定了经过验证的 `@deepseek-ai/dsh` 版本（MIT 许可）
- 不提交 `node_modules/`（约 700MB，属安装产物，已由 `.gitignore` 忽略）

## 一键部署

```bash
./scripts/deploy-dsh.sh          # Linux/macOS：安装 + 启动 + 解析 token + 写入 config.yaml
.\scripts\deploy-dsh.ps1         # Windows PowerShell 等价命令
```

脚本会：

1. 检查 Node.js >= 20；
2. 在本目录执行 `npm install --omit=dev`；
3. 启动 `dsh web --no-open`，日志写到仓库根目录 `dsh-run.log`；
4. 从启动 banner 解析 `token=`，调用 `scripts/setup-dsh.*` 写入 `config.yaml` 的 `dsh:` 段。

之后重启平台，Harness 页面即可免登录连接（详见 [`docs/zh-CN/integrations.md`](../../docs/zh-CN/integrations.md)）。

## 注意

- dsh 每次重启都会生成新 token，需要重新执行 `deploy-dsh` 或手动同步 `config.yaml`。
- 只安装不启动：`--install-only` / `-InstallOnly`。
- 升级 dsh：修改本目录 `package.json` 中的版本号后重新执行脚本。
