import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * Apply-2 (25/10) — Arena vertical slice trên /v1 thật, theo hợp đồng P03:
 * POST /projects/{id}/arena-matches · GET /arena-matches/{id} ·
 * POST /arena-matches/{id}/votes.
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

async function seedProjectWithCandidates(service: GonService, actor: Actor) {
  const project = (
    await service.createProject(
      actor,
      {
        title: "Học qua Arena",
        prompt:
          "Vì sao so sánh hai output học tập cạnh nhau (arena) lại cho tín hiệu sở thích tốt hơn một câu hỏi trực tiếp?",
        goal: "Hiểu arena voting như một tín hiệu personalization",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "arena-project-001" },
    )
  ).data;
  const projectId = String(project.id);
  const search = (
    await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "arena-search-001" })
  ).data;
  const brew = await service.createBrewJob(
    actor,
    projectId,
    { searchAttemptId: String(search.id), confirmed: true },
    { idempotencyKey: "arena-brew-001" },
  );
  expect(brew.status).toBe(202);
  const explorer = await service.getOutputExplorer(actor, projectId);
  const candidates = explorer.candidates as Array<Record<string, unknown>>;
  expect(candidates.length).toBeGreaterThanOrEqual(2);
  return { projectId, candidates };
}

describe("arena /v1 (Apply-2)", () => {
  it("creates a match, votes once, and reveals candidates after voting", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học Arena");
    const { projectId, candidates } = await seedProjectWithCandidates(service, actor);

    const match = (
      await service.createArenaMatch(actor, projectId, {
        candidateIds: [candidates[0]!.id, candidates[1]!.id],
      })
    ).data as Record<string, unknown>;

    expect(String(match.id)).toMatch(/^arena_/);
    expect(match.status).toBe("open");
    expect(match.revealedCandidates).toBeNull();
    expect((match.slotA as Record<string, unknown>).summary).toBe(candidates[0]!.title);

    const fetched = (await service.getArenaMatch(actor, String(match.id))) as Record<string, unknown>;
    expect(fetched.status).toBe("open");

    const vote = (
      await service.createArenaVote(actor, String(match.id), { choice: "left_better" })
    ).data as Record<string, unknown>;

    expect((vote.match as Record<string, unknown>).status).toBe("voted");
    const revealed = vote.match as Record<string, unknown>;
    expect((revealed.revealedCandidates as unknown[]).length).toBe(2);
    expect((vote.vote as Record<string, unknown>).choice).toBe("left_better");
    expect(Array.isArray(vote.personalRankingExplanationCodes)).toBe(true);
    expect(vote.mergedCandidateId).toBeNull();
    expect(vote.mergeJobId).toBeNull();

    // Trạng thái bền vững trong store.
    const storedMatch = store.arenaMatches.get(String(match.id));
    expect(storedMatch?.status).toBe("voted");
    expect([...store.arenaVotes.values()].filter((item) => item.matchId === String(match.id))).toHaveLength(1);
  });

  it("rejects a second vote on the same match with 409", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Người học chỉ vote một lần");
    const { projectId, candidates } = await seedProjectWithCandidates(service, actor);
    const match = (
      await service.createArenaMatch(actor, projectId, {
        candidateIds: [candidates[0]!.id, candidates[1]!.id],
      })
    ).data as Record<string, unknown>;
    await service.createArenaVote(actor, String(match.id), { choice: "tie" });
    await expect(
      service.createArenaVote(actor, String(match.id), { choice: "left_better" }),
    ).rejects.toThrowError(expect.objectContaining({ code: "ARENA_VOTE_ALREADY_CAST" }));
  });

  it("validates candidate pair and unknown match", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Người học cẩn thận");
    const { projectId, candidates } = await seedProjectWithCandidates(service, actor);

    await expect(
      service.createArenaMatch(actor, projectId, { candidateIds: [candidates[0]!.id, candidates[0]!.id] }),
    ).rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(
      service.createArenaMatch(actor, projectId, { candidateIds: [candidates[0]!.id, "cand_khong_ton_tai"] }),
    ).rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(service.getArenaMatch(actor, "arena_khong_ton_tai")).rejects.toThrowError(
      expect.objectContaining({ code: "RESOURCE_NOT_FOUND" }),
    );
    const match = (
      await service.createArenaMatch(actor, projectId, {
        candidateIds: [candidates[0]!.id, candidates[1]!.id],
      })
    ).data as Record<string, unknown>;
    await expect(
      service.createArenaVote(actor, String(match.id), { choice: "better_than_everything" }),
    ).rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("does not let another user read or vote on a match they do not own", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Chủ trận đấu");
    const other = await activate(service, "Người học khác");
    const { projectId, candidates } = await seedProjectWithCandidates(service, actor);
    const match = (
      await service.createArenaMatch(actor, projectId, {
        candidateIds: [candidates[0]!.id, candidates[1]!.id],
      })
    ).data as Record<string, unknown>;

    await expect(service.getArenaMatch(other.actor, String(match.id))).rejects.toThrowError(
      expect.objectContaining({ code: "ARENA_MATCH_FORBIDDEN" }),
    );
    await expect(
      service.createArenaVote(other.actor, String(match.id), { choice: "merge" }),
    ).rejects.toThrowError(expect.objectContaining({ code: "ARENA_MATCH_FORBIDDEN" }));
  });
});
