#!/usr/bin/env node
// MCP HTTP 兼容代理：把旧版 HTTP+SSE 服务端的 `202 Accepted + JSON-RPC body`
// 规范成 Streamable HTTP 客户端要求的 `200 OK + body`。
// GSL5 的 /message 就是这种旧语义，dsh 的 MCP 客户端会因 202 一直等到超时。
//
// 用法: node scripts/mcp-http-compat.mjs --listen 9124 --upstream http://127.0.0.1:9123/message
// 仅监听回环地址；透传所有请求头（含 Authorization），不解析业务内容。

import http from 'node:http';
import https from 'node:https';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const listenRaw = arg('--listen', '127.0.0.1:9124');
const upstreamRaw = arg('--upstream', 'http://127.0.0.1:9123/message');
const [listenHost, listenPortRaw] = listenRaw.includes(':')
  ? [listenRaw.slice(0, listenRaw.lastIndexOf(':')), listenRaw.slice(listenRaw.lastIndexOf(':') + 1)]
  : ['127.0.0.1', listenRaw];
const listenPort = Number(listenPortRaw);
const upstream = new URL(upstreamRaw);

if (!Number.isInteger(listenPort) || listenPort <= 0) {
  console.error(`[mcp-compat] 无效监听端口: ${listenRaw}`);
  process.exit(1);
}

const upstreamMod = upstream.protocol === 'https:' ? https : http;

function forward(req, res) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const up = upstreamMod.request(upstream, {
      method: req.method,
      headers,
      timeout: 120000,
    }, (upRes) => {
      const outHeaders = { ...upRes.headers };
      delete outHeaders['content-length'];
      const isJson = String(upRes.headers['content-type'] || '').includes('application/json');
      const status = upRes.statusCode || 502;
      if (status !== 202 || !isJson) {
        // 普通响应 / SSE 流：原样透传
        res.writeHead(status, outHeaders);
        upRes.pipe(res);
        return;
      }
      // 202 + JSON：读完整 body，若是合法 JSON-RPC 响应则改回 200
      const parts = [];
      upRes.on('data', (c) => parts.push(c));
      upRes.on('end', () => {
        const payload = Buffer.concat(parts);
        let normalized = status;
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          if (msg && (msg.result !== undefined || msg.error !== undefined || msg.method !== undefined)) normalized = 200;
        } catch { /* 非 JSON 就保持 202 */ }
        res.writeHead(normalized, outHeaders);
        res.end(payload);
      });
    });
    up.on('timeout', () => up.destroy(new Error('upstream timeout')));
    up.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `mcp-compat upstream: ${e.message}` }));
    });
    if (body.length) up.write(body);
    up.end();
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, upstream: upstreamRaw }));
    return;
  }
  forward(req, res);
});

server.on('error', (e) => {
  console.error(`[mcp-compat] 监听 ${listenHost}:${listenPort} 失败: ${e.message}`);
  process.exit(1);
});
server.listen(listenPort, listenHost, () => {
  console.log(`[mcp-compat] ${listenHost}:${listenPort} -> ${upstreamRaw}`);
});
