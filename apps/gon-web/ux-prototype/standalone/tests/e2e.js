"use strict";
/* E2E smoke test cho GON standalone FE demo (jsdom, không network).
 * Chạy:  mkdir /tmp/gontest && cd /tmp/gontest && npm init -y && npm i jsdom
 *        node apps/gon-web/ux-prototype/standalone/tests/e2e.js
 * Kết quả kỳ vọng: 40 passed, 0 failed (toàn bộ F1–F11). */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const dom = new JSDOM(html, {
  url: "http://localhost:4173/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
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
async function clk(el) { click(el); await sleep(60); }
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
  await sleep(40);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("== Boot ==");
  ok(text().includes("GON — Game Of Nurture"), "S01 welcome renders");
  ok(document.getElementById("btn-google").disabled, "Google button disabled until consent");

  console.log("== F1: consent + Google sign-in ==");
  document.getElementById("ck-age").checked = true;
  document.getElementById("ck-age").dispatchEvent(new window.Event("change", { bubbles: true }));
  document.getElementById("ck-terms").checked = true;
  document.getElementById("ck-terms").dispatchEvent(new window.Event("change", { bubbles: true }));
  ok(!document.getElementById("btn-google").disabled, "Google button enabled after consent");
  await clk(document.getElementById("btn-google"));
  ok(document.getElementById("modal-overlay").classList.contains("show"), "account picker modal opens");
  await clk(q('[data-act="pick-account"]'));
  ok(window.location.hash === "#/home", "after sign-in → #/home");
  ok(text().includes("Trending hôm nay"), "S02 home shows trending rail");

  console.log("== F2: universal input → found ==");
  document.getElementById("uni-input").value = "tư duy phản biện";
  await clk(q('[data-act="uni-search"]'));
  ok(window.location.hash === "#/search", "navigated to #/search");
  ok(text().includes("Tìm thấy module khớp"), "verdict FOUND renders");
  ok(text().includes("12 đầu ra"), "12 outputs listed");

  console.log("== persona rerank ==");
  const firstPhd = q(".out-item .meta h4").textContent;
  click(q('[data-act="persona"][data-p="fun"]')); await sleep(40);
  const firstFun = q(".out-item .meta h4").textContent;
  ok(firstPhd !== firstFun, "persona changes top output (" + firstPhd.slice(0, 18) + "… → " + firstFun.slice(0, 18) + "…)");
  ok(text().includes("Chưa ai Brew chủ đề này") === false, "still on found results after rerank");

  console.log("== attach inputs ==");
  await goHash("#/home");
  await clk(q('[data-act="attach"][data-type="youtube"]'));
  await clk(q('[data-act="attach"][data-type="file"]'));
  ok(document.getElementById("attached-list").textContent.includes("YouTube"), "attachment chip renders");

  console.log("== F3: weak search → Brew ==");
  document.getElementById("uni-input").value = "triết lý tục ngữ Việt Nam";
  await clk(q('[data-act="uni-search"]'));
  ok(text().includes("Chưa ai Brew chủ đề này"), "verdict MISSING renders");
  await clk(q('[data-act="go-brew"]'));
  ok(window.location.hash === "#/brew" && text().includes("Bắt đầu Brew"), "S04 brew form renders");
  await clk(q('[data-act="brew-start"]'));
  await sleep(5200);
  ok(text().includes("Module sẵn sàng"), "brew pipeline completes");
  await clk(q('[data-nav="module"]'));
  ok(window.location.hash === "#/module" && text().includes("Các mục học"), "S05 module renders");

  console.log("== F4: learn + checkpoint (paste + valid) ==");
  await clk(q('[data-act="learn-sec"][data-sec="0"]'));
  ok(text().includes("Checkpoint hiểu thật"), "S06 checkpoint renders");
  const ta = document.getElementById("check-input");
  ta.dispatchEvent(new window.Event("paste", { bubbles: true }));
  ta.value = "Lập luận yếu vì chỉ dựa vào uy tín người nói chứ không đưa bằng chứng; cần tách kết luận, kiểm chứng tiền đề và xem xét phương án khác trước khi tin.";
  ta.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(q('[data-act="check-submit"]')); await sleep(30);
  ok(document.getElementById("paste-warn").classList.contains("show"), "paste detected & rejected");
  delete ta.dataset.pasted;
  document.getElementById("paste-warn").classList.remove("show");
  click(q('[data-act="check-submit"]')); await sleep(30);
  ok(document.getElementById("check-ok").classList.contains("show"), "valid answer passes");

  console.log("== F5: formats ==");
  await goHash("#/module");
  await clk(q('[data-act="view-format"][data-fmt="infographic"]'));
  ok(window.location.hash === "#/output" && text().includes("Tách kết luận"), "infographic mock renders");
  await clk(q('[data-act="view-format"][data-fmt="video"]'));
  ok(q("#video-mock") !== null, "video mock renders");
  await clk(q('[data-act="view-format"][data-fmt="image"]'));
  ok(text().includes("6 tranh"), "image grid renders");

  console.log("== F6: game ==");
  await clk(q('[data-act="view-format"][data-fmt="game"]'));
  await clk(q('[data-nav="game"]'));
  ok(window.location.hash === "#/game", "S08 game renders");
  const correct = [1, 2, 1];
  for (let i = 0; i < 3; i++) {
    const radio = q('input[name="gq' + i + '"][value="' + correct[i] + '"]');
    radio.checked = true;
    radio.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  click(q('[data-act="game-submit"]')); await sleep(40);
  ok(text().includes("3/3 đúng"), "game scores 3/3");

  console.log("== F7: fork ==");
  await goHash("#/related");
  click(q('[data-act="fork"]')); await sleep(30);
  ok(text().includes("Đã fork"), "fork marks journey as forked");

  console.log("== F8: arena vote ==");
  await goHash("#/arena");
  ok(text().includes("VS"), "S11 arena pair renders");
  click(q('[data-act="vote"][data-choice="a"]')); await sleep(30);
  ok(text().includes("Kết quả cộng đồng"), "vote reveals community split");
  ok(text().includes("Model A — Gemini qua Google ADK"), "label revealed after vote");

  console.log("== F9/F10: proof + POAP ==");
  await goHash("#/proof");
  ok(text().includes("Dòng thời gian"), "S12 timeline renders");
  ok(text().includes("Brew module: triết lý tục ngữ Việt Nam"), "brew event in timeline");
  ok(document.querySelectorAll(".badge.unlocked").length >= 5, "badges unlocked (got " + document.querySelectorAll(".badge.unlocked").length + ")");
  ok(text().includes("Chia sẻ Facebook"), "share buttons render");

  console.log("== F11 + S13: profile / privacy ==");
  await goHash("#/profile");
  ok(text().includes("Xuất dữ liệu"), "S13 privacy actions render");
  const ck = document.getElementById("ck-personalization");
  ck.checked = false;
  ck.dispatchEvent(new window.Event("change", { bubbles: true }));
  await goHash("#/home");
  ok(text().includes("đang tắt"), "personalization off hides footprint block");
  ck.checked = true;

  console.log("== S09: progress / levels ==");
  await goHash("#/progress");
  ok(text().includes("floor(LifetimeXP / 100)"), "level formula displayed");
  ok(text().includes("Sổ XP"), "XP ledger renders");
  const hdr = document.getElementById("hdr-level").textContent;
  ok(/^Lv\.\d+/.test(hdr), "header level chip live: " + hdr);

  console.log("== S14: map ==");
  await goHash("#/map");
  const doneFlows = Array.from(document.querySelectorAll(".flow-item .tag.ok")).length;
  ok(doneFlows >= 10, "flows completed on map (got " + doneFlows + "/11)");
  ok(text().includes("14 màn hình"), "screen checklist renders");

  console.log("== persistence ==");
  const saved = JSON.parse(window.localStorage.getItem("gon-standalone-fe-demo-v1"));
  ok(saved && saved.started === true && saved.xpLedger.length >= 5, "state persisted to localStorage (" + (saved ? saved.xpLedger.length : 0) + " xp events)");

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
