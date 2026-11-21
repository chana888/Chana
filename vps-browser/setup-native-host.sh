#!/usr/bin/env bash
# 安装并注册 mcp-chrome-bridge native host（12306）
# 使 VPS Chrome 的 mcp-chrome 扩展能通过 connectNative 启动本机桥。
# 用法: sudo bash setup-native-host.sh [--extension-dir DIR] [--host-dir DIR] [--user USER] [--home HOME]
set -euo pipefail

EXT_DIR=${EXT_DIR:-/opt/chana-mcp-ext/extension}
HOST_DIR=${HOST_DIR:-/opt/chana-chrome-mcp}
RUN_USER=${RUN_USER:-chana-browser}
RUN_HOME=${RUN_HOME:-/var/lib/chana-browser}
PKG=mcp-chrome-bridge
REGISTRY=${NPM_REGISTRY:-https://registry.npmmirror.com}

while [ $# -gt 0 ]; do
  case "$1" in
    --extension-dir) EXT_DIR=$2; shift 2 ;;
    --host-dir) HOST_DIR=$2; shift 2 ;;
    --user) RUN_USER=$2; shift 2 ;;
    --home) RUN_HOME=$2; shift 2 ;;
    -h|--help) echo "用法: $0 [--extension-dir DIR] [--host-dir DIR] [--user USER] [--home HOME]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

id "$RUN_USER" >/dev/null 2>&1 || { echo "[错误] 用户不存在: $RUN_USER"; exit 1; }
NODE_BIN=$(command -v node) || { echo "[错误] 需要 Node.js >= 20"; exit 1; }
[ -f "$EXT_DIR/manifest.json" ] || { echo "[错误] 找不到扩展 manifest: $EXT_DIR/manifest.json"; exit 1; }

mkdir -p "$HOST_DIR"
chown "$RUN_USER:$RUN_USER" "$HOST_DIR"

if [ ! -f "$HOST_DIR/node_modules/$PKG/dist/run_host.sh" ]; then
  echo "[native-host] 安装 $PKG ..."
  ( cd "$HOST_DIR" && runuser -u "$RUN_USER" -- env HOME="$RUN_HOME" npm init -y >/dev/null 2>&1 || true )
  ( cd "$HOST_DIR" && runuser -u "$RUN_USER" -- env HOME="$RUN_HOME" npm i "$PKG" --registry="$REGISTRY" --no-audit --no-fund >/dev/null )
fi

EXT_ID=$(python3 - "$EXT_DIR/manifest.json" <<'PY'
import base64, hashlib, json, sys
m = json.load(open(sys.argv[1]))
key = m.get("key") or ""
if not key:
    print("")
else:
    der = base64.b64decode(key)
    h = hashlib.sha256(der).hexdigest()[:32]
    print("".join(chr(ord("a") + int(c, 16)) for c in h))
PY
)
[ -n "$EXT_ID" ] || { echo "[错误] 无法从扩展 manifest 推导 ID（缺少 key 字段）"; exit 1; }
echo "[native-host] 扩展 ID: $EXT_ID"

runuser -u "$RUN_USER" -- env HOME="$RUN_HOME" "$NODE_BIN" "$HOST_DIR/node_modules/$PKG/dist/cli.js" register -b chrome -f >/dev/null

SRC_DIR_JSON="$RUN_HOME/.config/google-chrome/NativeMessagingHosts"
if [ -d "$SRC_DIR_JSON" ]; then
  for f in "$SRC_DIR_JSON"/*.json; do
    [ -f "$f" ] || continue
    python3 - "$f" "$EXT_ID" <<'PY'
import json, sys
p, eid = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d["allowed_origins"] = [f"chrome-extension://{eid}/"]
json.dump(d, open(p, "w"), indent=2)
PY
  done
  for H in "$RUN_HOME/.config/google-chrome-for-testing" "$RUN_HOME/.config/chromium"; do
    mkdir -p "$H/NativeMessagingHosts"
    cp "$SRC_DIR_JSON"/*.json "$H/NativeMessagingHosts/" 2>/dev/null || true
  done
  chown -R "$RUN_USER:$RUN_USER" "$RUN_HOME/.config" 2>/dev/null || true
  mkdir -p /etc/opt/chrome/native-messaging-hosts /etc/chromium/native-messaging-hosts
  cp "$SRC_DIR_JSON"/*.json /etc/opt/chrome/native-messaging-hosts/ 2>/dev/null || true
  cp "$SRC_DIR_JSON"/*.json /etc/chromium/native-messaging-hosts/ 2>/dev/null || true
  chmod 644 /etc/opt/chrome/native-messaging-hosts/*.json /etc/chromium/native-messaging-hosts/*.json 2>/dev/null || true
fi

mkdir -p /etc/opt/chrome/policies/managed
printf '{\n  "NativeMessagingUserLevelHosts": true\n}\n' > /etc/opt/chrome/policies/managed/chana.json

echo "[native-host] 完成：$EXT_ID ；重启 Chrome 后扩展应自动连上 12306"
