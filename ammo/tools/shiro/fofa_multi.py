import base64, json, os, time, urllib.request, sys

KEY = os.environ.get('FOFA_API_KEY', '')
done = set()
for line in open('<workdir>/tools/shiro/done_hosts.txt', encoding='utf-8'):
    line = line.strip()
    if line: done.add(line)

def query(q, size=200, retries=4):
    q64 = base64.b64encode(q.encode()).decode()
    url = f'https://fofa.info/api/v1/search/all?key={KEY}&qbase64={q64}&fields=host,port,protocol&size={size}&full=false'
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                d = json.loads(r.read().decode())
            if d.get('error'):
                print(f'FOFA ERROR [{q}]: {d.get("errmsg")}', file=sys.stderr); return []
            return d.get('results', [])
        except Exception as e:
            print(f'QUERY FAIL [{q}] try{i+1}: {e}', file=sys.stderr)
            time.sleep(8 + i * 6)
    return []

def norm_host(h):
    h = h.strip().lower()
    for pre in ('http://', 'https://'):
        if h.startswith(pre): h = h[len(pre):]
    return h  # 保留端口

def build_url(host, port, proto):
    h = norm_host(host)
    has_port = h.count(':') == 1 and h.rsplit(':', 1)[1].isdigit()
    if has_port:
        return f'{proto}://{h}'
    return f'{proto}://{h}:{port}'

QUERIES = [
    ('app="Apache-Shiro" && port="8080"', 200),
    ('app="Apache-Shiro" && port="9090"', 200),
    ('app="Apache-Shiro" && port="7001"', 100),
    ('app="Apache-Shiro" && port="8888"', 200),
    ('app="Apache-Shiro" && port="9000"', 100),
    ('app="Apache-Shiro" && port="9001"', 100),
    ('app="Apache-Shiro" && country="CN" && is_domain=true', 100),
]

out = []
seen = set()
for q, size in QUERIES:
    res = query(q, size)
    for host, port, proto in res:
        h = norm_host(host)
        if h in done or h in seen: continue
        seen.add(h)
        out.append(build_url(host, port, proto))
    print(f'[{q}] +{len(res)} 条 → 累计新 {len(out)}', file=sys.stderr)
    time.sleep(6)

with open('<workdir>/tools/shiro/v3_targets_pool5.txt', 'w', encoding='utf-8') as f:
    for u in out:
        f.write(u + '\n')
print(f'TOTAL NEW: {len(out)} → v3_targets_pool5.txt')
