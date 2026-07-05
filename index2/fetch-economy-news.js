#!/usr/bin/env node
// 한국 경제정책 관련 공식 발표자료 + 관련 뉴스를 모아 data-economy-auto.js로 저장한다.
// 실행: node fetch-economy-news.js
// Node 18+ 필요 (전역 fetch 사용)

const path = require("path");
const lib = require("./collect-lib");

// 대한민국 정책브리핑(korea.kr)의 부처별 RSS는 2026.7.1부로 전면 중단되었다
// (저작권 등 권리 보호에 따른 제공방식 변경, 공지: korea.kr/etc/noticeView.do?newsId=132038885).
// 2025년 정부조직개편으로 기획재정부가 재정경제부(세제·경제·금융·국고)와
// 기획예산처(예산·기금, 국무총리 소속)로 분리되면서 재정경제부는 신도메인
// mofe.go.kr에 자체 RSS를 새로 열었다(curl로 직접 확인). 기획예산처·국세청·
// 금융감독원(FSS)은 사이트 자체에 RSS가 없어 뉴스 검색으로만 커버한다.
const OFFICIAL_SOURCES = [
  {
    name: "한국은행",
    url: "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690"
  },
  {
    name: "금융위원회",
    url: "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111"
  },
  {
    name: "재정경제부",
    url: "https://mofe.go.kr/com/detailRssTagService.do?bbsId=MOSFBBS_000000000028"
  }
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

  if (all.length === 0) {
    console.error(`[경고] 수집 결과 0건 — 네트워크 오류 등으로 판단해 기존 ${path.basename(OUTPUT_FILE)} 파일을 유지합니다.`);
    return;
  }

  await lib.summarizeWithOllama(all);

  lib.writeOutputFile(OUTPUT_FILE, "economyAutoItems", "economyAutoMeta", all, "fetch-economy-news.js");
  console.log(`\n총 ${all.length}건 저장 완료 -> ${path.basename(OUTPUT_FILE)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
