import type { JsonRecord } from "./validation";

export const LEARNING_MODES = [
  "deep_mastery",
  "apply_at_work",
  "create_publish",
  "fast_entertaining",
  "prove_impact",
] as const;
export type LearningMode = (typeof LEARNING_MODES)[number];

export type AccountStatus = "invited" | "onboarding" | "active" | "suspended" | "deletion_pending" | "deleted";
export type ConsentStatus = "not_set" | "granted" | "denied" | "withdrawn";
export type ArtifactKind = "text" | "website_url" | "youtube_url" | "facebook_url" | "file" | "image";
export type ExtractionStatus =
  | "queued"
  | "processing"
  | "ready"
  | "partial"
  | "metadata_only"
  | "unsupported"
  | "failed_retryable"
  | "failed_terminal"
  | "blocked";
export type SafetyStatus = "pending_scan" | "allowed" | "blocked" | "needs_review";
export type SearchVerdict = "found" | "related" | "missing" | "needs_clarification" | "blocked_by_policy";
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "needs_input"
  | "failed_retryable"
  | "failed_terminal"
  | "cancelled";
export type PublicationStatus = "draft_private" | "pending_review" | "internal_reviewed" | "hidden" | "retired";
export type GroundingStatus = "unverified" | "partially_cited" | "citation_checked";
export type MasteryLevel = "exposed" | "recall" | "apply" | "create" | "teach";
export type AttemptStatus =
  | "draft"
  | "submitted"
  | "assessing"
  | "passed"
  | "needs_revision"
  | "pending_human_review"
  | "rejected";

export interface Actor {
  userId: string;
  roles: Array<"learner" | "reviewer" | "admin">;
  authProvider: "google" | "dev" | "test" | "service";
  requestId?: string;
}

export interface UserRecord {
  id: string;
  status: AccountStatus;
  locale: string;
  timeZone: string;
  createdAt: string;
  deletedAt: string | null;
  roles: Array<"learner" | "reviewer" | "admin">;
  authUserId?: string;
}

export interface IdentityLinkRecord {
  userId: string;
  provider: "google" | "dev";
  providerSubject: string;
  emailAtLink: string | null;
  linkedAt: string;
}

export interface ProfileRecord {
  userId: string;
  displayName: string;
  selfDeclaredHeadline: string | null;
  version: number;
}

export interface InviteRecord {
  id: string;
  codeHash: string;
  status: "active" | "redeemed" | "expired" | "revoked";
  expiresAt: string;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

export interface AttestationRecord {
  id: string;
  userId: string;
  method: "self_attested_18_plus";
  termsVersion: string;
  privacyVersion: string;
  attestedAt: string;
}

export interface ConsentRecord {
  userId: string;
  purpose: string;
  status: ConsentStatus;
  policyVersion: string;
  changedAt: string;
  source: string;
}

export interface DevSessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ProjectRecord {
  id: string;
  ownerUserId: string;
  title: string;
  goal: string;
  rawPromptArtifactId: string;
  learningMode: LearningMode;
  depth: "intro" | "standard" | "deep";
  timeBudgetMinutes: number;
  locale: string;
  currentSearchAttemptId: string | null;
  currentBrewJobId: string | null;
  currentCandidateSetId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface ArtifactCoverage {
  hasMetadata: boolean;
  hasText: boolean;
  hasTranscript: boolean;
  chunkCount: number;
}

export interface ArtifactRecord {
  id: string;
  projectId: string;
  ownerUserId: string;
  kind: ArtifactKind;
  originUri: string | null;
  displayName: string;
  sourcePlatform: string | null;
  storageObjectKey: string | null;
  declaredMimeType: string | null;
  detectedMimeType: string | null;
  byteSize: number | null;
  sha256: string;
  rightsBasis: string;
  rightsNote: string | null;
  sourceText: string | null;
  safetyStatus: SafetyStatus;
  extractionStatus: ExtractionStatus;
  failureCode: string | null;
  coverage: ArtifactCoverage;
  createdAt: string;
  deletedAt: string | null;
  version: number;
}

export interface ChunkRecord {
  id: string;
  ownerUserId: string | null;
  sourceType: "source_artifact" | "module_version";
  sourceId: string;
  artifactId: string | null;
  moduleVersionId: string | null;
  ordinal: number;
  text: string;
  locator: string;
  language: string;
  tokenCount: number;
  contentSha256: string;
  embedding: number[];
  embeddingProfile: string;
  providerModel: string;
  weight: number;
  deletedAt: string | null;
}

export interface UploadSessionRecord {
  artifactId: string;
  projectId: string;
  ownerUserId: string;
  tokenHash: string;
  objectKey: string;
  declaredMimeType: string;
  declaredByteSize: number;
  declaredSha256: string;
  expiresAt: string;
  uploadedAt: string | null;
  actualByteSize: number | null;
  actualSha256: string | null;
  completedAt: string | null;
}

export interface StoredObjectRecord {
  key: string;
  bytes: Buffer;
  contentType: string | null;
  createdAt: string;
}

export interface SearchResultRecord {
  moduleVersionId: string;
  rank: number;
  title: string;
  sourceStatus: GroundingStatus;
  reasonCodes: string[];
  matchedConcepts: string[];
  missingConcepts: string[];
  internalScores: {
    vector: number;
    lexical: number;
    conceptCoverage: number;
    specificity: number;
    quality: number;
    hybrid: number;
  };
}

export interface SearchAttemptRecord {
  id: string;
  projectId: string;
  ownerUserId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  verdict: SearchVerdict | null;
  artifactIds: string[];
  artifactVersions: Record<string, number>;
  contextSnapshot: JsonRecord;
  matchedConcepts: string[];
  missingConcepts: string[];
  clarificationQuestions: Array<{ id: string; question: string }>;
  results: SearchResultRecord[];
  searchPolicyVersion: string;
  embeddingProfile: string;
  latencyMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface JobRecord {
  id: string;
  jobType: string;
  ownerUserId: string;
  aggregateType: string;
  aggregateId: string;
  status: JobStatus;
  currentStep: string | null;
  idempotencyKey: string;
  inputFingerprint: string;
  attemptCount: number;
  maxAttempts: number;
  estimatedCostUnits: number;
  actualCostUnits: number;
  failureCode: string | null;
  retryable: boolean;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  payload: JsonRecord;
}

export interface BrewJobRecord {
  jobId: string;
  projectId: string;
  searchAttemptId: string;
  resultModuleVersionId: string | null;
}

export interface ModuleGraphConcept {
  id: string;
  name: string;
  description: string;
  role: "core" | "supporting" | "prerequisite";
}

export interface ModuleGraphNode {
  id: string;
  type: string;
  title: string;
  conceptIds: string[];
  content: JsonRecord;
  citations: Array<{ sourceId: string; locator?: string; support: string; claimIds?: string[] }>;
  estimatedMinutes?: number;
  accessibility: { textAlternative: string; transcript?: string; keyboardEquivalent?: boolean };
  assessment?: {
    rubricId: string;
    masteryTarget: Exclude<MasteryLevel, "exposed">;
    revealPolicy: "after_submit" | "immediate" | "never";
    requiredForCompletion?: boolean;
  };
}

export interface ModuleGraphRubric {
  id: string;
  version: string;
  title: string;
  criteria: Array<{ id: string; description: string; weight: number; required: boolean }>;
  passRule: { type: "all_required" | "weighted_threshold"; threshold?: number };
  evidenceTypes: string[];
  feedbackGuidance: string;
  xpRuleId?: string;
}

export interface ModuleGraph {
  schemaVersion: "gon.module-graph/1.0";
  module: {
    title: string;
    summary: string;
    locale: string;
    estimatedMinutes: number;
    difficulty: "beginner" | "intermediate" | "advanced" | "expert";
    outcomes: Array<{ id: string; statement: string; conceptIds: string[] }>;
    concepts: ModuleGraphConcept[];
    prerequisites: string[];
    safetyNotices: string[];
  };
  sources: Array<JsonRecord & { id: string; title: string }>;
  nodes: ModuleGraphNode[];
  edges: Array<{ fromNodeId: string; toNodeId: string; type: string }>;
  rubrics: ModuleGraphRubric[];
  renderTargets: string[];
  provenance: JsonRecord;
  quality: { citationCoverage: number; unverifiedClaimIds: string[] };
}

export interface ModuleRecord {
  id: string;
  ownerUserId: string | null;
  creatorType: "user" | "ai_assisted" | "system_seed";
  attributionSnapshot: JsonRecord;
  createdAt: string;
}

export interface ModuleVersionRecord {
  id: string;
  moduleId: string;
  versionNumber: number;
  graphSchemaVersion: "gon.module-graph/1.0";
  graph: ModuleGraph;
  language: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  difficulty: string;
  visibility: "private" | "internal_reviewed";
  publicationStatus: PublicationStatus;
  groundingStatus: GroundingStatus;
  generationLineage: JsonRecord;
  sourceArtifactVersions: Array<{ artifactId: string; version: number }>;
  parentModuleVersionId: string | null;
  contentSha256: string;
  createdByUserId: string | null;
  createdAt: string;
}

export interface CandidateSetRecord {
  id: string;
  projectId: string;
  searchAttemptId: string;
  sourceModuleVersionId: string | null;
  generationMethod: string;
  generatorVersion: string;
  status: "building" | "ready" | "ready_with_shortfall" | "failed" | "stale";
  targetCount: number;
  actualCount: number;
  shortfallReasonCodes: string[];
  createdAt: string;
}

export interface CandidateRecord {
  id: string;
  candidateSetId: string;
  projectId: string;
  moduleVersionId: string;
  title: string;
  promise: string;
  cluster: string;
  format: string;
  estimatedMinutes: number;
  difficulty: string;
  artifactOutcome: string;
  prerequisiteConceptIds: string[];
  conceptIds: string[];
  sourceStatus: GroundingStatus;
  status: "eligible" | "hidden_by_policy" | "retired";
  semanticFingerprint: string;
  internalSignals: {
    relevance: number;
    conceptCoverage: number;
    sourceQuality: number;
  };
  createdAt: string;
}

export interface RankingSnapshotRecord {
  id: string;
  userId: string;
  projectId: string;
  candidateSetId: string;
  learningMode: LearningMode;
  algorithmVersion: string;
  personalizationApplied: boolean;
  orderedCandidateIds: string[];
  explanationCodes: string[];
  signalBreakdown: Record<string, JsonRecord>;
  reasonCodesByCandidate: Record<string, string[]>;
  createdAt: string;
  staleAt: string;
}

export interface JourneyRecord {
  id: string;
  ownerUserId: string;
  projectId: string;
  sourceCandidateId: string;
  upstreamModuleVersionId: string;
  parentJourneyId: string | null;
  title: string;
  goal: string;
  status: "active" | "completed" | "archived" | "deleted";
  attribution: JsonRecord;
  headCommitId: string | null;
  currentNodeId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BranchCommitRecord {
  id: string;
  journeyId: string;
  parentCommitId: string | null;
  sequence: number;
  type: string;
  actorUserId: string;
  payloadRef: JsonRecord;
  summary: string;
  createdAt: string;
}

export interface AssessmentCriterionResult {
  criterionId: string;
  passed: boolean;
  feedback: string;
}

export interface AssessmentResult {
  decision: "passed" | "needs_revision" | "pending_human_review" | "rejected";
  criteria: AssessmentCriterionResult[];
  feedback: string;
  confidence: number;
  assessorType: "deterministic" | "ai" | "human";
  assessorVersion: string;
  integritySignals: string[];
}

export interface AttemptRecord {
  id: string;
  journeyId: string;
  ownerUserId: string;
  moduleVersionId: string;
  nodeId: string;
  attemptNumber: number;
  status: AttemptStatus;
  answerText: string | null;
  artifactIds: string[];
  sourceDisclosure: JsonRecord;
  aiAssistanceDisclosure: JsonRecord;
  rubricId: string;
  rubricVersion: string;
  assessment: AssessmentResult | null;
  xpAwarded: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

export interface MasteryRecord {
  userId: string;
  conceptId: string;
  level: MasteryLevel;
  evidenceAttemptId: string | null;
  achievedAt: string | null;
  lastEvidenceAt: string | null;
  reviewDueAt: string | null;
  version: number;
}

export interface XpLedgerRecord {
  id: string;
  userId: string;
  sequence: number;
  delta: number;
  sourceEventId: string;
  sourceType: string;
  sourceId: string;
  ruleVersion: string;
  formulaVersion: "gon-level-v1";
  status: "posted" | "reversed" | "reversal";
  reversesEntryId: string | null;
  reasonCode: string | null;
  lifetimeXpAfter: number;
  createdAt: string;
}

export interface ProofRecord {
  id: string;
  ownerUserId: string;
  proofType: string;
  title: string;
  description: string | null;
  journeyId: string | null;
  attemptId: string | null;
  artifactIds: string[];
  issuerDisplayName: string | null;
  externalReference: string | null;
  verificationLevel: "self_declared" | "source_linked" | "system_recorded" | "issuer_verified" | "anchored";
  status: "active" | "pending_verification" | "revoked" | "superseded" | "deleted";
  proves: string[];
  doesNotProve: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ReportRecord {
  id: string;
  reporterUserId: string;
  targetType: string;
  targetId: string;
  targetVersion: string | null;
  reasonCode: string;
  detail: string | null;
  status: "received" | "triaged" | "action_taken" | "no_action" | "escalated" | "closed";
  createdAt: string;
}

export interface ReviewCaseRecord {
  id: string;
  reportId: string;
  riskLevel: "low" | "normal" | "high" | "critical";
  status: string;
  assigneeUserId: string | null;
  createdAt: string;
}

export interface OutboxEventRecord {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  actor: { type: string; id: string };
  correlationId: string;
  causationId: string | null;
  data: JsonRecord;
  publishState: "pending" | "publishing" | "published" | "failed";
  availableAt: string;
  publishedAt: string | null;
  publishAttemptCount: number;
  lastErrorCode: string | null;
}

export interface AuditRecord {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  requestId: string;
  reason: string | null;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  /** Persisted scope columns; optional only for records created before R1.2. */
  actorUserId?: string;
  operation?: string;
  requestFingerprint: string;
  resourceType: string;
  resourceId: string;
  status: number;
  createdAt: string;
}
