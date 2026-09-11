/*
 * 화면 조립 도우미. 데이터는 항상 글자(텍스트 노드)로만 넣어 HTML로 해석되지 않게 한다 (XSS 방지)
 */
(function (root) {
    'use strict';

    function h(tag, attrs, ...children) {
        const element = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'class') element.className = value;
            else if (key === 'style') element.style.cssText = value;
            else if (key === 'dataset') Object.assign(element.dataset, value);
            else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
            else element.setAttribute(key, value === true ? '' : String(value));
        });
        children.flat(Infinity).forEach(child => {
            if (child === null || child === undefined || child === false) return;
            element.append(child instanceof Node ? child : String(child));
        });
        return element;
    }

    function mount(container, ...nodes) {
        if (container) container.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
    }

    const fmtWon = value => `${Number(value || 0).toLocaleString()}원`;
    const fmtDate = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '');

    function detailRow(label, value, valueClass) {
        return h('div', { class: 'detail-row' },
            h('span', { class: 'detail-label' }, label),
            h('span', { class: `detail-value${valueClass ? ` ${valueClass}` : ''}` }, value));
    }

    // 관심 매장·다시 함께하고 싶은 파트너 버튼. 이름은 data 속성으로만 넘겨 코드로 해석되지 않게 함
    function prefButton(kind, name, key) {
        return h('button', {
            class: `save-button${key === 'muted' ? ' muted' : ''}`,
            type: 'button',
            dataset: { prefKind: kind, prefName: name, prefKey: key },
            onclick: event => {
                event.stopPropagation();
                root.togglePreference(event.currentTarget);
            }
        });
    }

    const STATUS_CLASS = {
        APPLIED: 'status-viewing', VIEWED: 'status-viewing', INTERVIEW: 'status-interview',
        DOCS_REQUIRED: 'status-docs', DOCS_VERIFIED: 'status-docs', HIRED: 'status-hired',
        REJECTED: 'status-ended', WITHDRAWN: 'status-ended'
    };
    const statusClass = status => STATUS_CLASS[status] || 'status-viewing';

    root.Dom = { h, mount, fmtWon, fmtDate, detailRow, prefButton, statusClass };
})(window);
