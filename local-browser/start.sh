#!/usr/bin/env bash
# 本地浏览器 MCP 一键准备（Linux/macOS）：安装 12306 native host + 启动 18862 桥
# 首次使用请先按提示在 chrome://extensions 加载 vps-browser/extension
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/setup-local-browser.sh" "$@"
