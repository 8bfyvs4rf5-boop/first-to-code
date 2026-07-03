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

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(\w+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
    .replace(/&amp;/g, "&");
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
    link: extractTag(block, "link").trim(),
    pubDate: extractTag(block, "pubDate"),
    description: stripHtml(extractTag(block, "description")),
    sourceTag: stripHtml(extractTag(block, "source"))
  }));
}

function toDateStr(pubDateRaw) {
  if (!pubDateRaw) return null;
  const d = new Date(pubDateRaw);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DailyBriefingBot/1.0)" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// sources: [{ name, url }] — 각 기관의 공식 발표자료 RSS
async function collectOfficial(sources, category, maxPerSource) {
  const results = [];
  for (const source of sources) {
    try {
      const xml = await fetchText(source.url);
      const items = parseRssItems(xml).slice(0, maxPerSource);
      const today = toDateStr(new Date().toString());
      for (const item of items) {
        const content = item.description || `${source.name} 발표자료입니다. 원문을 확인해 주세요.`;
        results.push({
          date: toDateStr(item.pubDate) || today,
          category,
          type: "official",
          ministry: source.name,
          title: item.title,
          summary: truncate(content, 90),
          content,
          source: `${source.name} · 발표자료`,
          url: item.link
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

// --- 무료 로컬 AI 요약 (Ollama) ---------------------------------------
// 서버는 launchd로 상시 실행됨 (~/Library/LaunchAgents/com.dailybriefing.ollama-serve.plist)

const OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5:3b";

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
  dedupeExact,
  dedupeCrossType,
  titleSimilarity,
  summarizeWithOllama,
  writeOutputFile
};
