"use strict";
/* E2E smoke test cho GON standalone FE demo v2 — TikTok-style (jsdom, không network).
 * Chạy:  mkdir /tmp/gontest && cd /tmp/gontest && npm init -y && npm i jsdom fake-indexeddb
 *        node apps/gon-web/ux-prototype/standalone/tests/e2e.js
 * Kết quả kỳ vọng: tất cả PASS (toàn bộ F1–F14).
 * Lưu trữ: demo dùng IndexedDB — test inject fake-indexeddb vào window trước khi script chạy. */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let fakeIndexedDB = null, fakeIDBKeyRange = null;
try {
  const f = require("fake-indexeddb");
  fakeIndexedDB = f.indexedDB || f;
  fakeIDBKeyRange = f.IDBKeyRange || null;
} catch (e) { /* thiếu fake-indexeddb → demo tự fallback localStorage */ }
const dom = new JSDOM(html, {
  url: "http://localhost:4173/", runScripts: "dangerously", pretendToBeVisual: true,
  beforeParse(w) {
    if (fakeIndexedDB) {
      w.indexedDB = fakeIndexedDB;
      if (fakeIDBKeyRange) w.IDBKeyRange = fakeIDBKeyRange;
    }
  },
});
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name); }
}
function text() { return document.getElementById("view").textContent || ""; }
function click(el) { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); }
async function clk(el) { click(el); await sleep(70); }
function q(sel) { return document.querySelector(sel); }
let LAST_HASH = window.location.hash;
setInterval(() => {
  if (window.location.hash !== LAST_HASH) {
    LAST_HASH = window.location.hash;
    window.dispatchEvent(new window.HashChangeEvent("hashchange"));
  }
}, 10);
async function goHash(h) {
  window.location.hash = h;
  window.dispatchEvent(new window.HashChangeEvent("hashchange"));
  await sleep(50);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms) {
  const end = Date.now() + (ms || 2500);
  while (Date.now() < end) { if (cond()) return true; await sleep(25); }
  return !!cond();
}
function readState(win) {
  win = win || window;
  return new Promise((resolve) => {
    if (!win.indexedDB) { resolve(null); return; }
    const req = win.indexedDB.open("gon-standalone-fe-demo-v2", 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore("state"); } catch (e) {} };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const rq = db.transaction("state", "readonly").objectStore("state").get("main");
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    };
    req.onerror = () => resolve(null);
  });
}

(async () => {
  console.log("== Boot (IndexedDB async) ==");
  ok(await waitFor(() => {
    const v = document.getElementById("view");
    return v && v.textContent && v.textContent.includes("GON");
  }), "app boots: state loaded from IndexedDB, first render done");
  ok(!!window.indexedDB, "IndexedDB injected (fake-indexeddb)");
  ok(text().includes("GON"), "S01 login renders");
  ok(text().includes("Bắt đầu với ẩn danh"), "anonymous button present");
  ok(!document.querySelector(".checkline"), "no consent checkboxes (18+ gate removed)");
  ok(text().includes("Tiếp tục với Google"), "Google option present");

  console.log("== Boot: login guard ==");
  await goHash("#/feed");
  ok(text().includes("Bắt đầu với ẩn danh"), "not-logged-in: any route redirects to login");
  ok(document.getElementById("sidebar").style.display === "none", "sidebar hidden on login");
  ok(!document.getElementById("topsearch").classList.contains("on"), "top search hidden on login");
  ok(!document.getElementById("feedtabs").classList.contains("on"), "feed tabs hidden on login");

  console.log("== F1: anonymous login ==");
  click(q('[data-act="anon-help"]'));
  ok(document.getElementById("modal-overlay").classList.contains("show"), "anonymous help modal opens");
  window.closeModal();
  await clk(q('[data-act="anon-login"]'));
  ok(window.location.hash === "#/feed", "anon login → #/feed");
  ok(document.querySelectorAll(".fcard").length >= 6, "feed has >=6 topic cards");
  ok(text().includes("điểm xu hướng"), "trend score shown on cards");
  const st0 = await readState();
  ok(st0 && /^u-/.test(st0.account.uuid), "anonymous UUID profile created in IndexedDB: " + (st0 ? st0.account.uuid : "null"));
  ok(window.localStorage.getItem("gon-standalone-fe-demo-v2") === null, "state persisted in IndexedDB, not localStorage");

  console.log("== Layout: left sidebar + top search bar (TikTok desktop) ==");
  ok(document.getElementById("sidebar").style.display !== "none", "left sidebar visible after login");
  ok(document.getElementById("sidebar").textContent.includes("Bảng tin"), "sidebar nav items present");
  ok(document.querySelectorAll(".sb-item").length === 7, "sidebar has 7 menu items (Brew & Arena merged, Leaderboard added)");
  ok(!document.getElementById("sb-brew") && !document.getElementById("sb-arena"), "no separate Brew/Arena nav items");
  ok(!!document.getElementById("sb-leaderboard"), "Leaderboard menu item present");
  ok(!!(document.getElementById("sb-leaderboard").compareDocumentPosition(document.getElementById("sb-profile")) & window.Node.DOCUMENT_POSITION_FOLLOWING), "Leaderboard sits above Hồ sơ in the menu");
  ok(document.getElementById("sb-hot").children.length >= 3, "sidebar suggested topics rendered");
  ok(document.getElementById("feedtabs").classList.contains("on"), "Hot/For-You tabs shown at top on feed");
  ok(q("#feedtabs .ftab.active").getAttribute("data-t") === "hot", "feed tab defaults to Hot");
  ok(!!(document.getElementById("feedtabs").compareDocumentPosition(document.getElementById("topsearch")) & window.Node.DOCUMENT_POSITION_FOLLOWING), "feed tabs render ABOVE the top search bar");
  ok(document.getElementById("topsearch").classList.contains("on"), "top search bar shown on feed");
  document.getElementById("topsearch-input").value = "tư duy phản biện";
  await clk(q('[data-act="topsearch"]'));
  ok(window.location.hash === "#/discover", "top search navigates to discover");
  ok(!document.getElementById("topsearch").classList.contains("on"), "top search hidden on Discover (redundant there)");
  ok(!document.getElementById("feedtabs").classList.contains("on"), "feed tabs hidden off feed");
  ok(text().includes("Tìm thấy module khớp"), "top search runs verdict FOUND");
  ok(document.getElementById("uni-input").value === "tư duy phản biện", "query carried from top search bar into Discover input (sync)");
  document.getElementById("topsearch-input").value = "chủ đề mới lạ";
  document.getElementById("topsearch-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(80);
  ok(text().includes("Chưa ai Brew chủ đề này"), "Enter key in top search works");
  ok(document.getElementById("uni-input").value === "chủ đề mới lạ", "Discover input synced with last query");
  const hotTopic = q(".sb-hot-item").getAttribute("data-topic");
  await clk(q(".sb-hot-item"));
  ok(window.location.hash === "#/discover", "sidebar suggested topic navigates to discover");
  ok(document.getElementById("uni-input").value === hotTopic, "suggested topic prefills Discover search (data carried over)");
  await clk(document.getElementById("sb-feed"));
  ok(window.location.hash === "#/feed", "sidebar nav back to feed");
  ok(document.getElementById("topsearch-input").value === hotTopic, "top search bar synced with last query (both ways)");
  ok(document.querySelector(".sb-item.active").id === "sb-feed", "sidebar active state syncs");

  console.log("== F2: feed interactions (like/comment/share) ==");
  await clk(q('[data-act="like"][data-card="c2"]'));
  ok(q('[data-act="like"][data-card="c2"]').classList.contains("liked"), "like toggles on");
  click(q('[data-act="comment"][data-card="c2"]'));
  ok(document.getElementById("sheet-overlay").classList.contains("show"), "comment sheet opens");
  document.getElementById("comment-input").value = "Topic hay, học ngay!";
  await clk(q('[data-act="comment-send"][data-card="c2"]'));
  ok(!document.getElementById("sheet-overlay").classList.contains("show"), "comment sends & sheet closes");
  click(q('[data-act="share"][data-card="c2"]'));
  ok(document.getElementById("modal-overlay").classList.contains("show"), "share modal opens");
  window.closeModal();
  await clk(q('[data-act="feedtab"][data-t="you"]'));
  ok(q('[data-act="feedtab"][data-t="you"]').classList.contains("active"), "For You tab switches");

  console.log("== F3: discover → found ==");
  await clk(q('[data-nav="discover"]'));
  document.getElementById("uni-input").value = "tư duy phản biện";
  await clk(q('[data-act="uni-search"]'));
  ok(text().includes("Tìm thấy module khớp"), "verdict FOUND");
  ok(text().includes("12 tổ hợp Persona × Độ sâu"), "all persona×depth combos rendered");
  ok(document.querySelectorAll(".out-item").length === 12, "12 combo outputs in feed");
  ok(!document.querySelector(".persona-tab"), "no persona selector — runs all combos by default");
  ok(["PhD / Nghiên cứu","KOL / Sáng tạo","Giải trí","Nâng cao"].every((t) => text().includes(t)), "all 4 personas present");
  ok(["Nhẹ","Vừa","Sâu"].every((t) => text().includes(t)), "all 3 depths present");
  ok(text().includes("Arena — chọn output hay hơn"), "arena embedded in Discover (merged)");
  click(q('[data-act="attach"][data-type="youtube"]'));
  ok(document.getElementById("attached-list").textContent.includes("YouTube"), "attachment chip renders");

  console.log("== F4: weak search → Brew → output becomes topic ==");
  document.getElementById("uni-input").value = "triết lý tục ngữ Việt Nam";
  await clk(q('[data-act="uni-search"]'));
  ok(text().includes("Chưa ai Brew chủ đề này"), "verdict MISSING");
  await clk(q('[data-act="go-brew"]'));
  ok(window.location.hash === "#/discover", "brew runs INLINE in Discover (no separate screen)");
  ok(text().includes("Brew ngay trong Khám phá"), "inline brew pipeline visible");
  await sleep(4800);
  ok(text().includes("Module sẵn sàng"), "inline brew pipeline completes");
  ok(document.querySelectorAll(".out-item").length === 12, "12 combos generated after brew");
  await clk(q('[data-nav="feed"]'));
  const myCard = q(".fcard[data-card^=\"b\"] .fc-mine");
  ok(myCard !== null, "brewed output appears in feed as topic card");
  ok(text().includes("OUTPUT CỦA BẠN"), "own output marked in feed");

  console.log("== F5: module → learn + checkpoint ==");
  await clk(q('[data-nav="discover"]'));
  document.getElementById("uni-input").value = "tư duy phản biện";
  await clk(q('[data-act="uni-search"]'));
  await clk(q('[data-nav="module"]'));
  ok(text().includes("Các mục học"), "S05 module renders");
  await clk(q('[data-act="learn-sec"][data-sec="0"]'));
  ok(text().includes("Checkpoint hiểu thật"), "checkpoint renders");
  const ta = document.getElementById("check-input");
  ta.dispatchEvent(new window.Event("paste", { bubbles: true }));
  ta.value = "Lập luận yếu vì chỉ dựa vào uy tín người nói chứ không đưa bằng chứng; cần tách kết luận, kiểm chứng tiền đề và cân nhắc phương án khác.";
  ta.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(q('[data-act="check-submit"]'));
  ok(document.getElementById("paste-warn").classList.contains("show"), "paste detected & rejected");
  delete ta.dataset.pasted;
  document.getElementById("paste-warn").classList.remove("show");
  click(q('[data-act="check-submit"]'));
  await sleep(40);
  ok(document.getElementById("check-ok").classList.contains("show"), "valid answer passes");

  console.log("== F6: formats ==");
  await goHash("#/module");
  await clk(q('[data-act="view-format"][data-fmt="infographic"]'));
  ok(window.location.hash === "#/output" && text().includes("Tách kết luận"), "infographic renders");
  await clk(q('[data-act="view-format"][data-fmt="video"]'));
  ok(q("#video-mock") !== null, "video renders");
  await clk(q('[data-act="view-format"][data-fmt="image"]'));
  ok(text().includes("Số liệu thiếu nguồn"), "image grid renders");

  console.log("== F7: game ==");
  await goHash("#/game");
  ok(window.location.hash === "#/game", "S08 game renders");
  await clk(q('[data-act="gd-blueprint"]'));
  ok(document.getElementById("sheet-overlay").classList.contains("show"), "GDevelop blueprint sheet opens");
  const bpText = document.getElementById("sheet-body").textContent;
  ok(bpText.includes("GON Game Blueprint") && bpText.includes("GDJS Runtime"), "blueprint pipeline described (params, not game code)");
  const bpJson = JSON.parse(document.querySelector("#sheet-body pre").textContent);
  ok(bpJson.blueprint === "quiz-3" && bpJson.passThreshold === 2 && bpJson.questions.length === 3, "typed payload valid (quiz-3, threshold, 3 questions)");
  ok(bpJson.engine.includes("GDevelop"), "engine attribution present (MIT)");
  window.closeSheet();
  ok(!document.getElementById("sheet-overlay").classList.contains("show"), "blueprint sheet closes");
  const correct = [1, 2, 1];
  for (let i = 0; i < 3; i++) {
    const radio = q('input[name="gq' + i + '"][value="' + correct[i] + '"]');
    radio.checked = true;
    radio.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  click(q('[data-act="game-submit"]'));
  await sleep(60);
  ok(text().includes("3/3 đúng"), "game scores 3/3");

  console.log("== F8: fork from own output card ==");
  await goHash("#/feed");
  const forkBtn = q('.fcard[data-card^="b"] [data-act="fork-card"]');
  await clk(forkBtn);
  ok((await readState()).forks.length >= 1, "fork recorded (IndexedDB)");

  console.log("== F9: arena (merged into Discover) + persona reveal ==");
  await goHash("#/arena");
  await sleep(80);
  ok(window.location.hash === "#/discover", "#/arena redirects to Discover (merged)");
  ok(text().includes("VS"), "arena renders inside Discover");
  ok(document.querySelectorAll('#arena-inline [data-act="vote"]').length === 4, "4 vote options: A · B · Hoà · Cả hai chưa đạt (arena.ai style)");
  await clk(q('[data-act="vote"][data-choice="a"]'));
  ok(text().includes("Kết quả cộng đồng"), "vote reveals community");
  ok(text().includes("Model A — Gemini qua Google ADK"), "label revealed after vote");
  ok(text().includes("Elo +8") && text().includes("Elo -5"), "Elo deltas shown after vote (+8 / -5)");
  await clk(q('[data-act="arena-next"]'));
  ok(text().includes("cặp 2/3"), "next battle loaded (pair 2/3)");
  ok(document.querySelectorAll('#arena-inline [data-act="vote"]').length === 4, "fresh pair is unvoted (4 options back)");
  await clk(q('[data-act="vote"][data-choice="tie"]'));
  ok(text().includes("Kết quả cộng đồng"), "tie vote reveals community");
  ok(text().includes("Elo +1"), "tie gives small Elo to both sides");
  await clk(q('[data-act="arena-next"]'));
  await clk(q('[data-act="vote"][data-choice="bothbad"]'));
  ok(text().includes("Kết quả cộng đồng"), "'both bad' vote recorded");
  ok(text().includes("Elo -4"), "both-bad drops both sides");
  await clk(q('[data-act="arena-next"]'));
  ok(text().includes("Model A — Gemini qua Google ADK"), "cycled back to pair 1 (already voted, labels shown)");
  await clk(q('[data-act="arena-embed-toggle"]'));
  const embedFrame = q("#arena-embed-frame");
  ok(embedFrame !== null, "embed mode: same-origin iframe mounts");
  ok(embedFrame.getAttribute("src") === "arena-embed.html?embed=1", "iframe src = arena-embed.html?embed=1 (Gradio-style embed param)");
  ok(text().includes("Embed thật cùng origin"), "embed explainer shown (postMessage, no arena.ai hotlink)");
  await clk(q('[data-act="arena-embed-toggle"]'));
  ok(q("#arena-embed-frame") === null && text().includes("VS"), "toggle back to inline battle");
  const pickBtn = q('[data-act="pick-output"]');
  const pickOid = pickBtn.getAttribute("data-o");
  await clk(pickBtn);
  ok(q('[data-act="pick-output"][data-o="' + pickOid + '"]') === null, "picked output marked chosen (persona reveal)");
  const kolBtn = q('[data-act="pick-output"][data-p="kol"]');
  if (kolBtn) await clk(kolBtn);
  ok((await readState()).picks.length >= 2, "persona picks recorded in IndexedDB (>=2)");

  console.log("== F10: own output trending >=40 ==");
  await goHash("#/feed");
  // một lượt tương tác đầy đủ: like + comment + share + học
  await clk(q('.fcard[data-card="b0"] [data-act="like"]'));
  click(q('.fcard[data-card="b0"] [data-act="comment"]'));
  document.getElementById("comment-input").value = "Output của mình, học lại!";
  await clk(q('[data-act="comment-send"][data-card="b0"]'));
  click(q('.fcard[data-card="b0"] [data-act="share"]'));
  window.closeModal();
  await clk(q('.fcard[data-card="b0"] [data-act="card-learn"]'));
  ok(window.location.hash === "#/module", "learning own output boosts trend");
  const st = await readState();
  ok(st.brewed[0].trend >= 40, "own output trend >= 40 in IndexedDB (got " + st.brewed[0].trend + ")");

  console.log("== F13: Remix (persona reveal) + gated Love ==");
  await goHash("#/feed");
  await clk(q('.fcard[data-card="c1"] [data-act="remix"]'));
  ok(document.getElementById("sheet-overlay").classList.contains("show"), "remix sheet opens with all combos");
  ok(document.querySelectorAll('[data-act="remix-pick"]').length === 12, "all 12 persona×depth combos offered (no pre-selection)");
  await clk(q('[data-act="remix-pick"][data-p="kol"][data-d="mid"]'));
  ok(!document.getElementById("sheet-overlay").classList.contains("show"), "remix pick closes the sheet");
  const stR = await readState();
  ok(stR.remixes.length >= 1 && stR.remixes[0].persona === "kol", "remix recorded with chosen persona (kol)");
  ok(stR.picks.length >= 3, "remix pick counts as persona reveal (footprint)");
  ok(q('.fcard[data-card^="r"]') !== null, "remixed output appears in feed as own card");
  ok(q('.fcard[data-card^="r"]').textContent.includes("Remix từ"), "remix lineage attribution shown");
  ok(q('.fcard[data-card="c1"]').textContent.includes("93"), "original output trend boosted by remix (+6)");
  const loveLocked = q('.fcard[data-card="c1"] [data-act="love"]');
  ok(loveLocked.classList.contains("locked"), "Love locked before checkpoint (gated reaction)");
  await clk(loveLocked);
  ok(!(await readState()).loves["c1"], "locked love does nothing (anti fake reaction)");
  await clk(q('.fcard[data-card="c1"] [data-act="card-learn"]'));
  ok(window.location.hash === "#/module", "card-learn opens the module");
  await clk(q('[data-act="learn-sec"][data-sec="0"]'));
  ok(text().includes("Checkpoint hiểu thật"), "checkpoint renders");
  const ta2 = document.getElementById("check-input");
  ta2.value = "Lập luận này yếu vì chỉ dựa vào uy tín người nói; cần tách kết luận, kiểm chứng từng tiền đề bằng bằng chứng độc lập và cân nhắc phương án giải thích khác trước khi kết luận.";
  ta2.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(q('[data-act="check-submit"]'));
  await sleep(40);
  ok(document.getElementById("check-ok").classList.contains("show"), "checkpoint passed for this card");
  await goHash("#/feed");
  const loveOpen2 = q('.fcard[data-card="c1"] [data-act="love"]');
  ok(!loveOpen2.classList.contains("locked"), "Love unlocked after passing the card's checkpoint");
  await clk(loveOpen2);
  ok(!!(await readState()).loves["c1"], "gated Love recorded after genuine learning");

  console.log("== F14: Journey Agent (Agent Mode — 1 lệnh, trọn hành trình) ==");
  await goHash("#/discover");
  ok(text().includes("Journey Agent — 1 lệnh, trọn hành trình"), "agent block present in Discover (Agent Mode)");
  ok(["Confirmed success","Praise vs complaint","Steerability","Recovery","Honesty"].every((t) => text().includes(t)), "5 Agent Arena signals mapped to GON features");
  document.getElementById("uni-input").value = "chủ đề mới lạ";
  await clk(q('[data-act="uni-search"]'));
  await clk(q('[data-act="agent-run"]'));
  ok(text().includes("orchestrator ẩn danh"), "orchestrator blinded during the run (arena.ai principle)");
  ok(document.querySelectorAll("#agent-inline .pipe-step").length === 7, "7 pipeline steps (plan → … → grant_xp)");
  ok(text().includes("tool: plan"), "tool-call tags shown per step (agent trace)");
  await sleep(7000);
  ok(text().includes("Hành trình hoàn tất"), "journey completes autonomously (1 command)");
  ok(/Orchestrator: ADK · (gemini|fast|brew-first)-orchestrator/.test(text()), "orchestrator revealed only after completion");
  ok(text().includes("tín hiệu recovery"), "weak query → Brew flagged as recovery signal");
  const stA = await readState();
  ok(stA.agentJourneys.length === 1, "journey recorded in IndexedDB");
  ok(stA.agentJourneys[0].recovered === true && /ADK · /.test(stA.agentJourneys[0].orch), "journey entry has orchestrator + recovery flag");
  ok(stA.xpLedger.some((e) => e.reason.includes("Journey Agent hoàn tất hành trình")), "+25 XP for completed agent journey");
  await clk(q('[data-act="agent-confirm"][data-v="ok"]'));
  ok(text().includes("đã xác nhận (Confirmed success)"), "confirm-success feedback recorded in UI");
  ok((await readState()).agentJourneys[0].confirmed === true, "confirmed success persisted (IndexedDB)");

  console.log("== F11: POAP + privacy ==");
  await goHash("#/proof");
  ok(text().includes("Dòng thời gian"), "POAP timeline renders");
  ok(text().includes("Brew topic: triết lý tục ngữ Việt Nam"), "brew in timeline");
  ok(text().includes("Chọn output:"), "persona picks in POAP timeline");
  ok(text().includes("Remix:"), "remix events in POAP timeline");
  ok(text().includes("Đã hiểu thật:"), "gated-love events in POAP timeline");
  ok(text().includes("Journey Agent:"), "agent journeys in POAP timeline");
  ok(document.querySelectorAll(".badge.unlocked").length >= 6, "badges unlocked (" + document.querySelectorAll(".badge.unlocked").length + ")");
  await goHash("#/profile");
  ok(text().includes("Tài khoản ẩn danh"), "profile shows anonymous identity");
  ok(text().includes("Dấu chân đẳng cấp"), "profile shows level footprint card");
  ok(/PhD \/ Nghiên cứu|KOL \/ Sáng tạo/.test(text()), "footprint shows revealed persona");
  ok(text().includes("Xuất dữ liệu"), "privacy actions render");
  const ck = document.getElementById("ck-personalization");
  ck.checked = false;
  ck.dispatchEvent(new window.Event("change", { bubbles: true }));
  await goHash("#/journey");
  ok(text().includes("floor(LifetimeXP/100)"), "level formula uncapped displayed");
  ok(text().includes("Dấu chân đẳng cấp"), "journey shows level footprint");
  const hdr = text();
  ok(/Lv\.\d+/.test(hdr), "journey shows level");

  console.log("== F12: leaderboard (arena.ai-style) ==");
  await clk(document.getElementById("sb-leaderboard"));
  ok(window.location.hash === "#/leaderboard", "sidebar opens #/leaderboard");
  ok(text().includes("Model sinh output"), "model leaderboard tab renders");
  ok(document.querySelectorAll(".lb-row").length >= 10, ">=10 model rows ranked by Elo");
  ok(text().includes("🥇") && text().includes("🥈") && text().includes("🥉"), "top-3 medals shown");
  ok(text().includes("đang đấu trong Khám phá"), "Arena combatants listed (community-ranked)");
  ok(text().includes("vote của bạn"), "user's Arena vote reflected on the leaderboard");
  ok(text().includes("Xếp hạng theo persona"), "persona category board (arena.ai-style)");
  ok(/↑\d|↓\d/.test(text()), "rank movement arrows shown");
  const lbAll = document.querySelectorAll(".lb-row").length;
  await clk(q('[data-act="lb-fmt"][data-f="video"]'));
  const lbVid = document.querySelectorAll(".lb-row").length;
  ok(lbVid < lbAll && lbVid >= 1, "format category filter narrows the board (" + lbAll + " → " + lbVid + ")");
  await clk(q('[data-act="lb-fmt"][data-f="all"]'));
  await clk(q('[data-act="lb-tab"][data-t="learner"]'));
  ok(text().includes("Người học") && text().includes("👉 BẠN"), "learner tab: current user highlighted");
  ok(/Lv\.\d+/.test(text()), "learner rows show uncapped levels");
  await clk(q('[data-act="lb-tab"][data-t="agent"]'));
  ok(text().includes("Net Improvement"), "agent tab: Net Improvement board (causal, randomized orchestrator)");
  ok(document.querySelectorAll("#lb-agent-rows tbody tr").length === 3, "3 orchestrators ranked by Net Improvement");
  ok(text().includes("phiên của bạn"), "own session orchestrator highlighted on agent board");
  ok(text().includes("×0.5"), "recovery half-weight explained (bash-recovery analog)");

  console.log("== S14: map ==");
  const stx = await readState();
  const undone = [];
  if (!stx.started) undone.push("F1");
  if (!(Object.keys(stx.likes).length>0 || Object.keys(stx.comments).length>0)) undone.push("F2");
  if (!stx.searches.some((x)=>x.endsWith("|found"))) undone.push("F3");
  if (!(stx.brewed.length>0)) undone.push("F4");
  if (!(stx.checks.length>0)) undone.push("F5");
  if (!(stx.formatsViewed.length>=3)) undone.push("F6");
  if (!(stx.gameBest!==null && stx.gameBest>=2)) undone.push("F7");
  if (!(stx.forks.length>0)) undone.push("F8");
  if (!(stx.votes.length>0)) undone.push("F9");
  if (!stx.brewed.some((b)=>b.trend>=40)) undone.push("F10");
  if (stx.visited.indexOf("profile")===-1) undone.push("F11");
  if (stx.visited.indexOf("leaderboard")===-1) undone.push("F12");
  if (!(stx.remixes && stx.remixes.length>0)) undone.push("F13");
  if (!(stx.agentJourneys && stx.agentJourneys.length>0)) undone.push("F14");
  console.log("  (debug) undone flows:", undone.join(",") || "none");
  await goHash("#/map");
  const doneFlows = Array.from(document.querySelectorAll(".flow-item .tag.ok")).length;
  ok(doneFlows === 14, "flows done on map (got " + doneFlows + "/14)");
  ok(text().includes("15 màn hình"), "screen checklist renders (15 screens)");

  console.log("== no 18+ remnants (UI text only) ==");
  const ui = document.getElementById("view").textContent + " " + (document.querySelector(".demo-banner") || {textContent:""}).textContent + " " + (document.getElementById("tabbar").textContent);
  ok(!ui.includes("18+") && !ui.includes("đủ 18 tuổi"), "no 18+ gate text in UI");

  console.log("== Arena embed page (arena-embed.html?embed=1) ==");
  const embedHtml = fs.readFileSync(path.join(__dirname, "..", "arena-embed.html"), "utf8");
  const domE = new JSDOM(embedHtml, { url: "http://localhost:4173/arena-embed.html?embed=1", runScripts: "dangerously", pretendToBeVisual: true });
  const dE = domE.window.document;
  ok(await waitFor(() => dE.body && dE.body.textContent.includes("VS")), "embed page boots standalone");
  ok(dE.body.textContent.includes("embed mode · cùng origin"), "?embed=1 activates embed mode");
  ok(dE.querySelectorAll("[data-v]").length === 5, "4 vote options + next in embed page");
  dE.querySelector('[data-v="a"]').dispatchEvent(new domE.window.MouseEvent("click", { bubbles: true }));
  await sleep(60);
  ok(dE.body.textContent.includes("Kết quả cộng đồng") === false && dE.body.textContent.includes("lựa chọn của bạn"), "vote registers in embed page");
  ok(dE.body.textContent.includes("Elo +8") && dE.body.textContent.includes("Elo -5"), "Elo deltas shown in embed page");
  dE.querySelector('[data-v="next"]').dispatchEvent(new domE.window.MouseEvent("click", { bubbles: true }));
  await sleep(60);
  ok(dE.body.textContent.includes("cặp 2/3"), "next battle cycles in embed page");

  console.log("== IndexedDB persistence across reload ==");
  const dom2 = new JSDOM(html, {
    url: "http://localhost:4173/", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      if (fakeIndexedDB) {
        w.indexedDB = fakeIndexedDB;
        if (fakeIDBKeyRange) w.IDBKeyRange = fakeIDBKeyRange;
      }
    },
  });
  const doc2 = dom2.window.document;
  ok(await waitFor(() => {
    const v = doc2.getElementById("view");
    return v && v.textContent && v.textContent.includes("Tiếp tục với tiến trình đã có");
  }, 2500), "after reload: progress restored from IndexedDB (resume button shows)");
  const st2 = await readState(dom2.window);
  ok(st2 && st2.started === true && st2.brewed.length > 0, "reloaded state intact from IndexedDB (started + brewed)");

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
