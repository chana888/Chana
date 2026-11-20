/* =====================================================================
 * POC 工厂（2026-10-04 二开）
 * 三步流水线：①AI 从漏洞证据生成 nuclei 模板（可入库/单目标自测）
 *            ②FOFA 资产扩面勾选
 *            ③nuclei 并发批量验证 + 命中一键落库漏洞管理
 * ===================================================================== */

const pocforgeState = {
    assets: [],            // {target, title, server, ip, port, checked}
    taskId: null,
    pollTimer: null,
    task: null,
    landCid: null,         // 落库借用 conversation_id
    landedTargets: new Set(),
    inited: false,
};

function pocEl(id) { return document.getElementById(id); }

function pocStatus(msg, isErr) {
    const el = pocEl('poc-fofa-meta') || pocEl('poc-gen-warn');
    if (!el) return;
    el.style.display = msg ? '' : 'none';
    el.className = isErr ? 'pocforge-error-text' : 'muted';
    el.textContent = msg || '';
}

function pocInit() {
    if (pocforgeState.inited) return;
    pocforgeState.inited = true;
    pocListTemplates();
    // 落库用 conversation_id：借用任意既有漏洞的会话（CreateVulnerability 外键要求）
    apiFetch('/api/vulnerabilities?limit=1&page=1')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            const items = Array.isArray(data) ? data : (data && Array.isArray(data.vulnerabilities) ? data.vulnerabilities : []);
            if (items.length > 0 && items[0].conversation_id) {
                pocforgeState.landCid = items[0].conversation_id;
            }
        })
        .catch(() => {});
}

/* ==================== ① 生成 / 自测 / 模板库 ==================== */

async function pocGenerate(btnEl, preset) {
    const src = preset || {};
    const title = String(src.title !== undefined ? src.title : (pocEl('poc-gen-title').value || '')).trim();
    const evidence = String(src.evidence !== undefined ? src.evidence : (pocEl('poc-gen-evidence').value || '')).trim();
    if (!title || !evidence) { alert('请填写漏洞标题与漏洞证据'); return; }
    const warnEl = pocEl('poc-gen-warn');
    warnEl.style.display = 'none';
    // btnEl：由「逐漏洞生成 PoC」传入卡片按钮；直接点本页按钮时回落到 window.event.target
    const btn = btnEl || (window.event && window.event.target) || null;
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI 生成中（约10-60秒）…'; }
    try {
        const resp = await apiFetch('/api/pocforge/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                severity: src.severity || pocEl('poc-gen-severity').value,
                evidence,
            }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            alert('生成失败: ' + (data.error || resp.status));
            return;
        }
        pocEl('poc-tpl').value = data.template || '';
        if (data.warnings && data.warnings.length) {
            warnEl.style.display = '';
            warnEl.textContent = data.warnings.join('；');
        }
    } catch (e) {
        alert('生成失败: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = old; }
    }
}

async function pocValidateTemplate() {
    const tpl = pocEl('poc-tpl').value.trim();
    if (!tpl) { alert('模板为空'); return; }
    const btn = event.target;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ 校验中…';
    try {
        const resp = await apiFetch('/api/pocforge/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: tpl }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) { alert('校验失败: ' + (data.error || resp.status)); return; }
        if (data.valid) {
            btn.textContent = '✓ 编译通过';
            setTimeout(() => { btn.textContent = old; }, 2500);
        } else {
            alert('模板未通过 nuclei 编译:\n' + (data.detail || data.error || ''));
        }
    } catch (e) {
        alert('校验失败: ' + e.message);
    } finally {
        if (btn.textContent !== '✓ 编译通过') btn.textContent = old;
        btn.disabled = false;
    }
}

async function pocTest() {
    const tpl = pocEl('poc-tpl').value.trim();
    const target = (pocEl('poc-test-target').value || '').trim();
    if (!tpl || !target) { alert('模板与自测目标均不能为空'); return; }
    const box = pocEl('poc-test-result');
    box.style.display = '';
    box.className = 'pocforge-test-result pocforge-test-running';
    box.textContent = '⏳ nuclei 验证中: ' + target + ' …';
    try {
        const resp = await apiFetch('/api/pocforge/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: tpl, target }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            box.className = 'pocforge-test-result pocforge-test-error';
            box.textContent = '✗ 失败: ' + (data.error || resp.status) + (data.detail ? '\n' + data.detail : '');
            return;
        }
        if (data.hit) {
            box.className = 'pocforge-test-result pocforge-test-hit';
            const lines = (data.results || []).map(r => {
                const parts = ['✓ 命中 ' + (r.matched_at || '')];
                if (r.extracted && r.extracted.length) parts.push('提取: ' + r.extracted.join(', '));
                return parts.join(' · ');
            });
            box.textContent = lines.join('\n') + '\n（耗时 ' + data.duration_ms + 'ms，自测通过，可进入批量）';
        } else {
            box.className = 'pocforge-test-result pocforge-test-miss';
            box.textContent = '✗ 未命中（耗时 ' + data.duration_ms + 'ms）' +
                (data.error ? '\n执行信息: ' + data.error : '') +
                '\n提示：确认目标确实存在该漏洞，或调整 matcher 条件';
        }
    } catch (e) {
        box.className = 'pocforge-test-result pocforge-test-error';
        box.textContent = '✗ 请求失败: ' + e.message;
    }
}

async function pocSaveTemplate() {
    const tpl = pocEl('poc-tpl').value.trim();
    let name = (pocEl('poc-tpl-name').value || '').trim();
    if (!tpl) { alert('模板为空'); return; }
    if (!name) { alert('请填写模板文件名'); return; }
    try {
        const resp = await apiFetch('/api/pocforge/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content: tpl }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) { alert('保存失败: ' + (data.error || resp.status)); return; }
        alert('已保存: ' + data.name);
        pocListTemplates();
    } catch (e) { alert('保存失败: ' + e.message); }
}

async function pocListTemplates() {
    try {
        const resp = await apiFetch('/api/pocforge/templates');
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) { return; }
        renderPocTemplates(data.templates || []);
        const env = pocEl('pocforge-env-badge');
        if (env) env.textContent = data.nuclei_path ? ('nuclei: ' + data.nuclei_path) : '⚠ 服务器未找到 nuclei';
    } catch (e) { /* ignore */ }
}

function renderPocTemplates(items) {
    const wrap = pocEl('poc-tpl-list');
    if (!items.length) {
        wrap.innerHTML = '<div class="muted">模板库为空。生成并保存后在此复用。</div>';
        return;
    }
    wrap.innerHTML = items.map(t =>
        `<div class="pocforge-tpl-item">
            <div class="pocforge-tpl-meta">
                <span class="pocforge-tpl-name">${escapeHtml(t.name)}</span>
                <span class="muted pocforge-tpl-snippet">${escapeHtml(t.snippet || '')}</span>
            </div>
            <div class="pocforge-tpl-ops">
                <button class="btn-link" onclick="pocLoadTemplate('${escapeHtml(t.name)}')">载入</button>
                <button class="btn-link pocforge-danger" onclick="pocDeleteTemplate('${escapeHtml(t.name)}')">删除</button>
            </div>
        </div>`).join('');
}

async function pocLoadTemplate(name) {
    try {
        const resp = await apiFetch('/api/pocforge/templates/' + encodeURIComponent(name));
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) { alert('读取失败: ' + (data.error || resp.status)); return; }
        pocEl('poc-tpl').value = data.content || '';
        pocEl('poc-tpl-name').value = name.replace(/\.ya?ml$/, '');
        pocEl('poc-tpl').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { alert('读取失败: ' + e.message); }
}

async function pocDeleteTemplate(name) {
    if (!confirm('确认删除模板 ' + name + '？')) return;
    try {
        const resp = await apiFetch('/api/pocforge/templates/' + encodeURIComponent(name), { method: 'DELETE' });
        if (!resp.ok) { alert('删除失败'); return; }
        pocListTemplates();
    } catch (e) { alert('删除失败: ' + e.message); }
}

/* ==================== ② FOFA 扩面 ==================== */

async function pocFofaExpand() {
    const query = (pocEl('poc-fofa-query').value || '').trim();
    const size = Math.max(1, Math.min(1000, parseInt(pocEl('poc-fofa-size').value || '100', 10) || 100));
    if (!query) { alert('请填写 FOFA 查询语句'); return; }
    pocStatus('⏳ FOFA 拉取中…');
    try {
        const resp = await apiFetch('/api/fofa/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: 'fofa', query, size, page: 1,
                fields: 'host,ip,port,title,server',
            }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) { pocStatus('✗ ' + (data.error || ('HTTP ' + resp.status)), true); return; }
        const rows = (data.results || []).map(r => {
            // 兼容 dict 行（键=字段名）与数组行（按 fields 顺序）
            const fields = data.fields || [];
            const pick = k => {
                if (r && typeof r === 'object' && !(r instanceof Array)) return String(r[k] || '');
                const i = fields.indexOf(k);
                return i >= 0 && Array.isArray(r) ? String(r[i] || '') : '';
            };
            let target = pick('host');
            const ip = pick('ip');
            const port = pick('port');
            if (target && !/^https?:\/\//i.test(target) && !/:/.test(target) && ip && port) {
                target = (port === '443' ? 'https://' : 'http://') + ip + ':' + port;
            }
            if (!target && ip) target = (port === '443' ? 'https://' : 'http://') + ip + (port && port !== '80' && port !== '443' ? ':' + port : '');
            return {
                target,
                title: pick('title'),
                server: pick('server'),
                checked: !!target,
            };
        }).filter(a => a.target);
        pocforgeState.assets = rows;
        pocStatus((data.total > 0 ? 'FOFA 共 ' + data.total + ' 条，' : '') + '拉回 ' + rows.length + ' 个有效目标（已默认全选，可取消勾选）');
        renderPocAssets();
    } catch (e) {
        pocStatus('✗ ' + e.message, true);
    }
}

function renderPocAssets() {
    const wrap = pocEl('poc-assets-wrap');
    const bar = pocEl('poc-assets-bar');
    const tbody = pocEl('poc-assets-tbody');
    if (!pocforgeState.assets.length) { wrap.style.display = 'none'; bar.style.display = 'none'; return; }
    wrap.style.display = '';
    bar.style.display = '';
    tbody.innerHTML = pocforgeState.assets.map((a, i) =>
        `<tr>
            <td><input type="checkbox" data-i="${i}" ${a.checked ? 'checked' : ''} onchange="pocToggleAsset(${i}, this.checked)"></td>
            <td class="pocforge-mono">${escapeHtml(a.target)}</td>
            <td>${escapeHtml(a.title || '-')}</td>
            <td>${escapeHtml(a.server || '-')}</td>
        </tr>`).join('');
    pocUpdateAssetCount();
}

function pocToggleAsset(i, checked) {
    if (pocforgeState.assets[i]) pocforgeState.assets[i].checked = checked;
    pocUpdateAssetCount();
}

function pocSelectAll(v) {
    pocforgeState.assets.forEach(a => { a.checked = v; });
    document.querySelectorAll('#poc-assets-tbody input[type=checkbox]').forEach(cb => { cb.checked = v; });
    pocUpdateAssetCount();
}

function pocUpdateAssetCount() {
    const n = pocforgeState.assets.filter(a => a.checked).length;
    const el = pocEl('poc-assets-count');
    if (el) el.textContent = '已选 ' + n + ' / ' + pocforgeState.assets.length + ' 个目标';
}

/* ==================== ③ 批量刷洞 ==================== */

async function pocStartBatch() {
    const tpl = pocEl('poc-tpl').value.trim();
    if (!tpl) { alert('模板为空'); return; }
    const targets = pocforgeState.assets.filter(a => a.checked).map(a => a.target);
    if (!targets.length) { alert('没有勾选任何目标，先在第②步拉取并勾选资产'); return; }
    const conc = Math.max(1, Math.min(30, parseInt(pocEl('poc-batch-conc').value || '10', 10) || 10));
    const tplName = (pocEl('poc-tpl-name').value || '').trim() || 'adhoc';
    const btn = pocEl('poc-batch-btn');
    btn.disabled = true; btn.textContent = '⏳ 启动中…';
    pocStatus('');
    try {
        const resp = await apiFetch('/api/pocforge/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: tpl, template_name: tplName, targets, concurrency: conc }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            alert('批量任务启动失败:\n' + (data.error || resp.status) + (data.detail ? '\n' + data.detail : ''));
            return;
        }
        pocforgeState.taskId = data.task_id;
        pocforgeState.landedTargets = new Set();
        pocEl('poc-batch-progress').style.display = '';
        pocEl('poc-batch-stop').style.display = '';
        if (pocforgeState.pollTimer) clearInterval(pocforgeState.pollTimer);
        pocforgeState.pollTimer = setInterval(pocPoll, 2000);
        pocPoll();
    } catch (e) {
        alert('启动失败: ' + e.message);
    } finally {
        btn.disabled = false; btn.textContent = '🚀 开始批量刷洞';
    }
}

async function pocPoll() {
    if (!pocforgeState.taskId) return;
    let t;
    try {
        const resp = await apiFetch('/api/pocforge/batch/' + encodeURIComponent(pocforgeState.taskId));
        if (!resp.ok) {
            if (resp.status === 404) { pocStopPoll(); alert('任务已过期'); }
            return;
        }
        t = await resp.json();
    } catch (e) { return; }
    pocforgeState.task = t;

    const pct = t.total > 0 ? Math.round(t.done * 100 / t.total) : 0;
    const bar = pocEl('poc-batch-bar');
    if (bar) bar.style.width = pct + '%';
    const stats = pocEl('poc-batch-stats');
    if (stats) {
        stats.textContent = `进度 ${t.done}/${t.total}（${pct}%） · 命中 ${t.hits} · 失败 ${t.errors} · 并发 ${t.concurrency}` +
            (t.status === 'running' ? ' · 运行中…' : (t.status === 'done' ? ' · ✔ 完成' : ' · ' + t.status));
    }
    renderPocHits(t);

    if (t.status !== 'running') pocStopPoll();
}

function pocStopPoll() {
    if (pocforgeState.pollTimer) { clearInterval(pocforgeState.pollTimer); pocforgeState.pollTimer = null; }
    const stop = pocEl('poc-batch-stop');
    if (stop) stop.style.display = 'none';
}

async function pocCancelBatch() {
    if (!pocforgeState.taskId) return;
    try {
        await apiFetch('/api/pocforge/batch/' + encodeURIComponent(pocforgeState.taskId), { method: 'DELETE' });
        pocStatus('已发送停止信号，等待收尾…');
    } catch (e) { /* ignore */ }
}

function renderPocHits(t) {
    const hits = (t.results || []).filter(r => r.status === 'hit');
    const errs = (t.results || []).filter(r => r.status === 'error');
    const wrap = pocEl('poc-hits-wrap');
    if (!hits.length && !errs.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const cnt = pocEl('poc-hits-count');
    if (cnt) cnt.textContent = '(' + hits.length + ')';
    const tbody = pocEl('poc-hits-tbody');
    if (tbody) {
        tbody.innerHTML = hits.map(r =>
            `<tr>
                <td class="pocforge-mono">${escapeHtml(r.target)}</td>
                <td class="pocforge-mono">${escapeHtml(r.matched_at || '-')}</td>
                <td>${r.extracted && r.extracted.length ? escapeHtml(r.extracted.join(', ')) : '-'}</td>
                <td>${r.curl_command ? `<code class="pocforge-curl">${escapeHtml(r.curl_command)}</code>` : '-'}</td>
                <td><span class="severity-badge severity-high">命中</span></td>
            </tr>`).join('');
    }
    const ew = pocEl('poc-errors-wrap');
    if (errs.length) {
        ew.style.display = '';
        const ec = pocEl('poc-errors-count');
        if (ec) ec.textContent = errs.length;
        const el = pocEl('poc-errors-list');
        if (el) el.innerHTML = errs.map(r =>
            `<div class="pocforge-err-line"><span class="pocforge-mono">${escapeHtml(r.target)}</span> — ${escapeHtml(r.error || '未知错误')}</div>`).join('');
    } else {
        ew.style.display = 'none';
    }
}

/* ==================== 落库漏洞管理 ==================== */

async function pocLandHits() {
    const t = pocforgeState.task;
    if (!t) return;
    const hits = (t.results || []).filter(r => r.status === 'hit');
    if (!hits.length) { alert('没有命中可落库'); return; }
    if (!pocforgeState.landCid) {
        alert('落库需要一个既有会话 ID（外键约束）：当前漏洞库为空。请先在对话页产生任意一条漏洞记录（agent record_vulnerability），或先手动在漏洞管理创建一条后再用此功能。');
        return;
    }
    const title = (pocEl('poc-gen-title').value || '').trim() || (t.template_name || 'POC') + ' 批量命中';
    const severity = (pocEl('poc-gen-severity').value || 'high').toLowerCase();
    const btn = event.target;
    btn.disabled = true;
    let ok = 0, fail = 0;
    for (const h of hits) {
        const key = h.target + '|' + (h.matched_at || '');
        if (pocforgeState.landedTargets.has(key)) continue;
        const desc = [
            '来源：POC 工厂批量验证（模板 ' + (t.template_name || 'adhoc') + '，任务 ' + t.id + '）',
            '目标：' + h.target,
            '匹配点：' + (h.matched_at || '-'),
            h.extracted && h.extracted.length ? '提取值：' + h.extracted.join(', ') : '',
            h.curl_command ? 'cURL 复现：' + h.curl_command : '',
            '验证时间：' + new Date(h.at).toLocaleString(),
        ].filter(Boolean).join('\n');
        try {
            const resp = await apiFetch('/api/vulnerabilities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: pocforgeState.landCid,
                    title: title,
                    severity: severity,
                    status: 'verified',
                    type: 'batch-poc',
                    target: h.target,
                    description: desc,
                    evidence: desc,
                }),
            });
            if (resp.ok) { ok++; pocforgeState.landedTargets.add(key); } else { fail++; }
        } catch (e) { fail++; }
    }
    btn.disabled = false;
    alert('落库完成：成功 ' + ok + ' 条' + (fail ? '，失败 ' + fail + ' 条' : '') + '。可在「漏洞管理」页查看（按站点自动分组）。');
}
