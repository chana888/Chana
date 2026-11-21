#!/usr/bin/env bash
# 配置同源入口：平台 + /browser/ 共用一个 HTTPS 端口。
# 前置：
#   1) 平台已改为内部监听（如 127.0.0.1:8082），并已重启
#   2) vps-browser/install.sh --with-nginx 已执行过（生成 /etc/nginx/browser_location.inc）
# 用法：
#   sudo bash vps-browser/nginx/install-same-origin.sh \
#     --server-name 1.2.3.4 --port 443 \
#     --platform-upstream https://127.0.0.1:8082 \
#     --cert /etc/nginx/ssl/chana.crt --key /etc/nginx/ssl/chana.key
set -euo pipefail
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_NAME=""; PORT=443; UPSTREAM="https://127.0.0.1:8082"
CERT=""; KEY=""; ORIGIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --server-name) SERVER_NAME="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --platform-upstream) UPSTREAM="$2"; shift 2 ;;
    --cert) CERT="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --origin) ORIGIN="$2"; shift 2 ;;
    -h|--help) echo "用法: $0 --server-name <域名/IP> [--port 443] [--platform-upstream https://127.0.0.1:8082] --cert <crt> --key <key> [--origin https://host:port]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done
[ -n "$SERVER_NAME" ] || { echo "[错误] 缺少 --server-name"; exit 1; }
[ -f "${CERT:-/nonexistent}" ] || { echo "[错误] 证书不存在: ${CERT:-<未指定>}"; exit 1; }
[ -f "${KEY:-/nonexistent}" ] || { echo "[错误] 私钥不存在: ${KEY:-<未指定>}"; exit 1; }
[ -f /etc/nginx/browser_location.inc ] || { echo "[错误] 缺少 /etc/nginx/browser_location.inc（先执行 vps-browser/install.sh --with-nginx）"; exit 1; }

[ -n "$ORIGIN" ] || { if [ "$PORT" = "443" ]; then ORIGIN="https://$SERVER_NAME"; else ORIGIN="https://$SERVER_NAME:$PORT"; fi; }
sed -i "s|@PUBLIC_ORIGIN@|$ORIGIN|g" /etc/nginx/browser_location.inc

sed -e "s|@SERVER_NAME@|$SERVER_NAME|g" \
    -e "s|@NGINX_PORT@|$PORT|g" \
    -e "s|@CERT_PATH@|$CERT|g" \
    -e "s|@KEY_PATH@|$KEY|g" \
    -e "s|@PLATFORM_UPSTREAM@|$UPSTREAM|g" \
    "$SRC_DIR/nginx/chana_same_origin_server.conf.example" > /etc/nginx/conf.d/chana.conf

nginx -t
nginx -s reload
echo "[完成] 同源入口已启用：$ORIGIN/（平台） + $ORIGIN/browser/（远程桌面）"
echo "       平台内部地址：$UPSTREAM ；PUBLIC_ORIGIN=$ORIGIN"
echo "       注意：vps-browser 安装时需 PLATFORM_TLS=1，且网关 platform_port 指向平台内部端口"
