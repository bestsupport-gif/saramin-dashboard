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
