const $=id=>document.getElementById(id);
const status=$('status'),dot=$('dot'),robanner=$('robanner');

/* ── toast ── */
function toast(msg,detail='',type='info'){
  const t=document.createElement('div');t.className='toast '+type;
  t.textContent=msg;
  if(detail){const s=document.createElement('small');s.textContent=detail;t.appendChild(s);}
  $('toasts').appendChild(t);setTimeout(()=>t.remove(),4000);
}

/* ── 加载 noVNC：失败时给出可见的重试入口，绝不静默全死 ── */
let RFB=null;
try{
  RFB=(await import('/browser/assets/core/rfb.js')).default;
  if(typeof RFB!=='function')throw new Error('RFB 模块内容异常');
}
catch(e){
  dot.className='down';
  status.innerHTML='';
  const retry=document.createElement('button');retry.textContent='⟳ 资源加载失败，点击重试';retry.className='primary';
  retry.onclick=()=>location.reload();
  status.appendChild(retry);
  toast('页面资源加载失败（网络抖动）','点击「重试」按钮重新加载','','err');
  throw e;
}

/* ════════════════════════════════════════════════════════════
   剪贴板双向直通
   ────────────────────────────────────────────────────────────
   关键事实：noVNC 的画面是 <canvas>，不是可编辑元素。Chrome 在
   非可编辑元素上按 Ctrl+V **不会派发 paste 事件**，所以「在画面上
   直接 Ctrl+V」在原始实现里必然失效，只能退回面板按钮。
   解决：放一个屏幕外的隐藏 textarea 作粘贴接收器，按下 Ctrl+V 的
   瞬间把焦点移过去，浏览器就会派发带 clipboardData 的 paste 事件
   （读取 clipboardData 不需要任何权限、不弹授权框），处理完立刻把
   焦点还给 noVNC 画布，键盘输入不受影响。
   ════════════════════════════════════════════════════════════ */
const sink=$('clipsink');
const localEditable=e=>{const t=e.target;return t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'||t.isContentEditable);};
const restoreFocus=()=>{try{rfb?.focus();}catch{}};
let pasteArmed=false;
let lastPasteText='',lastPasteAt=0;
let lastLocalPushed='';      // 本机→远程 最近一次内容（回声抑制）
let lastRemoteSynced='';     // 远程→本机 最近一次内容

document.addEventListener('keydown',e=>{
  if(!connected)return;
  if(!(e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.code==='KeyV'||e.key==='v'||e.key==='V')))return;
  if(localEditable(e))return;            // 面板文本框里正常本机粘贴
  e.stopPropagation();                   // 挡住 noVNC 转发，但不 preventDefault
  pasteArmed=true;
  try{sink.value='';sink.focus({preventScroll:true});}catch{}
  setTimeout(()=>{                       // 兜底：paste 没来就恢复焦点并透传按键
    if(pasteArmed){pasteArmed=false;restoreFocus();sendCombo(KEYS['ctrl-v']);}
  },320);
},true);

document.addEventListener('paste',async e=>{
  if(!connected)return;
  const fromSink=e.target===sink;
  if(!fromSink&&localEditable(e))return;
  const text=e.clipboardData?.getData('text/plain')||'';
  pasteArmed=false;
  restoreFocus();
  if(!text){toast('本机剪贴板里没有文本','图片/文件暂不支持；可在「📋 剪贴板」面板用文本框兜底','err');return;}
  e.preventDefault();
  if(text===lastPasteText&&Date.now()-lastPasteAt<900)return;   // 同内容短时重复 → 不再重复 POST
  lastPasteText=text;lastPasteAt=Date.now();
  try{
    await post('clipboard',{text});
    lastLocalPushed=text;
    logEv('本机→远程','','ok','直通');
    syncLog('⇡ 直通',text);
    toast(`已粘贴 ${text.length} 字符到远程`,'','ok');
    setTimeout(()=>sendCombo(KEYS['ctrl-v']),80);
  }catch(e){logEv('本机→远程','','fail','POST失败');sendCombo(KEYS['ctrl-v']);}
},true);

/* ── RFB 连接（断线自动重连） ── */
let rfb=null,connected=false,phase='manual',retry=0;
let fit=true;                      // 必须先于 connect() 初始化，否则 rfb.scaleViewport=fit 触发 TDZ
function connect(){
  status.textContent='正在连接远程画面…';dot.className='reconn';
  rfb=new RFB($('screen'),`${location.protocol==='https:'?'wss':'ws'}://${location.host}/browser/websockify`);
  rfb.scaleViewport=fit;rfb.resizeSession=false;rfb.showDotCursor=true;
  rfb.addEventListener('connect',()=>{connected=true;retry=0;render();toast('远程画面已连接','','ok');});
  rfb.addEventListener('disconnect',e=>{
    connected=false;
    if(e.detail?.clean){render();return;}
    status.textContent='连接断开，'+Math.min(3+retry*3,15)+' 秒后自动重连…';dot.className='reconn';render();
    setTimeout(()=>{retry++;connect();},Math.min(3+retry*3,15)*1000);
  });
  rfb.addEventListener('clipboard',e=>onRemoteClipboard(e.detail.text));
}
connect();

/* ── 人工/agent 状态机 ── */
function render(){
  dot.className=!connected?'down':(phase==='manual'?'ok':'agent');
  // 桥只有两个状态：manual（人工接管）/ ready（已交给 agent，agent 可操作但不代表正在操作）
  status.textContent=!connected?'远程画面未连接'
    :(phase==='manual'?'人工操作中 · agent 已暂停':'已交给 agent · agent 可操作');
  if(rfb)rfb.viewOnly=phase!=='manual';
  robanner.classList.toggle('show',connected&&phase!=='manual');
  $('pausebtn').disabled=phase==='manual';
  $('handoff').disabled=phase!=='manual';
}
$('pausebtn').onclick=()=>control('pause');
$('handoff').onclick=()=>control('resume');
async function control(action){
  try{const r=await post('control',{action});phase=r.phase;render();
    toast(action==='pause'?'已暂停 agent，画面交给你':'已交还 agent 继续任务','','ok');}
  catch(e){status.textContent=e.message;}
}

/* ── 平台 API ── */
async function post(route,data){
  const r=await fetch('/browser/'+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!r.ok)throw new Error(r.status===401?'平台登录已过期，请重新登录':'操作失败，请重试');
  return r.status===204?{}:r.json();
}
async function get(route){
  const r=await fetch('/browser/'+route,{credentials:'same-origin'});
  if(r.status===401)throw new Error('平台登录已过期，请重新登录');
  if(!r.ok){let msg='读取失败';try{msg=(await r.json()).error||msg;}catch{}throw new Error(msg);}
  return r.json();
}
setInterval(async()=>{try{
  const r=await fetch('/browser/status',{cache:'no-store'});
  if(r.status===401){rfb?.disconnect();location.replace('/login?next=%2Fbrowser%2F');return;}
  if(r.ok){phase=(await r.json()).phase;render();}
}catch{}},1500);

/* ── 剪贴板事件日志（供 🩺 自检 读取） ── */
const clipLog=[];
function logEv(dir,text,result,reason){
  clipLog.push({t:new Date().toLocaleTimeString(),dir,len:text?text.length:0,result,reason:reason||''});
  if(clipLog.length>10)clipLog.shift();
}

/* ── 剪贴板日志 ── */
let lastSync={dir:'',text:'',at:0};
function syncLog(dir,text){lastSync={dir,text,at:Date.now()};
  const preview=text.length>60?text.slice(0,60)+'…':text;
  $('lastsync').textContent=`${new Date().toLocaleTimeString()} ${dir} ${text.length} 字符：${preview.replace(/\n/g,'⏎')}`;}
function previewOf(t){return (t.length>60?t.slice(0,60)+'…':t).replace(/\n/g,'⏎');}

/* ── 剪贴板自动同步（本机复制 → 远程，无需按键） ──
   浏览器安全模型下，本机在别的应用里复制时网页无法感知；唯一可行路径是
   轮询 navigator.clipboard.readText()。它需要一次剪贴板读取授权（点一次
   「🔗 自动同步」按钮即可，Chrome 会记住该源）。授权后：本机随便复制，
   1 秒内自动写进远程 X 剪贴板，在远程直接 Ctrl+V 就能粘。 */
let autoSync=false;
function paintSyncBtn(){
  const b=$('syncbtn');
  b.textContent=autoSync?'🔗 自动同步:开':'🔗 自动同步:关';
  b.classList.toggle('okbtn',autoSync);
}
async function setAutoSync(on,announce=true){
  autoSync=on;paintSyncBtn();
  if(on&&announce)toast('已开启剪贴板自动同步','本机复制后会自动写入远程，远程直接 Ctrl+V 即可');
}
$('syncbtn').onclick=async()=>{
  if(autoSync){setAutoSync(false);toast('已关闭自动同步','仍可在远程画面按 Ctrl+V 直通粘贴');return;}
  try{
    await navigator.clipboard.readText();          // 触发/确认授权
    setAutoSync(true);
  }catch{
    toast('无法读取本机剪贴板','请在地址栏左侧的站点权限里允许「剪贴板」，再点一次','err');
  }
};
(async()=>{                                        // 已授权过的直接开，不打扰
  try{
    const p=await navigator.permissions.query({name:'clipboard-read'});
    if(p.state==='granted')setAutoSync(true,false);
    p.addEventListener?.('change',()=>{if(p.state==='granted')setAutoSync(true,false);});
  }catch{}
})();
setInterval(async()=>{
  if(!autoSync||!connected)return;
  if(!document.hasFocus())return;                  // 读剪贴板要求页面在前台
  if(localEditable({target:document.activeElement}))return;
  let t;
  try{t=await navigator.clipboard.readText();}catch{return;}
  if(!t||t===lastLocalPushed||t===lastRemoteSynced)return;
  lastLocalPushed=t;
  try{
    await post('clipboard',{text:t});
    syncLog('⇡ 自动',t);
    toast('本机复制已同步到远程','在远程直接 Ctrl+V 即可','ok');
  }catch{}
},1200);

/* ── 剪贴板：本地 → 远程（面板按钮兜底） ── */
async function pushText(text,fromManual=false){
  if(!text){toast('剪贴板是空的',fromManual?'请先在文本框输入内容':'本机剪贴板没有文本内容','err');return;}
  await post('clipboard',{text});
  lastLocalPushed=text;
  syncLog('⇡ 发送',text);
  if($('optautov').checked){toast(`已发送 ${text.length} 字符并自动在远程粘贴`,'若没粘上，点远程输入框后按 Ctrl+V','ok');rfb?.focus();sendCtrlV();}
  else{toast(`已发送 ${text.length} 字符到远程剪贴板`,'在远程输入框里按 Ctrl+V 粘贴','ok');rfb?.focus();}
}
$('push').onclick=async()=>{
  if(!connected){toast('远程画面未连接','稍候自动重连后重试','err');return;}
  let text='';
  try{text=await navigator.clipboard.readText();}
  catch{
    toast('浏览器拒绝了读取本机剪贴板','改用下方文本框：把内容粘贴进去后点「发送文本框内容」','err');
    openPanel('clippanel');$('manual').focus();return;
  }
  try{await pushText(text);}catch(e){toast(e.message,'','err');}
};
$('paste').onclick=async()=>{
  if(!$('manual').value.trim()){toast('文本框是空的','把要发送的内容粘贴到这里','err');return;}
  try{await pushText($('manual').value,true);$('manual').value='';}catch(e){toast(e.message,'','err');}
};

/* ── 剪贴板：远程 → 本地 ── */
$('pull').onclick=async()=>{
  let data;
  try{data=await get('clipboard');}
  catch(e){toast(e.message,'','err');return;}
  if(!data.text){toast('远程剪贴板是空的','先在远程 Chrome 里选中内容按 Ctrl+C','err');return;}
  try{await navigator.clipboard.writeText(data.text);
    lastRemoteSynced=data.text;
    syncLog('⇣ 取回',data.text);toast(`已取回 ${data.text.length} 字符到本机剪贴板`,previewOf(data.text),'ok');}
  catch{
    openPanel('clippanel');$('manual').value=data.text;
    toast('无法直接写入本机剪贴板（页面需在前台）','内容已填入文本框，手动复制即可','err');}
};

/* ── 远程复制自动同步到本地（x11vnc ServerCutText 推送） ──
   现实约束（已实测）：
   · document 不可见（后台标签页）时 navigator.clipboard.writeText 既不 resolve 也不 reject，会永久挂起；
   · 某些 Chrome/Linux 构建在 X11 下 writeText 同样挂起。
   所以这里：1200ms 超时 → document.execCommand('copy') 兜底 → 仍失败则弹出顶部同步条，
   用户点一次（获得用户手势）必然成功。用户回到页面做任意点击/按键也会自动补同步。 */
let lastRemote='',pendingRemote=null;
function execCopy(text){
  try{
    const ta=document.createElement('textarea');
    ta.value=text;ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,text.length);
    let ok=false;try{ok=document.execCommand('copy');}catch{}
    ta.remove();return ok;
  }catch{return false;}
}
function copyToLocal(text){
  return new Promise(resolve=>{
    let done=false;const finish=r=>{if(done)return;done=true;resolve(r);};
    const timer=setTimeout(()=>finish(execCopy(text)?'exec':'fail'),1200);
    navigator.clipboard.writeText(text)
      .then(()=>{clearTimeout(timer);finish('api');})
      .catch(()=>{clearTimeout(timer);finish(execCopy(text)?'exec':'fail');});
  });
}
function showSyncBar(text){
  const bar=$('syncbar');
  $('syncbarText').textContent=`远程复制了 ${text.length} 字符（浏览器没让自动写入），点右侧按钮`;
  bar.classList.add('show');
  $('syncbarBtn').onclick=async()=>{
    let ok=execCopy(text);
    if(!ok)ok=await navigator.clipboard.writeText(text).then(()=>true).catch(()=>false);
    if(ok){bar.classList.remove('show');pendingRemote=null;syncLog('⇣ 手动写入',text);toast('已写入本机剪贴板','切到本机应用直接 Ctrl+V','ok');}
    else toast('浏览器仍拒绝写剪贴板','请从「📋 剪贴板」面板复制文本框内容','err');
  };
  $('syncbarClose').onclick=()=>bar.classList.remove('show');
}
async function trySyncRemote(text){
  if(!text)return false;
  if(!document.hasFocus()){pendingRemote=text;return false;}   // 后台写不了，先记着
  const r=await copyToLocal(text);
  logEv('远程→本机',text,r);
  if(r==='api'||r==='exec'){
    pendingRemote=null;syncLog('⇣ 自动同步',text);
    toast('远程复制已同步到本机剪贴板','切到本机应用直接 Ctrl+V','ok');return true;
  }
  pendingRemote=text;showSyncBar(text);return false;
}
function onRemoteClipboard(text){
  if(!text||text===lastRemote)return;
  lastRemote=text;
  if(!$('optautosync').checked)return;
  if(text===lastLocalPushed)return;                          // 自己刚推上去的回声
  if(text===lastSync.text&&Date.now()-lastSync.at<5000)return;
  lastRemoteSynced=text;
  logEv('收到远程剪贴板',text,'event');
  trySyncRemote(text);
}
window.addEventListener('focus',()=>{if(pendingRemote&&$('optautosync').checked)trySyncRemote(pendingRemote);});
/* 回到页面后任意点击/按键都会带来用户手势，顺手把待同步内容写进去 */
['mousedown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{
  if(pendingRemote&&$('optautosync').checked){
    const t=pendingRemote;pendingRemote=null;
    copyToLocal(t).then(r=>{if(r==='api'||r==='exec'){syncLog('⇣ 补同步',t);toast('远程复制已写入本机剪贴板','','ok');}});
  }
},true));

/* ── 远程快捷键 ── */
const KEYS={
  'ctrl-c':[[0xffe3,'ControlLeft',true],[0x63,'KeyC'],[0xffe3,'ControlLeft',false]],
  'ctrl-v':[[0xffe3,'ControlLeft',true],[0x76,'KeyV'],[0xffe3,'ControlLeft',false]],
  'ctrl-a':[[0xffe3,'ControlLeft',true],[0x61,'KeyA'],[0xffe3,'ControlLeft',false]],
  'ctrl-l':[[0xffe3,'ControlLeft',true],[0x6c,'KeyL'],[0xffe3,'ControlLeft',false]],
  'ctrl-f5':[[0xffe3,'ControlLeft',true],[0xffc2,'F5'],[0xffe3,'ControlLeft',false]],
  'f5':[[0xffc2,'F5']],
  'alt-d':[[0xffe9,'AltLeft',true],[0x64,'KeyD'],[0xffe9,'AltLeft',false]],
};
function sendCombo(steps){if(!rfb)return;for(const s of steps)rfb.sendKey(...s);}
function sendCtrlV(){sendCombo(KEYS['ctrl-v']);}
document.querySelectorAll('#keypanel [data-key]').forEach(b=>{
  b.onclick=()=>{if(!connected){toast('远程画面未连接','','err');return;}
    if(phase!=='manual'){toast('已交给 agent，画面只读','先点「✋ 我要操作」接管','err');return;}
    sendCombo(KEYS[b.dataset.key]);};
});

/* ── 面板开合 ── */
function openPanel(id){$('clippanel').classList.toggle('open',id==='clippanel');$('keypanel').classList.toggle('open',id==='keypanel');}
function closePanels(){$('clippanel').classList.remove('open');$('keypanel').classList.remove('open');}
$('clipbtn').onclick=e=>{e.stopPropagation();const was=$('clippanel').classList.contains('open');closePanels();if(!was)$('clippanel').classList.add('open');};
$('keybtn').onclick=e=>{e.stopPropagation();const was=$('keypanel').classList.contains('open');closePanels();if(!was)$('keypanel').classList.add('open');};
$('screen').addEventListener('mousedown',closePanels);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanels();});

/* ── 缩放 / 全屏 ── */
$('zoom').onclick=()=>{fit=!fit;if(rfb)rfb.scaleViewport=fit;$('zoom').textContent=fit?'缩放:适应':'缩放:100%';};
$('fullscreen').onclick=()=>document.documentElement.requestFullscreen();
render();paintSyncBtn();

/* ── 剪贴板诊断钩子（只读取内部状态，不改变行为；控制台执行 __clipDebug() 可看） ── */
window.__clipDebug=async()=>{
  let perm='n/a';
  try{const p=await navigator.permissions.query({name:'clipboard-read'});perm=p.state;}catch(e){perm='query-fail:'+e.name;}
  let localRead='n/a';
  try{localRead='OK:'+(await navigator.clipboard.readText()).slice(0,40);}catch(e){localRead='DENIED:'+e.name;}
  return {connected,autoSync,phase,hasFocus:document.hasFocus(),visibility:document.visibilityState,
    lastRemote,lastRemoteSynced,pendingRemote,lastLocalPushed,permission:perm,localRead};
};

/* ── 🩺 剪贴板自检（面板内容可直接截图给 agent） ── */
function diagText(){
  let perm=window.__lastPerm||'未查询';
  return [
    '页面版本: '+($('ver')?$('ver').textContent:'?')+'   地址: '+location.href,
    '连接状态: '+(connected?'已连接':'未连接')+'   阶段: '+phase,
    '页面可见: '+document.visibilityState+'   hasFocus: '+document.hasFocus(),
    '自动同步: '+(autoSync?'开':'关')+'   远程自动回写: '+($('optautosync')?.checked?'开':'关'),
    '剪贴板读权限: '+perm,
    '远程剪贴板最近值: '+(lastRemote?lastRemote.length+' 字符':'空'),
    '本机已推送: '+(lastLocalPushed?lastLocalPushed.length+' 字符':'无'),
    '待补同步: '+(pendingRemote?pendingRemote.length+' 字符':'无'),
    '',
    '最近事件（新→旧最多 10 条）:',
    ...(clipLog.length?clipLog.slice().reverse().map(e=>`  ${e.t}  ${e.dir}  ${e.len} 字符  → ${e.result}${e.reason?' ('+e.reason+')':''}`):['  （暂无）'])
  ].join('\n');
}
async function refreshPerm(){
  try{const p=await navigator.permissions.query({name:'clipboard-read'});window.__lastPerm=p.state;}catch(e){window.__lastPerm='查询失败:'+e.name;}
}
$('diagbtn').onclick=async e=>{
  e.stopPropagation();
  await refreshPerm();
  $('diagtext').textContent=diagText();
  closePanels();$('diagpanel').classList.add('open');
};
$('diagcopy').onclick=async()=>{
  const t=$('diagtext').textContent;
  const ok=execCopy(t)||await navigator.clipboard.writeText(t).then(()=>true).catch(()=>false);
  toast(ok?'诊断信息已复制':'复制失败，请手动选中文本复制',ok?'直接粘给 agent 即可':'','ok'.replace('ok','info'));
};
$('diagclose').onclick=()=>$('diagpanel').classList.remove('open');
