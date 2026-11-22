param(
    [int]$Port = 8080,
    [switch]$SkipDsh,
    [switch]$SkipGsl5,
    [switch]$SkipVShell,
    [switch]$SkipBrowser,
    [switch]$NoStart,
    [string]$VShellBinary = '',
    [string]$Proxy = ''
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Deps = Join-Path $Root '.deps'
New-Item -ItemType Directory -Force $Deps | Out-Null
$ReleaseBase = 'https://github.com/chana888/Chana/releases/latest/download'

function Step($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn2($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Get-Web($url, $out) {
    $iwr = @{ Uri = $url; OutFile = $out; UseBasicParsing = $true }
    if ($Proxy) { $iwr.Proxy = $Proxy }
    Invoke-WebRequest @iwr
}

Step '1/7 准备平台二进制'
$Bin = Join-Path $Root 'chana.exe'
if (Test-Path $Bin) { Ok "已存在 $Bin" }
else {
    $go = Get-Command go -ErrorAction SilentlyContinue
    $built = $false
    if ($go) {
        Push-Location $Root
        try {
            $env:GO111MODULE='on'; $env:GOPROXY='https://goproxy.cn,direct'
            & go build -o chana.exe ./cmd/server
            $built = ($LASTEXITCODE -eq 0)
        } catch { $built = $false } finally { Pop-Location }
        if ($built) { Ok '本地构建成功' } else { Warn2 '本地构建失败（可能缺 CGO/gcc），改下载预编译版本' }
    }
    if (-not $built) {
        Warn2 '从 GitHub Release 下载 chana-windows-amd64.exe'
        Get-Web "$ReleaseBase/chana-windows-amd64.exe" $Bin
        Ok '已下载'
    }
}

Step '2/7 准备配置文件'
$Config = Join-Path $Root 'config.yaml'
if (-not (Test-Path $Config)) { Copy-Item (Join-Path $Root 'config.example.yaml') $Config; Ok '已生成 config.yaml' }
$c = Get-Content $Config -Raw -Encoding utf8
$c = [regex]::Replace($c, '(?m)^(server:\r?\n(?:  .*\r?\n)*?  )port:.*$', '${1}port: ' + $Port, 1)
$c = [regex]::Replace($c, '(?m)^(server:\r?\n(?:  .*\r?\n)*?  )host:.*$', '${1}host: 127.0.0.1', 1)
[System.IO.File]::WriteAllText($Config, $c, (New-Object System.Text.UTF8Encoding($false)))
Ok "server.host=127.0.0.1 server.port=$Port"

Step '3/7 Node 24（dsh 要求 >=24.9）'
$nodeOk = $false
$n = Get-Command node -ErrorAction SilentlyContinue
if ($n) {
    try { $nv = (& node -v).Trim().TrimStart('v'); $maj = [int]($nv.Split('.')[0]); if ($maj -ge 24) { $nodeOk = $true } } catch {}
}
if ($nodeOk) { Ok "node $(& node -v)" }
else {
    Warn2 "下载便携 Node v24.10.0 -> $Deps\node"
    $zip = Join-Path $Deps 'node.zip'
    Get-Web 'https://npmmirror.com/mirrors/node/v24.10.0/node-v24.10.0-win-x64.zip' $zip
    $dir = Join-Path $Deps 'node'
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    Expand-Archive $zip $dir -Force
    $nodeDir = Join-Path $dir 'node-v24.10.0-win-x64'
    $env:PATH = "$nodeDir;$env:PATH"
    Ok "node $(& node -v)"
}

Step '5/7 GSL5（需 Java 17+）'
if (-not $SkipGsl5) {
    if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
        Warn2 "下载 Temurin 17 JRE -> $Deps\java"
        $jzip = Join-Path $Deps 'jre17.zip'
        Get-Web 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jre_x64_windows_hotspot_17.0.13_11.zip' $jzip
        $jdir = Join-Path $Deps 'java'
        if (Test-Path $jdir) { Remove-Item $jdir -Recurse -Force }
        Expand-Archive $jzip $jdir -Force
        $javaHome = (Get-ChildItem $jdir -Directory | Select-Object -First 1).FullName
        $env:PATH = "$javaHome\bin;$env:PATH"
    }
    if (Get-Command java -ErrorAction SilentlyContinue) {
        try { & (Join-Path $PSScriptRoot 'deploy-gsl5.ps1') } catch { Warn2 "GSL5 部署失败：$($_.Exception.Message)" }
    } else { Warn2 '缺 Java，跳过 GSL5' }
} else { Warn2 '跳过 GSL5' }

Step '6/7 vShell 与浏览器 MCP'
if (-not $SkipVShell) {
    try {
        $vsArgs = @{}
        if ($VShellBinary) { $vsArgs['Binary'] = $VShellBinary }
        & (Join-Path $PSScriptRoot 'deploy-vshell.ps1') @vsArgs
    }
    catch { Warn2 "vShell 未部署：$($_.Exception.Message)"; Warn2 '把服务端放到 integrations/vshell/server/ 后重跑 deploy-vshell 即可' }
}
if (-not $SkipBrowser) {
    try { & (Join-Path $PSScriptRoot 'setup-local-browser.ps1') }
    catch { Warn2 "本地浏览器 MCP 准备失败：$($_.Exception.Message)" }
}

Step '6.5/7 dsh + 平台联动（AGENTS/skills/MCP）'
if (-not $SkipDsh) {
    & (Join-Path $PSScriptRoot 'deploy-dsh.ps1') -Config $Config
} else {
    Warn2 '跳过 dsh，仅配置平台联动'
    & (Join-Path $PSScriptRoot 'setup-dsh-platform.ps1') -Config $Config
}

Step '7/7 启动平台并自检'
$base = "https://127.0.0.1:$Port"
$alive = $false
try { $code = (& curl.exe -sk -o NUL --max-time 3 -w '%{http_code}' "$base/login"); $alive = ($code -eq '200') } catch { $alive = $false }
if (-not $alive -and -not $NoStart) {
    Start-Process -FilePath $Bin -ArgumentList '--https' -WorkingDirectory $Root `
        -RedirectStandardOutput (Join-Path $Root 'chana-run.log') -RedirectStandardError (Join-Path $Root 'chana-run.err.log') -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 8
}
if ($NoStart) { Warn2 '按 --NoStart 跳过启动' }
$log = Join-Path $Root 'chana-run.log'
$pass = ''
if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'ADMIN SETUP' -Context 0,3 | Select-Object -Last 1
    if ($m) { $pm = $m.Context.PostContext | Select-String 'Password'; if ($pm) { $pass = ($pm.Line -split '\s+')[-1] } }
}
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    & $nodeCmd.Source (Join-Path $PSScriptRoot 'verify-stack.mjs') '--config' $Config
} else {
    Write-Host '未找到 node，跳过堆栈自检（安装 Node 后可运行 node scripts/verify-stack.mjs）' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '部署完成' -ForegroundColor Green
Write-Host "  平台:   $base/   账号 admin$($(if($pass){" / $pass"}))"
Write-Host "  vShell: $base/vshell/  (admin / admin123)"
Write-Host '  浏览器: 先在 Chrome 加载 vps-browser\extension，再在 MCP 管理启用 local-browser'
