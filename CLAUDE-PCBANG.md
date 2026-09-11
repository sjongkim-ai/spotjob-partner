# 스팟잡 파트너 — 개발 기준 문서 (CLAUDE.md)

> Claude Code가 참조하는 단일 기준 문서.
> 코드 작성 전 반드시 `§3 법적 제약`과 `§13 미해결 확인 항목`을 확인할 것.
> 법령 수치는 하드코딩 금지 — `config/legal.ts`로 분리한다.

---

<div class="cover">

# 스팟잡 파트너

<div class="rule">

</div>

<div class="sub">

개발 명세서 v1.0

</div>

<div class="sub" style="font-size:10pt; margin-top:6px;">

Claude Code 구현용 기준 문서

</div>

<div class="meta">

작성일 : 2026년 9월 7일  
시장 : 전국 PC방 6,959개소  
핵심 시점 : **2026년 10월 6일** 청소년보호법 개정 시행

</div>

</div>

## 0. 이 문서의 사용법

Claude Code가 코드를 생성할 때 참조하는 **단일 기준 문서**다.

- **§3 법적 제약**은 협상 불가능한 하드 룰이다. 어떤 기능도 이를 우회하도록 구현하지 않는다.
- 우선순위는 <span class="tag p0">P0</span> → <span class="tag p1">P1</span> → <span class="tag p2">P2</span>. P0만으로 MVP가 성립한다.
- 법령 수치(최저임금, 연소자 근로시간 등)는 **하드코딩 금지.** 전부 `config/legal.ts`로 분리한다.
- **§13 미해결 항목**은 전문가 확인 전까지 코드로 확정하지 않는다.
- 이 문서에 없는 기능은 임의로 추가하지 않는다.

### 목차

1.  서비스 개요
2.  시장 환경
3.  법적 제약 (하드 룰)
4.  사용자 정의
5.  데이터 모델
6.  기능 명세 — 구직자 앱
7.  기능 명세 — PC방 앱
8.  기능 명세 — 어드민
9.  매칭 로직
10. 연소자 고용 가드
11. 화면 목록 · API 초안
12. 기술 스택 · 로드맵
13. 미해결 확인 항목

<div class="pagebreak">

</div>

## 1. 서비스 개요

### 1.1 한 줄 정의

<div class="note">

**PC방 사장님과 PC방 경험자를 잇는 전용 채용 앱. 장기 알바가 기본, 야간 대타가 확장.**  
범용 알바 플랫폼의 "PC방 6개월"은 정보가 없다. 이 앱은 **어떤 좌석관리 프로그램을 다루는지, 야간이 가능한지, 22시 강퇴를 해봤는지**를 구조화한다.

</div>

### 1.2 문제 정의

| 주체        | 문제                                                                                                                                                                                    |
|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| PC방 사장   | 구인난의 실체는 "사람이 없다"가 아니라 **"야간 할 사람이 없다"**. 뽑아도 프로그램 사용법·조리·청소년 응대를 처음부터 가르쳐야 한다. 공고를 올려도 지원자 이력서에서 판단할 근거가 없다. |
| 구직자      | 공고에 정작 중요한 정보가 없다. 야간에 혼자 근무하는지, 흡연부스 청소가 포함인지, 조리 메뉴가 몇 개인지를 면접에 가서야 안다. 쌓은 경력을 증명할 방법도 없다.                           |
| 기존 플랫폼 | 범용 잡보드는 업종 특화 필드를 만들 유인이 없다. PC방 공고는 전체의 1% 미만이다.                                                                                                        |

### 1.3 차별화 축

1.  **업종 특화 프로필 스키마** — 프로그램 숙련도·조리·야간 가능 여부를 구조화. 범용 플랫폼이 따라오기 어렵다.
2.  **연소자 고용 가드** — 2026.10.6 개정 대응. 서류·시간 위반을 시스템이 원천 차단. §10 참조.
3.  **양방향 정보 대칭** — 공고에 "야간 혼자 근무 여부", "흡연부스 청소 포함" 의무 표기.
4.  **경력 인증** — 이전 근무 PC방의 원터치 확인. 업주 커뮤니티가 좁아 실제로 작동한다.

### 1.4 수익 모델

| 단계          | 모델                                                   |
|---------------|--------------------------------------------------------|
| MVP (0~6개월) | 무료. 공급·수요 밀도 확보가 유일한 목표                |
| 1단계         | PC방 채용 성사 건당 과금 또는 월 구독 (장기 채용 기준) |
| 2단계         | 야간 대타(스팟) 매칭 수수료 10~15% — 정산 기능 도입 후 |
| 구직자        | 영구 무료. 예외 없음                                   |

## 2. 시장 환경

### 2.1 시장 규모 — 작고 줄어든다

| 항목                  | 수치                                                                            |
|-----------------------|---------------------------------------------------------------------------------|
| 전국 PC방 수 (2026.9) | **6,959개소** (경기 1,605 · 서울 1,190 · 인천 444 · 부산 412 · 대구 402)        |
| 추세                  | 2023년 7,773개소로 전년 대비 8.4% 감소, 4년 연속 하락. 정점이던 2009년의 약 1/3 |
| 시장 매출             | 업소 수는 줄지만 먹거리 매출 성장으로 시장 규모 자체는 증가                     |

<div class="warn">

**전략적 함의 2가지**  
① **지역 한정 전략 불가.** 한 개 시·군은 50~80개 수준이라 매칭이 성립하지 않는다. 처음부터 전국 서비스로 설계한다. 다행히 PC방은 업무가 표준화되어 원격 매칭이 가능하다.  
② **PC방만으로는 사업이 성립하지 않는다.** 검증된 매칭 엔진을 만드는 무대로 쓰고, 6개월 내 인접 업종(스터디카페·무인매장·코인노래방 — 모두 "야간 무인에 가까운 카운터 업무")으로 확장할 것을 전제로 스키마를 설계한다.

</div>

### 2.2 진입 타이밍 — 2026년 10월 6일

청소년보호법 개정안 시행으로 **PC방이 청소년유해업소 목록에서 제외**되며, 업주는 만 18세 미만 아르바이트생을 합법적으로 채용할 수 있게 된다. 그동안 PC방은 청소년고용금지업소여서 미성년자 채용이 원천 불가능했다.

즉 **채용 가능 인력 풀이 통째로 열린다.** 동시에 규제 복잡도가 급증한다 — 이것이 앱의 존재 이유다. §10에서 상세히 다룬다.

<div class="note">

**런칭 메시지** — "만 18세 미만 알바, 이제 뽑을 수 있습니다. 서류와 시간은 저희가 막아드립니다."  
목표 출시: **2026년 10월 6일 이전**

</div>

### 2.3 유통 채널

PC방 업주는 온라인 커뮤니티에 강하게 묶여 있다. 업계 매체(아이러브PC방 등), 프랜차이즈 본사, 좌석관리 프로그램사(게토·피카 등) 채널을 통하면 전국 단위 초기 확보가 가능하다. 발품이 필요한 업종과 달리 **온라인만으로 공급 확보가 가능한 것이 이 버티컬의 최대 장점**이다.

<div class="pagebreak">

</div>

## 3. 법적 제약 (하드 룰)

이 절은 기능 요구사항이 아니라 **시스템 불변조건**이다. 우회 경로가 존재해서는 안 된다.

### 3.1 최저임금

| 항목        | 내용                                                                                                                                                  |
|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2026년 적용 | 시간급 10,320원                                                                                                                                       |
| 2027년 적용 | 시간급 **10,700원** (2026.8.5 고시, 2027.1.1 시행)                                                                                                    |
| 적용 범위   | 사업 종류별 구분 없이 전 사업장 동일. 도급제 근로자에게도 별도 최저임금을 적용하지 않음                                                               |
| 연령 감액   | **없음.** 연소자라고 해서 최저임금을 낮출 근거는 없다                                                                                                 |
| 수습 감액   | PC방 카운터·매장관리는 판매·서비스직으로 분류되어 수습 감액 규정 적용이 가능하나, **법정 수습 요건 충족 시에만**. MVP에서는 이 기능을 제공하지 않는다 |

#### 구현 요구

- 공고 시급이 `config.minimumWage[year]` 미만이면 **등록 차단**. 경고가 아니다.
- 매년 1월 1일 배치로 미달 공고 일괄 정지 후 사업주 재확인 요청.

### 3.2 연소자(만 18세 미만) 고용 — 최우선 하드 룰

<table>
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr class="header">
<th style="width: 22%">구분</th>
<th>요건</th>
<th style="width: 26%">위반 시</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>15세 이상<br />
18세 미만</strong></td>
<td>근로기준법 제66조에 따라 연령 증명 <strong>가족관계증명서</strong>와 <strong>친권자·후견인 동의서</strong>를 받아 보관</td>
<td><strong>과태료 500만 원 이하</strong></td>
</tr>
<tr class="even">
<td><strong>13세 이상<br />
15세 미만</strong></td>
<td>고용노동부장관 발급 <strong>취직인허증</strong> 필수. 취직인허증이 있으면 가족관계증명서·동의서는 별도 비치 불요</td>
<td><strong>2년 이하 징역 또는<br />
2,000만 원 이하 벌금</strong></td>
</tr>
<tr class="odd">
<td>근무 시간대</td>
<td>PC방 청소년 출입 허용 시간과 동일하게 <strong>09:00 ~ 22:00</strong>로 한정</td>
<td>—</td>
</tr>
<tr class="even">
<td>근로시간</td>
<td>1일 <strong>7시간</strong>, 1주 <strong>35시간</strong>이 원칙. 당사자 합의 시 1일 1시간·1주 5시간 한도로 연장 가능 → 최대 1일 8시간·주 40시간</td>
<td>—</td>
</tr>
<tr class="odd">
<td>야간·휴일</td>
<td>22:00~익일 06:00 야간근로와 휴일근로는 <strong>원칙 금지.</strong> 본인 동의와 고용노동부 인가를 모두 받은 경우에만 예외</td>
<td>—</td>
</tr>
<tr class="even">
<td>근로계약서</td>
<td>성인과 동일. 필수사항 명시한 서면 계약서 2부 작성, 1부 교부</td>
<td>—</td>
</tr>
<tr class="odd">
<td>임금 지급</td>
<td><strong>본인에게 직접·전액·정기적으로.</strong> 친권자 대신 지급은 근로기준법 제68조 위반</td>
<td>위법</td>
</tr>
<tr class="even">
<td>주휴수당</td>
<td>주 15시간 이상이면 연소근로자에게도 동일 적용. 5인 미만은 연차 유급휴가 면제</td>
<td>—</td>
</tr>
</tbody>
</table>

<div class="crit">

**시스템 구현 요구 — 우회 불가**  
① 생년월일 기준 연령을 서버에서 계산한다. 사용자 입력 신뢰 금지.  
② 만 18세 미만 계정에는 **22:00~09:00 구간 공고를 아예 노출하지 않는다.** 필터가 아니라 쿼리 레벨에서 제외.  
③ 만 15세 미만은 취직인허증 업로드·승인 전까지 **지원 자체를 차단**한다.  
④ 필수 서류 미검증 상태에서는 채용 확정(`HIRED`) 상태 전이를 막는다.  
⑤ 1일 7시간(합의 시 8시간)·주 35시간(합의 시 40시간) 초과 스케줄은 저장 시점에 거부한다.  
⑥ 야간근로 예외(고용노동부 인가)는 MVP에서 지원하지 않는다. 인가 케이스는 앱 밖에서 처리한다.

</div>

### 3.3 청소년 출입 제한은 그대로다

유해업소 지정이 풀려도 **22:00~익일 09:00 청소년 출입 제한(게임산업진흥법)**과 학교 인근 교육환경보호구역 입점 제한은 유지된다. 앱은 이를 혼동시키지 않도록 안내 문구를 분리해 표기한다. 구직자 교육 콘텐츠에도 반영한다.

### 3.4 4대보험

| 보험     | 기준                                                                                                                 |
|----------|----------------------------------------------------------------------------------------------------------------------|
| 산재보험 | **근로시간·고용형태 무관 의무 적용.** 하루만 일해도 예외 없음                                                        |
| 고용보험 | 일용근로자 의무. 초단시간은 원칙 제외이나 3개월 이상 계속근로 시 의무                                                |
| 건강보험 | 월 소정근로시간 60시간 미만이면 원칙 제외                                                                            |
| 국민연금 | 월 60시간 미만 원칙 제외. 단 1개월 이상 근로하며 둘 이상 사업장 합산 60시간 이상 또는 월 소득 220만 원 이상이면 의무 |

### 3.5 플랫폼 지위

<div class="warn">

대법원은 **앱 알고리즘을 통한 배차·평가 통제도 지휘·감독의 한 형태**가 될 수 있다고 판시했다.  
→ 고용 주체는 항상 PC방이며, 플랫폼은 **정보 중개 도구**다. 근로계약서에 플랫폼이 당사자로 기재되지 않는다. 근로자 평가 점수를 채용에 직접 개입시키는 자동 배정 알고리즘은 P0 범위에서 제외한다.

</div>

### 3.6 자금 흐름 — MVP는 취급하지 않는다

플랫폼이 직접 정산을 수행하면 PG 등록 대상이 된다. 정산을 직접 하지 않고 **외부 PG사를 통해 대행하면 등록 의무가 없다.**

**MVP 결정: 임금 정산 기능을 넣지 않는다.** 장기 채용 매칭은 소개 후 빠지는 구조이므로 자금 흐름이 발생하지 않는다. 야간 대타(스팟)를 도입하는 P1 단계에서 외부 PG를 연동한다. 이 결정으로 개발량이 크게 줄고 규제 리스크가 0이 된다.

### 3.7 개인정보

<div class="crit">

연소자 고용 서류(**가족관계증명서**, 친권자 동의서, 취직인허증)는 **주민등록번호와 가족관계 정보를 포함하는 최고 민감도 데이터**다. 일반 첨부파일과 같은 경로로 저장하면 안 된다.

</div>

- 전용 암호화 버킷(KMS)에 저장. 애플리케이션 DB에는 `document_token`과 검증 결과만 보관.
- PC방 사장에게는 **원본을 노출하지 않는다.** "서류 검증 완료" 상태값만 전달한다. (보관 의무는 사업주에게 있으므로, 채용 확정 시점에 다운로드 1회 + 접근 로그 기록)
- 채용 불성사 시 **30일 후 자동 파기.** 배치 작업으로 구현.
- 모든 열람·다운로드는 append-only 감사 로그에 기록.
- 이 구조는 **착수 시점에 확정**해야 한다. 나중에 바꾸려면 전면 재설계다.

<div class="pagebreak">

</div>

## 4. 사용자 정의

<table>
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr class="header">
<th style="width: 19%">역할</th>
<th style="width: 35%">프로필</th>
<th>핵심 니즈</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>박현우 (24)</strong><br />
경력 구직자</td>
<td>PC방 알바 2년 3개월. 게토·피카 운영 가능. 야간 선호(수당). 조리 전 메뉴 가능.</td>
<td>경력을 인정받아 시급을 더 받고 싶다 / 야간 혼자 근무인지 미리 알고 싶다 / 흡연부스 청소 여부가 결정적</td>
</tr>
<tr class="even">
<td><strong>이지민 (17)</strong><br />
연소 구직자</td>
<td>고2. 10/6 이후 첫 지원. 주말 낮 시간대만 가능.</td>
<td>뭘 준비해야 하는지 모른다 / 부모님 동의서 양식이 어디 있는지 모른다</td>
</tr>
<tr class="odd">
<td><strong>최성호 (41)</strong><br />
PC방 사장</td>
<td>80석. 24시간 운영. 알바 3명. 야간 결원이 가장 큰 스트레스.</td>
<td>야간 가능한 경력자 / 처음부터 안 가르쳐도 되는 사람 / 연소자 뽑고 싶은데 과태료가 무섭다</td>
</tr>
</tbody>
</table>

### 4.1 MVP 성공 지표

| 지표                    | 목표 (출시 3개월)                                          |
|-------------------------|------------------------------------------------------------|
| 등록 PC방               | 300개소 (전국 6,959개의 4.3%)                              |
| 등록 구직자             | 2,000명 / 야간 가능 비율 30% 이상                          |
| 공고 → 첫 지원 소요시간 | 중앙값 6시간 이내                                          |
| 공고 채용 성사율        | 50% 이상                                                   |
| 연소자 서류 검증 완료율 | 지원 건 대비 80% 이상                                      |
| 프로필 완성도           | 프로그램 항목 입력률 70% 이상 ← 제품 가설의 핵심 검증 지표 |

## 5. 데이터 모델

**프로필 스키마가 이 제품의 핵심 자산이다.** 자유 텍스트를 최소화하고 전부 enum으로 구조화한다. 구조화되어야 매칭·필터·통계가 가능하다.

### 5.1 구직자 프로필 (WorkerProfile)

    WorkerProfile
      user_id             uuid
      birth_date          date          # 연령 계산 근거. 서버에서만 판정
      age_class           enum          # ADULT | MINOR_15_17 | MINOR_13_14  (파생, 저장)
      gender              enum?         # 선택 입력
      home_geo            point         # 통근 가능 반경 계산용
      commute_radius_km   int           # 기본 5

      # ── 경력 ──
      total_months        int           # PC방 총 경력 개월
      work_histories      WorkHistory[]

      # ── 좌석관리 프로그램 (핵심 매칭 필드) ──
      pos_skills          PosSkill[]

      # ── 조리 ──
      cook_menus          enum[]        # RAMEN, FROZEN, RICE_BOWL, SNACK_BAR,
                                        # BEVERAGE, COFFEE, DESSERT
      cook_equipment_clean bool         # 조리기구 청소 가능
      cook_menu_count     int?          # 이전 매장 판매 메뉴 수

      # ── PC 대응 ──
      pc_skills           enum[]        # REBOOT_UPDATE, PERIPHERAL_SWAP,
                                        # NETWORK, ASSEMBLY, OS_REINSTALL

      # ── 운영 경험 (사장이 가장 중시) ──
      ops_experiences     enum[]        # ID_CHECK          청소년 신분증 확인
                                        # CURFEW_ENFORCE    22시 강퇴 처리
                                        # TROUBLE_CUSTOMER  진상 응대
                                        # CLOSING_SETTLE    마감 정산
                                        # OPENING           오픈 준비
                                        # INVENTORY         발주·재고

      # ── 근무 가능 ──
      night_available     bool          # 22~06시. MINOR면 강제 false
      available_slots     TimeSlot[]    # 요일 × 시간대 비트맵
      max_consecutive_nights int?
      preferred_type      enum[]        # LONG_TERM | SHORT_TERM | SPOT

      # ── 자기소개 ──
      strengths           enum[]        # 태그 선택 (§5.2)
      intro_text          text(300)     # 자유 서술은 300자로 제한

    PosSkill
      program   enum   # GETO, PICA, MEDIAWEB, IZONE, PCMATE, ETC
      level     enum   # EXPERIENCED    경험만 있음
                       # SOLO_OPERATE   혼자 운영 가능
                       # CONFIGURE      설정·트러블 해결 가능

    WorkHistory
      shop_name        varchar
      shop_id          uuid?      # 앱 내 PC방이면 연결 → 인증 요청 가능
      period_from      date
      period_to        date?
      shift_type       enum       # DAY | EVENING | NIGHT | ROTATING
      verified         bool       # 이전 사장 확인 여부
      verified_at      timestamp?

### 5.2 strengths 태그 (자유 서술 대체)

    지각한 적 없음 / 마감까지 책임짐 / 청소 꼼꼼함 / 손님 응대 능숙
    게임 지식 많음 / 조리 빠름 / PC 문제 직접 해결 / 장기 근무 희망
    급한 대타 가능 / 혼자 근무 익숙 / 인수인계 잘함 / 컴플레인 침착 대응

사장이 스캔 가능하도록 태그화한다. `intro_text`는 보조 수단이며 필수가 아니다.

### 5.3 PC방 (Shop)

    Shop
      id                  uuid
      biz_reg_no          varchar       # 국세청 진위확인 API 검증
      biz_verified        bool
      name                varchar
      address / geo       point
      floor               varchar       # "지하 1층" 등 — 실제로 중요
      seat_count          int
      is_24h              bool
      is_franchise        bool
      franchise_brand     varchar?
      pos_program         enum          # 구직자 PosSkill과 동일 enum ★매칭 축
      insurance_established bool        # 4대보험 성립 여부

      # ── 근무 환경 (의무 표기) ──
      night_solo          bool          # 야간 혼자 근무 여부  ★구직자 최대 관심
      staff_per_shift     int
      smoking_booth_clean bool          # 흡연부스 청소 포함 여부 ★이직 사유 상위
      cook_menu_count     int           # 조리 메뉴 수
      clean_scope         enum[]        # FLOOR, TOILET, SMOKING_BOOTH,
                                        # KITCHEN, PC_CLEANING, TRASH

      # ── 조건 ──
      meal_provided       bool
      free_pc_use         bool          # 근무 외 시간 PC 이용 가능 (구직자 유인)
      night_allowance     bool

      # ── 연소자 ──
      hires_minor         bool          # 연소자 채용 의사
      minor_ready         bool          # 서류 준비 가이드 완료 여부

      verified_at         timestamp?    # 운영팀 검증 시점
      status              enum          # PENDING | ACTIVE | SUSPENDED

<div class="note">

`night_solo`와 `smoking_booth_clean`은 **선택 항목이 아니라 필수 입력**으로 구현한다. 공고에 안 적혀 있어서 면접에 가서야 아는 두 가지이고, 이걸 먼저 보여주는 것 자체가 구직자 신뢰를 만든다.

</div>

### 5.4 공고 · 지원

    JobPosting
      id, shop_id
      employment_type   enum      # LONG_TERM | SHORT_TERM | SPOT
      title
      shift_start / shift_end     time
      work_days         enum[]    # MON..SUN
      hourly_wage       int       # 최저임금 검증 대상
      headcount         int
      duties            enum[]    # COUNTER, COOKING, CLEANING, PC_SUPPORT,
                                  # ID_CHECK, INVENTORY, OPENING, CLOSING
      required_pos      enum?     # 필수 프로그램 (선택)
      minor_allowed     bool      # 서버에서 시간대 기준 자동 판정
      status            enum      # DRAFT | VALIDATED | OPEN | CLOSED | FILLED

    Application
      id, posting_id, worker_id
      status            enum      # APPLIED | VIEWED | INTERVIEW
                                  # | DOCS_REQUIRED | DOCS_VERIFIED
                                  # | HIRED | REJECTED | WITHDRAWN
      applied_at, updated_at

    MinorEmploymentDoc
      id, application_id
      doc_type          enum      # FAMILY_CERT | GUARDIAN_CONSENT | WORK_PERMIT
      storage_token     varchar   # 암호화 버킷 참조. 원본은 DB에 없음
      status            enum      # UPLOADED | VERIFIED | REJECTED | PURGED
      verified_by, verified_at
      purge_at          date      # 불성사 시 +30일

    VerificationRequest        # 경력 인증
      id, work_history_id, target_shop_id
      status            enum    # SENT | CONFIRMED | DENIED | EXPIRED

### 5.5 상태 전이

    JobPosting  : DRAFT → VALIDATED → OPEN → FILLED → CLOSED
                  (최저임금 검증 실패 시 VALIDATED 진입 불가)

    Application : APPLIED → VIEWED → INTERVIEW → HIRED
                  연소자인 경우 반드시:
                  INTERVIEW → DOCS_REQUIRED → DOCS_VERIFIED → HIRED
                  ※ DOCS_VERIFIED를 거치지 않은 HIRED 전이는 서버에서 거부

<div class="pagebreak">

</div>

## 6. 기능 명세 — 구직자 앱

| 모듈      | 기능                                                  | 우선                           | 비고      |
|-----------|-------------------------------------------------------|--------------------------------|-----------|
| 가입      | 휴대폰 본인인증 (생년월일 확보) → age_class 자동 판정 | <span class="tag p0">P0</span> | 필수      |
|           | 연소자 안내 온보딩 (필요 서류·근무 가능 시간)         | <span class="tag p0">P0</span> | §10       |
|           | 소셜 로그인 (카카오)                                  | <span class="tag p1">P1</span> |           |
| 프로필    | 단계형 입력 위저드 (§5.1 스키마 전체)                 | <span class="tag p0">P0</span> | 핵심      |
|           | 프로필 완성도 표시 + 미입력 항목 유도                 | <span class="tag p0">P0</span> |           |
|           | 이전 근무처 경력 인증 요청                            | <span class="tag p1">P1</span> |           |
| 공고      | 목록 (거리순 / 시급순 / 최신순)                       | <span class="tag p0">P0</span> |           |
|           | 필터: 야간 / 프로그램 / 통근거리 / 고용형태           | <span class="tag p0">P0</span> |           |
|           | **연소자 계정에는 22~09시 공고 미노출**               | <span class="tag p0">P0</span> | 쿼리 레벨 |
|           | 지도 보기                                             | <span class="tag p1">P1</span> |           |
| 공고 상세 | 야간 혼자 근무 / 흡연부스 청소 여부 **상단 노출**     | <span class="tag p0">P0</span> | 차별화    |
|           | 업무 항목·프로그램·조리 메뉴 수 표시                  | <span class="tag p0">P0</span> |           |
|           | 내 프로필과의 적합도 표시 ("게토 경험 일치")          | <span class="tag p1">P1</span> |           |
| 지원      | 원터치 지원 (프로필 그대로 전송)                      | <span class="tag p0">P0</span> |           |
|           | 지원 현황 추적 (열람 / 면접 / 서류 / 채용)            | <span class="tag p0">P0</span> |           |
|           | 연소자 서류 업로드 플로우                             | <span class="tag p0">P0</span> | §10       |
| 기타      | 사장님과의 채팅                                       | <span class="tag p1">P1</span> |           |
|           | 야간 대타(스팟) 푸시 수신                             | <span class="tag p1">P1</span> |           |

## 7. 기능 명세 — PC방 앱

<table>
<colgroup>
<col style="width: 25%" />
<col style="width: 25%" />
<col style="width: 25%" />
<col style="width: 25%" />
</colgroup>
<thead>
<tr class="header">
<th style="width: 15%">모듈</th>
<th style="width: 54%">기능</th>
<th style="width: 8%">우선</th>
<th>비고</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td rowspan="3">등록</td>
<td>사업자등록번호 진위확인 (국세청 API)</td>
<td><span class="tag p0">P0</span></td>
<td></td>
</tr>
<tr class="even">
<td>매장 정보 입력 (§5.3 전체) — 필수 항목 강제</td>
<td><span class="tag p0">P0</span></td>
<td></td>
</tr>
<tr class="odd">
<td>4대보험 성립 여부 확인 · 미성립 안내</td>
<td><span class="tag p1">P1</span></td>
<td></td>
</tr>
<tr class="even">
<td rowspan="4">공고</td>
<td>템플릿 기반 등록 · 반복 공고 저장</td>
<td><span class="tag p0">P0</span></td>
<td></td>
</tr>
<tr class="odd">
<td><strong>최저임금 미만 시 등록 차단 + 원터치 보정</strong></td>
<td><span class="tag p0">P0</span></td>
<td>하드 룰</td>
</tr>
<tr class="even">
<td>시간대 기준 <code>minor_allowed</code> 자동 판정 및 안내</td>
<td><span class="tag p0">P0</span></td>
<td>§10</td>
</tr>
<tr class="odd">
<td>공고 마감·재게시</td>
<td><span class="tag p0">P0</span></td>
<td></td>
</tr>
<tr class="even">
<td rowspan="4">지원자</td>
<td>지원자 목록 — <strong>프로그램·야간·경력 배지 카드</strong></td>
<td><span class="tag p0">P0</span></td>
<td>핵심 UX</td>
</tr>
<tr class="odd">
<td>조건 기준 정렬 (적합도순)</td>
<td><span class="tag p0">P0</span></td>
<td>§9</td>
</tr>
<tr class="even">
<td>상태 변경 (열람 → 면접 → 채용)</td>
<td><span class="tag p0">P0</span></td>
<td></td>
</tr>
<tr class="odd">
<td>이전 근무 경력 인증 요청 응답</td>
<td><span class="tag p1">P1</span></td>
<td></td>
</tr>
<tr class="even">
<td rowspan="3">연소자<br />
가드</td>
<td>채용 전 체크리스트 · 진행 상태 표시</td>
<td><span class="tag p0">P0</span></td>
<td rowspan="3">§10<br />
킬러</td>
</tr>
<tr class="odd">
<td>서류 검증 완료 전 채용 확정 차단</td>
<td><span class="tag p0">P0</span></td>
</tr>
<tr class="even">
<td>근로시간 한도 자동 검증 (7h/35h)</td>
<td><span class="tag p0">P0</span></td>
</tr>
<tr class="odd">
<td>문서</td>
<td>근로계약서 자동 생성 (연소자 양식 분기)</td>
<td><span class="tag p1">P1</span></td>
<td></td>
</tr>
<tr class="even">
<td>스팟</td>
<td>야간 대타 급구 → 야간 가능자에게만 푸시</td>
<td><span class="tag p1">P1</span></td>
<td></td>
</tr>
</tbody>
</table>

## 8. 기능 명세 — 어드민

| 모듈                | 기능                                                   | 우선                           |
|---------------------|--------------------------------------------------------|--------------------------------|
| PC방 승인           | 등록 심사 · 승인/반려 · 정지                           | <span class="tag p0">P0</span> |
| 연소자 서류 검증    | 업로드 서류 확인 → 승인/반려. 열람 감사 로그 자동 기록 | <span class="tag p0">P0</span> |
| 컴플라이언스 모니터 | 최저임금 위반·연소자 시간 위반 감지 대시보드           | <span class="tag p0">P0</span> |
| 서류 파기 배치      | 불성사 30일 경과 서류 자동 파기 · 실행 로그            | <span class="tag p0">P0</span> |
| 신고 처리           | 허위 공고·임금 미지급 신고 큐                          | <span class="tag p1">P1</span> |
| 수급 모니터         | 지역·시간대별 공급 부족 · 야간 커버율                  | <span class="tag p1">P1</span> |

<div class="pagebreak">

</div>

## 9. 매칭 로직

자동 배정이 아니라 **정렬과 필터**다. 최종 결정은 항상 사장이 한다 (§3.5 근로자성 리스크).

### 9.1 하드 필터 (통과 못 하면 노출 제외)

    function hardFilter(worker, posting):
        # 1) 연소자 시간대 — 최우선. 예외 없음
        if worker.age_class != ADULT:
            if posting.shift_start < 09:00 or posting.shift_end > 22:00:
                EXCLUDE
            if dailyHours(posting) > 8:   # 합의 포함 최대치
                EXCLUDE
        if worker.age_class == MINOR_13_14 and not worker.work_permit_verified:
            EXCLUDE

        # 2) 야간 공고는 야간 가능자에게만
        if isNightShift(posting) and not worker.night_available:
            EXCLUDE

        # 3) 통근 거리
        if distance(worker.home_geo, shop.geo) > worker.commute_radius_km:
            EXCLUDE

        # 4) 요일 가능 여부
        if not overlaps(worker.available_slots, posting.work_days):
            EXCLUDE

        INCLUDE

### 9.2 적합도 점수 (사장 화면 정렬용)

    score = 0

    # 프로그램 일치 — 교육비용을 직접 줄이는 요소이므로 가중치 최대
    if worker.hasPos(shop.pos_program):
        score += { EXPERIENCED: 20, SOLO_OPERATE: 35, CONFIGURE: 45 }[level]

    # 야간 공고 + 야간 가능
    if isNightShift(posting) and worker.night_available:
        score += 30
        score += min(worker.max_consecutive_nights, 5) * 2

    # 운영 경험 — 공고 duties와 교집합
    score += len(worker.ops_experiences ∩ posting.duties) * 8
    if ID_CHECK in worker.ops_experiences: score += 10   # 사장 최대 관심사

    # 조리
    if COOKING in posting.duties:
        score += min(len(worker.cook_menus), 5) * 4

    # 경력
    score += min(worker.total_months, 24) * 0.5

    # 인증된 경력
    score += count(verified work_histories) * 10

    # 거리 (가까울수록)
    score += max(0, 15 - distance_km * 3)

    return score

<div class="note">

가중치는 `config/matching.ts`로 분리한다. 실사용 데이터 100건이 쌓이기 전까지 이 숫자는 전부 가설이다. **어드민에서 조정 가능하게** 만들고 채용 성사 결과와의 상관관계를 로깅한다.

</div>

## 10. 연소자 고용 가드 (킬러 기능)

2026년 10월 6일 이후 시장이 열리면서 동시에 사장님에게 **"뽑아도 되는데 잘못하면 500만 원"**이라는 상태가 만들어진다. 이 불안을 해소하는 것이 이 앱의 도입 이유다.

### 10.1 사장 측 플로우

    공고 등록 시
      └ 시간대 입력 → 서버가 minor_allowed 자동 판정
          09:00~22:00 이내 && 1일 ≤8h  →  minor_allowed = true
          그 외                          →  false (선택 불가, 사유 표시)
      └ true인 경우 안내:
          "이 공고는 만 18세 미만도 지원할 수 있습니다.
           채용 시 서류 2종이 필요하며, 앱에서 대신 받아드립니다."

    지원자 확인 → 면접 → 채용하려는 순간
      └ 지원자가 연소자면 체크리스트 자동 노출:

         [ ] 가족관계증명서            지원자 업로드 대기중
         [ ] 친권자 동의서             지원자 업로드 대기중
         ( 만 15세 미만이면 위 2종 대신 취직인허증 )
         [ ] 근무시간 09~22시 이내      ✔ 자동 확인됨
         [ ] 1일 7시간 이내             ✔ 자동 확인됨 (6시간)
         [ ] 근로계약서 2부 작성·1부 교부
         [ ] 임금은 본인 계좌로 직접 지급

      └ 서류 미검증 상태에서는 [채용 확정] 버튼 비활성
      └ 검증 완료 후 확정 → 서류 다운로드 1회 제공 (보관 의무는 사업주)

### 10.2 구직자(연소자) 측 플로우

    가입 시 생년월일로 연소자 판정
      └ 온보딩 안내:
          "만 18세 미만은 오전 9시~오후 10시 사이에만 일할 수 있어요.
           채용이 정해지면 서류 2가지가 필요해요."

    공고 목록
      └ 22~09시 공고는 아예 보이지 않음 (혼란 방지)

    채용 단계 진입 시
      └ 서류 업로드 화면
          ① 가족관계증명서
             · 정부24 발급 안내 + 딥링크
          ② 친권자 동의서
             · 앱 내 양식 제공 → 보호자 휴대폰으로 링크 전송
             · 보호자가 본인인증 후 전자서명 → 자동 첨부      [P1]
             · MVP는 양식 PDF 다운로드 → 서명 후 촬영 업로드   [P0]
      └ 운영팀 검증 (영업일 1일 이내)
      └ 완료 시 사장에게 "서류 검증 완료" 상태만 전달

<div class="crit">

**구현 시 절대 하지 말 것**  
· 사장에게 서류 원본을 상시 열람시키지 않는다. 상태값만 전달한다.  
· 검증을 자동화(OCR)하지 않는다. MVP는 **사람이 눈으로 확인**한다. 오판 시 형사처벌이 걸린 영역이다.  
· "서류가 곧 준비될 예정"으로 채용 확정을 허용하지 않는다. 예외 플래그를 만들지 않는다.  
· 앱이 "합법입니다"라고 보증하지 않는다. 문구는 "필수 서류가 확인되었습니다"까지만.

</div>

### 10.3 만 15세 미만 처리

취직인허증 없이 15세 미만을 고용하면 **2년 이하 징역 또는 2,000만 원 이하 벌금**이다. 과태료와 차원이 다르다.

- MVP에서는 **만 15세 미만 계정의 지원 기능을 전면 차단**하는 것을 권장한다.
- 차단 시 안내: "만 15세 미만은 고용노동부 취직인허증이 필요해요. 발급 후 다시 찾아주세요." + 안내 링크
- 취직인허증 지원은 P2에서 검토한다. 초기에 감당할 리스크가 아니다.

<div class="pagebreak">

</div>

## 11. 화면 목록 · API 초안

### 11.1 화면 목록 (P0)

| \#  | 앱     | 화면                       | 핵심                                            |
|-----|--------|----------------------------|-------------------------------------------------|
| W1  | 구직자 | 가입 · 본인인증            | 생년월일 확보 → age_class 판정                  |
| W2  | 구직자 | **프로필 위저드** (5단계)  | 경력 → 프로그램 → 조리/PC → 운영경험 → 근무가능 |
| W3  | 구직자 | 공고 목록 + 필터           | 연소자는 22~09시 미노출                         |
| W4  | 구직자 | **공고 상세**              | 야간 혼자 근무 · 흡연부스 청소 상단 노출        |
| W5  | 구직자 | 지원 현황                  | 열람/면접/서류/채용 타임라인                    |
| W6  | 구직자 | **연소자 서류 업로드**     | 정부24 안내 + 동의서 양식                       |
| S1  | PC방   | 매장 등록                  | 사업자 진위확인 + 필수 항목 강제                |
| S2  | PC방   | **공고 등록**              | 최저임금 차단 상태 UI 포함                      |
| S3  | PC방   | **지원자 목록**            | 배지 카드 + 적합도 정렬                         |
| S4  | PC방   | 지원자 상세                | 프로그램 숙련도·운영경험 한눈에                 |
| S5  | PC방   | **연소자 채용 체크리스트** | 미완료 시 확정 버튼 비활성                      |
| A1  | 어드민 | PC방 승인 큐               |                                                 |
| A2  | 어드민 | 연소자 서류 검증           | 감사 로그 자동 기록                             |
| A3  | 어드민 | 컴플라이언스 대시보드      |                                                 |

### 11.2 API 초안

    # ── 인증 ──
    POST   /auth/verify-phone            본인인증 → birth_date 확보
    POST   /auth/token

    # ── 구직자 ──
    GET    /me/profile
    PATCH  /me/profile                   # 부분 저장 (위저드 단계별)
    POST   /me/work-histories
    POST   /me/work-histories/:id/verify-request

    GET    /postings                     # ?night=&pos=&radius=&type=
                                         # 서버가 age_class로 시간대 자동 필터
    GET    /postings/:id
    POST   /postings/:id/apply
    GET    /me/applications

    POST   /applications/:id/minor-docs  # multipart → 암호화 버킷
    GET    /applications/:id/minor-docs/status

    # ── PC방 ──
    POST   /shops                        # biz_reg_no 진위확인 동반
    GET    /shops/me
    PATCH  /shops/me

    POST   /shops/me/postings            # 400 MIN_WAGE_VIOLATION 반환 가능
                                         # 응답에 minor_allowed 자동 판정 포함
    GET    /shops/me/postings/:id/applicants   # 적합도 정렬
    PATCH  /applications/:id/status      # VIEWED|INTERVIEW|REJECTED
    POST   /applications/:id/hire        # 409 MINOR_DOCS_REQUIRED 반환 가능

    # ── 어드민 ──
    GET    /admin/shops?status=PENDING
    POST   /admin/shops/:id/approve
    GET    /admin/minor-docs?status=UPLOADED
    POST   /admin/minor-docs/:id/verify  # 열람 시점 감사 로그 자동 기록
    GET    /admin/compliance/violations

### 11.3 반드시 서버에서 처리할 검증

    1. age_class 판정          — 클라이언트 입력 신뢰 금지
    2. 공고 시간대 필터링       — 클라이언트 필터가 아니라 쿼리 조건
    3. 최저임금 검증           — 공고 생성 트랜잭션 내부
    4. minor_allowed 판정      — 사장이 임의 설정 불가
    5. HIRED 전이 시 서류 검증 — 상태 머신 가드
    6. 연소자 근로시간 한도    — 저장 시점 거부

## 12. 기술 스택 · 로드맵

### 12.1 스택

| 영역        | 선택                           | 사유                                                    |
|-------------|--------------------------------|---------------------------------------------------------|
| 모바일      | React Native (Expo)            | iOS/Android 동시. 구직자는 20대라 앱 설치 저항 없음     |
| 백엔드      | NestJS (TypeScript)            | 상태 머신 가드가 많아 타입 안정성이 중요                |
| DB          | PostgreSQL + PostGIS           | 통근 반경 쿼리                                          |
| 인증        | PASS 본인인증                  | **생년월일 확보가 필수**이므로 소셜 로그인만으로는 불가 |
| 파일        | S3 + KMS (전용 버킷)           | 연소자 서류는 일반 첨부와 물리 분리                     |
| 알림        | FCM + 카카오 알림톡            | 야간 대타는 푸시 도달률이 생명                          |
| 어드민      | Next.js                        |                                                         |
| 사업자 확인 | 국세청 사업자등록 상태조회 API | 공공데이터포털                                          |

### 12.2 로드맵

#### Phase 1 — MVP (목표: 2026년 10월 6일 이전)

1.  인증 + age_class 판정 구조 (**가장 먼저**)
2.  연소자 서류 저장소 분리 구조 (**두 번째. 나중에 못 바꿈**)
3.  구직자 프로필 위저드 (§5.1 전체)
4.  PC방 등록 + 사업자 진위확인
5.  공고 등록 + 최저임금 검증 + minor_allowed 판정
6.  공고 목록/상세 + 하드 필터
7.  지원 + 상태 관리 + 적합도 정렬
8.  연소자 고용 가드 (체크리스트 · 서류 업로드 · 확정 차단)
9.  어드민 (승인 · 서류 검증 · 파기 배치)

**정산·근로계약서·채팅·지도는 전부 제외.** 장기 채용 매칭은 소개 후 빠지는 구조이므로 이것만으로 성립한다.

#### Phase 2 (P1)

경력 인증 / 야간 대타(스팟) + 외부 PG 정산 / 근로계약서 자동 생성 / 채팅 / 보호자 전자서명 / 지도 / 적합도 표시

#### Phase 3 (P2)

인접 업종 확장(스터디카페·무인매장·코인노래방) / 취직인허증 지원 / 유료화 / 좌석관리 프로그램사 제휴

### 12.3 착수 순서 권고

<div class="warn">

**①** 연령 판정 및 권한 분기 구조, **②** 연소자 서류 암호화 저장소 분리 — 이 둘을 스캐폴딩보다 먼저 확정할 것. 나머지는 갈아엎어도 되지만 이 둘은 안 된다. 특히 ②는 개인정보 사고 시 사업이 끝나는 영역이다.

</div>

## 13. 미해결 확인 항목

전문가 확인 전까지 코드로 확정하지 않는다. 기능 플래그로 비활성 상태로 둔다.

<table>
<colgroup>
<col style="width: 25%" />
<col style="width: 25%" />
<col style="width: 25%" />
<col style="width: 25%" />
</colgroup>
<thead>
<tr class="header">
<th style="width: 5%">#</th>
<th style="width: 28%">항목</th>
<th style="width: 45%">확인 내용</th>
<th>대상</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>1</td>
<td><strong>개정 법령 원문 확인</strong></td>
<td>본 문서의 연소자 조항은 업계 매체 보도 기반이다. 2026.10.6 시행 개정 청소년보호법과 근로기준법 제66·68조 <strong>원문을 직접 확인</strong>할 것. 앱의 핵심 기능 근거다</td>
<td>노무사<br />
법령정보센터</td>
</tr>
<tr class="even">
<td>2</td>
<td>서류 보관 주체</td>
<td>보관 의무는 사업주에게 있다. 플랫폼이 서류를 보관·중계하는 행위 자체의 법적 지위와 위임 범위</td>
<td>노무사<br />
변호사</td>
</tr>
<tr class="odd">
<td>3</td>
<td>가족관계증명서 취급</td>
<td>주민등록번호 포함 문서의 수집·보관 근거와 최소 수집 원칙 충족 여부. 마스킹본으로 대체 가능한지</td>
<td>개인정보<br />
전문 변호사</td>
</tr>
<tr class="even">
<td>4</td>
<td>친권자 동의서 전자서명</td>
<td>보호자 전자서명의 법적 효력. 서면 원본이 요구되는지</td>
<td>노무사</td>
</tr>
<tr class="odd">
<td>5</td>
<td>연장 합의 처리</td>
<td>1일 7→8시간 연장은 "당사자 간 합의"가 전제다. 앱 내 동의 체크가 합의로 인정되는지</td>
<td>노무사</td>
</tr>
<tr class="even">
<td>6</td>
<td>플랫폼 책임 범위</td>
<td>앱이 "서류 확인 완료"를 표시한 뒤 문제가 생겼을 때의 책임. 약관 면책 문구 설계</td>
<td>변호사</td>
</tr>
<tr class="odd">
<td>7</td>
<td>야간 대타 정산 구조</td>
<td>P1 진입 시 외부 PG 경유 구조가 전금법상 등록 면제 범위에 드는지</td>
<td>변호사</td>
</tr>
</tbody>
</table>

<div class="crit">

**면책** — 본 문서의 법률·노무 서술은 공개 자료를 정리한 것으로 전문가 자문이 아니다. 특히 §3.2 연소자 조항과 §10은 위반 시 형사처벌이 따르는 영역이므로, **개발 착수 전 노무사 검토를 반드시 거칠 것.** §13-1은 코드를 쓰기 전에 확인해야 한다.

</div>

### 부록 A. 이전 기획(시니어 스팟워크)에서 승계한 항목

| 항목                            | 상태                                                    |
|---------------------------------|---------------------------------------------------------|
| 최저임금 하드 룰 · 검증 로직    | 그대로 승계 (§3.1)                                      |
| 4대보험 기준                    | 그대로 승계 (§3.4)                                      |
| 플랫폼 근로자성 리스크          | 그대로 승계 (§3.5)                                      |
| 전금법 · PG 경유 원칙           | 승계하되 MVP에서 자금 흐름 자체를 제거 (§3.6)           |
| 일용근로소득 원천징수 로직      | **보류.** 스팟(P1) 진입 시 이전 문서 §9.2에서 가져올 것 |
| 근로내용확인신고서 통합 신고    | **보류.** 동일                                          |
| 시니어 UX 하드 룰 · 대면 온보딩 | 폐기. 본 서비스와 무관                                  |

### 문서 이력

| 버전     | 일자       | 내용                                                                  |
|----------|------------|-----------------------------------------------------------------------|
| v0.1     | 2026-09-07 | 시니어 스팟워크 기획서 (별도 문서)                                    |
| **v1.0** | 2026-09-07 | PC방 알바 버티컬로 전면 재작성. 연소자 고용 가드를 핵심 기능으로 신설 |
