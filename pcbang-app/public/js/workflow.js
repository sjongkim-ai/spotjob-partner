/*
 * 상태 전이와 서버 검증 규칙 (명세서 §5.5, §10, §11.3)
 * 지금은 브라우저 저장소(db 객체)에 적용하지만, 백엔드가 생기면 같은 규칙을 서버 트랜잭션 안에서 실행한다.
 * 모든 함수는 { ok, code, message } 형태로 결과를 돌려준다. code는 API 오류 코드와 맞춘다
 * (MIN_WAGE_VIOLATION, MINOR_DOCS_REQUIRED 등 §11.2).
 */
(function (root) {
    'use strict';

    const Legal = root.Legal || require('./legal.js');
    const Schema = root.Schema || require('./schema.js');
    const Matching = root.Matching || require('./matching.js');

    const DAY_MS = 86400000;
    const ENDED_APPLICATION = ['HIRED', 'REJECTED', 'WITHDRAWN'];

    // §5.5 지원 상태 전이. 연소자는 INTERVIEW → DOCS_REQUIRED → DOCS_VERIFIED → HIRED 만 가능
    const TRANSITIONS = {
        APPLIED: ['VIEWED', 'REJECTED', 'WITHDRAWN'],
        VIEWED: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
        INTERVIEW: ['HIRED', 'DOCS_REQUIRED', 'REJECTED', 'WITHDRAWN'],
        DOCS_REQUIRED: ['DOCS_VERIFIED', 'REJECTED', 'WITHDRAWN'],
        DOCS_VERIFIED: ['HIRED', 'REJECTED', 'WITHDRAWN'],
        HIRED: [],
        REJECTED: [],
        WITHDRAWN: []
    };

    const toIso = date => new Date(date).toISOString();
    const findById = (list, id) => list.find(item => item.id === id) || null;
    const newId = prefix => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const fail = (code, message, extra) => ({ ok: false, code, message, ...extra });
    const done = extra => ({ ok: true, ...extra });

    // 감사 로그 — 추가만 한다. 수정·삭제 함수는 만들지 않는다 (§3.7 append-only)
    function appendAudit(db, actor, action, target, detail, now = new Date()) {
        const record = { seq: db.auditLog.length + 1, at: toIso(now), actor, action, target, detail: detail || '' };
        db.auditLog.push(record);
        return record;
    }

    function ageClassOf(worker, now = new Date()) {
        return Matching.workerAgeClass(worker, now);
    }

    function isMinorWorker(worker, now = new Date()) {
        return Legal.isMinorAgeClass(ageClassOf(worker, now));
    }

    function requiredDocTypes(ageClass) {
        if (ageClass === 'MINOR_15_17') return Legal.LEGAL_CONFIG.minor.requiredDocs.slice();
        if (ageClass === 'MINOR_UNDER_15') return ['WORK_PERMIT'];
        return [];
    }

    // 문서 유형별 가장 최근 서류 (파기된 것 제외)
    function latestDocs(db, applicationId) {
        const latest = {};
        db.minorDocs
            .filter(doc => doc.application_id === applicationId && doc.status !== 'PURGED')
            .forEach(doc => {
                const current = latest[doc.doc_type];
                if (!current || doc.uploaded_at >= current.uploaded_at) latest[doc.doc_type] = doc;
            });
        return latest;
    }

    function allRequiredDocsVerified(db, application, now) {
        const worker = findById(db.workers, application.worker_id);
        const docs = latestDocs(db, application.id);
        return requiredDocTypes(ageClassOf(worker, now)).every(type => docs[type] && docs[type].status === 'VERIFIED');
    }

    // 채용되지 않은 지원의 연소자 서류는 30일 뒤 파기 예약
    function schedulePurge(db, applicationId, now) {
        const purgeAt = toIso(new Date(now).getTime() + (Legal.LEGAL_CONFIG.minorDocPurgeDays * DAY_MS));
        db.minorDocs
            .filter(doc => doc.application_id === applicationId && doc.status !== 'PURGED' && !doc.purge_at)
            .forEach(doc => { doc.purge_at = purgeAt; });
    }

    // ───────────── 프로필 ─────────────

    // 생년월일은 실서비스에서 PASS 본인인증 결과로만 들어온다 (§3.2 ① 사용자 입력 신뢰 금지)
    function setBirthDate(db, workerId, birthDate, now = new Date()) {
        const worker = findById(db.workers, workerId);
        if (!worker) return fail('NOT_FOUND', '프로필을 찾을 수 없어요');
        const age = Legal.calculateAge(birthDate, now);
        if (Number.isNaN(age) || age < 0) return fail('INVALID_BIRTH_DATE', '생년월일을 다시 확인해 주세요');
        worker.birth_date = birthDate;
        if (isMinorWorker(worker, now)) worker.night_available = false;
        return done({ worker, ageClass: ageClassOf(worker, now) });
    }

    const PROFILE_FIELDS = [
        'total_months', 'work_histories', 'pos_skills', 'cook_menus', 'cook_equipment_clean', 'cook_menu_count',
        'pc_skills', 'ops_experiences', 'night_available', 'available_slots', 'max_consecutive_nights',
        'preferred_type', 'strengths', 'intro_text', 'commute_radius_km'
    ];

    // PATCH /me/profile — 위저드 단계별 부분 저장
    function updateWorkerProfile(db, workerId, patch, now = new Date()) {
        const worker = findById(db.workers, workerId);
        if (!worker) return fail('NOT_FOUND', '프로필을 찾을 수 없어요');
        PROFILE_FIELDS.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(patch, key)) worker[key] = patch[key];
        });
        worker.intro_text = String(worker.intro_text || '').slice(0, 300);
        worker.strengths = (worker.strengths || []).filter(tag => Schema.STRENGTHS.includes(tag));
        worker.pos_skills = (worker.pos_skills || []).filter(skill => Schema.POS_PROGRAMS[skill.program] && Schema.POS_LEVELS[skill.level]);
        if (isMinorWorker(worker, now)) worker.night_available = false;   // §5.1 MINOR면 강제 false
        worker.updated_at = toIso(now);
        return done({ worker });
    }

    // ───────────── 매장 ─────────────

    const SHOP_TEXT_FIELDS = [['name', '매장명'], ['address', '주소'], ['floor', '층'], ['phone', '연락처']];
    const SHOP_NUMBER_FIELDS = [['seat_count', '좌석 수', 1], ['staff_per_shift', '교대당 근무 인원', 1], ['cook_menu_count', '조리 메뉴 수', 0]];
    const SHOP_BOOLEAN_FIELDS = [
        ['is_24h', '24시간 운영'], ['is_franchise', '프랜차이즈'], ['insurance_established', '4대보험 가입'],
        ['night_solo', '야간 혼자 근무'], ['smoking_booth_clean', '흡연부스 청소 포함'], ['meal_provided', '식사 제공'],
        ['free_pc_use', '근무 외 PC 이용'], ['night_allowance', '야간 수당'], ['hires_minor', '만 18세 미만 채용']
    ];

    function validateShop(db, form) {
        const errors = [];
        if (!Legal.isValidBizRegNo(form.biz_reg_no)) errors.push('사업자등록번호 10자리를 정확히 입력해 주세요');
        else if (db.shops.some(shop => shop.status !== 'REJECTED'
            && Legal.normalizeBizRegNo(shop.biz_reg_no) === Legal.normalizeBizRegNo(form.biz_reg_no))) errors.push('이미 등록된 사업자등록번호예요');
        SHOP_TEXT_FIELDS.forEach(([key, label]) => {
            if (!String(form[key] || '').trim()) errors.push(`${label}: 입력이 필요해요`);
        });
        SHOP_NUMBER_FIELDS.forEach(([key, label, min]) => {
            const value = Number(form[key]);
            if (form[key] === '' || form[key] === null || form[key] === undefined || !Number.isInteger(value) || value < min) {
                errors.push(`${label}: ${min} 이상의 숫자가 필요해요`);
            }
        });
        if (!Schema.POS_PROGRAMS[form.pos_program]) errors.push('좌석관리 프로그램: 선택이 필요해요');
        // 야간 혼자 근무·흡연부스 청소 등은 선택 항목이 아니라 필수 (§5.3 note)
        SHOP_BOOLEAN_FIELDS.forEach(([key, label]) => {
            if (typeof form[key] !== 'boolean') errors.push(`${label}: 예/아니요 선택이 필요해요`);
        });
        if (form.is_franchise === true && !String(form.franchise_brand || '').trim()) errors.push('프랜차이즈 브랜드: 입력이 필요해요');
        if (!Array.isArray(form.clean_scope) || form.clean_scope.length === 0) errors.push('청소 범위: 하나 이상 골라 주세요');
        return errors;
    }

    function registerShop(db, form, actor, now = new Date()) {
        const errors = validateShop(db, form);
        if (errors.length) return fail('VALIDATION', errors[0], { errors });
        const shop = {
            id: newId('shop'),
            owner: actor,
            name: form.name.trim(),
            biz_reg_no: Legal.formatBizRegNo(form.biz_reg_no),
            biz_verified: false,          // 국세청 진위확인은 서버 연동 후 true
            biz_check: 'FORMAT_OK',
            business_type: 'pcbang',
            address: form.address.trim(),
            location_description: String(form.location_description || '').trim().slice(0, 300),
            geo: form.geo || null,
            floor: form.floor.trim(),
            seat_count: Number(form.seat_count),
            franchise_brand: form.is_franchise ? form.franchise_brand.trim() : null,
            pos_program: form.pos_program,
            staff_per_shift: Number(form.staff_per_shift),
            cook_menu_count: Number(form.cook_menu_count),
            clean_scope: form.clean_scope.slice(),
            minor_ready: false,
            phone: form.phone.trim(),
            verified_at: null,
            status: 'PENDING',
            created_at: toIso(now)
        };
        SHOP_BOOLEAN_FIELDS.forEach(([key]) => { shop[key] = form[key]; });
        db.shops.push(shop);
        appendAudit(db, actor, 'SHOP_REGISTER', shop.id, `${shop.name} 등록 신청`, now);
        return done({ shop });
    }

    function reviewShop(db, shopId, decision, actor, reason, now = new Date()) {
        const shop = findById(db.shops, shopId);
        if (!shop) return fail('NOT_FOUND', '매장을 찾을 수 없어요');
        const note = String(reason || '').trim();
        if (decision === 'APPROVE') {
            if (shop.status !== 'PENDING') return fail('INVALID_STATE', '승인 대기 중인 매장만 승인할 수 있어요');
            if (!Legal.isValidBizRegNo(shop.biz_reg_no)) return fail('BIZ_REG_INVALID', '사업자등록번호 검증번호가 맞지 않아 승인할 수 없어요');
            shop.status = 'ACTIVE';
            shop.verified_at = toIso(now);
        } else if (decision === 'REJECT') {
            if (shop.status !== 'PENDING') return fail('INVALID_STATE', '승인 대기 중인 매장만 반려할 수 있어요');
            if (!note) return fail('REASON_REQUIRED', '반려 사유를 적어 주세요');
            shop.status = 'REJECTED';
            shop.rejected_reason = note;
        } else if (decision === 'SUSPEND') {
            if (shop.status !== 'ACTIVE') return fail('INVALID_STATE', '운영 중인 매장만 정지할 수 있어요');
            if (!note) return fail('REASON_REQUIRED', '정지 사유를 적어 주세요');
            shop.status = 'SUSPENDED';
            shop.suspended_reason = note;
            db.postings.filter(posting => posting.shop_id === shopId && posting.status === 'OPEN')
                .forEach(posting => closePostingInternal(db, posting, 'SHOP_SUSPENDED', now));
        } else {
            return fail('INVALID_DECISION', '알 수 없는 처리예요');
        }
        appendAudit(db, actor, `SHOP_${decision}`, shop.id, note || shop.name, now);
        return done({ shop });
    }

    // ───────────── 공고 ─────────────

    function validatePosting(db, draft, now = new Date()) {
        const errors = [];
        let code = 'VALIDATION';
        const shop = findById(db.shops, draft.shop_id);
        if (!shop) errors.push('매장을 찾을 수 없어요');
        else if (shop.status !== 'ACTIVE') errors.push('승인된 매장만 공고를 올릴 수 있어요');
        if (!String(draft.title || '').trim()) errors.push('공고 제목: 입력이 필요해요');
        if (!Schema.EMPLOYMENT_TYPES[draft.employment_type]) errors.push('고용 형태: 선택이 필요해요');
        const wage = Number(draft.hourly_wage);
        const minimumWage = Legal.getMinimumWage(now);
        if (!Number.isFinite(wage) || wage <= 0) {
            errors.push('시급: 입력이 필요해요');
        } else if (wage < minimumWage) {
            // §3.1 경고가 아니라 등록 차단
            code = 'MIN_WAGE_VIOLATION';
            errors.unshift(`시급이 최저임금 ${minimumWage.toLocaleString()}원보다 낮아요`);
        }
        const timePattern = /^\d{2}:\d{2}$/;
        if (!timePattern.test(draft.shift_start || '') || !timePattern.test(draft.shift_end || '')) errors.push('근무 시작·종료 시간: 입력이 필요해요');
        else if (draft.shift_start === draft.shift_end) errors.push('근무 시작과 종료 시간이 같아요');
        if (!Array.isArray(draft.work_days) || draft.work_days.length === 0 || draft.work_days.some(day => !Schema.DAYS[day])) errors.push('근무 요일: 하나 이상 골라 주세요');
        const headcount = Number(draft.headcount);
        if (!Number.isInteger(headcount) || headcount < 1) errors.push('모집 인원: 1명 이상이어야 해요');
        if (!Array.isArray(draft.duties) || draft.duties.length === 0) errors.push('업무: 하나 이상 골라 주세요');
        if (draft.required_pos && !Schema.POS_PROGRAMS[draft.required_pos]) errors.push('필수 프로그램 값이 올바르지 않아요');
        return { ok: errors.length === 0, code, errors };
    }

    function setPostingStatus(posting, status, now) {
        posting.status = status;
        posting.status_history.push({ status, at: toIso(now) });
    }

    // POST /shops/me/postings — DRAFT → VALIDATED → OPEN. 검증 실패 시 VALIDATED에 들어가지 못함
    function createPosting(db, draft, actor, now = new Date()) {
        const check = validatePosting(db, draft, now);
        if (!check.ok) return fail(check.code, check.errors[0], { errors: check.errors });
        const shop = findById(db.shops, draft.shop_id);
        const at = toIso(now);
        const posting = {
            id: newId('post'),
            shop_id: shop.id,
            business_type: shop.business_type || 'pcbang',
            employment_type: draft.employment_type,
            title: draft.title.trim(),
            shift_start: draft.shift_start,
            shift_end: draft.shift_end,
            work_days: draft.work_days.slice(),
            hourly_wage: Number(draft.hourly_wage),
            headcount: Number(draft.headcount),
            duties: draft.duties.slice(),
            required_pos: draft.required_pos || null,
            // 사장님이 보낸 값은 무시하고 근무시간으로 다시 판정 (§11.3 ④)
            minor_allowed: Legal.isPostingAllowedForMinor(draft.shift_start, draft.shift_end, draft.work_days),
            urgent: draft.urgent ? { extra_pay: Math.max(0, Number(draft.urgent.extra_pay) || 0), deadline: String(draft.urgent.deadline || '') } : null,
            status: 'OPEN',
            status_history: [{ status: 'DRAFT', at }, { status: 'VALIDATED', at }, { status: 'OPEN', at }],
            closed_reason: null,
            created_at: at
        };
        db.postings.push(posting);
        appendAudit(db, actor, 'POSTING_OPEN', posting.id, `${shop.name} · ${posting.title}`, now);
        return done({ posting });
    }

    function closePostingInternal(db, posting, reason, now) {
        setPostingStatus(posting, 'CLOSED', now);
        posting.closed_reason = reason;
        db.applications
            .filter(application => application.posting_id === posting.id && application.status !== 'HIRED')
            .forEach(application => schedulePurge(db, application.id, now));
    }

    function closePosting(db, postingId, actor, reason = 'OWNER_CLOSED', now = new Date()) {
        const posting = findById(db.postings, postingId);
        if (!posting) return fail('NOT_FOUND', '공고를 찾을 수 없어요');
        if (!['OPEN', 'FILLED'].includes(posting.status)) return fail('INVALID_STATE', '모집 중이거나 채용 완료된 공고만 마감할 수 있어요');
        closePostingInternal(db, posting, reason, now);
        appendAudit(db, actor, 'POSTING_CLOSE', posting.id, Schema.label('CLOSED_REASONS', reason), now);
        return done({ posting });
    }

    // 재게시 — 다시 검증한다 (최저임금이 올랐으면 새 시급을 받아야 함)
    function reopenPosting(db, postingId, actor, now = new Date(), patch = {}) {
        const posting = findById(db.postings, postingId);
        if (!posting) return fail('NOT_FOUND', '공고를 찾을 수 없어요');
        if (posting.status !== 'CLOSED') return fail('INVALID_STATE', '마감된 공고만 다시 게시할 수 있어요');
        const candidate = { ...posting };
        if (patch.hourly_wage !== undefined) candidate.hourly_wage = Number(patch.hourly_wage);
        const check = validatePosting(db, candidate, now);
        if (!check.ok) return fail(check.code, check.errors[0], { errors: check.errors });
        posting.hourly_wage = candidate.hourly_wage;
        posting.minor_allowed = Legal.isPostingAllowedForMinor(posting.shift_start, posting.shift_end, posting.work_days);
        posting.closed_reason = null;
        setPostingStatus(posting, 'OPEN', now);
        // 아직 진행 중인 지원의 파기 예약은 취소
        db.applications
            .filter(application => application.posting_id === posting.id && !ENDED_APPLICATION.includes(application.status))
            .forEach(application => db.minorDocs
                .filter(doc => doc.application_id === application.id && doc.status !== 'PURGED')
                .forEach(doc => { doc.purge_at = null; }));
        appendAudit(db, actor, 'POSTING_REOPEN', posting.id, `${posting.hourly_wage.toLocaleString()}원`, now);
        return done({ posting });
    }

    function saveTemplate(db, shopId, name, draft, actor, now = new Date()) {
        if (!String(name || '').trim()) return fail('VALIDATION', '템플릿 이름을 적어 주세요');
        const { shop_id: ignored, ...rest } = draft;
        const template = { id: newId('tpl'), shop_id: shopId, name: name.trim(), draft: JSON.parse(JSON.stringify(rest)), created_at: toIso(now) };
        db.templates.push(template);
        appendAudit(db, actor, 'TEMPLATE_SAVE', template.id, template.name, now);
        return done({ template });
    }

    // ───────────── 지원 ─────────────

    function applyToPosting(db, workerId, postingId, now = new Date()) {
        const worker = findById(db.workers, workerId);
        const posting = findById(db.postings, postingId);
        if (!worker) return fail('NOT_FOUND', '프로필을 찾을 수 없어요');
        if (!posting || posting.status !== 'OPEN') return fail('POSTING_NOT_OPEN', '지금은 모집 중인 공고가 아니에요');
        if (!worker.birth_date) return fail('BIRTH_DATE_REQUIRED', '지원하려면 먼저 생년월일을 확인해 주세요');
        if (ageClassOf(worker, now) === 'MINOR_UNDER_15' && !Legal.FEATURE_FLAGS.workPermitApplications) {
            return fail('WORK_PERMIT_REQUIRED', '만 15세 미만은 고용노동부 취직인허증이 필요해요. 발급 후 다시 찾아주세요.');
        }
        const reasons = Matching.legalBlockReasons(worker, posting, now);
        if (reasons.length) return fail('MINOR_NOT_ALLOWED', `만 18세 미만은 이 공고에 지원할 수 없어요 (${reasons.join(', ')})`, { reasons });
        if (db.applications.some(application => application.worker_id === workerId && application.posting_id === postingId
            && !['REJECTED', 'WITHDRAWN'].includes(application.status))) {
            return fail('ALREADY_APPLIED', '이미 지원한 공고예요');
        }
        const at = toIso(now);
        const application = {
            id: newId('app'),
            posting_id: postingId,
            worker_id: workerId,
            status: 'APPLIED',
            applied_at: at,
            updated_at: at,
            decided_at: null,
            history: [{ status: 'APPLIED', at }],
            checklist: { contract_written: false, direct_pay: false },
            docs_downloaded_at: null
        };
        db.applications.push(application);
        appendAudit(db, `worker:${workerId}`, 'APPLICATION_APPLIED', application.id, posting.title, now);
        return done({ application });
    }

    // 연소자 채용 전 체크리스트 (§10.1). 모든 항목이 완료되어야 canHire
    function getHireChecklist(db, applicationId, now = new Date()) {
        const application = findById(db.applications, applicationId);
        if (!application) return null;
        const worker = findById(db.workers, application.worker_id);
        const posting = findById(db.postings, application.posting_id);
        const ageClass = ageClassOf(worker, now);
        const minor = Legal.isMinorAgeClass(ageClass);
        const items = [];
        if (minor) {
            const docs = latestDocs(db, applicationId);
            requiredDocTypes(ageClass).forEach(type => {
                const doc = docs[type];
                items.push({
                    key: `doc:${type}`, kind: 'doc', label: Schema.label('DOC_TYPES', type),
                    done: Boolean(doc && doc.status === 'VERIFIED'),
                    note: doc ? Schema.label('DOC_STATUS', doc.status) : '지원자 업로드 대기 중'
                });
            });
            const limits = Legal.getMinorHourLimits();
            const { allowedStart, allowedEnd } = Legal.LEGAL_CONFIG.minor;
            const start = Legal.timeToMinutes(posting.shift_start);
            const end = Legal.timeToMinutes(posting.shift_end);
            const dailyHours = Legal.shiftMinutes(posting.shift_start, posting.shift_end) / 60;
            const weeklyHours = dailyHours * posting.work_days.length;
            items.push({ key: 'auto:window', kind: 'auto', label: `근무시간 ${allowedStart}~${allowedEnd} 이내`, done: end > start && start >= Legal.timeToMinutes(allowedStart) && end <= Legal.timeToMinutes(allowedEnd), note: `${posting.shift_start}~${posting.shift_end}` });
            items.push({ key: 'auto:daily', kind: 'auto', label: `1일 ${limits.daily}시간 이내`, done: dailyHours <= limits.daily, note: `${dailyHours}시간` });
            items.push({ key: 'auto:weekly', kind: 'auto', label: `주 ${limits.weekly}시간 이내`, done: weeklyHours <= limits.weekly, note: `${weeklyHours}시간` });
            items.push({ key: 'contract_written', kind: 'owner', label: '근로계약서 2부 작성 · 1부 교부', done: Boolean(application.checklist.contract_written) });
            items.push({ key: 'direct_pay', kind: 'owner', label: '임금은 본인 계좌로 직접 지급', done: Boolean(application.checklist.direct_pay) });
        }
        const docsVerified = items.filter(item => item.kind === 'doc').every(item => item.done);
        const canHire = minor
            ? application.status === 'DOCS_VERIFIED' && items.every(item => item.done)
            : application.status === 'INTERVIEW';
        return { minor, ageClass, items, docsVerified, canHire };
    }

    function setChecklistItem(db, applicationId, key, value, actor, now = new Date()) {
        const application = findById(db.applications, applicationId);
        if (!application) return fail('NOT_FOUND', '지원 내역을 찾을 수 없어요');
        if (!['contract_written', 'direct_pay'].includes(key)) return fail('INVALID_KEY', '체크할 수 없는 항목이에요');
        if (ENDED_APPLICATION.includes(application.status)) return fail('INVALID_STATE', '이미 끝난 지원이에요');
        application.checklist[key] = Boolean(value);
        appendAudit(db, actor, 'CHECKLIST_UPDATE', application.id, `${key}=${Boolean(value)}`, now);
        return done({ application });
    }

    // PATCH /applications/:id/status, POST /applications/:id/hire
    function transitionApplication(db, applicationId, toStatus, actor, now = new Date()) {
        const application = findById(db.applications, applicationId);
        if (!application) return fail('NOT_FOUND', '지원 내역을 찾을 수 없어요');
        const fromStatus = application.status;
        if (!(TRANSITIONS[fromStatus] || []).includes(toStatus)) {
            return fail('INVALID_TRANSITION', `${Schema.label('APPLICATION_STATUS', fromStatus)} 상태에서는 ${Schema.label('APPLICATION_STATUS', toStatus)}(으)로 바꿀 수 없어요`);
        }
        const worker = findById(db.workers, application.worker_id);
        const posting = findById(db.postings, application.posting_id);
        const minor = isMinorWorker(worker, now);

        if (toStatus === 'DOCS_REQUIRED' && !minor) return fail('NOT_MINOR', '만 18세 이상은 서류 확인 단계가 없어요');
        // 서류 확인 완료는 어드민 검증으로만 들어간다
        if (toStatus === 'DOCS_VERIFIED' && actor !== 'system') return fail('SYSTEM_ONLY', '서류 확인 완료는 운영팀 확인 후 자동으로 바뀌어요');
        if (toStatus === 'HIRED') {
            if (!posting || !['OPEN'].includes(posting.status)) return fail('POSTING_NOT_OPEN', '모집 중인 공고에서만 채용을 확정할 수 있어요');
            if (minor) {
                // §3.2 ④ DOCS_VERIFIED를 거치지 않은 HIRED는 거부. 예외 플래그 없음 (§10.2)
                const checklist = getHireChecklist(db, applicationId, now);
                if (fromStatus !== 'DOCS_VERIFIED' || !checklist.docsVerified) return fail('MINOR_DOCS_REQUIRED', '필수 서류가 확인되기 전에는 채용을 확정할 수 없어요');
                const reasons = Matching.legalBlockReasons(worker, posting, now);
                if (reasons.length) return fail('MINOR_NOT_ALLOWED', `근무 조건이 만 18세 미만 기준에 맞지 않아요 (${reasons.join(', ')})`);
                if (!checklist.canHire) return fail('CHECKLIST_INCOMPLETE', '체크리스트를 모두 확인해야 채용을 확정할 수 있어요');
            }
        }

        const at = toIso(now);
        application.status = toStatus;
        application.updated_at = at;
        application.history.push({ status: toStatus, at });
        if (['REJECTED', 'WITHDRAWN'].includes(toStatus)) {
            application.decided_at = at;
            schedulePurge(db, application.id, now);
        }
        if (toStatus === 'HIRED') {
            application.decided_at = at;
            const hires = db.applications.filter(item => item.posting_id === posting.id && item.status === 'HIRED').length;
            if (hires >= posting.headcount) setPostingStatus(posting, 'FILLED', now);
        }
        appendAudit(db, actor, `APPLICATION_${toStatus}`, application.id, `${Schema.label('APPLICATION_STATUS', fromStatus)} → ${Schema.label('APPLICATION_STATUS', toStatus)}`, now);
        return done({ application });
    }

    // ───────────── 연소자 서류 (§3.7, §10.2) ─────────────

    // 원본과 파일명은 저장하지 않는다 (파일명에 이름이 들어갈 수 있음). 형식과 크기만 기록
    function describeFile(meta) {
        const name = String((meta && meta.name) || '');
        const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '파일';
        const size = Number(meta && meta.size) || 0;
        const sizeLabel = size >= 1048576 ? `${(size / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(size / 1024))}KB`;
        return `${extension} · ${sizeLabel}`;
    }

    function recordDocUpload(db, applicationId, docType, fileMeta, actor, now = new Date()) {
        const application = findById(db.applications, applicationId);
        if (!application) return fail('NOT_FOUND', '지원 내역을 찾을 수 없어요');
        if (application.status !== 'DOCS_REQUIRED') return fail('DOCS_NOT_REQUESTED', '매장이 서류를 요청한 뒤에 올릴 수 있어요');
        const worker = findById(db.workers, application.worker_id);
        if (!requiredDocTypes(ageClassOf(worker, now)).includes(docType)) return fail('DOC_TYPE_NOT_REQUIRED', '이 지원에 필요한 서류가 아니에요');
        const current = latestDocs(db, applicationId)[docType];
        if (current && current.status !== 'REJECTED') return fail('ALREADY_UPLOADED', '이미 올린 서류예요. 확인 결과를 기다려 주세요');
        const doc = {
            id: newId('doc'),
            application_id: applicationId,
            doc_type: docType,
            storage_token: `vault://minor-docs/${newId('obj')}`,   // 실서비스: 전용 암호화 버킷(KMS) 참조
            file_label: describeFile(fileMeta),
            status: 'UPLOADED',
            uploaded_at: toIso(now),
            verified_by: null,
            verified_at: null,
            reject_reason: null,
            purge_at: null,
            purged_at: null
        };
        db.minorDocs.push(doc);
        appendAudit(db, actor, 'DOC_UPLOAD', doc.id, Schema.label('DOC_TYPES', docType), now);
        return done({ doc });
    }

    // 모든 열람은 감사 로그에 남긴다
    function viewDoc(db, docId, actor, now = new Date()) {
        const doc = findById(db.minorDocs, docId);
        if (!doc) return fail('NOT_FOUND', '서류를 찾을 수 없어요');
        if (doc.status === 'PURGED') return fail('PURGED', '이미 파기된 서류예요');
        appendAudit(db, actor, 'DOC_VIEW', doc.id, Schema.label('DOC_TYPES', doc.doc_type), now);
        return done({ doc });
    }

    // POST /admin/minor-docs/:id/verify — 사람이 눈으로 확인 (OCR 자동화 금지 §10.2). 열람 기록이 있어야 처리 가능
    function reviewDoc(db, docId, approve, actor, reason, now = new Date()) {
        const doc = findById(db.minorDocs, docId);
        if (!doc) return fail('NOT_FOUND', '서류를 찾을 수 없어요');
        if (doc.status !== 'UPLOADED') return fail('INVALID_STATE', '확인 대기 중인 서류가 아니에요');
        if (!db.auditLog.some(record => record.action === 'DOC_VIEW' && record.target === docId)) return fail('VIEW_REQUIRED', '서류를 먼저 열람해 확인해 주세요');
        const note = String(reason || '').trim();
        if (!approve && !note) return fail('REASON_REQUIRED', '반려 사유를 적어 주세요');
        doc.status = approve ? 'VERIFIED' : 'REJECTED';
        doc.verified_by = actor;
        doc.verified_at = toIso(now);
        doc.reject_reason = approve ? null : note;
        appendAudit(db, actor, approve ? 'DOC_VERIFY' : 'DOC_REJECT', doc.id, `${Schema.label('DOC_TYPES', doc.doc_type)}${approve ? '' : ` · ${note}`}`, now);
        const application = findById(db.applications, doc.application_id);
        if (approve && application && application.status === 'DOCS_REQUIRED' && allRequiredDocsVerified(db, application, now)) {
            transitionApplication(db, application.id, 'DOCS_VERIFIED', 'system', now);
        }
        return done({ doc, application });
    }

    // 채용 확정 후 사업주 보관용 다운로드 1회 (§3.7)
    function ownerDownloadDocs(db, applicationId, actor, now = new Date()) {
        const application = findById(db.applications, applicationId);
        if (!application) return fail('NOT_FOUND', '지원 내역을 찾을 수 없어요');
        if (application.status !== 'HIRED') return fail('INVALID_STATE', '채용 확정 후에 받을 수 있어요');
        if (application.docs_downloaded_at) return fail('ALREADY_DOWNLOADED', '서류 다운로드는 1회만 제공돼요');
        application.docs_downloaded_at = toIso(now);
        appendAudit(db, actor, 'DOC_DOWNLOAD', application.id, '사업주 보관용 1회 다운로드', now);
        return done({ application });
    }

    // ───────────── 배치 ─────────────

    // 불성사 30일 경과 서류 자동 파기 (§8 P0)
    function runDocPurge(db, now = new Date(), actor = 'system') {
        const targets = db.minorDocs.filter(doc => doc.status !== 'PURGED' && doc.purge_at && new Date(doc.purge_at) <= now);
        targets.forEach(doc => {
            doc.status = 'PURGED';
            doc.storage_token = null;
            doc.file_label = null;
            doc.purged_at = toIso(now);
        });
        db.batchLog.push({ type: 'DOC_PURGE', at: toIso(now), count: targets.length, targets: targets.map(doc => doc.id) });
        appendAudit(db, actor, 'BATCH_DOC_PURGE', `${targets.length}건`, targets.map(doc => doc.id).join(', '), now);
        return done({ count: targets.length, purged: targets.map(doc => doc.id) });
    }

    // 매년 1월 1일 최저임금 미달 공고 일괄 정지 후 사업주 재확인 요청 (§3.1)
    function runMinimumWageBatch(db, now = new Date(), actor = 'system') {
        const minimumWage = Legal.getMinimumWage(now);
        const targets = db.postings.filter(posting => posting.status === 'OPEN' && posting.hourly_wage < minimumWage);
        targets.forEach(posting => {
            closePostingInternal(db, posting, 'MIN_WAGE_REVIEW', now);
            db.notices.push({
                id: newId('notice'),
                shop_id: posting.shop_id,
                at: toIso(now),
                message: `${now.getFullYear()}년 최저임금(${minimumWage.toLocaleString()}원)보다 낮아 '${posting.title}' 공고를 멈췄어요. 시급을 고친 뒤 다시 게시해 주세요.`
            });
        });
        db.batchLog.push({ type: 'MIN_WAGE', at: toIso(now), count: targets.length, targets: targets.map(posting => posting.id) });
        appendAudit(db, actor, 'BATCH_MIN_WAGE', `${targets.length}건`, `기준 ${minimumWage.toLocaleString()}원`, now);
        return done({ count: targets.length, minimumWage });
    }

    // ───────────── 어드민 ─────────────

    function updateMatchingConfig(db, patch, actor, now = new Date()) {
        const next = Matching.mergeConfig(db.config.matching);
        const apply = (target, source) => {
            Object.entries(source || {}).forEach(([key, value]) => {
                if (value && typeof value === 'object') apply(target[key] = { ...target[key] }, value);
                else if (Number.isFinite(Number(value)) && Number(value) >= 0 && key in target) target[key] = Number(value);
            });
        };
        apply(next, patch);
        db.config.matching = next;
        appendAudit(db, actor, 'CONFIG_MATCHING', 'matching', JSON.stringify(patch), now);
        return done({ config: next });
    }

    // 컴플라이언스 대시보드 (§8 P0) — 저장된 데이터에서 위반을 다시 계산
    function computeCompliance(db, now = new Date()) {
        const minimumWage = Legal.getMinimumWage(now);
        const violations = [];
        const shopName = id => (findById(db.shops, id) || {}).name || '알 수 없는 매장';
        db.postings
            .filter(posting => posting.status === 'OPEN' && posting.hourly_wage < minimumWage)
            .forEach(posting => violations.push({ type: 'MIN_WAGE', title: '최저임금 미달 공고', detail: `${shopName(posting.shop_id)} · ${posting.title} · ${posting.hourly_wage.toLocaleString()}원` }));
        db.applications.forEach(application => {
            const worker = findById(db.workers, application.worker_id);
            const posting = findById(db.postings, application.posting_id);
            if (!worker || !posting) return;
            const ageClass = ageClassOf(worker, now);
            if (!Legal.isMinorAgeClass(ageClass)) return;
            const reasons = Matching.legalBlockReasons(worker, posting, now);
            const detail = `${shopName(posting.shop_id)} · ${posting.title} · ${worker.name}`;
            if (application.status === 'HIRED') {
                if (reasons.length) violations.push({ type: 'MINOR_HOURS', title: '연소자 근무시간 위반', detail: `${detail} (${reasons.join(', ')})` });
                if (!allRequiredDocsVerified(db, application, now)) violations.push({ type: 'MINOR_DOCS', title: '서류 미확인 연소자 채용', detail });
            } else if (!['REJECTED', 'WITHDRAWN'].includes(application.status) && reasons.length) {
                violations.push({ type: 'MINOR_APPLY', title: '연소자 지원 제한 공고에 지원', detail });
            }
        });
        db.minorDocs
            .filter(doc => doc.status !== 'PURGED' && doc.purge_at && new Date(doc.purge_at) <= now)
            .forEach(doc => violations.push({ type: 'PURGE_OVERDUE', title: '파기 기한이 지난 서류', detail: `${Schema.label('DOC_TYPES', doc.doc_type)} · 기한 ${doc.purge_at.slice(0, 10)}` }));

        const minorDocApps = db.applications.filter(application => application.history.some(step => step.status === 'DOCS_REQUIRED'));
        const verifiedApps = minorDocApps.filter(application => application.history.some(step => step.status === 'DOCS_VERIFIED'));
        const hired = db.applications.filter(application => application.status === 'HIRED');
        const stats = {
            shopsActive: db.shops.filter(shop => shop.status === 'ACTIVE').length,
            shopsPending: db.shops.filter(shop => shop.status === 'PENDING').length,
            postingsOpen: db.postings.filter(posting => posting.status === 'OPEN').length,
            hires: hired.length,
            minorHires: hired.filter(application => isMinorWorker(findById(db.workers, application.worker_id), now)).length,
            minorDocRate: minorDocApps.length ? Math.round((verifiedApps.length / minorDocApps.length) * 100) : null
        };
        return { violations, stats, minimumWage };
    }

    const api = {
        TRANSITIONS, appendAudit, ageClassOf, isMinorWorker, requiredDocTypes, latestDocs,
        setBirthDate, updateWorkerProfile,
        validateShop, registerShop, reviewShop,
        validatePosting, createPosting, closePosting, reopenPosting, saveTemplate,
        applyToPosting, getHireChecklist, setChecklistItem, transitionApplication,
        describeFile, recordDocUpload, viewDoc, reviewDoc, ownerDownloadDocs,
        runDocPurge, runMinimumWageBatch, updateMatchingConfig, computeCompliance
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Workflow = api;
})(typeof window !== 'undefined' ? window : globalThis);
