param(
    [string]$Token = '',
    [string]$Url = 'http://127.0.0.1:9123/message',
    [string]$Config = 'config.yaml'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Config)) { throw "找不到配置文件: $Config" }
$content = Get-Content $Config -Raw -Encoding utf8
if ($content -match '(?m)^    gsl5:\s*$') {
    # 已存在：只更新本条目内的 url（以及提供了新 token 时的 Authorization）
    $m = [regex]::Match($content, '(?m)^    gsl5:?
(?:(?:      |        )[^
]*?
)*')
    if ($m.Success) {
        $rows = $m.Value -split "`n"
        $urlDone = $false; $tokDone = $false
        for ($i = 0; $i -lt $rows.Count; $i++) {
            if (-not $urlDone -and $rows[$i] -match '^      url:') { $rows[$i] = "      url: $Url"; $urlDone = $true; continue }
            if ($Token -and -not $tokDone -and $rows[$i] -match '^        Authorization:') { $rows[$i] = "        Authorization: Bearer $Token"; $tokDone = $true }
        }
        $content = $content.Substring(0, $m.Index) + ($rows -join "`n") + $content.Substring($m.Index + $m.Length)
        $utf8u = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText((Resolve-Path $Config), $content, $utf8u)
        Write-Host "[更新] 已更新 gsl5 条目: $Url"
        exit 0
    }
}

$bak = "$Config.bak-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $Config $bak

$block = @"
    gsl5:
      type: http
      url: $Url
      headers:
        Authorization: Bearer $Token
      external_mcp_enable: true
"@

if ($content -match '(?m)^external_mcp:\s*$') {
    if ($content -match '(?m)^  servers:\s*\{\}\s*$') {
        $content = [regex]::Replace($content, '(?m)^  servers:\s*\{\}\s*$', "  servers:`n$block")
    } elseif ($content -match '(?m)^  servers:\s*$') {
        $content = [regex]::Replace($content, '(?m)^  servers:\s*$', "  servers:`n$block", 1)
    } else {
        throw '发现 external_mcp 段但没有 servers 字段，请手动编辑'
    }
} else {
    $content = $content.TrimEnd() + "`n`n# GSL5 WebShell 管理 MCP（由 scripts/setup-gsl5.ps1 写入）`nexternal_mcp:`n  servers:`n" + $block + "`n"
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $Config), $content, $utf8)
Write-Host "[完成] 已写入 gsl5 条目（备份: $bak）"
Write-Host '下一步：重启平台，例如 .\chana.exe --https'
