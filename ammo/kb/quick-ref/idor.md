# IDOR 越权秒杀卡 (≤50行)

## 一击流程
```
1. 找到带 userId/orderId/fileId/comId 的请求
2. +1/-1 遍历 → 看响应是否返回他人数据
3. 无认证请求 → 换 Token/删 Token → 看是否能访问
```

## 越权面识别
| 接口类型 | 优先测 |
|---------|--------|
| `/user/detail/{id}` | 遍历获取他人信息 |
| `/user/detail/{id}/phonenumber` | 手机号泄露 |
| `/user/detail/{id}/wechat` | 微信号泄露 |
| `/user/export` | 批量导出 |
| `/order/detail/{id}` | 订单信息越权 |
| `/file/download/{id}` | 文件越权下载 |

## 测试要点
- 删掉 Authorization header → 看是否 401
- 替换 Token 为其他用户 → 看是否报权限错
- 批量子路径(/phonenumber, /wechat) 单独测
- 返回 S2: {哪些接口越权?, 泄露字段?, 可否批量遍历?}
