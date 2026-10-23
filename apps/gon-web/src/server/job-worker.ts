import type { PostgresJobQueue } from "./postgres-job-queue";
import type { GonService } from "./service";
import type { JsonRecord } from "./validation";

/** Structural ports so tests can substitute fakes for the SQL-backed classes. */
export type BrewJobQueuePort = Pick<
  PostgresJobQueue,
  "claimNext" | "reconcileExpiredLeases" | "heartbeat" | "fail"
>;
export type BrewJobProcessorPort = Pick<GonService, "processQueuedBrewJob">;

export interface ProcessClaimedBrewJobDependencies {
  queue: BrewJobQueuePort;
  service: BrewJobProcessorPort;
  workerId: string;
  /** The already-claimed job row (SQL claim committed). */
  claimed: { id: string; currentStep?: string | null };
  leaseMs?: number;
  /**
   * When set, a background heartbeat renews the job lease every interval while
   * the domain processing runs, so long AI provider calls cannot outrun the
   * lease. The heartbeat tick uses a real timer and stops as soon as the job
   * finishes.
   */
  heartbeatIntervalMs?: number;
  /** Aborts the heartbeat loop early (the job itself keeps running). */
  signal?: AbortSignal;
}

export interface RunNextPostgresBrewJobDependencies {
  queue: BrewJobQueuePort;
  service: BrewJobProcessorPort;
  workerId: string;
  leaseMs?: number;
  heartbeatIntervalMs?: number;
  signal?: AbortSignal;
}

export type RunNextPostgresBrewJobResult =
  | { claimed: false; reconciled: number; heartbeats: number }
  | { claimed: true; reconciled: number; heartbeats: number; job: JsonRecord };

/**
 * Process one already-claimed durable Brew job. The domain processor owns the
 * final success/retryable/terminal transition across its own short
 * transactions (the AI provider calls run between them, outside any database
 * transaction). If the domain processing throws unexpectedly, this helper
 * makes a best-effort fenced failure transition; if that also fails, lease
 * reconciliation can recover the job.
 */
export async function processClaimedBrewJob(
  dependencies: ProcessClaimedBrewJobDependencies,
): Promise<{ heartbeats: number; job: JsonRecord }> {
  const heartbeatIntervalMs = dependencies.heartbeatIntervalMs;
  let heartbeats = 0;
  let stopHeartbeat = false;
  const wake: { fn: (() => void) | null } = { fn: null };
  let heartbeatLoop: Promise<void> = Promise.resolve();
  if (
    heartbeatIntervalMs !== undefined &&
    Number.isSafeInteger(heartbeatIntervalMs) &&
    heartbeatIntervalMs >= 1_000
  ) {
    // The tick uses a real timer (never an injectable tight loop) and can be
    // woken early when processing finishes, so a completed job is not stalled
    // waiting out the current interval.
    heartbeatLoop = (async () => {
      while (!stopHeartbeat && !dependencies.signal?.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, heartbeatIntervalMs);
          wake.fn = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wake.fn = null;
        if (stopHeartbeat || dependencies.signal?.aborted) break;
        try {
          const renewed = await dependencies.queue.heartbeat(dependencies.claimed.id, {
            workerId: dependencies.workerId,
            leaseMs: dependencies.leaseMs,
            currentStep: dependencies.claimed.currentStep ?? undefined,
          });
          if (renewed) heartbeats += 1;
        } catch {
          // Transient heartbeat failures are recoverable via lease
          // reconciliation; the processing result stays authoritative.
        }
      }
    })();
  }

  try {
    const job = await dependencies.service.processQueuedBrewJob(dependencies.claimed.id, {
      workerId: dependencies.workerId,
      leaseMs: dependencies.leaseMs,
      alreadyClaimed: true,
    });
    return { heartbeats, job };
  } catch (error) {
    try {
      await dependencies.queue.fail(dependencies.claimed.id, {
        workerId: dependencies.workerId,
        failureCode: "BREW_WORKER_FAILED",
        retryable: true,
        currentStep: dependencies.claimed.currentStep ?? null,
      });
    } catch {
      // The original worker error is more useful. Lease expiry/reconciliation
      // remains the recovery path if this fenced transition cannot be made.
    }
    throw error;
  } finally {
    stopHeartbeat = true;
    wake.fn?.();
    await heartbeatLoop;
  }
}

/**
 * Run one durable Brew job using PostgreSQL as the claim/lease authority.
 *
 * The SQL queue claim is committed before the domain Unit of Work starts.
 */
export async function runNextPostgresBrewJob(
  dependencies: RunNextPostgresBrewJobDependencies,
): Promise<RunNextPostgresBrewJobResult> {
  const reconciled = await dependencies.queue.reconcileExpiredLeases({
    jobTypes: ["brew_module"],
    limit: 100,
  });
  const claimed = await dependencies.queue.claimNext({
    workerId: dependencies.workerId,
    jobTypes: ["brew_module"],
    leaseMs: dependencies.leaseMs,
  });
  if (!claimed) {
    return { claimed: false, reconciled: reconciled.length, heartbeats: 0 };
  }

  const { heartbeats, job } = await processClaimedBrewJob({
    queue: dependencies.queue,
    service: dependencies.service,
    workerId: dependencies.workerId,
    claimed,
    leaseMs: dependencies.leaseMs,
    heartbeatIntervalMs: dependencies.heartbeatIntervalMs,
    signal: dependencies.signal,
  });
  return { claimed: true, reconciled: reconciled.length, heartbeats, job };
}
