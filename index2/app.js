const categoryLabels = {
  policy: "주요 정책",
  economy: "주요 경제정책",
  tech: "기술"
};

const feedEl = document.getElementById("feed");
const emptyStateEl = document.getElementById("emptyState");
const tabsEl = document.getElementById("tabs");
const ministryFiltersEl = document.getElementById("ministryFilters");
const sideNavEl = document.getElementById("sideNav");
const viewTitleEl = document.getElementById("viewTitle");
const viewSubtitleEl = document.getElementById("viewSubtitle");

let activeCategory = "economy";
let activeMinistry = "all";
let activeView = "briefing"; // "briefing" | "scrap"

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

function renderAutoUpdatedNote() {
  const lines = [];
  if (typeof economyAutoMeta !== "undefined") {
    lines.push(`경제정책 ${economyAutoMeta.updatedAt} (${economyAutoMeta.count}건)`);
  }
  if (typeof policyAutoMeta !== "undefined") {
    lines.push(`주요 정책 ${policyAutoMeta.updatedAt} (${policyAutoMeta.count}건)`);
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
  return [...manual, ...economyAuto, ...policyAuto];
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

function renderFeed() {
  let items;
  if (activeView === "scrap") {
    items = getAllItems().filter(isScrapped);
  } else {
    items = getAllItems().filter(item => {
      if (item.category !== activeCategory) return false;
      if (activeMinistry !== "all") return item.ministry === activeMinistry;
      return true;
    });
  }

  feedEl.innerHTML = "";

  if (items.length === 0) {
    emptyStateEl.textContent =
      activeView === "scrap"
        ? "스크랩한 항목이 없습니다. 카드의 스크랩 버튼을 눌러 저장해 보세요."
        : "등록된 항목이 없습니다. data.js에 내용을 추가해 보세요.";
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

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(summary);
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

function applyViewChrome() {
  const isScrapView = activeView === "scrap";
  tabsEl.hidden = isScrapView;
  ministryFiltersEl.hidden = isScrapView;
  viewTitleEl.textContent = isScrapView ? "스크랩" : "데일리 브리핑";
  viewSubtitleEl.textContent = isScrapView
    ? "저장해 둔 정책·경제·기술 항목 모음"
    : "주요 정책 · 주요 경제정책 · 기술 동향을 한 곳에서";
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
renderFeed();
