param(
    [string]$Config = '',
    [int]$Port = 3080,
    [string]$Registry = 'https://registry.npmjs.org',
    [switch]$InstallOnly,
    [switch]$NoConfig,
    [switch]$NoPlatform
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Config) { $Config = Join-Path $Root 'config.yaml' }

function Get-NodeMajor {
    try { $v = (& node -v).Trim().TrimStart('v'); return [int]($v.Split('.')[0]) } catch { return 0 }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '需要 Node.js >= 20，请先安装' }
if ((Get-NodeMajor) -lt 20) { throw "Node.js 版本过低: $(& node -v)，需要 >= 20" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw '未找到 npm' }

$DshDir = Join-Path $Root 'integrations\dsh'
if (-not (Test-Path (Join-Path $DshDir 'package.json'))) { throw "缺少 $DshDir\package.json" }

Write-Host '[1/3] 安装 dsh 依赖（首次约几十秒）...'
Push-Location $DshDir
try {
    $oldEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & npm install --omit=dev --no-audit --no-fund --registry=$Registry 2>&1 | Out-Host
    $code = $LASTEXITCODE
    $ErrorActionPreference = $oldEap
    if ($code -ne 0) { throw "npm install 失败 (exit $code)" }
} finally { Pop-Location }

$bin = Join-Path $DshDir 'node_modules\@deepseek-ai\dsh\lib\bin.js'
if (-not (Test-Path $bin)) { throw "未找到 dsh 入口: $bin" }

if ($InstallOnly) {
    Write-Host "[完成] 仅安装。启动命令: node `"$bin`" web --no-open"
    exit 0
}

$Log = Join-Path $Root 'dsh-run.log'
$token = $null
$listening = $false
try { $listening = [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) } catch { }

if (-not $NoPlatform -and (Test-Path $Config)) {
    Write-Host '[联动] 配置平台 MCP / AGENTS.md / skills / mcp-chana ...'
    & (Join-Path $PSScriptRoot 'setup-dsh-platform.ps1') -Config $Config
}

if (-not $listening) {
    Write-Host "[2/3] 启动 dsh（端口 $Port，日志: $Log）..."
    $p = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($bin, 'web', '--no-open') `
        -WorkingDirectory $Root -RedirectStandardOutput $Log -RedirectStandardError "$Log.err" -WindowStyle Hidden -PassThru
    Write-Host "      PID: $($p.Id)"
    for ($i = 0; $i -lt 180; $i++) {
        Start-Sleep -Seconds 1
        if ($i -gt 0 -and $i % 20 -eq 0) { Write-Host "      等待 dsh 初始化（首次启动需安装 profile 依赖，已等 $i 秒）..." }
        if (Test-Path $Log) {
            $m = Select-String -Path $Log -Pattern 'token=([A-Za-z0-9_-]+)' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($m) { $token = $m.Matches[0].Groups[1].Value; break }
        }
    }
    if (-not $token) { throw "30 秒内未解析到 token，请查看 $Log" }
} else {
    Write-Host "[提示] 端口 $Port 已被占用，复用现有 dsh 实例"
    if (Test-Path $Log) {
        $m = Select-String -Path $Log -Pattern 'token=([A-Za-z0-9_-]+)' -ErrorAction SilentlyContinue | Select-Object -Last 1
        if ($m) { $token = $m.Matches[0].Groups[1].Value }
    }
    if (-not $token) { Write-Host '      未能从日志读取现有 token；如平台 Harness 连不上，请重启 dsh 后重跑本脚本' }
}

if ($token -and -not $NoConfig) {
    if (Test-Path $Config) {
        Write-Host '[3/3] 写入 config.yaml（dsh 段）...'
        & (Join-Path $PSScriptRoot 'setup-dsh.ps1') -Token $token -BaseUrl "http://127.0.0.1:$Port" -Config $Config
    } else {
        Write-Host "[跳过] 找不到 $Config（先复制 config.example.yaml）"
    }
} else {
    Write-Host '[3/3] 跳过配置写入'
}

if ($token) { Write-Host "[完成] dsh 已就绪: http://127.0.0.1:$Port/?token=$token" }
Write-Host '       重启平台后 Harness 页面即可连接；dsh 每次重启 token 都会变化，需重新执行本脚本同步'
