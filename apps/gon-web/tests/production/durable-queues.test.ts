import { describe, expect, it, vi } from "vitest";
import { PostgresJobQueue } from "@/server/postgres-job-queue";
import { PostgresOutboxPublisher } from "@/server/postgres-outbox";
import type { SqlExecutor } from "@/server/postgres-search";
import type { OutboxEventRecord } from "@/server/types";

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_test123",
    job_type: "brew_module",
    owner_user_id: "usr_test123",
    aggregate_type: "learning_project",
    aggregate_id: "prj_test123",
    status: "running",
    current_step: null,
    idempotency_key: "job-key-123",
    input_fingerprint: "a".repeat(64),
    attempt_count: 1,
    max_attempts: 3,
    estimated_cost_units: "1",
    actual_cost_units: "0",
    failure_code: null,
    retryable: false,
    available_at: new Date("2026-10-23T00:00:00.000Z"),
    lease_owner: "worker-a",
    lease_expires_at: new Date("2026-10-23T00:01:00.000Z"),
    created_at: new Date("2026-10-23T00:00:00.000Z"),
    started_at: new Date("2026-10-23T00:00:00.000Z"),
    completed_at: null,
    cancelled_at: null,
    payload: { projectId: "prj_test123" },
    ...overrides,
  };
}

function outboxRow(eventId: string, attempt = 1) {
  return {
    event_id: eventId,
    event_type: "brew.job.queued",
    event_version: 1,
    occurred_at: new Date("2026-10-23T00:00:00.000Z"),
    aggregate_type: "brew_job",
    aggregate_id: "job_test123",
    actor_type: "user",
    actor_id: "usr_test123",
    correlation_id: "req_test123",
    causation_id: null,
    data: { projectId: "prj_test123" },
    publish_state: "publishing",
    available_at: new Date("2026-10-23T00:01:00.000Z"),
    published_at: null,
    publish_attempt_count: attempt,
    last_error_code: null,
  };
}

describe("PostgreSQL durable job queue contract", () => {
  it("claims with SKIP LOCKED and maps lease fields", async () => {
    const queries: Array<{ text: string; params?: unknown[] }> = [];
    const executor: SqlExecutor = {
      async query(text, params) {
        queries.push({ text, params });
        return { rows: [jobRow()] };
      },
    };
    const queue = new PostgresJobQueue(executor);

    const claimed = await queue.claimNext({
      workerId: "worker-a",
      jobTypes: ["brew_module"],
      leaseMs: 60_000,
    });

    expect(claimed).toMatchObject({
      id: "job_test123",
      status: "running",
      attemptCount: 1,
      leaseOwner: "worker-a",
      leaseExpiresAt: "2026-10-23T00:01:00.000Z",
    });
    expect(queries[0]?.text).toContain("for update skip locked");
    expect(queries[0]?.text).toContain("attempt_count = job.attempt_count + 1");
    expect(queries[0]?.params?.[2]).toBe('{"brew_module"}');
  });

  it("rejects invalid worker and failure codes before touching SQL", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const queue = new PostgresJobQueue({ query });

    await expect(queue.claimNext({ workerId: "bad worker!" })).rejects.toThrow(/workerId/);
    await expect(
      queue.fail("job_test123", {
        workerId: "worker-a",
        failureCode: "provider exploded",
        retryable: true,
      }),
    ).rejects.toThrow(/failureCode/);
    expect(query).not.toHaveBeenCalled();
  });

  it("fences heartbeat and completion by lease owner and expiry", async () => {
    const texts: string[] = [];
    const executor: SqlExecutor = {
      async query(text) {
        texts.push(text);
        return { rows: [] };
      },
    };
    const queue = new PostgresJobQueue(executor);

    await expect(queue.heartbeat("job_test123", { workerId: "worker-b" })).resolves.toBeNull();
    await expect(queue.complete("job_test123", { workerId: "worker-b" })).resolves.toBeNull();
    expect(texts.every((text) => text.includes("lease_owner = $2"))).toBe(true);
    expect(texts.every((text) => text.includes("lease_expires_at > clock_timestamp()"))).toBe(true);
  });
});

describe("PostgreSQL transactional outbox publisher contract", () => {
  it("publishes a batch, records one failure and never copies raw error messages", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const executor: SqlExecutor = {
      async query(text, params) {
        calls.push({ text, params });
        if (text.includes("with candidate")) {
          return { rows: [outboxRow("evt_first123"), outboxRow("evt_second123")] };
        }
        return { rows: [{ event_id: String(params?.[0]) }] };
      },
    };
    const publisher = new PostgresOutboxPublisher(executor);
    const sink = {
      async publish(event: OutboxEventRecord) {
        if (event.eventId === "evt_second123") {
          throw Object.assign(new Error("secret provider payload"), { code: "provider_down" });
        }
      },
    };

    const result = await publisher.publishBatch(sink, { limit: 2, retryDelayMs: 1_000 });

    expect(result).toMatchObject({ claimed: 2, published: 1, failed: 1, stale: 0 });
    expect(result.failures).toEqual([{ eventId: "evt_second123", errorCode: "PROVIDER_DOWN" }]);
    expect(JSON.stringify(calls)).not.toContain("secret provider payload");
    expect(calls[0]?.text).toContain("for update skip locked");
    expect(calls[2]?.params).toContain("PROVIDER_DOWN");
  });

  it("uses publish attempt count as the completion fencing token", async () => {
    const executor: SqlExecutor = {
      async query(text, params) {
        expect(text).toContain("publish_attempt_count = $2");
        expect(params).toEqual(["evt_first123", 1]);
        return { rows: [] };
      },
    };
    const publisher = new PostgresOutboxPublisher(executor);
    const claimed: OutboxEventRecord = {
      eventId: "evt_first123",
      eventType: "brew.job.queued",
      eventVersion: 1,
      occurredAt: "2026-10-23T00:00:00.000Z",
      aggregateType: "brew_job",
      aggregateId: "job_test123",
      actor: { type: "user", id: "usr_test123" },
      correlationId: "req_test123",
      causationId: null,
      data: {},
      publishState: "publishing",
      availableAt: "2026-10-23T00:01:00.000Z",
      publishedAt: null,
      publishAttemptCount: 1,
      lastErrorCode: null,
    };

    await expect(publisher.markPublished(claimed)).resolves.toBe(false);
  });

  it("requires a real sink instead of silently acknowledging events", async () => {
    const publisher = new PostgresOutboxPublisher({ async query() { return { rows: [] }; } });
    await expect(
      publisher.publishBatch(undefined as never),
    ).rejects.toThrow(/outbox sink/);
  });
});
