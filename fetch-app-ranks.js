// fetch-app-ranks.js
// 애플 App Store(공식 공개 RSS 차트)와 구글플레이(비공식, 페이지 기반) 인기 무료 앱 차트에서
// 우리가 추적하는 10개 브랜드 앱의 현재 순위를 찾아 app-ranks.json에 저장합니다.
//
// 실행: node fetch-app-ranks.js  (API 키 불필요)
//
// 참고:
// - iOS는 애플이 공식적으로 공개하는 RSS 차트를 그대로 읽는 것이라 안정적입니다.
// - Android는 구글이 공식 API를 제공하지 않아서, 구글플레이 페이지를 읽어오는
//   `google-play-scraper` 라이브러리를 사용합니다. 구글이 페이지 구조를 바꾸면
//   이 부분만 일시적으로 실패할 수 있습니다(전체 스크립트가 죽지는 않습니다).

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'app-ranks.json');

const APP_IDS = {
  '사람인':   { ios: '739013038',  android: 'kr.co.saramin.brandapp' },
  '잡코리아': { ios: '569092652',  android: 'com.jobkorea.app' },
  '원티드':   { ios: '1074569961', android: 'com.wanted.android.wanted' },
  '인크루트': { ios: '366417871',  android: 'incruit.app' },
  '리멤버':   { ios: '840553277',  android: 'kr.co.rememberapp' },
  '알바몬':   { ios: '382535825',  android: 'com.albamon.app' },
  '알바천국': { ios: '996325726',  android: 'kr.co.alba.webappalba.m' },
  '동네알바': { ios: '1534674681', android: 'com.dongnealba.app.android' },
  '급구':     { ios: '1024369566', android: null },
  '잡플래닛': { ios: '981750452',  android: 'com.jobplanet.kr.android' },
};

const CHART_LIMIT = 200;

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch (e) {
    return null;
  }
}

async function fetchIosRanks() {
  const url = `https://itunes.apple.com/kr/rss/topfreeapplications/limit=${CHART_LIMIT}/genre=6000/json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`iOS 차트 조회 실패: HTTP ${res.status}`);
  }
  const json = await res.json();
  const entries = (json.feed && json.feed.entry) || [];
  const rankById = new Map();
  entries.forEach((entry, idx) => {
    const id = entry.id && entry.id.attributes && entry.id.attributes['im:id'];
    if (id) rankById.set(String(id), idx + 1);
  });

  const result = {};
  for (const [brand, ids] of Object.entries(APP_IDS)) {
    result[brand] = ids.ios ? (rankById.get(String(ids.ios)) || null) : null;
  }
  return result;
}

async function fetchAndroidRanks() {
  let gplay;
  try {
    const mod = require('google-play-scraper');
    gplay = mod.default || mod;
  } catch (e) {
    console.error('google-play-scraper 모듈을 찾을 수 없습니다.');
    return Object.fromEntries(Object.keys(APP_IDS).map((b) => [b, null]));
  }

  const list = await gplay.list({
    collection: gplay.collection.TOP_FREE,
    category: gplay.category.BUSINESS,
    country: 'kr',
    lang: 'ko',
    num: CHART_LIMIT,
    fullDetail: false,
  });

  const rankByPackage = new Map();
  list.forEach((app, idx) => {
    if (app.appId) rankByPackage.set(app.appId, idx + 1);
  });

  const result = {};
  for (const [brand, ids] of Object.entries(APP_IDS)) {
    result[brand] = ids.android ? (rankByPackage.get(ids.android) || null) : null;
  }
  return result;
}

async function main() {
  console.log('앱스토어 순위 수집 시작...');
  const existing = loadExisting();
  const prevAos = new Map((existing?.aos || []).map((it) => [it.brand, it.rank]));
  const prevIos = new Map((existing?.ios || []).map((it) => [it.brand, it.rank]));

  let iosRanks = {};
  try {
    iosRanks = await fetchIosRanks();
    console.log('iOS 차트 조회 완료:', iosRanks);
  } catch (e) {
    console.error('iOS 차트 조회 실패:', e.message);
    iosRanks = Object.fromEntries(Object.keys(APP_IDS).map((b) => [b, null]));
  }

  let androidRanks = {};
  try {
    androidRanks = await fetchAndroidRanks();
    console.log('Android 차트 조회 완료:', androidRanks);
  } catch (e) {
    console.error('Android 차트 조회 실패(구글플레이 페이지 구조 변경 가능성):', e.message);
    androidRanks = Object.fromEntries(Object.keys(APP_IDS).map((b) => [b, null]));
  }

  const brands = Object.keys(APP_IDS);
  const output = {
    updatedAt: new Date().toISOString(),
    aos: brands.map((brand) => ({
      brand,
      rank: androidRanks[brand] ?? null,
      prevRank: prevAos.has(brand) ? prevAos.get(brand) : null,
    })),
    ios: brands.map((brand) => ({
      brand,
      rank: iosRanks[brand] ?? null,
      prevRank: prevIos.has(brand) ? prevIos.get(brand) : null,
    })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`완료: ${OUTPUT_PATH} 저장됨`);
}

main().catch((e) => {
  console.error('실행 중 오류:', e);
  process.exit(1);
});
