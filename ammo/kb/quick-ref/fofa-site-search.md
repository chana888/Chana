# 站点搜索语法秒杀卡 (≤50行)

> FOFA 为主 + Google/鹰图/Shodan 补充，S1 资产测绘用，命中即打

## 一、域名/证书反查
```
FOFA: domain="target.edu.cn"                  # 该域全部子域资产
FOFA: cert.subject.cn="*.target.edu.cn"       # 同证书(旁站/CDN后源站)
FOFA: cert.subject.org="XX大学"               # 同机构全部证书
Google: site:target.edu.cn
```

## 二、同指纹找同类站点（N-day 批打）
```
FOFA: app="DedeCMS" && country="CN"
FOFA: body="/seeyon" && country="CN"          # 致远 OA
FOFA: body="rememberMe=deleteMe"              # Shiro
FOFA: body="Whitelabel Error Page"            # SpringBoot
FOFA: icon_hash="<目标favicon哈希>"           # favicon 同源资产
```

## 三、敏感暴露
```
FOFA: port="9200" && body="cluster_name"      # ES未授权
FOFA: protocol="redis" && banner="redis_version"  # Redis未授权
FOFA: title="index of /" && body=".git"       # .git泄露
FOFA: title="index of" && body=".sql"         # SQL备份泄露
FOFA: body="phpinfo()"                        # phpinfo
```

## 四、组件秒杀
```
Fastjson:  body="fastjson" || header="fastjson"
Shiro:     header="rememberMe=deleteMe"
Spring:    header="X-Application-Context"
Nacos:     port="8848" && body="Nacos"
ThinkPHP:  body="/index.php?s="
Swagger:   body="swagger-ui"
Druid:     body="Druid Monitor"
Actuator:  body="actuator"                   # 路径 /actuator/env
```

## 五、后台/编辑器
```
FOFA: title="后台管理" && app="<产品名>"       # 后台入口
FOFA: body="kindeditor"                        # 编辑器上传面
Google: site:x inurl:upload/editor             # 编辑器目录
```

## 六、鹰图/Shodan
```
鹰图:  web.title="xxx"  web.body="xxx"  app="xxx"
Shodan: http.title:"index of /"   port:6379   http.html:"swagger"
```

## 实战串联
```
拿目标 → 提取指纹(icon_hash/标题/Server头) → FOFA反查同类 → 批量打N-day
icon: FOFA目标页复制icon_hash → search icon_hash="xxx"
```
