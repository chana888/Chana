#!/usr/bin/env bash
# 弹药库第三方工具一键安装（自带的自研工具在 ammo/tools/ 无需安装）
# 用法: bash ammo/setup-ammo.sh [--nuclei-templates]
set -e
cd "$(dirname "$0")/.."
echo "[1/3] Python 工具（sqlmap / dirsearch / httpx）"
python3 -m pip install --user sqlmap dirsearch 2>/dev/null || pip3 install sqlmap dirsearch
echo "[2/3] nuclei 二进制"
if ! command -v nuclei >/dev/null 2>&1; then
  VER=$(curl -s https://api.github.com/repos/projectdiscovery/nuclei/releases/latest | grep -oP '"tag_name": "\K[^"]+' || echo v3.4.2)
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) PLAT=linux_amd64 ;;
    Darwin-arm64) PLAT=darwin_arm64 ;;
    Darwin-x86_64) PLAT=darwin_amd64 ;;
    *) PLAT=linux_amd64 ;;
  esac
  curl -sL "https://github.com/projectdiscovery/nuclei/releases/download/${VER}/nuclei_${VER#v}_${PLAT}.zip" -o /tmp/nuclei.zip
  (cd /tmp && unzip -o nuclei.zip nuclei && chmod +x nuclei && sudo mv nuclei /usr/local/bin/ 2>/dev/null || mv nuclei ~/.local/bin/ 2>/dev/null || true)
fi
if [ "${1:-}" = "--nuclei-templates" ]; then
  echo "[3/3] nuclei 模板库（约 600MB，公开镜像）"
  mkdir -p ammo/nuclei-templates
  git clone --depth 1 https://github.com/projectdiscovery/templates.git ammo/nuclei-templates/official 2>/dev/null || echo "模板下载失败：请参考 ammo/README.md 手动获取"
fi
echo "完成。nuclei 模板也可用: nuclei -update-templates"
