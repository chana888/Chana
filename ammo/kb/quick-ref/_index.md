# Quick-Ref 卡片索引

## 工作流入口卡
| 卡 | 用途 |
|----|------|
| `methodology.md` | S1 起手式（新目标强制三步骤） |
| `recon.md` | S0 信息收集命令链（资产/URL池/指纹） |
| `js-manual-analysis.md` | JS 人工分析（自己读代码找密钥/加密/隐藏接口，非工具） |
| `active-probe.md` | 主动探测 5 类总纲（不发包看不见的攻击面） |
| `toolchain.md` | 工具固定路径总表（用到即抄，永不找工具） |

## 决策表
| S1 发现 | 加载卡片 | 动作 |
|---------|----------|------|
| 参数含 id/user/uid/orderId/fileId | `idor.md` | 替换ID值，遍历+1/-1 |
| 参数值响应中回显 | `xss.md` | `<script>alert(1)</script>` 一击 |
| 参数含 search/keyword/query/q | `sqli.md` | 单引号+算术验证 |
| 排序参数 sort/order/orderBy/order[] | `sqli.md` → ORDER BY盲注 |
| 参数含 url/link/redirect/callback | `ssrf.md` | Collaborator URL |
| 参数含 file/path/template/dir | `lfi.md` | `../../etc/passwd` |
| 参数含 price/amount/points/coupon | `logic.md` | 负值/0 测试 |
| Swagger/Druid/Actuator 暴露 | `api-leak.md` | 提取接口→越权→RCE链 |
| 框架指纹命中(若依/泛微/致远等) | `fingerprint-nday.md` | 直接打 N-day POC |
| 中间件指纹命中(Tomcat/WebLogic/Redis/Jenkins等) | `midware-rce.md` | 一击打对应中间件 N-Day |
| Nacos 命中(8848/app="NACOS") | `midware-nacos.md` | 未授权读用户→默认口令→CVE-2021-29441→配置中心凭据→Redis直连 |
| 联奕 LY-IAP 个人数据中心(URL含/bdyzb/或#/myUserData/) | `lyiap-personaldata-idor.md` | selectTableDetails 改 studentdataYhbh 读任意学生身份证 |
| 403/401 返回+API路径 | `auth-bypass.md` | 路径变形绕过 |
| 注册/登录/短信接口 | `auth.md` | 验证码绕过+暴力破解 |
| 文件上传接口 | `upload.md` | 后缀→配置接管(.user.ini/.htaccess)→逻辑缺陷→WAF解析差异→云存储XSS→联合LFI |

## 秒杀原则
- 每参数一击，命中→记录信号，未命中→不恋战
- 30 秒无结果→跳过，换下一个参数/功能点
- 信号密度≥3→进入 S2 战略层

## 信号类型速记
| 代码 | 含义 | 示例 |
|------|------|------|
| SQLe | SQL 错误回显 | ORA-01756 / MySQLSyntaxError 出现在响应 |
| SQLb | SQL 盲注 | 2-1=1 vs 2-1=2 响应不同 |
| XSSr | XSS 反射 | `<script>` 原样回显 |
| SSRFp | SSRF 可能 | url 参数发起外部请求 |
| IDORp | IDOR 可能 | userId=1001→改 1002 返回他人数据 |
| APIe | API 暴露 | Swagger/Druid/Actuator 可访问 |
| MAp | MassAssignment 可能 | JSON 接受额外字段 |
| UPp | 未授权上传可能 | multipart 上传无认证 |
| SMSe | 短信轰炸可能 | send-code 无频率限制 |
