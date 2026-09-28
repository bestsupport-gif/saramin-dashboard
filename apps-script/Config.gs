/**
 * 사람인 CPI / DA 데일리 리포트 자동 코멘트 발송 - 설정
 *
 * 실제 리포트 파일 구조(2026-09 기준, best_support@wisebirds.com 확인):
 *  - CPI: 폴더 안에 'YYYY.MM' 하위 폴더 -> '(Wisebirds)사람인 CPI 캠페인_Daily Report N월_YYMMDD.xlsx'
 *         탭: Summary / Apple_SA / Google_AC / RAW
 *         RAW 헤더: Month, Week, Event Date, Channel, Campaign, Ad Group, Term,
 *                   Imps., Click, Install, Spent, Total Opens (App), Unique 유저 수 (App),
 *                   로그인 (App), 회원가입 (App), apply_completed (App), resume_reg (App),
 *                   onboarding_completed (App+Web), Uninstalls (App), sign_delete 유저 수 (App)
 *  - DA : 폴더 안에 'YYYY.MM' 하위 폴더 -> '(Wisebirds)사람인 DA 캠페인_Daily Report N월_YYMMDD.xlsx'
 *         탭: Summary / Meta(Install) / Meta(사람인스토어) / Appier / Inmobi / RTB house /
 *             Criteo / taboola / rCPA / rCPE / 유튜브구독캠페인 / RAW
 *         RAW 헤더: Month, Week, Date, Channel, Media, DA, Objective, OS, Campaign, Creative,
 *                   Imps., Click, Action, Spent, Total Opens (App+Web), Unique 유저 수 (App),
 *                   Install(+SKAN), 로그인 (App+Web), 회원가입(+SKAN), apply_completed(App+Web),
 *                   resume_reg유저 수(+SKAN), onboarding_completed (App+Web), Uninstalls (App),
 *                   sign_delete 유저 수 (App), SKAN dedup Install, 0, SKAN 이력서등록,
 *                   SKAN 간편프로필+AC7:AF7, fortune_counsel_try (App+Web)(=상품보기),
 *                   구매 완료 (App+Web), 구매액 (App+Web)
 *
 * ⚠️ DA_MEDIA_CONFIG 안의 Channel/Media 매칭값은 탭 이름을 바탕으로 한 추정치입니다.
 *    반드시 logDistinctDaValues_() 를 한 번 실행해서 실행 로그(보기 > 로그)에 찍히는
 *    실제 Channel / Media / DA / Objective 값과 대조 후 필요하면 수정해 주세요.
 */

const CONFIG = {
  TIMEZONE: 'Asia/Seoul',
  EMAIL_TO: 'best_support@wisebirds.com',
  EMAIL_SENDER_NAME: '사람인 데일리 리포트 자동화',

  // 메일 인사말에 들어갈 이름 ("와이즈버즈 OOO입니다.") - 필요하면 바꿔서 쓰세요.
  GREETING_NAME: '장지원',

  // 메일 상단 "사람인 데일리 리포트" 하이퍼링크 대상
  DAILY_REPORT_LINK_URL: 'https://drive.google.com/drive/folders/1JPWWd-HKaNIGIgCQggDSXSaWHbwgtLvi',

  // 드라이브 폴더 ID (사람인 CPI / DA 링크에서 추출)
  CPI_ROOT_FOLDER_ID: '11SIntvBWeplheOvl2Wz74FZB-rQHx6Xj',
  DA_ROOT_FOLDER_ID: '1gAvzZozBW64vyyMeOP6Wt7RJ45lKx3rb',

  RAW_SHEET_NAME: 'RAW',
  SUMMARY_SHEET_NAME: 'Summary',

  // 예산 라벨 셀 탐색 시 사용할 텍스트 (Summary 탭 상단에 위치)
  BUDGET_LABEL_TEXT: '월 예산',

  // 변환용 임시 구글시트를 만들 폴더 (미지정 시 내 드라이브 최상단에 생성 후 바로 삭제)
  TEMP_FOLDER_ID: null,

  // 하이라이트 색상 (실제 리포트 양식 참고)
  HIGHLIGHT_TITLE_BG: '#C9DAF8',  // <사람인 CPI>/<사람인 DA> 하늘색
  HIGHLIGHT_GROUP_BG: '#FFFF00',  // 사람인스토어/DA 노란색
};

// ---------------------------------------------------------------------------
// CPI RAW 컬럼명. normalizeHeader_() 가 공백/줄바꿈을 전부 제거해서 매칭하므로
// 아래 값들도 공백 없이 적는다 (예: "Event Date" -> "EventDate").
// ---------------------------------------------------------------------------
const CPI_RAW_COLS = {
  DATE: 'EventDate',
  CHANNEL: 'Channel',
  CAMPAIGN: 'Campaign',
  IMPS: 'Imps.',
  CLICK: 'Click',
  INSTALL: 'Install',
  SPENT: 'Spent',
  APP_OPEN: 'TotalOpens(App)',
  APPLY: 'apply_completed(App)',
};

const CPI_MEDIA_CONFIG = [
  {
    key: 'asa',
    label: 'ASA',
    match: (row) => row[CPI_RAW_COLS.CAMPAIGN] === 'ASA_Install_iOS',
    metrics: ['imps', 'click', 'ctr', 'cpc', 'spent', 'install', 'cpi'],
  },
  {
    key: 'google_install',
    label: 'Google AC - Install_AOS',
    match: (row) => row[CPI_RAW_COLS.CAMPAIGN] === 'Install_AOS',
    metrics: ['spent', 'install', 'cpi', 'appOpen', 'cpe'],
  },
  {
    key: 'google_apply',
    label: 'Google AC - Apply_AOS',
    match: (row) => row[CPI_RAW_COLS.CAMPAIGN] === 'Action_Apply_AOS',
    metrics: ['spent', 'apply', 'cpa'],
  },
];

// ---------------------------------------------------------------------------
// DA RAW 컬럼명 (공백 없이 표기, normalizeHeader_ 참고)
// ---------------------------------------------------------------------------
const DA_RAW_COLS = {
  DATE: 'Date',
  CHANNEL: 'Channel',
  MEDIA: 'Media',
  DA: 'DA',
  OBJECTIVE: 'Objective',
  CAMPAIGN: 'Campaign',
  CREATIVE: 'Creative',
  IMPS: 'Imps.',
  CLICK: 'Click',
  SPENT: 'Spent',
  INSTALL: 'Install(+SKAN)',
  APP_OPEN: 'TotalOpens(App+Web)',
  SIGNUP: '회원가입(+SKAN)',
  APPLY: 'apply_completed(App+Web)',
  PRODUCT_VIEW: 'fortune_counsel_try(App+Web)', // 상품보기
  PURCHASE: '구매완료(App+Web)',
  REVENUE: '구매액(App+Web)',
};

// logDistinctDaValues_() 실행 로그로 실측 확인된 값 기준 (Channel | Media | DA | Objective | Campaign):
//   AdisonOfferwall | AdisonOfferwall | DA | Install | install_AOS/iOS
//   Buzzvil | Buzzvil | DA | Install|SignUp|Youtube_sub | ...
//   CookieOven | CookieOven | DA | Install | Install_AOS/iOS
//   appier | appier | DA | Install|SignUp | ...
//   criteo | Criteo | DA | Apply | Apply_Web_*
//   facebook.business | Meta | DA|사람인스토어 | Install|Conversion|Traffic | ...
//   greenp | greenp | DA | Traffic | Install_AOS/iOS  (그린피 - Objective 이름은 Traffic이지만 실제로는 실행형 매체)
//   inmobi | inmobi | DA | Install | install_iOS
//   rtbhouse | RTBhouse | DA | Apply | Apply_AOS/iOS
//   taboola | taboola | DA | Traffic | Traffic_WEB
// 중요: DA 컬럼 값이 'DA' 또는 '사람인스토어' 로 구분되어 있어, 메타 자체 캠페인과
// 사람인스토어 캠페인을 이 컬럼으로 정확히 나눌 수 있음 (Media 컬럼이 아님).
const DA_MEDIA_CONFIG = [
  {
    key: 'meta_store_conversion',
    label: '사람인스토어 [메타] Conversion',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'facebook.business' &&
      row[DA_RAW_COLS.DA] === '사람인스토어' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'Conversion',
    metrics: ['productView', 'purchase', 'revenue', 'roas'],
  },
  {
    key: 'meta_store_traffic',
    label: '사람인스토어 [메타] Traffic Web',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'facebook.business' &&
      row[DA_RAW_COLS.DA] === '사람인스토어' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'Traffic',
    metrics: ['spent', 'imps', 'click', 'ctr', 'cpc'],
  },
  {
    key: 'meta_install',
    label: '[머신러닝-앱설치] Meta(자체) Install',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'facebook.business' &&
      row[DA_RAW_COLS.DA] === 'DA' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'Install',
    metrics: ['spent', 'install', 'cpi', 'appOpen', 'cpe'],
  },
  {
    key: 'appier_install',
    label: '[머신러닝-앱설치] 애피어 Install',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'appier' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'Install',
    metrics: ['spent', 'install', 'cpi'],
  },
  {
    key: 'appier_signup',
    label: '[머신러닝-앱설치] 애피어 Signup(입사지원)',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'appier' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'SignUp',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'inmobi_install',
    label: '[머신러닝-앱설치] 인모비 Install',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'inmobi',
    metrics: ['spent', 'install', 'cpi'],
  },
  {
    key: 'rtbh_apply',
    label: '[머신러닝-입사지원] RTBH',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'rtbhouse',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'criteo_apply',
    label: '[머신러닝-입사지원] 크리테오',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'criteo',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'taboola_traffic',
    label: '[머신러닝-트래픽] 타불라',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'taboola',
    metrics: ['spent', 'imps', 'click', 'ctr', 'cpc'],
  },
  {
    key: 'rcpa_buzzvil',
    label: '[rCPA] 버즈빌',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Buzzvil' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'SignUp',
    metrics: ['spent', 'signup', 'cpaSignup'],
  },
  {
    // "앱 실행" 전용 컬럼이 RAW 헤더에서 확인되지 않아, 임시로 Total Opens(App+Web) 컬럼을
    // "실행수"로 대체 사용합니다. 실제 컬럼이 따로 있다면 metrics/appOpen 매핑을 수정하세요.
    key: 'rcpe_total',
    label: '[rCPE] 애디슨오퍼월-네트워크/쿠키오븐, 그린피 (앱 실행)',
    match: (row) => ['AdisonOfferwall', 'CookieOven', 'greenp'].indexOf(row[DA_RAW_COLS.CHANNEL]) !== -1,
    metrics: ['spent', 'appOpen', 'cpe'],
  },
];
