# OA/CMS/ERP 系统 RCE 漏洞合集

## 1. 致远 OA (Seeyon)

| 漏洞 | 版本 | 类型 | 路径 |
|------|------|------|------|
| 前台RCE/ajax.do | A8 V5/V6 | 任意文件写入 | /seeyon/htmlofficeservlet |
| OfficeServlet Getshell | A8系列 | 文件上传 | /seeyon/officeServer.jsp |
| AJAX Action RCE | A8 V5 SP2-V6.0 | 反序列化 | /seeyon/ajax.do |
| FastJson RCE | A8 V5/H5 | JNDI注入 | 多个JSON处理端点 |
| M3 Mobile RCE | M3全版 | SQL注入/上传 | /m3/ 路由下 |
| S1 前台RCE | S1 | 文件上传 | /seeyon/ 路由 |

FOFA: `body="seeyon"`, `app="致远互联-OA"`, `body="A8-master"`

## 2. 泛微 OA (Weaver)

| 漏洞 | 版本 | 类型 | 路径 |
|------|------|------|------|
| WorkflowServiceXml RCE | e-cology 7.x-9.x | 反序列化 | /services/WorkflowServiceXml |
| BshServlet RCE | e-cology全系列 | BeanShell | /weaver/bsh.servlet.BshServlet |
| KtreeUpload Getshell | e-cology | 文件上传 | /weaver/weaver.file.KtreeUploadAction |
| e-office RCE | e-office 9.x | 文件上传 | /eoffice10/ |
| e-bridge RCE | e-bridge | 文件上传 | /ebridge/ |
| HrmCareerApply | e-cology | 文件上传 | /weaver/weaver.hrm.HrmCareerApply |

FOFA: `app="泛微-协同办公OA"`, `body="/wui/index.html"`

## 3. 用友 (Yonyou)

| 漏洞 | 版本 | 类型 |
|------|------|------|
| NC BeanShell RCE | NC全系列 | BeanShell执行 |
| NC反序列化RCE | NC6/NC Cloud | Java反序列化 |
| U8文件上传RCE | U8系列 | 文件上传 |
| 畅捷通T+ RCE | T+ 13.0/16.0 | 文件上传 |
| GRP-U8 SQL注入RCE | GRP-U8 | SQL注入->xp_cmdshell |
| NC SOServlet | NC5/6 | 反序列化 |

FOFA: `body="用友" || body="yonyou"`, `app="用友-NC"`

## 4. 蓝凌 OA (Landray)

| 漏洞 | 类型 | 路径 |
|------|------|------|
| TreeService RCE | FastJson反序列化 | /sys/webservice/sysFmDataWebService |
| EKP SSRF RCE | SSRF+反序列化 | /ekp/路由 |
| EIS SSRF | SSRF | /eis/路由 |
| FastJson RCE | JNDI注入 | 多处JSON端点 |
| 自定义表单RCE | 任意文件写入 | /km/ |

FOFA: `app="蓝凌-OA"`, `body="landray"`

## 5. 通达 OA (Tongda)

| 漏洞 | 版本 | 类型 |
|------|------|------|
| v11.3/v11.5前台RCE | v11.x | 文件上传+包含 |
| v2017前台RCE | v2017 | 任意文件上传 |
| UDF注入RCE | 全系列 | SQL注入UDF |
| GetSession 未授权 | v11.x | Session伪造 |
| ispirit 文件上传 | v11.x | 文件上传 |
| delete_log RCE | v11.x | 文件删除+日志包含 |

FOFA: `app="TDXK-通达OA"`, `body="tongda"`

## 6. 万户 OA (Wanhu)

| 漏洞 | 类型 | 路径 |
|------|------|------|
| FILELANGUAGE RCE | 文件上传 | /defaultroot/ |
| 前台RCE | 任意文件上传 | /defaultroot/upload/ |
| OfficeServer | 文件上传 | /defaultroot/OfficeServer.jsp |

FOFA: `body="万户网络" || body="wanhu"`, `app="万户网络-ezOFFICE"`

## 7. 金蝶 (Kingdee)

| 漏洞 | 类型 |
|------|------|
| 云星空 RCE | 反序列化 |
| EAS RCE | 文件上传+反序列化 |
| K3 Cloud RCE | 文件读取 |
| Apicus反序列化 | Java反序列化 |

FOFA: `body="Kingdee"`, `app="金蝶云星空"`

## 8. 红帆 OA (Hongfan)

| 漏洞 | 类型 |
|------|------|
| iOffice RCE | 文件上传 |
| 任意文件读取 | 路径穿越 |

FOFA: `body="iOffice" || body="红帆"`

## 9. 华天动力 OA

| 漏洞 | 类型 |
|------|------|
| 前台文件上传RCE | 文件上传 |
| Webservice RCE | SOAP反序列化 |

## 10. 金和 OA (Jinhe)

| 漏洞 | 类型 |
|------|------|
| C6 前台RCE | 文件上传 |
| SQL注入RCE | SQL注入->写文件 |

FOFA: `body="金和" || body="jinhe"`

## 11. 其他OA速查

| 系统 | 关键路径 |
|------|----------|
| 协众OA | /cnoa/, 文件上传多个CVE |
| 信呼OA | /xinhu/, 反序列化 |
| 源天OA | /vteam/, SQL注入 |
| 启莱OA | 文件上传, 任意文件读取 |
| 中科汇联 | /easySite/, 文件上传 |
| 帆软FineReport | /webroot/decision/, 任意文件读取RCE |
| 亿邮 | /webmail/, SQL注入RCE |

## 12. CMS 系统速查

| CMS | RCE方式 |
|-----|---------|
| DedeCMS v5.7 | 后台文件管理器, 会员中心上传, plus/ 多处 |
| WordPress | 插件漏洞, 主题编辑器, xmlrpc |
| ThinkCMF | 模板注入, 文件上传 |
| 帝国CMS | e/upload/, e/admin/后台RCE |
| PHPCMS | phpcms/modules/, 模板编辑 |
| 齐博CMS | 众接口RCE |
| PbootCMS | 文件上传, 模板注入 |

## 13. 运维/安防设备

| 设备 | RCE方式 |
|------|---------|
| 向日葵 Sunlogin | CID+端口未授权RCE |
| 海康威视 Hikvision | iVMS/流媒体RCE |
| 大华 Dahua | 多个CVE |
| Zabbix | latest.php, 认证绕过RCE |
| JumpServer | CVE-2024-29201 认证绕过RCE |

## 14. 通用FOFA指纹速查

```
正方教务: body="正方软件" || body="zfportal"
致远OA: body="seeyon" || app="致远互联-OA"
泛微OA: app="泛微-协同办公OA" || body="/wui/index.html"
用友NC: app="用友-NC" || body="yonyou"
蓝凌OA: app="蓝凌-OA" || body="landray"
通达OA: app="TDXK-通达OA" || body="tongda"
万户OA: body="万户网络" || body="ezOFFICE"
金蝶: body="Kingdee" || app="金蝶云星空"
海康: app="Hikvision-视频监控"
```
