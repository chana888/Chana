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

# MCP 客户端依赖自检：部分 npm 镜像的 @modelcontextprotocol/client 缺 dist/index.mjs，
# 插件会 import 失败，dsh 只在 stderr 里报一行警告，MCP 工具全部不出现。这里自动修复。
DSH_DIR="$ROOT/integrations/dsh"
PLUGIN_ENTRY="$DSH_DIR/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js"
MCP_CLIENT_MJS="$DSH_DIR/node_modules/@modelcontextprotocol/client/dist/index.mjs"
if [ -f "$PLUGIN_ENTRY" ] && [ ! -f "$MCP_CLIENT_MJS" ]; then
  echo "      [修复] @modelcontextprotocol/client 缺 dist/index.mjs，从官方源重装..."
  rm -rf "$DSH_DIR/node_modules/@modelcontextprotocol/client"
  ( cd "$DSH_DIR" && npm install '@modelcontextprotocol/client@2.2.0'       --registry="${MCP_CLIENT_REGISTRY:-https://registry.npmjs.org}" --no-save --ignore-scripts --force >/dev/null 2>&1 || true )
  [ -f "$MCP_CLIENT_MJS" ] || echo "      [警告] 自动重装失败，请手动执行: cd integrations/dsh && npm install @modelcontextprotocol/client@2.2.0 --force"
fi
if [ -f "$PLUGIN_ENTRY" ]; then
  probe="$DSH_DIR/.mcp-probe.mjs"
  printf "%s
" "import('@deepseek-ai/dsh-mcp-client').then(()=>console.log('ok')).catch(e=>console.log('fail:'+e.message))" > "$probe"
  probe_out=$( cd "$DSH_DIR" && node "$probe" 2>&1 || true )
  rm -f "$probe"
  case "$probe_out" in
    *ok*) ;;
    *) echo "      [警告] dsh-mcp-client 无法加载，MCP 不会连接：$probe_out" ;;
  esac
fi
touch "$PATCH"
# 归一化 dsh 初始化的空数组 "[]"，否则追加会变成非法 YAML
if [ "$(tr -d '[:space:]' < "$PATCH")" = "[]" ] || [ ! -s "$PATCH" ]; then
  : > "$PATCH"
fi

# 注入/更新 mcp-chana 与平台已启用的外部 MCP（浏览器桥 / GSL5 等）。
# 注意：新增条目必须是 `- insert:` 块；裸 `- id: mcp-*` 会被 dsh 当成修改不存在条目而静默忽略。
python3 - "$CONFIG" "$PATCH" "$TOKEN" <<'PYX'
import json,os,re,sys
cfg,patch,token=sys.argv[1:4]
s=open(patch,encoding='utf-8').read() if os.path.exists(patch) else ''
if s.strip() in ('','[]'): s=''

# 兼容修复：裸 mcp 条目 -> insert 块
lines=s.splitlines(); kept=[]; rows=[]; collect=False
for ln in lines:
    if ln.startswith('- id: mcp-'):
        collect=True; rows.append('    '+ln); continue
    if collect:
        if ln.startswith('- '): collect=False
        elif not ln.strip(): continue
        else: rows.append('    '+ln); continue
    kept.append(ln)
if rows:
    kept.append('- insert:'); kept.extend(rows)
    s='\n'.join(kept)+'\n'
    print('      [修复] 已把裸 mcp 条目改写为 insert 块')

def upsert(s, mid, item):
    pat=r'(?m)^    - id: '+re.escape(mid)+r'\r?\n(?:(?:      |        |          |            )[^\r\n]*\r?\n)*'
    if re.search(pat,s):
        return re.sub(pat,lambda m:item,s,count=1), False
    return s.rstrip()+'\n- insert:\n'+item, True

chana=("    - id: mcp-chana\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n"
       "        serverName: chana\n        transport: streamable-http\n        url: http://127.0.0.1:8081/mcp\n"
       "        headers:\n          X-MCP-Token: %s\n        toolCallTimeoutMs: 300000\n        failOnStartupError: false\n" % token)
s,_=upsert(s,'mcp-chana',chana)

text=open(cfg,encoding='utf-8').read()
m=re.search(r'(?m)^external_mcp:\r?\n(?:(?:  )[^\r\n]*\r?\n)*',text)
servers={}
if m:
    cur=None; in_headers=False
    for ln in m.group(0).splitlines()[1:]:
        if not ln.strip(): continue
        indent=len(ln)-len(ln.lstrip()); t=ln.strip()
        if indent==4 and t.endswith(':'):
            cur=t[:-1].strip(); servers[cur]={'headers':{}}; in_headers=False; continue
        if cur is None: continue
        if indent==6:
            if t.startswith('headers:'): in_headers=True; continue
            in_headers=False
            if ':' in t:
                k,v=t.split(':',1); servers[cur][k.strip()]=v.strip().strip("'\"")
        elif indent==8 and in_headers and ':' in t:
            k,v=t.split(':',1); servers[cur]['headers'][k.strip()]=v.strip().strip("'\"")
synced=0
for name,c in servers.items():
    enabled=str(c.get('external_mcp_enable','true')).lower()=='true' and str(c.get('disabled','false')).lower()!='true'
    typ=c.get('type','http'); url=c.get('url','')
    if not enabled or not url or typ not in ('http','sse'): continue
    mid='mcp-'+name
    headers=''.join('\n          %s: %s' % (k,json.dumps(v)) for k,v in c.get('headers',{}).items())
    item=("    - id: %s\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: %s\n"
          "        transport: streamable-http\n        url: %s\n        headers: %s\n"
          "        toolCallTimeoutMs: 300000\n        failOnStartupError: false\n" % (mid,name,url,headers))
    s,_=upsert(s,mid,item); synced+=1
open(patch,'w',encoding='utf-8',newline='\n').write(s)
print('      外部 MCP 同步到 dsh: %d 个' % synced)
PYX

echo "[完成] 请依次重启：平台（让 8081 生效）→ dsh（加载 AGENTS/MCP）"
echo "       平台 MCP Token: $TOKEN"
