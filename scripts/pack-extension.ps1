param(
    [string]$OutDir = '',
    [switch]$Open
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Ext = Join-Path $Root 'vps-browser\extension'
if (-not (Test-Path (Join-Path $Ext 'manifest.json'))) { throw "找不到扩展目录: $Ext" }
if (-not $OutDir) { $OutDir = Join-Path $Root 'dist' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$ver = (Get-Content (Join-Path $Ext 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
$zip = Join-Path $OutDir "chana-browser-extension-$ver.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
# 只打包目录内容，解压后 manifest.json 直接位于根目录，方便 Chrome「加载已解压的扩展程序」
Compress-Archive -Path (Join-Path $Ext '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "[完成] 浏览器扩展压缩包: $zip"
Write-Host '       用法: 解压到任意目录 -> Chrome chrome://extensions -> 开发者模式 -> 加载已解压的扩展程序 -> 选择解压后的文件夹'
if ($Open) { Start-Process explorer.exe -ArgumentList @("/select,$zip") }
