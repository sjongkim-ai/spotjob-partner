// node로 법령·매칭·상태 전이 규칙 단위 테스트 (브라우저 없이)
// 실행: node pcbang-app/tests/rules.test.js
const path = require('path');
const assert = require('assert');
const dir = process.argv[2] || path.join(__dirname, '..', 'public', 'js');
const Legal = require(path.join(dir, 'legal.js'));
const Schema = require(path.join(dir, 'schema.js'));
const Matching = require(path.join(dir, 'matching.js'));
const Workflow = require(path.join(dir, 'workflow.js'));
const { createSeedData } = require(path.join(dir, 'seed.js'));

const results = [];
function test(name, fn) {
  try { fn(); results.push({ ok: true, name }); }
  catch (error) { results.push({ ok: false, name, error: error.message }); }
}
const NOW = new Date(2026, 8, 11, 12, 0, 0);   // 2026-09-11
const later = days => new Date(NOW.getTime() + days * 86400000);
const fresh = () => createSeedData(NOW);

// ── Legal ──
test('사업자번호 검증번호: 실제 공개 번호 2개 통과', () => {
  assert.strictEqual(Legal.isValidBizRegNo('220-81-62517'), true);
  assert.strictEqual(Legal.isValidBizRegNo('124-81-00998'), true);
});
test('사업자번호 검증번호: 틀린 번호 거부', () => {
  assert.strictEqual(Legal.isValidBizRegNo('123-45-67890'), false);
  assert.strictEqual(Legal.isValidBizRegNo('12345'), false);
});
test('시드 매장 사업자번호: 서초만 틀림', () => {
  const db = fresh();
  const invalid = db.shops.filter(s => !Legal.isValidBizRegNo(s.biz_reg_no)).map(s => s.id);
  assert.deepStrictEqual(invalid, ['shop-seocho']);
});
test('만 나이 계산 (생일 전날/당일)', () => {
  assert.strictEqual(Legal.calculateAge('2009-09-12', NOW), 16);
  assert.strictEqual(Legal.calculateAge('2009-09-11', NOW), 17);
  assert.ok(Number.isNaN(Legal.calculateAge('bad', NOW)));
  assert.ok(Legal.calculateAge('2027-01-01', NOW) < 0);
});
test('연소자 한도: 기본 7h/35h (§13-5 플래그 꺼짐)', () => {
  assert.deepStrictEqual(Legal.getMinorHourLimits(), { daily: 7, weekly: 35 });
  assert.strictEqual(Legal.isPostingAllowedForMinor('10:00', '17:00', ['SAT', 'SUN']), true);
  assert.deepStrictEqual(Legal.getMinorBlockReasons('14:00', '22:00'), ['하루 7시간을 넘어요']);
  assert.deepStrictEqual(Legal.getMinorBlockReasons('10:00', '17:00', ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']), ['주 35시간을 넘어요']);
});
test('연소자 한도: 플래그 켜면 8h/40h', () => {
  Legal.FEATURE_FLAGS.minorOvertimeAgreement = true;
  try {
    assert.strictEqual(Legal.isPostingAllowedForMinor('14:00', '22:00', ['SAT', 'SUN']), true);
    assert.deepStrictEqual(Legal.getMinorBlockReasons('14:00', '22:00', ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']), ['주 40시간을 넘어요']);
  } finally { Legal.FEATURE_FLAGS.minorOvertimeAgreement = false; }
});

// ── Matching ──
test('야간 판정', () => {
  assert.strictEqual(Matching.isNightShift('22:00', '07:00'), true);
  assert.strictEqual(Matching.isNightShift('18:00', '23:00'), true);
  assert.strictEqual(Matching.isNightShift('05:00', '09:00'), true);
  assert.strictEqual(Matching.isNightShift('14:00', '22:00'), false);
  assert.strictEqual(Matching.isNightShift('09:00', '18:00'), false);
});
test('하드 필터: 연소자는 주말 낮 공고만', () => {
  const db = fresh();
  const lee = db.workers.find(w => w.id === 'w-lee');
  const shopOf = p => db.shops.find(s => s.id === p.shop_id);
  const included = db.postings.filter(p => Matching.hardFilter(lee, p, shopOf(p), NOW).include).map(p => p.id);
  assert.deepStrictEqual(included, ['post-gangnam-weekend']);
});
test('하드 필터: 야간 불가 성인은 야간 제외', () => {
  const db = fresh();
  const worker = { ...db.workers.find(w => w.id === 'w-kim'), night_available: false };
  const night = db.postings.find(p => p.id === 'post-gangnam-night');
  const result = Matching.hardFilter(worker, night, db.shops[0], NOW);
  assert.strictEqual(result.include, false);
  assert.ok(result.reasons.includes('야간 근무 공고예요'));
});
test('하드 필터: 통근 거리 초과 제외', () => {
  const db = fresh();
  const worker = { ...db.workers.find(w => w.id === 'w-kim'), commute_radius_km: 1 };
  const posting = db.postings.find(p => p.id === 'post-gangnam-night');
  const far = { ...db.shops[0], geo: { lat: 37.5636, lng: 126.9850 } };
  assert.strictEqual(Matching.hardFilter(worker, posting, far, NOW).include, false);
});
test('적합도: 야간 공고에서 김철수 > 박영호', () => {
  const db = fresh();
  const night = db.postings.find(p => p.id === 'post-gangnam-night');
  const shop = db.shops[0];
  const kim = Matching.scoreApplicant(db.workers.find(w => w.id === 'w-kim'), night, shop);
  const park = Matching.scoreApplicant(db.workers.find(w => w.id === 'w-park'), night, shop);
  assert.ok(kim.score > park.score, `${kim.score} vs ${park.score}`);
  assert.ok(kim.breakdown.some(b => b.label.includes('게토 설정·문제 해결 가능') && b.points === 45));
});
test('적합도: 가중치 변경 반영', () => {
  const db = fresh();
  const night = db.postings.find(p => p.id === 'post-gangnam-night');
  const kim = db.workers.find(w => w.id === 'w-kim');
  const base = Matching.scoreApplicant(kim, night, db.shops[0]).score;
  const boosted = Matching.scoreApplicant(kim, night, db.shops[0], { nightBase: 60 }).score;
  assert.strictEqual(Math.round((boosted - base) * 10) / 10, 30);
});
test('프로필 완성도', () => {
  const db = fresh();
  assert.strictEqual(Matching.profileCompleteness(db.workers.find(w => w.id === 'w-kim')).percent, 100);
  const me = Matching.profileCompleteness(db.workers.find(w => w.id === 'me'));
  assert.strictEqual(me.percent, 0);
  assert.ok(me.missing.includes('좌석관리 프로그램'));
});

// ── Workflow: 공고 ──
const draft = (over = {}) => ({ shop_id: 'shop-gangnam', title: '테스트 공고', employment_type: 'LONG_TERM', shift_start: '10:00', shift_end: '17:00',
  work_days: ['SAT', 'SUN'], hourly_wage: 10320, headcount: 1, duties: ['COUNTER'], required_pos: null, ...over });

test('공고: 최저임금 미만 → MIN_WAGE_VIOLATION', () => {
  const db = fresh();
  const result = Workflow.createPosting(db, draft({ hourly_wage: 10000 }), 'owner', NOW);
  assert.strictEqual(result.code, 'MIN_WAGE_VIOLATION');
  assert.strictEqual(db.postings.length, 5);
});
test('공고: minor_allowed는 사장님 입력을 무시하고 서버 판정', () => {
  const db = fresh();
  const night = Workflow.createPosting(db, draft({ shift_start: '18:00', shift_end: '23:00', minor_allowed: true }), 'owner', NOW);
  assert.strictEqual(night.ok, true);
  assert.strictEqual(night.posting.minor_allowed, false);
  const day = Workflow.createPosting(db, draft(), 'owner', NOW);
  assert.strictEqual(day.posting.minor_allowed, true);
  assert.deepStrictEqual(day.posting.status_history.map(s => s.status), ['DRAFT', 'VALIDATED', 'OPEN']);
});
test('공고: 승인 대기 매장은 게시 불가', () => {
  const db = fresh();
  const result = Workflow.createPosting(db, draft({ shop_id: 'shop-myeongdong' }), 'owner', NOW);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes('승인된 매장만 공고를 올릴 수 있어요'));
});
test('공고: 필수값 누락 오류 모음', () => {
  const db = fresh();
  const result = Workflow.createPosting(db, draft({ title: '', work_days: [], duties: [], headcount: 0 }), 'owner', NOW);
  assert.strictEqual(result.errors.length, 4);
});
test('공고: 마감 → 재게시', () => {
  const db = fresh();
  assert.strictEqual(Workflow.closePosting(db, 'post-gangnam-day', 'owner', 'OWNER_CLOSED', NOW).ok, true);
  assert.strictEqual(Workflow.reopenPosting(db, 'post-gangnam-day', 'owner', NOW).ok, true);
  assert.strictEqual(db.postings.find(p => p.id === 'post-gangnam-day').status, 'OPEN');
});
test('1월 1일 최저임금 배치: 10,700원 미만 공고 정지, 재게시는 새 시급 필요', () => {
  const db = fresh();
  const jan1 = new Date(2027, 0, 1, 0, 5);
  const result = Workflow.runMinimumWageBatch(db, jan1);
  // 10,320 · 10,500 공고 4개 정지, 12,000 야간은 유지
  assert.strictEqual(result.count, 4);
  assert.strictEqual(db.postings.find(p => p.id === 'post-gangnam-night').status, 'OPEN');
  assert.strictEqual(db.notices.length, 4);
  assert.strictEqual(Workflow.reopenPosting(db, 'post-gangnam-day', 'owner', jan1).code, 'MIN_WAGE_VIOLATION');
  assert.strictEqual(Workflow.reopenPosting(db, 'post-gangnam-day', 'owner', jan1, { hourly_wage: 10700 }).ok, true);
});

// ── Workflow: 매장 ──
const shopForm = (over = {}) => ({ biz_reg_no: '220-81-62517', name: '새 PC방', address: '서울 어딘가', floor: '2층', phone: '02-000-0000',
  seat_count: 50, staff_per_shift: 1, cook_menu_count: 5, pos_program: 'GETO', is_24h: true, is_franchise: false, insurance_established: true,
  night_solo: true, smoking_booth_clean: false, meal_provided: true, free_pc_use: true, night_allowance: true, hires_minor: false, clean_scope: ['FLOOR'], ...over });

test('매장 등록: 야간 혼자 근무·흡연부스 미선택이면 거부', () => {
  const db = fresh();
  const result = Workflow.registerShop(db, shopForm({ night_solo: undefined, smoking_booth_clean: null }), 'owner', NOW);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.startsWith('야간 혼자 근무')));
  assert.ok(result.errors.some(e => e.startsWith('흡연부스 청소 포함')));
});
test('매장 등록 → PENDING → 승인 → 게시 가능', () => {
  const db = fresh();
  const reg = Workflow.registerShop(db, shopForm(), 'owner-new', NOW);
  assert.strictEqual(reg.shop.status, 'PENDING');
  assert.strictEqual(Workflow.createPosting(db, draft({ shop_id: reg.shop.id }), 'owner-new', NOW).ok, false);
  assert.strictEqual(Workflow.reviewShop(db, reg.shop.id, 'APPROVE', 'admin', '', NOW).ok, true);
  assert.strictEqual(Workflow.createPosting(db, draft({ shop_id: reg.shop.id }), 'owner-new', NOW).ok, true);
});
test('매장 승인: 검증번호 틀리면 승인 불가, 반려는 사유 필요', () => {
  const db = fresh();
  assert.strictEqual(Workflow.reviewShop(db, 'shop-seocho', 'APPROVE', 'admin', '', NOW).code, 'BIZ_REG_INVALID');
  assert.strictEqual(Workflow.reviewShop(db, 'shop-seocho', 'REJECT', 'admin', '', NOW).code, 'REASON_REQUIRED');
  assert.strictEqual(Workflow.reviewShop(db, 'shop-seocho', 'REJECT', 'admin', '사업자번호 불일치', NOW).ok, true);
});
test('매장 정지 → 모집 중 공고 마감', () => {
  const db = fresh();
  Workflow.reviewShop(db, 'shop-gangnam', 'SUSPEND', 'admin', '허위 공고 신고', NOW);
  assert.ok(db.postings.filter(p => p.shop_id === 'shop-gangnam').every(p => p.status === 'CLOSED'));
});

// ── Workflow: 지원 · 상태 전이 ──
test('지원: 생년월일 없으면 거부', () => {
  const db = fresh();
  assert.strictEqual(Workflow.applyToPosting(db, 'me', 'post-gangnam-day', NOW).code, 'BIRTH_DATE_REQUIRED');
});
test('지원: 연소자 야간·장시간 거부, 주말 낮 허용, 중복 거부', () => {
  const db = fresh();
  Workflow.setBirthDate(db, 'me', '2010-01-01', NOW);
  assert.strictEqual(Workflow.applyToPosting(db, 'me', 'post-gangnam-night', NOW).code, 'MINOR_NOT_ALLOWED');
  assert.strictEqual(Workflow.applyToPosting(db, 'me', 'post-gangnam-day', NOW).code, 'MINOR_NOT_ALLOWED');
  assert.strictEqual(Workflow.applyToPosting(db, 'me', 'post-gangnam-weekend', NOW).ok, true);
  assert.strictEqual(Workflow.applyToPosting(db, 'me', 'post-gangnam-weekend', NOW).code, 'ALREADY_APPLIED');
});
test('지원: 만 15세 미만 전면 차단', () => {
  const db = fresh();
  Workflow.setBirthDate(db, 'me', '2012-06-01', NOW);
  assert.strictEqual(Workflow.applyToPosting(db, 'me', 'post-gangnam-weekend', NOW).code, 'WORK_PERMIT_REQUIRED');
});
test('연소자 프로필: 야간 가능 강제 false', () => {
  const db = fresh();
  Workflow.setBirthDate(db, 'me', '2010-01-01', NOW);
  Workflow.updateWorkerProfile(db, 'me', { night_available: true }, NOW);
  assert.strictEqual(db.workers.find(w => w.id === 'me').night_available, false);
});
test('성인: APPLIED → VIEWED → INTERVIEW → HIRED, 인원 차면 FILLED', () => {
  const db = fresh();
  ['VIEWED', 'INTERVIEW', 'HIRED'].forEach(status => assert.strictEqual(Workflow.transitionApplication(db, 'app-kim-night', status, 'owner', NOW).ok, true, status));
  assert.strictEqual(db.postings.find(p => p.id === 'post-gangnam-night').status, 'FILLED');
});
test('성인: 잘못된 전이 거부 (APPLIED → HIRED)', () => {
  const db = fresh();
  assert.strictEqual(Workflow.transitionApplication(db, 'app-kim-night', 'HIRED', 'owner', NOW).code, 'INVALID_TRANSITION');
});
test('연소자: 서류 확인 전 채용 확정 거부 (MINOR_DOCS_REQUIRED)', () => {
  const db = fresh();
  const result = Workflow.transitionApplication(db, 'app-lee-weekend', 'HIRED', 'owner', NOW);
  assert.strictEqual(result.code, 'INVALID_TRANSITION');   // DOCS_REQUIRED에서는 HIRED로 갈 수 없음
  // INTERVIEW에 있는 연소자가 바로 HIRED 시도
  const app = db.applications.find(a => a.id === 'app-lee-weekend');
  app.status = 'INTERVIEW';
  assert.strictEqual(Workflow.transitionApplication(db, 'app-lee-weekend', 'HIRED', 'owner', NOW).code, 'MINOR_DOCS_REQUIRED');
});
test('연소자: DOCS_VERIFIED는 사장님이 직접 못 바꿈', () => {
  const db = fresh();
  assert.strictEqual(Workflow.transitionApplication(db, 'app-lee-weekend', 'DOCS_VERIFIED', 'owner', NOW).code, 'SYSTEM_ONLY');
});
test('서류 검증: 열람 전 승인 불가 → 열람 → 2종 승인 → DOCS_VERIFIED', () => {
  const db = fresh();
  assert.strictEqual(Workflow.reviewDoc(db, 'doc-lee-family', true, 'admin', '', NOW).code, 'VIEW_REQUIRED');
  Workflow.viewDoc(db, 'doc-lee-family', 'admin', NOW);
  Workflow.reviewDoc(db, 'doc-lee-family', true, 'admin', '', NOW);
  assert.strictEqual(db.applications.find(a => a.id === 'app-lee-weekend').status, 'DOCS_REQUIRED');
  Workflow.viewDoc(db, 'doc-lee-consent', 'admin', NOW);
  Workflow.reviewDoc(db, 'doc-lee-consent', true, 'admin', '', NOW);
  assert.strictEqual(db.applications.find(a => a.id === 'app-lee-weekend').status, 'DOCS_VERIFIED');
});
test('연소자 채용: 체크리스트 미완료 거부 → 완료 후 확정 → 다운로드 1회', () => {
  const db = fresh();
  ['doc-lee-family', 'doc-lee-consent'].forEach(id => { Workflow.viewDoc(db, id, 'admin', NOW); Workflow.reviewDoc(db, id, true, 'admin', '', NOW); });
  assert.strictEqual(Workflow.transitionApplication(db, 'app-lee-weekend', 'HIRED', 'owner', NOW).code, 'CHECKLIST_INCOMPLETE');
  Workflow.setChecklistItem(db, 'app-lee-weekend', 'contract_written', true, 'owner', NOW);
  Workflow.setChecklistItem(db, 'app-lee-weekend', 'direct_pay', true, 'owner', NOW);
  const checklist = Workflow.getHireChecklist(db, 'app-lee-weekend', NOW);
  assert.strictEqual(checklist.canHire, true);
  assert.strictEqual(Workflow.transitionApplication(db, 'app-lee-weekend', 'HIRED', 'owner', NOW).ok, true);
  assert.strictEqual(Workflow.ownerDownloadDocs(db, 'app-lee-weekend', 'owner', NOW).ok, true);
  assert.strictEqual(Workflow.ownerDownloadDocs(db, 'app-lee-weekend', 'owner', NOW).code, 'ALREADY_DOWNLOADED');
});
test('서류 반려 → 재업로드 가능, 반려는 사유 필요', () => {
  const db = fresh();
  Workflow.viewDoc(db, 'doc-lee-family', 'admin', NOW);
  assert.strictEqual(Workflow.reviewDoc(db, 'doc-lee-family', false, 'admin', '', NOW).code, 'REASON_REQUIRED');
  Workflow.reviewDoc(db, 'doc-lee-family', false, 'admin', '흐리게 찍힘', NOW);
  assert.strictEqual(Workflow.recordDocUpload(db, 'app-lee-weekend', 'FAMILY_CERT', { name: '재촬영.jpg', size: 900000 }, 'worker:w-lee', NOW).ok, true);
  assert.strictEqual(Workflow.recordDocUpload(db, 'app-lee-weekend', 'GUARDIAN_CONSENT', { name: 'x.jpg', size: 1 }, 'worker:w-lee', NOW).code, 'ALREADY_UPLOADED');
});
test('서류 업로드: 파일명은 저장하지 않음', () => {
  const db = fresh();
  Workflow.viewDoc(db, 'doc-lee-family', 'admin', NOW);
  Workflow.reviewDoc(db, 'doc-lee-family', false, 'admin', '흐림', NOW);
  const result = Workflow.recordDocUpload(db, 'app-lee-weekend', 'FAMILY_CERT', { name: '이민지_가족관계증명서.JPG', size: 2097152 }, 'worker:w-lee', NOW);
  assert.strictEqual(result.doc.file_label, 'jpg · 2.0MB');
  assert.ok(!JSON.stringify(db).includes('이민지_가족관계증명서'));
});
test('파기 배치: 기한 지난 서류만 파기, 토큰 삭제', () => {
  const db = fresh();
  const result = Workflow.runDocPurge(db, NOW);
  assert.deepStrictEqual(result.purged, ['doc-choi-family']);
  const purged = db.minorDocs.find(d => d.id === 'doc-choi-family');
  assert.strictEqual(purged.storage_token, null);
  assert.strictEqual(db.minorDocs.find(d => d.id === 'doc-lee-family').status, 'UPLOADED');
});
test('거절 시 30일 뒤 파기 예약 → 31일 뒤 배치에서 파기', () => {
  const db = fresh();
  Workflow.transitionApplication(db, 'app-lee-weekend', 'REJECTED', 'owner', NOW);
  const doc = db.minorDocs.find(d => d.id === 'doc-lee-family');
  assert.strictEqual(doc.purge_at.slice(0, 10), later(30).toISOString().slice(0, 10));
  assert.strictEqual(Workflow.runDocPurge(db, later(29)).purged.includes('doc-lee-family'), false);
  assert.strictEqual(Workflow.runDocPurge(db, later(31)).purged.includes('doc-lee-family'), true);
});
test('감사 로그: 순번이 이어지고 열람·검증이 기록됨', () => {
  const db = fresh();
  Workflow.viewDoc(db, 'doc-lee-family', 'admin', NOW);
  Workflow.reviewDoc(db, 'doc-lee-family', true, 'admin', '', NOW);
  const seqs = db.auditLog.map(r => r.seq);
  assert.deepStrictEqual(seqs, seqs.map((_, i) => i + 1));
  assert.deepStrictEqual(db.auditLog.slice(-2).map(r => r.action), ['DOC_VIEW', 'DOC_VERIFY']);
});
test('컴플라이언스: 시드는 파기 기한 초과 1건만, 파기 후 0건', () => {
  const db = fresh();
  const before = Workflow.computeCompliance(db, NOW);
  assert.deepStrictEqual(before.violations.map(v => v.type), ['PURGE_OVERDUE']);
  Workflow.runDocPurge(db, NOW);
  assert.strictEqual(Workflow.computeCompliance(db, NOW).violations.length, 0);
});
test('컴플라이언스: 1월 1일 이후 미달 공고 감지', () => {
  const db = fresh();
  const types = Workflow.computeCompliance(db, new Date(2027, 0, 2)).violations.map(v => v.type);
  assert.strictEqual(types.filter(t => t === 'MIN_WAGE').length, 4);
});
test('매칭 가중치 변경: 음수·문자 무시', () => {
  const db = fresh();
  Workflow.updateMatchingConfig(db, { nightBase: 50, perDutyMatch: -3, idCheckBonus: 'abc', posLevel: { CONFIGURE: 60 } }, 'admin', NOW);
  assert.strictEqual(db.config.matching.nightBase, 50);
  assert.strictEqual(db.config.matching.perDutyMatch, 8);
  assert.strictEqual(db.config.matching.idCheckBonus, 10);
  assert.strictEqual(db.config.matching.posLevel.CONFIGURE, 60);
  assert.strictEqual(db.config.matching.posLevel.SOLO_OPERATE, 35);
});
test('Schema 라벨', () => {
  assert.strictEqual(Schema.label('DOC_TYPES', 'FAMILY_CERT'), '가족관계증명서');
  assert.strictEqual(Schema.STRENGTHS.length, 12);
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.error}`}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
