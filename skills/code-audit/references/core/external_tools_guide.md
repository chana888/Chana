# External Security Tools Integration Guide

> 外部安全工具集成指南 - 借鉴 DeepAudit external_tools.py 的工具编排策略
> 覆盖: Semgrep, Bandit, Gosec, npm audit, Gitleaks, Trivy 等专业工具

---

## Overview

外部安全工具是代码审计的重要补充，它们提供：
1. **经过验证的规则库** - 社区维护，持续更新
2. **更低的误报率** - 专业团队调优
3. **更快的扫描速度** - 优化的检测引擎
4. **覆盖盲区** - 检测人工审计容易遗漏的模式

```
┌─────────────────────────────────────────────────────────────────┐
│                   Tools Priority Strategy                        │
│                                                                 │
│  第一层: 专业SAST工具 (Semgrep, Bandit, Gosec)                   │
│      ↓                                                          │
│  第二层: 依赖漏洞扫描 (npm audit, pip-audit, OWASP DC)           │
│      ↓                                                          │
│  第三层: 密钥泄露检测 (Gitleaks, TruffleHog)                     │
│      ↓                                                          │
│  第四层: 容器/IaC扫描 (Trivy, Checkov, Hadolint)                │
│      ↓                                                          │
│  第五层: 人工审计 (Read + Grep + 领域知识)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Semgrep - 多语言SAST工具

### 简介

Semgrep 是一个快速、开源的静态分析工具，支持 30+ 语言，拥有 2000+ 社区规则。

### 安装

```bash
# macOS / Linux
pip install semgrep
# 或
brew install semgrep

# 验证安装
semgrep --version
```

### 基础用法

```bash
# 使用默认规则扫描当前目录
semgrep scan --config auto

# 使用特定规则集
semgrep scan --config p/security-audit
semgrep scan --config p/owasp-top-ten
semgrep scan --config p/ci

# 扫描特定语言
semgrep scan --config p/python --lang python

# 输出JSON格式
semgrep scan --config auto --json > results.json
```

### 推荐规则集

| 规则集 | 用途 | 命令 |
|--------|------|------|
| `p/security-audit` | 通用安全审计 | `--config p/security-audit` |
| `p/owasp-top-ten` | OWASP Top 10 | `--config p/owasp-top-ten` |
| `p/sql-injection` | SQL注入专项 | `--config p/sql-injection` |
| `p/xss` | XSS专项 | `--config p/xss` |
| `p/secrets` | 密钥泄露 | `--config p/secrets` |
| `p/java` | Java安全 | `--config p/java` |
| `p/python` | Python安全 | `--config p/python` |
| `p/javascript` | JavaScript安全 | `--config p/javascript` |
| `p/go` | Go安全 | `--config p/go` |
| `p/php` | PHP安全 | `--config p/php` |

### 自定义规则示例

```yaml
# custom-rules.yaml
rules:
  - id: hardcoded-password
    pattern: password = "$PASSWORD"
    message: "Hardcoded password detected"
    severity: ERROR
    languages: [python, java, javascript]

  - id: sql-injection-format
    patterns:
      - pattern: |
          $QUERY = f"... {$VAR} ..."
          $CURSOR.execute($QUERY)
    message: "Potential SQL injection via f-string"
    severity: ERROR
    languages: [python]

  - id: dangerous-exec
    pattern-either:
      - pattern: exec($USER_INPUT)
      - pattern: eval($USER_INPUT)
    message: "Dangerous code execution with user input"
    severity: ERROR
    languages: [python]
```

```bash
# 使用自定义规则
semgrep scan --config custom-rules.yaml
```

### 集成到审计流程

```bash
#!/bin/bash
# semgrep-audit.sh - Semgrep 自动化审计脚本

PROJECT_DIR=$1
OUTPUT_DIR=${2:-./semgrep-results}

mkdir -p $OUTPUT_DIR

echo "[*] Running Semgrep security audit..."

# 1. 通用安全扫描
semgrep scan $PROJECT_DIR \
    --config p/security-audit \
    --json > $OUTPUT_DIR/security-audit.json

# 2. OWASP Top 10
semgrep scan $PROJECT_DIR \
    --config p/owasp-top-ten \
    --json > $OUTPUT_DIR/owasp.json

# 3. 密钥泄露
semgrep scan $PROJECT_DIR \
    --config p/secrets \
    --json > $OUTPUT_DIR/secrets.json

# 4. 合并结果
echo "[*] Scan complete. Results saved to $OUTPUT_DIR"

# 统计发现
echo "[*] Summary:"
jq '.results | length' $OUTPUT_DIR/security-audit.json
jq '.results | group_by(.extra.severity) | map({severity: .[0].extra.severity, count: length})' $OUTPUT_DIR/security-audit.json
```

### 结果解析

```python
# parse_semgrep.py - 解析Semgrep结果
import json

def parse_semgrep_results(json_file):
    with open(json_file) as f:
        data = json.load(f)

    findings = []
    for result in data.get('results', []):
        finding = {
            'rule_id': result['check_id'],
            'message': result['extra']['message'],
            'severity': result['extra']['severity'],
            'file': result['path'],
            'line': result['start']['line'],
            'code': result['extra']['lines'],
        }
        findings.append(finding)

    # 按严重程度排序
    severity_order = {'ERROR': 0, 'WARNING': 1, 'INFO': 2}
    findings.sort(key=lambda x: severity_order.get(x['severity'], 3))

    return findings

# 使用
findings = parse_semgrep_results('results.json')
for f in findings:
    print(f"[{f['severity']}] {f['file']}:{f['line']} - {f['rule_id']}")
```

---

## 2. Bandit - Python安全扫描

### 简介

Bandit 是 Python 代码的安全静态分析工具，专门检测常见安全问题。

### 安装

```bash
pip install bandit

# 验证
bandit --version
```

### 基础用法

```bash
# 扫描目录
bandit -r ./src

# 指定严重程度
bandit -r ./src -ll  # 只显示 medium 及以上

# 输出格式
bandit -r ./src -f json -o bandit-results.json
bandit -r ./src -f html -o bandit-report.html

# 排除测试目录
bandit -r ./src --exclude ./src/tests

# 显示详细信息
bandit -r ./src -v
```

### 检测规则 (Plugins)

| 规则ID | 名称 | 风险等级 |
|--------|------|----------|
| B101 | assert_used | Low |
| B102 | exec_used | Medium |
| B103 | set_bad_file_permissions | Medium |
| B104 | hardcoded_bind_all_interfaces | Medium |
| B105 | hardcoded_password_string | Low |
| B106 | hardcoded_password_funcarg | Low |
| B107 | hardcoded_password_default | Low |
| B108 | hardcoded_tmp_directory | Medium |
| B110 | try_except_pass | Low |
| B112 | try_except_continue | Low |
| B201 | flask_debug_true | High |
| B301 | pickle | Medium |
| B302 | marshal | Medium |
| B303 | md5 | Medium |
| B304 | des | High |
| B305 | cipher | High |
| B306 | mktemp_q | Medium |
| B307 | eval | Medium |
| B308 | mark_safe | Medium |
| B310 | urllib_urlopen | Medium |
| B311 | random | Low |
| B312 | telnetlib | High |
| B313 | xml_bad_cElementTree | Medium |
| B314 | xml_bad_ElementTree | Medium |
| B315 | xml_bad_expatreader | Medium |
| B316 | xml_bad_expatbuilder | Medium |
| B317 | xml_bad_sax | Medium |
| B318 | xml_bad_minidom | Medium |
| B319 | xml_bad_pulldom | Medium |
| B320 | xml_bad_etree | Medium |
| B321 | ftplib | High |
| B323 | unverified_context | Medium |
| B324 | hashlib_insecure_functions | Medium |
| B501 | request_with_no_cert_validation | High |
| B502 | ssl_with_bad_version | High |
| B503 | ssl_with_bad_defaults | Medium |
| B504 | ssl_with_no_version | Medium |
| B505 | weak_cryptographic_key | High |
| B506 | yaml_load | Medium |
| B507 | ssh_no_host_key_verification | High |
| B601 | paramiko_calls | Medium |
| B602 | subprocess_popen_with_shell_equals_true | High |
| B603 | subprocess_without_shell_equals_true | Low |
| B604 | any_other_function_with_shell_equals_true | Medium |
| B605 | start_process_with_a_shell | High |
| B606 | start_process_with_no_shell | Low |
| B607 | start_process_with_partial_path | Low |
| B608 | hardcoded_sql_expressions | Medium |
| B609 | linux_commands_wildcard_injection | High |
| B610 | django_extra_used | Medium |
| B611 | django_rawsql_used | Medium |
| B701 | jinja2_autoescape_false | High |
| B702 | use_of_mako_templates | Medium |
| B703 | django_mark_safe | Medium |

### 自定义配置

```yaml
# .bandit.yaml
skips:
  - B101  # 跳过 assert 检查
  - B311  # 跳过 random 检查 (非安全场景)

exclude_dirs:
  - tests
  - venv
  - .git

tests:
  - B201  # flask_debug_true
  - B301  # pickle
  - B602  # subprocess with shell=True
  - B608  # hardcoded SQL

# 自定义严重程度
severity: medium
confidence: medium
```

```bash
# 使用配置文件
bandit -r ./src -c .bandit.yaml
```

### 集成脚本

```bash
#!/bin/bash
# bandit-audit.sh

PROJECT_DIR=$1
OUTPUT_DIR=${2:-./bandit-results}

mkdir -p $OUTPUT_DIR

echo "[*] Running Bandit Python security scan..."

# 完整扫描
bandit -r $PROJECT_DIR \
    -f json \
    -o $OUTPUT_DIR/bandit-full.json \
    --exclude "*/tests/*,*/venv/*"

# 仅高危
bandit -r $PROJECT_DIR \
    -f json \
    -o $OUTPUT_DIR/bandit-high.json \
    -ll \
    --exclude "*/tests/*,*/venv/*"

# 生成HTML报告
bandit -r $PROJECT_DIR \
    -f html \
    -o $OUTPUT_DIR/bandit-report.html \
    --exclude "*/tests/*,*/venv/*"

echo "[*] Scan complete."

# 统计
echo "[*] High severity issues:"
jq '[.results[] | select(.issue_severity == "HIGH")] | length' $OUTPUT_DIR/bandit-full.json
```

---

## 3. Gosec - Go安全扫描

### 安装

```bash
# Go install
go install github.com/securego/gosec/v2/cmd/gosec@latest

# macOS
brew install gosec
```

### 基础用法

```bash
# 扫描当前目录
gosec ./...

# 输出JSON
gosec -fmt=json -out=results.json ./...

# 排除规则
gosec -exclude=G104 ./...

# 只检查特定规则
gosec -include=G101,G102 ./...

# 设置严重程度阈值
gosec -severity=medium ./...
```

### 检测规则

| 规则ID | 描述 | 严重程度 |
|--------|------|----------|
| G101 | 硬编码凭证 | High |
| G102 | 绑定所有接口 | Medium |
| G103 | 使用unsafe包 | Low |
| G104 | 未检查错误 | Low |
| G106 | ssh: InsecureIgnoreHostKey | Medium |
| G107 | 可能的SSRF | Medium |
| G108 | pprof暴露 | Medium |
| G109 | 整数溢出转换 | High |
| G110 | 潜在DoS (解压炸弹) | Medium |
| G201 | SQL查询格式化字符串 | Medium |
| G202 | SQL查询字符串拼接 | Medium |
| G203 | 使用template.HTML | Medium |
| G204 | 使用os/exec | Medium |
| G301 | 目录权限过宽 | Medium |
| G302 | 文件权限过宽 | Medium |
| G303 | 使用可预测的临时文件 | Medium |
| G304 | 文件路径包含污点 | Medium |
| G305 | Zip Slip | High |
| G306 | 写入权限过宽 | Medium |
| G307 | defer关闭文件错误 | Medium |
| G401 | 使用MD5 | Medium |
| G402 | TLS配置不安全 | High |
| G403 | RSA密钥过小 | Medium |
| G404 | 使用math/rand | Medium |
| G501 | 导入黑名单 crypto/md5 | Medium |
| G502 | 导入黑名单 crypto/des | Medium |
| G503 | 导入黑名单 crypto/rc4 | Medium |
| G504 | 导入黑名单 net/http/cgi | Medium |
| G505 | 导入黑名单 crypto/sha1 | Medium |
| G601 | 隐式内存别名 | Medium |

---

## 4. npm audit / yarn audit - Node.js依赖扫描

### 基础用法

```bash
# npm
npm audit
npm audit --json > npm-audit.json
npm audit fix  # 自动修复

# yarn
yarn audit
yarn audit --json > yarn-audit.json

# pnpm
pnpm audit
```

### 严重程度过滤

```bash
# 只显示高危
npm audit --audit-level=high

# 生产依赖
npm audit --omit=dev
```

### 集成脚本

```bash
#!/bin/bash
# npm-security-audit.sh

echo "[*] Running npm security audit..."

# 检查是否存在 package-lock.json
if [ ! -f "package-lock.json" ]; then
    echo "[!] No package-lock.json found"
    exit 1
fi

# 运行审计
npm audit --json > npm-audit-results.json

# 解析结果
CRITICAL=$(jq '.metadata.vulnerabilities.critical // 0' npm-audit-results.json)
HIGH=$(jq '.metadata.vulnerabilities.high // 0' npm-audit-results.json)
MODERATE=$(jq '.metadata.vulnerabilities.moderate // 0' npm-audit-results.json)
LOW=$(jq '.metadata.vulnerabilities.low // 0' npm-audit-results.json)

echo "[*] Vulnerabilities found:"
echo "    Critical: $CRITICAL"
echo "    High: $HIGH"
echo "    Moderate: $MODERATE"
echo "    Low: $LOW"

# 如果有高危漏洞，返回非0退出码
if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
    echo "[!] High/Critical vulnerabilities found!"
    exit 1
fi
```

---

## 5. pip-audit / safety - Python依赖扫描

### pip-audit

```bash
# 安装
pip install pip-audit

# 扫描当前环境
pip-audit

# 扫描 requirements.txt
pip-audit -r requirements.txt

# JSON输出
pip-audit -f json -o pip-audit.json

# 修复建议
pip-audit --fix --dry-run
```

### safety

```bash
# 安装
pip install safety

# 扫描
safety check
safety check -r requirements.txt

# JSON输出
safety check --json > safety-results.json
```

---

## 6. Gitleaks - 密钥泄露检测

### 安装

```bash
# macOS
brew install gitleaks

# Go install
go install github.com/gitleaks/gitleaks/v8@latest

# Docker
docker pull ghcr.io/gitleaks/gitleaks:latest
```

### 基础用法

```bash
# 扫描目录
gitleaks detect --source . -v

# 扫描git历史
gitleaks detect --source . --log-opts="--all"

# JSON输出
gitleaks detect --source . -f json -r gitleaks-report.json

# 排除特定文件
gitleaks detect --source . --config .gitleaks.toml
```

### 自定义配置

```toml
# .gitleaks.toml
title = "Custom Gitleaks Config"

[allowlist]
paths = [
    '''tests/''',
    '''\.test\.''',
]

[[rules]]
id = "custom-api-key"
description = "Custom API Key Pattern"
regex = '''(?i)my_api_key\s*=\s*['"]([^'"]+)['"]'''
secretGroup = 1

[[rules.allowlist]]
regexes = ['''example''', '''test''', '''fake''']
```

### 预定义规则

Gitleaks 内置检测：
- AWS Access Keys
- GitHub Tokens
- Private Keys (RSA, SSH)
- Database Connection Strings
- JWT Secrets
- OAuth Tokens
- API Keys (各云厂商)
- Slack Tokens
- Stripe Keys
- 等 100+ 种密钥模式

---

## 7. Trivy - 容器/依赖扫描

### 安装

```bash
# macOS
brew install trivy

# Docker
docker pull aquasec/trivy:latest
```

### 用法

```bash
# 扫描容器镜像
trivy image python:3.11

# 扫描文件系统
trivy fs .

# 扫描代码仓库
trivy repo https://github.com/example/project

# 扫描IaC配置
trivy config ./terraform

# JSON输出
trivy fs . -f json -o trivy-results.json

# 只显示高危
trivy fs . --severity HIGH,CRITICAL
```

---

## 8. OWASP Dependency-Check - Java依赖扫描

### 安装

```bash
# 下载
wget https://github.com/jeremylong/DependencyCheck/releases/download/v8.0.0/dependency-check-8.0.0-release.zip
unzip dependency-check-8.0.0-release.zip
```

### Maven 集成

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>8.0.0</version>
    <executions>
        <execution>
            <goals>
                <goal>check</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

```bash
# 运行
mvn dependency-check:check

# 生成报告
mvn dependency-check:aggregate
```

### Gradle 集成

```groovy
// build.gradle
plugins {
    id 'org.owasp.dependencycheck' version '8.0.0'
}

dependencyCheck {
    failBuildOnCVSS = 7
    formats = ['HTML', 'JSON']
}
```

```bash
gradle dependencyCheckAnalyze
```

---

## 9. 工具编排策略

### 按语言选择

| 语言 | SAST工具 | 依赖扫描 | 密钥检测 |
|------|----------|----------|----------|
| Python | Semgrep, Bandit | pip-audit, safety | Gitleaks |
| Java | Semgrep, SpotBugs | OWASP DC, Snyk | Gitleaks |
| JavaScript | Semgrep, ESLint | npm audit, Snyk | Gitleaks |
| Go | Semgrep, Gosec | govulncheck | Gitleaks |
| PHP | Semgrep, Psalm | composer audit | Gitleaks |

### 完整审计脚本

```bash
#!/bin/bash
# full-security-audit.sh

set -e

PROJECT_DIR=${1:-.}
OUTPUT_DIR=${2:-./security-audit-results}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $OUTPUT_DIR

echo "=========================================="
echo "Security Audit - $TIMESTAMP"
echo "Project: $PROJECT_DIR"
echo "=========================================="

# 1. 密钥泄露检测 (所有项目)
echo "[1/5] Running Gitleaks..."
if command -v gitleaks &> /dev/null; then
    gitleaks detect --source $PROJECT_DIR -f json -r $OUTPUT_DIR/gitleaks.json || true
else
    echo "Gitleaks not installed, skipping..."
fi

# 2. Semgrep 通用扫描
echo "[2/5] Running Semgrep..."
if command -v semgrep &> /dev/null; then
    semgrep scan $PROJECT_DIR --config auto --json > $OUTPUT_DIR/semgrep.json || true
else
    echo "Semgrep not installed, skipping..."
fi

# 3. 语言特定扫描
echo "[3/5] Language-specific scanning..."

# Python
if [ -f "$PROJECT_DIR/requirements.txt" ] || [ -f "$PROJECT_DIR/setup.py" ]; then
    echo "  - Detected Python project"
    if command -v bandit &> /dev/null; then
        bandit -r $PROJECT_DIR -f json -o $OUTPUT_DIR/bandit.json --exclude "**/tests/**" || true
    fi
    if command -v pip-audit &> /dev/null; then
        pip-audit -r $PROJECT_DIR/requirements.txt -f json -o $OUTPUT_DIR/pip-audit.json 2>/dev/null || true
    fi
fi

# JavaScript/Node.js
if [ -f "$PROJECT_DIR/package.json" ]; then
    echo "  - Detected Node.js project"
    cd $PROJECT_DIR && npm audit --json > $OUTPUT_DIR/npm-audit.json 2>/dev/null || true
    cd -
fi

# Java
if [ -f "$PROJECT_DIR/pom.xml" ]; then
    echo "  - Detected Maven project"
    cd $PROJECT_DIR && mvn dependency-check:check -DoutputDirectory=$OUTPUT_DIR 2>/dev/null || true
    cd -
fi

# Go
if [ -f "$PROJECT_DIR/go.mod" ]; then
    echo "  - Detected Go project"
    if command -v gosec &> /dev/null; then
        gosec -fmt=json -out=$OUTPUT_DIR/gosec.json $PROJECT_DIR/... || true
    fi
fi

# 4. 容器扫描 (如果有Dockerfile)
echo "[4/5] Container scanning..."
if [ -f "$PROJECT_DIR/Dockerfile" ]; then
    if command -v trivy &> /dev/null; then
        trivy fs $PROJECT_DIR -f json -o $OUTPUT_DIR/trivy.json || true
    fi
fi

# 5. 生成摘要报告
echo "[5/5] Generating summary..."

cat > $OUTPUT_DIR/summary.md << EOF
# Security Audit Summary

**Date**: $(date)
**Project**: $PROJECT_DIR

## Tools Executed

| Tool | Status | Results |
|------|--------|---------|
EOF

for file in $OUTPUT_DIR/*.json; do
    if [ -f "$file" ]; then
        tool=$(basename $file .json)
        count=$(jq 'if type == "array" then length elif .results then .results | length elif .vulnerabilities then .vulnerabilities | length else 0 end' $file 2>/dev/null || echo "N/A")
        echo "| $tool | Done | $count findings |" >> $OUTPUT_DIR/summary.md
    fi
done

echo ""
echo "=========================================="
echo "Audit complete! Results in: $OUTPUT_DIR"
echo "=========================================="
cat $OUTPUT_DIR/summary.md
```

---

## 10. CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/security-audit

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
```

### GitLab CI

```yaml
# .gitlab-ci.yml
security_scan:
  stage: test
  image: returntocorp/semgrep
  script:
    - semgrep scan --config auto --json > semgrep-results.json
  artifacts:
    reports:
      sast: semgrep-results.json
```

---

## 11. 本机已核验工具路径（Windows, 2026-09-01）

> 以下路径均已在本机实测确认存在。命令行工具建议用完整路径调用；GUI 工具由操作者启动。

### 11.1 扫描 / 注入 / 资产

| 工具 | 路径 | 说明 |
|------|------|------|
| sqlmap | `H:\网安资料和常用渗透工具\ONE-FOX集成工具箱_V3.0魔改版_by狐狸\gui_scan\sqlmap\sqlmap.py` | 首选，用 `python <path> [args]` 运行 |
| sqlmap (备用) | `H:\网安资料和常用渗透工具\CTFTools\libdll\libdll\sqlmap\sqlmap.py` | 完整版 |
| sqlmapXplus | `H:\网安资料和常用渗透工具\CTFTools\libdll\libdll\sqlmapXplus\sqlmap.py` | 增强版 |
| nmap | `H:\网安资料和常用渗透工具\红队工具包\信息收集\网站信息收集\IP信息收集\nmap\nmap_win\nmap.exe` | 首选 |
| nmap 6.25 | `H:\网安资料和常用渗透工具\红队工具包\漏洞扫描\nmap-6.25\nmap.exe` | 备用 |
| nuclei | `H:\网安资料和常用渗透工具\ONE-FOX集成工具箱_V3.0魔改版_by狐狸\gui_scan\nuclei\nuclei.exe` | 首选；模板目录 `E:\nuclei\temp\nuclei`（当前为空） |
| nuclei (备用) | `H:\网安资料和常用渗透工具\中职网安\工具\nuclei.exe` | |
| fscan 二开免杀 (dddd) | `H:\网安资料和常用渗透工具\AI赋能红队实战-二开Fscan免杀&dddd\dddd-v4-same-as-Fscan\v4\dddd.exe` | 含 dddd_linux / dddd_macos |
| fscan (原版) | `H:\网安资料和常用渗透工具\ONE-FOX集成工具箱_V3.0魔改版_by狐狸\gui_other\Cobalt_Strike_4.7\plugin\LSTAR\scripts\IntrScan\x64\fscan.exe` | Cobalt Strike 插件内置 |
| Yakit | `E:\SEC Tools\Yakit\Yakit.exe` | 综合扫描/EXP |
| TscanPlus | `H:\TscanPlus2.8.0`（另 `H:\网安资料和常用渗透工具\TscanPlus_Win_Amd64_v2.2`）| 综合扫描 GUI |
| OneForAll | `E:\SEC Tools\Tools\OneForAll-master` | 子域收集 |
| enscan | `E:\SEC Tools\Tools\enscan-0.0.10-windows-amd64` | 内网/资产快速探测 |
| gotoscan | `E:\SEC Tools\Tools\gotoscan-master` | |
| ARL 灯塔 | `E:\SEC Tools\Tools\ARL-master` | 资产测绘（需部署） |

### 11.2 抓包 / 代理 / 流量

| 工具 | 路径 |
|------|------|
| BurpSuite Pro 2025.8 | `H:\网安资料和常用渗透工具\BurpSuite_Pro_V2025.8\BurpSuiteChs.jar`（同目录含 java jdk 21；有配套 bp-mcp-server）|
| Charles | `E:\SEC Tools\Charles.exe` |
| Reqable | `E:\SEC Tools\Reqable` |
| NetCat | `E:\SEC Tools\NetCat`（另有 `H:\网安资料和常用渗透工具\netcat-1.11`）|

### 11.3 逆向 / 移动 / 源码

| 工具 | 路径 | 说明 |
|------|------|------|
| jadx | MCP: `H:\网安资料和常用渗透工具\代审\jadx-mcp-server-6.3.0`（**未启动**）| 首选经 MCP；备选用 CLI |
| jadx CLI 备选 | `H:\网安资料和常用渗透工具\APP渗透\Android\APKDB\APKDB\jadx\bin\jadx.bat` / `jadx-gui.bat` | |
| MobSF | `E:\SEC Tools\Tools\MobSF` | 移动应用安全 |
| AppInfoScanner | `E:\SEC Tools\Tools\AppInfoScanner_V1.0.9_Releases` | APP 信息收集 |
| IDA Pro | MCP: `H:\网安资料和常用渗透工具\代审\ida-pro-mcp-1.4.0`（未启动）| |

### 11.4 MCP 服务器（已配置，未启动）

- **jadx-mcp-server 6.3.0**: python311 运行 `jadx-mcp-server\jadx-mcp-server\jadx_mcp_server.py`
- **ida-pro-mcp 1.4.0**: `uvx --from H:\...\ida-pro-mcp-1.4.0 ida-pro-mcp`
- **bp-mcp-server**: `uvx --from H:\...\bp-mcp-server bp-mcp`

### 11.5 已确认缺失（勿假设存在)

- ffuf / naabu / subfinder / projectdiscovery-httpx —— 未安装
- Docker —— 未安装（依赖容器验证的流程跳过）
- Go / Rust 工具链 —— 未装
- semgrep / codeql —— 未装（`pip install semgrep` 可补齐）
- 完整工具清单与运行环境详见 `secknowledge-skill/references/tools-local.md`

### 11.6 运行环境

- Python 3.9: `C:\Users\19487\AppData\Local\Programs\Python\Python39\python.exe`
- Python 3.11: `C:\Users\19487\AppData\Local\Programs\Python\Python311\python.exe`
- JDK 17: `C:\Program Files\Java\jdk-17`；Node: `E:\NodeJs`；dotnet: `C:\Program Files\dotnet`
- C 工具链: `E:\mingw64`（gcc/g++/gdb/objdump/strings）

### 11.7 `E:\SEC Tools` 独立工具目录（2026-09-01 全量）

`E:\SEC Tools` 是另一个综合工具目录（含 GUI 与源码工具），分类如下：

| 类别 | 工具 | 路径 |
|------|------|------|
| 综合抓包代理 | Charles | `E:\SEC Tools\Charles.exe`（运行时 lib 在 `E:\SEC Tools\lib\charles.jar`）|
| 综合抓包代理 | Reqable | `E:\SEC Tools\Reqable` |
| 综合抓包代理 | NetCat | `E:\SEC Tools\NetCat` |
| 抓包证书 | Fiddler5 证书 | `E:\SEC Tools\Tools\Fiddler5 证书` |
| 综合扫描 | Yakit | `E:\SEC Tools\Yakit\Yakit.exe` |
| IP 定位库 | ip.exe + 纯真库 | `E:\SEC Tools\ip\`（qqwry.dat）|
| 子域名 | OneForAll | `E:\SEC Tools\Tools\OneForAll-master` |
| 指纹识别 | CMSeeK | `E:\SEC Tools\Tools\CMSeeK-v.1.1.3` |
| 指纹识别 | WAF识别 | `E:\SEC Tools\Tools\WAF识别` |
| 资产扫描 | enscan | `E:\SEC Tools\Tools\enscan-0.0.10-windows-amd64` |
| 资产扫描 | gotoscan | `E:\SEC Tools\Tools\gotoscan-master` |
| 资产扫描 | AsamF | `E:\SEC Tools\Tools\AsamF_windows_amd64` |
| 资产测绘 | ARL 灯塔 | `E:\SEC Tools\Tools\ARL-master`（需部署）|
| 资产测绘 | Nemo | `E:\SEC Tools\Tools\nemo_linux_amd64.tar`（Linux）|
| 残留文件泄露 | GitHack(.git) | `E:\SEC Tools\Tools\GitHack-master` |
| 残留文件泄露 | SvnHack(.svn) | `E:\SEC Tools\Tools\SvnHack-master` |
| 残留文件泄露 | ds_store_exp(.DS_Store) | `E:\SEC Tools\Tools\ds_store_exp-master` |
| 敏感泄露监控 | Github-Monitor | `E:\SEC Tools\Tools\Github-Monitor-master.zip` |
| 敏感泄露监控 | GShark | `E:\SEC Tools\Tools\gshark_linux_amd64.zip`（Linux）|
| 加解密杂项 | CaptfEncoder | `E:\SEC Tools\Tools\CaptfEncoder-win-x64-3.1.2` |
| 加解密杂项 | DecryptTools.jar | `E:\SEC Tools\Tools\DecryptTools.jar` |
| 加解密杂项 | 咸鱼工具箱 | `E:\SEC Tools\Tools\咸鱼工具箱.exe` |
| 凭据实验（授权） | mimikatz_trunk | `E:\SEC Tools\Tools\mimikatz_trunk` |
| 移动安装包 | MobSF | `E:\SEC Tools\Tools\MobSF` |
| 移动信息收集 | AppInfoScanner | `E:\SEC Tools\Tools\AppInfoScanner_V1.0.9_Releases` |
| 微信小程序反编译 | 反编译工具 | `E:\SEC Tools\Tools\微信小程序反编译` |
| API 测试 | ReadyAPI | `E:\SEC Tools\Tools\ReadyAPI-2.8.2` |
| 浏览器扩展 | superSearchPlus / 蜜罐识别工具 | `E:\SEC Tools\浏览器扩展\` |
| 分类资源 | API攻防 / CDN / 端口扫描 / 蜜罐识别 / 护网蓝队 / JS项目 / CTF | `E:\SEC Tools\Tools\` 对应目录 |

> mimikatz 系双用途工具，仅用于授权主机环境，使用前须明确获权。

---

## 参考资源

- [Semgrep Registry](https://semgrep.dev/r)
- [Bandit Documentation](https://bandit.readthedocs.io/)
- [Gosec GitHub](https://github.com/securego/gosec)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [Trivy](https://aquasecurity.github.io/trivy/)
- [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)

---

**最后更新**: 2026-01-23
**版本**: 1.0.0
