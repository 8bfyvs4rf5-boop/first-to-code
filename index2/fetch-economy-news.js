#!/usr/bin/env node
// 한국 경제정책 관련 공식 발표자료 + 관련 뉴스를 모아 data-economy-auto.js로 저장한다.
// 실행: node fetch-economy-news.js
// Node 18+ 필요 (전역 fetch 사용)

const path = require("path");
const lib = require("./collect-lib");

// 2025년 정부조직개편에 따라 기획재정부는 2026.1.2부터 예산·재정 담당
// 기획예산처(국무총리 소속)와 세제·경제·금융·국고 담당 재정경제부로 분리되었다.
// 두 부처 모두 대한민국 정책브리핑(korea.kr) 포털 RSS로 커버한다.
const OFFICIAL_SOURCES = [
  {
    name: "한국은행",
    url: "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690"
  },
  {
    name: "재정경제부",
    url: "https://www.korea.kr/rss/dept_mofe.xml"
  },
  {
    name: "기획예산처",
    url: "https://www.korea.kr/rss/dept_mpb.xml"
  },
  {
    name: "금융위원회",
    url: "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111"
  },
  {
    name: "국세청",
    url: "https://www.korea.kr/rss/dept_nts.xml"
  }
  // 금융감독원(FSS)은 공개된 보도자료 RSS가 없어 아래 NEWS_KEYWORDS의
  // 관련 뉴스 검색으로 대신 커버한다.
];

const NEWS_KEYWORDS = ["한국은행", "금융감독원", "재정경제부", "기획예산처", "금융위원회", "국세청"];

const MAX_OFFICIAL_PER_SOURCE = 8;
const MAX_NEWS_PER_KEYWORD = 5;
const OUTPUT_FILE = path.join(__dirname, "data-economy-auto.js");

async function main() {
  const [official, news] = await Promise.all([
    lib.collectOfficial(OFFICIAL_SOURCES, "economy", MAX_OFFICIAL_PER_SOURCE),
    lib.collectNews(NEWS_KEYWORDS, "economy", MAX_NEWS_PER_KEYWORD)
  ]);

  let all = lib.dedupeExact([...official, ...news]);
  all = lib.dedupeCrossType(all);
  all.sort((a, b) => b.date.localeCompare(a.date));

  await lib.summarizeWithOllama(all);

  lib.writeOutputFile(OUTPUT_FILE, "economyAutoItems", "economyAutoMeta", all, "fetch-economy-news.js");
  console.log(`\n총 ${all.length}건 저장 완료 -> ${path.basename(OUTPUT_FILE)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
