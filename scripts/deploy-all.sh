#!/usr/bin/env bash
# ChanaAgent 一键完整部署（Linux/macOS）
# 覆盖：平台二进制 → 配置 → dsh(含平台联动) → GSL5 → vShell → 本地/浏览器栈 → 启动 → 自检
# 用法: ./scripts/deploy-all.sh [--port 8080] [--no-dsh] [--no-gsl5] [--no-vshell] [--no-browser]
#                              [--vps-browser] [--no-start] [--deps-dir .deps] [--vshell-binary <path>] [--permission-mode danger-full-access]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8080
WITH_DSH=1; WITH_GSL5=1; WITH_VSHELL=1; WITH_BROWSER=1; VPS_BROWSER=0; START=1; VSHELL_BINARY=""; PERMISSION_MODE="danger-full-access"
DEPS="$ROOT/.deps"
API_RELEASE="https://github.com/chana888/Chana/releases/latest/download"

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --no-dsh) WITH_DSH=0; shift ;;
    --no-gsl5) WITH_GSL5=0; shift ;;
    --no-vshell) WITH_VSHELL=0; shift ;;
    --no-browser) WITH_BROWSER=0; shift ;;
    --vps-browser) VPS_BROWSER=1; shift ;;
    --no-start) START=0; shift ;;
    --vshell-binary) VSHELL_BINARY="$2"; shift 2 ;;
    --permission-mode) PERMISSION_MODE="$2"; shift 2 ;;
    --deps-dir) DEPS="$2"; shift 2 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

step(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok(){ printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn(){ printf '  \033[33m!\033[0m %s\n' "$*"; }
die(){ printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }
mkdir -p "$DEPS"

need_cmd(){ command -v "$1" >/dev/null 2>&1; }

download(){ # url out
  need_cmd curl || die "缺少 curl"; curl -fL --retry 3 "$1" -o "$2" || die "下载失败: $1"
}

step "0/7 检查基础工具"
need_cmd curl || die "需要 curl"
need_cmd tar || die "需要 tar"

step "1/7 准备平台二进制"
BIN="$ROOT/chana"
if [ -x "$BIN" ]; then ok "已存在 $BIN"
else
  if need_cmd go; then
    ( cd "$ROOT" && CGO_ENABLED=1 GOPROXY=https://goproxy.cn,direct go build -o chana ./cmd/server ) && ok "本地构建成功"
  else
    warn "未安装 Go，改从 GitHub Release 下载预编译二进制"
    download "$API_RELEASE/chana-linux-amd64" "$BIN" && chmod +x "$BIN" && ok "已下载 chana-linux-amd64"
  fi
  [ -x "$BIN" ] || die "平台二进制不可用"
fi

step "2/7 准备配置文件"
CONFIG="$ROOT/config.yaml"
[ -f "$CONFIG" ] || { cp "$ROOT/config.example.yaml" "$CONFIG"; ok "已生成 config.yaml（示例默认）"; }
python3 - "$CONFIG" "$PORT" <<'PY' 2>/dev/null || warn "config 端口未修改（可手动改 server.port）"
import re,sys
p,port=sys.argv[1],sys.argv[2]
s=open(p,encoding='utf-8').read()
s=re.sub(r'(?m)^(server:\n(?:  .*\n)*?  )port:.*$', lambda m: m.group(1)+f'port: {port}', s, count=1)
open(p,'w',encoding='utf-8').write(s)
PY
ok "server.port=$PORT"

step "3/7 Node 24（dsh 要求 >=24.9）"
NODE_OK=0
if need_cmd node; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$NODE_MAJOR" -ge 24 ] && NODE_OK=1
fi
if [ "$NODE_OK" -eq 1 ]; then ok "node $(node -v)"
else
  warn "安装便携 Node v24.10.0 → $DEPS/node"
  V=v24.10.0
  OS=$(uname -s); ARCH=$(uname -m)
  case "$OS:$ARCH" in
    Linux:x86_64) F="node-$V-linux-x64.tar.xz"; TARF="-xJf" ;;
    Linux:aarch64|Linux:arm64) F="node-$V-linux-arm64.tar.xz"; TARF="-xJf" ;;
    Darwin:x86_64) F="node-$V-darwin-x64.tar.gz"; TARF="-xzf" ;;
    Darwin:arm64) F="node-$V-darwin-arm64.tar.gz"; TARF="-xzf" ;;
    *) die "暂不支持的平台 $OS/$ARCH，请手动安装 Node >=24.9" ;;
  esac
  download "https://npmmirror.com/mirrors/node/$V/$F" "$DEPS/$F"
  mkdir -p "$DEPS/node" && tar $TARF "$DEPS/$F" -C "$DEPS/node" --strip-components=1
  export PATH="$DEPS/node/bin:$PATH"
  ok "node $(node -v)"
fi

step "5/7 GSL5（WebShell MCP，需 Java 17+）"
if [ "$WITH_GSL5" -eq 1 ]; then
  if ! need_cmd java; then
    warn "未检测到 java，尝试安装 JRE 17"
    if need_cmd apt-get; then sudo apt-get install -y openjdk-17-jre-headless || true
    elif need_cmd dnf; then sudo dnf install -y java-17-openjdk-headless || true; fi
  fi
  if need_cmd java; then bash "$ROOT/scripts/deploy-gsl5.sh" || warn "GSL5 部署失败（可稍后重试）"; else warn "缺 Java，跳过 GSL5"; fi
else warn "跳过 GSL5"; fi

step "6/7 vShell 与浏览器 MCP"
if [ "$WITH_VSHELL" -eq 1 ]; then
  if [ "$(uname -s)" = "Linux" ]; then
    if [ -n "$VSHELL_BINARY" ]; then bash "$ROOT/scripts/deploy-vshell.sh" --binary "$VSHELL_BINARY" || warn "vShell 部署失败（可稍后重试）"; else bash "$ROOT/scripts/deploy-vshell.sh" || warn "vShell 部署失败（可稍后重试）"; fi
  else
    warn "仓库内置 vShell 为 Linux 版；macOS 请使用官方对应版本并 --no-vshell"
  fi
fi
if [ "$WITH_BROWSER" -eq 1 ]; then
  if [ "$VPS_BROWSER" -eq 1 ]; then
    warn "VPS 浏览器栈需 root + nginx，执行: sudo PLATFORM_TLS=1 bash vps-browser/install.sh --origin https://<host> --platform-port $PORT --with-nginx"
  else
    bash "$ROOT/scripts/setup-local-browser.sh" || warn "本地浏览器 MCP 准备失败（可稍后重试）"
  fi
fi

step "6.5/7 dsh + 平台联动（AGENTS/skills/MCP）"
if [ "$WITH_DSH" -eq 1 ]; then
  bash "$ROOT/scripts/deploy-dsh.sh" --config "$CONFIG" --permission-mode "$PERMISSION_MODE"
else
  warn "跳过 dsh（--no-dsh）；仅配置平台联动"
  bash "$ROOT/scripts/setup-dsh-platform.sh" --config "$CONFIG" || true
fi

step "7/7 启动平台并自检"
if [ "$START" -eq 1 ]; then
  if curl -sk -o /dev/null "https://127.0.0.1:$PORT/login" 2>/dev/null; then
    ok "平台已在运行（127.0.0.1:$PORT）"
  else
    ( cd "$ROOT" && nohup ./chana --https > chana-run.log 2>&1 & echo $! > chana.pid )
    sleep 8
  fi
fi
if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/verify-stack.mjs" --config "$CONFIG" || true
else
  warn "未找到 node，跳过堆栈自检（安装 Node 后可运行 node scripts/verify-stack.mjs）"
fi

PASS=$(grep -a -A3 'ADMIN SETUP' "$ROOT/chana-run.log" 2>/dev/null | grep -a Password | tail -1 | awk '{print $2}' || true)
printf '\n\033[1;32m部署完成\033[0m\n'
printf '  平台:   https://127.0.0.1:%s/  账号 admin%s\n' "$PORT" "${PASS:+ / $PASS}"
printf '  vShell: https://127.0.0.1:%s/vshell/  (admin / admin123)\n' "$PORT"
printf '  浏览器: 先在 Chrome 加载 vps-browser/extension，再在 MCP 管理启用 local-browser\n'
printf '  自检:   curl -sk https://127.0.0.1:%s/login -o /dev/null -w "%%{http_code}\n"\n' "$PORT"
