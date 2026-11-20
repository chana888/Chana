---
name: xiaolanben-equity
description: >-
  小蓝本股权穿透+域名提取:从目标公司出发递归遍历对外投资(≥51%控股),提取每层公司网站域名/邮箱/资产,输出xlsx报告。
  实战验证:ExampleGroup61家对外投资→26家≥51%→域名yumiching.com等;百盛10→7→parksongroup.com。
  Use when needing subsidiary/grandchild company discovery, equity penetration, or 子公司/孙公司域名收集.
---

# 小蓝本 股权穿透 + 域名提取

> 从目标公司出发，递归遍历对外投资（≥51%控股），提取每层公司的网站域名、邮箱、资产，输出 xlsx 报告。
> 站点：https://sou.xiaolanben.com/ （Vue SPA，浏览器已登录账号）

## 🔴 签名 err002 铁律（2026-08-05 实战验证，必须先做）

**症状**：搜索页 `queryByKeyword` 全部 403 `验签错误`（h_sign 带 `err002` 后缀），而详情页接口正常。

**根因**：搜索页路由签名 SDK 未初始化（err002=降级标记）；详情页路由加载 chunk 3/12 触发签名 SDK 初始化。

**Fix v2**（必须先预热再搜索，**同一标签页内**）：
```
① chrome-devtools__navigate_page(https://sou.xiaolanben.com/company/qb9d94a767be70c45d056ad999fc550ca, initScript)  ← 预热，返回即可
② chrome-devtools__navigate_page(https://sou.xiaolanben.com/search?key={URL编码关键词}&page=1, initScript)          ← 整页加载
③ 同一标签页内后续所有搜索/翻页正常
```
**initScript**（每次导航带）：`Object.defineProperty(navigator, 'webdriver', {get: () => undefined});`

**Helper**：`xiaolanben-search keyword="<公司名>"` → 输出预热URL/搜索URL/initScript 完整步骤。

**避坑清单**：
- ❌ 首页 fill+Enter 触发搜索 → err002
- ❌ 新标签页直接导航搜索URL → err002
- ❌ JS 动态加载 chunk 3/12 → 只注册不执行，无效
- ✅ 预热必须在【同一标签页】内

## Phase 1 搜索公司

```
方式A（推荐）：xiaolanben-search 生成 URL → chrome-devtools__navigate_page 直接导航
  https://sou.xiaolanben.com/search?key={quote(关键词)}&page=1
方式B：navigate_page(首页, initScript) → fill(搜索框, 公司名) → press_key Enter
```
- 搜索参数是 `key=`（不是 keyword=）
- 验证：title 应含目标公司名

## Phase 2 提取公司ID

```javascript
// chrome-devtools__evaluate_script 提取所有公司链接的 companyId
var links = document.querySelectorAll('a[href*="/company/"]');
// cid 形如 q0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c
```

## Phase 3 详情页 + SPA 懒加载触发 + 网站/邮箱

```
chrome-devtools__navigate_page("https://sou.xiaolanben.com/company/{companyId}", initScript)
等 3s SPA 渲染
// 详情页必须 scroll 触发懒加载，否则 tab 不出现
evaluate_script: for(let i=0;i<8;i++){ window.scrollBy(0,600); await new Promise(r=>setTimeout(r,350)); }
// 此时可见 tab: 网站·N / 对外投资·N / 集团成员·N
```
网站/邮箱提取（**两步都做，缺一不可**）：
```javascript
// ① 公司联系方式区（邮箱/官网/电话/地址的真正来源，★必须先抓★）
//   位置: 页面"公司联系方式"区块, 特征: "官网--"/"官网 www.xxx"/"邮箱a@b.c"/"电话--"/"地址..."
//   无论 网站·N 是否为 null 都必须执行本步!
var all = document.body.innerText;
var ci = all.indexOf('公司联系方式');
//   官网: /官网\s*([\w.-]+\.(?:com|cn|net|org)(?:\.[a-z]{2,})?)/ 或 "官网--"=无
//   邮箱: all.match(/[\w.-]+@[\w.-]+\.\w+/g) 排除 .png/.jpg/.51nb/xiaolanben
//   电话/地址: "电话--"=无, "地址xxx" 原文
//   新媒体: "新媒体·N" 附近抓公众号名+ID, 存 media:[{name,id}]

// ② 网站 tab（域名）
// 点"网站·N"tab 后
var pane = document.getElementById('pane-website');
var links = pane.querySelectorAll('a');  // {text, href}
// 邮箱: text.match(/[\w.-]+@[\w.-]+\.\w+/g) 排除 .png/.jpg/.51nb
```
⚠️ 关键判断:
- 官网字段 = `--` 或缺失 → website=null（**不是没查到, 是真没有**, 落库 null 勿编造）
- 官网指向母行域名(如子公司官网=www.bankyellowriver.com) → website=母行域名, 并在 body 备注 parent_website=true
- 邮箱/新媒体从 ① 联系方式区抓, ② 网站 tab 抓不到邮箱是正常的(邮箱不在那)
- **每家子公司都必须产出: website(或null) + emails(数组, 可空) + media(数组, 可空)**, 三个字段缺一不可

## Phase 4 提取对外投资子公司

```javascript
// 点"对外投资·N"tab → 列表每页6条 → 底部"查看更多"展开全部
// 全文档抓取含"持股"的链接：
document.querySelectorAll('a[href*="/company/"]') → text 含"持股"
// 解析: name / ratio(text.match(/持股\s*([\d.]+)%/)) / cid(href.match(/\/company\/([a-z0-9]+)/))
// 规则: ratio ≥ 51 进入递归, < 51 跳过
```

## Phase 5 递归遍历 ≥51% 子公司（子孙公司收集核心）

```
for each 子公司 where ratio >= 51:
  navigate_page(company_url, initScript)   ← 必须 new_page 新标签或复用预热标签，禁止导航平台页
  读基本信息+邮箱+对外投资（孙公司）
  检查孙公司是否 ≥51%（递归）
  ⚠️ 每查完一家立即写 JSON（对话附件/项目黑板），防断连丢数据！
```

## 数据持久化铁律

```
每完成一个 Phase，立即把结果 JSON 保存（对话附件上传 或 upsert_project_fact）。
永远别指望 Chrome 会话不会断！
```

## 🟢 落库规范（供应链页面数据源, 2026-08-07 生效）

> 平台「供应链」页面从项目事实图渲染: category=company 的 fact = 公司节点,
> edge_type=contains 的边 = 持股(母→子)。**不按此规范落库 = 供应链页面看不到数据**。
>
> ⚠️ **供应链 vs 股权穿透 (2026-08-13 用户拍板)**: 「供应链」页的公司卡片 = **有供应链
> 来源证据的灰度资产**(招投标信息/互联网搜索/系统/其他媒介), **不是股权穿透子孙公司**。
> - 股权穿透的子孙公司(本 skill 流程): company fact **不带 source 字段** → 供应链页**不显示**,
>   由「股权穿透」页展示
> - 供应链收集(FOFA 证书反查 supply-chain-collect / WebSearch 供应商搜索 / 招投标公告):
>   company fact body **必须带 source + evidence + reason 三件套** → 供应链页显示并展示证据链
> - body.source 取值: 招投标/bid / 搜索/search / 系统/system / 媒介/media / 证书/cert / 供应商/supplier
> - body.evidence = 出处 URL 或原文片段; body.reason = 认定它是供应链公司的理由
> - 供应链页卡片证据链渲染: 认定理由 + 证据 + 出处(箭头→链接可点)
> 前提: 会话必须先绑定项目(PUT /api/conversations/{id}/project), 否则项目黑板工具报
> "当前对话未绑定项目"授权拒绝。

**公司节点**（每家公司, 含根公司）:
```
POST /api/projects/{pid}/facts
{"fact_key": "company/<cid>", "category": "company", "summary": "<公司名>",
 "body": "{\"name\":\"<公司名>\",\"ratio\":<持股%>,\"legal\":\"<法人>\",\"city\":\"<城市>\",
          \"creditCode\":\"<信用代码>\",\"regcap\":\"<注册资本>\",\"esdate\":\"<成立>\",
          \"status\":\"<状态>\",\"stockCode\":\"<代码>\",\"shareholder\":\"<股东>\",
          \"website\":\"<官网域名如 www.example-group.com, 无则 null>\",\"domains\":[\"<额外域名>\"],
          \"emails\":[\"<联系方式区邮箱, 无则 []>\"],\"media\":[{\"name\":\"<公众号名>\",\"id\":\"<公众号ID>\"}]}",
 "confidence": "confirmed"}
```
⚠️ fact_key 只允许字母数字 . _ / -（**冒号 : 非法会 400**）。
💡 **供应链公司额外三件套**（仅供应链来源的公司, 股权子孙公司不填）:
   `"source": "招投标|搜索|系统|媒介|证书|供应商"` + `"evidence": "<出处URL/原文>"` + `"reason": "<认定理由>"`
   例: {"name":"XX物流","source":"招投标","evidence":"https://ggzy.xxx.com/notice/123","reason":"中标该集团物流运输服务"}
💡 **body 必填三件套**: website(无则 null) + emails(数组, 可空) + media(数组, 可空)——
  邮箱/新媒体从**公司联系方式区**抓(Phase 3 步骤①), 不是网站 tab; 子公司官网指向母行域名时
  website 填母行域名并加 `"parent_website": true`。没有官网填 null, **不要编造域名**。

**持股边**（根→子 每条）:
```
POST /api/projects/{pid}/fact-edges
{"source_fact_key": "company/<母公司cid>", "target_fact_key": "company/<子公司cid>",
 "edge_type": "contains", "confidence": "confirmed"}
```

**融资/邮箱/ICP**（各自一条 fact, category 分类, body 用 list）:
```
fact_key: "financing/<root-cid>"  category: financing  body: {"list":[{date,round,amount,investors}]}
fact_key: "contacts/<root-cid>"   category: contacts   body: {"list":["a@b.com"]}
fact_key: "icp/<域名>"            category: icp        body: {"icp":"沪ICP备XXX号","subject":"主办单位"}
```

**域名资产**（直接进资产库, 供应链页资产区自动显示）:
```
POST /api/assets/import
{"assets":[{"domain":"<域名>","project_id":"<pid>","source":"xiaolanben"}], "source":"xiaolanben"}
DNS 结果用 source="dns"; 备案号查到后给资产加 tag "icp:<备案号>"(PUT /api/assets/{id} 需带 domain)
```

## Phase 6 生成 xlsx 报告

```
python D:\app\chana\chana\recon\_xiaolanben_report.py --input <data.json>
→ 输出 xlsx（3 sheets: 股权树🟣 / 域名明细🔵 / 汇总统计🟢）
```

**JSON 格式**（喂给 _xiaolanben_report.py）：
```json
{
  "report_name": "...", "root": "母公司名", "date": "2026-08-06",
  "source": "小蓝本 sou.xiaolanben.com",
  "root_info": {"group": "所属集团", "shareholder": "股东"},
  "levels": [
    {"level": 0, "companies": [{"name", "cid", "ratio", "domains":[{"url","source"}], "emails":[], "asset_scale", "children":[]}]},
    {"level": 1, "companies": [...]},
    {"level": 2, "companies": [{"name", "parent": "由XX全资", ...}]}
  ]
}
```

## 已知限制
1. 集团成员不显示持股比例，不作递归依据
2. "网站·null" = 无独立网站, 但 **必须**抓公司联系方式区(Phase 3 步骤①)拿邮箱/新媒体;
   官网字段 `--` = 确实无官网, 落库 null 勿编造; 官网指向母行域名时填母行域名+parent_website=true
3. 投资型/SPV 公司基本无独立域名
4. 连续2层无新域名可提前终止
5. 小蓝本需浏览器登录态（sou.xiaolanben.com 已登录账号）
6. **每家子公司产出三件套**: website(null可) + emails(数组) + media(数组) — 缺字段=采集不完整, 需补查
