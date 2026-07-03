#!/usr/bin/env node
// 한국 경제정책(fetch-economy-news.js)에 포함되지 않은 정부 부처들의
// 공식 발표자료 + 관련 뉴스를 모아 data-policy-auto.js로 저장한다.
// 실행: node fetch-policy-news.js
// Node 18+ 필요 (전역 fetch 사용)

const path = require("path");
const lib = require("./collect-lib");

// 한국 경제정책(한국은행·재정경제부·기획예산처·금융위원회·금융감독원·국세청)에서
// 다루지 않는 나머지 중앙행정기관들. 대한민국 정책브리핑(korea.kr) 포털 RSS로 수집.
const OFFICIAL_SOURCES = [
  { name: "교육부", url: "https://www.korea.kr/rss/dept_moe.xml" },
  { name: "외교부", url: "https://www.korea.kr/rss/dept_mofa.xml" },
  { name: "통일부", url: "https://www.korea.kr/rss/dept_unikorea.xml" },
  { name: "법무부", url: "https://www.korea.kr/rss/dept_moj.xml" },
  { name: "국방부", url: "https://www.korea.kr/rss/dept_mnd.xml" },
  { name: "행정안전부", url: "https://www.korea.kr/rss/dept_mois.xml" },
  { name: "문화체육관광부", url: "https://www.korea.kr/rss/dept_mcst.xml" },
  { name: "농림축산식품부", url: "https://www.korea.kr/rss/dept_mafra.xml" },
  { name: "산업통상자원부", url: "https://www.korea.kr/rss/dept_motie.xml" },
  { name: "보건복지부", url: "https://www.korea.kr/rss/dept_mw.xml" },
  { name: "환경부", url: "https://www.korea.kr/rss/dept_me.xml" },
  { name: "고용노동부", url: "https://www.korea.kr/rss/dept_moel.xml" },
  { name: "성평등가족부", url: "https://www.korea.kr/rss/dept_mogef.xml" },
  { name: "국토교통부", url: "https://www.korea.kr/rss/dept_molit.xml" },
  { name: "해양수산부", url: "https://www.korea.kr/rss/dept_mof.xml" },
  { name: "중소벤처기업부", url: "https://www.korea.kr/rss/dept_mss.xml" },
  { name: "과학기술정보통신부", url: "https://www.korea.kr/rss/dept_msit.xml" },
  { name: "국가보훈부", url: "https://www.korea.kr/rss/dept_mpva.xml" }
];

const NEWS_KEYWORDS = OFFICIAL_SOURCES.map(s => s.name);

const MAX_OFFICIAL_PER_SOURCE = 5;
const MAX_NEWS_PER_KEYWORD = 3;
const OUTPUT_FILE = path.join(__dirname, "data-policy-auto.js");

async function main() {
  const [official, news] = await Promise.all([
    lib.collectOfficial(OFFICIAL_SOURCES, "policy", MAX_OFFICIAL_PER_SOURCE),
    lib.collectNews(NEWS_KEYWORDS, "policy", MAX_NEWS_PER_KEYWORD)
  ]);

  let all = lib.dedupeExact([...official, ...news]);
  all = lib.dedupeCrossType(all);
  all.sort((a, b) => b.date.localeCompare(a.date));

  await lib.summarizeWithOllama(all);

  lib.writeOutputFile(OUTPUT_FILE, "policyAutoItems", "policyAutoMeta", all, "fetch-policy-news.js");
  console.log(`\n총 ${all.length}건 저장 완료 -> ${path.basename(OUTPUT_FILE)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
