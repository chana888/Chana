// NPS Shellcode tab - wait for shellcode tab to mount, inject content
(function() {
  if (window.__shellcodeTabReady) return;
  window.__shellcodeTabReady = true;

  var attempts = 0;
  function tryInject() {
    attempts++;
    if (attempts > 50) return; // max 5 seconds
    var hash = window.location.hash;
    if (!hash.includes('download')) { setTimeout(tryInject, 100); return; }
    // Find the currently VISIBLE tab panel that has <!-- --> content
    var panes = document.querySelectorAll('.ant-tabs-tabpane');
    var target = null;
    for (var i = 0; i < panes.length; i++) {
      var p = panes[i];
      var style = window.getComputedStyle(p);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (p.dataset.shellcodeFilled) continue;
      var c = p.innerHTML;
      // only inject if content is empty comment
      if (c === '<!---->' || c.trim() === '' || c === '<!---->\n') {
        target = p;
        break;
      }
    }
    if (!target) { setTimeout(tryInject, 200); return; }
    target.dataset.shellcodeFilled = '1';
    target.innerHTML = '<div style="padding:32px;text-align:center">' +
      '<h3 style="margin:0 0 12px;font-size:18px;font-weight:600">NPS Shellcode Generator</h3>' +
      '<p style="color:#888;margin:0 0 20px">AES-GCM encrypted shellcode with embedded C2 configuration</p>' +
      '<button onclick="var t=(localStorage?localStorage.getItem(\'TOKEN__\'):\'\')||\'\';window.open(\'nps_shellcode.html?token=\'+t,\'_blank\')" ' +
      'style="padding:10px 24px;background:#238636;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit">' +
      'Open Generator</button></div>';
  }
  setTimeout(tryInject, 500);
})();

var _ = {render: function() { return null; }};
export { _ };
