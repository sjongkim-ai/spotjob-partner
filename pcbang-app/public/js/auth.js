/*
 * 로그인(역할 선택)과 첫 진입 온보딩.
 * 시안이라 실제 본인인증은 없고 역할을 고르는 것으로 대신한다. 실서비스에서는 이 자리에
 * 카카오 로그인과 PASS 본인인증이 들어가고, 생년월일은 PASS 결과로만 받는다 (§3.2 ①).
 */
(function (root) {
    'use strict';

    const { h, mount } = root.Dom;

    const ROLES = {
        partner: { app: 'jobseeker', home: 'home', label: '스팟 파트너' },
        owner: { app: 'pcbang', home: 'status', label: '사장님' }
    };

    function session() {
        const db = root.Store.get();
        if (!db.session.auth) db.session.auth = { role: null, onboarded: { partner: false, owner: false } };
        if (!db.session.auth.onboarded) db.session.auth.onboarded = { partner: false, owner: false };
        return db.session.auth;
    }

    const roleOfApp = appName => Object.keys(ROLES).find(role => ROLES[role].app === appName) || null;
    const isOnboarded = role => Boolean(session().onboarded[role]);
    const isAppOnboarded = appName => {
        const role = roleOfApp(appName);
        return role ? isOnboarded(role) : true;
    };

    // 온보딩을 끝낼 수 있는 조건 — 그 앱을 쓰는 데 반드시 필요한 것만 본다
    function onboardingState(role) {
        const db = root.Store.get();
        if (role === 'partner') {
            const worker = db.workers.find(item => item.id === db.session.meWorkerId);
            const completeness = root.Matching.profileCompleteness(worker);
            return {
                steps: [
                    { label: '휴대폰 본인 확인', done: Boolean(db.session.phoneVerified), hint: '가입 화면에서 인증번호를 받아요' },
                    { label: '생년월일 확인', done: Boolean(worker.birth_date), hint: '일할 수 있는 시간대를 정하는 기준이에요', required: true },
                    { label: '내 정보 입력', done: completeness.percent >= 50, hint: `지금 ${completeness.percent}% · 프로그램·근무 가능 시간을 채우면 매칭이 정확해져요` }
                ],
                canFinish: Boolean(worker.birth_date)
            };
        }
        const shops = db.shops.filter(shop => shop.owner === 'owner-demo');
        const shop = shops[shops.length - 1] || null;
        return {
            steps: [
                { label: '매장 등록 신청', done: Boolean(shop), hint: '사업자등록번호와 매장 정보를 입력해요', required: true },
                { label: '꼭 알릴 조건 입력', done: Boolean(shop && typeof shop.night_solo === 'boolean' && typeof shop.smoking_booth_clean === 'boolean'), hint: '야간 혼자 근무·흡연부스 청소는 필수 표기예요' },
                { label: '운영팀 승인', done: Boolean(shop && shop.status === 'ACTIVE'), hint: '승인 후 공고를 올릴 수 있어요' }
            ],
            canFinish: Boolean(shop)
        };
    }

    function signIn(role) {
        if (!ROLES[role]) return;
        root.Store.run(db => {
            db.session.auth = session();
            db.session.auth.role = role;
            return { ok: true };
        });
        const app = ROLES[role].app;
        window.location.hash = app;
        // 해시가 이미 같으면 hashchange가 안 오므로 직접 화면을 맞춘다
        root.applyRoute();
        goHome(role);
    }

    function goHome(role) {
        const { app, home } = ROLES[role];
        root.switchAppSubtab(app, isOnboarded(role) ? home : 'onboarding');
    }

    function signOut() {
        root.Store.run(db => {
            db.session.auth = session();
            db.session.auth.role = null;
            return { ok: true };
        });
        window.location.hash = '';
    }

    function finishOnboarding(role) {
        const state = onboardingState(role);
        if (!state.canFinish) {
            const missing = state.steps.filter(step => step.required && !step.done).map(step => step.label);
            root.alert(`아직 필요한 게 있어요.\n\n${missing.map(item => `• ${item}`).join('\n')}`);
            return;
        }
        root.Store.run(db => {
            db.session.auth = session();
            db.session.auth.onboarded[role] = true;
            return { ok: true };
        });
        root.alert(role === 'partner'
            ? '준비가 끝났어요. 내 주변 매칭 요청을 바로 보여드릴게요.'
            : '준비가 끝났어요. 공고 등록 현황 화면으로 이동할게요.');
        goHome(role);
    }

    function verifyPhone() {
        const input = document.getElementById('phoneJobseeker');
        if (!input || input.value.replace(/[^0-9]/g, '').length < 10) {
            root.alert('휴대폰 번호를 먼저 입력해 주세요.');
            return;
        }
        root.Store.run(db => { db.session.phoneVerified = true; return { ok: true }; });
        root.alert('본인 확인이 끝났어요. (시안이라 실제 문자는 보내지 않아요)');
    }

    // 온보딩 안내 카드 — 남은 단계를 보여주고, 끝나면 홈으로 보낸다
    function renderGuide(role) {
        const container = document.getElementById(role === 'partner' ? 'partnerOnboarding' : 'ownerOnboarding');
        if (!container) return;
        const state = onboardingState(role);
        const doneCount = state.steps.filter(step => step.done).length;
        mount(container,
            h('div', { class: 'onboarding-head' },
                h('div', { class: 'support-hub-kicker' }, `${ROLES[role].label} 시작하기`),
                h('h2', {}, role === 'partner' ? '먼저 나를 알려주세요' : '먼저 매장을 알려주세요'),
                h('p', { class: 'support-hub-copy' }, role === 'partner'
                    ? '한 번만 입력하면 다음부터는 바로 매칭 요청 화면으로 들어가요.'
                    : '한 번만 입력하면 다음부터는 바로 공고 등록 현황으로 들어가요.')),
            h('div', { class: 'progress-bar' }, h('span', { style: `width: ${Math.round((doneCount / state.steps.length) * 100)}%` })),
            h('ul', { class: 'checklist' }, state.steps.map(step => h('li', { class: `checklist-item${step.done ? ' completed' : ''}`, dataset: { step: step.label } },
                h('span', { class: 'checklist-icon' }, step.done ? '✓' : ''),
                h('span', {},
                    h('strong', {}, step.label), step.required ? h('span', { class: 'required-mark' }, ' *필수') : null,
                    h('br'),
                    h('span', { class: 'fs-small text-muted' }, step.hint))))),
            h('div', { class: 'button-group' },
                h('button', {
                    class: 'btn btn-primary', type: 'button', id: role === 'partner' ? 'partnerOnboardingDone' : 'ownerOnboardingDone',
                    onclick: () => finishOnboarding(role)
                }, state.canFinish ? '완료하고 시작하기' : '필수 항목을 먼저 입력해요'),
                h('button', { class: 'btn btn-secondary', type: 'button', onclick: signOut }, '처음 화면으로')));
    }

    function render() {
        renderGuide('partner');
        renderGuide('owner');
        const current = session().role;
        document.querySelectorAll('[data-signed-in-role]').forEach(element => {
            element.textContent = current ? ROLES[current].label : '';
        });
    }

    root.Auth = { ROLES, session, signIn, signOut, goHome, isOnboarded, isAppOnboarded, roleOfApp, onboardingState, finishOnboarding, verifyPhone, render };
})(window);
