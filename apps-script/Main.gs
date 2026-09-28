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

  const subject = subjectFor_(yesterday);
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

// "[와이즈버즈] 사람인 CPI / DA Report 26년 8월 Daily Report_260826" 형태 (전일 날짜 기준)
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
  Logger.log('제목: %s', subjectFor_(yesterday));
  Logger.log(body);
}
