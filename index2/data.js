// 매일 여기에 항목을 추가하세요.
// category: "policy"(주요 정책) | "economy"(한국 경제정책) | "tech"(기술)
// date: "YYYY-MM-DD" 형식
// summary: 초기 화면에 보이는 짧은 요약 (1~2문장)
// content: 카드를 클릭했을 때 펼쳐지는 확장된 내용 (없으면 summary로 대체됨)
// url: 확장 시 보여줄 원문 출처 하이퍼링크
const briefingItems = [
  {
    date: "2026-07-02",
    category: "policy",
    title: "예시: 정부, OOO 관련 정책 발표",
    summary: "여기에 핵심 내용을 1~2문장으로 요약해서 적어두세요.",
    content: "여기에 원문의 상세 내용을 정리해서 적어두세요. 클릭해서 펼쳤을 때만 보입니다.",
    source: "출처명",
    url: "#"
  },
  // economy(한국 경제정책) 항목은 fetch-economy-news.js 실행 결과인
  // data-economy-auto.js에서 자동으로 채워집니다. 수동으로 추가하고 싶은
  // 항목이 있으면 아래처럼 category: "economy"로 추가해도 됩니다.
  {
    date: "2026-07-02",
    category: "tech",
    title: "예시: 신기술/제품 관련 소식",
    summary: "기술 동향 요약 내용을 여기에 작성하세요.",
    content: "기술 동향에 대한 상세 내용을 여기에 작성하세요.",
    source: "출처명",
    url: "#"
  }
];
