/**
 * 사람인 CPI/DA 데일리 리포트 자동 코멘트 발송 - 전체 코드 (한 파일 버전)
 */

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
 * ⚠️ SR_DA_MEDIA_CONFIG 안의 Channel/Media 매칭값은 탭 이름을 바탕으로 한 추정치입니다.
 *    반드시 SR_logDistinctDaValues_() 를 한 번 실행해서 실행 로그(보기 > 로그)에 찍히는
 *    실제 Channel / Media / DA / Objective 값과 대조 후 필요하면 수정해 주세요.
 */

const SR_CONFIG = {
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

  // 예산 라벨 셀 탐색 시 사용할 텍스트 (CPI Summary 탭에서 사용, 라벨 검색 방식)
  BUDGET_LABEL_TEXT: '월 예산',

  // DA Summary 탭은 라벨 검색이 아니라 이 셀 값을 직접 당월 총 예산으로 사용
  DA_BUDGET_CELL: 'C7',

  // 나인즈는 RAW에 매체 성과 데이터가 없고(월 정액 예산을 영업일수로 나눠 소진하는 방식),
  // 원본 파일의 수식으로만 표시되던 값이라 변환 사본에서는 읽을 수 없다. 매월 고정 예산을
  // 여기서 하드코딩해서 영업일(월~금) 비례로 직접 계산해 DA 소진액에 더한다.
  // 금액이 바뀌면 이 값만 수정하면 됨.
  DA_NINE_MONTHLY_BUDGET: 20000000,

  // 변환용 임시 구글시트를 만들 폴더 (미지정 시 내 드라이브 최상단에 생성 후 바로 삭제)
  TEMP_FOLDER_ID: null,

  // 하이라이트 색상 (실제 리포트 양식 참고)
  HIGHLIGHT_TITLE_BG: '#C9DAF8',  // <사람인 CPI>/<사람인 DA> 하늘색
  HIGHLIGHT_GROUP_BG: '#FFFF00',  // 사람인스토어/DA 노란색
};

// ---------------------------------------------------------------------------
// CPI RAW 컬럼명. SR_normalizeHeader_() 가 공백/줄바꿈을 전부 제거해서 매칭하므로
// 아래 값들도 공백 없이 적는다 (예: "Event Date" -> "EventDate").
// ---------------------------------------------------------------------------
const SR_CPI_RAW_COLS = {
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

const SR_CPI_MEDIA_CONFIG = [
  {
    key: 'asa',
    label: 'ASA',
    match: (row) => row[SR_CPI_RAW_COLS.CAMPAIGN] === 'ASA_Install_iOS',
    metrics: ['imps', 'click', 'ctr', 'cpc', 'spent', 'install', 'cpi'],
  },
  {
    key: 'google_install',
    label: 'Google AC - Install_AOS',
    match: (row) => row[SR_CPI_RAW_COLS.CAMPAIGN] === 'Install_AOS',
    metrics: ['spent', 'install', 'cpi', 'appOpen', 'cpe'],
  },
  {
    key: 'google_apply',
    label: 'Google AC - Apply_AOS',
    match: (row) => row[SR_CPI_RAW_COLS.CAMPAIGN] === 'Action_Apply_AOS',
    metrics: ['spent', 'apply', 'cpa'],
  },
];

// ---------------------------------------------------------------------------
// DA RAW 컬럼명 (공백 없이 표기, SR_normalizeHeader_ 참고)
// ---------------------------------------------------------------------------
const SR_DA_RAW_COLS = {
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

// SR_logDistinctDaValues_() 실행 로그로 실측 확인된 값 기준 (Channel | Media | DA | Objective | Campaign):
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
const SR_DA_MEDIA_CONFIG = [
  {
    key: 'meta_store_conversion',
    label: '사람인스토어 [메타] Conversion',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'facebook.business' &&
      row[SR_DA_RAW_COLS.DA] === '사람인스토어' &&
      row[SR_DA_RAW_COLS.OBJECTIVE] === 'Conversion',
    metrics: ['productView', 'purchase', 'revenue', 'roas'],
  },
  {
    key: 'meta_store_traffic',
    label: '사람인스토어 [메타] Traffic Web',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'facebook.business' &&
      row[SR_DA_RAW_COLS.DA] === '사람인스토어' &&
      row[SR_DA_RAW_COLS.OBJECTIVE] === 'Traffic',
    metrics: ['spent', 'imps', 'click', 'ctr', 'cpc'],
  },
  {
    key: 'meta_install',
    label: '[머신러닝-앱설치] Meta(자체) Install',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'facebook.business' &&
      row[SR_DA_RAW_COLS.DA] === 'DA' &&
      row[SR_DA_RAW_COLS.OBJECTIVE] === 'Install',
    metrics: ['spent', 'install', 'cpi', 'appOpen', 'cpe'],
  },
  {
    key: 'appier_install',
    label: '[머신러닝-앱설치] 애피어 Install',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'appier' &&
      row[SR_DA_RAW_COLS.OBJECTIVE] === 'Install',
    metrics: ['spent', 'install', 'cpi'],
  },
  {
    key: 'appier_signup',
    label: '[머신러닝-앱설치] 애피어 Signup(입사지원)',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'appier' &&
      row[SR_DA_RAW_COLS.OBJECTIVE] === 'SignUp',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'inmobi_install',
    label: '[머신러닝-앱설치] 인모비 Install',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'inmobi',
    metrics: ['spent', 'install', 'cpi'],
  },
  {
    key: 'rtbh_apply',
    label: '[머신러닝-입사지원] RTBH',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'rtbhouse',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'criteo_apply',
    label: '[머신러닝-입사지원] 크리테오',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'criteo',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'taboola_traffic',
    label: '[머신러닝-트래픽] 타불라',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'taboola',
    metrics: ['spent', 'imps', 'click', 'ctr', 'cpc'],
  },
  {
    key: 'rcpa_buzzvil',
    label: '[rCPA] 버즈빌',
    match: (row) => row[SR_DA_RAW_COLS.CHANNEL] === 'Buzzvil' &&
      row[SR_DA_RAW_COLS.OBJECTIVE] === 'SignUp',
    metrics: ['spent', 'signup', 'cpaSignup'],
  },
  {
    // "앱 실행" 전용 컬럼이 RAW 헤더에서 확인되지 않아, 임시로 Total Opens(App+Web) 컬럼을
    // "실행수"로 대체 사용합니다. 실제 컬럼이 따로 있다면 metrics/appOpen 매핑을 수정하세요.
    // 버즈빌은 SignUp(=rCPA)과 Install(=rCPE 실행) 두 캠페인을 같이 운영하므로, 여기서는
    // Objective가 'Install'인 버즈빌 행만 포함시킨다 (SignUp/Youtube_sub는 rcpa_buzzvil 쪽).
    key: 'rcpe_total',
    label: '[rCPE] 애디슨오퍼월-네트워크/쿠키오븐, 그린피, 버즈빌 (앱 실행)',
    match: (row) => {
      const ch = row[SR_DA_RAW_COLS.CHANNEL];
      if (ch === 'Buzzvil') return row[SR_DA_RAW_COLS.OBJECTIVE] === 'Install';
      return ['AdisonOfferwall', 'CookieOven', 'greenp'].indexOf(ch) !== -1;
    },
    metrics: ['spent', 'appOpen', 'cpe'],
  },
];

/**
 * 공용 유틸리티: 날짜, 숫자/통화 포맷, 시트 읽기, 라벨 셀 탐색
 */

function SR_addDays_(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

// "8/11" 형태 (0 패딩 없음)
function SR_formatMD_(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function SR_formatDateKey_(date) {
  return Utilities.formatDate(date, SR_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function SR_isWeekday_(date) {
  const day = date.getDay(); // 0=일, 6=토
  return day !== 0 && day !== 6;
}

// 해당 연/월(monthIndex0: 0=1월)의 영업일(월~금) 수
function SR_businessDaysInMonth_(year, monthIndex0) {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (SR_isWeekday_(new Date(year, monthIndex0, d))) count++;
  }
  return count;
}

// 해당 연/월 1일부터 dayOfMonth일까지(포함)의 영업일(월~금) 수
function SR_businessDaysElapsed_(year, monthIndex0, dayOfMonth) {
  let count = 0;
  for (let d = 1; d <= dayOfMonth; d++) {
    if (SR_isWeekday_(new Date(year, monthIndex0, d))) count++;
  }
  return count;
}

// 나인즈처럼 "월 정액 예산을 당월 영업일수로 나눠 경과 영업일만큼 소진"하는 매체의
// targetDate 기준 누적 소진액을 계산 (공휴일은 반영하지 않음 - 순수 월~금 기준).
function SR_proratedBusinessDaySpend_(monthlyBudget, targetDate) {
  const year = targetDate.getFullYear();
  const monthIndex0 = targetDate.getMonth();
  const totalBizDays = SR_businessDaysInMonth_(year, monthIndex0);
  const elapsedBizDays = SR_businessDaysElapsed_(year, monthIndex0, targetDate.getDate());
  if (!totalBizDays) return 0;
  return (monthlyBudget / totalBizDays) * elapsedBizDays;
}

// 헤더 셀 안의 줄바꿈/공백 위치가 파일마다 조금씩 다를 수 있고(예: "Install\n(+SKAN)" vs
// "Install (+SKAN)"), 눈에 안 보이는 제어문자(예: 백스페이스)가 섞여 들어간 경우도 확인됨.
// 매칭용 키는 공백/제어문자를 전부 제거해서 만든다. Config.gs 의 *_RAW_COLS 상수들도
// 반드시 같은 방식(공백 없이)으로 적어야 한다.
function SR_normalizeHeader_(h) {
  return String(h == null ? '' : h).replace(/[\x00-\x20\x7F]+/g, '').trim();
}

// "₩1,234,567", "39.7%", 1234, "" 등을 모두 숫자로 변환. 실패 시 0.
function SR_toNumber_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₩,%\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function SR_commaInt_(n) {
  return Math.round(n).toLocaleString('ko-KR');
}

function SR_wonText_(n) {
  return `${SR_commaInt_(n)}원`;
}

// 1억 이상이면 "1억 5,950만 원", 미만이면 "1,741만 원" 형태로 표시 (원 단위 반올림)
function SR_manWonText_(n) {
  const manTotal = Math.round(n / 10000);
  const eok = Math.floor(manTotal / 10000);
  const man = manTotal % 10000;
  if (eok > 0) {
    return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만 원` : `${eok}억 원`;
  }
  return `${man.toLocaleString('ko-KR')}만 원`;
}

function SR_pctText_(ratio0to1, decimals) {
  return `${(ratio0to1 * 100).toFixed(decimals == null ? 1 : decimals)}%`;
}

function SR_arrow_(delta) {
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '-';
}

// cur, prev: 숫자. formatter: 값 -> 문자열
function SR_withDelta_(cur, prev, formatter) {
  const delta = cur - prev;
  const deltaAbs = formatter(Math.abs(delta));
  return `${formatter(cur)} (${SR_arrow_(delta)}${deltaAbs})`;
}

// HTML 본문에서도 색상/볼드 없이 일반 텍스트와 동일하게 표시 (요청에 따라 스타일 제거)
function SR_withDeltaHtml_(cur, prev, formatter) {
  return SR_withDelta_(cur, prev, formatter);
}

function SR_htmlEscape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function SR_safeDivide_(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

/**
 * xlsx -> Google Sheets 임시 변환본을 열어서 callback(spreadsheet) 실행 후 임시 파일 삭제.
 * Advanced Drive Service(Drive v3)가 appsscript.json 에 활성화되어 있어야 함.
 */
function SR_withTempSheet_(fileId, callback) {
  const resource = {
    name: 'tmp_report_' + fileId + '_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_SHEETS,
  };
  if (SR_CONFIG.TEMP_FOLDER_ID) {
    resource.parents = [SR_CONFIG.TEMP_FOLDER_ID];
  }
  const converted = DriveV3.Files.copy(resource, fileId);
  const tempId = converted.id;
  try {
    const ss = SpreadsheetApp.openById(tempId);
    return callback(ss);
  } finally {
    try {
      DriveV3.Files.remove(tempId);
    } catch (e) {
      Logger.log('임시 파일 삭제 실패 (수동 삭제 필요): ' + tempId + ' / ' + e);
    }
  }
}

// 실제 리포트 파일은 RAW 탭 맨 위 몇 줄이 제목/안내문구인 경우가 있어(DA 리포트는 7행부터
// 헤더), 1행을 무조건 헤더로 가정하지 않고 "Spent"와 "Channel"이 함께 있는 행을 찾아
// 그 행을 헤더로 사용한다.
function SR_findHeaderRow_(values) {
  for (let r = 0; r < Math.min(values.length, 20); r++) {
    const row = values[r].map((c) => String(c == null ? '' : c).trim());
    if (row.indexOf('Spent') !== -1 && row.indexOf('Channel') !== -1) return r;
  }
  return 0;
}

/**
 * 시트 데이터 전체를 헤더 기준 객체 배열로 읽기.
 * 반환: { headers: string[](정규화됨), rows: Object[] }
 */
function SR_readSheetAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return { headers: [], rows: [] };
  const headerRowIdx = SR_findHeaderRow_(values);
  const headers = values[headerRowIdx].map(SR_normalizeHeader_);
  const rows = [];
  for (let r = headerRowIdx + 1; r < values.length; r++) {
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = values[r][c];
    }
    rows.push(row);
  }
  return { headers, rows };
}

// 시트 좌상단 블록(라벨: 값) 에서 라벨 텍스트로 값 셀을 찾음. 못 찾으면 null.
function SR_findLabelValue_(sheet, labelText, searchRows, searchCols) {
  const rows = searchRows || 40;
  const cols = searchCols || 12;
  const range = sheet.getRange(1, 1, Math.min(rows, sheet.getMaxRows()), Math.min(cols, sheet.getMaxColumns()));
  const values = range.getValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const cell = values[r][c];
      if (typeof cell === 'string' && cell.trim() === labelText) {
        for (let c2 = c + 1; c2 < values[r].length; c2++) {
          if (values[r][c2] !== '' && values[r][c2] !== null) {
            return values[r][c2];
          }
        }
      }
    }
  }
  return null;
}

function SR_sameDateAsRow_(cellValue, targetDateKey) {
  if (!cellValue) return false;
  const d = (cellValue instanceof Date) ? cellValue : new Date(cellValue);
  if (isNaN(d.getTime())) return false;
  return Utilities.formatDate(d, SR_CONFIG.TIMEZONE, 'yyyy-MM-dd') === targetDateKey;
}

/**
 * RAW 행 배열에서 특정 날짜 + 매체 조건에 해당하는 행들을 합산.
 * sumCols: 합산할 컬럼명 배열 (RAW 헤더명과 동일해야 함)
 */
function SR_aggregateRaw_(rows, dateColName, targetDate, matchFn, sumCols) {
  const targetKey = SR_formatDateKey_(targetDate);
  const totals = {};
  sumCols.forEach((c) => (totals[c] = 0));
  let matchedRows = 0;
  rows.forEach((row) => {
    if (!SR_sameDateAsRow_(row[dateColName], targetKey)) return;
    if (matchFn && !matchFn(row)) return;
    matchedRows++;
    sumCols.forEach((c) => {
      totals[c] += SR_toNumber_(row[c]);
    });
  });
  totals._matchedRows = matchedRows;
  return totals;
}

/**
 * 이번 달 1일 ~ targetDate 까지 RAW 전체(조건 없음)의 Spent 합계 (MTD 소진액 계산용)
 */
function SR_sumSpentMonthToDate_(rows, dateColName, spentColName, targetDate) {
  const targetKey = SR_formatDateKey_(targetDate);
  const targetMonthPrefix = targetKey.slice(0, 7); // 'yyyy-MM'
  let total = 0;
  rows.forEach((row) => {
    const raw = row[dateColName];
    if (!raw) return;
    const d = (raw instanceof Date) ? raw : new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = SR_formatDateKey_(d);
    if (key.slice(0, 7) === targetMonthPrefix && key <= targetKey) {
      total += SR_toNumber_(row[spentColName]);
    }
  });
  return total;
}

/**
 * 드라이브 폴더에서 "실행 날짜와 동일한 년/월" 하위 폴더를 찾고,
 * 그 안에서 가장 최근에 업데이트된 .xlsx 리포트 파일을 반환.
 *
 * 폴더 구조 (확인됨): <루트 폴더>/YYYY.MM/(Wisebirds)사람인 ..._YYMMDD.xlsx
 */
function SR_findLatestReportFile_(rootFolderId, runDate) {
  const yyyymm = Utilities.formatDate(runDate, SR_CONFIG.TIMEZONE, 'yyyy.MM');
  const root = DriveApp.getFolderById(rootFolderId);
  const monthFolders = root.getFoldersByName(yyyymm);
  if (!monthFolders.hasNext()) {
    throw new Error(`'${yyyymm}' 폴더를 찾을 수 없습니다 (루트: ${root.getName()}).`);
  }
  const monthFolder = monthFolders.next();

  const files = monthFolder.getFiles();
  let latest = null;
  while (files.hasNext()) {
    const f = files.next();
    if (!/\.xlsx$/i.test(f.getName())) continue;
    if (!latest || f.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) {
      latest = f;
    }
  }
  if (!latest) {
    throw new Error(`'${yyyymm}' 폴더에 .xlsx 리포트 파일이 없습니다.`);
  }
  return latest;
}

/**
 * RAW 행 -> 의미 단위(semantic) 합계 -> 지표 텍스트 변환
 */

const SR_CPI_COL_MAP = {
  imps: SR_CPI_RAW_COLS.IMPS,
  click: SR_CPI_RAW_COLS.CLICK,
  spent: SR_CPI_RAW_COLS.SPENT,
  install: SR_CPI_RAW_COLS.INSTALL,
  appOpen: SR_CPI_RAW_COLS.APP_OPEN,
  apply: SR_CPI_RAW_COLS.APPLY,
};

const SR_DA_COL_MAP = {
  imps: SR_DA_RAW_COLS.IMPS,
  click: SR_DA_RAW_COLS.CLICK,
  spent: SR_DA_RAW_COLS.SPENT,
  install: SR_DA_RAW_COLS.INSTALL,
  appOpen: SR_DA_RAW_COLS.APP_OPEN,
  apply: SR_DA_RAW_COLS.APPLY,
  signup: SR_DA_RAW_COLS.SIGNUP,
  productView: SR_DA_RAW_COLS.PRODUCT_VIEW,
  purchase: SR_DA_RAW_COLS.PURCHASE,
  revenue: SR_DA_RAW_COLS.REVENUE,
};

/**
 * colMap 의 semantic key 들을 모두 합산한 totals 객체 반환 (RAW 헤더에 없는 컬럼은 0)
 */
function SR_aggregateSection_(rows, dateColName, colMap, matchFn, targetDate) {
  const semanticKeys = Object.keys(colMap);
  const rawCols = semanticKeys.map((k) => colMap[k]);
  const raw = SR_aggregateRaw_(rows, dateColName, targetDate, matchFn, rawCols);
  const totals = { _matchedRows: raw._matchedRows };
  semanticKeys.forEach((k) => {
    totals[k] = raw[colMap[k]] || 0;
  });
  return totals;
}

// 지표별 (현재값, 표시포맷) 계산
function SR_computeDerived_(totals) {
  return {
    imps: totals.imps || 0,
    click: totals.click || 0,
    ctr: SR_safeDivide_(totals.click, totals.imps),
    cpc: SR_safeDivide_(totals.spent, totals.click),
    spent: totals.spent || 0,
    install: totals.install || 0,
    cpi: SR_safeDivide_(totals.spent, totals.install),
    appOpen: totals.appOpen || 0,
    cpe: SR_safeDivide_(totals.spent, totals.appOpen),
    apply: totals.apply || 0,
    cpa: SR_safeDivide_(totals.spent, totals.apply),
    signup: totals.signup || 0,
    cpaSignup: SR_safeDivide_(totals.spent, totals.signup),
    productView: totals.productView || 0,
    purchase: totals.purchase || 0,
    revenue: totals.revenue || 0,
    roas: SR_safeDivide_(totals.revenue, totals.spent),
  };
}

const SR_METRIC_LABELS = {
  imps: '노출',
  click: '클릭',
  ctr: 'CTR',
  cpc: 'CPC',
  spent: '광고비',
  install: '설치',
  cpi: 'CPI',
  appOpen: '앱오픈',
  cpe: 'CPE',
  apply: '입사지원',
  cpa: 'CPA',
  signup: '가입',
  cpaSignup: '가입 CPA',
  productView: '상품보기',
  purchase: '구매',
  revenue: '매출',
  roas: 'ROAS',
};

function SR_formatMetric_(key, cur, prev) {
  const label = SR_METRIC_LABELS[key] || key;
  switch (key) {
    case 'ctr':
    case 'roas':
      return `${label} ${SR_withDelta_(cur, prev, (v) => SR_pctText_(v))}`;
    case 'cpc':
    case 'cpi':
    case 'cpe':
    case 'cpa':
    case 'cpaSignup':
      return `${label} ${SR_withDelta_(cur, prev, (v) => SR_wonText_(v))}`;
    case 'spent':
    case 'revenue':
      return `${label} 약 ${SR_withDelta_(cur, prev, (v) => SR_manWonText_(v))}`;
    default:
      // imps, click, install, appOpen, apply, signup, productView, purchase 등 건수형
      return `${label} ${SR_withDelta_(cur, prev, (v) => `${SR_commaInt_(v)}건`)}`;
  }
}

/**
 * metricKeys 순서대로 "라벨 값 (증감)" 문자열 배열 생성
 */
function SR_buildMetricLines_(metricKeys, curTotals, prevTotals) {
  const curD = SR_computeDerived_(curTotals);
  const prevD = SR_computeDerived_(prevTotals);
  return metricKeys.map((k) => SR_formatMetric_(k, curD[k] || 0, prevD[k] || 0));
}

// SR_formatMetric_ 의 HTML 버전: 증감 부분에 색상(▲빨강/▼파랑)을 입힌다.
function SR_formatMetricHtml_(key, cur, prev) {
  const label = SR_htmlEscape_(SR_METRIC_LABELS[key] || key);
  switch (key) {
    case 'ctr':
    case 'roas':
      return `${label} ${SR_withDeltaHtml_(cur, prev, (v) => SR_pctText_(v))}`;
    case 'cpc':
    case 'cpi':
    case 'cpe':
    case 'cpa':
    case 'cpaSignup':
      return `${label} ${SR_withDeltaHtml_(cur, prev, (v) => SR_wonText_(v))}`;
    case 'spent':
    case 'revenue':
      return `${label} 약 ${SR_withDeltaHtml_(cur, prev, (v) => SR_manWonText_(v))}`;
    default:
      return `${label} ${SR_withDeltaHtml_(cur, prev, (v) => `${SR_commaInt_(v)}건`)}`;
  }
}

function SR_buildMetricLinesHtml_(metricKeys, curTotals, prevTotals) {
  const curD = SR_computeDerived_(curTotals);
  const prevD = SR_computeDerived_(prevTotals);
  return metricKeys.map((k) => SR_formatMetricHtml_(k, curD[k] || 0, prevD[k] || 0));
}

/**
 * 실제 사용 중인 메일 양식(하늘색/노란색 하이라이트, 굵게, ㄴ 서브불릿 구조)에 맞춘
 * CPI/DA 섹션 빌더. 숫자는 전부 RAW 데이터를 날짜+매체 조건으로 집계해서 계산하고,
 * "⏩" 같은 분석가 판단이 들어간 코멘트나 소재 단위 하이라이트는 자동 생성하지 않는다.
 */

function SR_mediaByKey_(list, key) {
  const found = list.filter((c) => c.key === key)[0];
  if (!found) throw new Error(`MEDIA_CONFIG 에서 key="${key}" 를 찾지 못했습니다.`);
  return found;
}

// key 로 지정된 매체의 전일/직전일 집계값(합산 totals, SR_computeDerived_ 적용 전)을 반환
function SR_mediaTotals_(mediaConfigList, rows, dateColName, colMap, key, yesterday, dayBefore) {
  const cfg = SR_mediaByKey_(mediaConfigList, key);
  const cur = SR_aggregateSection_(rows, dateColName, colMap, cfg.match, yesterday);
  const prev = SR_aggregateSection_(rows, dateColName, colMap, cfg.match, dayBefore);
  return { cur: SR_computeDerived_(cur), prev: SR_computeDerived_(prev), matched: cur._matchedRows > 0 || prev._matchedRows > 0 };
}

// 이번 달 1일 ~ targetDate 까지 누적 합산 (rCPA/rCPE 처럼 "전일자"가 아니라 "총합" 운영값이
// 필요한 매체용). 반환값은 SR_computeDerived_ 적용된 값 그대로 (증감 비교 없음).
function SR_aggregateSectionMTD_(rows, dateColName, colMap, matchFn, targetDate) {
  const targetKey = SR_formatDateKey_(targetDate);
  const monthPrefix = targetKey.slice(0, 7);
  const semanticKeys = Object.keys(colMap);
  const totals = {};
  semanticKeys.forEach((k) => (totals[k] = 0));
  rows.forEach((row) => {
    const raw = row[dateColName];
    if (!raw) return;
    const d = (raw instanceof Date) ? raw : new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = SR_formatDateKey_(d);
    if (key.slice(0, 7) !== monthPrefix || key > targetKey) return;
    if (matchFn && !matchFn(row)) return;
    semanticKeys.forEach((k) => {
      totals[k] += SR_toNumber_(row[colMap[k]]);
    });
  });
  return SR_computeDerived_(totals);
}

function SR_mediaMTD_(mediaConfigList, rows, dateColName, colMap, key, targetDate) {
  const cfg = SR_mediaByKey_(mediaConfigList, key);
  return SR_aggregateSectionMTD_(rows, dateColName, colMap, cfg.match, targetDate);
}

// budgetCellRef 가 주어지면 (예: 'C7') Summary 탭에서 라벨을 찾는 대신 그 셀 값을 직접 읽는다.
// extraMtdSpent: RAW에 없는 매체(예: 나인즈, 정액/영업일 비례 소진)의 소진액을 추가로 더할 때 사용.
function SR_buildBudgetLineText_(summarySheet, rawRows, dateColName, spentColName, targetDate, totalBudgetLabel, budgetCellRef, extraMtdSpent) {
  const budget = budgetCellRef
    ? SR_toNumber_(summarySheet.getRange(budgetCellRef).getValue())
    : SR_toNumber_(SR_findLabelValue_(summarySheet, SR_CONFIG.BUDGET_LABEL_TEXT));
  const mtdSpent = SR_sumSpentMonthToDate_(rawRows, dateColName, spentColName, targetDate) + (extraMtdSpent || 0);
  const pct = SR_safeDivide_(mtdSpent, budget);
  const yy = targetDate.getFullYear() % 100;
  const month = targetDate.getMonth() + 1;
  if (!budget) {
    const where = budgetCellRef ? `셀: "${budgetCellRef}"` : `라벨: "${SR_CONFIG.BUDGET_LABEL_TEXT}"`;
    return `- ${totalBudgetLabel} 예산 정보를 Summary 탭에서 찾지 못했습니다 (${where}). 확인해 주세요.`;
  }
  return `- ${yy}년 ${month}월 예산 ${SR_manWonText_(budget)} 중 약 ${SR_pctText_(pct)}인 약 ${SR_manWonText_(mtdSpent)} 소진 운영 중입니다.`;
}

// ---------------------------------------------------------------------------
// 텍스트(plain) 버전 - 메일 클라이언트가 HTML 을 못 읽을 때의 대체 본문
// ---------------------------------------------------------------------------

function SR_buildCpiSection_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(SR_CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(SR_CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`CPI 파일에서 '${SR_CONFIG.SUMMARY_SHEET_NAME}' 또는 '${SR_CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = SR_readSheetAsObjects_(rawSheet);
  const budgetLine = SR_buildBudgetLineText_(summarySheet, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_RAW_COLS.SPENT, yesterday, 'CPI');

  const asa = SR_mediaTotals_(SR_CPI_MEDIA_CONFIG, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_COL_MAP, 'asa', yesterday, dayBefore);
  const gi = SR_mediaTotals_(SR_CPI_MEDIA_CONFIG, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_COL_MAP, 'google_install', yesterday, dayBefore);
  const ga = SR_mediaTotals_(SR_CPI_MEDIA_CONFIG, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_COL_MAP, 'google_apply', yesterday, dayBefore);

  const asaLine = `- 전일 ASA 캠페인 광고비 약 ${SR_manWonText_(asa.cur.spent)} 소진 운영 간 CTR ${SR_withDelta_(asa.cur.ctr, asa.prev.ctr, SR_pctText_)}, CPC ${SR_withDelta_(asa.cur.cpc, asa.prev.cpc, SR_wonText_)} 발생으로 유입 ${SR_commaInt_(asa.cur.click)}건 확보, CPI ${SR_withDelta_(asa.cur.cpi, asa.prev.cpi, SR_wonText_)}, 설치 ${SR_withDelta_(asa.cur.install, asa.prev.install, SR_commaInt_)}건 확보`;

  const gaLines = [
    `-  Install_AOS 캠페인 CPI ${SR_wonText_(gi.cur.cpi)} 기록 / Apply_AOS 캠페인 지원 CPA ${SR_wonText_(ga.cur.cpa)} 기록`,
    `ㄴ Install 캠페인 광고비 약 ${SR_manWonText_(gi.cur.spent)} 소진 간 CPE ${SR_withDelta_(gi.cur.cpe, gi.prev.cpe, SR_wonText_)} 발생, CPI ${SR_withDelta_(gi.cur.cpi, gi.prev.cpi, SR_wonText_)} 발생으로 앱오픈 ${SR_withDelta_(gi.cur.appOpen, gi.prev.appOpen, SR_commaInt_)}건 및 설치 수 ${SR_withDelta_(gi.cur.install, gi.prev.install, SR_commaInt_)}건 확보`,
    `ㄴ Apply 캠페인 광고비 약 ${SR_manWonText_(ga.cur.spent)} 소진 간 CPA ${SR_withDelta_(ga.cur.cpa, ga.prev.cpa, SR_wonText_)} 발생, 지원 수 ${SR_withDelta_(ga.cur.apply, ga.prev.apply, SR_commaInt_)}건 확보`,
  ];

  return `<사람인 CPI>\n${budgetLine}\n\n[ASA]\n${asaLine}\n\n[Google AC]\n${gaLines.join('\n')}`;
}

function SR_buildDaSection_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(SR_CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(SR_CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`DA 파일에서 '${SR_CONFIG.SUMMARY_SHEET_NAME}' 또는 '${SR_CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = SR_readSheetAsObjects_(rawSheet);
  const nineSpent = SR_proratedBusinessDaySpend_(SR_CONFIG.DA_NINE_MONTHLY_BUDGET, yesterday);
  const budgetLine = SR_buildBudgetLineText_(summarySheet, rows, SR_DA_RAW_COLS.DATE, SR_DA_RAW_COLS.SPENT, yesterday, 'DA', SR_CONFIG.DA_BUDGET_CELL, nineSpent);
  const month = yesterday.getMonth() + 1;

  const mc = SR_DA_MEDIA_CONFIG;
  const T = (key) => SR_mediaTotals_(mc, rows, SR_DA_RAW_COLS.DATE, SR_DA_COL_MAP, key, yesterday, dayBefore);
  const conv = T('meta_store_conversion');
  const traf = T('meta_store_traffic');
  const metaInstall = T('meta_install');
  const appierInstall = T('appier_install');
  const appierSignup = T('appier_signup');
  const inmobi = T('inmobi_install');
  const rtbh = T('rtbh_apply');
  const criteo = T('criteo_apply');
  const taboola = T('taboola_traffic');
  // rCPA/rCPE는 전일자 비교가 아니라 이번 달 누적(총합) 운영값으로 표기
  const buzzvil = SR_mediaMTD_(mc, rows, SR_DA_RAW_COLS.DATE, SR_DA_COL_MAP, 'rcpa_buzzvil', yesterday);
  const rcpe = SR_mediaMTD_(mc, rows, SR_DA_RAW_COLS.DATE, SR_DA_COL_MAP, 'rcpe_total', yesterday);

  const metaLines = [
    `- 메타 사람인스토어 Conversion 캠페인 전일 상품보기 ${SR_withDelta_(conv.cur.productView, conv.prev.productView, SR_commaInt_)}건 및 구매 ${SR_withDelta_(conv.cur.purchase, conv.prev.purchase, SR_commaInt_)}건 발생, 구매액 약 ${SR_manWonText_(conv.cur.revenue)}`,
    `- Traffic Web 캠페인 전일 광고비 약 ${SR_manWonText_(traf.cur.spent)} 소진 운영 간 CTR ${SR_withDelta_(traf.cur.ctr, traf.prev.ctr, SR_pctText_)} 기록 및 CPC ${SR_withDelta_(traf.cur.cpc, traf.prev.cpc, SR_wonText_)} 발생`,
  ];

  const installLines = [
    `- Install(AOS/iOS) 캠페인 전일 CPI ${SR_withDelta_(metaInstall.cur.cpi, metaInstall.prev.cpi, SR_wonText_)} 발생, 광고비 약 ${SR_manWonText_(metaInstall.cur.spent)} 소진 간 설치 수 ${SR_withDelta_(metaInstall.cur.install, metaInstall.prev.install, SR_commaInt_)}건 확보`,
    ``,
    `- 애피어 전일 Install_iOS 캠페인 CPI ${SR_withDelta_(appierInstall.cur.cpi, appierInstall.prev.cpi, SR_wonText_)} 발생, 광고비 약 ${SR_manWonText_(appierInstall.cur.spent)} 운영 간 설치 수 ${SR_withDelta_(appierInstall.cur.install, appierInstall.prev.install, SR_commaInt_)}건 확보`,
    `ㄴ Signup_AOS/iOS 캠페인 CPA ${SR_withDelta_(appierSignup.cur.cpa, appierSignup.prev.cpa, SR_wonText_)} 발생 및 광고비 약 ${SR_manWonText_(appierSignup.cur.spent)} 소진 간 입사지원 ${SR_withDelta_(appierSignup.cur.apply, appierSignup.prev.apply, SR_commaInt_)}건 확보`,
    ``,
    `- 인모비 Install_iOS 캠페인 설치 ${SR_withDelta_(inmobi.cur.install, inmobi.prev.install, SR_commaInt_)}건 확보 및 CPI ${SR_withDelta_(inmobi.cur.cpi, inmobi.prev.cpi, SR_wonText_)} 기록`,
  ];

  const applyLines = [
    `- RTBH 광고비 약 ${SR_manWonText_(rtbh.cur.spent)} 소진 간 CPA ${SR_withDelta_(rtbh.cur.cpa, rtbh.prev.cpa, SR_wonText_)} 기록하며 지원 수 ${SR_withDelta_(rtbh.cur.apply, rtbh.prev.apply, SR_commaInt_)}건 확보`,
    `- 크리테오 전일 ${SR_manWonText_(criteo.cur.spent)} 소진 간 지원 CPA ${SR_withDelta_(criteo.cur.cpa, criteo.prev.cpa, SR_wonText_)} 및 입사지원 수 ${SR_withDelta_(criteo.cur.apply, criteo.prev.apply, SR_commaInt_)}건 확보`,
  ];

  const trafficLine = `- 타불라 광고비 약 ${SR_manWonText_(taboola.cur.spent)} 소진 간 CPC ${SR_withDelta_(taboola.cur.cpc, taboola.prev.cpc, SR_wonText_)} 발생, CTR ${SR_withDelta_(taboola.cur.ctr, taboola.prev.ctr, SR_pctText_)} 발생으로 유입 ${SR_commaInt_(taboola.cur.click)}건 확보`;

  const rcpLines = [
    `- rCPA 운영 매체 '버즈빌' 회원가입 총 ${SR_commaInt_(buzzvil.signup)}건 확보 및 CPA ${SR_wonText_(buzzvil.cpaSignup)} 기록 운영 중`,
    `- rCPE 매체 앱 설치+실행 운영 매체(애디슨오퍼월-네트워크, 애디슨오퍼월-쿠키오븐, 그린피, 버즈빌) 앱 실행 단가 ${SR_wonText_(rcpe.cpe)}로 운영 중`,
  ];

  return `<사람인 DA>\n${budgetLine}\n*${month}월 예산 사람인스토어, 나인즈, 유튜브 구독 캠페인 포함된 예산입니다. (예비비 300만원 제외)\n\n사람인스토어\n[메타]\n${metaLines.join('\n')}\n\nDA\n[머신러닝 - 앱설치 매체]\n${installLines.join('\n')}\n\n[머신러닝 - 입사지원 매체]\n${applyLines.join('\n')}\n\n[머신러닝 - 트래픽 매체]\n${trafficLine}\n\n[rCPE/rCPA]\n${rcpLines.join('\n')}`;
}

function SR_buildEmailBody_(yesterday, cpiSection, daSection) {
  const dateText = SR_formatMD_(yesterday);
  return `안녕하세요,
와이즈버즈 ${SR_CONFIG.GREETING_NAME}입니다.

📂 사람인 데일리 리포트 (${SR_CONFIG.DAILY_REPORT_LINK_URL})

${dateText} 기준 CPI, DA 데일리 리포트 코멘트 전달드립니다.

${cpiSection}


${daSection}


감사합니다.
${SR_CONFIG.GREETING_NAME} 드림`;
}

// ---------------------------------------------------------------------------
// HTML 버전 (폰트/하이라이트/줄바꿈/하이퍼링크 포함, 실제 발송용 htmlBody)
// ---------------------------------------------------------------------------

function SR_titleHtml_(text) {
  return `<p style="margin:20px 0 6px;"><b style="background-color:${SR_CONFIG.HIGHLIGHT_TITLE_BG};padding:1px 4px;">&lt;${text}&gt;</b></p>`;
}

function SR_groupHtml_(text) {
  return `<p style="margin:16px 0 2px;"><b style="background-color:${SR_CONFIG.HIGHLIGHT_GROUP_BG};padding:1px 4px;">${text}</b></p>`;
}

function SR_subHeaderHtml_(text) {
  return `<p style="margin:4px 0 2px;"><b>[${SR_htmlEscape_(text)}]</b></p>`;
}

function SR_linesHtml_(lines) {
  return `<p style="margin:0 0 10px;">${lines.filter((l) => l !== '').join('<br>')}</p>`;
}

function SR_buildCpiSectionHtml_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(SR_CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(SR_CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`CPI 파일에서 '${SR_CONFIG.SUMMARY_SHEET_NAME}' 또는 '${SR_CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = SR_readSheetAsObjects_(rawSheet);
  const budgetLine = SR_buildBudgetLineText_(summarySheet, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_RAW_COLS.SPENT, yesterday, 'CPI');

  const asa = SR_mediaTotals_(SR_CPI_MEDIA_CONFIG, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_COL_MAP, 'asa', yesterday, dayBefore);
  const gi = SR_mediaTotals_(SR_CPI_MEDIA_CONFIG, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_COL_MAP, 'google_install', yesterday, dayBefore);
  const ga = SR_mediaTotals_(SR_CPI_MEDIA_CONFIG, rows, SR_CPI_RAW_COLS.DATE, SR_CPI_COL_MAP, 'google_apply', yesterday, dayBefore);

  const asaLine = `- 전일 ASA 캠페인 광고비 약 ${SR_manWonText_(asa.cur.spent)} 소진 운영 간 CTR ${SR_withDeltaHtml_(asa.cur.ctr, asa.prev.ctr, SR_pctText_)}, CPC ${SR_withDeltaHtml_(asa.cur.cpc, asa.prev.cpc, SR_wonText_)} 발생으로 유입 ${SR_commaInt_(asa.cur.click)}건 확보, CPI ${SR_withDeltaHtml_(asa.cur.cpi, asa.prev.cpi, SR_wonText_)}, 설치 ${SR_withDeltaHtml_(asa.cur.install, asa.prev.install, SR_commaInt_)}건 확보`;

  const gaLines = [
    `-  Install_AOS 캠페인 CPI ${SR_wonText_(gi.cur.cpi)} 기록 / Apply_AOS 캠페인 지원 CPA ${SR_wonText_(ga.cur.cpa)} 기록`,
    `ㄴ Install 캠페인 광고비 약 ${SR_manWonText_(gi.cur.spent)} 소진 간 CPE ${SR_withDeltaHtml_(gi.cur.cpe, gi.prev.cpe, SR_wonText_)} 발생, CPI ${SR_withDeltaHtml_(gi.cur.cpi, gi.prev.cpi, SR_wonText_)} 발생으로 앱오픈 ${SR_withDeltaHtml_(gi.cur.appOpen, gi.prev.appOpen, SR_commaInt_)}건 및 설치 수 ${SR_withDeltaHtml_(gi.cur.install, gi.prev.install, SR_commaInt_)}건 확보`,
    `ㄴ Apply 캠페인 광고비 약 ${SR_manWonText_(ga.cur.spent)} 소진 간 CPA ${SR_withDeltaHtml_(ga.cur.cpa, ga.prev.cpa, SR_wonText_)} 발생, 지원 수 ${SR_withDeltaHtml_(ga.cur.apply, ga.prev.apply, SR_commaInt_)}건 확보`,
  ];

  return SR_titleHtml_('사람인 CPI') +
    `<p style="margin:0 0 10px;">${budgetLine}</p>` +
    SR_subHeaderHtml_('ASA') + SR_linesHtml_([asaLine]) +
    SR_subHeaderHtml_('Google AC') + SR_linesHtml_(gaLines);
}

function SR_buildDaSectionHtml_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(SR_CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(SR_CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`DA 파일에서 '${SR_CONFIG.SUMMARY_SHEET_NAME}' 또는 '${SR_CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = SR_readSheetAsObjects_(rawSheet);
  const nineSpent = SR_proratedBusinessDaySpend_(SR_CONFIG.DA_NINE_MONTHLY_BUDGET, yesterday);
  const budgetLine = SR_buildBudgetLineText_(summarySheet, rows, SR_DA_RAW_COLS.DATE, SR_DA_RAW_COLS.SPENT, yesterday, 'DA', SR_CONFIG.DA_BUDGET_CELL, nineSpent);
  const month = yesterday.getMonth() + 1;

  const mc = SR_DA_MEDIA_CONFIG;
  const T = (key) => SR_mediaTotals_(mc, rows, SR_DA_RAW_COLS.DATE, SR_DA_COL_MAP, key, yesterday, dayBefore);
  const conv = T('meta_store_conversion');
  const traf = T('meta_store_traffic');
  const metaInstall = T('meta_install');
  const appierInstall = T('appier_install');
  const appierSignup = T('appier_signup');
  const inmobi = T('inmobi_install');
  const rtbh = T('rtbh_apply');
  const criteo = T('criteo_apply');
  const taboola = T('taboola_traffic');
  const buzzvil = SR_mediaMTD_(mc, rows, SR_DA_RAW_COLS.DATE, SR_DA_COL_MAP, 'rcpa_buzzvil', yesterday);
  const rcpe = SR_mediaMTD_(mc, rows, SR_DA_RAW_COLS.DATE, SR_DA_COL_MAP, 'rcpe_total', yesterday);

  const metaLines = [
    `- 메타 사람인스토어 Conversion 캠페인 전일 상품보기 ${SR_withDeltaHtml_(conv.cur.productView, conv.prev.productView, SR_commaInt_)}건 및 구매 ${SR_withDeltaHtml_(conv.cur.purchase, conv.prev.purchase, SR_commaInt_)}건 발생, 구매액 약 ${SR_manWonText_(conv.cur.revenue)}`,
    `- Traffic Web 캠페인 전일 광고비 약 ${SR_manWonText_(traf.cur.spent)} 소진 운영 간 CTR ${SR_withDeltaHtml_(traf.cur.ctr, traf.prev.ctr, SR_pctText_)} 기록 및 CPC ${SR_withDeltaHtml_(traf.cur.cpc, traf.prev.cpc, SR_wonText_)} 발생`,
  ];

  const installLines = [
    `- Install(AOS/iOS) 캠페인 전일 CPI ${SR_withDeltaHtml_(metaInstall.cur.cpi, metaInstall.prev.cpi, SR_wonText_)} 발생, 광고비 약 ${SR_manWonText_(metaInstall.cur.spent)} 소진 간 설치 수 ${SR_withDeltaHtml_(metaInstall.cur.install, metaInstall.prev.install, SR_commaInt_)}건 확보`,
  ];
  const appierLines = [
    `- 애피어 전일 Install_iOS 캠페인 CPI ${SR_withDeltaHtml_(appierInstall.cur.cpi, appierInstall.prev.cpi, SR_wonText_)} 발생, 광고비 약 ${SR_manWonText_(appierInstall.cur.spent)} 운영 간 설치 수 ${SR_withDeltaHtml_(appierInstall.cur.install, appierInstall.prev.install, SR_commaInt_)}건 확보`,
    `ㄴ Signup_AOS/iOS 캠페인 CPA ${SR_withDeltaHtml_(appierSignup.cur.cpa, appierSignup.prev.cpa, SR_wonText_)} 발생 및 광고비 약 ${SR_manWonText_(appierSignup.cur.spent)} 소진 간 입사지원 ${SR_withDeltaHtml_(appierSignup.cur.apply, appierSignup.prev.apply, SR_commaInt_)}건 확보`,
  ];
  const inmobiLines = [
    `- 인모비 Install_iOS 캠페인 설치 ${SR_withDeltaHtml_(inmobi.cur.install, inmobi.prev.install, SR_commaInt_)}건 확보 및 CPI ${SR_withDeltaHtml_(inmobi.cur.cpi, inmobi.prev.cpi, SR_wonText_)} 기록`,
  ];

  const applyLines = [
    `- RTBH 광고비 약 ${SR_manWonText_(rtbh.cur.spent)} 소진 간 CPA ${SR_withDeltaHtml_(rtbh.cur.cpa, rtbh.prev.cpa, SR_wonText_)} 기록하며 지원 수 ${SR_withDeltaHtml_(rtbh.cur.apply, rtbh.prev.apply, SR_commaInt_)}건 확보`,
    `- 크리테오 전일 ${SR_manWonText_(criteo.cur.spent)} 소진 간 지원 CPA ${SR_withDeltaHtml_(criteo.cur.cpa, criteo.prev.cpa, SR_wonText_)} 및 입사지원 수 ${SR_withDeltaHtml_(criteo.cur.apply, criteo.prev.apply, SR_commaInt_)}건 확보`,
  ];

  const trafficLine = `- 타불라 광고비 약 ${SR_manWonText_(taboola.cur.spent)} 소진 간 CPC ${SR_withDeltaHtml_(taboola.cur.cpc, taboola.prev.cpc, SR_wonText_)} 발생, CTR ${SR_withDeltaHtml_(taboola.cur.ctr, taboola.prev.ctr, SR_pctText_)} 발생으로 유입 ${SR_commaInt_(taboola.cur.click)}건 확보`;

  const rcpLines = [
    `- rCPA 운영 매체 '버즈빌' 회원가입 총 ${SR_commaInt_(buzzvil.signup)}건 확보 및 CPA ${SR_wonText_(buzzvil.cpaSignup)} 기록 운영 중`,
    `- rCPE 매체 앱 설치+실행 운영 매체(애디슨오퍼월-네트워크, 애디슨오퍼월-쿠키오븐, 그린피, 버즈빌) 앱 실행 단가 ${SR_wonText_(rcpe.cpe)}로 운영 중`,
  ];

  return SR_titleHtml_('사람인 DA') +
    `<p style="margin:0 0 4px;">${budgetLine}</p>` +
    `<p style="margin:0 0 10px;font-size:12px;color:#5f6368;">*${month}월 예산 사람인스토어, 나인즈, 유튜브 구독 캠페인 포함된 예산입니다. (예비비 300만원 제외)</p>` +
    SR_groupHtml_('사람인스토어') +
    SR_subHeaderHtml_('메타') + SR_linesHtml_(metaLines) +
    SR_groupHtml_('DA') +
    SR_subHeaderHtml_('머신러닝 - 앱설치 매체') +
    SR_linesHtml_(installLines) + SR_linesHtml_(appierLines) + SR_linesHtml_(inmobiLines) +
    SR_subHeaderHtml_('머신러닝 - 입사지원 매체') + SR_linesHtml_(applyLines) +
    SR_subHeaderHtml_('머신러닝 - 트래픽 매체') + SR_linesHtml_([trafficLine]) +
    SR_subHeaderHtml_('rCPE/rCPA') + SR_linesHtml_(rcpLines);
}

function SR_buildEmailHtml_(yesterday, cpiHtml, daHtml) {
  const dateText = SR_formatMD_(yesterday);
  return `<div style="font-family:'Malgun Gothic',Arial,sans-serif;font-size:14px;color:#202124;line-height:1.7;">
  <p>안녕하세요,<br>와이즈버즈 ${SR_htmlEscape_(SR_CONFIG.GREETING_NAME)}입니다.</p>
  <p>📂 <a href="${SR_CONFIG.DAILY_REPORT_LINK_URL}">사람인 데일리 리포트</a></p>
  <p>${dateText} 기준 CPI, DA 데일리 리포트 코멘트 전달드립니다.</p>
  ${cpiHtml}
  ${daHtml}
  <p style="margin-top:24px;">감사합니다.<br>${SR_htmlEscape_(SR_CONFIG.GREETING_NAME)} 드림</p>
</div>`;
}

/**
 * 메인 실행 함수. 매일 아침 트리거로 실행하면
 * "전일자" CPI/DA 리포트 코멘트를 자동 계산해 SR_CONFIG.EMAIL_TO 로 발송합니다.
 */
function SR_sendDailyReport() {
  const now = new Date();
  const yesterday = SR_addDays_(now, -1);
  const dayBefore = SR_addDays_(now, -2);

  Logger.log('실행 기준일: %s / 전일: %s / 직전일: %s',
    SR_formatDateKey_(now), SR_formatDateKey_(yesterday), SR_formatDateKey_(dayBefore));

  const cpiFile = SR_findLatestReportFile_(SR_CONFIG.CPI_ROOT_FOLDER_ID, now);
  const daFile = SR_findLatestReportFile_(SR_CONFIG.DA_ROOT_FOLDER_ID, now);
  Logger.log('CPI 파일: %s / DA 파일: %s', cpiFile.getName(), daFile.getName());

  const cpiOut = SR_withTempSheet_(cpiFile.getId(), (ss) => ({
    text: SR_buildCpiSection_(ss, yesterday, dayBefore),
    html: SR_buildCpiSectionHtml_(ss, yesterday, dayBefore),
  }));
  const daOut = SR_withTempSheet_(daFile.getId(), (ss) => ({
    text: SR_buildDaSection_(ss, yesterday, dayBefore),
    html: SR_buildDaSectionHtml_(ss, yesterday, dayBefore),
  }));
  const cpiSection = cpiOut.text, daSection = daOut.text;
  const cpiHtml = cpiOut.html, daHtml = daOut.html;

  const subject = SR_subjectFor_(now);
  const body = SR_buildEmailBody_(yesterday, cpiSection, daSection);
  const htmlBody = SR_buildEmailHtml_(yesterday, cpiHtml, daHtml);

  MailApp.sendEmail({
    to: SR_CONFIG.EMAIL_TO,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: SR_CONFIG.EMAIL_SENDER_NAME,
  });

  Logger.log('메일 발송 완료: %s', subject);
}

// "[와이즈버즈] 사람인 CPI / DA Report 26년 9월 Daily Report_260928" 형태 (실행일=오늘 날짜 기준)
function SR_subjectFor_(targetDate) {
  const yy = targetDate.getFullYear() % 100;
  const month = targetDate.getMonth() + 1;
  const yyMMdd = Utilities.formatDate(targetDate, SR_CONFIG.TIMEZONE, 'yyMMdd');
  return `[와이즈버즈] 사람인 CPI / DA Report ${yy}년 ${month}월 Daily Report_${yyMMdd}`;
}

/**
 * 매일 아침(기본 08:00, Asia/Seoul) 자동 실행되는 트리거를 등록합니다.
 * 스크립트 편집기에서 이 함수를 한 번만 수동 실행하면 됩니다.
 */
function SR_createDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'SR_sendDailyReport')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('SR_sendDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone(SR_CONFIG.TIMEZONE)
    .create();

  Logger.log('매일 08:00(Asia/Seoul) 자동 발송 트리거를 등록했습니다.');
}

/**
 * 진단용: CPI RAW 탭의 실제 Channel / Campaign 조합을 로그에 출력합니다.
 * Config.gs 의 SR_CPI_MEDIA_CONFIG match 조건이 실제 값과 맞는지 확인할 때 사용하세요.
 */
function SR_logDistinctCpiValues_() {
  const file = SR_findLatestReportFile_(SR_CONFIG.CPI_ROOT_FOLDER_ID, new Date());
  SR_withTempSheet_(file.getId(), (ss) => {
    const rawSheet = ss.getSheetByName(SR_CONFIG.RAW_SHEET_NAME);
    const { rows } = SR_readSheetAsObjects_(rawSheet);
    const seen = {};
    rows.forEach((r) => {
      const key = `${r[SR_CPI_RAW_COLS.CHANNEL]} | ${r[SR_CPI_RAW_COLS.CAMPAIGN]}`;
      seen[key] = (seen[key] || 0) + 1;
    });
    Logger.log('CPI RAW 고유 Channel | Campaign 조합 (건수):\n%s',
      Object.keys(seen).sort().map((k) => `${k}  -> ${seen[k]}행`).join('\n'));
  });
}

/**
 * 진단용: DA RAW 탭의 실제 Channel / Media / DA / Objective / Campaign 조합을 로그에 출력합니다.
 * Config.gs 의 SR_DA_MEDIA_CONFIG match 조건은 추정치이므로, 실행 후 반드시 이 로그와 대조하세요.
 */
function SR_logDistinctDaValues_() {
  const file = SR_findLatestReportFile_(SR_CONFIG.DA_ROOT_FOLDER_ID, new Date());
  SR_withTempSheet_(file.getId(), (ss) => {
    const rawSheet = ss.getSheetByName(SR_CONFIG.RAW_SHEET_NAME);
    const { rows } = SR_readSheetAsObjects_(rawSheet);
    const seen = {};
    rows.forEach((r) => {
      const key = [
        r[SR_DA_RAW_COLS.CHANNEL],
        r[SR_DA_RAW_COLS.MEDIA],
        r[SR_DA_RAW_COLS.DA],
        r[SR_DA_RAW_COLS.OBJECTIVE],
        r[SR_DA_RAW_COLS.CAMPAIGN],
      ].join(' | ');
      seen[key] = (seen[key] || 0) + 1;
    });
    Logger.log('DA RAW 고유 Channel | Media | DA | Objective | Campaign 조합 (건수):\n%s',
      Object.keys(seen).sort().map((k) => `${k}  -> ${seen[k]}행`).join('\n'));
  });
}

/**
 * 진단용: 실제 메일 발송 없이 본문만 로그로 확인하고 싶을 때 사용.
 */
function SR_previewDailyReport_() {
  const now = new Date();
  const yesterday = SR_addDays_(now, -1);
  const dayBefore = SR_addDays_(now, -2);

  const cpiFile = SR_findLatestReportFile_(SR_CONFIG.CPI_ROOT_FOLDER_ID, now);
  const daFile = SR_findLatestReportFile_(SR_CONFIG.DA_ROOT_FOLDER_ID, now);

  const cpiSection = SR_withTempSheet_(cpiFile.getId(), (ss) => SR_buildCpiSection_(ss, yesterday, dayBefore));
  const daSection = SR_withTempSheet_(daFile.getId(), (ss) => SR_buildDaSection_(ss, yesterday, dayBefore));

  const body = SR_buildEmailBody_(yesterday, cpiSection, daSection);
  Logger.log('제목: %s', SR_subjectFor_(now));
  Logger.log(body);
}


function 실행_CPI값확인() { SR_logDistinctCpiValues_(); }
function 실행_DA값확인() { SR_logDistinctDaValues_(); }
function 실행_미리보기() { SR_previewDailyReport_(); }
