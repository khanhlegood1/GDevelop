import type { SqlExecutor } from "./postgres-search";
import type { OutboxEventRecord } from "./types";
import type { JsonRecord } from "./validation";

export interface ClaimOutboxBatchOptions {
  limit?: number;
  leaseMs?: number;
  maxAttempts?: number;
}

export interface MarkOutboxFailedOptions {
  errorCode: string;
  retryDelayMs?: number;
  maxAttempts?: number;
}

export interface OutboxEventSink {
  publish(event: OutboxEventRecord): Promise<void>;
}

export interface PublishOutboxBatchOptions extends ClaimOutboxBatchOptions {
  retryDelayMs?: number;
}

export interface PublishOutboxBatchResult {
  claimed: number;
  published: number;
  failed: number;
  stale: number;
  failures: Array<{ eventId: string; errorCode: string }>;
}

export interface PostgresOutboxStats {
  pending: number;
  publishing: number;
  published: number;
  failed: number;
  stalePublishing: number;
  exhausted: number;
  oldestPendingAt: string | null;
}

const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9]+$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;

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

function eventFromRow(row: Row): OutboxEventRecord {
  return {
    eventId: asText(row.event_id),
    eventType: asText(row.event_type),
    eventVersion: asNumber(row.event_version, 1),
    occurredAt: asIso(row.occurred_at),
    aggregateType: asText(row.aggregate_type),
    aggregateId: asText(row.aggregate_id),
    actor: { type: asText(row.actor_type, "user"), id: asText(row.actor_id) },
    correlationId: asText(row.correlation_id),
    causationId: asNullableText(row.causation_id),
    data: asJsonRecord(row.data),
    publishState: asText(row.publish_state, "pending") as OutboxEventRecord["publishState"],
    availableAt: asIso(row.available_at),
    publishedAt: asNullableIso(row.published_at),
    publishAttemptCount: asNumber(row.publish_attempt_count),
    lastErrorCode: asNullableText(row.last_error_code),
  };
}

function normalizeLimit(limit: number | undefined): number {
  const value = limit ?? 50;
  if (!Number.isSafeInteger(value) || value < 1 || value > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }
  return value;
}

function normalizeLeaseMs(leaseMs: number | undefined): number {
  const value = leaseMs ?? DEFAULT_LEASE_MS;
  if (!Number.isSafeInteger(value) || value < 5_000 || value > 15 * 60_000) {
    throw new Error("leaseMs must be an integer between 5000 and 900000");
  }
  return value;
}

function normalizeMaxAttempts(maxAttempts: number | undefined): number {
  const value = maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 20) {
    throw new Error("maxAttempts must be an integer between 1 and 20");
  }
  return value;
}

function assertClaimedEvent(event: OutboxEventRecord): void {
  if (!EVENT_ID_PATTERN.test(event.eventId) || event.eventId.length > 128) {
    throw new Error("Invalid outbox event ID");
  }
  if (!Number.isSafeInteger(event.publishAttemptCount) || event.publishAttemptCount < 1) {
    throw new Error("Outbox completion requires a claimed event attempt");
  }
}

function retryDelayForAttempt(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(5, attemptCount - 1));
  return Math.min(15 * 60_000, 30_000 * 2 ** exponent);
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "").trim().toUpperCase();
    if (ERROR_CODE_PATTERN.test(code)) return code;
  }
  return "OUTBOX_PUBLISH_FAILED";
}

/**
 * Transactional-outbox publisher primitives for PostgreSQL.
 *
 * `available_at` doubles as the publishing lease expiry while a row is in
 * `publishing`. Completion is fenced by `publish_attempt_count`: if a stale
 * publisher loses its lease and another publisher reclaims the event, the
 * attempt count changes and the stale completion updates zero rows.
 */
export class PostgresOutboxPublisher {
  constructor(private readonly executor: SqlExecutor) {}

  async claimBatch(options: ClaimOutboxBatchOptions = {}): Promise<OutboxEventRecord[]> {
    const limit = normalizeLimit(options.limit);
    const leaseMs = normalizeLeaseMs(options.leaseMs);
    const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
    const result = await this.executor.query(
      `
      with candidate as (
        select event.event_id
        from outbox_events as event
        where event.publish_attempt_count < $3
          and (
            (
              event.publish_state in ('pending', 'failed')
              and event.available_at <= clock_timestamp()
            )
            or (
              event.publish_state = 'publishing'
              and event.available_at <= clock_timestamp()
            )
          )
        order by event.occurred_at, event.event_id
        for update skip locked
        limit $1
      )
      update outbox_events as event
         set publish_state = 'publishing',
             publish_attempt_count = event.publish_attempt_count + 1,
             available_at = clock_timestamp() + ($2::double precision * interval '1 millisecond'),
             published_at = null,
             last_error_code = null
        from candidate
       where event.event_id = candidate.event_id
       returning event.*
      `,
      [limit, leaseMs, maxAttempts],
    );
    return (result.rows as Row[]).map(eventFromRow)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  }

  async markPublished(event: OutboxEventRecord): Promise<boolean> {
    assertClaimedEvent(event);
    const result = await this.executor.query(
      `
      update outbox_events
         set publish_state = 'published',
             published_at = clock_timestamp(),
             available_at = clock_timestamp(),
             last_error_code = null
       where event_id = $1
         and publish_state = 'publishing'
         and publish_attempt_count = $2
       returning event_id
      `,
      [event.eventId, event.publishAttemptCount],
    );
    return result.rows.length === 1;
  }

  async markFailed(
    event: OutboxEventRecord,
    options: MarkOutboxFailedOptions,
  ): Promise<boolean> {
    assertClaimedEvent(event);
    if (!ERROR_CODE_PATTERN.test(options.errorCode)) {
      throw new Error("errorCode must be a bounded uppercase machine code");
    }
    const retryDelayMs = options.retryDelayMs ?? retryDelayForAttempt(event.publishAttemptCount);
    if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 24 * 60 * 60_000) {
      throw new Error("retryDelayMs must be an integer between 0 and 86400000");
    }
    normalizeMaxAttempts(options.maxAttempts);
    const result = await this.executor.query(
      `
      update outbox_events
         set publish_state = 'failed',
             published_at = null,
             available_at = clock_timestamp() + ($3::double precision * interval '1 millisecond'),
             last_error_code = $4
       where event_id = $1
         and publish_state = 'publishing'
         and publish_attempt_count = $2
       returning event_id
      `,
      [event.eventId, event.publishAttemptCount, retryDelayMs, options.errorCode],
    );
    return result.rows.length === 1;
  }

  async publishBatch(
    sink: OutboxEventSink,
    options: PublishOutboxBatchOptions = {},
  ): Promise<PublishOutboxBatchResult> {
    if (!sink || typeof sink.publish !== "function") {
      throw new Error("An outbox sink with publish(event) is required");
    }
    const claimedEvents = await this.claimBatch(options);
    const result: PublishOutboxBatchResult = {
      claimed: claimedEvents.length,
      published: 0,
      failed: 0,
      stale: 0,
      failures: [],
    };

    for (const event of claimedEvents) {
      try {
        await sink.publish(event);
        if (await this.markPublished(event)) result.published += 1;
        else result.stale += 1;
      } catch (error) {
        const errorCode = safeErrorCode(error);
        result.failures.push({ eventId: event.eventId, errorCode });
        const marked = await this.markFailed(event, {
          errorCode,
          retryDelayMs: options.retryDelayMs,
          maxAttempts: options.maxAttempts,
        });
        if (marked) result.failed += 1;
        else result.stale += 1;
      }
    }

    return result;
  }

  async getStats(options: { maxAttempts?: number } = {}): Promise<PostgresOutboxStats> {
    const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
    const result = await this.executor.query(
      `
      select
        count(*) filter (where publish_state = 'pending')::int as pending,
        count(*) filter (where publish_state = 'publishing')::int as publishing,
        count(*) filter (where publish_state = 'published')::int as published,
        count(*) filter (where publish_state = 'failed')::int as failed,
        count(*) filter (
          where publish_state = 'publishing' and available_at <= clock_timestamp()
        )::int as stale_publishing,
        count(*) filter (
          where publish_state in ('pending', 'failed', 'publishing')
            and publish_attempt_count >= $1
        )::int as exhausted,
        min(occurred_at) filter (
          where publish_state in ('pending', 'failed')
        ) as oldest_pending_at
      from outbox_events
      `,
      [maxAttempts],
    );
    const row = (result.rows[0] ?? {}) as Row;
    return {
      pending: asNumber(row.pending),
      publishing: asNumber(row.publishing),
      published: asNumber(row.published),
      failed: asNumber(row.failed),
      stalePublishing: asNumber(row.stale_publishing),
      exhausted: asNumber(row.exhausted),
      oldestPendingAt: asNullableIso(row.oldest_pending_at),
    };
  }
}
