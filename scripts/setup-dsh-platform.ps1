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

# MCP 客户端依赖自检：部分 npm 镜像的 @modelcontextprotocol/client 缺 dist/index.mjs，
# 插件会 import 失败，dsh 只在 stderr 里报一行警告，MCP 工具全部不出现。这里自动修复。
$dshDir = Join-Path $Root 'integrations\dsh'
$pluginEntry = Join-Path $dshDir 'node_modules\@deepseek-ai\dsh-mcp-client\lib\index.js'
$mcpClientMjs = Join-Path $dshDir 'node_modules\@modelcontextprotocol\client\dist\index.mjs'
if ((Test-Path $pluginEntry) -and -not (Test-Path $mcpClientMjs)) {
    Write-Host '      [修复] @modelcontextprotocol/client 缺 dist/index.mjs，从官方源重装...'
    $mcpClientDir = Join-Path $dshDir 'node_modules\@modelcontextprotocol\client'
    if (Test-Path $mcpClientDir) { Remove-Item $mcpClientDir -Recurse -Force -ErrorAction SilentlyContinue }
    $oldEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { Push-Location $dshDir; & npm install '@modelcontextprotocol/client@2.2.0' --registry=https://registry.npmjs.org --no-save --ignore-scripts --force 2>&1 | Out-Null } catch { } finally { Pop-Location; $ErrorActionPreference = $oldEap }
    if (-not (Test-Path $mcpClientMjs)) { Write-Host '      [警告] 自动重装失败，请手动执行: cd integrations/dsh; npm install @modelcontextprotocol/client@2.2.0 --force' }
}
if (Test-Path $pluginEntry) {
    $probe = Join-Path $dshDir '.mcp-probe.mjs'
    Set-Content -Path $probe -Value "import('@deepseek-ai/dsh-mcp-client').then(()=>console.log('ok')).catch(e=>console.log('fail:'+e.message))" -Encoding utf8
    $oldEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { Push-Location $dshDir; $probeOut = (& node $probe 2>&1 | Out-String) } catch { $probeOut = "$_" } finally { Pop-Location; $ErrorActionPreference = $oldEap }
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    if ($probeOut -notmatch 'ok') { Write-Host "      [警告] dsh-mcp-client 无法加载，MCP 不会连接：$($probeOut.Trim())" }
}
$patch = Join-Path $prof 'cordis.patch.yml'
if (-not (Test-Path $patch)) { New-Item -ItemType File $patch | Out-Null }
$existing = (Get-Content $patch -Raw -ErrorAction SilentlyContinue)
if ($null -eq $existing) { $existing = '' }
if ($existing.Trim() -eq '[]' -or $existing.Trim() -eq '') { Set-Content -Path $patch -Value '' -Encoding utf8 }

# 兼容修复：新增条目必须是 `- insert:` 块；裸 `- id: mcp-*` 会被 dsh 当成"修改已有条目"而忽略。
$pLines = @(Get-Content $patch -ErrorAction SilentlyContinue)
if ($pLines -match '^- id: mcp-') {
    $kept = @(); $mcpRows = @(); $collect = $false
    foreach ($ln in $pLines) {
        if ($ln -match '^- id: mcp-') { $collect = $true; $mcpRows += ('    ' + $ln); continue }
        if ($collect) {
            if ($ln -match '^- ') { $collect = $false }
            elseif ($ln.Trim() -eq '') { continue }
            else { $mcpRows += ('    ' + $ln); continue }
        }
        $kept += $ln
    }
    if ($mcpRows.Count -gt 0) {
        $kept += '- insert:'
        $kept += $mcpRows
        $utf8n = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($patch, $kept, $utf8n)
        $existing = Get-Content $patch -Raw -Encoding utf8
        Write-Host '      [修复] 已把裸 mcp 条目改写为 insert 块'
    }
}
# 生成/更新 mcp-chana 条目（只替换条目块，保留外层 insert 容器）
$itemChana = "    - id: mcp-chana`n      name: '@deepseek-ai/dsh-mcp-client'`n      config:`n        serverName: chana`n        transport: streamable-http`n        url: http://127.0.0.1:8081/mcp`n        headers:`n          X-MCP-Token: $token`n        toolCallTimeoutMs: 300000`n        failOnStartupError: false`n"
$patchText = Get-Content $patch -Raw -Encoding utf8
if ($null -eq $patchText) { $patchText = '' }
$patternChana = '(?m)^    - id: mcp-chana\r?\n(?:(?:      |        |          |            )[^\r\n]*\r?\n)*'
if ($patchText -match $patternChana) {
    $patchText = [regex]::Replace($patchText, $patternChana, $itemChana, 1)
} else {
    $patchText = $patchText.TrimEnd() + "`n- insert:`n" + $itemChana
}

# 把平台已启用的外部 MCP（浏览器桥 / GSL5 等）同步进 dsh（新增或更新 URL/令牌）
$cfgText = Get-Content $Config -Raw -Encoding utf8
$mExt = [regex]::Match($cfgText, '(?ms)^external_mcp:\r?\n((?:  .*\r?\n)+)')
if ($mExt.Success) {
    $servers = @{}; $cur = $null; $inHeaders = $false
    foreach ($ln in ($mExt.Groups[1].Value -split "\r?\n")) {
        if ($ln.Trim() -eq '') { continue }
        $indent = $ln.Length - $ln.TrimStart().Length
        $t = $ln.Trim()
        if ($indent -eq 4 -and $t.EndsWith(':')) { $cur = $t.TrimEnd(':'); $servers[$cur] = @{ headers = @{} }; $inHeaders = $false; continue }
        if (-not $cur) { continue }
        if ($indent -eq 6) {
            if ($t.StartsWith('headers:')) { $inHeaders = $true; continue }
            $inHeaders = $false
            $i = $t.IndexOf(':'); if ($i -gt 0) { $servers[$cur][$t.Substring(0,$i).Trim()] = $t.Substring($i+1).Trim().Trim("'`"") }
        } elseif ($indent -eq 8 -and $inHeaders) {
            $i = $t.IndexOf(':'); if ($i -gt 0) { $servers[$cur].headers[$t.Substring(0,$i).Trim()] = $t.Substring($i+1).Trim().Trim("'`"") }
        }
    }
    $extSynced = 0
    foreach ($name in @($servers.Keys)) {
        $c = $servers[$name]
        $enabled = -not ($c.ContainsKey('external_mcp_enable') -and "$($c['external_mcp_enable'])" -eq 'false')
        if ($c.ContainsKey('disabled') -and "$($c['disabled'])" -eq 'true') { $enabled = $false }
        $url = "$($c['url'])"
        $typ = if ($c.ContainsKey('type')) { "$($c['type'])" } else { 'http' }
        if (-not $enabled -or -not $url -or ($typ -notin @('http','sse'))) { continue }
        $mid = "mcp-$name"
        $hdrLines = ''
        foreach ($hk in $c.headers.Keys) { $hdrLines += "`n          ${hk}: $($c.headers[$hk])" }
        $itemExt = "    - id: $mid`n      name: '@deepseek-ai/dsh-mcp-client'`n      config:`n        serverName: $name`n        transport: streamable-http`n        url: $url`n        headers: $hdrLines`n        toolCallTimeoutMs: 300000`n        failOnStartupError: false`n"
        $pat = '(?m)^    - id: ' + [regex]::Escape($mid) + '\r?\n(?:(?:      |        |          |            )[^\r\n]*\r?\n)*'
        if ($patchText -match $pat) {
            $patchText = [regex]::Replace($patchText, $pat, $itemExt, 1)
        } else {
            $patchText = $patchText.TrimEnd() + "`n- insert:`n" + $itemExt
        }
        $extSynced++
    }
    $extAdded = $extSynced
    Write-Host "      外部 MCP 同步到 dsh: $extSynced 个"
}
$utf8w = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($patch, $patchText, $utf8w)

Write-Host '[完成] 请依次重启：平台（让 8081 生效）→ dsh'
Write-Host "       平台 MCP Token: $token"
