"use strict";
/* E2E smoke test cho GON standalone FE demo v2 — TikTok-style (jsdom, không network).
 * Chạy:  mkdir /tmp/gontest && cd /tmp/gontest && npm init -y && npm i jsdom fake-indexeddb
 *        node apps/gon-web/ux-prototype/standalone/tests/e2e.js
 * Kết quả kỳ vọng: tất cả PASS (toàn bộ F1–F11).
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
  ok(document.querySelectorAll(".sb-item").length === 6, "sidebar has 6 menu items (Brew & Arena merged into Discover)");
  ok(!document.getElementById("sb-brew") && !document.getElementById("sb-arena"), "no separate Brew/Arena nav items");
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
  await clk(q('[data-act="vote"][data-choice="a"]'));
  ok(text().includes("Kết quả cộng đồng"), "vote reveals community");
  ok(text().includes("Model A — Gemini qua Google ADK"), "label revealed after vote");
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

  console.log("== F11: POAP + privacy ==");
  await goHash("#/proof");
  ok(text().includes("Dòng thời gian"), "POAP timeline renders");
  ok(text().includes("Brew topic: triết lý tục ngữ Việt Nam"), "brew in timeline");
  ok(text().includes("Chọn output:"), "persona picks in POAP timeline");
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
  console.log("  (debug) undone flows:", undone.join(",") || "none");
  await goHash("#/map");
  const doneFlows = Array.from(document.querySelectorAll(".flow-item .tag.ok")).length;
  ok(doneFlows === 11, "flows done on map (got " + doneFlows + "/11)");
  ok(text().includes("14 màn hình"), "screen checklist renders");

  console.log("== no 18+ remnants (UI text only) ==");
  const ui = document.getElementById("view").textContent + " " + (document.querySelector(".demo-banner") || {textContent:""}).textContent + " " + (document.getElementById("tabbar").textContent);
  ok(!ui.includes("18+") && !ui.includes("đủ 18 tuổi"), "no 18+ gate text in UI");

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
