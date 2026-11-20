/* 网页对话统一使用 Harness，兼容旧页面调用但不再切回旧对话界面。 */
(function () {
    'use strict';
    if (window.__chanaHarnessOnly) return;
    window.__chanaHarnessOnly = true;
    var pending = 0;

    function lockHarnessView() {
        window.__dshChatMode = 'dsh';
        var legacy = document.getElementById('chat-legacy-ui');
        var embed = document.getElementById('dsh-chat-embed');
        var button = document.getElementById('dsh-chat-mode-btn');
        if (legacy && !legacy.closest('#page-chat')) legacy = null; /* 已迁到代码审计执行台 */
        if (legacy) {
            legacy.hidden = true;
            legacy.inert = true;
            legacy.setAttribute('aria-hidden', 'true');
            legacy.style.setProperty('display', 'none', 'important');
        }
        if (embed) embed.style.display = '';
        if (button) button.remove();
    }

    window.dshCheckAuth = async function () {
        lockHarnessView();
        var serial = ++pending;
        var gate = document.getElementById('dsh-chat-gate');
        var link = document.getElementById('dsh-chat-auth-link');
        var frame = document.getElementById('dsh-chat-frame');
        if (!gate || !frame) return;
        var ok = false;
        try {
            if (typeof window.ensureHarnessSession === 'function') {
                ok = await window.ensureHarnessSession();
            }
        } catch (_) { /* 连接失败时展示重试入口。 */ }
        if (serial !== pending) return;
        if (typeof window.isAuthenticated === 'function' && !window.isAuthenticated()) ok = false;
        gate.style.display = ok ? 'none' : 'flex';
        if (link) link.style.display = ok ? 'none' : '';
        var source = ok ? '/dsh/' : 'about:blank';
        if (frame.getAttribute('src') !== source) frame.src = source;
    };

    window.showHarnessChat = function () {
        lockHarnessView();
        var frame = document.getElementById('dsh-chat-frame');
        if (frame && (!frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank')) {
            return window.dshCheckAuth();
        }
    };

    // 旧页面链接可能仍调用这些入口，统一归到 Harness。
    window.showNativeChat = window.showHarnessChat;
    window.toggleDshChatMode = window.showHarnessChat;
    window.__dshForceNativeIfActive = function () {
        var page = document.getElementById('page-chat');
        if (page && page.classList.contains('active')) return window.showHarnessChat();
    };

    lockHarnessView();
    document.addEventListener('DOMContentLoaded', lockHarnessView);
})();
