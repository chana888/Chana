param(
    [int]$Port = 18862
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '需要 Node.js >= 18' }

$ExtDir = Join-Path $Root 'vps-browser\extension'
$HostDir = Join-Path $Root '.chrome-mcp-host'
New-Item -ItemType Directory -Force $HostDir | Out-Null

Write-Host '[1/4] 安装 mcp-chrome-bridger（12306 native host）...'
$cli = Join-Path $HostDir 'node_modules\mcp-chrome-bridger\dist\cli.js'
if (-not (Test-Path $cli)) {
    Push-Location $HostDir
    try {
        $oldEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        if (-not (Test-Path 'package.json')) { & npm init -y 2>&1 | Out-Null }
        & npm i mcp-chrome-bridger --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { & npm i mcp-chrome-bridger --no-audit --no-fund 2>&1 | Out-Host }
        $code = $LASTEXITCODE
        $ErrorActionPreference = $oldEap
        if ($code -ne 0) { throw 'mcp-chrome-bridger 安装失败' }
    } finally { Pop-Location }
}

Write-Host '[2/4] 注册 native host 到本机 Chrome...'
$oldEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& node $cli register -b chrome -f 2>&1 | Out-Host
$ErrorActionPreference = $oldEap

$manifest = Get-Content (Join-Path $ExtDir 'manifest.json') -Raw | ConvertFrom-Json
$key = $manifest.key
if (-not $key) { throw '扩展 manifest 缺少 key，无法推导扩展 ID' }
$sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Convert]::FromBase64String($key))
$hex = -join ($sha[0..15] | ForEach-Object { $_.ToString('x2') })
$extId = -join ($hex.ToCharArray() | ForEach-Object { [char](97 + [Convert]::ToInt32($_,16)) })
Write-Host "      扩展 ID: $extId"

$dirs = @(
    (Join-Path $env:APPDATA 'Google\Chrome\NativeMessagingHosts'),
    (Join-Path $env:APPDATA 'Chromium\NativeMessagingHosts'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\NativeMessagingHosts')
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) { continue }
    Get-ChildItem $d -Filter *.json -ErrorAction SilentlyContinue | ForEach-Object {
        try { $j = Get-Content $_.FullName -Raw | ConvertFrom-Json } catch { return }
        $origins = @($j.allowed_origins) + @("chrome-extension://$extId/")
        $j.allowed_origins = $origins | Sort-Object -Unique
        $j | ConvertTo-Json -Depth 6 | Set-Content $_.FullName -Encoding utf8
    }
}

Write-Host '[3/4] 启动 18862 MCP 桥...'
& (Join-Path $PSScriptRoot 'deploy-browser.ps1') -Port $Port

$cfg = Join-Path $Root 'vps-browser\server\.runtime\config.json'
$token = (Get-Content $cfg -Raw | ConvertFrom-Json).token

# 自动写入平台外部 MCP 并启用，省去「MCP 管理」里再手动启用一步
$Config = Join-Path $Root 'config.yaml'
if (Test-Path $Config) {
    $content = Get-Content $Config -Raw -Encoding utf8
    if ($content -notmatch '(?m)^    local-browser:\s*$') {
        $blk = "    local-browser:`n      type: http`n      url: http://127.0.0.1:$Port/mcp`n      headers:`n        X-Chana-Vps-Token: $token`n      external_mcp_enable: true`n"
        if ($content -match '(?m)^external_mcp:[ 	]*$') {
            if ($content -match '(?m)^  servers:[ 	]*$') {
                $content = [regex]::Replace($content, '(?m)^(external_mcp:[ 	]*?
  servers:[ 	]*?
)', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Value + $blk }, 1)
            } else { Write-Host '[警告] external_mcp 段缺少 servers，跳过自动接入' }
        } else {
            $content = $content.TrimEnd() + "`n`n# 本地浏览器 MCP（由 scripts/setup-local-browser.ps1 写入）`nexternal_mcp:`n  servers:`n" + $blk
        }
        $utf8n = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($Config, $content, $utf8n)
        Write-Host '      已自动写入 config.yaml: external_mcp.servers.local-browser（已启用）'
    }
}
try {
    $st = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status" -Headers @{ 'X-Chana-Vps-Token' = $token } -TimeoutSec 5
    Write-Host "[4/4] browserConnected: $($st.browserConnected)"
} catch { Write-Host '[4/4] 自检失败（稍后重试）' }

# 同时生成可直接分发的扩展 zip（Chrome 只能加载解压后的文件夹）
try { & (Join-Path $PSScriptRoot 'pack-extension.ps1') -OutDir (Join-Path $Root 'dist') | Out-Null } catch { }

Write-Host ''
Write-Host '完成。最后一步（必须手动做一次）：'
Write-Host '  1. Chrome 打开 chrome://extensions 并开启开发者模式'
Write-Host "  2. 加载已解压的扩展程序 -> 选择 $ExtDir"
Write-Host '  3. 点扩展图标 Connect（平台侧已自动启用 local-browser；若平台已在运行，重启后生效）'
