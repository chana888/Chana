# 可选集成：DeepSeek Harness（对话引擎）与 vShell C2

> **重要**：这两个组件**不随本仓库分发**。仓库只包含平台侧的对接代码（反代 / 同步 / 桥接）。
> 本文给出获取、启动与接入的完整步骤，照着做即可让「DeepSeek Harness」和「vShell」页面真正可用。

| 组件 | 作用 | 是否随仓库 | 默认端口 |
|------|------|-----------|---------|
| DeepSeek Harness (dsh) | 对话/Agent 运行时，平台的 Harness 页与对话都走它 | ❌ 只带反代与同步代码 | 3080 |
| vShell C2 | 内网隧道 / C2 控制面板，侧栏 vShell 页 | ❌ 只带反代与统计代码 | 面板 8095（示例） |

---

## 一、DeepSeek Harness (dsh)

### 1.1 前置

- Node.js ≥ 20 与 npm
- 平台已启动（`chana` 进程）

### 1.2 安装与启动

```bash
npm install -g @deepseek-ai/dsh
dsh web --no-open
```

启动 banner 会打印带 token 的地址，例如：

```text
dsh web: http://127.0.0.1:3080/?token=XyZ...abc
```

### 1.3 接入平台

编辑 `config.yaml`（与 `chana` 可执行文件同目录）：

```yaml
dsh:
  base_url: http://127.0.0.1:3080
  token: XyZ...abc   # 上一步 banner 里的 token，原样粘贴
```

重启平台（例如 `./chana --https`）。之后：

- 侧栏「DeepSeek Harness」页面自动免登录加载（平台会把 `/dsh/*` 反代到 dsh，并处理 Cookie 与 Host 校验）
- 平台会把 AI 通道同步给 dsh（`dsh_model_sync`），dsh 里可直接选到平台配置的模型
- dsh 的工作区会自动同步成平台「项目管理」里的项目（`dsh_workspace_sync`，30s 轮询）

### 1.4 让 Agent 遵守平台作业规范（可选但推荐）

把仓库根目录的 `AGENTS-TEMPLATE.md` 复制到 dsh 主目录作为 `AGENTS.md`：

```bash
cp AGENTS-TEMPLATE.md ~/.dsh/AGENTS.md
```

Windows 对应 `C:\Users\<you>\.dsh\AGENTS.md`。模板里写了项目绑定、事实写入、漏洞上报等指引。

### 1.5 注意事项

- **token 每次 dsh 重启都会变化**：重启 dsh 后必须同步 `config.yaml` 的 `dsh.token` 并重启平台。
- 平台只做反代，**不会**启动或守护 dsh；需要你自己把它跑起来（可用 systemd/pm2/计划任务）。

### 1.6 排障

| 现象 | 排查 |
|------|------|
| 页面显示「Harness 暂未连接」 | ① 3080 是否监听 `ss -tlnp \| grep 3080`；② `config.yaml` 是否有 `dsh:` 段；③ 平台日志中 `/dsh/` 是否 401（token 过期） |
| 502 / 空白 | dsh 进程已退出，重新 `dsh web --no-open` |
| iframe 能开但 API 403 | 确认平台版本包含 Host 重写与 Origin 清理逻辑（`internal/handler/dsh_proxy.go`） |

---

## 二、vShell C2

### 2.1 获取

vShell C2 为独立产品，**官方编译好的服务端免费发放，源码不随本仓库发布**。获取后直接运行官方二进制。

### 2.2 启动服务端

```bash
# Linux
./vshell-server-standalone-linux -a 127.0.0.1 -p 8095 -ap 8084 -t <你的管理Token>

# Windows
vshell-server-standalone.exe -a 127.0.0.1 -p 8095 -ap 8084 -t <你的管理Token>
```

- `-p` Web 面板端口（示例 8095，避免与平台 8080 冲突）
- `-ap` Agent 回连端口
- `-t` 管理 Token：**自己定义一个足够长的随机串**，平台侧要用同一个值
- 建议 `-a 127.0.0.1` 只监听回环，由平台/隧道对外

### 2.3 接入平台

```yaml
vshell:
  enabled: true
  url: http://127.0.0.1:8095
  token: <与 -t 完全一致的 Token>
```

重启平台。侧栏「vShell」直接免二次登录（反代会向每个请求注入 `?token=`），面板页、监听管理、客户端生成、隧道代理均可用。

### 2.4 远程 / 隔离部署

vShell 在另一台机器且只监听回环时，用 SSH 隧道把它接到本机：

```bash
ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@vshell-host
```

`config.yaml` 的 `url` 仍写 `http://127.0.0.1:8095`。隧道断开则页面不可用，建议做成常驻服务。

### 2.5 排障

| 现象 | 排查 |
|------|------|
| 页面显示「vShell C2 未启用」 | `config.yaml` 缺少 `vshell:` 段或 `enabled: false` |
| 页面一直转圈 | 确认平台包含 HTML 资源前缀重写修复：`curl -k https://127.0.0.1:8080/vshell/ \| grep app.config` 应看到 `/vshell/app.config.js`；若仍是 `/app.config.js` 说明平台版本过旧 |
| 401 / 面板无数据 | `vshell.token` 与启动参数的 `-t` 不一致 |
| 连接被拒 | 面板端口未监听（隧道断了 / vShell 未启动） |

---

## 三、一键写入配置脚本

仓库 `scripts/` 下提供四个脚本，**只修改 `config.yaml`（自动备份），不启动任何进程**：

```bash
# Linux / macOS
./scripts/setup-dsh.sh   --token <dsh-token> [--base-url http://127.0.0.1:3080]
./scripts/setup-vshell.sh --token <管理Token> [--url http://127.0.0.1:8095]

# Windows PowerShell
.\scripts\setup-dsh.ps1   -Token <dsh-token> [-BaseUrl http://127.0.0.1:3080]
.\scripts\setup-vshell.ps1 -Token <管理Token> [-Url http://127.0.0.1:8095]
```

脚本执行后按提示重启平台即可。若 `config.yaml` 已存在对应段，脚本会跳过并提示手动修改。

---

## 四、仓库内一键部署（推荐）

### 4.1 dsh：完全可由仓库部署

- 依赖固定在 `integrations/dsh/package.json`（`@deepseek-ai/dsh`，MIT 许可；`node_modules` 不入库）
- 一条命令完成「安装依赖 → 启动 dsh → 解析 token → 写入 config.yaml」：

```bash
./scripts/deploy-dsh.sh                       # Linux / macOS
```

```powershell
.\scripts\deploy-dsh.ps1                      # Windows
```

- 只安装不启动：`--install-only` / `-InstallOnly`
- 依赖里含较新的 `@earendil-works/pi-schema`，国内镜像可能尚未同步；脚本默认使用官方源，可用
  `--registry` / `-Registry` 覆盖（若镜像缺包会报 `ETARGET`）

### 4.2 vShell：Linux / Windows 双版本随仓库提供

仓库 `integrations/vshell/server/` 附带**已脱敏、支持账号登录的 Linux 版服务端 + www**，
`integrations/vshell/server/windows/` 附带 **Windows 版服务端 + www**（品牌统一为 vShell、图标为项目品牌图）。
`deploy-vshell` 会按平台自动选择。vShell 为第三方授权产品，仓库内二进制仅供已获授权者使用。

```bash
./scripts/deploy-vshell.sh --binary /opt/vshell/vshell-server-standalone-linux
```

```powershell
.\scripts\deploy-vshell.ps1 -Binary D:\vshell\vshell-server-standalone.exe
```

脚本会生成随机管理 Token、启动服务端（`-a 127.0.0.1 -p 8095 -ap 8084 -t <token>`）、等待端口就绪并把
`vshell:` 段写入 `config.yaml`。

### 默认账号与登录方式

- **面板默认账号：`admin / admin123`（Linux / Windows 两个版本一致）**，首次登录后请立即修改
- 直连面板推荐用 Token 免登录：`http://127.0.0.1:8095/?token=<deploy-vshell 输出的 Token>`
- 从平台进入时平台会自动注入 Token，无需二次登录

### ChanaAgent 平台首次登录密码

- 用户名 `admin`，密码在**首次启动输出**的 `ADMIN SETUP REQUIRED` 段中（只显示一次）
- 后台运行时：`grep -A3 "ADMIN SETUP REQUIRED" chana-run.log`
- 忘记密码：`./chana --reset-admin-password`（交互式重置）

---

## 五、GSL5（GodzillaSuper）WebShell 管理 MCP

GSL5 以 MCP 服务形式提供 WebShell 管理（命令执行、文件管理、数据库、内存马、payload 生成等）。

### 5.1 前置

- **Java 17+**（`java -version` 可用）
- 平台已启动

### 5.2 一键部署（运行包随仓库提供）

运行时已放在 `integrations/gsl5/bin/gsl5.jar`（自包含，约 78MB），脚本完成
「启动 → 解析 Token → 写入 config.yaml」：

```bash
./scripts/deploy-gsl5.sh
```

```powershell
.\scripts\deploy-gsl5.ps1
```

### 5.3 手动配置参考

```yaml
external_mcp:
  servers:
    gsl5:
      type: http
      url: http://127.0.0.1:9123/message
      headers:
        Authorization: Bearer <gsl5 banner 中的 Token>
      external_mcp_enable: true
```

重启平台后：「MCP 管理」出现 gsl5（约 62 个工具），「GSL5 控制台」可直接使用。

### 5.4 排障

| 现象 | 排查 |
|------|------|
| 启动报 Java 错误 | 安装 JDK/JRE 17+ 并确认 `java` 在 PATH |
| MCP 管理无 gsl5 | `config.yaml` 是否有 `external_mcp.servers.gsl5`；9123 是否监听 |
| 工具调用失败 | Token 与 banner 不一致（重启后可能变化，重跑脚本同步） |

---

## 六、浏览器 MCP（local-browser / vps-browser）

作用：让 Agent 直接控制浏览器（打开页面、点击、截图、读取 DOM、抓网络请求、注入脚本）。

> 平台只通过 **`local-browser`（控制本机 Chrome）** 或 **`vps-browser`（VPS 常驻 Chrome）** 这两个外部 MCP 控制浏览器（二选一），不内置 Playwright / Chrome DevTools 等其他方案。

**怎么选**

| 场景 | 用哪个 MCP |
|------|-----------|
| 个人电脑 / 本机部署，控制自己日常 Chrome | `local-browser`（推荐默认） |
| VPS / 服务器，远程桌面 + 多人共享登录态 | `vps-browser` |

两者共用同一套 Chrome 扩展与桥，同一时间只启用其中一个即可。

### 组成

| 部件 | 位置 | 说明 |
|------|------|------|
| Chrome 扩展 | `vps-browser/extension/` | 必须在目标 Chrome 里「加载已解压的扩展」 |
| MCP 桥 | `vps-browser/server/chrome-bridge.cjs` | 默认 `127.0.0.1:18862/mcp`，连扩展的 12306 端口 |
| 平台预置 | 启动时自动注册 | 「MCP 管理」里的 `local-browser` / `vps-browser`（默认停用，令牌自动发现） |

### 本地模式（控制本机日常 Chrome）

```bash
./scripts/deploy-browser.sh          # Linux/macOS：装依赖 → 生成令牌 → 启动桥
```

```powershell
.\scripts\deploy-browser.ps1         # Windows
```

1. Chrome 打开 `chrome://extensions` → 开发者模式 → 「加载已解压的扩展」→ 选 `vps-browser/extension`
2. 扩展里点 Connect（桥 `127.0.0.1:12306`）
3. 平台「MCP 管理」→ 启用 `local-browser`（令牌从 `vps-browser/server/.runtime/config.json` 自动读取）
4. 验证：`curl -H "X-Chana-Vps-Token: <token>" http://127.0.0.1:18862/status` 返回 `browserConnected: true`

### VPS 模式（远程桌面 + Agent 共享登录态）

```bash
sudo ./vps-browser/install.sh        # systemd 服务 + 网关 + viewer + 夜间清理定时器
```

详见 [`vps-browser/README.md`](../../vps-browser/README.md)。

### 排障

| 现象 | 排查 |
|------|------|
| 平台 MCP 管理里显示已停用 | 桥未启动或令牌不匹配；先 `deploy-browser` 再启用 |
| `browserConnected: false` | Chrome 未装扩展 / 扩展未点 Connect / 12306 无监听 |
| 端口 18862 被占用 | 换 `--port`，并同步平台配置里的 URL |
| 工具调用失败 | 确认目标窗口不是 omnibox 弹窗；操作后需重新 `get_windows_and_tabs` |
