#!/usr/bin/env bash
# ============================================================
# ChanaAgent VPS 浏览器栈一键部署脚本
# 部署后效果：VPS 上常驻一个可视化 Chrome 窗口（Xvfb 虚拟桌面），
#   - 人工经 https://<你的VPS>/browser/ 远程桌面操作（平台账号鉴权）
#   - agent 经 127.0.0.1:18862 MCP（X-Chana-Vps-Token）控制同一个浏览器
# 用法：
#   sudo bash install.sh --origin https://1.2.3.4 [--platform-port 8082] [--with-nginx]
# 可用环境变量覆盖默认路径：INSTALL_DIR / EXT_PARENT / RUN_USER
# ============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$BASH_SOURCE")" && pwd)"
INSTALL_DIR=${INSTALL_DIR:-/opt/chana-vps-browser}
EXT_PARENT=${EXT_PARENT:-/opt/chana-mcp-ext}
RUN_USER=${RUN_USER:-chana-browser}
RUN_HOME=/var/lib/chana-browser
PLATFORM_PORT=8082
PUBLIC_ORIGIN=""
WITH_NGINX=0
CHROME_VERSION=${CHROME_VERSION:-127.0.6533.119} # 137+ 会忽略 --load-extension 且 native messaging 受限，固定 127
PLATFORM_TLS=${PLATFORM_TLS:-0}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin) PUBLIC_ORIGIN="$2"; shift 2 ;;
    --platform-port) PLATFORM_PORT="$2"; shift 2 ;;
    --with-nginx) WITH_NGINX=1; shift ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "请用 root 运行"; exit 1; }
[[ -n "$PUBLIC_ORIGIN" ]] || { echo "用法: sudo bash install.sh --origin https://<你的VPS域名或IP> [--platform-port 8082] [--with-nginx]"; exit 1; }
[[ -d "$SRC_DIR/server" && -d "$SRC_DIR/extension" && -d "$SRC_DIR/units" ]] || { echo "请在仓库 vps-browser/ 目录内运行本脚本"; exit 1; }

log() { echo -e "\033[32m[deploy]\033[0m $*"; }

# ---------- 1. 系统依赖 ----------
log "1/9 安装系统依赖"
PKGS_BASE="xauth xclip xdotool"
if command -v dnf >/dev/null 2>&1; then
  dnf install -y xorg-x11-server-Xvfb openbox x11vnc websockify novnc $PKGS_BASE google-noto-sans-cjk-ttc-fonts || \
    dnf install -y xorg-x11-server-Xvfb openbox x11vnc websockify novnc $PKGS_BASE
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y xvfb openbox x11vnc websockify novnc $PKGS_BASE fonts-noto-cjk
else
  echo "未识别的包管理器，请手动安装: Xvfb openbox x11vnc websockify xauth xclip xdotool 中文字体"; exit 1
fi

command -v node >/dev/null 2>&1 || { echo "缺少 Node.js (>=18)。请先安装，例如: curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && dnf install -y nodejs"; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
(( NODE_MAJOR >= 18 )) || { echo "Node 版本过低 (当前 $(node -v))，需要 >=18"; exit 1; }

# ---------- 2. 运行用户与目录 ----------
log "2/9 创建运行用户与目录"
id "$RUN_USER" >/dev/null 2>&1 || useradd -r -m -d "$RUN_HOME" -s /sbin/nologin "$RUN_USER"
mkdir -p "$INSTALL_DIR" "$EXT_PARENT" "$RUN_HOME"
cp -r "$SRC_DIR/server/." "$INSTALL_DIR/"
rm -rf "$INSTALL_DIR/.runtime" "$INSTALL_DIR/node_modules"
mkdir -p "$INSTALL_DIR/.runtime"
cp -r "$SRC_DIR/extension" "$EXT_PARENT/extension"

# ---------- 3. Node 依赖 ----------
log "3/9 安装 Node 依赖 (npm install)"
( cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund ) >/dev/null

# ---------- 4. Chrome for Testing ----------
log "4/9 获取 Chrome for Testing"
if [[ ! -x "$INSTALL_DIR/chrome-linux64/chrome" ]]; then
  ( cd "$INSTALL_DIR" && npx -y @puppeteer/browsers install chrome@${CHROME_VERSION} --base-url https://cdn.npmmirror.com/binaries/chrome-for-testing --path "$INSTALL_DIR/.chrome-dl" ) \
  || ( cd "$INSTALL_DIR" && npx -y @puppeteer/browsers install chrome@${CHROME_VERSION} --path "$INSTALL_DIR/.chrome-dl" )
  CHROME_DIR=$(find "$INSTALL_DIR/.chrome-dl" -maxdepth 2 -type d -name 'chrome-linux64' | head -1)
  [[ -n "$CHROME_DIR" ]] || { echo "Chrome 下载失败，请手动解压 chrome-linux64 到 $INSTALL_DIR/"; exit 1; }
  ln -sfn "$CHROME_DIR" "$INSTALL_DIR/chrome-linux64"
fi

# ---------- 5. 令牌与运行时配置 ----------
log "5/9 生成访问令牌与运行时配置"
TOKEN=$(openssl rand -hex 32)
cat > "$INSTALL_DIR/.runtime/config.json" <<EOF
{
  "token": "$TOKEN",
  "public_origin": "$PUBLIC_ORIGIN",
  "platform_port": $PLATFORM_PORT,
  "platform_tls": $([ "$PLATFORM_TLS" = "1" ] && echo true || echo false)
}
EOF
chmod 600 "$INSTALL_DIR/.runtime/config.json"

# X 会话授权文件
if [[ ! -f "$RUN_HOME/.Xauthority" ]]; then
  runuser -u "$RUN_USER" -- bash -c 'touch ~/.Xauthority && xauth add :97 . "$(mcookie)"' || \
    { touch "$RUN_HOME/.Xauthority"; xauth -f "$RUN_HOME/.Xauthority" add :97 . "$(mcookie)"; }
fi

chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR" "$EXT_PARENT/extension" "$RUN_HOME"
chmod 700 "$RUN_HOME"

# ---------- 6. systemd 服务 ----------
log "6/9 安装 systemd 服务"
cp "$SRC_DIR"/units/*.service "$SRC_DIR"/units/*.timer /etc/systemd/system/ 2>/dev/null || true
NODE_BIN=$(command -v node)
sed -i "s|/usr/local/bin/node|$NODE_BIN|g" /etc/systemd/system/chana-browser-*.service
for d in "$SRC_DIR"/units/*.service.d; do
  [[ -d "$d" ]] && { mkdir -p "/etc/systemd/system/$(basename "$d")"; cp "$d"/* "/etc/systemd/system/$(basename "$d")"/; }
done
systemctl daemon-reload
systemctl enable --now chana-browser-display.service chana-browser-wm.service \
  chana-browser-vnc.service chana-browser-websockify.service \
  chana-browser-mcp.service chana-browser-gateway.service chana-browser-cliphelper.service
systemctl enable --now chana-browser-chrome-nightly.timer
bash "$SRC_DIR/setup-native-host.sh" --extension-dir "$EXT_PARENT/extension" --user "$RUN_USER" --home "$RUN_HOME" || \
  echo "native host 注册失败：稍后可手动执行 vps-browser/setup-native-host.sh"
systemctl restart chana-browser-chrome.service

# ---------- 7. Nginx（可选） ----------
if [[ $WITH_NGINX -eq 1 ]]; then
  log "7/9 配置 Nginx 反代"
  if command -v nginx >/dev/null 2>&1; then
    sed "s|@PUBLIC_ORIGIN@|$PUBLIC_ORIGIN|g" "$SRC_DIR/nginx/browser_location.inc.example" > /etc/nginx/browser_location.inc
    nginx -t 2>/dev/null && nginx -s reload || echo "nginx -t 未通过：请在 server{443} 块中添加  include /etc/nginx/browser_location.inc;  后 reload"
    grep -rq 'browser_location.inc' /etc/nginx/conf.d/ /etc/nginx/nginx.conf 2>/dev/null || \
      echo "提示：请在 HTTPS server 块中添加  include /etc/nginx/browser_location.inc;  后 nginx -s reload"
  else
    echo "未检测到 nginx，跳过（可稍后手动配置 $SRC_DIR/nginx/browser_location.inc.example）"
  fi
else
  log "7/9 跳过 Nginx（未指定 --with-nginx）"
fi

# ---------- 8. 自检 ----------
log "8/9 服务自检"
sleep 5
FAILED=""
for s in display wm chrome vnc websockify mcp gateway cliphelper; do
  systemctl is-active --quiet "chana-browser-$s.service" || FAILED="$FAILED chana-browser-$s"
done
[[ -n "$FAILED" ]] && echo "以下服务未就绪（查日志 journalctl -u <服务名> -n 30）:$FAILED" || echo "全部 8 个服务 active"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:18862/status" -H "X-Chana-Vps-Token: $TOKEN" || echo 000)
[[ "$CODE" == "200" ]] && echo "MCP 桥接(18862)自检通过" || echo "MCP 自检返回 $CODE（Chrome 启动与扩展加载需要约 20 秒，可稍后重试）"

# ---------- 9. 输出接入信息 ----------
log "9/9 完成。接入信息："
cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
远程桌面入口（人工）:  $PUBLIC_ORIGIN/browser/
                        （平台管理员账号登录）

MCP 接入（agent）: 在平台 config.yaml 的 external_mcp.servers 中添加：
  vps-browser:
    type: http
    url: http://127.0.0.1:18862/mcp
    headers:
      X-Chana-Vps-Token: "$TOKEN"

本令牌只在此显示一次，已写入 $INSTALL_DIR/.runtime/config.json
agent 操作手册: $INSTALL_DIR/workflow-agent.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
