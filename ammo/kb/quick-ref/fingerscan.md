# FingerScan — BurpSuite 指纹识别 + 递归目录扫描插件

**来源**: github.com/TD0U/FingerScan（基于 OneScan 二次开发，Montoya API）
**最新**: v3.0.11 (2026-08-08) · **JAR**: `D:\Desktop\Claude\tools\FingerScan\FingerScan-v3.0.11.jar`
**校验**: sha256 `cf6fcae86690e5bc3beef510221129d234534c850f21b29f1a969dfdfd35d008`

## 安装
1. Burp Suite → Extensions → Add → Type **Java** → 选 JAR → 顶部出现 FingerScan 标签
2. 工作目录（JAR 同级 `FingerScan/`）：`config.json` / `Config_yaml.yaml` / `icon_hash.db`(SQLite) / `wordlist/` / `collect/`

## 快速开始
1. 数据看板勾选 **Listen Proxy**（开启代理监听）
2. Host 配置设白名单（支持通配符 `*`，防外溢）
3. 浏览目标站 → 被动指纹 + Favicon 主动采集
4. 看命中 → 数据看板（主机+指纹去重）· 图标数据（Favicon）
5. 目录探测勾 **Active Scan**（递归目录 + Payload）

## 核心能力
- **被动指纹** — 代理流量自动匹配 YAML 规则（正则/关键字）
- **Favicon Hash** — 解析 link 主动拉取同 host 图标 → MurmurHash3/MD5（兼容 Shodan/FOFA）
- **递归目录扫描** — 路径层级 × 规则路径列表组合
- **Payload 处理** — Add Prefix/Suffix / Match Replace / Condition Check（作用域 URL/Header/Body/整请求）
- **路径收集** — 提取一级路径，导出字典复用 dirsearch

## 指纹规则 (Config_yaml.yaml)
```yaml
Load_List:
  - id: 1
    loaded: true
    name: Spring Actuator
    type: Spring
    method: GET
    url: /actuator
    state: '200'            # 0/空=不限
    match: keyword          # regex(默认) 或 keyword
    re: swagger && webjars  # keyword: 单串 | a && b | a || b（勿混用）
    info: 命中提示

Icon_Hash_List:
  - name: Jenkins
    murmur_hash: "81586312"
    md5: ""
    type: Application
```

## 动态变量
`{{host}} {{protocol}} {{ip}} {{domain}} {{domain.main}} {{subdomain}} {{webroot}} {{random.ip}} {{random.ua}} {{timestamp}} {{date.*}} {{time.*}}`

## 请求设置（默认）
QPS 1024 / 延迟 0ms / 重试 3×3000ms / 层级 99 / 方法 GET|POST / 排除 css,png,jpg,ico

## 性能开关（防误判/防卡）
- 字面量预过滤（开）、跳过非文本响应（开）、字面量最短 3
- 单规则匹配超时 **100ms**（防 `(?=.*a)(?=.*b)` 灾难性回溯 → 用 keyword 替代）
- 分析线程 4 / 队列 2000（满则丢） / 主动并发 4
- 指纹 URL 匹配（关）：规则 `url` 非空需与请求路径精确匹配

## 渗透用途
- S1 指纹命中 → 查 `kb/quick-ref/fingerprint-nday.md` 打 N-Day
- Favicon Hash 反查 Shodan/FOFA 测绘同源资产
- 递归目录扫描辅助路径发现（先 curl 批量验证，再开浏览器）
- 路径收集导出字典 → dirsearch 复用
