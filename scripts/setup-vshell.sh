#!/usr/bin/env bash
# 把 vShell C2 桥接段写入 config.yaml（只改配置，不启动进程）
set -euo pipefail

URL="http://127.0.0.1:8095"
TOKEN=""
CONFIG="config.yaml"

usage() {
  echo "用法: $0 --token <管理Token> [--url http://127.0.0.1:8095] [--config config.yaml]"
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --url) URL="${2:-}"; shift 2 ;;
    --config) CONFIG="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

[ -n "$TOKEN" ] || { echo "缺少 --token（vShell 启动参数 -t 指定的管理 Token）"; exit 1; }
[ -f "$CONFIG" ] || { echo "找不到配置文件: $CONFIG"; exit 1; }
grep -q '^vshell:' "$CONFIG" && { echo "[跳过] $CONFIG 已存在 vshell 段，请手动修改"; exit 1; }

BAK="$CONFIG.bak-$(date +%Y%m%d%H%M%S)"
cp "$CONFIG" "$BAK"

cat >> "$CONFIG" <<EOF

# vShell C2 面板桥接（由 scripts/setup-vshell.sh 写入）
# 需先独立部署 vShell 服务端（官方编译版，不随仓库分发）
vshell:
  enabled: true
  url: $URL
  token: $TOKEN
EOF

echo "[完成] 已写入 vshell 段（备份: $BAK）"
echo "下一步：重启平台，例如 ./chana --https"
echo "提示：vShell 只监听回环时，可用 ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@host 建隧道"
