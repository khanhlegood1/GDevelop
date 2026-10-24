/**
 * Next.js instrumentation hook (P06-S1, cloud deployment package).
 *
 * Makes the container image dual-role: by default it serves HTTP only; with
 * `GON_WORKER_ENABLED=1` the same image additionally runs the packaged Brew
 * job worker + outbox consumer loops (see `server/worker-runtime.ts`). This
 * is how the worker is deployed on Cloud Run without a separate build: a
 * dedicated service from the same image, internal ingress, `GON_WORKER_ENABLED=1`.
 *
 * Composition is fail-closed, mirroring `server/runtime.ts`:
 * - requires the PostgreSQL composition (`GON_STORE=postgres` + `DATABASE_URL`)
 *   because the job queue, outbox publisher and abuse state are SQL-backed;
 * - the ADK Brew provider and the outbox HTTP sink must be configured
 *   (their factories throw on missing/invalid configuration);
 * - SIGTERM/SIGINT drain in-flight jobs gracefully (Cloud Run shutdown).
 *
 * Local development and the test battery are unaffected: the flag is unset
 * there, so `register()` returns before touching any composition root.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const flag = (process.env.GON_WORKER_ENABLED ?? "").trim().toLowerCase();
  if (!["1", "true", "yes", "on"].includes(flag)) return;

  const { readConfig } = await import("./server/config");
  const config = readConfig();
  if (config.storeKind !== "postgres") {
    throw new Error(
      "GON_WORKER_ENABLED=1 requires GON_STORE=postgres with DATABASE_URL: " +
        "the durable job queue and outbox are PostgreSQL-backed.",
    );
  }

  const [
    { getGonService, getPostgresJobQueue, getPostgresOutboxPublisher, getPostgresOutboxSink },
    { startGonWorkerRuntime, installProcessSignalHandlers },
    { logStructured },
  ] = await Promise.all([
    import("./server/runtime"),
    import("./server/worker-runtime"),
    import("./server/observability"),
  ]);

  const rawConcurrency = (process.env.GON_WORKER_CONCURRENCY ?? "").trim();
  const concurrency = /^\d+$/.test(rawConcurrency) ? Number(rawConcurrency) : undefined;
  // Edge-safe fallback: Turbopack compiles this file for the Edge Runtime too
  // (where process.pid does not exist), even though the worker only ever runs
  // under NEXT_RUNTIME=nodejs — the early return above is the real guard.
  const workerId =
    process.env.GON_WORKER_ID ??
    `worker-${process.env.HOSTNAME ?? Math.random().toString(36).slice(2, 10)}`;

  const handle = startGonWorkerRuntime({
    queue: getPostgresJobQueue(),
    service: getGonService(),
    publisher: getPostgresOutboxPublisher(),
    sink: getPostgresOutboxSink(),
    workerId,
    concurrency,
  });
  installProcessSignalHandlers(handle);

  logStructured("info", "worker_runtime_started", {
    workerId,
    concurrency: concurrency ?? 1,
    storeKind: config.storeKind,
  });
  void handle.done
    .then((result) => {
      logStructured("info", "worker_runtime_stopped", {
        workerId,
        jobsClaimed: result.jobs.claimed,
        jobsSucceeded: result.jobs.succeeded,
        jobsFailed: result.jobs.failed,
        outboxPublished: result.outbox.published,
        outboxFailed: result.outbox.failed,
      });
    })
    .catch(() => {
      // Loop rejections are surfaced by their own structured error logs.
    });
}
