# 中间件指纹→N-Day 秒杀卡 (≤50行)

> 用途: S1 识别到中间件指纹 → 一击打 N-Day，跳过功能遍历
> 2026-08-13 已补 2025-2026 新 CVE + src-wiki 全库 4756 篇 POC 归档
> POC 库: `tools/knowledge_base/srcwiki_poc/`（中间件漏洞171/应用服务器118/开发框架98/CVE-2026 92）
> 2026 预认证 RCE 快照: `kb_middleware_rce_master_2026.md` 第0章

## 指纹识别一击
```
响应头 Server / Set-Cookie / 默认路径 / 错误页 / 端口特征
→ 命中下表 → 直接打对应 N-Day
```

## 命中速查表
| 指纹特征 | 优先攻击链 |
|---------|-----------|
| Server: Apache-Coyote / :8080 | Tomcat: Manager弱口令→WAR部署 / GhostCat(8009) / PUT写shell(12615) |
| /console + :7001 | WebLogic: 14882 console未授权→14883 RCE / 21839 T3 JNDI / wls-wsat(10271) |
| /invoker/ + :8080 | JBoss: 12149 JMXInvoker反序列化 / 7504 / 未授权部署war |
| rememberMe=deleteMe | Shiro: 密钥爆破→CC6→内存马 |
| Whitelabel Error Page | SpringBoot: Actuator env→heapdump→攻击面 / Gateway SpEL(22947) |
| Server: nginx | off-by-slash穿越→配合上传 / alias配置不当 / 走私 |
| Server: Apache/2.4.49 | 41773/42013 穿越→CGI RCE / mod_proxy走私(25690) / 38476 SSRF |
| Server: Microsoft-IIS | WebDAV溢出(7269) / ViewState反序列化(0688) / 短文件名 |
| :6379 无认证 | Redis: 写crontab/SSH key / 主从复制module加载RCE / Lua沙箱(20543) |
| :61616 OpenWire | ActiveMQ: 46604 OpenWire反序列化RCE / fileserver上传(3088) |
| :9876/:10911 | RocketMQ: 33246 Broker命令执行 |
| :9200 JSON响应 | Elasticsearch: 未授权 / Groovy RCE(1427) / script注入 |
| :8983 /solr | Solr: Velocity模板RCE(12629/17558) / SSRF→RCE(27905) |
| :8080 /login | Jenkins: 任意文件读→RCE(23897) / 脚本控制台Groovy |
| :8848 /nacos | Nacos: 默认nacos/nacos / derby SQL→RCE(27773) / 认证绕过(29441) |
| /xxl-job-admin | XXL-JOB: 未授权GLUE→RCE |
| :9000 /minio | MinIO: 信息泄露(28432) / 未授权mc admin |
| :8090 /login.action | Confluence: 22515权限绕过→22527 OGNL RCE |
| GitLab / GitLab-API | 7028任意密码重置 / hook RCE |
| :8080 /manager | Tomcat Manager: 弱口令爆破→WAR部署getshell |

## 2025-2026 新增高危（先查版本）
| 版本指纹 | 优先攻击链 |
|---------|-----------|
| fastjson 1.x fat-JAR | CVE-2026-16723 单请求RCE（jar:http..整数IP）|
| fastjson2 ≤2.0.62 | QVD-2026-45876 FNV-1a碰撞 autoType绕过 RCE |
| Struts2 ≤6.3.0.2 | S2-067 上传穿越RCE / ≤6.1.0 S2-069 XXE |
| Jackson PTV启用 | GHSA-j3rv-43j4-c7qm 泛型参数走私 RCE |
| Nacos :9848 | CNVD-2023-45001 JRaft Hessian / Derby SQL→RCE |
| WAS 8.5-9.0.5.24 | CVE-2025-36038 未授权反序列化 RCE |

## 通用 GetShell 链
```
中间件RCE → 反弹shell / 写webshell → 内存马(Filter/Agent型) → 提权 → 内网横向
工具: GSL5 GodzillaSuper / JYso / ysoserial / JNDIExploit / redis-rogue-server
```

## 确认后
→ 查 `tools/knowledge_base/rce_getshell/kb_middleware_rce_master_2026.md` 深度手册
→ 返回 S2: {产品+版本?, 置信度?, N-Day列表?}
