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
const searchBarEl = document.getElementById("searchBar");
const searchInputEl = document.getElementById("searchInput");
const sideNavEl = document.getElementById("sideNav");
const viewTitleEl = document.getElementById("viewTitle");
const viewSubtitleEl = document.getElementById("viewSubtitle");
const ideaBoardEl = document.getElementById("ideaBoard");
const ideaBoardColumnsEl = document.getElementById("ideaBoardColumns");
const newIdeaBtn = document.getElementById("newIdeaBtn");
const newIdeaFormEl = document.getElementById("newIdeaForm");
const newIdeaTitleEl = document.getElementById("newIdeaTitle");
const newIdeaDescEl = document.getElementById("newIdeaDesc");
const newIdeaCancelEl = document.getElementById("newIdeaCancel");
const patternViewEl = document.getElementById("patternView");
const patternSummaryEl = document.getElementById("patternSummary");
const patternItemsEl = document.getElementById("patternItems");
const gapViewEl = document.getElementById("gapView");
const gapListEl = document.getElementById("gapList");

let activeCategory = "economy";
let activeMinistry = "all";
let activeView = "briefing"; // "briefing" | "scrap" | "board" | "patterns" | "gap"
let searchQuery = "";
let selectedPattern = null; // { axis, tag } | null

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

// --- 정책 아이디어 보드 -------------------------------------------------
// 스크랩과 별개로, 사용자가 직접 만드는 아이디어 카드. 브리핑 항목과 달리
// 자동으로 채워지지 않으므로 localStorage에 배열 그대로 저장한다.

const IDEA_STORAGE_KEY = "dailyBriefing.ideas";
const IDEA_STATUSES = [
  { value: "idea", label: "아이디어" },
  { value: "researching", label: "조사중" },
  { value: "draft", label: "초안" },
  { value: "done", label: "보류·완료" }
];

function loadIdeas() {
  try {
    const raw = localStorage.getItem(IDEA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIdeas(ideas) {
  localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(ideas));
}

function createIdea(title, description) {
  const ideas = loadIdeas();
  ideas.push({
    id: `idea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    status: "idea",
    linkedItemKeys: [],
    createdAt: new Date().toISOString()
  });
  saveIdeas(ideas);
}

function updateIdea(id, patch) {
  const ideas = loadIdeas();
  const idx = ideas.findIndex(i => i.id === id);
  if (idx === -1) return;
  ideas[idx] = { ...ideas[idx], ...patch };
  saveIdeas(ideas);
}

function deleteIdea(id) {
  saveIdeas(loadIdeas().filter(i => i.id !== id));
}

function renderIdeaCard(idea) {
  const card = document.createElement("div");
  card.className = "idea-card";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "idea-card-title-input";
  titleInput.value = idea.title;
  titleInput.addEventListener("input", debounce(() => {
    updateIdea(idea.id, { title: titleInput.value });
  }, 300));
  card.appendChild(titleInput);

  const descTextarea = document.createElement("textarea");
  descTextarea.className = "idea-card-desc";
  descTextarea.rows = 3;
  descTextarea.placeholder = "아이디어 설명, 근거, 다음 액션 등을 적어보세요.";
  descTextarea.value = idea.description || "";
  descTextarea.addEventListener("input", debounce(() => {
    updateIdea(idea.id, { description: descTextarea.value });
  }, 300));
  card.appendChild(descTextarea);

  const statusSelect = document.createElement("select");
  statusSelect.className = "idea-status-select";
  for (const s of IDEA_STATUSES) {
    const opt = document.createElement("option");
    opt.value = s.value;
    opt.textContent = s.label;
    if (s.value === idea.status) opt.selected = true;
    statusSelect.appendChild(opt);
  }
  statusSelect.addEventListener("change", () => {
    updateIdea(idea.id, { status: statusSelect.value });
    renderBoard();
  });
  card.appendChild(statusSelect);

  const linkedWrap = document.createElement("div");
  linkedWrap.className = "idea-linked-items";
  const renderLinkedChips = () => {
    linkedWrap.innerHTML = "";
    const allItems = getAllItems();
    for (const key of idea.linkedItemKeys || []) {
      const linkedItem = allItems.find(it => itemKey(it) === key);
      const chip = document.createElement("span");
      chip.className = "idea-linked-chip";
      chip.textContent = linkedItem ? linkedItem.title : "(삭제된 항목)";
      if (linkedItem && linkedItem.url) {
        chip.title = "클릭하면 원문으로 이동";
        chip.addEventListener("click", () => window.open(linkedItem.url, "_blank", "noopener,noreferrer"));
      }
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "idea-linked-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "연결 해제";
      removeBtn.addEventListener("click", e => {
        e.stopPropagation();
        idea.linkedItemKeys = (idea.linkedItemKeys || []).filter(k => k !== key);
        updateIdea(idea.id, { linkedItemKeys: idea.linkedItemKeys });
        renderLinkedChips();
      });
      chip.appendChild(removeBtn);
      linkedWrap.appendChild(chip);
    }
  };
  renderLinkedChips();
  card.appendChild(linkedWrap);

  const linkSearchWrap = document.createElement("div");
  linkSearchWrap.className = "idea-link-search";
  const linkSearchInput = document.createElement("input");
  linkSearchInput.type = "text";
  linkSearchInput.className = "idea-link-search-input";
  linkSearchInput.placeholder = "관련 브리핑 항목 검색해 연결...";
  const linkResults = document.createElement("div");
  linkResults.className = "idea-link-results";

  linkSearchInput.addEventListener("input", () => {
    const q = linkSearchInput.value.trim().toLowerCase();
    linkResults.innerHTML = "";
    if (!q) return;
    const matches = getAllItems()
      .filter(it => it.title.toLowerCase().includes(q))
      .filter(it => !(idea.linkedItemKeys || []).includes(itemKey(it)))
      .slice(0, 5);
    for (const m of matches) {
      const resultBtn = document.createElement("button");
      resultBtn.type = "button";
      resultBtn.className = "idea-link-result-btn";
      resultBtn.textContent = `${m.title} (${m.date})`;
      resultBtn.addEventListener("click", () => {
        idea.linkedItemKeys = [...(idea.linkedItemKeys || []), itemKey(m)];
        updateIdea(idea.id, { linkedItemKeys: idea.linkedItemKeys });
        renderLinkedChips();
        linkSearchInput.value = "";
        linkResults.innerHTML = "";
      });
      linkResults.appendChild(resultBtn);
    }
  });

  linkSearchWrap.appendChild(linkSearchInput);
  linkSearchWrap.appendChild(linkResults);
  card.appendChild(linkSearchWrap);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "idea-delete-btn";
  deleteBtn.textContent = "삭제";
  deleteBtn.addEventListener("click", () => {
    if (confirm("이 아이디어를 삭제할까요?")) {
      deleteIdea(idea.id);
      renderBoard();
    }
  });
  card.appendChild(deleteBtn);

  return card;
}

function renderBoard() {
  const ideas = loadIdeas();
  ideaBoardColumnsEl.innerHTML = "";

  for (const statusDef of IDEA_STATUSES) {
    const column = document.createElement("div");
    column.className = "idea-column";

    const columnIdeas = ideas.filter(i => i.status === statusDef.value);

    const heading = document.createElement("div");
    heading.className = "idea-column-heading";
    heading.textContent = `${statusDef.label} (${columnIdeas.length})`;
    column.appendChild(heading);

    const list = document.createElement("div");
    list.className = "idea-column-list";
    if (columnIdeas.length === 0) {
      const empty = document.createElement("p");
      empty.className = "idea-column-empty";
      empty.textContent = "아직 없음";
      list.appendChild(empty);
    } else {
      for (const idea of columnIdeas) list.appendChild(renderIdeaCard(idea));
    }
    column.appendChild(list);

    ideaBoardColumnsEl.appendChild(column);
  }
}

newIdeaBtn.addEventListener("click", () => {
  newIdeaFormEl.hidden = false;
  newIdeaBtn.hidden = true;
  newIdeaTitleEl.focus();
});

newIdeaCancelEl.addEventListener("click", () => {
  newIdeaFormEl.reset();
  newIdeaFormEl.hidden = true;
  newIdeaBtn.hidden = false;
});

newIdeaFormEl.addEventListener("submit", e => {
  e.preventDefault();
  const title = newIdeaTitleEl.value.trim();
  if (!title) return;
  createIdea(title, newIdeaDescEl.value.trim());
  newIdeaFormEl.reset();
  newIdeaFormEl.hidden = true;
  newIdeaBtn.hidden = false;
  renderBoard();
});

// --- 패턴 뷰 ---------------------------------------------------------
// 최근 30일간 어떤 태그가 반복적으로 등장했는지 보여준다. 태그를 붙이는
// 사람이 늘어날수록(=사용할수록) 자연스럽게 유용해지는 뷰라 별도 데이터
// 저장은 필요 없고, 기존 항목의 date + getItemTags()만으로 계산한다.

const PATTERN_WINDOW_DAYS = 30;

function getRecentItems() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PATTERN_WINDOW_DAYS);
  return getAllItems().filter(item => {
    const d = new Date(item.date);
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}

function computeTagFrequency(recentItems, axis) {
  const counts = {};
  for (const item of recentItems) {
    for (const tag of getItemTags(item)[axis]) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function renderPatternView() {
  const recentItems = getRecentItems();
  patternSummaryEl.innerHTML = "";

  for (const axis of Object.keys(TAG_TAXONOMY)) {
    const top5 = computeTagFrequency(recentItems, axis);

    const block = document.createElement("div");
    block.className = "pattern-block";

    const heading = document.createElement("div");
    heading.className = "pattern-block-heading";
    heading.textContent = `${TAG_AXIS_LABELS[axis]} Top 5`;
    block.appendChild(heading);

    if (top5.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pattern-empty";
      empty.textContent = "최근 30일간 태그가 붙은 항목이 없습니다.";
      block.appendChild(empty);
    } else {
      const maxCount = top5[0][1];
      for (const [tag, count] of top5) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "pattern-row";
        if (selectedPattern && selectedPattern.axis === axis && selectedPattern.tag === tag) {
          row.classList.add("active");
        }

        const label = document.createElement("span");
        label.className = "pattern-row-label";
        label.textContent = tag;
        row.appendChild(label);

        const barTrack = document.createElement("span");
        barTrack.className = "pattern-row-bar-track";
        const bar = document.createElement("span");
        bar.className = "pattern-row-bar";
        bar.style.width = `${Math.max(8, (count / maxCount) * 100)}%`;
        barTrack.appendChild(bar);
        row.appendChild(barTrack);

        const countEl = document.createElement("span");
        countEl.className = "pattern-row-count";
        countEl.textContent = `${count}건`;
        row.appendChild(countEl);

        row.addEventListener("click", () => {
          selectedPattern = selectedPattern && selectedPattern.axis === axis && selectedPattern.tag === tag
            ? null
            : { axis, tag };
          renderPatternView();
        });

        block.appendChild(row);
      }
    }

    patternSummaryEl.appendChild(block);
  }

  patternItemsEl.innerHTML = "";
  if (!selectedPattern) {
    const hint = document.createElement("p");
    hint.className = "pattern-empty";
    hint.textContent = "위에서 태그를 클릭하면 관련 항목이 여기 나타납니다.";
    patternItemsEl.appendChild(hint);
    return;
  }

  const matched = recentItems.filter(item => getItemTags(item)[selectedPattern.axis].includes(selectedPattern.tag));
  const matchedHeading = document.createElement("div");
  matchedHeading.className = "pattern-items-heading";
  matchedHeading.textContent = `"${selectedPattern.tag}" 태그가 붙은 최근 30일 항목 (${matched.length}건)`;
  patternItemsEl.appendChild(matchedHeading);

  for (const [date, dayItems] of groupByDate(matched)) {
    const dayGroup = document.createElement("div");
    dayGroup.className = "day-group";
    const heading = document.createElement("div");
    heading.className = "day-heading";
    heading.textContent = date;
    dayGroup.appendChild(heading);
    for (const item of dayItems) dayGroup.appendChild(renderCard(item));
    patternItemsEl.appendChild(dayGroup);
  }
}

// --- 정책 갭 레이더 ---------------------------------------------------
// 주요외신동향에는 등장했지만 국내(주요 정책·주요 경제정책) 항목에는
// 아직 안 붙은 "분야" 태그를 찾는다. 유형(규제/지원 등) 태그는 정책
// 수단이라 "해외엔 있는데 국내엔 없다" 비교 대상으로는 안 맞아서 뺐다.
// 새 저장소 없이 기존 getItemTags() 오버레이만으로 계산하는 읽기 전용 뷰.

function computeTagCounts(items, axis) {
  const counts = {};
  for (const item of items) {
    for (const tag of getItemTags(item)[axis]) counts[tag] = (counts[tag] || 0) + 1;
  }
  return counts;
}

function computePolicyGaps() {
  const all = getAllItems();
  const foreignItems = all.filter(item => item.category === "foreign");
  const domesticItems = all.filter(item => item.category === "policy" || item.category === "economy");
  const foreignCounts = computeTagCounts(foreignItems, "domain");
  const domesticCounts = computeTagCounts(domesticItems, "domain");

  return Object.keys(foreignCounts)
    .filter(tag => !domesticCounts[tag])
    .map(tag => ({
      tag,
      count: foreignCounts[tag],
      items: foreignItems
        .filter(item => getItemTags(item).domain.includes(tag))
        .sort((a, b) => b.date.localeCompare(a.date))
    }))
    .sort((a, b) => b.count - a.count);
}

function renderGapCard(gap) {
  const card = document.createElement("div");
  card.className = "gap-card";

  const header = document.createElement("div");
  header.className = "gap-card-header";

  const tagName = document.createElement("span");
  tagName.className = "gap-card-tag";
  tagName.textContent = gap.tag;
  header.appendChild(tagName);

  const badge = document.createElement("span");
  badge.className = "gap-card-badge";
  badge.textContent = "국내 아직 없음";
  header.appendChild(badge);

  const count = document.createElement("span");
  count.className = "gap-card-count";
  count.textContent = `해외 ${gap.count}건`;
  header.appendChild(count);

  const toIdeaBtn = document.createElement("button");
  toIdeaBtn.type = "button";
  toIdeaBtn.className = "gap-to-idea-btn";
  toIdeaBtn.textContent = "아이디어로 등록";
  toIdeaBtn.addEventListener("click", () => {
    const idea = {
      id: `idea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: `[해외 사례] ${gap.tag} 관련 정책 검토`,
      description: `주요외신동향에서 "${gap.tag}" 태그가 붙은 해외 사례 ${gap.count}건을 참고해 국내 적용 여부를 검토합니다.`,
      status: "idea",
      linkedItemKeys: gap.items.map(itemKey),
      createdAt: new Date().toISOString()
    };
    const ideas = loadIdeas();
    ideas.push(idea);
    saveIdeas(ideas);
    switchView("board");
  });
  header.appendChild(toIdeaBtn);

  card.appendChild(header);

  const list = document.createElement("div");
  list.className = "gap-card-items";
  for (const item of gap.items) list.appendChild(renderCard(item));
  card.appendChild(list);

  return card;
}

function renderGapView() {
  gapListEl.innerHTML = "";

  const foreignItems = getAllItems().filter(item => item.category === "foreign");
  const foreignHasTags = foreignItems.some(item => getItemTags(item).domain.length > 0);

  if (!foreignHasTags) {
    const empty = document.createElement("p");
    empty.className = "pattern-empty gap-view-empty";
    empty.textContent = "주요외신동향 항목에 분야 태그가 아직 없습니다. 카드를 펼쳐 태그를 몇 개 붙여보면 갭 레이더가 채워집니다.";
    gapListEl.appendChild(empty);
    return;
  }

  const gaps = computePolicyGaps();
  if (gaps.length === 0) {
    const empty = document.createElement("p");
    empty.className = "pattern-empty gap-view-empty";
    empty.textContent = "현재 해외에만 있고 국내에는 없는 분야 태그가 없습니다 — 국내 정책이 외신 흐름을 잘 커버하고 있습니다.";
    gapListEl.appendChild(empty);
    return;
  }

  for (const gap of gaps) gapListEl.appendChild(renderGapCard(gap));
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

// 뷰가 하나 늘 때마다 조건문을 또 추가하는 대신, 뷰별 chrome 설정과
// 렌더 함수를 표로 관리한다.
const VIEW_CONFIG = {
  briefing: {
    title: "데일리 브리핑",
    subtitle: "주요 정책 · 주요 경제정책 · 주요외신동향을 한 곳에서",
    contentEl: feedEl,
    showTabs: true,
    showMinistry: true,
    showTagFilters: true,
    showSearch: true
  },
  scrap: {
    title: "스크랩",
    subtitle: "저장해 둔 정책·경제·외신 항목 모음",
    contentEl: feedEl,
    showTabs: false,
    showMinistry: false,
    showTagFilters: true,
    showSearch: true
  },
  board: {
    title: "아이디어 보드",
    subtitle: "브리핑에서 발견한 내용을 정책 아이디어로 발전시켜 보세요",
    contentEl: ideaBoardEl,
    showTabs: false,
    showMinistry: false,
    showTagFilters: false,
    showSearch: false
  },
  patterns: {
    title: "패턴 뷰",
    subtitle: "반복적으로 등장하는 태그로 흐름을 파악해 보세요",
    contentEl: patternViewEl,
    showTabs: false,
    showMinistry: false,
    showTagFilters: false,
    showSearch: false
  },
  gap: {
    title: "정책 갭 레이더",
    subtitle: "외신엔 있는데 국내엔 아직 없는 분야를 찾아보세요",
    contentEl: gapViewEl,
    showTabs: false,
    showMinistry: false,
    showTagFilters: false,
    showSearch: false
  }
};

const VIEW_CONTENT_ELS = [feedEl, ideaBoardEl, patternViewEl, gapViewEl];

const VIEW_RENDER = {
  briefing: () => {
    renderMinistryFilters();
    renderFeed();
  },
  scrap: renderFeed,
  board: renderBoard,
  patterns: renderPatternView,
  gap: renderGapView
};

function applyViewChrome() {
  const config = VIEW_CONFIG[activeView];

  tabsEl.hidden = !config.showTabs;
  ministryFiltersEl.hidden = !config.showMinistry;
  tagFiltersEl.hidden = !config.showTagFilters;
  searchBarEl.hidden = !config.showSearch;
  for (const el of VIEW_CONTENT_ELS) el.hidden = el !== config.contentEl;
  if (config.contentEl !== feedEl) emptyStateEl.hidden = true;

  viewTitleEl.textContent = config.title;
  viewSubtitleEl.textContent = config.subtitle;
}

function switchView(view) {
  activeView = view;
  sideNavEl.querySelectorAll(".side-nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  applyViewChrome();
  VIEW_RENDER[view]();
}

sideNavEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".side-nav-btn");
  if (!btn || !btn.dataset.view) return;
  switchView(btn.dataset.view);
});

renderTodayDate();
renderAutoUpdatedNote();
applyViewChrome();
renderMinistryFilters();
renderTagFilters();
renderFeed();
