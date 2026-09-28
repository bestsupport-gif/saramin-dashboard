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

// 헤더 셀 안의 줄바꿈/공백 위치가 파일마다 조금씩 다를 수 있어(예: "Install\n(+SKAN)" vs
// "Install (+SKAN)"), 매칭용 키는 공백을 전부 제거해서 만든다. Config.gs 의 *_RAW_COLS
// 상수들도 반드시 같은 방식(공백 없이)으로 적어야 한다.
function normalizeHeader_(h) {
  return String(h == null ? '' : h).replace(/\s+/g, '').trim();
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

/**
 * 시트 데이터 전체를 헤더 기준 객체 배열로 읽기.
 * 반환: { headers: string[](정규화됨), rows: Object[] }
 */
function readSheetAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = values[0].map(normalizeHeader_);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
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
