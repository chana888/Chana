# 本地浏览器 MCP（local-browser）

本地搭建 ChanaAgent 时，**直接控制你本机的 Chrome** 进行操作——无需 VPS、无需虚拟桌面。
与 [`vps-browser/`](../vps-browser/README.md) 使用**同一套桥与扩展**（工具集完全一致：chrome_*
点击/填表/快照/网络捕获…），区别只是浏览器跑在你自己电脑上：登录态、本机代理、Cookie 全部直接可用。

## 与 VPS 模式怎么选

| | local-browser（本模块） | vps-browser |
|---|---|---|
| 适用 | 平台搭在本机（Windows/macOS/Linux） | 平台搭在 VPS，需要固定出口 IP / 远程桌面 / 人工交接 |
| 浏览器 | 本机日常 Chrome | VPS 虚拟桌面里的独立 Chrome |
| 依赖 | Node.js ≥18 | Node.js + Xvfb/x11vnc/websockify 全套 |
| 人工操作 | 直接在本机 Chrome 上操作 | 经 /browser/ 远程桌面 |
| 要求 | **平台与浏览器同机**（桥只监听回环） | 平台与浏览器栈同 VPS |

## 三步接入

### 1. 本机 Chrome 加载扩展（只需一次，必须手动）

扩展就是一个 zip/文件夹，不需要去商店：

- **方式 A（推荐，分发包）**：运行 `setup-local-browser` 时会自动生成
  `dist/chana-browser-extension-<版本>.zip`（也可直接下载 [chana-browser-extension.zip](https://github.com/chana888/Chana/releases/latest/download/chana-browser-extension.zip)），
  解压到任意目录。
- **方式 B（仓库源码）**：直接使用仓库里的 `vps-browser/extension/` 目录。

然后在 Chrome 里：

1. 打开 `chrome://extensions/`，右上角开启**开发者模式**
2. 「加载已解压的扩展程序」→ 选择**解压后的文件夹**（或 `vps-browser/extension/`）
3. 记下扩展卡片上的 ID（脚本会按 manifest key 自动配置，无需手工填）

> Chrome 不接受直接选择 zip，必须先解压；也不允许程序静默安装“未打包扩展”，
> 所以这一步无法自动完成，其余全部由脚本处理。

### 2. 运行一键准备脚本

```powershell
.\scripts\setup-local-browser.ps1      # Windows
```

```bash
./scripts/setup-local-browser.sh         # Linux / macOS
```

脚本自动完成：

- 安装 `mcp-chrome-bridger`（扩展 connectNative 拉起的 12306 native host，纯 JS 依赖，Windows 无需 VS 编译环境）
- 注册 native host，并把 `allowed_origins` 修正为本仓库扩展 ID
- 启动 18862 MCP 桥（生成令牌写入 `vps-browser/server/.runtime/config.json`）
- 调 `/status` 自检 `browserConnected`

也可以用 `local-browser/start.bat` / `start.sh`，它们等价于调用上述脚本。

### 3. 平台启用（MCP 管理页，推荐）

桥就绪后，在平台「MCP 管理」找到 `local-browser` 点启用即可（令牌自动读取
`vps-browser/server/.runtime/config.json`，也可用环境变量 `CHANA_BROWSER_TOKEN` 指定）。
之后对话/任务中即可使用 `local-browser__chrome_*` 全套工具。

## 常见问题

- **平台连不上桥**：确认 start 脚本窗口还在运行（关窗即停）；`curl http://127.0.0.1:18862/status -H "X-Chana-Vps-Token: <令牌>"` 应返回 200
- **工具报"扩展未连接"**：Chrome 里扩展被禁用或休眠——重新打开扩展弹窗激活；标签页全部关闭时扩展可能休眠，留一个标签页
- **换端口/多实例**：桥固定 18862，与 vps-browser 模式互斥（同一进程语义），二选一
- **安全提示**：该扩展可操作本机浏览器的全部登录态，仅在你可控的机器上使用；不用时在扩展页停用
