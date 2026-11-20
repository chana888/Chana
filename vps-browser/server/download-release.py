from pathlib import Path
import urllib.request,zipfile,hashlib,json,time
base=Path('/opt/chana-vps-browser');opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(3):
 try:
  with opener.open('https://github.com/hangwin/mcp-chrome/releases/download/v1.0.0/chrome-mcp-server-1.0.0.zip',timeout=8) as r:
   with open(base/'release.zip','wb') as f:
    while True:
     block=r.read(65536)
     if not block:break
     f.write(block)
  break
 except Exception:
  if attempt==2:raise
with zipfile.ZipFile(base/'release.zip') as z:
 for entry in z.infolist():
  target=(base/'extension'/entry.filename).resolve()
  assert target.is_relative_to((base/'extension').resolve())
  if entry.is_dir():target.mkdir(parents=True,exist_ok=True)
  else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(entry))
print('SHA256',hashlib.sha256((base/'release.zip').read_bytes()).hexdigest(),flush=True)
for p in (base/'extension').rglob('manifest.json'):print('MANIFEST',str(p),p.read_text(),flush=True)
