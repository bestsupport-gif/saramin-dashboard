# 사람인 CPI/DA 데일리 리포트 자동 코멘트 발송

매일 실행하면 어제 날짜 기준으로 사람인 CPI/DA 드라이브 폴더에서 **해당 월(년/월)로 업데이트된 최신 리포트 파일**을 찾아, RAW 탭 데이터를 기준으로 전일 vs 직전일 CPI/CPE/CPA/CPC 등 증감을 자동 계산해서 `best_support@wisebirds.com` 으로 메일을 발송합니다.

## 이 스크립트가 자동화하는 것 / 하지 않는 것

- ✅ 자동화: 예산 소진율, CPI/CPE/CPA/CPC/CTR 등 숫자와 전일 대비 증감(▲▼), 날짜 표기("8/11" 같은 날짜를 실행일 전일로 자동 치환)
- ❌ 자동화하지 않음(요청하신 대로 제외): "⏩ 저효율 키워드 입찰가 조정", "금일 OFF 처리 요청" 같은 **분석가 판단이 들어간 정성적 코멘트**, 소재/그룹 단위의 세부 하이라이트(예: "harusal22 소재 ROAS 106%", "HOT100/사람인스토어 그룹 지원 985건")
- ❌ 유튜브구독캠페인은 이번 버전에 포함되지 않았습니다 (본문에 안내 문구만 추가됨)

## 설정 방법

1. [script.google.com](https://script.google.com) 에서 새 프로젝트 생성 (예: `사람인 데일리 리포트`)
2. 이 폴더의 `.gs` 파일들(Config, Utils, FileUtils, Metrics, ReportBuilder, Main)을 그대로 복사해서 스크립트 편집기에 각각 같은 이름의 파일로 붙여넣기
3. 좌측 `프로젝트 설정` > `appsscript.json 파일을 편집기에서 보기` 체크 후, 이 폴더의 `appsscript.json` 내용으로 덮어쓰기
4. 좌측 `서비스(+)` 에서 **Drive API** (Advanced Google Services)를 추가 (appsscript.json에 이미 선언되어 있지만, UI에서도 한 번 추가해줘야 활성화되는 경우가 있습니다)
5. 이 스크립트를 실행할 구글 계정이 두 드라이브 폴더(CPI/DA)에 접근 권한이 있는지 확인 (best_support@wisebirds.com 계정 권장)

## 실행 전 반드시 해야 할 것: 매체 매칭값 검증

DA 리포트의 `Config.gs > DA_MEDIA_CONFIG` 안 매칭 조건(Channel/Media/Objective 값)은 탭 이름을 바탕으로 한 **추정치**입니다. 아래 순서로 검증하세요.

1. 스크립트 편집기에서 함수 선택 드롭다운을 `logDistinctDaValues_` 로 바꾸고 ▶ 실행
2. 처음 실행 시 권한 승인 팝업이 뜨면 승인 (Drive, Gmail 발송 권한 필요)
3. 실행 후 `보기 > 로그` (또는 `Ctrl+Enter`) 로 실제 `Channel | Media | DA | Objective | Campaign` 조합 목록 확인
4. `Config.gs` 의 `DA_MEDIA_CONFIG` 각 항목 `match` 함수를 실제 값에 맞게 수정
5. CPI도 동일하게 `logDistinctCpiValues_` 실행해서 `Channel | Campaign` 조합이 `CPI_MEDIA_CONFIG` 와 일치하는지 확인 (CPI는 이미 실 데이터로 확인된 값이라 기본값 그대로도 동작할 가능성이 높습니다)

## 미리보기 / 테스트

- `previewDailyReport_` 함수를 실행하면 메일을 보내지 않고 로그에만 본문을 출력합니다. 먼저 이걸로 결과를 확인하세요.
- 문제 없으면 `sendDailyReport` 를 한 번 수동 실행해서 실제 메일이 오는지 확인하세요.

## 매일 자동 발송 예약

`createDailyTrigger` 함수를 스크립트 편집기에서 한 번 실행하면 매일 08:00(Asia/Seoul)에 `sendDailyReport` 가 자동 실행되도록 트리거가 등록됩니다. (시간을 바꾸려면 `Main.gs` 의 `.atHour(8)` 값을 수정하세요.)

## 알아두어야 할 점 (설계 배경)

- 리포트 파일은 Google Sheets가 아니라 매일 새로 업로드되는 `.xlsx` 파일입니다. Apps Script의 `SpreadsheetApp` 은 xlsx를 직접 열 수 없어서, 실행할 때마다 **임시 Google Sheets 사본으로 변환 → 데이터 집계 → 임시 사본 삭제** 하는 방식으로 동작합니다 (Drive 고급 서비스 필요).
- Summary 탭의 피벗 테이블은 날짜가 늘어날 때마다 행이 밀려서 셀 위치가 계속 바뀌기 때문에, 피벗 셀을 직접 참조하지 않고 **RAW 탭 원본 데이터를 날짜+매체 조건으로 직접 집계**해서 CPI/CPE/CPA 등을 재계산합니다. 이 방식이 리포트 형식이 바뀌어도 가장 안정적입니다.
- 월 예산 총액은 Summary 탭에서 `"월 예산"` 이라는 라벨 텍스트를 찾아 그 옆 셀 값을 읽어옵니다 (라벨 자체 위치는 매달 크게 바뀌지 않는 것을 확인했습니다).
- CPI RAW의 날짜 컬럼명은 `Event Date`, DA RAW는 `Date` 로 서로 다릅니다 (실제 파일 기준으로 반영됨).

## 나중에 추가하고 싶다면

- `Config.gs` 의 `CPI_MEDIA_CONFIG` / `DA_MEDIA_CONFIG` 배열에 항목을 추가하면 새로운 매체/캠페인 섹션이 자동으로 늘어납니다. `match` 함수와 `metrics` 배열(`Metrics.gs` 의 `METRIC_LABELS` 참고)만 지정하면 됩니다.
- 유튜브구독캠페인, 소재/그룹 단위 세부 지표도 같은 패턴(RAW 집계)으로 확장 가능합니다.
