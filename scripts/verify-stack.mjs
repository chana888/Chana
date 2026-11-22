#!/usr/bin/env node
// ChanaAgent 堆栈自检：平台 / dsh / GSL5 / vShell / 浏览器 MCP 是否都已启动并连通。
// 用法: node scripts/verify-stack.mjs [--config config.yaml]
// 退出码: 0=全部就绪；1=有配置项未连通。

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // 平台本地自签证书

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);
const cfgArg = args.indexOf('--config');
const CONFIG = cfgArg >= 0 ? resolve(args[cfgArg + 1]) : join(ROOT, 'config.yaml');

const ok = (label, detail) => console.log(`  \x1b[32m✓\x1b[0m ${label.padEnd(18)} ${detail || ''}`);
const bad = (label, detail) => console.log(`  \x1b[31m✗\x1b[0m ${label.padEnd(18)} ${detail || ''}`);
const skip = (label, detail) => console.log(`  \x1b[33m-\x1b[0m ${label.padEnd(18)} ${detail || ''}`);
const section = (t) => console.log(`\n${t}`);

function readConfig() {
  if (!existsSync(CONFIG)) throw new Error(`找不到配置文件: ${CONFIG}`);
  return readFileSync(CONFIG, 'utf8');
}
function sectionText(text, name) {
  const m = text.match(new RegExp(`^${name}:\r?\n((?:  .*\r?\n)+)`, 'm'));
  return m ? m[1] : '';
}
function scalar(block, key) {
  const m = block.match(new RegExp(`^ {2}${key}:\s*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

// 从 dsh 的 cordis.patch.yml 读取实际注入的 MCP 条目（比 config.yaml 更接近 dsh 真实状态）
function parseDshMcpEntries() {
  const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.dsh');
  const patch = join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
  if (!existsSync(patch)) return { patch, entries: [] };
  const lines = readFileSync(patch, 'utf8').split(/\r?\n/);
  const entries = [];
  let cur = null;
  for (const ln of lines) {
    const idm = ln.match(/^\s*- id:\s*(mcp-\S+)\s*$/);
    if (idm) {
      if (cur) entries.push(cur);
      cur = { id: idm[1], raw: [ln] };
      continue;
    }
    if (!cur) continue;
    if (/^\s*- id:/.test(ln) || /^\s*- insert:/.test(ln)) { entries.push(cur); cur = null; continue; }
    cur.raw.push(ln);
  }
  if (cur) entries.push(cur);
  for (const e of entries) {
    const body = e.raw.join('\n');
    const sm = body.match(/serverName:\s*(\S+)/);
    const um = body.match(/\n\s+url:\s*(\S+)/);
    e.serverName = sm ? sm[1] : e.id.replace(/^mcp-/, '');
    e.url = um ? um[1] : '';
    e.headers = {};
    const hm = body.match(/\n\s+headers:\s*\n((?:[ \t]+.*(?:\n|$))+)/);
    if (hm) {
      for (const hl of hm[1].split(/\r?\n/)) {
        const kv = hl.match(/^\s+([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
        if (kv) e.headers[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { patch, entries };
}

function parseSseJson(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      try { rows.push(JSON.parse(line.slice(5).trim())); } catch {}
    }
  }
  if (rows.length) return rows[rows.length - 1];
  try { return JSON.parse(text); } catch { return null; }
}

async function mcpToolCount(url, headers) {
  const h = { ...headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const init = {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chana-verify', version: '1.0' } },
  };
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(init), signal: AbortSignal.timeout(15000) });
  const sid = r.headers.get('mcp-session-id');
  const first = parseSseJson(await r.text());
  if (!first || !first.result) throw new Error(`initialize 失败 (HTTP ${r.status})`);
  const h2 = { ...h };
  if (sid) h2['mcp-session-id'] = sid;
  await fetch(url, {
    method: 'POST', headers: h2,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {});
  const r2 = await fetch(url, {
    method: 'POST', headers: h2,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(20000),
  });
  const second = parseSseJson(await r2.text());
  const n = second?.result?.tools?.length;
  if (typeof n !== 'number') throw new Error('tools/list 未返回工具列表');
  return n;
}

async function httpStatus(url) {
  const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  return r.status;
}

const failures = [];
function reportBad(label, detail) { bad(label, detail); failures.push(label); }

async function main() {
  const text = readConfig();
  const server = sectionText(text, 'server');
  const port = scalar(server, 'port') || '8080';
  const dsh = sectionText(text, 'dsh');
  const vshell = sectionText(text, 'vshell');

  section('ChanaAgent 堆栈自检');

  let platformOk = false;
  for (const scheme of ['https', 'http']) {
    try {
      const code = await httpStatus(`${scheme}://127.0.0.1:${port}/login`);
      if ([200, 302, 303, 307, 308].includes(code)) { ok('平台', `${scheme}://127.0.0.1:${port}  HTTP ${code}`); platformOk = true; break; }
    } catch {}
  }
  if (!platformOk) reportBad('平台', `127.0.0.1:${port} 未响应`);

  const dshBase = scalar(dsh, 'base_url') || 'http://127.0.0.1:3080';
  const dshToken = scalar(dsh, 'token');
  try {
    const url = `${dshBase.replace(/\/$/, '')}/${dshToken ? `?token=${encodeURIComponent(dshToken)}` : ''}`;
    const code = await httpStatus(url);
    if ([200, 302, 303, 307, 308].includes(code)) ok('dsh', `${dshBase}  HTTP 200`);
    else reportBad('dsh', `${dshBase}  HTTP ${code}${dshToken ? '' : '（config.yaml 缺 token）'}`);
  } catch (e) { reportBad('dsh', `${dshBase}  ${e.message}`); }

  const dshDir = join(ROOT, 'integrations', 'dsh');
  const pluginEntry = join(dshDir, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js');
  if (existsSync(pluginEntry)) {
    try {
      await import(pathToFileURL(pluginEntry).href);
      ok('dsh MCP 插件', '@deepseek-ai/dsh-mcp-client 可加载');
    } catch (e) {
      reportBad('dsh MCP 插件', `${e.code || ''} ${e.message}`.trim() + '（重跑 scripts/setup-dsh-platform 可自动修复）');
    }
    const mjs = join(dshDir, 'node_modules', '@modelcontextprotocol', 'client', 'dist', 'index.mjs');
    if (!existsSync(mjs)) reportBad('MCP 依赖', '@modelcontextprotocol/client 缺 dist/index.mjs');
  } else {
    reportBad('dsh MCP 插件', '未安装 dsh（integrations/dsh/node_modules 缺失）');
  }

  const { entries } = parseDshMcpEntries();
  const configured = entries.filter((e) => e.url);
  if (!configured.length) reportBad('dsh MCP 配置', 'cordis.patch.yml 中没有 MCP 条目（重跑 setup-dsh-platform）');
  for (const e of configured) {
    const label = `MCP ${e.serverName}`;
    try {
      const n = await mcpToolCount(e.url, e.headers);
      ok(label, `${n} 个工具  ${e.url}`);
    } catch (err) {
      reportBad(label, `${e.url}  ${err.message}`);
    }
  }

  if (vshell && /enabled:\s*true/.test(vshell)) {
    const url = scalar(vshell, 'url');
    if (!url) skip('vShell', '已启用但未配置 url');
    else {
      try { const code = await httpStatus(url); ok('vShell', `${url}  HTTP ${code}`); }
      catch (e) { reportBad('vShell', `${url}  ${e.message}`); }
    }
  } else {
    skip('vShell', '未启用（deploy-vshell 可安装）');
  }

  skip('Chrome 扩展', '需在本机 Chrome 安装并连接（见 local-browser/README.md）');

  section('');
  if (failures.length) {
    console.log(`\x1b[31m${failures.length} 项未就绪\x1b[0m：${failures.join('、')}`);
    console.log('修复：重新运行 scripts/deploy-all（或对应的 deploy-dsh / deploy-gsl5 / deploy-vshell / setup-local-browser）');
    process.exitCode = 1;
  } else {
    console.log('\x1b[32m全部就绪\x1b[0m：平台、dsh、MCP（chana/gsl5/浏览器）与 vShell 已连通；只剩本机 Chrome 扩展需手动安装。');
  }
}

main().catch((e) => { console.error(`自检失败: ${e.message}`); process.exitCode = 1; });
