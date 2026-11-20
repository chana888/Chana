# 指纹→N-Day 秒杀卡 (≤50行)

## 指纹识别一击
```
响应头 Server/Set-Cookie / HTML特征 / 默认路径 / 错误页 / JS文件
→ 命中→直接跳到对应N-day，跳过功能遍历
```

## 精准识别（拿不准时查指纹卡）
| 场景 | 指纹卡 |
|------|--------|
| Java 组件（Fastjson/Shiro/Spring/Tomcat…） | `tools/knowledge_base/fingerprint/kb_java_component_fingerprint_2026.md` |
| OA 厂商（泛微/致远/用友/通达…） | `tools/knowledge_base/fingerprint/kb_oa_systems_fingerprint_2026.md` |
| CMS（WordPress/织梦/帝国…） | `tools/knowledge_base/fingerprint/kb_cms_fingerprint_2026.md` |
| 中间件+Web框架（Nginx/Redis/ThinkPHP…） | `tools/knowledge_base/fingerprint/kb_middleware_webframework_fingerprint_2026.md` |

## 命中速查
| 指纹 | 优先攻击 |
|------|---------|
| 若依 RuoYi | Swagger / Druid / 默认口令 admin/admin123 |
| 泛微 OA | BshServlet RCE / KtreeUploadAction 上传 |
| 致远 OA | CVE-2025-34040 wpsAssistServlet 上传 |
| 蓝凌 OA | sysUiExtend.do ZIP 上传 |
| 用友 NC | NCCloudGatewayServlet RCE |
| 帆软 FR | 未授权命令执行 → RCE |
| 正方教务 | DWR SQL 注入 / 分页 ORDER BY 注入 |
| 金智门户 | authorizeUsers.portal 用户遍历 / CNVD-2018-17443 |
| Shiro | 默认密钥检测 + ysoserial |
| Fastjson | 指纹卡确认 → `probe --type fastjson` → 按版本定利用链（CVE-2026-16723） |
| Log4j | `${jndi}` 探测 → `probe --type log4j` → JNDIExploit |
| SpringBoot | Actuator 全端点 / heapdump |
| Nacos | 默认口令 nacos/nacos / 配置泄露 |
| 中间件指纹(Tomcat/WebLogic/Redis等) | 查 `midware-rce.md` 一击打 N-Day |

## 确认后
→ 查 `tools/knowledge_base/` 对应产品漏洞手册
→ `kb_oa_systems_poc_2026` / `kb_zhengfang_master` / `kb_jinzhi_master`

→ 返回 S2: {产品+版本?, 置信度?, N-Day列表?}
