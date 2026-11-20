---
name: kb-frontend-miniprogram-audit
description: 前端JS审计与小程序审计专项纵深手册：源码获取(source map/webpack分包)、API端点挖掘、硬编码密钥(AK/SK/签名secret)、前端加密签名绕过(AES/MD5/RSA还原)、Hook调试、wxapkg反编译与解密、wx加密数据解密(session_key)、云开发云函数越权、CDN/SDK供应链、Burp插件/Frida/autojs工具链。全部命令可直接运行。
tags: [前端审计, JS逆向, 小程序审计, sourcemap, webpack, hook, frida, wxapkg, 云函数, 供应链]
date: 2026-08-14
---

# 前端 JS 审计与小程序审计实战手册

> 读者画像：黑盒渗透熟练（SQLi/越权/WAF 绕过），会用 Burp，但未系统做过「从打包产物反推业务接口与密钥」的前端/小程序专项。本手册目标：拿到一个前端站或小程序后，30 分钟内还原出完整接口面 + 密钥 + 加密逻辑，并定位可黑盒验证的高危链路。
> 与后端白盒手册互补：`kb_code_audit_source_2026.md` 管后端 jar/源码，本手册管**浏览器侧一切可执行代码**。App 抓包细节见 `kb_mobile_app_pentest_2026.md`，npm/CI 供应链见 `kb_supply_chain_cicd_2026.md`。

## §0 总纲：审计主线与判定门槛

```
前端审计主线 = 源码获取 → 接口面还原 → 密钥/签名挖掘 → 加密逻辑还原 → 篡改重放
小程序主线   = 拿 wxapkg → 反编译 → app.json/云函数/接口 → 抓包解密 → 越权验证
```
- **核心心智**：前端代码没有秘密。压缩 ≠ 加密，字符串常量在 minify 后原样保留（`sk_live_`/`AKIA`/`ghp_` 前缀照旧）。
- **判定门槛（写报告最低要求）**：
  1. 硬编码密钥必须能利用才构成漏洞（AK/SK 能调云资源、JWT secret 能伪造 admin token、AES key 能解密请求/响应明文），仅"存在"不算。
  2. 前端校验绕过必须证明后端同样未校验（前端过滤 ≠ 后端校验，改包直发接口验证）。
  3. 越权必须读改到真实他人数据，能稳定复现。
  4. 加密算法还原需能生成合法 sign/加密请求并被服务端接受（用 DNSLog/实际请求验证）。
- **效率铁律**：source map / .env / .git 三个入口 1 分钟内可测完，命中即白盒模式全开；不命中转黑盒功能测试。

## §1 JS 源码审计

### 1.1 源码获取：source map / 打包产物 / webpack 分包

**三步探测（0-60 秒）**——直接 append `.map`、探测 .env/.git：
```bash
# 1) 探测 source map：DevTools Sources 能看到 src/ 目录即已泄露；或直接抓包看 main.js 尾部
curl -s https://target/static/js/app.abc123.js | tail -5 | grep -i "sourceMappingURL"
# 2) 探测 .map 文件是否存在（200 即命中）
curl -s -o /dev/null -w "%{http_code}\n" "https://target/static/js/app.abc123.js.map"
# 3) 探测 .git / .env 泄露（命中=源码全量可下载）
curl -s -o /dev/null -w "git:%{http_code}\n" https://target/.git/HEAD
curl -s -o /dev/null -w "env:%{http_code}\n" https://target/.env
```

**用 .map 还原完整源码**（reconstruct 成可读文件树）：
```bash
npm i -g sourcemap-fixer source-map-unpacker
# 手工还原单文件：拆开 sourcesContent
python - <<'PY'
import json,base64,os,sys
m=json.load(open(sys.argv[1],encoding='utf-8'))   # 载入 .map
for s,c in zip(m.get('sources',[]),m.get('sourcesContent',[])):
    if c: os.makedirs(os.path.dirname(s) or '.',exist_ok=True); open(s,'w',encoding='utf-8').write(c)
PY
app.abc123.js.map   # 还原出原始 src/ 目录

# 自动拉全站 chunk 并还原（webpack/vite/next 分包自动枚举，实验性）
python3 getfrontend.py https://target/login -o out/
# 工具: https://github.com/zb3/getfrontend —— 从入口静态分析枚举所有 chunk，即使无 sourceMappingURL
```

**无 map 时的手工恢复**：DevTools 右下角 `{}` Pretty-print；webpack chunk 只含登录页 → 用 `getfrontend` 或手工猜 chunk 名（`0.xxxx.js`/`vendors~main.js`）；依赖路径在 `webpackJsonp` 回调的模块表里。

### 1.2 API 端点挖掘（fetch/axios/XHR 正则 + 工具链）

**正则秒扫**（对已还原源码或压缩 bundle）：
```bash
# 抓回全部 JS 后本地扫
cat js/*.js | grep -oE "['\"\`](/api|/v[0-9]|/admin|/user|/order|/export)[a-zA-Z0-9_/{}:.?=&-]*['\"\`]" | sort -u > urls.txt
# 匹配完整路径（含 axios 请求、ajax url 赋值）
cat js/*.js | grep -oE "(url|action|path|href)[:=]\s*['\"\`][^'\"\`]{4,}['\"\`]" | sort -u
```

**一键工具链（推荐顺序）**：
```bash
# LinkFinder（Python，对单 JS/整站）
python3 linkfinder.py -i https://target/static/js/app.js -o cli
# URLFinder（更新活跃，替代 JSFinder）
urlfinder -u https://target -o urls.txt   # 自动爬 + 提取 API/子域/敏感词
# JSFinder 旧版（深爬 + 子域）
python3 JSFinder.py -u https://target -d -ou urls.txt -os subs.txt -c "session=xxx"
# 配合 ffuf 爆破更多 JS 文件，再对每个新 JS 重扫
ffuf -u https://target/static/js/FUZZ.js -w jsnames.txt -mc 200
```

**Burp 插件（被动收集最省事）**：
- `BurpJSLinkFinder`（rv0p111）：Extender → Add → 选 jar（需 Jython），浏览站点时自动提取 JS 内链接，Intruder/Repeater 跟进。
- `BurpAPIFinder`：自动访问提取到的路径，直接标出未授权/越权接口与 AK/SK。
- 技巧：Burp → Target → Tree 复制本 host 全部 URL → `python3 JSFinder.py -f text.txt` 二次深挖。

### 1.3 硬编码密钥（AK/SK / 加密 key / 签名 secret / .env）

**bundle 内扫密钥**：
```bash
# SecretFinder（正则引擎，专扫前端 JS）
python3 SecretFinder.py -i https://target/static/js/app.js -o cli --grep "AKIA|AIza|sk_live|ghp_|-----BEGIN|jwt|secret|appsecret"
# 已还原源码后用 trufflehog / gitleaks 全量扫（含 git 历史）
trufflehog filesystem --directory=out/ --results=verified,unknown
gitleaks detect --source=out/ -v
# 常见前缀速查：AWS AKIA… / GCP AIza… / Stripe sk_live_… / GitHub ghp_… / 微信 appsecret(32hex) / 阿里 LTAI…
```

**.env / 环境变量前缀泄露**（构建期被内联进 bundle 的是常态）：
```bash
# Vite 暴露所有 VITE_*，CRA 暴露 REACT_APP_*，Next 暴露 NEXT_PUBLIC_* —— 前缀变量全进客户端
cat js/*.js | grep -oE "(VITE_|REACT_APP_|NEXT_PUBLIC_|NUXT_PUBLIC_)[A-Z0-9_]{3,}" | sort -u
# 直连测 .env 静态服务泄露（2024 勒索活动主力路径）
curl -s https://target/.env
curl -s https://target/.git/config && curl -s "https://target/.git/logs/HEAD"
```

**判定门槛**：`AK/SK` 需验证可调云资源（如阿里 `sts.aliyuncs.com` 换取临时凭证）；JWT secret 需实际伪造出高权限 token 并请求成功；密钥无法验证利用价值的一律只记 P2 不报。

### 1.4 前端加密/签名逻辑绕过（算法还原 + 参数篡改）

**核心流程：XHR 断点 → Hook 定位 → 抠函数 → 复现**：
```bash
# DevTools 操作（无法用命令行，列操作步骤）
# 1) Sources → XHR/fetch breakpoints → 加接口 path（如 /search）断住
# 2) 看 Call Stack 回溯到加密函数，Scope 看 key/iv/salt
# 3) 搜全局: sign|encrypt|md5|rsaEncrypt|getTimestamp|_token
# 4) Pretty-print 后断点单步，console.trace() 打模块来源
```

**Hook 拦截明文/密文（Tampermonkey 注入，浏览器常驻）**：
```js
// Hook JSON.stringify：抓请求对象明文 → 调用栈指向加密入口
(function(){
  const orig = JSON.stringify;
  JSON.stringify = function(obj){
    if (String(obj).includes('password')||String(obj).includes('sign')) {
      console.log('[REQ]', obj); console.trace();   // 打明文 + 调用栈
    }
    return orig.apply(this, arguments);
  };
})();
// Hook JSON.parse：抓响应解密前密文，回溯 AES 解密函数与 key/iv
(function(){ const orig=JSON.parse;
  JSON.parse=function(t){ if(typeof t==='string'&&t.length>200){console.log('[RESP-CIPHER]',t); console.trace();} return orig.call(this,t);};
})();
// Hook window 级加密函数（记录入参/出参）
function hook(name){const o=window[name];window[name]=function(){console.log(`[${name}]`,arguments);const r=o.apply(this,arguments);console.log(`[${name}]->`,r);return r;};}
hook('encrypt'); hook('aesEncrypt');
```

**Webpack 模块抠取复现**：DevTools 里找到 webpack loader（`_0x2bacfa` 类）和含 crypto 的模块，整段复制 → 包进自执行函数在 Node 跑：
```bash
node -e "global.window=global; $(cat extracted.js) ; console.log(global.sign({q:'x'}))"
```

**Python 复现 AES+MD5 签名（某翻译站实战）**：
```python
import hashlib, base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
# sign = MD5(固定key串 + query)[:16]，再作 AES-ECB 密钥
key16 = hashlib.md5(("6key_web_new_fanyi"+ query).encode()).hexdigest()[:16]
cipher = AES.new(key16.encode(), AES.MODE_ECB)
sign = base64.b64encode(cipher.encrypt(pad(query.encode(), 16))).decode()
```
**RSA 请求体 + AES 响应**：DevTools 搜 JSEncrypt 公钥（n/e）→ `python rsa` 复现加密；响应 AES 的 key/iv 从 `JSON.parse` Hook 栈里提取。
**篡改利用**：加密只防篡改 ≠ 鉴权。重放合法 sign 改业务参数（id/amount/status），服务端验 sign 通过但业务逻辑越权，才是真漏洞。

### 1.5 业务逻辑漏洞（前端校验绕过 / 越权参数）

- **前端只做校验的绕过**：前端限制"只能看自己的订单" → 改包 `id=他人单号` 直发，后端不校验归属即越权。判定：**前端过滤 ≠ 后端校验**，必须重放真实请求确认。
- **禁用按钮/隐藏接口**：`disabled` 属性和 `v-if` 隐藏只是 UI，直接调接口即可。
- **排序/分页参数注入**：`order[column]`、`page[size]` 默认补测 ORDER BY SQL 注入（同后端 `kb_sqli_*` 系列）。

## §2 前端调试与流量

### 2.1 Chrome DevTools 技巧
- **全局搜索**：`Ctrl+Shift+F` 在全部已加载 JS 搜 `sign`/`secret`/`token`/`api`。
- **Local Overrides**：Sources → Overrides 可改本地 JS 持久生效，改完直接测"前端校验被删"后的行为。
- **Network 过滤**：`-i` 只看 XHR/fetch；`initiator` 列点开即定位发请求的代码行。
- **HAR 导出**：右键 → Save all as HAR，供脚本化解析。

### 2.2 Hook（原型链 hook）
```js
// 通用 XHR 拦截（记录所有请求 URL/方法/明文 body）
(function(){
  const o = XMLHttpRequest.prototype.open, s = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ this.__u=u; this.__m=m; return o.apply(this,arguments); };
  XMLHttpRequest.prototype.send = function(b){ console.log('[XHR]',this.__m,this.__u,b); return s.apply(this,arguments); };
})();
// 拦截 fetch
const of=window.fetch; window.fetch=function(u,o){console.log('[FETCH]',u,o&&o.body);return of.apply(this,arguments);};
```
- 目标做过 `Function.prototype.toString` 检测 / `debugger` 反调试：DevTools 设置里勾选 "Disable JavaScript" 的相反面（Deactivate breakpoints `Ctrl+F8`），或改写 `debugger;` 语句跳过。
- 前端加固检测（UA 指纹、混淆）严重时，用 `jsreverser-mcp` 类工具自动 hook 入参/出参/调用栈。

### 2.3 whistle / Fiddler 抓包
```bash
# whistle（node 起本地代理，规则即时生效，最适合前端调试）
npm i -g whistle && w2 start   # 默认 127.0.0.1:8899
# 浏览器配代理 127.0.0.1:8899；脚本化注入规则：
w2 add 'www.target.com/ injectAppend://data:text/plain,;base64,'   # 见文档，或 GUI 写 js 注入
```
- **Fiddler 核心**：解密 HTTPS 需装 Fiddler CA；`Tools → HTTPS → Decrypt HTTPS traffic`；过滤 `chrome` host 可看前端 WebSocket/EventSource。
- **移动端/小程序抓包**：走代理 + 系统证书，见 §4（Frida/证书校验）。

### 2.4 前端鉴权绕过（localStorage token 伪造 / 守卫清除）
```js
// 伪造/注入 token（先看真实 token 结构再伪造）
localStorage.setItem('token','eyJhbGciOi...');   // JWT 可直接解 header/payload 改 role=admin
// Vue 路由守卫绕过：守卫只挡页面渲染，直接 fetch API 即绕过
// 若前端有 role 判断，DevTools 直接改 store：$vm.$store.state.user.role='admin'
```
- **判定门槛**：改前端状态后接口返回他人数据/管理员功能 = 后端未鉴权，真漏洞；仅页面显示变化 = 不构成。
- Vue/React 守卫逻辑分析详见 `vue-frontend-bypass` skill 与 `frontend-bypass-methodology.md`。

## §3 小程序审计

### 3.1 反编译：拿 wxapkg → 解密 → 还原
```bash
# ① 获取 wxapkg（PC 微信，先点遍各页面生成缓存）
# 微信 4.0+ 路径: C:\Users\<user>\AppData\Roaming\Tencent\xwechat\radium\Applet\wx*\<appid>\__APP__.wxapkg
# 旧版:  WeChat Files\Applet\wx*\__APP__.wxapkg（分包为 sub*.wxapkg）

# ② 解密（UnpackMiniApp.exe 或 node 脚本；新版本 wxapkg 加了头部 salt）
node unpack.js 输入.wxapkg   # 输出 wxpack/ 目录，提示"无需解密"=未加密

# ③ 反编译还原源码（wxappUnpacker）
git clone https://github.com/Ryan-Miao/wxappUnpacker.git && cd wxappUnpacker
npm install && npm i esprima css-tree cssbeautify vm2 uglify-es js-beautify
node wuWxapkg.js 主包.wxapkg                # 主包
node wuWxapkg.js 分包.wxapkg -s=主包目录      # 分包需指定主包
# 输出：app.json / app.js / pages/*.wxml wxss js / 云函数源码（若打进去）
```
**常见坑**：`this package is a subPackage` → 补 `-s`；`_typeof3 is not a function` → 开发者工具取消勾选"编译成 ES5"；无 app.json 输出 = 做了反编译防护，换手机端 root 拉包或用 pc hook 方案。

### 3.2 app.json 配置分析（接口面入口）
```bash
# 攻击面 = pages（所有页面路由）+ subpackages（分包=敏感功能）+ permission（scope 申请）
cat app.json | python -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(d['pages']+[p for s in d.get('subpackages',[]) for p in s.get('pages',[])]))"
# 全局逻辑 app.js：看 request 封装（baseURL/sign/header），定位统一请求入口
cat app.js | grep -oE "https?://[a-zA-Z0-9._/-]+|baseURL|sign|secret" | sort -u
```

### 3.3 API 端点挖掘（小程序版）
- 对反编译出的 `utils/request.js`（常封装 wx.request/wx.cloud.callFunction）建索引，抓所有接口路径。
- 抓包定位真实后端：PC 微信小程序流量走微信进程，需 Frida hook 或 r0capture（§4）。
- `wx.cloud.callFunction({name:'login',data:{...}})` 指向云函数，**函数源码不在包里**，接口面从云函数名+调用参数反推。

### 3.4 wx 加密数据解密（session_key / iv / encryptedData）
> 场景：小程序拿 `encryptedData` 手机号/运动数据解密。核心：**session_key 只能服务端拿**（`wx.login` code → jscode2session），前端不存在。
```python
# 服务端 AES-128-CBC + PKCS7 解密（Python 版）
from Crypto.Cipher import AES
import base64
def decrypt(session_key, iv, encrypted_data):
    key = base64.b64decode(session_key)                    # 16 字节
    cipher = AES.new(key, AES.MODE_CBC, base64.b64decode(iv))
    plain = cipher.decrypt(base64.b64decode(encrypted_data))
    data = plain[: -plain[-1]]                              # PKCS7 去填充
    import json; d = json.loads(data)
    assert d['watermark']['appid'] == '目标appid'           # 必校验水印防跨app冒充
    return d
# 攻击关注点：encryptedData 由客户端上传，若服务端未校验 openid 与 session_key 是否该用户本人
# → 可尝试换绑/重放他人 encryptedData 实现"伪用户"（结合登录态越权）
```
**常见坑**：`+` 号被 URL 编码吃掉导致解密失败（请求体传输时 `+`→`%2B`）；iv 与 encryptedData 混用不同请求；解密必须校验 `watermark.appid`，否则攻击者用别的 appid 的密文绕过。

### 3.5 云开发云函数漏洞（越权重灾区）
- **云函数权限模型**：云函数初始化 `cloud.init({env})` 后**以管理员权限直连数据库，跳过安全规则**。只要函数内部没做 `getWXContext().OPENID` 归属校验，就是裸后门。
- **审计清单**：
  1. 全量搜 `wx.cloud.callFunction` 调用点 → 列出云函数名与入参。
  2. 云函数源码里查 `db.collection(...)` 的 where 条件是否含 OPENID 归属（`_openid` 字段）。
  3. 查安全规则（云开发控制台/`database.rules.json`）：`{"read":true,"write":true}` 或 `{"read":"auth != null"}` = 任何人读写。
  4. 查云函数是否对 `data` 里的 `_id`/`userId` 做归属校验 → 无校验=水平越权。
- **NoSQL 注入**：`db.collection('user').where(${e.id})` 之类拼接 → 构造 `{"$gt":""}` 拖全表：
```js
// 注入 where 查询（如果云函数把 data 直接拼进 where）
wx.cloud.callFunction({ name:'getData', data:{ id: { $gt: '' } } })  // 返回全部记录
```
- **验证样本**：改 `id` 参数读他人订单/手机号；遍历弱 `_id`（自增/时间戳）批量爬表。真实案例：某省医保小程序 27 分钟从无授权访问拖到患者就诊记录。

### 3.6 小游戏 / 插件供应链
- 小游戏包（`wxgame` 目录）含 JS/WASM/Unity 导出，反编译后找支付/广告 SDK 配置与内购逻辑（金额/回调验签）。
- 第三方插件（`plugin://`）与分包容易引入未更新组件；查插件请求地址与密钥。
- 供应链视角：小程序依赖的 CDN/云函数模板若来自第三方，存在同 polyfill.io 的投毒风险（§5）。

## §4 App 接口审计衔接（抓包绕过 / Frida / 接口枚举）

> 完整 App 流程见 `kb_mobile_app_pentest_2026.md`，此处只列与前端/小程序衔接的关键命令。

```bash
# ① 系统证书 + Frida 绕过 SSL Pinning（root 模拟器/真机）
adb root && adb remount
openssl x509 -inform DER -subject_hash_old -in burp.cer | head -1   # 取证书 hash
cp burp.cer <hash>.0 && adb push <hash>.0 /system/etc/security/cacerts/
# ② objection 一键 unpinning
pip3 install objection && objection -g 包名 explore
# 进入后执行: android sslpinning disable
# ③ 全局通杀抓包（无视加固/OkHttp/WebSocket/Protobuf）
# 起 frida-server 后: r0capture.py 输出 pcap → Wireshark 分析
python3 r0capture.py -U -f 包名 -v -p 微信流量.pcap
# ④ Frida 自写 hook（拦截 OkHttp 明文）
# frida -U -f 包名 -l hook.js
Java.perform(function(){
  var B=Java.use('okhttp3.Request$Builder');   // 混淆后按 OpenSSLSocketFactoryImpl 调用栈定位
  B.build.implementation=function(){ console.log('[REQ]', this.toString()); return this.build(); };
});
```
- **坑**：混淆 App 直接按原始类名 hook 失效 → hook `OpenSSLSocketFactoryImpl.createSocket` 的调用栈定位真实 `CertificatePinner`；双向校验需逆向找客户端证书(pkcs12+密码)导入代理。

## §5 前端供应链（CDN 投毒 / 第三方 SDK）

- **polyfill.io 事件（2024.6 域名易主投毒，影响 10 万+ 站点）**：恶意 JS 按 UA/地区/时间条件触发，重定向赌博/钓鱼站，Hulu/Atlassian 中招。**审计点**：站点 `script src` 外链是否无 SRI、是否 `@latest` 引用、域名 WHOIS 是否近期变动。
- **Lottie Player npm 事件（2024.10）**：钓鱼 npm token 投毒 `@lottiefiles/lottie-player@2.0.5-2.0.7`，钱包盗刷；CDN 缓存放大传播。**审计点**：前端引第三方包是否锁定版本 + SRI。
- **审计命令**：
```bash
# 抓首页/所有页面 HTML，提取外链 script 检查 SRI
curl -s https://target/ | grep -oE '<script[^>]*src="[^"]+"[^>]*>' | grep -v "integrity="
# 检查 @latest 引用
curl -s https://target/ | grep -oE '/(unpkg|cdn.jsdelivr|cdnjs)\.net/[^"]+@latest[^"]*'
# npm 依赖树审计（本地还原前端工程时）
npm audit --json; npm i -g osv-scanner && osv-scanner -r package-lock.json
```
- **判定门槛**：外部脚本缺 SRI + 高危域名 + 无 CSP 限制 = P2 供应链面；能证明实际被投毒/利用才报 P1。
- **防护侧验证**：检查响应头 `Content-Security-Policy` 的 `script-src` 是否白名单，无 CSP = 供应链放大面。

## §6 工具链速查表与真实案例

| 场景 | 工具 | 一句话用法 |
|------|------|-----------|
| JS 接口提取 | LinkFinder / URLFinder / JSFinder | `linkfinder.py -i <js>` / `urlfinder -u <url>` |
| 密钥扫描 | SecretFinder / trufflehog / gitleaks | 对已还原源码/打包产物跑正则 |
| source map 还原 | getfrontend / source-map-unpacker | 自动枚举 chunk + 还原 src/ |
| Burp 插件 | BurpJSLinkFinder / BurpAPIFinder / HaE | 被动扫 JS 链接 / 自动访问找越权 / 标记敏感信息 |
| 反混淆 | obfuscator-io-deobfuscator / anti-js-ob / REstringer / ArachneJS | 控制流平坦化 + 字符串数组还原 |
| 抓包 | whistle / Fiddler / Burp | 前端调试代理 / HTTPS 解密 |
| Hook | Tampermonkey / jsreverser-mcp | JSON.stringify/parse 拦截、XHR 记录 |
| 小程序反编译 | UnpackMiniApp + wxappUnpacker | 解密 wxapkg → 还原源码 |
| 小程序抓包 | Frida + r0capture / objection | 绕过 SSL Pinning 全局通杀 |
| App hook | Frida / Objection | `android sslpinning disable`、OkHttp 明文 |
| 自动化 | AutoJS（AutoJs6 活跃版） | 无障碍服务 UI 自动化，辅助批量操作测试 |

**真实案例链**：
1. JWT secret 硬编码在 React bundle → 伪造 HS256 admin token → 全站接管（`JavaScript-JWT-and-the-Key-That-Shouldnt-Exist`）。
2. source map 泄露 → 还原出 `/api/__admin` 无鉴权接口 → 未授权访问（2024.7 账户接管案例）。
3. 某省医保小程序：wxapkg 反编译 → 定位云函数 → 改 id 越权拖到患者就诊记录，27 分钟全链路。
4. `.env` 静态服务泄露（2024 云勒索事件 140 万+ 文件）→ AK 直调云资源横向移动。

## Sources
- Source map 泄露与 .git 暴露: https://vibe-eval.com/patterns/source-maps-and-git-exposed/ ; https://domainoptic.com/blog/source-maps-production-security-risk/
- getfrontend（SPA chunk+map 还原）: https://github.com/zb3/getfrontend
- JS 逆向 sign/加密绕过: https://developer.aliyun.com/article/1559474 ; https://xz.aliyun.com/news/18630
- JWT 密钥泄露案例: https://github.com/AdityaBhatt3010/JavaScript-JWT-and-the-Key-That-Shouldnt-Exist
- 小程序反编译教程: https://www.52pojie.cn/thread-2061802-1-3.html ; https://blog.gitcode.com/6919ff2ba8f3275f79a1facb36929c21.html
- 微信加密数据解密: https://doc.minapp.com/1.x/js-sdk/wechat-decrypt.html ; https://developers.weixin.qq.com/miniprogram/dev/api/open-api/user-info/wx.getUserProfile.html
- 云开发安全与云函数越权: https://blog.csdn.net/weixin_42376192/article/details/159043410 ; https://blog.csdn.net/weixin_30768925/article/details/161277495
- Frida/SSL Pinning 绕过: https://blog.csdn.net/qq_33530840/article/details/144078507 ; https://blog.gitcode.com/29add7760dccc17930f3d904ccb025c1.html
- polyfill.io 供应链攻击: https://safeguard.sh/resources/blog/polyfill-io-supply-chain-attack-anatomy ; https://cside.com/blog/polyfill-io-supply-chain-attack-timeline
- Lottie Player npm 攻击: https://safeguard.sh/resources/blog/lottie-player-npm-supply-chain-attack
- JS 反混淆工具: https://github.com/sibyllinesoft/arachne ; https://github.com/HumanSecurity/restringer ; https://github.com/Wker666/anti-js-ob
- JS 接口提取工具: https://github.com/Threezh1/JSFinder ; https://github.com/pingc0y/URLFinder ; https://github.com/rv0p111/BurpJSLinkFinder
- .env 泄露与前端密钥: https://www.legba.app/blog/exposed-secrets-api-keys-ai-era ; https://randomchaos.us/articles/one-grep-full-repo-access/
- AutoJS: https://blog.csdn.net/linux/article/details/154517075
