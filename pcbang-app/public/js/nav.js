/*
 * 화면 아래 고정 바로가기 메뉴 — 앱마다 주제별 탭을 만든다.
 * 실제 앱처럼 어느 화면에서나 손가락이 닿는 자리에 메뉴가 있도록 한다.
 * 온보딩(첫 정보 입력) 중에는 메뉴를 숨겨 한 가지에 집중하게 한다.
 */
(function (root) {
    'use strict';

    const { h, mount } = root.Dom;

    const TABS = {
        jobseeker: [
            { key: 'home', icon: '🗺️', label: '홈' },
            { key: 'applications', icon: '📌', label: '내 지원' },
            { key: 'docs', icon: '📄', label: '서류' },
            { key: 'profile', icon: '👤', label: '내 정보' },
            { key: 'help', icon: '💬', label: '도움방' }
        ],
        pcbang: [
            { key: 'status', icon: '📋', label: '공고 현황' },
            { key: 'postings', icon: '📢', label: '공고 올리기' },
            { key: 'applicants', icon: '🤝', label: '지원자' },
            { key: 'hiring', icon: '✅', label: '채용 확인' },
            { key: 'store', icon: '🏪', label: '매장' }
        ],
        admin: [
            { key: 'shops', icon: '🏪', label: '매장 승인' },
            { key: 'docs', icon: '📄', label: '서류 확인' },
            { key: 'compliance', icon: '🛡️', label: '안전 점검' },
            { key: 'batch', icon: '⏱️', label: '배치' },
            { key: 'matching', icon: '🎚️', label: '매칭 설정' }
        ]
    };

    const DEFAULT_TAB = { jobseeker: 'home', pcbang: 'status', admin: 'shops' };

    let currentApp = null;

    function render(appName) {
        const nav = document.getElementById('bottomNav');
        if (!nav) return;
        currentApp = TABS[appName] ? appName : null;
        // 온보딩 중에는 메뉴를 감춘다
        if (!currentApp || (root.Auth && !root.Auth.isAppOnboarded(appName))) {
            mount(nav);
            nav.hidden = true;
            return;
        }
        const section = document.getElementById(appName);
        const active = (section && section.dataset.subtab) || DEFAULT_TAB[appName];
        nav.hidden = false;
        mount(nav, TABS[appName].map(tab => h('button', {
            type: 'button',
            class: `bottom-nav-item${tab.key === active ? ' active' : ''}`,
            dataset: { navApp: appName, navTab: tab.key },
            'aria-current': tab.key === active ? 'page' : null,
            onclick: () => {
                root.switchAppSubtab(appName, tab.key);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },
        h('span', { class: 'bottom-nav-icon', 'aria-hidden': 'true' }, tab.icon),
        h('span', { class: 'bottom-nav-label' }, tab.label))));
    }

    function syncActive(appName, subtabName) {
        // 지금 보고 있는 앱이 아니면 메뉴를 건드리지 않는다
        // (시작 화면에서 세 앱의 탭을 초기화할 때 메뉴가 되살아나던 문제)
        const section = document.getElementById(appName);
        if (!section || !section.classList.contains('active')) return;
        if (appName !== currentApp) {
            render(appName);
            return;
        }
        const nav = document.getElementById('bottomNav');
        if (nav && root.Auth && !root.Auth.isAppOnboarded(appName)) {
            mount(nav);
            nav.hidden = true;
            return;
        }
        if (nav && nav.hidden) {
            render(appName);
            return;
        }
        document.querySelectorAll('#bottomNav .bottom-nav-item').forEach(button => {
            const on = button.dataset.navTab === subtabName;
            button.classList.toggle('active', on);
            if (on) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    root.Nav = { TABS, DEFAULT_TAB, render, syncActive };
})(window);
