/* ══════════════════════════════════════════════════════════════════════
 * chana · DRT Mode 作战态势大屏（R17，仿 DRT V4.3）
 *
 * 两种视角：
 *   按会话 —— 左：会话消息流  中：实时攻击链  右：本会话战果(L1-L5+漏洞)
 *   按项目 —— 左：项目作战时间线(漏洞/事实/会话落库事件)
 *             中：项目攻击面图谱(事实图谱 BFS 分层)
 *             右：全项目战果(L1-L5+漏洞)
 *
 * 数据全部来自既有 API，零 Go 改动，纯前端轮询（默认 5s）。
 * 模式切换 UI 由本脚本注入 .drtm-top-center，index.html 结构不动。
 * ══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var TIMER = null;
    var MODE = localStorage.getItem('drtm-mode') || 'conv';
    var CURRENT_CONV = localStorage.getItem('drtm-conv') || '';
    var CURRENT_PROJ = localStorage.getItem('drtm-proj') || '';

    var LEVEL_HINTS = [
        { re: /提权|root权限|system权限|域控|宿主机/i, level: 'L5', name: 'root/SYSTEM' },
        { re: /webshell|shell\s*连接|反弹|gsll?5|冰蝎|哥斯拉|内存马/i, level: 'L4', name: '主机 Shell' },
        { re: /rce|命令执行|反序列化|代码执行|ssti|表达式注入|任意文件写|文件上传/i, level: 'L3', name: '命令执行' },
        { re: /越权|未授权|idor|敏感信息|信息泄露|拖库|sql\s*注入|sqli|盲注/i, level: 'L2', name: '越权取数' },
        { re: /弱口令|凭据|账号密码|jwt\s*伪造|token\s*伪造|登录绕过|认证绕过/i, level: 'L1', name: '凭据可复用' }
    ];
    var LV_NAMES = { 5: 'root/SYSTEM', 4: '主机 Shell', 3: '命令执行', 2: '越权取数', 1: '凭据可复用' };
    var SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
    var SEV_CN = { critical: '紧急', high: '高危', medium: '中危', low: '低危', info: '信息' };
    var CAT_CN = {
        asset: '资产', host: '主机', service: '服务', endpoint: '端点', credential: '凭据',
        vuln: '漏洞', vulnerability: '漏洞', finding: '发现', tactic: '战术',
        scope: '范围', note: '笔记', risk: '风险', goal: '目标'
    };

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function short(s, n) {
        s = String(s || '').replace(/\s+/g, ' ').trim();
        return s.length > n ? s.slice(0, n) + '…' : s;
    }

    function fmtTime(t) {
        if (!t) return '';
        var d = new Date(t);
        if (isNaN(d.getTime())) return short(t, 19);
        function p(x) { return (x < 10 ? '0' : '') + x; }
        return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    function ts(t) {
        var d = new Date(t);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }

    /* ---------- 模式切换 UI 注入（index.html 不改结构） ---------- */

    function injectModeUI() {
        var center = document.querySelector('.drtm-top-center');
        if (!center || center.dataset.modeUi) return;
        center.dataset.modeUi = '1';

        var wrap = document.createElement('div');
        wrap.className = 'drtm-modes';
        wrap.innerHTML =
            '<button type="button" class="drtm-mode-btn" data-mode="conv">按会话</button>' +
            '<button type="button" class="drtm-mode-btn" data-mode="proj">按项目</button>';
        center.insertBefore(wrap, center.firstChild);

        var projSel = document.createElement('select');
        projSel.id = 'drtm-proj-select';
        projSel.innerHTML = '<option value="">—— 选择作战项目 ——</option>';
        var convSel = document.getElementById('drtm-conv-select');
        if (convSel && convSel.parentNode) {
            convSel.parentNode.insertBefore(projSel, convSel.nextSibling);
        } else {
            center.appendChild(projSel);
        }

        // 顶部统计条
        var top = document.querySelector('.drtm-top');
        if (top && !document.getElementById('drtm-statbar')) {
            var bar = document.createElement('div');
            bar.className = 'drtm-statbar';
            bar.id = 'drtm-statbar';
            top.appendChild(bar);
        }

        // 面板标题加 id，便于按模式改写
        var heads = document.querySelectorAll('.drtm-col .drtm-panel-head');
        if (heads[0]) heads[0].id = 'drtm-timeline-head';
        if (heads[1]) heads[1].id = 'drtm-chain-head';
        if (heads[2]) heads[2].id = 'drtm-vuln-head';

        wrap.querySelectorAll('.drtm-mode-btn').forEach(function (b) {
            b.onclick = function () { switchMode(b.getAttribute('data-mode')); };
        });
    }

    function applyModeUI() {
        var isProj = MODE === 'proj';
        document.querySelectorAll('.drtm-mode-btn').forEach(function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-mode') === MODE);
        });
        var cs = document.getElementById('drtm-conv-select');
        var ps = document.getElementById('drtm-proj-select');
        if (cs) cs.style.display = isProj ? 'none' : '';
        if (ps) ps.style.display = isProj ? '' : 'none';
        setHead('drtm-timeline-head', isProj ? '作战时间线 <span>项目落库事件</span>' : '作战时间线');
        setHead('drtm-chain-head', isProj ? '攻击面图谱 <span>项目事实图谱</span>' : '实时攻击链');
        setHead('drtm-vuln-head', isProj ? '战果态势 <span>全项目 · L1-L5</span>' : '战果态势');
        var sb = document.getElementById('drtm-statbar');
        if (sb && !isProj) sb.innerHTML = '';
        if (sb) sb.style.display = isProj ? '' : 'none';
    }

    // 面板标题里带计数 span，整块重写会把它们抹掉 —— 按 id 补回来
    var HEAD_COUNT = {
        'drtm-timeline-head': 'drtm-timeline-count',
        'drtm-chain-head': 'drtm-chain-count'
    };

    function setHead(id, html) {
        var el = document.getElementById(id);
        if (!el) return;
        var cntId = HEAD_COUNT[id];
        el.innerHTML = html + (cntId ? ' <span id="' + cntId + '"></span>' : '');
    }

    // 切换模式 / 项目 / 会话时先给即时反馈，避免 await 期间看起来「没反应」
    function showLoading(msg) {
        var tl = document.getElementById('drtm-timeline');
        if (tl) tl.innerHTML = '<div class="drtm-empty">' + esc(msg) + '</div>';
        var ch = document.getElementById('drtm-chain');
        if (ch) ch.innerHTML = '<div class="drtm-empty">' + esc(msg) + '</div>';
        var lv = document.getElementById('drtm-levels'); if (lv) lv.innerHTML = '';
        var vs = document.getElementById('drtm-vuln-stats');
        if (vs) vs.innerHTML = '<div class="drtm-empty">' + esc(msg) + '</div>';
        var vl = document.getElementById('drtm-vuln-list'); if (vl) vl.innerHTML = '';
        var mt = document.getElementById('drtm-meta'); if (mt) mt.innerHTML = '';
        var c1 = document.getElementById('drtm-timeline-count'); if (c1) c1.textContent = '';
        var c2 = document.getElementById('drtm-chain-count'); if (c2) c2.textContent = '';
        var live = document.getElementById('drtm-live');
        if (live) { live.textContent = '↻ 加载中…'; live.className = 'drtm-live'; }
    }

    function switchMode(m) {
        if (m === MODE) return;
        MODE = m;
        localStorage.setItem('drtm-mode', m);
        applyModeUI();
        showLoading(m === 'proj' ? '正在载入项目态势…' : '正在载入会话态势…');
        refresh();
    }

    /* ---------- 选择器数据 ---------- */

    async function loadConversations() {
        var sel = document.getElementById('drtm-conv-select');
        if (!sel) return;
        var r = await apiFetch('/api/conversations?limit=50');
        var j = await r.json();
        var list = (j && j.conversations) || [];
        var html = '<option value="">—— 选择作战会话 ——</option>';
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var t = short(c.title || c.id.slice(0, 8), 34);
            html += '<option value="' + esc(c.id) + '">' + esc(fmtTime(c.updatedAt)) + ' · ' + esc(t) + '</option>';
        }
        sel.innerHTML = html;
        if (CURRENT_CONV) {
            sel.value = CURRENT_CONV;
            if (sel.value !== CURRENT_CONV) CURRENT_CONV = '';
        }
    }

    async function loadProjects() {
        var sel = document.getElementById('drtm-proj-select');
        if (!sel) return;
        var r = await apiFetch('/api/projects?limit=500&status=active', { cache: 'no-store' });
        if (!r.ok) throw new Error('项目列表读取失败');
        var j = await r.json();
        var list = (j && (j.projects || j.data)) || [];
        var html = '<option value="">—— 选择作战项目 ——</option>';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            html += '<option value="' + esc(p.id) + '">' + esc(short(p.name, 30)) +
                (p.status && p.status !== 'active' ? ' [' + esc(p.status) + ']' : '') + '</option>';
        }
        sel.innerHTML = html;
        if (CURRENT_PROJ) {
            sel.value = CURRENT_PROJ;
            if (sel.value !== CURRENT_PROJ) {
                CURRENT_PROJ = '';
                localStorage.removeItem('drtm-proj');
            }
        }
        // 只有一个项目时自动选中，省一次点击
        if (!CURRENT_PROJ && list.length === 1) {
            CURRENT_PROJ = list[0].id;
            localStorage.setItem('drtm-proj', CURRENT_PROJ);
            sel.value = CURRENT_PROJ;
        }
    }

    /* ---------- 数据拉取 ---------- */

    async function fetchConv(id) {
        var r = await apiFetch('/api/conversations/' + encodeURIComponent(id) + '?include_process_details=0');
        return r.json();
    }

    async function fetchChain(id) {
        var r = await apiFetch('/api/attack-chain/' + encodeURIComponent(id));
        if (!r.ok) return null;
        return r.json();
    }

    async function fetchVulns(id) {
        var r = await apiFetch('/api/vulnerabilities?conversation_id=' + encodeURIComponent(id) + '&limit=200');
        if (!r.ok) return [];
        var j = await r.json();
        var arr = (j && (j.vulnerabilities || j.items || j.data)) || [];
        return Array.isArray(arr) ? arr : [];
    }

    async function fetchProjectVulns(pid) {
        var r = await apiFetch('/api/vulnerabilities?project_id=' + encodeURIComponent(pid) + '&limit=500');
        if (!r.ok) return [];
        var j = await r.json();
        var arr = (j && (j.vulnerabilities || j.items || j.data)) || [];
        return Array.isArray(arr) ? arr : [];
    }

    async function fetchProjectFacts(pid) {
        var r = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/facts?limit=300');
        if (!r.ok) return [];
        var j = await r.json();
        return Array.isArray(j) ? j : [];
    }

    async function fetchProjectGraph(pid) {
        var r = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/fact-graph?view=full&exclude_deprecated=0');
        if (!r.ok) return { nodes: [], edges: [] };
        var j = await r.json();
        return { nodes: (j && j.nodes) || [], edges: (j && j.edges) || [] };
    }

    async function fetchProjectConvs(pid) {
        var r = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/conversations?limit=100');
        if (!r.ok) return [];
        var j = await r.json();
        return (j && j.conversations) || [];
    }

    async function fetchProjectMeta(pid) {
        var out = { stats: null, assetTotal: 0, proj: null };
        try {
            var r1 = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/stats');
            if (r1.ok) out.stats = await r1.json();
        } catch (e) { }
        try {
            var r2 = await apiFetch('/api/projects/' + encodeURIComponent(pid));
            if (r2.ok) out.proj = await r2.json();
        } catch (e) { }
        try {
            var r3 = await apiFetch('/api/assets?project_id=' + encodeURIComponent(pid) + '&page=1&page_size=1');
            if (r3.ok) {
                var j3 = await r3.json();
                out.assetTotal = Number(j3 && (j3.total != null ? j3.total : j3.count)) || 0;
            }
        } catch (e) { }
        return out;
    }

    /* ---------- 左列：按会话时间线 ---------- */

    function renderTimeline(conv) {
        var box = document.getElementById('drtm-timeline');
        var cnt = document.getElementById('drtm-timeline-count');
        var msgs = (conv && conv.messages) || [];
        if (cnt) cnt.textContent = msgs.length + ' 条';
        if (!msgs.length) {
            box.innerHTML = '<div class="drtm-empty">暂无消息记录</div>';
            return;
        }
        var show = msgs.slice(-100);
        var html = '';
        for (var i = 0; i < show.length; i++) {
            var m = show[i];
            var role = m.role || 'user';
            var cls = role === 'user' ? 'drtm-tl-user' : (role === 'tool' ? 'drtm-tl-tool' : 'drtm-tl-agent');
            var tag = role === 'user' ? '指令' : (role === 'tool' ? '工具' : 'Agent');
            var body = short(m.content || '', 120);
            html += '<div class="drtm-tl-item ' + cls + '">' +
                '<div class="drtm-tl-head"><span class="drtm-tl-tag">' + tag + '</span>' +
                '<span class="drtm-tl-time">' + esc(fmtTime(m.created_at || m.createdAt)) + '</span></div>' +
                '<div class="drtm-tl-body">' + esc(body) + '</div></div>';
        }
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
    }

    /* ---------- 左列：按项目时间线（落库事件流） ---------- */

    function renderProjectTimeline(vulns, facts, convs) {
        var box = document.getElementById('drtm-timeline');
        var cnt = document.getElementById('drtm-timeline-count');
        if (!box) return;

        var ev = [];
        (vulns || []).forEach(function (v) {
            ev.push({
                t: ts(v.created_at || v.createdAt), kind: 'vuln',
                tag: '漏洞', cls: 'drtm-tl-vuln',
                title: v.title || '(无标题)',
                sub: (v.severity || '') + ' · ' + short(v.target || '', 60)
            });
        });
        (facts || []).forEach(function (f) {
            ev.push({
                t: ts(f.created_at || f.createdAt), kind: 'fact',
                tag: '事实', cls: 'drtm-tl-fact',
                title: f.summary || f.fact_key || '(无摘要)',
                sub: (CAT_CN[f.category] || f.category || '') + ' · ' + (f.confidence || '')
            });
        });
        (convs || []).forEach(function (c) {
            ev.push({
                t: ts(c.updated_at || c.updatedAt), kind: 'conv',
                tag: '会话', cls: 'drtm-tl-agent',
                title: c.title || (c.id || '').slice(0, 8),
                sub: '更新于 ' + fmtTime(c.updated_at || c.updatedAt)
            });
        });
        ev.sort(function (a, b) { return b.t - a.t; });

        if (cnt) cnt.textContent = ev.length + ' 事件';
        if (!ev.length) {
            box.innerHTML = '<div class="drtm-empty">该项目暂无落库事件（漏洞 / 事实 / 会话）</div>';
            return;
        }
        var html = '';
        ev.slice(0, 150).forEach(function (e) {
            html += '<div class="drtm-tl-item ' + e.cls + '">' +
                '<div class="drtm-tl-head"><span class="drtm-tl-tag">' + esc(e.tag) + '</span>' +
                '<span class="drtm-tl-time">' + esc(fmtTime(e.t)) + '</span></div>' +
                '<div class="drtm-tl-body">' + esc(short(e.title, 110)) + '</div>' +
                (e.sub ? '<div class="drtm-tl-sub">' + esc(short(e.sub, 80)) + '</div>' : '') +
                '</div>';
        });
        box.innerHTML = html;
    }

    /* ---------- 中列：按会话实时攻击链 ---------- */

    function renderChain(chain) {
        var box = document.getElementById('drtm-chain');
        var cnt = document.getElementById('drtm-chain-count');
        if (!chain || !chain.nodes || !chain.nodes.length) {
            if (cnt) cnt.textContent = '';
            box.innerHTML = '<div class="drtm-empty">该会话暂无攻击链节点（工具调用未生成节点，或为纯分析会话）</div>';
            return;
        }
        var nodes = chain.nodes, edges = chain.edges || [];
        var byId = {};
        nodes.forEach(function (n) { byId[n.id] = n; });
        var root = null;
        for (var i = 0; i < nodes.length; i++) if (nodes[i].type === 'target') { root = nodes[i]; break; }
        var order = [];
        var seen = {};
        var queue = root ? [root] : nodes.slice(0, 1);
        while (queue.length) {
            var cur = queue.shift();
            if (seen[cur.id]) continue;
            seen[cur.id] = 1;
            order.push(cur);
            var nexts = [];
            edges.forEach(function (e) { if (e.source === cur.id && byId[e.target]) nexts.push({ n: byId[e.target], w: e.weight || 0 }); });
            nexts.sort(function (a, b) { return b.w - a.w; });
            nexts.forEach(function (x) { if (!seen[x.n.id]) queue.push(x.n); });
        }
        nodes.forEach(function (n) { if (!seen[n.id]) order.push(n); });
        if (cnt) cnt.textContent = nodes.length + ' 节点 / ' + edges.length + ' 边';

        var step = 0, vulnN = 0;
        var html = '';
        order.forEach(function (n) {
            var t = n.type || 'action';
            if (t === 'target') {
                html += '<div class="drtm-node drtm-node-target">' +
                    '<div class="drtm-node-type">🎯 目标</div>' +
                    '<div class="drtm-node-label">' + esc(short(n.label, 70)) + '</div></div>';
                return;
            }
            if (t === 'vulnerability') {
                vulnN++;
                html += '<div class="drtm-arrow">▼ 得手</div>' +
                    '<div class="drtm-node drtm-node-vuln">' +
                    '<div class="drtm-node-type">💀 漏洞 #' + vulnN + ' · 风险 ' + (n.risk_score || '-') + '</div>' +
                    '<div class="drtm-node-label">' + esc(short(n.label, 70)) + '</div></div>';
                return;
            }
            step++;
            html += '<div class="drtm-arrow">▼</div>' +
                '<div class="drtm-node drtm-node-action">' +
                '<div class="drtm-node-type">⚡ 动作 #' + step + '</div>' +
                '<div class="drtm-node-label">' + esc(short(n.label, 70)) + '</div></div>';
        });
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
    }

    /* ---------- 中列：按项目攻击面图谱（事实图谱 BFS 分层） ---------- */

    function renderFactGraph(g) {
        var box = document.getElementById('drtm-chain');
        var cnt = document.getElementById('drtm-chain-count');
        if (!box) return;
        var nodes = (g && g.nodes) || [], edges = (g && g.edges) || [];
        if (!nodes.length) {
            if (cnt) cnt.textContent = '';
            box.innerHTML = '<div class="drtm-empty">该项目暂无事实图谱节点<br>' +
                '<span class="drtm-hint">dsh 作业时用 upsert_project_fact 落事实，图谱会实时长出来</span></div>';
            return;
        }
        var byId = {};
        nodes.forEach(function (n) { byId[n.id] = n; });

        var indeg = {}, outgoing = {};
        nodes.forEach(function (n) { indeg[n.id] = 0; });
        edges.forEach(function (e) {
            if (!byId[e.source] || !byId[e.target]) return;
            indeg[e.target] = (indeg[e.target] || 0) + 1;
            (outgoing[e.source] || (outgoing[e.source] = [])).push(e.target);
        });

        var layers = [], seen = {};
        var frontier = nodes.filter(function (n) { return !indeg[n.id]; }).map(function (n) { return n.id; });
        if (!frontier.length) frontier = [nodes[0].id]; // 纯环：随便挑一个起点
        var guard = 0;
        while (frontier.length && guard++ < 20) {
            var layer = [];
            var next = [];
            frontier.forEach(function (id) {
                if (seen[id] || !byId[id]) return;
                seen[id] = 1;
                layer.push(byId[id]);
                (outgoing[id] || []).forEach(function (t) { if (!seen[t]) next.push(t); });
            });
            if (layer.length) layers.push(layer);
            frontier = next;
        }
        var orphan = nodes.filter(function (n) { return !seen[n.id]; });
        if (orphan.length) layers.push(orphan);

        if (cnt) cnt.textContent = nodes.length + ' 节点 / ' + edges.length + ' 边 · ' + layers.length + ' 层';

        var html = '';
        layers.forEach(function (layer, li) {
            html += '<div class="drtm-fg-layer">' +
                '<div class="drtm-fg-layer-head">第 ' + (li + 1) + ' 层 · ' + layer.length + ' 节点</div>' +
                '<div class="drtm-fg-chips">';
            layer.forEach(function (n) {
                var cat = CAT_CN[n.category] || n.category || n.type || 'fact';
                var conf = n.confidence || '';
                var cls = 'drtm-fg-chip' + (n.pinned ? ' is-pinned' : '') +
                    (conf === 'confirmed' ? ' is-confirmed' : (conf === 'deprecated' ? ' is-deprecated' : ''));
                html += '<div class="' + cls + '" title="' + esc(n.summary || n.label || '') + '">' +
                    '<span class="drtm-fg-cat">' + esc(cat) + '</span>' +
                    '<span class="drtm-fg-label">' + esc(short(n.label || n.fact_key || '', 42)) + '</span>' +
                    (conf ? '<span class="drtm-fg-conf">' + esc(conf) + '</span>' : '') +
                    '</div>';
            });
            html += '</div></div>';
            if (li < layers.length - 1) html += '<div class="drtm-arrow">▼ 推导</div>';
        });
        box.innerHTML = html;
        box.scrollTop = 0;
    }

    /* ---------- 顶部统计条（项目模式） ---------- */

    function renderStatBar(meta, vulns, facts, graph) {
        var bar = document.getElementById('drtm-statbar');
        if (!bar) return;
        var st = meta.stats || {};
        var sevCnt = {};
        (vulns || []).forEach(function (v) {
            var s = (v.severity || 'info').toLowerCase();
            sevCnt[s] = (sevCnt[s] || 0) + 1;
        });
        function cell(label, val, cls) {
            return '<span class="drtm-stat' + (cls ? ' ' + cls : '') + '">' +
                '<b>' + esc(val) + '</b>' + esc(label) + '</span>';
        }
        var html = '';
        html += cell('资产', meta.assetTotal);
        html += cell('漏洞', st.vuln_count != null ? st.vuln_count : (vulns || []).length, 'is-vuln');
        html += cell('事实', st.fact_count != null ? st.fact_count : (facts || []).length);
        html += cell('图谱节点', (graph && graph.nodes ? graph.nodes.length : 0));
        html += cell('会话', st.conversation_count != null ? st.conversation_count : 0);
        var sevHtml = '';
        SEV_ORDER.forEach(function (s) {
            if (sevCnt[s]) sevHtml += '<span class="drtm-sev drtm-sev-' + s + '">' + SEV_CN[s] + ' ×' + sevCnt[s] + '</span>';
        });
        if (sevHtml) html += '<span class="drtm-stat-seps"></span>' + sevHtml;
        var p = meta.proj || {};
        if (p.name) html += '<span class="drtm-stat-proj">项目：<b>' + esc(short(p.name, 24)) + '</b>' +
            (p.status && p.status !== 'active' ? ' [' + esc(p.status) + ']' : '') + '</span>';

        bar.innerHTML = html;
    }

    /* ---------- 右列：战果态势（会话 / 项目 共用） ---------- */

    function renderVulns(vulns, ctx) {
        ctx = ctx || {};
        var lvBox = document.getElementById('drtm-levels');
        var stBox = document.getElementById('drtm-vuln-stats');
        var liBox = document.getElementById('drtm-vuln-list');
        var meta = document.getElementById('drtm-meta');
        var sevCnt = {};
        vulns.forEach(function (v) {
            var s = (v.severity || 'info').toLowerCase();
            sevCnt[s] = (sevCnt[s] || 0) + 1;
        });
        var hit = {};
        vulns.forEach(function (v) {
            var text = [v.title, v.type, v.vulnerability_type, v.description, v.evidence].join(' ');
            LEVEL_HINTS.forEach(function (h) {
                if (h.re.test(text)) (hit[h.level] || (hit[h.level] = { name: h.name, titles: [] })).titles.push(short(v.title || '', 40));
            });
        });
        var best = 0;
        ['5', '4', '3', '2', '1'].forEach(function (k) { if (hit['L' + k] && +k > best) best = +k; });
        var lvHtml = '';
        for (var i = 5; i >= 1; i--) {
            var key = 'L' + i;
            var got = hit[key];
            var cls = got ? 'drtm-lv drtm-lv-hit' : 'drtm-lv';
            lvHtml += '<div class="' + cls + '"><span class="drtm-lv-name">' + key + ' ' + LV_NAMES[i] + '</span>' +
                '<span class="drtm-lv-val">' + (got ? '✔ ' + got.titles.length + ' 项' : '—') + '</span></div>';
        }
        lvHtml += '<div class="drtm-lv-best">' + (best > 0
            ? '当前最高层级：L' + best + ' ' + hit['L' + best].name + '（按漏洞类型映射，人工复核）'
            : '暂无层级判定（无漏洞或未收口）') + '</div>';
        lvBox.innerHTML = lvHtml;

        var stHtml = '';
        SEV_ORDER.forEach(function (s) {
            if (sevCnt[s]) stHtml += '<span class="drtm-sev drtm-sev-' + s + '">' + SEV_CN[s] + ' ×' + sevCnt[s] + '</span>';
        });
        stBox.innerHTML = vulns.length
            ? '<div class="drtm-sev-row">' + stHtml + '</div>'
            : '<div class="drtm-empty">' + esc(ctx.emptyText || '无落库漏洞') + '</div>';

        var li = '';
        var sorted = vulns.slice().sort(function (a, b) {
            return SEV_ORDER.indexOf((a.severity || '').toLowerCase()) - SEV_ORDER.indexOf((b.severity || '').toLowerCase());
        });
        sorted.forEach(function (v) {
            li += '<div class="drtm-vuln-row"><span class="drtm-sev-mini drtm-sev-' + (v.severity || 'info').toLowerCase() + '">' + esc((v.severity || '?').toUpperCase()) + '</span>' +
                '<span class="drtm-vuln-title" title="' + esc(short(v.target || '', 80)) + '">' + esc(short(v.title || '', 46)) + '</span></div>';
        });
        liBox.innerHTML = li || '';

        meta.innerHTML = (ctx.metaRows || []).map(function (r) {
            return '<div class="drtm-meta-row">' + r + '</div>';
        }).join('') +
            '<div class="drtm-report-cmd" id="drtm-report-cmd" title="点击复制收口报告命令">' + esc(ctx.reportShort || '') + '</div>';
        var rc = document.getElementById('drtm-report-cmd');
        if (rc) rc.onclick = function () {
            var full = ctx.reportFull || '';
            if (!full) return;
            if (navigator.clipboard) navigator.clipboard.writeText(full);
            rc.textContent = '✓ 已复制完整命令';
            setTimeout(function () { rc.textContent = ctx.reportShort || ''; }, 1500);
        };
    }

    /* ---------- 主刷新 ---------- */

    // 竞态护栏：切模式/换项目时旧请求可能后到，用序号丢弃过期响应
    var SEQ = 0;

    async function refresh() {
        var live = document.getElementById('drtm-live');
        var my = ++SEQ;
        if (MODE === 'proj') { await refreshProject(live, my); return; }

        var id = CURRENT_CONV;
        if (!id) {
            document.getElementById('drtm-timeline').innerHTML = '<div class="drtm-empty">选择一个作战会话后展示时间线 / 攻击链 / 战果</div>';
            document.getElementById('drtm-chain').innerHTML = '<div class="drtm-empty">—</div>';
            document.getElementById('drtm-vuln-stats').innerHTML = '<div class="drtm-empty">—</div>';
            document.getElementById('drtm-levels').innerHTML = '';
            document.getElementById('drtm-vuln-list').innerHTML = '';
            document.getElementById('drtm-meta').innerHTML = '';
            return;
        }
        try {
            var results = await Promise.all([fetchConv(id), fetchChain(id), fetchVulns(id)]);
            if (my !== SEQ) return;
            renderTimeline(results[0]);
            renderChain(results[1]);
            renderVulns(results[2], {
                emptyText: '本会话无落库漏洞',
                metaRows: [
                    '会话：<b>' + esc(short(results[0] && results[0].title, 30)) + '</b>',
                    '角色：' + esc((results[0] && results[0].roleName) || '-') + ' · 模式：' + esc((results[0] && results[0].agentMode) || '-'),
                    '更新：' + esc(fmtTime((results[0] && (results[0].updated_at || results[0].updatedAt))))
                ],
                reportShort: 'python3 tools/pentest_report.py --conversation ' + id.slice(0, 8),
                reportFull: 'cd /opt/chana/app && python3 tools/pentest_report.py --conversation ' + id
            });
            if (live) { live.textContent = '● ' + fmtTime(new Date().toISOString()); live.className = 'drtm-live'; }
        } catch (e) {
            if (live) { live.textContent = '✕ ' + short(e && e.message, 30); live.className = 'drtm-live drtm-live-err'; }
        }
    }

    async function refreshProject(live, my) {
        var pid = CURRENT_PROJ;
        if (!pid) {
            document.getElementById('drtm-timeline').innerHTML = '<div class="drtm-empty">选择一个作战项目后展示时间线 / 攻击面图谱 / 全项目战果</div>';
            document.getElementById('drtm-chain').innerHTML = '<div class="drtm-empty">—</div>';
            document.getElementById('drtm-levels').innerHTML = '';
            document.getElementById('drtm-vuln-stats').innerHTML = '<div class="drtm-empty">—</div>';
            document.getElementById('drtm-vuln-list').innerHTML = '';
            document.getElementById('drtm-meta').innerHTML = '';
            renderStatBar({ stats: null, assetTotal: 0, proj: null }, [], [], null);
            return;
        }
        try {
            var res = await Promise.all([
                fetchProjectMeta(pid), fetchProjectVulns(pid), fetchProjectFacts(pid),
                fetchProjectGraph(pid), fetchProjectConvs(pid)
            ]);
            if (my !== SEQ) return;
            var meta = res[0], vulns = res[1], facts = res[2], graph = res[3], convs = res[4];
            renderStatBar(meta, vulns, facts, graph);
            renderProjectTimeline(vulns, facts, convs);
            renderFactGraph(graph);
            var p = meta.proj || {};
            var st = meta.stats || {};
            renderVulns(vulns, {
                emptyText: '该项目暂无落库漏洞',
                metaRows: [
                    '项目：<b>' + esc(short(p.name, 30)) + '</b>' + (p.status && p.status !== 'active' ? ' [' + esc(p.status) + ']' : ''),
                    '资产 ' + meta.assetTotal + ' · 事实 ' + (st.fact_count != null ? st.fact_count : facts.length) + ' · 会话 ' + (st.conversation_count != null ? st.conversation_count : convs.length),
                    '更新：' + esc(fmtTime(p.updated_at || p.updatedAt))
                ],
                reportShort: 'python3 tools/pentest_report.py --project ' + pid.slice(0, 8),
                reportFull: 'cd /opt/chana/app && python3 tools/pentest_report.py --project ' + pid
            });
            if (live) { live.textContent = '● ' + fmtTime(new Date().toISOString()); live.className = 'drtm-live'; }
        } catch (e) {
            if (live) { live.textContent = '✕ ' + short(e && e.message, 30); live.className = 'drtm-live drtm-live-err'; }
        }
    }

    /* 调试钩子（排查用，保留无害） */
    window.__drtm = {
        mode: function () { return MODE; },
        pid: function () { return CURRENT_PROJ; },
        cid: function () { return CURRENT_CONV; },
        refresh: function () { return refresh(); },
        switchMode: function (m) { return switchMode(m); }
    };

    function tick() {
        if (location.hash !== '#chanamode') return;
        if (MODE === 'proj') loadProjects().then(refresh).catch(function () { });
        else { refresh(); loadConversations().catch(function () { }); }
    }

    function ensureTimer() {
        if (TIMER) clearInterval(TIMER);
        TIMER = setInterval(tick, 5000);
    }

    /* ---------- 入口 ---------- */

    window.chanaModeInit = function () {
        injectModeUI();
        applyModeUI();
        var sel = document.getElementById('drtm-conv-select');
        if (sel && !sel.dataset.bound) {
            sel.dataset.bound = '1';
            sel.onchange = function () {
                CURRENT_CONV = sel.value;
                localStorage.setItem('drtm-conv', CURRENT_CONV);
                showLoading('正在载入会话态势…');
                refresh();
            };
        }
        var ps = document.getElementById('drtm-proj-select');
        if (ps && !ps.dataset.bound) {
            ps.dataset.bound = '1';
            ps.onchange = function () {
                CURRENT_PROJ = ps.value;
                localStorage.setItem('drtm-proj', CURRENT_PROJ);
                showLoading('正在载入项目态势…');
                refresh();

            };
        }
        var rf = document.getElementById('drtm-refresh');
        if (rf) rf.onclick = function () {
            refresh();
            loadConversations().catch(function () { });
            loadProjects().catch(function () { });
        };
        var auto = document.getElementById('drtm-auto');
        if (auto) auto.onchange = function () { auto.checked ? ensureTimer() : (TIMER && (clearInterval(TIMER), TIMER = null)); };
        if (!window.__drtmClock) {
            window.__drtmClock = 1;
            setInterval(function () {
                var ck = document.getElementById('drtm-clock');
                if (ck) ck.textContent = fmtTime(new Date().toISOString()).slice(6);
            }, 1000);
        }
        ensureTimer();
        loadConversations().catch(function () { });
        loadProjects().catch(function () { });
        tick();
    };
    /* hash 直入自动启动（刷新/直链 #chanamode 时菜单 onclick 不会触发） */
    if (location.hash === '#chanamode') {
        setTimeout(function () { if (window.chanaModeInit) window.chanaModeInit(); }, 300);
    }
})();
