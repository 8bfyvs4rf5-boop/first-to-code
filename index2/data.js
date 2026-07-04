// 매일 여기에 항목을 추가하세요.
// category: "policy"(주요 정책) | "economy"(한국 경제정책) | "foreign"(주요외신동향)
// date: "YYYY-MM-DD" 형식
// summary: 초기 화면에 보이는 짧은 요약 (1~2문장)
// content: 카드를 클릭했을 때 펼쳐지는 확장된 내용 (없으면 summary로 대체됨)
// url: 확장 시 보여줄 원문 출처 하이퍼링크
// tags(선택): { domain: [...], type: [...] } — 분야/유형 태그 기본값.
//   domain: 교육/노동/부동산/AI/산업/복지/환경/금융/외교안보/행정
//   type: 규제/지원/제도개선/예산·재정/조사·연구
//   지정하지 않아도 화면에서 사용자가 직접 태그를 붙일 수 있고, 그렇게
//   붙인 태그는 브라우저 localStorage에 저장되어 이 파일이 갱신돼도 유지됩니다.
const briefingItems = [
  {
    date: "2026-07-02",
    category: "policy",
    title: "예시: 정부, OOO 관련 정책 발표",
    summary: "여기에 핵심 내용을 1~2문장으로 요약해서 적어두세요.",
    content: "여기에 원문의 상세 내용을 정리해서 적어두세요. 클릭해서 펼쳤을 때만 보입니다.",
    source: "출처명",
    url: "#",
    tags: { domain: ["교육"], type: ["제도개선"] }
  },
  // economy(한국 경제정책)·foreign(주요외신동향) 항목은 각각
  // fetch-economy-news.js·fetch-foreign-news.js 실행 결과인
  // data-economy-auto.js·data-foreign-auto.js에서 자동으로 채워집니다.
  // 수동으로 추가하고 싶은 항목이 있으면 아래처럼 추가해도 됩니다.
  {
    date: "2026-07-02",
    category: "foreign",
    title: "예시: 해외 언론 보도 요약",
    summary: "해외 언론 기사를 한국어로 번역/요약한 내용을 여기에 작성하세요.",
    content: "번역된 상세 내용을 여기에 작성하세요.",
    source: "출처명",
    url: "#"
  }
];
