#!/usr/bin/env bash
# 一条命令部署 vShell C2 桥接：启动官方服务端 → 写入 config.yaml
# 注意：vShell 服务端为独立产品（官方编译版，不随仓库分发），需先用 --binary 指定其路径
# 用法: ./scripts/deploy-vshell.sh --binary /path/to/vshell-server-standalone-linux [--port 8095] [--agent-port 8084] [--token xxx] [--config config.yaml]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/config.yaml"
BINARY=""
PORT=8095
AGENT_PORT=8084
TOKEN=""
WRITE_CONFIG=1
START=1

while [ $# -gt 0 ]; do
  case "$1" in
    --binary) BINARY="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --agent-port) AGENT_PORT="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --config) CONFIG="$2"; shift 2 ;;
    --no-start) START=0; shift ;;
    --no-config) WRITE_CONFIG=0; shift ;;
    -h|--help)
      echo "用法: $0 --binary <官方服务端路径> [--port 8095] [--agent-port 8084] [--token xxx] [--config config.yaml]"
      echo "说明: 仓库不包含 vShell 二进制（503MB + 独立授权）；请从官方获取后指定路径"
      exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

if [ -z "$BINARY" ]; then
  # 未显式指定时，尝试使用仓库内本地放置的服务端（该目录不入库）
  for cand in \
    "$ROOT/integrations/vshell/server/vshell-server-standalone-linux" \
    "$ROOT/integrations/vshell/server/vshell-server-standalone"; do
    [ -f "$cand" ] && { BINARY="$cand"; break; }
  done
fi

if [ -z "$BINARY" ]; then
  cat >&2 <<'EOF'
[错误] 未指定 vShell 服务端。
  vShell C2 是独立产品（官方编译版，源码不公开，带独立授权），仓库默认不包含其二进制。
  请把官方服务端放到 integrations/vshell/server/ 下（该目录已 gitignore），或用 --binary 指定：
      ./scripts/deploy-vshell.sh --binary /opt/vshell/vshell-server-standalone-linux
  注意：服务端通常需要同目录的 www/ 前端资源。
EOF
  exit 2
fi
[ -f "$BINARY" ] || { echo "[错误] 找不到服务端: $BINARY"; exit 1; }

if [ -z "$TOKEN" ]; then
  if command -v openssl >/dev/null 2>&1; then
    TOKEN="$(openssl rand -hex 24)"
  else
    TOKEN="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
fi

LOG="$ROOT/vshell-run.log"
if [ "$START" -eq 1 ]; then
  echo "[1/3] 启动 vShell（面板 $PORT / Agent $AGENT_PORT，日志: $LOG）..."
  nohup "$BINARY" -a 127.0.0.1 -p "$PORT" -ap "$AGENT_PORT" -t "$TOKEN" >"$LOG" 2>&1 &
  echo "      PID: $!"
  READY=0
  for _ in $(seq 1 20); do
    sleep 1
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then exec 3>&- 3<&-; READY=1; break; fi
  done
  [ "$READY" -eq 1 ] || { echo "[错误] 20 秒内端口 $PORT 未就绪，请查看 $LOG"; exit 1; }
else
  echo "[1/3] 跳过启动（--no-start）"
fi

if [ "$WRITE_CONFIG" -eq 1 ]; then
  echo "[2/3] 写入 config.yaml（vshell 段）..."
  if [ -f "$CONFIG" ]; then
    "$ROOT/scripts/setup-vshell.sh" --token "$TOKEN" --url "http://127.0.0.1:$PORT" --config "$CONFIG"
  else
    echo "[跳过] 找不到 $CONFIG（先复制 config.example.yaml）"
  fi
else
  echo "[2/3] 跳过配置写入"
fi

echo "[3/3] 完成"
echo "        面板: http://127.0.0.1:$PORT/?token=$TOKEN  管理Token: $TOKEN"
echo "        面板默认账号: admin / admin123（首次登录后请立即修改）"
echo "        Agent 回连端口: $AGENT_PORT（如需目标上线，记得在防火墙放行）"
echo "        远程/隔离部署可改用: ssh -N -L 127.0.0.1:$PORT:127.0.0.1:<面板端口> user@host"
