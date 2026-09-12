/*
 * 앱 시작과 공통 처리 — 저장소가 바뀔 때마다 세 앱 화면을 다시 그린다
 */
(function (root) {
    'use strict';

    function renderAll() {
        root.Auth.render();
        root.PartnerUI.render();
        root.OwnerUI.render();
        root.AdminUI.render();
        if (typeof root.applyW3Filters === 'function') root.applyW3Filters();
        if (typeof root.restoreSavedPreferences === 'function') root.restoreSavedPreferences();
    }

    function init() {
        root.Store.load();
        root.Store.subscribe(renderAll);
        renderAll();
    }

    // 규칙 실행 결과를 사용자에게 알림. 실패면 이유를 모두 보여주고 false
    function notify(result, successMessage) {
        if (!result || !result.ok) {
            const extra = result && Array.isArray(result.errors) && result.errors.length > 1
                ? `\n\n${result.errors.slice(1).map(error => `• ${error}`).join('\n')}`
                : '';
            root.alert(`${(result && result.message) || '처리하지 못했어요.'}${extra}`);
            return false;
        }
        if (successMessage) root.alert(successMessage);
        return true;
    }

    root.App = { init, renderAll, notify };
})(window);
