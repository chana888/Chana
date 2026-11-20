# -*- coding: utf-8 -*-
"""wiki.96.mk (nosafer/nosafer.github.io) 全量 markdown 镜像下载器（并发版）
用法: python download.py
输出: 相对 docs/ 的目录结构到本脚本所在目录
"""
import json, os, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

PROXY = "http://127.0.0.1:7897"
API = "https://api.github.com/repos/nosafer/nosafer.github.io/git/trees/master?recursive=1"
RAW = "https://raw.githubusercontent.com/nosafer/nosafer.github.io/master/"
THREADS = 12

def make_opener():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY}))
    opener.addheaders = [('User-Agent', 'Mozilla/5.0 wiki96-mirror')]
    return opener

tree = json.loads(make_opener().open(API, timeout=60).read().decode('utf-8'))
mds = [t['path'] for t in tree.get('tree', []) if t.get('type') == 'blob' and t['path'].lower().endswith('.md')]
print(f"共 {len(mds)} 篇 markdown", flush=True)

dest = os.path.dirname(os.path.abspath(__file__))
opener = make_opener()
lock = __import__('threading').Lock()
ok = fail = 0
pathmap = {}

def safe_rel(rel):
    """Windows 文件名转安全形式: 替换 < > : " | ? * 与尾随点/空格，记录映射"""
    parts = rel.split('/')
    out = []
    for part in parts:
        p = part
        for ch in '<>:"|?*':
            p = p.replace(ch, '_')
        p = p.rstrip('. ')
        p = p.rstrip()
        out.append(p)
    return '/'.join(out)

def fetch(p):
    global ok, fail
    rel = p.replace('docs/', '', 1)
    srel = safe_rel(rel)
    if srel != rel:
        pathmap[rel] = srel
    out = os.path.join(dest, srel)
    if os.path.exists(out) and os.path.getsize(out) > 100:
        with lock: ok += 1
        return None
    os.makedirs(os.path.dirname(out), exist_ok=True)
    url = RAW + urllib.parse.quote(p, safe='/')
    try:
        data = opener.open(url, timeout=90).read()
        if len(data) > 100:
            with open(out, 'wb') as f:
                f.write(data)
            with lock: ok += 1
        else:
            with lock: fail += 1
            print(f"  [skip] {rel} ({len(data)}B)", flush=True)
    except Exception as e:
        with lock: fail += 1
        print(f"  [FAIL] {rel}: {e}", flush=True)
    return None

with ThreadPoolExecutor(max_workers=THREADS) as ex:
    list(ex.map(fetch, mds))

if pathmap:
    with open(os.path.join(dest, 'pathmap.json'), 'w', encoding='utf-8') as f:
        json.dump(pathmap, f, ensure_ascii=False, indent=1)
    print(f"非法字符路径映射 {len(pathmap)} 条 → pathmap.json", flush=True)

print(f"完成: ok={ok} fail={fail} / {len(mds)}", flush=True)

