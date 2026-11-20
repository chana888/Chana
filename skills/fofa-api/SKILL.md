---
name: fofa-api
description: 🔍 FOFA 官方 API 调用 — 资产搜索/证书查询/ICP备案查询/域名查询/图标检索/时间筛选/Excel导出
metadata:
  type: skill
---

# FOFA 官方 API 查询 Skill

> **Key**: 环境变量 `FOFA_API_KEY`（服务器已配置，agent execute 直接可见）

---

## 快速使用

```bash
echo "$FOFA_API_KEY" | head -c 8   # 验证环境变量已注入
python fofa-api/fofa.py domain 'xxx.com' --key "$FOFA_API_KEY"
```

## 省配技巧

```bash
# ✅ 推荐：加 --months 2 只查近2个月，省90%+数据配额
python fofa-api/fofa.py domain 'xxx.com' --months 2

# ❌ 不加 --months = 全量
python fofa-api/fofa.py domain 'xxx.com'
```

---

## 所有查询模式

### 1️⃣ 查信息
```bash
python fofa-api/fofa.py info
```

### 2️⃣ ICP备案查询
```bash
python fofa-api/fofa.py icp "沪ICP备17028264号"
python fofa-api/fofa.py icp "沪ICP备17028264号" --months 2
python fofa-api/fofa.py icp "17028264" --all --export
```

### 3️⃣ 证书查询
```bash
python fofa-api/fofa.py cert "*.heatingpay.com"          # 通配（同证书）
python fofa-api/fofa.py cert "heatingpay.com" exact      # 精确CN匹配
python fofa-api/fofa.py cert "heatingpay.com" --months 2 # 近2个月
```

### 4️⃣ 域名查询
```bash
python fofa-api/fofa.py domain "heatingpay.com"
python fofa-api/fofa.py domain "heatingpay.com" host     # 精确主机名
python fofa-api/fofa.py domain "heatingpay.com" --months 2 --export
```

### 5️⃣ 图标指纹搜索
```bash
python fofa-api/fofa.py search 'icon_hash="-247388890"'
python fofa-api/fofa.py search 'icon_hash="-247388890"' --months 2
```

### 6️⃣ 自定义 FOFA 语法
```bash
python fofa-api/fofa.py search 'port=443 && country=CN'
python fofa-api/fofa.py search 'body="暖气" && country="CN"' --months 2
python fofa-api/fofa.py search 'product="Apache"'
```

## 通用选项

| 选项 | 说明 |
|------|------|
| `--months N` | 只查最近N个月的数据（**省配额关键**） |
| `--size N` | 每页条数 |
| `--full` | 全量不限时间范围 |
| `--all` | 自动翻页获取全部数据 |
| `--export` | 导出 Excel（桌面 fofa_export/） |
| `--fields` | 自定义字段 |

## 导出

```bash
# 导出近2个月数据（省配额）
python fofa-api/fofa.py domain 'heatingpay.com' --months 2 --export

# 全量导出
python fofa-api/fofa.py domain 'heatingpay.com' --all --export
```

## 接口

| 接口 | 地址 |
|------|------|
| 账号信息 | `/api/v1/info/my?key=KEY` |
| 分页搜索 | `/api/v1/search/all?key=KEY&qbase64=xxx&size=N&fields=F` |
| 连续翻页 | `/api/v1/search/next?key=KEY&qbase64=xxx&size=N&fields=F` |
| 统计聚合 | `/api/v1/search/stats?key=KEY&qbase64=xxx&fields=F` |

## 🔑 证书字段参考（FOFA 官方语法，点号分隔！）

> ⚠️ **证书字段是点号语法 `cert.subject.cn`，不是下划线 `cert.subject_cn`！**
> `fofa.py` 的 `exact` 模式已正确实现为 `cert.subject.cn=`（2026-08-05 修正）。

| 字段 | 含义 | 用途 |
|------|------|------|
| `cert` | 证书全文 | 模糊匹配，关键字必须足够特定 |
| `cert.subject.cn` | 持有者通用名称 | ⭐ 按域名/主机名反查证书（最准） |
| `cert.subject.org` | 持有者组织 | ⭐ 按公司全称反查该司所有证书 |
| `cert.issuer.org` | 颁发者组织 | 查同一 CA 签发的资产 |
| `cert.issuer.cn` | 颁发者通用名称 | 同上 |
| `cert.domain` | 证书中的根域名 | 按根域聚合 |
| `cert.sn` | 证书序列号 | 精确匹配单张证书 |
| `cert.not_before` / `cert.not_after` | 生效/到期时间 | 查过期证书 |
| `tls.ja3s` / `tls.version` | TLS 指纹/版本 | 指纹识别 |

**用法示例：**
```bash
# 按持有者 CN 精确反查（推荐）
python fofa.py search 'cert.subject.cn="parkson.com.cn"'

# 按持有者组织反查（公司全称）
python fofa.py search 'cert.subject.org="环胜电子商务（上海）有限公司"'

# 证书全文模糊（仅限特定关键字，通用词必误报）
python fofa.py cert "parkson"          # ✅ 品牌名 OK
# ❌ 不要 cert="efuture" / cert="power" 等通用词 → 90%误报
```

## ⛔ 查询铁律（2026-08-05 新增）

| # | 铁律 | 说明 |
|:-:|:----|:-----|
| 1 | **≥15s 间隔** | FOFA 限流严格，3.5s 会触发 429 Too Many Requests + 风控 |
| 2 | **关键字必须足够特定** | 品牌名/域名/公司全称，不用通用英文词（误报率 60-90%） |
| 3 | **结果逐个筛查** | cert 反查结果要人工确认归属，别把同名误报当资产 |
| 4 | **省着用** | Key 有风控风险，一次查最精准的 q，不翻页试探 |
