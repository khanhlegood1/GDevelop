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

/**
 * Local/test persistence adapter for the first P04 increment.
 * It is deliberately labelled as memory storage: production persistence is
 * PostgreSQL (see db/migrations) and is not claimed by this class.
 */
export class MemoryGonStore {
  readonly users = new Map<string, UserRecord>();
  readonly identityLinks = new Map<string, IdentityLinkRecord>();
  readonly profiles = new Map<string, ProfileRecord>();
  readonly invitesByHash = new Map<string, InviteRecord>();
  readonly attestations = new Map<string, AttestationRecord>();
  readonly consents = new Map<string, ConsentRecord>();
  readonly devSessions = new Map<string, DevSessionRecord>();

  readonly projects = new Map<string, ProjectRecord>();
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly chunks = new Map<string, ChunkRecord>();
  readonly uploadSessions = new Map<string, UploadSessionRecord>();
  readonly objects = new Map<string, StoredObjectRecord>();

  readonly searchAttempts = new Map<string, SearchAttemptRecord>();
  readonly jobs = new Map<string, JobRecord>();
  readonly brewJobs = new Map<string, BrewJobRecord>();
  readonly modules = new Map<string, ModuleRecord>();
  readonly moduleVersions = new Map<string, ModuleVersionRecord>();

  readonly candidateSets = new Map<string, CandidateSetRecord>();
  readonly candidates = new Map<string, CandidateRecord>();
  readonly rankingSnapshots = new Map<string, RankingSnapshotRecord>();

  readonly journeys = new Map<string, JourneyRecord>();
  readonly branchCommits = new Map<string, BranchCommitRecord>();
  readonly attempts = new Map<string, AttemptRecord>();
  readonly mastery = new Map<string, MasteryRecord>();
  readonly xpLedger = new Map<string, XpLedgerRecord>();
  readonly proofs = new Map<string, ProofRecord>();
  readonly reports = new Map<string, ReportRecord>();
  readonly reviewCases = new Map<string, ReviewCaseRecord>();

  readonly outboxEvents: OutboxEventRecord[] = [];
  readonly auditLogs: AuditRecord[] = [];
  readonly idempotencyRecords = new Map<string, IdempotencyRecord>();

  private xpSequenceByUser = new Map<string, number>();

  seedInvite(code: string, expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()): InviteRecord {
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
}
