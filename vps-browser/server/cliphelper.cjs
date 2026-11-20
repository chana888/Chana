// cliphelper.cjs — 剪贴板助手（root 运行）：代 gateway 执行 xclip 读写
// 背景：uid992 + node 的子进程 execve 全部 EACCES（原因未明，landlock 嫌疑），
// root 上下文 spawn 正常，故由本服务代劳。仅监听 127.0.0.1，无鉴权（本机回环）。
const http = require('http');
const { spawn } = require('child_process');
const xenv = { ...process.env, DISPLAY: ':97', XAUTHORITY: '/var/lib/chana-browser/.Xauthority' };

function clipWrite(text) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/xclip', ['-selection', 'clipboard', '-in'], { env: xenv, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('写入超时')); }, 3000);
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('xclip code=' + code)); });
    child.stdin.end(text);
  });
}
function clipRead() {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/xclip', ['-selection', 'clipboard', '-out'], { env: xenv, stdio: ['ignore', 'pipe', 'ignore'] });
    const parts = []; let bytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('读取超时')); }, 3000);
    child.stdout.on('data', p => { bytes += p.length; if (bytes > 262144) { child.kill(); reject(new Error('内容过大')); return; } parts.push(p); });
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timer); code !== 0 ? reject(new Error('xclip code=' + code)) : resolve(Buffer.concat(parts)); });
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && req.url === '/write') {
    let body = '';
    for await (const p of req) { body += p; if (body.length > 262144) break; }
    try { await clipWrite(body); res.writeHead(204).end(); }
    catch (e) { res.writeHead(502).end(String(e.message)); }
    return;
  }
  if (req.method === 'GET' && req.url === '/read') {
    try { const buf = await clipRead(); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(buf); }
    catch (e) { res.writeHead(502).end(String(e.message)); }
    return;
  }
  res.writeHead(404).end();
}).listen(18865, '127.0.0.1', () => console.log('cliphelper 已启动 127.0.0.1:18865'));
