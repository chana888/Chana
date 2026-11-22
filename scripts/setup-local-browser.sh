#!/usr/bin/env bash
# 本地浏览器 MCP 一键准备：
#   1) 安装扩展 native host（mcp-chrome-bridger，12306）
#   2) 注册到本机 Chrome（修正 allowed_origins 为本仓库扩展 ID）
#   3) 启动 18862 MCP 桥并自检
# 用法: ./scripts/setup-local-browser.sh [--port 18862]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=18862
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    -h|--help) echo "用法: $0 [--port 18862]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done
command -v node >/dev/null 2>&1 || { echo "[错误] 需要 Node.js >= 18"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[错误] 需要 python3"; exit 1; }

EXT_DIR="$ROOT/vps-browser/extension"
HOST_DIR="$ROOT/.chrome-mcp-host"
mkdir -p "$HOST_DIR"

echo "[1/4] 安装 mcp-chrome-bridger（12306 native host）..."
if [ ! -f "$HOST_DIR/node_modules/mcp-chrome-bridger/dist/cli.js" ]; then
  ( cd "$HOST_DIR" && [ -f package.json ] || npm init -y >/dev/null 2>&1 )
  ( cd "$HOST_DIR" && npm i mcp-chrome-bridger --registry=https://registry.npmmirror.com --no-audit --no-fund >/dev/null 2>&1 \
    || npm i mcp-chrome-bridger --no-audit --no-fund >/dev/null )
fi
CLI="$HOST_DIR/node_modules/mcp-chrome-bridger/dist/cli.js"
[ -f "$CLI" ] || { echo "[错误] mcp-chrome-bridger 安装失败"; exit 1; }

echo "[2/4] 注册 native host 到本机 Chrome..."
node "$CLI" register -b chrome -f >/dev/null 2>&1 || node "$CLI" register -b all -f >/dev/null

EXT_ID=$(python3 - "$EXT_DIR/manifest.json" <<'PY'
import base64,hashlib,json,sys
m=json.load(open(sys.argv[1],encoding='utf-8'))
key=m.get('key') or ''
der=base64.b64decode(key) if key else b''
print(''.join(chr(ord('a')+int(c,16)) for c in hashlib.sha256(der).hexdigest()[:32]) if der else '')
PY
)
[ -n "$EXT_ID" ] || { echo "[错误] 无法从扩展 manifest 推导 ID"; exit 1; }
echo "      扩展 ID: $EXT_ID"

# 把本仓库扩展 ID 合并进 manifest 的 allowed_origins（Linux / macOS 常见路径）
for DIR in \
  "$HOME/.config/google-chrome/NativeMessagingHosts" \
  "$HOME/.config/google-chrome-for-testing/NativeMessagingHosts" \
  "$HOME/.config/chromium/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"; do
  [ -d "$DIR" ] || continue
  python3 - "$DIR" "$EXT_ID" <<'PY'
import glob,json,os,sys
d,eid=sys.argv[1],sys.argv[2]
for f in glob.glob(os.path.join(d,'*.json')):
    try: data=json.load(open(f))
    except Exception: continue
    origins=set(data.get('allowed_origins') or [])
    origins.add(f'chrome-extension://{eid}/')
    data['allowed_origins']=sorted(origins)
    json.dump(data,open(f,'w'),indent=2)
PY
done

echo "[3/4] 启动 18862 MCP 桥..."
bash "$ROOT/scripts/deploy-browser.sh" --port "$PORT" >/dev/null

TOKEN=$(python3 - <<PY
import json
try: print(json.load(open("$ROOT/vps-browser/server/.runtime/config.json"))['token'])
except Exception: pass
PY
)
# 自动写入平台外部 MCP 并启用，省去「MCP 管理」里再手动启用一步
if [ -f "$ROOT/config.yaml" ]; then
  python3 - "$ROOT/config.yaml" "$PORT" "$TOKEN" <<'PYCFG'
import re,sys
p,port,token=sys.argv[1:4]
s=open(p,encoding='utf-8').read()
if re.search(r'(?m)^    local-browser:[ 	]*$',s):
    sys.exit(0)
block=f"    local-browser:
      type: http
      url: http://127.0.0.1:{port}/mcp
      headers:
        X-Chana-Vps-Token: {token}
      external_mcp_enable: true
"
m=re.search(r'(?ms)^external_mcp:[ 	]*
  servers:[ 	]*
',s)
if m:
    s=s[:m.end()]+block+s[m.end():]
elif re.search(r'(?m)^external_mcp:[ 	]*$',s):
    print('[警告] external_mcp 段缺少 servers，跳过自动接入'); sys.exit(0)
else:
    s=s.rstrip()+"

# 本地浏览器 MCP（由 scripts/setup-local-browser.sh 写入）
external_mcp:
  servers:
"+block
open(p,'w',encoding='utf-8',newline='
').write(s)
print('      已自动写入 config.yaml: external_mcp.servers.local-browser（已启用）')
PYCFG
fi

echo "[4/4] 自检..."
sleep 1
curl -s --noproxy '*' -H "X-Chana-Vps-Token: $TOKEN" "http://127.0.0.1:18862/status" | python3 -c "import sys,json;d=json.load(sys.stdin);print('      browserConnected:',d.get('browserConnected'))" 2>/dev/null || echo "      （自检失败，稍后重试）"

cat <<EOF

完成。最后一步（必须手动做一次）：
  1. Chrome 打开 chrome://extensions → 开启开发者模式
  2. 加载已解压的扩展程序 → 选择 $EXT_DIR
  3. 点扩展图标 Connect（平台侧已自动启用 local-browser；若平台已在运行，重启后生效）
EOF
