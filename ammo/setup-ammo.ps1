# 弹药库第三方工具一键安装（Windows）
# 用法: powershell -File ammo\setup-ammo.ps1 [-NucleiTemplates]
param([switch]$NucleiTemplates)
Set-Location "$PSScriptRoot\.."
Write-Host "[1/3] Python 工具（sqlmap / dirsearch）"
python -m pip install sqlmap dirsearch
Write-Host "[2/3] nuclei 二进制"
if (-not (Get-Command nuclei -ErrorAction SilentlyContinue)) {
  $ver = (Invoke-RestMethod https://api.github.com/repos/projectdiscovery/nuclei/releases/latest).tag_name
  $url = "https://github.com/projectdiscovery/nuclei/releases/download/$ver/nuclei_$($ver.TrimStart('v'))_windows_amd64.zip"
  Invoke-WebRequest $url -OutFile "$env:TEMP\nuclei.zip"
  Expand-Archive "$env:TEMP\nuclei.zip" -DestinationPath "$env:TEMP\nuclei-bin" -Force
  Move-Item "$env:TEMP\nuclei-bin\nuclei.exe" ".\ammo\tools\nuclei.exe" -Force
  Write-Host "nuclei 已装到 ammo\tools\nuclei.exe"
}
if ($NucleiTemplates) {
  Write-Host "[3/3] nuclei 模板库（约 600MB）"
  New-Item -ItemType Directory -Force ammo\nuclei-templates | Out-Null
  git clone --depth 1 https://github.com/projectdiscovery/templates.git ammo\nuclei-templates\official
}
Write-Host "完成"
