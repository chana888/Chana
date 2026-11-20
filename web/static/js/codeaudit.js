/**
 * 代码审计模块 —— 10 路子审计编排
 * 配置任务 → 组装消息 → 跳对话页（角色=代码审计）自动发送
 * v2: 独立「审计模型通道」选择 —— 审计会话与渗透对话分开用模型，发起时临时切换、发完还原
 */

const CODE_AUDIT_LANES = [
    { id: 'A1', name: 'Java 反序列化', star: true, desc: 'ObjectInputStream/Shiro rememberMe/Hessian/XStream/Fastjson/Jackson 多态 · gadget 链比对' },
    { id: 'A2', name: '非 Java 反序列化', star: true, desc: 'Python pickle/yaml.load · PHP unserialize+魔术方法 · Ruby Marshal · .NET ViewState/BinaryFormatter' },
    { id: 'B1', name: 'RCE · 命令注入', star: true, desc: 'Runtime.exec/ProcessBuilder · os.system/subprocess shell=True · system/exec/popen/proc_open · exec.Command' },
    { id: 'B2', name: 'RCE · 表达式/模板注入', star: true, desc: 'SpEL/OGNL/MVEL/Groovy · Freemarker/Velocity · Jinja2/Smarty SSTI' },
    { id: 'B3', name: 'RCE · JNDI/动态加载', star: true, desc: 'InitialContext.lookup/ldap|rmi · Class.forName/defineClass/URLClassLoader · ScriptEngine · JDBC 恶意连接串' },
    { id: 'C',  name: 'SQL 注入', star: false, desc: 'MyBatis ${} · 字符串拼接查询 · ORM 原生/nativeQuery · order by 排序字段注入' },
    { id: 'D',  name: 'SSRF + XXE', star: false, desc: 'URL/HttpClient/RestTemplate/requests 可控 · 内网探测/云元数据 · DocumentBuilder/SAX 解析器' },
    { id: 'E',  name: '文件类', star: false, desc: '上传后缀校验绕过 · 路径穿越任意读写 · Zip Slip · include/require 动态包含' },
    { id: 'F',  name: '认证 / 越权 / 逻辑', star: false, desc: '端点-权限矩阵 · 鉴权白名单泄露 · IDOR 归属校验缺失 · 硬编码密钥 · AES-ECB/弱加密' },
    { id: 'G',  name: '配置 / 供应链', star: false, desc: 'actuator/druid/swagger 暴露 · fastjson/log4j/shiro 版本 N-day 比对 · .env/密钥文件 · 网关路由注入' },
];

const CODE_AUDIT_CHANNEL_KEY = 'cyberstrike-codeaudit-ai-channel';
let codeAuditChannels = {};       // id -> {name, model, ...}
let codeAuditDefaultChannel = '';

function codeAuditInit() {
    if (document.getElementById('codeaudit-lanes').children.length > 0) return;
    const grid = document.getElementById('codeaudit-lanes');
    CODE_AUDIT_LANES.forEach(lane => {
        const card = document.createElement('label');
        card.className = 'codeaudit-lane' + (lane.star ? ' codeaudit-lane-star' : '');
        card.innerHTML =
            '<input type="checkbox" checked data-lane="' + lane.id + '">' +
            '<div class="codeaudit-lane-head">' +
            '<span class="codeaudit-lane-id">' + lane.id + (lane.star ? ' ★' : '') + '</span>' +
            '<span class="codeaudit-lane-name">' + lane.name + '</span>' +
            '</div>' +
            '<div class="codeaudit-lane-desc">' + lane.desc + '</div>';
        grid.appendChild(card);
    });
    const sel = document.getElementById('codeaudit-mode');
    if (sel && !sel.value) sel.value = 'deep';
    codeAuditInjectUpload();
    codeAuditInjectTargetSelect();
    codeAuditInjectLiveViewButton();
    codeAuditInjectHistory();
}

/* ── 执行台：审计任务投递到 DeepSeek Harness（dsh），在执行台的 Harness 会话里实时跑 ── */
function codeAuditShowLiveView() {
    codeAuditEnsureFrame();
    if (typeof switchPage === 'function') switchPage('codeaudit-live');
    if (typeof updateNavState === 'function') updateNavState('codeaudit');
    return true;
}

function codeAuditShowHarnessView() {
    /* 兼容旧入口：审计统一回到代码审计配置页 */
    if (typeof switchPage === 'function') switchPage('codeaudit');
}

function codeAuditLiveFrame() {
    return document.getElementById('codeaudit-live-frame');
}

function codeAuditEnsureFrame() {
    var f = codeAuditLiveFrame();
    if (!f) return null;
    var cur = f.getAttribute('src') || '';
    if (!cur || cur === 'about:blank') f.setAttribute('src', f.getAttribute('data-src') || '/dsh/');
    return f;
}

function codeAuditSetState(text, bad) {
    var el = document.getElementById('codeaudit-live-state');
    if (!el) return;
    el.textContent = text;
    el.style.color = bad ? '#c0392b' : '';
}

function codeAuditWaitFor(cond, timeoutMs) {
    return new Promise(function (resolve) {
        var start = Date.now();
        (function tick() {
            var v = null;
            try { v = cond(); } catch (e) { v = null; }
            if (v) { resolve(v); return; }
            if (Date.now() - start > timeoutMs) { resolve(null); return; }
            setTimeout(tick, 400);
        })();
    });
}

/* dsh 编辑器是 Lexical：直接改 textContent 不进编辑器状态，
   必须走「Ctrl+A 全选 → paste 事件（DataTransfer）→ Enter 键」这条真实输入链路。 */
function codeAuditHarnessPaste(doc, win, text) {
    var ed = doc.querySelector('[data-composer-input]');
    if (!ed) return null;
    ed.focus();
    ed.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, which: 65, ctrlKey: true, bubbles: true, cancelable: true }));
    var dt = new win.DataTransfer();
    dt.setData('text/plain', text);
    ed.dispatchEvent(new win.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    return ed;
}

/* 新会话刚建好时编辑器监听器可能还没挂上，粘贴会静默失败：
   每轮粘贴后重新取一次编辑框回读，最多 5 轮，成功返回该编辑框。 */
async function codeAuditFillComposer(doc, win, text) {
    var need = Math.min(24, text.length);
    for (var attempt = 0; attempt < 5; attempt++) {
        var ed = doc.querySelector('[data-composer-input]');
        if (ed) codeAuditHarnessPaste(doc, win, text);
        await new Promise(function (r) { setTimeout(r, 700); });
        var cur = doc.querySelector('[data-composer-input]');
        if (cur && (cur.innerText || '').trim().length >= need) return cur;
    }
    return null;
}

function codeAuditHarnessSubmit(doc, win) {
    var ed = doc.querySelector('[data-composer-input]');
    if (!ed) return false;
    var before = (ed.innerText || '').trim();
    if (!before) return false;
    ed.focus();
    ed.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return true;
}

/* ── 归属项目文件夹 ──
   默认「代码审计」（对应平台项目「代码审计」）；需要单独归属时在「③ 发起」上方切换。 */
var CODE_AUDIT_TARGET_KEY = 'cyberstrike-codeaudit-workspace';
var CODE_AUDIT_DEFAULT_WORKSPACE = '代码审计';
var codeAuditSyncingSelect = false;

function codeAuditTargetTitle() {
    try {
        var v = localStorage.getItem(CODE_AUDIT_TARGET_KEY);
        if (v && v.trim()) return v.trim();
    } catch (e) { /* 隐私模式下回落默认值 */ }
    return CODE_AUDIT_DEFAULT_WORKSPACE;
}

function codeAuditStoreTarget(title) {
    try { localStorage.setItem(CODE_AUDIT_TARGET_KEY, title || ''); } catch (e) {}
}

/* 下拉挂在「③ 发起」按钮上方：选哪个项目文件夹，审计结果就记到哪个项目 */
function codeAuditInjectTargetSelect() {
    /* 上传按钮/执行台按钮同属 codeaudit-launch-btn 类，按 onclick 才能取到「发起深度审计」 */
    var btn = document.querySelector('#page-codeaudit button[onclick*="codeAuditLaunch"]');
    if (!btn || document.getElementById('codeaudit-target-select')) return;
    var row = document.createElement('div');
    row.className = 'codeaudit-form-row';
    row.innerHTML = '<label>归属项目文件夹</label>' +
        '<select id="codeaudit-target-select" title="审计结果记到哪个项目（Harness 工作区）"></select>';
    /* 直接插在按钮前面，不依赖 .codeaudit-note 的位置（模板结构会变） */
    btn.parentNode.insertBefore(row, btn);
    var sel = row.querySelector('select');
    sel.addEventListener('change', function () {
        if (codeAuditSyncingSelect) return;
        codeAuditStoreTarget(sel.value);
        codeAuditStatus('归属项目已切换为「' + sel.value + '」');
    });
    codeAuditFillTargets([]);
    codeAuditLoadTargets();
}

function codeAuditFillTargets(names) {
    var sel = document.getElementById('codeaudit-target-select');
    if (!sel) return;
    var target = codeAuditTargetTitle();
    var list = (names || []).slice();
    if (list.indexOf(CODE_AUDIT_DEFAULT_WORKSPACE) < 0) list.unshift(CODE_AUDIT_DEFAULT_WORKSPACE);
    if (list.indexOf(target) < 0) list.push(target);
    codeAuditSyncingSelect = true;
    sel.innerHTML = '';
    list.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        sel.appendChild(o);
    });
    sel.value = target;
    codeAuditSyncingSelect = false;
}

async function codeAuditLoadTargets() {
    if (typeof apiFetch !== 'function') return;
    try {
        var r = await apiFetch('/api/projects?limit=500&status=active');
        var data = await r.json();
        var items = (data && data.projects) || [];
        var names = items.map(function (p) { return p.name || ''; }).filter(Boolean);
        if (names.length) codeAuditFillTargets(names);
    } catch (e) { /* 列表取不到就保留默认项 */ }
}

/* 侧栏会话行：data-row-key="session:<id>"，aria-selected 标出当前会话 */
function codeAuditSessionRows(doc) {
    var out = {};
    if (!doc) return out;
    var rows = doc.querySelectorAll('[data-row-key^="session:"]');
    for (var i = 0; i < rows.length; i++) {
        var key = rows[i].getAttribute('data-row-key') || '';
        out[key.slice(8)] = rows[i].getAttribute('aria-selected') === 'true';
    }
    return out;
}

function codeAuditWorkspaceButton(doc, title) {
    if (!doc || !title) return null;
    var label = '在“' + title + '”中新建会话';
    var btns = doc.querySelectorAll('button[aria-label]');
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('aria-label') === label) return btns[i];
    }
    return null;
}

/* 在指定工作区里新建会话；返回新会话 id，失败返回 null（绝不把任务塞进别的会话） */
/* 当前选中的会话（侧栏 aria-selected=true） */
function codeAuditSelectedSession(doc) {
    if (!doc) return null;
    var rows = doc.querySelectorAll('[data-row-key^="session:"]');
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('aria-selected') === 'true') {
            return (rows[i].getAttribute('data-row-key') || '').slice(8);
        }
    }
    return null;
}

/* 等侧栏会话列表渲染稳定：连续两轮数量与集合一致才算数 */
async function codeAuditStableSessions(doc) {
    var cur = codeAuditSessionRows(doc);
    for (var i = 0; i < 15; i++) {
        await new Promise(function (r) { setTimeout(r, 400); });
        var next = codeAuditSessionRows(doc);
        var a = Object.keys(next).sort().join(','), b = Object.keys(cur).sort().join(',');
        if (a === b) return next;
        cur = next;
    }
    return cur;
}

async function codeAuditNewSessionIn(doc, win, title) {
    /* 侧栏是懒渲染的：刚切页/刚加载时工作区行还没有按钮，先等它出现 */
    var first = await codeAuditWaitFor(function () {
        return codeAuditWorkspaceButton(doc, title);
    }, 20000);
    if (!first) return null;
    /* 列表还没渲染完就取快照会把老会话误认为新会话 */
    await codeAuditStableSessions(doc);
    for (var attempt = 0; attempt < 3; attempt++) {
        var btn = codeAuditWorkspaceButton(doc, title);
        if (!btn) return null;
        var prevSel = codeAuditSelectedSession(doc);
        btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
        var fresh = await codeAuditWaitFor(function () {
            var sel = codeAuditSelectedSession(doc);
            return (sel && sel !== prevSel) ? sel : null;
        }, 8000);
        if (fresh) return fresh;
        await new Promise(function (r) { setTimeout(r, 700); });
    }
    return null;
}

var codeAuditLastMessage = '';

async function codeAuditDeliverToHarness(message) {
    /* 必须在执行台可见时操作 Harness：页面隐藏时侧栏会话列表不渲染，无法校验新会话 */
    if (typeof codeAuditShowLiveView === 'function') codeAuditShowLiveView();
    var frame = codeAuditEnsureFrame();
    if (!frame) { codeAuditSetState('✗ 执行台未就绪', true); return false; }
    codeAuditSetState('正在启动 Harness（首次加载约 10 秒）…');
    var doc = await codeAuditWaitFor(function () {
        var d = frame.contentDocument;
        return (d && d.querySelector('[data-composer-input]')) ? d : null;
    }, 60000);
    if (!doc) { codeAuditSetState('✗ Harness 未就绪（可能需要重新授权 /dsh/）', true); return false; }
    var win = frame.contentWindow;

    var target = codeAuditTargetTitle();
    codeAuditSetState('正在「' + target + '」中新建审计会话…');
    var sid = await codeAuditNewSessionIn(doc, win, target);
    if (!sid) {
        codeAuditSetState('✗ 未能在「' + target + '」中新建会话，请确认该文件夹存在后重新发起', true);
        return false;
    }

    codeAuditSetState('正在投递审计任务…');
    var ed = await codeAuditFillComposer(doc, win, message);
    if (!ed) { codeAuditSetState('✗ 任务文本未能写入输入框，请重试', true); return false; }
    if (!codeAuditHarnessSubmit(doc, win)) { codeAuditSetState('✗ 提交失败', true); return false; }
    codeAuditLastMessage = message;
    var rbtn = document.getElementById('codeaudit-live-resend');
    if (rbtn) rbtn.style.display = '';
    codeAuditSetState('✓ 已投递到「' + target + '」新会话（' + sid.slice(0, 15) + '…），审计过程在下方实时显示');
    return true;
}

async function codeAuditResend() {
    if (!codeAuditLastMessage) return;
    await codeAuditDeliverToHarness(codeAuditLastMessage);
}

function codeAuditInjectLiveViewButton() {
    const status = document.getElementById('codeaudit-status');
    if (!status || document.getElementById('codeaudit-liveview-btn')) return;
    const row = document.createElement('div');
    row.className = 'codeaudit-form-row';
    row.innerHTML =
        '<label>查看审计过程</label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" id="codeaudit-liveview-btn" class="codeaudit-launch-btn" style="padding:8px 16px;font-size:13px" onclick="codeAuditOpenLiveView()">打开实时审计视图</button>' +
        '<span class="codeaudit-note" style="margin:0">审计在 DeepSeek Harness 里跑（工作区「代码审计」），执行台即 Harness 会话；模型在会话内切换（默认 deepseek-flash），过程可追溯、可随时追问。</span>' +
        '</div>';
    status.parentNode.insertBefore(row, status);
}

function codeAuditOpenLiveView() {
    codeAuditShowLiveView();
}

/* ── 历史审计任务：Harness 会话在侧栏，平台原生引擎时期的会话在这里只读查看 ── */
function codeAuditEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function codeAuditInjectHistory() {
    if (document.getElementById('codeaudit-history-box')) return;
    const status = document.getElementById('codeaudit-status');
    if (!status) return;
    const box = document.createElement('div');
    box.className = 'codeaudit-form-row';
    box.id = 'codeaudit-history-box';
    box.innerHTML =
        '<label>历史审计任务 / 漏洞去向</label>' +
        '<div class="codeaudit-note" style="margin:0 0 6px">新审计（Harness）的会话在「执行台」左侧「工作区 › 代码审计」里，可随时继续追问；下面是平台原生引擎时期的历史会话（只读）。审计产出的漏洞统一进「漏洞管理」。</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
        '<button type="button" class="btn-secondary btn-small" onclick="switchPage(\'vulnerabilities\')">打开漏洞管理</button>' +
        '<span id="codeaudit-vuln-count" style="font-size:12px;color:var(--text-secondary,#888)"></span>' +
        '</div>' +
        '<div id="codeaudit-history-list" style="font-size:13px">加载中…</div>';
    status.parentNode.insertBefore(box, status);
    codeAuditLoadHistory();
    codeAuditLoadVulnCount();
}

async function codeAuditFetchJSON(url) {
    const fn = (typeof apiFetch === 'function') ? apiFetch : function (u) { return fetch(u, { credentials: 'same-origin' }); };
    const r = await fn(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
}

async function codeAuditLoadVulnCount() {
    const el = document.getElementById('codeaudit-vuln-count');
    if (!el) return;
    try {
        const data = await codeAuditFetchJSON('/api/vulnerabilities?limit=1');
        const total = (data && (data.total != null ? data.total : (data.vulnerabilities || []).length)) || 0;
        el.textContent = '当前漏洞库：' + total + ' 条';
    } catch (e) {
        el.textContent = '';
    }
}

async function codeAuditLoadHistory() {
    const listEl = document.getElementById('codeaudit-history-list');
    if (!listEl) return;
    try {
        const data = await codeAuditFetchJSON('/api/conversations?limit=300');
        const items = (data.conversations || []).filter(function (c) {
            return (c.roleName || '') === '代码审计';
        });
        if (!items.length) { listEl.textContent = '暂无历史审计会话（新审计请直接发起，会话会出现在执行台左侧）'; return; }
        listEl.innerHTML = '';
        items.forEach(function (c) {
            const lines = String(c.title || '').split('\n');
            const head = (lines[0] || '').replace('【代码审计任务】', '代码审计任务').trim() || '(无标题)';
            const pathLine = lines.filter(function (l) { return l.indexOf('目标项目路径') >= 0; })[0] || '';
            const when = new Date(c.createdAt).toLocaleString('zh-CN', { hour12: false });
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border-color,#eee)';
            row.innerHTML =
                '<span style="flex:0 0 auto;color:var(--text-secondary,#888);font-variant-numeric:tabular-nums">' + codeAuditEsc(when) + '</span>' +
                '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + codeAuditEsc(pathLine || head) + '">' + codeAuditEsc(head) + '</span>' +
                '<button type="button" class="btn-secondary btn-small">查看</button>';
            row.querySelector('button').onclick = function () { codeAuditOpenHistory(c.id); };
            listEl.appendChild(row);
        });
    } catch (e) {
        listEl.textContent = '加载失败：' + ((e && e.message) || e);
    }
}

async function codeAuditOpenHistory(id) {
    let modal = document.getElementById('codeaudit-history-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'codeaudit-history-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px';
    modal.innerHTML =
        '<div style="background:var(--card-bg,#fff);color:var(--text-primary,#111);border-radius:10px;width:min(920px,96vw);max-height:86vh;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border-color,#e5e7eb)">' +
        '<strong style="flex:1">历史审计会话（只读）</strong>' +
        '<button type="button" class="btn-secondary btn-small">关闭</button></div>' +
        '<div id="codeaudit-history-body" style="padding:14px 16px;overflow:auto;font-size:13px;line-height:1.65">加载中…</div></div>';
    modal.querySelector('button').onclick = function () { modal.remove(); };
    modal.addEventListener('click', function (ev) { if (ev.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    const body = modal.querySelector('#codeaudit-history-body');
    try {
        const conv = await codeAuditFetchJSON('/api/conversations/' + encodeURIComponent(id) + '?include_process_details=1');
        const msgs = conv.messages || [];
        if (!msgs.length) { body.textContent = '该会话没有消息记录'; return; }
        body.innerHTML = msgs.map(function (m) {
            const who = m.role === 'user' ? '我' : (m.role === 'assistant' ? '审计引擎' : m.role);
            return '<div style="margin-bottom:14px">' +
                '<div style="font-size:12px;color:var(--text-secondary,#888);margin-bottom:4px">' + codeAuditEsc(who) +
                (m.createdAt ? ' · ' + codeAuditEsc(new Date(m.createdAt).toLocaleString('zh-CN', { hour12: false })) : '') + '</div>' +
                '<div style="white-space:pre-wrap;word-break:break-word;background:var(--bg-secondary,#f7f8fa);border-radius:6px;padding:10px 12px">' +
                codeAuditEsc(m.content || '') + '</div></div>';
        }).join('');
    } catch (e) {
        body.textContent = '加载失败：' + ((e && e.message) || e);
    }
}

/* ── 本地项目上传：压缩包 → VPS 安全解压 → 自动填路径 ── */
function codeAuditInjectUpload() {
    if (document.getElementById('codeaudit-file')) return;
    const pathInput = document.getElementById('codeaudit-path');
    if (!pathInput) return;
    const row = document.createElement('div');
    row.className = 'codeaudit-form-row';
    row.innerHTML =
        '<label>或上传本地项目压缩包（自动解压到 VPS 后填入路径）</label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" class="codeaudit-launch-btn" style="padding:8px 16px;font-size:13px" onclick="codeAuditPickFile()">选择压缩包上传</button>' +
        '<span id="codeaudit-upload-name" style="font-size:12px;color:var(--text-secondary,inherit)">支持 .zip / .tar.gz / .tgz / .tar，最大 512MB（解压后 ≤2GB）</span>' +
        '</div>' +
        '<input type="file" id="codeaudit-file" accept=".zip,.tar.gz,.tgz,.tar" style="display:none">' +
        '<div id="codeaudit-upload-progress" style="display:none;margin-top:8px;height:6px;border-radius:3px;background:var(--border-color,#e9ecef);overflow:hidden">' +
        '<div id="codeaudit-upload-bar" style="height:100%;width:0%;background:var(--accent-color,#e60012);transition:width .15s"></div>' +
        '</div>';
    pathInput.closest('.codeaudit-form-row').insertAdjacentElement('afterend', row);
    const inp = document.getElementById('codeaudit-file');
    inp.addEventListener('change', function () { codeAuditDoUpload(); });
}

function codeAuditPickFile() {
    const f = document.getElementById('codeaudit-file');
    if (f) f.click();
}

async function codeAuditDoUpload() {
    const inp = document.getElementById('codeaudit-file');
    const file = inp && inp.files && inp.files[0];
    if (!file) return;
    const nameEl = document.getElementById('codeaudit-upload-name');
    const wrap = document.getElementById('codeaudit-upload-progress');
    const bar = document.getElementById('codeaudit-upload-bar');
    const reset = function () { if (wrap) { wrap.style.display = 'none'; } if (bar) { bar.style.width = '0%'; } inp.value = ''; };
    const lname = file.name.toLowerCase();
    if (!/\.(zip|tar\.gz|tgz|tar)$/.test(lname)) {
        codeAuditStatus('✗ 仅支持 .zip / .tar.gz / .tgz / .tar 源码压缩包');
        inp.value = '';
        return;
    }
    if (nameEl) nameEl.textContent = file.name + '（' + (file.size >> 20) + 'MB）上传中…';
    if (wrap) wrap.style.display = 'block';
    codeAuditStatus('正在上传 ' + file.name + ' …');
    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await apiUploadWithProgress('/api/codeaudit/upload', fd, {
            onProgress: function (p) {
                if (bar && p && typeof p.percent === 'number') bar.style.width = p.percent + '%';
            }
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
        const pathEl = document.getElementById('codeaudit-path');
        if (pathEl) pathEl.value = data.path;
        if (nameEl) nameEl.textContent = file.name + ' → 已解压 ' + data.files + ' 个文件' + (data.skipped ? '（安全策略剔除 ' + data.skipped + ' 个风险条目）' : '');
        codeAuditStatus('✓ 上传成功：' + data.files + ' 个文件已落地 ' + data.path + '，可直接发起审计');
    } catch (e) {
        codeAuditStatus('✗ 上传失败: ' + ((e && e.message) || e));
        if (nameEl) nameEl.textContent = '上传失败，可重试（.zip / .tar.gz / .tgz / .tar，≤512MB）';
    } finally {
        reset();
    }
}

/* ── 审计模型通道：动态注入（不动 index.html，免重启） ── */
function codeAuditInjectChannelSelect() {
    if (document.getElementById('codeaudit-channel')) return;
    const modeSel = document.getElementById('codeaudit-mode');
    if (!modeSel) return;
    const row = document.createElement('div');
    row.className = 'codeaudit-form-row';
    row.innerHTML =
        '<label>审计模型通道（独立于渗透对话）</label>' +
        '<select id="codeaudit-channel" disabled><option value="">加载中…</option></select>' +
        '<div class="codeaudit-note" style="margin:2px 0 0">发起审计时临时切到该通道，发完自动还原；后续在对话页追问审计会话时，可在输入框上方的「AI 通道」手动切回。</div>';
    modeSel.closest('.codeaudit-form-row').insertAdjacentElement('afterend', row);
    codeAuditLoadChannels();
}

async function codeAuditLoadChannels() {
    const sel = document.getElementById('codeaudit-channel');
    if (!sel) return;
    try {
        const r = await apiFetch('/api/config');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const cfg = await r.json();
        const ai = (cfg && cfg.ai) || {};
        codeAuditChannels = (ai.channels && typeof ai.channels === 'object') ? ai.channels : {};
        codeAuditDefaultChannel = String(ai.default_channel || '');
    } catch (e) {
        sel.innerHTML = '<option value="">获取通道失败（' + (e && e.message || e) + '），将跟随平台默认</option>';
        return;
    }
    const ids = Object.keys(codeAuditChannels).filter(id => {
        const ch = codeAuditChannels[id] || {};
        return ch.name || ch.model;
    }).sort();
    let html = '<option value="">跟随平台默认' +
        (codeAuditDefaultChannel && codeAuditChannels[codeAuditDefaultChannel]
            ? '（' + (codeAuditChannels[codeAuditDefaultChannel].name || codeAuditDefaultChannel) + '）'
            : '') + '</option>';
    ids.forEach(id => {
        const ch = codeAuditChannels[id] || {};
        html += '<option value="' + id + '">' + (ch.name || id) + (ch.model ? ' · ' + ch.model : '') + '</option>';
    });
    sel.innerHTML = html;
    sel.disabled = false;
    let stored = '';
    try { stored = localStorage.getItem(CODE_AUDIT_CHANNEL_KEY) || ''; } catch (e) {}
    if (stored && codeAuditChannels[stored]) sel.value = stored;
    sel.addEventListener('change', function () {
        try {
            if (sel.value) localStorage.setItem(CODE_AUDIT_CHANNEL_KEY, sel.value);
            else localStorage.removeItem(CODE_AUDIT_CHANNEL_KEY);
        } catch (e) {}
    });
}

function codeAuditSelectedChannelLabel() {
    const sel = document.getElementById('codeaudit-channel');
    if (!sel || !sel.value) return '';
    const ch = codeAuditChannels[sel.value] || {};
    return (ch.name || sel.value) + (ch.model ? ' · ' + ch.model : '');
}

function codeAuditBuildMessage() {
    const path = (document.getElementById('codeaudit-path') || {}).value || '';
    const mode = (document.getElementById('codeaudit-mode') || {}).value || 'deep';
    const checked = Array.from(document.querySelectorAll('#codeaudit-lanes input[type=checkbox]:checked'))
        .map(i => i.dataset.lane);
    const unchecked = CODE_AUDIT_LANES.filter(l => checked.indexOf(l.id) < 0).map(l => l.id + ' ' + l.name);
    const laneTexts = CODE_AUDIT_LANES.filter(l => checked.indexOf(l.id) >= 0)
        .map(l => l.id + ' ' + l.name + '（' + l.desc.split('·')[0].trim() + '）');

    return [
        '【代码审计任务】',
        '执行环境: DeepSeek Harness（工作区「' + codeAuditTargetTitle() + '」），当前会话 cwd 与目标目录可能不同，目标路径按下面的绝对路径访问。',
        '目标项目路径: ' + path,
        '审计模式: ' + mode,
        '',
        '启用审计路（共 ' + checked.length + ' 路）:',
        ...laneTexts.map(t => '- ' + t),
        unchecked.length ? '\n未启用路（仍需轻扫排除并在报告中说明理由）: ' + unchecked.join('、') : '',
        '',
        '请加载 code-audit 技能，严格按 references/core/orchestration-10lanes.md 协议执行完整审计:',
        '阶段0 侦察（结构/语言/框架/模块/依赖版本）→ 阶段A+B 10路子审计（每路扫描+逐条深挖，写 lane 文件）→ 阶段C 汇总去重+覆盖矩阵 → 阶段D 高价值深挖（A/B 路全部候选 source→sink 数据流回溯，拼完整 HTTP 请求）→ 阶段E 判定落库。',
        '深度要求: 以小时计、工具调用数百步起步，禁止十几分钟交差；全量覆盖不采样；每命中读上下文≥30行；RCE/反序列化路全部回溯；卡 L1 不进报告；确认危害逐条 record_vulnerability 落库，报告给 Burp 原始请求包。',
    ].filter(x => x !== '').join('\n');
}

async function codeAuditLaunch() {
    const path = (document.getElementById('codeaudit-path') || {}).value || '';
    const pathEl = document.getElementById('codeaudit-path');
    if (!path.trim()) { pathEl.focus(); codeAuditStatus('✗ 请先填写目标项目路径（VPS 上的项目目录）'); return; }
    const checked = document.querySelectorAll('#codeaudit-lanes input[type=checkbox]:checked');
    if (checked.length === 0) { codeAuditStatus('✗ 至少启用一路审计'); return; }

    const message = codeAuditBuildMessage();
    codeAuditStatus('正在投递审计任务到 Harness…');
    codeAuditShowLiveView();
    let ok = false;
    try {
        ok = await codeAuditDeliverToHarness(message);
    } catch (e) {
        ok = false;
    }
    if (ok) {
        codeAuditStatus('✓ 审计任务已投递到 Harness（工作区「' + codeAuditTargetTitle() + '」），过程见本页执行台');
    } else {
        try { await navigator.clipboard.writeText(message); } catch (e) {}
        codeAuditStatus('✗ 未能自动投递。任务文本已复制到剪贴板：请到执行台输入框 Ctrl+V 后回车发送。');
    }
}

function codeAuditStatus(text) {
    const el = document.getElementById('codeaudit-status');
    if (el) { el.textContent = text; el.className = text.startsWith('✓') ? 'codeaudit-status ok' : (text.startsWith('✗') ? 'codeaudit-status err' : 'codeaudit-status'); }
}

window.codeAuditInit = codeAuditInit;
window.codeAuditLaunch = codeAuditLaunch;
window.codeAuditPickFile = codeAuditPickFile;
window.codeAuditDoUpload = codeAuditDoUpload;
window.codeAuditShowLiveView = codeAuditShowLiveView;
window.codeAuditShowHarnessView = codeAuditShowHarnessView;
window.codeAuditOpenLiveView = codeAuditOpenLiveView;
window.codeAuditResend = codeAuditResend;
window.codeAuditEnsureFrame = codeAuditEnsureFrame;
