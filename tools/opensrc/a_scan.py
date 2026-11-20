# -*- coding: utf-8 -*-
"""
a_scan.py — 开源版 A 线精简扫描(资产探测) 纯标准库零依赖
==========================================================
用途: 目标资产快速梳理 — 端口扫描(fscan 默认端口) + Web 识别(指纹) + 常见路由探测(spray)

用法:
  python a_scan.py --target 192.168.1.1
  python a_scan.py --target example.com --ports "80,443,8080"
  python a_scan.py --target 192.168.1.0/24 --spray-only

输出: 资产清单(端口/服务/URL/指纹/路由), 写入 a_scan_result_<目标>.txt

铁律(与 skill opensrc-recon 一致):
  - 单请求默认 60 秒超时上限; 大目标异步执行(后台跑, 看结果文件)
"""

import argparse
import concurrent.futures
import ipaddress
import os
import re
import socket
import sys
import time
import urllib.request
import urllib.error

# ---------- fscan 默认端口(常用 1000 端口代表子集, 覆盖主流服务) ----------
DEFAULT_PORTS = [21, 22, 23, 25, 53, 80, 81, 88, 110, 111, 135, 139, 143, 161, 389,
                 443, 445, 465, 502, 512, 513, 514, 515, 548, 554, 587, 623, 636,
                 873, 902, 993, 995, 1080, 1099, 1194, 1433, 1434, 1521, 1522, 1525,
                 1723, 1883, 2049, 2121, 2181, 2200, 2222, 2375, 2376, 2379, 2380,
                 3000, 3128, 3268, 3269, 3306, 3389, 3690, 4369, 4444, 4848, 5000,
                 5005, 5044, 5060, 5432, 5601, 5631, 5632, 5671, 5672, 5900, 5984,
                 5985, 5986, 6000, 6379, 6380, 6443, 6666, 6667, 7001, 7002, 7070,
                 7777, 8000, 8001, 8008, 8009, 8010, 8020, 8060, 8069, 8080, 8081,
                 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8099, 8161,
                 8180, 8200, 8443, 8500, 8600, 8888, 8899, 9000, 9001, 9002, 9043,
                 9090, 9092, 9100, 9200, 9300, 9443, 9527, 9999, 10000, 10001,
                 10080, 10250, 10443, 11211, 15672, 16080, 18080, 20000, 28017,
                 50000, 50070, 61616, 27017]
# 常见路由字典(spray 精简版)
COMMON_PATHS = ["/", "/admin", "/admin/", "/login", "/login/", "/api", "/api/",
                "/api/v1", "/swagger", "/swagger-ui.html", "/swagger-ui/",
                "/v2/api-docs", "/v3/api-docs", "/openapi.json", "/actuator",
                "/actuator/health", "/druid", "/druid/index.html", "/console",
                "/manager", "/phpmyadmin", "/wp-admin", "/wp-login.php",
                "/index.php", "/robots.txt", "/sitemap.xml", "/web.config",
                "/.git/config", "/.svn/entries", "/backup", "/backup.zip",
                "/www.zip", "/upload", "/uploads", "/file", "/files", "/download",
                "/static", "/assets", "/js", "/css", "/user", "/users",
                "/admin/login", "/system", "/health", "/status", "/debug", "/test",
                "/demo", "/jsp", "/web", "/api/user", "/api/admin"]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) opensrc-a-scan"


def expand_targets(target):
    """IP / CIDR / 域名 展开为目标列表"""
    try:
        if "/" in target:
            return [str(ip) for ip in ipaddress.ip_network(target, strict=False)]
        ipaddress.ip_address(target)
        return [target]
    except ValueError:
        return [target]


def scan_port(ip, port, timeout=1.5):
    """单端口 TCP 连接探测"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return port if s.connect_ex((ip, port)) == 0 else None
    except Exception:
        return None


def port_scan(ip, ports, timeout=1.5, max_workers=200):
    """并发端口扫描(fscan 默认端口)"""
    open_ports = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(scan_port, ip, p, timeout): p for p in ports}
        for fut in concurrent.futures.as_completed(futs):
            r = fut.result()
            if r:
                open_ports.append(r)
    return sorted(open_ports)


def guess_service(port):
    """端口 -> 常见服务猜测"""
    svc = {21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 80: "http",
           88: "kerberos", 110: "pop3", 135: "msrpc", 139: "netbios", 143: "imap",
           161: "snmp", 389: "ldap", 443: "https", 445: "smb", 873: "rsync",
           993: "imaps", 995: "pop3s", 1080: "socks", 1433: "mssql", 1521: "oracle",
           2049: "nfs", 2181: "zookeeper", 2375: "docker", 2379: "etcd",
           3000: "grafana", 3306: "mysql", 3389: "rdp", 4369: "epmd",
           5000: "http-alt", 5432: "postgresql", 5601: "kibana", 5900: "vnc",
           6379: "redis", 6443: "k8s-api", 7001: "weblogic", 8000: "http-alt",
           8080: "http-proxy", 8081: "http-alt", 8088: "http-alt", 8161: "activemq",
           8443: "https-alt", 8888: "http-alt", 9000: "php-fpm", 9090: "prometheus",
           9092: "kafka", 9200: "elasticsearch", 9300: "elasticsearch",
           10000: "webmin", 11211: "memcached", 15672: "rabbitmq",
           27017: "mongodb", 50000: "sap", 61616: "activemq"}
    return svc.get(port, "")


def http_request(url, timeout=10, method="GET"):
    """urllib 请求, 返回 (status, title, server, len)"""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            server = resp.headers.get("Server", "")
            body = resp.read(2000)
            mt = re.search(rb"<title[^>]*>([^<]+)</title>", body, re.I | re.S)
            title = mt.group(1).decode("utf-8", "replace").strip()[:60] if mt else ""
            return (status, title, server, len(body))
    except urllib.error.HTTPError as e:
        server = e.headers.get("Server", "") if e.headers else ""
        return (e.code, "", server, 0)
    except Exception:
        return (0, "", "", 0)


def fingerprint(url, timeout=8):
    """简化指纹: 请求头 + 常见框架关键字"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="HEAD")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            head = str(resp.headers).lower()
            fp = [kw for kw in ["nginx", "apache", "iis", "tomcat", "jetty",
                                "weblogic", "jboss", "php", "django", "spring",
                                "shiro", "thinkphp", "fastjson", "flask",
                                "openresty", "caddy", "gunicorn"] if kw in head]
            return ",".join(fp[:6])
    except Exception:
        return ""


def spray_dir(base_url, timeout=5, max_workers=16):
    """常见路由探测(spray 精简版), 返回 [(path, code)]"""
    found = []
    def probe(path):
        url = base_url.rstrip("/") + path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return (path, resp.status)
        except urllib.error.HTTPError as e:
            return (path, e.code) if e.code in (200, 301, 302, 403, 500, 401) else None
        except Exception:
            return None
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for r in ex.map(probe, COMMON_PATHS):
            if r:
                found.append(r)
    return found


def main():
    ap = argparse.ArgumentParser(description="开源版 A 线精简扫描(纯标准库)")
    ap.add_argument("--target", required=True, help="目标: IP/CIDR/域名")
    ap.add_argument("--ports", default="", help="端口(默认 fscan 常用端口列表)")
    ap.add_argument("--spray-only", action="store_true", help="只做路由探测")
    ap.add_argument("--out", default="", help="输出文件")
    args = ap.parse_args()

    targets = expand_targets(args.target)
    ports = [int(p) for p in args.ports.split(",") if p.strip().isdigit()] if args.ports else DEFAULT_PORTS
    result = [f"# A 线扫描结果: {args.target} @ {time.strftime('%Y-%m-%d %H:%M:%S')}",
              f"# 目标数: {len(targets)} | 端口数: {len(ports)}"]

    web_urls = []
    if not args.spray_only:
        print(f"[1/3] 端口扫描 {args.target} ({len(ports)} 端口)...")
        for ip in targets[:10]:
            t0 = time.time()
            open_ports = port_scan(ip, ports)
            cost = time.time() - t0
            result.append(f"\n## {ip} 开放端口 ({cost:.1f}s)")
            for p in open_ports:
                svc = guess_service(p)
                line = f"{ip}:{p} ({svc})"
                result.append("  " + line)
                print("  " + line)
                if svc in ("http", "https", "http-alt", "http-proxy", "https-alt", "weblogic", "grafana", "prometheus", "kibana") or p in (80, 443, 8080, 8000, 8443, 8888, 7001, 9090, 9200, 5601, 3000):
                    proto = "https" if p in (443, 8443) else "http"
                    web_urls.append(f"{proto}://{ip}:{p}")

    # 域名直接补 Web
    if not web_urls and len(targets) == 1 and not targets[0].replace(".", "").isdigit():
        web_urls = [f"http://{targets[0]}", f"https://{targets[0]}"]

    print(f"[2/3] Web 识别 ({len(web_urls)} 个服务)...")
    web_lines = []
    for url in web_urls[:20]:
        status, title, server, blen = http_request(url)
        fp = fingerprint(url)
        if status:
            line = f"{url} | {status} | {title} | {server} | {blen}B | {fp}"
            web_lines.append(line)
            print("  " + line)
    result.append("\n## Web 服务\n" + "\n".join(web_lines))

    print(f"[3/3] 路由探测 ({len(web_urls)} 个服务 x {len(COMMON_PATHS)} 路径)...")
    for url in web_urls[:10]:
        paths = spray_dir(url)
        if paths:
            pline = f"{url} 路由: " + ", ".join(f"{p}({c})" for p, c in paths)
            result.append(pline)
            print("  " + pline)

    out_file = args.out or f"a_scan_result_{re.sub(r'[^\w.-]', '_', args.target)}.txt"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write("\n".join(result))
    print(f"\n结果已写入: {os.path.abspath(out_file)}")


if __name__ == "__main__":
    main()
