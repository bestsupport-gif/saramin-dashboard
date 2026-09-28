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

function buildBudgetLineText_(summarySheet, rawRows, dateColName, spentColName, targetDate, totalBudgetLabel) {
  const budget = toNumber_(findLabelValue_(summarySheet, CONFIG.BUDGET_LABEL_TEXT));
  const mtdSpent = sumSpentMonthToDate_(rawRows, dateColName, spentColName, targetDate);
  const pct = safeDivide_(mtdSpent, budget);
  const yy = targetDate.getFullYear() % 100;
  const month = targetDate.getMonth() + 1;
  if (!budget) {
    return `- ${totalBudgetLabel} 예산 정보를 Summary 탭에서 찾지 못했습니다 (라벨: "${CONFIG.BUDGET_LABEL_TEXT}"). 셀 위치를 확인해 주세요.`;
  }
  return `- ${yy}년 ${month}월 예산 ${manWonText_(budget, 0)} 중 약 ${pctText_(pct)}인 약 ${manWonText_(mtdSpent)} 소진 운영 중입니다.`;
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
  const budgetLine = buildBudgetLineText_(summarySheet, rows, DA_RAW_COLS.DATE, DA_RAW_COLS.SPENT, yesterday, 'DA');
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
  const buzzvil = T('rcpa_buzzvil');
  const rcpe = T('rcpe_total');

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
    `- rCPA 운영 매체 '버즈빌' 회원가입 총 ${commaInt_(buzzvil.cur.signup)}건 확보 및 CPA ${wonText_(buzzvil.cur.cpaSignup)} 기록 운영 중`,
    `- rCPE 매체 앱 설치+실행 운영 매체(애디슨오퍼월-네트워크, 애디슨오퍼월-쿠키오븐, 그린피) 앱 실행 단가 ${wonText_(rcpe.cur.cpe)}로 운영 중`,
  ];

  return `<사람인 DA>\n${budgetLine}\n*${month}월 예산 사람인스토어, 타불라, 나인즈, 유튜브 구독 캠페인까지 포함된 예산입니다.\n- 유튜브 구독 캠페인 데이터는 이번 버전에 자동 집계되지 않습니다. 필요 시 [유튜브구독캠페인] 시트를 별도로 확인해 주세요.\n\n사람인스토어\n[메타]\n${metaLines.join('\n')}\n\nDA\n[머신러닝 - 앱설치 매체]\n${installLines.join('\n')}\n\n[머신러닝 - 입사지원 매체]\n${applyLines.join('\n')}\n\n[머신러닝 - 트래픽 매체]\n${trafficLine}\n\n[rCPE/rCPA]\n${rcpLines.join('\n')}`;
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
(자동 발송)`;
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
  const budgetLine = buildBudgetLineText_(summarySheet, rows, DA_RAW_COLS.DATE, DA_RAW_COLS.SPENT, yesterday, 'DA');
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
  const buzzvil = T('rcpa_buzzvil');
  const rcpe = T('rcpe_total');

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
    `- rCPA 운영 매체 '버즈빌' 회원가입 총 ${commaInt_(buzzvil.cur.signup)}건 확보 및 CPA ${wonText_(buzzvil.cur.cpaSignup)} 기록 운영 중`,
    `- rCPE 매체 앱 설치+실행 운영 매체(애디슨오퍼월-네트워크, 애디슨오퍼월-쿠키오븐, 그린피) 앱 실행 단가 ${wonText_(rcpe.cur.cpe)}로 운영 중`,
  ];

  return titleHtml_('사람인 DA') +
    `<p style="margin:0 0 4px;">${budgetLine}</p>` +
    `<p style="margin:0 0 4px;"><b>*${month}월 예산 사람인스토어, 타불라, 나인즈, 유튜브 구독 캠페인까지 포함된 예산입니다.</b></p>` +
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
  <p style="margin-top:24px;">감사합니다.<br><span style="font-size:12px;color:#9aa0a6;">(자동 발송)</span></p>
</div>`;
}
