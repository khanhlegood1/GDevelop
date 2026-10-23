import { formatPostgresTextArray, type SqlExecutor } from "./postgres-search";
import type { JobRecord, JobStatus } from "./types";
import type { JsonRecord } from "./validation";

export interface ClaimJobOptions {
  workerId: string;
  jobTypes?: readonly string[];
  leaseMs?: number;
}

export interface JobHeartbeatOptions {
  workerId: string;
  leaseMs?: number;
  currentStep?: string;
}

export interface CompleteJobOptions {
  workerId: string;
  currentStep?: string | null;
}

export interface FailJobOptions {
  workerId: string;
  failureCode: string;
  retryable: boolean;
  currentStep?: string | null;
  retryDelayMs?: number;
}

export interface ReconcileExpiredJobLeasesOptions {
  jobTypes?: readonly string[];
  limit?: number;
}

export interface PostgresJobQueueStats {
  queued: number;
  running: number;
  succeeded: number;
  needsInput: number;
  failedRetryable: number;
  failedTerminal: number;
  cancelled: number;
  expiredLeases: number;
  oldestAvailableAt: string | null;
}

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const JOB_ID_PATTERN = /^job_[A-Za-z0-9]+$/;
const JOB_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,127}$/;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const DEFAULT_LEASE_MS = 60_000;
const MAX_LEASE_MS = 15 * 60_000;

type Row = Record<string, unknown>;

function asText(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function asNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = asText(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function asNullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : asIso(value);
}

function asJsonRecord(value: unknown): JsonRecord {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function jobFromRow(row: Row): JobRecord {
  return {
    id: asText(row.id),
    jobType: asText(row.job_type),
    ownerUserId: asText(row.owner_user_id),
    aggregateType: asText(row.aggregate_type),
    aggregateId: asText(row.aggregate_id),
    status: asText(row.status, "queued") as JobStatus,
    currentStep: asNullableText(row.current_step),
    idempotencyKey: asText(row.idempotency_key),
    inputFingerprint: asText(row.input_fingerprint),
    attemptCount: asNumber(row.attempt_count),
    maxAttempts: asNumber(row.max_attempts, 3),
    estimatedCostUnits: asNumber(row.estimated_cost_units),
    actualCostUnits: asNumber(row.actual_cost_units),
    failureCode: asNullableText(row.failure_code),
    retryable: asBoolean(row.retryable),
    availableAt: asIso(row.available_at),
    leaseOwner: asNullableText(row.lease_owner),
    leaseExpiresAt: asNullableIso(row.lease_expires_at),
    createdAt: asIso(row.created_at),
    startedAt: asNullableIso(row.started_at),
    completedAt: asNullableIso(row.completed_at),
    cancelledAt: asNullableIso(row.cancelled_at),
    payload: asJsonRecord(row.payload),
  };
}

function assertWorkerId(workerId: string): string {
  if (!WORKER_ID_PATTERN.test(workerId)) {
    throw new Error("workerId must be a bounded ASCII identifier");
  }
  return workerId;
}

function assertJobId(jobId: string): string {
  if (!JOB_ID_PATTERN.test(jobId) || jobId.length > 128) throw new Error("Invalid job ID");
  return jobId;
}

function normalizeJobTypes(jobTypes: readonly string[] | undefined): string[] {
  const unique = [...new Set((jobTypes ?? []).map((value) => value.trim()).filter(Boolean))];
  if (unique.length > 32) throw new Error("At most 32 job types may be claimed at once");
  for (const jobType of unique) {
    if (!JOB_TYPE_PATTERN.test(jobType)) throw new Error(`Invalid job type: ${jobType}`);
  }
  return unique;
}

function normalizeLeaseMs(leaseMs: number | undefined): number {
  const value = leaseMs ?? DEFAULT_LEASE_MS;
  if (!Number.isSafeInteger(value) || value < 5_000 || value > MAX_LEASE_MS) {
    throw new Error("leaseMs must be an integer between 5000 and 900000");
  }
  return value;
}

function normalizeCurrentStep(currentStep: string | null | undefined): string | null {
  if (currentStep === undefined || currentStep === null) return null;
  const normalized = currentStep.trim();
  if (!normalized || normalized.length > 128) throw new Error("currentStep must be between 1 and 128 characters");
  return normalized;
}

function normalizeLimit(limit: number | undefined, fallback = 100): number {
  const value = limit ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }
  return value;
}

const RETRY_BACKOFF_SQL = `
  least(900000, 30000 * power(2, greatest(job.attempt_count - 1, 0)))
`;

/**
 * PostgreSQL-backed durable job queue primitives.
 *
 * Every mutating method is a single atomic statement. Claims use
 * `FOR UPDATE SKIP LOCKED`, while heartbeat/complete/fail are fenced by both
 * `lease_owner` and an unexpired lease. A worker that loses its lease can
 * therefore no longer overwrite the state chosen by a later worker.
 */
export class PostgresJobQueue {
  constructor(private readonly executor: SqlExecutor) {}

  async claimNext(options: ClaimJobOptions): Promise<JobRecord | null> {
    const workerId = assertWorkerId(options.workerId);
    const leaseMs = normalizeLeaseMs(options.leaseMs);
    const jobTypes = normalizeJobTypes(options.jobTypes);
    const result = await this.executor.query(
      `
      with candidate as (
        select job.id
        from async_jobs as job
        where (
          (
            job.status in ('queued', 'failed_retryable')
            and job.available_at <= clock_timestamp()
          )
          or (
            job.status = 'running'
            and job.lease_expires_at is not null
            and job.lease_expires_at <= clock_timestamp()
          )
        )
          and job.attempt_count < job.max_attempts
          and (cardinality($3::text[]) = 0 or job.job_type = any($3::text[]))
        order by job.available_at, job.created_at, job.id
        for update skip locked
        limit 1
      )
      update async_jobs as job
         set status = 'running',
             attempt_count = job.attempt_count + 1,
             started_at = clock_timestamp(),
             completed_at = null,
             cancelled_at = null,
             failure_code = null,
             retryable = false,
             available_at = clock_timestamp(),
             lease_owner = $1,
             lease_expires_at = clock_timestamp() + ($2::double precision * interval '1 millisecond')
        from candidate
       where job.id = candidate.id
       returning job.*
      `,
      [workerId, leaseMs, formatPostgresTextArray(jobTypes)],
    );
    const row = result.rows[0] as Row | undefined;
    return row ? jobFromRow(row) : null;
  }

  async heartbeat(jobIdValue: string, options: JobHeartbeatOptions): Promise<JobRecord | null> {
    const jobId = assertJobId(jobIdValue);
    const workerId = assertWorkerId(options.workerId);
    const leaseMs = normalizeLeaseMs(options.leaseMs);
    const currentStep = normalizeCurrentStep(options.currentStep);
    const result = await this.executor.query(
      `
      update async_jobs as job
         set lease_expires_at = clock_timestamp() + ($3::double precision * interval '1 millisecond'),
             current_step = coalesce($4, job.current_step)
       where job.id = $1
         and job.status = 'running'
         and job.lease_owner = $2
         and job.lease_expires_at > clock_timestamp()
       returning job.*
      `,
      [jobId, workerId, leaseMs, currentStep],
    );
    const row = result.rows[0] as Row | undefined;
    return row ? jobFromRow(row) : null;
  }

  async complete(jobIdValue: string, options: CompleteJobOptions): Promise<JobRecord | null> {
    const jobId = assertJobId(jobIdValue);
    const workerId = assertWorkerId(options.workerId);
    const currentStep = normalizeCurrentStep(options.currentStep);
    const result = await this.executor.query(
      `
      update async_jobs as job
         set status = 'succeeded',
             current_step = coalesce($3, job.current_step),
             completed_at = clock_timestamp(),
             failure_code = null,
             retryable = false,
             lease_owner = null,
             lease_expires_at = null
       where job.id = $1
         and job.status = 'running'
         and job.lease_owner = $2
         and job.lease_expires_at > clock_timestamp()
       returning job.*
      `,
      [jobId, workerId, currentStep],
    );
    const row = result.rows[0] as Row | undefined;
    return row ? jobFromRow(row) : null;
  }

  async fail(jobIdValue: string, options: FailJobOptions): Promise<JobRecord | null> {
    const jobId = assertJobId(jobIdValue);
    const workerId = assertWorkerId(options.workerId);
    if (!FAILURE_CODE_PATTERN.test(options.failureCode)) {
      throw new Error("failureCode must be a bounded uppercase machine code");
    }
    const retryDelayMs = options.retryDelayMs;
    if (
      retryDelayMs !== undefined &&
      (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 24 * 60 * 60_000)
    ) {
      throw new Error("retryDelayMs must be an integer between 0 and 86400000");
    }
    const result = await this.executor.query(
      `
      update async_jobs as job
         set status = case
               when $4 and job.attempt_count < job.max_attempts then 'failed_retryable'
               else 'failed_terminal'
             end,
             current_step = coalesce($5, job.current_step),
             failure_code = $3,
             retryable = ($4 and job.attempt_count < job.max_attempts),
             completed_at = case
               when $4 and job.attempt_count < job.max_attempts then null
               else clock_timestamp()
             end,
             available_at = case
               when $4 and job.attempt_count < job.max_attempts then
                 clock_timestamp() + (
                   coalesce($6::double precision, ${RETRY_BACKOFF_SQL})
                   * interval '1 millisecond'
                 )
               else clock_timestamp()
             end,
             lease_owner = null,
             lease_expires_at = null
       where job.id = $1
         and job.status = 'running'
         and job.lease_owner = $2
         and job.lease_expires_at > clock_timestamp()
       returning job.*
      `,
      [
        jobId,
        workerId,
        options.failureCode,
        options.retryable,
        normalizeCurrentStep(options.currentStep),
        retryDelayMs ?? null,
      ],
    );
    const row = result.rows[0] as Row | undefined;
    return row ? jobFromRow(row) : null;
  }

  async reconcileExpiredLeases(
    options: ReconcileExpiredJobLeasesOptions = {},
  ): Promise<JobRecord[]> {
    const jobTypes = normalizeJobTypes(options.jobTypes);
    const limit = normalizeLimit(options.limit);
    const result = await this.executor.query(
      `
      with expired as (
        select job.id
        from async_jobs as job
        where job.status = 'running'
          and job.lease_expires_at is not null
          and job.lease_expires_at <= clock_timestamp()
          and (cardinality($1::text[]) = 0 or job.job_type = any($1::text[]))
        order by job.lease_expires_at, job.created_at, job.id
        for update skip locked
        limit $2
      )
      update async_jobs as job
         set status = case
               when job.attempt_count < job.max_attempts then 'failed_retryable'
               else 'failed_terminal'
             end,
             failure_code = 'JOB_LEASE_EXPIRED',
             retryable = job.attempt_count < job.max_attempts,
             completed_at = case
               when job.attempt_count < job.max_attempts then null
               else clock_timestamp()
             end,
             available_at = case
               when job.attempt_count < job.max_attempts then
                 clock_timestamp() + ((${RETRY_BACKOFF_SQL}) * interval '1 millisecond')
               else clock_timestamp()
             end,
             lease_owner = null,
             lease_expires_at = null
        from expired
       where job.id = expired.id
       returning job.*
      `,
      [formatPostgresTextArray(jobTypes), limit],
    );
    return (result.rows as Row[]).map(jobFromRow);
  }

  async getStats(): Promise<PostgresJobQueueStats> {
    const result = await this.executor.query(
      `
      select
        count(*) filter (where status = 'queued')::int as queued,
        count(*) filter (where status = 'running')::int as running,
        count(*) filter (where status = 'succeeded')::int as succeeded,
        count(*) filter (where status = 'needs_input')::int as needs_input,
        count(*) filter (where status = 'failed_retryable')::int as failed_retryable,
        count(*) filter (where status = 'failed_terminal')::int as failed_terminal,
        count(*) filter (where status = 'cancelled')::int as cancelled,
        count(*) filter (
          where status = 'running'
            and lease_expires_at is not null
            and lease_expires_at <= clock_timestamp()
        )::int as expired_leases,
        min(available_at) filter (
          where status in ('queued', 'failed_retryable')
        ) as oldest_available_at
      from async_jobs
      `,
    );
    const row = (result.rows[0] ?? {}) as Row;
    return {
      queued: asNumber(row.queued),
      running: asNumber(row.running),
      succeeded: asNumber(row.succeeded),
      needsInput: asNumber(row.needs_input),
      failedRetryable: asNumber(row.failed_retryable),
      failedTerminal: asNumber(row.failed_terminal),
      cancelled: asNumber(row.cancelled),
      expiredLeases: asNumber(row.expired_leases),
      oldestAvailableAt: asNullableIso(row.oldest_available_at),
    };
  }
}
