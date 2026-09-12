/*
 * 사장님(PC방) 앱 화면 — S1 매장 등록, S2 공고 등록·마감·재게시·템플릿, S3 지원자 목록, S4 지원자 상세, S5 연소자 채용 체크리스트 (§7, §11.1)
 */
(function (root) {
    'use strict';

    const { h, mount, fmtWon, fmtDate, detailRow, prefButton, statusClass } = root.Dom;
    const S = root.Schema;
    const OWNER = 'owner-demo';   // 실서비스에서는 로그인한 사장님 계정
    const LEVEL_RANK = { EXPERIENCED: 1, SOLO_OPERATE: 2, CONFIGURE: 3 };

    const now = () => new Date();
    const getDb = () => root.Store.get();
    const findShop = id => getDb().shops.find(shop => shop.id === id) || null;
    const workerOf = application => getDb().workers.find(worker => worker.id === application.worker_id);
    const ageOf = worker => root.Legal.calculateAge(worker.birth_date, now());
    const daysText = days => days.map(day => S.label('DAYS', day)).join('');
    const yesNo = value => (value ? '예' : '아니요');

    function ownerShops() {
        return getDb().shops.filter(shop => shop.owner === OWNER);
    }

    function currentShop() {
        return findShop(getDb().session.ownerShopId) || ownerShops()[0] || null;
    }

    function setSession(patch) {
        root.Store.run(db => { Object.assign(db.session, patch); return { ok: true }; });
    }

    // ───────────── S1 매장 등록 ─────────────

    function readShopForm() {
        const value = id => (document.getElementById(id) ? document.getElementById(id).value : '');
        const number = id => (value(id) === '' ? '' : Number(value(id)));
        const radio = name => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            return checked ? checked.value === 'yes' : null;
        };
        return {
            biz_reg_no: value('bizRegNo'),
            name: value('shopName').trim(),
            address: value('storeAddress').trim(),
            location_description: value('storeLocationDescription'),
            phone: value('phoneShop').trim(),
            floor: value('shopFloor').trim(),
            seat_count: number('seatCount'),
            staff_per_shift: number('staffPerShift'),
            cook_menu_count: number('cookMenuCount'),
            pos_program: value('shopPosProgram'),
            is_24h: radio('is24h'),
            is_franchise: radio('isFranchise'),
            franchise_brand: value('franchiseBrand').trim(),
            insurance_established: radio('insurance'),
            night_solo: radio('nightSolo'),
            smoking_booth_clean: radio('smokingBooth'),
            meal_provided: radio('mealProvided'),
            free_pc_use: radio('freePcUse'),
            night_allowance: radio('nightAllowance'),
            hires_minor: radio('hiresMinor'),
            clean_scope: [...document.querySelectorAll('input[name="cleanScope"]:checked')].map(input => input.value)
        };
    }

    function onBizRegNoInput(input) {
        input.value = root.Legal.formatBizRegNo(input.value);
        const status = document.getElementById('bizRegNoStatus');
        if (!status) return;
        const digits = root.Legal.normalizeBizRegNo(input.value);
        if (digits.length < 10) {
            status.textContent = '숫자 10자리를 입력해 주세요.';
            status.className = 'fs-small text-muted';
        } else if (root.Legal.isValidBizRegNo(digits)) {
            status.textContent = '✓ 번호 형식이 맞아요 (국세청 진위확인은 서버 연동 후 자동)';
            status.className = 'fs-small text-success';
        } else {
            status.textContent = '검증번호가 맞지 않아요. 번호를 다시 확인해 주세요.';
            status.className = 'fs-small text-danger';
        }
    }

    function confirmStoreRegistration() {
        const form = readShopForm();
        const errors = root.Workflow.validateShop(getDb(), form);
        if (errors.length) {
            root.alert(`아직 확인할 내용이 ${errors.length}개 있어요.\n\n${errors.map(error => `• ${error}`).join('\n')}`);
            return;
        }
        if (!root.confirm(`${form.name} 매장 등록을 신청할까요?\n운영팀이 사업자 정보와 주소를 확인한 뒤 승인해요.`)) return;
        const result = root.Store.run(db => {
            const registered = root.Workflow.registerShop(db, form, OWNER, now());
            if (registered.ok) Object.assign(db.session, { ownerShopId: registered.shop.id, ownerPostingId: null, selectedApplicationId: null });
            return registered;
        });
        if (root.App.notify(result, '매장 등록 신청이 접수됐어요. 승인되면 공고를 올릴 수 있어요.')) {
            const box = document.getElementById('shopRegisterResult');
            if (box) box.textContent = `✓ ${result.shop.name} · 승인 대기 중`;
        }
    }

    // ───────────── S2 공고 등록 ─────────────

    function readPostingForm() {
        const value = id => (document.getElementById(id) ? document.getElementById(id).value : '');
        const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
        const urgent = value('recruitmentType').includes('긴급')
            ? { extra_pay: Number(value('urgentExtraPay')) || 0, deadline: value('urgentDeadline') }
            : null;
        return {
            shop_id: currentShop() ? currentShop().id : null,
            title: value('postingTitle').trim(),
            employment_type: value('jobTermSelect'),
            shift_start: value('shiftStart'),
            shift_end: value('shiftEnd'),
            work_days: checked('workDay'),
            hourly_wage: Number(value('wageInput')),
            headcount: Number(value('headcountInput')),
            duties: checked('duty'),
            required_pos: value('requiredPos') || null,
            urgent
        };
    }

    function fillPostingForm(draft) {
        const set = (id, value) => {
            const element = document.getElementById(id);
            if (element && value !== undefined && value !== null) element.value = value;
        };
        set('postingTitle', draft.title);
        set('jobTermSelect', draft.employment_type);
        set('shiftStart', draft.shift_start);
        set('shiftEnd', draft.shift_end);
        set('wageInput', draft.hourly_wage);
        set('headcountInput', draft.headcount);
        set('requiredPos', draft.required_pos || '');
        document.querySelectorAll('input[name="workDay"]').forEach(input => { input.checked = (draft.work_days || []).includes(input.value); });
        document.querySelectorAll('input[name="duty"]').forEach(input => { input.checked = (draft.duties || []).includes(input.value); });
        const recruitment = document.getElementById('recruitmentType');
        if (recruitment) recruitment.selectedIndex = draft.urgent ? 2 : 0;
        if (draft.urgent) {
            set('urgentExtraPay', draft.urgent.extra_pay);
            set('urgentDeadline', draft.urgent.deadline);
        }
        root.updateRecruitmentOptions();
        root.updateWageGuide();
        root.updateMinorAllowedStatus();
    }

    // 최저임금 미만은 등록 차단 + 원터치 보정 (§3.1). 최종 검증은 Workflow.createPosting (서버 역할)
    function confirmJobPosting() {
        const draft = readPostingForm();
        const minimumWage = root.getMinimumWage();
        if (!draft.hourly_wage) {
            root.alert('시급을 입력해 주세요.');
            return;
        }
        if (draft.hourly_wage < minimumWage) {
            root.updateWageGuide();
            const fix = root.confirm(`시급 ${draft.hourly_wage.toLocaleString()}원은 올해 최저임금 ${minimumWage.toLocaleString()}원보다 낮아 등록할 수 없어요.\n\n최저임금으로 맞출까요?`);
            if (fix) root.setWageToMinimum();
            return;
        }
        if (!draft.shift_start || !draft.shift_end) {
            root.alert('근무 시작·종료 시간을 입력해 주세요.');
            return;
        }
        const shop = currentShop();
        if (!shop) {
            root.alert('먼저 매장을 등록해 주세요.');
            return;
        }
        const minorLine = root.isPostingAllowedForMinor(draft.shift_start, draft.shift_end, draft.work_days)
            ? '만 18세 미만: 지원 가능 (채용 시 서류 확인 필요)'
            : '만 18세 미만: 근무 시간 때문에 공고가 보이지 않아요';
        if (!root.confirm(`이 공고를 등록할까요?\n${shop.name} · ${draft.title || '(제목 없음)'}\n근무 ${draft.shift_start}~${draft.shift_end} · ${minorLine}\n입력한 조건이 스팟 파트너에게 보여요.`)) return;
        const result = root.Store.run(db => {
            const created = root.Workflow.createPosting(db, draft, OWNER, now());
            if (created.ok) db.session.ownerPostingId = created.posting.id;
            return created;
        });
        root.App.notify(result, '공고가 등록됐어요. 파트너가 지원하면 "지원자·채용"에서 볼 수 있어요.');
    }

    function renderShopPanel() {
        const container = document.getElementById('ownerShopPanel');
        if (!container) return;
        const shop = currentShop();
        if (!shop) {
            mount(container, h('div', { class: 'alert alert-warning' }, '먼저 "매장 등록"을 신청해 주세요.'));
            return;
        }
        const notices = getDb().notices.filter(notice => notice.shop_id === shop.id).slice(-3).reverse();
        const statusAlert = {
            PENDING: ['alert-warning', '승인 대기 중이에요. 운영팀 승인 후 공고를 올릴 수 있어요.'],
            REJECTED: ['alert-danger', `반려됐어요 · ${shop.rejected_reason || ''}`],
            SUSPENDED: ['alert-danger', `정지된 매장이에요 · ${shop.suspended_reason || ''}`]
        }[shop.status];
        mount(container,
            h('div', { class: 'form-group' },
                h('div', { class: 'form-label' }, '🏪 공고를 올릴 매장'),
                h('select', {
                    class: 'form-select', id: 'ownerShopSelect',
                    onchange: event => setSession({ ownerShopId: event.target.value, ownerPostingId: null, selectedApplicationId: null })
                }, ownerShops().map(item => h('option', { value: item.id, selected: item.id === shop.id }, `${item.name} · ${S.label('SHOP_STATUS', item.status)}`)))),
            statusAlert ? h('div', { class: `alert ${statusAlert[0]}`, id: 'ownerShopStatus' }, statusAlert[1]) : null,
            notices.map(notice => h('div', { class: 'alert alert-warning' }, h('strong', {}, '📢 알림 '), notice.message)),
            h('div', { class: 'shop-facts' },
                h('div', { class: 'form-label' }, '공고 맨 위에 자동으로 보여줄 매장 정보'),
                detailRow('야간 혼자 근무', shop.night_solo ? '있음' : '없음', shop.night_solo ? 'text-danger' : ''),
                detailRow('흡연부스 청소', shop.smoking_booth_clean ? '포함' : '없음', shop.smoking_booth_clean ? 'text-danger' : ''),
                detailRow('좌석관리 프로그램', S.label('POS_PROGRAMS', shop.pos_program)),
                detailRow('조리 메뉴', `${shop.cook_menu_count}개`),
                h('div', { class: 'why-note' }, '파트너가 면접 전에 알 수 있도록 매장 정보에서 가져와 공고마다 표시해요.')));
    }

    function saveCurrentAsTemplate() {
        const shop = currentShop();
        if (!shop) return;
        const name = root.prompt('템플릿 이름을 적어 주세요', readPostingForm().title || '');
        if (name === null) return;
        const result = root.Store.run(db => root.Workflow.saveTemplate(db, shop.id, name, readPostingForm(), OWNER, now()));
        root.App.notify(result, `'${String(name).trim()}' 템플릿을 저장했어요.`);
    }

    function renderTemplatePanel() {
        const container = document.getElementById('templatePanel');
        if (!container) return;
        const shop = currentShop();
        if (!shop) {
            mount(container);
            return;
        }
        const templates = getDb().templates.filter(template => template.shop_id === shop.id);
        const select = h('select', { class: 'form-select', id: 'templateSelect', 'aria-label': '저장한 템플릿' },
            h('option', { value: '' }, templates.length ? '저장한 템플릿 고르기' : '저장한 템플릿이 없어요'),
            templates.map(template => h('option', { value: template.id }, template.name)));
        mount(container, h('div', { class: 'option-panel' },
            h('div', { class: 'option-title' }, '📂 자주 쓰는 공고 불러오기'),
            h('div', { class: 'inline-fields' }, select,
                h('button', {
                    class: 'btn btn-secondary btn-small', type: 'button', id: 'loadTemplate',
                    onclick: () => {
                        const template = templates.find(item => item.id === select.value);
                        if (!template) { root.alert('템플릿을 골라 주세요.'); return; }
                        fillPostingForm(template.draft);
                    }
                }, '불러오기')),
            h('button', { class: 'save-button', type: 'button', style: 'margin-top: 6px;', onclick: saveCurrentAsTemplate }, '💾 지금 입력한 조건을 템플릿으로 저장')));
    }

    function closePosting(posting) {
        if (!root.confirm(`'${posting.title}' 공고를 마감할까요?\n채용되지 않은 지원자의 서류는 30일 뒤 자동으로 파기돼요.`)) return;
        root.App.notify(root.Store.run(db => root.Workflow.closePosting(db, posting.id, OWNER, 'OWNER_CLOSED', now())), '공고를 마감했어요.');
    }

    function reopenPosting(posting) {
        const patch = {};
        const minimumWage = root.getMinimumWage();
        if (posting.hourly_wage < minimumWage) {
            const input = root.prompt(`최저임금이 ${minimumWage.toLocaleString()}원으로 올랐어요. 새 시급을 적어 주세요.`, String(minimumWage));
            if (input === null) return;
            patch.hourly_wage = Number(String(input).replace(/[^0-9]/g, ''));
        }
        root.App.notify(root.Store.run(db => root.Workflow.reopenPosting(db, posting.id, OWNER, now(), patch)), '공고를 다시 게시했어요.');
    }

    // 사장님 홈 = 공고 등록 현황 (요약 + 올린 공고)
    function ownerSummary() {
        const db = getDb();
        const shop = currentShop();
        const postings = shop ? db.postings.filter(posting => posting.shop_id === shop.id) : [];
        const ids = postings.map(posting => posting.id);
        const applications = db.applications.filter(application => ids.includes(application.posting_id) && application.status !== 'WITHDRAWN');
        const stat = (value, label) => h('div', { class: 'market-stat' }, h('strong', {}, String(value)), h('span', {}, label));
        return [
            h('div', { class: 'status-summary' },
                stat(postings.filter(posting => posting.status === 'OPEN').length, '모집 중'),
                stat(applications.length, '지원자'),
                stat(applications.filter(application => ['APPLIED', 'VIEWED'].includes(application.status)).length, '확인 대기'),
                stat(applications.filter(application => application.status === 'HIRED').length, '채용 완료')),
            h('button', {
                class: 'btn btn-primary', type: 'button', id: 'goPostingForm', style: 'margin: 10px 0;',
                onclick: () => root.switchAppSubtab('pcbang', 'postings')
            }, '+ 새 공고 올리기')
        ];
    }

    function renderOwnerPostings() {
        const statusPanel = document.getElementById('ownerStatusPanel');
        if (!statusPanel) return;
        mount(statusPanel, ownerSummary(), h('div', { class: 'section-title' }, '📋 올린 공고'), h('div', { id: 'ownerPostingList' }));
        const container = document.getElementById('ownerPostingList');
        const shop = currentShop();
        const db = getDb();
        const postings = shop ? db.postings.filter(posting => posting.shop_id === shop.id).slice().reverse() : [];
        if (!postings.length) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '아직 올린 공고가 없어요.'));
            return;
        }
        mount(container, postings.map(posting => {
            const applicants = db.applications.filter(application => application.posting_id === posting.id && application.status !== 'WITHDRAWN').length;
            const badgeClass = posting.status === 'OPEN' ? 'status-interview' : posting.status === 'FILLED' ? 'status-hired' : 'status-ended';
            return h('div', { class: 'job-item owner-posting', dataset: { postingId: posting.id } },
                h('div', { class: 'job-item-title' }, `${posting.title} `, h('span', { class: `status-badge ${badgeClass}` }, S.label('POSTING_STATUS', posting.status))),
                h('div', { class: 'job-item-info' }, `${posting.shift_start}~${posting.shift_end} · ${daysText(posting.work_days)} · ${fmtWon(posting.hourly_wage)} · 지원 ${applicants}명`),
                h('span', { class: `badge${posting.minor_allowed ? ' minor' : ''}` }, posting.minor_allowed ? '만 18세 미만 가능' : '만 18세 이상만'),
                posting.closed_reason ? h('div', { class: 'fs-small text-danger' }, S.label('CLOSED_REASONS', posting.closed_reason)) : null,
                h('div', { class: 'save-actions' },
                    h('button', {
                        class: 'save-button', type: 'button', dataset: { action: 'applicants' },
                        onclick: () => { setSession({ ownerPostingId: posting.id, selectedApplicationId: null }); root.switchAppSubtab('pcbang', 'applicants'); }
                    }, '지원자 보기'),
                    ['OPEN', 'FILLED'].includes(posting.status) ? h('button', { class: 'save-button muted', type: 'button', dataset: { action: 'close' }, onclick: () => closePosting(posting) }, '마감하기') : null,
                    posting.status === 'CLOSED' ? h('button', { class: 'save-button', type: 'button', dataset: { action: 'reopen' }, onclick: () => reopenPosting(posting) }, '다시 게시하기') : null));
        }));
    }

    // ───────────── S3 지원자 목록 (적합도순 §9.2) ─────────────

    function shopPostings() {
        const shop = currentShop();
        return shop ? getDb().postings.filter(posting => posting.shop_id === shop.id) : [];
    }

    function currentPosting() {
        const list = shopPostings();
        return list.find(posting => posting.id === getDb().session.ownerPostingId) || list[0] || null;
    }

    function rankedApplications(posting) {
        const db = getDb();
        const shop = findShop(posting.shop_id);
        return db.applications
            .filter(application => application.posting_id === posting.id && application.status !== 'WITHDRAWN')
            .map(application => {
                const worker = workerOf(application);
                return { application, worker, ...root.Matching.scoreApplicant(worker, posting, shop, db.config.matching) };
            })
            .sort((a, b) => b.score - a.score);
    }

    // 사장님이 지원서를 열면 '열람'으로 바뀌어 파트너 지원 현황에 보인다
    function selectApplication(applicationId) {
        root.Store.run(db => {
            db.session.selectedApplicationId = applicationId;
            const application = db.applications.find(item => item.id === applicationId);
            if (application && application.status === 'APPLIED') return root.Workflow.transitionApplication(db, applicationId, 'VIEWED', OWNER, now());
            return { ok: true };
        });
    }

    function applicantCard(entry, selected) {
        const { application, worker, score } = entry;
        const age = ageOf(worker);
        const minor = root.Legal.isMinorAgeClass(root.Legal.getAgeClass(age));
        const topSkill = (worker.pos_skills || []).slice().sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
        const verified = (worker.work_histories || []).filter(history => history.verified).length;
        return h('div', {
            class: `applicant-card${selected ? ' selected' : ''}`, role: 'button', tabindex: 0,
            dataset: { applicationId: application.id, score: String(score) },
            onclick: () => selectApplication(application.id),
            onkeydown: event => { if (event.key === 'Enter') selectApplication(application.id); }
        },
        h('div', { class: 'applicant-name' }, `${worker.name} (${age}) `, h('span', { class: `status-badge ${statusClass(application.status)}` }, S.label('APPLICATION_STATUS', application.status))),
        h('div', { class: 'badge-line' },
            h('span', { class: 'badge-card' }, topSkill ? `${S.label('POS_PROGRAMS', topSkill.program)} ${S.label('POS_LEVELS', topSkill.level)}` : '프로그램 경험 없음'),
            worker.night_available ? h('span', { class: 'badge-card' }, '🌙 야간 가능') : null,
            h('span', { class: 'badge-card' }, `경력 ${worker.total_months || 0}개월`),
            verified ? h('span', { class: 'badge-card' }, `✓ 인증 경력 ${verified}건`) : null,
            minor ? h('span', { class: 'badge minor' }, '만 18세 미만') : null),
        h('div', { class: 'applicant-score' }, `⭐ 적합도 ${score}점`),
        h('div', { class: 'save-actions' }, prefButton('partner', worker.name, 'preferred')));
    }

    function renderApplicantPanel() {
        const container = document.getElementById('applicantPanel');
        if (!container) return;
        const posting = currentPosting();
        if (!posting) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '공고를 올리면 지원자가 여기에 보여요.'));
            return;
        }
        const ranked = rankedApplications(posting);
        const selectedId = getDb().session.selectedApplicationId;
        mount(container,
            h('select', {
                class: 'form-select', id: 'applicantPostingSelect', 'aria-label': '지원자를 볼 공고',
                onchange: event => setSession({ ownerPostingId: event.target.value, selectedApplicationId: null })
            }, shopPostings().map(item => h('option', { value: item.id, selected: item.id === posting.id }, `${item.title} · ${S.label('POSTING_STATUS', item.status)}`))),
            h('div', { class: 'fs-small text-muted', style: 'margin: 8px 0;' }, '잘 맞는 순서로 보여드려요. 점수는 참고용이고 결정은 사장님이 해요.'),
            ranked.length ? ranked.map(entry => applicantCard(entry, entry.application.id === selectedId)) : h('p', { class: 'fs-small text-muted' }, '아직 지원자가 없어요.'));
    }

    // ───────────── S4 지원자 상세 ─────────────

    const CONFIRM_TEXT = {
        INTERVIEW: name => `${name}님에게 면접을 제안할까요?`,
        DOCS_REQUIRED: name => `${name}님에게 서류(가족관계증명서·친권자 동의서)를 요청할까요?\n서류는 운영팀이 확인하고, 사장님께는 확인 결과만 전달돼요.`,
        HIRED: name => `${name}님 채용을 확정할까요?`,
        REJECTED: name => `${name}님에게 이번에는 함께하기 어렵다는 안내를 보낼까요?`
    };
    const DONE_TEXT = {
        INTERVIEW: '면접 제안을 보냈어요.',
        DOCS_REQUIRED: '서류를 요청했어요. 파트너가 올리면 운영팀이 확인해요.',
        HIRED: '채용이 확정됐어요.',
        REJECTED: '안내를 보냈어요. 서로 예의를 지키는 메시지로 전달돼요.'
    };

    function changeStatus(application, toStatus) {
        const worker = workerOf(application);
        if (!root.confirm(CONFIRM_TEXT[toStatus](worker.name))) return;
        root.App.notify(root.Store.run(db => root.Workflow.transitionApplication(db, application.id, toStatus, OWNER, now())), DONE_TEXT[toStatus]);
    }

    function actionButtons(application, minor) {
        const action = (label, toStatus, cls = 'btn-primary') => h('button', {
            class: `btn ${cls}`, type: 'button', dataset: { action: toStatus }, onclick: () => changeStatus(application, toStatus)
        }, label);
        switch (application.status) {
            case 'APPLIED':
            case 'VIEWED':
                return [action('면접 제안', 'INTERVIEW'), action('거절', 'REJECTED', 'btn-secondary')];
            case 'INTERVIEW':
                return [minor ? action('서류 요청', 'DOCS_REQUIRED') : action('채용 확정', 'HIRED'), action('거절', 'REJECTED', 'btn-secondary')];
            case 'DOCS_REQUIRED':
            case 'DOCS_VERIFIED':
                return [h('p', { class: 'fs-small' }, '"18세 미만 채용 확인"에서 이어서 진행해요.'), action('거절', 'REJECTED', 'btn-secondary')];
            case 'HIRED':
                return h('div', { class: 'alert alert-success' }, '채용이 확정됐어요.');
            default:
                return h('div', { class: 'fs-small text-muted' }, '끝난 지원이에요.');
        }
    }

    function renderApplicantDetail() {
        const container = document.getElementById('applicantDetail');
        if (!container) return;
        const db = getDb();
        const application = db.applications.find(item => item.id === db.session.selectedApplicationId);
        if (!application) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '지원자 목록에서 파트너를 골라 주세요.'));
            return;
        }
        const worker = workerOf(application);
        const posting = db.postings.find(item => item.id === application.posting_id);
        const shop = findShop(posting.shop_id);
        const age = ageOf(worker);
        const minor = root.Legal.isMinorAgeClass(root.Legal.getAgeClass(age));
        const { score, breakdown } = root.Matching.scoreApplicant(worker, posting, shop, db.config.matching);
        const distance = root.Matching.distanceKm(worker.home_geo, shop.geo);
        const slots = worker.available_slots || {};
        const slotText = Object.keys(S.DAYS)
            .filter(day => (slots[day] || []).length)
            .map(day => `${S.DAYS[day]}(${slots[day].map(block => S.TIME_BLOCKS[block].split(' ')[0]).join('·')})`)
            .join(' ') || '입력 전';
        const badges = (items, group) => (items.length
            ? h('div', { class: 'badge-line' }, items.map(item => h('span', { class: 'badge-card' }, S.label(group, item))))
            : h('p', { class: 'fs-small text-muted' }, '입력 전'));

        mount(container,
            h('div', { class: 'section-title' }, `${worker.name} (${age}) · ${S.label('APPLICATION_STATUS', application.status)}`),
            minor ? h('div', { class: 'alert alert-warning' }, '만 18세 미만 지원자예요. 채용 전에 서류 확인이 꼭 필요해요.') : null,
            detailRow('PC방 경력', `${worker.total_months || 0}개월`),
            detailRow('희망 형태', (worker.preferred_type || []).map(type => S.label('EMPLOYMENT_TYPES', type)).join(', ') || '입력 전'),
            detailRow('통근 거리', distance === null ? '-' : `${distance.toFixed(1)}km`),
            detailRow('야간', worker.night_available ? `가능 · 연속 ${worker.max_consecutive_nights || 0}일` : '어려움'),
            detailRow('가능 시간', slotText),
            h('div', { class: 'section-title' }, '프로그램 숙련도'),
            (worker.pos_skills || []).length
                ? h('div', { class: 'badge-line' }, worker.pos_skills.map(skill => h('span', { class: 'badge-card' }, `${S.label('POS_PROGRAMS', skill.program)} ${S.label('POS_LEVELS', skill.level)}`)))
                : h('p', { class: 'fs-small text-muted' }, '입력 전'),
            h('div', { class: 'section-title' }, '운영 경험'), badges(worker.ops_experiences || [], 'OPS_EXPERIENCES'),
            h('div', { class: 'section-title' }, '조리 · PC 대응'), badges([...(worker.cook_menus || [])], 'COOK_MENUS'), badges([...(worker.pc_skills || [])], 'PC_SKILLS'),
            (worker.strengths || []).length ? [h('div', { class: 'section-title' }, '강점'), h('div', { class: 'badge-line' }, worker.strengths.map(tag => h('span', { class: 'badge-card' }, tag)))] : null,
            worker.intro_text ? h('p', { class: 'intro-text' }, worker.intro_text) : null,
            (worker.work_histories || []).length
                ? [h('div', { class: 'section-title' }, '일했던 매장'), worker.work_histories.map(history => detailRow(history.shop_name, history.verified ? '✓ 이전 사장님 확인' : '확인 전', history.verified ? 'text-success' : ''))]
                : null,
            h('details', { class: 'score-breakdown' },
                h('summary', {}, `적합도 ${score}점 · 계산 근거`),
                h('ul', {}, breakdown.map(item => h('li', {}, `${item.label} +${item.points}`)))),
            h('div', { class: 'button-group' }, actionButtons(application, minor)));
    }

    // ───────────── S5 연소자 채용 체크리스트 (§10.1) ─────────────

    function downloadDocs(application) {
        if (!root.confirm('서류는 1회만 받을 수 있어요. 사업주는 이 서류를 보관할 의무가 있어요. 지금 받을까요?')) return;
        root.App.notify(root.Store.run(db => root.Workflow.ownerDownloadDocs(db, application.id, OWNER, now())),
            '다운로드가 기록됐어요. (시안에는 파일이 없고, 실서비스에서는 암호화 저장소에서 원본을 한 번 내려받아요.)');
    }

    function renderHireChecklist() {
        const container = document.getElementById('hireChecklist');
        if (!container) return;
        const db = getDb();
        const application = db.applications.find(item => item.id === db.session.selectedApplicationId);
        if (!application) {
            mount(container, h('p', { class: 'fs-small text-muted' }, '지원자를 고르면 채용 전에 확인할 내용을 보여드려요.'));
            return;
        }
        const worker = workerOf(application);
        const checklist = root.Workflow.getHireChecklist(db, application.id, now());
        if (!checklist.minor) {
            mount(container, h('div', { class: 'alert alert-success' }, `${worker.name}님은 만 18세 이상이라 서류 확인 단계가 없어요. 면접 후 바로 채용을 확정할 수 있어요.`));
            return;
        }
        const editable = ['DOCS_REQUIRED', 'DOCS_VERIFIED'].includes(application.status);
        const ended = ['HIRED', 'REJECTED', 'WITHDRAWN'].includes(application.status);
        mount(container,
            h('div', { class: 'fs-small', style: 'margin-bottom: 6px;' }, `${worker.name} · ${S.label('APPLICATION_STATUS', application.status)}`),
            ['APPLIED', 'VIEWED', 'INTERVIEW'].includes(application.status)
                ? h('div', { class: 'feature-alert' }, h('strong', {}, '다음 단계'), h('span', {}, '면접 후 "서류 요청"을 누르면 파트너가 서류를 올려요.'))
                : null,
            h('ul', { class: 'checklist' }, checklist.items.map(item => h('li', {
                class: `checklist-item${item.done ? ' completed' : ''}`, dataset: { key: item.key }
            },
            item.kind === 'owner'
                ? h('input', {
                    type: 'checkbox', class: 'owner-check', checked: item.done, disabled: !editable, 'aria-label': item.label, dataset: { key: item.key },
                    onchange: event => root.App.notify(root.Store.run(store => root.Workflow.setChecklistItem(store, application.id, item.key, event.target.checked, OWNER, now())))
                })
                : h('span', { class: 'checklist-icon' }, item.done ? '✓' : ''),
            h('span', {},
                h('strong', {}, item.label),
                item.note ? [h('br'), h('span', { class: 'fs-small text-muted' }, item.kind === 'auto' && item.done ? `✔ 자동 확인됨 (${item.note})` : item.note)] : null)))),
            // 앱은 "합법"을 보증하지 않는다. 문구는 여기까지만 (§10.2)
            checklist.docsVerified
                ? h('div', { class: 'alert alert-success', id: 'docsVerifiedNotice' }, '필수 서류가 확인되었습니다.')
                : h('div', { class: 'alert alert-warning' }, '서류 원본은 운영팀만 확인해요. 확인이 끝나면 여기 상태가 바뀌어요.'),
            application.status === 'HIRED'
                ? h('button', { class: 'btn btn-secondary', type: 'button', id: 'downloadDocsButton', disabled: Boolean(application.docs_downloaded_at), onclick: () => downloadDocs(application) },
                    application.docs_downloaded_at ? `서류를 받았어요 (${fmtDate(application.docs_downloaded_at)})` : '보관용 서류 받기 (1회)')
                : h('button', { class: 'btn btn-primary', type: 'button', id: 'hireButton', disabled: !checklist.canHire, onclick: () => changeStatus(application, 'HIRED') },
                    checklist.canHire ? '채용 확정' : '채용 확정 (필수 항목 미완료)'),
            ended ? null : h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => changeStatus(application, 'REJECTED') }, '거절'));
    }

    function render() {
        renderShopPanel();
        renderTemplatePanel();
        renderOwnerPostings();
        renderApplicantPanel();
        renderApplicantDetail();
        renderHireChecklist();
    }

    root.OwnerUI = { render, onBizRegNoInput, readPostingForm, fillPostingForm, selectApplication, rankedApplications, OWNER };
    root.confirmJobPosting = confirmJobPosting;
    root.confirmStoreRegistration = confirmStoreRegistration;
})(window);
