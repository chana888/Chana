# 漏洞利用技术手册

> 16 篇 | 统一知识库 techniques/ 目录

| 手册 | 说明 |
|------|------|
| [kb_fastjson_shiro_log4j_master_2026.md](kb_fastjson_shiro_log4j_master_2026.md) | **Fastjson/Shiro/Log4j 三件套发现→利用完整链路**——指纹确认/版本探测/DNSLog检测/JNDI/不出网/CVE-2026-16723/WAF绕过/Log4j bypass变体 |
| [kb_file_upload_bypass_2026.md](kb_file_upload_bypass_2026.md) | 文件上传绕过技术大全—后缀名绕过/Content-Type绕过/htaccess解析漏洞/Nginx IIS Apache/条件竞争/图片马/二次渲染/编辑器上传 |
| [kb_file_upload_lfi_deep_2026.md](kb_file_upload_lfi_deep_2026.md) | **文件上传/文件包含深度实战手册**—发现→验证→利用→取证全流程,上传绕过层级决策模型,2025-2026新CVE(iCagenda/NinjaForms/RSFiles/CRS/Pterodactyl/CraftCMS),peclcmd影子入口,php filter chain,上传+包含联合链,判定门槛 |
| [kb_high_value_path_priority.md](kb_high_value_path_priority.md) | 路径发现后的价值排序 — 优先打哪些资产最高概率出洞 |
| [kb_java_deserialization_2026.md](kb_java_deserialization_2026.md) | Java反序列化漏洞速查表—Shiro/Fastjson/WebLogic/Tomcat/Jackson/JBoss/Jenkins gadget链+检测+利用+bypass |
| [kb_jndi_injection_2026.md](kb_jndi_injection_2026.md) | JNDI注入原理—RMI/LDAP/LDAPS/DNS/CORBA/高版本JDK绕过/Log4j/Spring/工具链 |
| [kb_lfi_rfi_2026.md](kb_lfi_rfi_2026.md) | 文件包含漏洞(LFI/RFI)利用大全—php伪协议/日志包含/session包含/pearcmd/条件竞争/Windows短文件名/截断/远程包含 |
| [kb_pati_file_inclusion_poc_2026.md](kb_pati_file_inclusion_poc_2026.md) | **PATI File Inclusion 全量 POC**（2026-08-14 归档）—LFI/RFI 基础变体/php://filter链RCE/data·expect·input·zip·phar/convert.iconv盲读文件/iconv CVE-2024-2961/LFI2RCE七链路/pearcmd四法/SMB RFI/凭据文件；原始字典脚本见 `../payloads/file_inclusion_pati/` |
| [kb_memshell_injection_2026.md](kb_memshell_injection_2026.md) | Java内存马注入技术—Tomcat Filter/Listener/Servlet/Valve/Spring Controller/Interceptor/WebSocket+武器化工具 |
| [kb_oa_systems_poc_2026.md](kb_oa_systems_poc_2026.md) | 六大OA系统(泛微/致远/蓝凌/通达/用友/金蝶)漏洞POC合集 含FOFA指纹+利用接口+检测方式 |
| [kb_oracle_orderby_waf_bypass_multipart_20260617.md](kb_oracle_orderby_waf_bypass_multipart_20260617.md) | multipart/form-data绕过WAF + NCHR/CONCAT/REGEXP_COUNT无引号盲注完整技术链 |
| [kb_path_discovery_methodology.md](kb_path_discovery_methodology.md) | 路径发现综合方法论 — 被动提取/主动扫描/源码泄露/递归发现/框架指纹，五层全覆盖 |
| [kb_springboot_vulns_poc_2026.md](kb_springboot_vulns_poc_2026.md) | SpringBoot全套漏洞POC Actuator/Cloud Gateway/Cloud Function/反序列化/heapdump/SpEL注入 |
| [kb_sqli_ltrim_nchr_ascii_bypass.md](kb_sqli_ltrim_nchr_ascii_bypass.md) | 当 SUBSTR 被 WAF 封杀时，用 LTRIM+NCHR+ASCII 逐位盲注提取字符串的绕过技术 |
| [kb_ssti_template_injection_2026.md](kb_ssti_template_injection_2026.md) | SSTI服务端模板注入速查 Payload大全 Jinja2/FreeMarker/Velocity/Thymeleaf/Twig/Smarty/Mako/Pug/Jade/.NET Razor 检测+利用+RCE |
| [kb_waf_bypass_quickref_2026.md](kb_waf_bypass_quickref_2026.md) | 整合式WAF绕过知识库—含SQL注入实战顺序、编码链、产品族差异、HTTP走私速查。从已有6个记忆文件+本次实战+深研验证结果合并而成，适合实战中快速查阅 |
| [kb_wiki96_file_inclusion_poc_2026.md](kb_wiki96_file_inclusion_poc_2026.md) | **wiki.96.mk 文件包含/目录穿越 POC 整合**（2026-08-14 归档）—32 篇镜像精炼：通达OA gateway 上传+包含/ThinkPHP extract 覆盖/PbootCMS 双写/phpMyAdmin 三 CVE/Tomcat Ghostcat/Kibana/ES/Gitea/Confluence/Rails Accept 头/Spring Config `(_)` 穿越/Nginx alias/Node normalize/uWSGI/phpinfo 条件竞争；全量 988 篇原文见 `../payloads/wiki96_mirror/` |

> 相关: [上一级索引](../README.md) | [srcwiki POC 库](../srcwiki_poc/README.md) | [RCE 手册](../rce_getshell/) | [Java 组件指纹卡](../fingerprint/kb_java_component_fingerprint_2026.md)