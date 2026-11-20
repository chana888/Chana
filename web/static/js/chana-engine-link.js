/* 对话按项目文件夹归属，取消全局当前项目入口。 */
(function () {
    'use strict';
    window.__dshLinkLoaded = true;
    function removeLegacyPicker() {
        ['dsh-link-chip', 'dsh-link-proj'].forEach(function (id) {
            var element = document.getElementById(id);
            if (element) element.remove();
        });
    }
    removeLegacyPicker();
    document.addEventListener('DOMContentLoaded', removeLegacyPicker);
})();
