#!/usr/bin/env bash
# 把 GSL5 MCP 条目写入 config.yaml（只改配置，不启动进程）
# 用法: ./scripts/setup-gsl5.sh --token <BearerToken> [--url http://127.0.0.1:9123/message] [--config config.yaml]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN=""
URL="http://127.0.0.1:9123/message"
CONFIG="config.yaml"

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --config) CONFIG="$2"; shift 2 ;;
    -h|--help) echo "用法: $0 --token <BearerToken> [--url http://127.0.0.1:9123/message] [--config config.yaml]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

[ -n "$TOKEN" ] || { echo "缺少 --token（gsl5 启动 banner 中的 Token）"; exit 1; }
[ -f "$CONFIG" ] || { echo "找不到配置文件: $CONFIG"; exit 1; }
grep -q '^    gsl5:' "$CONFIG" && { echo "[跳过] $CONFIG 已存在 gsl5 条目"; exit 1; }

BAK="$CONFIG.bak-$(date +%Y%m%d%H%M%S)"
cp "$CONFIG" "$BAK"

BLOCK="    gsl5:
      type: http
      url: $URL
      headers:
        Authorization: Bearer $TOKEN
      external_mcp_enable: true"

if grep -q '^external_mcp:' "$CONFIG"; then
  if grep -q '^  servers: {}' "$CONFIG"; then
    awk -v block="$BLOCK" '
      /^  servers: \{\}[[:space:]]*$/ { print "  servers:"; print block; next }
      { print }
    ' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
  elif grep -q '^  servers:' "$CONFIG"; then
    awk -v block="$BLOCK" '
      /^  servers:[[:space:]]*$/ { print; print block; inserted=1; next }
      { print }
      END { if (!inserted) exit 3 }
    ' "$CONFIG" > "$CONFIG.tmp" || { rm -f "$CONFIG.tmp"; echo "[错误] external_mcp.servers 结构无法自动插入，请手动编辑"; exit 3; }
    mv "$CONFIG.tmp" "$CONFIG"
  else
    echo "[错误] 发现 external_mcp 段但没有 servers 字段，请手动编辑"
    exit 3
  fi
else
  cat >> "$CONFIG" <<EOF

# GSL5 WebShell 管理 MCP（由 scripts/setup-gsl5.sh 写入）
external_mcp:
  servers:
$BLOCK
EOF
fi

echo "[完成] 已写入 gsl5 条目（备份: $BAK）"
echo "下一步：重启平台，例如 ./chana --https"
