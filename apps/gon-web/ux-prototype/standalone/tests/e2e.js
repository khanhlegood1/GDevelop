"use strict";
/* E2E smoke test cho GON standalone FE demo v2 — TikTok-style (jsdom, không network).
 * Chạy:  mkdir /tmp/gontest && cd /tmp/gontest && npm init -y && npm i jsdom
 *        node apps/gon-web/ux-prototype/standalone/tests/e2e.js
 * Kết quả kỳ vọng: tất cả PASS (toàn bộ F1–F11). */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const dom = new JSDOM(html, { url: "http://localhost:4173/", runScripts: "dangerously", pretendToBeVisual: true });
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

(async () => {
  console.log("== Boot ==");
  ok(text().includes("GON"), "S01 login renders");
  ok(text().includes("Bắt đầu với ẩn danh"), "anonymous button present");
  ok(!document.querySelector(".checkline"), "no consent checkboxes (18+ gate removed)");
  ok(text().includes("Tiếp tục với Google"), "Google option present");

  console.log("== Boot: login guard ==");
  await goHash("#/feed");
  ok(text().includes("Bắt đầu với ẩn danh"), "not-logged-in: any route redirects to login");
  ok(document.getElementById("sidebar").style.display === "none", "sidebar hidden on login");
  ok(!document.getElementById("topsearch").classList.contains("on"), "top search hidden on login");

  console.log("== F1: anonymous login ==");
  click(q('[data-act="anon-help"]'));
  ok(document.getElementById("modal-overlay").classList.contains("show"), "anonymous help modal opens");
  window.closeModal();
  await clk(q('[data-act="anon-login"]'));
  ok(window.location.hash === "#/feed", "anon login → #/feed");
  ok(document.querySelectorAll(".fcard").length >= 6, "feed has >=6 topic cards");
  ok(text().includes("điểm xu hướng"), "trend score shown on cards");
  const uuid = JSON.parse(window.localStorage.getItem("gon-standalone-fe-demo-v2")).account.uuid;
  ok(/^u-/.test(uuid), "anonymous UUID profile created: " + uuid);

  console.log("== Layout: left sidebar + top search bar (TikTok desktop) ==");
  ok(document.getElementById("sidebar").style.display !== "none", "left sidebar visible after login");
  ok(document.getElementById("sidebar").textContent.includes("Bảng tin"), "sidebar nav items present");
  ok(document.querySelectorAll(".sb-item").length >= 7, "sidebar has >=7 menu items");
  ok(document.getElementById("sb-hot").children.length >= 3, "sidebar suggested topics rendered");
  ok(document.getElementById("topsearch").classList.contains("on"), "top search bar shown on feed");
  document.getElementById("topsearch-input").value = "tư duy phản biện";
  await clk(q('[data-act="topsearch"]'));
  ok(window.location.hash === "#/discover", "top search navigates to discover");
  ok(text().includes("Tìm thấy module khớp"), "top search runs verdict FOUND");
  document.getElementById("topsearch-input").value = "chủ đề mới lạ";
  document.getElementById("topsearch-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(80);
  ok(text().includes("Chưa ai Brew chủ đề này"), "Enter key in top search works");
  await clk(q(".sb-hot-item"));
  ok(window.location.hash === "#/discover", "sidebar suggested topic navigates to discover");
  await clk(document.getElementById("sb-feed"));
  ok(window.location.hash === "#/feed", "sidebar nav back to feed");
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
  ok(text().includes("12 đầu ra"), "12 outputs ranked");
  await clk(q('[data-act="persona"][data-p="fun"]'));
  ok(text().includes("🎈 Giải trí"), "persona tab switches");
  click(q('[data-act="attach"][data-type="youtube"]'));
  ok(document.getElementById("attached-list").textContent.includes("YouTube"), "attachment chip renders");

  console.log("== F4: weak search → Brew → output becomes topic ==");
  document.getElementById("uni-input").value = "triết lý tục ngữ Việt Nam";
  await clk(q('[data-act="uni-search"]'));
  ok(text().includes("Chưa ai Brew chủ đề này"), "verdict MISSING");
  await clk(q('[data-act="go-brew"]'));
  ok(window.location.hash === "#/brew" && text().includes("Bắt đầu Brew"), "brew form (topic prefilled)");
  await clk(q('[data-act="brew-start"]'));
  await sleep(4800);
  ok(text().includes("Module sẵn sàng"), "brew pipeline completes");
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
  ok(JSON.parse(window.localStorage.getItem("gon-standalone-fe-demo-v2")).forks.length >= 1, "fork recorded");

  console.log("== F9: arena ==");
  await goHash("#/arena");
  ok(text().includes("VS"), "arena renders");
  await clk(q('[data-act="vote"][data-choice="a"]'));
  ok(text().includes("Kết quả cộng đồng"), "vote reveals community");
  ok(text().includes("Model A — Gemini qua Google ADK"), "label revealed after vote");

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
  const st = JSON.parse(window.localStorage.getItem("gon-standalone-fe-demo-v2"));
  ok(st.brewed[0].trend >= 40, "own output trend >= 40 (got " + st.brewed[0].trend + ")");

  console.log("== F11: POAP + privacy ==");
  await goHash("#/proof");
  ok(text().includes("Dòng thời gian"), "POAP timeline renders");
  ok(text().includes("Brew topic: triết lý tục ngữ Việt Nam"), "brew in timeline");
  ok(document.querySelectorAll(".badge.unlocked").length >= 6, "badges unlocked (" + document.querySelectorAll(".badge.unlocked").length + ")");
  await goHash("#/profile");
  ok(text().includes("Tài khoản ẩn danh"), "profile shows anonymous identity");
  ok(text().includes("Xuất dữ liệu"), "privacy actions render");
  const ck = document.getElementById("ck-personalization");
  ck.checked = false;
  ck.dispatchEvent(new window.Event("change", { bubbles: true }));
  await goHash("#/journey");
  ok(text().includes("floor(LifetimeXP/100)"), "level formula uncapped displayed");
  const hdr = text();
  ok(/Lv\.\d+/.test(hdr), "journey shows level");

  console.log("== S14: map ==");
  const stx = JSON.parse(window.localStorage.getItem("gon-standalone-fe-demo-v2"));
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

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
