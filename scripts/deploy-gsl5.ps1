param(
    [string]$Config = '',
    [int]$Port = 9123,
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

if ($token -and -not $NoConfig) {
    if (Test-Path $Config) {
        Write-Host '[2/3] 写入 config.yaml（external_mcp.gsl5）...'
        & (Join-Path $PSScriptRoot 'setup-gsl5.ps1') -Token $token -Url "http://${HostName}:$Port/message" -Config $Config
    } else {
        Write-Host "[跳过] 找不到 $Config（先复制 config.example.yaml）"
    }
} else {
    Write-Host '[2/3] 跳过配置写入'
}

Write-Host '[3/3] 完成'
if ($token) { Write-Host "        GSL5 MCP: http://${HostName}:$Port/message  Bearer Token: $token" }
Write-Host '        重启平台后「MCP 管理」和「GSL5 控制台」即可使用（约 60+ 工具）'
