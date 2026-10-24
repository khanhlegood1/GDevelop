import { EMBEDDING_DIMENSIONS, EMBEDDING_PROFILE } from "./embeddings";
import { stableHash } from "./hash";
import { createId } from "./ids";
import {
  formatPostgresTextArray,
  formatPostgresVector,
  PostgresHybridSearchRepository,
  validateEmbeddingVector,
  type SqlExecutor,
} from "./postgres-search";
import {
  InMemoryGonRepositories,
  type GonRepositories,
  type GonStore,
} from "./repositories";
import type {
  JobFingerprintInput,
  QuotaRefundInput,
  QuotaReserveInput,
  QuotaReserveResult,
  QuotaSettleInput,
  QuotaWindowInput,
  TargetedPage,
  TargetedPageQuery,
  TargetedPaginationPort,
  TargetedQueriesPort,
} from "./targeted-queries";
import type {
  AccountStatus,
  AiRunRecord,
  ArtifactCoverage,
  ArtifactRecord,
  AssessmentResult,
  AttemptRecord,
  AttestationRecord,
  AuditRecord,
  BranchCommitRecord,
  BrewJobRecord,
  CandidateRecord,
  CandidateSetRecord,
  ChunkRecord,
  ConsentRecord,
  DataRequestRecord,
  DevSessionRecord,
  FeatureFlagRecord,
  FootprintEventRecord,
  IdempotencyRecord,
  IdentityLinkRecord,
  InviteRecord,
  JobRecord,
  JourneyRecord,
  MasteryRecord,
  ModuleGraph,
  ModuleRecord,
  ModuleVersionRecord,
  OutboxEventRecord,
  PersonalizationRecord,
  ProfileRecord,
  ProjectRecord,
  ProofRecord,
  QuotaReservationRecord,
  RankingSnapshotRecord,
  ReportRecord,
  ReviewCaseRecord,
  SearchAttemptRecord,
  StoredObjectRecord,
  UploadSessionRecord,
  UserRecord,
  XpLedgerRecord,
} from "./types";
import type { JsonRecord } from "./validation";

export interface PostgresTransactionRunner {
  transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T>;
}

interface PgClientLike extends SqlExecutor {
  release(error?: Error | boolean): void;
}

export interface PgPoolLike {
  connect(): Promise<PgClientLike>;
}

/**
 * Production transaction runner for node-postgres. Serializable isolation is
 * intentional for the first identity-map Unit of Work: a concurrent update
 * to a row read into the identity map aborts safely instead of being silently
 * overwritten by a stale flush. The store retries serialization failures.
 */
export function createPgPoolTransactionRunner(pool: PgPoolLike): PostgresTransactionRunner {
  return {
    async transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      let releaseError: Error | undefined;
      try {
        await client.query("begin isolation level serializable");
        const result = await work(client);
        await client.query("commit");
        return result;
      } catch (error) {
        try {
          await client.query("rollback");
        } catch (rollbackError) {
          releaseError = rollbackError instanceof Error
            ? rollbackError
            : new Error("PostgreSQL rollback failed");
        }
        throw error;
      } finally {
        client.release(releaseError);
      }
    },
  };
}

export interface PostgresGonStoreOptions {
  seedInviteCode?: string;
  seedInviteExpiresAt?: string;
  maxTransactionAttempts?: number;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code?: unknown }).code ?? "");
  return code === "40001" || code === "40P01";
}

function savepointExecutor(executor: SqlExecutor): SqlExecutor {
  let sequence = 0;
  return {
    async query(text: string, params?: unknown[]) {
      sequence += 1;
      const name = `gon_search_${sequence}`;
      await executor.query(`savepoint ${name}`);
      try {
        const result = await executor.query(text, params);
        await executor.query(`release savepoint ${name}`);
        return result;
      } catch (error) {
        await executor.query(`rollback to savepoint ${name}`);
        await executor.query(`release savepoint ${name}`);
        throw error;
      }
    },
  };
}

/**
 * PostgreSQL Unit of Work for all normalized GON domain aggregates.
 *
 * The adapter loads an identity map at transaction start, lets the domain
 * core work synchronously, then diffs and flushes changed aggregates to the
 * normalized schema before COMMIT. The hybrid Search port is bound to the
 * same transaction (behind a savepoint) so Search, jobs, outbox events and
 * candidate writes commit or roll back together.
 *
 * Explicit non-durable boundaries:
 * - dev sessions are process-local and only reachable when Dev Auth is on;
 * - stored-object bytes belong to the local upload simulator and are never
 *   written to PostgreSQL. Artifact/upload-session metadata is durable.
 */
export class PostgresGonStore implements GonStore {
  readonly kind = "postgres" as const;

  private readonly ephemerDevSessions = new Map<string, DevSessionRecord>();
  private readonly ephemeralObjects = new Map<string, StoredObjectRecord>();
  private readonly maxTransactionAttempts: number;

  constructor(
    private readonly runner: PostgresTransactionRunner,
    private readonly options: PostgresGonStoreOptions = {},
  ) {
    const attempts = options.maxTransactionAttempts ?? 3;
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
      throw new Error("maxTransactionAttempts must be an integer between 1 and 5");
    }
    this.maxTransactionAttempts = attempts;
  }

  async runInTransaction<T>(
    work: (repositories: GonRepositories) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxTransactionAttempts; attempt += 1) {
      try {
        return await this.runner.transaction(async (executor) => {
          const repositories = await loadRepositories(
            executor,
            this.ephemerDevSessions,
            this.ephemeralObjects,
          );
          const snapshot = snapshotRepositories(repositories);
          if (this.options.seedInviteCode) {
            repositories.seedInvite(
              this.options.seedInviteCode,
              this.options.seedInviteExpiresAt,
            );
          }
          const result = await work(repositories);
          await flushRepositories(executor, repositories, snapshot);
          return result;
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableTransactionError(error) || attempt === this.maxTransactionAttempts) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  async ensureSeedInvite(code: string, expiresAt?: string): Promise<InviteRecord> {
    return this.runInTransaction(async (repositories) =>
      repositories.seedInvite(code, expiresAt),
    );
  }
}

type Row = Record<string, unknown>;

async function queryRows(
  executor: SqlExecutor,
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const result = await executor.query(text, params);
  return result.rows as Row[];
}

async function countRows(
  executor: SqlExecutor,
  text: string,
  params: unknown[] = [],
): Promise<number> {
  const rows = await queryRows(executor, text, params);
  return Number(asText(rows[0]?.total, "0"));
}

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

function asIso(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return fallback;
}

function asNullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : asIso(value);
}

function asEnum<T extends string>(value: unknown, fallback: T): T {
  return (typeof value === "string" && value ? value : fallback) as T;
}

function asNullableEnum<T extends string>(value: unknown): T | null {
  return typeof value === "string" && value ? (value as T) : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function asJsonRecord(value: unknown): JsonRecord {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonRecord)
    : {};
}

function asJsonArray(value: unknown): unknown[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function parsePostgresTextArray(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed || trimmed === "{}") return [];
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [trimmed];

  const values: string[] = [];
  let index = 1;
  const end = trimmed.length - 1;
  while (index < end) {
    if (trimmed[index] === '"') {
      index += 1;
      let value = "";
      while (index < end) {
        const char = trimmed[index];
        if (char === "\\") {
          index += 1;
          if (index < end) {
            value += trimmed[index];
            index += 1;
          }
        } else if (char === '"') {
          index += 1;
          break;
        } else {
          value += char;
          index += 1;
        }
      }
      values.push(value);
    } else {
      const start = index;
      while (index < end && trimmed[index] !== ",") index += 1;
      const token = trimmed.slice(start, index).trim();
      if (token && token !== "NULL") values.push(token);
    }
    if (trimmed[index] === ",") index += 1;
  }
  return values;
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return parsePostgresTextArray(value);
  return [];
}

function asVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
}

function jsonParam(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function textArrayParam(values: readonly string[]): string {
  return formatPostgresTextArray(values.map(String));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function coverageFromRow(value: unknown): ArtifactCoverage {
  const record = asJsonRecord(value);
  return {
    hasMetadata: asBoolean(record.hasMetadata),
    hasText: asBoolean(record.hasText),
    hasTranscript: asBoolean(record.hasTranscript),
    chunkCount: asNumber(record.chunkCount),
  };
}

function jobFromRow(row: Record<string, unknown>): JobRecord {
  return {
    id: asText(row.id),
    jobType: asText(row.job_type),
    ownerUserId: asText(row.owner_user_id),
    aggregateType: asText(row.aggregate_type),
    aggregateId: asText(row.aggregate_id),
    status: asEnum(row.status, "queued"),
    currentStep: asNullableText(row.current_step),
    idempotencyKey: asText(row.idempotency_key),
    inputFingerprint: asText(row.input_fingerprint),
    attemptCount: asNumber(row.attempt_count),
    maxAttempts: asNumber(row.max_attempts, 3),
    estimatedCostUnits: asNumber(row.estimated_cost_units),
    actualCostUnits: asNumber(row.actual_cost_units),
    failureCode: asNullableText(row.failure_code),
    retryable: asBoolean(row.retryable),
    availableAt: asIso(row.available_at, asIso(row.created_at)),
    leaseOwner: asNullableText(row.lease_owner),
    leaseExpiresAt: asNullableIso(row.lease_expires_at),
    createdAt: asIso(row.created_at),
    startedAt: asNullableIso(row.started_at),
    completedAt: asNullableIso(row.completed_at),
    cancelledAt: asNullableIso(row.cancelled_at),
    payload: asJsonRecord(row.payload),
  };
}

function quotaReservationFromRow(row: Record<string, unknown>): QuotaReservationRecord {
  return {
    id: asText(row.id),
    userId: asText(row.user_id),
    quotaKey: asText(row.quota_key),
    windowStart: asIso(row.window_start),
    windowEnd: asIso(row.window_end),
    reservedUnits: asNumber(row.reserved_units),
    consumedUnits: asNumber(row.consumed_units),
    refundedUnits: asNumber(row.refunded_units),
    status: asEnum(row.status, "reserved"),
    jobId: asNullableText(row.job_id),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

/**
 * PostgreSQL binding of the targeted guardrail queries (P05-R1.6).
 *
 * Every method is a targeted statement against indexed columns; quota
 * reservation rows are written directly inside the ambient Unit-of-Work
 * transaction and therefore commit/roll back with it and stay visible to
 * later statements in the same transaction. They deliberately bypass the
 * identity-map diff/flush.
 */
export class PostgresTargetedQueries implements TargetedQueriesPort, TargetedPaginationPort {
  constructor(private readonly executor: SqlExecutor) {}

  async sumActiveQuotaUnits(input: QuotaWindowInput): Promise<number> {
    const rows = await queryRows(
      this.executor,
      `select coalesce(sum(reserved_units - refunded_units), 0) as used
         from quota_reservations
        where user_id = $1 and quota_key = $2
          and window_start = $3::timestamptz and window_end = $4::timestamptz
          and status in ('reserved', 'consumed', 'partially_refunded')`,
      [input.userId, input.quotaKey, input.windowStart, input.windowEnd],
    );
    return Number(asText(rows[0]?.used ?? "0"));
  }

  async reserveQuotaUnits(input: QuotaReserveInput): Promise<QuotaReserveResult> {
    const id = createId("qrsv");
    const consumedUnits = input.mode === "consume" ? input.units : 0;
    const status = input.mode === "consume" ? "consumed" : "reserved";
    const result = await this.executor.query(
      `with active as (
         select coalesce(sum(reserved_units - refunded_units), 0) as used
           from quota_reservations
          where user_id = $1 and quota_key = $2
            and window_start = $3::timestamptz and window_end = $4::timestamptz
            and status in ('reserved', 'consumed', 'partially_refunded')
       ), inserted as (
         insert into quota_reservations
           (id, user_id, quota_key, window_start, window_end,
            reserved_units, consumed_units, refunded_units, status, job_id,
            created_at, updated_at)
         select $5::text, $1::text, $2::text, $3::timestamptz, $4::timestamptz,
                $6::numeric, $7::numeric, 0::numeric, $8::text, $9::text,
                $10::timestamptz, $10::timestamptz
          where (select used from active) + $6::numeric <= $11::numeric
         returning 1
       )
       select (select used from active) as used_before,
              exists (select 1 from inserted) as ok`,
      [
        input.userId,
        input.quotaKey,
        input.windowStart,
        input.windowEnd,
        id,
        input.units,
        consumedUnits,
        status,
        input.jobId ?? null,
        input.createdAt,
        input.limit,
      ],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    const usedBefore = Number(asText(row?.used_before ?? "0"));
    const ok = asBoolean(row?.ok ?? false);
    return {
      reserved: ok,
      usedUnitsBefore: usedBefore,
      usedUnitsAfter: ok ? usedBefore + input.units : usedBefore,
      limit: input.limit,
      reservationId: ok ? id : null,
    };
  }

  private async getReservation(id: string): Promise<QuotaReservationRecord | null> {
    const rows = await queryRows(
      this.executor,
      "select * from quota_reservations where id = $1::text",
      [id],
    );
    const row = rows[0];
    return row ? quotaReservationFromRow(row) : null;
  }

  private async saveReservation(record: QuotaReservationRecord): Promise<QuotaReservationRecord> {
    await this.executor.query(
      `update quota_reservations
          set reserved_units = $2::numeric, consumed_units = $3::numeric,
              refunded_units = $4::numeric, status = $5::text,
              updated_at = $6::timestamptz
        where id = $1::text`,
      [
        record.id,
        record.reservedUnits,
        record.consumedUnits,
        record.refundedUnits,
        record.status,
        record.updatedAt,
      ],
    );
    return record;
  }

  async settleQuotaReservation(input: QuotaSettleInput): Promise<QuotaReservationRecord | null> {
    const record = await this.getReservation(input.reservationId);
    if (!record) return null;
    const consumed = Math.max(0, Math.min(input.consumedUnits, record.reservedUnits));
    const refunded = record.reservedUnits - consumed;
    return this.saveReservation({
      ...record,
      consumedUnits: consumed,
      refundedUnits: refunded,
      status: consumed === 0 ? "refunded" : consumed === record.reservedUnits ? "consumed" : "partially_refunded",
      updatedAt: input.at,
    });
  }

  async refundQuotaReservation(input: QuotaRefundInput): Promise<QuotaReservationRecord | null> {
    const record = await this.getReservation(input.reservationId);
    if (!record) return null;
    const open = record.reservedUnits - record.consumedUnits - record.refundedUnits;
    const refunded = Math.max(0, Math.min(input.refundedUnits, open));
    const refundedTotal = record.refundedUnits + refunded;
    return this.saveReservation({
      ...record,
      refundedUnits: refundedTotal,
      status:
        record.consumedUnits > 0 && refundedTotal < record.reservedUnits
          ? "partially_refunded"
          : "refunded",
      updatedAt: input.at,
    });
  }

  async findReservationsByJobId(jobId: string): Promise<QuotaReservationRecord[]> {
    const rows = await queryRows(
      this.executor,
      "select * from quota_reservations where job_id = $1::text order by created_at, id",
      [jobId],
    );
    return rows.map((row) => quotaReservationFromRow(row));
  }

  async findJobByInputFingerprint(input: JobFingerprintInput): Promise<JobRecord | null> {
    const statuses = input.statuses.filter((status) => /^[a-z_]+$/.test(status));
    if (statuses.length === 0) return null;
    const placeholders = statuses.map((_, index) => `$${index + 4}`).join(", ");
    const rows = await queryRows(
      this.executor,
      `select * from async_jobs
        where owner_user_id = $1 and job_type = $2 and input_fingerprint = $3
          and status in (${placeholders})
        order by created_at desc, id desc
        limit 1`,
      [input.userId, input.jobType, input.fingerprint, ...statuses],
    );
    const row = rows[0];
    return row ? jobFromRow(row) : null;
  }

  // ---------------------------------------------------------------------
  // Targeted pagination (P05-R1.13). These methods page the user-facing
  // ledger/list tables with LIMIT/OFFSET on indexed columns. When bound to a
  // pool-level executor they run OUTSIDE any Unit of Work, so list endpoints
  // never trigger the identity-map load-all. Filter and order semantics are
  // exactly the ones of the in-UoW core lists (see MemoryTargetedPagination).
  // ---------------------------------------------------------------------

  async findAccountStatus(userId: string): Promise<AccountStatus | null> {
    const rows = await queryRows(
      this.executor,
      "select status from gon_users where id = $1",
      [userId],
    );
    const status = rows[0]?.status;
    return typeof status === "string" ? (status as AccountStatus) : null;
  }

  async listJourneySummaries(
    userId: string,
    query: TargetedPageQuery,
  ): Promise<TargetedPage<JourneyRecord>> {
    const rows = await queryRows(
      this.executor,
      `select * from journeys
        where owner_user_id = $1 and deleted_at is null and status <> 'deleted'
        order by updated_at desc, id desc
        limit $2 offset $3`,
      [userId, query.limit, query.offset],
    );
    const total = await countRows(
      this.executor,
      "select count(*) as total from journeys where owner_user_id = $1 and deleted_at is null and status <> 'deleted'",
      [userId],
    );
    return { rows: rows.map(mapJourneyRow), total };
  }

  async journeyOwnedBy(journeyId: string, userId: string): Promise<boolean> {
    const rows = await queryRows(
      this.executor,
      `select 1 from journeys
        where id = $1 and owner_user_id = $2 and deleted_at is null and status <> 'deleted'`,
      [journeyId, userId],
    );
    return rows.length > 0;
  }

  async listJourneyCommitSummaries(
    journeyId: string,
    query: TargetedPageQuery,
  ): Promise<TargetedPage<BranchCommitRecord>> {
    const rows = await queryRows(
      this.executor,
      `select * from branch_commits
        where journey_id = $1
        order by sequence asc
        limit $2 offset $3`,
      [journeyId, query.limit, query.offset],
    );
    const total = await countRows(
      this.executor,
      "select count(*) as total from branch_commits where journey_id = $1",
      [journeyId],
    );
    return { rows: rows.map(mapBranchCommitRow), total };
  }

  async listXpLedgerEntries(
    userId: string,
    query: TargetedPageQuery,
  ): Promise<TargetedPage<XpLedgerRecord>> {
    const rows = await queryRows(
      this.executor,
      `select * from xp_ledger_entries
        where user_id = $1
        order by sequence desc
        limit $2 offset $3`,
      [userId, query.limit, query.offset],
    );
    const total = await countRows(
      this.executor,
      "select count(*) as total from xp_ledger_entries where user_id = $1",
      [userId],
    );
    return { rows: rows.map(mapXpLedgerRow), total };
  }

  async listProofSummaries(
    userId: string,
    query: TargetedPageQuery & { verificationLevel?: string },
  ): Promise<TargetedPage<ProofRecord>> {
    const params: unknown[] = [userId];
    let filter = "owner_user_id = $1 and deleted_at is null and status <> 'deleted'";
    if (query.verificationLevel) {
      if (!/^[a-z_]+$/.test(query.verificationLevel)) {
        return { rows: [], total: 0 };
      }
      params.push(query.verificationLevel);
      filter += ` and verification_level = $${params.length}`;
    }
    params.push(query.limit, query.offset);
    const rows = await queryRows(
      this.executor,
      `select * from proofs where ${filter}
        order by created_at desc, id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const total = await countRows(
      this.executor,
      `select count(*) as total from proofs where ${filter}`,
      params.slice(0, params.length - 2),
    );
    if (rows.length === 0) return { rows: [], total };
    const artifactsByProof = new Map<string, string[]>();
    const placeholders = rows.map((_, index) => `$${index + 1}`).join(", ");
    for (const link of await queryRows(
      this.executor,
      `select proof_id, artifact_id from proof_artifacts
        where proof_id in (${placeholders}) order by proof_id, artifact_id`,
      rows.map((row) => asText(row.id)),
    )) {
      const proofId = asText(link.proof_id);
      const ids = artifactsByProof.get(proofId) ?? [];
      ids.push(asText(link.artifact_id));
      artifactsByProof.set(proofId, ids);
    }
    return {
      rows: rows.map((row) => mapProofRow(row, artifactsByProof.get(asText(row.id)) ?? [])),
      total,
    };
  }
}

/** Row mappers shared by the identity-map loader and the targeted pagination
 * queries (P05-R1.13) so both paths hydrate identical records. */
function mapJourneyRow(row: Row): JourneyRecord {
  return {
    id: asText(row.id),
    ownerUserId: asText(row.owner_user_id),
    projectId: asText(row.project_id),
    sourceCandidateId: asText(row.source_candidate_id),
    upstreamModuleVersionId: asText(row.upstream_module_version_id),
    parentJourneyId: asNullableText(row.parent_journey_id),
    title: asText(row.title),
    goal: asText(row.goal),
    status: asEnum(row.status, "active"),
    attribution: asJsonRecord(row.attribution),
    headCommitId: asNullableText(row.head_commit_id),
    currentNodeId: asNullableText(row.current_node_id),
    version: asNumber(row.version, 1),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    deletedAt: asNullableIso(row.deleted_at),
  };
}

function mapBranchCommitRow(row: Row): BranchCommitRecord {
  return {
    id: asText(row.id),
    journeyId: asText(row.journey_id),
    parentCommitId: asNullableText(row.parent_commit_id),
    sequence: asNumber(row.sequence, 1),
    type: asText(row.type),
    actorUserId: asText(row.actor_user_id),
    payloadRef: asJsonRecord(row.payload_ref),
    summary: asText(row.summary),
    createdAt: asIso(row.created_at),
  };
}

function mapXpLedgerRow(row: Row): XpLedgerRecord {
  return {
    id: asText(row.id),
    userId: asText(row.user_id),
    sequence: asNumber(row.sequence, 1),
    delta: asNumber(row.delta),
    sourceEventId: asText(row.source_event_id),
    sourceType: asText(row.source_type),
    sourceId: asText(row.source_id),
    ruleVersion: asText(row.rule_version),
    formulaVersion: "gon-level-v1",
    status: asEnum(row.status, "posted"),
    reversesEntryId: asNullableText(row.reverses_entry_id),
    reasonCode: asNullableText(row.reason_code),
    lifetimeXpAfter: asNumber(row.lifetime_xp_after),
    createdAt: asIso(row.created_at),
  };
}

function mapProofRow(row: Row, artifactIds: string[]): ProofRecord {
  return {
    id: asText(row.id),
    ownerUserId: asText(row.owner_user_id),
    proofType: asText(row.proof_type),
    title: asText(row.title),
    description: asNullableText(row.description),
    journeyId: asNullableText(row.journey_id),
    attemptId: asNullableText(row.attempt_id),
    artifactIds,
    issuerDisplayName: asNullableText(row.issuer_display_name),
    externalReference: asNullableText(row.external_reference),
    verificationLevel: asEnum(row.verification_level, "self_declared"),
    status: asEnum(row.status, "active"),
    proves: asTextArray(row.proves),
    doesNotProve: asTextArray(row.does_not_prove),
    version: asNumber(row.version, 1),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    deletedAt: asNullableIso(row.deleted_at),
  };
}

async function loadRepositories(
  executor: SqlExecutor,
  devSessions: Map<string, DevSessionRecord>,
  objects: Map<string, StoredObjectRecord>,
): Promise<InMemoryGonRepositories> {
  const repositories = new InMemoryGonRepositories({
    devSessions,
    objects,
    hybridSearch: new PostgresHybridSearchRepository(savepointExecutor(executor)),
    targetedQueries: new PostgresTargetedQueries(executor),
  });

  const roleOrder = new Map<string, number>([
    ["learner", 0],
    ["reviewer", 1],
    ["admin", 2],
  ]);
  const rolesByUser = new Map<string, string[]>();
  for (const row of await queryRows(
    executor,
    `select user_id, role from role_grants
      where revoked_at is null and (expires_at is null or expires_at > now())
      order by user_id, role`,
  )) {
    const userId = asText(row.user_id);
    const roles = rolesByUser.get(userId) ?? [];
    roles.push(asText(row.role));
    rolesByUser.set(userId, roles);
  }
  for (const roles of rolesByUser.values()) {
    roles.sort((a, b) => (roleOrder.get(a) ?? 99) - (roleOrder.get(b) ?? 99));
  }

  for (const row of await queryRows(
    executor,
    "select * from gon_users order by created_at, id",
  )) {
    const id = asText(row.id);
    const user: UserRecord = {
      id,
      status: asEnum(row.status, "onboarding"),
      locale: asText(row.locale, "vi-VN"),
      timeZone: asText(row.time_zone, "Asia/Ho_Chi_Minh"),
      createdAt: asIso(row.created_at),
      deletedAt: asNullableIso(row.deleted_at),
      roles: (rolesByUser.get(id) ?? []) as UserRecord["roles"],
    };
    const authUserId = asNullableText(row.auth_user_id);
    if (authUserId !== null) user.authUserId = authUserId;
    repositories.users.set(id, user);
  }

  for (const row of await queryRows(
    executor,
    "select * from identity_links order by provider, provider_subject",
  )) {
    const record: IdentityLinkRecord = {
      userId: asText(row.user_id),
      provider: asEnum(row.provider, "google"),
      providerSubject: asText(row.provider_subject),
      emailAtLink: asNullableText(row.email_at_link),
      linkedAt: asIso(row.linked_at),
    };
    repositories.identityLinks.set(`${record.provider}:${record.providerSubject}`, record);
  }

  for (const row of await queryRows(executor, "select * from user_profiles order by user_id")) {
    const record: ProfileRecord = {
      userId: asText(row.user_id),
      displayName: asText(row.display_name),
      selfDeclaredHeadline: asNullableText(row.self_declared_headline),
      version: asNumber(row.version, 1),
    };
    repositories.profiles.set(record.userId, record);
  }

  for (const row of await queryRows(executor, "select * from invites order by created_at, id")) {
    const record: InviteRecord = {
      id: asText(row.id),
      codeHash: asText(row.code_hash),
      status: asEnum(row.status, "active"),
      expiresAt: asIso(row.expires_at),
      redeemedByUserId: asNullableText(row.redeemed_by_user_id),
      redeemedAt: asNullableIso(row.redeemed_at),
      createdAt: asIso(row.created_at),
    };
    repositories.invitesByHash.set(record.codeHash, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from age_attestations order by attested_at, id",
  )) {
    const record: AttestationRecord = {
      id: asText(row.id),
      userId: asText(row.user_id),
      method: "self_attested_18_plus",
      termsVersion: asText(row.terms_version),
      privacyVersion: asText(row.privacy_version),
      attestedAt: asIso(row.attested_at),
    };
    repositories.attestations.set(record.id, record);
  }

  for (const row of await queryRows(executor, "select * from consents order by user_id, purpose")) {
    const record: ConsentRecord = {
      userId: asText(row.user_id),
      purpose: asText(row.purpose),
      status: asEnum(row.status, "not_set"),
      policyVersion: asText(row.policy_version),
      changedAt: asIso(row.changed_at),
      source: asText(row.source),
    };
    repositories.consents.set(`${record.userId}:${record.purpose}`, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from learning_projects order by created_at, id",
  )) {
    const record: ProjectRecord = {
      id: asText(row.id),
      ownerUserId: asText(row.owner_user_id),
      title: asText(row.title),
      goal: asText(row.goal),
      rawPromptArtifactId: asText(row.raw_prompt_artifact_id),
      learningMode: asEnum(row.learning_mode, "deep_mastery"),
      depth: asEnum(row.depth, "standard"),
      timeBudgetMinutes: asNumber(row.time_budget_minutes, 30),
      locale: asText(row.locale, "vi-VN"),
      currentSearchAttemptId: asNullableText(row.current_search_attempt_id),
      currentBrewJobId: asNullableText(row.current_brew_job_id),
      currentCandidateSetId: asNullableText(row.current_candidate_set_id),
      version: asNumber(row.version, 1),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      archivedAt: asNullableIso(row.archived_at),
      deletedAt: asNullableIso(row.deleted_at),
    };
    repositories.projects.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from source_artifacts order by created_at, id",
  )) {
    const record: ArtifactRecord = {
      id: asText(row.id),
      projectId: asText(row.project_id),
      ownerUserId: asText(row.owner_user_id),
      kind: asEnum(row.kind, "text"),
      originUri: asNullableText(row.origin_uri),
      displayName: asText(row.display_name),
      sourcePlatform: asNullableText(row.source_platform),
      storageObjectKey: asNullableText(row.storage_object_key),
      declaredMimeType: asNullableText(row.declared_mime_type),
      detectedMimeType: asNullableText(row.detected_mime_type),
      byteSize: row.byte_size === null || row.byte_size === undefined ? null : asNumber(row.byte_size),
      sha256: asText(row.sha256),
      rightsBasis: asText(row.rights_basis),
      rightsNote: asNullableText(row.rights_note),
      sourceText: asNullableText(row.source_text),
      safetyStatus: asEnum(row.safety_status, "pending_scan"),
      extractionStatus: asEnum(row.extraction_status, "queued"),
      failureCode: asNullableText(row.failure_code),
      coverage: coverageFromRow(row.coverage),
      createdAt: asIso(row.created_at),
      deletedAt: asNullableIso(row.deleted_at),
      version: asNumber(row.version, 1),
    };
    repositories.artifacts.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from artifact_upload_sessions order by artifact_id",
  )) {
    const record: UploadSessionRecord = {
      artifactId: asText(row.artifact_id),
      projectId: asText(row.project_id),
      ownerUserId: asText(row.owner_user_id),
      tokenHash: asText(row.token_hash),
      objectKey: asText(row.object_key),
      declaredMimeType: asText(row.declared_mime_type),
      declaredByteSize: asNumber(row.declared_byte_size),
      declaredSha256: asText(row.declared_sha256),
      expiresAt: asIso(row.expires_at),
      uploadedAt: asNullableIso(row.uploaded_at),
      actualByteSize:
        row.actual_byte_size === null || row.actual_byte_size === undefined
          ? null
          : asNumber(row.actual_byte_size),
      actualSha256: asNullableText(row.actual_sha256),
      completedAt: asNullableIso(row.completed_at),
    };
    repositories.uploadSessions.set(record.artifactId, record);
  }

  for (const row of await queryRows(executor, "select * from async_jobs order by created_at, id")) {
    const record = jobFromRow(row);
    repositories.jobs.set(record.id, record);
  }

  for (const row of await queryRows(executor, "select * from modules order by created_at, id")) {
    const record: ModuleRecord = {
      id: asText(row.id),
      ownerUserId: asNullableText(row.owner_user_id),
      creatorType: asEnum(row.creator_type, "user"),
      attributionSnapshot: asJsonRecord(row.attribution_snapshot),
      createdAt: asIso(row.created_at),
    };
    repositories.modules.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from module_versions order by created_at, id",
  )) {
    const graphValue = parseJson(row.graph);
    const record: ModuleVersionRecord = {
      id: asText(row.id),
      moduleId: asText(row.module_id),
      versionNumber: asNumber(row.version_number, 1),
      graphSchemaVersion: "gon.module-graph/1.0",
      graph: (graphValue ?? {}) as ModuleGraph,
      language: asText(row.language, "vi-VN"),
      title: asText(row.title),
      summary: asText(row.summary),
      estimatedMinutes: asNumber(row.estimated_minutes, 1),
      difficulty: asText(row.difficulty),
      visibility: asEnum(row.visibility, "private"),
      publicationStatus: asEnum(row.publication_status, "draft_private"),
      groundingStatus: asEnum(row.grounding_status, "unverified"),
      generationLineage: asJsonRecord(row.generation_lineage),
      sourceArtifactVersions: asJsonArray(row.source_artifact_versions) as ModuleVersionRecord["sourceArtifactVersions"],
      parentModuleVersionId: asNullableText(row.parent_module_version_id),
      contentSha256: asText(row.content_sha256),
      createdByUserId: asNullableText(row.created_by_user_id),
      createdAt: asIso(row.created_at),
    };
    repositories.moduleVersions.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    `select
       c.id, c.owner_user_id, c.source_type, c.source_id, c.artifact_id,
       c.module_version_id, c.ordinal, c.chunk_text, c.locator, c.language,
       c.token_count, c.content_sha256, c.weight, c.deleted_at,
       e.embedding_profile, e.provider_model, e.embedding::text as embedding_text
     from content_chunks c
     left join lateral (
       select ce.embedding_profile, ce.provider_model, ce.embedding
       from chunk_embeddings ce
       where ce.chunk_id = c.id
       order by (ce.embedding_profile = $1) desc, ce.created_at desc
       limit 1
     ) e on true
     order by c.source_type, c.source_id, c.ordinal, c.id`,
    [EMBEDDING_PROFILE],
  )) {
    const record: ChunkRecord = {
      id: asText(row.id),
      ownerUserId: asNullableText(row.owner_user_id),
      sourceType: asEnum(row.source_type, "source_artifact"),
      sourceId: asText(row.source_id),
      artifactId: asNullableText(row.artifact_id),
      moduleVersionId: asNullableText(row.module_version_id),
      ordinal: asNumber(row.ordinal),
      text: asText(row.chunk_text),
      locator: asText(row.locator),
      language: asText(row.language, "vi"),
      tokenCount: asNumber(row.token_count),
      contentSha256: asText(row.content_sha256),
      embedding: asVector(row.embedding_text),
      embeddingProfile: asText(row.embedding_profile, EMBEDDING_PROFILE),
      providerModel: asText(row.provider_model, "missing"),
      weight: asNumber(row.weight, 1),
      deletedAt: asNullableIso(row.deleted_at),
    };
    repositories.chunks.set(record.id, record);
  }

  const searchArtifacts = new Map<string, { ids: string[]; versions: Record<string, number> }>();
  for (const row of await queryRows(
    executor,
    "select * from search_attempt_artifacts order by search_attempt_id, artifact_id",
  )) {
    const searchAttemptId = asText(row.search_attempt_id);
    const artifactId = asText(row.artifact_id);
    const entry = searchArtifacts.get(searchAttemptId) ?? { ids: [], versions: {} };
    entry.ids.push(artifactId);
    entry.versions[artifactId] = asNumber(row.artifact_version, 1);
    searchArtifacts.set(searchAttemptId, entry);
  }

  const searchResults = new Map<string, SearchAttemptRecord["results"]>();
  for (const row of await queryRows(
    executor,
    "select * from search_results order by search_attempt_id, rank",
  )) {
    const searchAttemptId = asText(row.search_attempt_id);
    const results = searchResults.get(searchAttemptId) ?? [];
    results.push({
      moduleVersionId: asText(row.module_version_id),
      rank: asNumber(row.rank, results.length + 1),
      title: asText(row.title_snapshot),
      sourceStatus: asEnum(row.source_status, "unverified"),
      reasonCodes: asTextArray(row.reason_codes),
      matchedConcepts: asTextArray(row.matched_concepts),
      missingConcepts: asTextArray(row.missing_concepts),
      internalScores: {
        vector: asNumber(row.vector_score),
        lexical: asNumber(row.lexical_score),
        conceptCoverage: asNumber(row.concept_coverage),
        specificity: asNumber(row.specificity_score),
        quality: asNumber(row.quality_score),
        hybrid: asNumber(row.hybrid_score),
      },
    });
    searchResults.set(searchAttemptId, results);
  }

  for (const row of await queryRows(
    executor,
    "select * from search_attempts order by created_at, id",
  )) {
    const id = asText(row.id);
    const artifacts = searchArtifacts.get(id) ?? { ids: [], versions: {} };
    const record: SearchAttemptRecord = {
      id,
      projectId: asText(row.project_id),
      ownerUserId: asText(row.owner_user_id),
      status: asEnum(row.status, "queued"),
      verdict: asNullableEnum(row.verdict),
      artifactIds: artifacts.ids,
      artifactVersions: artifacts.versions,
      contextSnapshot: asJsonRecord(row.context_snapshot),
      matchedConcepts: asTextArray(row.matched_concepts),
      missingConcepts: asTextArray(row.missing_concepts),
      clarificationQuestions: asJsonArray(row.clarification_questions) as SearchAttemptRecord["clarificationQuestions"],
      results: searchResults.get(id) ?? [],
      searchPolicyVersion: asText(row.search_policy_version),
      embeddingProfile: asText(row.embedding_profile, EMBEDDING_PROFILE),
      latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : asNumber(row.latency_ms),
      createdAt: asIso(row.created_at),
      completedAt: asNullableIso(row.completed_at),
    };
    repositories.searchAttempts.set(id, record);
  }

  for (const row of await queryRows(executor, "select * from brew_jobs order by job_id")) {
    const record: BrewJobRecord = {
      jobId: asText(row.job_id),
      projectId: asText(row.project_id),
      searchAttemptId: asText(row.search_attempt_id),
      resultModuleVersionId: asNullableText(row.result_module_version_id),
    };
    repositories.brewJobs.set(record.jobId, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from candidate_sets order by created_at, id",
  )) {
    const record: CandidateSetRecord = {
      id: asText(row.id),
      projectId: asText(row.project_id),
      searchAttemptId: asText(row.search_attempt_id),
      sourceModuleVersionId: asNullableText(row.source_module_version_id),
      generationMethod: asText(row.generation_method),
      generatorVersion: asText(row.generator_version),
      status: asEnum(row.status, "building"),
      targetCount: asNumber(row.target_count, 10),
      actualCount: asNumber(row.actual_count),
      shortfallReasonCodes: asTextArray(row.shortfall_reason_codes),
      createdAt: asIso(row.created_at),
    };
    repositories.candidateSets.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from output_candidates order by created_at, id",
  )) {
    const signals = asJsonRecord(row.internal_signals);
    const record: CandidateRecord = {
      id: asText(row.id),
      candidateSetId: asText(row.candidate_set_id),
      projectId: asText(row.project_id),
      moduleVersionId: asText(row.module_version_id),
      title: asText(row.title),
      promise: asText(row.promise),
      cluster: asText(row.cluster),
      format: asText(row.format),
      estimatedMinutes: asNumber(row.estimated_minutes, 1),
      difficulty: asText(row.difficulty),
      artifactOutcome: asText(row.artifact_outcome),
      prerequisiteConceptIds: asTextArray(row.prerequisite_concept_ids),
      conceptIds: asTextArray(row.concept_ids),
      sourceStatus: asEnum(row.source_status, "unverified"),
      status: asEnum(row.status, "eligible"),
      semanticFingerprint: asText(row.semantic_fingerprint),
      internalSignals: {
        relevance: asNumber(signals.relevance),
        conceptCoverage: asNumber(signals.conceptCoverage),
        sourceQuality: asNumber(signals.sourceQuality),
      },
      createdAt: asIso(row.created_at),
    };
    repositories.candidates.set(record.id, record);
  }

  const rankingItems = new Map<
    string,
    {
      orderedCandidateIds: string[];
      signalBreakdown: Record<string, JsonRecord>;
      reasonCodesByCandidate: Record<string, string[]>;
    }
  >();
  for (const row of await queryRows(
    executor,
    "select * from ranking_snapshot_items order by ranking_snapshot_id, rank",
  )) {
    const snapshotId = asText(row.ranking_snapshot_id);
    const candidateId = asText(row.candidate_id);
    const entry = rankingItems.get(snapshotId) ?? {
      orderedCandidateIds: [],
      signalBreakdown: {},
      reasonCodesByCandidate: {},
    };
    entry.orderedCandidateIds.push(candidateId);
    entry.signalBreakdown[candidateId] = asJsonRecord(row.signal_breakdown);
    entry.reasonCodesByCandidate[candidateId] = asTextArray(row.reason_codes);
    rankingItems.set(snapshotId, entry);
  }

  for (const row of await queryRows(
    executor,
    "select * from ranking_snapshots order by created_at, id",
  )) {
    const id = asText(row.id);
    const items = rankingItems.get(id) ?? {
      orderedCandidateIds: [],
      signalBreakdown: {},
      reasonCodesByCandidate: {},
    };
    const record: RankingSnapshotRecord = {
      id,
      userId: asText(row.user_id),
      projectId: asText(row.project_id),
      candidateSetId: asText(row.candidate_set_id),
      learningMode: asEnum(row.learning_mode, "deep_mastery"),
      algorithmVersion: asText(row.algorithm_version),
      personalizationApplied: asBoolean(row.personalization_applied),
      orderedCandidateIds: items.orderedCandidateIds,
      explanationCodes: asTextArray(row.explanation_codes),
      signalBreakdown: items.signalBreakdown,
      reasonCodesByCandidate: items.reasonCodesByCandidate,
      createdAt: asIso(row.created_at),
      staleAt: asIso(row.stale_at),
    };
    repositories.rankingSnapshots.set(id, record);
  }

  for (const row of await queryRows(executor, "select * from journeys order by created_at, id")) {
    const record = mapJourneyRow(row);
    repositories.journeys.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from branch_commits order by journey_id, sequence",
  )) {
    const record = mapBranchCommitRow(row);
    repositories.branchCommits.set(record.id, record);
  }

  const xpAwardedByAttempt = new Map<string, number>();
  for (const row of await queryRows(
    executor,
    "select * from xp_ledger_entries order by user_id, sequence",
  )) {
    const record = mapXpLedgerRow(row);
    repositories.xpLedger.set(record.id, record);
    repositories.restoreXpSequence(record.userId, record.sequence);
    if (record.sourceType === "learning_attempt") {
      xpAwardedByAttempt.set(
        record.sourceId,
        (xpAwardedByAttempt.get(record.sourceId) ?? 0) + record.delta,
      );
    }
  }

  const attemptArtifacts = new Map<string, string[]>();
  for (const row of await queryRows(
    executor,
    "select * from learning_attempt_artifacts order by attempt_id, artifact_id",
  )) {
    const attemptId = asText(row.attempt_id);
    const ids = attemptArtifacts.get(attemptId) ?? [];
    ids.push(asText(row.artifact_id));
    attemptArtifacts.set(attemptId, ids);
  }

  const latestAssessments = new Map<string, AssessmentResult>();
  for (const row of await queryRows(
    executor,
    "select * from assessment_results order by attempt_id, created_at desc, id desc",
  )) {
    const attemptId = asText(row.attempt_id);
    if (latestAssessments.has(attemptId)) continue;
    latestAssessments.set(attemptId, {
      decision: asEnum(row.decision, "needs_revision"),
      criteria: asJsonArray(row.criteria) as AssessmentResult["criteria"],
      feedback: asText(row.feedback),
      confidence: asNumber(row.confidence),
      assessorType: asEnum(row.assessor_type, "deterministic"),
      assessorVersion: asText(row.assessor_version),
      integritySignals: asTextArray(row.integrity_signals),
    });
  }

  for (const row of await queryRows(
    executor,
    "select * from learning_attempts order by created_at, id",
  )) {
    const id = asText(row.id);
    const record: AttemptRecord = {
      id,
      journeyId: asText(row.journey_id),
      ownerUserId: asText(row.owner_user_id),
      moduleVersionId: asText(row.module_version_id),
      nodeId: asText(row.node_id),
      attemptNumber: asNumber(row.attempt_number, 1),
      status: asEnum(row.status, "draft"),
      answerText: asNullableText(row.answer_text),
      artifactIds: attemptArtifacts.get(id) ?? [],
      sourceDisclosure: asJsonRecord(row.source_disclosure),
      aiAssistanceDisclosure: asJsonRecord(row.ai_assistance_disclosure),
      rubricId: asText(row.rubric_id),
      rubricVersion: asText(row.rubric_version),
      assessment: latestAssessments.get(id) ?? null,
      xpAwarded: xpAwardedByAttempt.get(id) ?? 0,
      version: asNumber(row.version, 1),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      submittedAt: asNullableIso(row.submitted_at),
    };
    repositories.attempts.set(id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from mastery_states order by user_id, concept_id",
  )) {
    const record: MasteryRecord = {
      userId: asText(row.user_id),
      conceptId: asText(row.concept_id),
      level: asEnum(row.level, "exposed"),
      evidenceAttemptId: asNullableText(row.evidence_attempt_id),
      achievedAt: asNullableIso(row.achieved_at),
      lastEvidenceAt: asNullableIso(row.last_evidence_at),
      reviewDueAt: asNullableIso(row.review_due_at),
      version: asNumber(row.version, 1),
    };
    repositories.mastery.set(`${record.userId}:${record.conceptId}`, record);
  }

  const proofArtifacts = new Map<string, string[]>();
  for (const row of await queryRows(
    executor,
    "select * from proof_artifacts order by proof_id, artifact_id",
  )) {
    const proofId = asText(row.proof_id);
    const ids = proofArtifacts.get(proofId) ?? [];
    ids.push(asText(row.artifact_id));
    proofArtifacts.set(proofId, ids);
  }

  for (const row of await queryRows(executor, "select * from proofs order by created_at, id")) {
    const id = asText(row.id);
    const record = mapProofRow(row, proofArtifacts.get(id) ?? []);
    repositories.proofs.set(id, record);
  }

  for (const row of await queryRows(executor, "select * from reports order by created_at, id")) {
    const record: ReportRecord = {
      id: asText(row.id),
      reporterUserId: asText(row.reporter_user_id),
      targetType: asText(row.target_type),
      targetId: asText(row.target_id),
      targetVersion: asNullableText(row.target_version),
      reasonCode: asText(row.reason_code),
      detail: asNullableText(row.detail),
      status: asEnum(row.status, "received"),
      createdAt: asIso(row.created_at),
    };
    repositories.reports.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from moderation_cases order by created_at, id",
  )) {
    const record: ReviewCaseRecord = {
      id: asText(row.id),
      reportId: asText(row.report_id),
      riskLevel: asEnum(row.risk_level, "low"),
      status: asText(row.status, "open"),
      assigneeUserId: asNullableText(row.assignee_user_id),
      createdAt: asIso(row.created_at),
    };
    repositories.reviewCases.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from outbox_events order by occurred_at, event_id",
  )) {
    repositories.outboxEvents.append({
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
      publishState: asEnum(row.publish_state, "pending"),
      availableAt: asIso(row.available_at, asIso(row.occurred_at)),
      publishedAt: asNullableIso(row.published_at),
      publishAttemptCount: asNumber(row.publish_attempt_count),
      lastErrorCode: asNullableText(row.last_error_code),
    });
  }

  for (const row of await queryRows(
    executor,
    "select * from audit_logs order by created_at, id",
  )) {
    repositories.auditLogs.append({
      id: asText(row.id),
      actorType: asText(row.actor_type, "user"),
      actorId: asText(row.actor_id),
      action: asText(row.action),
      objectType: asText(row.object_type),
      objectId: asText(row.object_id),
      requestId: asText(row.request_id),
      reason: asNullableText(row.reason),
      createdAt: asIso(row.created_at),
    });
  }

  for (const row of await queryRows(
    executor,
    "select * from ai_runs order by created_at, id",
  )) {
    repositories.aiRuns.append({
      // Local correlation only: PostgreSQL keeps its own bigint identity.
      id: String(row.id),
      jobId: asNullableText(row.job_id),
      operation: asText(row.operation) as AiRunRecord["operation"],
      provider: asText(row.provider),
      modelId: asText(row.model_id),
      agentPipelineVersion: asText(row.agent_pipeline_version),
      promptTemplateVersions: asTextArray(row.prompt_template_versions),
      inputSchemaVersion: asText(row.input_schema_version),
      outputSchemaVersion: asText(row.output_schema_version),
      evidenceBundleHash: asNullableText(row.evidence_bundle_hash),
      inputTokens: row.input_tokens === null || row.input_tokens === undefined
        ? null
        : Number(row.input_tokens),
      outputTokens: row.output_tokens === null || row.output_tokens === undefined
        ? null
        : Number(row.output_tokens),
      costUnits: asNumber(row.cost_units),
      latencyMs: row.latency_ms === null || row.latency_ms === undefined
        ? null
        : Number(row.latency_ms),
      finishReason: asNullableText(row.finish_reason),
      errorCode: asNullableText(row.error_code),
      createdAt: asIso(row.created_at),
    });
  }

  for (const row of await queryRows(
    executor,
    "select * from idempotency_records order by created_at, actor_user_id, operation, idempotency_key",
  )) {
    const actorUserId = asText(row.actor_user_id);
    const operation = asText(row.operation);
    const key = asText(row.idempotency_key);
    repositories.idempotencyRecords.set(`${actorUserId}:${operation}:${key}`, {
      key,
      actorUserId,
      operation,
      requestFingerprint: asText(row.request_fingerprint),
      resourceType: asText(row.resource_type),
      resourceId: asText(row.resource_id),
      status: asNumber(row.http_status, 200),
      createdAt: asIso(row.created_at),
    });
  }

  for (const row of await queryRows(executor, "select * from feature_flags order by key")) {
    const record: FeatureFlagRecord = {
      key: asText(row.key),
      enabled: asBoolean(row.enabled),
      scope: asJsonRecord(row.scope),
      version: asNumber(row.version, 1),
      updatedAt: asIso(row.updated_at),
    };
    repositories.featureFlags.set(record.key, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from data_requests order by requested_at, id",
  )) {
    const record: DataRequestRecord = {
      id: asText(row.id),
      userId: asText(row.user_id),
      requestType: asEnum(row.request_type, "export"),
      scope: asJsonRecord(row.scope),
      status: asEnum(row.status, "requested"),
      receipt: row.receipt === null || row.receipt === undefined ? null : asJsonRecord(row.receipt),
      requestedAt: asIso(row.requested_at),
      completedAt: asNullableIso(row.completed_at),
    };
    repositories.dataRequests.set(record.id, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from user_personalization order by user_id",
  )) {
    const record: PersonalizationRecord = {
      userId: asText(row.user_id),
      preferences: asJsonRecord(row.preferences),
      version: asNumber(row.version, 1),
      updatedAt: asIso(row.updated_at),
    };
    repositories.personalizations.set(record.userId, record);
  }

  for (const row of await queryRows(
    executor,
    "select * from footprint_events order by id",
  )) {
    const record: FootprintEventRecord = {
      id: asText(row.id),
      userId: asText(row.user_id),
      category: asEnum(row.category, "goal_selected"),
      entityType: asText(row.entity_type),
      entityId: asText(row.entity_id),
      attributes: asJsonRecord(row.attributes),
      consentPurpose: asText(row.consent_purpose, "personalization_footprint"),
      consentStatusAtEvent: asText(row.consent_status_at_event),
      occurredAt: asIso(row.occurred_at),
    };
    repositories.footprintEvents.set(record.id, record);
  }

  return repositories;
}

interface SnapshotEntry {
  record: unknown;
  hash: string;
}

type SnapshotMap = Map<string, SnapshotEntry>;
type RepositorySnapshot = Map<string, SnapshotMap>;

const DURABLE_COLLECTIONS = [
  "users",
  "identityLinks",
  "profiles",
  "invitesByHash",
  "attestations",
  "consents",
  "projects",
  "artifacts",
  "chunks",
  "uploadSessions",
  "searchAttempts",
  "jobs",
  "brewJobs",
  "modules",
  "moduleVersions",
  "candidateSets",
  "candidates",
  "rankingSnapshots",
  "journeys",
  "branchCommits",
  "attempts",
  "mastery",
  "xpLedger",
  "proofs",
  "reports",
  "reviewCases",
  "idempotencyRecords",
  "featureFlags",
  "dataRequests",
  "personalizations",
  "footprintEvents",
] as const;

function snapshotEntries(entries: Iterable<readonly [string, unknown]>): SnapshotMap {
  const snapshot: SnapshotMap = new Map();
  for (const [key, record] of entries) {
    snapshot.set(key, { record: structuredClone(record), hash: stableHash(record) });
  }
  return snapshot;
}

function snapshotRepositories(repositories: GonRepositories): RepositorySnapshot {
  const snapshot: RepositorySnapshot = new Map();
  for (const name of DURABLE_COLLECTIONS) {
    snapshot.set(name, snapshotEntries(repositories[name].entries()));
  }
  snapshot.set(
    "outboxEvents",
    snapshotEntries(
      [...repositories.outboxEvents.values()].map((event) => [event.eventId, event] as const),
    ),
  );
  snapshot.set(
    "auditLogs",
    snapshotEntries(
      [...repositories.auditLogs.values()].map((entry) => [entry.id, entry] as const),
    ),
  );
  snapshot.set(
    "aiRuns",
    snapshotEntries(
      [...repositories.aiRuns.values()].map((run) => [run.id, run] as const),
    ),
  );
  return snapshot;
}

interface CollectionDiff<V> {
  inserted: Array<{ key: string; record: V }>;
  updated: Array<{ key: string; record: V; previous: V }>;
  deleted: Array<{ key: string; previous: V }>;
}

function diffEntries<V>(
  entries: Iterable<readonly [string, V]>,
  snapshot: SnapshotMap,
): CollectionDiff<V> {
  const current = new Map(entries);
  const inserted: CollectionDiff<V>["inserted"] = [];
  const updated: CollectionDiff<V>["updated"] = [];
  const deleted: CollectionDiff<V>["deleted"] = [];

  for (const [key, record] of current) {
    const previous = snapshot.get(key);
    if (!previous) inserted.push({ key, record });
    else if (previous.hash !== stableHash(record)) {
      updated.push({ key, record, previous: previous.record as V });
    }
  }
  for (const [key, previous] of snapshot) {
    if (!current.has(key)) deleted.push({ key, previous: previous.record as V });
  }
  return { inserted, updated, deleted };
}

function assertAppendOnly(name: string, diff: CollectionDiff<unknown>): void {
  if (diff.updated.length > 0 || diff.deleted.length > 0) {
    throw new Error(`${name} is append-only; refusing to update or delete persisted records`);
  }
}

async function syncUserRoles(
  executor: SqlExecutor,
  user: UserRecord,
): Promise<void> {
  await executor.query(
    `update role_grants set revoked_at = now()
      where user_id = $1 and scope = 'global' and revoked_at is null
        and not (role = any($2::text[]))`,
    [user.id, textArrayParam(user.roles)],
  );
  for (const role of user.roles) {
    await executor.query(
      `insert into role_grants (user_id, role, scope)
       select $1, $2, 'global'
        where not exists (
          select 1 from role_grants
           where user_id = $1 and role = $2 and scope = 'global' and revoked_at is null
        )`,
      [user.id, role],
    );
  }
}

async function saveUser(
  executor: SqlExecutor,
  user: UserRecord,
  mode: "insert" | "update",
): Promise<void> {
  const deletedAt = user.deletedAt ?? (user.status === "deleted" ? new Date().toISOString() : null);
  if (mode === "insert") {
    await executor.query(
      `insert into gon_users
         (id, auth_user_id, status, locale, time_zone, created_at, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.authUserId ?? null, user.status, user.locale, user.timeZone, user.createdAt, deletedAt],
    );
  } else {
    await executor.query(
      `update gon_users set auth_user_id = $2, status = $3, locale = $4,
         time_zone = $5, created_at = $6, deleted_at = $7 where id = $1`,
      [user.id, user.authUserId ?? null, user.status, user.locale, user.timeZone, user.createdAt, deletedAt],
    );
  }
  await syncUserRoles(executor, user);
}

async function saveIdentityLink(
  executor: SqlExecutor,
  record: IdentityLinkRecord,
  mode: "insert" | "update",
): Promise<void> {
  if (mode === "insert") {
    await executor.query(
      `insert into identity_links (user_id, provider, provider_subject, email_at_link, linked_at)
       values ($1, $2, $3, $4, $5)`,
      [record.userId, record.provider, record.providerSubject, record.emailAtLink, record.linkedAt],
    );
  } else {
    await executor.query(
      `update identity_links set user_id = $1, email_at_link = $4, linked_at = $5
        where provider = $2 and provider_subject = $3`,
      [record.userId, record.provider, record.providerSubject, record.emailAtLink, record.linkedAt],
    );
  }
}

async function saveProfile(executor: SqlExecutor, record: ProfileRecord): Promise<void> {
  await executor.query(
    `insert into user_profiles (user_id, display_name, self_declared_headline, version, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id) do update set
       display_name = excluded.display_name,
       self_declared_headline = excluded.self_declared_headline,
       version = excluded.version,
       updated_at = now()`,
    [record.userId, record.displayName, record.selfDeclaredHeadline, record.version],
  );
}

async function saveInvite(
  executor: SqlExecutor,
  record: InviteRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.codeHash,
    record.status,
    record.expiresAt,
    record.redeemedByUserId,
    record.redeemedAt,
    record.createdAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into invites
         (id, code_hash, status, expires_at, redeemed_by_user_id, redeemed_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      params,
    );
  } else {
    await executor.query(
      `update invites set code_hash = $2, status = $3, expires_at = $4,
         redeemed_by_user_id = $5, redeemed_at = $6, created_at = $7 where id = $1`,
      params,
    );
  }
}

async function insertAttestation(executor: SqlExecutor, record: AttestationRecord): Promise<void> {
  await executor.query(
    `insert into age_attestations
       (id, user_id, method, terms_version, privacy_version, attested_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [record.id, record.userId, record.method, record.termsVersion, record.privacyVersion, record.attestedAt],
  );
}

async function saveConsent(executor: SqlExecutor, record: ConsentRecord): Promise<void> {
  await executor.query(
    `insert into consents (user_id, purpose, status, policy_version, source, changed_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, purpose) do update set
       status = excluded.status,
       policy_version = excluded.policy_version,
       source = excluded.source,
       changed_at = excluded.changed_at`,
    [record.userId, record.purpose, record.status, record.policyVersion, record.source, record.changedAt],
  );
}

async function insertProject(executor: SqlExecutor, record: ProjectRecord): Promise<void> {
  // Current Search/Brew/candidate rows may be inserted later in this same
  // flush. The full project update at the end restores those pointers.
  await executor.query(
    `insert into learning_projects
       (id, owner_user_id, title, goal, raw_prompt_artifact_id, visibility,
        learning_mode, depth, time_budget_minutes, locale,
        current_search_attempt_id, current_brew_job_id, current_candidate_set_id,
        version, created_at, updated_at, archived_at, deleted_at)
     values ($1, $2, $3, $4, $5, 'private', $6, $7, $8, $9, null, null, null,
       $10, $11, $12, $13, $14)`,
    [
      record.id,
      record.ownerUserId,
      record.title,
      record.goal,
      record.rawPromptArtifactId,
      record.learningMode,
      record.depth,
      record.timeBudgetMinutes,
      record.locale,
      record.version,
      record.createdAt,
      record.updatedAt,
      record.archivedAt,
      record.deletedAt,
    ],
  );
}

async function updateProject(executor: SqlExecutor, record: ProjectRecord): Promise<void> {
  await executor.query(
    `update learning_projects set
       owner_user_id = $2, title = $3, goal = $4, raw_prompt_artifact_id = $5,
       visibility = 'private', learning_mode = $6, depth = $7,
       time_budget_minutes = $8, locale = $9, current_search_attempt_id = $10,
       current_brew_job_id = $11, current_candidate_set_id = $12,
       version = $13, created_at = $14, updated_at = $15,
       archived_at = $16, deleted_at = $17
     where id = $1`,
    [
      record.id,
      record.ownerUserId,
      record.title,
      record.goal,
      record.rawPromptArtifactId,
      record.learningMode,
      record.depth,
      record.timeBudgetMinutes,
      record.locale,
      record.currentSearchAttemptId,
      record.currentBrewJobId,
      record.currentCandidateSetId,
      record.version,
      record.createdAt,
      record.updatedAt,
      record.archivedAt,
      record.deletedAt,
    ],
  );
}

async function saveArtifact(
  executor: SqlExecutor,
  record: ArtifactRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.projectId,
    record.ownerUserId,
    record.kind,
    record.originUri,
    record.displayName,
    record.sourcePlatform,
    record.storageObjectKey,
    record.declaredMimeType,
    record.detectedMimeType,
    record.byteSize,
    record.sha256,
    record.rightsBasis,
    record.rightsNote,
    record.sourceText,
    record.safetyStatus,
    record.extractionStatus,
    record.failureCode,
    jsonParam(record.coverage),
    record.version,
    record.createdAt,
    record.deletedAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into source_artifacts
         (id, project_id, owner_user_id, kind, origin_uri, display_name,
          source_platform, storage_object_key, declared_mime_type,
          detected_mime_type, byte_size, sha256, rights_basis, rights_note,
          source_text, safety_status, extraction_status, failure_code,
          coverage, version, created_at, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)`,
      params,
    );
  } else {
    await executor.query(
      `update source_artifacts set project_id = $2, owner_user_id = $3, kind = $4,
         origin_uri = $5, display_name = $6, source_platform = $7,
         storage_object_key = $8, declared_mime_type = $9,
         detected_mime_type = $10, byte_size = $11, sha256 = $12,
         rights_basis = $13, rights_note = $14, source_text = $15,
         safety_status = $16, extraction_status = $17, failure_code = $18,
         coverage = $19::jsonb, version = $20, created_at = $21,
         deleted_at = $22 where id = $1`,
      params,
    );
  }
}

async function saveUploadSession(
  executor: SqlExecutor,
  record: UploadSessionRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.artifactId,
    record.projectId,
    record.ownerUserId,
    record.tokenHash,
    record.objectKey,
    record.declaredMimeType,
    record.declaredByteSize,
    record.declaredSha256,
    record.expiresAt,
    record.uploadedAt,
    record.actualByteSize,
    record.actualSha256,
    record.completedAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into artifact_upload_sessions
         (artifact_id, project_id, owner_user_id, token_hash, object_key,
          declared_mime_type, declared_byte_size, declared_sha256, expires_at,
          uploaded_at, actual_byte_size, actual_sha256, completed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      params,
    );
  } else {
    await executor.query(
      `update artifact_upload_sessions set project_id = $2, owner_user_id = $3,
         token_hash = $4, object_key = $5, declared_mime_type = $6,
         declared_byte_size = $7, declared_sha256 = $8, expires_at = $9,
         uploaded_at = $10, actual_byte_size = $11, actual_sha256 = $12,
         completed_at = $13 where artifact_id = $1`,
      params,
    );
  }
}

async function saveJob(
  executor: SqlExecutor,
  record: JobRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.jobType,
    record.ownerUserId,
    record.aggregateType,
    record.aggregateId,
    record.status,
    record.currentStep,
    record.idempotencyKey,
    record.inputFingerprint,
    record.attemptCount,
    record.maxAttempts,
    record.estimatedCostUnits,
    record.actualCostUnits,
    record.failureCode,
    record.retryable,
    jsonParam(record.payload),
    record.createdAt,
    record.startedAt,
    record.completedAt,
    record.cancelledAt,
    record.availableAt,
    record.leaseOwner,
    record.leaseExpiresAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into async_jobs
         (id, job_type, owner_user_id, aggregate_type, aggregate_id, status,
          current_step, idempotency_key, input_fingerprint, attempt_count,
          max_attempts, estimated_cost_units, actual_cost_units, failure_code,
          retryable, payload, created_at, started_at, completed_at, cancelled_at,
          available_at, lease_owner, lease_expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16::jsonb, $17, $18, $19, $20, $21, $22, $23)`,
      params,
    );
  } else {
    await executor.query(
      `update async_jobs set job_type = $2, owner_user_id = $3,
         aggregate_type = $4, aggregate_id = $5, status = $6,
         current_step = $7, idempotency_key = $8, input_fingerprint = $9,
         attempt_count = $10, max_attempts = $11,
         estimated_cost_units = $12, actual_cost_units = $13,
         failure_code = $14, retryable = $15, payload = $16::jsonb,
         created_at = $17, started_at = $18, completed_at = $19,
         cancelled_at = $20, available_at = $21, lease_owner = $22,
         lease_expires_at = $23 where id = $1`,
      params,
    );
  }
}

async function saveModule(
  executor: SqlExecutor,
  record: ModuleRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.ownerUserId,
    record.creatorType,
    jsonParam(record.attributionSnapshot),
    record.createdAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into modules (id, owner_user_id, creator_type, attribution_snapshot, created_at)
       values ($1, $2, $3, $4::jsonb, $5)`,
      params,
    );
  } else {
    await executor.query(
      `update modules set owner_user_id = $2, creator_type = $3,
         attribution_snapshot = $4::jsonb, created_at = $5 where id = $1`,
      params,
    );
  }
}

async function ensureConcept(
  executor: SqlExecutor,
  conceptId: string,
  canonicalName = conceptId,
): Promise<void> {
  await executor.query(
    `insert into concepts (id, slug, canonical_name)
     values ($1, $1, $2)
     on conflict (id) do update set canonical_name = excluded.canonical_name`,
    [conceptId, canonicalName || conceptId],
  );
}

async function syncModuleVersionRelations(
  executor: SqlExecutor,
  repositories: GonRepositories,
  record: ModuleVersionRecord,
): Promise<void> {
  for (const concept of record.graph.module.concepts) {
    await ensureConcept(executor, concept.id, concept.name);
  }
  await executor.query("delete from module_concepts where module_version_id = $1", [record.id]);
  for (const concept of record.graph.module.concepts) {
    await executor.query(
      `insert into module_concepts (module_version_id, concept_id, role, weight)
       values ($1, $2, $3, 1)`,
      [record.id, concept.id, concept.role],
    );
  }

  await executor.query("delete from citation_references where module_version_id = $1", [record.id]);
  const sources = new Map(record.graph.sources.map((source) => [source.id, source]));
  for (const node of record.graph.nodes) {
    for (const citation of node.citations) {
      const source = sources.get(citation.sourceId);
      const artifactId =
        typeof source?.artifactId === "string" && repositories.artifacts.get(source.artifactId)
          ? source.artifactId
          : null;
      const externalUri =
        typeof source?.uri === "string"
          ? source.uri
          : typeof source?.url === "string"
            ? source.url
            : typeof source?.externalUri === "string"
              ? source.externalUri
              : null;
      let locator = citation.locator ?? null;
      if (!locator && Array.isArray(source?.locators)) {
        const first = source.locators[0] as { value?: unknown } | string | undefined;
        locator = typeof first === "string" ? first : typeof first?.value === "string" ? first.value : null;
      }
      const claimIds = citation.claimIds && citation.claimIds.length > 0 ? citation.claimIds : [null];
      for (const claimId of claimIds) {
        await executor.query(
          `insert into citation_references
             (module_version_id, node_id, claim_id, graph_source_id,
              source_artifact_id, external_source_uri, locator, support_status)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [record.id, node.id, claimId, citation.sourceId, artifactId, externalUri, locator, citation.support],
        );
      }
    }
  }
}

function assertModuleVersionImmutableFields(
  previous: ModuleVersionRecord,
  current: ModuleVersionRecord,
): void {
  const comparisons: Array<[string, unknown, unknown]> = [
    ["moduleId", previous.moduleId, current.moduleId],
    ["versionNumber", previous.versionNumber, current.versionNumber],
    ["graphSchemaVersion", previous.graphSchemaVersion, current.graphSchemaVersion],
    ["graph", stableHash(previous.graph), stableHash(current.graph)],
    ["language", previous.language, current.language],
    ["title", previous.title, current.title],
    ["summary", previous.summary, current.summary],
    ["estimatedMinutes", previous.estimatedMinutes, current.estimatedMinutes],
    ["difficulty", previous.difficulty, current.difficulty],
    ["generationLineage", stableHash(previous.generationLineage), stableHash(current.generationLineage)],
    ["sourceArtifactVersions", stableHash(previous.sourceArtifactVersions), stableHash(current.sourceArtifactVersions)],
    ["parentModuleVersionId", previous.parentModuleVersionId, current.parentModuleVersionId],
    ["contentSha256", previous.contentSha256, current.contentSha256],
    ["createdByUserId", previous.createdByUserId, current.createdByUserId],
    ["createdAt", previous.createdAt, current.createdAt],
  ];
  const changed = comparisons.find(([, before, after]) => before !== after);
  if (changed) {
    throw new Error(
      `module_versions.${changed[0]} is immutable; create a new module version instead`,
    );
  }
}

async function saveModuleVersion(
  executor: SqlExecutor,
  repositories: GonRepositories,
  record: ModuleVersionRecord,
  mode: "insert" | "update",
  previous?: ModuleVersionRecord,
): Promise<void> {
  if (mode === "update") {
    if (previous) assertModuleVersionImmutableFields(previous, record);
    await executor.query(
      `update module_versions set visibility = $2, publication_status = $3,
         grounding_status = $4 where id = $1`,
      [record.id, record.visibility, record.publicationStatus, record.groundingStatus],
    );
    return;
  }

  await executor.query(
    `insert into module_versions
       (id, module_id, version_number, graph_schema_version, graph, language,
        title, summary, estimated_minutes, difficulty, visibility,
        publication_status, grounding_status, generation_lineage,
        source_artifact_versions, parent_module_version_id, content_sha256,
        created_by_user_id, created_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12,
       $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19)`,
    [
      record.id,
      record.moduleId,
      record.versionNumber,
      record.graphSchemaVersion,
      jsonParam(record.graph),
      record.language,
      record.title,
      record.summary,
      record.estimatedMinutes,
      record.difficulty,
      record.visibility,
      record.publicationStatus,
      record.groundingStatus,
      jsonParam(record.generationLineage),
      jsonParam(record.sourceArtifactVersions),
      record.parentModuleVersionId,
      record.contentSha256,
      record.createdByUserId,
      record.createdAt,
    ],
  );
  await syncModuleVersionRelations(executor, repositories, record);
}

async function saveChunkEmbedding(executor: SqlExecutor, record: ChunkRecord): Promise<void> {
  if (record.embedding.length !== EMBEDDING_DIMENSIONS) return;
  let vectorText: string;
  try {
    vectorText = formatPostgresVector(validateEmbeddingVector(record.embedding));
  } catch {
    // A degenerate local embedding must not make the source chunk itself
    // unpersistable. It simply has no vector-index row for this profile.
    return;
  }
  await executor.query(
    `insert into chunk_embeddings
       (chunk_id, embedding_profile, provider_model, task_type, dimensions,
        embedding, normalized, index_version)
     values ($1, $2, $3, 'SEMANTIC_SIMILARITY', 768, $4::vector, true, $2)
     on conflict (chunk_id, embedding_profile) do update set
       provider_model = excluded.provider_model,
       embedding = excluded.embedding,
       normalized = true`,
    [record.id, record.embeddingProfile, record.providerModel, vectorText],
  );
}

async function saveChunk(
  executor: SqlExecutor,
  record: ChunkRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.ownerUserId,
    record.sourceType,
    record.sourceId,
    record.artifactId,
    record.moduleVersionId,
    record.ordinal,
    record.text,
    record.locator,
    record.language,
    record.tokenCount,
    record.contentSha256,
    record.weight,
    record.deletedAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into content_chunks
         (id, owner_user_id, source_type, source_id, artifact_id,
          module_version_id, ordinal, chunk_text, locator, language,
          token_count, content_sha256, weight, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      params,
    );
  } else {
    await executor.query(
      `update content_chunks set owner_user_id = $2, source_type = $3,
         source_id = $4, artifact_id = $5, module_version_id = $6,
         ordinal = $7, chunk_text = $8, locator = $9, language = $10,
         token_count = $11, content_sha256 = $12, weight = $13,
         deleted_at = $14 where id = $1`,
      params,
    );
  }
  await saveChunkEmbedding(executor, record);
}

async function saveSearchAttempt(
  executor: SqlExecutor,
  repositories: GonRepositories,
  record: SearchAttemptRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.projectId,
    record.ownerUserId,
    record.status,
    record.verdict,
    jsonParam(record.contextSnapshot),
    textArrayParam(record.matchedConcepts),
    textArrayParam(record.missingConcepts),
    jsonParam(record.clarificationQuestions),
    record.searchPolicyVersion,
    record.embeddingProfile,
    record.latencyMs,
    record.createdAt,
    record.completedAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into search_attempts
         (id, project_id, owner_user_id, status, verdict, context_snapshot,
          matched_concepts, missing_concepts, clarification_questions,
          search_policy_version, embedding_profile, latency_ms, created_at, completed_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::text[], $8::text[],
         $9::jsonb, $10, $11, $12, $13, $14)`,
      params,
    );
  } else {
    await executor.query(
      `update search_attempts set project_id = $2, owner_user_id = $3,
         status = $4, verdict = $5, context_snapshot = $6::jsonb,
         matched_concepts = $7::text[], missing_concepts = $8::text[],
         clarification_questions = $9::jsonb, search_policy_version = $10,
         embedding_profile = $11, latency_ms = $12, created_at = $13,
         completed_at = $14 where id = $1`,
      params,
    );
  }

  await executor.query("delete from search_attempt_artifacts where search_attempt_id = $1", [record.id]);
  for (const artifactId of record.artifactIds) {
    const version =
      record.artifactVersions[artifactId] ?? repositories.artifacts.get(artifactId)?.version ?? 1;
    await executor.query(
      `insert into search_attempt_artifacts (search_attempt_id, artifact_id, artifact_version)
       values ($1, $2, $3)`,
      [record.id, artifactId, version],
    );
  }

  await executor.query("delete from search_results where search_attempt_id = $1", [record.id]);
  for (const result of record.results) {
    await executor.query(
      `insert into search_results
         (search_attempt_id, module_version_id, rank, title_snapshot,
          source_status, reason_codes, matched_concepts, missing_concepts,
          vector_score, lexical_score, concept_coverage, specificity_score,
          quality_score, hybrid_score)
       values ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8::text[],
         $9, $10, $11, $12, $13, $14)`,
      [
        record.id,
        result.moduleVersionId,
        result.rank,
        result.title,
        result.sourceStatus,
        textArrayParam(result.reasonCodes),
        textArrayParam(result.matchedConcepts),
        textArrayParam(result.missingConcepts),
        clamp(result.internalScores.vector, -1, 1),
        clamp(result.internalScores.lexical, 0, 1),
        clamp(result.internalScores.conceptCoverage, 0, 1),
        clamp(result.internalScores.specificity, 0, 1),
        clamp(result.internalScores.quality, 0, 1),
        clamp(result.internalScores.hybrid, 0, 1),
      ],
    );
  }
}

async function saveBrewJob(
  executor: SqlExecutor,
  record: BrewJobRecord,
  mode: "insert" | "update",
): Promise<void> {
  if (mode === "insert") {
    await executor.query(
      `insert into brew_jobs (job_id, project_id, search_attempt_id, result_module_version_id)
       values ($1, $2, $3, $4)`,
      [record.jobId, record.projectId, record.searchAttemptId, record.resultModuleVersionId],
    );
  } else {
    await executor.query(
      `update brew_jobs set project_id = $2, search_attempt_id = $3,
         result_module_version_id = $4 where job_id = $1`,
      [record.jobId, record.projectId, record.searchAttemptId, record.resultModuleVersionId],
    );
  }
}

async function saveCandidateSet(
  executor: SqlExecutor,
  record: CandidateSetRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.projectId,
    record.searchAttemptId,
    record.sourceModuleVersionId,
    record.generationMethod,
    record.generatorVersion,
    record.status,
    record.targetCount,
    record.actualCount,
    textArrayParam(record.shortfallReasonCodes),
    record.createdAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into candidate_sets
         (id, project_id, search_attempt_id, source_module_version_id,
          generation_method, generator_version, status, target_count,
          actual_count, shortfall_reason_codes, diversity_summary, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], '{}'::jsonb, $11)`,
      params,
    );
  } else {
    await executor.query(
      `update candidate_sets set project_id = $2, search_attempt_id = $3,
         source_module_version_id = $4, generation_method = $5,
         generator_version = $6, status = $7, target_count = $8,
         actual_count = $9, shortfall_reason_codes = $10::text[],
         created_at = $11 where id = $1`,
      params,
    );
  }
}

async function saveCandidate(
  executor: SqlExecutor,
  record: CandidateRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.candidateSetId,
    record.projectId,
    record.moduleVersionId,
    record.title,
    record.promise,
    record.cluster,
    record.format,
    record.estimatedMinutes,
    record.difficulty,
    record.artifactOutcome,
    textArrayParam(record.prerequisiteConceptIds),
    textArrayParam(record.conceptIds),
    record.sourceStatus,
    record.status,
    record.semanticFingerprint,
    jsonParam(record.internalSignals),
    record.createdAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into output_candidates
         (id, candidate_set_id, project_id, module_version_id,
          derived_from_candidate_ids, title, promise, cluster, format,
          estimated_minutes, difficulty, artifact_outcome,
          prerequisite_concept_ids, concept_ids, source_status, status,
          semantic_fingerprint, internal_signals, attribution_snapshot, created_at)
       values ($1, $2, $3, $4, '{}'::text[], $5, $6, $7, $8, $9, $10,
         $11, $12::text[], $13::text[], $14, $15, $16, $17::jsonb,
         '{}'::jsonb, $18)`,
      params,
    );
  } else {
    await executor.query(
      `update output_candidates set candidate_set_id = $2, project_id = $3,
         module_version_id = $4, title = $5, promise = $6, cluster = $7,
         format = $8, estimated_minutes = $9, difficulty = $10,
         artifact_outcome = $11, prerequisite_concept_ids = $12::text[],
         concept_ids = $13::text[], source_status = $14, status = $15,
         semantic_fingerprint = $16, internal_signals = $17::jsonb,
         created_at = $18 where id = $1`,
      params,
    );
  }
}

async function saveRankingSnapshot(
  executor: SqlExecutor,
  record: RankingSnapshotRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.userId,
    record.projectId,
    record.candidateSetId,
    record.learningMode,
    record.algorithmVersion,
    record.personalizationApplied,
    textArrayParam(record.explanationCodes),
    record.createdAt,
    record.staleAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into ranking_snapshots
         (id, user_id, project_id, candidate_set_id, learning_mode,
          algorithm_version, personalization_applied, explanation_codes,
          created_at, stale_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10)`,
      params,
    );
  } else {
    await executor.query(
      `update ranking_snapshots set user_id = $2, project_id = $3,
         candidate_set_id = $4, learning_mode = $5, algorithm_version = $6,
         personalization_applied = $7, explanation_codes = $8::text[],
         created_at = $9, stale_at = $10 where id = $1`,
      params,
    );
  }

  await executor.query("delete from ranking_snapshot_items where ranking_snapshot_id = $1", [record.id]);
  for (const [index, candidateId] of record.orderedCandidateIds.entries()) {
    await executor.query(
      `insert into ranking_snapshot_items
         (ranking_snapshot_id, candidate_id, rank, signal_breakdown, reason_codes)
       values ($1, $2, $3, $4::jsonb, $5::text[])`,
      [
        record.id,
        candidateId,
        index + 1,
        jsonParam(record.signalBreakdown[candidateId] ?? {}),
        textArrayParam(record.reasonCodesByCandidate[candidateId] ?? []),
      ],
    );
  }
}

async function insertJourney(executor: SqlExecutor, record: JourneyRecord): Promise<void> {
  // The head commit is inserted later in the same flush; the end-of-flush
  // update restores head_commit_id after its FK target exists.
  await executor.query(
    `insert into journeys
       (id, owner_user_id, project_id, source_candidate_id,
        upstream_module_version_id, parent_journey_id, title, goal, visibility,
        attribution, status, head_commit_id, current_node_id, version,
        created_at, updated_at, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'private', $9::jsonb, $10,
       null, $11, $12, $13, $14, $15)`,
    [
      record.id,
      record.ownerUserId,
      record.projectId,
      record.sourceCandidateId,
      record.upstreamModuleVersionId,
      record.parentJourneyId,
      record.title,
      record.goal,
      jsonParam(record.attribution),
      record.status,
      record.currentNodeId,
      record.version,
      record.createdAt,
      record.updatedAt,
      record.deletedAt,
    ],
  );
}

async function updateJourney(executor: SqlExecutor, record: JourneyRecord): Promise<void> {
  await executor.query(
    `update journeys set owner_user_id = $2, project_id = $3,
       source_candidate_id = $4, upstream_module_version_id = $5,
       parent_journey_id = $6, title = $7, goal = $8, visibility = 'private',
       attribution = $9::jsonb, status = $10, head_commit_id = $11,
       current_node_id = $12, version = $13, created_at = $14,
       updated_at = $15, deleted_at = $16 where id = $1`,
    [
      record.id,
      record.ownerUserId,
      record.projectId,
      record.sourceCandidateId,
      record.upstreamModuleVersionId,
      record.parentJourneyId,
      record.title,
      record.goal,
      jsonParam(record.attribution),
      record.status,
      record.headCommitId,
      record.currentNodeId,
      record.version,
      record.createdAt,
      record.updatedAt,
      record.deletedAt,
    ],
  );
}

async function insertBranchCommit(executor: SqlExecutor, record: BranchCommitRecord): Promise<void> {
  await executor.query(
    `insert into branch_commits
       (id, journey_id, parent_commit_id, sequence, type, actor_user_id,
        payload_ref, summary, created_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [
      record.id,
      record.journeyId,
      record.parentCommitId,
      record.sequence,
      record.type,
      record.actorUserId,
      jsonParam(record.payloadRef),
      record.summary,
      record.createdAt,
    ],
  );
}

async function saveAttempt(
  executor: SqlExecutor,
  repositories: GonRepositories,
  record: AttemptRecord,
  mode: "insert" | "update",
  previous?: AttemptRecord,
): Promise<void> {
  const params = [
    record.id,
    record.journeyId,
    record.ownerUserId,
    record.moduleVersionId,
    record.nodeId,
    record.attemptNumber,
    record.status,
    record.answerText,
    jsonParam(record.sourceDisclosure),
    jsonParam(record.aiAssistanceDisclosure),
    record.rubricId,
    record.rubricVersion,
    record.version,
    record.createdAt,
    record.updatedAt,
    record.submittedAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into learning_attempts
         (id, journey_id, owner_user_id, module_version_id, node_id,
          attempt_number, status, answer_text, source_disclosure,
          ai_assistance_disclosure, rubric_id, rubric_version, version,
          created_at, updated_at, submitted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
         $11, $12, $13, $14, $15, $16)`,
      params,
    );
  } else {
    await executor.query(
      `update learning_attempts set journey_id = $2, owner_user_id = $3,
         module_version_id = $4, node_id = $5, attempt_number = $6,
         status = $7, answer_text = $8, source_disclosure = $9::jsonb,
         ai_assistance_disclosure = $10::jsonb, rubric_id = $11,
         rubric_version = $12, version = $13, created_at = $14,
         updated_at = $15, submitted_at = $16 where id = $1`,
      params,
    );
  }

  await executor.query("delete from learning_attempt_artifacts where attempt_id = $1", [record.id]);
  for (const artifactId of record.artifactIds) {
    await executor.query(
      "insert into learning_attempt_artifacts (attempt_id, artifact_id) values ($1, $2)",
      [record.id, artifactId],
    );
  }

  const assessmentChanged =
    record.assessment !== null &&
    (!previous?.assessment || stableHash(previous.assessment) !== stableHash(record.assessment));
  if (record.assessment && assessmentChanged) {
    const version = repositories.moduleVersions.get(record.moduleVersionId);
    const rubric = version?.graph.rubrics.find(
      (item) => item.id === record.rubricId && item.version === record.rubricVersion,
    );
    await executor.query(
      `insert into assessment_results
         (attempt_id, decision, criteria, feedback, confidence, assessor_type,
          assessor_version, rubric_snapshot, integrity_signals, created_at)
       values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9::text[], $10)`,
      [
        record.id,
        record.assessment.decision,
        jsonParam(record.assessment.criteria),
        record.assessment.feedback,
        clamp(record.assessment.confidence, 0, 1),
        record.assessment.assessorType,
        record.assessment.assessorVersion,
        jsonParam(rubric ?? { id: record.rubricId, version: record.rubricVersion }),
        textArrayParam(record.assessment.integritySignals),
        record.updatedAt,
      ],
    );
  }
}

async function saveMastery(executor: SqlExecutor, record: MasteryRecord): Promise<void> {
  await ensureConcept(executor, record.conceptId);
  await executor.query(
    `insert into mastery_states
       (user_id, concept_id, level, evidence_attempt_id, achieved_at,
        last_evidence_at, review_due_at, version)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, concept_id) do update set
       level = excluded.level,
       evidence_attempt_id = excluded.evidence_attempt_id,
       achieved_at = excluded.achieved_at,
       last_evidence_at = excluded.last_evidence_at,
       review_due_at = excluded.review_due_at,
       version = excluded.version`,
    [
      record.userId,
      record.conceptId,
      record.level,
      record.evidenceAttemptId,
      record.achievedAt,
      record.lastEvidenceAt,
      record.reviewDueAt,
      record.version,
    ],
  );
}

async function insertXpEntry(executor: SqlExecutor, record: XpLedgerRecord): Promise<void> {
  await executor.query(
    `insert into xp_ledger_entries
       (id, user_id, sequence, delta, source_event_id, source_type, source_id,
        rule_version, formula_version, status, reverses_entry_id, reason_code,
        lifetime_xp_after, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      record.id,
      record.userId,
      record.sequence,
      record.delta,
      record.sourceEventId,
      record.sourceType,
      record.sourceId,
      record.ruleVersion,
      record.formulaVersion,
      record.status,
      record.reversesEntryId,
      record.reasonCode,
      record.lifetimeXpAfter,
      record.createdAt,
    ],
  );
}

async function refreshXpProjections(
  executor: SqlExecutor,
  repositories: GonRepositories,
  userIds: ReadonlySet<string>,
): Promise<void> {
  for (const userId of userIds) {
    const entries = [...repositories.xpLedger.values()]
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => a.sequence - b.sequence);
    const last = entries[entries.length - 1];
    await executor.query(
      `insert into xp_projections (user_id, lifetime_xp, last_entry_sequence, updated_at)
       values ($1, $2, $3, now())
       on conflict (user_id) do update set
         lifetime_xp = excluded.lifetime_xp,
         last_entry_sequence = excluded.last_entry_sequence,
         updated_at = now()`,
      [userId, last?.lifetimeXpAfter ?? 0, last?.sequence ?? 0],
    );
  }
}

async function saveProof(
  executor: SqlExecutor,
  record: ProofRecord,
  mode: "insert" | "update",
  previous?: ProofRecord,
): Promise<void> {
  const params = [
    record.id,
    record.ownerUserId,
    record.proofType,
    record.title,
    record.description,
    record.journeyId,
    record.attemptId,
    record.issuerDisplayName,
    record.externalReference,
    record.verificationLevel,
    record.status,
    textArrayParam(record.proves),
    textArrayParam(record.doesNotProve),
    record.version,
    record.createdAt,
    record.updatedAt,
    record.deletedAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into proofs
         (id, owner_user_id, proof_type, title, description, journey_id,
          attempt_id, issuer_display_name, external_reference,
          verification_level, status, visibility, proves, does_not_prove,
          version, created_at, updated_at, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'private',
         $12::text[], $13::text[], $14, $15, $16, $17)`,
      params,
    );
  } else {
    await executor.query(
      `update proofs set owner_user_id = $2, proof_type = $3, title = $4,
         description = $5, journey_id = $6, attempt_id = $7,
         issuer_display_name = $8, external_reference = $9,
         verification_level = $10, status = $11, visibility = 'private',
         proves = $12::text[], does_not_prove = $13::text[], version = $14,
         created_at = $15, updated_at = $16, deleted_at = $17 where id = $1`,
      params,
    );
  }

  await executor.query("delete from proof_artifacts where proof_id = $1", [record.id]);
  for (const artifactId of record.artifactIds) {
    await executor.query(
      "insert into proof_artifacts (proof_id, artifact_id) values ($1, $2)",
      [record.id, artifactId],
    );
  }

  if (mode === "insert" || previous?.verificationLevel !== record.verificationLevel) {
    const evidenceRefs = [
      ...record.artifactIds.map((artifactId) => ({ type: "source_artifact", id: artifactId })),
      ...(record.externalReference
        ? [{ type: "external_reference", uri: record.externalReference }]
        : []),
      ...(record.attemptId ? [{ type: "learning_attempt", id: record.attemptId }] : []),
    ];
    await executor.query(
      `insert into proof_verification_events
         (proof_id, from_level, to_level, evidence_refs, decision, created_at)
       values ($1, $2, $3, $4::jsonb, 'recorded', $5)`,
      [
        record.id,
        mode === "insert" ? null : previous?.verificationLevel ?? null,
        record.verificationLevel,
        jsonParam(evidenceRefs),
        mode === "insert" ? record.createdAt : record.updatedAt,
      ],
    );
  }
}

async function saveReport(
  executor: SqlExecutor,
  record: ReportRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.id,
    record.reporterUserId,
    record.targetType,
    record.targetId,
    record.targetVersion,
    record.reasonCode,
    record.detail,
    record.status,
    record.createdAt,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into reports
         (id, reporter_user_id, target_type, target_id, target_version,
          reason_code, detail, status, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      params,
    );
  } else {
    await executor.query(
      `update reports set reporter_user_id = $2, target_type = $3,
         target_id = $4, target_version = $5, reason_code = $6, detail = $7,
         status = $8, created_at = $9 where id = $1`,
      params,
    );
  }
}

async function saveReviewCase(
  executor: SqlExecutor,
  record: ReviewCaseRecord,
  mode: "insert" | "update",
): Promise<void> {
  if (mode === "insert") {
    await executor.query(
      `insert into moderation_cases
         (id, report_id, risk_level, status, assignee_user_id, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6)`,
      [record.id, record.reportId, record.riskLevel, record.status, record.assigneeUserId, record.createdAt],
    );
  } else {
    await executor.query(
      `update moderation_cases set report_id = $2, risk_level = $3, status = $4,
         assignee_user_id = $5, created_at = $6, updated_at = now() where id = $1`,
      [record.id, record.reportId, record.riskLevel, record.status, record.assigneeUserId, record.createdAt],
    );
  }
}

async function saveOutboxEvent(
  executor: SqlExecutor,
  record: OutboxEventRecord,
  mode: "insert" | "update",
): Promise<void> {
  const params = [
    record.eventId,
    record.eventType,
    record.eventVersion,
    record.occurredAt,
    record.aggregateType,
    record.aggregateId,
    record.actor.type,
    record.actor.id,
    record.correlationId,
    record.causationId,
    jsonParam(record.data),
    record.publishState,
    record.publishedAt,
    record.availableAt,
    record.publishAttemptCount,
    record.lastErrorCode,
  ];
  if (mode === "insert") {
    await executor.query(
      `insert into outbox_events
         (event_id, event_type, event_version, occurred_at, aggregate_type,
          aggregate_id, actor_type, actor_id, correlation_id, causation_id,
          data, publish_state, published_at, available_at,
          publish_attempt_count, last_error_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12,
         $13, $14, $15, $16)`,
      params,
    );
  } else {
    await executor.query(
      `update outbox_events set event_type = $2, event_version = $3,
         occurred_at = $4, aggregate_type = $5, aggregate_id = $6,
         actor_type = $7, actor_id = $8, correlation_id = $9,
         causation_id = $10, data = $11::jsonb, publish_state = $12,
         published_at = $13, available_at = $14,
         publish_attempt_count = $15, last_error_code = $16 where event_id = $1`,
      params,
    );
  }
}

async function insertAudit(executor: SqlExecutor, record: AuditRecord): Promise<void> {
  await executor.query(
    `insert into audit_logs
       (id, actor_type, actor_id, action, object_type, object_id, request_id,
        reason, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.id,
      record.actorType,
      record.actorId,
      record.action,
      record.objectType,
      record.objectId,
      record.requestId,
      record.reason,
      record.createdAt,
    ],
  );
}

async function insertAiRun(executor: SqlExecutor, record: AiRunRecord): Promise<void> {
  // The local record id stays process-local: PostgreSQL assigns the bigint
  // identity. ai_runs is observability metadata only — never prompt text,
  // evidence content or model chain-of-thought.
  await executor.query(
    `insert into ai_runs
       (job_id, operation, provider, model_id, agent_pipeline_version,
        prompt_template_versions, input_schema_version, output_schema_version,
        evidence_bundle_hash, input_tokens, output_tokens, cost_units,
        latency_ms, finish_reason, error_code, created_at)
     values ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16)`,
    [
      record.jobId,
      record.operation,
      record.provider,
      record.modelId,
      record.agentPipelineVersion,
      formatPostgresTextArray(record.promptTemplateVersions),
      record.inputSchemaVersion,
      record.outputSchemaVersion,
      record.evidenceBundleHash,
      record.inputTokens,
      record.outputTokens,
      record.costUnits,
      record.latencyMs,
      record.finishReason,
      record.errorCode,
      record.createdAt,
    ],
  );
}

function idempotencyScope(
  collectionKey: string,
  record: IdempotencyRecord,
): { actorUserId: string; operation: string; key: string } {
  if (record.actorUserId && record.operation) {
    return { actorUserId: record.actorUserId, operation: record.operation, key: record.key };
  }
  const first = collectionKey.indexOf(":");
  const second = first >= 0 ? collectionKey.indexOf(":", first + 1) : -1;
  if (first <= 0 || second <= first + 1) {
    throw new Error("Idempotency record is missing its actor/operation scope");
  }
  return {
    actorUserId: collectionKey.slice(0, first),
    operation: collectionKey.slice(first + 1, second),
    key: collectionKey.slice(second + 1),
  };
}

async function saveFeatureFlag(
  executor: SqlExecutor,
  record: FeatureFlagRecord,
): Promise<void> {
  await executor.query(
    `insert into feature_flags (key, enabled, scope, version, updated_at)
     values ($1, $2, $3::jsonb, $4, $5::timestamptz)
     on conflict (key) do update set
       enabled = excluded.enabled,
       scope = excluded.scope,
       version = excluded.version,
       updated_at = excluded.updated_at`,
    [
      record.key,
      record.enabled,
      jsonParam(record.scope),
      record.version,
      record.updatedAt,
    ],
  );
}

async function saveDataRequest(
  executor: SqlExecutor,
  record: DataRequestRecord,
): Promise<void> {
  await executor.query(
    `insert into data_requests
       (id, user_id, request_type, scope, status, receipt, requested_at, completed_at)
     values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::timestamptz, $8::timestamptz)
     on conflict (id) do update set
       scope = excluded.scope,
       status = excluded.status,
       receipt = excluded.receipt,
       completed_at = excluded.completed_at`,
    [
      record.id,
      record.userId,
      record.requestType,
      jsonParam(record.scope),
      record.status,
      record.receipt ? jsonParam(record.receipt) : null,
      record.requestedAt,
      record.completedAt,
    ],
  );
}

async function savePersonalization(
  executor: SqlExecutor,
  record: PersonalizationRecord,
): Promise<void> {
  await executor.query(
    `insert into user_personalization (user_id, preferences, version, updated_at)
     values ($1, $2::jsonb, $3, $4::timestamptz)
     on conflict (user_id) do update set
       preferences = excluded.preferences,
       version = excluded.version,
       updated_at = excluded.updated_at`,
    [record.userId, jsonParam(record.preferences), record.version, record.updatedAt],
  );
}

async function insertFootprintEvent(
  executor: SqlExecutor,
  record: FootprintEventRecord,
): Promise<void> {
  // Local id is a correlation key only; PostgreSQL uses bigint identity.
  await executor.query(
    `insert into footprint_events
       (user_id, category, entity_type, entity_id, attributes,
        consent_purpose, consent_status_at_event, occurred_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::timestamptz)`,
    [
      record.userId,
      record.category,
      record.entityType,
      record.entityId,
      jsonParam(record.attributes),
      record.consentPurpose,
      record.consentStatusAtEvent,
      record.occurredAt,
    ],
  );
}

async function saveIdempotency(
  executor: SqlExecutor,
  collectionKey: string,
  record: IdempotencyRecord,
): Promise<void> {
  const scope = idempotencyScope(collectionKey, record);
  const expiresAt = new Date(Date.parse(record.createdAt) + 24 * 60 * 60 * 1000).toISOString();
  await executor.query(
    `insert into idempotency_records
       (actor_user_id, operation, idempotency_key, request_fingerprint,
        resource_type, resource_id, http_status, created_at, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (actor_user_id, operation, idempotency_key) do update set
       request_fingerprint = excluded.request_fingerprint,
       resource_type = excluded.resource_type,
       resource_id = excluded.resource_id,
       http_status = excluded.http_status,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`,
    [
      scope.actorUserId,
      scope.operation,
      scope.key,
      record.requestFingerprint,
      record.resourceType,
      record.resourceId,
      record.status,
      record.createdAt,
      expiresAt,
    ],
  );
}

async function flushRepositories(
  executor: SqlExecutor,
  repositories: GonRepositories,
  snapshot: RepositorySnapshot,
): Promise<void> {
  function mapDiff<K extends (typeof DURABLE_COLLECTIONS)[number]>(
    name: K,
  ): CollectionDiff<Parameters<GonRepositories[K]["set"]>[1]> {
    return diffEntries(
      repositories[name].entries() as Iterable<readonly [string, never]>,
      snapshot.get(name) ?? new Map(),
    ) as CollectionDiff<Parameters<GonRepositories[K]["set"]>[1]>;
  }

  const diffs = {
    users: mapDiff("users"),
    identityLinks: mapDiff("identityLinks"),
    profiles: mapDiff("profiles"),
    invitesByHash: mapDiff("invitesByHash"),
    attestations: mapDiff("attestations"),
    consents: mapDiff("consents"),
    projects: mapDiff("projects"),
    artifacts: mapDiff("artifacts"),
    chunks: mapDiff("chunks"),
    uploadSessions: mapDiff("uploadSessions"),
    searchAttempts: mapDiff("searchAttempts"),
    jobs: mapDiff("jobs"),
    brewJobs: mapDiff("brewJobs"),
    modules: mapDiff("modules"),
    moduleVersions: mapDiff("moduleVersions"),
    candidateSets: mapDiff("candidateSets"),
    candidates: mapDiff("candidates"),
    rankingSnapshots: mapDiff("rankingSnapshots"),
    journeys: mapDiff("journeys"),
    branchCommits: mapDiff("branchCommits"),
    attempts: mapDiff("attempts"),
    mastery: mapDiff("mastery"),
    xpLedger: mapDiff("xpLedger"),
    proofs: mapDiff("proofs"),
    reports: mapDiff("reports"),
    reviewCases: mapDiff("reviewCases"),
    idempotencyRecords: mapDiff("idempotencyRecords"),
    featureFlags: mapDiff("featureFlags"),
    dataRequests: mapDiff("dataRequests"),
    personalizations: mapDiff("personalizations"),
    footprintEvents: mapDiff("footprintEvents"),
    outboxEvents: diffEntries(
      [...repositories.outboxEvents.values()].map((event) => [event.eventId, event] as const),
      snapshot.get("outboxEvents") ?? new Map(),
    ),
    auditLogs: diffEntries(
      [...repositories.auditLogs.values()].map((entry) => [entry.id, entry] as const),
      snapshot.get("auditLogs") ?? new Map(),
    ),
    aiRuns: diffEntries(
      [...repositories.aiRuns.values()].map((run) => [run.id, run] as const),
      snapshot.get("aiRuns") ?? new Map(),
    ),
  };

  assertAppendOnly("age_attestations", diffs.attestations as CollectionDiff<unknown>);
  assertAppendOnly("branch_commits", diffs.branchCommits as CollectionDiff<unknown>);
  assertAppendOnly("xp_ledger_entries", diffs.xpLedger as CollectionDiff<unknown>);
  assertAppendOnly("audit_logs", diffs.auditLogs as CollectionDiff<unknown>);
  assertAppendOnly("ai_runs", diffs.aiRuns as CollectionDiff<unknown>);

  for (const [name, diff] of Object.entries(diffs)) {
    if (
      name !== "chunks" &&
      name !== "footprintEvents" &&
      name !== "personalizations" &&
      diff.deleted.length > 0
    ) {
      throw new Error(`Deleting ${name} through the domain Unit of Work is not supported`);
    }
  }
  // Footprint events are immutable; privacy erasure may delete them outright.
  if (diffs.footprintEvents.updated.length > 0) {
    throw new Error("footprint_events is immutable; refusing to update events");
  }

  // Privacy erasure: derived personalization preferences are removed outright.
  for (const { previous } of diffs.personalizations.deleted) {
    await executor.query("delete from user_personalization where user_id = $1", [previous.userId]);
  }

  // Tombstone replaced chunks first so a reprocessed artifact can reuse the
  // same active (source, ordinal) slot in this transaction.
  for (const { previous } of diffs.chunks.deleted) {
    await executor.query(
      "update content_chunks set deleted_at = now() where id = $1 and deleted_at is null",
      [previous.id],
    );
  }

  // Privacy erasure: hard-delete persisted footprint events. Rows created and
  // deleted inside this transaction were never flushed (their local keys are
  // not numeric), so only persisted bigint ids reach the database.
  for (const { previous } of diffs.footprintEvents.deleted) {
    if (!/^\d+$/.test(previous.id)) continue;
    await executor.query("delete from footprint_events where id = $1", [previous.id]);
  }

  // Inserts in foreign-key dependency order. Projects and journeys receive a
  // second pointer update after Search/Brew/candidate/commit inserts below.
  for (const { record } of diffs.users.inserted) await saveUser(executor, record, "insert");
  for (const { record } of diffs.identityLinks.inserted) await saveIdentityLink(executor, record, "insert");
  for (const { record } of diffs.profiles.inserted) await saveProfile(executor, record);
  for (const { record } of diffs.invitesByHash.inserted) await saveInvite(executor, record, "insert");
  for (const { record } of diffs.attestations.inserted) await insertAttestation(executor, record);
  for (const { record } of diffs.consents.inserted) await saveConsent(executor, record);
  for (const { record } of diffs.projects.inserted) await insertProject(executor, record);
  for (const { record } of diffs.artifacts.inserted) await saveArtifact(executor, record, "insert");
  for (const { record } of diffs.uploadSessions.inserted) await saveUploadSession(executor, record, "insert");
  for (const { record } of diffs.jobs.inserted) await saveJob(executor, record, "insert");
  for (const { record } of diffs.modules.inserted) await saveModule(executor, record, "insert");

  const insertedVersions = [...diffs.moduleVersions.inserted].sort(
    (a, b) =>
      a.record.createdAt.localeCompare(b.record.createdAt) ||
      a.record.versionNumber - b.record.versionNumber,
  );
  for (const { record } of insertedVersions) {
    await saveModuleVersion(executor, repositories, record, "insert");
  }

  for (const { record } of diffs.chunks.inserted) await saveChunk(executor, record, "insert");
  for (const { record } of diffs.searchAttempts.inserted) {
    await saveSearchAttempt(executor, repositories, record, "insert");
  }
  for (const { record } of diffs.brewJobs.inserted) await saveBrewJob(executor, record, "insert");
  for (const { record } of diffs.candidateSets.inserted) await saveCandidateSet(executor, record, "insert");
  for (const { record } of diffs.candidates.inserted) await saveCandidate(executor, record, "insert");
  for (const { record } of diffs.rankingSnapshots.inserted) {
    await saveRankingSnapshot(executor, record, "insert");
  }
  for (const { record } of diffs.journeys.inserted) await insertJourney(executor, record);

  const insertedCommits = [...diffs.branchCommits.inserted].sort(
    (a, b) =>
      a.record.journeyId.localeCompare(b.record.journeyId) ||
      a.record.sequence - b.record.sequence,
  );
  for (const { record } of insertedCommits) await insertBranchCommit(executor, record);

  // Apply existing-attempt transitions before inserting a replacement draft:
  // the partial unique index permits only one draft per journey/node.
  const processedAttemptUpdates = new Set<string>();
  for (const { key, record, previous } of diffs.attempts.updated) {
    await saveAttempt(executor, repositories, record, "update", previous);
    processedAttemptUpdates.add(key);
  }
  for (const { record } of diffs.attempts.inserted) {
    await saveAttempt(executor, repositories, record, "insert");
  }

  for (const { record } of diffs.mastery.inserted) await saveMastery(executor, record);

  const insertedXp = [...diffs.xpLedger.inserted].sort(
    (a, b) => a.record.userId.localeCompare(b.record.userId) || a.record.sequence - b.record.sequence,
  );
  for (const { record } of insertedXp) await insertXpEntry(executor, record);
  await refreshXpProjections(
    executor,
    repositories,
    new Set(insertedXp.map(({ record }) => record.userId)),
  );

  for (const { record } of diffs.proofs.inserted) await saveProof(executor, record, "insert");
  for (const { record } of diffs.reports.inserted) await saveReport(executor, record, "insert");
  for (const { record } of diffs.reviewCases.inserted) await saveReviewCase(executor, record, "insert");
  for (const { record } of diffs.outboxEvents.inserted) await saveOutboxEvent(executor, record, "insert");
  for (const { record } of diffs.auditLogs.inserted) await insertAudit(executor, record);
  // ai_runs references async_jobs; jobs are inserted earlier in this flush.
  for (const { record } of diffs.aiRuns.inserted) await insertAiRun(executor, record);
  for (const { record } of diffs.footprintEvents.inserted) {
    await insertFootprintEvent(executor, record);
  }
  for (const { record } of diffs.personalizations.inserted) {
    await savePersonalization(executor, record);
  }
  for (const { record } of diffs.dataRequests.inserted) {
    await saveDataRequest(executor, record);
  }
  for (const { key, record } of diffs.idempotencyRecords.inserted) {
    await saveIdempotency(executor, key, record);
  }

  // Updates. All inserts have completed, so ordinary foreign keys are in
  // place. Journey heads and project current-* pointers are intentionally last.
  for (const { record } of diffs.users.updated) await saveUser(executor, record, "update");
  for (const { record } of diffs.identityLinks.updated) await saveIdentityLink(executor, record, "update");
  for (const { record } of diffs.profiles.updated) await saveProfile(executor, record);
  for (const { record } of diffs.invitesByHash.updated) await saveInvite(executor, record, "update");
  for (const { record } of diffs.consents.updated) await saveConsent(executor, record);
  for (const { record } of diffs.artifacts.updated) await saveArtifact(executor, record, "update");
  for (const { record } of diffs.uploadSessions.updated) await saveUploadSession(executor, record, "update");
  for (const { record } of diffs.jobs.updated) await saveJob(executor, record, "update");
  for (const { record } of diffs.modules.updated) await saveModule(executor, record, "update");
  for (const { record, previous } of diffs.moduleVersions.updated) {
    await saveModuleVersion(executor, repositories, record, "update", previous);
  }
  for (const { record } of diffs.chunks.updated) await saveChunk(executor, record, "update");
  for (const { record } of diffs.searchAttempts.updated) {
    await saveSearchAttempt(executor, repositories, record, "update");
  }
  for (const { record } of diffs.brewJobs.updated) await saveBrewJob(executor, record, "update");
  for (const { record } of diffs.candidateSets.updated) await saveCandidateSet(executor, record, "update");
  for (const { record } of diffs.candidates.updated) await saveCandidate(executor, record, "update");
  for (const { record } of diffs.rankingSnapshots.updated) {
    await saveRankingSnapshot(executor, record, "update");
  }
  for (const { key, record, previous } of diffs.attempts.updated) {
    if (!processedAttemptUpdates.has(key)) {
      await saveAttempt(executor, repositories, record, "update", previous);
    }
  }
  for (const { record } of diffs.mastery.updated) await saveMastery(executor, record);
  for (const { record, previous } of diffs.proofs.updated) {
    await saveProof(executor, record, "update", previous);
  }
  for (const { record } of diffs.reports.updated) await saveReport(executor, record, "update");
  for (const { record } of diffs.reviewCases.updated) await saveReviewCase(executor, record, "update");
  for (const { record } of diffs.outboxEvents.updated) await saveOutboxEvent(executor, record, "update");
  for (const { key, record } of diffs.idempotencyRecords.updated) {
    await saveIdempotency(executor, key, record);
  }
  // Feature flags are tiny upserts; inserts and updates share one save path.
  for (const { record } of diffs.featureFlags.inserted) {
    await saveFeatureFlag(executor, record);
  }
  for (const { record } of diffs.featureFlags.updated) {
    await saveFeatureFlag(executor, record);
  }
  for (const { record } of diffs.dataRequests.updated) {
    await saveDataRequest(executor, record);
  }
  for (const { record } of diffs.personalizations.updated) {
    await savePersonalization(executor, record);
  }

  for (const { record } of diffs.journeys.updated) await updateJourney(executor, record);
  for (const { record } of diffs.journeys.inserted) {
    if (record.headCommitId) await updateJourney(executor, record);
  }

  for (const { record } of diffs.projects.updated) await updateProject(executor, record);
  for (const { record } of diffs.projects.inserted) {
    if (record.currentSearchAttemptId || record.currentBrewJobId || record.currentCandidateSetId) {
      await updateProject(executor, record);
    }
  }
}
