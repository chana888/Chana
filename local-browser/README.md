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

### 1. 本机 Chrome 安装配套扩展

1. 打开 `chrome://extensions/`，右上角开启**开发者模式**
2. 「加载已解压的扩展程序」→ 选择仓库的 `vps-browser/extension/` 目录
3. 点浏览器工具栏的扩展图标，确认服务状态为**已连接**（扩展监听本机 12306 端口）

### 2. 启动 MCP 桥

```bash
# Windows: 双击 start.bat
# macOS / Linux:
bash local-browser/start.sh
```

脚本自动：生成随机访问令牌（写入 `vps-browser/server/.runtime/config.json`）→ 安装 Node 依赖 →
启动桥（`127.0.0.1:18862`），并打印接入信息。**令牌只对应本机，无需外发。**

### 3. 平台启用（MCP 管理页，推荐）

平台的 **MCP 管理** 页在启动时已自动预置 `local-browser` 条目（默认停用；访问令牌会自动读取
`vps-browser/server/.runtime/config.json`，也可用环境变量 `CHANA_BROWSER_TOKEN` 指定）——
桥跑起来后，在 MCP 管理页找到 `local-browser` 点启用即可，无需手工编辑配置文件。

手工方式（等价）：平台 `config.yaml` 的 `external_mcp.servers` 添加：

```yaml
external_mcp:
  servers:
    local-browser:
      type: http
      url: http://127.0.0.1:18862/mcp
      headers:
        X-Chana-Vps-Token: "<start 脚本打印的令牌>"
```

之后对话/任务中即可使用 `local-browser__chrome_*` 全套浏览器工具。
agent 操作手册见 [`../vps-browser/server/workflow-agent.md`](../vps-browser/server/workflow-agent.md)。

## 常见问题

- **平台连不上桥**：确认 start 脚本窗口还在运行（关窗即停）；`curl http://127.0.0.1:18862/status -H "X-Chana-Vps-Token: <令牌>"` 应返回 200
- **工具报"扩展未连接"**：Chrome 里扩展被禁用或休眠——重新打开扩展弹窗激活；标签页全部关闭时扩展可能休眠，留一个标签页
- **换端口/多实例**：桥固定 18862，与 vps-browser 模式互斥（同一进程语义），二选一
- **安全提示**：该扩展可操作本机浏览器的全部登录态，仅在你可控的机器上使用；不用时在扩展页停用
