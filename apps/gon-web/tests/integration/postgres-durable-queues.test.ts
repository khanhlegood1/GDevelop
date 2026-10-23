import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresJobQueue } from "@/server/postgres-job-queue";
import { PostgresOutboxPublisher } from "@/server/postgres-outbox";
import type { SqlExecutor } from "@/server/postgres-search";

const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");
const ownerId = "usr_r13queueowner";

let db: PGlite;
let queue: PostgresJobQueue;
let publisher: PostgresOutboxPublisher;

function fingerprint(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

async function insertJob(input: {
  id: string;
  status?: string;
  jobType?: string;
  attemptCount?: number;
  maxAttempts?: number;
  availableOffsetMs?: number;
  createdOffsetMs?: number;
  leaseOwner?: string | null;
  leaseOffsetMs?: number | null;
}) {
  await db.query(
    `
    insert into async_jobs
      (id, job_type, owner_user_id, aggregate_type, aggregate_id, status,
       idempotency_key, input_fingerprint, attempt_count, max_attempts,
       payload, available_at, lease_owner, lease_expires_at, created_at, started_at)
    values
      ($1, $2, $3, 'learning_project', 'prj_r13queue', $4,
       $5, $6, $7, $8, '{}'::jsonb,
       clock_timestamp() + ($9::double precision * interval '1 millisecond'),
       $10,
       case when $11::double precision is null then null
            else clock_timestamp() + ($11::double precision * interval '1 millisecond') end,
       clock_timestamp() + ($12::double precision * interval '1 millisecond'),
       case when $4 = 'running' then clock_timestamp() else null end)
    `,
    [
      input.id,
      input.jobType ?? "brew_module",
      ownerId,
      input.status ?? "queued",
      `idem-${input.id}`,
      fingerprint(input.id),
      input.attemptCount ?? 0,
      input.maxAttempts ?? 3,
      input.availableOffsetMs ?? 0,
      input.leaseOwner ?? null,
      input.leaseOffsetMs ?? null,
      input.createdOffsetMs ?? 0,
    ],
  );
}

async function insertOutbox(input: {
  id: string;
  state?: string;
  occurredOffsetMs?: number;
  availableOffsetMs?: number;
  attempts?: number;
}) {
  await db.query(
    `
    insert into outbox_events
      (event_id, event_type, event_version, occurred_at, aggregate_type,
       aggregate_id, actor_type, actor_id, correlation_id, data,
       publish_state, available_at, publish_attempt_count)
    values
      ($1, 'brew.job.queued', 1,
       clock_timestamp() + ($2::double precision * interval '1 millisecond'),
       'brew_job', 'job_r13ready1', 'user', $3, 'req_r13queue', '{}'::jsonb,
       $4,
       clock_timestamp() + ($5::double precision * interval '1 millisecond'),
       $6)
    `,
    [
      input.id,
      input.occurredOffsetMs ?? 0,
      ownerId,
      input.state ?? "pending",
      input.availableOffsetMs ?? 0,
      input.attempts ?? 0,
    ],
  );
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

  const executor: SqlExecutor = {
    query: async (text, params = []) => db.query(text, params as never[]),
  };
  queue = new PostgresJobQueue(executor);
  publisher = new PostgresOutboxPublisher(executor);

  await db.query("insert into gon_users (id, status) values ($1, 'active')", [ownerId]);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL durable job queue (PGlite execution)", () => {
  it("claims in availability order, fences by lease and retries with backoff", async () => {
    await insertJob({ id: "job_r13future", availableOffsetMs: 3_600_000, createdOffsetMs: -10 * 60_000 });
    await insertJob({ id: "job_r13ready2", availableOffsetMs: -60_000, createdOffsetMs: -2 * 60_000 });
    await insertJob({ id: "job_r13ready1", availableOffsetMs: -120_000, createdOffsetMs: -3 * 60_000 });

    const claimed = await queue.claimNext({
      workerId: "worker-a",
      jobTypes: ["brew_module"],
      leaseMs: 60_000,
    });
    expect(claimed).toMatchObject({
      id: "job_r13ready1",
      status: "running",
      attemptCount: 1,
      leaseOwner: "worker-a",
    });
    expect(Date.parse(claimed?.leaseExpiresAt ?? "")).toBeGreaterThan(Date.now());

    await expect(queue.heartbeat("job_r13ready1", { workerId: "worker-b" })).resolves.toBeNull();
    await expect(
      queue.heartbeat("job_r13ready1", { workerId: "worker-a", currentStep: "generate" }),
    ).resolves.toMatchObject({ currentStep: "generate", leaseOwner: "worker-a" });

    await expect(
      queue.fail("job_r13ready1", {
        workerId: "worker-b",
        failureCode: "PROVIDER_TIMEOUT",
        retryable: true,
      }),
    ).resolves.toBeNull();

    const retry = await queue.fail("job_r13ready1", {
      workerId: "worker-a",
      failureCode: "PROVIDER_TIMEOUT",
      retryable: true,
      retryDelayMs: 60_000,
    });
    expect(retry).toMatchObject({
      status: "failed_retryable",
      failureCode: "PROVIDER_TIMEOUT",
      retryable: true,
      completedAt: null,
      leaseOwner: null,
    });
    expect(Date.parse(retry?.availableAt ?? "")).toBeGreaterThan(Date.now() + 40_000);

    const second = await queue.claimNext({ workerId: "worker-b", jobTypes: ["brew_module"] });
    expect(second?.id).toBe("job_r13ready2");
    await expect(queue.complete("job_r13ready2", { workerId: "worker-a" })).resolves.toBeNull();
    await expect(
      queue.complete("job_r13ready2", { workerId: "worker-b", currentStep: "done" }),
    ).resolves.toMatchObject({ status: "succeeded", currentStep: "done", leaseOwner: null });

    await db.query("update async_jobs set available_at = clock_timestamp() - interval '1 second' where id = 'job_r13ready1'");
    const attempt2 = await queue.claimNext({ workerId: "worker-c", jobTypes: ["brew_module"] });
    expect(attempt2).toMatchObject({ id: "job_r13ready1", attemptCount: 2 });
    await queue.fail("job_r13ready1", {
      workerId: "worker-c",
      failureCode: "PROVIDER_TIMEOUT",
      retryable: true,
      retryDelayMs: 0,
    });

    const attempt3 = await queue.claimNext({ workerId: "worker-c", jobTypes: ["brew_module"] });
    expect(attempt3).toMatchObject({ id: "job_r13ready1", attemptCount: 3 });
    const terminal = await queue.fail("job_r13ready1", {
      workerId: "worker-c",
      failureCode: "PROVIDER_TIMEOUT",
      retryable: true,
    });
    expect(terminal).toMatchObject({ status: "failed_terminal", retryable: false });
    expect(terminal?.completedAt).toBeTruthy();
  }, 120_000);

  it("reconciles expired leases without touching an unexpired lease", async () => {
    await insertJob({
      id: "job_r13expiredretry",
      status: "running",
      attemptCount: 1,
      leaseOwner: "dead-worker",
      leaseOffsetMs: -1_000,
      availableOffsetMs: -120_000,
    });
    await insertJob({
      id: "job_r13expiredterminal",
      status: "running",
      attemptCount: 3,
      leaseOwner: "dead-worker",
      leaseOffsetMs: -1_000,
      availableOffsetMs: -110_000,
    });
    await insertJob({
      id: "job_r13livelease",
      status: "running",
      attemptCount: 1,
      leaseOwner: "live-worker",
      leaseOffsetMs: 60_000,
      availableOffsetMs: -100_000,
    });

    const reconciled = await queue.reconcileExpiredLeases({ jobTypes: ["brew_module"] });
    const byId = new Map(reconciled.map((job) => [job.id, job]));
    expect(byId.get("job_r13expiredretry")).toMatchObject({
      status: "failed_retryable",
      failureCode: "JOB_LEASE_EXPIRED",
      leaseOwner: null,
    });
    expect(byId.get("job_r13expiredterminal")).toMatchObject({
      status: "failed_terminal",
      failureCode: "JOB_LEASE_EXPIRED",
      leaseOwner: null,
    });
    expect(byId.has("job_r13livelease")).toBe(false);

    await insertJob({
      id: "job_r13directreclaim",
      status: "running",
      attemptCount: 1,
      leaseOwner: "dead-worker",
      leaseOffsetMs: -1_000,
      availableOffsetMs: -90_000,
    });
    const reclaimed = await queue.claimNext({ workerId: "worker-d", jobTypes: ["brew_module"] });
    expect(reclaimed).toMatchObject({
      id: "job_r13directreclaim",
      status: "running",
      attemptCount: 2,
      leaseOwner: "worker-d",
    });

    const stats = await queue.getStats();
    expect(stats.succeeded).toBeGreaterThanOrEqual(1);
    expect(stats.failedTerminal).toBeGreaterThanOrEqual(2);
    expect(stats.expiredLeases).toBe(0);
  }, 120_000);
});

describe("PostgreSQL transactional outbox publisher (PGlite execution)", () => {
  it("claims available and stale events, then fences stale completions by attempt", async () => {
    await insertOutbox({ id: "evt_r13first", occurredOffsetMs: -180_000, availableOffsetMs: -1_000 });
    await insertOutbox({ id: "evt_r13second", occurredOffsetMs: -120_000, availableOffsetMs: -1_000 });
    await insertOutbox({ id: "evt_r13future", occurredOffsetMs: -60_000, availableOffsetMs: 3_600_000 });
    await insertOutbox({
      id: "evt_r13stale",
      state: "publishing",
      occurredOffsetMs: -90_000,
      availableOffsetMs: -1_000,
      attempts: 1,
    });
    await insertOutbox({
      id: "evt_r13exhausted",
      state: "failed",
      occurredOffsetMs: -30_000,
      availableOffsetMs: -1_000,
      attempts: 5,
    });

    const claimed = await publisher.claimBatch({ limit: 10, leaseMs: 60_000, maxAttempts: 5 });
    expect(claimed.map((event) => event.eventId)).toEqual([
      "evt_r13first",
      "evt_r13second",
      "evt_r13stale",
    ]);
    expect(claimed.map((event) => event.publishAttemptCount)).toEqual([1, 1, 2]);

    await expect(publisher.markPublished(claimed[0])).resolves.toBe(true);
    await expect(
      publisher.markFailed(claimed[1], { errorCode: "SINK_UNAVAILABLE", retryDelayMs: 60_000 }),
    ).resolves.toBe(true);

    await db.query(
      "update outbox_events set available_at = clock_timestamp() - interval '1 second' where event_id = 'evt_r13stale'",
    );
    const reclaimed = await publisher.claimBatch({ limit: 1, leaseMs: 60_000, maxAttempts: 5 });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({ eventId: "evt_r13stale", publishAttemptCount: 3 });

    await expect(publisher.markPublished(claimed[2])).resolves.toBe(false);
    await expect(publisher.markPublished(reclaimed[0])).resolves.toBe(true);
  }, 120_000);

  it("publishes through a sink and isolates one event failure", async () => {
    await insertOutbox({ id: "evt_r13batchok", occurredOffsetMs: -20_000, availableOffsetMs: -1_000 });
    await insertOutbox({ id: "evt_r13batchfail", occurredOffsetMs: -10_000, availableOffsetMs: -1_000 });

    const result = await publisher.publishBatch(
      {
        async publish(event) {
          if (event.eventId === "evt_r13batchfail") {
            throw Object.assign(new Error("provider response must not be persisted"), {
              code: "sink_timeout",
            });
          }
        },
      },
      { limit: 10, retryDelayMs: 60_000, maxAttempts: 5 },
    );

    expect(result).toMatchObject({ claimed: 2, published: 1, failed: 1, stale: 0 });
    expect(result.failures).toEqual([{ eventId: "evt_r13batchfail", errorCode: "SINK_TIMEOUT" }]);

    const failed = await db.query<{ publish_state: string; last_error_code: string }>(
      "select publish_state, last_error_code from outbox_events where event_id = 'evt_r13batchfail'",
    );
    expect(failed.rows[0]).toEqual({ publish_state: "failed", last_error_code: "SINK_TIMEOUT" });

    const stats = await publisher.getStats({ maxAttempts: 5 });
    expect(stats.published).toBeGreaterThanOrEqual(3);
    expect(stats.exhausted).toBe(1);
    expect(stats.stalePublishing).toBe(0);
  }, 120_000);
});
