#!/usr/bin/env bash
# 一键启动本地浏览器 MCP 桥（控制本机 Chrome）：装依赖 → 生成/读取令牌 → 起桥 18862
# 用法: ./scripts/deploy-browser.sh [--port 18862] [--no-start]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/vps-browser/server"
PORT=18862
START=1

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --no-start) START=0; shift ;;
    -h|--help) echo "用法: $0 [--port 18862] [--no-start]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

command -v node >/dev/null 2>&1 || { echo "[错误] 需要 Node.js（>= 18）"; exit 1; }
[ -f "$SERVER_DIR/chrome-bridge.cjs" ] || { echo "[错误] 缺少 $SERVER_DIR/chrome-bridge.cjs"; exit 1; }

echo "[1/3] 安装桥依赖..."
( cd "$SERVER_DIR" && npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org )

mkdir -p "$SERVER_DIR/.runtime"
CFG="$SERVER_DIR/.runtime/config.json"
if [ ! -f "$CFG" ]; then
  if command -v openssl >/dev/null 2>&1; then TOKEN="$(openssl rand -hex 32)"; else TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"; fi
  printf '{\n  "token": "%s",\n  "public_origin": "",\n  "platform_port": 8082\n}\n' "$TOKEN" > "$CFG"
  echo "      已生成令牌"
fi
TOKEN="$(grep -oE '"token"\s*:\s*"[^"]+"' "$CFG" | head -n1 | sed -E 's/.*"([^"]+)"$/\1/')"
[ -n "$TOKEN" ] || { echo "[错误] 无法从 $CFG 读取 token"; exit 1; }

if [ "$START" -eq 1 ]; then
  LOG="$ROOT/browser-run.log"
  echo "[2/3] 启动桥（127.0.0.1:$PORT，日志: $LOG）..."
  ( cd "$SERVER_DIR" && nohup node chrome-bridge.cjs </dev/null >"$LOG" 2>&1 & )
  READY=0
  for _ in $(seq 1 20); do
    sleep 1
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then exec 3>&- 3<&-; READY=1; break; fi
  done
  [ "$READY" -eq 1 ] || { echo "[错误] 20 秒内端口 $PORT 未就绪，请查看 $LOG"; exit 1; }
else
  echo "[2/3] 跳过启动（--no-start）"
fi

echo "[3/3] 完成"
echo "        桥地址: http://127.0.0.1:$PORT/mcp   Header: X-Chana-Vps-Token: $TOKEN"
echo "        平台接入: config.yaml 的 external_mcp.servers.local-browser；"
echo "        或在「MCP 管理」里启用 local-browser（平台会自动发现该令牌）"
echo "        扩展: Chrome 打开 chrome://extensions → 加载已解压的扩展 → 选择 vps-browser/extension"
echo "        说明: 桥只控制已安装该扩展的 Chrome；需先在扩展里点 Connect"
