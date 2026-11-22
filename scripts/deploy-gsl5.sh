#!/usr/bin/env bash
# 一键部署 GSL5（GodzillaSuper）WebShell 管理 MCP：启动服务 → 解析 Token → 写入 config.yaml
# 用法: ./scripts/deploy-gsl5.sh [--config config.yaml] [--port 9123] [--host 127.0.0.1] [--compat-port 9124] [--no-compat] [--no-config]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/config.yaml"
PORT=9123
COMPAT_PORT=9124
HOST=127.0.0.1
WRITE_CONFIG=1
NO_COMPAT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --no-config) WRITE_CONFIG=0; shift ;;
    --compat-port) COMPAT_PORT="$2"; shift 2 ;;
    --no-compat) NO_COMPAT=1; shift ;;
    -h|--help) echo "用法: $0 [--config config.yaml] [--port 9123] [--host 127.0.0.1] [--no-config]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

command -v java >/dev/null 2>&1 || { echo "[错误] 需要 Java 运行环境（JDK/JRE 17+），请先安装"; exit 1; }
JAR="$ROOT/integrations/gsl5/bin/gsl5.jar"
[ -f "$JAR" ] || { echo "[错误] 缺少 $JAR"; exit 1; }

TOKEN=""
port_in_use() { (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1; }
if port_in_use; then
  echo "[提示] 端口 $PORT 已被占用，假定 GSL5 已在运行；请手动确认 Token 或重启服务后再执行"
else
  LOG="$ROOT/gsl5-run.log"
  echo "[1/3] 启动 GSL5 MCP（$HOST:$PORT，日志: $LOG）..."
  ( cd "$ROOT/integrations/gsl5" && nohup java -jar "$JAR" mcp "$PORT" "$HOST" </dev/null >"$LOG" 2>&1 & )
  for _ in $(seq 1 30); do
    sleep 1
    TOKEN="$(grep -oE '^Token: [A-Za-z0-9_-]+' "$LOG" 2>/dev/null | head -n1 | awk '{print $2}' || true)"
    [ -n "$TOKEN" ] && break
  done
  [ -n "$TOKEN" ] || { echo "[错误] 30 秒内未解析到 Token，请查看 $LOG"; exit 1; }
fi

# GSL5 的 /message 是旧版 HTTP+SSE：POST 返回 202 且把响应放在 body 里，
# dsh 的 MCP 客户端只认 200，会一直等到超时。用本地代理规范成 200。
MCP_URL="http://$HOST:$PORT/message"
if [ "$NO_COMPAT" -eq 0 ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "[提示] 未找到 node，跳过 MCP 兼容代理（平台可直连，dsh 将无法挂载 gsl5）"
  else
    compat_up() { (exec 3<>"/dev/tcp/127.0.0.1/$COMPAT_PORT") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1; }
    if ! compat_up; then
      echo "[兼容] 启动 MCP 代理 127.0.0.1:$COMPAT_PORT -> $MCP_URL"
      nohup node "$ROOT/scripts/mcp-http-compat.mjs" --listen "127.0.0.1:$COMPAT_PORT" --upstream "$MCP_URL"         >"$ROOT/gsl5-compat.log" 2>&1 &
      for _ in $(seq 1 15); do sleep 1; compat_up && break; done
    fi
    if compat_up; then MCP_URL="http://127.0.0.1:$COMPAT_PORT/message"; else echo "[警告] MCP 代理未就绪，dsh 可能无法挂载 gsl5（见 gsl5-compat.log）"; fi
  fi
fi

if [ "$WRITE_CONFIG" -eq 1 ]; then
  if [ -f "$CONFIG" ]; then
    if [ -n "$TOKEN" ] || grep -q '^    gsl5:[[:space:]]*$' "$CONFIG"; then
      echo "[2/3] 写入 config.yaml（external_mcp.gsl5）..."
      "$ROOT/scripts/setup-gsl5.sh" --token "$TOKEN" --url "$MCP_URL" --config "$CONFIG"
    else
      echo "[跳过] GSL5 已在运行且 config 尚无 gsl5 条目：拿不到 Token，请重启 GSL5 后重跑本脚本"
    fi
  else
    echo "[跳过] 找不到 $CONFIG（先复制 config.example.yaml）"
  fi
else
  echo "[2/3] 跳过配置写入"
fi

echo "[3/3] 完成"
[ -n "$TOKEN" ] && echo "        GSL5 MCP: $MCP_URL  Bearer Token: $TOKEN"
echo "        原始服务: http://$HOST:$PORT/message（旧版 202 语义，dsh 请走兼容代理）"
echo "        重启平台后「MCP 管理」和「GSL5 控制台」即可使用（约 60+ 工具）"
