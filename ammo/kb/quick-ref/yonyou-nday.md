# 用友 N-Day 秒杀卡 (≤50行)

> FOFA 找站点 → 命中产品线 → 对应 POC 直打
> POC 位置: `tools/knowledge_base/srcwiki_poc/OA系统漏洞/{id}.md`

## 一、站点搜索语法（FOFA）

```
# 通用聚合（用友全系 ufida 资源）
body="ufida"
body="/nc/" && body="ufida"              # NC 老版
body="nccloud" && body="ufida"           # NC Cloud
app="用友-NC"  app="用友-NC-Cloud"       # FOFA 标准库
app="用友-U8"  app="用友-U8-Cloud"
app="用友-GRP-U8"                        # 政府财务
app="畅捷通-TPlus"  body="/tplus/"
app="用友-FE"                            # FE协作平台
icon_hash="<用友favicon哈希>"            # 同源反查
```

## 二、命中后 POC 直打（按危害排序）

### ① RCE（最高危）
```
NC BshServlet 命令执行        4505  ~webapps/nc_web/.../BshServlet
NC registerServlet JNDI      4512  (XVE-2024-10248)
NC 反序列化                  4494  (NC6.5) / 4503 Xbrl / 4501 ConfigResourceServlet
NC pagesServlet SQLi→RCE     4511
```

### ② 任意文件上传（getshell）
```
NC importhttpscer 上传        4499
NC grouptemplet 上传          4507
NC saveImageServlet 上传      4514  (XVE-2024-7471)
NC saveXmlToFileServlet      4515
NC 前台任意文件上传           4516
NC 6.5 文件上传               4495
```

### ③ 任意文件读取（读源码/配置）
```
NC NCFindWeb 任意读           4502
NC downCourseWare 任意读      4506
NC IPsndocExportToCrmService 4509
FE templateOfTaohong 目录遍历  4487
```

### ④ SQL 注入（批量 dump）
```
NC Cloud FS文件管理 SQLi      4497
NC Cloud getStaffInfo SQLi    4498
NC Cloud runscript SQLi       4500
NC bill / open / ActionServlet 4504/4510/4496
NC importPml / runStateServlet 4508/4513
GRP-U8 六个注入点             4488/4489/4490/4491/4492/4493
```

## 三、判定链
```
FOFA 命中 ufida/nc 特征 → 确认产品线(NC/Cloud/GRP/U8)
→ 先试 RCE(4505/4512) → 再试上传(4499/4507) → 无则 SQLi dump
→ 返回 S2: {产品线+版本?, N-Day列表?, POC命中?}
```
