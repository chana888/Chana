@echo off
rem ChanaAgent 本地浏览器 MCP 桥启动脚本 (Windows)
rem 用法: 双击 start.bat 或在 cmd 运行（Ctrl+C 停止）
setlocal
cd /d "%~dp0..\vps-browser\server"
if not exist .runtime mkdir .runtime
if not exist .runtime\config.json (
  node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync('.runtime/config.json',JSON.stringify({token:c.randomBytes(32).toString('hex'),public_origin:'',platform_port:8082},null,2))"
  echo [init] 已生成随机访问令牌
)
node -e "const c=require('./.runtime/config.json');console.log('访问令牌:',c.token);console.log('平台接入: external_mcp.servers.local-browser { type: http, url: http://127.0.0.1:18862/mcp, headers: { X-Chana-Vps-Token: '+c.token+' } }')"
call npm install --omit=dev --no-audit --no-fund
echo 启动本地浏览器 MCP 桥 (127.0.0.1:18862)，Ctrl+C 停止
node chrome-bridge.cjs
