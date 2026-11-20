/* 验证认证信息不跨站、重复参数、缺失正文与证据导出标记。 */
const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepareReplay,rawRequest,headersObject}=require('./request-tools.cjs');
const record={url:'https://example.invalid/list?keep=1&id=1&id=2',method:'POST',requestHeaders:{Authorization:'Bearer fixture','Tenant-Id':'tenant-a',Cookie:'sid=fixture','Content-Type':'application/json'},bodyText:'{"page":1}'};
test('保留业务认证头，Cookie 交由浏览器，支持重复参数修改',()=>{const r=prepareReplay(record,{query:{id:['3','4']},body:'{"page":2}'});assert.equal(r.options.headers.Authorization,'Bearer fixture');assert.equal(r.options.headers['Tenant-Id'],'tenant-a');assert(!('Cookie' in r.options.headers));assert.deepEqual(new URL(r.url).searchParams.getAll('id'),['3','4']);assert.equal(new URL(r.url).searchParams.get('keep'),'1');assert.equal(r.options.body,'{"page":2}');});
test('拒绝将捕获凭据发送到其他站点',()=>assert.throws(()=>prepareReplay(record,{url:'https://other.invalid/list'}),/同源/));
test('无凭据对照可移除 Authorization，禁止伪造 Cookie',()=>{const r=prepareReplay(record,{credentials:'omit',headers:{Authorization:null}});assert(!('Authorization' in r.options.headers));assert.equal(r.options.credentials,'omit');assert.throws(()=>prepareReplay(record,{headers:{Cookie:'sid=other'}}),/浏览器管理/);});
test('缺失 POST 正文不能按空正文重发',()=>assert.throws(()=>prepareReplay({...record,bodyText:undefined,bodyUnavailable:true}),/正文/));
test('原包长度按 UTF8 字节数计算，认证头去重且保留',()=>{const raw=rawRequest({...record,bodyText:'中文'});assert(raw.includes('Content-Length: 6\r\n'));assert(raw.endsWith('\r\n\r\n中文'));assert(raw.includes('Tenant-Id: tenant-a'));assert.equal(Object.keys(headersObject({Cookie:'old',cookie:'new'})).length,1);});
test('删除 Cookie 或 Origin 也必须拒绝，防止误以为匿名对照成立',()=>{for(const name of ['Cookie','Origin','Host'])assert.throws(()=>prepareReplay(record,{headers:{[name]:null}}),/浏览器管理/);});
test('multipart 原始文件字节未保证完整时拒绝字符串重放',()=>assert.throws(()=>prepareReplay({...record,requestHeaders:{'Content-Type':'multipart/form-data; boundary=test'},bodyText:'partial'}),/multipart/));
