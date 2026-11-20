# 认证/短信接口秒杀卡 (≤50行)

## 一击流程
```
登录框:
├── 无验证码 → 爆破 admin/admin123, admin/123456
├── 有忘记密码 → 任意密码重置
├── 有注册入口 → 注册新号 → 登录后越权
└── 看 JS/源码 → 隐藏API路径

短信接口:
├── send-code 无认证 → 短信轰炸
├── send-code 无频率限制 → 无限发送
├── 验证码可爆破(4-6位纯数字)
└── 验证码在响应中返回 → 前端绕过
```

## 注册绕过
```
注册接口无认证:
→ 看 Swagger → RegisterBody 参数
→ 多传 status: "0" / role: "admin" → 提权注册
→ 返回 500 参数错误(非401) → 可注册
→ 审核机制 → SMS登录/微信登录绕过
```

## 爆破字典（固定路径，用即抄）
```
弱口令:  dicts/10k-most-common.txt (1万) + dicts/variants.txt (3758)
JWT:     python tools/jwt_tool/jwt_tool.py <JWT> -C -d tools/jwt_tool/jwt-secrets-full.txt
```

→ 返回 S2: {验证码状态?, 注册无认证?, 可爆破?, 敏感参数?}
