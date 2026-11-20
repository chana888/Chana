import base64, json, os, urllib.request, urllib.parse, sys

KEY = os.environ.get('FOFA_API_KEY', '')
done = set()
for line in open('<workdir>/tools/shiro/done_hosts.txt', encoding='utf-8'):
    line = line.strip()
    if line: done.add(line)

def query(q, size=100, fields='host,port,protocol,title'):
    q64 = base64.b64encode(q.encode()).decode()
    url = f'https://fofa.info/api/v1/search/all?key={KEY}&qbase64={q64}&fields={fields}&size={size}&full=false'
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            d = json.loads(r.read().decode())
        if d.get('error'):
            print('FOFA ERROR:', d.get('errmsg')); return []
        return d.get('results', [])
    except Exception as e:
        print('QUERY FAIL:', e); return []

def norm_host(h):
    h = h.strip().lower()
    for pre in ('http://', 'https://'):
        if h.startswith(pre): h = h[len(pre):]
    if ':' in h and h.count(':') == 1:
        host, port = h.rsplit(':', 1)
        if port.isdigit(): h = host
    return h

if __name__ == '__main__':
    q = sys.argv[1]
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    fields = sys.argv[3] if len(sys.argv) > 3 else 'host,port,protocol,title'
    res = query(q, size, fields)
    fresh = []
    for row in res:
        host, port, proto, title = row
        h = norm_host(host)
        if h in done: continue
        url = f'{proto}://{host}:{port}' if not host.endswith(f':{port}') else f'{proto}://{host}'
        url = f'{proto}://{host}' if (port in ('80','443')) else url
        if (proto=='http' and port=='80') or (proto=='https' and port=='443'):
            url = f'{proto}://{host}'
        fresh.append((url, title))
    for u, t in fresh:
        print(u, '|', t)
    print(f'--- 查询返回{len(res)} 新{len(fresh)} ---', file=sys.stderr)
