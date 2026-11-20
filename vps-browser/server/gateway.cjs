/* 复用平台 Cookie 鉴权，不把平台令牌或 MCP 凭据发送给远程桌面网页。 */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {WebSocket,WebSocketServer}=require('ws');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'.runtime/config.json')));
const origin=cfg.public_origin||'http://127.0.0.1:8080';
const cache=new Map();
const inflight=new Map();
function request(port,route,headers={},body,timeout=3000) {
  return new Promise((resolve,reject)=>{
    const r=http.request({host:'127.0.0.1',port,path:route,method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}},res=>{
      let data='';res.on('data',p=>{data+=p;if(data.length>1048576)r.destroy();});res.on('end',()=>{let json={};try{json=JSON.parse(data);}catch{}resolve({code:res.statusCode,json});});
    });r.setTimeout(timeout,()=>r.destroy(new Error('本地服务超时')));r.on('error',reject);if(body)r.write(body);r.end();
  });
}
async function validate(token) {
  // 网络抖动重试一次；确定性失败（非200/无admin角色）不重试。
  for(let attempt=0;attempt<2;attempt++){
    try{
      const result=await request(cfg.platform_port||8082,'/api/auth/validate',{Authorization:'Bearer '+token});
      if(result.code===200 && result.json.roles?.includes('admin'))
        return Math.min(Date.now()+10000,Date.parse(result.json.expires_at)||Infinity)||Date.now()+10000;
      return null;
    }catch(e){if(attempt>=1)return null;}
  }
  return null;
}
async function authorized(req,force=false) {
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-chana-session='))?.slice('__Host-chana-session='.length);
  const dbg={m:req.method,u:req.url,t:token?token.slice(0,8):'NONE',f:force,cache:cache.get(token)?.until>Date.now()};
  const r=await authorizedInner(req,force,token);
  dbg.ok=r;console.log('[AUTH]',JSON.stringify(dbg));
  return r;
}
async function authorizedInner(req,force,token) {
  if(!token || token.length>4096)return false;
  // 短缓存避免每个桌面资源重复校验；令牌仍仅保留在服务进程内存。
  const previous=cache.get(token);if(!force&&previous?.until>Date.now())return true;
  // 同 token 并发校验去重：页面加载时几十个静态资源同时到达，只发一次 validate。
  let p=inflight.get(token);
  if(!p){
    p=validate(token).then(until=>{
      inflight.delete(token);
      if(until===null){cache.delete(token);return false;}
      if(cache.size>256)cache.clear();
      cache.set(token,{until});return true;
    }).catch(()=>{inflight.delete(token);return false;});
    inflight.set(token,p);
  }
  return await p;
}
const bridge=(route,body)=>request(18862,route,{'X-Chana-Vps-Token':cfg.token},body?JSON.stringify(body):undefined,route==='/control'?9000:3000);
function send(res,code,data,type='application/json; charset=utf-8'){
  res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"});res.end(data);
}
async function body(req,limit=65536){let bytes=0;const parts=[];for await(const p of req){bytes+=p.length;if(bytes>limit)throw new Error('输入过长');parts.push(p);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
/* 远程浏览器所在 X 桌面的剪贴板读写：写=本地→远程，读=远程→本地。 */
const xenv={...process.env,DISPLAY:':97',XAUTHORITY:'/var/lib/chana-browser/.Xauthority'};
function clipWrite(text){
  // uid992+node 子进程 execve 全部 EACCES（2026-11-14 实证，根因未明），改由 root 助手代执行
  return new Promise((resolve,reject)=>{
    const r=http.request({host:'127.0.0.1',port:18865,path:'/write',method:'POST',headers:{'Content-Length':Buffer.byteLength(text)}},res=>{
      res.resume();res.on('end',()=>res.statusCode===204?resolve():reject(new Error('helper '+res.statusCode)));
    });r.setTimeout(4000,()=>{r.destroy();reject(new Error('helper超时'));});r.on('error',reject);r.end(text);
  });
}
function clipRead(){
  return new Promise((resolve,reject)=>{
    http.get({host:'127.0.0.1',port:18865,path:'/read'},res=>{
      const parts=[];let bytes=0;
      res.on('data',p=>{bytes+=p.length;if(bytes>262144){res.destroy();return reject(new Error('内容过大'));}parts.push(p);});
      res.on('end',()=>{
        if(res.statusCode!==200)return reject(new Error('helper '+res.statusCode));
        const buf=Buffer.concat(parts);
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{return resolve(null);}
        if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))return resolve(null);
        resolve(text);
      });
    }).on('error',reject);
  });
}
const server=http.createServer(async(req,res)=>{
  try{
    if(!await authorized(req)) {
      if(req.url==='/'&&req.method==='GET'){res.writeHead(302,{Location:'/login?next=%2Fbrowser%2F','Cache-Control':'no-store'});res.end();}
      else send(res,401,'{}');return;
    }
    if(req.url==='/auth')return send(res,204,'');
    if(req.method==='POST') {
      if(req.headers.origin!==origin)return send(res,403,'{}');
      const data=await body(req,req.url==='/clipboard'?262144:65536);
      if(req.url==='/control') {
        if(!['pause','resume'].includes(data.action))return send(res,400,'{}');
        const r=await bridge('/control',{action:data.action,reason:'用户在远程浏览器中手动操作'});return send(res,r.code,JSON.stringify(r.json));
      }
      if(req.url==='/clipboard') {
        if(typeof data.text!=='string')return send(res,400,'{}');
        await clipWrite(data.text);
      const back=await clipRead().catch(()=>null);
      console.error('[CLIPW] 写后回读:', JSON.stringify(String(back==null?'NULL':back).slice(0,40)));
      return send(res,204,'');
      }
      return send(res,404,'{}');
    }
    if(req.method!=='GET')return send(res,405,'{}');
    if(req.url==='/status'){const r=await bridge('/status');return send(res,r.code,JSON.stringify(r.json));}
    if(req.url==='/clipboard') {
      const text=await clipRead();
      if(text===null)return send(res,415,JSON.stringify({error:'远程剪贴板当前不是文本内容（可能是图片或文件）'}));
      return send(res,200,JSON.stringify({text}));
    }
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/') {
      const r=await bridge('/control',{action:'pause',reason:'用户已打开 VPS 浏览器，等待人工操作'});
      if(r.code!==200)return send(res,503,'浏览器工具暂未运行','text/plain; charset=utf-8');
      return send(res,200,fs.readFileSync(path.join(__dirname,'viewer.html')),'text/html; charset=utf-8');
    }
    let target;
    if(pathname==='/viewer.js')target=path.join(__dirname,'viewer.js');
    else if(pathname.startsWith('/assets/')) {
      const root='/usr/share/novnc/';target=path.resolve(root,decodeURIComponent(pathname.slice(8)));
      if(!target.startsWith(root))return send(res,403,'{}');
    }else return send(res,404,'{}');
    if(!fs.existsSync(target)||!fs.statSync(target).isFile())return send(res,404,'{}');
    const mime={'.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
    send(res,200,fs.readFileSync(target),mime[path.extname(target)]||'application/octet-stream');
  }catch(e){console.error('[CLIP-DIAG]', (e&&e.message)||e, (e&&e.stack||'').split(String.fromCharCode(10)).slice(0,2).join(' | '));send(res,503,JSON.stringify({error:'远程浏览器服务暂不可用，请刷新重试'}));}
});
// 长连接也由服务器持续鉴权，不能依赖网页自觉退出。
const websocketServer=new WebSocketServer({noServer:true,maxPayload:8*1024*1024});
const desktopConnections=new Set();
server.on('upgrade',async(req,socket,head)=>{
  const reject=code=>{socket.end(`HTTP/1.1 ${code} ${code===401?'Unauthorized':code===429?'Too Many Requests':'Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);};
  try{
    if(req.url!=='/ws'||req.headers.origin!==origin)return reject(403);
    if(!await authorized(req,true))return reject(401);
    if(desktopConnections.size>=4)return reject(429);
    websocketServer.handleUpgrade(req,socket,head,client=>{
      desktopConnections.add(client);
      const upstream=new WebSocket('ws://127.0.0.1:18864/',{handshakeTimeout:3000,maxPayload:8*1024*1024});
      let checking=false,timer,ended=false;
      const close=()=>{
        if(ended)return;ended=true;clearInterval(timer);desktopConnections.delete(client);
        client.terminate();upstream.terminate();
      };
      // 上游握手完成前客户端可能发送 RFB 数据，暂存少量数据以保持顺序。
      const pending=[];let pendingBytes=0;
      const transmit=(to,data,binary)=>{
        if(to.readyState!==WebSocket.OPEN)return;
        if(to.bufferedAmount>16*1024*1024)return close();
        to.send(data,{binary},error=>{if(error)close();});
      };
      client.on('message',(data,binary)=>{
        if(upstream.readyState===WebSocket.OPEN)transmit(upstream,data,binary);
        else {pendingBytes+=data.length;if(pendingBytes>65536)return close();pending.push([data,binary]);}
      });
      upstream.on('open',()=>{for(const [data,binary] of pending)transmit(upstream,data,binary);pending.length=0;});
      upstream.on('message',(data,binary)=>transmit(client,data,binary));
      client.on('close',close);client.on('error',close);upstream.on('close',close);upstream.on('error',close);
      timer=setInterval(async()=>{
        if(checking||ended)return;checking=true;
        try{if(!await authorized(req,true))close();}catch{close();}finally{checking=false;}
      },5000);timer.unref();
    });
  }catch{reject(403);}
});
server.listen(18863,'127.0.0.1',()=>console.log('VPS 远程浏览器入口已启动'));
