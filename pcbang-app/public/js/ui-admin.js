/*
 * 어드민 화면 — A1 PC방 승인, A2 연소자 서류 검증(감사 로그), A3 컴플라이언스, 배치 작업, 매칭 가중치 (§8, §9.2)
 */
(function (root) {
    'use strict';

    const { h, mount, fmtWon, fmtDate, detailRow } = root.Dom;
    const S = root.Schema;
    const ADMIN = 'admin';   // 실서비스에서는 로그인한 운영자 계정

    const AUDIT_LABELS = {
        SHOP_REGISTER: '매장 등록 신청', SHOP_APPROVE: '매장 승인', SHOP_REJECT: '매장 반려', SHOP_SUSPEND: '매장 정지',
        POSTING_OPEN: '공고 게시', POSTING_CLOSE: '공고 마감', POSTING_REOPEN: '공고 재게시', TEMPLATE_SAVE: '템플릿 저장',
        APPLICATION_APPLIED: '지원', APPLICATION_VIEWED: '지원서 열람', APPLICATION_INTERVIEW: '면접 제안',
        APPLICATION_DOCS_REQUIRED: '서류 요청', APPLICATION_DOCS_VERIFIED: '서류 확인 완료', APPLICATION_HIRED: '채용 확정',
        APPLICATION_REJECTED: '거절', APPLICATION_WITHDRAWN: '지원 취소', CHECKLIST_UPDATE: '채용 체크리스트',
        DOC_UPLOAD: '서류 업로드', DOC_VIEW: '서류 열람', DOC_VERIFY: '서류 승인', DOC_REJECT: '서류 반려', DOC_DOWNLOAD: '서류 다운로드(사업주)',
        BATCH_DOC_PURGE: '서류 파기 배치', BATCH_MIN_WAGE: '최저임금 배치', CONFIG_MATCHING: '매칭 가중치 변경'
    };

    const WEIGHT_FIELDS = [
        ['posLevel.EXPERIENCED', '프로그램: 경험 있음'], ['posLevel.SOLO_OPERATE', '프로그램: 혼자 운영'], ['posLevel.CONFIGURE', '프로그램: 설정 가능'],
        ['nightBase', '야간 가능'], ['nightPerConsecutive', '연속 야간 1일당'], ['perDutyMatch', '운영 경험 일치 1개당'],
        ['idCheckBonus', '신분증 확인 경험'], ['perCookMenu', '조리 메뉴 1개당'], ['perCareerMonth', '경력 1개월당'],
        ['perVerifiedHistory', '인증 경력 1건당'], ['distanceBase', '거리 기본점'], ['distancePerKm', '거리 1km당 감점']
    ];

    const now = () => new Date();
    const getDb = () => root.Store.get();
    const yesNo = value => (value ? '예' : '아니요');
    const todayString = () => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    };

    // ───────────── A1 PC방 승인 ─────────────

    function reviewShop(shop, decision) {
        let reason = '';
        if (decision === 'APPROVE') {
            if (!root.confirm(`${shop.name}을(를) 승인할까요?`)) return;
        } else {
            reason = root.prompt(decision === 'REJECT' ? `${shop.name} 반려 사유를 적어 주세요` : `${shop.name} 정지 사유를 적어 주세요`);
            if (reason === null) return;
        }
        const messages = { APPROVE: '승인했어요.', REJECT: '반려했어요.', SUSPEND: '정지했어요. 모집 중인 공고도 마감됐어요.' };
        root.App.notify(root.Store.run(db => root.Workflow.reviewShop(db, shop.id, decision, ADMIN, reason, now())), messages[decision]);
    }

    function renderShopQueue() {
        const container = document.getElementById('adminShopQueue');
        if (!container) return;
        const db = getDb();
        const pending = db.shops.filter(shop => shop.status === 'PENDING');
        const active = db.shops.filter(shop => shop.status === 'ACTIVE');
        mount(container,
            h('div', { class: 'queue-count' }, `📋 승인 대기 ${pending.length}건`),
            pending.length ? pending.map(shop => {
                const valid = root.Legal.isValidBizRegNo(shop.biz_reg_no);
                return h('div', { class: 'applicant-card', dataset: { shopId: shop.id } },
                    h('div', { class: 'applicant-name' }, shop.name),
                    h('div', { class: 'fs-small' }, `사업자 ${shop.biz_reg_no} `,
                        h('span', { class: valid ? 'text-success' : 'text-danger' }, valid ? '✓ 검증번호 일치' : '✗ 검증번호 불일치')),
                    h('div', { class: 'fs-small text-muted' }, `${shop.address} · ${shop.floor} · ${shop.seat_count}석 · ${S.label('POS_PROGRAMS', shop.pos_program)}`),
                    h('div', { class: 'fs-small text-muted' }, `야간 혼자 ${yesNo(shop.night_solo)} · 흡연부스 청소 ${yesNo(shop.smoking_booth_clean)} · 연소자 채용 ${yesNo(shop.hires_minor)} · 신청 ${fmtDate(shop.created_at)}`),
                    h('div', { class: 'fs-small text-muted' }, '국세청 진위확인: 서버 연동 후 자동 확인'),
                    h('div', { class: 'button-group' },
                        h('button', { class: 'btn btn-primary btn-small', type: 'button', dataset: { action: 'approve' }, onclick: () => reviewShop(shop, 'APPROVE') }, '승인'),
                        h('button', { class: 'btn btn-secondary btn-small', type: 'button', dataset: { action: 'reject' }, onclick: () => reviewShop(shop, 'REJECT') }, '반려')));
            }) : h('p', { class: 'fs-small text-muted' }, '승인을 기다리는 매장이 없어요.'),
            h('div', { class: 'section-title' }, `운영 중 ${active.length}곳`),
            active.map(shop => h('div', { class: 'detail-row', dataset: { shopId: shop.id } },
                h('span', {}, `${shop.name} · ${S.label('BUSINESS_TYPES', shop.business_type)}`),
                h('button', { class: 'save-button muted', type: 'button', dataset: { action: 'suspend' }, onclick: () => reviewShop(shop, 'SUSPEND') }, '정지'))));
    }

    // ───────────── A2 연소자 서류 검증 ─────────────

    function viewDoc(doc) {
        const result = root.Store.run(db => root.Workflow.viewDoc(db, doc.id, ADMIN, now()));
        root.App.notify(result, `${S.label('DOC_TYPES', doc.doc_type)} 열람을 기록했어요.\n(시안에는 원본이 없어요. 실서비스에서는 암호화 저장소의 원본을 이 자리에서 보여줘요.)`);
    }

    function reviewDoc(doc, approve) {
        let reason = '';
        if (!approve) {
            reason = root.prompt('반려 사유를 적어 주세요 (파트너에게 전달돼요)');
            if (reason === null) return;
        }
        root.App.notify(root.Store.run(db => root.Workflow.reviewDoc(db, doc.id, approve, ADMIN, reason, now())), approve ? '확인 완료로 처리했어요.' : '반려했어요.');
    }

    function renderDocQueue() {
        const container = document.getElementById('adminDocQueue');
        if (!container) return;
        const db = getDb();
        const queue = db.minorDocs.filter(doc => doc.status === 'UPLOADED');
        const viewed = docId => db.auditLog.some(record => record.action === 'DOC_VIEW' && record.target === docId);
        mount(container,
            h('div', { class: 'queue-count' }, `📋 확인 대기 ${queue.length}건`),
            queue.length ? queue.map(doc => {
                const application = db.applications.find(item => item.id === doc.application_id);
                const worker = db.workers.find(item => item.id === application.worker_id);
                const posting = db.postings.find(item => item.id === application.posting_id);
                const shop = db.shops.find(item => item.id === posting.shop_id);
                const isViewed = viewed(doc.id);
                return h('div', { class: 'applicant-card', dataset: { docId: doc.id } },
                    h('div', { class: 'applicant-name' }, `${worker.name} (만 ${root.Legal.calculateAge(worker.birth_date, now())}세) · ${S.label('DOC_TYPES', doc.doc_type)}`),
                    h('div', { class: 'fs-small text-muted' }, `${shop.name} · ${posting.title} · ${doc.file_label} · 올린 날 ${fmtDate(doc.uploaded_at)}`),
                    h('div', { class: 'button-group' },
                        h('button', { class: 'btn btn-secondary btn-small', type: 'button', dataset: { action: 'view' }, onclick: () => viewDoc(doc) }, isViewed ? '다시 열람' : '열람'),
                        h('button', { class: 'btn btn-primary btn-small', type: 'button', dataset: { action: 'verify' }, disabled: !isViewed, onclick: () => reviewDoc(doc, true) }, '승인'),
                        h('button', { class: 'btn btn-secondary btn-small', type: 'button', dataset: { action: 'reject' }, disabled: !isViewed, onclick: () => reviewDoc(doc, false) }, '반려')));
            }) : h('p', { class: 'fs-small text-muted' }, '확인할 서류가 없어요.'),
            h('div', { class: 'fs-small text-muted' }, '📝 열람·승인·반려는 감사 로그에 자동으로 남아요. 자동 판독(OCR) 없이 사람이 직접 확인해요.'));
    }

    // ───────────── A3 컴플라이언스 ─────────────

    function renderCompliance() {
        const container = document.getElementById('complianceBoard');
        if (!container) return;
        const { violations, stats, minimumWage } = root.Workflow.computeCompliance(getDb(), now());
        mount(container,
            h('div', { class: 'section-title' }, '확인이 필요한 내용'),
            violations.length
                ? violations.map(violation => h('div', { class: 'alert alert-danger', dataset: { type: violation.type } },
                    h('strong', {}, `⚠️ ${violation.title}`), h('br'), h('span', { class: 'fs-small' }, violation.detail)))
                : h('div', { class: 'alert alert-success', id: 'complianceClean' }, h('strong', {}, '✓ 확인할 위반이 없어요'), h('br'), h('span', { class: 'fs-small' }, `올해 최저임금 ${fmtWon(minimumWage)} 기준`)),
            h('div', { class: 'section-title' }, '서비스 현황'),
            detailRow('운영 중 매장', `${stats.shopsActive}곳`),
            detailRow('승인 대기', `${stats.shopsPending}곳`),
            detailRow('모집 중 공고', `${stats.postingsOpen}건`),
            detailRow('채용 완료', `${stats.hires}명`),
            detailRow('만 18세 미만 채용', `${stats.minorHires}명`),
            detailRow('연소자 서류 검증 완료율', stats.minorDocRate === null ? '-' : `${stats.minorDocRate}%`));
    }

    // ───────────── 배치 · 감사 로그 ─────────────

    function runBatch(kind, dateValue) {
        const baseDate = dateValue ? new Date(`${dateValue}T12:00:00`) : now();
        const result = root.Store.run(db => (kind === 'purge'
            ? root.Workflow.runDocPurge(db, baseDate, ADMIN)
            : root.Workflow.runMinimumWageBatch(db, baseDate, ADMIN)));
        root.App.notify(result, kind === 'purge'
            ? `파기 기한이 지난 서류 ${result.count}건을 파기했어요.`
            : `최저임금(${fmtWon(result.minimumWage)})보다 낮은 공고 ${result.count}건을 멈추고 사장님께 알렸어요.`);
    }

    function renderBatchPanel() {
        const container = document.getElementById('batchPanel');
        if (!container) return;
        const db = getDb();
        const dateInput = h('input', { type: 'date', class: 'form-input', id: 'batchDate', value: todayString(), 'aria-label': '배치 기준 날짜' });
        mount(container,
            h('div', { class: 'form-label' }, '기준 날짜'),
            h('div', { class: 'why-note' }, '실서비스에서는 매일 자동으로 돌아요. 여기서는 날짜를 바꿔 미리 돌려볼 수 있어요.'),
            dateInput,
            h('div', { class: 'button-group' },
                h('button', { class: 'btn btn-primary btn-small', type: 'button', id: 'runPurgeBatch', onclick: () => runBatch('purge', dateInput.value) }, '서류 파기 실행'),
                h('button', { class: 'btn btn-secondary btn-small', type: 'button', id: 'runWageBatch', onclick: () => runBatch('wage', dateInput.value) }, '최저임금 점검 실행')),
            h('div', { class: 'section-title' }, '배치 기록'),
            db.batchLog.length
                ? db.batchLog.slice(-5).reverse().map(batch => detailRow(batch.type === 'DOC_PURGE' ? '서류 파기' : '최저임금 점검', `${fmtDate(batch.at)} · ${batch.count}건`))
                : h('p', { class: 'fs-small text-muted' }, '아직 실행 기록이 없어요.'),
            h('div', { class: 'section-title' }, '감사 로그 (최근 20건 · 추가만 가능)'),
            h('ol', { class: 'audit-list', id: 'auditLogList' }, db.auditLog.slice(-20).reverse().map(record => h('li', { dataset: { action: record.action } },
                h('span', { class: 'audit-meta' }, `#${record.seq} ${record.at.slice(0, 16).replace('T', ' ')} · ${record.actor}`),
                h('br'),
                `${AUDIT_LABELS[record.action] || record.action} · ${record.detail}`))),
            h('button', {
                class: 'save-button muted', type: 'button', id: 'resetDemo', style: 'margin-top: 10px;',
                onclick: () => {
                    if (!root.confirm('데모 데이터를 처음 상태로 되돌릴까요? (이 브라우저에 저장된 시안 데이터만 지워져요)')) return;
                    root.Store.reset();
                    if (root.PartnerUI) root.PartnerUI.resetDraft();
                }
            }, '↺ 데모 데이터 초기화'));
    }

    // ───────────── 매칭 가중치 (§9.2 어드민 조정) ─────────────

    function renderWeights() {
        const container = document.getElementById('matchingWeights');
        if (!container) return;
        const config = root.Matching.mergeConfig(getDb().config.matching);
        const read = path => path.split('.').reduce((value, key) => value[key], config);
        const inputs = WEIGHT_FIELDS.map(([path, label]) => [path, h('input', {
            type: 'number', min: 0, step: 0.5, class: 'form-input weight-input', value: read(path), dataset: { path }, 'aria-label': label
        })]);
        const save = () => {
            const patch = {};
            inputs.forEach(([path, input]) => {
                const keys = path.split('.');
                let target = patch;
                keys.slice(0, -1).forEach(key => { target = target[key] = target[key] || {}; });
                target[keys[keys.length - 1]] = Number(input.value);
            });
            root.App.notify(root.Store.run(db => root.Workflow.updateMatchingConfig(db, patch, ADMIN, now())), '가중치를 저장했어요. 사장님 지원자 정렬에 바로 반영돼요.');
        };
        const restore = () => {
            if (!root.confirm('기본 가중치로 되돌릴까요?')) return;
            root.App.notify(root.Store.run(db => {
                db.config.matching = JSON.parse(JSON.stringify(root.Matching.DEFAULT_MATCHING_CONFIG));
                root.Workflow.appendAudit(db, ADMIN, 'CONFIG_MATCHING', 'matching', '기본값으로 되돌림', now());
                return { ok: true };
            }), '기본값으로 되돌렸어요.');
        };
        mount(container,
            h('div', { class: 'why-note' }, '실사용 데이터 100건이 쌓이기 전까지는 모두 가설이에요. 채용 결과와 비교하며 조정해요.'),
            h('div', { class: 'weight-grid' }, inputs.map(([, input], index) => h('label', { class: 'weight-row' }, h('span', {}, WEIGHT_FIELDS[index][1]), input))),
            h('div', { class: 'button-group' },
                h('button', { class: 'btn btn-primary btn-small', type: 'button', id: 'saveWeights', onclick: save }, '저장'),
                h('button', { class: 'btn btn-secondary btn-small', type: 'button', onclick: restore }, '기본값')));
    }

    function render() {
        renderShopQueue();
        renderDocQueue();
        renderCompliance();
        renderBatchPanel();
        renderWeights();
    }

    root.AdminUI = { render };
})(window);
