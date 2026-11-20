"""只在 VPS 回环读取受限配置，不向终端输出连接凭据。"""
import json, urllib.request
from pathlib import Path
class VPSMCP:
    def __init__(self,port=18862,config='/opt/chana-vps-browser/.runtime/config.json'):
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.url='http://127.0.0.1:'+str(port)+'/mcp'
        token=json.loads(Path(config).read_text())['token']
        self.headers={'Content-Type':'application/json','Accept':'application/json,text/event-stream','X-Chana-Vps-Token':token}
        self.counter=0
        self.rpc('initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'vps-browser-acceptance','version':'1.0.0'}})
    def rpc(self,method,params):
        self.counter+=1
        req=urllib.request.Request(self.url,json.dumps({'jsonrpc':'2.0','id':self.counter,'method':method,'params':params}).encode(),self.headers)
        with self.opener.open(req,timeout=9) as res:
            sid=res.headers.get('Mcp-Session-Id')
            if sid:self.headers['Mcp-Session-Id']=sid
            result=json.load(res)
        if result.get('error'):raise RuntimeError('MCP 协议错误')
        return result['result']
    def tool(self,name,args=None):return self.rpc('tools/call',{'name':name,'arguments':args or {}})
    def call(self,name,args=None):
        result=self.tool(name,args)
        text='\n'.join(x.get('text','') for x in result.get('content',[]) if x.get('type')=='text')
        if result.get('isError'):raise RuntimeError(text)
        try:return json.loads(text)
        except json.JSONDecodeError:return text
    def close(self):
        try:self.opener.open(urllib.request.Request(self.url,headers=self.headers,method='DELETE'),timeout=3).close()
        except Exception:pass
if __name__=='__main__':
    c=VPSMCP()
    try:print(json.dumps({'status':c.call('vps_browser_status'),'tools':len(c.rpc('tools/list',{})['tools']),'tabs':c.call('browser_tabs',{'action':'list'})},ensure_ascii=False))
    finally:c.close()
