---
name: kb_oa_systems_fingerprint_2026
description: OA 系统 8 厂商精准指纹卡—泛微/致远/用友/蓝凌/通达/万户/金蝶/帆软 五维指纹(响应头/报错/默认路径/HTML特征/icon)+FOFA语法+主动确认+攻击指引
metadata:
  node_type: knowledge
  type: reference
  modified: 2026-08-13
---

# OA 系统 8 厂商精准指纹卡 (2026版)

> 定位：**从零精准识别** OA 厂商 → 命中即查 POC 直打
> 利用侧: `techniques/kb_oa_systems_poc_2026.md` + `srcwiki_poc/OA系统漏洞/`(291篇) + `srcwiki_poc/OA产品漏洞/`(121篇)
> 骨架: `memory/skeletons/oa-systems.md`（多厂商攻击链）
> 判定铁律：**主动确认后再定性**（避免后台模板/自定义皮肤误报）

---

## 一、泛微 e-cology / e-office

### 被动指纹
- **默认路径**：`/weaver/` `/weaver/ecology8/` `/api/` `/wui/` `/rest/ofs/` `/mobile/`
- **报错特征**：`weaver` / `ecology` 类名、`/weaver/theme/` CSS 路径
- **HTML 特征**：登录页含 `e-cology`、`泛微`、`ecology` 字样；`/js/ecology8/` 静态资源
- **Set-Cookie**：`JSESSIONID` + `/weaver/` 路径

### FOFA
```
app="泛微-EM3" || app="泛微OA-e-cology" || app="泛微OA-e-office"
body="ecology8" && body="weaver"
body="/wui/index.html"
```

### 主动确认
```
GET /weaver/commons/req.jsp HTTP/1.1  → 存在 ecology 环境
GET /api/ec/dev/auth/regist  → 200 注册接口
```

### 攻击指引
BshServlet RCE / KtreeUploadAction 上传 / /api/ 未授权 / 反序列化 → `srcwiki_poc/OA系统漏洞/` grep 泛微

---

## 二、致远 OA A8 / A6（seeyon）

### 被动指纹
- **默认路径**：`/seeyon/` `/seeyon/main.do` `/seeyon/personalBind.do` `/wpsAssistServlet`
- **HTML 特征**：登录页标题 `致远OA` / `A8`、`/seeyon/js/` 静态资源、`seeyon` 关键字遍布 JS
- **Set-Cookie**：`JSESSIONID`（无特别标志，靠路径和 JS 特征）

### FOFA
```
app="致远OA-A8" || app="致远OA-A6"
body="seeyon" && body="/seeyon/"
body="致远OA协同管理平台"  # 部分中文站
```

### 主动确认
```
GET /seeyon/index.jsp  → 200 致远入口
GET /seeyon/main.do  → 302/200 后台入口
GET /seeyon/htmlofficeservlet  → 经典入口（部分版本存在）
```

### 攻击指引
CVE-2025-34040 wpsAssistServlet 上传 / htmlofficeservlet 反序列化 / 文件上传 / getSessionList 越权 → `srcwiki_poc/OA系统漏洞/` grep 致远

---

## 三、用友 NC / NC Cloud / U8 / GRP-U8

### 被动指纹
- **默认路径**：`/nc/` `/nc/servlet/nc.ui.iufo.web.ReportEngineServlet` `/ServiceDispatcherServlet` `/servlet/~uapws/` `/fs/`
- **报错特征**：`nc.bs.*` / `NCCloud` / `ufida` 类名、`/uap/` 资源
- **端口**：常 80/8080（NC）/ 7001 偶见；ERP 后台 `~uapws` 路径
- **HTML 特征**：登录页含 `用友`、`NC Cloud`、`uap`、`ufida` 版权

### FOFA
```
app="用友-NC" || app="用友-U8" || app="用友-NC-Cloud"
body="/nc/" && body="ufida"
body="ufida.nerp"  # NCCloud
```

### 主动确认
```
GET /nc/servlet/nc.ui.iufo.web.ReportEngineServlet  → 错误响应（存在 NC）
GET /ServiceDispatcherServlet  → 用友组件
GET /servlet/~uapws/soap  → WebService 面
```

### 攻击指引
NCCloudGatewayServlet RCE / NC 反序列化 / uploadServlet 上传 / sqlmap → `srcwiki_poc/OA产品漏洞/` grep 用友（已盘点 271 篇）

---

## 四、蓝凌 OA（Landray）

### 被动指纹
- **默认路径**：`/sys/ui/extend/varkind/` `/sys/ui/extend/varkind.jsp` `/data/` `/ui/`
- **HTML 特征**：`landray` 关键字、`/sys/ui/` 资源、登录页含 `蓝凌`
- **报错特征**：`landray.kmss.*` 类名

### FOFA
```
app="Landray-OA系统"
body="sys/ui/extend/varkind"
body="kmss" && body="landray"
```

### 主动确认
```
GET /sys/ui/extend/varkind.jsp  → 存在 varkind（上传链入口）
GET /data/sys-common/treexml.rpc  → RPC 接口面
```

### 攻击指引
sysUiExtend.do ZIP 上传 / sys/ui/extend/varkind 任意文件上传 / RSS 反序列化 → `srcwiki_poc/OA系统漏洞/` grep 蓝凌

---

## 五、通达 OA（Tongda / TDXK）

### 被动指纹
- **默认路径**：`/td_download.php` `/ispirit/` `/ispirit/im/upload.php` `/general/` `/pda/`
- **HTML 特征**：登录页 `通达OA`、`tdxskey`、`/static/` 资源、`OA` 底部版权
- **Set-Cookie**：`PHPSESSID`（PHP 实现）+ 通达特有 cookie

### FOFA
```
app="TDXK-通达OA"
body="tdxskey"  # 通达专用
body="/ispirit/" && body="tongda"
```

### 主动确认
```
GET /td_download.php  → 200（经典文件下载入口）
GET /ispirit/im/upload.php  → 上传入口存在
GET /general/index.php  → 后台
```

### 攻击指引
td_download.php 任意文件下载/上传 / ispirit 文件上传 RCE / include 文件包含 → `srcwiki_poc/OA系统漏洞/` grep 通达

---

## 六、万户 OA（ezOFFICE）

### 被动指纹
- **默认路径**：`/defaultroot/` `/defaultroot/main.jsp` `/zh_CN/`
- **HTML 特征**：`ezOFFICE`、`万户网络`、`/defaultroot/` 路径、`whir` 关键字
- **报错特征**：`whir.*` / `com.whir.*` 类名

### FOFA
```
app="万户网络-ezOFFICE"
body="/defaultroot/" && body="whir"
body="万户网络"
```

### 主动确认
```
GET /defaultroot/main.jsp  → 200 万户后台
GET /defaultroot/zh_CN/index.jsp  → 中文化界面
```

### 攻击指引
SQL 注入（listSubTreeAction 等）/ 文件上传 / 越权 → `srcwiki_poc/OA系统漏洞/` grep 万户

---

## 七、金蝶 OA（EAS / K3 / 云之家）

### 被动指纹
- **默认路径**：`/eas/` `/easportal/` `/kingdee/` `/k3cloud/` `/api/`
- **HTML 特征**：`金蝶`、`Kingdee`、`/easportal/`、`k3cloud` 版权
- **端口**：EAS 常 8000/8080/7001

### FOFA
```
app="Kingdee-EAS" || app="金蝶K3Cloud"
body="/easportal/" && body="kingdee"
body="kingdee" && body="eas"
```

### 主动确认
```
GET /easportal/index.jsp  → 金蝶 EAS 入口
GET /k3cloud/  → K3Cloud
GET /kingdee/  → 门户
```

### 攻击指引
EAS 反序列化 / K3Cloud 接口未授权 / 门户越权 → `srcwiki_poc/OA产品漏洞/` grep 金蝶

---

## 八、帆软 FineReport / FineBI

### 被动指纹
- **默认路径**：`/WebReport/` `/webroot/decision` `/reportserver` `/decision/`
- **HTML 特征**：`FineReport`、`帆软`、`/WebReport/ReportServer`、`finereport.js`
- **报错特征**：`fr.` / `com.fr.` 类名

### FOFA
```
app="帆软-FineReport" || app="帆软-FineBI"
body="down.download?FM_SYS_ID"     # 帆软经典特征
body="WebReport/ReportServer" && body="fr_"
body="/decision/" && body="finebi"
```

### 主动确认
```
GET /WebReport/ReportServer  → 200/500 帆软报告服务
GET /reportserver?op=fs_load&cmd=fsbip&token=  → 未授权命令执行点
GET /decision  → FineBI
```

### 攻击指引
未授权命令执行（`/WebReport/ReportServer?op=fr_jsload` 系列）/ 任意文件读取 / 反序列化 → `srcwiki_poc/OA系统漏洞/` grep 帆软

---

## OA 命中决策树

```
登录页/默认路径 → 匹配上表任一厂商
  → 主动确认（默认路径 + FOFA 复核）
  → 查 srcwiki_poc/{OA系统漏洞|OA产品漏洞}/_index.md 取 POC
  → techniques/kb_oa_systems_poc_2026.md 按厂商拿利用接口
  → 快速链（优先未授权/上传/反序列化，跳过弱口令爆破前先试默认口令）
  → 返回 S2: {厂商+版本?, 置信度?, POC列表?}
```
