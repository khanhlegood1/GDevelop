import { processClaimedBrewJob, type BrewJobQueuePort, type BrewJobProcessorPort } from "./job-worker";
import type {
  PostgresOutboxPublisher,
  OutboxEventSink,
  PublishOutboxBatchResult,
} from "./postgres-outbox";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Structural port for the outbox publish primitive. */
export type OutboxPublisherPort = Pick<PostgresOutboxPublisher, "publishBatch">;

export interface BrewWorkerLoopOptions {
  queue: BrewJobQueuePort;
  service: BrewJobProcessorPort;
  workerId: string;
  leaseMs?: number;
  /** Maximum Brew jobs processed in parallel. Budget is 1–16, default 1. */
  concurrency?: number;
  /** Lease renewal cadence per running job. Default 15 s, min 1 s. */
  heartbeatIntervalMs?: number;
  /** Sleep between idle claim polls. Default 1 s, 50 ms–60 s. */
  idleDelayMs?: number;
  /**
   * Stop the loop after this many consecutive idle polls (nothing claimable).
   * Default: run until aborted. Tests use it to finish deterministically.
   */
  maxIdlePolls?: number;
  /** Graceful shutdown trigger: stop claiming, then drain in-flight jobs. */
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export interface BrewWorkerLoopResult {
  claimed: number;
  succeeded: number;
  failed: number;
  heartbeats: number;
  idlePolls: number;
  reconciled: number;
}

function normalizeConcurrency(value: number | undefined): number {
  const parsed = value ?? 1;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 16) {
    throw new Error("concurrency must be an integer between 1 and 16");
  }
  return parsed;
}

function normalizeHeartbeatIntervalMs(value: number | undefined): number {
  const parsed = value ?? 15_000;
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 15 * 60_000) {
    throw new Error("heartbeatIntervalMs must be an integer between 1000 and 900000");
  }
  return parsed;
}

function normalizeIdleDelayMs(value: number | undefined): number {
  const parsed = value ?? 1_000;
  if (!Number.isSafeInteger(parsed) || parsed < 50 || parsed > 60_000) {
    throw new Error("idleDelayMs must be an integer between 50 and 60000");
  }
  return parsed;
}

function normalizeMaxIdlePolls(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new Error("maxIdlePolls must be a positive integer");
  }
  return value;
}

/**
 * Packaged Brew worker loop: claims durable `brew_module` jobs under a
 * concurrency budget, renews each job's lease with a heartbeat while the
 * multi-transaction processing runs, and shuts down gracefully — no new claims
 * after the signal aborts, in-flight jobs finish first.
 */
export async function runBrewWorkerLoop(
  options: BrewWorkerLoopOptions,
): Promise<BrewWorkerLoopResult> {
  const concurrency = normalizeConcurrency(options.concurrency);
  const heartbeatIntervalMs = normalizeHeartbeatIntervalMs(options.heartbeatIntervalMs);
  const idleDelayMs = normalizeIdleDelayMs(options.idleDelayMs);
  const maxIdlePolls = normalizeMaxIdlePolls(options.maxIdlePolls);
  const sleep = options.sleep ?? defaultSleep;

  const result: BrewWorkerLoopResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    heartbeats: 0,
    idlePolls: 0,
    reconciled: 0,
  };
  const inFlight = new Set<Promise<void>>();

  const aborted = (): boolean => options.signal?.aborted === true;

  while (!aborted()) {
    if (inFlight.size >= concurrency) {
      await Promise.race([...inFlight]);
      continue;
    }

    let claimed: Awaited<ReturnType<BrewJobQueuePort["claimNext"]>> = null;
    try {
      const reconciled = await options.queue.reconcileExpiredLeases({
        jobTypes: ["brew_module"],
        limit: 100,
      });
      result.reconciled += reconciled.length;
      claimed = await options.queue.claimNext({
        workerId: options.workerId,
        jobTypes: ["brew_module"],
        leaseMs: options.leaseMs,
      });
    } catch (error) {
      // A transient claim/reconcile failure must not stop the worker.
      result.failed += 1;
      void error;
      continue;
    }

    if (!claimed) {
      result.idlePolls += 1;
      if (maxIdlePolls !== null && result.idlePolls >= maxIdlePolls) break;
      await sleep(idleDelayMs);
      continue;
    }

    result.idlePolls = 0;
    result.claimed += 1;
    const claimedJob = claimed;
    const slot: Promise<void> = processClaimedBrewJob({
      queue: options.queue,
      service: options.service,
      workerId: options.workerId,
      claimed: claimedJob,
      leaseMs: options.leaseMs,
      heartbeatIntervalMs,
      signal: options.signal,
    })
      .then(({ heartbeats, job }) => {
        result.heartbeats += heartbeats;
        if (String((job as { status?: unknown }).status ?? "") === "succeeded") {
          result.succeeded += 1;
        }
      })
      .catch((error) => {
        // A single job failure must not stop the worker; the queue keeps the
        // retry state and lease reconciliation recovers crashed workers.
        result.failed += 1;
        void error;
      })
      .finally(() => {
        inFlight.delete(slot);
      });
    inFlight.add(slot);
  }

  await Promise.allSettled([...inFlight]);
  return result;
}

export interface OutboxConsumerLoopOptions {
  publisher: OutboxPublisherPort;
  sink: OutboxEventSink;
  /** Events claimed per batch. Default 50, 1–500. */
  batchSize?: number;
  /** Sleep between idle batches. Default 1 s, 50 ms–60 s. */
  idleDelayMs?: number;
  /** Stop after this many consecutive idle batches. Default: until aborted. */
  maxIdleBatches?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export interface OutboxConsumerLoopResult {
  batches: number;
  claimed: number;
  published: number;
  failed: number;
  stale: number;
  failures: Array<{ eventId: string; errorCode: string }>;
  idleBatches: number;
}

/**
 * Idempotent outbox consumer loop: repeatedly drains claimed batches through
 * the sink (at-least-once delivery; `EventIdDeduplicatingOutboxSink` plus the
 * receiver's event-ID contract make effects idempotent) and stops gracefully
 * on abort after the current batch.
 */
export async function runOutboxConsumerLoop(
  options: OutboxConsumerLoopOptions,
): Promise<OutboxConsumerLoopResult> {
  const batchSize = options.batchSize ?? 50;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("batchSize must be an integer between 1 and 500");
  }
  const idleDelayMs = options.idleDelayMs ?? 1_000;
  if (!Number.isSafeInteger(idleDelayMs) || idleDelayMs < 50 || idleDelayMs > 60_000) {
    throw new Error("idleDelayMs must be an integer between 50 and 60000");
  }
  const maxIdleBatches = options.maxIdleBatches;
  if (
    maxIdleBatches !== undefined &&
    (!Number.isSafeInteger(maxIdleBatches) || maxIdleBatches < 1 || maxIdleBatches > 1_000_000)
  ) {
    throw new Error("maxIdleBatches must be a positive integer");
  }
  const sleep = options.sleep ?? defaultSleep;

  const result: OutboxConsumerLoopResult = {
    batches: 0,
    claimed: 0,
    published: 0,
    failed: 0,
    stale: 0,
    failures: [],
    idleBatches: 0,
  };

  while (options.signal?.aborted !== true) {
    const batch: PublishOutboxBatchResult = await options.publisher.publishBatch(options.sink, {
      limit: batchSize,
    });
    result.batches += 1;
    result.claimed += batch.claimed;
    result.published += batch.published;
    result.failed += batch.failed;
    result.stale += batch.stale;
    result.failures.push(...batch.failures);

    if (batch.claimed === 0) {
      result.idleBatches += 1;
      if (maxIdleBatches !== undefined && result.idleBatches >= maxIdleBatches) break;
      await sleep(idleDelayMs);
    } else {
      result.idleBatches = 0;
    }
  }

  return result;
}

export interface GonWorkerRuntimeOptions {
  queue: BrewJobQueuePort;
  service: BrewJobProcessorPort;
  publisher: OutboxPublisherPort;
  sink: OutboxEventSink;
  workerId: string;
  leaseMs?: number;
  concurrency?: number;
  heartbeatIntervalMs?: number;
  idleDelayMs?: number;
  outboxBatchSize?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export interface GonWorkerRuntimeHandle {
  /** Resolves when both loops have drained after the signal aborts. */
  done: Promise<{ jobs: BrewWorkerLoopResult; outbox: OutboxConsumerLoopResult }>;
  abort(): void;
}

/**
 * Packaged worker invocation: runs the Brew job loop and the outbox consumer
 * loop concurrently under one graceful-shutdown signal. Deploying this as a
 * managed process (Cloud Run worker/Cloud Tasks) is a separate P05 item.
 */
export function startGonWorkerRuntime(options: GonWorkerRuntimeOptions): GonWorkerRuntimeHandle {
  const controller = new AbortController();
  const signal = options.signal;
  const onAbort = (): void => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const jobs = runBrewWorkerLoop({
    queue: options.queue,
    service: options.service,
    workerId: options.workerId,
    leaseMs: options.leaseMs,
    concurrency: options.concurrency,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    idleDelayMs: options.idleDelayMs,
    signal: controller.signal,
    sleep: options.sleep,
  });
  const outbox = runOutboxConsumerLoop({
    publisher: options.publisher,
    sink: options.sink,
    batchSize: options.outboxBatchSize,
    idleDelayMs: options.idleDelayMs,
    signal: controller.signal,
    sleep: options.sleep,
  });

  const done = Promise.all([jobs, outbox]).then(([jobResult, outboxResult]) => ({
    jobs: jobResult,
    outbox: outboxResult,
  }));

  return {
    done,
    abort: () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      controller.abort();
    },
  };
}

/**
 * Wire SIGTERM/SIGINT to a graceful shutdown of the given runtime handle.
 * Returns a detach function for tests; repeated signals after the first are
 * ignored so in-flight work can drain.
 */
export function installProcessSignalHandlers(
  handle: Pick<GonWorkerRuntimeHandle, "abort">,
  processRef: Pick<NodeJS.Process, "on" | "removeListener"> = process,
): () => void {
  const shutdown = (): void => handle.abort();
  processRef.on("SIGTERM", shutdown);
  processRef.on("SIGINT", shutdown);
  return () => {
    processRef.removeListener("SIGTERM", shutdown);
    processRef.removeListener("SIGINT", shutdown);
  };
}
