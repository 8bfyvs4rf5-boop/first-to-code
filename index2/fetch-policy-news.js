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
// (공지: korea.kr/etc/noticeView.do?newsId=132038885), 부처별로 자체 사이트 RSS
// 유무를 하나씩 curl로 확인해 있는 곳만 공식 발표자료로 수집한다. 나머지는
// 여전히 관련 뉴스 검색으로 대신 커버한다.
// 2025년 정부조직개편 반영: 환경부 → 기후에너지환경부, 산업통상자원부 → 산업통상부.
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
  },
  { name: "외교부", url: "http://www.mofa.go.kr/www/brd/rss.do?brdId=235", cookieBootstrapUrl: "https://www.mofa.go.kr/" },
  { name: "통일부", url: "https://unikorea.go.kr/web/unikorea/rss/bbs_0000000000000004" },
  { name: "행정안전부", url: "https://www.mois.go.kr/gpms/view/jsp/rss/rss.jsp?ctxCd=1012" },
  { name: "문화체육관광부", url: "http://www.mcst.go.kr/common/rss/press.jsp" },
  { name: "농림축산식품부", url: "https://www.mafra.go.kr/bbs/home/792/rssList.do?row=50" },
  { name: "보건복지부", url: "https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027&info" },
  { name: "성평등가족부", url: "https://www.mogef.go.kr/rss/rssnews.do?mid=news405" },
  { name: "국토교통부", url: "https://www.molit.go.kr/dev/board/board_rss.jsp?rss_id=NEWS", cookieBootstrapUrl: "https://www.molit.go.kr/" },
  { name: "해양수산부", url: "https://www.mof.go.kr/doc/ko/rssFeed.do?bbsSeq=10" },
  { name: "중소벤처기업부", url: "https://www.mss.go.kr/rss/smba/board/86.do" },
  { name: "과학기술정보통신부", url: "https://www.msit.go.kr/user/rss/rss.do?bbsSeqNo=94" }
];

// 법무부·국방부·국가보훈부는 게시판에 RSS 버튼/문자열은 있어도 실제 feed
// URL이 없거나(404) 관리자가 꺼둔 상태라, 관련 뉴스 검색으로만 커버한다.
// 고용노동부는 공지/정책자료 RSS는 있지만 "보도자료" 전용 피드가 없어 마찬가지.
const NEWS_KEYWORDS = [
  "산업통상부",
  "기후에너지환경부",
  "외교부",
  "통일부",
  "행정안전부",
  "문화체육관광부",
  "농림축산식품부",
  "보건복지부",
  "성평등가족부",
  "국토교통부",
  "해양수산부",
  "중소벤처기업부",
  "과학기술정보통신부",
  "교육부",
  "법무부",
  "국방부",
  "고용노동부",
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
