# API 暴露秒杀卡 — Swagger/Druid/Actuator (≤50行)

## 发现即高危
看到 Swagger/Druid/Actuator 裸奔 → 不恋战，快速提取利用链。

## Swagger 攻击链
```
GET /v2/api-docs 或 /v3/api-docs
  ↓ 提取所有接口+参数+Schema
  ↓ 找: 注册(register)/登录(login)/导出(export)/上传(upload)/重置密码(resetPwd)
  ↓ 无认证直接调 → 越权
  ↓ 有认证 → 注册新号 → 带token遍历 userId
```

## Druid 攻击链
```
GET /druid/index.html
  ├── datasource.html → DB连接串+用户名
  ├── weburi.html → 所有API调用记录(谁调了什么)
  ├── websession.html → 在线用户IP+Session
  └── sql.html → 慢SQL/错误SQL暴露表结构
  组合利用: DB连接串 → SSRF打RDS / Session列表 → 社工
```

## Actuator 攻击链
```
GET /actuator → 端点列表
  ├── /actuator/env → 数据库密码/密钥
  ├── /actuator/heapdump → 内存中token+密码
  └── /actuator/mappings → 所有路由+Controller
```

## 返回 S2
{泄露规模?, 未认证接口数, DB连接串?, 在线用户数?, 可组合利用?}
