import type { PostgresJobQueue } from "./postgres-job-queue";
import type { GonService } from "./service";
import type { JsonRecord } from "./validation";

export interface RunNextPostgresBrewJobDependencies {
  queue: PostgresJobQueue;
  service: GonService;
  workerId: string;
  leaseMs?: number;
}

export type RunNextPostgresBrewJobResult =
  | { claimed: false; reconciled: number }
  | { claimed: true; reconciled: number; job: JsonRecord };

/**
 * Run one durable Brew job using PostgreSQL as the claim/lease authority.
 *
 * The SQL queue claim is committed before the domain Unit of Work starts.
 * The domain processor then sees the same leased row and owns the final
 * success/retryable/terminal transition. If the domain transaction itself
 * rolls back unexpectedly, this helper makes a best-effort fenced failure
 * transition; if that also fails, lease reconciliation can recover the job.
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
  if (!claimed) return { claimed: false, reconciled: reconciled.length };

  try {
    const job = await dependencies.service.processQueuedBrewJob(claimed.id, {
      workerId: dependencies.workerId,
      leaseMs: dependencies.leaseMs,
      alreadyClaimed: true,
    });
    return { claimed: true, reconciled: reconciled.length, job };
  } catch (error) {
    try {
      await dependencies.queue.fail(claimed.id, {
        workerId: dependencies.workerId,
        failureCode: "BREW_WORKER_FAILED",
        retryable: true,
        currentStep: claimed.currentStep,
      });
    } catch {
      // The original worker error is more useful. Lease expiry/reconciliation
      // remains the recovery path if this fenced transition cannot be made.
    }
    throw error;
  }
}
