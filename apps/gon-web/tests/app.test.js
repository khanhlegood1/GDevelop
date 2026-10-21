const test = require("node:test");
const assert = require("node:assert/strict");
const gon = require("../app.js");

test("demo embedding is normalized and has 768 dimensions", () => {
  const vector = gon.createEmbedding768("hiến máu, vector embeddings và POAP");
  assert.equal(vector.length, 768);
  const norm = Math.sqrt([...vector].reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6, `norm=${norm}`);
  assert.ok(Math.abs(gon.cosineSimilarity(vector, vector) - 1) < 1e-9);
});

test("URL classifier separates YouTube, Facebook and websites", () => {
  assert.equal(gon.classifyUrl("https://youtu.be/abc123XYZ").kind, "youtube");
  assert.equal(gon.classifyUrl("https://www.facebook.com/watch/?v=1").kind, "facebook");
  assert.equal(gon.classifyUrl("https://www.hienmaunhanvan.com/").kind, "website");
  assert.equal(gon.classifyUrl("not a url").ok, false);
});

test("known topics find a strong module while a novel topic stays below found threshold", () => {
  assert.equal(gon.searchCorpus("hiến máu sức khỏe cộng đồng")[0].item.id, "blood-hero");
  assert.ok(gon.searchCorpus("vector embeddings 768 semantic search")[0].score >= 0.58);
  const novel = gon.searchCorpus("thiết kế nghi lễ học tập cho phi hành gia Việt Nam trên trạm mặt trăng")[0];
  assert.ok(novel.score < 0.58, `novel score=${novel.score}`);
  assert.equal(novel.specificCoverage, 0);
});

test("Brew creates a complete interactive module contract", () => {
  const module = gon.createBrewModule("Thiết kế nghi lễ học tập trên trạm mặt trăng");
  assert.equal(module.generated, true);
  assert.equal(module.quests.length, 5);
  assert.equal(module.quiz.length, 3);
  assert.ok(module.concepts.length >= 3);
  assert.ok(module.flashcards.length >= 3);
});

test("numeric levels are lifelong and Forever is an open-ended Era", () => {
  assert.equal(gon.XP_PER_LEVEL, 100);
  assert.equal(gon.calculateLevel(0).numericLevel, 0);
  assert.equal(gon.calculateLevel(0).current.name, "Zero");
  assert.equal(gon.calculateLevel(99).next.xp, 100);
  assert.equal(gon.calculateLevel(100).numericLevel, 1);
  assert.equal(gon.calculateLevel(1250).numericLevel, 12);
  assert.equal(gon.calculateLevel(1250).current.name, "Hero");
  assert.equal(gon.calculateLevel(3499).current.name, "Legend");
  assert.equal(gon.calculateLevel(3500).numericLevel, gon.FOREVER_LEVEL);
  assert.equal(gon.calculateLevel(3500).current.name, "Forever");
  assert.equal(gon.calculateLevel(3500).next.numericLevel, 36);
  assert.equal(gon.calculateLevel(9999).numericLevel, 99);
  assert.equal(gon.calculateLevel(9999).next.xp, 10000);
  assert.equal(gon.calculateLevel(123456).numericLevel, 1234);
  assert.equal(gon.calculateLevel(123456).nextEra, null);
});
