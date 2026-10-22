"use strict";

/*
 * GON P02 clickable UX prototype.
 * Mock data only: no network calls, no credentials, no production decisions.
 * Production ranking, assessment, XP and proof verification remain P03+ work.
 */

const MODES = {
  deep: {
    label: "Deep Mastery",
    explanation: "Đang ưu tiên nguồn, bản chất, cơ chế và phản biện vì bạn chọn Deep Mastery."
  },
  work: {
    label: "Apply at Work",
    explanation: "Đang ưu tiên hướng có case, kế hoạch áp dụng và artifact dùng được ngay vì bạn chọn Apply at Work."
  },
  create: {
    label: "Create / Publish",
    explanation: "Đang ưu tiên hướng có artifact rõ vì bạn chọn Create / Publish. Đây là gợi ý, không phải kết luận hướng nào “đúng nhất”."
  },
  fast: {
    label: "Fast & Entertaining",
    explanation: "Đang ưu tiên trải nghiệm ngắn và vui, nhưng mỗi hướng vẫn phải qua một kiểm chứng core value."
  },
  impact: {
    label: "Prove & Impact",
    explanation: "Đang ưu tiên nhiệm vụ thật, thực hành và bằng chứng có thể quan sát vì bạn chọn Prove & Impact."
  }
};

const CANDIDATES = [
  {
    id: "OUT-001",
    title: "Game mô phỏng “một đêm viral”",
    cluster: "create",
    format: "Game · GDevelop template",
    minutes: 30,
    difficulty: "Trung bình",
    artifact: "Game/artifact chơi được",
    sourceStatus: "AI draft · 3 nguồn mẫu",
    summary: "Điều khiển hook, cộng đồng và thời điểm để thấy cùng một bài hát có thể có kết quả khác nhau.",
    quality: 87,
    scores: { deep: 84, work: 76, create: 97, fast: 88, impact: 91 },
    reason: "Có artifact rõ và buộc người chơi tự kiểm chứng cơ chế."
  },
  {
    id: "OUT-002",
    title: "Quest tạo video giáo dục 60 giây",
    cluster: "create",
    format: "Video · Easy Task",
    minutes: 45,
    difficulty: "Trung bình",
    artifact: "Kịch bản/video nháp",
    sourceStatus: "Template · cần nguồn của bạn",
    summary: "Biến bài học về viral thành một video ngắn có hook, giá trị học và CTA chứng minh hiểu biết.",
    quality: 84,
    scores: { deep: 72, work: 82, create: 95, fast: 86, impact: 88 },
    reason: "Phù hợp nếu bạn muốn thử vai creator và giữ lại quá trình sáng tạo."
  },
  {
    id: "OUT-003",
    title: "Bản đồ cơ chế lan truyền",
    cluster: "deep",
    format: "Infographic · Concept map",
    minutes: 20,
    difficulty: "Dễ",
    artifact: "Infographic giải thích",
    sourceStatus: "Có citation mẫu",
    summary: "Tách rõ nội dung, mạng lưới, thuật toán, thời điểm và yếu tố may mắn trong một sơ đồ.",
    quality: 91,
    scores: { deep: 94, work: 84, create: 82, fast: 78, impact: 75 },
    reason: "Cho bức tranh tổng thể trước khi bạn bắt tay tạo artifact."
  },
  {
    id: "OUT-004",
    title: "Deep dive: vì sao trend không thể sao chép nguyên xi",
    cluster: "deep",
    format: "Web lesson · Case comparison",
    minutes: 60,
    difficulty: "Khó",
    artifact: "Bài phân tích có citation",
    sourceStatus: "Có claim cần kiểm chứng",
    summary: "So sánh nhiều trường hợp, phản ví dụ và giới hạn của dữ liệu để không nhầm tương quan với nguyên nhân.",
    quality: 95,
    scores: { deep: 98, work: 74, create: 68, fast: 42, impact: 70 },
    reason: "Dành cho người muốn hiểu sâu và phản biện thay vì công thức viral."
  },
  {
    id: "OUT-005",
    title: "Case lab cho chiến dịch cộng đồng",
    cluster: "apply",
    format: "Case · Workshop",
    minutes: 50,
    difficulty: "Trung bình",
    artifact: "Kế hoạch áp dụng",
    sourceStatus: "Template nghề nghiệp",
    summary: "Áp dụng cơ chế lan truyền cho một chiến dịch thật, có guardrail chống thao túng và clickbait.",
    quality: 88,
    scores: { deep: 79, work: 96, create: 80, fast: 58, impact: 93 },
    reason: "Tập trung vào outcome trong công việc/cộng đồng, không chỉ lượt xem."
  },
  {
    id: "OUT-006",
    title: "Bài học web 7 bước: từ hook đến core value",
    cluster: "apply",
    format: "Web lesson · Quiz",
    minutes: 18,
    difficulty: "Dễ",
    artifact: "Checklist thực hành",
    sourceStatus: "AI draft · cần review",
    summary: "Một bài học có cấu trúc và câu hỏi truy hồi để biến kiến thức viral thành quy trình thiết kế.",
    quality: 82,
    scores: { deep: 78, work: 89, create: 79, fast: 74, impact: 76 },
    reason: "Cân bằng giữa tốc độ và khả năng áp dụng."
  },
  {
    id: "OUT-007",
    title: "Thử thách 5 phút: đoán yếu tố khiến video được chia sẻ",
    cluster: "fast",
    format: "Mini game · Quick task",
    minutes: 5,
    difficulty: "Dễ",
    artifact: "Kết quả thử thách",
    sourceStatus: "Template an toàn",
    summary: "Chơi nhanh với các tình huống ngắn và nhận phản hồi về trực giác lan truyền của bạn.",
    quality: 75,
    scores: { deep: 48, work: 55, create: 70, fast: 98, impact: 48 },
    reason: "Phù hợp khi bạn chỉ có ít thời gian nhưng vẫn muốn học một ý chính."
  },
  {
    id: "OUT-008",
    title: "Bộ ảnh/infographic “3 lầm tưởng về viral”",
    cluster: "fast",
    format: "Image · Infographic",
    minutes: 12,
    difficulty: "Dễ",
    artifact: "Bộ hình chia sẻ được",
    sourceStatus: "Có nguồn mẫu",
    summary: "Học bằng hình ảnh và tạo một artifact ngắn để dạy lại người khác.",
    quality: 80,
    scores: { deep: 66, work: 70, create: 88, fast: 92, impact: 82 },
    reason: "Nhẹ và trực quan; Boss Proof yêu cầu bạn giải thích lại bằng lời."
  },
  {
    id: "OUT-009",
    title: "Easy Task: phân tích một bài hát bạn thích",
    cluster: "prove",
    format: "Easy Task · Artifact",
    minutes: 25,
    difficulty: "Trung bình",
    artifact: "Evidence note",
    sourceStatus: "Dùng nguồn do bạn gắn",
    summary: "Áp dụng rubric vào một ví dụ thật do bạn chọn và nói rõ điều gì là bằng chứng, điều gì chỉ là suy đoán.",
    quality: 86,
    scores: { deep: 83, work: 86, create: 84, fast: 69, impact: 94 },
    reason: "Tạo evidence gần với sở thích và bối cảnh thật của bạn."
  },
  {
    id: "OUT-010",
    title: "Nhiệm vụ dạy lại trong 90 giây",
    cluster: "prove",
    format: "Audio/Video · Teach-back",
    minutes: 20,
    difficulty: "Trung bình",
    artifact: "Teach-back artifact",
    sourceStatus: "Rubric-first",
    summary: "Giải thích cho một người chưa biết vì sao copy trend không đồng nghĩa với copy kết quả.",
    quality: 89,
    scores: { deep: 88, work: 81, create: 90, fast: 76, impact: 97 },
    reason: "Chứng minh hiểu thật bằng khả năng truyền đạt, không phải chọn đáp án."
  }
];

const SEARCH_STATES = {
  found: {
    kicker: "FOUND · Đã có module phù hợp",
    title: "Có module sẵn sàng cho mục tiêu này",
    copy: "Module khớp cả cơ chế viral và artifact creator. Bạn vẫn có thể xem các hướng khác hoặc Brew biến thể riêng.",
    badge: "Sẵn sàng học",
    badgeClass: "success",
    showBrew: true
  },
  related: {
    kicker: "RELATED · Liên quan một phần",
    title: "Đã có nền tảng, nhưng thiếu góc creator giáo dục",
    copy: "Module sẵn có giải thích lan truyền xã hội. Phần còn thiếu là cách biến hiểu biết đó thành nội dung học có bằng chứng.",
    badge: "Chưa khớp hoàn toàn",
    badgeClass: "warning",
    showBrew: true
  },
  missing: {
    kicker: "MISSING · Chưa có kết quả đủ tốt",
    title: "Kho tri thức Private Alpha chưa có phần này",
    copy: "GON không để bạn gặp trang trống. Bạn có thể Brew một AI draft riêng tư hoặc sửa lại input.",
    badge: "Brew được đề xuất",
    badgeClass: "info",
    showBrew: true
  },
  clarify: {
    kicker: "NEEDS CLARIFICATION · Cần làm rõ",
    title: "Input có thể dẫn tới ba hành trình khác nhau",
    copy: "Chọn đúng trọng tâm giúp GON không tạo một module chung chung hoặc sai mục tiêu.",
    badge: "Chờ bạn chọn",
    badgeClass: "warning",
    showBrew: false
  },
  blocked: {
    kicker: "BLOCKED · Không thể xử lý an toàn",
    title: "Input bị dừng ở cổng an toàn/quyền",
    copy: "Ví dụ trạng thái UX: URL nguy hiểm, file không an toàn hoặc nội dung bị cấm. Production cần lý do dễ hiểu và lối thay thế an toàn.",
    badge: "Đã dừng an toàn",
    badgeClass: "danger",
    showBrew: false
  }
};

function calculateLevel(lifetimeXp) {
  const xp = Math.max(0, Math.floor(Number(lifetimeXp) || 0));
  const level = Math.floor(xp / 100);
  const xpInLevel = xp % 100;
  let era = "Zero";
  if (level >= 35) era = "Forever";
  else if (level >= 20) era = "Legend";
  else if (level >= 12) era = "Hero";
  else if (level >= 7) era = "Guardian";
  else if (level >= 3) era = "Explorer";
  else if (level >= 1) era = "Awaken";
  return {
    xp,
    level,
    era,
    xpInLevel,
    xpToNextLevel: 100 - xpInLevel,
    label: `Lv.${level} · ${era}`
  };
}

function rankCandidates(candidates, mode, options = {}) {
  const personalization = options.personalization !== false;
  const hidden = new Set(options.hiddenIds || []);
  return [...candidates]
    .filter((candidate) => !hidden.has(candidate.id))
    .map((candidate) => ({
      ...candidate,
      displayScore: personalization ? candidate.scores[mode] || candidate.quality : candidate.quality,
      rankingBasis: personalization ? `Phù hợp với ${MODES[mode]?.label || mode}` : "Chất lượng/phù hợp chung"
    }))
    .sort((a, b) => b.displayScore - a.displayScore || b.quality - a.quality || a.id.localeCompare(b.id));
}

function retrievalPasses(answer) {
  const text = String(answer || "").toLowerCase();
  const groups = [
    ["mạng lưới", "người chia sẻ", "cộng đồng", "thuật toán"],
    ["thời điểm", "bối cảnh", "văn hóa", "may mắn"],
    ["nội dung", "hook", "giá trị", "remix"]
  ];
  const matchedGroups = groups.filter((group) => group.some((term) => text.includes(term))).length;
  return text.trim().length >= 80 && matchedGroups >= 2;
}

function initPrototype() {
  const state = {
    screen: "onboarding",
    mode: "create",
    personalization: true,
    cluster: "all",
    hiddenIds: new Set(),
    savedIds: new Set(),
    compareIds: [],
    arenaIds: [],
    arenaVote: null,
    selectedCandidateId: "OUT-001",
    lifetimeXp: 1280,
    awarded: new Set(),
    brewTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function announce(message) {
    const live = $("#live-status");
    if (live) live.textContent = message;
    const toast = $("#toast");
    if (toast) {
      toast.textContent = message;
      toast.hidden = false;
      window.clearTimeout(announce.timer);
      announce.timer = window.setTimeout(() => { toast.hidden = true; }, 3600);
    }
  }

  function updateLevelUI() {
    const level = calculateLevel(state.lifetimeXp);
    $("#header-level").textContent = level.label;
    $("#header-xp").textContent = `${level.xp.toLocaleString("vi-VN")} Lifetime XP`;
    $("#header-xp-bar").style.width = `${level.xpInLevel}%`;
    $("#progress-level").textContent = level.label;
    $("#progress-xp").textContent = `${level.xp.toLocaleString("vi-VN")} Lifetime XP`;
    $("#progress-xp-bar").style.width = `${level.xpInLevel}%`;
    $("#progress-next").textContent = `Còn ${level.xpToNextLevel} XP tới Lv.${level.level + 1} · Không có max level`;
  }

  function awardMockXp(key, amount, message) {
    if (state.awarded.has(key)) return false;
    state.awarded.add(key);
    state.lifetimeXp += amount;
    updateLevelUI();
    announce(`${message} Prototype cộng ${amount} XP mô phỏng.`);
    return true;
  }

  function showScreen(screen, focus = true) {
    state.screen = screen;
    const screens = {
      onboarding: "screen-onboarding",
      home: "screen-home",
      search: "screen-search",
      outputs: "screen-outputs",
      arena: "screen-arena",
      learn: "screen-learn",
      progress: "screen-progress"
    };
    Object.entries(screens).forEach(([key, id]) => {
      const element = document.getElementById(id);
      if (!element) return;
      const active = key === screen;
      element.hidden = !active;
      element.classList.toggle("active", active);
    });
    $$(".nav-item").forEach((button) => {
      const active = button.dataset.nav === screen;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const projectState = {
      onboarding: "Chưa bắt đầu",
      home: "Đang tạo input",
      search: "Đang tìm / cân nhắc Brew",
      outputs: "Đang chọn hướng học",
      arena: "Đang so sánh ẩn danh",
      learn: "Đang học trên hành trình riêng",
      progress: "Đang xem tiến bộ và bằng chứng"
    };
    $("#side-project-state").textContent = projectState[screen] || "Đang hoạt động";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (focus) {
      const heading = $(`#${screens[screen]} h1`);
      if (heading) window.setTimeout(() => heading.focus({ preventScroll: true }), 80);
    }
  }

  function setMode(mode, options = {}) {
    if (!MODES[mode]) return;
    state.mode = mode;
    $$("#mode-switch button").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$(`input[name="learning-mode"]`).forEach((input) => { input.checked = input.value === mode; });
    $("#side-mode").textContent = MODES[mode].label;
    $("#ranking-explanation").textContent = state.personalization
      ? MODES[mode].explanation
      : "Cá nhân hóa đang tắt. Ranking dùng chất lượng chung, input hiện tại và tiêu chí an toàn — không dùng footprint tích lũy.";
    renderCandidates();
    if (!options.silent) announce(`Đã chuyển sang ${MODES[mode].label}. Thứ hạng hướng học đã được tính lại.`);
  }

  function setPersonalization(on) {
    state.personalization = Boolean(on);
    $("#personalization-toggle").checked = state.personalization;
    $("#privacy-toggle").checked = state.personalization;
    $$(`input[name="personalization"]`).forEach((input) => {
      input.checked = (input.value === "on") === state.personalization;
    });
    $("#privacy-state").textContent = state.personalization ? "Đang bật" : "Đã tắt";
    $("#privacy-state").className = `status ${state.personalization ? "success" : "warning"}`;
    setMode(state.mode, { silent: true });
    announce(state.personalization
      ? "Đã bật cá nhân hóa trong prototype. Ranking sẽ dùng footprint mô phỏng trong GON."
      : "Đã tắt cá nhân hóa. Ranking chuyển sang tiêu chí chung và input hiện tại.");
  }

  function renderCandidates() {
    const ranked = rankCandidates(CANDIDATES, state.mode, {
      personalization: state.personalization,
      hiddenIds: state.hiddenIds
    });
    const visible = state.cluster === "all"
      ? ranked
      : ranked.filter((candidate) => candidate.cluster === state.cluster);
    const grid = $("#candidate-grid");
    grid.innerHTML = visible.map((candidate, index) => {
      const rank = ranked.findIndex((item) => item.id === candidate.id) + 1;
      const compared = state.compareIds.includes(candidate.id);
      const saved = state.savedIds.has(candidate.id);
      return `
        <article class="candidate-card ${rank <= 3 ? "top" : ""}" data-candidate-id="${candidate.id}">
          <div class="candidate-top">
            <span class="rank-badge">#${rank} · ${candidate.rankingBasis}: ${candidate.displayScore}</span>
            <span class="status ${candidate.sourceStatus.includes("cần") ? "warning" : "info"}">${candidate.sourceStatus}</span>
          </div>
          <h3>${candidate.title}</h3>
          <p>${candidate.summary}</p>
          <p><strong>Vì sao hiện ở đây:</strong> ${candidate.reason}</p>
          <div class="candidate-meta">
            <span class="source-label">${candidate.format}</span>
            <span class="source-label">${candidate.minutes} phút</span>
            <span class="source-label">Độ khó: ${candidate.difficulty}</span>
            <span class="source-label">Artifact: ${candidate.artifact}</span>
          </div>
          <div class="candidate-actions">
            <button class="primary-button" type="button" data-action="fork" data-id="${candidate.id}">Tạo hành trình của tôi</button>
            <button class="secondary-button" type="button" data-action="compare" data-id="${candidate.id}" aria-pressed="${compared}">${compared ? "Đã chọn so sánh" : "So sánh"}</button>
            <button class="ghost-button dark" type="button" data-action="save" data-id="${candidate.id}" aria-pressed="${saved}">${saved ? "Đã lưu" : "Lưu"}</button>
            <button class="ghost-button dark" type="button" data-action="hide" data-id="${candidate.id}">Không phù hợp</button>
          </div>
        </article>`;
    }).join("");
    $("#candidate-count").textContent = `${ranked.length} hướng${state.cluster === "all" ? "" : ` · đang thấy ${visible.length}`}`;
    $("#outputs-empty").hidden = visible.length > 0;
    updateCompareTray(ranked);
  }

  function updateCompareTray(ranked = rankCandidates(CANDIDATES, state.mode, { personalization: state.personalization, hiddenIds: state.hiddenIds })) {
    const summary = $("#compare-summary");
    const button = $("#open-arena");
    if (state.compareIds.length === 2) {
      const names = state.compareIds.map((id) => CANDIDATES.find((item) => item.id === id)?.title || id);
      summary.textContent = `Arena sẽ ẩn danh: ${names.join("  ↔  ")}`;
      button.disabled = false;
    } else {
      const top2 = ranked.slice(0, 2).map((item) => item.title).join(" ↔ ");
      summary.textContent = state.compareIds.length === 1
        ? "Đã chọn 1/2. Chọn thêm một hướng nữa để mở Arena."
        : `Mặc định Arena sẽ dùng 2 hướng dẫn đầu nếu bạn không tự chọn: ${top2}`;
      button.disabled = ranked.length < 2;
      button.textContent = state.compareIds.length === 2 ? "Mở Arena" : "Mở Arena với Top 2";
    }
    if (state.compareIds.length === 2) button.textContent = "Mở Arena";
  }

  function renderArena(ids) {
    const ranked = rankCandidates(CANDIDATES, state.mode, { personalization: state.personalization, hiddenIds: state.hiddenIds });
    const arenaIds = ids && ids.length === 2 ? ids : ranked.slice(0, 2).map((item) => item.id);
    state.arenaIds = arenaIds;
    state.arenaVote = null;
    $("#arena-result").hidden = true;
    $$("[data-vote]").forEach((button) => { button.disabled = false; });
    $("#arena-pair").innerHTML = arenaIds.map((id, index) => {
      const candidate = CANDIDATES.find((item) => item.id === id);
      if (!candidate) return "";
      return `
        <article class="arena-card" data-arena-card="${candidate.id}">
          <p class="eyebrow blind-label">Output ${index === 0 ? "A" : "B"} · danh tính đang ẩn</p>
          <h2>${candidate.summary}</h2>
          <p><strong>Định dạng:</strong> ${candidate.format}</p>
          <p><strong>Artifact đầu ra:</strong> ${candidate.artifact}</p>
          <p><strong>Thời lượng / độ khó:</strong> ${candidate.minutes} phút · ${candidate.difficulty}</p>
          <p><strong>Nguồn:</strong> ${candidate.sourceStatus}</p>
          <p class="arena-real-title" hidden><strong>Tiêu đề thật:</strong> ${candidate.title}</p>
        </article>`;
    }).join("");
  }

  function forkCandidate(candidateId, merge = false) {
    const candidate = CANDIDATES.find((item) => item.id === candidateId) || CANDIDATES[0];
    state.selectedCandidateId = candidate.id;
    $("#branch-output-title").textContent = merge ? `Hành trình hợp nhất từ ${candidate.title}` : candidate.title;
    $("#learn-title").textContent = `Hành trình: ${candidate.title}`;
    showLearnTab("concept");
    showScreen("learn");
    announce("Đã tạo hành trình riêng trong prototype. Bản gốc không bị thay đổi.");
  }

  function showLearnTab(tab) {
    $$("[data-learn-tab]").forEach((button) => {
      const active = button.dataset.learnTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$("[data-learn-page]").forEach((page) => {
      const active = page.dataset.learnPage === tab;
      page.hidden = !active;
      page.classList.toggle("active", active);
    });
    const order = ["concept", "retrieval", "transfer", "boss"];
    const current = order.indexOf(tab);
    $$(".stepper li").forEach((item, index) => {
      item.classList.toggle("current", index === current);
      item.classList.toggle("done", index < current);
    });
  }

  function setSearchState(stateKey) {
    const config = SEARCH_STATES[stateKey];
    if (!config) return;
    $$("[data-search-state]").forEach((button) => {
      const active = button.dataset.searchState === stateKey;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#search-state-kicker").textContent = config.kicker;
    $("#search-state-title").textContent = config.title;
    $("#search-state-copy").textContent = config.copy;
    const badge = $("#search-state-badge");
    badge.textContent = config.badge;
    badge.className = `status ${config.badgeClass}`;
    $("#brew-panel").hidden = !config.showBrew;
    $("#clarify-panel").hidden = stateKey !== "clarify";
    $("#blocked-panel").hidden = stateKey !== "blocked";
    $("#search-results").hidden = stateKey === "missing" || stateKey === "blocked";
  }

  function addArtifact(kind) {
    const list = $("#artifact-list");
    const item = document.createElement("li");
    const configs = {
      url: ["↗", "Liên kết website mẫu", "URL artifact · Metadata đang được trích xuất", "Đang xử lý", "info"],
      file: ["▤", "Tài liệu mẫu.pdf", "File artifact · Hash mock · Chưa OCR", "Đã đọc một phần", "warning"],
      image: ["▧", "Hình ảnh mẫu.png", "Image artifact · Chờ mô tả/OCR ở production", "Đã nhận file", "info"]
    };
    const [icon, title, detail, status, statusClass] = configs[kind];
    item.innerHTML = `<span class="artifact-icon">${icon}</span><div><strong>${title}</strong><small>${detail}</small></div><span class="status ${statusClass}">${status}</span>`;
    list.appendChild(item);
    announce(`Đã thêm ${title} vào danh sách nguồn mô phỏng.`);
  }

  function startBrew() {
    const button = $("#start-brew");
    const progress = $("#brew-progress");
    const barWrap = $("#brew-progressbar");
    const bar = barWrap.querySelector("i");
    const step = $("#brew-step");
    const ready = $("#brew-ready");
    if (state.brewTimer) return;
    button.disabled = true;
    button.textContent = "Đang Brew…";
    progress.hidden = false;
    ready.hidden = true;
    const steps = [
      [12, "1/5 · Đang kiểm tra chủ đề và quyền sử dụng nguồn…"],
      [34, "2/5 · Đang thu thập và gắn citation (mock)…"],
      [58, "3/5 · Đang dựng Canonical Module Graph (mock)…"],
      [79, "4/5 · Đang tạo quest, rubric và Boss Proof…"],
      [100, "5/5 · Hoàn tất — module ở trạng thái AI draft, riêng tư."]
    ];
    let index = 0;
    const tick = () => {
      const [value, label] = steps[index];
      bar.style.width = `${value}%`;
      barWrap.setAttribute("aria-valuenow", String(value));
      step.textContent = label;
      index += 1;
      if (index >= steps.length) {
        window.clearInterval(state.brewTimer);
        state.brewTimer = null;
        ready.hidden = false;
        button.textContent = "Đã Brew xong";
        announce("Module AI draft mô phỏng đã sẵn sàng ở trạng thái riêng tư.");
      }
    };
    tick();
    state.brewTimer = window.setInterval(tick, 650);
  }

  // Navigation
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      if (nav.dataset.nav === "arena") renderArena(state.compareIds);
      showScreen(nav.dataset.nav);
      return;
    }
    const tabTarget = event.target.closest("[data-goto-tab]");
    if (tabTarget) showLearnTab(tabTarget.dataset.gotoTab);
  });

  // Onboarding
  $("#onboarding-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const valid = $("#age-confirm").checked && $("#terms-confirm").checked;
    $("#onboarding-error").hidden = valid;
    $("#age-blocked").hidden = true;
    if (!valid) {
      announce("Chưa thể tiếp tục. Cần xác nhận 18+ và điều khoản Private Alpha.");
      return;
    }
    const selected = $(`input[name="personalization"]:checked`)?.value === "on";
    setPersonalization(selected);
    showScreen("home");
    announce("Đã vào prototype bằng đăng nhập Google mô phỏng.");
  });
  $("#age-decline").addEventListener("click", () => {
    $("#age-blocked").hidden = false;
    $("#onboarding-error").hidden = true;
    $("#age-confirm").checked = false;
  });

  // Input
  $$("input[name='learning-mode']").forEach((input) => {
    input.addEventListener("change", () => setMode(input.value));
  });
  $("#add-url-artifact").addEventListener("click", () => addArtifact("url"));
  $("#add-file-artifact").addEventListener("click", () => addArtifact("file"));
  $("#add-image-artifact").addEventListener("click", () => addArtifact("image"));
  $("#input-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const topic = $("#topic-input").value.trim();
    $("#search-topic-summary").textContent = `Chủ đề: ${topic || "chủ đề mẫu về cơ chế viral"}`;
    setSearchState("related");
    showScreen("search");
    announce("Prototype đã chuyển sang trạng thái tìm thấy nội dung liên quan một phần.");
  });

  // Search / Brew
  $$("[data-search-state]").forEach((button) => {
    button.addEventListener("click", () => setSearchState(button.dataset.searchState));
  });
  $$("[data-clarify]").forEach((button) => {
    button.addEventListener("click", () => {
      setSearchState("missing");
      announce(`Đã làm rõ mục tiêu: ${button.dataset.clarify}. GON chuyển sang đề xuất Brew.`);
    });
  });
  $("#start-brew").addEventListener("click", startBrew);

  // Outputs
  $$("#mode-switch button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  $("#personalization-toggle").addEventListener("change", (event) => setPersonalization(event.target.checked));
  $$("#cluster-filters button").forEach((button) => {
    button.addEventListener("click", () => {
      state.cluster = button.dataset.cluster;
      $$("#cluster-filters button").forEach((item) => item.classList.toggle("active", item === button));
      renderCandidates();
    });
  });
  $("#candidate-grid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "fork") forkCandidate(id);
    if (button.dataset.action === "save") {
      if (state.savedIds.has(id)) state.savedIds.delete(id); else state.savedIds.add(id);
      renderCandidates();
      announce(state.savedIds.has(id) ? "Đã lưu hướng học vào prototype." : "Đã bỏ lưu hướng học.");
    }
    if (button.dataset.action === "hide") {
      state.hiddenIds.add(id);
      state.compareIds = state.compareIds.filter((item) => item !== id);
      renderCandidates();
      announce("Đã ẩn hướng học. Production sẽ ghi nhận đây là tín hiệu 'không phù hợp', không phải đánh giá sai sự thật.");
    }
    if (button.dataset.action === "compare") {
      if (state.compareIds.includes(id)) state.compareIds = state.compareIds.filter((item) => item !== id);
      else {
        state.compareIds.push(id);
        if (state.compareIds.length > 2) state.compareIds = state.compareIds.slice(-2);
      }
      renderCandidates();
    }
  });
  $("#open-arena").addEventListener("click", () => {
    renderArena(state.compareIds.length === 2 ? state.compareIds : null);
    showScreen("arena");
  });

  // Arena
  $$("[data-vote]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.arenaVote) return;
      state.arenaVote = button.dataset.vote;
      $$("[data-vote]").forEach((item) => { item.disabled = true; });
      $$(".arena-real-title").forEach((item) => { item.hidden = false; });
      const [leftId, rightId] = state.arenaIds;
      const left = CANDIDATES.find((item) => item.id === leftId);
      const right = CANDIDATES.find((item) => item.id === rightId);
      const result = $("#arena-result");
      const copy = $("#arena-result-copy");
      let winner = left;
      let merge = false;
      if (state.arenaVote === "right") winner = right;
      if (state.arenaVote === "merge") merge = true;
      if (state.arenaVote === "tie") copy.textContent = "Bạn đánh giá hai hướng ngang nhau. GON sẽ giữ cả hai và học rằng bối cảnh/mục tiêu cụ thể quan trọng hơn một thứ hạng chung.";
      else if (state.arenaVote === "bothbad") copy.textContent = "Bạn cho rằng cả hai chưa tốt. GON sẽ giảm kiểu gợi ý này cho mục tiêu hiện tại và đề xuất xem các hướng còn lại hoặc Brew lại.";
      else if (state.arenaVote === "merge") copy.textContent = `GON sẽ tạo một hành trình hợp nhất, lấy “${left.title}” làm trục chính và phần phù hợp từ “${right.title}”.`;
      else copy.textContent = `“${winner.title}” được ưu tiên hơn cho mục tiêu hiện tại. Đây là tín hiệu phù hợp cá nhân, không phải chứng nhận đúng sai.`;
      $("#arena-result-title").textContent = state.arenaVote === "bothbad" ? "Đã ghi nhận: cả hai chưa phù hợp" : "Đã ghi nhận lựa chọn của bạn";
      $("#arena-fork").textContent = state.arenaVote === "bothbad" ? "Xem hướng khác" : "Tạo hành trình của tôi";
      $("#arena-fork").onclick = () => {
        if (state.arenaVote === "bothbad") showScreen("outputs");
        else forkCandidate(winner.id, merge);
      };
      result.hidden = false;
      announce("Vote mô phỏng đã được ghi nhận một lần và danh tính output đã được mở.");
    });
  });

  // Learn
  $$("[data-learn-tab]").forEach((button) => {
    button.addEventListener("click", () => showLearnTab(button.dataset.learnTab));
  });
  $("#retrieval-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const answer = $("#retrieval-answer").value;
    const feedback = $("#retrieval-feedback");
    const passed = retrievalPasses(answer);
    feedback.className = `feedback ${passed ? "success" : "error"}`;
    if (passed) {
      feedback.textContent = "Đạt rubric mẫu: bạn đã nêu ít nhất hai nhóm yếu tố thay vì sao chép một công thức.";
      $("#sample-answer").hidden = false;
      $("#timeline-retrieval").classList.add("done");
      $("#timeline-retrieval p").textContent = "Đã đạt rubric truy hồi mẫu.";
      awardMockXp("retrieval", 10, "Retrieval đạt rubric mẫu.");
    } else {
      feedback.textContent = "Chưa đạt: hãy viết ít nhất 80 ký tự và nêu hai nhóm yếu tố, ví dụ mạng lưới/cộng đồng cùng thời điểm/bối cảnh.";
    }
  });
  $("#transfer-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const answer = $("#transfer-answer").value.trim();
    const feedback = $("#transfer-feedback");
    const passed = answer.length >= 90;
    feedback.className = `feedback ${passed ? "success" : "error"}`;
    if (passed) {
      feedback.textContent = "Đã lưu Branch Commit mẫu: bạn đã chuyển nguyên lý sang một tình huống mới.";
      $("#timeline-transfer").classList.add("done");
      $("#timeline-transfer p").textContent = "Đã áp dụng vào tình huống/ngách mới.";
      $("#mastery-apply").classList.add("done");
      $("#progress-mastery").textContent = "Apply";
      awardMockXp("transfer", 15, "Transfer đã được ghi nhận.");
    } else {
      feedback.textContent = "Chưa đủ chi tiết: hãy nêu ngách, hook, cộng đồng chia sẻ đầu tiên và giá trị học thật (ít nhất 90 ký tự trong prototype).";
    }
  });
  $("#boss-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#boss-title").value.trim();
    const description = $("#boss-description").value.trim();
    const allChecks = $$(".boss-check").every((item) => item.checked);
    const feedback = $("#boss-feedback");
    const passed = title.length >= 8 && description.length >= 90 && allChecks;
    feedback.className = `feedback ${passed ? "success" : "error"}`;
    if (!passed) {
      feedback.textContent = "Cần sửa rồi nộp lại: tên artifact rõ, mô tả ít nhất 90 ký tự và đủ bốn mục rubric. Chưa có XP cốt lõi hay Proof ở bước này.";
      return;
    }
    feedback.textContent = "Boss Proof đạt rubric mẫu. Production sẽ kiểm tra tính toàn vẹn và ghi XP từ server.";
    $("#boss-success").hidden = false;
    $("#timeline-boss").classList.add("done");
    $("#timeline-boss p").textContent = `Artifact “${title}” đạt rubric mẫu.`;
    $("#mastery-create").classList.add("done");
    $("#progress-mastery").textContent = "Create";
    $("#latest-proof-level").textContent = "System-recorded · Boss Proof";
    $("#latest-proof-copy").textContent = `“${title}” được liên kết với Journey Branch và rubric mẫu.`;
    $("#system-proof").hidden = false;
    awardMockXp("boss", 35, "Boss Proof đạt rubric mẫu.");
  });

  // Privacy and report
  $("#privacy-toggle").addEventListener("change", (event) => setPersonalization(event.target.checked));
  $("#delete-footprint").addEventListener("click", () => {
    $("#delete-status").textContent = "Prototype đã ghi yêu cầu xóa. Production phải xác nhận phạm vi, thời hạn xử lý và phần dữ liệu pháp lý nếu có.";
    setPersonalization(false);
  });
  const dialog = $("#report-dialog");
  $("#open-report").addEventListener("click", () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else announce("Trình duyệt hiện tại không hỗ trợ dialog. Production cần fallback có thể truy cập.");
  });
  $("#submit-report").addEventListener("click", () => announce("Báo cáo mô phỏng đã được tiếp nhận cùng module/output version."));

  // Initial render
  updateLevelUI();
  setMode("create", { silent: true });
  renderArena(null);
  setSearchState("related");
  showScreen("onboarding", false);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPrototype);
  else initPrototype();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CANDIDATES,
    MODES,
    SEARCH_STATES,
    calculateLevel,
    rankCandidates,
    retrievalPasses
  };
}
