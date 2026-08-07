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

// 추적할 브랜드 목록
const BRANDS = [
  '사람인', '잡코리아', '원티드', '인크루트', '리멤버',
  '알바몬', '알바천국', '동네알바', '급구', '잡플래닛',
];

const OUTPUT_PATH = path.join(__dirname, 'competitor-news.json');
const DISPLAY_PER_BRAND = 100; // 네이버 API 1회 호출 최대 100건
const EARLIEST_DATE = '2026-01-01'; // 이 날짜 이전 기사는 수집/보관하지 않음
const MAX_PAGES_PER_BRAND = 10; // 네이버 API는 start+display <= 1000 까지만 조회 가능 (100*10)

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

function charBigrams(text) {
  const s = String(text || '').replace(/\s+/g, '');
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  return grams;
}
function bigramJaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}
const SIMILARITY_THRESHOLD = 0.3;
const SIMILARITY_MAX_DAY_GAP = 5;

function dedupeSimilarTitles(items) {
  const n = items.length;
  const grams = items.map((it) => charBigrams(it.title));
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x, y) { const rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].brand !== items[j].brand) continue;
      const gap = Math.abs((new Date(items[i].date) - new Date(items[j].date)) / 86400000);
      if (gap > SIMILARITY_MAX_DAY_GAP) continue;
      if (bigramJaccard(grams[i], grams[j]) >= SIMILARITY_THRESHOLD) union(i, j);
    }
  }

  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(items[i]);
  }

  const result = [];
  for (const group of clusters.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }
    const sorted = group.slice().sort((a, b) => {
      const aMajor = MAJOR_OUTLETS.some((d) => a.source.includes(d)) ? 1 : 0;
      const bMajor = MAJOR_OUTLETS.some((d) => b.source.includes(d)) ? 1 : 0;
      if (aMajor !== bMajor) return bMajor - aMajor;
      return b.date.localeCompare(a.date);
    });
    result.push(sorted[0]);
  }
  return result;
}

const POSITIVE_KEYWORDS = [
  '1위', '최대', '신기록', '반등', '역대', '성장', '확대', '호조', '수상', '협력',
  '출시', '증가', '흑자', '최고', '인기', '호평', '투자 유치', '상승', '개선', '달성',
  '오픈', '앞장', '우수', '선정', '돌파', '강화', '주목', '기대',
];
const NEGATIVE_KEYWORDS = [
  '논란', '하락', '감소', '위기', '소송', '해킹', '유출', '사고', '사망', '파산',
  '철수', '중단', '불만', '항의', '적자', '부진', '징계', '고발', '피소', '비판',
  '우려', '갑질', '불법', '벌금', '제재', '먹튀', '해지', '탈퇴', '먹통', '장애',
];
function classifySentiment(text) {
  const t = String(text || '');
  const pos = POSITIVE_KEYWORDS.some((k) => t.includes(k));
  const neg = NEGATIVE_KEYWORDS.some((k) => t.includes(k));
  if (pos && !neg) return 'positive';
  if (neg && !pos) return 'negative';
  return null;
}

function passesBrandFilter(title, description, brand) {
  if (!title || !title.includes(brand)) return false;
  const kws = AMBIGUOUS_BRANDS[brand];
  if (kws) {
    const combined = title + ' ' + (description || '');
    if (!kws.some((kw) => combined.includes(kw))) return false;
  }
  return true;
}

async function fetchNewsPage(brand, start) {
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(brand)}&display=${DISPLAY_PER_BRAND}&start=${start}&sort=date&format=json`;
  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
      'X-NCP-APIGW-API-KEY': CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '(응답 본문을 읽을 수 없음)');
    console.error(`[${brand}] API 요청 실패(start=${start}): HTTP ${res.status}`);
    console.error(`  응답 내용: ${bodyText}`);
    return null;
  }
  return res.json();
}

async function fetchBrandNews(brand) {
  let rawItems = [];
  let start = 1;
  for (let page = 0; page < MAX_PAGES_PER_BRAND; page++) {
    const json = await fetchNewsPage(brand, start);
    if (!json) break;
    const items = json.items || [];
    if (page === 0) {
      console.log(`  [${brand}] 원본 응답 total=${json.total}`);
    }
    if (items.length === 0) break;
    rawItems = rawItems.concat(items);

    const lastDate = naverDateToISO(items[items.length - 1].pubDate);
    start += DISPLAY_PER_BRAND;
    if (lastDate && lastDate < EARLIEST_DATE) break;
    if (start > 1000) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`  [${brand}] 총 ${rawItems.length}건 수집(페이지네이션 포함)`);

  const all = rawItems.map((item) => {
    const date = naverDateToISO(item.pubDate);
    if (!date) return null;
    const title = stripTags(item.title);
    const description = stripTags(item.description);
    return {
      date,
      brand,
      title,
      description,
      url: item.originallink || item.link,
      source: (() => {
        try { return new URL(item.originallink || item.link).hostname.replace(/^www\./, ''); }
        catch { return ''; }
      })(),
    };
  }).filter(Boolean).filter((it) => it.date >= EARLIEST_DATE);

  const before = all.length;
  const filtered = all.filter((it) => passesBrandFilter(it.title, it.description, it.brand));
  if (before !== filtered.length) {
    console.log(`  [${brand}] 브랜드/맥락 필터링: ${before}건 → ${filtered.length}건`);
  }

  const result = filtered.map((it) => ({
    date: it.date,
    brand: it.brand,
    title: it.title,
    url: it.url,
    source: it.source,
    sentiment: classifySentiment(it.title + ' ' + it.description),
  }));
  return result;
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf-8');
    const json = JSON.parse(raw);
    const items = Array.isArray(json) ? json : (json.items || []);
    const cleaned = items
      .filter((it) => passesBrandFilter(it.title, '', it.brand))
      .filter((it) => it.date >= EARLIEST_DATE);
    if (cleaned.length !== items.length) {
      console.log(`기존 파일 정리: 브랜드/맥락 필터 + 2026년 이전 기사 제거로 ${items.length - cleaned.length}건 제거`);
    }
    cleaned.forEach((it) => {
      if (it.sentiment === undefined) it.sentiment = classifySentiment(it.title);
    });
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

  const pruned = merged.filter((it) => it.date >= EARLIEST_DATE);

  const beforeDedupe = pruned.length;
  const deduped = dedupeSimilarTitles(pruned);
  console.log(`유사 기사 중복 제거: ${beforeDedupe}건 → ${deduped.length}건`);

  deduped.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deduped, null, 2), 'utf-8');
  console.log(`완료: 신규 ${newItems.length}건 추가, 총 ${deduped.length}건 저장 (${OUTPUT_PATH})`);
}

main().catch((e) => {
  console.error('실행 중 오류:', e);
  process.exit(1);
});
