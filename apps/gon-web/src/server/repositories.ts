import { sha256Hex } from "./hash";
import { createId } from "./ids";
import {
  activeQuotaUnits,
  isQuotaWindowActive,
  type JobFingerprintInput,
  type QuotaRefundInput,
  type QuotaReserveInput,
  type QuotaReserveResult,
  type QuotaSettleInput,
  type QuotaWindowInput,
  type TargetedPage,
  type TargetedPageQuery,
  type TargetedPaginationPort,
  type TargetedQueriesPort,
} from "./targeted-queries";
import type {
  AccountStatus,
  AiRunRecord,
  ArtifactRecord,
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
  ModuleRecord,
  ModuleVersionRecord,
  OutboxEventRecord,
  PersonalizationRecord,
  ProfileRecord,
  ProjectRecord,
  ProofRecord,
  QuotaReservationRecord,
  ArenaMatchRecord,
  ArenaVoteRecord,
  GameEventRecord,
  GameSessionRecord,
  RankingSnapshotRecord,
  ReportRecord,
  ReviewCaseRecord,
  SearchAttemptRecord,
  StoredObjectRecord,
  UploadSessionRecord,
  UserRecord,
  XpLedgerRecord,
} from "./types";
import type {
  PostgresHybridSearchInput,
  PostgresHybridSearchOutput,
} from "./postgres-search";

/**
 * Repository boundary used by the domain core.
 *
 * A Unit of Work supplies one identity map per transaction. Domain code can
 * therefore read and mutate aggregate records synchronously while the store
 * adapter owns all persistence details: the memory adapter clones and swaps
 * its identity map, while the PostgreSQL adapter loads normalized rows and
 * flushes only changed aggregates inside the database transaction.
 *
 * This is deliberately an aggregate/identity-map boundary rather than a
 * claim that every future read is already an optimized targeted SQL query.
 * Aggregate mappers can be optimized behind this interface without changing
 * domain use cases.
 */
export interface RepositoryCollection<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  has(key: K): boolean;
  clear(): void;
  values(): Iterable<V>;
  entries(): Iterable<readonly [K, V]>;
  readonly size: number;
}

export class MapRepositoryCollection<K, V> implements RepositoryCollection<K, V> {
  constructor(readonly map = new Map<K, V>()) {}

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  values(): Iterable<V> {
    return this.map.values();
  }

  entries(): Iterable<readonly [K, V]> {
    return this.map.entries();
  }

  get size(): number {
    return this.map.size;
  }
}

export interface AppendOnlyCollection<V> {
  append(value: V): void;
  values(): Iterable<V>;
  entries(): Iterable<readonly [number, V]>;
  clear(): void;
  readonly size: number;
}

export class ArrayAppendOnlyCollection<V> implements AppendOnlyCollection<V> {
  constructor(readonly items: V[] = []) {}

  append(value: V): void {
    this.items.push(value);
  }

  values(): Iterable<V> {
    return this.items.values();
  }

  entries(): Iterable<readonly [number, V]> {
    return this.items.entries();
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }
}

export interface HybridSearchPort {
  search(input: PostgresHybridSearchInput): Promise<PostgresHybridSearchOutput>;
}

export interface GonRepositories {
  readonly users: RepositoryCollection<string, UserRecord>;
  readonly identityLinks: RepositoryCollection<string, IdentityLinkRecord>;
  readonly profiles: RepositoryCollection<string, ProfileRecord>;
  readonly invitesByHash: RepositoryCollection<string, InviteRecord>;
  readonly attestations: RepositoryCollection<string, AttestationRecord>;
  readonly consents: RepositoryCollection<string, ConsentRecord>;
  /** Dev-only sessions. The PostgreSQL adapter keeps these process-local. */
  readonly devSessions: RepositoryCollection<string, DevSessionRecord>;

  readonly projects: RepositoryCollection<string, ProjectRecord>;
  readonly artifacts: RepositoryCollection<string, ArtifactRecord>;
  readonly chunks: RepositoryCollection<string, ChunkRecord>;
  readonly uploadSessions: RepositoryCollection<string, UploadSessionRecord>;
  /**
   * Raw bytes for the local signed-upload simulator only. They are never
   * stored in PostgreSQL; production object storage replaces this port in a
   * later P05 remediation increment.
   */
  readonly objects: RepositoryCollection<string, StoredObjectRecord>;

  readonly searchAttempts: RepositoryCollection<string, SearchAttemptRecord>;
  readonly jobs: RepositoryCollection<string, JobRecord>;
  readonly brewJobs: RepositoryCollection<string, BrewJobRecord>;
  readonly modules: RepositoryCollection<string, ModuleRecord>;
  readonly moduleVersions: RepositoryCollection<string, ModuleVersionRecord>;

  readonly candidateSets: RepositoryCollection<string, CandidateSetRecord>;
  readonly candidates: RepositoryCollection<string, CandidateRecord>;
  readonly rankingSnapshots: RepositoryCollection<string, RankingSnapshotRecord>;

  /** Apply-2 (P03 /arena-matches): trận đấu Arena giữa 2 output candidate. */
  readonly arenaMatches: RepositoryCollection<string, ArenaMatchRecord>;
  /** Apply-2 (P03 /arena-matches): vote Arena — một vote mỗi (match, user). */
  readonly arenaVotes: RepositoryCollection<string, ArenaVoteRecord>;
  /** Apply-3 (P03 game-sessions): phiên học tương tác gắn journey node. */
  readonly gameSessions: RepositoryCollection<string, GameSessionRecord>;
  /** Apply-3 (P03 game-sessions): event batch idempotent theo clientEventId. */
  readonly gameEvents: RepositoryCollection<string, GameEventRecord>;

  readonly journeys: RepositoryCollection<string, JourneyRecord>;
  readonly branchCommits: RepositoryCollection<string, BranchCommitRecord>;
  readonly attempts: RepositoryCollection<string, AttemptRecord>;
  readonly mastery: RepositoryCollection<string, MasteryRecord>;
  readonly xpLedger: RepositoryCollection<string, XpLedgerRecord>;
  readonly proofs: RepositoryCollection<string, ProofRecord>;
  readonly reports: RepositoryCollection<string, ReportRecord>;
  readonly reviewCases: RepositoryCollection<string, ReviewCaseRecord>;

  readonly outboxEvents: AppendOnlyCollection<OutboxEventRecord>;
  readonly auditLogs: AppendOnlyCollection<AuditRecord>;
  readonly aiRuns: AppendOnlyCollection<AiRunRecord>;
  readonly idempotencyRecords: RepositoryCollection<string, IdempotencyRecord>;

  /**
   * Persistent feature flags / kill switches (P05-R1.6). A missing flag is
   * treated as enabled at this layer; callers decide defaults.
   */
  readonly featureFlags: RepositoryCollection<string, FeatureFlagRecord>;

  /**
   * Privacy data requests (P05-R1.7): export / delete_footprint /
   * delete_account lifecycle rows.
   */
  readonly dataRequests: RepositoryCollection<string, DataRequestRecord>;

  /** Per-user personalization preferences (P05-R1.7). */
  readonly personalizations: RepositoryCollection<string, PersonalizationRecord>;

  /**
   * Detailed footprint events (P05-R1.7). Keyed by the persistence id
   * (PostgreSQL bigint identity as string, local correlation id in memory).
   * Deletes are permitted for privacy erasure and are flushed as hard deletes.
   */
  readonly footprintEvents: RepositoryCollection<string, FootprintEventRecord>;

  /**
   * Targeted guardrail queries (P05-R1.6): persistent quota reservations,
   * budget settle/refund and job fingerprint lookups run through this port
   * instead of scanning identity-map collections. Bound to targeted SQL by
   * the PostgreSQL Unit of Work and to a transactional map by the memory
   * adapter.
   */
  readonly targetedQueries: TargetedQueriesPort;

  /** Present only when the active Unit of Work can execute SQL Search. */
  hybridSearch?: HybridSearchPort;

  seedInvite(
    code: string,
    expiresAt?: string,
  ): InviteRecord;
  nextXpSequence(userId: string): number;
}

export interface GonStore {
  readonly kind: "memory" | "postgres";
  runInTransaction<T>(
    work: (repositories: GonRepositories) => Promise<T>,
  ): Promise<T>;
  ensureSeedInvite(code: string, expiresAt?: string): Promise<InviteRecord>;
}

interface InMemoryRepositoryOptions {
  devSessions?: Map<string, DevSessionRecord>;
  objects?: Map<string, StoredObjectRecord>;
  hybridSearch?: HybridSearchPort;
  /** External binding (e.g. targeted SQL); defaults to the in-memory port. */
  targetedQueries?: TargetedQueriesPort;
}

const MAP_COLLECTION_NAMES = [
  "users",
  "identityLinks",
  "profiles",
  "invitesByHash",
  "attestations",
  "consents",
  "devSessions",
  "projects",
  "artifacts",
  "chunks",
  "uploadSessions",
  "objects",
  "searchAttempts",
  "jobs",
  "brewJobs",
  "modules",
  "moduleVersions",
  "candidateSets",
  "candidates",
  "rankingSnapshots",
  "arenaMatches",
  "arenaVotes",
  "gameSessions",
  "gameEvents",
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
  "quotaReservations",
  "dataRequests",
  "personalizations",
  "footprintEvents",
] as const;

type MapCollectionName = (typeof MAP_COLLECTION_NAMES)[number];

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryGonRepositories implements GonRepositories {
  readonly users = new MapRepositoryCollection<string, UserRecord>();
  readonly identityLinks = new MapRepositoryCollection<string, IdentityLinkRecord>();
  readonly profiles = new MapRepositoryCollection<string, ProfileRecord>();
  readonly invitesByHash = new MapRepositoryCollection<string, InviteRecord>();
  readonly attestations = new MapRepositoryCollection<string, AttestationRecord>();
  readonly consents = new MapRepositoryCollection<string, ConsentRecord>();
  readonly devSessions: MapRepositoryCollection<string, DevSessionRecord>;

  readonly projects = new MapRepositoryCollection<string, ProjectRecord>();
  readonly artifacts = new MapRepositoryCollection<string, ArtifactRecord>();
  readonly chunks = new MapRepositoryCollection<string, ChunkRecord>();
  readonly uploadSessions = new MapRepositoryCollection<string, UploadSessionRecord>();
  readonly objects: MapRepositoryCollection<string, StoredObjectRecord>;

  readonly searchAttempts = new MapRepositoryCollection<string, SearchAttemptRecord>();
  readonly jobs = new MapRepositoryCollection<string, JobRecord>();
  readonly brewJobs = new MapRepositoryCollection<string, BrewJobRecord>();
  readonly modules = new MapRepositoryCollection<string, ModuleRecord>();
  readonly moduleVersions = new MapRepositoryCollection<string, ModuleVersionRecord>();

  readonly candidateSets = new MapRepositoryCollection<string, CandidateSetRecord>();
  readonly candidates = new MapRepositoryCollection<string, CandidateRecord>();
  readonly rankingSnapshots = new MapRepositoryCollection<string, RankingSnapshotRecord>();
  readonly arenaMatches = new MapRepositoryCollection<string, ArenaMatchRecord>();
  readonly arenaVotes = new MapRepositoryCollection<string, ArenaVoteRecord>();
  readonly gameSessions = new MapRepositoryCollection<string, GameSessionRecord>();
  readonly gameEvents = new MapRepositoryCollection<string, GameEventRecord>();

  readonly journeys = new MapRepositoryCollection<string, JourneyRecord>();
  readonly branchCommits = new MapRepositoryCollection<string, BranchCommitRecord>();
  readonly attempts = new MapRepositoryCollection<string, AttemptRecord>();
  readonly mastery = new MapRepositoryCollection<string, MasteryRecord>();
  readonly xpLedger = new MapRepositoryCollection<string, XpLedgerRecord>();
  readonly proofs = new MapRepositoryCollection<string, ProofRecord>();
  readonly reports = new MapRepositoryCollection<string, ReportRecord>();
  readonly reviewCases = new MapRepositoryCollection<string, ReviewCaseRecord>();

  readonly outboxEvents = new ArrayAppendOnlyCollection<OutboxEventRecord>();
  readonly auditLogs = new ArrayAppendOnlyCollection<AuditRecord>();
  readonly aiRuns = new ArrayAppendOnlyCollection<AiRunRecord>();
  readonly idempotencyRecords = new MapRepositoryCollection<string, IdempotencyRecord>();
  readonly featureFlags = new MapRepositoryCollection<string, FeatureFlagRecord>();
  readonly dataRequests = new MapRepositoryCollection<string, DataRequestRecord>();
  readonly personalizations = new MapRepositoryCollection<string, PersonalizationRecord>();
  readonly footprintEvents = new MapRepositoryCollection<string, FootprintEventRecord>();
  /**
   * Memory-adapter backing store for the targeted quota port. The PostgreSQL
   * Unit of Work binds `targetedQueries` to targeted SQL instead and leaves
   * this map empty (quota rows bypass the identity-map diff/flush on purpose).
   */
  readonly quotaReservations = new MapRepositoryCollection<string, QuotaReservationRecord>();

  readonly targetedQueries: TargetedQueriesPort;
  hybridSearch?: HybridSearchPort;

  private readonly externalTargetedQueries?: TargetedQueriesPort;
  private xpSequenceByUser = new Map<string, number>();

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.devSessions = new MapRepositoryCollection(options.devSessions ?? new Map());
    this.objects = new MapRepositoryCollection(options.objects ?? new Map());
    this.hybridSearch = options.hybridSearch;
    this.externalTargetedQueries = options.targetedQueries;
    this.targetedQueries = options.targetedQueries ?? new InMemoryTargetedQueries(this);
  }

  seedInvite(
    code: string,
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  ): InviteRecord {
    const codeHash = sha256Hex(code.trim());
    const existing = this.invitesByHash.get(codeHash);
    if (existing) return existing;
    const invite: InviteRecord = {
      id: createId("inv"),
      codeHash,
      status: "active",
      expiresAt,
      redeemedByUserId: null,
      redeemedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.invitesByHash.set(codeHash, invite);
    return invite;
  }

  nextXpSequence(userId: string): number {
    const next = (this.xpSequenceByUser.get(userId) ?? 0) + 1;
    this.xpSequenceByUser.set(userId, next);
    return next;
  }

  restoreXpSequence(userId: string, sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0) return;
    this.xpSequenceByUser.set(
      userId,
      Math.max(this.xpSequenceByUser.get(userId) ?? 0, sequence),
    );
  }

  cloneIdentityMap(options: { shareEphemeral?: boolean } = {}): InMemoryGonRepositories {
    const clone = new InMemoryGonRepositories({
      devSessions: options.shareEphemeral ? this.devSessions.map : new Map(),
      objects: options.shareEphemeral ? this.objects.map : new Map(),
      hybridSearch: this.hybridSearch,
      // Keep an external (SQL) binding; a self-bound memory port must rebind
      // to the clone so quota writes stay transactional like every other map.
      targetedQueries: this.externalTargetedQueries,
    });

    for (const name of MAP_COLLECTION_NAMES) {
      if (options.shareEphemeral && (name === "devSessions" || name === "objects")) continue;
      const source = this[name] as MapRepositoryCollection<string, unknown>;
      const target = clone[name] as MapRepositoryCollection<string, unknown>;
      for (const [key, value] of source.entries()) {
        // Stored-object bytes are treated as immutable blobs. A shallow
        // record copy preserves Buffer identity/type while map membership
        // remains transactional in the memory adapter.
        target.set(key, name === "objects" ? { ...(value as StoredObjectRecord) } : cloneRecord(value));
      }
    }

    for (const event of this.outboxEvents.values()) clone.outboxEvents.append(cloneRecord(event));
    for (const entry of this.auditLogs.values()) clone.auditLogs.append(cloneRecord(entry));
    for (const run of this.aiRuns.values()) clone.aiRuns.append(cloneRecord(run));
    clone.xpSequenceByUser = new Map(this.xpSequenceByUser);
    return clone;
  }

  replaceIdentityMapFrom(source: InMemoryGonRepositories): void {
    for (const name of MAP_COLLECTION_NAMES) {
      const target = this[name] as MapRepositoryCollection<string, unknown>;
      const incoming = source[name] as MapRepositoryCollection<string, unknown>;
      target.clear();
      for (const [key, value] of incoming.entries()) target.set(key, value);
    }

    this.outboxEvents.clear();
    for (const event of source.outboxEvents.values()) this.outboxEvents.append(event);
    this.auditLogs.clear();
    for (const entry of source.auditLogs.values()) this.auditLogs.append(entry);
    this.aiRuns.clear();
    for (const run of source.aiRuns.values()) this.aiRuns.append(run);
    this.xpSequenceByUser = new Map(source.xpSequenceByUser);
    this.hybridSearch = source.hybridSearch;
  }
}

/**
 * Memory binding of the targeted guardrail queries. Reservation rows live in
 * the cloned identity map so failed Units of Work roll back quota writes too.
 */
export class InMemoryTargetedQueries implements TargetedQueriesPort {
  constructor(private readonly owner: InMemoryGonRepositories) {}

  private matchesWindow(record: QuotaReservationRecord, input: QuotaWindowInput): boolean {
    return (
      record.userId === input.userId &&
      record.quotaKey === input.quotaKey &&
      record.windowStart === input.windowStart &&
      record.windowEnd === input.windowEnd &&
      isQuotaWindowActive(record)
    );
  }

  async sumActiveQuotaUnits(input: QuotaWindowInput): Promise<number> {
    let used = 0;
    for (const record of this.owner.quotaReservations.values()) {
      if (this.matchesWindow(record, input)) used += activeQuotaUnits(record);
    }
    return used;
  }

  async reserveQuotaUnits(input: QuotaReserveInput): Promise<QuotaReserveResult> {
    const windowInput: QuotaWindowInput = {
      userId: input.userId,
      quotaKey: input.quotaKey,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    };
    const usedBefore = await this.sumActiveQuotaUnits(windowInput);
    if (usedBefore + input.units > input.limit) {
      return {
        reserved: false,
        usedUnitsBefore: usedBefore,
        usedUnitsAfter: usedBefore,
        limit: input.limit,
        reservationId: null,
      };
    }
    const record: QuotaReservationRecord = {
      id: createId("qrsv"),
      userId: input.userId,
      quotaKey: input.quotaKey,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      reservedUnits: input.units,
      consumedUnits: input.mode === "consume" ? input.units : 0,
      refundedUnits: 0,
      status: input.mode === "consume" ? "consumed" : "reserved",
      jobId: input.jobId ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.owner.quotaReservations.set(record.id, record);
    return {
      reserved: true,
      usedUnitsBefore: usedBefore,
      usedUnitsAfter: usedBefore + input.units,
      limit: input.limit,
      reservationId: record.id,
    };
  }

  async settleQuotaReservation(input: QuotaSettleInput): Promise<QuotaReservationRecord | null> {
    const record = this.owner.quotaReservations.get(input.reservationId);
    if (!record) return null;
    const consumed = Math.max(0, Math.min(input.consumedUnits, record.reservedUnits));
    const refunded = record.reservedUnits - consumed;
    const settled: QuotaReservationRecord = {
      ...record,
      consumedUnits: consumed,
      refundedUnits: refunded,
      status: consumed === 0 ? "refunded" : consumed === record.reservedUnits ? "consumed" : "partially_refunded",
      updatedAt: input.at,
    };
    this.owner.quotaReservations.set(settled.id, settled);
    return settled;
  }

  async refundQuotaReservation(input: QuotaRefundInput): Promise<QuotaReservationRecord | null> {
    const record = this.owner.quotaReservations.get(input.reservationId);
    if (!record) return null;
    const open = record.reservedUnits - record.consumedUnits - record.refundedUnits;
    const refunded = Math.max(0, Math.min(input.refundedUnits, open));
    const refundedTotal = record.refundedUnits + refunded;
    const settled: QuotaReservationRecord = {
      ...record,
      refundedUnits: refundedTotal,
      status:
        record.consumedUnits > 0 && refundedTotal < record.reservedUnits
          ? "partially_refunded"
          : "refunded",
      updatedAt: input.at,
    };
    this.owner.quotaReservations.set(settled.id, settled);
    return settled;
  }

  async findReservationsByJobId(jobId: string): Promise<QuotaReservationRecord[]> {
    return [...this.owner.quotaReservations.values()].filter((record) => record.jobId === jobId);
  }

  async findJobByInputFingerprint(input: JobFingerprintInput): Promise<JobRecord | null> {
    const matches = [...this.owner.jobs.values()].filter(
      (job) =>
        job.ownerUserId === input.userId &&
        job.jobType === input.jobType &&
        job.inputFingerprint === input.fingerprint &&
        input.statuses.includes(job.status),
    );
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return matches[0] ?? null;
  }
}

/**
 * Memory binding of the targeted pagination port (P05-R1.13).
 *
 * Reads the committed collections directly (no Unit of Work, no identity-map
 * clone) and applies EXACTLY the filter/sort semantics of the corresponding
 * in-UoW core list methods, so both paths return identical pages:
 * - journeys: owner + not deleted + status != "deleted", updated_at DESC, id DESC;
 * - journey commits: one journey, sequence ASC;
 * - XP ledger: one user, sequence DESC;
 * - proofs: owner + not deleted + status != "deleted" (+ optional
 *   verification_level equality), created_at DESC, id DESC.
 */
export class MemoryTargetedPagination implements TargetedPaginationPort {
  constructor(
    private readonly view: {
      users: Map<string, UserRecord>;
      journeys: Map<string, JourneyRecord>;
      branchCommits: Map<string, BranchCommitRecord>;
      xpLedger: Map<string, XpLedgerRecord>;
      proofs: Map<string, ProofRecord>;
    },
  ) {}

  async findAccountStatus(userId: string): Promise<AccountStatus | null> {
    return this.view.users.get(userId)?.status ?? null;
  }

  async listJourneySummaries(
    userId: string,
    query: TargetedPageQuery,
  ): Promise<TargetedPage<JourneyRecord>> {
    const rows = [...this.view.journeys.values()]
      .filter((journey) => journey.ownerUserId === userId && !journey.deletedAt && journey.status !== "deleted")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    return page(rows, query);
  }

  async journeyOwnedBy(journeyId: string, userId: string): Promise<boolean> {
    const journey = this.view.journeys.get(journeyId);
    return Boolean(journey && journey.ownerUserId === userId && !journey.deletedAt && journey.status !== "deleted");
  }

  async listJourneyCommitSummaries(
    journeyId: string,
    query: TargetedPageQuery,
  ): Promise<TargetedPage<BranchCommitRecord>> {
    const rows = [...this.view.branchCommits.values()]
      .filter((commit) => commit.journeyId === journeyId)
      .sort((a, b) => a.sequence - b.sequence);
    return page(rows, query);
  }

  async listXpLedgerEntries(
    userId: string,
    query: TargetedPageQuery,
  ): Promise<TargetedPage<XpLedgerRecord>> {
    const rows = [...this.view.xpLedger.values()]
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.sequence - a.sequence);
    return page(rows, query);
  }

  async listProofSummaries(
    userId: string,
    query: TargetedPageQuery & { verificationLevel?: string },
  ): Promise<TargetedPage<ProofRecord>> {
    const rows = [...this.view.proofs.values()]
      .filter(
        (proof) =>
          proof.ownerUserId === userId &&
          !proof.deletedAt &&
          proof.status !== "deleted" &&
          (!query.verificationLevel || proof.verificationLevel === query.verificationLevel),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return page(rows, query);
  }
}

function page<T>(rows: T[], query: TargetedPageQuery): TargetedPage<T> {
  return {
    rows: rows.slice(query.offset, query.offset + query.limit),
    total: rows.length,
  };
}
