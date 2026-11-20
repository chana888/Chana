# JS 人工分析 — 自己读代码挖攻击面（核心能力，非工具）

工具提取(js_api_extract)只给路径。**值钱的是人工读 JS**：懂接口语义、找密钥、逆向加密、推导逻辑漏洞。这一步不能省。

## 1. 定位业务 JS（跳过框架库）
```
webpack chunks: 主业务包(非 vue/react/axios 库) — app.js / 业务模块 chunk / api 封装文件
source map: .js.map 存在 → 还原源码(fetch 拿 map 或浏览器 Source 面板)
顺序: 入口 → 路由 → api 封装 → 页面组件
```

## 2. 读接口封装层（最值钱）
```
找: axios/ajax/fetch 封装 → baseURL + 全部接口定义
    api.js / request.js / services/ / 接口常量对象
关键: 页面未调用的接口也在代码里 = 隐藏攻击面
提取: 路径+方法+参数结构 → 逐个测未授权/越权(直接打, 不走页面)
```

## 3. 找密钥/硬编码（直接利用面）
```
RSA/AES/SM2 公钥 → 加密逻辑绕过/伪造
secret/appid/signKey/加盐 → 伪造签名
内网地址/数据库串/OSS密钥 → 直连内网
实例: hnuu app.js 泄露 RSA+SM2 配置 → token 构造面
```

## 4. 读加密逻辑（登录/token）
```
密码: RSA(公钥+padding) / AES(密钥来源) / MD5+SALT → 构造合法密文
token: 时间戳?随机?固定TAG? → 可预测/重放
实例: 联奕 initPass token=RSA(TAG+时间戳), ts 可预测
```

## 5. 看鉴权方式
```
token 存哪: cookie / localStorage / 自定义 header
硬编码 token / admin 账号在 JS 里?
JWT payload: role/admin 字段 → 篡改? 密钥爆破(toolchain.md)
```

## 6. 分析路由/功能
```
Vue Router 路由表 → 菜单外的隐藏页面(直接访问)
多步流程: 订单/审批/支付各步接口 → 状态机跳跃(logic.md)
```

## 7. 动态调试（Blueprint MCP）
```
browser_evaluate: 改代码 / hook ajax / 读运行时变量
localStorage 注入绕过前端守卫 → frontend-bypass-methodology
```

→ 返回 S2: {接口清单+语义, 密钥, 加密逻辑, 鉴权, 隐藏页面}
