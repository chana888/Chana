/* 基于 Blueprint 已捕获请求的详情、证据导出与浏览器内改包重放。 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function headersObject(input={}) {
  const map=new Map();
  const pairs=Array.isArray(input)?input.map(h=>[h.name,h.value]):Object.entries(input);
  for(const [name,value] of pairs)if(name&&!name.startsWith(':'))map.set(name.toLowerCase(),[name,String(value)]);
  return Object.fromEntries(map.values());
}
function header(headers,name){return Object.entries(headers).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1];}
const browserManaged=/^(cookie|cookie2|host|connection|content-length|transfer-encoding|origin|referer|accept-encoding|upgrade|proxy-.*|sec-.*)$/i;
function prepareReplay(record,args={}) {
  const original=new URL(record.url),url=new URL(args.url||record.url);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==original.origin||url.username||url.password)throw new Error('重放仅允许修改已捕获请求的同源地址，不能把认证信息发送到其他站点');
  for(const [key,value] of Object.entries(args.query||{})) {
    url.searchParams.delete(key);
    if(value!==null)for(const v of Array.isArray(value)?value:[value])url.searchParams.append(key,String(v));
  }
  const headers=headersObject(record.requestHeaders);
  for(const [name,value] of Object.entries(args.headers||{})) {
    if(browserManaged.test(name))throw new Error('Cookie、Host、Origin 等由浏览器管理，无法手工覆写或移除；无 Cookie 对照用 credentials=omit');
    if(/[\r\n]/.test(name+String(value)))throw new Error('浏览器重放不支持原始头部注入');
    const previous=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());if(previous)delete headers[previous];
    if(value!==null)headers[name]=String(value);
  }
  const managed=[];
  for(const name of Object.keys(headers))if(browserManaged.test(name)) {
    managed.push(name);delete headers[name];
  }
  const method=String(args.method||record.method).toUpperCase();if(!/^[A-Z]+$/.test(method))throw new Error('请求方法无效');
  const body=args.body!==undefined?args.body:record.bodyText;
  if(!['GET','HEAD'].includes(method)&&/^multipart\/form-data/i.test(header(headers,'content-type')||''))throw new Error('文件和 multipart 请求可能缺少原始字节，请通过页面上传或专用改包工具验证，不能用字符串重放冒充原始文件包');
  if(!['GET','HEAD'].includes(method)&&body===undefined&&record.bodyUnavailable)throw new Error('原请求正文未保留，不能静默按空请求重放；请重新捕获正常请求');
  const options={method,headers,credentials:args.credentials||'include',redirect:'manual'};
  if(!['include','omit'].includes(options.credentials))throw new Error('凭据模式无效');
  if(body!==undefined&&!['GET','HEAD'].includes(method))options.body=body;
  return {url:url.href,options,browserManagedHeaders:managed};
}
function rawRequest(record) {
  const url=new URL(record.url),headers=headersObject(record.requestHeaders);
  for(const k of Object.keys(headers))if(/^(host|content-length|transfer-encoding|connection)$/i.test(k))delete headers[k];
  const body=record.bodyText??'';headers.Host=url.host;
  if(body||!['GET','HEAD'].includes(record.method))headers['Content-Length']=String(Buffer.byteLength(body));
  return `${record.method} ${url.pathname+url.search} HTTP/1.1\r\n`+Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n'+body;
}
class RequestTools {
  constructor({backend,browserCall,assertReady,evidenceDir}) {Object.assign(this,{backend,browserCall,assertReady,evidenceDir});}
  async command(name,args) {
    this.assertReady();let timer;
    try{return await Promise.race([this.backend._extensionServer.sendCommand(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Blueprint 请求读取超时')),2500);})]);}
    finally{clearTimeout(timer);}
  }
  async capture(requestId,{response=true,maxBytes=65536,jsonPath}={}) {
    if(typeof requestId!=='string'||!requestId)throw new Error('请提供当前标签页 list 返回的 requestId');
    const r=await this.command('getNetworkRequests',{});
    if(r.noTabAttached)throw new Error('尚未附加标签页，请先 browser_tabs 附加目标页');
    const request=r.requests?.find(x=>x.requestId===requestId);if(!request)throw new Error('该请求已过期或不属于当前标签页，请重新 list，不要混用其他标签页或账号的请求');
    const record={...request,requestHeaders:headersObject(request.requestHeaders),responseHeaders:headersObject(request.responseHeaders)};
    if(typeof request.requestBody==='string')record.bodyText=request.requestBody;
    else if(request.requestBody?.formData)record.bodyUnavailable=true;
    else if(request.hasPostData||['POST','PUT','PATCH'].includes(request.method)) {
      const data=await this.command('getRequestPostData',{requestId}).catch(()=>({error:true}));
      if(typeof data.postData==='string')record.bodyText=data.postData;
      else record.bodyUnavailable=request.hasPostData!==false;
    }
    if(/^multipart\/form-data/i.test(header(record.requestHeaders,'content-type')||''))record.bodyUnavailable=true;
    record.capture={requestHeadersComplete:request.wireHeadersCaptured===true,requestBodyAvailable:!record.bodyUnavailable,responseBodyAvailable:false,rawPacketIsNormalized:true};
    if(response&&request.finished&&!request.failed&&!/^\d+$/.test(requestId)) {
      const data=await this.command('getResponseBody',{requestId}).catch(()=>({error:'响应正文已不可用'}));
      if(typeof data.body==='string') {
        let bytes=Buffer.from(data.body,data.base64Encoded?'base64':'utf8');const originalBytes=bytes.length;
        if(jsonPath){const {JSONPath}=require('jsonpath-plus');bytes=Buffer.from(JSON.stringify(JSONPath({path:jsonPath,json:JSON.parse(bytes.toString('utf8'))})));}
        const limit=Math.min(Math.max(Number(maxBytes)||65536,1),2*1024*1024);
        record.responseBody={text:bytes.subarray(0,limit).toString('utf8'),base64:bytes.subarray(0,limit).toString('base64'),bytes:originalBytes,truncated:bytes.length>limit,...(jsonPath?{filtered:true,jsonPath}:{})};
        record.capture.responseBodyAvailable=true;
      }else record.responseBodyError=String(data.error||'未保存响应正文');
    }
    return record;
  }
  async export(requestId) {
    const record=await this.capture(requestId,{maxBytes:2*1024*1024});
    this.assertReady();
    fs.mkdirSync(this.evidenceDir,{recursive:true,mode:0o700});
    const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
    const dir=path.join(this.evidenceDir,id);fs.mkdirSync(dir,{mode:0o700});
    fs.writeFileSync(path.join(dir,'capture.json'),JSON.stringify(record,null,2),{mode:0o600});
    fs.writeFileSync(path.join(dir,'request.http'),rawRequest(record),{mode:0o600});
    const content={size:record.responseBody?.bytes??-1,mimeType:header(record.responseHeaders,'content-type')||'',...(record.responseBody?{text:record.responseBody.base64,encoding:'base64'}:{})};
    const har={log:{version:'1.2',creator:{name:'chana-vps-blueprint',version:'1.1.0'},entries:[{startedDateTime:new Date(record.timestamp||Date.now()).toISOString(),time:0,
      request:{method:record.method,url:record.url,httpVersion:'HTTP/1.1',headers:Object.entries(record.requestHeaders).map(([name,value])=>({name,value})),queryString:[...new URL(record.url).searchParams].map(([name,value])=>({name,value})),cookies:[],headersSize:-1,bodySize:record.bodyText===undefined?-1:Buffer.byteLength(record.bodyText),...(record.bodyText!==undefined?{postData:{mimeType:header(record.requestHeaders,'content-type')||'',text:record.bodyText}}:{})},
      response:{status:record.statusCode||0,statusText:record.statusText||'',httpVersion:'HTTP/1.1',headers:Object.entries(record.responseHeaders).map(([name,value])=>({name,value})),cookies:[],content,redirectURL:header(record.responseHeaders,'location')||'',headersSize:-1,bodySize:content.size},cache:{},timings:{send:0,wait:0,receive:0},_capture:record.capture,_bodyTruncated:record.responseBody?.truncated||false}]}};
    fs.writeFileSync(path.join(dir,'capture.har'),JSON.stringify(har,null,2),{mode:0o600});
    return {directory:dir,files:['request.http','capture.json','capture.har'],capture:record.capture,responseTruncated:record.responseBody?.truncated||false,note:'原包包含认证信息，仅保留在受限证据目录。HTTP/1.1 文件是捕获字段的规范化表示；缺失正文、补充头或截断均有标记，不能声称字节级原始包完整。'};
  }
  async replay(args) {
    const record=await this.capture(args.requestId,{response:false});
    const prepared=prepareReplay(record,args);
    this.assertReady();
    const fn=`async () => {
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5500);
      try {
        const response=await fetch(${JSON.stringify(prepared.url)},{...${JSON.stringify(prepared.options)},signal:controller.signal});
        const reader=response.body?.getReader();const parts=[];let bytes=0,truncated=false;
        if(reader)while(true){const r=await reader.read();if(r.done)break;const room=2097152-bytes;if(r.value.length>room){parts.push(r.value.subarray(0,room));bytes+=room;truncated=true;await reader.cancel();break;}parts.push(r.value);bytes+=r.value.length;}
        const all=new Uint8Array(bytes);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}
        return {status:response.status,statusText:response.statusText,type:response.type,url:response.url,headers:Object.fromEntries(response.headers.entries()),body:new TextDecoder().decode(all),bodyBytes:bytes,truncated};
      }finally{clearTimeout(timer);}
    }`;
    const result=await this.browserCall('browser_evaluate',{function:fn},{rawResult:true});
    if(!result.success||!result.value||typeof result.value.status!=='number')throw new Error(result.message||'重放未得到可核实响应；不要盲目重复，先检查是否已发出请求');
    return {source:'vps-browser-fetch',requestId:args.requestId,method:prepared.options.method,url:prepared.url,credentials:prepared.options.credentials,
      browserManagedHeaders:prepared.browserManagedHeaders,response:result.value,
      note:'重放使用当前 Chrome 的 Cookie，保留捕获的业务头并应用明确修改。受 CORS/CSP、浏览器禁用头与签名时效限制；重定向可能是 opaque，status=0 不是目标真实状态。二次取证请读取新产生的 requestId。'};
  }
}
const schemas=[
  {name:'vps_request_export',description:'把当前标签页真实捕获的一条请求导出为受限 HAR、HTTP 请求和 JSON 证据，标记正文或真实头缺失与截断。返回文件路径，不将凭据摘要到对话。',inputSchema:{type:'object',properties:{requestId:{type:'string'}},required:['requestId']}},
  {name:'vps_request_replay',description:'在同一个 VPS Chrome 中基于已捕获请求改包并重放一次，可修改同源 URL、query、方法、正文和允许的头；保留业务认证头，Cookie 由当前浏览器提供，credentials=omit 用作无 Cookie 对照。先确认业务副作用，不自动重复；不支持任意 Cookie/Host/Origin 伪造、原始协议变形或突破 CORS/CSP。',inputSchema:{type:'object',properties:{requestId:{type:'string'},url:{type:'string'},method:{type:'string'},query:{type:'object',additionalProperties:{anyOf:[{type:'string'},{type:'array',items:{type:'string'}},{type:'null'}]}},headers:{type:'object',additionalProperties:{anyOf:[{type:'string'},{type:'null'}]}},body:{type:'string'},credentials:{type:'string',enum:['include','omit']}},required:['requestId']}}
];
module.exports={RequestTools,schemas,prepareReplay,rawRequest,headersObject};
