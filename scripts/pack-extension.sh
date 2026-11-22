#!/usr/bin/env bash
# 打包浏览器扩展为 zip：解压后 manifest.json 位于根目录，供 Chrome「加载已解压的扩展程序」选择
# 用法: ./scripts/pack-extension.sh [--out-dir dist]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/vps-browser/extension"
OUT="$ROOT/dist"
while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir) OUT="$2"; shift 2 ;;
    -h|--help) echo "用法: $0 [--out-dir dist]"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done
[ -f "$EXT/manifest.json" ] || { echo "[错误] 找不到扩展目录: $EXT"; exit 1; }
mkdir -p "$OUT"
VER=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['version'])" "$EXT/manifest.json")
ZIP="$OUT/chana-browser-extension-$VER.zip"
rm -f "$ZIP"
if command -v zip >/dev/null 2>&1; then
  ( cd "$EXT" && zip -qr "$ZIP" . -x '*.DS_Store' )
else
  python3 - "$EXT" "$ZIP" <<'PYZIP'
import os,sys,zipfile
ext,out=sys.argv[1:3]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for base,_,files in os.walk(ext):
        for f in files:
            if f=='.DS_Store': continue
            p=os.path.join(base,f)
            z.write(p,os.path.relpath(p,ext))
PYZIP
fi
echo "[完成] 浏览器扩展压缩包: $ZIP"
echo "       用法: 解压到任意目录 -> Chrome chrome://extensions -> 开发者模式 -> 加载已解压的扩展程序 -> 选择解压后的文件夹"
