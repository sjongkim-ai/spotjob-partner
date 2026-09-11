/*
 * 데모 데이터 — 세 앱(파트너·사장님·어드민)이 같은 흐름을 이어서 볼 수 있게 채워 둔다.
 * 날짜는 모두 "오늘" 기준 상대값. 실제 개인 정보가 아닌 가상의 인물·매장이다.
 */
(function (root) {
    'use strict';

    const Legal = root.Legal || require('./legal.js');
    const Matching = root.Matching || require('./matching.js');

    function createSeedData(now = new Date()) {
        const at = days => new Date(now.getTime() + (days * 86400000)).toISOString();
        const everyDay = blocks => ({ MON: blocks, TUE: blocks, WED: blocks, THU: blocks, FRI: blocks, SAT: blocks, SUN: blocks });
        const history = steps => steps.map(([status, days]) => ({ status, at: at(days) }));
        const pcShopDefaults = {
            biz_verified: false, biz_check: 'FORMAT_OK', business_type: 'pcbang', is_franchise: false, franchise_brand: null,
            insurance_established: true, meal_provided: true, free_pc_use: true, night_allowance: true, minor_ready: false
        };

        const shops = [
            {
                ...pcShopDefaults, id: 'shop-gangnam', owner: 'owner-demo', name: '강남 PC방', biz_reg_no: '123-45-67891',
                address: '서울 강남구 테헤란로 123', location_description: '역삼역 3번 출구에서 도보 3분, 1층 편의점 옆 계단으로 내려오세요.',
                geo: { lat: 37.5006, lng: 127.0364 }, floor: '지하 1층', seat_count: 80, is_24h: true, pos_program: 'GETO',
                night_solo: true, staff_per_shift: 1, smoking_booth_clean: true, cook_menu_count: 12,
                clean_scope: ['FLOOR', 'TOILET', 'SMOKING_BOOTH', 'KITCHEN', 'PC_CLEANING', 'TRASH'],
                hires_minor: true, minor_ready: true, phone: '02-555-0123', verified_at: at(-20), status: 'ACTIVE', created_at: at(-21)
            },
            {
                ...pcShopDefaults, id: 'shop-yeoksam-cafe', owner: 'owner-cafe', name: '역삼 카페', biz_reg_no: '456-78-90121', business_type: 'cafe',
                address: '서울 강남구 역삼로 180', location_description: '역삼역 1번 출구에서 도보 6분, 1층이에요.',
                geo: { lat: 37.4957, lng: 127.0410 }, floor: '1층', seat_count: 30, is_24h: true, pos_program: 'ETC',
                night_solo: true, staff_per_shift: 1, smoking_booth_clean: false, cook_menu_count: 20, clean_scope: ['FLOOR', 'KITCHEN', 'TRASH'],
                free_pc_use: false, hires_minor: false, phone: '02-555-0456', verified_at: at(-30), status: 'ACTIVE', created_at: at(-31)
            },
            {
                ...pcShopDefaults, id: 'shop-gangnam-cu', owner: 'owner-cu', name: '강남역 CU', biz_reg_no: '567-89-01230', business_type: 'cvs',
                address: '서울 강남구 강남대로 390', location_description: '강남역 11번 출구 바로 앞이에요.',
                geo: { lat: 37.4990, lng: 127.0290 }, floor: '1층', seat_count: 1, is_24h: true, pos_program: 'ETC',
                night_solo: true, staff_per_shift: 1, smoking_booth_clean: false, cook_menu_count: 0, clean_scope: ['FLOOR', 'TRASH'],
                meal_provided: false, free_pc_use: false, night_allowance: true, hires_minor: true, phone: '02-555-0789',
                verified_at: at(-40), status: 'ACTIVE', created_at: at(-41)
            },
            {
                ...pcShopDefaults, id: 'shop-myeongdong', owner: 'owner-md', name: '명동 PC방', biz_reg_no: '234-56-78904',
                address: '서울 중구 명동길 28', location_description: '명동역 8번 출구에서 도보 4분, 3층이에요.',
                geo: { lat: 37.5636, lng: 126.9850 }, floor: '3층', seat_count: 120, is_24h: true, pos_program: 'PICA',
                night_solo: false, staff_per_shift: 2, smoking_booth_clean: false, cook_menu_count: 25,
                clean_scope: ['FLOOR', 'TOILET', 'PC_CLEANING'], hires_minor: false, phone: '02-777-0101',
                verified_at: null, status: 'PENDING', created_at: at(-3)
            },
            {
                // 검증번호가 틀린 신청 — 어드민 승인 화면에서 경고 확인용
                ...pcShopDefaults, id: 'shop-seocho', owner: 'owner-sc', name: '서초 PC방', biz_reg_no: '345-67-89010', biz_check: 'FORMAT_INVALID',
                address: '서울 서초구 서초대로 77', location_description: '', geo: { lat: 37.4837, lng: 127.0324 }, floor: '2층',
                seat_count: 60, is_24h: false, pos_program: 'GETO', night_solo: false, staff_per_shift: 1, smoking_booth_clean: true,
                cook_menu_count: 8, clean_scope: ['FLOOR', 'SMOKING_BOOTH'], hires_minor: true, phone: '02-588-0202',
                verified_at: null, status: 'PENDING', created_at: at(-1)
            }
        ];

        const posting = (fields) => {
            const created = at(fields.createdDaysAgo || -5);
            const { createdDaysAgo, ...rest } = fields;
            return {
                required_pos: null, urgent: null, closed_reason: null, status: 'OPEN',
                status_history: [{ status: 'DRAFT', at: created }, { status: 'VALIDATED', at: created }, { status: 'OPEN', at: created }],
                created_at: created,
                ...rest,
                minor_allowed: Legal.isPostingAllowedForMinor(rest.shift_start, rest.shift_end, rest.work_days)
            };
        };

        const postings = [
            posting({ id: 'post-gangnam-weekend', shop_id: 'shop-gangnam', business_type: 'pcbang', employment_type: 'SHORT_TERM', title: '주말 낮 카운터',
                shift_start: '10:00', shift_end: '17:00', work_days: ['SAT', 'SUN'], hourly_wage: 10500, headcount: 1, duties: ['COUNTER', 'CLEANING', 'COOKING'], createdDaysAgo: -6 }),
            posting({ id: 'post-gangnam-night', shop_id: 'shop-gangnam', business_type: 'pcbang', employment_type: 'LONG_TERM', title: '야간 카운터 (장기)',
                shift_start: '22:00', shift_end: '07:00', work_days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], hourly_wage: 12000, headcount: 1,
                duties: ['COUNTER', 'CLEANING', 'PC_SUPPORT', 'CLOSING', 'ID_CHECK'], required_pos: 'GETO', createdDaysAgo: -4 }),
            posting({ id: 'post-gangnam-day', shop_id: 'shop-gangnam', business_type: 'pcbang', employment_type: 'LONG_TERM', title: '평일 주간 카운터',
                shift_start: '09:00', shift_end: '18:00', work_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], hourly_wage: 10320, headcount: 1,
                duties: ['COUNTER', 'COOKING', 'CLEANING', 'ID_CHECK', 'OPENING'], createdDaysAgo: -3 }),
            posting({ id: 'post-cafe-night', shop_id: 'shop-yeoksam-cafe', business_type: 'cafe', employment_type: 'SPOT', title: '주말 심야 스팟',
                shift_start: '22:00', shift_end: '07:00', work_days: ['SAT', 'SUN'], hourly_wage: 10500, headcount: 1, duties: ['COUNTER', 'CLEANING'],
                urgent: { extra_pay: 20000, deadline: '오늘 22:00까지' }, createdDaysAgo: -1 }),
            posting({ id: 'post-cu-spot', shop_id: 'shop-gangnam-cu', business_type: 'cvs', employment_type: 'SPOT', title: '오후 스팟',
                shift_start: '14:00', shift_end: '22:00', work_days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], hourly_wage: 10320, headcount: 2,
                duties: ['COUNTER', 'INVENTORY'], urgent: { extra_pay: 10000, deadline: '오늘 18:00까지' }, createdDaysAgo: -1 })
        ];

        const emptyWorker = {
            gender: null, total_months: null, work_histories: [], pos_skills: [], cook_menus: [], cook_equipment_clean: null,
            cook_menu_count: null, pc_skills: [], ops_experiences: [], night_available: null, available_slots: {},
            max_consecutive_nights: null, preferred_type: [], strengths: [], intro_text: '', commute_radius_km: 5
        };

        const workers = [
            { ...emptyWorker, id: 'me', name: '나', birth_date: null, home_geo: { lat: 37.4979, lng: 127.0276 } },
            {
                ...emptyWorker, id: 'w-kim', name: '김철수', birth_date: '2000-03-14', home_geo: { lat: 37.5045, lng: 127.0490 },
                total_months: 36,
                work_histories: [{ id: 'wh-kim-1', shop_name: '역삼 스타PC', shop_id: null, period_from: '2023-06-01', period_to: '2026-06-30', shift_type: 'NIGHT', verified: true, verified_at: at(-60) }],
                pos_skills: [{ program: 'GETO', level: 'CONFIGURE' }, { program: 'PICA', level: 'EXPERIENCED' }],
                cook_menus: ['RAMEN', 'FROZEN', 'RICE_BOWL', 'BEVERAGE'], cook_equipment_clean: true, cook_menu_count: 10,
                pc_skills: ['REBOOT_UPDATE', 'PERIPHERAL_SWAP', 'NETWORK'],
                ops_experiences: ['ID_CHECK', 'CURFEW_ENFORCE', 'TROUBLE_CUSTOMER', 'CLOSING_SETTLE', 'OPENING'],
                night_available: true, available_slots: everyDay(['AFTERNOON', 'EVENING', 'NIGHT']), max_consecutive_nights: 5,
                preferred_type: ['LONG_TERM'], strengths: ['마감까지 책임짐', '혼자 근무 익숙', 'PC 문제 직접 해결'],
                intro_text: '야간 3년 경험이 있어요. 게토 설정과 마감 정산까지 혼자 할 수 있어요.'
            },
            {
                ...emptyWorker, id: 'w-park', name: '박영호', birth_date: '1995-01-08', home_geo: { lat: 37.4890, lng: 127.0320 },
                total_months: 14,
                work_histories: [{ id: 'wh-park-1', shop_name: '서초 게임존', shop_id: null, period_from: '2024-01-01', period_to: '2025-02-28', shift_type: 'ROTATING', verified: false, verified_at: null }],
                pos_skills: [{ program: 'PICA', level: 'SOLO_OPERATE' }],
                cook_menus: ['RAMEN'], pc_skills: ['REBOOT_UPDATE'], ops_experiences: ['TROUBLE_CUSTOMER', 'CLOSING_SETTLE'],
                night_available: true, available_slots: everyDay(['NIGHT']), max_consecutive_nights: 3,
                preferred_type: ['LONG_TERM', 'SHORT_TERM'], strengths: ['손님 응대 능숙']
            },
            {
                ...emptyWorker, id: 'w-lee', name: '이민지', birth_date: '2009-05-20', home_geo: { lat: 37.5110, lng: 127.0215 },
                total_months: 0, cook_menus: ['BEVERAGE'], night_available: false,
                available_slots: { SAT: ['MORNING', 'AFTERNOON'], SUN: ['MORNING', 'AFTERNOON'] },
                preferred_type: ['SHORT_TERM'], strengths: ['지각한 적 없음', '청소 꼼꼼함', '장기 근무 희망'],
                intro_text: '주말 낮에만 일할 수 있어요. 처음이지만 꼼꼼하게 배울게요.'
            },
            {
                ...emptyWorker, id: 'w-choi', name: '최유나', birth_date: '2010-02-02', home_geo: { lat: 37.5020, lng: 127.0250 },
                total_months: 0, night_available: false, available_slots: { SAT: ['AFTERNOON'] }, preferred_type: ['SHORT_TERM'], strengths: ['청소 꼼꼼함']
            }
        ];

        const application = (fields) => ({
            checklist: { contract_written: false, direct_pay: false }, docs_downloaded_at: null, decided_at: null, ...fields,
            applied_at: fields.history[0].at, updated_at: fields.history[fields.history.length - 1].at
        });

        const applications = [
            application({ id: 'app-kim-night', posting_id: 'post-gangnam-night', worker_id: 'w-kim', status: 'APPLIED', history: history([['APPLIED', -2]]) }),
            application({ id: 'app-park-night', posting_id: 'post-gangnam-night', worker_id: 'w-park', status: 'VIEWED', history: history([['APPLIED', -3], ['VIEWED', -1]]) }),
            application({ id: 'app-kim-weekend', posting_id: 'post-gangnam-weekend', worker_id: 'w-kim', status: 'APPLIED', history: history([['APPLIED', -1]]) }),
            application({ id: 'app-lee-weekend', posting_id: 'post-gangnam-weekend', worker_id: 'w-lee', status: 'DOCS_REQUIRED',
                history: history([['APPLIED', -4], ['VIEWED', -3], ['INTERVIEW', -2], ['DOCS_REQUIRED', -2]]) }),
            application({ id: 'app-choi-old', posting_id: 'post-gangnam-weekend', worker_id: 'w-choi', status: 'REJECTED', decided_at: at(-40),
                history: history([['APPLIED', -48], ['VIEWED', -47], ['INTERVIEW', -46], ['DOCS_REQUIRED', -46], ['REJECTED', -40]]) })
        ];

        const doc = (fields) => ({
            storage_token: `vault://minor-docs/seed-${fields.id}`, file_label: 'jpg · 1.2MB', status: 'UPLOADED',
            verified_by: null, verified_at: null, reject_reason: null, purge_at: null, purged_at: null, ...fields
        });

        const minorDocs = [
            doc({ id: 'doc-lee-family', application_id: 'app-lee-weekend', doc_type: 'FAMILY_CERT', uploaded_at: at(-1) }),
            doc({ id: 'doc-lee-consent', application_id: 'app-lee-weekend', doc_type: 'GUARDIAN_CONSENT', uploaded_at: at(-1), file_label: 'pdf · 340KB' }),
            // 불성사 후 30일이 지난 서류 — 파기 배치 확인용
            doc({ id: 'doc-choi-family', application_id: 'app-choi-old', doc_type: 'FAMILY_CERT', uploaded_at: at(-45), purge_at: at(-10) })
        ];

        const auditLog = [
            { seq: 1, at: at(-20), actor: 'admin', action: 'SHOP_APPROVE', target: 'shop-gangnam', detail: '강남 PC방' },
            { seq: 2, at: at(-1), actor: 'worker:w-lee', action: 'DOC_UPLOAD', target: 'doc-lee-family', detail: '가족관계증명서' },
            { seq: 3, at: at(-1), actor: 'worker:w-lee', action: 'DOC_UPLOAD', target: 'doc-lee-consent', detail: '친권자(후견인) 동의서' }
        ];

        const templates = [{
            id: 'tpl-weekend', shop_id: 'shop-gangnam', name: '주말 낮 기본', created_at: at(-6),
            draft: { employment_type: 'SHORT_TERM', title: '주말 낮 카운터', shift_start: '10:00', shift_end: '17:00', work_days: ['SAT', 'SUN'],
                hourly_wage: 10500, headcount: 1, duties: ['COUNTER', 'CLEANING', 'COOKING'], required_pos: null, urgent: null }
        }];

        return {
            version: 1,
            shops, postings, workers, applications, minorDocs, auditLog, templates,
            batchLog: [],
            notices: [],
            config: { matching: JSON.parse(JSON.stringify(Matching.DEFAULT_MATCHING_CONFIG)) },
            session: { ownerShopId: 'shop-gangnam', meWorkerId: 'me', selectedPostingId: null, ownerPostingId: 'post-gangnam-weekend', selectedApplicationId: null }
        };
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { createSeedData };
    else root.Seed = { createSeedData };
})(typeof window !== 'undefined' ? window : globalThis);
