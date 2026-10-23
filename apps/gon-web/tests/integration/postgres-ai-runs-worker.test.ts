import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HttpAdkBrewAiProvider,
  LocalDeterministicBrewAiProvider,
  type GenerateModuleInput,
  type GenerateModuleWork,
} from "@/server/ai-provider";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { processClaimedBrewJob, runNextPostgresBrewJob } from "@/server/job-worker";
import { PostgresJobQueue } from "@/server/postgres-job-queue";
import {
  EventIdDeduplicatingOutboxSink,
  HttpOutboxEventSink,
} from "@/server/outbox-sink";
import { PostgresOutboxPublisher } from "@/server/postgres-outbox";
import type { OutboxEventRecord } from "@/server/types";
import type { SqlExecutor } from "@/server/postgres-search";
import {
  PostgresGonStore,
  type PostgresTransactionRunner,
} from "@/server/postgres-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";
import { runBrewWorkerLoop, runOutboxConsumerLoop } from "@/server/worker-runtime";

const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let executor: SqlExecutor;
let store: PostgresGonStore;

async function count(table: string, where = "true", params: unknown[] = []): Promise<number> {
  const result = await db.query<{ count: number | string }>(
    `select count(*)::int as count from ${table} where ${where}`,
    params as never[],
  );
  return Number((result.rows[0] as { count: number | string }).count);
}

/**
 * Hermetic ADK double: implements the exact `/v1/topic-check` and
 * `/v1/generate-module` HTTP contract the Python service validates, with the
 * deterministic local generator standing in for Gemini behind it.
 */
function adkStubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers["x-gon-service-token"] !== "svc-token-integration") {
      return new Response(
        JSON.stringify({
          status: 401,
          code: "SERVICE_AUTH_FAILED",
          title: "Service authentication failed",
          detail: "A valid X-GON-Service-Token header is required.",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (url.endsWith("/v1/topic-check")) {
      return new Response(
        JSON.stringify({
          schemaVersion: "gon.agent.topic-check.output/1.0",
          decision: "allow",
          reasonCodes: ["clear_learning_intent"],
          clarificationQuestions: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/v1/generate-module")) {
      const generateInput = body as unknown as GenerateModuleInput;
      const work: GenerateModuleWork = {
        contractInput: generateInput,
        local: {
          userId: "usr_adk_stub",
          projectTitle: generateInput.learningContext.goal,
          artifacts: generateInput.evidenceBundle.map((item) => ({
            artifactId: item.artifactId ?? item.sourceId,
            kind: item.uri ? "website_url" : "text",
            displayName: item.title,
            originUri: item.uri ?? null,
            isPrompt: false,
            chunks: [{ text: item.content, locator: "evidence-1", weight: 1 }],
          })),
        },
      };
      const generated = await new LocalDeterministicBrewAiProvider().generateModule(work);
      return new Response(JSON.stringify(generated.output), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

async function createQueuedBrew(service: GonService, actor: Actor, suffix: string) {
  const project = (await service.createProject(
    actor,
    {
      title: `Thủy triều ${suffix}`,
      prompt: "Vì sao thủy triều và phù sa phải được hiểu qua bằng chứng theo mùa?",
      goal: "Hiểu hệ thống thủy triều qua bằng chứng",
      learningMode: "deep_mastery",
      depth: "standard",
      timeBudgetMinutes: 30,
      locale: "vi-VN",
    },
    { idempotencyKey: `ai-project-${suffix}` },
  )).data;
  const search = (await service.createSearchAttempt(
    actor,
    String(project.id),
    {},
    { idempotencyKey: `ai-search-${suffix}` },
  )).data;
  const queued = (await service.createBrewJob(
    actor,
    String(project.id),
    { searchAttemptId: String(search.id), confirmed: true },
    { idempotencyKey: `ai-brew-${suffix}` },
  )).data;
  return { projectId: String(project.id), jobId: String(queued.id) };
}

let sequence = 0;

async function activate(service: GonService, name: string): Promise<Actor> {
  const user = await service.ensureDevUser(name);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: `req_ai_${(sequence += 1)}`,
  };
  sequence += 1;
  const inviteCode = `GON-ALPHA-AIRUNS-${sequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode,
  });
  return actor;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
  expect(files).toHaveLength(9);
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }

  const runner: PostgresTransactionRunner = {
    async transaction(work) {
      return db.transaction(async (tx) =>
        work({
          query: async (text, params) => tx.query(text, params as never[]),
        }),
      );
    },
  };
  store = new PostgresGonStore(runner);
  executor = { query: async (text, params = []) => db.query(text, params as never[]) };
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("ai_runs PostgreSQL persistence through the domain Unit of Work", () => {
  it("persists safe AI-run telemetry with the job reference and schema metadata", async () => {
    const service = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
      brewExecutionMode: "queued",
      brewAiProvider: new HttpAdkBrewAiProvider({
        baseUrl: "https://adk.internal.example",
        serviceToken: "svc-token-integration",
        fetch: adkStubFetch(),
      }),
      featureFlags: { brew_enabled: true },
    });
    const actor = await activate(service, "Người học ai_runs");
    const { jobId } = await createQueuedBrew(service, actor, "airuns1");

    const processed = await service.processQueuedBrewJob(jobId, { workerId: "pglite-ai-worker" });
    expect(processed.status).toBe("succeeded");

    const runs = await db.query<Record<string, unknown>>(
      "select * from ai_runs where job_id = $1 order by id",
      [jobId],
    );
    expect(runs.rows).toHaveLength(2);
    expect(runs.rows[0]).toMatchObject({
      job_id: jobId,
      operation: "topic_check",
      provider: "gon-adk-http",
      finish_reason: "completed",
      error_code: null,
    });
    expect(runs.rows[1]).toMatchObject({
      job_id: jobId,
      operation: "generate_module",
      provider: "gon-adk-http",
      error_code: null,
    });
    expect(String(runs.rows[1].evidence_bundle_hash)).toMatch(/^[a-f0-9]{64}$/);
    expect(runs.rows[1].input_schema_version).toBe("gon.agent.generate-module.input/1.0");
    // Safe telemetry only: no evidence/prompt payload columns exist on ai_runs.
    expect(JSON.stringify(runs.rows)).not.toContain("Thủy triều chịu ảnh hưởng");

    const versions = await count("module_versions");
    expect(versions).toBeGreaterThan(0);
    const versionRow = await db.query<{ publication_status: string; visibility: string }>(
      "select publication_status, visibility from module_versions order by created_at desc limit 1",
    );
    expect(versionRow.rows[0]).toMatchObject({
      publication_status: "draft_private",
      visibility: "private",
    });
  }, 240_000);

  it("enforces the async_jobs foreign key on ai_runs", async () => {
    await expect(
      db.query(
        `insert into ai_runs
           (job_id, operation, provider, model_id, agent_pipeline_version,
            input_schema_version, output_schema_version)
         values ('job_does_not_exist', 'topic_check', 'test', 'm', 'p', 'i', 'o')`,
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  }, 60_000);
});

describe("durable worker runtime over PostgreSQL (PGlite execution)", () => {
  it("claims, processes and completes a queued Brew job through the packaged loop", async () => {
    const service = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
      brewExecutionMode: "queued",
      brewAiProvider: new HttpAdkBrewAiProvider({
        baseUrl: "https://adk.internal.example",
        serviceToken: "svc-token-integration",
        fetch: adkStubFetch(),
      }),
      featureFlags: { brew_enabled: true },
    });
    const actor = await activate(service, "Người học worker loop");
    const { jobId } = await createQueuedBrew(service, actor, "loop1");

    const queue = new PostgresJobQueue(executor);
    const aiRunsBefore = await count("ai_runs", "job_id = $1", [jobId]);
    expect(aiRunsBefore).toBe(0);

    const result = await runBrewWorkerLoop({
      queue,
      service,
      workerId: "pglite-runtime-worker",
      leaseMs: 60_000,
      concurrency: 1,
      heartbeatIntervalMs: 1_000,
      idleDelayMs: 50,
      maxIdlePolls: 3,
    });

    expect(result.claimed).toBeGreaterThanOrEqual(1);
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    const jobRow = await db.query<{ status: string; attempt_count: number; lease_owner: string | null }>(
      "select status, attempt_count, lease_owner from async_jobs where id = $1",
      [jobId],
    );
    expect(jobRow.rows[0]).toMatchObject({
      status: "succeeded",
      lease_owner: null,
    });
    expect(await count("ai_runs", "job_id = $1", [jobId])).toBe(2);
  }, 240_000);

  it("runNextPostgresBrewJob stays available as the one-shot entry with heartbeats", async () => {
    const service = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
      brewExecutionMode: "queued",
      brewAiProvider: new HttpAdkBrewAiProvider({
        baseUrl: "https://adk.internal.example",
        serviceToken: "svc-token-integration",
        fetch: adkStubFetch(),
      }),
      featureFlags: { brew_enabled: true },
    });
    const actor = await activate(service, "Người học one-shot");
    const { jobId } = await createQueuedBrew(service, actor, "oneshot1");

    const queue = new PostgresJobQueue(executor);
    const result = await runNextPostgresBrewJob({
      queue,
      service,
      workerId: "pglite-oneshot-worker",
      leaseMs: 60_000,
      heartbeatIntervalMs: 1_000,
    });
    expect(result.claimed).toBe(true);
    if (!result.claimed) throw new Error("expected claim");
    expect(result.job).toMatchObject({ id: jobId, status: "succeeded" });
    expect(await count("ai_runs", "job_id = $1", [jobId])).toBe(2);

    // Replaying processing for an already-succeeded job must be a no-op:
    // no duplicate module, no state overwrite, no error.
    const replay = await processClaimedBrewJob({
      queue,
      service,
      workerId: "pglite-stray-worker",
      claimed: { id: jobId },
      leaseMs: 60_000,
    }).catch((error: unknown) => error);
    expect(replay).not.toBeInstanceOf(Error);
    const finalRow = await db.query<{ status: string }>(
      "select status from async_jobs where id = $1",
      [jobId],
    );
    expect(finalRow.rows[0]?.status).toBe("succeeded");
  }, 240_000);
});

describe("idempotent outbox consumer over PostgreSQL (PGlite execution)", () => {
  it("delivers claimed events through the deduplicating HTTP sink exactly once", async () => {
    const delivered: string[] = [];
    const targetSink = new HttpOutboxEventSink({
      endpointUrl: "https://events.internal.example/v1/outbox-events",
      serviceToken: "sink-token-integration",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as OutboxEventRecord;
        delivered.push(String(body.eventId));
        return new Response("{}", { status: 202 });
      }) as typeof fetch,
    });
    const sink = new EventIdDeduplicatingOutboxSink(targetSink);
    const publisher = new PostgresOutboxPublisher(executor);

    // Seed two pending events tied to an existing job row.
    const existingJob = await db.query<{ id: string }>(
      "select id from async_jobs order by created_at limit 1",
    );
    const jobId = String(existingJob.rows[0]?.id ?? "");
    expect(jobId).not.toBe("");
    for (const eventId of ["evt_outboxpg1", "evt_outboxpg2"]) {
      await db.query(
        `insert into outbox_events
           (event_id, event_type, event_version, occurred_at, aggregate_type,
            aggregate_id, actor_type, actor_id, correlation_id, data,
            publish_state, available_at, publish_attempt_count)
         values ($1, 'brew.job.succeeded', 1, now(), 'brew_job', $2,
           'user', 'usr_outbox', 'req_outbox', '{"ok": true}'::jsonb,
           'pending', now(), 0)`,
        [eventId, jobId],
      );
    }

    const first = await runOutboxConsumerLoop({
      publisher,
      sink,
      batchSize: 10,
      idleDelayMs: 50,
      maxIdleBatches: 1,
    });
    // The shared test database has pending events from earlier journeys; the
    // consumer drains them all exactly once too.
    expect(first.published).toBeGreaterThanOrEqual(2);
    expect(delivered.filter((id) => id === "evt_outboxpg1")).toHaveLength(1);
    expect(delivered.filter((id) => id === "evt_outboxpg2")).toHaveLength(1);
    expect(new Set(delivered).size).toBe(delivered.length);

    // A second pass with the same dedupe sink must not redeliver anything:
    // published rows are not reclaimed, and the sink would drop duplicates.
    const second = await runOutboxConsumerLoop({
      publisher,
      sink,
      batchSize: 10,
      idleDelayMs: 50,
      maxIdleBatches: 1,
    });
    expect(second.claimed).toBe(0);
    expect(delivered).toHaveLength(first.published);

    const states = await db.query<{ publish_state: string }>(
      "select publish_state from outbox_events where event_id in ('evt_outboxpg1','evt_outboxpg2')",
    );
    expect(states.rows.map((row) => row.publish_state)).toEqual(["published", "published"]);
  }, 240_000);
});
