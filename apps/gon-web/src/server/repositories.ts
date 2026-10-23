import { sha256Hex } from "./hash";
import { createId } from "./ids";
import type {
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
  DevSessionRecord,
  IdempotencyRecord,
  IdentityLinkRecord,
  InviteRecord,
  JobRecord,
  JourneyRecord,
  MasteryRecord,
  ModuleRecord,
  ModuleVersionRecord,
  OutboxEventRecord,
  ProfileRecord,
  ProjectRecord,
  ProofRecord,
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
  readonly idempotencyRecords: RepositoryCollection<string, IdempotencyRecord>;

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
  "journeys",
  "branchCommits",
  "attempts",
  "mastery",
  "xpLedger",
  "proofs",
  "reports",
  "reviewCases",
  "idempotencyRecords",
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
  readonly idempotencyRecords = new MapRepositoryCollection<string, IdempotencyRecord>();

  hybridSearch?: HybridSearchPort;

  private xpSequenceByUser = new Map<string, number>();

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.devSessions = new MapRepositoryCollection(options.devSessions ?? new Map());
    this.objects = new MapRepositoryCollection(options.objects ?? new Map());
    this.hybridSearch = options.hybridSearch;
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
    this.xpSequenceByUser = new Map(source.xpSequenceByUser);
    this.hybridSearch = source.hybridSearch;
  }
}
