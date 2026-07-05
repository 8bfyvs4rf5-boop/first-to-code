#!/usr/bin/env node
// 주요 외신(BBC·가디언·NYT·알자지라)의 정치·경제·사회 기사를 모아
// 한국어로 번역/요약해 data-foreign-auto.js로 저장한다.
// 실행: node fetch-foreign-news.js
// Node 18+ 필요 (전역 fetch 사용)
//
// CNN의 edition_world.rss는 2023년 4월 이후 갱신이 멈춘 죽은 피드라
// (copyright 표기도 2024년에 박제되어 있음) 소스에서 제외했다.

const path = require("path");
const lib = require("./collect-lib");

// topic("정치"/"경제"/"사회")은 화면의 부처 필터 자리에 그대로 재사용된다.
const SOURCES = [
  { name: "BBC", topic: "정치", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", topic: "정치", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "BBC", topic: "경제", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "NYT", topic: "경제", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { name: "Guardian", topic: "사회", url: "https://www.theguardian.com/society/rss" },
  { name: "Guardian", topic: "사회", url: "https://www.theguardian.com/world/rss" }
];

const MAX_PER_SOURCE = 5;
const OUTPUT_FILE = path.join(__dirname, "data-foreign-auto.js");

async function main() {
  let all = await lib.collectForeign(SOURCES, "foreign", MAX_PER_SOURCE);

  all = lib.dedupeExact(all);
  all.sort((a, b) => b.date.localeCompare(a.date));

  if (all.length === 0) {
    console.error(`[경고] 수집 결과 0건 — 네트워크 오류 등으로 판단해 기존 ${path.basename(OUTPUT_FILE)} 파일을 유지합니다.`);
    return;
  }

  await lib.translateAndSummarizeWithOllama(all);
  lib.autoTagItems(all);

  lib.writeOutputFile(OUTPUT_FILE, "foreignAutoItems", "foreignAutoMeta", all, "fetch-foreign-news.js");
  console.log(`\n총 ${all.length}건 저장 완료 -> ${path.basename(OUTPUT_FILE)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
