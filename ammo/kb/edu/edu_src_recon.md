---
name: EDU-SRC 信息收集与资产发现
description: 教育行业SRC信息收集、资产发现、指纹识别方法论
type: reference
originSessionId: ee20960f-1d7b-4892-a567-02767c979e0a
---
# EDU-SRC 信息收集与资产发现方法论

> 教育行业（edu.cn）资产特点：域名体系杂乱、非标准端口多、系统类型固定（教务/OA/邮箱/VPN/图书馆/一卡通/统一认证）、弱口令普遍、第三方集成多（企微/钉钉/小程序）。

---

## 一、范围界定策略

### 1.1 教育行业资产类型与范围

| 资产类型 | 典型目标 | 收集要点 |
|---------|---------|---------|
| 主站（PC端） | 官网、门户站 | 重点关注附属子域名（sso/login/teacher/classroom） |
| 教务系统 | 选课/查成绩/评教 | 金智、强智、青果、正方四大厂商，默认密码（学号/身份证后6位） |
| 在线教学 | 直播教室、录播、点名 | WebRTC技术，易产生Token泄露、Room ID遍历 |
| 管理后台 | OA、家校通、教务管理 | 内网穿透或SaaS服务，注意辨别归属（自研 vs 第三方） |
| 移动端 | APK/IPA、H5页面 | 接口加密逻辑、埋点数据泄露、本地存储敏感信息 |
| 小程序 | 微信/支付宝/字节小程序 | 家长端常见，易存在未授权访问及敏感接口泄露 |
| 第三方集成 | OSS对象存储、COS、七牛云 | Bucket权限配置不当导致数据全量泄露 |
| 统一认证 | CAS、SSO、金智SSO | 认证绕过、Ticket伪造、Session固定 |

### 1.2 范围界定规则

- **In Scope**：主域名 `*.xxx.edu.cn`、分校区/子公司域名（如 `beijing.xxx.edu.cn`）
- **Out of Scope**：第三方SaaS系统（超星/青果/金智教育 —— 漏洞归属厂商）、物理攻击、社工、Self-XSS
- **资产归属判定**：教育行业大量使用混合云，需通过CNAME解析或ICP备案号关联主域名
- **红线**：严禁测试真实家长通讯录和身份证信息，仅允许使用测试账号
- **重点补充**：校企合作域名、附属医院域名、研究院域名往往是薄弱点，不要只盯着 `edu.cn`

### 1.3 教育SRC特有技巧

- 关注「民办院校」「独立学院」「职业技术学院」—— 防御薄弱但常与主校区共享部分网络/系统
- 重点关注开学季（9-10月）：弱密码高发期，管理员安全意识最差
- 教育行业最关注漏洞类型：越权查看他人答案/成绩、防刷课绕过、支付绕过
- 小程序与H5防御较弱，作业系统、通知系统常驻微信生态

---

## 二、资产发现技术

### 2.1 域名资产收集（广度优先）

#### 证书透明性（CT日志）—— EDU最高效方法
```bash
# crt.sh 查询（JSON格式）
curl -s 'https://crt.sh/?q=%.xxx.edu.cn&output=json' | jq -r '.[].name_value' | sort -u

# 批量通配查询某省级教育网
curl -s 'https://crt.sh/?q=%25.edu.cn&output=json' | jq -r '.[].name_value' | sort -u
```

#### OneForAll 深度使用
```bash
# 单校深度扫描
python oneforall.py --target xxx.edu.cn run

# 批量收集所有edu.cn资产（慎量级）
python oneforall.py --target suffix edu.cn run
```
- 内置 CT 模块（crt.sh、Google CT、Entrust CT、CertDB）
- 第三方服务（AlienVault OTX、SecurityTrails、RapidDNS）
- 暴力破解模块：EDU子域名有强烈中文特征（jw教务、xl学工、jx教学），定制字典命中率高

#### 资产测绘平台常用语法
```bash
# FOFA
domain=".edu.cn"
cert="edu.cn"
body="Powered by SiteServer"

# Hunter（鹰图）
domain="edu.cn"

# Quake（360）
# 搜索 edu.cn 关联资产

# Shodan / ZoomEye
# 配合 edu.cn 证书/域名搜索
```

#### 备案查询
- ICP备案查询、天眼查、企查查 —— 通过学校法人名称查主体备案域名
- 可发现非 `edu.cn` 的校企合作域名、独立学院域名

#### 搜索引擎Dork
```
site:edu.cn intitle:管理后台
site:xxx.edu.cn filetype:asp
site:xxx.edu.cn inurl:jwid
site:xxx.edu.cn inurl:login
```

#### 关联域名收集
- SecurityTrails、IP反查 —— 学校B段/C段IP关联域名
- 光缆、卫星、校企机房常存在意料之外的关联

#### 域传送漏洞检查
```bash
# 虽然已罕见，但仍是子域名收集检查项
nslookup -type=ns xxx.edu.cn
nslookup -type=axfr xxx.edu.cn <dns_server>
```

### 2.2 IP资产与端口扫描

#### 存活探测
```bash
# Fscan / ksubdomain 先存活验证过滤无效域名

# httpx 探测Web存活并识别技术栈
httpx -l urls.txt -title -tech-detect -status-code -content-length
```

#### 端口扫描重点
```bash
# 非标准端口重点关注
masscan -p21,22,80,443,8080,8443,9090,3306,6379,10000,9000,5000 xxx.xxx.xxx.0/24
```

| 端口 | 服务 | EDU场景 |
|------|------|---------|
| 21 | FTP | 匿名登录/弱口令 |
| 22 | SSH | 弱口令爆破 |
| 3306 | MySQL | 数据库外露 |
| 6379 | Redis | 未授权访问 |
| 8080/8443 | Tomcat/Spring | 历史漏洞 |
| 9090 | Cockpit/固件 | 管理口外露 |
| 10000 | Webmin | RCE历史漏洞 |

#### C段收集
教育网拥有大量连续IP段（如 `202.xxx.xxx.0/24`），C段扫描常能发现同一运维团队管理的其他兄弟院校系统。

### 2.3 子域名爆破字典关键词（EDU特色）

根据中文拼音和英文缩写定制的子域名词典：

```
jw（教务）    jwc（教务处）   xl（学工）
jx（教学）    jxjy（继续教育） tsg（图书馆）
oa           sso           cas（统一认证）
mail         webmail       vpn
cms          portal        yjs（研究生）
zs（招生）    job（就业）    hq（后勤）
dangwei（党委） credit（学分） exam（考试）
pay          course（课程）  classroom
```

---

## 三、指纹识别要点

### 3.1 高校建站系统（CMS）指纹

#### 西安博达（Boda/站群系统）—— 占有率极高
- 路径特征：`/oldweb/`、`/e/action/`、`s5/`
- 响应头特征：`X-Powered-By` 特定值
- FOFA语法：`body="博达" && domain=".edu.cn"`

#### 大汉（Dahan/大汉版通）
- Cookie固定格式：`ASPSESSIONID`
- 特殊JS文件路径
- 底部版权信息固定「大汉」字样

#### 动易（PowerEasy/SiteWeaver）
- 特征文件：`PE.PE`
- 登录路径：`/User/`
- PE特有接口

#### 南方未名/南方网站群
- 后台路径：`/nss/`
- 接口返回JSON特征
- 定制的Ajax请求格式

#### SiteServer CMS
- URL格式：`/sites/`
- 管理员入口：`/siteserver/`

#### 其他
- 玄峰、TurboCMS、WordPress（实验室/教师个人站）、Drupal/Joomla（少见）

### 3.2 框架与组件指纹

#### 后端框架
| 框架 | 指纹特征 |
|------|---------|
| Spring Boot | Whitelabel Error Page、`/actuator`、`JSESSIONID`、`X-Application-Context` |
| ThinkPHP | 特定URL模式、tp5报错页面、静态资源路径 |
| ASP.NET | ViewState、`.aspx`后缀、ASP.NET Session ID |
| Struts2 | `.action`后缀、特定错误信息 |

#### 前端组件
- layui、LayUI Admin —— 老旧管理系统标配
- EasyUI —— 极老旧系统
- Vue.js + Element UI —— 现代网站改版

#### 中间件与服务器
- IIS（主流）、Nginx/Apache（Linux分区）、Tomcat（Java应用）

### 3.3 指纹识别工具

```bash
# EHole（棱洞）- 国内红队常用，内置国产CMS指纹
ehole finger -l urls.txt

# ObserverWard - Rust编写高性能指纹识别
# TideFinger（潮汐指纹）

# WhatWeb 深度扫描
whatweb -a 3 xxx.edu.cn

# httpx 快速检测
httpx -l urls.txt -tech-detect -title -status-code

# Wappalyzer - 浏览器插件（对国产CMS规则不全，需自行定制）
```

### 3.4 四大教务系统指纹与攻击面

| 教务系统 | 厂商 | 指纹特征 | 常见漏洞 |
|---------|------|---------|---------|
| 正方 | 正方软件 | URL含 `zfts`、`js_main` | 默认密码(学号)、越权查成绩/课表、未授权访问 |
| 强智 | 强智科技 | 特定登录页/logo | SQL注入、逻辑漏洞 |
| 青果 | 青果软件 | URL含 `qg`、特定错误信息 | 弱口令、信息泄露 |
| 金智 | 金智教育 | URL含 `wisedu`、`cas` | SSO绕过、默认密码 |

---

## 四、敏感信息发现

### 4.1 JS文件提取与API发现

#### 工具链
```bash
# LinkFinder - JS中提取API端点
python linkfinder.py -i https://xxx.edu.cn/js/app.js -o cli
python linkfinder.py -i domain_list.txt -d

# JSFinder - 提取子域名+API
node JSFinder.js -u https://xxx.edu.cn

# jsluice - Go编写的JS分析工具
jsluice analyze app.js
```

#### JS文件收集
```bash
# 方式一：爬虫提取
katana -u https://xxx.edu.cn -jc -d 2

# 方式二：历史记录
gau xxx.edu.cn | grep '\.js$'
waybackurls xxx.edu.cn | grep '\.js$'

# 方式三：直接抓取
curl -s https://xxx.edu.cn | grep -oP 'src="[^"]+\.js"' | sort -u
```

#### JS中重点提取的敏感信息
- API接口路径：`/api/`、`/v1/`、`/graphql`
- 内网地址：`10.x.x.x`、`172.x.x.x`、`192.168.x.x`
- AccessKey/SecretKey：OSS/AWS/阿里云密钥
- Token：企业微信Token、钉钉Token、JWT
- 硬编码密码
- OSS Bucket名称：`xxx-homework`、`xxx-user-data`

#### Nuclei模板交叉验证
```bash
nuclei -t ~/nuclei-templates/exposed-tokens/ -l js_files.txt
```

### 4.2 目录与备份文件扫描

#### dirsearch 常用命令
```bash
# 通用扫描
python3 dirsearch.py -u http://target.edu.cn -e php,asp,jsp,html,txt -t 30 -x 404,400 -i 200,301,302,403

# 备份文件专项探测
python3 dirsearch.py -u http://target.edu.cn -w backup_wordlist.txt -e zip,rar,tar,gz,sql,7z,inc

# 配合代理低调用
python3 dirsearch.py -u http://target.edu.cn --proxy http://127.0.0.1:8080 --random-agent

# ffuf 快速扫描
ffuf -u http://target.edu.cn/FUZZ -w backup_dict.txt -mc 200,301,302
```

#### 高校备份文件字典（高概率）
```
/www.zip           /www.rar           /web.tar.gz
/backup.sql        /data.sql          /db.sql
/backup.zip        /backup.tar.gz     /dump.sql
/.env              /.git/config       /.svn/entries
/WEB-INF/web.xml   /config/database.php  /config.php.bak
/index.php.bak     /admin.php.swp     /phpinfo.php
/robots.txt        /runtime/          /logs/
```

#### 高校敏感目录字典（高概率）
```
/admin             /system            /manage
/login             /upload            /ueditor
/api               /swagger           /api-docs
/test              /console           /actuator
/images            /static            /install
/phpmyadmin        /phpMyAdmin        /myadmin
```

### 4.3 Git/SVN泄露

```bash
# githack
python githack.py http://target.edu.cn/.git/

# svn-extractor
python svn-extractor.py -u http://target.edu.cn/.svn/
```

常见场景：运维人员在服务器上直接 `git init` 并上传网站源码，泄露数据库密码。

### 4.4 云存储枚举（EDU高频漏洞）

教育行业是文件上传漏洞的重灾区（课件/头像/作业），直接导致Bucket权限被拿下。

```bash
# OSS枚举工具
aliyun-oss-bucket --url http://target.oss-cn-beijing.aliyuncs.com
cloud_enum -k target
```

常见命名模式：`xxx-homework`、`xxx-user-data`、`xxx-courseware`、`xxx-upload`

### 4.5 源码平台泄露（Gitee/GitHub）

```
site:github.com "xxx.edu.cn" password
site:github.com "xxx.edu.cn" 学生
site:github.com "xxx.edu.cn" 成绩
site:gitee.com "学院" "数据库"
```

教育行业的代码仓库权限控制普遍较弱，常见忘记删除配置文件的 `.sql` 备份或 `.env`。

### 4.6 网盘/文库泄露

```
site:pan.baidu.com 某大学 学生名单
site:wenku.baidu.com 某大学 内部
```

直接拿到社工库级别的敏感信息。

---

## 五、EDU系统默认凭据与弱口令

### 5.1 常见默认密码规则
- 学号（最常见）
- 身份证后6位
- 生日（YYYYMMDD/MMDD）
- 空密码（123456/000000）
- 通用密码：`123456`、`admin123`、`password`
- 系统默认后台密码（各CMS自带的admin/admin）

### 5.2 常用后台入口路径

| 系统类型 | 典型路径 |
|---------|---------|
| 教务系统 | `/jwid`、`/jwgl`、`/jwxt`、`/jwglxt` |
| OA系统 | `/seeyon`、`/yyoa`、`/default/login`、`/login.do` |
| 邮箱系统 | `/coremail`、`/mail`、`/webmail` |
| 统一认证 | `/cas/login`、`/sso/login` |
| 站群后台 | `/e/action/`、`/s5/`、`/siteserver/` |

### 5.3 历史泄露数据利用
- hunter.how 平台查泄露
- 脱裤库查密码复用
- 利用招办系统、校友系统获取学生真实信息（学号/身份证），反查邮箱/VPN/教务系统

---

## 六、PoC/Checklist

### 6.1 信息收集完整流程

```
[域名收集] 
  ├─ crt.sh 批量拉取证书日志
  ├─ OneForAll 深度扫描
  ├─ FOFA/Hunter/ZoomEye 测绘平台
  ├─ 备案查询（天眼查/企查查）
  └─ 搜索引擎Dork
    │
    v
[存活探测 + 端口扫描 + C段]
  ├─ httpx 存活检测+技术栈识别
  ├─ masscan/nmap 端口扫描（重点21/22/3306/6379/8080/8443/9090/10000）
  └─ C段扫描发现兄弟院校资产
    │
    v
[Web指纹识别] ──→ [系统分类打标签]
  ├─ EHole/ObserverWard 国产CMS识别
  ├─ WhatWeb 深度指纹
  ├─ 手动识别博达/大汉/正方/金智等特征
  └─ 教务/OA/邮箱/VPN/图书馆/统一认证分类
    │                    │
    v                    v
[敏感文件扫描]      [漏洞漏扫 + 弱口令]
  ├─ dirsearch/ffuf    ├─ 默认密码尝试
  │  备份文件字典      ├─ 学号/身份证后6位
  ├─ LinkFinder        ├─ 历史漏洞POC
  │  JS API提取        └─ Nuclei/Xray漏扫
  ├─ githack
  │  Git泄露
  ├─ 云存储枚举
  └─ GitHub/Gitee搜索
    │                    │
    v                    v
[信息泄露利用]      [弱口令突破]
 (AK/SK/Token/       (教务/OA/邮箱/VPN)
  数据库密码)
    │                    │
    v                    v
      [最终权限提升 / 获取数据]
```

### 6.2 各阶段快速检查清单

#### 阶段一：域名收集
- [ ] crt.sh 查询 `%.xxx.edu.cn`
- [ ] OneForAll 完整模块扫描
- [ ] FOFA 搜索 `domain=".edu.cn"`
- [ ] ICP备案查主体关联域名
- [ ] 搜索引擎Dork收集
- [ ] IP反查关联域名
- [ ] 域传送漏洞检查

#### 阶段二：存活探测
- [ ] httpx 批量存活+技术栈检测
- [ ] masscan/nmap 端口扫描
- [ ] C段关联资产扫描

#### 阶段三：指纹识别
- [ ] EHole/ObserverWard 指纹识别
- [ ] 识别CMS类型（博达/大汉/正方/金智等）
- [ ] 识别框架类型（Spring Boot/ThinkPHP/ASP.NET）
- [ ] 按系统类型分类打标签（教务/OA/邮箱/VPN/图书馆/统一认证）

#### 阶段四：敏感信息挖掘
- [ ] LinkFinder/JSFinder JS提取API
- [ ] dirsearch 备份文件扫描
- [ ] githack/svn-extractor 版本控制泄露
- [ ] 云存储枚举（OSS/COS）
- [ ] GitHub/Gitee 搜索敏感信息
- [ ] 百度网盘/文库搜索
- [ ] Swagger/API文档泄露检查

#### 阶段五：弱口令尝试
- [ ] 学号/身份证后6位/生日登录尝试
- [ ] 系统默认密码（admin/admin等）
- [ ] 历史泄露数据密码复用
- [ ] 后台入口路径遍历

### 6.3 重点系统漏洞关注清单

| 系统 | 漏洞关注点 | 利用难度 |
|------|-----------|---------|
| 教务系统 | 默认密码、越权查成绩/课表、评教绕过 | 低 |
| OA系统 | 文件上传、SQL注入、信息泄露 | 中 |
| 邮箱系统 | 弱口令爆破、邮件头注入、SSRF | 中 |
| 统一认证 | 认证绕过、Ticket伪造、Session固定 | 高 |
| SSL VPN | 历史RCE(CVE)、密码复用 | 中 |
| 图书馆系统 | SQL注入（典型）、Session未验证 | 低 |
| Struts2 | S2-045/S2-061批量 | 中 |
| ThinkPHP | 5.x RCE批量 | 中 |
| Spring Boot | Actuator泄露、HeapDump | 低 |

### 6.4 工具速查表

| 用途 | 工具 | 推荐参数/命令 |
|------|------|-------------|
| CT日志查询 | crt.sh + jq | `curl -s 'https://crt.sh/?q=%.xxx.edu.cn&output=json' \| jq -r '.[].name_value' \| sort -u` |
| 子域名收集 | OneForAll | `python oneforall.py --target xxx.edu.cn run` |
| 存活探测 | httpx | `httpx -l urls.txt -title -tech-detect -status-code` |
| 端口扫描 | masscan | `masscan -p1-65535 --rate=1000 xxx.xxx.xxx.0/24` |
| 指纹识别 | EHole | `ehole finger -l urls.txt` |
| 目录扫描 | dirsearch | `dirsearch -u http://target.edu.cn -e php,asp,jsp -x 404` |
| 备份扫描 | ffuf | `ffuf -u http://target/FUZZ -w backup.txt -mc 200` |
| JS提取 | LinkFinder | `linkfinder.py -i https://target/js/app.js -o cli` |
| Git泄露 | githack | `githack.py http://target/.git/` |
| 云存储枚举 | cloud_enum | `cloud_enum -k target-name` |
| 漏扫 | Nuclei | `nuclei -l urls.txt -t cves/ -t exposures/` |
| Web截图 | EyeWitness/Aquatone | 快速识别敏感系统 |

### 6.5 FOFA 常用搜索语法（EDU专版）

```
# 全部edu.cn资产
domain=".edu.cn"

# 教务系统
body="教务" && domain=".edu.cn"
body="正方" && domain=".edu.cn"

# 博达站群
body="博达" && domain=".edu.cn"

# OA系统
body="泛微" && domain=".edu.cn"
body="致远" && domain=".edu.cn"

# 邮箱
body="Coremail" && domain=".edu.cn"

# 统一认证
body="CAS" && domain=".edu.cn"
body="统一身份认证" && domain=".edu.cn"

# 存在actuator泄露的Spring Boot
body="actuator" && domain=".edu.cn"

# Swagger API文档泄露
body="Swagger" && domain=".edu.cn"
```

---

## 七、核心口诀

1. **crt.sh 是第一数据源**，证书透明性对edu.cn效果最好
2. **不看主站看子站**，分校区/独立学院/附属机构防御最弱
3. **定制字典命中率高**，jw/xl/jx/tsg 等拼音缩写词是关键
4. **JS文件是金矿**，API接口+AK/SK+内网地址常在其中
5. **备份文件不要停**，www.zip + .git + .env 是泄露三件套
6. **开学季是黄金期**，9-10月弱密码命中率最高
7. **非标端口优先扫**，8080/8443/9090/10000/3306/6379
8. **C段扫兄弟院校**，同一运维团队管理的系统常有相同漏洞
9. **小程序+H5是捷径**，防御弱、更新快、历史漏洞多
10. **云存储记得枚举**，OSS/COS权限配置不当是EDU高频漏洞
