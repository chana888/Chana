# VPS 可视化浏览器栈（vps-browser）

在 VPS 上常驻一个**可视化 Chrome 窗口**（Xvfb 虚拟桌面）：人工通过网页远程桌面操作，
agent 通过 MCP 控制同一个浏览器——两者共享登录态，互不抢键鼠。

```
人工 ──HTTPS──> gateway(18863, 平台Cookie鉴权) ──> viewer.html/js 远程桌面
                    │                                   │ WebSocket
                    │                                   v
                    │                            websockify(18864)
                    │                                   │
                    │                            x11vnc(5971, 回环)
                    │                                   │
                    │                            Xvfb :97 + openbox
                    │                                   │
                    │                            Chrome (CDP 9223, 回环)
                    │                                   └─ mcp-chrome 扩展(12306, 回环)
                    │                                            ^
                    │                                     chrome-bridge(18862, MCP)
                    └── /clipboard 等控制路由 ────────────────┘
agent/平台 ──MCP(http+Token)──> 18862/mcp ──> chrome_* 工具集
                cliphelper(18865, root): 代执行 xclip 剪贴板读写
```

所有后端端口仅监听回环；公网只暴露平台自身的 HTTPS 入口。

## 组件

| 路径 | 说明 |
|------|------|
| `extension/` | mcp-chrome 扩展（0.0.19 + iframe-docref 补丁），部署到 `/opt/chana-mcp-ext/extension`，Chrome 以 `--load-extension` 加载 |
| `server/chrome-bridge.cjs` | MCP 桥（18862）：连扩展 12306，对外提供 streamable-http MCP（`/mcp`，Header `X-Chana-Vps-Token`），另有 `/status` `/control` |
| `server/gateway.cjs` | 入口网关（18863）：平台 Cookie 鉴权（打平台 `/api/auth/validate` 验 admin）、静态 viewer、WebSocket 代理、剪贴板路由 |
| `server/cliphelper.cjs` | 剪贴板助手（18865，root 运行）：代浏览器用户执行 xclip |
| `server/request-tools.cjs` | 请求捕获/重放工具实现（bridge 依赖） |
| `server/viewer.html` `viewer.js` | 远程桌面页：状态灯、人工/agent 模式切换、剪贴板双向直通、快捷键 |
| `server/workflow-agent.md` | agent 浏览器操作手册（工具用法/iframe/证据纪律） |
| `server/mcp_client.py` | MCP 自检客户端（tools/list） |
| `units/` | systemd 服务 ×8 + 每日 04:37 定时重启 Chrome（清会话标签存量） |
| `nginx/browser_location.inc.example` | Nginx 反代模板（`@PUBLIC_ORIGIN@` 占位） |
| `server/config.example.json` | 运行时配置模板（token / public_origin / platform_port） |

## 一键部署

```bash
cd vps-browser
sudo bash install.sh --origin https://<你的VPS域名或IP> --platform-port 8082 --with-nginx
```

脚本自动完成：系统依赖（Xvfb/openbox/x11vnc/websockify/xclip/xdotool/CJK字体）→
运行用户 `chana-browser` → 文件部署 → `npm install` → 下载 Chrome for Testing（npmmirror 镜像优先）→
生成随机 Token → systemd 服务全家 → 可选 Nginx 反代 → 自检并打印接入信息。

依赖：Node.js ≥ 18、Nginx（平台已带）、平台主服务运行中（鉴权用）。

### 兼容性说明（开箱即用要点）

- **Chrome 版本固定 `127.0.6533.119`**：Chrome 137+ 会忽略 `--load-extension`，且 native messaging 行为变化，
  导致扩展无法连上桥（表现为 `/browser/` 能看画面但 `browserConnected:false`）。可用 `CHROME_VERSION=...` 覆盖。
- **自动注册 native host**：install.sh 会调用 `setup-native-host.sh`，安装 `mcp-chrome-bridge`、按扩展 manifest 的 key
  计算扩展 ID、写入 `allowed_origins` 并复制到各 Chrome 变体目录（google-chrome / chrome-for-testing / chromium / 系统级）。
- **noVNC 资源**：viewer 通过 `/assets/core/rfb.js` 加载 noVNC，install.sh 会安装 `novnc` 包；nginx 需把 `/assets/` 反代到网关（模板已含，注意 `proxy_pass` 末尾不要带 `/`）。
- **平台使用 HTTPS 时**：启动脚本加 `PLATFORM_TLS=1`（写入 `.runtime/config.json` 的 `platform_tls`），
  网关校验平台登录态时会走 HTTPS，否则 `auth_request` 会 302/401。

部署后：
- **人工入口**：`https://<你的VPS>/browser/`（平台管理员登录后操作，agent 自动暂停等待交接）
- **agent 接入**：平台 `config.yaml` 的 `external_mcp.servers` 添加（install.sh 结尾会打印带真实 Token 的片段）：

```yaml
external_mcp:
  servers:
    vps-browser:
      type: http
      url: http://127.0.0.1:18862/mcp
      headers:
        X-Chana-Vps-Token: "<install.sh 生成的 token>"
```

## 人工 / agent 协作

1. 会话中让 agent 用浏览器打开目标 → 打开远程桌面，agent 自动暂停
2. 人工在远程 Chrome 内完成登录 / 验证码 / 扫码 / 短信
3. 点「✓ 完成登录，交给 agent」→ 回会话发「已登录，继续」
4. agent 操作期间远程画面可见但键鼠暂停；需要再次人工介入时点「✋ 我要操作」

账号状态保留在 VPS Chrome 独立 profile（`/var/lib/chana-browser/chrome-profile`），无需导出 Cookie。
网站看到的是 VPS 出口 IP。

## 运维

```bash
systemctl is-active chana-browser-{display,wm,chrome,vnc,websockify,mcp,gateway,cliphelper}
python3 /opt/chana-vps-browser/mcp_client.py        # MCP 工具清单自检
journalctl -u chana-browser-mcp -u chana-browser-gateway -n 30 --no-pager
```

- 每日 04:37 定时重启 Chrome（`chana-browser-chrome-nightly.timer`），清空会话标签存量、钉死标签基线，防止标签无限累积
- Chrome 网络栈卡死（新标签全部 about:blank）时 `systemctl restart chana-browser-chrome`
- 修改 gateway/viewer 等代码后重启对应服务即可，无需动平台主服务
- Token 轮换：改 `.runtime/config.json` 后重启 `chana-browser-mcp` 与 `chana-browser-gateway`，并同步平台 `config.yaml`

## 安全边界

- 远程桌面入口要求**平台管理员会话**（网关实时校验，会话退出/撤销后连接约 5 秒内被强制关闭）
- MCP 端口仅回环 + 独立 Token，不暴露公网
- 所有平台管理员共享同一个浏览器实例（不按账号隔离）；目标站登录态对持有有效管理员会话的人可见
