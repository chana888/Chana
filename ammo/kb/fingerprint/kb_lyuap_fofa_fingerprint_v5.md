---
name: kb-lyuap-fofa-fingerprint-v5
description: 联奕LYUAP V5.0.20190101微服务认证管理平台 FOFA指纹——app.js构建哈希87423d8421f5d30c9bde/css哈希ac297a8a9505d50495c840b716954a56/JS内容搜版本
metadata: 
  node_type: memory
  type: reference
  originSessionId: aee0221c-c1b2-47d9-aea7-fea7c478d43b
  modified: 2026-08-11T12:53:00.787Z
---

# 联奕 LYUAP V5.0.20190101 FOFA 指纹（华农 cas.scau.edu.cn 实采 2026-08-11）

**产品**: 联奕「微服务认证管理平台」(LY-IAP / lyuapServer)，`version:"V5.0.20190101"`（appId:license 配置项，同 JS 里有 title:"微服务认证管理平台"）
**版权**: 联奕科技版权所有 粤ICP备12037813号-2 / `Copyright © 2014-2018 TECHNOLOGY CO.,LTD. All Rights Reserved. 版本号(`
**架构**: webpack Vue SPA，HTML body 不含 lyuapServer 字样，只在 JS bundle 出现(API: /lyuapServer/kaptcha、/lyuapServer/login/passError、/lyuapServer/openoauth/dd/authCallback、/lyuapServer/otpBindState)

## 版本标识
- 构建哈希(最强): JS `app.87423d8421f5d30c9bde.js` / CSS `app.ac297a8a9505d50495c840b716954a56.css` / vendor JS `vendor.3d4bf790c231928bfb32.js`
- 页面特征: `/assets/js/gohome.js`、`/color.less`、`window.isEnableAssistant`、Ukey 组件(mTokenPlugin / id_mPluginV2Router)

## FOFA 语法（同版本）
- 精确同构建: `body="87423d8421f5d30c9bde"` 或 `js_name="app.87423d8421f5d30c9bde.js"`
- 双哈希交叉: `body="87423d8421f5d30c9bde" && body="ac297a8a9505d50495c840b716954a56"`
- 同产品版本(JS内容搜): `js="V5.0.20190101" && js="lyuapServer"` 或 `js="微服务认证管理平台"`
- 剔SPA干扰: 加 `&& body="gohome.js"`
- 注意: V5.0.20190101 的 HTML 不含 lyuapServer，`body="lyuapServer"` 会漏此版本，产品级指纹必须用 `js="lyuapServer"`

## 已知攻击链（关联）
[[project-sjziei-lyiap-20260811]] — authority/roles 越权读 admin、/zuul/docrepo/download 无认证下载、GATEWAY_KEY:lianyi2019 CSRF
[[project-scau-vpn-dib-internal-control-20260811]] — 华农 dep 内控同厂商
