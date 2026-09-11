/*
 * 법령 수치와 판정 규칙 (명세서 §3, §10, §13)
 * - 법령 수치는 이 파일에서만 관리한다 (§0 하드코딩 금지). 백엔드 도입 시 config/legal.ts로 옮긴다.
 * - 브라우저에서는 전역(window.Legal 및 개별 함수)으로, node 테스트에서는 module.exports로 쓴다.
 */
(function (root) {
    'use strict';

    const LEGAL_CONFIG = {
        minimumWage: { 2026: 10320, 2027: 10700 },
        minor: {
            adultAge: 18,
            workPermitAge: 15,          // 만 15세 미만은 취직인허증 필요 → MVP에서는 지원 차단 (§10.3)
            allowedStart: '09:00',      // PC방 청소년 출입 허용 시간과 동일 (§3.2)
            allowedEnd: '22:00',
            baseDailyHours: 7,          // 1일 7시간 · 주 35시간이 원칙
            baseWeeklyHours: 35,
            agreedDailyHours: 8,        // 당사자 합의 시 1일 8시간 · 주 40시간까지
            agreedWeeklyHours: 40,
            requiredDocs: ['FAMILY_CERT', 'GUARDIAN_CONSENT']
        },
        minorDocPurgeDays: 30           // 채용 불성사 시 30일 후 자동 파기 (§3.7)
    };

    // §13 미해결 확인 항목 — 전문가 확인 전까지 꺼 둔다
    const FEATURE_FLAGS = {
        minorOvertimeAgreement: false,  // §13-5 앱 안의 동의를 연장 합의로 볼 수 있는지. 켜면 1일 8h · 주 40h
        workPermitApplications: false   // §10.3 만 15세 미만 취직인허증 지원 (P2)
    };

    function timeToMinutes(time) {
        const [hours, minutes] = String(time).split(':').map(Number);
        return (hours * 60) + minutes;
    }

    // 근무 시간 길이(분). 종료가 시작보다 이르면 다음 날 종료로 계산
    function shiftMinutes(start, end) {
        const startMinutes = timeToMinutes(start);
        let endMinutes = timeToMinutes(end);
        if (endMinutes <= startMinutes) endMinutes += 1440;
        return endMinutes - startMinutes;
    }

    // 만 나이. 형식이 잘못되면 NaN, 미래 날짜면 음수
    function calculateAge(birthDateString, today = new Date()) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDateString || ''));
        if (!match) return NaN;
        const [, year, month, day] = match.map(Number);
        let age = today.getFullYear() - year;
        const monthDiff = (today.getMonth() + 1) - month;
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age--;
        return age;
    }

    function getMinimumWage(date = new Date()) {
        const years = Object.keys(LEGAL_CONFIG.minimumWage).map(Number).sort((a, b) => a - b);
        const applicable = years.filter(year => year <= date.getFullYear()).pop() ?? years[0];
        return LEGAL_CONFIG.minimumWage[applicable];
    }

    function getUpcomingMinimumWage(date = new Date()) {
        const nextYear = date.getFullYear() + 1;
        const wage = LEGAL_CONFIG.minimumWage[nextYear];
        return wage && wage > getMinimumWage(date) ? { year: nextYear, wage } : null;
    }

    function getAgeClass(age) {
        if (age >= LEGAL_CONFIG.minor.adultAge) return 'ADULT';
        if (age >= LEGAL_CONFIG.minor.workPermitAge) return 'MINOR_15_17';
        return 'MINOR_UNDER_15';
    }

    function isMinorAgeClass(ageClass) {
        return ageClass === 'MINOR_15_17' || ageClass === 'MINOR_UNDER_15';
    }

    function getMinorHourLimits() {
        const minor = LEGAL_CONFIG.minor;
        return FEATURE_FLAGS.minorOvertimeAgreement
            ? { daily: minor.agreedDailyHours, weekly: minor.agreedWeeklyHours }
            : { daily: minor.baseDailyHours, weekly: minor.baseWeeklyHours };
    }

    // 만 18세 미만에게 보여줄 수 없는 이유 목록. 빈 배열이면 허용
    // workDays(요일 배열)를 주면 주간 한도까지 확인
    function getMinorBlockReasons(start, end, workDays) {
        if (!start || !end) return ['근무 시간이 입력되지 않았어요'];
        const { allowedStart, allowedEnd } = LEGAL_CONFIG.minor;
        const limits = getMinorHourLimits();
        const startMinutes = timeToMinutes(start);
        const endMinutes = timeToMinutes(end);
        if (endMinutes <= startMinutes) return ['자정을 넘기는 근무예요'];
        const reasons = [];
        if (startMinutes < timeToMinutes(allowedStart)) reasons.push(`${allowedStart} 이전에 시작해요`);
        if (endMinutes > timeToMinutes(allowedEnd)) reasons.push(`${allowedEnd} 이후에 끝나요`);
        const dailyHours = (endMinutes - startMinutes) / 60;
        if (dailyHours > limits.daily) reasons.push(`하루 ${limits.daily}시간을 넘어요`);
        if (Array.isArray(workDays) && dailyHours * workDays.length > limits.weekly) reasons.push(`주 ${limits.weekly}시간을 넘어요`);
        return reasons;
    }

    function isPostingAllowedForMinor(start, end, workDays) {
        return getMinorBlockReasons(start, end, workDays).length === 0;
    }

    // 사업자등록번호 형식·검증번호 확인. 실제 진위확인(국세청 API)은 서버 연동이 필요하다
    function normalizeBizRegNo(value) {
        return String(value || '').replace(/[^0-9]/g, '');
    }

    function isValidBizRegNo(value) {
        const digits = normalizeBizRegNo(value);
        if (digits.length !== 10) return false;
        const numbers = digits.split('').map(Number);
        const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
        let sum = weights.reduce((total, weight, index) => total + (numbers[index] * weight), 0);
        sum += Math.floor((numbers[8] * 5) / 10);
        return (10 - (sum % 10)) % 10 === numbers[9];
    }

    function formatBizRegNo(value) {
        const digits = normalizeBizRegNo(value).slice(0, 10);
        if (digits.length <= 3) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    }

    const api = {
        LEGAL_CONFIG, FEATURE_FLAGS,
        timeToMinutes, shiftMinutes, calculateAge,
        getMinimumWage, getUpcomingMinimumWage,
        getAgeClass, isMinorAgeClass, getMinorHourLimits, getMinorBlockReasons, isPostingAllowedForMinor,
        normalizeBizRegNo, isValidBizRegNo, formatBizRegNo
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.Legal = api;
        Object.assign(root, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
