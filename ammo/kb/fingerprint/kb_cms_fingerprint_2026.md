---
name: kb_cms_fingerprint_2026
description: CMS 主流产品精准指纹卡—WordPress/Drupal/Joomla/织梦/帝国CMS/PHPCMS/苹果CMS 五维指纹(响应头/cookie/默认路径/HTML特征/icon)+FOFA语法+主动确认+攻击指引
metadata:
  node_type: knowledge
  type: reference
  modified: 2026-08-13
---

# CMS 主流产品精准指纹卡 (2026版)

> 定位：**从零精准识别** CMS → 命中即查 POC 直打
> 利用侧: `srcwiki_poc/CMS漏洞/`(302篇) + `srcwiki_poc/cms漏洞/`(206篇) + `srcwiki_poc/Web应用漏洞/`(345篇)
> 判定铁律：**主动确认后再定性**（模板定制/伪 CMS 常伪造登录页）

---

## 一、WordPress（全球占比最大）

### 被动指纹
- **默认路径**：`/wp-login.php` `/wp-admin/` `/wp-content/` `/wp-includes/` `/wp-json/`
- **响应头**：`X-Pingback: <url>/xmlrpc.php`（极高确认，默认开启）
- **Set-Cookie**：`wordpress_test_cookie`（登录页）
- **HTML 特征**：`<link rel="pingback"` / `wp-content/themes/` / `generator` meta 含 WordPress
- **版本**：`/wp-includes/` 或 `?ver=` 参数泄露；`/feed/` RSD

### FOFA
```
app="WordPress"
body="wp-content" && body="wp-includes"
header="X-Pingback"
```

### 主动确认
```
GET /wp-login.php  → 200 WordPress 登录页
GET /wp-json/  → 200 REST API（未授权信息面）
GET /readme.html  → 版本泄露
```

### 攻击指引
插件/主题 N-day（GravityForms 等）、xmlrpc 爆破/SSRF、REST 未授权 → `srcwiki_poc/CMS漏洞/` grep WordPress

---

## 二、Drupal

### 被动指纹
- **默认路径**：`/sites/default/` `/core/` `/user/login` `/node/` `/admin/`
- **响应头**：`X-Generator: Drupal x`（老版本）`X-Drupal-Cache`
- **Set-Cookie**：`SESSxxxx` / `SSESSxxxx`（Drupal 会话前缀）
- **HTML 特征**：`<meta name="Generator" content="Drupal"` / `/sites/default/files/`

### FOFA
```
app="Drupal"
body="sites/default" && body="drupal"
header="X-Drupal"
```

### 主动确认
```
GET /user/login  → Drupal 登录（无 Drupalgeddon 特征提示）
GET /CHANGELOG.txt  → 版本泄露（老版本）
GET /core/CHANGELOG.txt  → 版本
```

### 攻击指引
Drupalgeddon RCE（老版本）/ 反序列化（CVE-2018-7600 系列）/ 插件 → `srcwiki_poc/CMS漏洞/` grep Drupal

---

## 三、Joomla

### 被动指纹
- **默认路径**：`/index.php?option=com_xxx` `/administrator/` `/templates/` `/media/`
- **HTML 特征**：`<meta name="generator" content="Joomla!` / `com_` 组件参数 / `/templates/` 主题
- **Set-Cookie**：`j4share` / 或默认 session（PHP）
- **版本**：`/administrator/manifests/files/joomla.xml` / `/templates/` 版权

### FOFA
```
app="Joomla"
body="com_" && body="joomla"
body="generator" content="Joomla"
```

### 主动确认
```
GET /administrator/  → Joomla 后台登录
GET /index.php?option=com_users  → 组件面
```

### 攻击指引
组件 SQL 注入 / 模板 RCE / 后台弱口令 → `srcwiki_poc/CMS漏洞/` grep Joomla

---

## 四、织梦 DedeCMS

### 被动指纹
- **默认路径**：`/dede/`（后台）`/plus/` `/uploads/` `/data/` `/include/` `/templets/`
- **HTML 特征**：`DedeCMS` 版权、`Powered by DedeCMS`、`/plus/` 动态、`templets` 模板路径
- **报错特征**：`DedeCMS Error:` / `dedecms` 字样
- **后台**：`/dede/login.php` `/dede/index.php`

### FOFA
```
app="DedeCMS"
body="DedeCMS" && body="dede"
body="Powered by DedeCMS"
```

### 主动确认
```
GET /dede/login.php  → 织梦后台
GET /plus/search.php?keyword=1  → 搜索面
GET /data/mysqli_error_trace.inc  → 数据库痕迹
```

### 攻击指引
plus SQL 注入（search/member）/ 任意文件上传 / 后台模板 getshell → `srcwiki_poc/CMS漏洞/` grep 织梦

---

## 五、帝国 CMS（EmpireCMS）

### 被动指纹
- **默认路径**：`/e/admin/`（后台）`/e/` `/e/tags/` `/e/data/` `/e/member/`
- **HTML 特征**：`EmpireCMS`、`Powered by EmpireCMS`、`/e/tags/` `/e/public/` 路径
- **版权**：`帝国网站管理系统`

### FOFA
```
app="EmpireCMS"
body="EmpireCMS"
body="e/tags" && body="empire"
```

### 主动确认
```
GET /e/admin/index.php  → 帝国后台
GET /e/search/index.php  → 搜索面
GET /e/memberlogin/  → 会员登录
```

### 攻击指引
后台 SQL 注入 / /e/ 文件上传 / 模板注入 → `srcwiki_poc/CMS漏洞/` grep 帝国

---

## 六、PHPCMS

### 被动指纹
- **默认路径**：`/index.php?m=content` `/phpcms/` `/uploadfile/` `/api/`
- **HTML 特征**：`phpcms` 资源路径、`Powered by PHPCMS`、`/index.php?m=` 模式（老版）
- **后台**：`/admin.php` `/index.php?m=admin`

### FOFA
```
app="PHPCMS"
body="phpcms" && body="index.php?m="
body="Powered by PHPCMS"
```

### 主动确认
```
GET /index.php?m=content&c=index  → PHPCMS 内容面
GET /admin.php  → 后台入口
```

### 攻击指引
SQL 注入（老版本多）/ 文件上传 / 后台 → `srcwiki_poc/CMS漏洞/` grep PHPCMS

---

## 七、苹果 CMS（MacCMS）

### 被动指纹
- **默认路径**：`/index.php/vod/` `/index.php/art/` `/template/` `/tpl/` `/upload/`
- **HTML 特征**：`MacCMS`、`maccms`、`MacCms.V8` 版权、`/index.php/vod/` URL 模式
- **后台**：`/admin.php` `/index.php/admin/`

### FOFA
```
app="MACCMS"
body="maccms" || body="MacCMS"
body="index.php/vod"
```

### 主动确认
```
GET /index.php/vod/type/id/1.html  → MacCMS 视频页
GET /admin.php  → 后台
```

### 攻击指引
后台 SQL 注入 / 模板 getshell / 采集插件 → `srcwiki_poc/CMS漏洞/` grep 苹果CMS / maccms

---

## CMS 命中决策树

```
1. X-Pingback / wp-json / wp-content  → WordPress（插件打天下）
2. /sites/default + X-Drupal-Cache     → Drupal（Drupalgeddon/反序列化）
3. ?option=com_ + /administrator        → Joomla（组件注入）
4. /dede/ /plus/ /data/                 → 织梦（SQLi/上传）
5. /e/ /e/admin/                        → 帝国（SQLi/模板）
6. /index.php?m= /admin.php             → PHPCMS
7. /index.php/vod/ /template/           → 苹果CMS
→ 主动确认 → srcwiki_poc/CMS漏洞/_index.md 取 POC
→ 中文老 CMS 优先试 SQL 注入/上传，国外 CMS 优先插件 N-day/未授权
→ 返回 S2: {厂商+版本?, 置信度?, POC列表?}
```
