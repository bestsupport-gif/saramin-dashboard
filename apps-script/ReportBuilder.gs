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
