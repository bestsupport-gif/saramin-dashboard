// fetch-news.js
// 네이버 뉴스검색 API로 브랜드별 최신 기사를 모아 competitor-news.json에 저장/누적합니다.
// 실행: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 필요 (GitHub Actions Secrets로 주입)
//
// 사용법(로컬 테스트): 
//   NAVER_CLIENT_ID=xxx NAVER_CLIENT_SECRET=yyy node fetch-news.js

const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 필요합니다.');
    process.exit(1);
}
console.log(`Client ID 길이: ${CLIENT_ID.length}자 / Client Secret 길이: ${CLIENT_SECRET.length}자 (값 자체는 보안상 출력하지 않습니다)`);

// 추적할 브랜드 목록 (대시보드 브랜드 세트와 동일하게 맞춰뒀습니다. 필요시 자유롭게 수정하세요)
const BRANDS = [
    '사람인', '잡코리아', '원티드', '인크루트', '리멤버',
    '알바몬', '알바천국', '동네알바', '급구', '잡플래닛',
  ];

const OUTPUT_PATH = path.join(__dirname, 'competitor-news.json');
const DISPLAY_PER_BRAND = 20; // 브랜드당 가져올 기사 수 (최대 100)
const MAX_AGE_DAYS = 120;     // 이 기간보다 오래된 기사는 저장하지 않음(파일 용량 관리)

function naverDateToISO(pubDate) {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return null;
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function fetchBrandNews(brand) {
    const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(brand)}&display=${DISPLAY_PER_BRAND}&sort=date&format=json`;
    const res = await fetch(url, {
          headers: {
                  'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
                  'X-NCP-APIGW-API-KEY': CLIENT_SECRET,
          },
    });
    if (!res.ok) {
          const bodyText = await res.text().catch(() => '(응답 본문을 읽을 수 없음)');
          console.error(`[${brand}] API 요청 실패: HTTP ${res.status}`);
          console.error(`  응답 내용: ${bodyText}`);
          return [];
    }
    const json = await res.json();
    console.log(`  [${brand}] 원본 응답 total=${json.total}, 반환된 item 수=${(json.items||[]).length}`);
    return (json.items || []).map((item) => {
          const date = naverDateToISO(item.pubDate);
          if (!date) return null;
          return {
                  date,
                  brand,
                  title: stripTags(item.title),
                  url: item.originallink || item.link,
                  source: (() => {
                            try { return new URL(item.originallink || item.link).hostname.replace(/^www\./, ''); }
                            catch { return ''; }
                  })(),
          };
    }).filter(Boolean);
}

function loadExisting() {
    try {
          const raw = fs.readFileSync(OUTPUT_PATH, 'utf-8');
          const json = JSON.parse(raw);
          return Array.isArray(json) ? json : (json.items || []);
    } catch (e) {
          return [];
    }
}

function dedupeKey(item) {
    return `${item.date}__${item.brand}__${item.url}`;
}

async function main() {
    console.log(`브랜드 ${BRANDS.length}개 뉴스 수집 시작...`);
    const existing = loadExisting();
    const existingKeys = new Set(existing.map(dedupeKey));

  let collected = [];
    for (const brand of BRANDS) {
          try {
                  const items = await fetchBrandNews(brand);
                  console.log(`  - ${brand}: ${items.length}건 조회`);
                  collected = collected.concat(items);
          } catch (e) {
                  console.error(`  - ${brand}: 실패 (${e.message})`);
          }
          await new Promise((r) => setTimeout(r, 300));
    }

  const newItems = collected.filter((it) => !existingKeys.has(dedupeKey(it)));
    const merged = existing.concat(newItems);

  const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const pruned = merged.filter((it) => it.date >= cutoffStr);

  pruned.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(pruned, null, 2), 'utf-8');
    console.log(`완료: 신규 ${newItems.length}건 추가, 총 ${pruned.length}건 저장 (${OUTPUT_PATH})`);
}

main().catch((e) => {
    console.error('실행 중 오류:', e);
    process.exit(1);
});
