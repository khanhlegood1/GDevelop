import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * Apply-8 (27/10) — Đường KOL ngách trên /v1 thật: GET /v1/me/kol-path.
 * Trend token tính từ vote Arena THẬT (Elo mirror FE-9: thắng +8, thua -5,
 * hoà +1, cả hai chưa đạt -4, merge 0) trên output của CandidateSet hiện tại
 * thuộc project của người học. Tier mirror src/lib/kol-path.ts (v2.12).
 */

function createService() {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    featureFlags: { brew_enabled: true },
  });
  return { store, service };
}

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_test" };
  activationSequence += 1;
  const inviteCode = `GON-ALPHA-TEST-${activationSequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode,
  });
  return { user, actor };
}

async function seedCandidates(service: GonService, actor: Actor) {
  const project = (
    await service.createProject(
      actor,
      {
        title: "KOL token verify",
        prompt: "Vì sao điểm xu hướng phải đến từ vote thật chứ không phải self-report?",
        goal: "Verify KOL path",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "kol-project-001" },
    )
  ).data;
  const projectId = String(project.id);
  const search = (
    await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "kol-search-001" })
  ).data;
  const brew = await service.createBrewJob(
    actor,
    projectId,
    { searchAttemptId: String(search.id), confirmed: true },
    { idempotencyKey: "kol-brew-001" },
  );
  expect(brew.status).toBe(202);
  const explorer = await service.getOutputExplorer(actor, projectId);
  const candidates = explorer.candidates as Array<Record<string, unknown>>;
  expect(candidates.length).toBeGreaterThanOrEqual(2);
  return { projectId, candidates };
}

async function vote(service: GonService, actor: Actor, projectId: string, idA: string, idB: string, choice: string, sequence: number) {
  const match = (
    await service.createArenaMatch(actor, projectId, { candidateIds: [idA, idB] })
  ).data as Record<string, unknown>;
  return service.createArenaVote(actor, String(match.id), { choice });
}

describe("kol-path /v1 (Apply-8)", () => {
  it("trend token từ vote Arena thật: 5 thắng + 1 hoà → 41 điểm, 1 hot, tier niche_owner", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Người học KOL");
    const { projectId, candidates } = await seedCandidates(service, actor);
    const idA = String(candidates[0]!.id);
    const idB = String(candidates[1]!.id);

    const kolBefore = (await service.getKolPath(actor)) as Record<string, unknown>;
    expect(kolBefore.trendToken).toBe(0);
    expect(kolBefore.hotOutputs).toBe(0);
    expect((kolBefore.tier as Record<string, unknown>).id).toBe("sprout");

    for (let i = 0; i < 5; i += 1) {
      await vote(service, actor, projectId, idA, idB, "left_better", i);
    }
    await vote(service, actor, projectId, idA, idB, "tie", 5);

    const kol = (await service.getKolPath(actor)) as Record<string, unknown>;
    expect(kol.trendToken).toBe(41); // A: 5*8 + 1 = 41; B: 5*-5 + 1 = -24 → clip 0.
    expect(kol.hotOutputs).toBe(1);
    expect((kol.tier as Record<string, unknown>).id).toBe("niche_owner");
    expect(kol.progressPct).toBe(65); // min(99, 50 + 1*15)
    const outputs = kol.outputs as Array<Record<string, unknown>>;
    const a = outputs.find((output) => String(output.id) === idA)!;
    const b = outputs.find((output) => String(output.id) === idB)!;
    expect(a.trend).toBe(41);
    expect(a.hot).toBe(true);
    expect(b.trend).toBe(-24);
    expect(b.hot).toBe(false);
    expect(String(kol.nextStep)).toContain("2 output ≥40 xu hướng");
  });

  it("both_bad trừ điểm; merge không đổi điểm; chỉ tính match đã vote", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Người học cẩn thận");
    const { projectId, candidates } = await seedCandidates(service, actor);
    const idA = String(candidates[0]!.id);
    const idB = String(candidates[1]!.id);

    await vote(service, actor, projectId, idA, idB, "both_bad", 1);
    // Match mở (chưa vote) + match merge không đóng băng điểm.
    await service.createArenaMatch(actor, projectId, { candidateIds: [idA, idB] });
    await vote(service, actor, projectId, idB, idA, "merge", 2);

    const kol = (await service.getKolPath(actor)) as Record<string, unknown>;
    const outputs = kol.outputs as Array<Record<string, unknown>>;
    expect(outputs.find((output) => String(output.id) === idA)!.trend).toBe(-4);
    expect(outputs.find((output) => String(output.id) === idB)!.trend).toBe(-4);
    expect(kol.trendToken).toBe(0);
    expect((kol.tier as Record<string, unknown>).id).toBe("sprout");
  });

  it("kol-path riêng tư theo user — người khác không thấy điểm của mình", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Chủ điểm xu hướng");
    const other = await activate(service, "Người học khác");
    const { projectId, candidates } = await seedCandidates(service, actor);
    await vote(service, actor, projectId, String(candidates[0]!.id), String(candidates[1]!.id), "left_better", 1);

    const mine = (await service.getKolPath(actor)) as Record<string, unknown>;
    const theirs = (await service.getKolPath(other.actor)) as Record<string, unknown>;
    expect(mine.trendToken).toBe(8);
    expect(theirs.trendToken).toBe(0);
    expect(theirs.outputs).toEqual([]);
    expect((theirs.tier as Record<string, unknown>).id).toBe("sprout");
  });
});
