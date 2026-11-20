# 静态 → 动态 验证闭环

> 本文件解决一件事：**扫描器报的是"可疑链"，不是漏洞。怎么把它抬成能进报告的实锤。**
> 配套：`SKILL.md`（决策树入口）、`TOOLCHAIN.md`（扫描器选型）、`PLAYBOOK_*.md`（分语言）、`GROUND_TRUTH_ruoyi.md`（基准真相标尺）

---

## 0. 为什么必须有这一层

项目判定门槛（`CLAUDE.md` §SRC/授权渗透测试漏洞判定规则）要求同时满足四条才算漏洞：

1. 可复现（稳定，不依赖偶然状态、缓存或本地差异）
2. 有利用链（不是单个配置点，能形成完整攻击路径）
3. 有明确影响（真实数据 / 权限 / 资金 / 业务可用性）
4. 非纯理论（有请求、响应、触发条件实证）

**静态扫描天然只能给到第 2 条的半截。** semgrep 命中 `Runtime.exec` 不等于命令注入成立 —— 可能路由没注册、可能前置鉴权、可能入参已被 `Integer.parseInt` 净化。所以每条 finding 必须走完下面的阶梯。

---

## 1. 四级升级阶梯

| 级别 | 状态 | 产出 | 能否进报告 |
|---|---|---|---|
| **L0** | 静态命中 | `rule_id` + `file:line` + 代码片段 | ❌ |
| **L1** | 路由可达 | 能写出**完整的真实 HTTP 请求**：方法 + 路径 + 参数 + 鉴权前置 | ❌ |
| **L2** | 动态实证 | 真实请求 + 响应证据（或 DNSLog 回连） | ✅ |
| **L3** | 影响闭环 | 拿到真实敏感数据 / RCE 取证 / 越权到具体真实对象 | ✅（高危） |

**L0→L1 是纯静态推理，L1→L2 必须发包。** 卡在 L1 的 finding 一律归档为"未成立"，不进报告。

---

## 2. L0 → L1：从 `file:line` 推出 HTTP 请求

### 2.1 找路由（Java/Spring 例）

```bash
# 从命中行往上找方法注解，再往上找类注解
grep -nE '@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)' \
  ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/SysUserController.java
```

拼接规则：**类级 `@RequestMapping("/system/user")` + 方法级 `@GetMapping("/list")` = `GET /system/user/list`**。

三个必查的"前缀陷阱"（漏了就写出错误的 URL）：

- **context-path**：`application.yml` 的 `server.servlet.context-path`（RuoYi 默认 `/`，很多二开改成 `/prod-api`、`/api`）
- **网关前缀**：微服务架构前面还有 Spring Cloud Gateway 路由前缀
- **前端代理前缀**：Vue 侧 `vue.config.js` 的 `proxy` / `.env.production` 的 `VUE_APP_BASE_API`

### 2.2 找参数

| 注解 | 传参方式 | 备注 |
|---|---|---|
| `@RequestParam("x")` | query 或 form | 注意 `required=false` 的默认值 |
| `@PathVariable("x")` | 路径段 `/a/{x}` | 路径穿越高发点 |
| `@RequestBody` | JSON body | 字段在 DTO 里，**要顺着 DTO 类看字段名与嵌套** |
| `@RequestHeader` | header | `X-Forwarded-For`/`Referer` 类常被无条件信任 |
| `MultipartFile` | multipart | 配合 `-F` 发包 |

**参数语义决定测什么漏洞**：`fileName`/`path` → 路径穿越；`url`/`target`/`callback` → SSRF；`orderBy`/`sort`/`column` → SQL 注入（RuoYi 招牌）；`id`/`userId` → 越权。

### 2.3 判鉴权前置（**最容易漏的一步，漏了就是误报**）

```bash
grep -rnE 'permitAll|antMatchers|requestMatchers|authorizeHttpRequests' --include=*.java   # Spring Security 白名单
grep -rnE '@PreAuthorize|@PostAuthorize|@RequiresPermissions|@RequiresRoles|@DataScope' --include=*.java
grep -rnE 'implements HandlerInterceptor|extends HandlerInterceptorAdapter|OncePerRequestFilter' --include=*.java
grep -rnE 'filterChainDefinitionMap|anon|authc' --include=*.java                            # Shiro
```

判定：**source 被鉴权拦住且无绕过 ⇒ 降级为"需登录"，不能报未授权。**

反之，若 `SecurityConfig` 放行了某前缀而 Controller 又映射了该前缀的变体（`;` 路径参数、`..;/`、`%2e`、双斜杠），那才是真 BFLA —— 这类"**配置与路由不一致**"是 Spring/RuoYi 系最高频的真洞。

### 2.4 判可达性（静态误报的四大来源）

1. **死代码**：类/方法无调用方，或 `@Deprecated` 后路由已摘
2. **条件装配**：`@Profile("dev")` / `@ConditionalOnProperty` —— 生产 profile 下不加载
3. **依赖版本不含该 sink**：看 `pom.xml` / `package.json` 锁定版本（有漏洞版本 + 有调用点 = 实锤；版本已修 = 不成立）
4. **净化阻断**：source→sink 之间夹了 `Integer.parseInt` / 白名单 `in_array` / 参数化查询 / 转义函数

---

## 3. L1 → L2：动态验证

### 3.1 工具选择（遵循项目浏览器与链路规则）

| 场景 | 工具 | 理由 |
|---|---|---|
| 源码 / JS / 已保存请求证据分析 | 离线分析工具 | 静态审计不调用 Chrome MCP |
| 实际点击 / 填写 / 切页 / 登录交接 / 正常功能请求采集 | **MCP Chrome Extension**（`mcp__chrome_mcp__*`） | 仅在真实页面功能交互时使用 |
| 改包重放 / 精确控制 header 与 body | **Burp MCP** | 从 Burp 历史取真实包再改 |
| 路径探测批量发包 | `curl` | **仅限路径探测**，禁止 curl 拼主流程 |
| 无回显盲注 / SSRF / 命令注入确认 | **DNSLog** | 回连 IP = 目标出口 IP，直接当证据 |
| RCE 回连取证 / 反弹 shell | **attack_infra `srv.py`** | HTTP receiver 8811 / JNDI 1389 |

```bash
# DNSLog 一键（外带确认）
cd <workdir>/tools/dnslog_helper
python dnslog.py get
python dnslog.py probe --type sqli --watch 600

# RCE 回连取证
cd <workdir>/tools/attack_infra
python srv.py http      # 8811 收 OOB HTTP
```

### 3.2 前置条件与自愈

L0/L1 分析保持静态。进入动态验证前登记 D1 假设、正常对照、预期信号、预算与停止条件；需要补正常页面功能请求时先读 `vps-browser-workflow`。动作后分别确认 UI 变化及对应正常业务请求；纯客户端/缓存记 `ui_only`，捕获失败或无法归因记 `inconclusive`。这些状态不能把 finding 升级为 L2。

| MCP | 状态 | 说明 |
|---|---|---|
| `chrome_mcp`（MCP Chrome Extension） | 按当前工具目录与连通性检查 | 使用 `mcp__chrome_mcp__*`，保留共享浏览器控制与人工暂停 |
| `burp` | ✘ **未连接**（mcp-proxy → `127.0.0.1:9876`，报 `-32603: Not connected`） | **需先启动 Burp 并加载 MCP 插件** |
| `gsl5` | ✘ 502 | getShell 后要接管时再起（`java -jar tools/GodzillaSuper/bin/gsl5.jar mcp 9123 127.0.0.1`） |

**自愈**：按 `vps-browser-workflow` 查询当前入口状态和实际工具目录，不调用旧 `browser_*` 工具或臆造能力。浏览器被人工接管时暂停页面操作；持续故障保留证据并记 `blocked`，继续独立的离线分析。

> ⚠️ 若 Burp 起不来，**不要把 curl 拼 header 当主流程验证手段**（项目规则明令禁止）。此时应把 finding 停在 L1 并标注"待 Burp 恢复后验证"，而不是硬凑一个不算数的证据。

### 3.3 每类漏洞的验证动作表

| 类型 | 验证动作（按序） | 判"实锤"的标志 |
|---|---|---|
| SQL 注入 | ①算术验证 `2-1=1` ②布尔差异 ③时间盲注 ④DNSLog 外带 | 布尔/时间差异**稳定复现**且随 payload 变化 |
| 命令注入 | ①换无副作用命令对比 ②DNSLog `ping` | DNSLog 回连 IP = 目标出口 IP |
| 路径穿越 / 任意文件读 | 读一个**确定存在**的文件 vs 不存在的 | 返回真实文件内容（非报错页） |
| SSRF | DNSLog → 云元数据端点 | 拿到元数据 AK/SK 或内网数据；**仅回连不构成漏洞** |
| 越权 / IDOR | 换低权身份 或 换对象 id | 返回**他人真实业务数据** |
| 未授权访问 | 去凭据重放 + 换未登录会话 | 满足三门槛：明确敏感数据 + 无任何校验 + 稳定复现影响真实对象 |
| 反序列化 | `{"@type":"java.net.Inet4Address","val":"<域>"}` → JNDI | 回连确认解析了 `@type` |
| 硬编码密钥 | 拿该密钥去服务方官方 API 调一次 | 调用成功（**唯一能证明密钥有效的办法**） |
| 表达式注入 | 先无害算术 `#{7*7}` 观察回显 → 再 `Runtime` | 回显 49 / 命令执行回显 |
| 文件上传 | 传**无害测试文件**看落点与可访问性 | 能访问到且内容可控（**不往生产传 webshell**） |

---

## 4. 误报抑制清单（静态命中 ≠ 漏洞）

打包进报告前逐条对照，命中任一条即降级为"未成立"：

- [ ] 路由未注册 / 死代码
- [ ] 前置鉴权有效且不可绕
- [ ] source→sink 之间有净化（`parseInt` / 白名单 / 参数化 / 转义）
- [ ] 依赖版本已修复该 sink
- [ ] 仅影响自身（self-XSS、只读自己数据）
- [ ] 命中项属于 `CLAUDE.md` 明列的"**默认不得直接作为漏洞结论**"清单（明文传输、证书弱算法、缺 Secure/HttpOnly、CORS 宽松无凭证、CSRF token 缺失无状态改变、安全响应头缺失、仅因接口存在）
- [ ] 未授权项未同时满足三门槛（明确敏感数据 / 无任何校验 / 稳定复现影响真实对象）

---

## 5. 证据留档格式

每条 finding 一个区块，**请求包与响应包必须是原始报文**（不是复述）：

````markdown
### [FN-003] SysUserController orderBy MyBatis 注入

- **来源**：semgrep `java-ruoyi-mybatis-orderby` @ `ruoyi-system/.../SysUserServiceImpl.java:88`
- **路由**：`GET /system/user/list?orderByColumn=xxx&isAsc=asc`
- **鉴权前置**：需登录（`@RequiresPermissions("system:user:list")`）→ 已用低权账号验证可通过
- **L1 判定**：可达 ✅
- **请求**：
  ```http
  GET /system/user/list?orderByColumn=...&isAsc=asc HTTP/1.1
  Host: ...
  Cookie: ...
  ```
- **响应**：`<原始响应片段 / 报错页 / 时间差>`
- **判定**：**L2 成立**（布尔差异稳定复现，`orderByColumn` 变化直接改变结果集）
- **证据文件**：`report/evidence/2026-09-13-fn003-*.txt`
````

落盘位置：`report/YYYY-MM-DD-目标.md`（一个目标一个文件），**每验证一个立刻追加，不等不攒**。

---

## 6. 与报告规则的衔接

- **只有 L2+ 进报告正文。** L0/L1 的产物写进附录「未成立项」，并**明确说明不成立的原因**（项目要求：不构成漏洞时应明确说明"不构成漏洞"及原因）。
- **禁止措辞**："可能存在"、"疑似"、"大概率"。
- **禁止把低危合规项包装成漏洞**。
- 报告必须含**完整请求/响应包和可复现 Payload**，缺一不可。

---

## 7. 一句话总结这条闭环

> **扫描器负责"找到可疑的地方"，本闭环负责"证明它真的能打"。**
> 卡在 L1 的一律不算数 —— 宁可报得少，不能报得虚。
