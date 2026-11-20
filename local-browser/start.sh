#!/usr/bin/env bash
# ChanaAgent 本地浏览器 MCP 桥启动脚本（macOS / Linux）
# 用法: bash start.sh   （Ctrl+C 停止；后台运行: nohup bash start.sh >/dev/null 2>&1 &）
set -euo pipefail
DIR="$(cd "$(dirname "$BASH_SOURCE")/../vps-browser/server" && pwd)"
cd "$DIR"
mkdir -p .runtime
if [ ! -f .runtime/config.json ]; then
  node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync('.runtime/config.json',JSON.stringify({token:c.randomBytes(32).toString('hex'),public_origin:'',platform_port:8082},null,2))"
  chmod 600 .runtime/config.json 2>/dev/null || true
fi
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.runtime/config.json')).token)")
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --omit=dev
cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
本地浏览器 MCP 桥启动中 (127.0.0.1:18862)，Ctrl+C 停止
访问令牌: $TOKEN

平台接入: config.yaml 的 external_mcp.servers 添加
  local-browser:
    type: http
    url: http://127.0.0.1:18862/mcp
    headers:
      X-Chana-Vps-Token: "$TOKEN"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
exec node chrome-bridge.cjs
