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

  // 예산 라벨 셀 탐색 시 사용할 텍스트 (CPI Summary 탭에서 사용, 라벨 검색 방식)
  BUDGET_LABEL_TEXT: '월 예산',

  // DA Summary 탭은 라벨 검색이 아니라 이 셀 값을 직접 당월 총 예산으로 사용
  DA_BUDGET_CELL: 'C7',

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
    // 버즈빌은 SignUp(=rCPA)과 Install(=rCPE 실행) 두 캠페인을 같이 운영하므로, 여기서는
    // Objective가 'Install'인 버즈빌 행만 포함시킨다 (SignUp/Youtube_sub는 rcpa_buzzvil 쪽).
    key: 'rcpe_total',
    label: '[rCPE] 애디슨오퍼월-네트워크/쿠키오븐, 그린피, 버즈빌 (앱 실행)',
    match: (row) => {
      const ch = row[DA_RAW_COLS.CHANNEL];
      if (ch === 'Buzzvil') return row[DA_RAW_COLS.OBJECTIVE] === 'Install';
      return ['AdisonOfferwall', 'CookieOven', 'greenp'].indexOf(ch) !== -1;
    },
    metrics: ['spent', 'appOpen', 'cpe'],
  },
];

/**
 * 공용 유틸리티: 날짜, 숫자/통화 포맷, 시트 읽기, 라벨 셀 탐색
 */

function addDays_(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

// "8/11" 형태 (0 패딩 없음)
function formatMD_(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

// 헤더 셀 안의 줄바꿈/공백 위치가 파일마다 조금씩 다를 수 있고(예: "Install\n(+SKAN)" vs
// "Install (+SKAN)"), 눈에 안 보이는 제어문자(예: 백스페이스)가 섞여 들어간 경우도 확인됨.
// 매칭용 키는 공백/제어문자를 전부 제거해서 만든다. Config.gs 의 *_RAW_COLS 상수들도
// 반드시 같은 방식(공백 없이)으로 적어야 한다.
function normalizeHeader_(h) {
  return String(h == null ? '' : h).replace(/[\x00-\x20\x7F]+/g, '').trim();
}

// "₩1,234,567", "39.7%", 1234, "" 등을 모두 숫자로 변환. 실패 시 0.
function toNumber_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₩,%\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function commaInt_(n) {
  return Math.round(n).toLocaleString('ko-KR');
}

function wonText_(n) {
  return `${commaInt_(n)}원`;
}

// 1억 이상이면 "1억 5,950만 원", 미만이면 "1,741만 원" 형태로 표시 (원 단위 반올림)
function manWonText_(n) {
  const manTotal = Math.round(n / 10000);
  const eok = Math.floor(manTotal / 10000);
  const man = manTotal % 10000;
  if (eok > 0) {
    return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만 원` : `${eok}억 원`;
  }
  return `${man.toLocaleString('ko-KR')}만 원`;
}

function pctText_(ratio0to1, decimals) {
  return `${(ratio0to1 * 100).toFixed(decimals == null ? 1 : decimals)}%`;
}

function arrow_(delta) {
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '-';
}

// cur, prev: 숫자. formatter: 값 -> 문자열
function withDelta_(cur, prev, formatter) {
  const delta = cur - prev;
  const deltaAbs = formatter(Math.abs(delta));
  return `${formatter(cur)} (${arrow_(delta)}${deltaAbs})`;
}

// HTML 본문에서도 색상/볼드 없이 일반 텍스트와 동일하게 표시 (요청에 따라 스타일 제거)
function withDeltaHtml_(cur, prev, formatter) {
  return withDelta_(cur, prev, formatter);
}

function htmlEscape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeDivide_(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

/**
 * xlsx -> Google Sheets 임시 변환본을 열어서 callback(spreadsheet) 실행 후 임시 파일 삭제.
 * Advanced Drive Service(Drive v3)가 appsscript.json 에 활성화되어 있어야 함.
 */
function withTempSheet_(fileId, callback) {
  const resource = {
    name: 'tmp_report_' + fileId + '_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_SHEETS,
  };
  if (CONFIG.TEMP_FOLDER_ID) {
    resource.parents = [CONFIG.TEMP_FOLDER_ID];
  }
  const converted = Drive.Files.copy(resource, fileId);
  const tempId = converted.id;
  try {
    const ss = SpreadsheetApp.openById(tempId);
    return callback(ss);
  } finally {
    try {
      Drive.Files.remove(tempId);
    } catch (e) {
      Logger.log('임시 파일 삭제 실패 (수동 삭제 필요): ' + tempId + ' / ' + e);
    }
  }
}

// 실제 리포트 파일은 RAW 탭 맨 위 몇 줄이 제목/안내문구인 경우가 있어(DA 리포트는 7행부터
// 헤더), 1행을 무조건 헤더로 가정하지 않고 "Spent"와 "Channel"이 함께 있는 행을 찾아
// 그 행을 헤더로 사용한다.
function findHeaderRow_(values) {
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
function readSheetAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return { headers: [], rows: [] };
  const headerRowIdx = findHeaderRow_(values);
  const headers = values[headerRowIdx].map(normalizeHeader_);
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
function findLabelValue_(sheet, labelText, searchRows, searchCols) {
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

function sameDateAsRow_(cellValue, targetDateKey) {
  if (!cellValue) return false;
  const d = (cellValue instanceof Date) ? cellValue : new Date(cellValue);
  if (isNaN(d.getTime())) return false;
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd') === targetDateKey;
}

/**
 * RAW 행 배열에서 특정 날짜 + 매체 조건에 해당하는 행들을 합산.
 * sumCols: 합산할 컬럼명 배열 (RAW 헤더명과 동일해야 함)
 */
function aggregateRaw_(rows, dateColName, targetDate, matchFn, sumCols) {
  const targetKey = formatDateKey_(targetDate);
  const totals = {};
  sumCols.forEach((c) => (totals[c] = 0));
  let matchedRows = 0;
  rows.forEach((row) => {
    if (!sameDateAsRow_(row[dateColName], targetKey)) return;
    if (matchFn && !matchFn(row)) return;
    matchedRows++;
    sumCols.forEach((c) => {
      totals[c] += toNumber_(row[c]);
    });
  });
  totals._matchedRows = matchedRows;
  return totals;
}

/**
 * 이번 달 1일 ~ targetDate 까지 RAW 전체(조건 없음)의 Spent 합계 (MTD 소진액 계산용)
 */
function sumSpentMonthToDate_(rows, dateColName, spentColName, targetDate) {
  const targetKey = formatDateKey_(targetDate);
  const targetMonthPrefix = targetKey.slice(0, 7); // 'yyyy-MM'
  let total = 0;
  rows.forEach((row) => {
    const raw = row[dateColName];
    if (!raw) return;
    const d = (raw instanceof Date) ? raw : new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = formatDateKey_(d);
    if (key.slice(0, 7) === targetMonthPrefix && key <= targetKey) {
      total += toNumber_(row[spentColName]);
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
function findLatestReportFile_(rootFolderId, runDate) {
  const yyyymm = Utilities.formatDate(runDate, CONFIG.TIMEZONE, 'yyyy.MM');
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

const CPI_COL_MAP = {
  imps: CPI_RAW_COLS.IMPS,
  click: CPI_RAW_COLS.CLICK,
  spent: CPI_RAW_COLS.SPENT,
  install: CPI_RAW_COLS.INSTALL,
  appOpen: CPI_RAW_COLS.APP_OPEN,
  apply: CPI_RAW_COLS.APPLY,
};

const DA_COL_MAP = {
  imps: DA_RAW_COLS.IMPS,
  click: DA_RAW_COLS.CLICK,
  spent: DA_RAW_COLS.SPENT,
  install: DA_RAW_COLS.INSTALL,
  appOpen: DA_RAW_COLS.APP_OPEN,
  apply: DA_RAW_COLS.APPLY,
  signup: DA_RAW_COLS.SIGNUP,
  productView: DA_RAW_COLS.PRODUCT_VIEW,
  purchase: DA_RAW_COLS.PURCHASE,
  revenue: DA_RAW_COLS.REVENUE,
};

/**
 * colMap 의 semantic key 들을 모두 합산한 totals 객체 반환 (RAW 헤더에 없는 컬럼은 0)
 */
function aggregateSection_(rows, dateColName, colMap, matchFn, targetDate) {
  const semanticKeys = Object.keys(colMap);
  const rawCols = semanticKeys.map((k) => colMap[k]);
  const raw = aggregateRaw_(rows, dateColName, targetDate, matchFn, rawCols);
  const totals = { _matchedRows: raw._matchedRows };
  semanticKeys.forEach((k) => {
    totals[k] = raw[colMap[k]] || 0;
  });
  return totals;
}

// 지표별 (현재값, 표시포맷) 계산
function computeDerived_(totals) {
  return {
    imps: totals.imps || 0,
    click: totals.click || 0,
    ctr: safeDivide_(totals.click, totals.imps),
    cpc: safeDivide_(totals.spent, totals.click),
    spent: totals.spent || 0,
    install: totals.install || 0,
    cpi: safeDivide_(totals.spent, totals.install),
    appOpen: totals.appOpen || 0,
    cpe: safeDivide_(totals.spent, totals.appOpen),
    apply: totals.apply || 0,
    cpa: safeDivide_(totals.spent, totals.apply),
    signup: totals.signup || 0,
    cpaSignup: safeDivide_(totals.spent, totals.signup),
    productView: totals.productView || 0,
    purchase: totals.purchase || 0,
    revenue: totals.revenue || 0,
    roas: safeDivide_(totals.revenue, totals.spent),
  };
}

const METRIC_LABELS = {
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

function formatMetric_(key, cur, prev) {
  const label = METRIC_LABELS[key] || key;
  switch (key) {
    case 'ctr':
    case 'roas':
      return `${label} ${withDelta_(cur, prev, (v) => pctText_(v))}`;
    case 'cpc':
    case 'cpi':
    case 'cpe':
    case 'cpa':
    case 'cpaSignup':
      return `${label} ${withDelta_(cur, prev, (v) => wonText_(v))}`;
    case 'spent':
    case 'revenue':
      return `${label} 약 ${withDelta_(cur, prev, (v) => manWonText_(v))}`;
    default:
      // imps, click, install, appOpen, apply, signup, productView, purchase 등 건수형
      return `${label} ${withDelta_(cur, prev, (v) => `${commaInt_(v)}건`)}`;
  }
}

/**
 * metricKeys 순서대로 "라벨 값 (증감)" 문자열 배열 생성
 */
function buildMetricLines_(metricKeys, curTotals, prevTotals) {
  const curD = computeDerived_(curTotals);
  const prevD = computeDerived_(prevTotals);
  return metricKeys.map((k) => formatMetric_(k, curD[k] || 0, prevD[k] || 0));
}

// formatMetric_ 의 HTML 버전: 증감 부분에 색상(▲빨강/▼파랑)을 입힌다.
function formatMetricHtml_(key, cur, prev) {
  const label = htmlEscape_(METRIC_LABELS[key] || key);
  switch (key) {
    case 'ctr':
    case 'roas':
      return `${label} ${withDeltaHtml_(cur, prev, (v) => pctText_(v))}`;
    case 'cpc':
    case 'cpi':
    case 'cpe':
    case 'cpa':
    case 'cpaSignup':
      return `${label} ${withDeltaHtml_(cur, prev, (v) => wonText_(v))}`;
    case 'spent':
    case 'revenue':
      return `${label} 약 ${withDeltaHtml_(cur, prev, (v) => manWonText_(v))}`;
    default:
      return `${label} ${withDeltaHtml_(cur, prev, (v) => `${commaInt_(v)}건`)}`;
  }
}

function buildMetricLinesHtml_(metricKeys, curTotals, prevTotals) {
  const curD = computeDerived_(curTotals);
  const prevD = computeDerived_(prevTotals);
  return metricKeys.map((k) => formatMetricHtml_(k, curD[k] || 0, prevD[k] || 0));
}

/**
 * 실제 사용 중인 메일 양식(하늘색/노란색 하이라이트, 굵게, ㄴ 서브불릿 구조)에 맞춘
 * CPI/DA 섹션 빌더. 숫자는 전부 RAW 데이터를 날짜+매체 조건으로 집계해서 계산하고,
 * "⏩" 같은 분석가 판단이 들어간 코멘트나 소재 단위 하이라이트는 자동 생성하지 않는다.
 */

function mediaByKey_(list, key) {
  const found = list.filter((c) => c.key === key)[0];
  if (!found) throw new Error(`MEDIA_CONFIG 에서 key="${key}" 를 찾지 못했습니다.`);
  return found;
}

// key 로 지정된 매체의 전일/직전일 집계값(합산 totals, computeDerived_ 적용 전)을 반환
function mediaTotals_(mediaConfigList, rows, dateColName, colMap, key, yesterday, dayBefore) {
  const cfg = mediaByKey_(mediaConfigList, key);
  const cur = aggregateSection_(rows, dateColName, colMap, cfg.match, yesterday);
  const prev = aggregateSection_(rows, dateColName, colMap, cfg.match, dayBefore);
  return { cur: computeDerived_(cur), prev: computeDerived_(prev), matched: cur._matchedRows > 0 || prev._matchedRows > 0 };
}

// 이번 달 1일 ~ targetDate 까지 누적 합산 (rCPA/rCPE 처럼 "전일자"가 아니라 "총합" 운영값이
// 필요한 매체용). 반환값은 computeDerived_ 적용된 값 그대로 (증감 비교 없음).
function aggregateSectionMTD_(rows, dateColName, colMap, matchFn, targetDate) {
  const targetKey = formatDateKey_(targetDate);
  const monthPrefix = targetKey.slice(0, 7);
  const semanticKeys = Object.keys(colMap);
  const totals = {};
  semanticKeys.forEach((k) => (totals[k] = 0));
  rows.forEach((row) => {
    const raw = row[dateColName];
    if (!raw) return;
    const d = (raw instanceof Date) ? raw : new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = formatDateKey_(d);
    if (key.slice(0, 7) !== monthPrefix || key > targetKey) return;
    if (matchFn && !matchFn(row)) return;
    semanticKeys.forEach((k) => {
      totals[k] += toNumber_(row[colMap[k]]);
    });
  });
  return computeDerived_(totals);
}

function mediaMTD_(mediaConfigList, rows, dateColName, colMap, key, targetDate) {
  const cfg = mediaByKey_(mediaConfigList, key);
  return aggregateSectionMTD_(rows, dateColName, colMap, cfg.match, targetDate);
}

// budgetCellRef 가 주어지면 (예: 'C7') Summary 탭에서 라벨을 찾는 대신 그 셀 값을 직접 읽는다.
function buildBudgetLineText_(summarySheet, rawRows, dateColName, spentColName, targetDate, totalBudgetLabel, budgetCellRef) {
  const budget = budgetCellRef
    ? toNumber_(summarySheet.getRange(budgetCellRef).getValue())
    : toNumber_(findLabelValue_(summarySheet, CONFIG.BUDGET_LABEL_TEXT));
  const mtdSpent = sumSpentMonthToDate_(rawRows, dateColName, spentColName, targetDate);
  const pct = safeDivide_(mtdSpent, budget);
  const yy = targetDate.getFullYear() % 100;
  const month = targetDate.getMonth() + 1;
  if (!budget) {
    const where = budgetCellRef ? `셀: "${budgetCellRef}"` : `라벨: "${CONFIG.BUDGET_LABEL_TEXT}"`;
    return `- ${totalBudgetLabel} 예산 정보를 Summary 탭에서 찾지 못했습니다 (${where}). 확인해 주세요.`;
  }
  return `- ${yy}년 ${month}월 예산 ${manWonText_(budget)} 중 약 ${pctText_(pct)}인 약 ${manWonText_(mtdSpent)} 소진 운영 중입니다.`;
}

// ---------------------------------------------------------------------------
// 텍스트(plain) 버전 - 메일 클라이언트가 HTML 을 못 읽을 때의 대체 본문
// ---------------------------------------------------------------------------

function buildCpiSection_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`CPI 파일에서 '${CONFIG.SUMMARY_SHEET_NAME}' 또는 '${CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = readSheetAsObjects_(rawSheet);
  const budgetLine = buildBudgetLineText_(summarySheet, rows, CPI_RAW_COLS.DATE, CPI_RAW_COLS.SPENT, yesterday, 'CPI');

  const asa = mediaTotals_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, 'asa', yesterday, dayBefore);
  const gi = mediaTotals_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, 'google_install', yesterday, dayBefore);
  const ga = mediaTotals_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, 'google_apply', yesterday, dayBefore);

  const asaLine = `- 전일 ASA 캠페인 광고비 약 ${manWonText_(asa.cur.spent)} 소진 운영 간 CTR ${withDelta_(asa.cur.ctr, asa.prev.ctr, pctText_)}, CPC ${withDelta_(asa.cur.cpc, asa.prev.cpc, wonText_)} 발생으로 유입 ${commaInt_(asa.cur.click)}건 확보, CPI ${withDelta_(asa.cur.cpi, asa.prev.cpi, wonText_)}, 설치 ${withDelta_(asa.cur.install, asa.prev.install, commaInt_)}건 확보`;

  const gaLines = [
    `-  Install_AOS 캠페인 CPI ${wonText_(gi.cur.cpi)} 기록 / Apply_AOS 캠페인 지원 CPA ${wonText_(ga.cur.cpa)} 기록`,
    `ㄴ Install 캠페인 광고비 약 ${manWonText_(gi.cur.spent)} 소진 간 CPE ${withDelta_(gi.cur.cpe, gi.prev.cpe, wonText_)} 발생, CPI ${withDelta_(gi.cur.cpi, gi.prev.cpi, wonText_)} 발생으로 앱오픈 ${withDelta_(gi.cur.appOpen, gi.prev.appOpen, commaInt_)}건 및 설치 수 ${withDelta_(gi.cur.install, gi.prev.install, commaInt_)}건 확보`,
    `ㄴ Apply 캠페인 광고비 약 ${manWonText_(ga.cur.spent)} 소진 간 CPA ${withDelta_(ga.cur.cpa, ga.prev.cpa, wonText_)} 발생, 지원 수 ${withDelta_(ga.cur.apply, ga.prev.apply, commaInt_)}건 확보`,
  ];

  return `<사람인 CPI>\n${budgetLine}\n\n[ASA]\n${asaLine}\n\n[Google AC]\n${gaLines.join('\n')}`;
}

function buildDaSection_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`DA 파일에서 '${CONFIG.SUMMARY_SHEET_NAME}' 또는 '${CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = readSheetAsObjects_(rawSheet);
  const budgetLine = buildBudgetLineText_(summarySheet, rows, DA_RAW_COLS.DATE, DA_RAW_COLS.SPENT, yesterday, 'DA', CONFIG.DA_BUDGET_CELL);
  const month = yesterday.getMonth() + 1;

  const mc = DA_MEDIA_CONFIG;
  const T = (key) => mediaTotals_(mc, rows, DA_RAW_COLS.DATE, DA_COL_MAP, key, yesterday, dayBefore);
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
  const buzzvil = mediaMTD_(mc, rows, DA_RAW_COLS.DATE, DA_COL_MAP, 'rcpa_buzzvil', yesterday);
  const rcpe = mediaMTD_(mc, rows, DA_RAW_COLS.DATE, DA_COL_MAP, 'rcpe_total', yesterday);

  const metaLines = [
    `- 메타 사람인스토어 Conversion 캠페인 전일 상품보기 ${withDelta_(conv.cur.productView, conv.prev.productView, commaInt_)}건 및 구매 ${withDelta_(conv.cur.purchase, conv.prev.purchase, commaInt_)}건 발생, 구매액 약 ${manWonText_(conv.cur.revenue)}`,
    `- Traffic Web 캠페인 전일 광고비 약 ${manWonText_(traf.cur.spent)} 소진 운영 간 CTR ${withDelta_(traf.cur.ctr, traf.prev.ctr, pctText_)} 기록 및 CPC ${withDelta_(traf.cur.cpc, traf.prev.cpc, wonText_)} 발생`,
  ];

  const installLines = [
    `- Install(AOS/iOS) 캠페인 전일 CPI ${withDelta_(metaInstall.cur.cpi, metaInstall.prev.cpi, wonText_)} 발생, 광고비 약 ${manWonText_(metaInstall.cur.spent)} 소진 간 설치 수 ${withDelta_(metaInstall.cur.install, metaInstall.prev.install, commaInt_)}건 확보`,
    ``,
    `- 애피어 전일 Install_iOS 캠페인 CPI ${withDelta_(appierInstall.cur.cpi, appierInstall.prev.cpi, wonText_)} 발생, 광고비 약 ${manWonText_(appierInstall.cur.spent)} 운영 간 설치 수 ${withDelta_(appierInstall.cur.install, appierInstall.prev.install, commaInt_)}건 확보`,
    `ㄴ Signup_AOS/iOS 캠페인 CPA ${withDelta_(appierSignup.cur.cpa, appierSignup.prev.cpa, wonText_)} 발생 및 광고비 약 ${manWonText_(appierSignup.cur.spent)} 소진 간 입사지원 ${withDelta_(appierSignup.cur.apply, appierSignup.prev.apply, commaInt_)}건 확보`,
    ``,
    `- 인모비 Install_iOS 캠페인 설치 ${withDelta_(inmobi.cur.install, inmobi.prev.install, commaInt_)}건 확보 및 CPI ${withDelta_(inmobi.cur.cpi, inmobi.prev.cpi, wonText_)} 기록`,
  ];

  const applyLines = [
    `- RTBH 광고비 약 ${manWonText_(rtbh.cur.spent)} 소진 간 CPA ${withDelta_(rtbh.cur.cpa, rtbh.prev.cpa, wonText_)} 기록하며 지원 수 ${withDelta_(rtbh.cur.apply, rtbh.prev.apply, commaInt_)}건 확보`,
    `- 크리테오 전일 ${manWonText_(criteo.cur.spent)} 소진 간 지원 CPA ${withDelta_(criteo.cur.cpa, criteo.prev.cpa, wonText_)} 및 입사지원 수 ${withDelta_(criteo.cur.apply, criteo.prev.apply, commaInt_)}건 확보`,
  ];

  const trafficLine = `- 타불라 광고비 약 ${manWonText_(taboola.cur.spent)} 소진 간 CPC ${withDelta_(taboola.cur.cpc, taboola.prev.cpc, wonText_)} 발생, CTR ${withDelta_(taboola.cur.ctr, taboola.prev.ctr, pctText_)} 발생으로 유입 ${commaInt_(taboola.cur.click)}건 확보`;

  const rcpLines = [
    `- rCPA 운영 매체 '버즈빌' 회원가입 총 ${commaInt_(buzzvil.signup)}건 확보 및 CPA ${wonText_(buzzvil.cpaSignup)} 기록 운영 중`,
    `- rCPE 매체 앱 설치+실행 운영 매체(애디슨오퍼월-네트워크, 애디슨오퍼월-쿠키오븐, 그린피, 버즈빌) 앱 실행 단가 ${wonText_(rcpe.cpe)}로 운영 중`,
  ];

  return `<사람인 DA>\n${budgetLine}\n*${month}월 예산 사람인스토어, 나인즈, 유튜브 구독 캠페인 포함된 예산입니다. (예비비 300만원 제외)\n- 유튜브 구독 캠페인 데이터는 이번 버전에 자동 집계되지 않습니다. 필요 시 [유튜브구독캠페인] 시트를 별도로 확인해 주세요.\n\n사람인스토어\n[메타]\n${metaLines.join('\n')}\n\nDA\n[머신러닝 - 앱설치 매체]\n${installLines.join('\n')}\n\n[머신러닝 - 입사지원 매체]\n${applyLines.join('\n')}\n\n[머신러닝 - 트래픽 매체]\n${trafficLine}\n\n[rCPE/rCPA]\n${rcpLines.join('\n')}`;
}

function buildEmailBody_(yesterday, cpiSection, daSection) {
  const dateText = formatMD_(yesterday);
  return `안녕하세요,
와이즈버즈 ${CONFIG.GREETING_NAME}입니다.

📂 사람인 데일리 리포트 (${CONFIG.DAILY_REPORT_LINK_URL})

${dateText} 기준 CPI, DA 데일리 리포트 코멘트 전달드립니다.

${cpiSection}


${daSection}


감사합니다.
${CONFIG.GREETING_NAME} 드림`;
}

// ---------------------------------------------------------------------------
// HTML 버전 (폰트/하이라이트/줄바꿈/하이퍼링크 포함, 실제 발송용 htmlBody)
// ---------------------------------------------------------------------------

function titleHtml_(text) {
  return `<p style="margin:20px 0 6px;"><b style="background-color:${CONFIG.HIGHLIGHT_TITLE_BG};padding:1px 4px;">&lt;${text}&gt;</b></p>`;
}

function groupHtml_(text) {
  return `<p style="margin:16px 0 2px;"><b style="background-color:${CONFIG.HIGHLIGHT_GROUP_BG};padding:1px 4px;">${text}</b></p>`;
}

function subHeaderHtml_(text) {
  return `<p style="margin:4px 0 2px;"><b>[${htmlEscape_(text)}]</b></p>`;
}

function linesHtml_(lines) {
  return `<p style="margin:0 0 10px;">${lines.filter((l) => l !== '').join('<br>')}</p>`;
}

function buildCpiSectionHtml_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`CPI 파일에서 '${CONFIG.SUMMARY_SHEET_NAME}' 또는 '${CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = readSheetAsObjects_(rawSheet);
  const budgetLine = buildBudgetLineText_(summarySheet, rows, CPI_RAW_COLS.DATE, CPI_RAW_COLS.SPENT, yesterday, 'CPI');

  const asa = mediaTotals_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, 'asa', yesterday, dayBefore);
  const gi = mediaTotals_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, 'google_install', yesterday, dayBefore);
  const ga = mediaTotals_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, 'google_apply', yesterday, dayBefore);

  const asaLine = `- 전일 ASA 캠페인 광고비 약 ${manWonText_(asa.cur.spent)} 소진 운영 간 CTR ${withDeltaHtml_(asa.cur.ctr, asa.prev.ctr, pctText_)}, CPC ${withDeltaHtml_(asa.cur.cpc, asa.prev.cpc, wonText_)} 발생으로 유입 ${commaInt_(asa.cur.click)}건 확보, CPI ${withDeltaHtml_(asa.cur.cpi, asa.prev.cpi, wonText_)}, 설치 ${withDeltaHtml_(asa.cur.install, asa.prev.install, commaInt_)}건 확보`;

  const gaLines = [
    `-  Install_AOS 캠페인 CPI ${wonText_(gi.cur.cpi)} 기록 / Apply_AOS 캠페인 지원 CPA ${wonText_(ga.cur.cpa)} 기록`,
    `ㄴ Install 캠페인 광고비 약 ${manWonText_(gi.cur.spent)} 소진 간 CPE ${withDeltaHtml_(gi.cur.cpe, gi.prev.cpe, wonText_)} 발생, CPI ${withDeltaHtml_(gi.cur.cpi, gi.prev.cpi, wonText_)} 발생으로 앱오픈 ${withDeltaHtml_(gi.cur.appOpen, gi.prev.appOpen, commaInt_)}건 및 설치 수 ${withDeltaHtml_(gi.cur.install, gi.prev.install, commaInt_)}건 확보`,
    `ㄴ Apply 캠페인 광고비 약 ${manWonText_(ga.cur.spent)} 소진 간 CPA ${withDeltaHtml_(ga.cur.cpa, ga.prev.cpa, wonText_)} 발생, 지원 수 ${withDeltaHtml_(ga.cur.apply, ga.prev.apply, commaInt_)}건 확보`,
  ];

  return titleHtml_('사람인 CPI') +
    `<p style="margin:0 0 10px;">${budgetLine}</p>` +
    subHeaderHtml_('ASA') + linesHtml_([asaLine]) +
    subHeaderHtml_('Google AC') + linesHtml_(gaLines);
}

function buildDaSectionHtml_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`DA 파일에서 '${CONFIG.SUMMARY_SHEET_NAME}' 또는 '${CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = readSheetAsObjects_(rawSheet);
  const budgetLine = buildBudgetLineText_(summarySheet, rows, DA_RAW_COLS.DATE, DA_RAW_COLS.SPENT, yesterday, 'DA', CONFIG.DA_BUDGET_CELL);
  const month = yesterday.getMonth() + 1;

  const mc = DA_MEDIA_CONFIG;
  const T = (key) => mediaTotals_(mc, rows, DA_RAW_COLS.DATE, DA_COL_MAP, key, yesterday, dayBefore);
  const conv = T('meta_store_conversion');
  const traf = T('meta_store_traffic');
  const metaInstall = T('meta_install');
  const appierInstall = T('appier_install');
  const appierSignup = T('appier_signup');
  const inmobi = T('inmobi_install');
  const rtbh = T('rtbh_apply');
  const criteo = T('criteo_apply');
  const taboola = T('taboola_traffic');
  const buzzvil = mediaMTD_(mc, rows, DA_RAW_COLS.DATE, DA_COL_MAP, 'rcpa_buzzvil', yesterday);
  const rcpe = mediaMTD_(mc, rows, DA_RAW_COLS.DATE, DA_COL_MAP, 'rcpe_total', yesterday);

  const metaLines = [
    `- 메타 사람인스토어 Conversion 캠페인 전일 상품보기 ${withDeltaHtml_(conv.cur.productView, conv.prev.productView, commaInt_)}건 및 구매 ${withDeltaHtml_(conv.cur.purchase, conv.prev.purchase, commaInt_)}건 발생, 구매액 약 ${manWonText_(conv.cur.revenue)}`,
    `- Traffic Web 캠페인 전일 광고비 약 ${manWonText_(traf.cur.spent)} 소진 운영 간 CTR ${withDeltaHtml_(traf.cur.ctr, traf.prev.ctr, pctText_)} 기록 및 CPC ${withDeltaHtml_(traf.cur.cpc, traf.prev.cpc, wonText_)} 발생`,
  ];

  const installLines = [
    `- Install(AOS/iOS) 캠페인 전일 CPI ${withDeltaHtml_(metaInstall.cur.cpi, metaInstall.prev.cpi, wonText_)} 발생, 광고비 약 ${manWonText_(metaInstall.cur.spent)} 소진 간 설치 수 ${withDeltaHtml_(metaInstall.cur.install, metaInstall.prev.install, commaInt_)}건 확보`,
  ];
  const appierLines = [
    `- 애피어 전일 Install_iOS 캠페인 CPI ${withDeltaHtml_(appierInstall.cur.cpi, appierInstall.prev.cpi, wonText_)} 발생, 광고비 약 ${manWonText_(appierInstall.cur.spent)} 운영 간 설치 수 ${withDeltaHtml_(appierInstall.cur.install, appierInstall.prev.install, commaInt_)}건 확보`,
    `ㄴ Signup_AOS/iOS 캠페인 CPA ${withDeltaHtml_(appierSignup.cur.cpa, appierSignup.prev.cpa, wonText_)} 발생 및 광고비 약 ${manWonText_(appierSignup.cur.spent)} 소진 간 입사지원 ${withDeltaHtml_(appierSignup.cur.apply, appierSignup.prev.apply, commaInt_)}건 확보`,
  ];
  const inmobiLines = [
    `- 인모비 Install_iOS 캠페인 설치 ${withDeltaHtml_(inmobi.cur.install, inmobi.prev.install, commaInt_)}건 확보 및 CPI ${withDeltaHtml_(inmobi.cur.cpi, inmobi.prev.cpi, wonText_)} 기록`,
  ];

  const applyLines = [
    `- RTBH 광고비 약 ${manWonText_(rtbh.cur.spent)} 소진 간 CPA ${withDeltaHtml_(rtbh.cur.cpa, rtbh.prev.cpa, wonText_)} 기록하며 지원 수 ${withDeltaHtml_(rtbh.cur.apply, rtbh.prev.apply, commaInt_)}건 확보`,
    `- 크리테오 전일 ${manWonText_(criteo.cur.spent)} 소진 간 지원 CPA ${withDeltaHtml_(criteo.cur.cpa, criteo.prev.cpa, wonText_)} 및 입사지원 수 ${withDeltaHtml_(criteo.cur.apply, criteo.prev.apply, commaInt_)}건 확보`,
  ];

  const trafficLine = `- 타불라 광고비 약 ${manWonText_(taboola.cur.spent)} 소진 간 CPC ${withDeltaHtml_(taboola.cur.cpc, taboola.prev.cpc, wonText_)} 발생, CTR ${withDeltaHtml_(taboola.cur.ctr, taboola.prev.ctr, pctText_)} 발생으로 유입 ${commaInt_(taboola.cur.click)}건 확보`;

  const rcpLines = [
    `- rCPA 운영 매체 '버즈빌' 회원가입 총 ${commaInt_(buzzvil.signup)}건 확보 및 CPA ${wonText_(buzzvil.cpaSignup)} 기록 운영 중`,
    `- rCPE 매체 앱 설치+실행 운영 매체(애디슨오퍼월-네트워크, 애디슨오퍼월-쿠키오븐, 그린피, 버즈빌) 앱 실행 단가 ${wonText_(rcpe.cpe)}로 운영 중`,
  ];

  return titleHtml_('사람인 DA') +
    `<p style="margin:0 0 4px;">${budgetLine}</p>` +
    `<p style="margin:0 0 4px;font-size:12px;color:#5f6368;">*${month}월 예산 사람인스토어, 나인즈, 유튜브 구독 캠페인 포함된 예산입니다. (예비비 300만원 제외)</p>` +
    `<p style="margin:0 0 10px;font-size:12px;color:#5f6368;">- 유튜브 구독 캠페인 데이터는 이번 버전에 자동 집계되지 않습니다. 필요 시 [유튜브구독캠페인] 시트를 별도로 확인해 주세요.</p>` +
    groupHtml_('사람인스토어') +
    subHeaderHtml_('메타') + linesHtml_(metaLines) +
    groupHtml_('DA') +
    subHeaderHtml_('머신러닝 - 앱설치 매체') +
    linesHtml_(installLines) + linesHtml_(appierLines) + linesHtml_(inmobiLines) +
    subHeaderHtml_('머신러닝 - 입사지원 매체') + linesHtml_(applyLines) +
    subHeaderHtml_('머신러닝 - 트래픽 매체') + linesHtml_([trafficLine]) +
    subHeaderHtml_('rCPE/rCPA') + linesHtml_(rcpLines);
}

function buildEmailHtml_(yesterday, cpiHtml, daHtml) {
  const dateText = formatMD_(yesterday);
  return `<div style="font-family:'Malgun Gothic',Arial,sans-serif;font-size:14px;color:#202124;line-height:1.7;">
  <p>안녕하세요,<br>와이즈버즈 ${htmlEscape_(CONFIG.GREETING_NAME)}입니다.</p>
  <p>📂 <a href="${CONFIG.DAILY_REPORT_LINK_URL}">사람인 데일리 리포트</a></p>
  <p>${dateText} 기준 CPI, DA 데일리 리포트 코멘트 전달드립니다.</p>
  ${cpiHtml}
  ${daHtml}
  <p style="margin-top:24px;">감사합니다.<br>${htmlEscape_(CONFIG.GREETING_NAME)} 드림</p>
</div>`;
}

/**
 * 메인 실행 함수. 매일 아침 트리거로 실행하면
 * "전일자" CPI/DA 리포트 코멘트를 자동 계산해 CONFIG.EMAIL_TO 로 발송합니다.
 */
function sendDailyReport() {
  const now = new Date();
  const yesterday = addDays_(now, -1);
  const dayBefore = addDays_(now, -2);

  Logger.log('실행 기준일: %s / 전일: %s / 직전일: %s',
    formatDateKey_(now), formatDateKey_(yesterday), formatDateKey_(dayBefore));

  const cpiFile = findLatestReportFile_(CONFIG.CPI_ROOT_FOLDER_ID, now);
  const daFile = findLatestReportFile_(CONFIG.DA_ROOT_FOLDER_ID, now);
  Logger.log('CPI 파일: %s / DA 파일: %s', cpiFile.getName(), daFile.getName());

  const cpiOut = withTempSheet_(cpiFile.getId(), (ss) => ({
    text: buildCpiSection_(ss, yesterday, dayBefore),
    html: buildCpiSectionHtml_(ss, yesterday, dayBefore),
  }));
  const daOut = withTempSheet_(daFile.getId(), (ss) => ({
    text: buildDaSection_(ss, yesterday, dayBefore),
    html: buildDaSectionHtml_(ss, yesterday, dayBefore),
  }));
  const cpiSection = cpiOut.text, daSection = daOut.text;
  const cpiHtml = cpiOut.html, daHtml = daOut.html;

  const subject = subjectFor_(now);
  const body = buildEmailBody_(yesterday, cpiSection, daSection);
  const htmlBody = buildEmailHtml_(yesterday, cpiHtml, daHtml);

  MailApp.sendEmail({
    to: CONFIG.EMAIL_TO,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: CONFIG.EMAIL_SENDER_NAME,
  });

  Logger.log('메일 발송 완료: %s', subject);
}

// "[와이즈버즈] 사람인 CPI / DA Report 26년 9월 Daily Report_260928" 형태 (실행일=오늘 날짜 기준)
function subjectFor_(targetDate) {
  const yy = targetDate.getFullYear() % 100;
  const month = targetDate.getMonth() + 1;
  const yyMMdd = Utilities.formatDate(targetDate, CONFIG.TIMEZONE, 'yyMMdd');
  return `[와이즈버즈] 사람인 CPI / DA Report ${yy}년 ${month}월 Daily Report_${yyMMdd}`;
}

/**
 * 매일 아침(기본 08:00, Asia/Seoul) 자동 실행되는 트리거를 등록합니다.
 * 스크립트 편집기에서 이 함수를 한 번만 수동 실행하면 됩니다.
 */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendDailyReport')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log('매일 08:00(Asia/Seoul) 자동 발송 트리거를 등록했습니다.');
}

/**
 * 진단용: CPI RAW 탭의 실제 Channel / Campaign 조합을 로그에 출력합니다.
 * Config.gs 의 CPI_MEDIA_CONFIG match 조건이 실제 값과 맞는지 확인할 때 사용하세요.
 */
function logDistinctCpiValues_() {
  const file = findLatestReportFile_(CONFIG.CPI_ROOT_FOLDER_ID, new Date());
  withTempSheet_(file.getId(), (ss) => {
    const rawSheet = ss.getSheetByName(CONFIG.RAW_SHEET_NAME);
    const { rows } = readSheetAsObjects_(rawSheet);
    const seen = {};
    rows.forEach((r) => {
      const key = `${r[CPI_RAW_COLS.CHANNEL]} | ${r[CPI_RAW_COLS.CAMPAIGN]}`;
      seen[key] = (seen[key] || 0) + 1;
    });
    Logger.log('CPI RAW 고유 Channel | Campaign 조합 (건수):\n%s',
      Object.keys(seen).sort().map((k) => `${k}  -> ${seen[k]}행`).join('\n'));
  });
}

/**
 * 진단용: DA RAW 탭의 실제 Channel / Media / DA / Objective / Campaign 조합을 로그에 출력합니다.
 * Config.gs 의 DA_MEDIA_CONFIG match 조건은 추정치이므로, 실행 후 반드시 이 로그와 대조하세요.
 */
function logDistinctDaValues_() {
  const file = findLatestReportFile_(CONFIG.DA_ROOT_FOLDER_ID, new Date());
  withTempSheet_(file.getId(), (ss) => {
    const rawSheet = ss.getSheetByName(CONFIG.RAW_SHEET_NAME);
    const { rows } = readSheetAsObjects_(rawSheet);
    const seen = {};
    rows.forEach((r) => {
      const key = [
        r[DA_RAW_COLS.CHANNEL],
        r[DA_RAW_COLS.MEDIA],
        r[DA_RAW_COLS.DA],
        r[DA_RAW_COLS.OBJECTIVE],
        r[DA_RAW_COLS.CAMPAIGN],
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
function previewDailyReport_() {
  const now = new Date();
  const yesterday = addDays_(now, -1);
  const dayBefore = addDays_(now, -2);

  const cpiFile = findLatestReportFile_(CONFIG.CPI_ROOT_FOLDER_ID, now);
  const daFile = findLatestReportFile_(CONFIG.DA_ROOT_FOLDER_ID, now);

  const cpiSection = withTempSheet_(cpiFile.getId(), (ss) => buildCpiSection_(ss, yesterday, dayBefore));
  const daSection = withTempSheet_(daFile.getId(), (ss) => buildDaSection_(ss, yesterday, dayBefore));

  const body = buildEmailBody_(yesterday, cpiSection, daSection);
  Logger.log('제목: %s', subjectFor_(now));
  Logger.log(body);
}
