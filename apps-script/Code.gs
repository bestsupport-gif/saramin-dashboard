/**
 * 사람인 CPI/DA 데일리 리포트 자동 코멘트 발송 - 전체 코드 (한 파일 버전)
 * Apps Script 프로젝트의 Code.gs 하나에 이 파일 전체를 붙여넣고,
 * appsscript.json 매니페스트만 별도로 설정하면 됩니다.
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

  // 드라이브 폴더 ID (사람인 CPI / DA 링크에서 추출)
  CPI_ROOT_FOLDER_ID: '11SIntvBWeplheOvl2Wz74FZB-rQHx6Xj',
  DA_ROOT_FOLDER_ID: '1gAvzZozBW64vyyMeOP6Wt7RJ45lKx3rb',

  RAW_SHEET_NAME: 'RAW',
  SUMMARY_SHEET_NAME: 'Summary',

  // 예산 라벨 셀 탐색 시 사용할 텍스트 (Summary 탭 상단에 위치)
  BUDGET_LABEL_TEXT: '월 예산',

  // 변환용 임시 구글시트를 만들 폴더 (미지정 시 내 드라이브 최상단에 생성 후 바로 삭제)
  TEMP_FOLDER_ID: null,
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

// ⚠️ 추정치 - logDistinctDaValues_() 실행 결과로 검증/수정 필요
const DA_MEDIA_CONFIG = [
  {
    key: 'meta_store_conversion',
    label: '사람인스토어 [메타] Conversion',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Meta' &&
      row[DA_RAW_COLS.MEDIA] === '사람인스토어' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'Conversion',
    metrics: ['productView', 'purchase', 'revenue', 'roas'],
  },
  {
    key: 'meta_store_traffic',
    label: '사람인스토어 [메타] Traffic Web',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Meta' &&
      row[DA_RAW_COLS.MEDIA] === '사람인스토어' &&
      row[DA_RAW_COLS.OBJECTIVE] === 'Traffic',
    metrics: ['spent', 'imps', 'click', 'ctr', 'cpc'],
  },
  {
    key: 'meta_install',
    label: '[머신러닝-앱설치] Meta(자체) Install',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Meta' &&
      row[DA_RAW_COLS.MEDIA] === 'Install',
    metrics: ['spent', 'install', 'cpi', 'appOpen', 'cpe'],
  },
  {
    key: 'appier_install',
    label: '[머신러닝-앱설치] 애피어 Install',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Appier' &&
      /install/i.test(String(row[DA_RAW_COLS.CAMPAIGN] || '')),
    metrics: ['spent', 'install', 'cpi'],
  },
  {
    key: 'appier_signup',
    label: '[머신러닝-앱설치] 애피어 Signup(입사지원)',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Appier' &&
      /signup/i.test(String(row[DA_RAW_COLS.CAMPAIGN] || '')),
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'inmobi_install',
    label: '[머신러닝-앱설치] 인모비 Install',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Inmobi',
    metrics: ['spent', 'install', 'cpi'],
  },
  {
    key: 'rtbh_apply',
    label: '[머신러닝-입사지원] RTBH',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'RTB house' || row[DA_RAW_COLS.CHANNEL] === 'RTBH',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'criteo_apply',
    label: '[머신러닝-입사지원] 크리테오',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Criteo',
    metrics: ['spent', 'apply', 'cpa'],
  },
  {
    key: 'taboola_traffic',
    label: '[머신러닝-트래픽] 타불라',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'taboola' || row[DA_RAW_COLS.CHANNEL] === 'Taboola',
    metrics: ['spent', 'imps', 'click', 'ctr', 'cpc'],
  },
  {
    // 실제 값 확인됨: Channel="Buzzvil" (한글 아님). 단 Buzzvil 채널 안에 Youtube_sub(CPY)
    // 캠페인도 섞여 있어서, rCPA 가입 캠페인만 걸러내려고 Objective가 "Youtube_sub"가
    // 아닌 것만 포함시킴 (Objective 실제값 전체 확인 후 더 정확히 좁혀야 함).
    key: 'rcpa_buzzvil',
    label: '[rCPA] 버즈빌',
    match: (row) => row[DA_RAW_COLS.CHANNEL] === 'Buzzvil' &&
      row[DA_RAW_COLS.OBJECTIVE] !== 'Youtube_sub',
    metrics: ['spent', 'signup', 'cpaSignup'],
  },
  {
    // 실제 값 확인됨: Channel="AdisonOfferwall" (한글 아님, "애디슨오퍼월-네트워크/쿠키오븐"
    // 처럼 세분화된 값이 아니라 하나로 뭉쳐 있음 - 네트워크/쿠키오븐 구분이 필요하면 Campaign/
    // Creative 컬럼 값으로 추가 분리해야 함). "그린피" 채널은 아직 샘플에서 못 봐서 그대로 둠.
    // "앱 실행" 전용 컬럼이 RAW 헤더에서 확인되지 않아, 임시로 Total Opens(App+Web) 컬럼을
    // "실행수"로 대체 사용합니다. 실제 컬럼이 따로 있다면 metrics/appOpen 매핑을 수정하세요.
    key: 'rcpe_total',
    label: '[rCPE] 애디슨오퍼월/그린피 (앱 실행)',
    match: (row) => ['AdisonOfferwall', '그린피', 'Greenpea'].indexOf(row[DA_RAW_COLS.CHANNEL]) !== -1,
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

function manWonText_(n, decimals) {
  const man = n / 10000;
  return `${man.toFixed(decimals == null ? 1 : decimals)}만 원`;
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

/**
 * Summary 탭에서 월 예산을 찾고, RAW 탭에서 MTD 소진액을 계산해 예산 현황 문장 생성
 */
function buildBudgetLine_(summarySheet, rawRows, dateColName, spentColName, targetDate, totalBudgetLabel) {
  const budgetRaw = findLabelValue_(summarySheet, CONFIG.BUDGET_LABEL_TEXT);
  const budget = toNumber_(budgetRaw);
  const mtdSpent = sumSpentMonthToDate_(rawRows, dateColName, spentColName, targetDate);
  const pct = safeDivide_(mtdSpent, budget);
  const yy = targetDate.getFullYear() % 100;
  const month = targetDate.getMonth() + 1;
  if (!budget) {
    return `- ${totalBudgetLabel} 예산 정보를 Summary 탭에서 찾지 못했습니다 (라벨: "${CONFIG.BUDGET_LABEL_TEXT}"). 셀 위치를 확인해 주세요.`;
  }
  return `- ${yy}년 ${month}월 예산 ${manWonText_(budget, 0)} 중 약 ${pctText_(pct)}인 약 ${manWonText_(mtdSpent)} 소진 운영 중입니다.`;
}

/**
 * MEDIA_CONFIG 배열 하나를 순회하며 "라벨\n지표1, 지표2 ..." 섹션 텍스트 생성
 */
function buildMediaSections_(mediaConfigList, rawRows, dateColName, colMap, yesterday, dayBefore) {
  return mediaConfigList.map((cfg) => {
    const cur = aggregateSection_(rawRows, dateColName, colMap, cfg.match, yesterday);
    const prev = aggregateSection_(rawRows, dateColName, colMap, cfg.match, dayBefore);
    const lines = buildMetricLines_(cfg.metrics, cur, prev);
    if (cur._matchedRows === 0 && prev._matchedRows === 0) {
      return `[${cfg.label}]\n- 전일/직전일 RAW 데이터에서 해당 조건과 일치하는 행을 찾지 못했습니다. Config.gs 의 매칭 조건을 확인해 주세요.`;
    }
    return `[${cfg.label}]\n- ${lines.join(', ')}`;
  });
}

function buildCpiSection_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`CPI 파일에서 '${CONFIG.SUMMARY_SHEET_NAME}' 또는 '${CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = readSheetAsObjects_(rawSheet);

  const budgetLine = buildBudgetLine_(summarySheet, rows, CPI_RAW_COLS.DATE, CPI_RAW_COLS.SPENT, yesterday, 'CPI');
  const mediaSections = buildMediaSections_(CPI_MEDIA_CONFIG, rows, CPI_RAW_COLS.DATE, CPI_COL_MAP, yesterday, dayBefore);

  return `<사람인 CPI>\n${budgetLine}\n\n${mediaSections.join('\n\n')}`;
}

function buildDaSection_(spreadsheet, yesterday, dayBefore) {
  const summarySheet = spreadsheet.getSheetByName(CONFIG.SUMMARY_SHEET_NAME);
  const rawSheet = spreadsheet.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!summarySheet || !rawSheet) {
    throw new Error(`DA 파일에서 '${CONFIG.SUMMARY_SHEET_NAME}' 또는 '${CONFIG.RAW_SHEET_NAME}' 탭을 찾지 못했습니다.`);
  }
  const { rows } = readSheetAsObjects_(rawSheet);

  const budgetLine = buildBudgetLine_(summarySheet, rows, DA_RAW_COLS.DATE, DA_RAW_COLS.SPENT, yesterday, 'DA');
  const mediaSections = buildMediaSections_(DA_MEDIA_CONFIG, rows, DA_RAW_COLS.DATE, DA_COL_MAP, yesterday, dayBefore);
  const month = yesterday.getMonth() + 1;

  return `<사람인 DA>\n${budgetLine}\n*${month}월 예산 사람인스토어, 타불라, 나인즈, 유튜브 구독 캠페인까지 포함된 예산입니다.\n\n${mediaSections.join('\n\n')}\n\n※ 유튜브구독캠페인은 이번 버전에 자동 집계되지 않습니다. 필요 시 [유튜브구독캠페인] 시트를 별도로 확인해 주세요.`;
}

function buildEmailBody_(yesterday, cpiSection, daSection) {
  const dateText = formatMD_(yesterday);
  return `안녕하세요,
와이즈버즈입니다.

📂 사람인 데일리 리포트

${dateText} 기준 CPI, DA 데일리 리포트 코멘트 전달드립니다.
(아래 수치는 스크립트가 RAW 데이터를 기준으로 자동 집계한 값이며, 매체/키워드 조정이나 소재 관련 코멘트는 포함되어 있지 않습니다. 확인 후 필요한 코멘트를 추가해 주세요.)

${cpiSection}


${daSection}


감사합니다.
(자동 발송)`;
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

  const cpiSection = withTempSheet_(cpiFile.getId(), (ss) => buildCpiSection_(ss, yesterday, dayBefore));
  const daSection = withTempSheet_(daFile.getId(), (ss) => buildDaSection_(ss, yesterday, dayBefore));

  const subject = `[사람인] ${formatMD_(yesterday)} 기준 CPI, DA 데일리 리포트`;
  const body = buildEmailBody_(yesterday, cpiSection, daSection);

  MailApp.sendEmail({
    to: CONFIG.EMAIL_TO,
    subject: subject,
    body: body,
    name: CONFIG.EMAIL_SENDER_NAME,
  });

  Logger.log('메일 발송 완료: %s', subject);
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
  Logger.log(body);
}
