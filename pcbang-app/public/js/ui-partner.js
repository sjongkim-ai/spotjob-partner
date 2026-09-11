/*
 * 스팟 파트너(구직자) 앱 화면 — W2 프로필 위저드, W3 공고 목록, W4 공고 상세, W5 지원 현황, W6 연소자 서류 (§6, §11.1)
 */
(function (root) {
    'use strict';

    const { h, mount, fmtWon, fmtDate, detailRow, prefButton, statusClass } = root.Dom;
    const S = root.Schema;

    const TYPE_ICONS = { pcbang: '💻', cafe: '☕', comic: '📚', cvs: '🏪', delivery: '📦', noodle: '🍜' };
    const TERM_KEY = { LONG_TERM: 'long', SHORT_TERM: 'short', SPOT: 'short' };
    const STEP_SHORT = { APPLIED: '지원', VIEWED: '열람', INTERVIEW: '면접', DOCS_REQUIRED: '서류', DOCS_VERIFIED: '서류 확인', HIRED: '채용' };
    const PROFILE_PATCH_FIELDS = [
        'total_months', 'work_histories', 'pos_skills', 'cook_menus', 'cook_equipment_clean', 'cook_menu_count', 'pc_skills',
        'ops_experiences', 'night_available', 'available_slots', 'max_consecutive_nights', 'preferred_type', 'strengths', 'intro_text', 'commute_radius_km'
    ];

    const now = () => new Date();
    const getDb = () => root.Store.get();
    const me = () => getDb().workers.find(worker => worker.id === getDb().session.meWorkerId);
    const shopOf = posting => getDb().shops.find(shop => shop.id === posting.shop_id);
    const daysText = days => days.map(day => S.label('DAYS', day)).join('');

    function toggleIn(list, key, on) {
        const set = new Set(list || []);
        if (on) set.add(key); else set.delete(key);
        return [...set];
    }

    function field(label, why, ...controls) {
        return h('div', { class: 'form-group' },
            h('div', { class: 'form-label' }, label),
            why ? h('div', { class: 'why-note' }, why) : null,
            controls);
    }

    function chipGroup(name, options, selected, onChange, disabledKeys = []) {
        return h('div', { class: 'chip-group' }, Object.entries(options).map(([key, label]) =>
            h('label', { class: `chip${selected.includes(key) ? ' on' : ''}` },
                h('input', {
                    type: 'checkbox', name, value: key, checked: selected.includes(key), disabled: disabledKeys.includes(key),
                    onchange: event => {
                        onChange(key, event.target.checked);
                        event.target.closest('.chip').classList.toggle('on', event.target.checked);
                    }
                }),
                label)));
    }

    function yesNoSelect(value, onChange, yesLabel = '예', noLabel = '아니요', id) {
        return h('select', { class: 'form-select', id, onchange: event => onChange(event.target.value === '' ? null : event.target.value === 'yes') },
            h('option', { value: '' }, '선택해 주세요'),
            h('option', { value: 'yes', selected: value === true }, yesLabel),
            h('option', { value: 'no', selected: value === false }, noLabel));
    }

    const wholeNumber = value => (value === '' ? null : Math.max(0, Math.round(Number(value))));

    // ───────────── W2 프로필 위저드 (§5.1 스키마 전체, 5단계) ─────────────

    const STEPS = ['경력', '프로그램', '조리·PC', '운영 경험', '근무 가능'];
    let wizardStep = 0;
    let draft = null;   // 단계별 저장 전까지 입력값을 들고 있는 복사본

    function ensureDraft(refresh) {
        if (!draft || refresh) draft = JSON.parse(JSON.stringify(me()));
        return draft;
    }

    function wizardCareer(worker) {
        const nameInput = h('input', { class: 'form-input', id: 'wizHistoryName', placeholder: '매장 이름 · 예: 역삼 스타PC', maxlength: 30 });
        const fromInput = h('input', { class: 'form-input', type: 'month', id: 'wizHistoryFrom', 'aria-label': '일을 시작한 달' });
        const toInput = h('input', { class: 'form-input', type: 'month', id: 'wizHistoryTo', 'aria-label': '일을 그만둔 달 (지금 일하면 비워요)' });
        const shiftSelect = h('select', { class: 'form-select', 'aria-label': '주로 일한 시간대' },
            Object.entries(S.SHIFT_TYPES).map(([key, label]) => h('option', { value: key }, label)));
        const addHistory = () => {
            if (!nameInput.value.trim() || !fromInput.value) {
                root.alert('매장 이름과 시작한 달을 적어 주세요.');
                return;
            }
            worker.work_histories.push({
                id: `wh-${Date.now().toString(36)}`, shop_name: nameInput.value.trim(), shop_id: null,
                period_from: fromInput.value, period_to: toInput.value || null, shift_type: shiftSelect.value, verified: false, verified_at: null
            });
            renderWizard();
        };
        return h('div', {},
            field('🗓️ PC방 총 경력', '처음이면 0으로 적어요. 경력은 매장이 지원자를 볼 때 참고해요.',
                h('input', {
                    class: 'form-input', type: 'number', min: 0, max: 600, id: 'wizTotalMonths', value: worker.total_months ?? '', placeholder: '개월 수 · 예: 18',
                    oninput: event => { worker.total_months = wholeNumber(event.target.value); }
                })),
            h('div', { class: 'form-label' }, '🏢 일했던 매장'),
            worker.work_histories.length
                ? worker.work_histories.map((history, index) => h('div', { class: 'history-row' },
                    h('span', {}, `${history.shop_name} · ${history.period_from.slice(0, 7).replace('-', '.')}~${history.period_to ? history.period_to.slice(0, 7).replace('-', '.') : '현재'} · ${S.label('SHIFT_TYPES', history.shift_type)}`),
                    h('span', { class: `badge${history.verified ? '' : ' muted-badge'}` }, history.verified ? '✓ 이전 사장님 확인' : '확인 전'),
                    h('button', { class: 'save-button', type: 'button', onclick: () => { worker.work_histories.splice(index, 1); renderWizard(); } }, '지우기')))
                : h('p', { class: 'fs-small text-muted' }, '아직 적은 매장이 없어요.'),
            h('div', { class: 'history-form' }, nameInput, h('div', { class: 'inline-fields' }, fromInput, toInput), shiftSelect,
                h('button', { class: 'btn btn-secondary btn-small', type: 'button', id: 'wizAddHistory', onclick: addHistory }, '+ 매장 추가')),
            h('div', { class: 'why-note' }, '이전 사장님께 경력 확인을 요청하는 기능은 다음 버전에서 열려요.'));
    }

    function wizardPrograms(worker) {
        return h('div', {},
            field('💻 좌석관리 프로그램', '매장에서 쓰는 프로그램을 다룰 줄 알면 교육 없이 바로 일할 수 있어서 가장 크게 반영돼요.'),
            Object.entries(S.POS_PROGRAMS).map(([program, label]) => {
                const current = (worker.pos_skills.find(skill => skill.program === program) || {}).level || '';
                return h('div', { class: 'program-row' },
                    h('span', {}, label),
                    h('select', {
                        class: 'form-select', 'aria-label': `${label} 숙련도`, dataset: { program },
                        onchange: event => {
                            worker.pos_skills = worker.pos_skills.filter(skill => skill.program !== program);
                            if (event.target.value) worker.pos_skills.push({ program, level: event.target.value });
                        }
                    },
                    h('option', { value: '' }, '안 써봤어요'),
                    Object.entries(S.POS_LEVELS).map(([level, levelLabel]) => h('option', { value: level, selected: level === current }, levelLabel))));
            }));
    }

    function wizardCookPc(worker) {
        return h('div', {},
            field('🍜 만들 수 있는 메뉴', null, chipGroup('cookMenu', S.COOK_MENUS, worker.cook_menus, (key, on) => { worker.cook_menus = toggleIn(worker.cook_menus, key, on); })),
            field('🧽 조리기구 청소', null, yesNoSelect(worker.cook_equipment_clean, value => { worker.cook_equipment_clean = value; }, '할 수 있어요', '어려워요')),
            field('📋 이전 매장 판매 메뉴 수', '대략이면 충분해요.',
                h('input', { class: 'form-input', type: 'number', min: 0, value: worker.cook_menu_count ?? '', oninput: event => { worker.cook_menu_count = wholeNumber(event.target.value); } })),
            field('🖥️ PC 문제 대응', null, chipGroup('pcSkill', S.PC_SKILLS, worker.pc_skills, (key, on) => { worker.pc_skills = toggleIn(worker.pc_skills, key, on); })));
    }

    function wizardOps(worker) {
        return field('🧾 해본 운영 경험', '사장님이 가장 중요하게 보는 항목이에요. 해본 적 있는 일을 골라요.',
            chipGroup('opsExperience', S.OPS_EXPERIENCES, worker.ops_experiences, (key, on) => { worker.ops_experiences = toggleIn(worker.ops_experiences, key, on); }));
    }

    function wizardAvailability(worker, minor) {
        worker.available_slots = worker.available_slots || {};
        const slots = worker.available_slots;
        const counter = h('span', {}, `${(worker.intro_text || '').length}/300`);
        const grid = h('table', { class: 'avail-grid' },
            h('thead', {}, h('tr', {}, h('th', {}, ''), Object.values(S.DAYS).map(day => h('th', {}, day)))),
            h('tbody', {}, Object.entries(S.TIME_BLOCKS).map(([block, label]) => h('tr', {},
                h('th', {}, label),
                Object.keys(S.DAYS).map(day => h('td', {},
                    h('input', {
                        type: 'checkbox', 'aria-label': `${S.DAYS[day]} ${label}`, dataset: { day, block },
                        checked: (slots[day] || []).includes(block), disabled: minor && block === 'NIGHT',
                        onchange: event => { slots[day] = toggleIn(slots[day], block, event.target.checked); }
                    })))))));
        return h('div', {},
            field('🌙 야간 근무 (22:00~06:00)',
                minor ? '만 18세 미만은 야간에 일할 수 없어서 자동으로 "어려워요"로 정해져요.' : '야간이 가능하면 야간 공고에서 먼저 보여드려요.',
                minor
                    ? h('div', { class: 'alert alert-warning' }, '야간 근무 불가 (만 18세 미만)')
                    : yesNoSelect(worker.night_available, value => { worker.night_available = value; renderWizard(); }, '가능해요', '어려워요', 'wizNightAvailable')),
            !minor && worker.night_available
                ? field('연속으로 가능한 야간 일수', null, h('input', { class: 'form-input', type: 'number', min: 0, max: 7, value: worker.max_consecutive_nights ?? '', oninput: event => { worker.max_consecutive_nights = wholeNumber(event.target.value); } }))
                : null,
            field('📅 일할 수 있는 요일·시간', '칸을 눌러 가능한 시간을 골라요.', h('div', { class: 'avail-scroll' }, grid)),
            field('💼 희망 근무 형태', null, chipGroup('preferredType', S.EMPLOYMENT_TYPES, worker.preferred_type, (key, on) => { worker.preferred_type = toggleIn(worker.preferred_type, key, on); })),
            field('🚶 통근 가능 거리', null,
                h('select', { class: 'form-select', onchange: event => { worker.commute_radius_km = Number(event.target.value); } },
                    [3, 5, 10, 20].map(km => h('option', { value: km, selected: worker.commute_radius_km === km }, `${km}km 이내`)))),
            field('✨ 나의 강점', '사장님이 한눈에 볼 수 있게 태그로 골라요.',
                chipGroup('strength', Object.fromEntries(S.STRENGTHS.map(tag => [tag, tag])), worker.strengths, (key, on) => { worker.strengths = toggleIn(worker.strengths, key, on); })),
            field('✍️ 자기소개 (선택)', '300자까지 적을 수 있어요. 비워 둬도 괜찮아요.',
                h('textarea', {
                    class: 'form-input', rows: 4, maxlength: 300, id: 'wizIntro',
                    oninput: event => { worker.intro_text = event.target.value; counter.textContent = `${event.target.value.length}/300`; }
                }, worker.intro_text || ''),
                h('div', { class: 'option-caption' }, counter)));
    }

    function renderWizard() {
        const container = document.getElementById('profileWizard');
        if (!container) return;
        const worker = ensureDraft();
        const minor = root.Workflow.isMinorWorker(me(), now());
        const completeness = root.Matching.profileCompleteness({ ...worker, birth_date: me().birth_date });
        const bodies = [wizardCareer, wizardPrograms, wizardCookPc, wizardOps, wizardAvailability];
        mount(container,
            h('div', { class: 'wizard-steps' }, STEPS.map((label, index) => h('button', {
                type: 'button', class: `wizard-step${index === wizardStep ? ' current' : ''}`, dataset: { step: index },
                onclick: () => { wizardStep = index; renderWizard(); }
            }, `${index + 1}. ${label}`))),
            h('div', { class: 'profile-progress' },
                h('div', { class: 'progress-bar' }, h('span', { style: `width: ${completeness.percent}%` })),
                h('div', { class: 'fs-small', id: 'profileCompleteness' }, `프로필 완성도 ${completeness.percent}%`),
                completeness.missing.length
                    ? h('div', { class: 'fs-small text-muted' }, `아직 비어 있어요: ${completeness.missing.join(', ')}`)
                    : h('div', { class: 'fs-small text-success' }, '모든 항목을 채웠어요!')),
            bodies[wizardStep](worker, minor),
            h('div', { class: 'button-group' },
                wizardStep > 0 ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { wizardStep -= 1; renderWizard(); } }, '이전으로 가요') : null,
                h('button', { class: 'btn btn-primary', type: 'button', id: 'wizardSave', onclick: saveWizardStep },
                    wizardStep < STEPS.length - 1 ? '저장하고 다음으로' : '저장을 마쳐요')));
    }

    // 단계마다 부분 저장 (PATCH /me/profile)
    function saveWizardStep() {
        const worker = ensureDraft();
        const patch = {};
        PROFILE_PATCH_FIELDS.forEach(key => { patch[key] = worker[key]; });
        const result = root.Store.run(db => root.Workflow.updateWorkerProfile(db, db.session.meWorkerId, patch, now()));
        if (!root.App.notify(result)) return;
        ensureDraft(true);
        if (wizardStep < STEPS.length - 1) {
            wizardStep += 1;
            renderWizard();
        } else {
            root.alert('내 정보를 저장했어요. 이제 나에게 맞는 공고를 찾아볼 수 있어요.');
            root.switchAppSubtab('jobseeker', 'jobs');
        }
    }

    // ───────────── W3 공고 목록 ─────────────

    function jobItem(posting) {
        const db = getDb();
        const shop = shopOf(posting);
        const distance = root.Matching.distanceKm(me().home_geo, shop.geo);
        const night = root.Matching.isNightShift(posting.shift_start, posting.shift_end);
        const days = [
            S.WEEKDAYS.some(day => posting.work_days.includes(day)) ? 'weekday' : null,
            S.WEEKEND.some(day => posting.work_days.includes(day)) ? 'weekend' : null
        ].filter(Boolean).join(' ');
        return h('div', {
            class: `job-item${db.session.selectedPostingId === posting.id ? ' selected' : ''}`,
            dataset: {
                postingId: posting.id, shift: night ? 'night' : 'day', type: posting.business_type, term: TERM_KEY[posting.employment_type],
                urgent: String(Boolean(posting.urgent)), distance: distance === null ? '0' : distance.toFixed(1),
                start: posting.shift_start, end: posting.shift_end, days, store: shop.name, address: shop.address
            },
            onclick: event => root.showJobLocation(event.currentTarget)
        },
        h('div', { class: 'job-item-kicker' }, `${TYPE_ICONS[posting.business_type] || '🏢'} ${S.label('BUSINESS_TYPES', posting.business_type)} · 📅 ${S.label('EMPLOYMENT_TYPES', posting.employment_type)}`),
        posting.urgent ? h('span', { class: 'urgent-badge' }, `⚡ ${posting.urgent.deadline} 모집 · 추가 ${fmtWon(posting.urgent.extra_pay)}`) : null,
        h('div', { class: 'job-item-title' }, `🏢 ${shop.name} · ${posting.title}`),
        h('div', { class: 'job-item-info' }, `시급: ${fmtWon(posting.hourly_wage)}`),
        h('div', { class: 'job-item-info' }, `⏰ ${posting.shift_start} ~ ${posting.shift_end} · ${daysText(posting.work_days)}`),
        distance !== null ? h('div', { class: 'job-item-info' }, `📍 매장까지 약 ${distance.toFixed(1)}km`) : null,
        h('div', { style: 'margin-top: 4px;' },
            h('span', { class: `badge${night && shop.night_solo ? ' important' : ''}` }, night ? (shop.night_solo ? '야간 혼자 근무' : '야간 근무') : '주간 근무'),
            h('span', { class: `badge${shop.smoking_booth_clean ? ' important' : ''}` }, shop.smoking_booth_clean ? '흡연부스 청소 포함' : '흡연부스 청소 없음'),
            posting.minor_allowed ? h('span', { class: 'badge minor' }, '만 18세 미만 가능') : null),
        h('div', { class: 'save-actions' },
            h('button', {
                class: 'save-button detail-button', type: 'button', dataset: { action: 'detail' },
                onclick: event => { event.stopPropagation(); selectPosting(posting.id); }
            }, '자세히 보기'),
            prefButton('store', shop.name, 'interest'),
            prefButton('store', shop.name, 'muted')));
    }

    function renderJobList() {
        const container = document.getElementById('jobList');
        if (!container) return;
        mount(container, getDb().postings.filter(posting => posting.status === 'OPEN').map(jobItem));
    }

    // §9.1 하드 필터. 거리는 목록 위 "검색 반경"이 따로 거르므로 여기서는 제외
    function passesHardFilter(postingId) {
        const posting = getDb().postings.find(item => item.id === postingId);
        if (!posting) return true;
        return root.Matching.hardFilter({ ...me(), commute_radius_km: null }, posting, shopOf(posting), now()).include;
    }

    // ───────────── W4 공고 상세 ─────────────

    function selectedPosting() {
        const db = getDb();
        return db.postings.find(posting => posting.id === db.session.selectedPostingId) || null;
    }

    function selectPosting(postingId) {
        root.Store.run(db => { db.session.selectedPostingId = postingId; return { ok: true }; });
        const card = document.getElementById('postingDetail');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderPostingDetail() {
        const container = document.getElementById('postingDetail');
        const applyButton = document.getElementById('applyButton');
        if (!container) return;
        const posting = selectedPosting();
        if (!posting) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '공고 목록에서 "자세히 보기"를 누르면 조건을 자세히 보여드려요.'));
            if (applyButton) applyButton.disabled = true;
            return;
        }
        const db = getDb();
        const shop = shopOf(posting);
        const worker = me();
        const minor = root.Workflow.isMinorWorker(worker, now());
        const reasons = root.Matching.legalBlockReasons(worker, posting, now());
        const hours = root.Legal.shiftMinutes(posting.shift_start, posting.shift_end) / 60;
        let eligibility = null;
        if (!worker.birth_date) eligibility = h('div', { class: 'alert alert-warning' }, '생년월일을 먼저 확인하면 지원할 수 있어요.');
        else if (reasons.length) eligibility = h('div', { class: 'alert alert-danger' }, h('strong', {}, '⛔ 지원할 수 없는 공고예요'), h('br'), reasons.join(', '));
        else if (minor) eligibility = h('div', { class: 'alert alert-success' }, '만 18세 미만도 지원할 수 있어요. 채용이 정해지면 서류 2가지가 필요해요.');

        mount(container,
            h('div', { class: 'section-title' }, `⭐ ${shop.name} · ${posting.title}`),
            // 면접에 가서야 아는 두 가지를 맨 위에 (§1.3 ③, §6 공고 상세)
            h('div', { class: `alert ${shop.night_solo ? 'alert-warning' : 'alert-success'}`, id: 'detailNightSolo' },
                h('strong', {}, shop.night_solo ? '야간 혼자 근무 있음' : '야간 혼자 근무 없음'), ` · 교대당 ${shop.staff_per_shift}명`),
            h('div', { class: `alert ${shop.smoking_booth_clean ? 'alert-warning' : 'alert-success'}`, id: 'detailSmoking' },
                h('strong', {}, shop.smoking_booth_clean ? '흡연부스 청소 포함' : '흡연부스 청소 없음')),
            posting.status !== 'OPEN' ? h('div', { class: 'alert alert-danger' }, '지금은 모집 중인 공고가 아니에요.') : null,
            eligibility,
            h('div', { class: 'section-title' }, '직무 상세'),
            detailRow('시급', fmtWon(posting.hourly_wage)),
            posting.urgent ? detailRow('추가 지급', `${fmtWon(posting.urgent.extra_pay)} · ${posting.urgent.deadline}`) : null,
            detailRow('근무 형태', S.label('EMPLOYMENT_TYPES', posting.employment_type)),
            detailRow('근무 시간', `${posting.shift_start}~${posting.shift_end} (${hours}시간)`),
            detailRow('근무 요일', daysText(posting.work_days)),
            detailRow('모집 인원', `${posting.headcount}명`),
            detailRow('업무', posting.duties.map(duty => S.label('DUTIES', duty)).join(', ')),
            detailRow('프로그램', S.label('POS_PROGRAMS', posting.required_pos || shop.pos_program) + (posting.required_pos ? ' (필수)' : '')),
            detailRow('조리 메뉴 수', `${shop.cook_menu_count}개`),
            detailRow('청소 범위', shop.clean_scope.map(scope => S.label('CLEAN_SCOPE', scope)).join(', ')),
            detailRow('매장', `${shop.floor} · ${shop.seat_count}석${shop.is_24h ? ' · 24시간' : ''}`),
            detailRow('식사 · PC 이용', `${shop.meal_provided ? '식사 제공' : '식사 없음'} · ${shop.free_pc_use ? '근무 외 PC 이용 가능' : 'PC 이용 불가'}`),
            detailRow('야간 수당', shop.night_allowance ? '있음' : '없음'),
            detailRow('위치', shop.address),
            shop.location_description ? h('div', { class: 'location-preview' }, shop.location_description) : null);

        if (applyButton) {
            const existing = db.applications.find(item => item.worker_id === worker.id && item.posting_id === posting.id && !['REJECTED', 'WITHDRAWN'].includes(item.status));
            applyButton.disabled = Boolean(existing) || posting.status !== 'OPEN';
            applyButton.textContent = existing ? `지원했어요 · ${S.label('APPLICATION_STATUS', existing.status)}` : '이 공고에 지원해요';
        }
    }

    // 원터치 지원 — 프로필이 그대로 전송된다 (§6)
    function confirmJobApplication() {
        const worker = me();
        if (!worker.birth_date) {
            root.alert('지원하려면 먼저 "가입·내 정보"에서 생년월일을 확인해 주세요.');
            root.switchAppSubtab('jobseeker', 'profile');
            return;
        }
        const posting = selectedPosting();
        if (!posting) {
            root.alert('공고 목록에서 지원할 공고를 먼저 골라 주세요.');
            return;
        }
        if (!root.confirm(`${shopOf(posting).name} · ${posting.title}에 지원할까요?\n내 프로필이 그대로 매장에 전달돼요.`)) return;
        const result = root.Store.run(db => root.Workflow.applyToPosting(db, worker.id, posting.id, now()));
        root.App.notify(result, '지원서가 전달됐어요. "내 지원·서류"에서 진행 상황을 볼 수 있어요.');
    }

    // ───────────── W5 지원 현황 ─────────────

    function withdraw(applicationId) {
        if (!root.confirm('이 지원을 취소할까요? 올린 서류가 있으면 30일 뒤 자동으로 파기돼요.')) return;
        const result = root.Store.run(db => root.Workflow.transitionApplication(db, applicationId, 'WITHDRAWN', `worker:${db.session.meWorkerId}`, now()));
        root.App.notify(result, '지원을 취소했어요.');
    }

    function renderMyApplications() {
        const container = document.getElementById('myApplications');
        if (!container) return;
        const worker = me();
        const minor = root.Workflow.isMinorWorker(worker, now());
        const applications = getDb().applications
            .filter(application => application.worker_id === worker.id)
            .sort((a, b) => b.applied_at.localeCompare(a.applied_at));
        if (!applications.length) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '아직 지원한 공고가 없어요. "공고 찾기"에서 지원해 보세요.'));
            return;
        }
        const flow = minor ? ['APPLIED', 'VIEWED', 'INTERVIEW', 'DOCS_REQUIRED', 'DOCS_VERIFIED', 'HIRED'] : ['APPLIED', 'VIEWED', 'INTERVIEW', 'HIRED'];
        mount(container, applications.map(application => {
            const posting = getDb().postings.find(item => item.id === application.posting_id);
            const shop = shopOf(posting);
            const ended = ['HIRED', 'REJECTED', 'WITHDRAWN'].includes(application.status);
            const reached = Math.max(...application.history.map(step => flow.indexOf(step.status)));
            return h('div', { class: 'application-card', dataset: { applicationId: application.id } },
                h('div', { class: 'applicant-name' }, `${shop.name} · ${posting.title}`),
                h('div', { class: 'timeline-time' }, `지원 ${fmtDate(application.applied_at)} · ${posting.shift_start}~${posting.shift_end}`),
                h('span', { class: `status-badge ${statusClass(application.status)}` }, S.label('APPLICATION_STATUS', application.status)),
                h('div', { class: 'step-track' }, flow.map((status, index) => h('span', {
                    class: `step${index <= reached ? ' done' : ''}${status === application.status ? ' current' : ''}`
                }, STEP_SHORT[status]))),
                application.status === 'DOCS_REQUIRED'
                    ? h('div', { class: 'feature-alert warn' }, h('strong', {}, '서류가 필요해요'), h('span', {}, '"18세 미만 파트너 서류"에서 올려 주세요.'))
                    : null,
                ended ? null : h('button', { class: 'btn btn-secondary btn-small', type: 'button', dataset: { action: 'withdraw' }, onclick: () => withdraw(application.id) }, '지원 취소'));
        }));
    }

    // ───────────── W6 연소자 서류 업로드 (§10.2) ─────────────

    const MAX_UPLOAD_BYTES = 10 * 1048576;

    function submitDoc(applicationId, docType, fileMeta) {
        const result = root.Store.run(db => root.Workflow.recordDocUpload(db, applicationId, docType, fileMeta, `worker:${db.session.meWorkerId}`, now()));
        return root.App.notify(result, `${S.label('DOC_TYPES', docType)}를 올렸어요. 운영팀이 영업일 1일 안에 확인해요.`);
    }

    function chooseDocFile(applicationId, docType) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;
            if (file.size > MAX_UPLOAD_BYTES) {
                root.alert('10MB 이하 파일만 올릴 수 있어요.');
                return;
            }
            // 파일 내용은 시안 저장소에 넣지 않는다. 실서비스에서는 여기서 암호화 버킷으로 바로 올린다
            submitDoc(applicationId, docType, { name: file.name, size: file.size });
        };
        input.click();
    }

    function downloadConsentForm() {
        const html = [
            '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>친권자(후견인) 동의서</title>',
            '<style>body{font-family:sans-serif;max-width:720px;margin:40px auto;line-height:1.8;padding:0 16px}table{width:100%;border-collapse:collapse;margin-bottom:16px}td,th{border:1px solid #333;padding:8px;text-align:left}th{width:32%;background:#f3f3f3}.sign{margin-top:40px;text-align:right}.note{color:#666;font-size:13px}@media print{.note{display:none}}</style></head><body>',
            '<h1 style="text-align:center">친권자(후견인) 동의서</h1>',
            '<h3>○ 친권자(후견인) 인적사항</h3><table><tr><th>성명</th><td></td></tr><tr><th>생년월일</th><td></td></tr><tr><th>주소</th><td></td></tr><tr><th>연락처</th><td></td></tr><tr><th>연소근로자와의 관계</th><td></td></tr></table>',
            '<h3>○ 연소근로자 인적사항</h3><table><tr><th>성명</th><td></td></tr><tr><th>생년월일</th><td></td></tr><tr><th>주소</th><td></td></tr><tr><th>연락처</th><td></td></tr></table>',
            '<h3>○ 사업장 개요</h3><table><tr><th>회사명</th><td></td></tr><tr><th>회사 주소</th><td></td></tr><tr><th>대표자</th><td></td></tr><tr><th>회사 전화</th><td></td></tr></table>',
            '<p>본인은 위 연소근로자 ______________ 가 위 사업장에서 근로를 하는 것에 대하여 동의합니다.</p>',
            '<p class="sign">&nbsp;&nbsp;&nbsp;&nbsp;년 &nbsp;&nbsp;&nbsp;월 &nbsp;&nbsp;&nbsp;일<br>친권자(후견인) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (인)</p>',
            '<p>첨부 : 가족관계증명서 1부</p>',
            '<p class="note">※ 고용노동부 표준 양식을 참고한 예시예요. 인쇄해서 보호자가 직접 서명한 뒤, 사진을 찍어 앱에 올려 주세요.</p>',
            '</body></html>'
        ].join('');
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = '친권자_동의서_양식.html';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function renderMinorDocs() {
        const container = document.getElementById('minorDocsPanel');
        if (!container) return;
        const worker = me();
        const ageClass = root.Workflow.ageClassOf(worker, now());
        if (!worker.birth_date) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '생년월일을 확인하면 필요한 서류를 알려드려요.'));
            return;
        }
        if (ageClass === 'ADULT') {
            mount(container, h('div', { class: 'alert alert-success' }, '만 18세 이상은 추가 서류가 필요 없어요.'));
            return;
        }
        if (ageClass === 'MINOR_UNDER_15') {
            mount(container,
                h('div', { class: 'alert alert-danger' }, h('strong', {}, '⛔ 만 15세 미만'), h('br'), '만 15세 미만은 고용노동부 취직인허증이 필요해요. 발급 후 다시 찾아주세요.'),
                h('a', { class: 'save-button', href: 'https://www.moel.go.kr', target: '_blank', rel: 'noopener noreferrer' }, '고용노동부 안내 보기'));
            return;
        }
        const db = getDb();
        const applications = db.applications.filter(application => application.worker_id === worker.id && ['DOCS_REQUIRED', 'DOCS_VERIFIED', 'HIRED'].includes(application.status));
        mount(container,
            h('div', { class: 'alert alert-warning' }, h('strong', {}, '만 18세 미만 파트너'), h('br'), '채용이 정해지면 서류 2가지가 필요해요. 매장이 서류를 요청하면 아래에서 올려요.'),
            h('div', { class: 'doc-guide' },
                h('div', { class: 'form-label' }, '① 가족관계증명서'),
                h('div', { class: 'why-note' }, '온라인으로 발급할 수 있어요.'),
                h('div', { class: 'save-actions' },
                    h('a', { class: 'save-button', href: 'https://www.gov.kr', target: '_blank', rel: 'noopener noreferrer' }, '정부24'),
                    h('a', { class: 'save-button', href: 'https://efamily.scourt.go.kr', target: '_blank', rel: 'noopener noreferrer' }, '전자가족관계등록시스템')),
                h('div', { class: 'form-label', style: 'margin-top: 10px;' }, '② 친권자(후견인) 동의서'),
                h('div', { class: 'why-note' }, '양식을 인쇄해 보호자가 서명한 뒤 사진을 찍어 올려요.'),
                h('button', { class: 'save-button', type: 'button', id: 'consentFormButton', onclick: downloadConsentForm }, '📄 동의서 양식 받기')),
            applications.length
                ? applications.map(application => {
                    const posting = db.postings.find(item => item.id === application.posting_id);
                    const docs = root.Workflow.latestDocs(db, application.id);
                    return h('div', { class: 'application-card', dataset: { applicationId: application.id } },
                        h('div', { class: 'applicant-name' }, `${shopOf(posting).name} · ${posting.title}`),
                        h('span', { class: `status-badge ${statusClass(application.status)}` }, S.label('APPLICATION_STATUS', application.status)),
                        h('ul', { class: 'checklist' }, root.Workflow.requiredDocTypes(ageClass).map(type => {
                            const doc = docs[type];
                            const canUpload = application.status === 'DOCS_REQUIRED' && (!doc || doc.status === 'REJECTED');
                            return h('li', { class: `checklist-item${doc && doc.status === 'VERIFIED' ? ' completed' : ''}`, dataset: { docType: type } },
                                h('span', { class: 'checklist-icon' }, doc && doc.status === 'VERIFIED' ? '✓' : ''),
                                h('span', { class: 'doc-line' },
                                    h('strong', {}, S.label('DOC_TYPES', type)), h('br'),
                                    h('span', { class: 'fs-small text-muted' }, doc ? `${S.label('DOC_STATUS', doc.status)}${doc.reject_reason ? ` · ${doc.reject_reason}` : ''}` : '아직 올리지 않았어요')),
                                canUpload ? h('button', { class: 'save-button', type: 'button', dataset: { action: 'upload', docType: type }, onclick: () => chooseDocFile(application.id, type) }, doc ? '다시 올리기' : '올리기') : null);
                        })));
                })
                : h('p', { class: 'fs-small text-muted' }, '지금은 서류를 요청받은 지원이 없어요.'),
            h('div', { class: 'why-note' }, '올린 서류는 운영팀만 확인하고, 사장님에게는 "확인 완료" 상태만 전달돼요. 채용이 안 되면 30일 뒤 자동으로 파기돼요.'));
    }

    function render() {
        renderWizard();
        renderJobList();
        renderPostingDetail();
        renderMyApplications();
        renderMinorDocs();
    }

    root.PartnerUI = { render, passesHardFilter, selectPosting, submitDoc, downloadConsentForm, withdraw, resetDraft: () => ensureDraft(true) };
    root.confirmJobApplication = confirmJobApplication;
})(window);
