import { sha256Hex } from "./hash";
import type { SqlExecutor } from "./postgres-search";
import {
  consumeBucketInMemory,
  type AbuseStateStore,
  type BucketConsumeInput,
  type BucketConsumeResult,
  type FloodState,
  type TokenBucketState,
} from "./abuse-controls";

/**
 * PostgreSQL binding of the distributed abuse-control state (P05-R1.10).
 *
 * Every transition is read → pure compute ({@link consumeBucketInMemory} /
 * `applyFloodStrike`) → optimistic CAS write (`version = seen`), so all app
 * instances share exact token/strike accounting while the algorithm itself
 * stays in one pure implementation. CAS losers recompute against the fresh
 * row (bounded retry); there is no over-admission window.
 *
 * Tables are created by migration 0010 and intentionally NOT written through
 * the identity-map Unit of Work: rate-limit state is global cross-request
 * infrastructure, not domain state, and must survive request rollback.
 */

function rowText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function rowNum(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function rowIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(rowText(value)).toISOString();
}

function rowNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return rowIso(value);
}

interface VersionedRow {
  version: number;
}

const CAS_MAX_ATTEMPTS = 5;

export class PostgresAbuseStateStore implements AbuseStateStore {
  constructor(private readonly executor: SqlExecutor) {}

  async consumeBucket(input: BucketConsumeInput): Promise<BucketConsumeResult> {
    for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt += 1) {
      const rows = await this.executor.query(
        `select tokens, capacity, refill_per_sec, version, updated_at
           from abuse_rate_buckets where bucket_key = $1`,
        [input.bucketKey],
      );
      const row = rows.rows[0] as Record<string, unknown> | undefined;
      const previous: TokenBucketState | null = row
        ? {
            bucketKey: input.bucketKey,
            tokens: rowNum(row.tokens),
            capacity: rowNum(row.capacity),
            refillPerSec: rowNum(row.refill_per_sec),
            updatedAt: rowIso(row.updated_at),
          }
        : null;
      const result = consumeBucketInMemory(previous, input);

      if (!row) {
        const inserted = await this.executor.query(
          `insert into abuse_rate_buckets
             (bucket_key, tokens, capacity, refill_per_sec, version, updated_at, created_at)
           values ($1, $2, $3, $4, 0, $5::timestamptz, $5::timestamptz)
           on conflict (bucket_key) do nothing
           returning bucket_key`,
          [
            input.bucketKey,
            result.nextState.tokens,
            result.nextState.capacity,
            result.nextState.refillPerSec,
            input.at,
          ],
        );
        if (inserted.rows.length > 0) return result;
        continue; // concurrent insert won; recompute against the fresh row
      }

      const updated = await this.executor.query(
        `update abuse_rate_buckets
            set tokens = $2, capacity = $3, refill_per_sec = $4,
                updated_at = $5::timestamptz, version = version + 1
          where bucket_key = $1 and version = $6
          returning version`,
        [
          input.bucketKey,
          result.nextState.tokens,
          result.nextState.capacity,
          result.nextState.refillPerSec,
          input.at,
          (row as VersionedRow & Record<string, unknown>).version,
        ],
      );
      if (updated.rows.length > 0) return result;
      // CAS lost; loop and recompute
    }
    throw new Error(`abuse bucket CAS contention exceeded ${CAS_MAX_ATTEMPTS} attempts: ${input.bucketKey}`);
  }

  async peekFlood(floodKey: string): Promise<{ state: FloodState | null; version: number | null }> {
    const rows = await this.executor.query(
      `select strikes, window_start, offense_count, blocked_until, version, updated_at
         from abuse_flood_strikes where flood_key = $1`,
      [floodKey],
    );
    const row = rows.rows[0] as Record<string, unknown> | undefined;
    if (!row) return { state: null, version: null };
    return {
      state: {
        floodKey,
        strikes: rowNum(row.strikes),
        windowStart: rowIso(row.window_start),
        offenseCount: rowNum(row.offense_count),
        blockedUntil: rowNullableIso(row.blocked_until),
        updatedAt: rowIso(row.updated_at),
      },
      version: rowNum(row.version),
    };
  }

  async saveFloodStrike(floodKey: string, next: FloodState, seenVersion: number | null): Promise<boolean> {
    if (seenVersion === null) {
      const inserted = await this.executor.query(
        `insert into abuse_flood_strikes
           (flood_key, strikes, window_start, offense_count, blocked_until, version, updated_at)
         values ($1, $2, $3::timestamptz, $4, $5::timestamptz, 0, $6::timestamptz)
         on conflict (flood_key) do nothing
         returning flood_key`,
        [floodKey, next.strikes, next.windowStart, next.offenseCount, next.blockedUntil, next.updatedAt],
      );
      return inserted.rows.length > 0;
    }
    const updated = await this.executor.query(
      `update abuse_flood_strikes
          set strikes = $2, window_start = $3::timestamptz, offense_count = $4,
              blocked_until = $5::timestamptz, version = version + 1,
              updated_at = $6::timestamptz
        where flood_key = $1 and version = $7
        returning flood_key`,
      [floodKey, next.strikes, next.windowStart, next.offenseCount, next.blockedUntil, next.updatedAt, seenVersion],
    );
    return updated.rows.length > 0;
  }

  async resetFlood(floodKey: string): Promise<void> {
    await this.executor.query(`delete from abuse_flood_strikes where flood_key = $1`, [floodKey]);
  }

  async markIdempotency(markerKey: string, at: string, ttlMs: number): Promise<"new" | "replay"> {
    const expiredBefore = new Date(Date.parse(at) - ttlMs).toISOString();
    const rows = await this.executor.query(
      `insert into abuse_idempotency_markers (marker_key, first_seen_at)
       values ($1, $2::timestamptz)
       on conflict (marker_key) do update set first_seen_at = $2::timestamptz
         where abuse_idempotency_markers.first_seen_at <= $3::timestamptz
       returning marker_key`,
      [markerKey, at, expiredBefore],
    );
    return rows.rows.length > 0 ? "new" : "replay";
  }

  async claimBudgetAlert(input: {
    userId: string;
    quotaKey: string;
    windowStart: string;
    thresholdPct: number;
    at: string;
  }): Promise<boolean> {
    const id = `balert_${sha256Hex(`${input.userId}:${input.quotaKey}:${input.windowStart}:${input.thresholdPct}`).slice(0, 24)}`;
    const rows = await this.executor.query(
      `insert into budget_alert_claims
         (id, user_id, quota_key, window_start, threshold_pct, claimed_at)
       values ($1, $2, $3, $4::timestamptz, $5, $6::timestamptz)
       on conflict (user_id, quota_key, window_start, threshold_pct) do nothing
       returning id`,
      [id, input.userId, input.quotaKey, input.windowStart, input.thresholdPct, input.at],
    );
    return rows.rows.length > 0;
  }

  async prune(before: string): Promise<void> {
    await this.executor.query(
      `delete from abuse_idempotency_markers where first_seen_at < $1::timestamptz`,
      [before],
    );
    await this.executor.query(
      `delete from abuse_rate_buckets where updated_at < $1::timestamptz`,
      [before],
    );
    await this.executor.query(
      `delete from abuse_flood_strikes
        where updated_at < $1::timestamptz
          and (blocked_until is null or blocked_until < $1::timestamptz)`,
      [before],
    );
  }
}
