---
name: kb-path-discovery-methodology
description: 路径发现综合方法论 — 被动提取/主动扫描/源码泄露/递归发现/框架指纹，五层全覆盖
metadata: 
  node_type: memory
  type: reference
  created: 2026-06-16
  originSessionId: a2db9c8b-4782-4783-9434-84db8f2aa314
---

# 路径发现综合方法论

## 原则
1. 先广度后深度：全部路径扫描 <5分钟，优先级高于任何业务漏洞测试
2. 五层覆盖：被动提取 → 主动扫描 → 源码泄露 → 递归扩展 → 框架指纹
3. 非标端口 = 必跑完整服务指纹

## 第一层：被动提取（零请求 / <30秒）

从已获取页面中提取路径，不产生额外请求：

### 1a. HTML 属性提取
```bash
curl -sk "TARGET/page" | grep -oP '(?:src|href|action|url|path|content)=["\x27]([^"\x27]+)["\x27]' | sort -u
```

### 1b. HTML/JS 注释提取（常含调试路径）
```bash
curl -sk "TARGET/page" | grep -oP '<!--(.*?)-->' 
curl -sk "TARGET/page" | grep -oP '//\s*(?:TODO|FIXME|DEBUG|xxx).*'
curl -sk "TARGET/page" | grep -oP '/\*[\s\S]*?\*/'
```

### 1c. JS 文件递归分析
```bash
# 提取所有 script src → 逐个获取 JS 内容 → 提取路径
curl -sk "TARGET/page" | grep -oP '<script[^>]*src="([^"]+)"' | while read line; do
    js=$(echo "$line" | grep -oP '(?<=src=")[^"]+')
    curl -sk "TARGET/$js" | grep -oP '(?:url|path|api|endpoint|baseUrl|route|location)\s*[:=]\s*["\x27]([^"\x27]+)["\x27]'
done
```

### 1d. JS source map 提取（还原原始路径）
```bash
# .map 文件包含原始文件路径和源码
curl -sk "TARGET/js/app.js" | tail -1 | grep -o 'sourceMappingURL=.*'
curl -sk "TARGET/js/app.js.map" | python3 -c "import sys,json;d=json.load(sys.stdin);print('\n'.join(d.get('sources',[])))"
```

### 1e. robots.txt / sitemap.xml（网站主动暴露的路径）
```bash
curl -sk "TARGET/robots.txt"
curl -sk "TARGET/sitemap.xml"
curl -sk "TARGET/sitemap.xml.gz" | gunzip
```

## 第二层：主动扫描（<3分钟）

### 2a. curl 快速标配扫（30秒）
```bash
# WebService/SOAP
for p in /services/ /services/version /services/wsdl /axis2/services/ /ws/ /webservice/ /soap/ ; do
    echo -n "$p: "; curl -sk -o /dev/null -w "%{http_code} %{size_download}" "TARGET${p}"; echo ""
done
# 框架标配
for p in /dwr/ /dwr/index.html /api/ /swagger-ui.html /swagger-resources /v2/api-docs /v3/api-docs /druid/ /druid/index.html /druid/sql.html /actuator/ /actuator/health /actuator/env /actuator/heapdump /manager/ /host-manager/ /console/ /admin/ ; do
    echo -n "$p: "; curl -sk -o /dev/null -w "%{http_code} %{size_download}" "TARGET${p}"; echo ""
done
# 信息泄露
for p in /WEB-INF/ /WEB-INF/web.xml /META-INF/ /META-INF/MANIFEST.MF /.env /.git/config /.git/HEAD /.svn/entries /.DS_Store /robots.txt /sitemap.xml /crossdomain.xml /phpinfo.php /info.php /test.jsp /test.jspx ; do
    echo -n "$p: "; curl -sk -o /dev/null -w "%{http_code} %{size_download}" "TARGET${p}"; echo ""
done
```

### 2b. dirsearch 字典扫描（2分钟）
```bash
python <workdir>/tools/dirsearch-0.4.3/dirsearch.py \
  -u TARGET -e jsp,do,action,html,wsdl,xml,json,asp,aspx,php \
  --random-agent -t 15 -x 404,500
```
- SSL 自签名 → 换 `curl -k` 循环 + 精简字典
- Burp 可达 → 用 Intruder + 路径字典

### 2c. 响应分析（区分真假404）
```
所有路径返回相同字节数(如750B) = 统一自定义404 → 需按内容区分
302 → 追踪重定向目标
401/403 → 存在但需认证 → 记录下来
500/502 → 可能存在但出错 → 尝试不同参数/方法
size 异常 → 真实页面 → 优先排查
```

## 第三层：源码泄露探测（<1分钟）

### 3a. 备份文件模式
```bash
for ext in jsp do action html xml js java properties; do
    for suffix in ".bak" ".backup" ".old" ".orig" ".swp" "~" ".save" ".tmp"; do
        curl -sk -o /dev/null -w "%{http_code}" "TARGET/path/file.${ext}${suffix}"
    done
done
```

### 3b. 版本控制泄露
```bash
# Git
for p in /.git/HEAD /.git/config /.git/index /.git/refs/ /.git/logs/ /.git/objects/; do
    curl -sk -o /dev/null -w "%{http_code}" "TARGET${p}"
done
# SVN
for p in /.svn/entries /.svn/wc.db; do
    curl -sk -o /dev/null -w "%{http_code}" "TARGET${p}"
done
```

### 3c. 压缩包/归档
```bash
for name in backup wwwroot webapps ROOT site code; do
    for ext in zip tar.gz rar 7z war jar; do
        curl -sk -o /dev/null -w "%{http_code}" "TARGET/${name}.${ext}"
    done
done
```

### 3d. IDE/Editor 配置泄露
```bash
for p in /.idea/ /.vscode/ /nbproject/ /.project /.classpath /.settings/; do
    curl -sk -o /dev/null -w "%{http_code}" "TARGET${p}"
done
```

### 3e. 日志文件
```bash
for p in /access.log /error.log /catalina.out /localhost.log /debug.log /app.log /test.log; do
    curl -sk -o /dev/null -w "%{http_code}" "TARGET${p}"
done
# 也试 /WEB-INF/ 和 /logs/ 目录下
for p in /logs/ /WEB-INF/logs/ /log/ /tmp/ /temp/; do
    curl -sk -o /dev/null -w "%{http_code}" "TARGET${p}"
done
```

## 第四层：递归扩展

### 4a. 目录命中 → 继续往下
```
/business/ → 存在 → 再用完整字典扫 /business/*
/images/ → 存在 → 尝试列目录 /images/
/js/ → 存在 → 获取所有 JS → 分析路径
/admin/ → 存在 → 优先扫 /admin/*
```

### 4b. Axis/SOAP 递归
```
/services/ → Axis 服务列表
  → /services/CreateFile?wsdl → 提取方法 → createBytesFile
  → /services/OtherService?wsdl → 继续枚举
  → /hrduni/services/ → 另一个 Axis 实例
  → /hrdportal/services/ → 又一个实例
```

### 4c. DWR 接口递归
```
/dwr/index.html → 列出所有接口
/dwr/interface/portalAjax.js → 提取方法名
/dwr/interface/statAjax.js
/dwr/engine.js
→ 读取同目录下更多 interface/*.js
```

### 4d. Swagger/OpenAPI 递归
```
/swagger-ui.html
/v2/api-docs → OpenAPI 2.0 完整文档
/v3/api-docs → OpenAPI 3.0 完整文档
/swagger-resources → 所有 API 分组
/swagger-resources/configuration/security
/swagger-resources/configuration/ui
```

## 第五层：框架指纹 → 已知路径表

| 框架 | 必测路径 |
|------|----------|
| **Tomcat** | /manager/html, /host-manager/html, /docs/, /examples/, /status |
| **Axis 1.x** | /services/, /services/version, /servlet/AxisServlet, *.jws |
| **Axis2** | /axis2/services/, /axis2-admin/, /axis2/axis2-web/ |
| **DWR** | /dwr/index.html, /dwr/engine.js, /dwr/interface/*.js |
| **Spring Boot** | /actuator, /actuator/env, /actuator/heapdump, /actuator/mappings |
| **Spring MVC** | /swagger-ui.html, /v2/api-docs, /v3/api-docs |
| **Struts2** | *.action, *.do, /struts/, /struts2-showcase/ |
| **Druid** | /druid/, /druid/index.html, /druid/sql.html, /druid/websession.html |
| **Zhengfang** | /dwr/, /portal.do, /ewebeditor/, /WEB-INF/properties/, /WEB-INF/zfssoconfig.properties |
| **Dr.COM** | /Self/, /Self/bill/, /Self/dashboard/, /Self/login/, /rump_frontend/ |
| **CAS** | /login, /validate, /serviceValidate, /proxyValidate, /v1/tickets |
| **Shiro** | /login.jsp, /unauthorized.jsp, /rememberMe |
| **WebLogic** | /console/, /wls-wsat/, /_async/, /bea_wls_internal/ |
| **JBoss** | /jmx-console/, /web-console/, /invoker/, /admin-console/ |
| **通用Java** | /WEB-INF/web.xml, /WEB-INF/classes/, /META-INF/MANIFEST.MF |
| **通用PHP** | /phpinfo.php, /.env, /composer.json, /vendor/ |
| **通用.NET** | /web.config, /Trace.axd, /elmah.axd, /aspnet_client/ |

## 完整执行清单

```
□ Step 0: nmap -sV 做端口指纹
□ Step 1a: 从首页提取 HTML/JS/注释 路径（30秒）
□ Step 1b: 提取 robots.txt / sitemap.xml
□ Step 2a: curl 扫 40 个标配路径（30秒）
□ Step 2b: dirsearch 字典扫描（2分钟）
□ Step 3: 响应分析 → 识别真假404 + 指纹识别
    → 识别出什么框架？（Tomcat/Axis/Spring/DWR/Druid/正方/Struts2...）
□ Step 4: 框架已知路径补测 ← 这是关键！识别框架后按上表追加路径
□ Step 5: 命中目录 → 递归往下扫
□ Step 6: 命中 SOAP → WSDL递归；命中 DWR → 接口枚举；命中 Swagger → API枚举
□ Step 7: 源码泄露探测（.git/.svn/备份/IDE/日志）
□ Step 8: 所有来源的路径汇总去重 → P0/P1/P2 优先级排序 → 开打
```

## 框架识别的作用

框架识别不是替代路径扫描，而是**在已有扫描结果上叠加框架专属路径**：

- 路径扫描命中 `/dwr/` → 识别为 DWR → 追加 `/dwr/interface/*.js` 枚举
- 路径扫描命中 `/portal.do` → 识别为正方 → 追加 `/WEB-INF/properties/`、`/ewebeditor/`  
- 路径扫描命中 `/services/` → 识别为 Axis → 追加 WSDL 递归
- 响应头 `Server: nginx` + `Set-Cookie: JSESSIONID` → Java Web → 追加 `/WEB-INF/`、`/META-INF/`
- HTML `<title>` 含"正方"→ 追加正方全量 Playbook 路径
- HTML 含 `jsencrypt.min.js` → RSA加密 → 可能存在密码重置API

## 相关记忆
- [[feedback_pentest_service_discovery_first]] — 漏掉 SOAP RCE 的教训
- [[feedback_curl_first_browser_later]] — curl 优先，确认后再用浏览器
