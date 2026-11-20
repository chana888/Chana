#!/usr/bin/env bash
# 把 dsh 反代段写入 config.yaml（只改配置，不启动进程）
set -euo pipefail

BASE_URL="http://127.0.0.1:3080"
TOKEN=""
CONFIG="config.yaml"

usage() {
  echo "用法: $0 --token <dsh-token> [--base-url http://127.0.0.1:3080] [--config config.yaml]"
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --config) CONFIG="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

[ -n "$TOKEN" ] || { echo "缺少 --token（dsh 启动 banner 中的 token）"; exit 1; }
[ -f "$CONFIG" ] || { echo "找不到配置文件: $CONFIG"; exit 1; }
grep -q '^dsh:' "$CONFIG" && { echo "[跳过] $CONFIG 已存在 dsh 段，请手动修改"; exit 1; }

BAK="$CONFIG.bak-$(date +%Y%m%d%H%M%S)"
cp "$CONFIG" "$BAK"

cat >> "$CONFIG" <<EOF

# dsh 反代（由 scripts/setup-dsh.sh 写入）
dsh:
  base_url: $BASE_URL
  token: $TOKEN
EOF

echo "[完成] 已写入 dsh 段（备份: $BAK）"
echo "下一步：重启平台，例如 ./chana --https"
echo "注意：dsh 每次重启 token 都会变化，需要重新执行本脚本或手动同步 config.yaml"
