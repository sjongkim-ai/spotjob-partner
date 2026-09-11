/*
 * 매칭 로직 (명세서 §9) — 자동 배정이 아니라 정렬과 필터. 최종 결정은 항상 사장님 (§3.5)
 */
(function (root) {
    'use strict';

    const Legal = root.Legal || require('./legal.js');
    const Schema = root.Schema || require('./schema.js');

    // 가중치 — 실사용 데이터 100건 전까지는 전부 가설. 어드민에서 조정하고 채용 결과와 비교한다 (§9.2)
    const DEFAULT_MATCHING_CONFIG = {
        posLevel: { EXPERIENCED: 20, SOLO_OPERATE: 35, CONFIGURE: 45 },
        nightBase: 30,
        nightPerConsecutive: 2,
        nightConsecutiveCap: 5,
        perDutyMatch: 8,
        idCheckBonus: 10,
        perCookMenu: 4,
        cookMenuCap: 5,
        perCareerMonth: 0.5,
        careerMonthCap: 24,
        perVerifiedHistory: 10,
        distanceBase: 15,
        distancePerKm: 3
    };

    // 22:00~06:00 야간 구간 (이틀치 타임라인 기준)
    const NIGHT_WINDOWS = [[0, 360], [1320, 1800], [2760, 3240]];

    function isNightShift(start, end) {
        if (!start || !end) return false;
        const startMinutes = Legal.timeToMinutes(start);
        const endMinutes = startMinutes + Legal.shiftMinutes(start, end);
        return NIGHT_WINDOWS.some(([windowStart, windowEnd]) => startMinutes < windowEnd && endMinutes > windowStart);
    }

    function distanceKm(from, to) {
        if (!from || !to) return null;
        const toRad = value => value * Math.PI / 180;
        const dLat = toRad(to.lat - from.lat);
        const dLng = toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * 6371 * Math.asin(Math.sqrt(a));
    }

    function hasAnySlot(slots) {
        return Boolean(slots) && Object.values(slots).some(blocks => Array.isArray(blocks) && blocks.length > 0);
    }

    // 요일 가능 여부. 아직 입력하지 않았으면 제외하지 않음
    function daysOverlap(slots, workDays) {
        if (!hasAnySlot(slots)) return true;
        return (workDays || []).some(day => (slots[day] || []).length > 0);
    }

    function workerAgeClass(worker, today = new Date()) {
        const age = Legal.calculateAge(worker && worker.birth_date, today);
        return Number.isNaN(age) || age < 0 ? null : Legal.getAgeClass(age);
    }

    // 법적으로 막아야 하는 사유만 (지원 시점 서버 검증용)
    function legalBlockReasons(worker, posting, today = new Date()) {
        const ageClass = workerAgeClass(worker, today);
        if (ageClass === 'MINOR_UNDER_15' && !Legal.FEATURE_FLAGS.workPermitApplications) {
            return ['만 15세 미만은 취직인허증 발급 후 지원할 수 있어요'];
        }
        if (Legal.isMinorAgeClass(ageClass)) {
            return Legal.getMinorBlockReasons(posting.shift_start, posting.shift_end, posting.work_days);
        }
        return [];
    }

    // §9.1 하드 필터 — 하나라도 걸리면 목록에서 제외
    function hardFilter(worker, posting, shop, today = new Date()) {
        const ageClass = workerAgeClass(worker, today);
        const reasons = legalBlockReasons(worker, posting, today);
        const nightAvailable = Legal.isMinorAgeClass(ageClass) ? false : worker.night_available;
        if (isNightShift(posting.shift_start, posting.shift_end) && nightAvailable === false) reasons.push('야간 근무 공고예요');
        const distance = distanceKm(worker.home_geo, shop && shop.geo);
        const radius = worker.commute_radius_km;
        if (distance !== null && radius && distance > radius) reasons.push(`통근 가능 거리 ${radius}km보다 멀어요`);
        if (!daysOverlap(worker.available_slots, posting.work_days)) reasons.push('가능한 요일과 겹치지 않아요');
        return { include: reasons.length === 0, reasons, ageClass, distanceKm: distance };
    }

    function mergeConfig(config) {
        const custom = config || {};
        return { ...DEFAULT_MATCHING_CONFIG, ...custom, posLevel: { ...DEFAULT_MATCHING_CONFIG.posLevel, ...(custom.posLevel || {}) } };
    }

    // §9.2 적합도 점수 (사장님 화면 정렬용). breakdown으로 왜 이 점수인지 보여준다
    function scoreApplicant(worker, posting, shop, config) {
        const weights = mergeConfig(config);
        const breakdown = [];
        const add = (label, points) => {
            if (points) breakdown.push({ label, points: Math.round(points * 10) / 10 });
        };

        const program = posting.required_pos || (shop && shop.pos_program);
        const skill = (worker.pos_skills || []).find(item => item.program === program);
        if (skill) add(`${Schema.label('POS_PROGRAMS', program)} ${Schema.label('POS_LEVELS', skill.level)}`, weights.posLevel[skill.level] || 0);

        if (isNightShift(posting.shift_start, posting.shift_end) && worker.night_available) {
            add('야간 가능', weights.nightBase);
            add('연속 야간 가능 일수', Math.min(worker.max_consecutive_nights || 0, weights.nightConsecutiveCap) * weights.nightPerConsecutive);
        }

        const duties = posting.duties || [];
        const ops = worker.ops_experiences || [];
        const matched = ops.filter(op => duties.includes(Schema.OPS_TO_DUTY[op]));
        add(`업무와 맞는 운영 경험 ${matched.length}개`, matched.length * weights.perDutyMatch);
        if (ops.includes('ID_CHECK')) add('청소년 신분증 확인 경험', weights.idCheckBonus);

        if (duties.includes('COOKING')) {
            add('조리 가능 메뉴', Math.min((worker.cook_menus || []).length, weights.cookMenuCap) * weights.perCookMenu);
        }

        add(`PC방 경력 ${worker.total_months || 0}개월`, Math.min(worker.total_months || 0, weights.careerMonthCap) * weights.perCareerMonth);
        const verified = (worker.work_histories || []).filter(history => history.verified).length;
        add(`인증된 경력 ${verified}건`, verified * weights.perVerifiedHistory);

        const distance = distanceKm(worker.home_geo, shop && shop.geo);
        if (distance !== null) add(`거리 ${distance.toFixed(1)}km`, Math.max(0, weights.distanceBase - (distance * weights.distancePerKm)));

        const score = Math.round(breakdown.reduce((total, item) => total + item.points, 0) * 10) / 10;
        return { score, breakdown };
    }

    // 프로필 완성도 (§6 P0 · 성공 지표 "프로그램 항목 입력률")
    const PROFILE_CHECKS = [
        ['생년월일', worker => Boolean(worker.birth_date)],
        ['PC방 경력', worker => Number.isFinite(worker.total_months)],
        ['좌석관리 프로그램', worker => (worker.pos_skills || []).length > 0],
        ['조리·PC 대응', worker => ((worker.cook_menus || []).length + (worker.pc_skills || []).length) > 0],
        ['운영 경험', worker => (worker.ops_experiences || []).length > 0],
        ['야간 가능 여부', worker => typeof worker.night_available === 'boolean'],
        ['가능한 요일·시간', worker => hasAnySlot(worker.available_slots)],
        ['희망 근무 형태', worker => (worker.preferred_type || []).length > 0],
        ['강점 태그', worker => (worker.strengths || []).length > 0]
    ];

    function profileCompleteness(worker) {
        const missing = PROFILE_CHECKS.filter(([, check]) => !check(worker)).map(([label]) => label);
        const percent = Math.round(((PROFILE_CHECKS.length - missing.length) / PROFILE_CHECKS.length) * 100);
        return { percent, missing };
    }

    const api = {
        DEFAULT_MATCHING_CONFIG, isNightShift, distanceKm, hasAnySlot, daysOverlap, workerAgeClass,
        legalBlockReasons, hardFilter, mergeConfig, scoreApplicant, profileCompleteness
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Matching = api;
})(typeof window !== 'undefined' ? window : globalThis);
