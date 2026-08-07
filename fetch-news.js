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

const BRANDS = [
  '사람인', '잡코리아', '원티드', '인크루트', '리멤버',
  '알바몬', '알바천국', '동네알바', '급구', '잡플래닛',
];

const OUTPUT_PATH = path.join(__dirname, 'competitor-news.json');
const DISPLAY_PER_BRAND = 20;
const MAX_AGE_DAYS = 120;

function naverDateToISO(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const AMBIGUOUS_BRANDS = {
  '사람인': ['채용', '구인구직', '이력서', '일자리', '인재', '취업', '알바', '잡코리아', '구직', 'HR'],
  '급구': ['채용', '구인구직', '이력서', '일자리', '인재', '취업', '알바', '구인', '구직'],
  '리멤버': ['채용', '명함', '커리어', '이직', '인맥', '앱', '네트워킹', '직장인'],
};

const MAJOR_OUTLETS = [
  'yna.co.kr', 'chosun.com', 'joongang.co.kr', 'hankyung.com', 'mk.co.kr',
  'seoul.co.kr', 'heraldcorp.com', 'edaily.co.kr', 'newsis.com', 'nocutnews.co.kr',
  'ytn.co.kr', 'sbs.co.kr', 'kbs.co.kr', 'jtbc.co.kr', 'imbc.com',
];

function normalizeTitleForCompare(title) {
  return String(title || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function dedupeSimilarTitles(items) {
  const groups = [];
  items.forEach((it) => {
    const norm = normalizeTitleForCompare(it.title);
    let matched = null;
    for (const g of groups) {
      if (g.brand !== it.brand) continue;
      if (norm && (g.norm === norm || g.norm.includes(norm) || norm.includes(g.norm))) {
        matched = g;
        break;
      }
    }
    if (matched) {
      matched.items.push(it);
      if (norm.length > matched.norm.length) matched.norm = norm;
    } else {
      groups.push({ brand: it.brand, norm, items: [it] });
    }
  });

  return groups.map((g) => {
    if (g.items.length === 1) return g.items[0];
    const sorted = g.items.slice().sort((a, b) => {
      const aMajor = MAJOR_OUTLETS.some((d) => a.source.includes(d)) ? 1 : 0;
      const bMajor = MAJOR_OUTLETS.some((d) => b.source.includes(d)) ? 1 : 0;
      if (aMajor !== bMajor) return bMajor - aMajor;
      return b.date.localeCompare(a.date);
    });
    return sorted[0];
  });
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
  const all = (json.items || []).map((item) => {
    const date = naverDateToISO(item.pubDate);
    if (!date) return null;
    return {
      date,
      brand,
      title: stripTags(item.title),
      description: stripTags(item.description),
      url: item.originallink || item.link,
      source: (() => {
        try { return new URL(item.originallink || item.link).hostname.replace(/^www\./, ''); }
        catch { return ''; }
      })(),
    };
  }).filter(Boolean);

  let filtered = all.filter((it) => it.title.includes(brand));

  const contextKeywords = AMBIGUOUS_BRANDS[brand];
  if (contextKeywords) {
    const before = filtered.length;
    filtered = filtered.filter((it) => {
      const combined = it.title + ' ' + it.description;
      return contextKeywords.some((kw) => combined.includes(kw));
    });
    console.log(`  [${brand}] 일반 단어 브랜드 — 채용/구직 맥락 없는 기사 추가 제외: ${before}건 → ${filtered.length}건`);
  }

  const result = filtered.map(({ description, ...rest }) => rest);
  console.log(`  [${brand}] 제목에 브랜드명 포함된 기사만 필터링: ${all.length}건 → ${result.length}건`);
  return result;
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf-8');
    const json = JSON.parse(raw);
    const items = Array.isArray(json) ? json : (json.items || []);
    const cleaned = items.filter((it) => it.title && it.brand && it.title.includes(it.brand));
    if (cleaned.length !== items.length) {
      console.log(`기존 파일 정리: 제목에 브랜드명 없는 기존 항목 ${items.length - cleaned.length}건 제거`);
    }
    return cleaned;
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

  const beforeDedupe = pruned.length;
  const deduped = dedupeSimilarTitles(pruned);
  console.log(`유사 제목 중복 제거: ${beforeDedupe}건 → ${deduped.length}건`);

  deduped.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deduped, null, 2), 'utf-8');
  console.log(`완료: 신규 ${newItems.length}건 추가, 총 ${deduped.length}건 저장 (${OUTPUT_PATH})`);
}

main().catch((e) => {
  console.error('실행 중 오류:', e);
  process.exit(1);
});
