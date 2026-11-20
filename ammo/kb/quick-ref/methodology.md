# 测试方法论秒杀卡 — S1 起手式 (≤50行)

## 新目标 S1 强制三步骤

```
S1a (30秒) 指纹识别
  → 浏览器打开首页 → 读title/响应头/Cookie/JS特征
  → 查 fingerprints-nday.md → 命中直接打N-Day → 未命中进S1b

S1b (3分钟) 路径发现 (curl, 不开浏览器)
  → 40标配路径 + dirsearch + 框架已知路径
  → Swagger/Druid/Actuator/源码泄露 优先
  → 与 S1a 并行, 不卡住

S1c (30秒) 信号收集
  → Quick-Ref卡片逐个秒杀: SQL/XSS/SSRF/IDOR/Upload/Auth
  → 每参数一击 → 命中记录信号 → 未命中跳过
```

## 参数→漏洞速查表 (更多见 _index.md)
| 参数语义 | 参数名特征 | 优先测 | Quick-Ref卡 |
|----------|----------|-------|-------------|
| 排序字段 | sort/order/orderBy/order[] | ORDER BY SQL注入 | `sqli.md` |
| 搜索关键词 | keyword/search/query/q/key | SQL注入, XSS | `sqli.md` |
| ID类 | id/uid/userId/orderId/fileId | SQL注入, 越权 | `idor.md` |
| 文件名/路径 | file/path/url/dir/template | 路径穿越, LFI | `ssrf.md` |
| URL/链接 | url/link/callback/redirect | SSRF | `ssrf.md` |
| 金额/数量 | price/amount/quantity/points | 业务逻辑 | `auth.md` |
| 上传 | upload/import/avatar/file | 任意文件上传 | `upload.md` |
| 认证 | login/register/send-code/resetPwd | 验证码绕过/爆破 | `auth.md` |

## 纯登录框 → 入口太窄快速退出
```
登录框
  ├── 无验证码 → 3发弱口令 + 3发SQL注入 → 无→退出
  ├── 有验证码 → 跳过, 直接信息收集
  ├── 有忘记密码/注册 → 各测3发
  └── 全无 → "入口太窄, 换个资产"
```

## 门户站点 (新闻公告)
```
无登录框 → 指纹优先 → 搜索框测SQL → URL参数测注入 → 隐藏路径/.git
  → 全无 → 直接放弃, 不死磕
```
