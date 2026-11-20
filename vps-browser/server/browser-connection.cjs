/* 浏览器连接自愈：先释放本程序或旧 Blueprint 占用，再建立本机连接。 */
const { spawn } = require('node:child_process');
const path = require('node:path');

function isConnectionError(value) {
  return /port_in_use|EADDRINUSE|Extension not connected|WebSocket.*(?:closed|disconnected)|another (?:browser|debugger).*?(?:connected|attached)|already attached.*another|debugger.*(?:occupied|in use)|connection.*closed/i.test(String(value || ''));
}
function resultError(result) {
  if (result?.success === false) return result.message || result.error || 'Blueprint 操作失败';
  if (result?.isError) return (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return '';
}
function releasePreviousOwner(port = 5555) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'release-blueprint.ps1'),
      '-Port', String(port), '-ExcludeProcessId', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('检查旧 Blueprint 占用超时')); }, 6000);
    child.stdout.on('data', b => { output += b.toString(); });
    child.stderr.on('data', () => {});
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('5555 被非 Blueprint 程序占用，或无法释放旧连接；未停止其他程序'));
      try { resolve(JSON.parse(output.replace(/^\uFEFF/, '').trim())); }
      catch { reject(new Error('无法读取旧 Blueprint 占用检查结果')); }
    });
  });
}

class BrowserConnection {
  constructor({ backend, enable, disable, release = releasePreviousOwner, sleep = ms => new Promise(r => setTimeout(r, ms)), clock = Date.now }) {
    this.backend = backend; this.enable = enable; this.disable = disable; this.release = release;
    this.sleep = sleep; this.clock = clock; this.recovering = null; this.lastRecovery = -Infinity;
    this.recovery = { attempts: 0, releasedPreviousOwner: false, connected: false, error: '' };
  }
  connected() {
    const connected = Boolean(this.backend._extensionServer?.isConnected());
    this.recovery.connected = connected;
    if (connected) this.recovery.error = '';
    return connected;
  }
  async start() {
    let enabled;
    try { enabled = await this.enable(); }
    catch (e) { if (!isConnectionError(e.message)) throw e; enabled = { success: false, message: e.message }; }
    if (resultError(enabled)) {
      if (!isConnectionError(resultError(enabled))) throw new Error(resultError(enabled));
      const released = await this.release();
      this.recovery.releasedPreviousOwner = Boolean(released.released);
      await this.disable();
      enabled = await this.enable();
    }
    if (resultError(enabled)) throw new Error(resultError(enabled));
  }
  async recover(force = false) {
    if (this.recovering) return this.recovering;
    if (!force && this.clock() - this.lastRecovery < 10000) return this.connected();
    this.lastRecovery = this.clock();
    this.recovering = (async () => {
      this.recovery.attempts++; this.recovery.error = '';
      try {
        // disable 会通知扩展解除旧 debugger 附加，不关闭 Chrome 或用户标签页。
        await this.disable();
        await this.start();
        // 扩展的默认自动重连间隔为 5 秒，必须等过这一周期再判断失败。
        for (let i = 0; i < 43 && !this.connected(); i++) await this.sleep(150);
        this.recovery.connected = this.connected();
        if (!this.recovery.connected) this.recovery.error = '旧连接已释放，本机服务已重启，Chrome 扩展尚未重连';
        return this.recovery.connected;
      } catch (e) { this.recovery.connected = false; this.recovery.error = e.message; return false; }
    })().finally(() => { this.recovering = null; });
    return this.recovering;
  }
  async ensure() {
    if (this.connected()) return;
    if (await this.recover()) return;
    throw new Error(this.recovery.error || '已尝试释放旧连接并重连，请确认 Chrome 与 Blueprint 扩展正在运行');
  }
}
module.exports = { BrowserConnection, isConnectionError, resultError, releasePreviousOwner };
