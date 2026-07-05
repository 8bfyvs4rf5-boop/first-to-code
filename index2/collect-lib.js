// 정부 부처 RSS 발표자료 + 관련 뉴스 수집에 공통으로 쓰이는 로직.
// fetch-economy-news.js / fetch-policy-news.js에서 함께 사용한다.

const fs = require("fs");

const NAMED_ENTITIES = {
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  middot: "·",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'"
};

// 일부 부처 RSS는 &amp;amp;처럼 엔티티가 여러 겹 인코딩되어 내려온다.
// 더 이상 바뀌지 않을 때까지 반복 적용해 몇 겹이든 풀어낸다.
function decodeEntities(str) {
  let result = str;
  let prev;
  do {
    prev = result;
    result = result
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&(\w+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
      .replace(/&amp;/g, "&");
  } while (result !== prev);
  return result;
}

function stripHtml(str) {
  return decodeEntities(str.replace(/<[^>]*>/g, " "))
    .replace(/\[자료제공\s*:\s*\([^)]*\)\s*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return `${str.slice(0, max).trim()}…`;
}

function parseRssItems(xml) {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.map(block => ({
    title: stripHtml(extractTag(block, "title")),
    link: decodeEntities(extractTag(block, "link")).trim(),
    pubDate: extractTag(block, "pubDate"),
    // msit.go.kr처럼 <description> 없이 <content:encoded>만 내려주는 사이트가 있다.
    description: stripHtml(extractTag(block, "description") || extractTag(block, "content:encoded")),
    sourceTag: stripHtml(extractTag(block, "source"))
  }));
}

function toDateStr(pubDateRaw) {
  if (!pubDateRaw) return null;
  let d = new Date(pubDateRaw);
  if (isNaN(d.getTime())) {
    // 일부 기관 RSS(mcee.go.kr 등)는 Node의 Date 파서가 못 읽는
    // "KST" 타임존 약어를 쓴다 (예: "Mon Mar 30 09:00:00 KST 2026").
    d = new Date(pubDateRaw.replace(/\bKST\b/, "GMT+0900"));
  }
  if (isNaN(d.getTime())) {
    // mss.go.kr: 구분자 없는 "20260703161752"(YYYYMMDDHHmmss)
    const compact = pubDateRaw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (compact) {
      const [, y, mo, day, h, mi, se] = compact;
      d = new Date(Number(y), Number(mo) - 1, Number(day), Number(h), Number(mi), Number(se));
    }
  }
  if (isNaN(d.getTime())) {
    // mois.go.kr: "토, 04 7월 2026 12:00:00 KST" 같은 한글 요일/월 표기
    const korean = pubDateRaw.match(/(\d{1,2})\s*(\d{1,2})월\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    if (korean) {
      const [, day, mo, y, h, mi, se] = korean;
      d = new Date(Number(y), Number(mo) - 1, Number(day), Number(h), Number(mi), Number(se));
    }
  }
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// mofa.go.kr·molit.go.kr 등은 WAF가 첫 요청에 쿠키 발급용 307을 내려주고,
// 그 쿠키 없이 재요청하면 같은 307을 반복한다(fetch가 자동으로 리다이렉트를
// 따라가면 "redirect count exceeded"로 죽는다). cookieBootstrapUrl을 주면
// 리다이렉트를 직접 처리해 쿠키만 받아온 뒤 본 요청에 실어 보낸다.
async function fetchText(url, { method = "GET", cookieBootstrapUrl } = {}) {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; DailyBriefingBot/1.0)" };
  if (cookieBootstrapUrl) {
    const bootRes = await fetch(cookieBootstrapUrl, { headers, redirect: "manual" });
    const cookies = bootRes.headers.getSetCookie ? bootRes.headers.getSetCookie() : [];
    if (cookies.length > 0) headers.Cookie = cookies.map(c => c.split(";")[0]).join("; ");
  }
  const res = await fetch(url, { method, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// sources: [{ name, url, method?, cookieBootstrapUrl? }] — 각 기관의 공식 발표자료 RSS.
// method은 motir.go.kr처럼 RSS를 폼 POST로만 내려주는 사이트를 위한 옵션(기본 GET).
async function collectOfficial(sources, category, maxPerSource) {
  const results = [];
  for (const source of sources) {
    try {
      const xml = await fetchText(source.url, { method: source.method, cookieBootstrapUrl: source.cookieBootstrapUrl });
      const items = parseRssItems(xml).slice(0, maxPerSource);
      const today = toDateStr(new Date().toString());
      for (const item of items) {
        const content = item.description || `${source.name} 발표자료입니다. 원문을 확인해 주세요.`;
        // mcee.go.kr 등 일부 사이트는 <link>에 도메인 없이 상대경로만 내려준다.
        const link = item.link ? new URL(item.link, source.url).href : "";
        results.push({
          date: toDateStr(item.pubDate) || today,
          category,
          type: "official",
          ministry: source.name,
          title: item.title,
          summary: truncate(content, 90),
          content,
          source: `${source.name} · 발표자료`,
          url: link
        });
      }
      console.log(`[OK] ${source.name}: ${items.length}건`);
    } catch (err) {
      console.error(`[경고] ${source.name} 수집 실패: ${err.message}`);
    }
  }
  return results;
}

// keywords: ["부처명", ...] — 구글 뉴스에서 부처명으로 검색한 관련 뉴스
async function collectNews(keywords, category, maxPerKeyword) {
  const results = [];
  const today = toDateStr(new Date().toString());
  for (const keyword of keywords) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`;
    try {
      const xml = await fetchText(url);
      const items = parseRssItems(xml).slice(0, maxPerKeyword);
      for (const item of items) {
        // 구글 뉴스 제목은 보통 "기사 제목 - 언론사" 형태로 온다.
        const m = item.title.match(/^(.*)\s-\s([^-]+)$/);
        const title = m ? m[1].trim() : item.title;
        const outlet = item.sourceTag || (m ? m[2].trim() : "뉴스");
        const content = `[${keyword} 관련 뉴스] ${outlet}에서 보도된 기사입니다. 아래 원문 링크에서 전체 내용을 확인하세요.`;
        results.push({
          date: toDateStr(item.pubDate) || today,
          category,
          type: "news",
          ministry: keyword,
          title,
          summary: `[${keyword} 관련 뉴스] ${outlet} 보도`,
          content,
          source: outlet,
          url: item.link
        });
      }
      console.log(`[OK] "${keyword}" 관련 뉴스: ${items.length}건`);
    } catch (err) {
      console.error(`[경고] "${keyword}" 관련 뉴스 수집 실패: ${err.message}`);
    }
  }
  return results;
}

// sources: [{ name, topic, url, method? }] — 해외 주요 언론사 RSS.
// topic("정치"/"경제"/"사회")은 부처 필터와 같은 자리(ministry)에 재사용해
// 주요외신동향 탭에서도 대분류 필터 칩으로 노출된다. 번역/요약은
// translateAndSummarizeWithOllama가 별도로 처리하므로 여기서는 원문 그대로 담는다.
async function collectForeign(sources, category, maxPerSource) {
  const results = [];
  for (const source of sources) {
    try {
      const xml = await fetchText(source.url, { method: source.method });
      const items = parseRssItems(xml).slice(0, maxPerSource);
      const today = toDateStr(new Date().toString());
      for (const item of items) {
        const link = item.link ? new URL(item.link, source.url).href : "";
        const content = item.description || item.title;
        results.push({
          date: toDateStr(item.pubDate) || today,
          category,
          type: "foreign",
          ministry: source.topic,
          title: item.title,
          summary: truncate(content, 90),
          content,
          source: source.name,
          url: link
        });
      }
      console.log(`[OK] ${source.name}(${source.topic}): ${items.length}건`);
    } catch (err) {
      console.error(`[경고] ${source.name}(${source.topic}) 수집 실패: ${err.message}`);
    }
  }
  return results;
}

// --- 중복 제거 -------------------------------------------------------

// 정확히 같은 URL(또는 제목)을 가진 항목 제거
function dedupeExact(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.url || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bigramSet(str) {
  const clean = str.replace(/\[[^\]]*\]/g, "").replace(/[^가-힣0-9a-zA-Z]/g, "");
  const set = new Set();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

// 길이가 다른 두 제목을 비교할 때도 잘 맞도록 overlap coefficient(짧은 쪽 기준) 사용
function titleSimilarity(a, b) {
  const setA = bigramSet(a);
  const setB = bigramSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const g of setA) if (setB.has(g)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  return Math.abs((a.getTime() - b.getTime()) / 86400000);
}

const CROSS_TYPE_SIMILARITY_THRESHOLD = 0.5;
const CROSS_TYPE_MAX_DAY_GAP = 1;

// 같은 부처의 발표자료(official)와 관련 뉴스(news)가 같은 사안을 다루면
// 뉴스 쪽을 제거하고 공식 발표자료 하나만 남긴다.
function dedupeCrossType(items) {
  const officials = items.filter(i => i.type === "official");
  return items.filter(item => {
    if (item.type !== "news") return true;
    const isDuplicate = officials.some(
      off =>
        off.ministry === item.ministry &&
        daysBetween(off.date, item.date) <= CROSS_TYPE_MAX_DAY_GAP &&
        titleSimilarity(off.title, item.title) >= CROSS_TYPE_SIMILARITY_THRESHOLD
    );
    return !isDuplicate;
  });
}

// --- 분야/유형 자동 태그 분류 -------------------------------------------
// app.js의 TAG_TAXONOMY(분야 10종 · 유형 5종)와 동일한 체계를 Node 스크립트
// 쪽에서도 써야 해서 여기 그대로 옮겨 적었다 — 브라우저용 app.js와는 실행
// 환경이 달라 공유가 안 되니, 분야/유형 태그 종류를 바꾸면 양쪽 다 손봐야 한다.
// 제목·본문(그리고 부처명)에 연관 키워드가 있으면 해당 태그를 붙이는
// 단순 키워드 매칭 방식이라 완벽하진 않지만, 자동 수집 항목도 수동으로
// 태그를 붙이기 전까지 분야/유형 필터에서 아예 빠져 있던 문제를 해소해 준다.
// 사용자가 화면에서 직접 태그를 고치면 localStorage 값이 우선하므로
// (getItemTags 참고) 이 자동 분류는 어디까지나 기본값이다.
const DOMAIN_KEYWORDS = {
  "교육": ["교육", "학교", "학생", "대학", "입시", "학부모", "교원", "유치원", "보육"],
  "노동": ["노동", "고용", "일자리", "근로자", "근로", "임금", "노사", "실업"],
  "부동산": ["부동산", "주택", "전세", "임대", "아파트", "분양", "재건축", "재개발"],
  "AI": ["인공지능", "AI", "생성형", "챗봇", "알고리즘"],
  "산업": ["산업", "제조", "수출", "중소기업", "벤처", "반도체", "공장"],
  "복지": ["복지", "돌봄", "연금", "의료", "건강보험", "저출산", "노인", "장애인", "아동"],
  "환경": ["환경", "기후", "탄소", "에너지", "재생에너지", "미세먼지"],
  "금융": ["금융", "은행", "증권", "대출", "금리", "세제", "세금", "국세"],
  "외교안보": ["외교", "안보", "국방", "북한", "통일", "군사", "동맹"],
  "행정": ["행정", "지방자치", "규제", "제도", "공공기관", "지자체"]
};

const TYPE_KEYWORDS = {
  "규제": ["규제", "단속", "제한", "금지", "처벌", "과태료", "의무화"],
  "지원": ["지원", "지원금", "보조금", "혜택", "바우처", "장려금"],
  "제도개선": ["개선", "개편", "도입", "시행", "완화"],
  "예산·재정": ["예산", "재정", "세금", "세제", "국고", "재원"],
  "조사·연구": ["조사", "연구", "실태", "통계", "발표"]
};

// 부처명만으로는 분야 키워드가 본문에 안 드러나는 경우를 보완하는 힌트.
// (예: "국토교통부"엔 "부동산"이라는 글자가 없다.) 키워드만으로 이미
// 잡히는 부처(예: "보건복지부"→"복지")는 중복이라 여기 넣지 않았다.
const MINISTRY_DOMAIN_HINTS = {
  "국토교통부": ["부동산"],
  "중소벤처기업부": ["산업"],
  "과학기술정보통신부": ["AI", "산업"]
};

function classifyTags(item) {
  const haystack = `${item.ministry || ""} ${item.title || ""} ${item.content || ""}`;
  const domainSet = new Set(
    Object.keys(DOMAIN_KEYWORDS).filter(tag => DOMAIN_KEYWORDS[tag].some(kw => haystack.includes(kw)))
  );
  for (const hint of MINISTRY_DOMAIN_HINTS[item.ministry] || []) domainSet.add(hint);
  const type = Object.keys(TYPE_KEYWORDS).filter(tag => TYPE_KEYWORDS[tag].some(kw => haystack.includes(kw)));
  return { domain: Array.from(domainSet), type };
}

// 항목마다 tags를 채워준다. 아무 태그도 못 찾은 항목은 건드리지 않고 그대로
// 둬서(빈 배열을 강제로 넣지 않음) 화면에서 사용자가 직접 붙일 수 있게 한다.
function autoTagItems(items) {
  for (const item of items) {
    const tags = classifyTags(item);
    if (tags.domain.length > 0 || tags.type.length > 0) item.tags = tags;
  }
}

// --- 관련 뉴스 중복 통합 ------------------------------------------------
// 같은 사안이 여러 부처 키워드 검색이나 여러 매체에 걸쳐 중복으로 잡히는
// 경우가 많아, 제목이 비슷하고 날짜가 가까운 관련 뉴스(type: "news")를
// 하나로 묶어 "OO 등 N개 매체 종합" 형태의 단일 항목으로 표시한다.
const NEWS_CLUSTER_SIMILARITY_THRESHOLD = 0.55;
const NEWS_CLUSTER_MAX_DAY_GAP = 2;

function mergeNewsCluster(cluster) {
  if (cluster.length === 1) return cluster[0];
  const sorted = [...cluster].sort((a, b) => a.date.localeCompare(b.date));
  const base = sorted[0];
  const outlets = Array.from(new Set(cluster.map(c => c.source).filter(Boolean)));
  const sourceLabel =
    outlets.length <= 2 ? outlets.join(", ") : `${outlets.slice(0, 2).join(", ")} 외 ${outlets.length - 2}곳`;
  return {
    ...base,
    source: sourceLabel,
    mergedCount: cluster.length,
    mergedOutlets: outlets,
    content: `[${base.ministry} 관련 뉴스] ${outlets.length}개 매체(${outlets.join(", ")})에서 보도한 내용을 종합했습니다.`,
    summary: `[${base.ministry} 관련 뉴스] ${outlets.length}개 매체 종합 보도`
  };
}

function mergeSimilarNews(items) {
  const newsItems = items.filter(i => i.type === "news");
  const others = items.filter(i => i.type !== "news");

  const used = new Array(newsItems.length).fill(false);
  const merged = [];
  for (let i = 0; i < newsItems.length; i++) {
    if (used[i]) continue;
    const cluster = [newsItems[i]];
    used[i] = true;
    for (let j = i + 1; j < newsItems.length; j++) {
      if (used[j]) continue;
      if (
        daysBetween(newsItems[i].date, newsItems[j].date) <= NEWS_CLUSTER_MAX_DAY_GAP &&
        titleSimilarity(newsItems[i].title, newsItems[j].title) >= NEWS_CLUSTER_SIMILARITY_THRESHOLD
      ) {
        cluster.push(newsItems[j]);
        used[j] = true;
      }
    }
    merged.push(mergeNewsCluster(cluster));
  }

  return [...others, ...merged];
}

// --- 무료 로컬 AI 요약 (Ollama) ---------------------------------------
// 서버는 launchd로 상시 실행됨 (~/Library/LaunchAgents/com.dailybriefing.ollama-serve.plist)

const OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5:3b";
// 외국어 번역은 3b로는 한자/키릴 문자가 섞이거나 고유명사가 심하게
// 왜곡되는 경우가 많아, 이미 한국어인 글을 요약만 하는 summarizeWithOllama와
// 달리 번역이 필요한 translateAndSummarizeWithOllama는 더 큰 모델을 쓴다.
const OLLAMA_TRANSLATE_MODEL = "qwen2.5:14b";

async function isOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function summarizeOneWithOllama(item) {
  const content = (item.content || "").slice(0, 800);
  const prompt =
    "다음 글을 이해하는 데 중요한 핵심만 골라 한국어 1~2문장으로 간결하게 요약하세요. " +
    "다른 말 없이 요약문만 출력하세요.\n\n" +
    `제목: ${item.title}\n내용: ${content}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const summary = (data.response || "").trim().replace(/^["“]|["”]$/g, "");
  if (summary) item.summary = summary;
}

async function summarizeWithOllama(items) {
  if (!(await isOllamaAvailable())) {
    console.log(`[정보] Ollama(${OLLAMA_URL})에 연결할 수 없어 기본 요약을 사용합니다.`);
    return;
  }
  let ok = 0;
  for (const item of items) {
    try {
      await summarizeOneWithOllama(item);
      ok++;
    } catch (err) {
      console.error(`[경고] "${item.title}" 요약 실패, 기본 요약 유지: ${err.message}`);
    }
  }
  console.log(`[OK] Ollama 요약 ${ok}/${items.length}건 완료`);
}

// qwen 계열 소형 모델은 번역 중에 한자(중국어)·키릴·히브리·아랍·일본 가나 등
// 엉뚱한 문자를 섞어 넣는 경우가 있다 — 그런 응답은 쓰지 않고 원문을
// 그대로 유지하는 게 낫다. (한글/영문/숫자/기호만 정상으로 간주)
const FOREIGN_SCRIPT_RE = /[一-鿿Ѐ-ӿ֐-׿؀-ۿ぀-ゟ゠-ヿ०-९ก-๿]/;
// 형식은 맞지만 내용이 사실상 비어있는(모델이 응답을 중간에 끊은) 경우 방지.
const MIN_TRANSLATED_SUMMARY_LEN = 15;

// 외신(원문이 외국어)을 한국어 제목/요약으로 번역한다. 번역과 요약을
// 한 번의 호출로 같이 처리해 Ollama 호출 횟수를 절반으로 줄인다.
async function translateOneWithOllama(item) {
  const original = (item.content || item.title || "").slice(0, 800);
  const prompt =
    "다음 외국어 뉴스 제목과 내용을 한국어로 번역하고 요약하세요.\n" +
    "규칙:\n" +
    "- 한자(중국어)나 키릴 문자를 절대 쓰지 마세요.\n" +
    "- 영어 단어를 그대로 남기지 말고 전부 한글로 옮기세요.\n" +
    "- 유명인·지명은 한국 뉴스에서 실제로 쓰는 정확한 한글 표기를 사용하세요.\n" +
    "아래 형식을 정확히 지키고 다른 설명은 절대 덧붙이지 마세요.\n" +
    "제목: <한국어로 번역한 제목>\n" +
    "요약: <한국어 1~2문장 요약>\n\n" +
    `제목: ${item.title}\n내용: ${original}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_TRANSLATE_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0 }
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = (data.response || "").trim();
  const titleMatch = text.match(/제목:\s*(.+)/);
  const summaryMatch = text.match(/요약:\s*([\s\S]+)/);
  if (!titleMatch || !summaryMatch) throw new Error("응답 형식 불일치");
  const translatedTitle = titleMatch[1].trim();
  const translatedSummary = summaryMatch[1].split(/\n\s*제목:/)[0].trim();
  if (FOREIGN_SCRIPT_RE.test(translatedTitle) || FOREIGN_SCRIPT_RE.test(translatedSummary)) {
    throw new Error("번역 결과에 엉뚱한 문자 혼입");
  }
  if (translatedSummary.length < MIN_TRANSLATED_SUMMARY_LEN) {
    throw new Error("번역 결과가 비정상적으로 짧음");
  }
  item.title = translatedTitle;
  item.content = translatedSummary;
  item.summary = truncate(translatedSummary, 90);
}

async function translateAndSummarizeWithOllama(items) {
  if (!(await isOllamaAvailable())) {
    console.log(`[정보] Ollama(${OLLAMA_URL})에 연결할 수 없어 원문(외국어) 그대로 둡니다.`);
    return;
  }
  let ok = 0;
  for (const item of items) {
    try {
      await translateOneWithOllama(item);
      ok++;
    } catch (err) {
      console.error(`[경고] "${item.title}" 번역 실패, 원문 유지: ${err.message}`);
    }
  }
  console.log(`[OK] Ollama 번역/요약 ${ok}/${items.length}건 완료`);
}

// --- 출력 ---------------------------------------------------------

function writeOutputFile(outputPath, itemsVarName, metaVarName, items, scriptName) {
  const header = `// 자동 생성 파일 — 직접 수정하지 마세요.
// 생성: node ${scriptName}
// 마지막 갱신: ${new Date().toString()}
`;
  const meta = `const ${metaVarName} = ${JSON.stringify({ updatedAt: new Date().toString(), count: items.length })};\n`;
  const body = `const ${itemsVarName} = ${JSON.stringify(items, null, 2)};\n`;
  fs.writeFileSync(outputPath, header + meta + body);
}

module.exports = {
  fetchText,
  parseRssItems,
  toDateStr,
  truncate,
  stripHtml,
  collectOfficial,
  collectNews,
  collectForeign,
  dedupeExact,
  dedupeCrossType,
  mergeSimilarNews,
  titleSimilarity,
  autoTagItems,
  summarizeWithOllama,
  translateAndSummarizeWithOllama,
  writeOutputFile
};
