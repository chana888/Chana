param(
    [int]$Port = 18862,
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $Root 'vps-browser\server'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '需要 Node.js（>= 18）' }
if (-not (Test-Path (Join-Path $ServerDir 'chrome-bridge.cjs'))) { throw "缺少 $ServerDir\chrome-bridge.cjs" }

Write-Host '[1/3] 安装桥依赖...'
Push-Location $ServerDir
try { & npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org; if ($LASTEXITCODE -ne 0) { throw "npm install 失败" } }
finally { Pop-Location }

$Runtime = Join-Path $ServerDir '.runtime'
New-Item -ItemType Directory -Force $Runtime | Out-Null
$Cfg = Join-Path $Runtime 'config.json'
if (-not (Test-Path $Cfg)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    @{ token = $token; public_origin = ''; platform_port = 8082 } | ConvertTo-Json | Set-Content $Cfg -Encoding utf8
    Write-Host '      已生成令牌'
}
$token = (Get-Content $Cfg -Raw | ConvertFrom-Json).token
if (-not $token) { throw "无法从 $Cfg 读取 token" }

if (-not $NoStart) {
    $Log = Join-Path $Root 'browser-run.log'
    Write-Host "[2/3] 启动桥（127.0.0.1:$Port，日志: $Log）..."
    Start-Process -FilePath (Get-Command node).Source -ArgumentList 'chrome-bridge.cjs' -WorkingDirectory $ServerDir `
        -RedirectStandardOutput $Log -RedirectStandardError "$Log.err" -WindowStyle Hidden | Out-Null
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try { if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) { $ready = $true; break } } catch { }
    }
    if (-not $ready) { throw "20 秒内端口 $Port 未就绪，请查看 $Log" }
} else {
    Write-Host '[2/3] 跳过启动（-NoStart）'
}

Write-Host '[3/3] 完成'
Write-Host "        桥地址: http://127.0.0.1:$Port/mcp   Header: X-Chana-Vps-Token: $token"
Write-Host '        平台接入: config.yaml 的 external_mcp.servers.local-browser，或在「MCP 管理」启用 local-browser（平台自动发现令牌）'
Write-Host '        扩展: Chrome 打开 chrome://extensions → 加载已解压的扩展 → 选择 vps-browser\extension'
Write-Host '        说明: 桥只控制已安装该扩展的 Chrome；需先在扩展里点 Connect'
