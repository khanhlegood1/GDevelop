"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CANDIDATES,
  SEARCH_STATES,
  calculateLevel,
  rankCandidates,
  retrievalPasses
} = require("../app.js");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("P02 prototype exposes every approved screen area", () => {
  for (const screenId of ["SCR-01", "SCR-02", "SCR-03", "SCR-04", "SCR-05", "SCR-06", "SCR-07", "SCR-08", "SCR-09", "SCR-10", "SCR-11", "SCR-12"]) {
    assert.match(html, new RegExp(screenId));
  }
});

test("Output Explorer starts from exactly ten candidates", () => {
  assert.equal(CANDIDATES.length, 10);
  assert.equal(new Set(CANDIDATES.map((candidate) => candidate.id)).size, 10);
  assert.ok(CANDIDATES.every((candidate) => Object.keys(candidate.scores).length === 5));
});

test("Learning Mode changes candidate ranking", () => {
  const deepTop = rankCandidates(CANDIDATES, "deep")[0].id;
  const createTop = rankCandidates(CANDIDATES, "create")[0].id;
  const fastTop = rankCandidates(CANDIDATES, "fast")[0].id;
  assert.equal(deepTop, "OUT-004");
  assert.equal(createTop, "OUT-001");
  assert.equal(fastTop, "OUT-007");
});

test("Turning personalization off ranks by common quality", () => {
  const neutral = rankCandidates(CANDIDATES, "create", { personalization: false });
  assert.equal(neutral[0].id, "OUT-004");
  assert.match(neutral[0].rankingBasis, /Chất lượng/);
});

test("Hidden candidates are removed without corrupting the source list", () => {
  const ranked = rankCandidates(CANDIDATES, "create", { hiddenIds: ["OUT-001"] });
  assert.equal(ranked.length, 9);
  assert.equal(ranked[0].id, "OUT-002");
  assert.equal(CANDIDATES.length, 10);
});

test("Search prototype covers the five P01 verdicts", () => {
  assert.deepEqual(Object.keys(SEARCH_STATES).sort(), ["blocked", "clarify", "found", "missing", "related"]);
});

test("Retrieval mock requires explanation across at least two factor groups", () => {
  assert.equal(retrievalPasses("quá ngắn"), false);
  assert.equal(
    retrievalPasses("Một video lan nhanh không chỉ nhờ hook. Mạng lưới người chia sẻ đầu tiên và thời điểm văn hóa thay đổi cách thuật toán phân phối, nên sao chép bề mặt không tạo lại cùng điều kiện."),
    true
  );
});

test("Lifelong level remains numeric and uncapped", () => {
  assert.deepEqual(calculateLevel(0), {
    xp: 0,
    level: 0,
    era: "Zero",
    xpInLevel: 0,
    xpToNextLevel: 100,
    label: "Lv.0 · Zero"
  });
  assert.equal(calculateLevel(1280).label, "Lv.12 · Hero");
  assert.equal(calculateLevel(3500).label, "Lv.35 · Forever");
  assert.equal(calculateLevel(10000).label, "Lv.100 · Forever");
});

test("Prototype has key accessibility and safety labels", () => {
  assert.match(html, /Bỏ qua tới nội dung chính/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Không gọi Google, Gemini, Google ADK hay backend thật/);
  assert.match(html, /Vote.*không xác minh/);
  assert.match(html, /Mặc định: Riêng tư/);
});
