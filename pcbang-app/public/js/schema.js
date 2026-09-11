/*
 * 데이터 모델 enum과 화면 표시용 이름 (명세서 §5)
 * 자유 텍스트 대신 enum으로 구조화해야 매칭·필터·통계가 가능하다.
 */
(function (root) {
    'use strict';

    const Schema = {
        POS_PROGRAMS: { GETO: '게토', PICA: '피카', MEDIAWEB: '미디어웹', IZONE: '아이존', PCMATE: 'PC메이트', ETC: '기타' },
        POS_LEVELS: { EXPERIENCED: '경험 있음', SOLO_OPERATE: '혼자 운영 가능', CONFIGURE: '설정·문제 해결 가능' },
        COOK_MENUS: { RAMEN: '라면', FROZEN: '냉동식품', RICE_BOWL: '덮밥', SNACK_BAR: '분식', BEVERAGE: '음료', COFFEE: '커피', DESSERT: '디저트' },
        PC_SKILLS: { REBOOT_UPDATE: '재부팅·업데이트', PERIPHERAL_SWAP: '주변기기 교체', NETWORK: '네트워크 점검', ASSEMBLY: 'PC 조립', OS_REINSTALL: '운영체제 재설치' },
        OPS_EXPERIENCES: {
            ID_CHECK: '청소년 신분증 확인',
            CURFEW_ENFORCE: '22시 청소년 귀가 안내',
            TROUBLE_CUSTOMER: '어려운 손님 응대',
            CLOSING_SETTLE: '마감 정산',
            OPENING: '오픈 준비',
            INVENTORY: '발주·재고'
        },
        // 운영 경험 ↔ 공고 업무 대응 (§9.2 교집합 계산용)
        OPS_TO_DUTY: { ID_CHECK: 'ID_CHECK', INVENTORY: 'INVENTORY', OPENING: 'OPENING', CLOSING_SETTLE: 'CLOSING' },
        SHIFT_TYPES: { DAY: '주간', EVENING: '저녁', NIGHT: '야간', ROTATING: '교대' },
        EMPLOYMENT_TYPES: { LONG_TERM: '장기 (월간)', SHORT_TERM: '단기', SPOT: '스팟' },
        DAYS: { MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', SUN: '일' },
        WEEKDAYS: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        WEEKEND: ['SAT', 'SUN'],
        TIME_BLOCKS: { MORNING: '오전 06~12', AFTERNOON: '오후 12~18', EVENING: '저녁 18~22', NIGHT: '야간 22~06' },
        DUTIES: { COUNTER: '카운터', COOKING: '조리', CLEANING: '청소', PC_SUPPORT: 'PC 대응', ID_CHECK: '신분증 확인', INVENTORY: '재고 관리', OPENING: '오픈', CLOSING: '마감' },
        CLEAN_SCOPE: { FLOOR: '바닥', TOILET: '화장실', SMOKING_BOOTH: '흡연부스', KITCHEN: '주방', PC_CLEANING: 'PC 청소', TRASH: '쓰레기' },
        STRENGTHS: [
            '지각한 적 없음', '마감까지 책임짐', '청소 꼼꼼함', '손님 응대 능숙',
            '게임 지식 많음', '조리 빠름', 'PC 문제 직접 해결', '장기 근무 희망',
            '급한 대타 가능', '혼자 근무 익숙', '인수인계 잘함', '컴플레인 침착 대응'
        ],
        BUSINESS_TYPES: { pcbang: 'PC방', cafe: '카페', comic: '만화방', cvs: '편의점', delivery: '배송/물류', noodle: '라면집' },
        APPLICATION_STATUS: {
            APPLIED: '지원 완료',
            VIEWED: '매장이 확인했어요',
            INTERVIEW: '면접 진행',
            DOCS_REQUIRED: '서류 필요',
            DOCS_VERIFIED: '서류 확인 완료',
            HIRED: '채용 확정',
            REJECTED: '이번엔 함께하기 어려워요',
            WITHDRAWN: '지원 취소'
        },
        POSTING_STATUS: { DRAFT: '임시 저장', VALIDATED: '검증 완료', OPEN: '모집 중', CLOSED: '마감', FILLED: '채용 완료' },
        SHOP_STATUS: { PENDING: '승인 대기', ACTIVE: '운영 중', SUSPENDED: '정지', REJECTED: '반려' },
        DOC_TYPES: { FAMILY_CERT: '가족관계증명서', GUARDIAN_CONSENT: '친권자(후견인) 동의서', WORK_PERMIT: '취직인허증' },
        DOC_STATUS: { UPLOADED: '확인 대기 중', VERIFIED: '확인 완료', REJECTED: '반려됨', PURGED: '파기됨' },
        CLOSED_REASONS: { OWNER_CLOSED: '사장님이 마감', MIN_WAGE_REVIEW: '최저임금 재확인 필요', SHOP_SUSPENDED: '매장 정지' }
    };

    Schema.label = (group, key) => (Schema[group] && Schema[group][key]) || key || '';

    if (typeof module !== 'undefined' && module.exports) module.exports = Schema;
    else root.Schema = Schema;
})(typeof window !== 'undefined' ? window : globalThis);
