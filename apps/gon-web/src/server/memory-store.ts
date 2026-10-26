import {
  InMemoryGonRepositories,
  MemoryTargetedPagination,
  type GonRepositories,
  type GonStore,
  type MapRepositoryCollection,
} from "./repositories";
import type {
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

/**
 * Explicit local/test Unit-of-Work adapter.
 *
 * Each transaction works on a cloned identity map and swaps it back only
 * after the use case succeeds. Transactions are serialized in-process: this
 * adapter is for hermetic tests and local development, not a horizontally
 * scalable production store. Production persistence is PostgreSQL.
 */
export class MemoryGonStore implements GonStore {
  readonly kind = "memory" as const;
  readonly repositories = new InMemoryGonRepositories();

  private transactionQueue: Promise<void> = Promise.resolve();

  async runInTransaction<T>(
    work: (repositories: GonRepositories) => Promise<T>,
  ): Promise<T> {
    const execute = async (): Promise<T> => {
      const workingCopy = this.repositories.cloneIdentityMap();
      const result = await work(workingCopy);
      this.repositories.replaceIdentityMapFrom(workingCopy);
      return result;
    };

    const result = this.transactionQueue.then(execute, execute);
    this.transactionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async ensureSeedInvite(code: string, expiresAt?: string): Promise<InviteRecord> {
    return this.seedInvite(code, expiresAt);
  }

  seedInvite(
    code: string,
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  ): InviteRecord {
    return this.repositories.seedInvite(code, expiresAt);
  }

  nextXpSequence(userId: string): number {
    return this.repositories.nextXpSequence(userId);
  }

  /**
   * P05-R1.13: targeted pagination view over the committed collections.
   * Reads bypass the Unit of Work (and its identity-map clone) exactly like
   * the PostgreSQL pool-level binding, so list endpoints page without
   * loading the whole store.
   */
  createTargetedPagination(): MemoryTargetedPagination {
    return new MemoryTargetedPagination({
      users: this.users,
      journeys: this.journeys,
      branchCommits: this.branchCommits,
      xpLedger: this.xpLedger,
      proofs: this.proofs,
    });
  }

  // Compatibility accessors for existing hermetic tests and diagnostics.
  // Domain code uses GonRepositories, not these concrete maps.
  get users(): Map<string, UserRecord> {
    return (this.repositories.users as MapRepositoryCollection<string, UserRecord>).map;
  }

  get identityLinks(): Map<string, IdentityLinkRecord> {
    return (this.repositories.identityLinks as MapRepositoryCollection<string, IdentityLinkRecord>).map;
  }

  get profiles(): Map<string, ProfileRecord> {
    return (this.repositories.profiles as MapRepositoryCollection<string, ProfileRecord>).map;
  }

  get invitesByHash(): Map<string, InviteRecord> {
    return (this.repositories.invitesByHash as MapRepositoryCollection<string, InviteRecord>).map;
  }

  get attestations(): Map<string, AttestationRecord> {
    return (this.repositories.attestations as MapRepositoryCollection<string, AttestationRecord>).map;
  }

  get consents(): Map<string, ConsentRecord> {
    return (this.repositories.consents as MapRepositoryCollection<string, ConsentRecord>).map;
  }

  get devSessions(): Map<string, DevSessionRecord> {
    return (this.repositories.devSessions as MapRepositoryCollection<string, DevSessionRecord>).map;
  }

  get projects(): Map<string, ProjectRecord> {
    return (this.repositories.projects as MapRepositoryCollection<string, ProjectRecord>).map;
  }

  get artifacts(): Map<string, ArtifactRecord> {
    return (this.repositories.artifacts as MapRepositoryCollection<string, ArtifactRecord>).map;
  }

  get chunks(): Map<string, ChunkRecord> {
    return (this.repositories.chunks as MapRepositoryCollection<string, ChunkRecord>).map;
  }

  get uploadSessions(): Map<string, UploadSessionRecord> {
    return (this.repositories.uploadSessions as MapRepositoryCollection<string, UploadSessionRecord>).map;
  }

  get objects(): Map<string, StoredObjectRecord> {
    return (this.repositories.objects as MapRepositoryCollection<string, StoredObjectRecord>).map;
  }

  get searchAttempts(): Map<string, SearchAttemptRecord> {
    return (this.repositories.searchAttempts as MapRepositoryCollection<string, SearchAttemptRecord>).map;
  }

  get jobs(): Map<string, JobRecord> {
    return (this.repositories.jobs as MapRepositoryCollection<string, JobRecord>).map;
  }

  get brewJobs(): Map<string, BrewJobRecord> {
    return (this.repositories.brewJobs as MapRepositoryCollection<string, BrewJobRecord>).map;
  }

  get modules(): Map<string, ModuleRecord> {
    return (this.repositories.modules as MapRepositoryCollection<string, ModuleRecord>).map;
  }

  get moduleVersions(): Map<string, ModuleVersionRecord> {
    return (this.repositories.moduleVersions as MapRepositoryCollection<string, ModuleVersionRecord>).map;
  }

  get candidateSets(): Map<string, CandidateSetRecord> {
    return (this.repositories.candidateSets as MapRepositoryCollection<string, CandidateSetRecord>).map;
  }

  get candidates(): Map<string, CandidateRecord> {
    return (this.repositories.candidates as MapRepositoryCollection<string, CandidateRecord>).map;
  }

  get rankingSnapshots(): Map<string, RankingSnapshotRecord> {
    return (this.repositories.rankingSnapshots as MapRepositoryCollection<string, RankingSnapshotRecord>).map;
  }

  /** Apply-2 (P03 /arena-matches): trận đấu + vote Arena. */
  get arenaMatches(): Map<string, ArenaMatchRecord> {
    return (this.repositories.arenaMatches as MapRepositoryCollection<string, ArenaMatchRecord>).map;
  }

  get arenaVotes(): Map<string, ArenaVoteRecord> {
    return (this.repositories.arenaVotes as MapRepositoryCollection<string, ArenaVoteRecord>).map;
  }

  /** Apply-3 (P03 game-sessions): phiên học + event batch. */
  get gameSessions(): Map<string, GameSessionRecord> {
    return (this.repositories.gameSessions as MapRepositoryCollection<string, GameSessionRecord>).map;
  }

  get gameEvents(): Map<string, GameEventRecord> {
    return (this.repositories.gameEvents as MapRepositoryCollection<string, GameEventRecord>).map;
  }

  get journeys(): Map<string, JourneyRecord> {
    return (this.repositories.journeys as MapRepositoryCollection<string, JourneyRecord>).map;
  }

  get branchCommits(): Map<string, BranchCommitRecord> {
    return (this.repositories.branchCommits as MapRepositoryCollection<string, BranchCommitRecord>).map;
  }

  get attempts(): Map<string, AttemptRecord> {
    return (this.repositories.attempts as MapRepositoryCollection<string, AttemptRecord>).map;
  }

  get mastery(): Map<string, MasteryRecord> {
    return (this.repositories.mastery as MapRepositoryCollection<string, MasteryRecord>).map;
  }

  get xpLedger(): Map<string, XpLedgerRecord> {
    return (this.repositories.xpLedger as MapRepositoryCollection<string, XpLedgerRecord>).map;
  }

  get proofs(): Map<string, ProofRecord> {
    return (this.repositories.proofs as MapRepositoryCollection<string, ProofRecord>).map;
  }

  get reports(): Map<string, ReportRecord> {
    return (this.repositories.reports as MapRepositoryCollection<string, ReportRecord>).map;
  }

  get reviewCases(): Map<string, ReviewCaseRecord> {
    return (this.repositories.reviewCases as MapRepositoryCollection<string, ReviewCaseRecord>).map;
  }

  get outboxEvents(): OutboxEventRecord[] {
    return (this.repositories.outboxEvents as { items: OutboxEventRecord[] }).items;
  }

  get auditLogs(): AuditRecord[] {
    return (this.repositories.auditLogs as { items: AuditRecord[] }).items;
  }

  get aiRuns(): AiRunRecord[] {
    return (this.repositories.aiRuns as { items: AiRunRecord[] }).items;
  }

  get idempotencyRecords(): Map<string, IdempotencyRecord> {
    return (this.repositories.idempotencyRecords as MapRepositoryCollection<string, IdempotencyRecord>).map;
  }

  get featureFlags(): Map<string, FeatureFlagRecord> {
    return (this.repositories.featureFlags as MapRepositoryCollection<string, FeatureFlagRecord>).map;
  }

  get dataRequests(): Map<string, DataRequestRecord> {
    return (this.repositories.dataRequests as MapRepositoryCollection<string, DataRequestRecord>).map;
  }

  get personalizations(): Map<string, PersonalizationRecord> {
    return (this.repositories.personalizations as MapRepositoryCollection<string, PersonalizationRecord>).map;
  }

  get footprintEvents(): Map<string, FootprintEventRecord> {
    return (this.repositories.footprintEvents as MapRepositoryCollection<string, FootprintEventRecord>).map;
  }

  get quotaReservations(): Map<string, QuotaReservationRecord> {
    return (this.repositories.quotaReservations as MapRepositoryCollection<string, QuotaReservationRecord>).map;
  }
}
