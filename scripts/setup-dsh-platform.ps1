param(
    [string]$Config = ''
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Config) { $Config = Join-Path $Root 'config.yaml' }
if (-not (Test-Path $Config)) { throw "找不到配置文件: $Config" }

$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$content = Get-Content $Config -Raw -Encoding utf8
$m = [regex]::Match($content, '(?ms)^mcp:\r?\n((?:  .*\r?\n)+)')
$token = $env:CHANA_MCP_TOKEN
if (-not $token -and $m.Success) {
    $t = [regex]::Match($m.Groups[1].Value, '(?m)^  auth_header_value:\s*"?([0-9a-fA-F]{16,})"?')
    if ($t.Success) { $token = $t.Groups[1].Value }
}
if (-not $token) {
    $b = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new(); $rng.GetBytes($b); $rng.Dispose()
    $token = ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

Write-Host '[1/4] 启用平台 MCP（127.0.0.1:8081）'
if ($m.Success) {
    $block = $m.Value
    $block = [regex]::Replace($block, '(?m)^  enabled:.*$', '  enabled: true', 1)
    $block = [regex]::Replace($block, '(?m)^  host:.*$', '  host: 127.0.0.1', 1)
    $block = [regex]::Replace($block, '(?m)^  port:.*$', '  port: 8081', 1)
    if ($block -match '(?m)^  auth_header_value:') {
        $block = [regex]::Replace($block, '(?m)^  auth_header_value:.*$', "  auth_header_value: $token", 1)
    } else {
        $block = $block.TrimEnd() + "`n  auth_header_value: $token`n"
    }
    if ($block -match '(?m)^  allow_global_access:') {
        $block = [regex]::Replace($block, '(?m)^  allow_global_access:.*$', '  allow_global_access: true', 1)
    } else {
        $block = $block.TrimEnd() + "`n  allow_global_access: true`n"
    }
    $content = $content.Substring(0, $m.Index) + $block + $content.Substring($m.Index + $m.Length)
} else {
    $content = $content.TrimEnd() + "`nmcp:`n  enabled: true`n  host: 127.0.0.1`n  port: 8081`n  auth_header: X-MCP-Token`n  auth_header_value: $token`n  allow_global_access: true`n"
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($Config, $content, $utf8)

Write-Host "[2/4] 安装 AGENTS.md -> $DshHome\AGENTS.md"
New-Item -ItemType Directory -Force $DshHome | Out-Null
(Get-Content (Join-Path $Root 'AGENTS-TEMPLATE.md') -Raw -Encoding utf8).Replace('<repo>', $Root) |
    Set-Content (Join-Path $DshHome 'AGENTS.md') -Encoding utf8

Write-Host '[3/4] 创建 skills 目录联接'
foreach ($link in @((Join-Path $DshHome 'skills'), (Join-Path $HOME 'skills'))) {
    if (Test-Path $link) { Remove-Item $link -Force -Recurse -ErrorAction SilentlyContinue }
    New-Item -ItemType Junction -Path $link -Target (Join-Path $Root 'skills') | Out-Null
}

Write-Host '[4/4] 注入 mcp-chana 到 dsh 配置'
$prof = Join-Path $DshHome 'profiles\web'
New-Item -ItemType Directory -Force $prof | Out-Null
$patch = Join-Path $prof 'cordis.patch.yml'
if (-not (Test-Path $patch)) { New-Item -ItemType File $patch | Out-Null }
if (-not (Select-String -Path $patch -Pattern 'mcp-chana' -Quiet)) {
    $block = @"

- insert:
    - id: mcp-chana
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: chana
        transport: streamable-http
        url: http://127.0.0.1:8081/mcp
        headers:
          X-MCP-Token: $token
        toolCallTimeoutMs: 300000
        failOnStartupError: false
"@
    [System.IO.File]::AppendAllText($patch, $block, $utf8)
}

Write-Host '[完成] 请依次重启：平台（让 8081 生效）→ dsh'
Write-Host "       平台 MCP Token: $token"
