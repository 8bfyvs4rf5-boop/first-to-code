const categoryLabels = {
  policy: "주요 정책",
  economy: "주요 경제정책",
  foreign: "주요외신동향"
};

const feedEl = document.getElementById("feed");
const emptyStateEl = document.getElementById("emptyState");
const tabsEl = document.getElementById("tabs");
const ministryFiltersEl = document.getElementById("ministryFilters");
const tagFiltersEl = document.getElementById("tagFilters");
const searchInputEl = document.getElementById("searchInput");
const sideNavEl = document.getElementById("sideNav");
const viewTitleEl = document.getElementById("viewTitle");
const viewSubtitleEl = document.getElementById("viewSubtitle");

let activeCategory = "economy";
let activeMinistry = "all";
let activeView = "briefing"; // "briefing" | "scrap"
let searchQuery = "";

// --- 검색 ---------------------------------------------------------

function itemMatchesSearch(item) {
  if (!searchQuery) return true;
  const haystack = `${item.title} ${item.summary || ""} ${item.content || ""}`.toLowerCase();
  return haystack.includes(searchQuery);
}

searchInputEl.addEventListener("input", () => {
  searchQuery = searchInputEl.value.trim().toLowerCase();
  renderFeed();
});

// --- 태그 ---------------------------------------------------------
// 분야/유형 2축 고정 태그 체계. 항목 자체(data.js 등)에 기본 tags를 심어둘
// 수도 있지만, 사용자가 실제로 붙이고 떼는 태그는 스크랩과 동일하게
// localStorage에 itemKey로 저장한다 — auto 파일이 매일 통째로 재생성돼도
// 사용자가 붙인 태그는 그대로 남는다.
const TAG_TAXONOMY = {
  domain: ["교육", "노동", "부동산", "AI", "산업", "복지", "환경", "금융", "외교안보", "행정"],
  type: ["규제", "지원", "제도개선", "예산·재정", "조사·연구"]
};
const TAG_AXIS_LABELS = { domain: "분야", type: "유형" };
const TAG_STORAGE_KEY = "dailyBriefing.tags";

const activeTagFilters = { domain: new Set(), type: new Set() };

function loadTagStore() {
  try {
    const raw = localStorage.getItem(TAG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTagStore(store) {
  localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(store));
}

// 사용자가 한 번도 편집하지 않은 항목은 data.js 등에 미리 심어둔 tags를
// 기본값으로 쓰고, 편집한 적이 있으면 localStorage에 저장된 값을 그대로 쓴다.
function getItemTags(item) {
  const store = loadTagStore();
  const stored = store[itemKey(item)];
  const base = stored || item.tags || {};
  return { domain: base.domain || [], type: base.type || [] };
}

function toggleItemTag(item, axis, value) {
  const store = loadTagStore();
  const key = itemKey(item);
  const current = store[key] || getItemTags(item);
  const set = new Set(current[axis] || []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  store[key] = { domain: current.domain || [], type: current.type || [], [axis]: Array.from(set) };
  saveTagStore(store);
}

function itemMatchesTagFilters(item) {
  const tags = getItemTags(item);
  for (const axis of Object.keys(activeTagFilters)) {
    const selected = activeTagFilters[axis];
    if (selected.size > 0 && !tags[axis].some(t => selected.has(t))) return false;
  }
  return true;
}

// --- 스크랩 ---------------------------------------------------------

const SCRAP_STORAGE_KEY = "dailyBriefing.scraps";

function itemKey(item) {
  return item.url || `${item.date}__${item.title}`;
}

function loadScrapKeys() {
  try {
    const raw = localStorage.getItem(SCRAP_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveScrapKeys(keys) {
  localStorage.setItem(SCRAP_STORAGE_KEY, JSON.stringify(Array.from(keys)));
}

function isScrapped(item) {
  return loadScrapKeys().has(itemKey(item));
}

function toggleScrap(item) {
  const keys = loadScrapKeys();
  const key = itemKey(item);
  if (keys.has(key)) keys.delete(key);
  else keys.add(key);
  saveScrapKeys(keys);
}

// --- 발굴 노트 -------------------------------------------------------
// 스크랩한 항목에 남기는 메모. 스크랩과 마찬가지로 localStorage에
// itemKey로 저장해 auto 파일 재생성과 무관하게 유지된다.

const NOTE_STORAGE_KEY = "dailyBriefing.notes";

function loadNoteStore() {
  try {
    const raw = localStorage.getItem(NOTE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNoteStore(store) {
  localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(store));
}

function getItemNote(item) {
  const store = loadNoteStore();
  return store[itemKey(item)] || { why: "", idea: "", needsResearch: false };
}

function saveItemNote(item, note) {
  const store = loadNoteStore();
  store[itemKey(item)] = note;
  saveNoteStore(store);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function renderAutoUpdatedNote() {
  const lines = [];
  if (typeof economyAutoMeta !== "undefined") {
    lines.push(`경제정책 ${economyAutoMeta.updatedAt} (${economyAutoMeta.count}건)`);
  }
  if (typeof policyAutoMeta !== "undefined") {
    lines.push(`주요 정책 ${policyAutoMeta.updatedAt} (${policyAutoMeta.count}건)`);
  }
  if (typeof foreignAutoMeta !== "undefined") {
    lines.push(`주요외신동향 ${foreignAutoMeta.updatedAt} (${foreignAutoMeta.count}건)`);
  }
  if (lines.length === 0) return;
  const note = document.createElement("p");
  note.className = "auto-updated-note";
  note.textContent = `자동 수집 마지막 갱신 — ${lines.join(" · ")}`;
  document.querySelector(".site-header").appendChild(note);
}

function renderTodayDate() {
  const today = new Date();
  const formatted = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  document.getElementById("todayDate").textContent = formatted;
}

function groupByDate(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function getAllItems() {
  const manual = typeof briefingItems !== "undefined" ? briefingItems : [];
  const economyAuto = typeof economyAutoItems !== "undefined" ? economyAutoItems : [];
  const policyAuto = typeof policyAutoItems !== "undefined" ? policyAutoItems : [];
  const foreignAuto = typeof foreignAutoItems !== "undefined" ? foreignAutoItems : [];
  return [...manual, ...economyAuto, ...policyAuto, ...foreignAuto];
}

function renderMinistryFilters() {
  const ministries = Array.from(
    new Set(
      getAllItems()
        .filter(item => item.category === activeCategory && item.ministry)
        .map(item => item.ministry)
    )
  ).sort((a, b) => a.localeCompare(b, "ko"));

  if (ministries.length === 0) {
    ministryFiltersEl.hidden = true;
    ministryFiltersEl.innerHTML = "";
    return;
  }

  if (!ministries.includes(activeMinistry) && activeMinistry !== "all") {
    activeMinistry = "all";
  }

  ministryFiltersEl.hidden = false;
  ministryFiltersEl.innerHTML = "";

  const makeChip = (value, label) => {
    const chip = document.createElement("button");
    chip.className = "ministry-chip";
    chip.dataset.ministry = value;
    chip.textContent = label;
    if (value === activeMinistry) chip.classList.add("active");
    ministryFiltersEl.appendChild(chip);
  };

  makeChip("all", "전체 부처");
  for (const ministry of ministries) makeChip(ministry, ministry);
}

function renderTagFilters() {
  tagFiltersEl.innerHTML = "";

  for (const axis of Object.keys(TAG_TAXONOMY)) {
    const group = document.createElement("div");
    group.className = "tag-filter-group";

    const label = document.createElement("span");
    label.className = "tag-filter-label";
    label.textContent = TAG_AXIS_LABELS[axis];
    group.appendChild(label);

    const makeChip = (value, text) => {
      const chip = document.createElement("button");
      chip.className = "tag-chip";
      chip.dataset.axis = axis;
      chip.dataset.tag = value;
      chip.textContent = text;
      if (value === "all" ? activeTagFilters[axis].size === 0 : activeTagFilters[axis].has(value)) {
        chip.classList.add("active");
      }
      group.appendChild(chip);
    };

    makeChip("all", "전체");
    for (const tag of TAG_TAXONOMY[axis]) makeChip(tag, tag);

    tagFiltersEl.appendChild(group);
  }
}

function renderFeed() {
  let items;
  if (activeView === "scrap") {
    items = getAllItems().filter(isScrapped);
  } else {
    items = getAllItems().filter(item => {
      if (item.category !== activeCategory) return false;
      if (activeMinistry !== "all" && item.ministry !== activeMinistry) return false;
      return true;
    });
  }
  items = items.filter(itemMatchesTagFilters).filter(itemMatchesSearch);

  feedEl.innerHTML = "";

  if (items.length === 0) {
    if (searchQuery) {
      emptyStateEl.textContent = `"${searchInputEl.value.trim()}"에 대한 검색 결과가 없습니다.`;
    } else {
      emptyStateEl.textContent =
        activeView === "scrap"
          ? "스크랩한 항목이 없습니다. 카드의 스크랩 버튼을 눌러 저장해 보세요."
          : "등록된 항목이 없습니다. data.js에 내용을 추가해 보세요.";
    }
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  const grouped = groupByDate(items);

  for (const [date, dayItems] of grouped) {
    const dayGroup = document.createElement("div");
    dayGroup.className = "day-group";

    const heading = document.createElement("div");
    heading.className = "day-heading";
    heading.textContent = date;
    dayGroup.appendChild(heading);

    for (const item of dayItems) {
      dayGroup.appendChild(renderCard(item));
    }

    feedEl.appendChild(dayGroup);
  }
}

function renderCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-expanded", "false");

  const top = document.createElement("div");
  top.className = "card-top";

  const badge = document.createElement("span");
  badge.className = `badge ${item.category}`;
  badge.textContent = categoryLabels[item.category] || item.category;
  top.appendChild(badge);

  if (item.source) {
    const source = document.createElement("span");
    source.className = "card-source";
    source.textContent = item.source;
    top.appendChild(source);
  }

  if (item.type === "news") {
    const tag = document.createElement("span");
    tag.className = "sub-tag";
    tag.textContent = "관련 뉴스";
    top.appendChild(tag);
  } else if (item.type === "official") {
    const tag = document.createElement("span");
    tag.className = "sub-tag";
    tag.textContent = "공식 발표";
    top.appendChild(tag);
  } else if (item.type === "foreign") {
    const tag = document.createElement("span");
    tag.className = "sub-tag";
    tag.textContent = "해외 언론 · AI 번역";
    top.appendChild(tag);
  }

  const scrapBtn = document.createElement("button");
  scrapBtn.className = "scrap-btn";
  scrapBtn.type = "button";
  const syncScrapBtn = () => {
    const scrapped = isScrapped(item);
    scrapBtn.classList.toggle("active", scrapped);
    scrapBtn.textContent = scrapped ? "★ 스크랩됨" : "☆ 스크랩";
    scrapBtn.setAttribute("aria-pressed", String(scrapped));
  };
  syncScrapBtn();
  scrapBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleScrap(item);
    syncScrapBtn();
    syncNoteVisibility();
    if (activeView === "scrap") renderFeed();
  });
  top.appendChild(scrapBtn);

  const chevron = document.createElement("span");
  chevron.className = "card-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾";
  top.appendChild(chevron);

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = item.title;

  const summary = document.createElement("p");
  summary.className = "card-summary";
  summary.textContent = item.summary || "";

  // 붙은 태그를 한눈에 볼 수 있도록 펼치지 않아도 보이는 읽기 전용 칩 목록.
  const cardTags = document.createElement("div");
  cardTags.className = "card-tags";
  const syncCardTags = () => {
    const tags = getItemTags(item);
    const all = [...tags.domain, ...tags.type];
    cardTags.innerHTML = "";
    cardTags.hidden = all.length === 0;
    for (const t of all) {
      const chip = document.createElement("span");
      chip.className = "card-tag-chip";
      chip.textContent = t;
      cardTags.appendChild(chip);
    }
  };
  syncCardTags();

  const detail = document.createElement("div");
  detail.className = "card-detail";
  detail.hidden = true;

  const content = document.createElement("p");
  content.className = "card-content";
  content.textContent = item.content || item.summary || "";
  detail.appendChild(content);

  const link = document.createElement("a");
  link.className = "card-link";
  link.href = item.url || "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "원문 보기 ↗";
  link.addEventListener("click", e => e.stopPropagation());
  detail.appendChild(link);

  // 스크랩한 항목에만 보이는 발굴 노트: 왜 관심있는지 / 적용 아이디어 / 추가 조사 필요 여부.
  const noteSection = document.createElement("div");
  noteSection.className = "note-section";
  noteSection.addEventListener("click", e => e.stopPropagation());

  const noteTitle = document.createElement("div");
  noteTitle.className = "note-section-title";
  noteTitle.textContent = "발굴 노트";
  noteSection.appendChild(noteTitle);

  const whyLabel = document.createElement("label");
  whyLabel.className = "note-label";
  whyLabel.textContent = "왜 관심있는지";
  const whyInput = document.createElement("textarea");
  whyInput.className = "note-textarea";
  whyInput.rows = 2;
  whyInput.placeholder = "이 항목이 왜 눈에 띄었는지 적어보세요.";

  const ideaLabel = document.createElement("label");
  ideaLabel.className = "note-label";
  ideaLabel.textContent = "적용 아이디어";
  const ideaInput = document.createElement("textarea");
  ideaInput.className = "note-textarea";
  ideaInput.rows = 2;
  ideaInput.placeholder = "여기서 발전시켜볼 만한 정책 아이디어를 적어보세요.";

  const researchLabel = document.createElement("label");
  researchLabel.className = "note-checkbox-label";
  const researchCheckbox = document.createElement("input");
  researchCheckbox.type = "checkbox";
  researchLabel.appendChild(researchCheckbox);
  researchLabel.appendChild(document.createTextNode(" 추가 조사 필요"));

  const persistNote = debounce(() => {
    saveItemNote(item, {
      why: whyInput.value,
      idea: ideaInput.value,
      needsResearch: researchCheckbox.checked
    });
  }, 300);

  const syncNoteFields = () => {
    const note = getItemNote(item);
    whyInput.value = note.why;
    ideaInput.value = note.idea;
    researchCheckbox.checked = note.needsResearch;
  };
  syncNoteFields();

  whyInput.addEventListener("input", persistNote);
  ideaInput.addEventListener("input", persistNote);
  researchCheckbox.addEventListener("change", persistNote);

  noteSection.appendChild(whyLabel);
  noteSection.appendChild(whyInput);
  noteSection.appendChild(ideaLabel);
  noteSection.appendChild(ideaInput);
  noteSection.appendChild(researchLabel);
  detail.appendChild(noteSection);

  const syncNoteVisibility = () => {
    noteSection.hidden = !isScrapped(item);
  };
  syncNoteVisibility();

  const tagEditor = document.createElement("div");
  tagEditor.className = "tag-editor";
  for (const axis of Object.keys(TAG_TAXONOMY)) {
    const group = document.createElement("div");
    group.className = "tag-editor-group";

    const label = document.createElement("span");
    label.className = "tag-editor-label";
    label.textContent = TAG_AXIS_LABELS[axis];
    group.appendChild(label);

    for (const value of TAG_TAXONOMY[axis]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag-editor-btn";
      btn.textContent = value;
      btn.classList.toggle("active", getItemTags(item)[axis].includes(value));
      btn.addEventListener("click", e => {
        e.stopPropagation();
        toggleItemTag(item, axis, value);
        btn.classList.toggle("active");
        syncCardTags();
        if (activeTagFilters.domain.size > 0 || activeTagFilters.type.size > 0) renderFeed();
      });
      group.appendChild(btn);
    }

    tagEditor.appendChild(group);
  }
  detail.appendChild(tagEditor);

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(summary);
  card.appendChild(cardTags);
  card.appendChild(detail);

  const toggle = () => {
    const expanded = card.classList.toggle("expanded");
    detail.hidden = !expanded;
    card.setAttribute("aria-expanded", String(expanded));
  };

  card.addEventListener("click", toggle);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  return card;
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  tabsEl.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  activeCategory = btn.dataset.category;
  activeMinistry = "all";
  renderMinistryFilters();
  renderFeed();
});

ministryFiltersEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".ministry-chip");
  if (!chip) return;
  activeMinistry = chip.dataset.ministry;
  renderMinistryFilters();
  renderFeed();
});

tagFiltersEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".tag-chip");
  if (!chip) return;
  const { axis, tag } = chip.dataset;
  if (tag === "all") activeTagFilters[axis].clear();
  else {
    if (activeTagFilters[axis].has(tag)) activeTagFilters[axis].delete(tag);
    else activeTagFilters[axis].add(tag);
  }
  renderTagFilters();
  renderFeed();
});

function applyViewChrome() {
  const isScrapView = activeView === "scrap";
  tabsEl.hidden = isScrapView;
  ministryFiltersEl.hidden = isScrapView;
  viewTitleEl.textContent = isScrapView ? "스크랩" : "데일리 브리핑";
  viewSubtitleEl.textContent = isScrapView
    ? "저장해 둔 정책·경제·외신 항목 모음"
    : "주요 정책 · 주요 경제정책 · 주요외신동향을 한 곳에서";
}

sideNavEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".side-nav-btn");
  if (!btn || !btn.dataset.view) return;
  sideNavEl.querySelectorAll(".side-nav-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  activeView = btn.dataset.view;
  applyViewChrome();
  if (activeView === "briefing") renderMinistryFilters();
  renderFeed();
});

renderTodayDate();
renderAutoUpdatedNote();
applyViewChrome();
renderMinistryFilters();
renderTagFilters();
renderFeed();
