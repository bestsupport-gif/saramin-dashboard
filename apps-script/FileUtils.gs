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
