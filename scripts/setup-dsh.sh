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
if grep -q '^dsh:' "$CONFIG"; then
  python3 - "$CONFIG" "$BASE_URL" "$TOKEN" <<'PYX'
import re,sys
p,base,token=sys.argv[1:4]
s=open(p,encoding='utf-8').read()
m=re.search(r'(?ms)^dsh:\n((?:  .*\n)+)',s)
if m:
    blk=m.group(1)
    blk=re.sub(r'(?m)^  base_url:.*$', '  base_url: '+base, blk, count=1)
    blk=re.sub(r'(?m)^  token:.*$', '  token: '+token, blk, count=1)
    s=s[:m.start(1)]+blk+s[m.end(1):]
    open(p,'w',encoding='utf-8').write(s)
    print('      dsh 段已更新 token')
PYX
  exit 0
fi

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
