# 产品/组件指纹识别手册

> 7 篇 | 统一知识库 fingerprint/ 目录
> 定位：**从零精准识别**（五维指纹+FOFA+主动确认）→ 命中即查 srcwiki_poc 直打

| 手册 | 覆盖 | 说明 |
|------|------|------|
| [kb_java_component_fingerprint_2026.md](kb_java_component_fingerprint_2026.md) | **Java 组件** | Fastjson/Shiro/Log4j/Spring/Struts2/WebLogic/Tomcat/JBoss 五维指纹+FOFA+主动探测 |
| [kb_oa_systems_fingerprint_2026.md](kb_oa_systems_fingerprint_2026.md) | **OA 8 厂商** | 泛微/致远/用友/蓝凌/通达/万户/金蝶/帆软 指纹+FOFA+默认路径+攻击指引 |
| [kb_cms_fingerprint_2026.md](kb_cms_fingerprint_2026.md) | **CMS 主流** | WordPress/Drupal/Joomla/织梦/帝国/PHPCMS/苹果CMS 指纹+FOFA+攻击指引 |
| [kb_middleware_webframework_fingerprint_2026.md](kb_middleware_webframework_fingerprint_2026.md) | **中间件+Web框架** | Nginx/Apache/IIS/Redis/ActiveMQ/ES/Solr/Jenkins/Nacos/XXL-JOB/MinIO/Confluence/GitLab/RocketMQ + ThinkPHP/Laravel/Django/Flask/Rails |
| [kb_lyuap_fofa_fingerprint_v5.md](kb_lyuap_fofa_fingerprint_v5.md) | 联奕 LY-UAP | V5.0 构建哈希/CSS哈希/JS 内容搜版本 |
| [kb_newcapec_sd_login_fingerprint_20260810.md](kb_newcapec_sd_login_fingerprint_20260810.md) | 新开普 | /sd-login/ 智慧校园统一认证指纹与 FOFA |
| [kb_nday_match_from_local_knowledge.md](kb_nday_match_from_local_knowledge.md) | N-Day 匹配 | 指纹命中→统一知识库匹配 POC→优先打 N-day |

> 检索串联: `kb/quick-ref/fingerprint-nday.md`（S1 命中速查）→ `kb/quick-ref/midware-rce.md`（中间件攻击链）→ 本目录各卡 → `srcwiki_poc/{分类}/_index.md`
> 相关: [上一级索引](../README.md) | [srcwiki POC 库](../srcwiki_poc/README.md) | [三件套利用链](../techniques/kb_fastjson_shiro_log4j_master_2026.md)
