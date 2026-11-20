param(
    [Parameter(Mandatory = $true)][string]$Token,
    [string]$BaseUrl = 'http://127.0.0.1:3080',
    [string]$Config = 'config.yaml'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Config)) {
    Write-Error "找不到配置文件: $Config（请在 chana 可执行文件所在目录运行，或显式指定 -Config）"
}

$content = Get-Content $Config -Raw -Encoding utf8
if ($content -match '(?m)^dsh:\s*$') {
    Write-Host '[跳过] config.yaml 已存在 dsh 段，请手动修改'
    exit 1
}

$bak = "$Config.bak-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $Config $bak

$block = @"

# dsh 反代（由 scripts/setup-dsh.ps1 写入）
dsh:
  base_url: $BaseUrl
  token: $Token
"@

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::AppendAllText((Resolve-Path $Config), $block, $utf8)

Write-Host "[完成] 已写入 dsh 段（备份: $bak）"
Write-Host '下一步：重启平台，例如 .\chana.exe --https'
Write-Host '注意：dsh 每次重启 token 都会变化，需要重新执行本脚本或手动同步 config.yaml'
