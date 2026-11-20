param(
    [string]$Binary = '',
    [int]$Port = 8095,
    [int]$AgentPort = 8084,
    [string]$Token = '',
    [string]$Config = '',
    [switch]$NoStart,
    [switch]$NoConfig
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Config) { $Config = Join-Path $Root 'config.yaml' }

if (-not $Binary) {
    foreach ($cand in @(
            (Join-Path $Root 'integrations\vshell\server\windows\vshell-server-standalone.exe'),
            (Join-Path $Root 'integrations\vshell\server\vshell-server-standalone.exe'))) {
        if (Test-Path $cand) { $Binary = $cand; break }
    }
}

if (-not $Binary -or -not (Test-Path $Binary)) {
    throw "找不到 vShell 服务端。vShell 为独立产品（官方编译版，源码不公开，带独立授权），仓库默认不含其二进制。请把服务端放到 integrations\vshell\server\（该目录已 gitignore），或用 -Binary 指定路径。注意：通常需要同目录的 www\ 前端资源。"
}
if (-not $Token) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $Token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

if (-not $NoStart) {
    $Log = Join-Path $Root 'vshell-run.log'
    Write-Host "[1/3] 启动 vShell（面板 $Port / Agent $AgentPort，日志: $Log）..."
    $p = Start-Process -FilePath $Binary -ArgumentList @('-a', '127.0.0.1', '-p', $Port, '-ap', $AgentPort, '-t', $Token) `
        -WorkingDirectory (Split-Path -Parent $Binary) -RedirectStandardOutput $Log -RedirectStandardError "$Log.err" -PassThru -WindowStyle Hidden
    Write-Host "      PID: $($p.Id)"
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try { if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) { $ready = $true; break } } catch { }
    }
    if (-not $ready) { throw "20 秒内端口 $Port 未就绪，请查看 $Log" }
} else {
    Write-Host '[1/3] 跳过启动（-NoStart）'
}

if (-not $NoConfig) {
    if (Test-Path $Config) {
        Write-Host '[2/3] 写入 config.yaml（vshell 段）...'
        & (Join-Path $PSScriptRoot 'setup-vshell.ps1') -Token $Token -Url "http://127.0.0.1:$Port" -Config $Config
    } else {
        Write-Host "[跳过] 找不到 $Config（先复制 config.example.yaml）"
    }
} else {
    Write-Host '[2/3] 跳过配置写入'
}

Write-Host '[3/3] 完成'
Write-Host "        面板: http://127.0.0.1:$Port/?token=$Token  管理Token: $Token"
Write-Host '        面板默认账号: admin / admin123（首次登录后请立即修改）'
Write-Host "        Agent 回连端口: $AgentPort（如需目标上线，记得在防火墙放行）"
Write-Host "        远程/隔离部署可改用: ssh -N -L 127.0.0.1:$Port:127.0.0.1:<面板端口> user@host"
