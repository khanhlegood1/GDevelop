/**
 * Apply-1 (25/10/2026) — port các bề mặt đã PO chốt (standalone v2.12) sang
 * production source: Đường KOL ngách, Arena (Battle/Side-by-side/FastChat embed),
 * Journey Agent (5 tín hiệu), và production de-18+ sweep (PO đảo ngược 24/10).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  countHotOutputs,
  evaluateKolTier,
  KOL_HONESTY_NOTICE,
  KOL_TIERS,
  sumTrendToken,
} from "@/lib/kol-path";
import {
  applyArenaVote,
  ARENA_ELO_DELTAS,
  ARENA_PAIRS,
  canStageSideBySide,
  fastChatEmbedUrl,
  gonArenaEmbedUrl,
  SIDE_BY_SIDE_OUTPUTS,
} from "@/lib/arena-surface";
import {
  agentNetImprovement,
  AGENT_SIGNALS,
  JOURNEY_AGENT_STEPS,
  ORCHESTRATOR_POOL,
  pickBlindOrchestrator,
} from "@/lib/journey-agent-surface";

describe("Apply-1 · Đường KOL ngách (trending token/XP, never fame/income)", () => {
  it("tier theo metric thật: Mầm → Chủ ngách → KOL ngách", () => {
    expect(evaluateKolTier(0, 0).tier.id).toBe("sprout");
    expect(evaluateKolTier(1, 0).tier.id).toBe("niche_owner");
    expect(evaluateKolTier(3, 0).tier.id).toBe("niche_kol");
    expect(evaluateKolTier(0, 100).tier.id).toBe("niche_kol");
    expect(evaluateKolTier(2, 99).tier.id).toBe("niche_owner");
    expect(KOL_TIERS).toHaveLength(3);
  });

  it("tier cao nhất chốt progress 100% và không còn nextStep", () => {
    const top = evaluateKolTier(5, 200);
    expect(top.progressPct).toBe(100);
    expect(top.nextStep).toBe("");
  });

  it("token xu hướng = tổng xu hướng output của mình; hot đếm theo ngưỡng ≥40", () => {
    expect(sumTrendToken([{ trend: 40 }, { trend: 12 }, { trend: 8 }])).toBe(60);
    expect(countHotOutputs([{ trend: 45 }, { trend: 39 }, { trend: 100 }])).toBe(2);
  });

  it("disclaimer bắt buộc: KHÔNG hứa hẹn nổi tiếng hay thu nhập", () => {
    expect(KOL_HONESTY_NOTICE).toContain("KHÔNG hứa hẹn nổi tiếng hay thu nhập");
    expect(KOL_HONESTY_NOTICE).toContain("không quy đổi thành tiền");
  });
});

describe("Apply-1 · Arena surface (Battle + Side-by-side + FastChat embed)", () => {
  it("4 lựa chọn vote với ±Elo đúng (mirror standalone v2.7)", () => {
    expect(ARENA_ELO_DELTAS.a).toEqual({ a: 8, b: -5 });
    expect(ARENA_ELO_DELTAS.b).toEqual({ a: -5, b: 8 });
    expect(ARENA_ELO_DELTAS.tie).toEqual({ a: 1, b: 1 });
    expect(ARENA_ELO_DELTAS.bothbad).toEqual({ a: -4, b: -4 });
  });

  it("vote battle mở model đúng phía; tie/bothbad không gắn model", () => {
    const pair = ARENA_PAIRS[0]!;
    expect(applyArenaVote("a", pair)).toMatchObject({ choice: "a", model: pair.a.model, via: "battle" });
    expect(applyArenaVote("b", pair)).toMatchObject({ choice: "b", model: pair.b.model });
    expect(applyArenaVote("tie", pair).model).toBeNull();
    expect(applyArenaVote("bothbad", pair).model).toBeNull();
  });

  it("side-by-side chỉ hợp lệ khi 2 output khác nhau và trong pool", () => {
    expect(canStageSideBySide(0, 0, SIDE_BY_SIDE_OUTPUTS.length)).toBe(false);
    expect(canStageSideBySide(0, 1, SIDE_BY_SIDE_OUTPUTS.length)).toBe(true);
    expect(canStageSideBySide(-1, 2, SIDE_BY_SIDE_OUTPUTS.length)).toBe(false);
    expect(canStageSideBySide(0, SIDE_BY_SIDE_OUTPUTS.length, SIDE_BY_SIDE_OUTPUTS.length)).toBe(false);
  });

  it("URL embed: same-origin GON + công thức FastChat self-host ?embed=true", () => {
    expect(gonArenaEmbedUrl()).toBe("/arena-embed.html?embed=1");
    expect(fastChatEmbedUrl("gon-fastchat")).toBe("https://gon-fastchat.hf.space/?embed=true");
    expect(() => fastChatEmbedUrl("bad name!")).toThrow();
  });
});

describe("Apply-1 · Journey Agent (Agent Mode arena.ai → GON)", () => {
  it("7 bước tool đúng thứ tự plan → grant_xp", () => {
    expect(JOURNEY_AGENT_STEPS).toHaveLength(7);
    expect(JOURNEY_AGENT_STEPS[0]!.tool).toBe("plan");
    expect(JOURNEY_AGENT_STEPS[6]!.tool).toBe("grant_xp");
    expect(JOURNEY_AGENT_STEPS.map((s) => s.tool)).toEqual([
      "plan", "eval_query", "brew_module", "gen_payload", "gd_render", "checkpoint", "grant_xp",
    ]);
  });

  it("5 tín hiệu Agent Arena map sang GON, recovery ×0.5", () => {
    expect(AGENT_SIGNALS).toHaveLength(5);
    const recovery = AGENT_SIGNALS.find((s) => s.id === "recovery")!;
    expect(recovery.weight).toBe(0.5);
    expect(AGENT_SIGNALS.filter((s) => s.weight === 1)).toHaveLength(4);
  });

  it("Net Improvement có trọng số: {8,6,9,2,11} → +7 (mirror standalone)", () => {
    expect(agentNetImprovement({ confirmedSuccess: 8, praiseVsComplaint: 6, steerability: 9, recovery: 2, honesty: 11 })).toBe(7);
    expect(agentNetImprovement({ confirmedSuccess: -6, praiseVsComplaint: -4, steerability: -5, recovery: -8, honesty: 3 })).toBe(-3);
  });

  it("chọn orchestrator mù từ pool (nguyên tắc arena.ai)", () => {
    const poolNames = ORCHESTRATOR_POOL.map((o) => o.name);
    for (let i = 0; i < 20; i += 1) {
      expect(poolNames).toContain(pickBlindOrchestrator().name);
    }
  });
});

describe("Apply-1 · Production de-18+ sweep (PO đảo ngược 24/10)", () => {
  const vs1Source = readFileSync(
    fileURLToPath(new URL("../../src/components/Vs1App.tsx", import.meta.url)),
    "utf8",
  );

  it("không còn cổng độ tuổi trong UI (checkbox, nút chưa đủ 18 tuổi, state chặn)", () => {
    expect(vs1Source).not.toContain("Tôi tự xác nhận mình đã đủ 18 tuổi");
    expect(vs1Source).not.toContain("Tôi chưa đủ 18 tuổi");
    expect(vs1Source).not.toContain("under18Blocked");
    expect(vs1Source).not.toContain("is18");
    expect(vs1Source).not.toContain("GAME OF NURTURE · 18+");
  });

  it("contract P03 GIỮ NGUYÊN: /v1/me/age-attestation + termsVersion/privacyVersion", () => {
    expect(vs1Source).toContain("/v1/me/age-attestation");
    expect(vs1Source).toContain("termsVersion: TERMS_VERSION");
    expect(vs1Source).toContain("privacyVersion: PRIVACY_VERSION");
  });

  it("asset embed same-origin được phục vụ từ public/", () => {
    const html = readFileSync(fileURLToPath(new URL("../../public/arena-embed.html", import.meta.url)), "utf8");
    expect(html).toContain("gon-arena-embed");
  });

  it("3 bề mặt đã PO chốt được mount trong Vs1App", () => {
    expect(vs1Source).toContain("<ArenaPanel />");
    expect(vs1Source).toContain("<JourneyAgentPanel");
    expect(vs1Source).toContain("<KolPathCard");
  });
});
