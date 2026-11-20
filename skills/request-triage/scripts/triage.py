"""离线解析请求并生成有出处的测试假设；不发包、不执行代码、不判定漏洞。"""

import argparse
import base64
import hashlib
import http.client
import io
import json
import os
import re
import tempfile
from collections import Counter
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit
from xml.etree import ElementTree

MAX_FILE = 40 * 1024 * 1024
MAX_BODY = 2 * 1024 * 1024
MAX_FIELDS = 2000
STATES = {'pending', 'supported', 'not_supported', 'blocked', 'inconclusive'}
SENSITIVE = re.compile(r'password|passwd|secret|token|authorization|cookie|session|signature|csrf|xsrf|api.?key', re.I)
MUTATIONS = {'delete', 'remove', 'destroy', 'purge', 'clear', 'reset', 'revoke', 'pay', 'payment', 'charge',
             'send', 'sms', 'logout', 'execute', 'exec', 'shutdown', 'update', 'save', 'create', 'register',
             'import', 'upload', 'approve', 'reject', 'cancel', 'transfer', 'withdraw'}
OBJECT_KEYS = {'id', 'userid', 'accountid', 'ownerid', 'orderid', 'recordid', 'fileid', 'attachmentid', 'projectid', 'documentid', 'studentid'}
TENANT_KEYS = {'tenantid', 'orgid', 'organizationid', 'deptid', 'departmentid', 'companyid', 'xtenantid', 'xorgid'}
QUERY_KEYS = {'keyword', 'search', 'filter', 'sort', 'sortname', 'sortfield', 'orderby', 'order', 'orders', 'column', 'asc', 'desc'}
URL_KEYS = {'url', 'uri', 'host', 'endpoint', 'callback', 'redirect', 'redirecturl', 'returnurl', 'targeturl', 'imageurl', 'webhook'}
ROLE_KEYS = {'role', 'roles', 'permission', 'permissions', 'isadmin', 'admin', 'verified', 'tier'}
CONTENT_KEYS = {'content', 'html', 'text', 'message', 'comment', 'template', 'markdown'}
FILE_KEYS = {'path', 'filepath', 'filename', 'file', 'fileid', 'attachmentid', 'documentid'}
MONEY_KEYS = {'amount', 'price', 'totalprice', 'fee', 'discount', 'balance', 'quantity'}
BUSINESS_KEYS = {'status', 'state', 'step', 'approved', 'coupon', 'quantity'}


class JsonObject(list):
    """保留重复 JSON 键，避免把解析器差异线索静默合并。"""


def digest(value):
    raw = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


def words(value):
    value = unquote(unquote(value))
    value = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', value)
    return set(re.findall(r'[a-zA-Z]+', value.lower()))


def key_name(value):
    return re.sub('[^a-z0-9]', '', value.lower())


def semantic_keys(value):
    return {key_name(value)} | {key_name(piece) for piece in re.split(r'[.\[\]]+', value) if piece and not piece.isdigit()}


def origin(url):
    p = urlsplit(url)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('仅支持不含凭据的 HTTP(S) 地址')
    host = p.hostname.encode('idna').decode('ascii').lower()
    if ':' in host:
        host = '[' + host + ']'
    port = p.port
    return p.scheme.lower() + '://' + host + (':' + str(port) if port and port != (443 if p.scheme == 'https' else 80) else '')


def scopes(values):
    output = []
    for value in values:
        p = urlsplit(value)
        if p.query or p.fragment:
            raise ValueError('scope 不得带 query 或 fragment')
        output.append({'origin': origin(value), 'prefix': (p.path or '/').rstrip('/') + '/'})
    return sorted(output, key=lambda r: (r['origin'], r['prefix']))


def in_scope(url, allowed):
    p = urlsplit(url)
    return any(origin(url) == s['origin'] and (p.path == s['prefix'].rstrip('/') or (p.path or '/').startswith(s['prefix'])) for s in allowed)


def workspace_path(workspace, value):
    root = Path(workspace).resolve()
    path = (root / value).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise ValueError('输入、输出和证据必须位于当前工作区内') from None
    return path


def read_json(path):
    if path.stat().st_size > MAX_FILE:
        raise ValueError('输入超过 40MB，须分批处理')
    with path.open(encoding='utf-8-sig') as source:
        return json.load(source)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as target:
        json.dump(value, target, ensure_ascii=False, indent=2)
        target.write('\n')
        temporary = Path(target.name)
    temporary.chmod(0o600)
    os.replace(temporary, path)


def header_pairs(value):
    if isinstance(value, dict):
        return [(str(k).lower(), str(v)) for k, v in value.items()]
    return [(str(r['name']).lower(), str(r.get('value', ''))) for r in (value or []) if isinstance(r, dict) and 'name' in r]


def body_type(value):
    if isinstance(value, bool):
        return 'boolean'
    if value is None:
        return 'null'
    if isinstance(value, (int, float)):
        return 'number'
    return 'string'


def parse_parameters(url, headers, post, warnings):
    fields = []

    def add(name, location, value, field_path=None, kind=None):
        if len(fields) >= MAX_FIELDS:
            raise ValueError('字段超过 2000 项，须拆分请求；未生成截断的完整覆盖结论')
        fields.append({'name': str(name), 'location': location, 'path': field_path or str(name),
                       'type': kind or body_type(value), 'sensitive_context': bool(SENSITIVE.search(str(name))) or key_name(str(name)) in {'sign', 'sig', 'signkey', 'timestamp', 'nonce'}, '_value': value})

    for name, value in parse_qsl(urlsplit(url).query, keep_blank_values=True):
        add(name, 'query', value)
    for name, value in headers:
        if name == 'cookie':
            cookie = SimpleCookie()
            try:
                cookie.load(value)
                for key, item in cookie.items():
                    add(key, 'cookie', item.value)
            except Exception:
                warnings.append('Cookie 未解析，认证上下文仍须保留原包')
        elif name in ('authorization', 'x-api-key') or key_name(name) in TENANT_KEYS or SENSITIVE.search(name):
            add(name, 'header', value)

    mime = post.get('mimeType') or next((v for k, v in headers if k == 'content-type'), '')
    mime = mime.split(';')[0].strip().lower()
    text = post.get('text')
    if text is not None and not isinstance(text, str):
        raise ValueError('postData.text 必须是字符串')
    if text and len(text.encode('utf-8')) > MAX_BODY:
        warnings.append('请求正文超过 2MB，字段未分析；不得声称覆盖完成')
        return fields, mime

    def flatten(value, pointer='$', depth=0):
        if depth > 20:
            raise ValueError('JSON 嵌套超过 20 层，须拆分处理')
        if isinstance(value, JsonObject):
            for name, child in value:
                child_path = pointer + '.' + str(name)
                if isinstance(child, (JsonObject, list)):
                    add(name, 'json', None, child_path, 'object' if isinstance(child, JsonObject) else 'array')
                    flatten(child, child_path, depth + 1)
                else:
                    add(name, 'json', child, child_path)
        elif isinstance(value, list):
            for child in value:
                if isinstance(child, (JsonObject, list)):
                    flatten(child, pointer + '[]', depth + 1)
                else:
                    add(pointer.rsplit('.', 1)[-1], 'json', child, pointer + '[]')

    try:
        if text is not None and (mime == 'application/json' or mime.endswith('+json')):
            flatten(json.loads(text, object_pairs_hook=JsonObject))
        elif text is not None and mime == 'application/x-www-form-urlencoded':
            for name, value in parse_qsl(text, keep_blank_values=True):
                add(name, 'form', value)
        elif text is not None and mime == 'multipart/form-data':
            content_type = post.get('mimeType') or next((v for k, v in headers if k == 'content-type'), '')
            message = BytesParser(policy=default).parsebytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + text.encode())
            if not message.is_multipart():
                warnings.append('multipart 缺少有效 boundary，须从原包补齐字段')
            for part in message.iter_parts():
                name = part.get_param('name', header='content-disposition')
                if name:
                    add(name, 'multipart', None if part.get_filename() else part.get_content(), kind='file' if part.get_filename() else 'string')
        elif text is not None and (mime.endswith('/xml') or mime.endswith('+xml')):
            if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
                warnings.append('XML 含实体声明，未展开或解析；不直接定性 XXE')
            else:
                tree = ElementTree.fromstring(text)
                for element in tree.iter():
                    name = element.tag.rsplit('}', 1)[-1]
                    if not list(element):
                        add(name, 'xml', element.text or '')
                    for attr, value in element.attrib.items():
                        add(attr, 'xml-attribute', value, name + '@' + attr)
        elif text:
            warnings.append('正文类型未结构化解析，需人工读原包')
    except (json.JSONDecodeError, ElementTree.ParseError, UnicodeError, LookupError):
        warnings.append('正文解析失败，需补齐原始请求；字段不可当作不存在')
    if text is None:
        for item in post.get('params', []):
            if isinstance(item, dict) and 'name' in item:
                add(item['name'], 'multipart' if mime == 'multipart/form-data' else 'form', item.get('value'), kind='file' if item.get('fileName') else None)
    for i, part in enumerate(urlsplit(url).path.split('/')):
        if re.fullmatch(r'\d+|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', part):
            add('resourceId', 'path', part, 'segment-' + str(i))
    return fields, mime


def safe_url(url):
    p = urlsplit(url)
    parts = [('{id}' if re.fullmatch(r'\d+|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', s) else s) for s in p.path.split('/')]
    query = '&'.join(name + '={value}' for name, _ in parse_qsl(p.query, keep_blank_values=True))
    return origin(url) + '/'.join(parts) + ('?' + query if query else '')


def response_meta(response):
    response = response or {}
    content = response.get('content') or {}
    status = response.get('status')
    headers = header_pairs(response.get('headers'))
    mime = content.get('mimeType') or next((v for k, v in headers if k == 'content-type'), '')
    return {'status': status if isinstance(status, int) and 100 <= status <= 599 else None,
            'content_type': mime.split(';')[0].lower(), 'has_saved_response': bool(response),
            'body_sha256': digest(content['text'].encode()) if isinstance(content.get('text'), str) else None}


def normalized_capture(item, source, allowed, default_context):
    if not isinstance(item, dict):
        raise ValueError('请求条目必须为对象')
    request = item.get('request', item)
    if not isinstance(request, dict):
        raise ValueError('request 必须为对象')
    url = request['url']
    if not in_scope(url, allowed):
        return None
    method = str(request.get('method', 'UNKNOWN')).upper()
    if not re.fullmatch('[A-Z]+', method):
        raise ValueError('无效 HTTP 方法')
    warnings = []
    headers = header_pairs(request.get('headers'))
    post = request.get('postData') or {}
    if not isinstance(post, dict):
        raise ValueError('postData 必须为对象')
    if 'body' in request:
        post = {'text': json.dumps(request['body']) if isinstance(request['body'], (dict, list)) else request['body'],
                'mimeType': request.get('content_type') or next((v for k, v in headers if k == 'content-type'), '')}
    fields, mime = parse_parameters(url, headers, post, warnings)
    context = item.get('_context') or item.get('context') or default_context or 'unknown'
    if not isinstance(context, str) or len(context) > 80:
        raise ValueError('context 应为不含凭据的短账号/角色标签')
    terms = words(urlsplit(url).path)
    dispatch = [f['_value'] for f in fields if key_name(f['name']) in ('m', 'method', 'action') and isinstance(f['_value'], str)]
    dangerous = method not in ('GET', 'HEAD') or bool(terms & MUTATIONS) or any(words(v) & MUTATIONS for v in dispatch)
    auth_values = [(name, digest(value.encode())) for name, value in headers if name in ('authorization', 'cookie')]
    shape = sorted((f['location'], f['path'], f['type']) for f in fields)
    identity = {'method': method, 'origin': origin(url), 'path': urlsplit(safe_url(url)).path, 'fields': shape,
                'context': context, 'dispatch_digest': digest(dispatch), 'unknown_auth_partition': auth_values if context == 'unknown' else []}
    repeat = Counter((f['location'], f['path']) for f in fields if f['location'] != 'path' and not ('[]' in f['path']))
    response = response_meta(item.get('response'))
    return {'key': digest(identity)[:24], 'url': safe_url(url), 'origin': origin(url), 'method': method,
            'context': context, 'source_kind': 'captured-request', 'sources': [source], 'content_type': mime,
            'parameters': [{**{k: v for k, v in f.items() if k != '_value'}, 'occurrences': repeat[(f['location'], f['path'])] or 1} for f in fields],
            'header_names': sorted({k for k, _ in headers}), 'response': response,
            'response_observations': [{**response, 'source': source}],
            'side_effect_guard': dangerous, 'warnings': warnings, '_terms': terms,
            '_fingerprint': digest({'request': request, 'response': item.get('response')})}


def raw_capture(raw, allowed, context):
    stream = io.BytesIO(raw)
    line = stream.readline(65537)
    if len(line) > 65536:
        raise ValueError('请求行过长')
    parts = line.decode('iso-8859-1').strip().split()
    if len(parts) != 3 or not parts[2].startswith('HTTP/'):
        raise ValueError('原始请求必须包含完整 HTTP 请求行')
    method, target, _ = parts
    message = http.client.parse_headers(stream)
    host = message.get('Host')
    if target.startswith(('http://', 'https://')):
        url = target
    else:
        if not host or not target.startswith('/'):
            raise ValueError('相对原始请求必须包含 Host')
        matching = [s['origin'] for s in allowed if origin(urlsplit(s['origin']).scheme + '://' + host) == s['origin']]
        if len(set(matching)) != 1:
            raise ValueError('Host 对应的协议/端口不唯一，需提供绝对请求地址')
        url = matching[0] + target
    body = stream.read()
    return {'method': method, 'url': url, 'headers': [{'name': k, 'value': v} for k, v in message.items()],
            'postData': {'text': body.decode('utf-8', errors='replace'), 'mimeType': message.get('Content-Type', '')}, 'context': context or 'unknown'}


RULES = {
    'object-access': ('对象访问权限', 'api-authorization-and-bola', '使用两个授权测试账号及各自对象，核对对象归属与返回字段；先只读对比。'),
    'tenant-isolation': ('租户和组织隔离', 'api-authorization-and-bola', '先确认租户头/字段的用途，用授权测试租户的数据核对服务端访问边界。'),
    'function-access': ('管理功能权限', 'api-authorization-and-bola', '比较授权普通账号与管理测试账号的同一功能请求，不从菜单隐藏或 403 单独定性。'),
    'field-control': ('可修改字段边界', 'api-authorization-and-bola', '根据接口文档和真实更新流程确认允许字段；涉及写入仅在明确可恢复的测试对象上验证。'),
    'file-access': ('文件和导出访问边界', 'file-access-vuln', '使用测试账号自有附件/导出记录核对权限和路径解析，不批量下载真实数据。'),
    'file-upload': ('上传和导入处理边界', 'upload-insecure-files', '先读正常上传/解析流程、格式和文件归属；写入验证须使用隔离测试环境或可恢复测试对象。'),
    'query-input': ('查询和排序输入处理', 'injection-checking', '先确认参数确实参与后端查询及预期类型；保留正常/对照响应，再选择匹配的数据解释器专项。'),
    'url-consumption': ('URL、回调和跳转信任边界', 'injection-checking', '区分客户端跳转与服务端抓取；根据实际数据去向选择重定向或 SSRF 专项，不仅凭参数名定性。'),
    'business-state': ('金额和业务状态约束', 'business-logic-vuln', '先画出状态和服务端计算规则；支付、短信、审批等有副作用动作不自动变异或重放。'),
    'content-render': ('内容输出和模板处理', 'injection-checking', '定位实际输出/存储/模板使用位置及编码上下文，不把反射或 content 字段本身当漏洞。'),
    'xml-processing': ('XML 解析边界', 'xxe-xml-external-entity', '确认服务端解析流程和配置；出现 XML 不等于存在实体扩展问题。'),
    'graphql-schema': ('GraphQL 字段与对象权限', 'graphql-and-hidden-parameters', '结合正常 operation 和 variables 检查对象权限及允许字段，不自动跑批量/高深度查询。'),
    'session-boundary': ('会话和签名上下文', 'api-auth-and-jwt-abuse', '保留 Cookie/Token/签名/时间戳，核对会话与角色条件；不自行删头后误判路径不存在。'),
    'dispatch-or-duplicates': ('业务分发和重复参数解析', 'http-parameter-pollution', '区分 method/m/action 的业务操作，记录重复参数及解析顺序；未知分发值不盲枚举写入动作。'),
    'capture-request': ('补齐正常业务请求', 'api-recon-and-docs', '先用正常业务功能捕获方法、参数、角色和返回包，静态路径或扫描状态不足以进行漏洞定性。'),
}


def hypothesize(request):
    if request['source_kind'] != 'captured-request':
        selected = [('capture-request', [])]
    else:
        fields = request['parameters']
        usable = [p for p in fields if not p['sensitive_context']]
        matched = lambda names: [p for p in usable if semantic_keys(p['name']) & names]
        terms = request['_terms']
        selected = []

        def choose(rule, parameters, condition=False):
            if parameters or condition:
                selected.append((rule, parameters))

        choose('object-access', matched(OBJECT_KEYS), any(p['location'] == 'path' for p in fields))
        choose('tenant-isolation', matched(TENANT_KEYS))
        choose('function-access', matched(ROLE_KEYS), bool(terms & {'admin', 'manage', 'management', 'internal', 'console'}))
        choose('field-control', matched(ROLE_KEYS | TENANT_KEYS) if request['side_effect_guard'] else [])
        choose('file-access', matched(FILE_KEYS), bool(terms & {'download', 'export', 'attachment', 'attachments'}))
        choose('file-upload', [p for p in fields if p['type'] == 'file'], bool(terms & {'upload', 'import'}))
        choose('query-input', matched(QUERY_KEYS))
        choose('url-consumption', matched(URL_KEYS))
        choose('business-state', matched(MONEY_KEYS) + (matched(BUSINESS_KEYS) if terms & {'order', 'orders', 'pay', 'payment', 'approval', 'approve', 'booking', 'coupon'} else []))
        choose('content-render', matched(CONTENT_KEYS))
        choose('xml-processing', [], 'xml' in request['content_type'])
        choose('graphql-schema', [], 'graphql' in terms or any(p['name'] == 'operationName' for p in fields))
        choose('session-boundary', [p for p in fields if p['sensitive_context']])
        choose('dispatch-or-duplicates', [p for p in fields if p['occurrences'] > 1 or key_name(p['name']) in {'m', 'method', 'action'}])
        if not selected:
            selected = [('capture-request', [])]
    output = []
    for rule, parameters in selected:
        title, skill, action = RULES[rule]
        names = sorted({p['location'] + ':' + p['path'] for p in parameters})
        score = (20 if request['source_kind'] != 'captured-request' else 40) + min(len(names), 3) * 8
        if rule in ('object-access', 'tenant-isolation', 'function-access', 'file-access', 'business-state'):
            score += 15
        prerequisites = ['保持原请求的认证、租户、签名和 Content-Type；一次只改变一个条件。']
        if request['source_kind'] != 'captured-request':
            prerequisites.append('来源为静态/扫描线索，须先捕获真实请求。')
        if request['context'] == 'unknown':
            prerequisites.append('账号/角色上下文未知，须用受控测试账号补齐。')
        if request['warnings']:
            prerequisites.append('请求解析有缺口，须先核对原包和完整字段。')
        status = request['response']['status']
        if status in (401, 403, 429) or (status is not None and status >= 500):
            prerequisites.append('当前响应为认证/拒绝/限流/失败，不能据此推断路径存在或无漏洞。')
            score -= 15
        if request['side_effect_guard']:
            prerequisites.append('有副作用风险，先读流程与代码；不能进入自动变异/盲重放队列。')
        output.append({'id': digest([request['key'], rule, names])[:24], 'request_key': request['key'], 'rule': rule,
                       'title': title, 'priority_score': max(0, min(score, 100)), 'priority_is_not_severity': True,
                       'status': 'pending', 'parameters': names, 'basis': {'source_kind': request['source_kind'],
                       'method': request['method'], 'context': request['context'], 'url': request['url'], 'sources': request['sources']},
                       'skill': skill, 'next_action': action, 'prerequisites': prerequisites,
                       'side_effect_guard': request['side_effect_guard'], 'capture_fingerprints': request['_fingerprints']})
    return output


def build_plan(captures, static_rows, allowed, context='unknown'):
    combined, warnings, excluded = {}, [], 0
    if len(captures) + len(static_rows) > 5000:
        raise ValueError('单批超过 5000 条，须分批处理')
    for item, source in captures:
        try:
            request = normalized_capture(item, source, allowed, context)
            if request is None:
                excluded += 1
                continue
            request['_fingerprints'] = [request.pop('_fingerprint')]
            if request['key'] in combined:
                old = combined[request['key']]
                old['sources'].extend(request['sources'])
                old['_fingerprints'] = sorted(set(old['_fingerprints'] + request['_fingerprints']))
                old['warnings'] = sorted(set(old['warnings'] + request['warnings']))
                old['side_effect_guard'] |= request['side_effect_guard']
                old['response_observations'].extend(request['response_observations'])
                severity = lambda meta: 3 if meta.get('status') == 429 else 2 if (meta.get('status') or 0) >= 500 else 1 if meta.get('status') in (401, 403) else 0
                old['response'] = max([old['response'], request['response']], key=severity)
            else:
                combined[request['key']] = request
        except (ValueError, KeyError, TypeError, UnicodeError, http.client.HTTPException) as error:
            warnings.append({'source': source, 'reason': str(error) if isinstance(error, ValueError) else '请求字段无效或不完整'})
    for item, source in static_rows:
        try:
            if not isinstance(item, dict):
                raise ValueError('静态候选必须为对象')
            url = item.get('url')
            if not url or '{dynamic}' in url or not in_scope(url, allowed):
                excluded += 1
                continue
            method = item.get('method') or 'UNKNOWN'
            request = {'key': digest([url, method, item.get('context'), 'static'])[:24], 'url': safe_url(url), 'origin': origin(url),
                       'method': method, 'context': item.get('context') or 'unknown', 'source_kind': 'unverified-path-or-js',
                       'sources': [source], 'content_type': '', 'parameters': [], 'header_names': [],
                       'response': {'status': item.get('status'), 'content_type': '', 'has_saved_response': False},
                       'side_effect_guard': True, 'warnings': ['尚未捕获正常业务请求'], '_terms': words(urlsplit(url).path),
                       '_fingerprints': [digest(item)]}
            combined[request['key']] = request
        except (ValueError, TypeError):
            warnings.append({'source': source, 'reason': '静态候选地址无法解析，需人工补齐'})
    hypotheses = [h for request in combined.values() for h in hypothesize(request)]
    hypotheses.sort(key=lambda h: (-h['priority_score'], h['id']))
    requests = [{k: v for k, v in r.items() if not k.startswith('_')} for r in combined.values()]
    wordlists = {}
    for r in combined.values():
        if r['side_effect_guard'] or r['method'] not in ('GET', 'HEAD') or r['source_kind'] != 'captured-request':
            continue
        parts = urlsplit(r['url']).path.strip('/').split('/')
        for depth in range(1, min(len(parts), 3)):
            seed = '/'.join(parts[:depth]) + '/'
            if re.fullmatch(r'[A-Za-z0-9_./-]+', seed) and not (words(seed) & MUTATIONS):
                wordlists.setdefault(r['origin'], set()).add(seed)
    return {'version': 1, 'network_access': False, 'target_code_executed': False, 'scope': allowed,
            'requests': requests, 'hypotheses': hypotheses, 'wordlists': {k: sorted(v)[:500] for k, v in wordlists.items()},
            'warnings': warnings, 'summary': {'requests': len(requests), 'hypotheses': len(hypotheses), 'out_of_scope_or_unresolved': excluded,
            'parse_errors': len(warnings), 'guarded_requests': sum(r['side_effect_guard'] for r in requests)},
            'requires_review': True, 'rate_limit_observed': any(r['response'].get('status') == 429 for r in requests)}


def merge_ledger(previous, plan, workspace):
    identity = digest({'scope': plan['scope'], 'workspace': str(Path(workspace).resolve())})
    if previous and previous.get('identity') != identity:
        raise ValueError('旧台账属于不同范围或工作区，禁止混用')
    records = dict((previous or {}).get('records', {}))
    for candidate in plan['hypotheses']:
        old = records.get(candidate['id'])
        history = old.get('history', []) if old else []
        state = old.get('status', 'pending') if old else 'pending'
        if state not in STATES:
            raise ValueError('台账含无效状态')
        if old and old.get('capture_fingerprints') != candidate['capture_fingerprints']:
            state = 'pending'
            candidate['needs_recheck'] = True
        candidate['status'] = state
        records[candidate['id']] = {**candidate, 'history': history}
    plan['summary']['pending'] = sum(h['status'] == 'pending' for h in plan['hypotheses'])
    plan['summary']['already_recorded'] = len(plan['hypotheses']) - plan['summary']['pending']
    return {'version': 1, 'identity': identity, 'scope': plan['scope'], 'records': records}


def record_result(ledger, identifier, status, note, evidence, workspace):
    identity = digest({'scope': ledger['scope'], 'workspace': str(Path(workspace).resolve())})
    if ledger.get('identity') != identity:
        raise ValueError('旧台账属于不同工作区，禁止写回结果')
    if status not in STATES - {'pending'}:
        raise ValueError('不允许 confirmed 状态；假设支持不等于漏洞确认')
    if not note.strip():
        raise ValueError('验证结果必须写明当前上下文与原因')
    if status in {'supported', 'not_supported'} and not evidence:
        raise ValueError('支持或不支持结论须关联真实证据文件')
    record = ledger['records'][identifier]
    proofs = []
    for filename in evidence:
        path = workspace_path(workspace, filename)
        if not path.is_file() or path.stat().st_size > MAX_FILE:
            raise ValueError('证据文件不存在或超过大小限制')
        proofs.append({'file': str(path.relative_to(Path(workspace).resolve())), 'sha256': digest(path.read_bytes())})
    record['history'].append({'status': status, 'note': note, 'evidence': proofs, 'time': datetime.now(timezone.utc).isoformat()})
    record['status'] = status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    plan_args = subs.add_parser('plan')
    plan_args.add_argument('--workspace', required=True)
    plan_args.add_argument('--scope', action='append', required=True)
    plan_args.add_argument('--context', default='unknown')
    for kind in ('har', 'requests', 'raw', 'js-analysis', 'path-review'):
        plan_args.add_argument('--' + kind, action='append', default=[])
    plan_args.add_argument('--out', default='recon/triage.json')
    plan_args.add_argument('--ledger', default='recon/hypotheses.json')
    plan_args.add_argument('--wordlist')
    result_args = subs.add_parser('result')
    result_args.add_argument('--workspace', required=True)
    result_args.add_argument('--ledger', default='recon/hypotheses.json')
    result_args.add_argument('--id', required=True)
    result_args.add_argument('--status', choices=sorted(STATES - {'pending'}), required=True)
    result_args.add_argument('--note', required=True)
    result_args.add_argument('--evidence', action='append', default=[])
    args = parser.parse_args()
    ledger_path = workspace_path(args.workspace, args.ledger)
    if args.command == 'result':
        ledger = read_json(ledger_path)
        record_result(ledger, args.id, args.status, args.note, args.evidence, args.workspace)
        write_json(ledger_path, ledger)
        print(json.dumps({'id': args.id, 'status': args.status, 'network_access': False}))
        return
    allowed = scopes(args.scope)
    captures, static_rows, inputs = [], [], []
    for kind in ('har', 'requests', 'raw', 'js_analysis', 'path_review'):
        for filename in getattr(args, kind):
            path = workspace_path(args.workspace, filename)
            inputs.append(path)
            if path.stat().st_size > MAX_FILE:
                raise ValueError('输入超过 40MB，须分批处理')
            source = {'file': str(path.relative_to(Path(args.workspace).resolve())), 'kind': kind}
            if kind == 'raw':
                captures.append((raw_capture(path.read_bytes(), allowed, args.context), source))
                continue
            data = read_json(path)
            if kind in ('har', 'requests'):
                entries = data['log']['entries'] if kind == 'har' else data['requests']
                if not isinstance(entries, list):
                    raise ValueError('请求列表必须为数组')
                captures.extend((row, {**source, 'entry': i}) for i, row in enumerate(entries))
            elif kind == 'path_review':
                static_rows.extend((row, {**source, 'entry': i, 'state': row.get('state') if isinstance(row, dict) else None}) for i, row in enumerate(data.get('responses', [])))
            else:
                for i, row in enumerate(data.get('requests', [])):
                    if not isinstance(row, dict):
                        static_rows.append((row, {**source, 'entry': i}))
                        continue
                    url = row.get('effective_url_hint') or row.get('url_pattern')
                    page = row.get('page_url')
                    if url and not url.startswith(('http://', 'https://')) and page and row.get('kind') == 'fetch':
                        from urllib.parse import urljoin
                        url = urljoin(page, url)
                    static_rows.append(({'url': url, 'method': row.get('method'), 'context': row.get('context')},
                                        {**source, 'entry': i, 'js_file': row.get('file'), 'line': row.get('line')}))
    out = workspace_path(args.workspace, args.out)
    wordlist = workspace_path(args.workspace, args.wordlist) if args.wordlist else None
    outputs = [out, ledger_path] + ([wordlist] if wordlist else [])
    if len(set(outputs)) != len(outputs) or set(outputs) & set(inputs):
        raise ValueError('输出不得覆盖输入，计划、台账、字典不能共用同一个文件')
    plan = build_plan(captures, static_rows, allowed, args.context)
    previous = read_json(ledger_path) if ledger_path.exists() else None
    ledger = merge_ledger(previous, plan, args.workspace)
    if wordlist and len({s['origin'] for s in allowed}) != 1:
        raise ValueError('多站点必须分开生成字典，不能混用不同主机路径')
    write_json(out, plan)
    write_json(ledger_path, ledger)
    if wordlist:
        wordlist.parent.mkdir(parents=True, exist_ok=True)
        wordlist.write_text('\n'.join(plan['wordlists'].get(allowed[0]['origin'], [])) + '\n', encoding='utf-8')
        wordlist.chmod(0o600)
    print(json.dumps(plan['summary'], ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, UnicodeError, RecursionError, http.client.HTTPException) as error:
        raise SystemExit('分析失败：' + (str(error) if isinstance(error, ValueError) else type(error).__name__)) from None
