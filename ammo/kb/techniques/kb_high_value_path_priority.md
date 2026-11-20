---
name: kb_high_value_path_priority
description: 路径发现后的价值排序 — 优先打哪些资产最高概率出洞
metadata: 
  node_type: memory
  type: reference
  created: 2026-06-16
  originSessionId: a2db9c8b-4782-4783-9434-84db8f2aa314
---

# 路径价值优先级：扫出后先打谁

## P0（命中即洞，几乎必测）

| 路径特征 | 可能的漏洞 | 为什么优先 |
|----------|-----------|-----------|
| `/services/*?wsdl` SOAP | 未授权文件上传、RCE、信息泄露 | Axis 默认无认证 |
| `/druid/index.html` | 数据库监控、SQL执行、session管理 | 几乎总是无认证 |
| `/actuator/heapdump` | 内存dump含所有凭证 | Spring Boot 标配漏洞 |
| `/swagger-ui.html` `/v2/api-docs` | 全部API暴露 + 参数 | 直接给攻击面地图 |
| `/dwr/index.html` | Java方法直接调用、SQL注入 | DWR 默认暴露所有方法 |
| `/upload/` `/fileUpload/` `/ueditor/` `/ewebeditor/` | 文件上传→getshell | 上传点=最高危攻击面 |
| `/download.do?id=` `/file.do?path=` | 任意文件读取 | 路径穿越读源码/配置 |
| `/WEB-INF/web.xml` | 完整路由映射 | 泄露所有servlet/端点 |
| `/WEB-INF/properties/` `/.env` | 数据库密码 | 直接拿凭证 |

## P1（大概率有洞）

| 路径特征 | 测试方向 |
|----------|----------|
| `login.jsp` `/login` `/signin` | SQL注入、弱口令、记住我、验证码绕过 |
| `resetPassword.jsp` `/forgot` | 用户名枚举、验证码爆破、越权改密 |
| `register.jsp` `/signup` | 未授权注册、批量注册、越权 |
| `admin/` `/manager/` `/console/` | 默认口令、未授权访问 |
| `/api/` `/rest/` `/graphql` | 未授权数据访问、越权、注入 |
| `*.do` `*.action` | Struts2 RCE、参数注入 |
| `search.jsp` `query.jsp` `list.jsp` | SQL注入、XSS |
| `/export/` `/import/` | CSV注入、文件上传 |
| 所有带 `?id=` `?file=` `?path=` 的GET参数 | IDOR、路径穿越、文件读取 |

## P2（需要特定条件）

| 路径特征 | 测试方向 |
|----------|----------|
| `/manager/html` | Tomcat弱口令爆破 |
| `/jmx-console/` `/web-console/` | JBoss默认口令 |
| `/axis2-admin/` | Axis管理后台 |
| `robots.txt` | 敏感路径信息 |
| `.git/HEAD` | 源码泄露→代码审计 |
| `test.jsp` `phpinfo.php` | 调试信息泄露 |

## 判断逻辑

```
扫出路径 → 按以下顺序打：

1. 先看有没有 P0 → 有就立刻打，不要分心
   文件上传 > SOAP > Druid > Actuator > Swagger > DWR

2. P0 没有再看 P1
   登录口 > 密码重置 > API端点 > 带参数的路径

3. 参数优先级
   有 file=/path=/download= → 路径穿越
   有 id=/userId=/orderId= → IDOR
   有 sort=/order=/pageSize= → SQL注入
   有 search=/keyword=/query= → XSS + SQL注入

4. 同一路径测多种漏洞
   一个登录口可以同时测：SQL注入、弱口令、用户名枚举、记住我、验证码绕过
```

## 快速判断：这个路径值不值得打？

问自己三个问题：
1. 这个接口会不会操作文件系统？（上传/下载/读取）→ 有 = P0
2. 这个接口会不会暴露后台数据？（数据库/配置/用户信息）→ 有 = P0
3. 这个接口接受用户输入吗？（参数/表单/JSON）→ 有 = P1

三个都不满足 → P2 或跳过

## 相关记忆
- [[kb_path_discovery_methology]] — 怎么找到这些路径
- [[feedback_pentest_service_discovery_first]] — 为什么必须做路径发现
