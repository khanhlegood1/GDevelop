import { describe, expect, it, vi } from "vitest";
import type { BrewJobQueuePort, BrewJobProcessorPort } from "@/server/job-worker";
import {
  EventIdDeduplicatingOutboxSink,
  HttpOutboxEventSink,
  OutboxSinkError,
  createOutboxSinkFromEnv,
  inspectOutboxSinkConfig,
} from "@/server/outbox-sink";
import type { OutboxEventSink } from "@/server/postgres-outbox";
import type { OutboxEventRecord } from "@/server/types";
import type { JsonRecord } from "@/server/validation";
import {
  installProcessSignalHandlers,
  runBrewWorkerLoop,
  runOutboxConsumerLoop,
  startGonWorkerRuntime,
} from "@/server/worker-runtime";

function jobDto(id: string, status = "succeeded"): JsonRecord {
  return { id, status, resultModuleVersionId: `modv_${id}` };
}

interface FakeQueueOptions {
  jobs?: Array<{ id: string; currentStep?: string | null }>;
  onProcess?: (jobId: string) => Promise<void> | void;
}

function fakeQueue(options: FakeQueueOptions = {}) {
  const pending = [...(options.jobs ?? [])];
  const heartbeats: Array<{ jobId: string; workerId: string }> = [];
  const failed: Array<{ jobId: string; failureCode: string }> = [];
  const claimOrder: string[] = [];
  let active = 0;
  let maxActive = 0;

  const queue: BrewJobQueuePort = {
    async claimNext() {
      const next = pending.shift();
      if (!next) return null;
      claimOrder.push(next.id);
      return {
        id: next.id,
        jobType: "brew_module",
        ownerUserId: "usr_test",
        aggregateType: "learning_project",
        aggregateId: "prj_test",
        status: "running",
        currentStep: next.currentStep ?? null,
        idempotencyKey: "idem",
        inputFingerprint: "a".repeat(64),
        attemptCount: 1,
        maxAttempts: 3,
        estimatedCostUnits: 1,
        actualCostUnits: 0,
        failureCode: null,
        retryable: false,
        availableAt: new Date().toISOString(),
        leaseOwner: "worker-test",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        cancelledAt: null,
        payload: {},
      };
    },
    async reconcileExpiredLeases() {
      return [];
    },
    async heartbeat(jobId, opts) {
      heartbeats.push({ jobId, workerId: opts.workerId });
      return {
        id: jobId,
        jobType: "brew_module",
        ownerUserId: "usr_test",
        aggregateType: "learning_project",
        aggregateId: "prj_test",
        status: "running",
        currentStep: null,
        idempotencyKey: "idem",
        inputFingerprint: "a".repeat(64),
        attemptCount: 1,
        maxAttempts: 3,
        estimatedCostUnits: 1,
        actualCostUnits: 0,
        failureCode: null,
        retryable: false,
        availableAt: new Date().toISOString(),
        leaseOwner: opts.workerId,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        cancelledAt: null,
        payload: {},
      };
    },
    async fail(jobId, opts) {
      failed.push({ jobId, failureCode: opts.failureCode });
      return null;
    },
  };

  const service: BrewJobProcessorPort = {
    async processQueuedBrewJob(jobId) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await options.onProcess?.(jobId);
        return jobDto(jobId);
      } finally {
        active -= 1;
      }
    },
  };

  return { queue, service, heartbeats, failed, claimOrder, maxActiveOf: () => maxActive };
}

const instantSleep = async (): Promise<void> => undefined;

function env(input: Record<string, string>): NodeJS.ProcessEnv {
  return input as NodeJS.ProcessEnv;
}

describe("Brew worker loop (heartbeat, concurrency budget, graceful shutdown)", () => {
  it("processes claimed jobs, exits after idle polls, and never exceeds the concurrency budget", async () => {
    const gates = new Map<string, () => void>();
    const { queue, service, maxActiveOf } = fakeQueue({
      jobs: [{ id: "job_a" }, { id: "job_b" }, { id: "job_c" }],
      onProcess: (jobId) =>
        new Promise<void>((resolve) => {
          gates.set(jobId, resolve);
        }),
    });

    const loopPromise = runBrewWorkerLoop({
      queue,
      service,
      workerId: "worker-test",
      concurrency: 2,
      idleDelayMs: 50,
      maxIdlePolls: 2,
      sleep: instantSleep,
    });

    // Two jobs run in parallel; the third waits for a free slot.
    await vi.waitFor(() => expect(gates.size).toBe(2));
    expect(maxActiveOf()).toBe(2);
    gates.get("job_a")?.();
    await vi.waitFor(() => expect(gates.size).toBe(3));
    gates.get("job_b")?.();
    gates.get("job_c")?.();

    const result = await loopPromise;
    expect(result).toMatchObject({ claimed: 3, succeeded: 3, failed: 0, idlePolls: 2 });
    expect(maxActiveOf()).toBe(2);
  });

  it("renews the lease with heartbeats while a job is processing", async () => {
    const { queue, service, heartbeats } = fakeQueue({
      jobs: [{ id: "job_hb" }],
      onProcess: async () => {
        // Outlast one heartbeat tick (the tick uses a real timer).
        await new Promise((resolve) => setTimeout(resolve, 1_100));
      },
    });

    const result = await runBrewWorkerLoop({
      queue,
      service,
      workerId: "worker-hb",
      heartbeatIntervalMs: 1_000,
      idleDelayMs: 50,
      maxIdlePolls: 1,
    });

    expect(result.claimed).toBe(1);
    expect(result.heartbeats).toBeGreaterThanOrEqual(1);
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    expect(heartbeats[0]).toMatchObject({ jobId: "job_hb", workerId: "worker-hb" });
  }, 10_000);

  it("keeps running after an individual job failure and records the fenced failure", async () => {
    let calls = 0;
    const { queue, service, failed } = fakeQueue({
      jobs: [{ id: "job_boom" }, { id: "job_ok" }],
      onProcess: (jobId) => {
        calls += 1;
        if (jobId === "job_boom") throw new Error("worker crash");
      },
    });

    const result = await runBrewWorkerLoop({
      queue,
      service,
      workerId: "worker-resilient",
      idleDelayMs: 50,
      maxIdlePolls: 1,
      sleep: instantSleep,
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({ claimed: 2, succeeded: 1, failed: 1 });
    expect(failed).toEqual([{ jobId: "job_boom", failureCode: "BREW_WORKER_FAILED" }]);
  });

  it("stops claiming on graceful shutdown but drains in-flight jobs", async () => {
    const controller = new AbortController();
    let processed = 0;
    const gate: { release: (() => void) | null } = { release: null };
    const { queue, service } = fakeQueue({
      jobs: [{ id: "job_1" }, { id: "job_2" }, { id: "job_3" }],
      onProcess: async (jobId) => {
        processed += 1;
        if (jobId === "job_1") {
          await new Promise<void>((resolve) => {
            gate.release = resolve;
          });
        }
      },
    });

    const loopPromise = runBrewWorkerLoop({
      queue,
      service,
      workerId: "worker-shutdown",
      concurrency: 1,
      idleDelayMs: 50,
      sleep: instantSleep,
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(processed).toBe(1));
    controller.abort();
    gate.release?.();
    const result = await loopPromise;

    expect(result.claimed).toBe(1);
    expect(processed).toBe(1); // in-flight drained, no new claims after abort
    expect(result.succeeded).toBe(1);
  });

  it("validates the loop budget bounds before starting", async () => {
    const { queue, service } = fakeQueue();
    await expect(
      runBrewWorkerLoop({ queue, service, workerId: "w", concurrency: 0 }),
    ).rejects.toThrow(/concurrency/);
    await expect(
      runBrewWorkerLoop({ queue, service, workerId: "w", heartbeatIntervalMs: 10 }),
    ).rejects.toThrow(/heartbeatIntervalMs/);
    await expect(
      runBrewWorkerLoop({ queue, service, workerId: "w", idleDelayMs: 1 }),
    ).rejects.toThrow(/idleDelayMs/);
  });
});

function outboxEvent(eventId: string): OutboxEventRecord {
  return {
    eventId,
    eventType: "brew.job.succeeded",
    eventVersion: 1,
    occurredAt: new Date("2026-10-23T00:00:00.000Z").toISOString(),
    aggregateType: "brew_job",
    aggregateId: "job_test",
    actor: { type: "user", id: "usr_test" },
    correlationId: "req_test",
    causationId: null,
    data: { ok: true },
    publishState: "publishing",
    availableAt: new Date("2026-10-23T00:00:00.000Z").toISOString(),
    publishedAt: null,
    publishAttemptCount: 1,
    lastErrorCode: null,
  };
}

describe("idempotent outbox sink and consumer loop", () => {
  it("collapses duplicate deliveries of the same event ID in one runtime", async () => {
    const delivered: string[] = [];
    const target: OutboxEventSink = {
      async publish(event) {
        delivered.push(event.eventId);
      },
    };
    const sink = new EventIdDeduplicatingOutboxSink(target);

    await sink.publish(outboxEvent("evt_dup"));
    await sink.publish(outboxEvent("evt_dup"));
    await sink.publish(outboxEvent("evt_other"));
    await sink.publish(outboxEvent("evt_dup"));

    expect(delivered).toEqual(["evt_dup", "evt_other"]);
    expect([...sink.deliveredEventIds]).toEqual(["evt_dup", "evt_other"]);
  });

  it("POSTs the envelope with event-ID idempotency headers and maps failures to machine codes", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sink = new HttpOutboxEventSink({
      endpointUrl: "https://events.internal.example/v1/outbox-events",
      serviceToken: "sink-token-12345678",
      timeoutMs: 5_000,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return new Response("{}", { status: 202 });
      }) as typeof fetch,
    });

    await sink.publish(outboxEvent("evt_http"));
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://events.internal.example/v1/outbox-events");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.redirect).toBe("error");
    expect(headers["x-gon-event-id"]).toBe("evt_http");
    expect(headers["idempotency-key"]).toBe("evt_http");
    expect(headers["x-gon-correlation-id"]).toBe("req_test");
    expect(headers["x-gon-service-token"]).toBe("sink-token-12345678");

    const rejected = new HttpOutboxEventSink({
      endpointUrl: "https://events.internal.example/v1/outbox-events",
      serviceToken: "sink-token-12345678",
      fetch: (async () => new Response("", { status: 422 })) as typeof fetch,
    });
    await expect(rejected.publish(outboxEvent("evt_rej"))).rejects.toMatchObject({
      code: "OUTBOX_SINK_REJECTED",
    });

    const unavailable = new HttpOutboxEventSink({
      endpointUrl: "https://events.internal.example/v1/outbox-events",
      serviceToken: "sink-token-12345678",
      fetch: (async () => new Response("", { status: 503 })) as typeof fetch,
    });
    const failure = await unavailable.publish(outboxEvent("evt_503")).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(OutboxSinkError);
    expect((failure as OutboxSinkError).code).toBe("OUTBOX_SINK_UNAVAILABLE");
  });

  it("composes the production sink fail-closed from the environment", () => {
    expect(inspectOutboxSinkConfig(env({}))).toMatchObject({
      configured: false,
      errorCode: "OUTBOX_SINK_URL_NOT_CONFIGURED",
    });
    expect(
      inspectOutboxSinkConfig(env({ GON_OUTBOX_SINK_URL: "https://events.internal.example/hook" })),
    ).toMatchObject({ configured: false, errorCode: "OUTBOX_SINK_TOKEN_NOT_CONFIGURED" });
    expect(
      inspectOutboxSinkConfig(
        env({
          GON_OUTBOX_SINK_URL: "https://events.internal.example/hook",
          GON_OUTBOX_SINK_TOKEN: "sink-token-12345678",
        }),
      ),
    ).toMatchObject({ kind: "http", configured: true });
    expect(() =>
      createOutboxSinkFromEnv(env({ GON_OUTBOX_SINK_URL: "https://events.internal.example/hook" })),
    ).toThrow(/not configured/);

    const sink = createOutboxSinkFromEnv(
      env({
        GON_OUTBOX_SINK_URL: "https://events.internal.example/hook",
        GON_OUTBOX_SINK_TOKEN: "sink-token-12345678",
      }),
    );
    expect(sink).toBeInstanceOf(EventIdDeduplicatingOutboxSink);
  });

  it("drains batches until idle and stops gracefully on abort", async () => {
    const batches = [
      { claimed: 2, published: 2, failed: 0, stale: 0, failures: [] },
      { claimed: 0, published: 0, failed: 0, stale: 0, failures: [] },
      { claimed: 0, published: 0, failed: 0, stale: 0, failures: [] },
    ];
    const sink: OutboxEventSink = { async publish() {} };
    const publisher = {
      async publishBatch() {
        return batches.shift() ?? { claimed: 0, published: 0, failed: 0, stale: 0, failures: [] };
      },
    };

    const result = await runOutboxConsumerLoop({
      publisher,
      sink,
      idleDelayMs: 50,
      maxIdleBatches: 2,
      sleep: instantSleep,
    });
    expect(result).toMatchObject({ batches: 3, claimed: 2, published: 2, idleBatches: 2 });

    const controller = new AbortController();
    controller.abort();
    const stopped = await runOutboxConsumerLoop({
      publisher: {
        async publishBatch() {
          throw new Error("must not publish after abort");
        },
      },
      sink,
      signal: controller.signal,
    });
    expect(stopped).toMatchObject({ batches: 0 });
  });

  it("runs the packaged runtime with both loops and installs signal-driven shutdown", async () => {
    const harness = fakeQueue({
      jobs: [{ id: "job_rt" }],
      onProcess: async () => undefined,
    });
    const sink: OutboxEventSink = { async publish() {} };
    const publisher = {
      async publishBatch() {
        return { claimed: 0, published: 0, failed: 0, stale: 0, failures: [] };
      },
    };

    const handlers = new Map<string, Array<() => void>>();
    const fakeProcess = {
      on(event: string, handler: () => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return fakeProcess;
      },
      removeListener(event: string, handler: () => void) {
        handlers.set(event, (handlers.get(event) ?? []).filter((item) => item !== handler));
        return fakeProcess;
      },
    };

    const handle = startGonWorkerRuntime({
      queue: harness.queue,
      service: harness.service,
      publisher,
      sink,
      workerId: "worker-runtime",
      idleDelayMs: 50,
    });
    const detach = installProcessSignalHandlers(handle, fakeProcess as unknown as NodeJS.Process);
    expect(handlers.get("SIGTERM")).toHaveLength(1);

    await vi.waitFor(() => expect(harness.claimOrder).toEqual(["job_rt"]));
    // SIGTERM triggers graceful abort; both loops drain and done resolves.
    for (const handler of handlers.get("SIGTERM") ?? []) handler();
    const done = await handle.done;
    expect(done.jobs.claimed).toBe(1);
    expect(done.jobs.succeeded).toBe(1);
    expect(done.outbox.batches).toBeGreaterThanOrEqual(1);

    detach();
    expect(handlers.get("SIGTERM")).toHaveLength(0);
    expect(handlers.get("SIGINT")).toHaveLength(0);
  });
});
