#!/usr/bin/env node
// 한국 경제정책(fetch-economy-news.js)에 포함되지 않은 정부 부처들의
// 공식 발표자료 + 관련 뉴스를 모아 data-policy-auto.js로 저장한다.
// 실행: node fetch-policy-news.js
// Node 18+ 필요 (전역 fetch 사용)

const path = require("path");
const lib = require("./collect-lib");

// 한국 경제정책(한국은행·재정경제부·기획예산처·금융위원회·금융감독원·국세청)에서
// 다루지 않는 나머지 중앙행정기관들.
// 대한민국 정책브리핑(korea.kr) 포털 RSS로 수집했으나 2026.7.1부로 전면 중단되었고
// (공지: korea.kr/etc/noticeView.do?newsId=132038885) 각 부처 자체 사이트에도
// 대부분 공개 RSS가 없어, 아래 이름으로 관련 뉴스 검색으로 대신 커버한다.
// 2025년 정부조직개편 반영: 환경부 → 기후에너지환경부, 산업통상자원부 → 산업통상부.
// 이 두 부처는 개편 후 새 홈페이지(motir.go.kr, mcee.go.kr)에 자체 RSS가 있어
// 공식 발표자료도 함께 수집한다.
const OFFICIAL_SOURCES = [
  {
    name: "산업통상부",
    // motir.go.kr은 RSS를 GET이 아니라 폼 POST로만 내려준다(GET 요청 시 405).
    url: "https://www.motir.go.kr/kor/article/ATCL3f49a5a8c/rss",
    method: "POST"
  },
  {
    name: "기후에너지환경부",
    url: "https://www.mcee.go.kr/home/web/board/rss.do?menuId=286&boardMasterId=1"
  }
];

const NEWS_KEYWORDS = [
  "산업통상부",
  "기후에너지환경부",
  "교육부",
  "외교부",
  "통일부",
  "법무부",
  "국방부",
  "행정안전부",
  "문화체육관광부",
  "농림축산식품부",
  "보건복지부",
  "고용노동부",
  "성평등가족부",
  "국토교통부",
  "해양수산부",
  "중소벤처기업부",
  "과학기술정보통신부",
  "국가보훈부"
];

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

  if (all.length === 0) {
    console.error(`[경고] 수집 결과 0건 — 네트워크 오류 등으로 판단해 기존 ${path.basename(OUTPUT_FILE)} 파일을 유지합니다.`);
    return;
  }

  await lib.summarizeWithOllama(all);

  lib.writeOutputFile(OUTPUT_FILE, "policyAutoItems", "policyAutoMeta", all, "fetch-policy-news.js");
  console.log(`\n총 ${all.length}건 저장 완료 -> ${path.basename(OUTPUT_FILE)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
