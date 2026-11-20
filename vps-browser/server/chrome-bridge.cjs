/* MCP Chrome Extension 的受限接入层：保留人工暂停和平台鉴权，浏览器动作由新插件执行。 */
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const TOOL_SCHEMAS = JSON.parse(fs.readFileSync(__dirname + '/tools-supported.json')); 
const runtime = path.join(__dirname, '.runtime');
const config = JSON.parse(fs.readFileSync(runtime + '/config.json'));
const statePath = runtime + '/state.json';
let state = { phase:'manual', reason:'浏览器插件迁移后等待用户交接', revision:0, tabId:null,
  ...(()=>{ try { return JSON.parse(fs.readFileSync(statePath)); } catch { return {}; } })() };
let queue = Promise.resolve();
let native, connecting;
const requestServers = new Set();
const names = new Set(TOOL_SCHEMAS.map(t => t.name));
const response = (v, isError=false) => ({ content:[{type:'text',text:typeof v==='string'?v:JSON.stringify(v)}],isError });
function matches(token) {
  const a=Buffer.from(token||''),b=Buffer.from(config.token);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function save() {
  fs.writeFileSync(statePath+'.tmp',JSON.stringify(state),{mode:0o600});
  fs.renameSync(statePath+'.tmp',statePath);
}
async function connected() {
  return new Promise(resolve => {
    const socket=net.connect(12306,'127.0.0.1');
    socket.setTimeout(1000);
    const done=value=>{socket.destroy();resolve(value);};
    socket.once('connect',()=>done(true)); socket.once('error',()=>done(false)); socket.once('timeout',()=>done(false));
  });
}
async function status() {
  return {...state,browserConnected:await connected(),source:'mcp-chrome-extension',gatewayTransport:'stateless-streamable-http',extensionVersion:'0.0.19',
    bridgeVersion:'1.0.32',extensionPatch:'iframe-docref-20261012',controlScope:'browser',viewerURL:process.env.CHANA_VIEWER_URL||'/browser/',requiresLocalComputer:false,
    capabilities:{pageInteraction:true,networkCapture:true,iframeTargeting:'explicit-tab-frame-and-document-ref',isolatedAccountContexts:false},
    note:'连通性只代表本机桥接可用；动作能力以自有页面验收和当前工具 schema 为准。'};
}
async function upstream() {
  if(native)return native;
  if(connecting)return connecting;
  connecting=(async()=>{
    const client=new Client({name:'chana-chrome-extension',version:'1.0.0'},{capabilities:{}});
    const transport=new StreamableHTTPClientTransport(new URL('http://127.0.0.1:12306/mcp'));
    client.onclose=()=>{if(native===client)native=undefined;};
    await client.connect(transport,{timeout:8000});
    native=client;return client;
  })().finally(()=>{connecting=undefined;});
  return connecting;
}
function control(action, reason='') {
  if(!['pause','resume'].includes(action))throw new Error('只支持 pause 或 resume');
  state.phase=action==='pause'?'manual':'ready';
  state.reason=action==='pause'?String(reason||'用户正在人工操作').slice(0,400):'';
  state.revision++;save();
}
function serial(fn) {const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;}
async function call(name,args={}) {
  if(name==='vps_browser_status')return response(await status());
  if(name==='request_manual_login'){control('pause',args.reason);return response(await status());}
  if(name==='vps_browser_control'){
    if(args.action==='reconnect'){
      if(native)await native.close().catch(()=>{});native=undefined;
      return response(await status());
    }
    control(args.action,args.reason);return response(await status());
  }
  if(!names.has(name))throw new Error('旧 Blueprint 工具已移除；请使用当前 MCP Chrome Extension 工具目录');
  return serial(async()=>{
    if(state.phase!=='ready')throw new Error('用户正在人工操作。用户完成并明确交接后才能恢复；暂停时不读取页面或执行动作。');
    const revision=state.revision;
    const client=await upstream();
    if(state.phase!=='ready'||revision!==state.revision)throw new Error('人工控制状态已变化，操作未发送');
    let result;
    try{result=await client.callTool({name,arguments:args},undefined,{timeout:8000});}
    catch(error){
      const httpStatus=error.code??error.data?.status;
      // 仅对协议层明确拒收的失效会话重建连接；超时和业务错误不自动重放。
      if(![400,404].includes(httpStatus)||!/session|MCP 会话不存在|Invalid MCP request/i.test(error.message||''))throw error;
      if(native===client)native=undefined;
      await client.close().catch(()=>{});
      if(state.phase!=='ready'||revision!==state.revision)throw new Error('人工状态已变化，未重发操作');
      const replacement=await upstream();
      if(state.phase!=='ready'||revision!==state.revision)throw new Error('人工状态已变化，未发送操作');
      result=await replacement.callTool({name,arguments:args},undefined,{timeout:8000});
    }
    if(state.phase!=='ready'||revision!==state.revision)return response('操作期间人工控制状态改变；核查是否已发送，禁止自动重试。',true);
    if(!result.isError){
      const text=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
      const match=/Tab ID: (\d+)/.exec(text);
      const tabId=result.structuredContent?.tabId ?? (match ? Number(match[1]) : args.tabId);
      if(Number.isInteger(tabId)&&state.tabId!==tabId){state.tabId=tabId;save();}
    }
    return result;
  });
}
const custom=[
 {name:'vps_browser_status',description:'只检查 MCP Chrome Extension 本机桥接与人工暂停状态，不读取目标页面。',inputSchema:{type:'object',properties:{}}},
 {name:'request_manual_login',description:'暂停并等待用户完成验证码、短信、扫码或手工操作。',inputSchema:{type:'object',properties:{reason:{type:'string'}},required:['reason']}},
 {name:'vps_browser_control',description:'pause 人工暂停；resume 仅在用户明确交接后恢复；reconnect 只重建桥接连接，不改变人工状态、不关闭 Chrome。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['pause','resume','reconnect']},reason:{type:'string'}},required:['action']}}
];
function server() {
 const s=new Server({name:'chana-mcp-chrome-extension',version:'1.0.0'},{capabilities:{tools:{}},instructions:'需要目标功能交互时使用 MCP Chrome Extension；离线分析、路径/端口探测与专项工具各自运行。快照支持明确 tabId/frameId；iframe 使用完整 ref 或真实 frameId；人工暂停时不操作页面；没有请求证据不允许直接构造验证请求。'});
 s.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...custom,...TOOL_SCHEMAS.map(t=>({...t,description:'MCP Chrome Extension（VPS）；先确认当前活跃页，人工暂停禁止操作。'+t.description}))]}));
 s.setRequestHandler(CallToolRequestSchema,async r=>{try{return await call(r.params.name,r.params.arguments||{});}catch(e){return response(e.message,true);}});
 return s;
}
function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const listener=http.createServer(async(req,res)=>{
 try{
  if(!['127.0.0.1:18862','localhost:18862'].includes(req.headers.host)||req.headers.origin)return json(res,403,{error:'禁止网页直接连接 MCP'});
  if(!matches(req.headers['x-chana-vps-token']))return json(res,401,{error:'连接未认证'});
  let body;
  if(req.method==='POST'){
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8*1024*1024)throw new Error('输入过大');chunks.push(chunk);}
   body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  }
  if(req.url==='/status'&&req.method==='GET')return json(res,200,await status());
  if(req.url==='/control'&&req.method==='POST'){
   control(body.action,body.reason);return json(res,200,await status());
  }
  if(req.url!=='/mcp')return json(res,404,{});
  // HTTP 工具请求独立处理，重启后仍接受已认证客户端的旧会话头。
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'此接入层使用无状态 Streamable HTTP，请通过 POST 调用'});}
  const s=server();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  requestServers.add(s);
  res.once('close',()=>{requestServers.delete(s);void s.close().catch(()=>{});});
  await s.connect(transport);await transport.handleRequest(req,res,body);
 }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.end();}
});
listener.listen(18862,'127.0.0.1',()=>console.log('MCP Chrome Extension 接入层已启动'));
async function stop(){listener.close();await Promise.allSettled([...requestServers].map(s=>s.close()));if(native)await native.close().catch(()=>{});process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
