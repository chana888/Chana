# Skill 索引树（场景 → 该用哪个）

> 141 个 skill 不要按目录名猜。**先定位你处在哪一步，再加载对应 playbook**。
> 路由类（`hack`/`api-sec`/`auth-sec`…）只负责选方向；进入方向后再加载具体 playbook。
> 加载方式：`skill` 工具按名加载，或直接读 `<skill>/SKILL.md`。

---

## 0. 不确定从哪开始
| 场景 | skill |
|---|---|
| 完全没头绪，先定路线 | `hack`（P0 主路由） |
| 只给了资产清单，要规划打法 | `pentest-sop` → `vuln-discovery-methodology` |
| 已有抓包/JS 索引，要整理证据 | `request-triage` |

## 1. 作业方法论 / 流程 / 记录
| 场景 | skill |
|---|---|
| 端到端流程（D0→D3） | `pentest-sop` |
| 只知道怎么打、不知道怎么找 | `vuln-discovery-methodology` |
| 把渗透当状态空间搜索 | `pentest-agent-os`、`capability-primitive-search` |
| 项目黑板 / fact 图记录 | `pentest-blackboard` |
| 判断是不是真洞 | `pentest-verification` |
| 报告与输出规范 | `pentest-output-standards` |
| 不限范围、被拦换路 | `unlimited-attack-scope` |
| 隐蔽/OPSEC/避免打封 IP | `redteam-opsec` |
| 找代理、工具自举 | `proxy-tool-bootstrap` |
| 没有公开漏洞时自行发现 | `zero-day-discovery` |

## 2. 侦察 / 资产 / 指纹
| 场景 | skill |
|---|---|
| 先选侦察方向 | `recon-for-sec`（P1 路由） |
| 攻击面测绘（被动+主动） | `attack-surface-recon` |
| 被动信息收集 13 模式 | `infogather` |
| FOFA API 查询 | `fofa-api` |
| Quake 测绘 | `quake` |
| 开源版资产探测纪律 | `opensrc-recon` |
| 指纹识别（产品/CMS/OA） | `web-fingerprint-nday` |
| 组件版本命中查情报 | `component-vuln-intel` |
| 指纹→Nday POC 链 | `wpoc-nday-exploit` |
| 股权穿透找子公司域名 | `xiaolanben-equity` |
| 子域接管 | `subdomain-takeover` |

## 3. 输入落点 → 注入类
| 落点 | skill |
|---|---|
| SQL 查询/排序/过滤 | `sqli-sql-injection`、`biz-sqli-manual` |
| MongoDB/JSON 操作符 | `nosql-injection` |
| 命令拼接/子进程 | `cmdi-command-injection` |
| 模板渲染 | `ssti-server-side-template-injection` |
| Java EL/SpEL/OGNL | `expression-language-injection` |
| XML/SVG/OOXML | `xxe-xml-external-entity`、`xslt-injection` |
| 响应头/日志 | `crlf-injection` |
| 邮件头 | `email-header-injection` |
| CSV/表格导出 | `csv-formula-injection` |
| 参数解析歧义/重复键 | `http-parameter-pollution` |
| Host 头信任 | `http-host-header-attacks` |
| 前后端解析差异 | `request-smuggling` |
| HTTP/2 特性 | `http2-specific-attacks` |
| ASP.NET method 路由 | `method-injection` |

## 4. 访问控制 / 认证 / 令牌
| 场景 | skill |
|---|---|
| 先选认证方向 | `auth-sec`（P1 路由） |
| 登录/重置/改绑/MFA | `authbypass-authentication-flaws` |
| API 令牌/JWT | `api-auth-and-jwt-abuse`、`jwt-oauth-token-attacks` |
| OAuth/OIDC | `oauth-oidc-misconfiguration` |
| SAML SSO 断言 | `saml-sso-assertion-attacks` |
| 对象级越权/IDOR | `idor-broken-object-authorization` |
| API 功能级授权/BOLA | `api-authorization-and-bola`、`api-sec` |
| 401/403 绕过 | `401-403-bypass-techniques` |
| CSRF | `csrf-cross-site-request-forgery` |
| CORS（chana 默认不挖） | `cors-cross-origin-misconfiguration` |
| 点击劫持 | `clickjacking` |

## 5. 文件 / 上传 / 源码泄露
| 场景 | skill |
|---|---|
| 先选文件方向 | `file-access-vuln`（P1 路由） |
| 上传校验/解析/覆盖 | `upload-insecure-files` |
| 路径穿越/LFI | `path-traversal-lfi` |
| VCS/备份/.env 泄露 | `insecure-source-code-management` |
| 任意写 → RCE | `arbitrary-write-to-rce` |

## 6. 客户端 / 浏览器 / 协议
| 场景 | skill |
|---|---|
| XSS（反射/存储/DOM） | `xss-cross-site-scripting` |
| CSP 拦住 XSS 后 | `csp-bypass-advanced` |
| HTML 注入但执行不了 | `dangling-markup-injection` |
| JS 原型链污染 | `prototype-pollution`、`prototype-pollution-advanced` |
| 开放重定向 | `open-redirect` |
| 缓存投毒/欺骗 | `web-cache-deception` |
| WebSocket | `websocket-security` |
| GraphQL/隐藏参数 | `graphql-and-hidden-parameters` |
| DNS 重绑定 | `dns-rebinding-attacks` |
| V8/浏览器漏洞利用 | `browser-exploitation-v8` |

## 7. 服务端组件 / 反序列化 / 绕过
| 场景 | skill |
|---|---|
| Java/PHP/Python 反序列化 | `deserialization-insecure` |
| JNDI/LDAP 注入 | `jndi-injection` |
| Java 16 位窄化幽灵比特 | `ghost-bits-cast-attack` |
| WAF 拦截 | `waf-bypass-techniques` |
| 常见服务未授权（Redis/AJP/YARN…） | `unauthorized-access-common-services` |

## 8. 拿到立足点之后：内网 / 域 / 横向 / 提权
| 场景 | skill |
|---|---|
| AD 总览 | `active-directory-attack` |
| ACL 滥用 | `active-directory-acl-abuse` |
| ADCS 证书模板 | `active-directory-certificate-services` |
| Kerberos | `active-directory-kerberos-attacks` |
| NTLM Relay / 强制认证 | `ntlm-relay-coercion` |
| Linux 横向 | `linux-lateral-movement` |
| Windows 横向 | `windows-lateral-movement` |
| Linux 提权 | `linux-privilege-escalation` |
| Windows 提权 | `windows-privilege-escalation` |
| 受限 shell/SELinux/AppArmor | `linux-security-bypass` |
| macOS 提权/绕过 | `macos-security-bypass` |
| AV/EDR 免杀 | `windows-av-evasion` |
| 隧道与代理链 | `tunneling-and-pivoting` |
| 反弹 shell | `reverse-shell-techniques` |
| 后渗透总纲 | `post-exploitation` |

## 9. 云 / 容器 / K8s
| 场景 | skill |
|---|---|
| 元数据 API / S3 / IAM 提权 | `cloud-attack-methods` |
| 容器逃逸 | `container-escape-techniques` |
| Kubernetes | `kubernetes-pentesting` |

## 10. AI / LLM
| 场景 | skill |
|---|---|
| LLM 应用完整流程 | `llm-dialog-pentest` |
| 提示注入 | `llm-prompt-injection` |
| Agent 工具滥用/MCP/模型供应链 | `ai-llm-app-attack`、`ai-ml-security` |

## 11. 二进制 / 逆向 / 密码学
| 场景 | skill |
|---|---|
| 二进制保护识别 | `binary-protection-bypass` |
| 栈溢出/ROP | `stack-overflow-and-rop` |
| 堆利用 | `heap-exploitation` |
| 格式化字符串 | `format-string-exploitation` |
| 内核提权 | `kernel-exploitation` |
| 沙箱逃逸 | `sandbox-escape-techniques` |
| 反调试 | `anti-debugging-techniques` |
| 混淆/去混淆 | `code-obfuscation-deobfuscation` |
| 自定义 VM/字节码 | `vm-and-bytecode-reverse` |
| 符号执行/约束求解 | `symbolic-execution-tools` |
| 密码学攻击（RSA/格/对称/哈希） | `rsa-attack-techniques`、`lattice-crypto-attacks`、`symmetric-cipher-attacks`、`hash-attack-techniques` |
| 古典密码 | `classical-cipher-analysis` |
| PHP 类型混淆 | `type-juggling` |

## 12. 移动端 / 硬件 / 区块链
| 场景 | skill |
|---|---|
| Android | `android-pentesting-tricks` |
| iOS | `ios-pentesting-tricks` |
| 证书固定绕过 | `mobile-ssl-pinning-bypass` |
| APK/EXE/固件逆向 | `binary-mobile-reversing` |
| 无线/硬件 | `wireless-hardware-attack` |
| 智能合约 | `smart-contract-vulnerabilities`、`defi-attack-patterns`、`blockchain-contract-attack` |

## 13. 代码审计 / 供应链 / 业务逻辑
| 场景 | skill |
|---|---|
| 多语言源码审计 | `code-audit` |
| 源码狩猎（.git/危险函数/CI） | `source-code-hunting` |
| 依赖混淆 | `dependency-confusion` |
| 业务逻辑/竞态/支付 | `business-logic-vulnerabilities`、`race-condition` |
| 钓鱼/初始访问 | `initial-access-phishing` |
| 网络协议（ARP/LLMNR/DHCP） | `network-protocol-attacks` |
| 流量分析/取证 | `traffic-analysis-pcap`、`memory-forensics-volatility`、`steganography-techniques` |
| 专题实战（GoEdge/宝塔/云取证） | `specialized-attack-playbooks` |
| Web 全栈总纲 | `web-attack-methods` |

## 14. 环境 / 工具
| 场景 | skill |
|---|---|
| 浏览器功能点操作 | `vps-browser-workflow` |
| Eino skill 示例 | `eino-demo` |

---

## 快速反查（按字母）

`401-403-bypass-techniques` `active-directory-acl-abuse` `active-directory-attack` `active-directory-certificate-services` `active-directory-kerberos-attacks` `ai-llm-app-attack` `ai-ml-security` `android-pentesting-tricks` `anti-debugging-techniques` `api-auth-and-jwt-abuse` `api-authorization-and-bola` `api-recon-and-docs` `api-sec` `arbitrary-write-to-rce` `attack-surface-recon` `auth-sec` `authbypass-authentication-flaws` `binary-mobile-reversing` `binary-protection-bypass` `biz-sqli-manual` `blockchain-contract-attack` `browser-exploitation-v8` `business-logic-vuln` `business-logic-vulnerabilities` `capability-primitive-search` `classical-cipher-analysis` `clickjacking` `cloud-attack-methods` `cmdi-command-injection` `code-audit` `code-obfuscation-deobfuscation` `component-vuln-intel` `container-escape-techniques` `cors-cross-origin-misconfiguration` `crlf-injection` `csp-bypass-advanced` `csrf-cross-site-request-forgery` `csv-formula-injection` `dangling-markup-injection` `defi-attack-patterns` `dependency-confusion` `deserialization-insecure` `dns-rebinding-attacks` `eino-demo` `email-header-injection` `expression-language-injection` `file-access-vuln` `fofa-api` `format-string-exploitation` `ghost-bits-cast-attack` `graphql-and-hidden-parameters` `hack` `hash-attack-techniques` `heap-exploitation` `http-host-header-attacks` `http-parameter-pollution` `http2-specific-attacks` `idor-broken-object-authorization` `infogather` `injection-checking` `insecure-source-code-management` `ios-pentesting-tricks` `jndi-injection` `jwt-oauth-token-attacks` `kernel-exploitation` `kubernetes-pentesting` `lattice-crypto-attacks` `linux-lateral-movement` `linux-privilege-escalation` `linux-security-bypass` `llm-dialog-pentest` `llm-prompt-injection` `macos-process-injection` `macos-security-bypass` `memory-forensics-volatility` `method-injection` `mobile-ssl-pinning-bypass` `network-protocol-attacks` `nosql-injection` `ntlm-relay-coercion` `oauth-oidc-misconfiguration` `open-redirect` `opensrc-recon` `path-traversal-lfi` `pentest-agent-os` `pentest-blackboard` `pentest-output-standards` `pentest-sop` `pentest-verification` `post-exploitation` `prototype-pollution` `prototype-pollution-advanced` `proxy-tool-bootstrap` `quake` `race-condition` `recon-and-methodology` `recon-for-sec` `redteam-opsec` `request-smuggling` `request-triage` `reverse-shell-techniques` `rsa-attack-techniques` `saml-sso-assertion-attacks` `sandbox-escape-techniques` `smart-contract-vulnerabilities` `source-code-hunting` `specialized-attack-playbooks` `sqli-sql-injection` `ssrf-server-side-request-forgery` `ssti-server-side-template-injection` `stack-overflow-and-rop` `steganography-techniques` `subdomain-takeover` `symbolic-execution-tools` `symmetric-cipher-attacks` `traffic-analysis-pcap` `tunneling-and-pivoting` `type-juggling` `unauthorized-access-common-services` `unlimited-attack-scope` `upload-insecure-files` `vm-and-bytecode-reverse` `vps-browser-workflow` `vuln-discovery-methodology` `waf-bypass-techniques` `web-attack-methods` `web-cache-deception` `web-fingerprint-nday` `websocket-security` `windows-av-evasion` `windows-lateral-movement` `windows-privilege-escalation` `wireless-hardware-attack` `wpoc-nday-exploit` `xiaolanben-equity` `xslt-injection` `xss-cross-site-scripting` `xxe-xml-external-entity` `zero-day-discovery`

- 攻击思维协议（新资产三问/卡壳四问/判定三证/创新钩子）→ attack-thinking
