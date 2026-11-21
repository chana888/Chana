@echo off
rem 本地浏览器 MCP 一键准备（Windows）：安装 12306 native host + 启动 18862 桥
rem 首次使用请先按提示在 chrome://extensions 加载 vps-browser\extension
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\setup-local-browser.ps1"
pause
