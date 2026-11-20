'use strict';
(() => {
    const storageKey = 'cyberstrike-auth';
    const blockedKey = 'chana-device-logged-out';
    const form = document.getElementById('login-form');
    const status = document.getElementById('login-status');
    const error = document.getElementById('login-error');
    const button = document.getElementById('login-submit');
    const password = document.getElementById('login-password');
    const remember = document.getElementById('login-remember-device');
    const params = new URLSearchParams(location.search);
    let submitting = false;

    // 只允许回到已知后台页面，拒绝跨域、协议相对地址及登录自循环。
    function safeNext(raw) {
        if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020]/.test(raw)) return '/';
        try {
            const url = new URL(raw, location.origin);
            if (url.origin !== location.origin || !['/', '/api-docs'].includes(url.pathname)) return '/';
            return url.pathname + url.search + url.hash;
        } catch (_) { return '/'; }
    }
    const next = safeNext(params.get('next'));
    function readStored() {
        try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); }
        catch (_) { return null; }
    }
    function blocked() {
        try { return localStorage.getItem(blockedKey) === '1'; }
        catch (_) { return false; }
    }
    function removeStored() {
        try { localStorage.removeItem(storageKey); } catch (_) {}
    }
    function showForm(message = '') {
        status.hidden = true;
        form.hidden = false;
        error.textContent = message;
        error.hidden = !message;
        password.focus();
    }
    async function request(path, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(path, {
                ...options, method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: { 'X-Chana-Device': '1', ...(options.headers || {}) }, signal: controller.signal,
            });
            const result = await response.json().catch(() => ({}));
            return { response, result };
        } finally { clearTimeout(timer); }
    }
    function enter(result) {
        if (!result.token || !result.expires_at) return false;
        try {
            localStorage.removeItem(blockedKey);
            localStorage.setItem(storageKey, JSON.stringify({
                token: result.token, expiresAt: result.expires_at, user: result.user || null,
                roles: result.roles || [], permissions: result.permissions || [], scope: result.scope || '',
            }));
        } catch (_) {} // Cookie 会话可在后台重新恢复，不依赖本地存储。
        location.replace(next);
        return true;
    }
    async function initialize() {
        if (location.protocol !== 'https:') {
            remember.checked = false;
            remember.disabled = true;
            showForm('请通过 HTTPS 入口登录');
            button.disabled = true;
            return;
        }
        try {
            if (params.get('logged_out') === '1' || blocked()) {
                // 退出请求异常时在独立登录页再次撤销 Cookie，不能自动恢复旧登录。
                const { response } = await request('/api/auth/trusted-device/logout');
                removeStored();
                showForm(response.ok ? '' : '退出未完成，请刷新页面重试');
                button.disabled = !response.ok;
                return;
            }
            const restored = await request('/api/auth/page-session/restore');
            if (restored.response.ok && enter(restored.result)) return;
            const stored = readStored();
            if (stored && stored.token && new Date(stored.expiresAt).getTime() > Date.now()) {
                const migrated = await request('/api/auth/page-session', {
                    headers: { Authorization: 'Bearer ' + stored.token },
                });
                if (migrated.response.ok && enter(migrated.result)) return;
            }
            const device = await request('/api/auth/trusted-device/restore');
            if (device.response.ok && enter(device.result)) return;
            removeStored();
            showForm();
        } catch (_) { showForm('连接失败，请检查网络后重试'); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submitting) return;
        submitting = true;
        button.disabled = true;
        button.textContent = '正在登录…';
        error.hidden = true;
        try {
            const { response, result } = await request('/api/auth/login', {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('login-username').value.trim(),
                    password: password.value, remember_device: remember.checked,
                }),
            });
            if (response.ok && enter(result)) { password.value = ''; return; }
            showForm(result.error || '登录失败，请检查账号和密码');
        } catch (_) { showForm('连接失败，请稍后重试'); }
        finally { submitting = false; button.disabled = false; button.textContent = '登录'; }
    });
    initialize();
})();
