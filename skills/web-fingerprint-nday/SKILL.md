---
name: web-fingerprint-nday
description: >-
  Web technology fingerprinting — identify target systems by response headers,
  cookies, HTML/JS content, favicon hashes, and path probes. Covers Java
  middleware, Chinese OA systems, CMS, security appliances, dev frameworks,
  virtualization, and common components. Pure fingerprinting only; N-day
  scanning workflow is orchestrated by the P0 hack router.
---

# SKILL: Web 指纹识别

> **辅助型技能。用于补充组件上下文、确认明确产品线索、或为当前主线提供定向 N-day 支线；不应抢占已存在的高价值功能点主线。**

---

## 1. 快速指纹收集命令

```bash
# 一键收集首页指纹
./渗透测试工具/httpx -u TARGET -title -tech-detect -status-code -content-length -web-server -csp-probing -o fingerprint.txt

# 收集 favicon 哈希
echo "TARGET/favicon.ico" | ./渗透测试工具/httpx -status-code -content-length -favicon -o favicon.txt

# 批量探测特征路径（无需认证即可判断）
paths=(
  "/actuator" "/actuator/env" "/actuator/health"
  "/console" "/manager/html" "/jmx-console"
  "/.env" "/.git/config" "/phpinfo.php"
  "/api-docs" "/swagger-ui.html" "/v2/api-docs"
  "/mob" "/sdk" "/ui"
  "/seeyon/" "/yyoa/" "/wui/" "/defaultroot/"
  "/portal/" "/ekp/" "/eoffice/" "/eas/"
  "/nacos/" "/druid/" "/jolokia/"
)
for path in "${paths[@]}"; do
  curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" -k "TARGET$path"
done
```

---

## 2. 指纹矩阵（按系统分类）

### 2.1 Java 安全框架 & 中间件

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **Apache Shiro** | Cookie: `rememberMe=deleteMe` ; 响应头 `Set-Cookie: rememberMe=` | 任意路径返回此 Cookie |
| **Spring Boot Actuator** | `/actuator` 返回 JSON ; 响应头 `X-Application-Context` | `/actuator/env` `/actuator/heapdump` `/actuator/mappings` |
| **Spring Boot (变种路径)** | `/fsum/env` `/api/actuator/env` `/prod/actuator/health` | 非标准 context-path 下的 actuator |
| **Apache Tomcat** | Server头: `Apache-Coyote/` ; `/manager/html` 返回 401 ; `/docs/` | `/manager/html` `/host-manager/html` `/examples/` |
| **Tomcat (版本泄露)** | 错误页面含 `Apache Tomcat/8.5.xx` | 访问不存在的路径 |
| **JBoss/WildFly** | `/jmx-console/` 返回 200/401 ; `/web-console/` | `/jmx-console/` `/invoker/` `/admin-console/` |
| **WebLogic** | `/console/` 返回 200/302 ; T3 端口 7001/7002 | `/console/login/LoginForm.jsp` `/wls-wsat/` `/uddiexplorer/` |
| **WebSphere** | Server头: `IBM HTTP Server` ; `/ibm/console/` | `/ibm/console/logon.jsp` |
| **Jenkins** | 响应头: `X-Jenkins:` ; `/script` `/manage` 页面标题 `Jenkins` | `/script` `/manage` `/jnlpJars/` `/computer/` |
| **Jetty** | Server头: `Jetty(` ; `/jolokia/` 返回 JSON | `/jolokia/` |
| **Resin** | Server头: `Resin/` ; `/resin-admin/` | `/resin-admin/` `/resin-doc/` |
| **GlassFish** | `/common/` `/theme/` ; 4848端口 | `/common/index.jsf` |
| **Jira** | `/secure/Dashboard.jspa` ; HTML含 `jira.webresources` | `/rest/api/2/serverInfo` |
| **Confluence** | `/login.action` ; HTML含 `confluence-` class | `/rest/api/content/` `/spaces/viewdefaultdecorator.action` |
| **Bitbucket** | `/dashboard` ; HTML `bitbucket-` | `/rest/api/1.0/` |
| **Bamboo** | `/bamboo/login.action` ; `/allPlans.action` | `/rest/api/latest/` |
| **Struts2** | URL后缀 `.action` `.do` ; 自定义错误页面 | 测试 `redirect:` / `redirectAction:` |
| **Fastjson** | Java应用 + JSON 解析 + `@type` 关键词 | POST JSON 测试 |
| **Log4j/Log4Shell** | Java应用 + 用户输入回显 | Header 注入测试 |

### 2.2 国产 OA / 协同办公

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **用友 NC** | `/api/` ; HTML含 `yyoa` `/yyoa/` ；Cookie: `JSESSIONID` | `/yyoa/` `/yyoa2/` `/u8/` `/ierp/` |
| **用友 U8/U8Cloud** | `/u8/` ; F12开发者工具见 `/Service/` | `/u8/servlet/` `/api/u8/v1/` `/Service.asmx` |
| **用友畅捷通 T+** | `/tplus/` ; 首页标题含 "畅捷通" | `/tplus/view/login.html` |
| **用友 GRP-U8** | `/grp/` ; `/servlet/` | `/grp/portal/` |
| **泛微 E-Office** | `/eoffice/` ; `/flow/` | `/eoffice/server/` `/flow/page/login.jsp` |
| **泛微 E-Cology** | `/api/` ; 首页含 `ecode` ; Cookie: `ecology_` | `/weaver/` `/services/` `/api/integration/` |
| **泛微 E-Bridge** | `/ebridge/` ; 首页含 "泛微云桥" | `/ebridge/` |
| **致远 A6/A8** | `/seeyon/` ; HTML含 `seeyon` ; Cookie: `HOP` | `/seeyon/rest/` `/seeyon/services/` `/seeyon/main.do` |
| **致远 M3** | `/m3/` ; 移动端入口 | `/m3/` |
| **蓝凌 EKP/EIS** | `/ekp/` ; Cookie: `LANDRAY` ; HTML含 `蓝凌` | `/ekp/sys/` `/ekp/api/` `/ekp/admin/` |
| **蓝凌 EIS** | `/eis/` ; `/api/` | `/eis/login/` `/eis/service/` |
| **通达 OA** | `/ispirit/` ; Cookie: `TD_OA` ; HTML标题含 "通达" | `/ispirit/login/login.php` `/module/` `/attachment/` |
| **万户 OA** | `/defaultroot/` ; HTML含 `万户` | `/defaultroot/login.jsp` `/defaultroot/servlet/` |
| **金蝶 EAS** | `/eas/` ; HTML标题含 "金蝶" | `/eas/portal/` `/easweb/` `/eas/rest/` |
| **金蝶云星空** | `/k3cloud/` ; HTML含 `k3cloud` | `/k3cloud/` `/api/` |
| **金和 OA** | `/jhsoft/` ; `/jsoa/` ; 首页 `jsoa` 特征 | `/jsoa/` `/jhsoft/` |
| **红帆 OA** | `/iOffice/` ; HTML含 `红帆` | `/ioffice/` `/iOffice/` |
| **华天 OA** | `/oa/` ; HTML含 `华天动力` | `/oa/` `/htoa/` |
| **帆软 FineReport** | `/webroot/decision/` ; Cookie: `JSESSIONID` ; 报表特征URL | `/webroot/decision/system/info` `/webroot/decision/login` |
| **中创 InforSuite** | `/infor/` ; Server头: `InforSuite` | `/infor/` |
| **中创中间件** | `/as/` ; Server头: `InforSuite-AS` | `/as/` |
| **东方通 TongWeb** | `/tongweb/` ; Server头: `TongWeb` | `/console/` `/tongweb/` |
| **宝兰德 BES** | Server头: `BES/` ; `/bes/` | `/bes/` `/console/` |
| **金蝶 Apusic** | Server头: `Apusic/` ; `/apusic/` | `/apusic/` `/admin/` |

### 2.3 运维/监控/基础设施

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **Nacos** | `/nacos/` ; HTML含 `nacos` ; 默认端口 8848 | `/nacos/v1/auth/users?pageNo=1&pageSize=9` |
| **Druid Monitor** | `/druid/` ; HTML `druid` | `/druid/index.html` `/druid/websession.html` |
| **Kubernetes Dashboard** | `/api/v1/` ; Cookie含 `k8s` ; 401 返回 `Unauthorized` | `/api/v1/namespaces/default/secrets` |
| **Grafana** | `/login` HTML含 `grafana` ; Cookie: `grafana_session` | `/api/health` `/public/plugins/` |
| **Prometheus** | `/graph` `/targets` ; HTML `Prometheus` ; 默认端口 9090 | `/api/v1/status/config` `/api/v1/targets` |
| **RabbitMQ** | `/api/` Basic Auth ; 默认端口 15672 | `/api/overview` `/api/connections` |
| **Elasticsearch** | 9200端口 ; `/_cat/indices` 返回 JSON | `/_cat/indices?v` `/_cat/health` `/_nodes/_all/http` |
| **Kibana** | 5601端口 ; HTML含 `kibana` | `/api/status` `/app/kibana` |
| **Docker API** | 2375/2376端口 ; `/v1.24/containers/json` 返回 JSON | `/v1.24/containers/json` `/v1.24/info` |
| **Redis** | 6379端口 | 通过 SSRF 或直接连接 |
| **Zabbix** | `/zabbix/` ; HTML含 `zabbix` ; Cookie: `zbx_session` | `/zabbix.php` `/zabbix/api_jsonrpc.php` |
| **JumpServer** | `/core/auth/login/` ; HTML含 `JumpServer` | `/api/health/` |
| **Harbor** | `/harbor/` ; HTML含 `Harbor` ; `/api/v2.0/` | `/api/v2.0/systeminfo` `/c/login` |
| **GitLab** | `/users/sign_in` ; HTML含 `gitlab` ; Cookie: `_gitlab_session` | `/api/v4/version` `/help` |
| **Gitea** | `/user/login` ; HTML含 `gitea` | `/api/v1/version` |
| **Nexus** | `/nexus/` ; HTML含 `Nexus Repository` | `/service/rest/v1/status` |
| **SonarQube** | `/sonar/` ; 9000端口 | `/api/server/version` |
| **Hadoop YARN** | 8088端口 ; `/cluster` 返回 ; HTML `Hadoop` | `/cluster/apps` `/ws/v1/cluster/info` |

### 2.4 安全设备/网络设备

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **Citrix ADC/Netscaler** | `/vpn/` ; `/logon/LogonPoint/` ; Cookie: `NSC_` | `/vpn/index.html` `/logon/LogonPoint/index.html` |
| **F5 BIG-IP** | `/tmui/` ; Cookie: `BIGipServer` ; `/mgmt/` | `/tmui/login.jsp` `/mgmt/tm/util/bash` |
| **Fortinet FortiGate** | `/login` ; HTML含 `FortiGate` ; Cookie: `SVPNCOOKIE` | `/api/v2/` `/remote/login` |
| **Pulse Secure** | `/dana-na/` ; `/dana-na/auth/url_default/welcome.cgi` | `/dana-na/` `/dana-na/auth/` |
| **Palo Alto** | `/php/login.php` ; HTML含 `Palo Alto Networks` | `/api/` `/esp/` |
| **H3C iMC** | `/imc/` ; HTML含 `H3C` `iMC` | `/imc/login.jsf` `/imc/rest/` |
| **华为 iBMC** | `/login.html` ; HTML含 `Huawei iBMC` | `/api/` `/redfish/v1/` |
| **锐捷** | `/web/` ; HTML含 `Ruijie` | 厂商路径 |
| **深信服 SSL VPN** | `/portal/` ; HTML含 `Sangfor` ; `/por/` | `/por/login.csp` `/portal/` |
| **深信服 EDR** | HTML含 `Sangfor EDR` ; `/edr/` | `/api/edr/` |
| **天融信** | HTML含 `TopSec` ; `/topsec/` | 厂商路径 |
| **绿盟** | HTML含 `NSFOCUS` ; `/nsfocus/` | 厂商路径 |
| **网康/360** | HTML含 `网康` `Netentsec` | 厂商路径 |
| **启明星辰** | HTML含 `Venustech` `天镜` | 厂商路径 |

### 2.5 CMS / 网站建设

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **WordPress** | `/wp-admin/` ; `/wp-content/` ; HTML含 `wp-json` | `/wp-json/wp/v2/users` `/wp-admin/admin-ajax.php` |
| **Drupal** | `/user/login` ; HTML含 `drupal` ; `/sites/default/` | `/core/install.php` `/?q=user/login` |
| **Joomla** | `/administrator/` ; HTML含 `joomla` | `/administrator/manifests/files/joomla.xml` |
| **ThinkPHP** | 错误信息含 `ThinkPHP` ; `/public/` ; `/thinkphp/` | 构造参数触发异常 |
| **Laravel** | `.env` 泄漏 ; `/vendor/` ; Cookie: `laravel_session` | `/.env` `/storage/logs/laravel.log` |
| **Yii** | `/index.php?r=` ; Debug工具栏 ; 错误页 `Yii Framework` | `/index.php?r=gii` `/debug/` |
| **Django** | `/admin/` ; Debug模式堆栈 ; 错误页 `Django` | `/admin/login/` |
| **Spring MVC** | URL后缀 `.do` `.htm` ; 框架异常 `DispatcherServlet` | 触发异常 |
| **Struts** | URL `.action` 后缀 | 触发异常 |
| **Discuz** | `/forum.php` ; HTML含 `Discuz!` | `/api/mobile/index.php` `/source/plugin/` |
| **帝国 CMS** | `/e/admin/` ; HTML含 `EmpireCMS` | `/e/class/` `/e/admin/` |
| **织梦 DedeCMS** | `/dede/` ; `/plus/` ; HTML含 `DedeCMS` | `/dede/login.php` `/data/admin/` |
| **PHPCMS** | `/index.php?m=` ; HTML含 `PHPCMS` | `/api.php` `/admin.php` |
| **齐博** | `/admin/` ; HTML含 `qibo` | `/admin/` |
| **CmsEasy** | `/admin/` ; HTML含 `cmseasy` | `/admin/` `/index.php?case=archive` |
| **Z-Blog** | `/zb_system/` ; HTML含 `zblog` | `/zb_system/login.php` |
| **Typecho** | `/admin/` ; HTML含 `Typecho` | `/admin/login.php` `/usr/themes/` |

### 2.6 开发框架 / API / 微服务

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **Swagger/OpenAPI** | `/swagger-ui.html` `/api-docs` `/v2/api-docs` `/v3/api-docs` `/swagger.json` | 上述路径 |
| **GraphQL** | `/graphql` `/gql` ; 响应含 `query` `mutation` | POST `{"query":"{__schema{types{name}}}"}` |
| **Spring Cloud Gateway** | `/actuator/gateway/routes` ; `/gateway/` | `/actuator/gateway/routes` |
| **Spring Cloud Config** | `/config/` ; `/env` 端点 | `/config/application/default` `/{application}/{profile}` |
| **Eureka** | `/eureka/` ; 8761端口 | `/eureka/apps` |
| **Consul** | 8500端口 ; `/v1/kv/` ; HTML `Consul` | `/v1/agent/members` `/v1/status/leader` |
| **Etcd** | 2379端口 ; `/v2/keys` `/v3/` | `/version` |
| **gRPC** | `grpc-status` 头 ; 50051端口 | 通过反射API探测 |

### 2.7 虚拟化 / 私有云

| 目标系统 | 指纹特征 | 验证路径 |
|----------|----------|----------|
| **VMware vSphere/vCenter** | HTML含 `VMware vSphere` ; `/ui/` ; Cookie: `VSPHERE-UI-JSESSIONID` ; Server头: `Anonymous` | `/ui/login` `/rest/` `/mob/` `/sts/STSService?wsdl` |
| **VMware ESXi** | HTML含 `VMware ESXi` ; 简单页面 / 443端口 | `/` `/host/` |
| **VMware Horizon** | `/portal/` ; HTML含 `VMware Horizon` | `/portal/webclient/` |
| **Citrix XenServer** | 80/443 ; HTML含 `Citrix` `XenServer` | `/` |
| **Proxmox VE** | 8006端口 ; HTML含 `Proxmox` | `/api2/json/` |
| **OpenStack** | `/dashboard/` ; HTML含 `OpenStack` ; 5000/8774端口 | `/identity/` `/dashboard/auth/login/` |
| **oVirt/RHEV** | `/ovirt-engine/` ; HTML含 `oVirt` | `/ovirt-engine/api/` |

### 2.8 常见高危组件

| 组件 | 指纹特征 | 触发方式 |
|------|----------|----------|
| **Fastjson** | Java应用 + JSON解析 + `@type` 关键词 | POST JSON测试 |
| **Jackson** | Java应用 + JSON + `enableDefaultTyping` | POST polymorphic JSON |
| **XStream** | Java应用 + XML请求体 | POST XML测试 |
| **WebSocket** | 101 Switching Protocols ; `Upgrade: websocket` | WebSocket连接 |
| **Nginx** | Server头: `nginx/` | 版本号路径 |
| **Apache httpd** | Server头: `Apache/` | `/server-status` `/server-info` |
| **IIS** | Server头: `Microsoft-IIS/` | 版本号路径 `/owa/` |
| **PHP** | `X-Powered-By: PHP/` ; Cookie: `PHPSESSID` | `/phpinfo.php` `.php`后缀 |
| **ASP.NET** | `X-Powered-By: ASP.NET` ; `__VIEWSTATE` ; `.aspx`后缀 | 触发异常暴露版本 |
| **.NET Core** | `X-Powered-By: ASP.NET` ; `X-Application-Context` `.NET` | `/swagger/` |

---

## 3. Favicon 哈希匹配（快速识别）

```bash
# 获取 favicon mmh3 hash
curl -s -k TARGET/favicon.ico | python3 -c "import mmh3,sys,codecs; print(mmh3.hash(codecs.encode(sys.stdin.buffer.read(),'base64')))"
```

| favicon mmh3 hash | 对应系统 |
|-------------------|----------|
| `-1588080585` | VMware vSphere |
| `116323821` | Spring Boot (默认) |
| `-251528692` | Apache Tomcat |
| `708578229` | Jenkins |
| `2060322807` | Nacos |
| `-1922044295` | Grafana |
| `99395752` | 致远 OA (seeyon) |
| `524212344` | 泛微 E-Office |
| `-1273035241` | 通达 OA |
| `-1101206929` | WordPress |
| `-1333531890` | Jira |
| `-271448121` | Confluence |
| `524567629` | GitLab |
| `-1920219962` | Harbor |
| `1020814938` | SonarQube |
| `180732787` | Kibana |
| `696082377` | Elasticsearch |
| `-279828851` | Zabbix |
| `-334242442` | RabbitMQ |
| `1144925962` | Yii Framework |
| `-766957661` | ThinkPHP |
| `-208419411` | phpMyAdmin |
| `-771148084` | Drupal |
| `683307822` | Swagger UI |
| `-1233733632` | Django Admin |

---

## 4. 响应头维度指纹

### 4.1 Server 头快速判断

| Server 头值 | 对应系统 |
|-------------|----------|
| `Apache-Coyote/` | Tomcat |
| `Apache/` | Apache httpd |
| `nginx/` | Nginx |
| `Microsoft-IIS/` | IIS |
| `Jetty(` | Jetty |
| `Resin/` | Resin |
| `IBM HTTP Server` | WebSphere 前端 |
| `BigIP` | F5 BIG-IP |
| `Citrix-ADC` | Citrix ADC |
| `FortiWeb` | Fortinet WAF |
| `TongWeb` / `TongHttpServer` | 东方通 |
| `BES/` | 宝兰德 |
| `Apusic/` | 金蝶 Apusic |
| `InforSuite` | 中创中间件 |
| `Anonymous` | VMware vCenter (反向代理) |

### 4.2 X-Powered-By 头

| 值 | 对应技术 |
|----|----------|
| `PHP/x.x` | PHP |
| `ASP.NET` | ASP.NET |
| `Servlet/x.x` | Java Servlet |
| `Express` | Node.js Express |
| `Flask` | Python Flask |

### 4.3 Cookie 指纹

| Cookie 名 | 对应技术 |
|-----------|----------|
| `JSESSIONID` | Java (Tomcat/JBoss/WebLogic等) |
| `PHPSESSID` | PHP |
| `ASP.NET_SessionId` | ASP.NET |
| `laravel_session` | Laravel |
| `rememberMe=deleteMe` | Apache Shiro |
| `VSPHERE-UI-JSESSIONID` | VMware vSphere HTML5 Client |
| `BIGipServer` | F5 BIG-IP |
| `NSC_` | Citrix Netscaler |
| `grafana_session` | Grafana |
| `_gitlab_session` | GitLab |
| `zbx_session` | Zabbix |
| `ecology_` | 泛微 E-Cology |
| `LANDRAY` | 蓝凌 EKP |
| `HOP` | 致远 OA |
| `TD_OA` | 通达 OA |

---

## 5. HTML/JS 内容指纹

### 5.1 HTML Meta / Comment

```html
<!-- 识别关键词 → 对应系统 -->
<meta name="generator" content="WordPress" /> → WordPress
<meta name="generator" content="Drupal 9" /> → Drupal
<!-- Built with Joomla! -->           → Joomla
<meta name="author" content="Yii" /> → Yii Framework
<!-- ThinkPHP -->                      → ThinkPHP
<!-- DedeCMS -->                       → 织梦 CMS
<meta name="author" content="EmpireCMS" /> → 帝国 CMS
```

### 5.2 JS 库文件路径特征

```javascript
// 路径中含有版本Hash → VMware vSphere
/static/resources15558943/
/ui/resources15558943/

// jQuery + 自定义
/wp-includes/js/jquery/jquery.js → WordPress
/include/jquery/                 → 泛微

// 框架特征
/struts/ → Apache Struts
/seeyon/ → 致远 OA
```

### 5.3 页面标题 `<title>` 匹配

| 标题特征 | 对应系统 |
|----------|----------|
| `VMware vSphere` | VMware vSphere |
| `vSphere Client` | VMware vSphere HTML5 |
| `Nacos` | Alibaba Nacos |
| `Druid Monitor` | Alibaba Druid |
| `Jenkins` | Jenkins |
| `Dashboard - Grafana` | Grafana |
| `Login - Zabbix` | Zabbix |
| `泛微` | 泛微 OA 系列 |
| `致远` | 致远 OA |
| `通达` | 通达 OA |
| `蓝凌` | 蓝凌 OA |
| `万户` | 万户 OA |
| `金蝶` | 金蝶系列 |
| `用友` | 用友系列 |
| `帆软` | 帆软 FineReport |

---

## 6. 指纹无法匹配时

```bash
# 自动化全网指纹识别
whatweb TARGET
./渗透测试工具/httpx -u TARGET -tech-detect -json -o tech.json

# 在 Burp proxy history 中关键词搜索
grep -i "shiro\|tomcat\|weblogic\|jboss\|jenkins\|spring\|thinkphp\|laravel\|nacos\|druid" response.txt
```

指纹匹配结果默认只作为当前主线的辅助上下文：若已存在高价值真实功能点，则继续围绕功能点推进；只有当明确命中产品链路且适合低破坏定向验证时，才补充对应 N-day 支线。
