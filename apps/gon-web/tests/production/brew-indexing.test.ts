import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import {
  EMBEDDING_DIMENSIONS,
  LocalHashEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import type { GonRepositories } from "@/server/repositories";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * P05-R1.13: search-index embeddings for brewed ModuleVersions must run
 * OUTSIDE every Brew Unit of Work. These tests instrument the store
 * transaction depth and the embedding provider, then assert the property
 * end-to-end through the queued Brew pipeline (local/hermetic evidence).
 */

class TransactionTrackingStore extends MemoryGonStore {
  openTransactions = 0;

  override async runInTransaction<T>(
    work: (repositories: GonRepositories) => Promise<T>,
  ): Promise<T> {
    this.openTransactions += 1;
    try {
      return await super.runInTransaction(work);
    } finally {
      this.openTransactions -= 1;
    }
  }
}

class TrackingEmbeddingProvider implements EmbeddingProvider {
  readonly providerModel = "tracking-embedding-v1";
  readonly calls: Array<{ text: string; duringTransaction: boolean }> = [];
  /** When armed, the next embed() call throws (provider outage simulation). */
  failNext = false;

  constructor(
    private readonly inner: EmbeddingProvider,
    private readonly transactionOpen: () => boolean,
  ) {}

  async embed(text: string): Promise<EmbeddingResult> {
    this.calls.push({ text, duringTransaction: this.transactionOpen() });
    if (this.failNext) {
      this.failNext = false;
      throw new Error("EMBEDDING_PROVIDER_DOWN");
    }
    return this.inner.embed(text);
  }
}

function setup() {
  const store = new TransactionTrackingStore();
  store.seedInvite("GON-INDEX-TEST");
  const provider = new TrackingEmbeddingProvider(
    new LocalHashEmbeddingProvider(),
    () => store.openTransactions > 0,
  );
  const service = new GonService({
    store,
    embeddingProvider: provider,
    requireInvite: true,
    brewExecutionMode: "queued",
    featureFlags: { brew_enabled: true },
  });
  return { store, service, provider };
}

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_brew_indexing" };
  activationSequence += 1;
  const inviteCode = `GON-INDEX-TEST-${activationSequence}`;
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

/** Project + metadata-only artifact + missing search + queued (unprocessed) Brew job. */
async function queueBrewJob(service: GonService, actor: Actor, key: string) {
  const project = (
    await service.createProject(
      actor,
      {
        title: `Index ngoài UoW ${key}`,
        prompt: `Vì sao cần tách embedding khỏi transaction khi brew module ${key}?`,
        goal: "Hiểu kiến trúc indexing ngoài Unit of Work",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: `index-project-${key}` },
    )
  ).data;
  const projectId = String(project.id);
  await service.addProjectArtifact(actor, projectId, {
    kind: "youtube_url",
    uri: "https://www.youtube.com/watch?v=indexUowTest123",
    displayName: "Video kiểm chứng indexing",
    rightsBasis: "publicly_available_link",
  });
  const search = (
    await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: `index-search-${key}` })
  ).data;
  expect(search).toMatchObject({ status: "completed", verdict: "missing" });
  const queued = await service.createBrewJob(
    actor,
    projectId,
    { searchAttemptId: String(search.id), confirmed: true },
    { idempotencyKey: `index-brew-${key}` },
  );
  expect(queued.status).toBe(202);
  return { projectId, jobId: String(queued.data.id) };
}

function moduleChunksFor(store: TransactionTrackingStore, moduleVersionId: string) {
  return [...store.chunks.values()].filter((chunk) => chunk.moduleVersionId === moduleVersionId);
}

function jobEvents(store: TransactionTrackingStore, jobId: string) {
  return store.outboxEvents.filter((event) => event.causationId === jobId);
}

describe("Brew module indexing outside the Unit of Work (P05-R1.13)", () => {
  it("runs the module-version embedding calls with no open database transaction", async () => {
    const { store, service, provider } = setup();
    const { actor } = await activate(service, "Người học index ngoài UoW");
    const { jobId } = await queueBrewJob(service, actor, "fresh");

    // Ingestion-time embeddings (artifact metadata, search query) still run
    // inside their Units of Work — the documented R1.13-open leftover.
    const embedsBeforeBrew = provider.calls.length;
    expect(embedsBeforeBrew).toBeGreaterThan(0);
    expect(provider.calls.slice(0, embedsBeforeBrew).every((call) => call.duringTransaction)).toBe(true);

    const processed = await service.processQueuedBrewJob(jobId, { workerId: "index-worker" });
    expect(processed).toMatchObject({ status: "succeeded", currentStep: "succeeded" });
    const moduleVersionId = String(processed.resultModuleVersionId);
    expect(moduleVersionId.startsWith("modv_")).toBe(true);

    // The R1.13 property: every module-indexing embedding ran while NO
    // transaction was open.
    const moduleIndexEmbeds = provider.calls.slice(embedsBeforeBrew);
    expect(moduleIndexEmbeds.length).toBeGreaterThan(0);
    for (const call of moduleIndexEmbeds) {
      expect(call.duringTransaction).toBe(false);
    }

    // The chunks still commit durably with full 768-dim embeddings.
    const chunks = moduleChunksFor(store, moduleVersionId);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(chunk.sourceType).toBe("module_version");
    }

    const job = store.jobs.get(jobId)!;
    const steps = job.payload.stepsCompleted as string[];
    expect(steps).toContain("persist_draft");
    expect(steps).toContain("build_candidate_set");
    expect(jobEvents(store, jobId).filter((event) => event.eventType === "module.version.created")).toHaveLength(1);
    expect(jobEvents(store, jobId).filter((event) => event.eventType === "brew.job.succeeded")).toHaveLength(1);
  });

  it("fails the job closed (retryable) on embedding outage and resumes from the ModuleVersion checkpoint without duplicates", async () => {
    const { store, service, provider } = setup();
    const { actor } = await activate(service, "Người học retry sau lỗi embedding");
    const { jobId } = await queueBrewJob(service, actor, "retry");

    // The generation phases succeed; only the out-of-transaction indexing
    // embedding fails.
    provider.failNext = true;
    const failed = await service.processQueuedBrewJob(jobId, { workerId: "retry-worker" });
    expect(failed).toMatchObject({
      status: "failed_retryable",
      failureCode: "BREW_FAILED",
      currentStep: "persist_draft",
    });
    const moduleVersionId = String(failed.resultModuleVersionId);
    expect(moduleVersionId.startsWith("modv_")).toBe(true);
    // The committed checkpoint survives; no chunks landed and no duplicate
    // module was generated for the retry to consume.
    expect(store.moduleVersions.size).toBe(1);
    expect(moduleChunksFor(store, moduleVersionId)).toHaveLength(0);

    // A claimed retry (as the SQL queue worker would deliver it) resumes from
    // the checkpoint and finishes the indexing outside transactions.
    const embedsBeforeRetry = provider.calls.length;
    const resumed = await service.processQueuedBrewJob(jobId, {
      workerId: "retry-worker",
      alreadyClaimed: true,
    });
    expect(resumed).toMatchObject({ status: "succeeded", currentStep: "succeeded" });
    expect(String(resumed.resultModuleVersionId)).toBe(moduleVersionId);
    expect(store.moduleVersions.size).toBe(1);
    const retryEmbeds = provider.calls.slice(embedsBeforeRetry);
    expect(retryEmbeds.length).toBeGreaterThan(0);
    for (const call of retryEmbeds) {
      expect(call.duringTransaction).toBe(false);
    }
    expect(moduleChunksFor(store, moduleVersionId).length).toBeGreaterThan(0);
    expect(jobEvents(store, jobId).filter((event) => event.eventType === "module.version.created")).toHaveLength(1);
    expect(jobEvents(store, jobId).filter((event) => event.eventType === "brew.job.succeeded")).toHaveLength(1);
  });

  it("resumes indexing when a crash happened after the generation Unit of Work committed", async () => {
    const { store, service, provider } = setup();
    const { actor } = await activate(service, "Người học resume sau crash");
    const { jobId } = await queueBrewJob(service, actor, "resume");

    const first = await service.processQueuedBrewJob(jobId, { workerId: "resume-worker" });
    expect(first).toMatchObject({ status: "succeeded" });
    const moduleVersionId = String(first.resultModuleVersionId);

    // Simulate the crash window R1.13 explicitly supports: phase 3 committed
    // the ModuleVersion checkpoint, but the indexing phase never ran (chunks,
    // step markers and success events absent, job still running under lease).
    await store.runInTransaction(async (repositories) => {
      const job = repositories.jobs.get(jobId)!;
      job.status = "running";
      job.completedAt = null;
      job.leaseOwner = "resume-worker";
      job.leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
      job.payload = {
        ...job.payload,
        stepsCompleted: (job.payload.stepsCompleted as string[]).filter(
          (step) => step !== "persist_draft" && step !== "build_candidate_set",
        ),
      };
    });
    for (const chunk of moduleChunksFor(store, moduleVersionId)) store.chunks.delete(chunk.id);
    {
      const events = store.outboxEvents;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]!;
        if (
          event.causationId === jobId &&
          (event.eventType === "module.version.created" || event.eventType === "brew.job.succeeded")
        ) {
          events.splice(i, 1);
        }
      }
    }

    const embedsBeforeResume = provider.calls.length;
    const resumed = await service.processQueuedBrewJob(jobId, {
      workerId: "resume-worker",
      alreadyClaimed: true,
    });
    expect(resumed).toMatchObject({ status: "succeeded", currentStep: "succeeded" });
    expect(String(resumed.resultModuleVersionId)).toBe(moduleVersionId);
    expect(store.moduleVersions.size).toBe(1);
    const resumeEmbeds = provider.calls.slice(embedsBeforeResume);
    expect(resumeEmbeds.length).toBeGreaterThan(0);
    for (const call of resumeEmbeds) {
      expect(call.duringTransaction).toBe(false);
    }
    expect(moduleChunksFor(store, moduleVersionId).length).toBeGreaterThan(0);
    // Exactly-once domain events across the simulated crash + resume.
    expect(jobEvents(store, jobId).filter((event) => event.eventType === "module.version.created")).toHaveLength(1);
    expect(jobEvents(store, jobId).filter((event) => event.eventType === "brew.job.succeeded")).toHaveLength(1);
  });
});
