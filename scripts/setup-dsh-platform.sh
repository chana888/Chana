#!/usr/bin/env bash
# 打通 dsh（DeepSeek Harness）与平台的联动：
#   1) 启用平台 MCP（8081 + 静态令牌）
#   2) 安装 AGENTS.md（仓库 AGENTS-TEMPLATE.md → ~/.dsh/AGENTS.md）
#   3) 软链技能库（~/.dsh/skills、~/skills → 仓库 skills/）
#   4) 在 dsh 的 cordis.patch.yml 注入 mcp-chana 客户端
# 用法: ./scripts/setup-dsh-platform.sh [--config config.yaml]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/config.yaml"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
TOKEN="${CHANA_MCP_TOKEN:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    -h|--help) echo "用法: $0 [--config config.yaml]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

[ -f "$CONFIG" ] || { echo "[错误] 找不到 $CONFIG"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[错误] 需要 python3"; exit 1; }

if [ -z "$TOKEN" ]; then
  TOKEN=$(python3 - "$CONFIG" <<'PY'
import re,sys
s=open(sys.argv[1],encoding='utf-8').read()
m=re.search(r'(?ms)^mcp:\n((?:  .*\n)+)',s)
if m:
    t=re.search(r'(?m)^  auth_header_value:\s*"?([0-9a-fA-F]{16,})"?',m.group(1))
    if t: print(t.group(1)); raise SystemExit
PY
)
fi
[ -n "$TOKEN" ] || TOKEN=$(openssl rand -hex 32)

echo "[1/4] 启用平台 MCP（127.0.0.1:8081）"
python3 - "$CONFIG" "$TOKEN" <<'PY'
import re,sys
path,token=sys.argv[1],sys.argv[2]
s=open(path,encoding='utf-8').read()
m=re.search(r'(?ms)^mcp:\n((?:  .*\n)+)',s)
if not m:
    s+=f"\nmcp:\n  enabled: true\n  host: 127.0.0.1\n  port: 8081\n  auth_header: \"X-MCP-Token\"\n  auth_header_value: {token}\n  allow_global_access: true\n"
else:
    block=m.group(0)
    block=re.sub(r'(?m)^  enabled:.*$','  enabled: true',block,count=1)
    block=re.sub(r'(?m)^  host:.*$','  host: 127.0.0.1',block,count=1)
    block=re.sub(r'(?m)^  port:.*$','  port: 8081',block,count=1)
    if re.search(r'(?m)^  auth_header_value:',block):
        block=re.sub(r'(?m)^  auth_header_value:.*$',f'  auth_header_value: {token}',block,count=1)
    else:
        block=block.rstrip()+"\n"+f"  auth_header_value: {token}\n"
    if re.search(r'(?m)^  allow_global_access:',block):
        block=re.sub(r'(?m)^  allow_global_access:.*$','  allow_global_access: true',block,count=1)
    else:
        block=block.rstrip()+"\n  allow_global_access: true\n"
    s=s[:m.start()]+block+s[m.end():]
open(path,'w',encoding='utf-8').write(s)
print('      config.yaml mcp 段已更新')
PY

echo "[2/4] 安装 AGENTS.md → $DSH_HOME/AGENTS.md"
mkdir -p "$DSH_HOME"
sed "s|<repo>|$ROOT|g" "$ROOT/AGENTS-TEMPLATE.md" > "$DSH_HOME/AGENTS.md"

echo "[3/4] 软链技能库"
ln -sfn "$ROOT/skills" "$DSH_HOME/skills"
ln -sfn "$ROOT/skills" "$HOME/skills"

echo "[4/4] 注入 mcp-chana 到 dsh 配置"
mkdir -p "$DSH_HOME/profiles/web"
PATCH="$DSH_HOME/profiles/web/cordis.patch.yml"
touch "$PATCH"
# dsh 初始化会写入空数组 "[]"；直接追加会变成非法 YAML，这里先归一化
if [ "$(tr -d '[:space:]' < "$PATCH")" = "[]" ] || [ ! -s "$PATCH" ]; then
  : > "$PATCH"
fi
if grep -q 'mcp-chana' "$PATCH"; then
  echo "      已存在 mcp-chana 配置，跳过"
else
  cat >> "$PATCH" <<EOF

- insert:
    - id: mcp-chana
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: chana
        transport: streamable-http
        url: http://127.0.0.1:8081/mcp
        headers:
          X-MCP-Token: $TOKEN
        toolCallTimeoutMs: 300000
        failOnStartupError: false
EOF
  echo "      已写入 mcp-chana"
fi

# 把平台已启用的外部 MCP（浏览器桥 / GSL5 等）也注入 dsh，让 agent 直接拿到 chrome_* 等工具
python3 - "$CONFIG" "$PATCH" <<'PYX'
import json,os,re,sys
cfg,patch=sys.argv[1],sys.argv[2]
text=open(cfg,encoding='utf-8').read()
m=re.search(r'(?ms)^external_mcp:\n((?:  .*\n)+)',text)
servers={}
if m:
    cur=None; in_headers=False
    for ln in m.group(1).splitlines():
        if not ln.strip(): continue
        indent=len(ln)-len(ln.lstrip()); s=ln.strip()
        if indent==4 and s.endswith(':'):
            cur=s[:-1].strip(); servers[cur]={'headers':{}}; in_headers=False; continue
        if cur is None: continue
        if indent==6:
            if s.startswith('headers:'): in_headers=True; continue
            in_headers=False
            if ':' in s:
                k,v=s.split(':',1); servers[cur][k.strip()]=v.strip().strip("'\"")
        elif indent==8 and in_headers and ':' in s:
            k,v=s.split(':',1); servers[cur]['headers'][k.strip()]=v.strip().strip("'\"")
existing=open(patch,encoding='utf-8').read() if os.path.exists(patch) else ''
added=0
for name,cfg2 in servers.items():
    enabled=str(cfg2.get('external_mcp_enable','true')).lower()=='true' and str(cfg2.get('disabled','false')).lower()!='true'
    typ=cfg2.get('type','http'); url=cfg2.get('url','')
    if not enabled or not url or typ not in ('http','sse'): continue
    mid='mcp-'+name
    if 'id: '+mid in existing: continue
    headers=''.join('\n          %s: %s' % (k,json.dumps(v)) for k,v in cfg2.get('headers',{}).items())
    block='\n- insert:\n    - id: %s\n      name: \'@deepseek-ai/dsh-mcp-client\'\n      config:\n        serverName: %s\n        transport: streamable-http\n        url: %s\n        headers: %s\n        toolCallTimeoutMs: 300000\n        failOnStartupError: false\n' % (mid,name,url,headers)
    with open(patch,'a',encoding='utf-8') as f: f.write(block)
    existing+=block; added+=1
print('      外部 MCP 注入 dsh: %d 个' % added)
PYX

echo "[完成] 请依次重启：平台（让 8081 生效）→ dsh（加载 AGENTS/MCP）"
echo "       平台 MCP Token: $TOKEN"
