import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor, FeatureFlagRecord } from "@/server/types";

interface ServiceOptions {
  brewExecutionMode?: "inline" | "queued";
  quotas?: Partial<{
    searchPerHour: number;
    brewPerDay: number;
    artifactProcessingPerDay: number;
    brewCostUnitsPerDay: number;
  }>;
  featureFlags?: Record<string, boolean>;
}

function createService(options: ServiceOptions = {}) {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    brewExecutionMode: options.brewExecutionMode ?? "queued",
    featureFlags: { brew_enabled: true, ...(options.featureFlags ?? {}) },
    quotas: options.quotas,
  });
  return { store, service };
}

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_guardrails" };
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

async function createProject(service: GonService, actor: Actor, key: string) {
  const project = (
    await service.createProject(
      actor,
      {
        title: `Guardrails ${key}`,
        prompt: `Vì sao quota dự phòng cần ghi bền vững ${key}?`,
        goal: "Hiểu persistent quota guardrails",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: `guardrails-project-${key}` },
    )
  ).data;
  return String(project.id);
}

async function createSearch(service: GonService, actor: Actor, projectId: string, key: string) {
  const search = (
    await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: `guardrails-search-${key}` })
  ).data;
  expect(search).toMatchObject({ status: "completed", verdict: "missing" });
  return String(search.id);
}

function countReservations(
  store: MemoryGonStore,
  quotaKey: string,
  predicate: (record: { status: string }) => boolean = () => true,
): number {
  return [...store.quotaReservations.values()].filter(
    (record) => record.quotaKey === quotaKey && predicate(record),
  ).length;
}

describe("persistent quota guardrails (P05-R1.6)", () => {
  it("enforces the search quota through persistent reservations without leaving partial rows", async () => {
    const { service, store } = createService({ quotas: { searchPerHour: 2 } });
    const { actor } = await activate(service, "Người học search quota");
    const projectId = await createProject(service, actor, "search-quota");

    await createSearch(service, actor, projectId, "sq-1");
    await createSearch(service, actor, projectId, "sq-2");
    expect(countReservations(store, "search_per_hour", (r) => r.status === "consumed")).toBe(2);

    await expect(
      createSearch(service, actor, projectId, "sq-3"),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    // The rejected attempt must not add a reservation or a search record.
    expect(countReservations(store, "search_per_hour")).toBe(2);
    expect([...store.searchAttempts.values()].filter((item) => item.ownerUserId === actor.userId)).toHaveLength(2);

    // Windows are fixed UTC hour buckets.
    for (const record of store.quotaReservations.values()) {
      if (record.quotaKey !== "search_per_hour") continue;
      expect(new Date(record.windowEnd).getTime() - new Date(record.windowStart).getTime()).toBe(3_600_000);
    }
  });

  it("enforces brew_per_day and holds the in-flight AI cost budget", async () => {
    const { service, store } = createService({ quotas: { brewPerDay: 2, brewCostUnitsPerDay: 2 } });
    const { actor } = await activate(service, "Người học brew quota");
    const projectId = await createProject(service, actor, "brew-quota");
    const search1 = await createSearch(service, actor, projectId, "bq-1");
    const search2 = await createSearch(service, actor, projectId, "bq-2");
    const search3 = await createSearch(service, actor, projectId, "bq-3");

    const first = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: search1, confirmed: true },
      { idempotencyKey: "guardrails-brew-1" },
    );
    expect(first.status).toBe(202);
    await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: search2, confirmed: true },
      { idempotencyKey: "guardrails-brew-2" },
    );
    expect(countReservations(store, "brew_per_day", (r) => r.status === "consumed")).toBe(2);
    expect(countReservations(store, "brew_cost_units_per_day", (r) => r.status === "reserved")).toBe(2);

    // brew_per_day limit reached.
    await expect(
      service.createBrewJob(
        actor,
        projectId,
        { searchAttemptId: search3, confirmed: true },
        { idempotencyKey: "guardrails-brew-3" },
      ),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });

    // DTO reports the persistent counter.
    const dto = await service.getBrewJob(actor, String(first.data.id));
    expect(dto.quota).toMatchObject({ usedToday: 2, dailyLimit: 2 });
  });

  it("rejects Brew creation when the in-flight cost budget is exhausted and rolls the job back", async () => {
    const { service, store } = createService({ quotas: { brewCostUnitsPerDay: 1 } });
    const { actor } = await activate(service, "Người học cost budget");
    const projectId = await createProject(service, actor, "cost-budget");
    const search1 = await createSearch(service, actor, projectId, "cb-1");
    const search2 = await createSearch(service, actor, projectId, "cb-2");
    const jobsBefore = [...store.jobs.values()].filter((job) => job.jobType === "brew_module").length;

    await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: search1, confirmed: true },
      { idempotencyKey: "guardrails-cost-1" },
    );
    await expect(
      service.createBrewJob(
        actor,
        projectId,
        { searchAttemptId: search2, confirmed: true },
        { idempotencyKey: "guardrails-cost-2" },
      ),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });

    // The failed reservation rolled the whole Unit of Work back.
    const jobsAfter = [...store.jobs.values()].filter((job) => job.jobType === "brew_module");
    expect(jobsAfter).toHaveLength(jobsBefore + 1);
    expect(countReservations(store, "brew_cost_units_per_day")).toBe(1);
  });

  it("settles the cost budget with actual spend and refunds the remainder at completion", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học settle");
    const projectId = await createProject(service, actor, "settle");
    const searchId = await createSearch(service, actor, projectId, "settle-1");

    const queued = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: searchId, confirmed: true },
      { idempotencyKey: "guardrails-settle-1" },
    );
    const processed = await service.processNextQueuedBrewJob({ workerId: "worker-settle" });
    expect(processed).toMatchObject({ status: "succeeded" });

    const reservations = [...store.quotaReservations.values()].filter(
      (record) => record.jobId === String(queued.data.id),
    );
    const cost = reservations.find((record) => record.quotaKey === "brew_cost_units_per_day");
    expect(cost).toBeDefined();
    // Local deterministic provider reports 0 cost: the reservation settles
    // with consumed=0 and refunds the full remainder.
    expect(cost).toMatchObject({ consumedUnits: 0, refundedUnits: 1, status: "refunded" });
    // The count quota stays consumed regardless of outcome.
    expect(
      reservations.find((record) => record.quotaKey === "brew_per_day"),
    ).toMatchObject({ status: "consumed" });
  });

  it("replays identical Brew input through the targeted fingerprint lookup", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Người học fingerprint");
    const projectId = await createProject(service, actor, "fingerprint");
    const searchId = await createSearch(service, actor, projectId, "fp-1");

    const first = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: searchId, confirmed: true },
      { idempotencyKey: "guardrails-fp-1" },
    );
    // Different idempotency key, identical input: the fingerprint lookup
    // (targeted query, not a full scan) returns the same job as a replay.
    const second = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: searchId, confirmed: true },
      { idempotencyKey: "guardrails-fp-2" },
    );
    expect(second).toMatchObject({ status: 200, replay: true });
    expect(second.data.id).toBe(first.data.id);
  });

  it("enforces the artifact quota through persistent reservations", async () => {
    const { service, store } = createService({ quotas: { artifactProcessingPerDay: 1 } });
    const { actor } = await activate(service, "Người học artifact quota");
    const projectId = await createProject(service, actor, "artifact-quota");
    // Project prompt material already consumed the single artifact slot.
    expect(countReservations(store, "artifact_per_day", (r) => r.status === "consumed")).toBe(1);

    await expect(
      service.addProjectArtifact(
        actor,
        projectId,
        { kind: "text", rightsBasis: "created_by_user", text: "Ghi chú thêm" },
        { idempotencyKey: "guardrails-artifact-2" },
      ),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(countReservations(store, "artifact_per_day")).toBe(1);
  });
});

describe("Brew kill switches (P05-R1.6)", () => {
  it("stops Brew when the process flag is disabled", async () => {
    const { service } = createService({ featureFlags: { brew_enabled: false } });
    const { actor } = await activate(service, "Người học kill switch env");
    const projectId = await createProject(service, actor, "kill-env");
    const searchId = await createSearch(service, actor, projectId, "kill-env-1");

    await expect(
      service.createBrewJob(
        actor,
        projectId,
        { searchAttemptId: searchId, confirmed: true },
        { idempotencyKey: "guardrails-kill-env" },
      ),
    ).rejects.toMatchObject({ code: "BREW_DISABLED" });
  });

  it("fails closed on the persistent feature_flags kill switch and recovers when re-enabled", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học kill switch db");
    const projectId = await createProject(service, actor, "kill-db");
    const searchId = await createSearch(service, actor, projectId, "kill-db-1");

    const flagOff: FeatureFlagRecord = {
      key: "brew_enabled",
      enabled: false,
      scope: { source: "ops_kill_switch" },
      version: 2,
      updatedAt: new Date().toISOString(),
    };
    store.featureFlags.set("brew_enabled", flagOff);

    await expect(
      service.createBrewJob(
        actor,
        projectId,
        { searchAttemptId: searchId, confirmed: true },
        { idempotencyKey: "guardrails-kill-db" },
      ),
    ).rejects.toMatchObject({ code: "BREW_DISABLED" });

    store.featureFlags.set("brew_enabled", { ...flagOff, enabled: true, version: 3 });
    const queued = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: searchId, confirmed: true },
      { idempotencyKey: "guardrails-kill-db-2" },
    );
    expect(queued.status).toBe(202);
  });
});
