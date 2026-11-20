---
name: kb_middleware_webframework_fingerprint_2026
description: 中间件+Web框架精准指纹卡—Nginx/Apache/IIS/Redis/ActiveMQ/Elasticsearch/Solr/Jenkins/Nacos/XXL-JOB/MinIO/Confluence/GitLab/RocketMQ + ThinkPHP/Laravel/Django/Flask/Rails 五维指纹+FOFA+攻击指引
metadata:
  node_type: knowledge
  type: reference
  modified: 2026-08-13
---

# 中间件 + Web 框架精准指纹卡 (2026版)

> 定位：补齐 Java 组件卡之外的中间件与 Web 框架识别
> Java 组件（Tomcat/WebLogic/JBoss/SpringBoot/Struts2/Fastjson/Shiro）→ `kb_java_component_fingerprint_2026.md`
> 快速攻击链 → `kb/quick-ref/midware-rce.md`；深度手册 → `rce_getshell/kb_middleware_rce_master_2026.md`
> 新增 CVE → `rce_getshell/kb_middleware_cve_index_2022_2026.md`

---

## A. 非 Java 中间件

### 一、Nginx
- **指纹**：`Server: nginx`（或空 Server 头 + nginx 错误页）/ 默认 404 页含 `nginx`
- **FOFA**：`app="Nginx"` / `header="nginx"`
- **主动确认**：`GET /不存在路径` 看 404 页特征
- **攻击**：off-by-slash 穿越→配合上传 / alias 配置不当 / 走私 / 2026 nginx 新链（CVE-2026-9256）

### 二、Apache
- **指纹**：`Server: Apache/2.4.49` 等带版本 / Apache 默认 403/404 页 / `.htaccess` 生效
- **FOFA**：`app="Apache"` / `header="Apache/"`
- **主动确认**：构造带路径穿越路径看是否版本敏感（41773）
- **攻击**：41773/42013 穿越→CGI RCE（2.4.49/50）/ mod_proxy 走私(25690) / SSRF(38476)

### 三、Microsoft IIS
- **指纹**：`Server: Microsoft-IIS/10.0` / IIS 默认错误页（500.19/404.0）/ WebDAV
- **FOFA**：`app="Microsoft-IIS"` / `header="Microsoft-IIS"`
- **主动确认**：`GET /iisstart.htm`（老版本默认页）
- **攻击**：WebDAV 溢出 / ViewState 反序列化(0688) / 短文件名(8.3) 枚举 / .aspx 面

### 四、Redis（无认证 :6379）
- **指纹**：`redis-cli -h IP -p 6379 ping` → PONG / banner `-ERR` / 未授权
- **FOFA**：`protocol="redis"` / `port="6379"`
- **攻击**：写 crontab/SSH key / 主从复制 module 加载 RCE / Lua 沙箱

### 五、ActiveMQ（:61616）
- **指纹**：OpenWire 协议端口 / web 控制台 `/admin/`（默认 admin/admin）/ `/api/`
- **FOFA**：`app="Apache-ActiveMQ"` / `port="61616"`
- **攻击**：46604 OpenWire 反序列化 RCE / fileserver 上传(3088) / 弱口令

### 六、Elasticsearch（:9200）
- **指纹**：`GET /` 返回 JSON `{"name":"...","cluster_name":"..."}` / `application/json` 响应
- **FOFA**：`app="Elasticsearch"` / `port="9200" && body="cluster_name"`
- **攻击**：未授权 dump / Groovy RCE(1427) / script 注入

### 七、Solr（:8983）
- **指纹**：`/solr/#/` 后台 / `/solr/admin/cores?action=` / Solr 版本徽标
- **FOFA**：`app="APACHE-Solr"` / `port="8983"`
- **攻击**：Velocity 模板 RCE(12629/17558) / SSRF→RCE(27905) / **Log4j**(CVE-2021-44228 宿主)

### 八、Jenkins（:8080）
- **指纹**：`/login` `/script` `/manage` / Jenkins logo / `X-Jenkins` 响应头
- **FOFA**：`app="Jenkins"` / `header="X-Jenkins"`
- **攻击**：任意文件读→RCE(23897) / 脚本控制台 Groovy / 弱口令

### 九、Nacos（:8848）
- **指纹**：`/nacos/` 后台 / 8848 端口 / `Nacos` 版权
- **FOFA**：`app="Nacos"` / `port="8848"`
- **攻击**：默认 nacos/nacos / derby SQL→RCE(27773) / 认证绕过(29441) / JRaft Hessian

### 十、XXL-JOB（:8080）
- **指纹**：`/xxl-job-admin/` 后台 / XXL-JOB 登录页
- **FOFA**：`app="XXL-JOB"` / `body="xxl-job-admin"`
- **攻击**：未授权 GLUE→RCE / 默认 admin/123456

### 十一、MinIO（:9000）
- **指纹**：`/minio/` 控制台 / 9000 端口 / MinIO 版权
- **FOFA**：`app="MinIO"` / `port="9000"`
- **攻击**：信息泄露(28432) / 未授权 mc admin

### 十二、RocketMQ（:9876/:10911）
- **指纹**：9876 管理 / 10911 Broker / 控制台特征
- **FOFA**：`app="Apache-RocketMQ"` / `port="9876"`
- **攻击**：33246 Broker 命令执行

### 十三、Confluence（:8090）
- **指纹**：`/login.action` / Confluence 徽标 / `X-Confluence` 头
- **FOFA**：`app="Atlassian-Confluence"` / `port="8090"`
- **攻击**：22515 权限绕过→22527 OGNL RCE / 模板注入

### 十四、GitLab
- **指纹**：`/users/sign_in` / GitLab 徽标 / `X-GitLab` 头
- **FOFA**：`app="GitLab"` / `body="gitlab"`
- **攻击**：7028 任意密码重置 / hook RCE / 版本 N-day

---

## B. Web 开发框架

### 一、ThinkPHP（国内占比最大）
- **指纹**：`/index.php?s=/xxx` 路径 / 报错 `ThinkPHP` / `_method` 属性 / 默认错误页
- **Set-Cookie**：PHP session（无特别，靠路径和报错）
- **FOFA**：`app="ThinkPHP"` / `body="/index.php?s="` / `body="ThinkPHP"`
- **主动确认**：`GET /index.php?s=/index/\think\app/invokefunction&function=call_user_func_array&vars[0]=phpinfo&vars[1][]=1`（老版）
- **攻击**：RCE(5.x 多代) / 反序列化 / 日志包含 → `srcwiki_poc/开发框架漏洞/` grep ThinkPHP

### 二、Laravel
- **指纹**：报错页 `Whoops, looks like something went wrong`（Debug）/ `laravel_session` cookie / `/storage/framework/` / `.env` 泄露
- **响应头**：`X-Powered-By: PHP`（间接）
- **FOFA**：`app="Laravel"` / `body="laravel_session"` / `body="Whoops"`
- **主动确认**：`GET /` 带 Debug 报错 → whoops 页；`GET /.env` 看泄露
- **攻击**：Debug 模式下 Ignition RCE / .env 泄露凭据 → `srcwiki_poc/开发框架漏洞/` grep Laravel

### 三、Django
- **指纹**：`csrfmiddlewaretoken` cookie（默认）/ `/admin/` 后台 / Django 默认 DEBUG 报错页（含版本）/ `X-Frame-Options` 默认
- **FOFA**：`app="Django"` / `body="csrftoken"`
- **主动确认**：`GET /admin/` → Django 管理登录；构造异常看 DEBUG 报错
- **攻击**：Debug 信息泄露 / 反序列化（pickle）/ 模板注入 → `srcwiki_poc/开发框架漏洞/` grep Django

### 四、Flask（Python）
- **指纹**：`/console`（Werkzeug debugger，含 PIN）/ 报错 `Werkzeug Debugger` / Flask session cookie
- **FOFA**：`app="Flask"` / `body="Werkzeug"`
- **主动确认**：`GET /console` → debugger 交互台（PIN 需爆破/读取）
- **攻击**：Werkzeug debugger RCE（PIN 绕过）/ SSTI(Jinja2) → `srcwiki_poc/开发框架漏洞/` grep Flask

### 五、Ruby on Rails
- **指纹**：`/assets/application-xxx.css`（fingerprint hash）/ `rails` 报错 / session cookie `_session`
- **FOFA**：`app="Ruby-on-Rails"` / `body="/assets/application"`
- **主动确认**：`GET /assets/` 带 hash 资源；构造 404 看 Rails 页
- **攻击**：反序列化 / SSTI(ERB) / 依赖 N-day

---

## 中间件/框架命中决策树

```
1. Server 头 nginx/apache/IIS      → 容器指纹（穿越/走私/短文件名）
2. 端口 + JSON/banner 特征         → ES(9200)/Redis(6379)/MQ(61616/9876)/Nacos(8848)
3. 后台路径 + 徽标                 → Jenkins(8080)/Confluence(8090)/XXL-JOB/ MinIO(9000)
4. /index.php?s= 或 ThinkPHP 报错  → ThinkPHP（RCE 直打）
5. whoops/laravel_session          → Laravel（Debug/.env）
6. csrftoken + /admin/             → Django
7. /console + Werkzeug             → Flask（debugger PIN）
8. Java 类（Tomcat/Spring/Shiro…）→ kb_java_component_fingerprint_2026.md
→ 确认后 → kb/quick-ref/midware-rce.md 秒杀 → rce_getshell/ 深度 → srcwiki_poc 取 POC
→ 返回 S2: {中间件/框架+版本?, 置信度?, N-Day列表?}
```
