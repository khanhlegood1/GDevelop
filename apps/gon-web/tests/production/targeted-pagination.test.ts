import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { MemoryGonStore } from "@/server/memory-store";
import type { GonRepositories } from "@/server/repositories";
import { GonService } from "@/server/service";
import type {
  Actor,
  BranchCommitRecord,
  JourneyRecord,
  ProofRecord,
  UserRecord,
  XpLedgerRecord,
} from "@/server/types";

/**
 * P05-R1.13: the four user-facing ledger/list endpoints gain a targeted
 * pagination path that pages WITHOUT opening a Unit of Work (no identity-map
 * load on PostgreSQL). These tests pin, on the memory binding, that the
 * bypass path is equivalent to the in-UoW fallback: same pages, same cursor
 * chain, same filters, same authz failures.
 */

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_targeted_pagination" };
  activationSequence += 1;
  const inviteCode = `GON-PAGE-TEST-${activationSequence}`;
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

function setup() {
  const store = new MemoryGonStore();
  store.seedInvite("GON-PAGE-TEST");
  const common = {
    store,
    requireInvite: true,
    brewExecutionMode: "queued" as const,
    featureFlags: { brew_enabled: true },
  };
  // One shared store, two service facades: `bypassed` pages through the
  // targeted port (no Unit of Work), `fallback` keeps the legacy path.
  const bypassed = new GonService({ ...common, targetedPagination: store.createTargetedPagination() });
  const fallback = new GonService({ ...common });
  return { store, bypassed, fallback };
}

function journey(
  overrides: Partial<JourneyRecord> & Pick<JourneyRecord, "id" | "ownerUserId" | "updatedAt">,
): JourneyRecord {
  return {
    projectId: "prj_x",
    sourceCandidateId: "cand_x",
    upstreamModuleVersionId: "modv_x",
    parentJourneyId: null,
    title: "Hành trình kiểm tra",
    goal: "Kiểm chứng phân trang",
    status: "active",
    attribution: { displayName: "GON" },
    headCommitId: null,
    currentNodeId: null,
    version: 1,
    createdAt: overrides.updatedAt,
    deletedAt: null,
    ...overrides,
  };
}

function commit(
  overrides: Partial<BranchCommitRecord> & Pick<BranchCommitRecord, "id" | "journeyId" | "sequence">,
): BranchCommitRecord {
  return {
    parentCommitId: null,
    type: "node_passed",
    actorUserId: "usr_x",
    payloadRef: {},
    summary: "Bước học",
    createdAt: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

function xp(
  overrides: Partial<XpLedgerRecord> & Pick<XpLedgerRecord, "id" | "userId" | "sequence">,
): XpLedgerRecord {
  return {
    delta: 10,
    sourceEventId: "evt_x",
    sourceType: "learning_attempt",
    sourceId: "att_x",
    ruleVersion: "xp-v1",
    formulaVersion: "gon-level-v1",
    status: "posted",
    reversesEntryId: null,
    reasonCode: null,
    lifetimeXpAfter: 10,
    createdAt: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

function proof(
  overrides: Partial<ProofRecord> & Pick<ProofRecord, "id" | "ownerUserId" | "createdAt">,
): ProofRecord {
  return {
    proofType: "external_link",
    title: "Chứng minh ngoài",
    description: null,
    journeyId: null,
    attemptId: null,
    artifactIds: [],
    issuerDisplayName: null,
    externalReference: "https://example.com/proof",
    verificationLevel: "self_declared",
    status: "active",
    proves: ["completion"],
    doesNotProve: ["mastery"],
    version: 1,
    updatedAt: overrides.createdAt,
    deletedAt: null,
    ...overrides,
  };
}

async function setStatus(store: MemoryGonStore, userId: string, status: UserRecord["status"]) {
  await store.runInTransaction(async (repositories) => {
    const user = repositories.users.get(userId)!;
    repositories.users.set(userId, { ...user, status });
  });
}

describe("targeted pagination bypass (P05-R1.13)", () => {
  it("returns pages, cursor chains, filters and authz identical to the Unit-of-Work path", async () => {
    const { store, bypassed, fallback } = setup();
    const { user, actor } = await activate(bypassed, "Người học phân trang");
    const other = await bypassed.ensureDevUser("Người dùng khác");
    const userId = user.id;

    await store.runInTransaction(async (repositories) => {
      repositories.journeys.set("jrn_a", journey({ id: "jrn_a", ownerUserId: userId, updatedAt: "2026-10-20T10:00:00.000Z" }));
      repositories.journeys.set("jrn_b", journey({ id: "jrn_b", ownerUserId: userId, updatedAt: "2026-10-22T10:00:00.000Z" }));
      // Same-millisecond timestamps: deterministic id DESC tiebreak on both paths.
      repositories.journeys.set("jrn_c", journey({ id: "jrn_c", ownerUserId: userId, updatedAt: "2026-10-24T10:00:00.000Z" }));
      repositories.journeys.set("jrn_d", journey({ id: "jrn_d", ownerUserId: userId, updatedAt: "2026-10-24T10:00:00.000Z" }));
      // Not visible: other owner, deleted, status deleted.
      repositories.journeys.set("jrn_other", journey({ id: "jrn_other", ownerUserId: other.id, updatedAt: "2026-10-24T11:00:00.000Z" }));
      repositories.journeys.set("jrn_del", journey({ id: "jrn_del", ownerUserId: userId, updatedAt: "2026-10-24T12:00:00.000Z", deletedAt: "2026-10-24T12:01:00.000Z" }));
      repositories.journeys.set("jrn_stat", journey({ id: "jrn_stat", ownerUserId: userId, updatedAt: "2026-10-24T13:00:00.000Z", status: "deleted" }));

      repositories.branchCommits.set("cmt_1", commit({ id: "cmt_1", journeyId: "jrn_a", sequence: 1 }));
      repositories.branchCommits.set("cmt_2", commit({ id: "cmt_2", journeyId: "jrn_a", sequence: 2 }));
      repositories.branchCommits.set("cmt_3", commit({ id: "cmt_3", journeyId: "jrn_a", sequence: 3 }));
      repositories.branchCommits.set("cmt_4", commit({ id: "cmt_4", journeyId: "jrn_a", sequence: 4 }));
      repositories.branchCommits.set("cmt_5", commit({ id: "cmt_5", journeyId: "jrn_a", sequence: 5 }));
      repositories.branchCommits.set("cmt_other", commit({ id: "cmt_other", journeyId: "jrn_other", sequence: 1 }));

      repositories.xpLedger.set("xp_1", xp({ id: "xp_1", userId, sequence: 1 }));
      repositories.xpLedger.set("xp_2", xp({ id: "xp_2", userId, sequence: 2 }));
      repositories.xpLedger.set("xp_3", xp({ id: "xp_3", userId, sequence: 3 }));
      repositories.xpLedger.set("xp_other", xp({ id: "xp_other", userId: other.id, sequence: 4 }));

      repositories.proofs.set("prf_a", proof({ id: "prf_a", ownerUserId: userId, createdAt: "2026-10-21T09:00:00.000Z" }));
      repositories.proofs.set("prf_b", proof({ id: "prf_b", ownerUserId: userId, createdAt: "2026-10-23T09:00:00.000Z", verificationLevel: "source_linked" }));
      repositories.proofs.set("prf_c", proof({ id: "prf_c", ownerUserId: userId, createdAt: "2026-10-23T09:00:00.000Z" }));
      repositories.proofs.set("prf_other", proof({ id: "prf_other", ownerUserId: other.id, createdAt: "2026-10-24T09:00:00.000Z" }));
    });

    // Journeys: newest first, id DESC on the same-millisecond tie, invisible
    // rows excluded — identical on both paths, including the cursor chain.
    const expectedJourneyOrder = ["jrn_d", "jrn_c", "jrn_b", "jrn_a"];
    for (const service of [bypassed, fallback]) {
      const page1 = await service.listJourneys(actor, { limit: 2 });
      expect(page1.data.map((item) => item.id)).toEqual(["jrn_d", "jrn_c"]);
      expect(page1.page.hasMore).toBe(true);
      expect(typeof page1.page.nextCursor).toBe("string");
      const page2 = await service.listJourneys(actor, { limit: 2, cursor: page1.page.nextCursor as string });
      expect(page2.data.map((item) => item.id)).toEqual(["jrn_b", "jrn_a"]);
      expect(page2.page.hasMore).toBe(false);
      expect(page2.page.nextCursor).toBeNull();
    }
    expect(await bypassed.listJourneys(actor, { limit: 20 })).toEqual(await fallback.listJourneys(actor, { limit: 20 }));

    // Journey commits: ascending sequence, same pagination, foreign journey 404.
    for (const service of [bypassed, fallback]) {
      const commits = await service.listJourneyCommits(actor, "jrn_a", { limit: 3 });
      expect(commits.data.map((item) => item.sequence)).toEqual([1, 2, 3]);
      expect(commits.page.hasMore).toBe(true);
      const rest = await service.listJourneyCommits(actor, "jrn_a", { limit: 3, cursor: commits.page.nextCursor as string });
      expect(rest.data.map((item) => item.sequence)).toEqual([4, 5]);
      expect(rest.page.hasMore).toBe(false);
      await expect(service.listJourneyCommits(actor, "jrn_other", {})).rejects.toMatchObject({ status: 404 });
    }
    expect(await bypassed.listJourneyCommits(actor, "jrn_a", { limit: 2 })).toEqual(
      await fallback.listJourneyCommits(actor, "jrn_a", { limit: 2 }),
    );

    // XP ledger: newest sequence first, other users excluded.
    for (const service of [bypassed, fallback]) {
      const ledger = await service.listMyXpLedger(actor, { limit: 2 });
      expect(ledger.data.map((item) => item.id)).toEqual(["xp_3", "xp_2"]);
      const tail = await service.listMyXpLedger(actor, { limit: 2, cursor: ledger.page.nextCursor as string });
      expect(tail.data.map((item) => item.id)).toEqual(["xp_1"]);
      expect(tail.page.hasMore).toBe(false);
    }
    expect(await bypassed.listMyXpLedger(actor, { limit: 20 })).toEqual(await fallback.listMyXpLedger(actor, { limit: 20 }));

    // Proofs: newest first with id tiebreak, verificationLevel filter narrows
    // both rows and total on both paths.
    for (const service of [bypassed, fallback]) {
      const proofs = await service.listProofs(actor, { limit: 2 });
      expect(proofs.data.map((item) => item.id)).toEqual(["prf_c", "prf_b"]);
      const filtered = await service.listProofs(actor, { verificationLevel: "source_linked", limit: 10 });
      expect(filtered.data.map((item) => item.id)).toEqual(["prf_b"]);
      expect(filtered.page.hasMore).toBe(false);
    }
    expect(await bypassed.listProofs(actor, { limit: 20 })).toEqual(await fallback.listProofs(actor, { limit: 20 }));

    // Invalid cursor: same validation error on both paths.
    await expect(bypassed.listJourneys(actor, { cursor: "!!!" })).rejects.toMatchObject({ status: 400 });
    await expect(fallback.listJourneys(actor, { cursor: "!!!" })).rejects.toMatchObject({ status: 400 });
  });

  it("enforces the same account-status gates as the Unit-of-Work path", async () => {
    const { store, bypassed, fallback } = setup();
    const { user, actor } = await activate(bypassed, "Người học bị suspend");

    for (const status of ["suspended", "deletion_pending", "onboarding"] as const) {
      await setStatus(store, user.id, status);
      await expect(bypassed.listJourneys(actor, {})).rejects.toMatchObject({ status: 403 });
      await expect(fallback.listJourneys(actor, {})).rejects.toMatchObject({ status: 403 });
      await expect(bypassed.listMyXpLedger(actor, {})).rejects.toMatchObject({ status: 403 });
      await expect(bypassed.listProofs(actor, {})).rejects.toMatchObject({ status: 403 });
      await expect(bypassed.listJourneyCommits(actor, "jrn_missing", {})).rejects.toMatchObject({ status: 403 });
    }

    // Deleted / missing user rows: session no longer valid.
    await setStatus(store, user.id, "deleted");
    await expect(bypassed.listJourneys(actor, {})).rejects.toMatchObject({ status: 401 });
    await expect(fallback.listJourneys(actor, {})).rejects.toMatchObject({ status: 401 });
  });

  it("does not open a Unit of Work on the bypass path", async () => {
    const { store, bypassed } = setup();
    const { actor } = await activate(bypassed, "Người học không mở UoW");
    await store.runInTransaction(async (repositories) => {
      repositories.journeys.set("jrn_solo", journey({ id: "jrn_solo", ownerUserId: actor.userId, updatedAt: "2026-10-24T00:00:00.000Z" }));
    });

    let openTransactions = 0;
    const originalRun: MemoryGonStore["runInTransaction"] = store.runInTransaction.bind(store);
    store.runInTransaction = (async <T>(work: (repositories: GonRepositories) => Promise<T>) => {
      openTransactions += 1;
      return originalRun(work);
    }) as MemoryGonStore["runInTransaction"];
    try {
      const result = await bypassed.listJourneys(actor, { limit: 10 });
      expect(result.data.map((item) => item.id)).toEqual(["jrn_solo"]);
      expect(openTransactions).toBe(0);
      await bypassed.listMyXpLedger(actor, {});
      await bypassed.listProofs(actor, {});
      await bypassed.listJourneyCommits(actor, "jrn_solo", {});
      expect(openTransactions).toBe(0);
    } finally {
      store.runInTransaction = originalRun;
    }
  });
});
