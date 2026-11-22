param(
    [string]$Config = '',
    [int]$Port = 9123,
    [int]$CompatPort = 9124,
    [switch]$NoCompat,
    [string]$HostName = '127.0.0.1',
    [switch]$NoConfig
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Config) { $Config = Join-Path $Root 'config.yaml' }

if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw '需要 Java 运行环境（JDK/JRE 17+），请先安装' }
$Jar = Join-Path $Root 'integrations\gsl5\bin\gsl5.jar'
if (-not (Test-Path $Jar)) { throw "缺少 $Jar" }

$token = $null
$listening = $false
try { $listening = [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) } catch { }

if (-not $listening) {
    $Log = Join-Path $Root 'gsl5-run.log'
    Write-Host "[1/3] 启动 GSL5 MCP（${HostName}:$Port，日志: $Log）..."
    $p = Start-Process -FilePath (Get-Command java).Source -ArgumentList @('-jar', $Jar, 'mcp', $Port, $HostName) `
        -WorkingDirectory (Join-Path $Root 'integrations\gsl5') -RedirectStandardOutput $Log -RedirectStandardError "$Log.err" -WindowStyle Hidden -PassThru
    Write-Host "      PID: $($p.Id)"
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $Log) {
            $m = Select-String -Path $Log -Pattern '^Token:\s*([A-Za-z0-9_-]+)' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($m) { $token = $m.Matches[0].Groups[1].Value; break }
        }
    }
    if (-not $token) { throw "30 秒内未解析到 Token，请查看 $Log" }
} else {
    Write-Host "[提示] 端口 $Port 已被占用，假定 GSL5 已在运行；请手动确认 Token 或重启服务后再执行"
}

# GSL5 的 /message 是旧版 HTTP+SSE：POST 返回 202 且把响应放在 body 里，
# dsh 的 MCP 客户端只认 200，会一直等到超时。用本地代理规范成 200。
$McpUrl = "http://${HostName}:$Port/message"
if (-not $NoCompat) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host '[提示] 未找到 node，跳过 MCP 兼容代理（平台可直连，dsh 将无法挂载 gsl5）'
    } else {
        $compatUp = $false
        try { $compatUp = [bool](Get-NetTCPConnection -State Listen -LocalPort $CompatPort -ErrorAction Stop) } catch { }
        if (-not $compatUp) {
            $CompatLog = Join-Path $Root 'gsl5-compat.log'
            Write-Host "[兼容] 启动 MCP 代理 127.0.0.1:$CompatPort -> $McpUrl"
            Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $PSScriptRoot 'mcp-http-compat.mjs'), '--listen', "127.0.0.1:$CompatPort", '--upstream', $McpUrl) `
                -WorkingDirectory $Root -RedirectStandardOutput $CompatLog -RedirectStandardError "$CompatLog.err" -WindowStyle Hidden | Out-Null
            for ($i = 0; $i -lt 15; $i++) {
                Start-Sleep -Seconds 1
                try { if (Get-NetTCPConnection -State Listen -LocalPort $CompatPort -ErrorAction Stop) { $compatUp = $true; break } } catch { }
            }
        } else { $compatUp = $true }
        if ($compatUp) { $McpUrl = "http://127.0.0.1:$CompatPort/message" }
        else { Write-Host "[警告] MCP 代理未就绪，dsh 可能无法挂载 gsl5（见 $CompatLog）" }
    }
}

if (-not $NoConfig) {
    if (Test-Path $Config) {
        $hasEntry = [bool](Select-String -Path $Config -Pattern '^    gsl5:\s*$' -Quiet)
        if ($token -or $hasEntry) {
            Write-Host '[2/3] 写入 config.yaml（external_mcp.gsl5）...'
            & (Join-Path $PSScriptRoot 'setup-gsl5.ps1') -Token $token -Url $McpUrl -Config $Config
        } else {
            Write-Host '[跳过] GSL5 已在运行且 config 尚无 gsl5 条目：拿不到 Token，请重启 GSL5 后重跑本脚本'
        }
    } else {
        Write-Host "[跳过] 找不到 $Config（先复制 config.example.yaml）"
    }
} else {
    Write-Host '[2/3] 跳过配置写入'
}

Write-Host '[3/3] 完成'
if ($token) { Write-Host "        GSL5 MCP: $McpUrl  Bearer Token: $token" }
Write-Host "        原始服务: http://${HostName}:$Port/message（旧版 202 语义，dsh 请走兼容代理）"
Write-Host '        重启平台后「MCP 管理」和「GSL5 控制台」即可使用（约 60+ 工具）'
