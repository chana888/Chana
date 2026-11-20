param(
    [Parameter(Mandatory = $true)][string]$Token,
    [string]$Url = 'http://127.0.0.1:8095',
    [string]$Config = 'config.yaml'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Config)) {
    Write-Error "找不到配置文件: $Config（请在 chana 可执行文件所在目录运行，或显式指定 -Config）"
}

$content = Get-Content $Config -Raw -Encoding utf8
if ($content -match '(?m)^vshell:\s*$') {
    Write-Host '[跳过] config.yaml 已存在 vshell 段，请手动修改'
    exit 1
}

$bak = "$Config.bak-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $Config $bak

$block = @"

# vShell C2 面板桥接（由 scripts/setup-vshell.ps1 写入）
# 需先独立部署 vShell 服务端（官方编译版，不随仓库分发）
vshell:
  enabled: true
  url: $Url
  token: $Token
"@

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::AppendAllText((Resolve-Path $Config), $block, $utf8)

Write-Host "[完成] 已写入 vshell 段（备份: $bak）"
Write-Host '下一步：重启平台，例如 .\chana.exe --https'
Write-Host '提示：vShell 只监听回环时，可用 ssh -N -L 127.0.0.1:8095:127.0.0.1:8080 user@host 建隧道'
