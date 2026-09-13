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
    let blobIndex = -1;
    let stretchTimer = null;

    // 고른 칸 뒤로 물방울을 옮긴다. 칸 너비·자리를 직접 재서 탭 개수가 달라져도 맞는다
    function moveBlob(nav, button) {
        if (!nav || !button) return;
        const blob = nav.querySelector('.bottom-nav-blob');
        if (!blob) return;
        const box = button.getBoundingClientRect();
        // 아직 화면에 그려지기 전이면 다음 그리기 차례에 다시 잰다
        if (!box.width) {
            requestAnimationFrame(() => moveBlob(nav, button));
            return;
        }
        const navBox = nav.getBoundingClientRect();
        const items = Array.from(nav.querySelectorAll('.bottom-nav-item'));
        const nextIndex = items.indexOf(button);

        blob.classList.remove('stretch-left', 'stretch-right');
        if (blobIndex >= 0 && nextIndex !== blobIndex) {
            blob.classList.add(nextIndex > blobIndex ? 'stretch-right' : 'stretch-left');
            clearTimeout(stretchTimer);
            stretchTimer = setTimeout(() => blob.classList.remove('stretch-left', 'stretch-right'), 350);
        }
        blobIndex = nextIndex;

        blob.style.setProperty('--blob-w', `${box.width}px`);
        blob.style.setProperty('--blob-x', `${box.left - navBox.left - nav.clientLeft}px`);
        blob.style.setProperty('--blob-on', '1');
    }

    function moveBlobToActive() {
        const nav = document.getElementById('bottomNav');
        if (!nav || nav.hidden) return;
        moveBlob(nav, nav.querySelector('.bottom-nav-item.active'));
    }

    // 화면 폭이 바뀌면 칸 너비도 바뀌므로 물방울을 다시 맞춘다
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(moveBlobToActive, 120);
    });

    function render(appName) {
        const nav = document.getElementById('bottomNav');
        if (!nav) return;
        currentApp = TABS[appName] ? appName : null;
        // 온보딩 중에는 메뉴를 감춘다
        if (!currentApp || (root.Auth && !root.Auth.isAppOnboarded(appName))) {
            mount(nav);
            nav.hidden = true;
            blobIndex = -1;
            return;
        }
        const section = document.getElementById(appName);
        // 온보딩처럼 메뉴에 없는 화면을 보고 있으면 기본 탭을 켜 둔다.
        // 활성 탭이 하나도 없으면 물방울이 맺힐 자리가 없어 메뉴가 비어 보인다
        const shown = (section && section.dataset.subtab) || DEFAULT_TAB[appName];
        const active = TABS[appName].some(tab => tab.key === shown) ? shown : DEFAULT_TAB[appName];
        nav.hidden = false;
        // 앱을 옮기면 물방울은 늘어나지 않고 새 자리에 바로 맺힌다
        blobIndex = -1;
        mount(nav,
            h('span', { class: 'bottom-nav-blob', 'aria-hidden': 'true' }),
            TABS[appName].map(tab => h('button', {
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
        moveBlobToActive();
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
            blobIndex = -1;
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
        moveBlobToActive();
    }

    root.Nav = { TABS, DEFAULT_TAB, render, syncActive };
})(window);
