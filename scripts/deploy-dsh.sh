#!/usr/bin/env bash
# 一条命令部署 DeepSeek Harness：安装固定版本 → 启动 dsh → 解析 token → 写入 config.yaml
# 用法: ./scripts/deploy-dsh.sh [--config config.yaml] [--port 3080] [--install-only] [--no-config]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/config.yaml"
PORT=3080
INSTALL_ONLY=0
WRITE_CONFIG=1
# 依赖里有较新的 @earendil-works/pi-schema，国内镜像可能尚未同步；默认走官方源，可用 --registry 覆盖
REGISTRY="https://registry.npmjs.org"

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --registry) REGISTRY="$2"; shift 2 ;;
    --install-only) INSTALL_ONLY=1; shift ;;
    --no-config) WRITE_CONFIG=0; shift ;;
    -h|--help) echo "用法: $0 [--config config.yaml] [--port 3080] [--registry https://registry.npmjs.org] [--install-only] [--no-config]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

command -v node >/dev/null 2>&1 || { echo "[错误] 需要 Node.js >= 20，请先安装"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || { echo "[错误] Node.js 版本过低: $(node -v)，需要 >= 20"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[错误] 未找到 npm"; exit 1; }

DSH_DIR="$ROOT/integrations/dsh"
mkdir -p "$DSH_DIR"
[ -f "$DSH_DIR/package.json" ] || { echo "[错误] 缺少 $DSH_DIR/package.json"; exit 1; }

echo "[1/3] 安装 dsh 依赖（首次约几十秒）..."
( cd "$DSH_DIR" && npm install --omit=dev --no-audit --no-fund --registry="$REGISTRY" )

if [ "$INSTALL_ONLY" -eq 1 ]; then
  echo "[完成] 仅安装。启动命令: node \"$DSH_DIR/node_modules/@deepseek-ai/dsh/lib/bin.js\" web --no-open"
  exit 0
fi

LOG="$ROOT/dsh-run.log"
if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":$PORT "; then
  echo "[提示] 端口 $PORT 已被占用，假定 dsh 已在运行。若 token 变更请手动同步配置"
  TOKEN=""
else
  echo "[2/3] 启动 dsh（端口 $PORT，日志: $LOG）..."
  nohup node "$DSH_DIR/node_modules/@deepseek-ai/dsh/lib/bin.js" web --no-open >"$LOG" 2>&1 &
  echo "      PID: $!"
  TOKEN=""
  for _ in $(seq 1 30); do
    sleep 1
    TOKEN="$(grep -oE 'token=[A-Za-z0-9_-]+' "$LOG" 2>/dev/null | head -n1 | cut -d= -f2 || true)"
    [ -n "$TOKEN" ] && break
  done
  [ -n "$TOKEN" ] || { echo "[错误] 30 秒内未从日志解析到 token，请查看 $LOG"; exit 1; }
fi

if [ -n "$TOKEN" ] && [ "$WRITE_CONFIG" -eq 1 ]; then
  echo "[3/3] 写入 config.yaml（dsh 段）..."
  if [ -f "$CONFIG" ]; then
    "$ROOT/scripts/setup-dsh.sh" --token "$TOKEN" --base-url "http://127.0.0.1:$PORT" --config "$CONFIG"
  else
    echo "[跳过] 找不到 $CONFIG（先复制 config.example.yaml）"
  fi
else
  echo "[3/3] 跳过配置写入"
fi

echo "[完成] dsh 已就绪: http://127.0.0.1:$PORT/?token=$TOKEN"
echo "       重启平台后 Harness 页面即可连接；dsh 每次重启 token 都会变化，需重新执行本脚本同步"
