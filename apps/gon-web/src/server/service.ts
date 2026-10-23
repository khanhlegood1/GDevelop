import {
  assertPublicHttpUrl,
  chunkText,
  classifyUrlKind,
  detectFile,
  MAX_DOCUMENT_BYTES,
  MAX_FILES_PER_PROJECT,
  MAX_PROJECT_UPLOAD_BYTES,
  MAX_TEXT_ARTIFACT_CHARS,
  MAX_URLS_PER_PROJECT,
  validateUploadDeclaration,
} from "./artifacts";
import { assessAttemptDeterministically } from "./assessment";
import { defaultContentSafetyScanner, type ContentSafetyScanner } from "./content-safety";
import { PRIVACY_VERSION, TERMS_VERSION } from "./config";
import {
  cosineSimilarity,
  createEmbeddingProvider,
  EMBEDDING_PROFILE,
  type EmbeddingProvider,
} from "./embeddings";
import {
  conflict,
  forbidden,
  notFound,
  quotaExceeded,
  rateLimited,
  serviceUnavailable,
  unauthorized,
  unprocessable,
  validationError,
} from "./errors";
import {
  AbuseController,
  MemoryAbuseStateStore,
  type BudgetAlertSink,
} from "./abuse-controls";
import { sha256Hex, stableHash, timingSafeStringEqual } from "./hash";
import { createId, createOpaqueToken } from "./ids";
import { AsyncLocalStorage } from "node:async_hooks";
import { MemoryGonStore } from "./memory-store";
import {
  RepositoryObjectStorage,
  type ObjectStorage,
} from "./object-storage";
import type { GonRepositories, GonStore } from "./repositories";
import { utcDayWindow, utcHourWindow } from "./targeted-queries";
import {
  BREW_POLICY_VERSION,
  GENERATE_MODULE_INPUT_SCHEMA_VERSION,
  GENERATE_MODULE_OUTPUT_SCHEMA_VERSION,
  LocalDeterministicBrewAiProvider,
  TOPIC_CHECK_INPUT_SCHEMA_VERSION,
  TOPIC_CHECK_OUTPUT_SCHEMA_VERSION,
  ASSESS_ATTEMPT_INPUT_SCHEMA_VERSION,
  AiProviderError,
  type AiCallTelemetry,
  type AssessAttemptOutput,
  type AssessAttemptWork,
  type BrewAiProvider,
  type GenerateModuleInput,
  type GenerateModuleOutput,
  type GenerateModuleWork,
  type TopicCheckInput,
  type TopicCheckOutput,
} from "./ai-provider";
import {
  toPlayerGraph,
  validateModuleGraph,
  type EvidenceArtifactForGraph,
} from "./module-graph";
import { progressFromXp, XP_RULE_VALUES } from "./progression";
import { jaccardSimilarity, normalizeForSearch, slugifyAscii, tokenize, tokenSet, truncateText } from "./text";
import type { SafeUrlFetcher } from "./url-fetcher";
import {
  LEARNING_MODES,
  type Actor,
  type ArtifactRecord,
  type AssessmentResult,
  type AttemptRecord,
  type CandidateRecord,
  type CandidateSetRecord,
  type ChunkRecord,
  type ConsentRecord,
  type DataRequestRecord,
  type InviteRecord,
  type JobRecord,
  type JourneyRecord,
  type LearningMode,
  type MasteryLevel,
  type ModuleGraph,
  type ModuleGraphNode,
  type ModuleGraphRubric,
  type ModuleVersionRecord,
  type PersonalizationRecord,
  type ProjectRecord,
  type ProofRecord,
  type RankingSnapshotRecord,
  type SearchAttemptRecord,
  type SearchResultRecord,
  type UserRecord,
} from "./types";
import {
  ensureRecord,
  optionalEnum,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredEnum,
  requiredString,
  stringArray,
  type JsonRecord,
} from "./validation";

export interface CommandResult<T> {
  data: T;
  status: number;
  replay?: boolean;
}

export type BrewExecutionMode = "inline" | "queued";

export interface ProcessQueuedBrewJobOptions {
  workerId?: string;
  leaseMs?: number;
  alreadyClaimed?: boolean;
}

export interface GonServiceOptions {
  store?: GonStore;
  objectStorage?: ObjectStorage;
  embeddingProvider?: EmbeddingProvider;
  requireInvite?: boolean;
  brewExecutionMode?: BrewExecutionMode;
  /**
   * Brew generation port. Defaults to the in-process deterministic provider
   * (established VS1 behavior). Passing `HttpAdkBrewAiProvider` routes
   * generate/topic-check through the stateless ADK service instead; the ADK
   * never writes to the database or publishes events.
   */
  brewAiProvider?: BrewAiProvider;
  featureFlags?: Record<string, boolean>;
  /** Content-safety scanner (P05-R1.8). Defaults to the local deterministic scanner. */
  contentSafetyScanner?: ContentSafetyScanner;
  /**
   * SSRF-safe URL fetcher (P05-R1.8). Absent = URL artifacts stay
   * metadata-only (VS1 default; no third-party fetches).
   */
  urlFetcher?: SafeUrlFetcher;
  now?: () => Date;
  quotas?: Partial<{
    searchPerHour: number;
    brewPerDay: number;
    artifactProcessingPerDay: number;
    brewCostUnitsPerDay: number;
  }>;
  /**
   * Distributed abuse/cost controller (P05-R1.10). Defaults to an in-process
   * token-bucket/flood-guard controller; `runtime.ts` binds the shared
   * PostgreSQL state store so every instance enforces the same limits.
   */
  abuseControls?: AbuseController;
  /** Optional ops hook fired exactly once per crossed AI-cost budget threshold. */
  budgetAlertSink?: BudgetAlertSink;
}

interface GonServiceCoreOptions extends Omit<GonServiceOptions, "store"> {
  repositories: GonRepositories;
}

/** One AI-provider call's safe telemetry, queued for `ai_runs` persistence. */
interface AiRunDraft {
  operation: "topic_check" | "generate_module" | "assess_attempt";
  telemetry: AiCallTelemetry;
}

/** AI rubric assessment outcome for a submitted attempt (P05-R1.9). */
type AttemptAssessOutcome =
  | { kind: "assessed"; output: AssessAttemptOutput; telemetry: AiCallTelemetry }
  | { kind: "provider_error"; errorCode: string; retryable: boolean };

interface AttemptAssessWorkPackage {
  actor: Actor;
  journeyId: string;
  attemptId: string;
  jobId: string;
  idempotencyKey?: string;
  payload: JsonRecord;
  deterministic: AssessmentResult;
  work: AssessAttemptWork;
}

type SubmitAttemptPhaseOne =
  | { kind: "settled"; result: CommandResult<JsonRecord> }
  | { kind: "assess_ai"; work: AttemptAssessWorkPackage };

/** Generation inputs prepared in a Unit of Work; the AI calls run outside it. */
interface BrewGenerationWorkPackage {
  jobId: string;
  workerId: string;
  actor: Actor;
  topicCheckInput: TopicCheckInput;
  generateWork: GenerateModuleWork;
}

type BrewPhaseOneResult =
  | { kind: "settled"; job: JsonRecord }
  | { kind: "generate"; work: BrewGenerationWorkPackage };

type BrewGenerationOutcome =
  | { kind: "generated"; generateOutput: GenerateModuleOutput }
  | { kind: "topic_decision"; topicOutput: TopicCheckOutput }
  | { kind: "provider_error"; errorCode: string; retryable: boolean };

const CONSENT_PURPOSES = [
  "essential_service",
  "personalization_footprint",
  "product_analytics",
  "ai_model_training",
  "external_social_connection",
] as const;

const RIGHTS_BASES = [
  "created_by_user",
  "licensed_to_user",
  "publicly_available_link",
  "permission_claimed",
  "unknown",
] as const;

const BLOCKED_TOPIC_PATTERNS = [
  /how to (make|build|create).{0,40}(bomb|weapon|malware|ransomware)/i,
  /(cách|huong dan|hướng dẫn).{0,40}(chế tạo bom|vũ khí|malware|ransomware)/i,
  /(instructions?|guide).{0,40}(self[-\s]?harm|suicide)/i,
  /(hướng dẫn|huong dan).{0,40}(tự tử|tự hại)/i,
];

const MASTERY_ORDER: Record<MasteryLevel, number> = {
  exposed: 0,
  recall: 1,
  apply: 2,
  create: 3,
  teach: 4,
};

const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  brew_enabled: true,
  arena_enabled: true,
  trend_enabled: false,
  game_events_enabled: false,
  internal_publish_enabled: false,
};

class GonServiceCore {
  private readonly repositories: GonRepositories;
  private readonly objectStorage: ObjectStorage;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly requireInvite: boolean;
  private readonly brewExecutionMode: BrewExecutionMode;
  private readonly brewAiProvider: BrewAiProvider;
  private readonly featureFlags: Record<string, boolean>;
  private readonly contentSafetyScanner: ContentSafetyScanner;
  private readonly urlFetcher: SafeUrlFetcher | null;
  private readonly clock: () => Date;
  private readonly quotas: Required<NonNullable<GonServiceOptions["quotas"]>>;
  private readonly abuseController: AbuseController;
  private readonly budgetAlertSink: BudgetAlertSink | null;

  constructor(options: GonServiceCoreOptions) {
    this.repositories = options.repositories;
    this.objectStorage =
      options.objectStorage ?? new RepositoryObjectStorage(this.repositories.objects, options.now);
    this.embeddingProvider = options.embeddingProvider ?? createEmbeddingProvider();
    this.requireInvite = options.requireInvite ?? true;
    this.brewExecutionMode = options.brewExecutionMode ?? "inline";
    if (!["inline", "queued"].includes(this.brewExecutionMode)) {
      throw new Error(`Unsupported Brew execution mode: ${String(this.brewExecutionMode)}`);
    }
    this.brewAiProvider = options.brewAiProvider ?? new LocalDeterministicBrewAiProvider();
    this.contentSafetyScanner = options.contentSafetyScanner ?? defaultContentSafetyScanner;
    this.urlFetcher = options.urlFetcher ?? null;
    this.featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...(options.featureFlags ?? {}) };
    this.clock = options.now ?? (() => new Date());
    this.quotas = {
      searchPerHour: options.quotas?.searchPerHour ?? 60,
      brewPerDay: options.quotas?.brewPerDay ?? 5,
      artifactProcessingPerDay: options.quotas?.artifactProcessingPerDay ?? 20,
      brewCostUnitsPerDay: options.quotas?.brewCostUnitsPerDay ?? 20,
    };
    this.abuseController =
      options.abuseControls ?? new AbuseController({ store: new MemoryAbuseStateStore() });
    this.budgetAlertSink = options.budgetAlertSink ?? null;
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private actorRequestId(actor: Actor): string {
    return actor.requestId ?? createId("req");
  }

  private emit(
    actor: Actor | { userId: string; requestId?: string },
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    data: JsonRecord = {},
    causationId: string | null = null,
  ): void {
    this.repositories.outboxEvents.append({
      eventId: createId("evt"),
      eventType,
      eventVersion: 1,
      occurredAt: this.now(),
      aggregateType,
      aggregateId,
      actor: { type: "user", id: actor.userId },
      correlationId: actor.requestId ?? createId("req"),
      causationId,
      data,
      publishState: "pending",
      availableAt: this.now(),
      publishedAt: null,
      publishAttemptCount: 0,
      lastErrorCode: null,
    });
  }

  private Audit(actor: Actor, action: string, objectType: string, objectId: string, reason: string | null = null): void {
    this.repositories.auditLogs.append({
      id: createId("evt"),
      actorType: "user",
      actorId: actor.userId,
      action,
      objectType,
      objectId,
      requestId: this.actorRequestId(actor),
      reason,
      createdAt: this.now(),
    });
  }

  private idempotencyScope(actor: Actor, operation: string, key: string): string {
    return `${actor.userId}:${operation}:${key}`;
  }

  private findIdempotentReplay(actor: Actor, operation: string, key: string | undefined, payload: unknown) {
    if (!key) return null;
    const record = this.repositories.idempotencyRecords.get(this.idempotencyScope(actor, operation, key));
    if (!record) return null;
    if (record.requestFingerprint !== stableHash(payload)) {
      throw conflict(
        "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
        "Idempotency-Key đã được dùng cho payload khác",
        "Hãy kiểm tra trạng thái tài nguyên hiện tại hoặc dùng một Idempotency-Key mới cho yêu cầu khác.",
      );
    }
    return record;
  }

  private saveIdempotentResult(
    actor: Actor,
    operation: string,
    key: string | undefined,
    payload: unknown,
    resourceType: string,
    resourceId: string,
    status: number,
  ): void {
    if (!key) return;
    this.repositories.idempotencyRecords.set(this.idempotencyScope(actor, operation, key), {
      key,
      actorUserId: actor.userId,
      operation,
      requestFingerprint: stableHash(payload),
      resourceType,
      resourceId,
      status,
      createdAt: this.now(),
    });
  }

  private requireUser(actor: Actor): UserRecord {
    const user = this.repositories.users.get(actor.userId);
    if (!user || user.status === "deleted") throw unauthorized("Phiên đăng nhập không còn hợp lệ.");
    return user;
  }

  private requireActiveUser(actor: Actor): UserRecord {
    const user = this.requireUser(actor);
    if (user.status === "active") return user;
    if (user.status === "suspended") {
      throw forbidden("FORBIDDEN", "Tài khoản đang bị tạm dừng", "Tài khoản suspended không thể tạo nội dung học mới.");
    }
    if (user.status === "deletion_pending") {
      throw forbidden("FORBIDDEN", "Tài khoản đang chờ xóa", "Hãy liên hệ hỗ trợ nếu bạn muốn hủy yêu cầu xóa.");
    }
    throw forbidden(
      "AGE_ATTESTATION_REQUIRED",
      "Chưa hoàn tất điều kiện Private Alpha",
      "Cần invite hợp lệ, xác nhận đủ 18 tuổi và chấp nhận điều khoản trước khi tạo dữ liệu học.",
      "complete_onboarding",
    );
  }

  private latestAttestation(userId: string) {
    return [...this.repositories.attestations.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.attestedAt.localeCompare(a.attestedAt))[0];
  }

  private consentRecord(userId: string, purpose: string): ConsentRecord {
    const existing = this.repositories.consents.get(`${userId}:${purpose}`);
    if (existing) return existing;
    const user = this.repositories.users.get(userId);
    return {
      userId,
      purpose,
      status: purpose === "essential_service" && user?.status === "active" ? "granted" : "not_set",
      policyVersion: PRIVACY_VERSION,
      changedAt: user?.createdAt ?? this.now(),
      source: "default",
    };
  }

  private setConsentRecord(userId: string, purpose: string, status: ConsentRecord["status"], policyVersion: string, source: string): ConsentRecord {
    const record: ConsentRecord = {
      userId,
      purpose,
      status,
      policyVersion,
      changedAt: this.now(),
      source,
    };
    this.repositories.consents.set(`${userId}:${purpose}`, record);
    return record;
  }

  private consentDto(record: ConsentRecord): JsonRecord {
    return {
      purpose: record.purpose,
      status: record.status,
      policyVersion: record.policyVersion,
      changedAt: record.changedAt,
    };
  }

  private progressDto(userId: string): JsonRecord {
    const lifetimeXp = [...this.repositories.xpLedger.values()]
      .filter((entry) => entry.userId === userId)
      .reduce((sum, entry) => sum + entry.delta, 0);
    const progress = progressFromXp(lifetimeXp);
    const mastery = [...this.repositories.mastery.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.conceptId.localeCompare(b.conceptId))
      .map((item) => this.masteryDto(item));
    const latestProof = [...this.repositories.proofs.values()]
      .filter((proof) => proof.ownerUserId === userId && !proof.deletedAt && proof.status !== "deleted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const nextSteps = [...this.repositories.journeys.values()]
      .filter((journey) => journey.ownerUserId === userId && journey.status === "active" && !journey.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3)
      .map((journey) => ({
        type: "continue_journey",
        journeyId: journey.id,
        nodeId: journey.currentNodeId,
        title: journey.title,
      }));

    return {
      ...progress,
      mastery,
      latestProof: latestProof ? this.proofDto(latestProof) : null,
      nextSteps,
    };
  }

  private masteryDto(record: { conceptId: string; level: MasteryLevel; evidenceAttemptId: string | null; achievedAt: string | null; reviewDueAt: string | null }): JsonRecord {
    return {
      conceptId: record.conceptId,
      level: record.level,
      evidenceAttemptId: record.evidenceAttemptId,
      achievedAt: record.achievedAt,
      reviewDueAt: record.reviewDueAt,
    };
  }

  ensureIdentityUser(input: {
    provider: "google" | "dev";
    providerSubject: string;
    email?: string | null;
    displayName?: string | null;
    authUserId?: string | number;
  }): UserRecord {
    const subject = input.providerSubject.trim();
    if (!subject) throw validationError("Provider subject không được để trống.");
    const key = `${input.provider}:${subject}`;
    const existingLink = this.repositories.identityLinks.get(key);
    if (existingLink) {
      const user = this.repositories.users.get(existingLink.userId);
      if (!user) throw unauthorized("Identity link không còn hợp lệ.");
      if (input.authUserId !== undefined && input.authUserId !== null && input.authUserId !== "") {
        user.authUserId = String(input.authUserId);
      }
      const profile = this.repositories.profiles.get(user.id);
      if (profile && input.displayName && (profile.displayName === "Người học GON" || profile.displayName === "GON Learner")) {
        profile.displayName = truncateText(input.displayName, 120);
      }
      return user;
    }

    const now = this.now();
    const user: UserRecord = {
      id: createId("usr"),
      status: "onboarding",
      locale: "vi-VN",
      timeZone: "Asia/Ho_Chi_Minh",
      createdAt: now,
      deletedAt: null,
      roles: ["learner"],
      authUserId: input.authUserId === undefined || input.authUserId === null || input.authUserId === ""
        ? undefined
        : String(input.authUserId),
    };
    this.repositories.users.set(user.id, user);
    this.repositories.identityLinks.set(key, {
      userId: user.id,
      provider: input.provider,
      providerSubject: subject,
      emailAtLink: input.email ?? null,
      linkedAt: now,
    });
    this.repositories.profiles.set(user.id, {
      userId: user.id,
      displayName: truncateText(input.displayName?.trim() || "Người học GON", 120),
      selfDeclaredHeadline: null,
      version: 1,
    });
    this.setConsentRecord(user.id, "ai_model_training", "denied", PRIVACY_VERSION, "alpha_default");
    this.setConsentRecord(user.id, "external_social_connection", "denied", PRIVACY_VERSION, "alpha_default");
    return user;
  }

  ensureGoogleUser(input: { providerSubject: string; email?: string | null; displayName?: string | null; authUserId?: string | number }): UserRecord {
    return this.ensureIdentityUser({ provider: "google", ...input });
  }

  ensureDevUser(displayName: string): UserRecord {
    const name = displayName.trim();
    if (name.length < 2 || name.length > 120) {
      throw validationError("Tên dev user cần từ 2 đến 120 ký tự.");
    }
    return this.ensureIdentityUser({
      provider: "dev",
      providerSubject: slugifyAscii(name, "dev-user"),
      displayName: name,
    });
  }

  findUserIdByAuthUserId(authUserId: string | number): string | undefined {
    const normalized = String(authUserId);
    return [...this.repositories.users.values()].find((user) => user.authUserId === normalized)?.id;
  }

  findUserById(userId: string): UserRecord | undefined {
    return this.repositories.users.get(userId);
  }

  seedInvite(code: string, expiresAt?: string): InviteRecord {
    return this.repositories.seedInvite(code, expiresAt);
  }

  createDevSession(userId: string): { token: string; expiresAt: string } {
    const token = createOpaqueToken(32);
    const expiresAt = new Date(this.clock().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.repositories.devSessions.set(sha256Hex(token), {
      tokenHash: sha256Hex(token),
      userId,
      createdAt: this.now(),
      expiresAt,
    });
    return { token, expiresAt };
  }

  resolveDevSession(token: string | null | undefined): Actor | null {
    if (!token) return null;
    const tokenHash = sha256Hex(token);
    const session = this.repositories.devSessions.get(tokenHash);
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= this.clock().getTime()) {
      this.repositories.devSessions.delete(tokenHash);
      return null;
    }
    const user = this.repositories.users.get(session.userId);
    if (!user || user.status === "deleted") return null;
    return { userId: user.id, roles: user.roles, authProvider: "dev" };
  }

  revokeDevSession(token: string | null | undefined): void {
    if (token) this.repositories.devSessions.delete(sha256Hex(token));
  }

  getBootstrap(actor: Actor): JsonRecord {
    const user = this.requireUser(actor);
    const profile = this.repositories.profiles.get(user.id);
    if (!profile) throw unauthorized("Hồ sơ người dùng không tồn tại.");
    const attestation = this.latestAttestation(user.id);
    const personalization = this.consentRecord(user.id, "personalization_footprint");
    const nextStep = !attestation
      ? this.requireInvite
        ? "redeem_invite"
        : "age_attestation"
      : personalization.status === "not_set"
        ? "choose_personalization"
        : "none";

    return {
      account: {
        id: user.id,
        status: user.status,
        locale: user.locale,
        timeZone: user.timeZone,
      },
      profile: {
        userId: profile.userId,
        displayName: profile.displayName,
        selfDeclaredHeadline: profile.selfDeclaredHeadline,
        version: profile.version,
      },
      onboarding: {
        ageAttested: Boolean(attestation),
        nextStep,
      },
      consents: CONSENT_PURPOSES.map((purpose) => this.consentDto(this.consentRecord(user.id, purpose))),
      progress: this.progressDto(user.id),
      featureFlags: { ...this.featureFlags },
    };
  }

  createAgeAttestation(
    actor: Actor,
    bodyValue: unknown,
    options: { inviteCode?: string; idempotencyKey?: string } = {},
  ): CommandResult<JsonRecord> {
    const user = this.requireUser(actor);
    if (user.status === "suspended" || user.status === "deletion_pending") {
      throw forbidden("FORBIDDEN", "Tài khoản không thể hoàn tất onboarding", "Trạng thái tài khoản hiện tại không cho phép kích hoạt.");
    }
    const body = ensureRecord(bodyValue);
    if (body.isAtLeast18 !== true) {
      throw forbidden(
        "AGE_ATTESTATION_REQUIRED",
        "Cần xác nhận đủ 18 tuổi",
        "GON Private Alpha chỉ dành cho người dùng tự xác nhận đủ 18 tuổi.",
        "age_attestation",
      );
    }
    const termsVersion = requiredString(body, "termsVersion", { maxLength: 80 });
    const privacyVersion = requiredString(body, "privacyVersion", { maxLength: 80 });
    const personalization = requiredEnum(body, "personalizationFootprint", ["granted", "denied"] as const);
    if (termsVersion !== TERMS_VERSION || privacyVersion !== PRIVACY_VERSION) {
      throw unprocessable(
        "POLICY_VERSION_MISMATCH",
        "Phiên bản điều khoản đã thay đổi",
        `Hãy tải lại trang và xác nhận ${TERMS_VERSION}/${PRIVACY_VERSION}.`,
      );
    }

    const payloadForIdempotency = { termsVersion, privacyVersion, personalization };
    const replay = this.findIdempotentReplay(actor, "createAgeAttestation", options.idempotencyKey, payloadForIdempotency);
    if (replay) {
      const existing = this.repositories.attestations.get(replay.resourceId);
      if (existing) return { data: this.attestationDto(existing), status: 201, replay: true };
    }

    const existing = this.latestAttestation(user.id);
    if (existing && existing.termsVersion === termsVersion && existing.privacyVersion === privacyVersion) {
      this.setConsentRecord(user.id, "personalization_footprint", personalization, privacyVersion, "onboarding");
      return { data: this.attestationDto(existing), status: 201, replay: true };
    }

    let invite: InviteRecord | undefined;
    if (this.requireInvite && !existing) {
      const code = optionalString(body, "inviteCode", { maxLength: 256 }) ?? options.inviteCode?.trim();
      if (!code) {
        throw forbidden("INVITE_REQUIRED", "Cần mã mời Private Alpha", "Hãy dùng invite link hoặc nhập mã mời hợp lệ.", "redeem_invite");
      }
      invite = this.repositories.invitesByHash.get(sha256Hex(code));
      const expired = invite ? Date.parse(invite.expiresAt) <= this.clock().getTime() : true;
      const redeemedByOther = Boolean(invite?.redeemedByUserId && invite.redeemedByUserId !== user.id);
      if (!invite || invite.status === "revoked" || expired || redeemedByOther) {
        throw forbidden(
          "INVITE_INVALID_OR_EXPIRED",
          "Mã mời không hợp lệ hoặc đã hết hạn",
          "Mã mời chỉ dùng một lần và không tạo tài khoản active khi hết hạn/đã được redeem.",
          "redeem_invite",
        );
      }
    }

    const attestation = {
      id: createId("age"),
      userId: user.id,
      method: "self_attested_18_plus" as const,
      termsVersion,
      privacyVersion,
      attestedAt: this.now(),
    };
    this.repositories.attestations.set(attestation.id, attestation);
    if (invite && !invite.redeemedByUserId) {
      invite.status = "redeemed";
      invite.redeemedByUserId = user.id;
      invite.redeemedAt = attestation.attestedAt;
    }
    user.status = "active";
    this.setConsentRecord(user.id, "essential_service", "granted", privacyVersion, "terms_accepted");
    this.setConsentRecord(user.id, "personalization_footprint", personalization, privacyVersion, "onboarding");
    this.emit(actor, "identity.age_attested", "user_account", user.id, {
      method: attestation.method,
      termsVersion,
      privacyVersion,
    });
    this.Audit(actor, "identity.age_attested", "user_account", user.id);
    this.saveIdempotentResult(actor, "createAgeAttestation", options.idempotencyKey, payloadForIdempotency, "age_attestation", attestation.id, 201);

    return { data: this.attestationDto(attestation), status: 201 };
  }

  private attestationDto(record: { id: string; method: string; termsVersion: string; privacyVersion: string; attestedAt: string }): JsonRecord {
    return {
      id: record.id,
      method: record.method,
      termsVersion: record.termsVersion,
      privacyVersion: record.privacyVersion,
      attestedAt: record.attestedAt,
    };
  }

  listConsents(actor: Actor): JsonRecord[] {
    const user = this.requireUser(actor);
    return CONSENT_PURPOSES.map((purpose) => this.consentDto(this.consentRecord(user.id, purpose)));
  }

  setConsent(actor: Actor, purpose: string, bodyValue: unknown): JsonRecord {
    const user = this.requireUser(actor);
    if (!CONSENT_PURPOSES.includes(purpose as (typeof CONSENT_PURPOSES)[number])) throw notFound("Mục đích consent không tồn tại.");
    const body = ensureRecord(bodyValue);
    const status = requiredEnum(body, "status", ["granted", "denied", "withdrawn"] as const);
    const policyVersion = requiredString(body, "policyVersion", { maxLength: 80 });
    if (purpose === "essential_service") {
      throw unprocessable("CONSENT_NOT_OPTIONAL", "Điều khoản dịch vụ không phải optional consent", "Muốn ngừng dịch vụ lõi, hãy dùng luồng xóa tài khoản.");
    }
    if ((purpose === "ai_model_training" || purpose === "external_social_connection") && status === "granted") {
      throw unprocessable("FEATURE_NOT_AVAILABLE", "Tính năng chưa có trong Private Alpha", "GON Alpha không huấn luyện mô hình bằng dữ liệu user và không kết nối footprint mạng xã hội.");
    }
    const record = this.setConsentRecord(user.id, purpose, status, policyVersion, "settings");
    this.emit(actor, "identity.consent.changed", "user_account", user.id, { purpose, status, policyVersion });
    this.Audit(actor, "identity.consent.changed", "consent", purpose);
    return this.consentDto(record);
  }

  // ---------------------------------------------------------------------
  // Privacy: data requests (export / delete footprint / delete account)
  // P05-R1.7 implementing P03 /me/data-requests + /me/personalization.
  // ---------------------------------------------------------------------

  private static readonly SIGNAL_GROUPS = [
    "search_history",
    "learning_activity",
    "candidate_votes",
    "artifact_topics",
  ] as const;

  private dataRequestStatusDto(
    status: DataRequestRecord["status"],
  ): "received" | "processing" | "completed" | "rejected" | "failed" {
    switch (status) {
      case "requested":
        return "received";
      case "cancelled":
        return "rejected";
      default:
        return status;
    }
  }

  private dataRequestDto(record: DataRequestRecord): JsonRecord {
    return {
      id: record.id,
      type: record.requestType,
      status: this.dataRequestStatusDto(record.status),
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      receipt: record.receipt,
    };
  }

  private footprintConsentGranted(userId: string): boolean {
    return this.consentRecord(userId, "personalization_footprint").status === "granted";
  }

  private personalizationDto(userId: string): JsonRecord {
    const enabled = this.footprintConsentGranted(userId);
    const stored = this.repositories.personalizations.get(userId);
    return {
      footprintEnabled: enabled,
      usedSignalGroups: enabled ? [...GonServiceCore.SIGNAL_GROUPS] : [],
      notUsedSignalGroups: enabled ? [] : [...GonServiceCore.SIGNAL_GROUPS],
      preferences: stored ? stored.preferences : {},
      version: stored ? stored.version : 1,
    };
  }

  getPersonalization(actor: Actor): JsonRecord {
    this.requireActiveUser(actor);
    return this.personalizationDto(actor.userId);
  }

  patchPersonalization(actor: Actor, bodyValue: unknown): JsonRecord {
    const user = this.requireUser(actor);
    const body = ensureRecord(bodyValue);
    if ("footprintEnabled" in body) {
      const enabled = body.footprintEnabled === true;
      this.setConsentRecord(
        user.id,
        "personalization_footprint",
        enabled ? "granted" : "denied",
        PRIVACY_VERSION,
        "settings",
      );
      this.emit(actor, "identity.consent.changed", "user_account", user.id, {
        purpose: "personalization_footprint",
        status: enabled ? "granted" : "denied",
        policyVersion: PRIVACY_VERSION,
      });
      this.Audit(actor, "identity.consent.changed", "consent", "personalization_footprint");
    }
    if ("preferences" in body) {
      const preferences = ensureRecord(body.preferences);
      const existing = this.repositories.personalizations.get(user.id);
      const record: PersonalizationRecord = {
        userId: user.id,
        preferences,
        // The implicit default row is version 1; every stored patch bumps it.
        version: (existing?.version ?? 1) + 1,
        updatedAt: this.now(),
      };
      this.repositories.personalizations.set(user.id, record);
    }
    return this.personalizationDto(user.id);
  }

  createDataRequest(actor: Actor, bodyValue: unknown, options: { idempotencyKey?: string } = {}): CommandResult<JsonRecord> {
    const user = this.requireActiveUser(actor);
    const body = ensureRecord(bodyValue);
    const requestType = requiredEnum(body, "type", ["export", "delete_footprint", "delete_account"] as const);
    const payload = { type: requestType };
    const replay = this.findIdempotentReplay(actor, "createDataRequest", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.dataRequests.get(replay.resourceId);
      if (existing) return { data: this.dataRequestDto(existing), status: 200, replay: true };
    }
    const record: DataRequestRecord = {
      id: createId("data"),
      userId: user.id,
      requestType,
      scope: {},
      status: "requested",
      receipt: null,
      requestedAt: this.now(),
      completedAt: null,
    };
    this.repositories.dataRequests.set(record.id, record);
    this.emit(actor, "identity.data_request.created", "data_request", record.id, {
      requestType,
      policyVersion: PRIVACY_VERSION,
    });
    this.Audit(actor, "identity.data_request.created", "data_request", record.id);
    this.saveIdempotentResult(actor, "createDataRequest", options.idempotencyKey, payload, "data_request", record.id, 202);
    return { data: this.dataRequestDto(record), status: 202 };
  }

  /** P03 `DELETE /me/personalization/footprint`: request footprint erasure. */
  deleteFootprint(actor: Actor, options: { idempotencyKey?: string } = {}): CommandResult<JsonRecord> {
    return this.createDataRequest(actor, { type: "delete_footprint" }, options);
  }

  getDataRequest(actor: Actor, requestId: string): JsonRecord {
    this.requireActiveUser(actor);
    const record = this.repositories.dataRequests.get(requestId);
    if (!record || record.userId !== actor.userId) throw notFound();
    return this.dataRequestDto(record);
  }

  /**
   * Process one privacy data request to completion inside the Unit of Work
   * (Alpha: synchronous processor entry, same shape as the Brew worker
   * entries). A queued job wrapper can call this without changing the
   * domain logic.
   */
  async processDataRequest(requestId: string): Promise<JsonRecord | null> {
    const record = this.repositories.dataRequests.get(requestId);
    if (!record) return null;
    if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") {
      return this.dataRequestDto(record);
    }
    const actor: Actor = {
      userId: record.userId,
      roles: [],
      authProvider: "service",
      requestId: `req_data_${record.id}`,
    };
    record.status = "processing";
    try {
      const receipt = await this.applyDataRequest(record);
      record.status = "completed";
      record.receipt = receipt;
      record.completedAt = this.now();
      this.emit(actor, "identity.data_request.completed", "data_request", record.id, {
        requestType: record.requestType,
        status: "completed",
      });
      this.Audit(actor, "identity.data_request.completed", "data_request", record.id);
    } catch (error) {
      record.status = "failed";
      record.receipt = {
        errorCode: "DATA_REQUEST_FAILED",
        detail: error instanceof Error ? error.message : "unknown",
      };
      record.completedAt = this.now();
      this.emit(actor, "identity.data_request.completed", "data_request", record.id, {
        requestType: record.requestType,
        status: "failed",
      });
      this.Audit(actor, "identity.data_request.completed", "data_request", record.id);
    }
    return this.dataRequestDto(record);
  }

  private async applyDataRequest(record: DataRequestRecord): Promise<JsonRecord> {
    switch (record.requestType) {
      case "export":
        return this.applyExportRequest(record);
      case "delete_footprint":
        return this.applyDeleteFootprint(record);
      case "delete_account":
        return this.applyDeleteAccount(record);
    }
  }

  private async applyExportRequest(record: DataRequestRecord): Promise<JsonRecord> {
    const bundle = this.buildExportBundle(record.userId);
    const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
    const objectKey = `private/exports/${record.userId}/${record.id}.json`;
    const metadata = await this.objectStorage.putObject({
      key: objectKey,
      bytes,
      contentType: "application/json",
    });
    const expiresAt = new Date(this.clock().getTime() + 24 * 60 * 60 * 1000).toISOString();
    return {
      kind: "export",
      policyVersion: PRIVACY_VERSION,
      objectKey: metadata.key,
      sha256: metadata.sha256,
      contentType: "application/json",
      generatedAt: this.now(),
      expiresAt,
      contents: bundle.contents as JsonRecord,
    };
  }

  private buildExportBundle(userId: string): JsonRecord {
    const user = this.repositories.users.get(userId);
    const profile = this.repositories.profiles.get(userId);
    const consents = CONSENT_PURPOSES.map((purpose) => this.consentDto(this.consentRecord(userId, purpose)));
    const projects = [...this.repositories.projects.values()].filter(
      (project) => project.ownerUserId === userId && !project.deletedAt,
    );
    const artifacts = [...this.repositories.artifacts.values()].filter(
      (artifact) => artifact.ownerUserId === userId && !artifact.deletedAt,
    );
    const journeys = [...this.repositories.journeys.values()].filter(
      (journey) => journey.ownerUserId === userId && !journey.deletedAt,
    );
    const attempts = [...this.repositories.attempts.values()].filter(
      (attempt) => attempt.ownerUserId === userId,
    );
    const proofs = [...this.repositories.proofs.values()].filter(
      (proof) => proof.ownerUserId === userId && !proof.deletedAt,
    );
    const xpLedger = [...this.repositories.xpLedger.values()].filter(
      (entry) => entry.userId === userId,
    );
    const footprintEvents = [...this.repositories.footprintEvents.values()].filter(
      (event) => event.userId === userId,
    );
    return {
      schemaVersion: "gon.privacy.export/1.0",
      generatedAt: this.now(),
      policyVersion: PRIVACY_VERSION,
      account: user
        ? { id: user.id, status: user.status, locale: user.locale, timeZone: user.timeZone, createdAt: user.createdAt }
        : null,
      profile: profile ?? null,
      consents,
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        goal: project.goal,
        learningMode: project.learningMode,
        createdAt: project.createdAt,
      })),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        projectId: artifact.projectId,
        kind: artifact.kind,
        displayName: artifact.displayName,
        originUri: artifact.originUri,
        rightsBasis: artifact.rightsBasis,
        sourceText: artifact.sourceText,
        sha256: artifact.sha256,
        createdAt: artifact.createdAt,
      })),
      journeys: journeys.map((journey) => ({
        id: journey.id,
        projectId: journey.projectId,
        title: journey.title,
        goal: journey.goal,
        status: journey.status,
        createdAt: journey.createdAt,
      })),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        journeyId: attempt.journeyId,
        nodeId: attempt.nodeId,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        assessed: attempt.assessment !== null,
        createdAt: attempt.createdAt,
      })),
      proofs: proofs.map((proof) => ({
        id: proof.id,
        journeyId: proof.journeyId,
        proofType: proof.proofType,
        createdAt: proof.createdAt,
      })),
      xpLedger: xpLedger.map((entry) => ({
        id: entry.id,
        sequence: entry.sequence,
        delta: entry.delta,
        sourceType: entry.sourceType,
        reasonCode: entry.reasonCode,
        createdAt: entry.createdAt,
      })),
      footprint: {
        preferences: this.repositories.personalizations.get(userId)?.preferences ?? {},
        footprintEnabled: this.footprintConsentGranted(userId),
        events: footprintEvents.map((event) => ({
          category: event.category,
          entityType: event.entityType,
          entityId: event.entityId,
          occurredAt: event.occurredAt,
        })),
      },
      contents: {
        consents: consents.length,
        projects: projects.length,
        artifacts: artifacts.length,
        journeys: journeys.length,
        attempts: attempts.length,
        proofs: proofs.length,
        xpLedgerEntries: xpLedger.length,
        footprintEvents: footprintEvents.length,
      },
    };
  }

  private applyDeleteFootprint(record: DataRequestRecord): JsonRecord {
    // P03: stop using footprint for new ranking immediately, delete detailed
    // events and derived preferences; never delete projects/journeys/proofs/XP.
    let deletedEvents = 0;
    for (const event of [...this.repositories.footprintEvents.values()]) {
      if (event.userId !== record.userId) continue;
      this.repositories.footprintEvents.delete(event.id);
      deletedEvents += 1;
    }
    this.repositories.personalizations.delete(record.userId);
    if (this.footprintConsentGranted(record.userId)) {
      this.setConsentRecord(
        record.userId,
        "personalization_footprint",
        "denied",
        PRIVACY_VERSION,
        "privacy_deletion",
      );
    }
    return {
      kind: "delete_footprint",
      policyVersion: PRIVACY_VERSION,
      deletedFootprintEvents: deletedEvents,
      footprintDisabled: true,
      retained: ["projects", "journeys", "proofs", "xp_ledger"],
    };
  }

  private applyDeleteAccount(record: DataRequestRecord): JsonRecord {
    const userId = record.userId;
    const now = this.now();
    const retained: string[] = [];
    const notes: JsonRecord = {};

    // Revoke sessions and block access immediately.
    for (const session of [...this.repositories.devSessions.values()]) {
      if (session.userId === userId) this.repositories.devSessions.delete(session.tokenHash);
    }
    const user = this.repositories.users.get(userId);
    if (user) {
      user.status = "deleted";
      user.deletedAt = now;
    }

    // Tombstone projects, artifacts, journeys, proofs and delete objects.
    for (const project of this.repositories.projects.values()) {
      if (project.ownerUserId === userId && !project.deletedAt) project.deletedAt = now;
    }
    let deletedObjects = 0;
    for (const artifact of this.repositories.artifacts.values()) {
      if (artifact.ownerUserId !== userId || artifact.deletedAt) continue;
      artifact.deletedAt = now;
      if (artifact.storageObjectKey) {
        // Object deletions are best-effort inside the transaction; a sweeper
        // job can retry any stragglers keyed by the receipt.
        void this.objectStorage.deleteObject(artifact.storageObjectKey);
        deletedObjects += 1;
      }
    }
    for (const chunk of this.repositories.chunks.values()) {
      if (chunk.ownerUserId === userId && !chunk.deletedAt) chunk.deletedAt = now;
    }
    for (const journey of this.repositories.journeys.values()) {
      if (journey.ownerUserId !== userId || journey.deletedAt) continue;
      journey.status = "deleted";
      journey.deletedAt = now;
    }
    for (const proof of this.repositories.proofs.values()) {
      if (proof.ownerUserId === userId && !proof.deletedAt) proof.deletedAt = now;
    }

    // Detailed footprint is erased; personalization is switched off.
    let deletedEvents = 0;
    for (const event of [...this.repositories.footprintEvents.values()]) {
      if (event.userId !== userId) continue;
      this.repositories.footprintEvents.delete(event.id);
      deletedEvents += 1;
    }
    this.repositories.personalizations.delete(userId);
    if (this.footprintConsentGranted(userId)) {
      this.setConsentRecord(userId, "personalization_footprint", "denied", PRIVACY_VERSION, "privacy_deletion");
    }

    // Anonymize profile/identity PII; keep pseudonymous references.
    const profile = this.repositories.profiles.get(userId);
    if (profile) {
      profile.displayName = "Người dùng đã xóa";
      profile.selfDeclaredHeadline = null;
      profile.version += 1;
    }
    for (const link of this.repositories.identityLinks.values()) {
      if (link.userId === userId) link.emailAtLink = null;
    }

    // Modules lose owner attribution; reviewed drafts are hidden again.
    let hiddenModuleVersions = 0;
    for (const module of this.repositories.modules.values()) {
      if (module.ownerUserId !== userId) continue;
      module.ownerUserId = null;
      module.attributionSnapshot = { displayName: "Người dùng đã xóa", deleted: true };
    }
    for (const version of this.repositories.moduleVersions.values()) {
      if (version.createdByUserId !== userId) continue;
      version.createdByUserId = null;
      if (version.visibility === "internal_reviewed") {
        version.visibility = "private";
        hiddenModuleVersions += 1;
      }
    }

    // XP ledger, audit logs and data-request receipts stay per retention
    // schedule (pseudonymous once the account row is tombstoned).
    retained.push("xp_ledger_entries", "audit_logs", "data_request_receipts");
    notes.retentionPolicy =
      "XP ledger/audit kept pseudonymous per P03 retention (24 months Alpha audit); backups expire within their cycle.";

    return {
      kind: "delete_account",
      policyVersion: PRIVACY_VERSION,
      tombstonedAt: now,
      deletedFootprintEvents: deletedEvents,
      deletedObjects,
      hiddenModuleVersions,
      retained,
      ...notes,
    };
  }

  private requireOwnedProject(actor: Actor, projectId: string): ProjectRecord {
    const project = this.repositories.projects.get(projectId);
    if (!project || project.ownerUserId !== actor.userId || project.deletedAt) throw notFound();
    return project;
  }

  private projectArtifacts(projectId: string): ArtifactRecord[] {
    return [...this.repositories.artifacts.values()]
      .filter((artifact) => artifact.projectId === projectId && !artifact.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private latestSearch(projectId: string): SearchAttemptRecord | undefined {
    return [...this.repositories.searchAttempts.values()]
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  private latestBrewJob(projectId: string): (JobRecord & { brew: { projectId: string; searchAttemptId: string; resultModuleVersionId: string | null } }) | undefined {
    const brew = [...this.repositories.brewJobs.values()]
      .filter((item) => item.projectId === projectId)
      .map((item) => ({ brew: item, job: this.repositories.jobs.get(item.jobId) }))
      .filter((item): item is { brew: NonNullable<typeof item.brew>; job: JobRecord } => Boolean(item.job))
      .sort((a, b) => b.job.createdAt.localeCompare(a.job.createdAt))[0];
    return brew ? { ...brew.job, brew: brew.brew } : undefined;
  }

  private latestCandidateSet(projectId: string): CandidateSetRecord | undefined {
    return [...this.repositories.candidateSets.values()]
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  private projectStatusAndNextAction(project: ProjectRecord): { status: string; nextAction: string } {
    if (project.deletedAt) return { status: "deleted", nextAction: "none" };
    if (project.archivedAt) return { status: "archived", nextAction: "none" };
    const artifacts = this.projectArtifacts(project.id);
    const usable = artifacts.filter(
      (artifact) => artifact.safetyStatus === "allowed" && ["ready", "partial", "metadata_only"].includes(artifact.extractionStatus),
    );
    const latestSearch = this.latestSearch(project.id);
    const latestBrew = this.latestBrewJob(project.id);
    const candidateSet = this.latestCandidateSet(project.id);
    const activeJourney = [...this.repositories.journeys.values()].find(
      (journey) => journey.projectId === project.id && journey.ownerUserId === project.ownerUserId && journey.status === "active" && !journey.deletedAt,
    );
    const completedJourney = [...this.repositories.journeys.values()].find(
      (journey) => journey.projectId === project.id && journey.ownerUserId === project.ownerUserId && journey.status === "completed" && !journey.deletedAt,
    );

    if (artifacts.length > 0 && usable.length === 0 && artifacts.every((artifact) => ["blocked", "failed_terminal", "unsupported"].includes(artifact.extractionStatus))) {
      return { status: "blocked", nextAction: "fix_artifact" };
    }
    if (
      artifacts.some((artifact) => ["queued", "processing"].includes(artifact.extractionStatus)) ||
      latestSearch?.status === "queued" || latestSearch?.status === "running" ||
      (latestBrew && ["queued", "running"].includes(latestBrew.status))
    ) {
      return { status: "processing", nextAction: "wait_for_processing" };
    }
    if (latestSearch?.verdict === "needs_clarification") return { status: "needs_decision", nextAction: "answer_clarification" };
    if (latestSearch?.verdict === "blocked_by_policy") return { status: "blocked", nextAction: "fix_artifact" };
    if (activeJourney) return { status: "learning", nextAction: "continue_journey" };
    if (completedJourney) return { status: "learning", nextAction: "review_proof" };
    if (candidateSet && ["ready", "ready_with_shortfall"].includes(candidateSet.status)) {
      return { status: "ready", nextAction: "choose_learning_path" };
    }
    if (latestSearch && ["missing", "related"].includes(latestSearch.verdict ?? "")) {
      return { status: "needs_decision", nextAction: "confirm_brew" };
    }
    return { status: "draft", nextAction: "add_input" };
  }

  private projectDto(project: ProjectRecord): JsonRecord {
    const { status } = this.projectStatusAndNextAction(project);
    return {
      id: project.id,
      title: project.title,
      goal: project.goal,
      status,
      visibility: "private",
      learningMode: project.learningMode,
      depth: project.depth,
      timeBudgetMinutes: project.timeBudgetMinutes,
      locale: project.locale,
      version: project.version,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private artifactDto(artifact: ArtifactRecord): JsonRecord {
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      kind: artifact.kind,
      displayName: artifact.displayName,
      originUri: artifact.originUri,
      extractionStatus: artifact.extractionStatus,
      safetyStatus: artifact.safetyStatus,
      coverage: { ...artifact.coverage },
      createdAt: artifact.createdAt,
      version: artifact.version,
    };
  }

  private artifactChunks(artifactId: string): ChunkRecord[] {
    return [...this.repositories.chunks.values()]
      .filter((chunk) => chunk.artifactId === artifactId && !chunk.deletedAt)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  private removeArtifactChunks(artifactId: string): void {
    for (const chunk of this.artifactChunks(artifactId)) this.repositories.chunks.delete(chunk.id);
  }

  private createJob(input: {
    actor: Actor;
    jobType: string;
    aggregateType: string;
    aggregateId: string;
    idempotencyKey?: string;
    inputFingerprint?: string;
    payload?: JsonRecord;
    estimatedCostUnits?: number;
  }): JobRecord {
    const job: JobRecord = {
      id: createId("job"),
      jobType: input.jobType,
      ownerUserId: input.actor.userId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      status: "queued",
      currentStep: null,
      idempotencyKey: input.idempotencyKey ?? createOpaqueToken(18),
      inputFingerprint: input.inputFingerprint ?? stableHash(input.payload ?? {}),
      attemptCount: 0,
      maxAttempts: 3,
      estimatedCostUnits: input.estimatedCostUnits ?? 0,
      actualCostUnits: 0,
      failureCode: null,
      retryable: false,
      availableAt: this.now(),
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: this.now(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      payload: input.payload ?? {},
    };
    this.repositories.jobs.set(job.id, job);
    return job;
  }

  private retryDelayMs(job: JobRecord): number {
    const exponent = Math.max(0, Math.min(5, job.attemptCount - 1));
    return Math.min(15 * 60_000, 30_000 * 2 ** exponent);
  }

  private startJob(job: JobRecord, step: string): void {
    if (job.status !== "running") {
      job.attemptCount += 1;
      job.startedAt = this.now();
    }
    job.status = "running";
    job.currentStep = step;
    job.completedAt = null;
    job.cancelledAt = null;
  }

  private succeedJob(job: JobRecord, step: string | null = null): void {
    job.status = "succeeded";
    job.currentStep = step;
    job.completedAt = this.now();
    job.failureCode = null;
    job.retryable = false;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
  }

  private failJob(job: JobRecord, failureCode: string, retryable: boolean, step: string | null = null): void {
    const canRetry = retryable && job.attemptCount < job.maxAttempts;
    job.status = canRetry ? "failed_retryable" : "failed_terminal";
    job.currentStep = step;
    job.completedAt = canRetry ? null : this.now();
    job.availableAt = canRetry
      ? new Date(this.clock().getTime() + this.retryDelayMs(job)).toISOString()
      : this.now();
    job.failureCode = failureCode;
    job.retryable = canRetry;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
  }

  private jobDto(job: JobRecord): JsonRecord {
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      currentStep: job.currentStep,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      availableAt: job.availableAt,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failureCode: job.failureCode,
      retryable: job.retryable,
    };
  }

  private async brewJobDto(jobId: string): Promise<JsonRecord> {
    const job = this.repositories.jobs.get(jobId);
    const brew = this.repositories.brewJobs.get(jobId);
    if (!job || !brew) throw notFound();
    const { windowStart, windowEnd } = utcDayWindow(this.clock());
    const usedToday = await this.repositories.targetedQueries.sumActiveQuotaUnits({
      userId: job.ownerUserId,
      quotaKey: "brew_per_day",
      windowStart,
      windowEnd,
    });
    return {
      ...this.jobDto(job),
      projectId: brew.projectId,
      searchAttemptId: brew.searchAttemptId,
      resultModuleVersionId: brew.resultModuleVersionId,
      ...(Array.isArray(job.payload.clarificationQuestions)
        ? { clarificationQuestions: job.payload.clarificationQuestions }
        : {}),
      quota: {
        usedToday,
        dailyLimit: this.quotas.brewPerDay,
      },
    };
  }

  /**
   * Persistent kill switch (P05-R1.6): the feature_flags row is checked
   * in-memory inside the Unit of Work and fails closed — a row explicitly
   * disabled in the database stops the guarded operation even when process
   * flags still allow it. A missing row means "no persistent switch", so the
   * process/env flags remain the default layer.
   */
  private persistentKillSwitchActive(key: string): boolean {
    const flag = this.repositories.featureFlags.get(key);
    return Boolean(flag && !flag.enabled);
  }

  private async enforceArtifactQuota(actor: Actor): Promise<void> {
    const { windowStart, windowEnd } = utcDayWindow(this.clock());
    const reservation = await this.repositories.targetedQueries.reserveQuotaUnits({
      userId: actor.userId,
      quotaKey: "artifact_per_day",
      windowStart,
      windowEnd,
      units: 1,
      limit: this.quotas.artifactProcessingPerDay,
      mode: "consume",
      createdAt: this.now(),
    });
    if (!reservation.reserved) {
      throw quotaExceeded(`Private Alpha cho phép tối đa ${this.quotas.artifactProcessingPerDay} artifact xử lý/người/ngày.`);
    }
  }

  /**
   * Per-user rate-limit + flood-guard admission (P05-R1.10). Sits in front of
   * the R1.6 quotas: quotas bound *what* a user may do per window; the token
   * bucket and flood guard bound *how fast* they may ask. Idempotent replays
   * are exempt inside the controller, so a retry storm cannot self-lockout.
   */
  private async enforceUserRateLimit(
    actor: Actor,
    actionClass: "read" | "write",
    idempotencyKey?: string,
  ): Promise<void> {
    const decision = await this.abuseController.admit({
      scope: "user",
      subject: actor.userId,
      actionClass,
      idempotencyKey: idempotencyKey ?? null,
    });
    if (!decision.allowed) throw rateLimited(decision.detail, decision.retryAfterSeconds);
  }

  /**
   * Budget alert hooks (P05-R1.10): each crossed threshold of the AI-cost
   * budget is claimed exactly once in distributed state, then emitted to the
   * outbox (`guardrail.budget_alert`) and the optional ops sink. Sink failures
   * never break the learning flow.
   */
  private async checkBudgetAlerts(input: {
    userId: string;
    quotaKey: string;
    windowStart: string;
    windowEnd: string;
    limitUnits: number;
    usedUnits: number;
  }): Promise<void> {
    const alerts = await this.abuseController.collectBudgetAlerts(input);
    for (const alert of alerts) {
      this.emit({ userId: alert.userId }, "guardrail.budget_alert", "user", alert.userId, {
        quotaKey: alert.quotaKey,
        windowStart: alert.windowStart,
        windowEnd: alert.windowEnd,
        thresholdPct: alert.thresholdPct,
        limitUnits: alert.limitUnits,
        usedUnits: alert.usedUnits,
      });
      if (!this.budgetAlertSink) continue;
      try {
        await this.budgetAlertSink(alert);
      } catch {
        console.error(
          JSON.stringify({
            level: "error",
            event: "budget_alert_sink_failed",
            quotaKey: alert.quotaKey,
            thresholdPct: alert.thresholdPct,
          }),
        );
      }
    }
  }

  /** Shared fail-closed block path for content-safety rejections (P05-R1.8). */
  private blockArtifact(actor: Actor, artifact: ArtifactRecord, failureCode: string): void {
    artifact.safetyStatus = "blocked";
    artifact.extractionStatus = "blocked";
    artifact.failureCode = failureCode;
    artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 };
    this.emit(actor, "artifact.blocked", "source_artifact", artifact.id, { failureCode });
  }

  private async processTextArtifact(actor: Actor, artifact: ArtifactRecord, text: string): Promise<void> {
    const safety = this.contentSafetyScanner.scan({
      kind: artifact.kind,
      bytes: null,
      sourceText: text,
      originUri: artifact.originUri,
    });
    if (safety.status === "blocked") {
      this.blockArtifact(actor, artifact, safety.reasonCodes[0] ?? "ARTIFACT_CONTENT_BLOCKED");
      return;
    }
    const job = this.createJob({
      actor,
      jobType: "artifact_extract",
      aggregateType: "source_artifact",
      aggregateId: artifact.id,
      payload: { artifactId: artifact.id, pipelineVersion: "extract-text-v1" },
    });
    this.startJob(job, "extract_text");
    artifact.extractionStatus = "processing";
    artifact.safetyStatus = "allowed";
    artifact.sourceText = text;

    try {
      this.removeArtifactChunks(artifact.id);
      const drafts = chunkText(text);
      if (drafts.length === 0) throw new Error("EMPTY_TEXT");
      for (const [index, draft] of drafts.entries()) {
        const embedding = await this.embeddingProvider.embed(draft.text);
        const chunk: ChunkRecord = {
          id: createId("evt"),
          ownerUserId: artifact.ownerUserId,
          sourceType: "source_artifact",
          sourceId: artifact.id,
          artifactId: artifact.id,
          moduleVersionId: null,
          ordinal: index,
          text: draft.text,
          locator: draft.locator,
          language: "vi",
          tokenCount: draft.tokenCount,
          contentSha256: sha256Hex(draft.text),
          embedding: embedding.vector,
          embeddingProfile: embedding.profile,
          providerModel: embedding.providerModel,
          weight: 1,
          deletedAt: null,
        };
        this.repositories.chunks.set(chunk.id, chunk);
      }
      artifact.extractionStatus = "ready";
      artifact.failureCode = null;
      artifact.coverage = {
        hasMetadata: true,
        hasText: true,
        hasTranscript: false,
        chunkCount: drafts.length,
      };
      this.succeedJob(job, "ready");
      this.emit(actor, "artifact.extraction.completed", "source_artifact", artifact.id, {
        extractionStatus: artifact.extractionStatus,
        chunkCount: drafts.length,
      }, job.id);
    } catch {
      artifact.extractionStatus = "failed_retryable";
      artifact.failureCode = "ARTIFACT_EXTRACTION_FAILED";
      artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 };
      this.failJob(job, "ARTIFACT_EXTRACTION_FAILED", true, "extract_text");
    }
  }

  private async processUrlArtifact(actor: Actor, artifact: ArtifactRecord, parsedUrl: URL): Promise<void> {
    const safety = this.contentSafetyScanner.scan({
      kind: artifact.kind,
      bytes: null,
      sourceText: `${artifact.displayName} ${parsedUrl.toString()}`,
      originUri: artifact.originUri,
    });
    if (safety.status === "blocked") {
      this.blockArtifact(actor, artifact, safety.reasonCodes[0] ?? "ARTIFACT_CONTENT_BLOCKED");
      return;
    }

    // Optional SSRF-safe content fetch (P05-R1.8). When no fetcher is wired
    // (VS1 default) the artifact stays metadata-only. Blocked/restricted
    // responses fail closed; transport errors fall back to metadata so the
    // link artifact remains usable as evidence.
    if (this.urlFetcher) {
      try {
        const fetched = await this.urlFetcher.fetchContent(parsedUrl.toString());
        const text = fetched.bytes.toString("utf-8").slice(0, MAX_TEXT_ARTIFACT_CHARS);
        const contentSafety = this.contentSafetyScanner.scan({
          kind: artifact.kind,
          bytes: fetched.bytes.subarray(0, 4096),
          sourceText: text.slice(0, 64 * 1024),
          originUri: artifact.originUri,
        });
        if (contentSafety.status === "blocked") {
          this.blockArtifact(actor, artifact, contentSafety.reasonCodes[0] ?? "ARTIFACT_CONTENT_BLOCKED");
          return;
        }
        await this.processTextArtifact(actor, artifact, text);
        return;
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code: unknown }).code)
            : "";
        if (["ARTIFACT_URL_BLOCKED", "URL_ACCESS_RESTRICTED", "URL_CONTENT_TYPE_BLOCKED"].includes(code)) {
          this.blockArtifact(actor, artifact, code);
          return;
        }
        // Transport/size/rate failures: keep the metadata-only path below.
      }
    }

    const job = this.createJob({
      actor,
      jobType: "artifact_extract",
      aggregateType: "source_artifact",
      aggregateId: artifact.id,
      payload: { artifactId: artifact.id, pipelineVersion: "extract-url-metadata-v1" },
    });
    this.startJob(job, "metadata_only");
    artifact.safetyStatus = "allowed";
    artifact.extractionStatus = "metadata_only";
    artifact.failureCode = null;

    const metadataText = `${artifact.displayName} ${parsedUrl.hostname} ${decodeURIComponent(parsedUrl.pathname).replace(/[/_-]+/g, " ")}`;
    try {
      this.removeArtifactChunks(artifact.id);
      const embedding = await this.embeddingProvider.embed(metadataText);
      const chunk: ChunkRecord = {
        id: createId("evt"),
        ownerUserId: artifact.ownerUserId,
        sourceType: "source_artifact",
        sourceId: artifact.id,
        artifactId: artifact.id,
        moduleVersionId: null,
        ordinal: 0,
        text: metadataText,
        locator: "metadata-only",
        language: "vi",
        tokenCount: tokenize(metadataText, { keepStopwords: true }).length,
        contentSha256: sha256Hex(metadataText),
        embedding: embedding.vector,
        embeddingProfile: embedding.profile,
        providerModel: embedding.providerModel,
        weight: 0.25,
        deletedAt: null,
      };
      this.repositories.chunks.set(chunk.id, chunk);
      artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 1 };
      this.succeedJob(job, "metadata_only");
      this.emit(actor, "artifact.extraction.completed", "source_artifact", artifact.id, {
        extractionStatus: "metadata_only",
        chunkCount: 1,
      }, job.id);
    } catch {
      artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 };
      this.failJob(job, "ARTIFACT_EMBED_FAILED", true, "metadata_only");
    }
  }

  async createProject(
    actor: Actor,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const body = ensureRecord(bodyValue);
    const prompt = requiredString(body, "prompt", { minLength: 1, maxLength: 20_000 });
    const goal = requiredString(body, "goal", { minLength: 1, maxLength: 500 });
    const learningMode = requiredEnum(body, "learningMode", LEARNING_MODES);
    const title = optionalString(body, "title", { maxLength: 200 }) ?? truncateText(prompt.split("\n")[0], 110);
    const depth = optionalEnum(body, "depth", ["intro", "standard", "deep"] as const, "standard");
    const timeBudgetMinutes = optionalInteger(body, "timeBudgetMinutes", { min: 1, max: 600, defaultValue: 30 });
    const locale = optionalString(body, "locale", { maxLength: 20, defaultValue: "vi-VN" }) ?? "vi-VN";
    const payload = { prompt, goal, learningMode, title, depth, timeBudgetMinutes, locale };

    const replay = this.findIdempotentReplay(actor, "createProject", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.projects.get(replay.resourceId);
      if (existing) return { data: this.projectDto(existing), status: 201, replay: true };
    }

    await this.enforceArtifactQuota(actor);
    const now = this.now();
    const artifactId = createId("art");
    const project: ProjectRecord = {
      id: createId("prj"),
      ownerUserId: actor.userId,
      title,
      goal,
      rawPromptArtifactId: artifactId,
      learningMode,
      depth,
      timeBudgetMinutes,
      locale,
      currentSearchAttemptId: null,
      currentBrewJobId: null,
      currentCandidateSetId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    };
    const artifact: ArtifactRecord = {
      id: artifactId,
      projectId: project.id,
      ownerUserId: actor.userId,
      kind: "text",
      originUri: null,
      displayName: truncateText(prompt, 120),
      sourcePlatform: null,
      storageObjectKey: null,
      declaredMimeType: "text/plain",
      detectedMimeType: "text/plain",
      byteSize: Buffer.byteLength(prompt, "utf8"),
      sha256: sha256Hex(prompt),
      rightsBasis: "created_by_user",
      rightsNote: null,
      sourceText: prompt,
      safetyStatus: "pending_scan",
      extractionStatus: "queued",
      failureCode: null,
      coverage: { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 },
      createdAt: now,
      deletedAt: null,
      version: 1,
    };

    this.repositories.projects.set(project.id, project);
    this.repositories.artifacts.set(artifact.id, artifact);
    await this.processTextArtifact(actor, artifact, prompt);
    project.updatedAt = this.now();
    this.emit(actor, "project.created", "learning_project", project.id, { learningMode, depth, timeBudgetMinutes });
    this.saveIdempotentResult(actor, "createProject", options.idempotencyKey, payload, "learning_project", project.id, 201);
    return { data: this.projectDto(project), status: 201 };
  }

  listProjects(actor: Actor, query: { limit?: number; cursor?: string; search?: string; status?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const search = query.search ? normalizeForSearch(query.search) : "";
    const all = [...this.repositories.projects.values()]
      .filter((project) => project.ownerUserId === actor.userId && !project.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter((project) => {
        const dto = this.projectDto(project);
        const matchesSearch = !search || normalizeForSearch(`${project.title} ${project.goal}`).includes(search);
        const matchesStatus = !query.status || dto.status === query.status;
        return matchesSearch && matchesStatus;
      });
    return this.paginate(all, query.limit ?? 20, query.cursor, (project) => ({
      ...this.projectDto(project),
      artifactCount: this.projectArtifacts(project.id).length,
      nextAction: this.projectStatusAndNextAction(project).nextAction,
    }));
  }

  private paginate<T>(items: T[], limit: number, cursor: string | undefined, map: (item: T) => JsonRecord): { data: JsonRecord[]; page: JsonRecord } {
    let offset = 0;
    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
        if (!Number.isInteger(parsed.offset) || (parsed.offset as number) < 0) throw new Error("invalid");
        offset = parsed.offset as number;
      } catch {
        throw validationError("Cursor phân trang không hợp lệ.");
      }
    }
    const slice = items.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    return {
      data: slice.map(map),
      page: {
        nextCursor: nextOffset < items.length ? Buffer.from(JSON.stringify({ offset: nextOffset }), "utf8").toString("base64url") : null,
        hasMore: nextOffset < items.length,
      },
    };
  }

  getProject(actor: Actor, projectId: string): JsonRecord {
    this.requireActiveUser(actor);
    return this.projectDto(this.requireOwnedProject(actor, projectId));
  }

  async getProjectWorkspace(actor: Actor, projectId: string): Promise<JsonRecord> {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    const { nextAction } = this.projectStatusAndNextAction(project);
    const latestSearch = this.latestSearch(project.id);
    const latestBrew = this.latestBrewJob(project.id);
    const candidateSet = this.latestCandidateSet(project.id);
    const hasJourney = [...this.repositories.journeys.values()].some((journey) => journey.projectId === project.id && !journey.deletedAt);
    const hasProof = [...this.repositories.proofs.values()].some((proof) => {
      const journey = proof.journeyId ? this.repositories.journeys.get(proof.journeyId) : undefined;
      return journey?.projectId === project.id && !proof.deletedAt;
    });

    return {
      project: this.projectDto(project),
      stepper: [
        { key: "input", status: this.projectArtifacts(project.id).length > 0 ? "completed" : "in_progress" },
        {
          key: "search_brew",
          status: latestSearch?.status === "completed"
            ? latestSearch.verdict === "needs_clarification"
              ? "needs_decision"
              : "completed"
            : latestBrew
              ? "in_progress"
              : "not_started",
        },
        { key: "outputs", status: candidateSet ? "completed" : "not_started" },
        { key: "journey", status: hasJourney ? "in_progress" : "not_started" },
        { key: "proof", status: hasProof ? "completed" : "not_started" },
      ],
      nextAction,
      artifacts: this.projectArtifacts(project.id).map((artifact) => this.artifactDto(artifact)),
      latestSearch: latestSearch ? this.searchAttemptDto(latestSearch) : null,
      latestBrewJob: latestBrew ? await this.brewJobDto(latestBrew.id) : null,
    };
  }

  async addProjectArtifact(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const project = this.requireOwnedProject(actor, projectId);
    const body = ensureRecord(bodyValue);
    const kind = requiredEnum(body, "kind", ["text", "website_url", "youtube_url", "facebook_url"] as const);
    const rightsBasis = requiredEnum(body, "rightsBasis", RIGHTS_BASES);
    const rightsNote = optionalString(body, "rightsNote", { maxLength: 500 }) ?? null;
    const displayNameInput = optionalString(body, "displayName", { maxLength: 300 });
    const payload = { projectId, kind, rightsBasis, rightsNote, displayName: displayNameInput, text: body.text, uri: body.uri };

    const replay = this.findIdempotentReplay(actor, "addProjectArtifact", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.artifacts.get(replay.resourceId);
      if (existing) return { data: this.artifactDto(existing), status: 200, replay: true };
    }

    await this.enforceArtifactQuota(actor);
    const now = this.now();

    if (kind === "text") {
      const text = requiredString(body, "text", { minLength: 1, maxLength: MAX_TEXT_ARTIFACT_CHARS, trim: false });
      const artifact: ArtifactRecord = {
        id: createId("art"),
        projectId: project.id,
        ownerUserId: actor.userId,
        kind,
        originUri: null,
        displayName: displayNameInput ?? truncateText(text, 120),
        sourcePlatform: null,
        storageObjectKey: null,
        declaredMimeType: "text/plain",
        detectedMimeType: "text/plain",
        byteSize: Buffer.byteLength(text, "utf8"),
        sha256: sha256Hex(text),
        rightsBasis,
        rightsNote,
        sourceText: text,
        safetyStatus: "pending_scan",
        extractionStatus: "queued",
        failureCode: null,
        coverage: { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 },
        createdAt: now,
        deletedAt: null,
        version: 1,
      };
      this.repositories.artifacts.set(artifact.id, artifact);
      await this.processTextArtifact(actor, artifact, text);
      project.updatedAt = this.now();
      this.emit(actor, "artifact.created", "source_artifact", artifact.id, { projectId: project.id, kind });
      this.saveIdempotentResult(actor, "addProjectArtifact", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
      return { data: this.artifactDto(artifact), status: 202 };
    }

    const uri = requiredString(body, "uri", { maxLength: 4096 });
    const parsed = assertPublicHttpUrl(uri);
    const actualKind = classifyUrlKind(uri);
    if (actualKind !== kind) {
      throw unprocessable(
        "ARTIFACT_KIND_MISMATCH",
        "Loại URL không khớp nền tảng",
        `URL này thuộc loại ${actualKind}; hãy chọn đúng loại để GON không hứa sai mức trích xuất.`,
      );
    }
    const urlCount = this.projectArtifacts(project.id).filter((artifact) => artifact.originUri).length;
    if (urlCount >= MAX_URLS_PER_PROJECT) {
      throw quotaExceeded(`Mỗi project VS1 chỉ nhận tối đa ${MAX_URLS_PER_PROJECT} URL.`);
    }

    const artifact: ArtifactRecord = {
      id: createId("art"),
      projectId: project.id,
      ownerUserId: actor.userId,
      kind,
      originUri: parsed.toString(),
      displayName: displayNameInput ?? truncateText(`${parsed.hostname}${parsed.pathname}`, 180),
      sourcePlatform: kind === "youtube_url" ? "youtube" : kind === "facebook_url" ? "facebook" : "website",
      storageObjectKey: null,
      declaredMimeType: null,
      detectedMimeType: null,
      byteSize: null,
      sha256: sha256Hex(parsed.toString()),
      rightsBasis,
      rightsNote,
      sourceText: null,
      safetyStatus: "pending_scan",
      extractionStatus: "queued",
      failureCode: null,
      coverage: { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 },
      createdAt: now,
      deletedAt: null,
      version: 1,
    };
    this.repositories.artifacts.set(artifact.id, artifact);
    await this.processUrlArtifact(actor, artifact, parsed);
    project.updatedAt = this.now();
    this.emit(actor, "artifact.created", "source_artifact", artifact.id, { projectId: project.id, kind });
    this.saveIdempotentResult(actor, "addProjectArtifact", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
    return { data: this.artifactDto(artifact), status: 202 };
  }

  listProjectArtifacts(actor: Actor, projectId: string): JsonRecord[] {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    return this.projectArtifacts(project.id).map((artifact) => this.artifactDto(artifact));
  }

  private requireOwnedArtifact(actor: Actor, artifactId: string): ArtifactRecord {
    const artifact = this.repositories.artifacts.get(artifactId);
    if (!artifact || artifact.ownerUserId !== actor.userId || artifact.deletedAt) throw notFound();
    return artifact;
  }

  getArtifact(actor: Actor, artifactId: string): JsonRecord {
    this.requireActiveUser(actor);
    return this.artifactDto(this.requireOwnedArtifact(actor, artifactId));
  }

  async deleteArtifact(actor: Actor, artifactId: string): Promise<void> {
    this.requireActiveUser(actor);
    const artifact = this.requireOwnedArtifact(actor, artifactId);
    artifact.deletedAt = this.now();
    artifact.version += 1;
    this.removeArtifactChunks(artifact.id);
    if (artifact.storageObjectKey) {
      // Object stores cannot join the database transaction. Deleting bytes
      // before commit fails toward privacy; a rollback can leave metadata
      // pointing to a missing object, and the idempotent delete can be
      // retried. A durable deletion job remains a later hardening item.
      await this.objectStorage.deleteObject(artifact.storageObjectKey);
    }
    artifact.sourceText = null;
    const project = this.repositories.projects.get(artifact.projectId);
    if (project) project.updatedAt = this.now();
    this.emit(actor, "artifact.deleted", "source_artifact", artifact.id, { projectId: artifact.projectId });
    this.Audit(actor, "artifact.deleted", "source_artifact", artifact.id);
  }

  async retryArtifactProcessing(actor: Actor, artifactId: string): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write");
    const artifact = this.requireOwnedArtifact(actor, artifactId);
    if (artifact.extractionStatus !== "failed_retryable") {
      throw conflict("INVALID_STATE_TRANSITION", "Artifact không ở trạng thái retryable", "Chỉ artifact lỗi tạm thời mới được xử lý lại.");
    }
    if (artifact.kind === "text" && artifact.sourceText) {
      await this.processTextArtifact(actor, artifact, artifact.sourceText);
    } else if (artifact.originUri) {
      await this.processUrlArtifact(actor, artifact, new URL(artifact.originUri));
    } else if (artifact.storageObjectKey) {
      const object = await this.objectStorage.getObject(artifact.storageObjectKey, {
        maxBytes: MAX_DOCUMENT_BYTES,
      });
      if (!object) throw notFound("Object của artifact không còn tồn tại.");
      await this.processUploadedObject(actor, artifact, object.bytes);
    }
    return { data: this.artifactDto(artifact), status: 202 };
  }

  async initiateArtifactUpload(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string; baseUrl?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const project = this.requireOwnedProject(actor, projectId);
    const body = ensureRecord(bodyValue);
    const kind = requiredEnum(body, "kind", ["file", "image"] as const);
    const fileName = requiredString(body, "fileName", { maxLength: 300 });
    const declaredMimeType = requiredString(body, "declaredMimeType", { maxLength: 120 }).toLocaleLowerCase();
    const byteSize = body.byteSize;
    if (!Number.isInteger(byteSize) || (byteSize as number) < 1) {
      throw validationError("byteSize phải là số nguyên dương.");
    }
    const sha256 = requiredString(body, "sha256", { minLength: 64, maxLength: 64 }).toLocaleLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw validationError("sha256 phải gồm 64 ký tự hex.");
    const rightsBasis = requiredString(body, "rightsBasis", { maxLength: 64 });
    if (!RIGHTS_BASES.includes(rightsBasis as (typeof RIGHTS_BASES)[number])) {
      throw validationError("rightsBasis không thuộc danh sách cho phép.");
    }
    validateUploadDeclaration({ kind, declaredMimeType, byteSize: byteSize as number });

    const payload = { projectId, kind, fileName, declaredMimeType, byteSize, sha256, rightsBasis };
    const replay = this.findIdempotentReplay(actor, "initiateArtifactUpload", options.idempotencyKey, payload);
    if (replay) {
      const session = this.repositories.uploadSessions.get(replay.resourceId);
      if (session) {
        throw conflict(
          "UPLOAD_SESSION_ALREADY_CREATED",
          "Upload session đã được tạo",
          "Token upload cũ không được phát lại; hãy tạo upload session mới nếu token đã mất/hết hạn.",
        );
      }
    }

    const existingFiles = this.projectArtifacts(project.id).filter((artifact) => artifact.kind === "file" || artifact.kind === "image");
    if (existingFiles.length >= MAX_FILES_PER_PROJECT) throw quotaExceeded(`Mỗi project VS1 chỉ nhận tối đa ${MAX_FILES_PER_PROJECT} file/ảnh.`);
    const totalBytes = existingFiles.reduce((sum, artifact) => sum + (artifact.byteSize ?? 0), 0);
    if (totalBytes + (byteSize as number) > MAX_PROJECT_UPLOAD_BYTES) throw quotaExceeded("Tổng upload của project vượt 100 MB.");

    await this.enforceArtifactQuota(actor);
    const now = this.now();
    const artifact: ArtifactRecord = {
      id: createId("art"),
      projectId: project.id,
      ownerUserId: actor.userId,
      kind,
      originUri: null,
      displayName: fileName,
      sourcePlatform: null,
      storageObjectKey: null,
      declaredMimeType,
      detectedMimeType: null,
      byteSize: byteSize as number,
      sha256,
      rightsBasis,
      rightsNote: null,
      sourceText: null,
      safetyStatus: "pending_scan",
      extractionStatus: "queued",
      failureCode: null,
      coverage: { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 },
      createdAt: now,
      deletedAt: null,
      version: 1,
    };
    const safeFileName = fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 160) || "upload.bin";
    const objectKey = `private/${actor.userId}/${project.id}/${artifact.id}/${safeFileName}`;
    artifact.storageObjectKey = objectKey;

    const token = createOpaqueToken(32);
    const expiresAt = new Date(this.clock().getTime() + 15 * 60 * 1000).toISOString();
    const baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    const uploadPlan = await this.objectStorage.createSignedUpload({
      key: objectKey,
      contentType: declaredMimeType,
      byteSize: byteSize as number,
      sha256,
      expiresAt,
      localUpload: {
        url: `${baseUrl}/api/local-uploads/${artifact.id}`,
        token,
      },
    });
    this.repositories.artifacts.set(artifact.id, artifact);
    this.repositories.uploadSessions.set(artifact.id, {
      artifactId: artifact.id,
      projectId: project.id,
      ownerUserId: actor.userId,
      tokenHash: sha256Hex(token),
      objectKey,
      declaredMimeType,
      declaredByteSize: byteSize as number,
      declaredSha256: sha256,
      expiresAt,
      uploadedAt: null,
      actualByteSize: null,
      actualSha256: null,
      completedAt: null,
    });
    this.saveIdempotentResult(actor, "initiateArtifactUpload", options.idempotencyKey, payload, "upload_session", artifact.id, 201);

    return {
      status: 201,
      data: {
        artifactId: artifact.id,
        uploadUrl: uploadPlan.url,
        method: uploadPlan.method,
        headers: uploadPlan.headers,
        expiresAt: uploadPlan.expiresAt,
      },
    };
  }

  private requireLocalUploadSession(artifactId: string, token: string | null) {
    if (this.objectStorage.kind === "gcs") {
      // Direct-to-GCS uploads must not fall back to the process-local PUT
      // endpoint, even if a caller presents the otherwise-unused local
      // session token. The route authorizes before reading a body.
      throw notFound("Upload session không tồn tại.");
    }
    const session = this.repositories.uploadSessions.get(artifactId);
    const artifact = this.repositories.artifacts.get(artifactId);
    if (!session || !artifact || artifact.deletedAt) throw notFound("Upload session không tồn tại.");
    if (!token || !timingSafeStringEqual(sha256Hex(token), session.tokenHash)) {
      throw unauthorized("Token upload không hợp lệ.");
    }
    if (Date.parse(session.expiresAt) <= this.clock().getTime() || session.completedAt) {
      throw conflict("UPLOAD_SESSION_EXPIRED", "Upload session đã hết hạn hoặc hoàn tất", "Hãy khởi tạo upload session mới.");
    }
    return { session, artifact };
  }

  authorizeLocalUpload(artifactId: string, token: string | null): { artifactId: string; maxByteSize: number } {
    const { session } = this.requireLocalUploadSession(artifactId, token);
    return {
      artifactId,
      // Authorization happens before the HTTP adapter reads the body, so an
      // unauthenticated caller cannot force the process to buffer an upload.
      maxByteSize: Math.min(session.declaredByteSize, MAX_DOCUMENT_BYTES),
    };
  }

  async acceptLocalUpload(
    artifactId: string,
    token: string | null,
    bytes: Uint8Array,
    contentType: string | null,
  ): Promise<JsonRecord> {
    const { session } = this.requireLocalUploadSession(artifactId, token);
    const buffer = Buffer.from(bytes);
    if (buffer.length === 0) throw validationError("File upload rỗng.");
    if (buffer.length > session.declaredByteSize) {
      throw validationError("File thực tế lớn hơn kích thước đã khai báo cho upload session.");
    }
    const actualSha256 = sha256Hex(buffer);
    const stored = await this.objectStorage.putObject({
      key: session.objectKey,
      bytes: buffer,
      contentType: contentType ?? session.declaredMimeType,
      sha256: actualSha256,
    });
    if (stored.byteSize !== buffer.length) {
      throw serviceUnavailable(
        "OBJECT_STORAGE_SIZE_MISMATCH",
        "Object storage chưa xác nhận đúng upload",
        "Kích thước object storage xác nhận không khớp với bytes đã gửi; hãy thử upload lại.",
      );
    }
    session.uploadedAt = this.now();
    session.actualByteSize = buffer.length;
    session.actualSha256 = actualSha256;
    return {
      artifactId,
      byteSize: buffer.length,
      sha256: session.actualSha256,
    };
  }

  private async processUploadedObject(actor: Actor, artifact: ArtifactRecord, bytes: Buffer): Promise<void> {
    const safety = this.contentSafetyScanner.scan({
      kind: artifact.kind,
      bytes,
      sourceText: null,
      originUri: artifact.originUri,
    });
    if (safety.status === "blocked") {
      this.blockArtifact(actor, artifact, safety.reasonCodes[0] ?? "ARTIFACT_CONTENT_BLOCKED");
      return;
    }
    const detected = detectFile(bytes, artifact.declaredMimeType ?? "");
    artifact.detectedMimeType = detected.mimeType;

    const expectedImage = artifact.kind === "image";
    const detectedImage = ["png", "jpeg", "webp"].includes(detected.category);
    const expectedPdf = artifact.declaredMimeType === "application/pdf";
    const mismatch =
      (expectedImage && !detectedImage) ||
      (!expectedImage && detectedImage) ||
      (expectedPdf && detected.category !== "pdf") ||
      (!expectedPdf && detected.category === "pdf");

    if (detected.category === "unknown" || mismatch) {
      this.blockArtifact(
        actor,
        artifact,
        detected.category === "unknown" ? "ARTIFACT_TYPE_UNSUPPORTED" : "ARTIFACT_MIME_MISMATCH",
      );
      return;
    }

    artifact.safetyStatus = "allowed";
    if (detected.category === "text") {
      await this.processTextArtifact(actor, artifact, detected.text.slice(0, MAX_TEXT_ARTIFACT_CHARS));
      return;
    }
    if (detected.category === "pdf") {
      artifact.extractionStatus = "unsupported";
      artifact.failureCode = "PDF_TEXT_EXTRACTION_NOT_ENABLED";
      artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 };
      this.emit(actor, "artifact.extraction.completed", "source_artifact", artifact.id, {
        extractionStatus: "unsupported",
        chunkCount: 0,
      });
      return;
    }

    artifact.extractionStatus = "metadata_only";
    artifact.failureCode = "OCR_NOT_ENABLED";
    artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 };
    this.emit(actor, "artifact.extraction.completed", "source_artifact", artifact.id, {
      extractionStatus: "metadata_only",
      chunkCount: 0,
    });
  }

  async completeArtifactUpload(
    actor: Actor,
    projectId: string,
    artifactId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const project = this.requireOwnedProject(actor, projectId);
    const artifact = this.requireOwnedArtifact(actor, artifactId);
    if (artifact.projectId !== project.id) throw notFound();
    const session = this.repositories.uploadSessions.get(artifactId);
    if (!session) throw notFound("Upload session không tồn tại.");
    const body = bodyValue ? ensureRecord(bodyValue) : {};
    const payload = { projectId, artifactId, sha256: body.sha256, byteSize: body.byteSize };

    const replay = this.findIdempotentReplay(actor, "completeArtifactUpload", options.idempotencyKey, payload);
    if (replay || session.completedAt) return { data: this.artifactDto(artifact), status: 200, replay: true };
    const metadata = await this.objectStorage.headObject(session.objectKey);
    if (!metadata) {
      throw conflict("UPLOAD_NOT_RECEIVED", "Server chưa nhận object upload", "Hãy PUT file tới upload URL trước khi complete-upload.");
    }
    if (metadata.byteSize > MAX_DOCUMENT_BYTES) {
      artifact.safetyStatus = "blocked";
      artifact.extractionStatus = "blocked";
      artifact.failureCode = "ARTIFACT_TOO_LARGE";
      session.completedAt = this.now();
      this.saveIdempotentResult(actor, "completeArtifactUpload", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
      return { data: this.artifactDto(artifact), status: 202 };
    }
    if (
      !session.uploadedAt &&
      metadata.updatedAt &&
      Date.parse(metadata.updatedAt) > Date.parse(session.expiresAt)
    ) {
      throw conflict(
        "UPLOAD_SESSION_EXPIRED",
        "Upload session đã hết hạn",
        "Object được ghi sau thời hạn signed upload; hãy khởi tạo upload session mới.",
      );
    }

    const object = await this.objectStorage.getObject(session.objectKey, {
      maxBytes: MAX_DOCUMENT_BYTES,
    });
    if (!object) {
      throw conflict("UPLOAD_NOT_RECEIVED", "Server chưa nhận object upload", "Hãy PUT file tới upload URL trước khi complete-upload.");
    }
    const actualByteSize = object.bytes.length;
    const actualSha256 = sha256Hex(object.bytes);
    const previouslyAccepted =
      Boolean(session.uploadedAt) &&
      typeof session.actualByteSize === "number" &&
      typeof session.actualSha256 === "string";
    if (
      previouslyAccepted &&
      (session.actualByteSize !== actualByteSize || session.actualSha256 !== actualSha256)
    ) {
      artifact.safetyStatus = "blocked";
      artifact.extractionStatus = "blocked";
      artifact.failureCode = "ARTIFACT_HASH_OR_SIZE_MISMATCH";
      session.completedAt = this.now();
      this.saveIdempotentResult(actor, "completeArtifactUpload", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
      return { data: this.artifactDto(artifact), status: 202 };
    }
    if (!previouslyAccepted) {
      // Direct signed-storage uploads bypass GON's local PUT endpoint, so the
      // session learns the received size/hash only at completion. Recompute
      // both from bounded server-side bytes instead of trusting storage or
      // client metadata.
      session.uploadedAt =
        metadata.updatedAt && Number.isFinite(Date.parse(metadata.updatedAt))
          ? new Date(metadata.updatedAt).toISOString()
          : this.now();
      session.actualByteSize = actualByteSize;
      session.actualSha256 = actualSha256;
    }

    if (typeof body.sha256 === "string" && body.sha256.toLocaleLowerCase() !== actualSha256) {
      throw unprocessable("ARTIFACT_HASH_MISMATCH", "Hash file không khớp", "SHA-256 client gửi khi complete không khớp object server đã nhận.");
    }
    if (typeof body.byteSize === "number" && body.byteSize !== actualByteSize) {
      throw unprocessable("ARTIFACT_SIZE_MISMATCH", "Kích thước file không khớp", "Byte size client gửi khi complete không khớp object server đã nhận.");
    }
    if (actualSha256 !== session.declaredSha256 || actualByteSize !== session.declaredByteSize) {
      artifact.safetyStatus = "blocked";
      artifact.extractionStatus = "blocked";
      artifact.failureCode = "ARTIFACT_HASH_OR_SIZE_MISMATCH";
      session.completedAt = this.now();
      this.saveIdempotentResult(actor, "completeArtifactUpload", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
      return { data: this.artifactDto(artifact), status: 202 };
    }

    session.completedAt = this.now();
    artifact.byteSize = actualByteSize;
    artifact.sha256 = actualSha256;
    artifact.version += 1;
    await this.processUploadedObject(actor, artifact, object.bytes);
    project.updatedAt = this.now();
    this.emit(actor, "artifact.upload_completed", "source_artifact", artifact.id, {
      projectId: project.id,
      extractionStatus: artifact.extractionStatus,
    });
    this.saveIdempotentResult(actor, "completeArtifactUpload", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
    return { data: this.artifactDto(artifact), status: 202 };
  }

  private searchAttemptDto(record: SearchAttemptRecord): JsonRecord {
    return {
      id: record.id,
      projectId: record.projectId,
      status: record.status,
      verdict: record.verdict,
      matchedConcepts: record.matchedConcepts,
      missingConcepts: record.missingConcepts,
      clarificationQuestions: record.clarificationQuestions,
      results: record.results.map((result) => ({
        moduleVersionId: result.moduleVersionId,
        rank: result.rank,
        title: result.title,
        sourceStatus: result.sourceStatus,
        reasonCodes: result.reasonCodes,
        matchedConcepts: result.matchedConcepts,
        missingConcepts: result.missingConcepts,
      })),
    };
  }

  private visibleModuleVersions(actor: Actor): ModuleVersionRecord[] {
    return [...this.repositories.moduleVersions.values()].filter((version) => {
      if (["hidden", "retired"].includes(version.publicationStatus)) return false;
      return version.createdByUserId === actor.userId || version.publicationStatus === "internal_reviewed" || version.visibility === "internal_reviewed";
    });
  }

  private requireVisibleModuleVersion(actor: Actor, moduleVersionId: string): ModuleVersionRecord {
    const version = this.visibleModuleVersions(actor).find((item) => item.id === moduleVersionId);
    if (!version) throw notFound();
    return version;
  }

  private moduleChunks(moduleVersionId: string): ChunkRecord[] {
    return [...this.repositories.chunks.values()].filter((chunk) => chunk.moduleVersionId === moduleVersionId && !chunk.deletedAt);
  }

  private removeModuleChunks(moduleVersionId: string): void {
    for (const chunk of this.moduleChunks(moduleVersionId)) this.repositories.chunks.delete(chunk.id);
  }

  private topicIsBlocked(text: string): boolean {
    return BLOCKED_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
  }

  async createSearchAttempt(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const project = this.requireOwnedProject(actor, projectId);
    const body = bodyValue ? ensureRecord(bodyValue) : {};
    const requestedArtifactIds = stringArray(body, "artifactIds", { maxItems: 50 });
    const payload = { projectId, artifactIds: requestedArtifactIds };
    const replay = this.findIdempotentReplay(actor, "createSearchAttempt", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.searchAttempts.get(replay.resourceId);
      if (existing) return { data: this.searchAttemptDto(existing), status: 200, replay: true };
    }

    const { windowStart, windowEnd } = utcHourWindow(this.clock());
    const searchQuota = await this.repositories.targetedQueries.reserveQuotaUnits({
      userId: actor.userId,
      quotaKey: "search_per_hour",
      windowStart,
      windowEnd,
      units: 1,
      limit: this.quotas.searchPerHour,
      mode: "consume",
      createdAt: this.now(),
    });
    if (!searchQuota.reserved) {
      throw quotaExceeded(`Private Alpha cho phép tối đa ${this.quotas.searchPerHour} search attempts/người/giờ.`);
    }

    const allArtifacts = this.projectArtifacts(project.id);
    const selectedArtifacts = requestedArtifactIds.length > 0
      ? allArtifacts.filter((artifact) => requestedArtifactIds.includes(artifact.id))
      : allArtifacts;
    if (requestedArtifactIds.length > 0 && selectedArtifacts.length !== requestedArtifactIds.length) {
      throw notFound("Một hoặc nhiều artifact không thuộc project này.");
    }

    const attempt: SearchAttemptRecord = {
      id: createId("srch"),
      projectId: project.id,
      ownerUserId: actor.userId,
      status: "queued",
      verdict: null,
      artifactIds: selectedArtifacts.map((artifact) => artifact.id),
      artifactVersions: Object.fromEntries(selectedArtifacts.map((artifact) => [artifact.id, artifact.version])),
      contextSnapshot: {
        goal: project.goal,
        learningMode: project.learningMode,
        depth: project.depth,
        timeBudgetMinutes: project.timeBudgetMinutes,
        locale: project.locale,
        personalizationApplied: this.consentRecord(actor.userId, "personalization_footprint").status === "granted",
      },
      matchedConcepts: [],
      missingConcepts: [],
      clarificationQuestions: [],
      results: [],
      searchPolicyVersion: "search-policy-v0",
      embeddingProfile: EMBEDDING_PROFILE,
      latencyMs: null,
      createdAt: this.now(),
      completedAt: null,
    };
    this.repositories.searchAttempts.set(attempt.id, attempt);
    project.currentSearchAttemptId = attempt.id;

    const job = this.createJob({
      actor,
      jobType: "search_attempt",
      aggregateType: "search_attempt",
      aggregateId: attempt.id,
      idempotencyKey: options.idempotencyKey,
      payload: { projectId: project.id, artifactIds: attempt.artifactIds },
    });

    await this.processSearchAttempt(actor, attempt, job);
    if (attempt.status === "completed" && attempt.results.length > 0 && ["found", "related"].includes(attempt.verdict ?? "")) {
      await this.buildCandidateSet(actor, project, attempt, attempt.results);
    }
    project.updatedAt = this.now();
    this.saveIdempotentResult(actor, "createSearchAttempt", options.idempotencyKey, payload, "search_attempt", attempt.id, 202);
    return { data: this.searchAttemptDto(attempt), status: 202 };
  }

  private async processSearchAttempt(actor: Actor, attempt: SearchAttemptRecord, job: JobRecord): Promise<void> {
    const started = this.clock().getTime();
    attempt.status = "running";
    this.startJob(job, "hybrid_search");

    try {
      const project = this.requireOwnedProject(actor, attempt.projectId);
      const artifacts = attempt.artifactIds
        .map((artifactId) => this.repositories.artifacts.get(artifactId))
        .filter((artifact): artifact is ArtifactRecord => Boolean(artifact && !artifact.deletedAt));
      const blockedArtifacts = artifacts.filter((artifact) => artifact.safetyStatus === "blocked" || artifact.extractionStatus === "blocked");
      const usableArtifacts = artifacts.filter(
        (artifact) => artifact.safetyStatus === "allowed" && ["ready", "partial", "metadata_only"].includes(artifact.extractionStatus),
      );
      const queryChunks = usableArtifacts.flatMap((artifact) => this.artifactChunks(artifact.id));
      const queryText = [project.title, project.goal, ...queryChunks.map((chunk) => chunk.text)].join("\n").slice(0, 16_000);
      const meaningfulTokens = tokenize(`${project.title} ${project.goal} ${queryChunks.slice(0, 2).map((chunk) => chunk.text).join(" ")}`);

      if (this.topicIsBlocked(queryText) || (artifacts.length > 0 && usableArtifacts.length === 0 && blockedArtifacts.length > 0)) {
        attempt.verdict = "blocked_by_policy";
        attempt.status = "completed";
        attempt.completedAt = this.now();
        attempt.latencyMs = Math.max(0, this.clock().getTime() - started);
        this.succeedJob(job, "blocked_by_policy");
        this.emit(actor, "search.attempt.completed", "search_attempt", attempt.id, { verdict: attempt.verdict }, job.id);
        return;
      }

      if (usableArtifacts.length === 0 || queryChunks.length === 0 || meaningfulTokens.length < 3) {
        attempt.verdict = "needs_clarification";
        attempt.clarificationQuestions = [
          { id: "focus", question: "Bạn muốn tập trung vào khía cạnh nào nhất của chủ đề này?" },
          { id: "outcome", question: "Bạn muốn tạo ra artifact hoặc kết quả áp dụng nào sau khi học?" },
          { id: "evidence", question: "Bạn có thể thêm một đoạn văn bản hoặc nguồn cụ thể để GON đối chiếu không?" },
        ];
        attempt.status = "completed";
        attempt.completedAt = this.now();
        attempt.latencyMs = Math.max(0, this.clock().getTime() - started);
        this.succeedJob(job, "needs_clarification");
        this.emit(actor, "search.attempt.completed", "search_attempt", attempt.id, { verdict: attempt.verdict }, job.id);
        return;
      }

      const queryEmbedding = await this.embeddingProvider.embed(queryText);
      const queryTokens = tokenSet(queryText);
      interface ScoredModuleVersion {
        version: ModuleVersionRecord;
        matchedConcepts: string[];
        missingConcepts: string[];
        scores: SearchResultRecord["internalScores"];
      }
      let scored: ScoredModuleVersion[];

      if (this.repositories.hybridSearch) {
        // PostgreSQL is authoritative for candidate generation and scoring.
        // Visible module graphs in this Unit of Work are used only to turn
        // query text into bounded concept IDs and to map returned IDs back to
        // learner-facing names; authorization happens in SQL before LIMIT.
        const conceptNameById = new Map<string, string>();
        const queryConceptIds: string[] = [];
        const conceptIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
        for (const version of this.visibleModuleVersions(actor)) {
          for (const concept of version.graph.module.concepts) {
            if (!conceptNameById.has(concept.id)) conceptNameById.set(concept.id, concept.name);
            if (concept.role !== "core" || !conceptIdPattern.test(concept.id)) continue;
            const conceptTokens = tokenSet(`${concept.name} ${concept.id.replace(/_/g, " ")}`);
            const overlap = [...conceptTokens].filter((token) => queryTokens.has(token)).length;
            const matched = overlap >= Math.min(2, Math.max(1, conceptTokens.size));
            if (matched && !queryConceptIds.includes(concept.id)) queryConceptIds.push(concept.id);
          }
        }

        const output = await this.repositories.hybridSearch.search({
          actorUserId: actor.userId,
          queryText,
          queryEmbedding: queryEmbedding.vector,
          conceptIds: queryConceptIds.slice(0, 50),
          candidatePoolSize: 100,
          limit: 20,
          minimumHybridScore: 0,
        });
        scored = output.results.flatMap((result): ScoredModuleVersion[] => {
          const version = this.repositories.moduleVersions.get(result.moduleVersionId);
          if (!version) return [];
          return [{
            version,
            matchedConcepts: result.matchedConcepts.map(
              (conceptId) => conceptNameById.get(conceptId) ?? conceptId,
            ),
            missingConcepts: result.missingConcepts.map(
              (conceptId) => conceptNameById.get(conceptId) ?? conceptId,
            ),
            scores: result.internalScores,
          }];
        });
      } else {
        scored = this.visibleModuleVersions(actor).map((version) => {
          const chunks = this.moduleChunks(version.id);
          const vector = chunks.length === 0
            ? 0
            : Math.max(...chunks.map((chunk) => Math.max(0, cosineSimilarity(queryEmbedding.vector, chunk.embedding)) * chunk.weight));
          const moduleText = `${version.title} ${version.summary} ${version.graph.module.concepts.map((concept) => `${concept.name} ${concept.description}`).join(" ")}`;
          const lexical = jaccardSimilarity(queryText, moduleText);
          const coreConcepts = version.graph.module.concepts.filter((concept) => concept.role === "core");
          const matchedConcepts: string[] = [];
          const missingConcepts: string[] = [];
          for (const concept of coreConcepts) {
            const conceptTokens = tokenSet(`${concept.name} ${concept.id.replace(/_/g, " ")}`);
            const overlap = [...conceptTokens].filter((token) => queryTokens.has(token)).length;
            const matched = overlap >= Math.min(2, Math.max(1, conceptTokens.size));
            (matched ? matchedConcepts : missingConcepts).push(concept.name);
          }
          const conceptCoverage = coreConcepts.length === 0 ? 0 : matchedConcepts.length / coreConcepts.length;
          const rareQueryTokens = [...queryTokens].filter((token) => token.length >= 7);
          const moduleTokens = tokenSet(moduleText);
          const specificity = rareQueryTokens.length === 0
            ? lexical
            : rareQueryTokens.filter((token) => moduleTokens.has(token)).length / rareQueryTokens.length;
          const quality = version.groundingStatus === "citation_checked" ? 1 : version.groundingStatus === "partially_cited" ? 0.7 : 0.35;
          const hybrid = 0.5 * vector + 0.15 * lexical + 0.25 * conceptCoverage + 0.05 * specificity + 0.05 * quality;
          return {
            version,
            matchedConcepts,
            missingConcepts,
            scores: { vector, lexical, conceptCoverage, specificity, quality, hybrid },
          };
        }).sort((a, b) => b.scores.hybrid - a.scores.hybrid);
      }

      const best = scored[0];
      if (!best) {
        attempt.verdict = "missing";
      } else if (best.scores.hybrid >= 0.78 && best.scores.vector >= 0.82 && best.scores.conceptCoverage >= 0.8) {
        attempt.verdict = "found";
      } else if (best.scores.hybrid >= 0.52 || (best.scores.conceptCoverage >= 0.35 && best.scores.hybrid >= 0.35)) {
        attempt.verdict = "related";
      } else {
        attempt.verdict = "missing";
      }

      if (attempt.verdict === "found" || attempt.verdict === "related") {
        attempt.results = scored
          .filter((item) => item.scores.hybrid >= (attempt?.verdict === "found" ? 0.52 : 0.35))
          .slice(0, 5)
          .map((item, index): SearchResultRecord => ({
            moduleVersionId: item.version.id,
            rank: index + 1,
            title: item.version.title,
            sourceStatus: item.version.groundingStatus,
            reasonCodes: [
              ...(item.scores.conceptCoverage >= 0.8 ? ["same_core_concepts"] : []),
              ...(item.scores.vector >= 0.65 ? ["same_source_topic"] : []),
              ...(item.missingConcepts.length > 0 ? ["missing_artifact_outcome"] : []),
              ...(item.version.groundingStatus !== "citation_checked" ? ["source_needs_review"] : []),
            ],
            matchedConcepts: item.matchedConcepts,
            missingConcepts: item.missingConcepts,
            internalScores: item.scores,
          }));
        attempt.matchedConcepts = best.matchedConcepts;
        attempt.missingConcepts = best.missingConcepts;
      } else {
        attempt.results = [];
        attempt.matchedConcepts = best?.matchedConcepts ?? [];
        attempt.missingConcepts = best?.missingConcepts ?? [];
      }

      attempt.status = "completed";
      attempt.completedAt = this.now();
      attempt.latencyMs = Math.max(0, this.clock().getTime() - started);
      this.succeedJob(job, "completed");
      this.emit(actor, "search.attempt.completed", "search_attempt", attempt.id, {
        verdict: attempt.verdict,
        resultCount: attempt.results.length,
      }, job.id);
    } catch {
      attempt.status = "failed";
      attempt.completedAt = this.now();
      attempt.latencyMs = Math.max(0, this.clock().getTime() - started);
      this.failJob(job, "SEARCH_FAILED", true, "hybrid_search");
      this.emit(actor, "search.attempt.failed", "search_attempt", attempt.id, { failureCode: "SEARCH_FAILED" }, job.id);
    }
  }

  getSearchAttempt(actor: Actor, projectId: string, attemptId: string): JsonRecord {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    const attempt = this.repositories.searchAttempts.get(attemptId);
    if (!attempt || attempt.projectId !== project.id || attempt.ownerUserId !== actor.userId) throw notFound();
    return this.searchAttemptDto(attempt);
  }

  private candidateDefinitions(graph: ModuleGraph): Array<{
    format: string;
    cluster: string;
    titleSuffix: string;
    promise: string;
    artifactOutcome: string;
    minutesRatio: number;
  }> {
    const definitions = [
      {
        format: "web_lesson",
        target: "web",
        cluster: "Học có hệ thống",
        titleSuffix: "Lộ trình web đầy đủ",
        promise: "Học theo Concept → Retrieval → Transfer → Boss Proof trên web.",
        artifactOutcome: "Artifact Boss Proof và bản ghi mastery theo rubric",
        minutesRatio: 1,
      },
      {
        format: "easy_task",
        target: "easy_task",
        cluster: "Áp dụng nhanh",
        titleSuffix: "Easy Task áp dụng ngay",
        promise: "Biến ý chính thành một nhiệm vụ nhỏ có tiêu chí kiểm chứng.",
        artifactOutcome: "Một task hoàn thành kèm bằng chứng ngắn",
        minutesRatio: 0.55,
      },
      {
        format: "teach_back",
        target: "teach_back",
        cluster: "Dạy lại",
        titleSuffix: "Teach-back cho người mới",
        promise: "Dạy lại ý chính bằng lời của bạn để kiểm tra hiểu thật.",
        artifactOutcome: "Bài teach-back có nguồn và giới hạn bằng chứng",
        minutesRatio: 0.75,
      },
      {
        format: "infographic",
        target: "infographic",
        cluster: "Trực quan",
        titleSuffix: "Infographic brief",
        promise: "Tổ chức ý chính, bằng chứng và giới hạn thành bản đồ trực quan.",
        artifactOutcome: "Brief infographic sẵn sàng để thiết kế",
        minutesRatio: 0.8,
      },
      {
        format: "video",
        target: "video",
        cluster: "Kể chuyện",
        titleSuffix: "Video storyboard",
        promise: "Chuyển module thành kịch bản video ngắn có kiểm tra hiểu biết ở cuối.",
        artifactOutcome: "Storyboard/script video có citation",
        minutesRatio: 0.9,
      },
      {
        format: "image_sequence",
        target: "image_sequence",
        cluster: "Trực quan",
        titleSuffix: "Chuỗi ảnh học tập",
        promise: "Chia bài học thành chuỗi khung hình dễ nhớ nhưng vẫn giữ core check.",
        artifactOutcome: "Brief chuỗi ảnh kèm câu hỏi truy hồi",
        minutesRatio: 0.7,
      },
    ];
    return definitions.filter((definition) => graph.renderTargets.includes(definition.target));
  }

  private async buildCandidateSet(
    actor: Actor,
    project: ProjectRecord,
    searchAttempt: SearchAttemptRecord,
    results: SearchResultRecord[],
    sourceModuleVersionId: string | null = null,
  ): Promise<CandidateSetRecord> {
    const existing = [...this.repositories.candidateSets.values()].find(
      (item) => item.projectId === project.id && item.searchAttemptId === searchAttempt.id && item.sourceModuleVersionId === sourceModuleVersionId && ["ready", "ready_with_shortfall"].includes(item.status),
    );
    if (existing) return existing;

    const job = this.createJob({
      actor,
      jobType: "build_candidate_set",
      aggregateType: "learning_project",
      aggregateId: project.id,
      payload: { searchAttemptId: searchAttempt.id, sourceModuleVersionId },
    });
    this.startJob(job, "build_candidates");

    const set: CandidateSetRecord = {
      id: createId("cset"),
      projectId: project.id,
      searchAttemptId: searchAttempt.id,
      sourceModuleVersionId,
      generationMethod: sourceModuleVersionId ? "graph_derived" : "existing_modules",
      generatorVersion: "candidate-policy-v0-local",
      status: "building",
      targetCount: 10,
      actualCount: 0,
      shortfallReasonCodes: [],
      createdAt: this.now(),
    };
    this.repositories.candidateSets.set(set.id, set);

    const relevanceByModule = new Map(results.map((result) => [result.moduleVersionId, result.internalScores.hybrid]));
    const versions = results
      .map((result) => this.repositories.moduleVersions.get(result.moduleVersionId))
      .filter((version): version is ModuleVersionRecord => Boolean(version))
      .slice(0, 2);

    for (const version of versions) {
      for (const definition of this.candidateDefinitions(version.graph)) {
        const candidate: CandidateRecord = {
          id: createId("cand"),
          candidateSetId: set.id,
          projectId: project.id,
          moduleVersionId: version.id,
          title: truncateText(`${version.title} — ${definition.titleSuffix}`, 220),
          promise: definition.promise,
          cluster: definition.cluster,
          format: definition.format,
          estimatedMinutes: Math.max(5, Math.round(version.estimatedMinutes * definition.minutesRatio)),
          difficulty: version.difficulty,
          artifactOutcome: definition.artifactOutcome,
          prerequisiteConceptIds: version.graph.module.prerequisites,
          conceptIds: version.graph.module.concepts.filter((concept) => concept.role === "core").map((concept) => concept.id),
          sourceStatus: version.groundingStatus,
          status: "eligible",
          semanticFingerprint: stableHash({ moduleVersionId: version.id, format: definition.format, outcome: definition.artifactOutcome }),
          internalSignals: {
            relevance: relevanceByModule.get(version.id) ?? 0.85,
            conceptCoverage: 1,
            sourceQuality: version.groundingStatus === "citation_checked" ? 1 : version.groundingStatus === "partially_cited" ? 0.7 : 0.35,
          },
          createdAt: this.now(),
        };
        this.repositories.candidates.set(candidate.id, candidate);
      }
    }

    set.actualCount = [...this.repositories.candidates.values()].filter((candidate) => candidate.candidateSetId === set.id).length;
    if (set.actualCount < set.targetCount) {
      set.status = "ready_with_shortfall";
      set.shortfallReasonCodes = ["formats_not_supported_by_graph", "duplicates_removed"];
    } else {
      set.status = "ready";
    }
    project.currentCandidateSetId = set.id;
    this.succeedJob(job, "ready");
    this.emit(actor, "candidates.set.ready", "candidate_set", set.id, {
      projectId: project.id,
      actualCount: set.actualCount,
      targetCount: set.targetCount,
    }, job.id);
    this.createRankingSnapshotRecord(actor, project, set, project.learningMode);
    return set;
  }

  private modeFit(format: string, mode: LearningMode): number {
    const table: Record<LearningMode, Record<string, number>> = {
      deep_mastery: { web_lesson: 1, research_pack: 0.95, teach_back: 0.8, infographic: 0.65, video: 0.55, easy_task: 0.45, image_sequence: 0.5 },
      apply_at_work: { easy_task: 1, web_lesson: 0.85, workshop_case: 0.95, teach_back: 0.65, infographic: 0.6, video: 0.5, image_sequence: 0.45 },
      create_publish: { video: 1, infographic: 0.95, image_sequence: 0.9, teach_back: 0.85, web_lesson: 0.65, easy_task: 0.6 },
      fast_entertaining: { easy_task: 1, image_sequence: 0.9, video: 0.85, web_lesson: 0.55, infographic: 0.7, teach_back: 0.5 },
      prove_impact: { teach_back: 1, web_lesson: 0.9, easy_task: 0.85, infographic: 0.65, video: 0.6, image_sequence: 0.55 },
    };
    return table[mode][format] ?? 0.5;
  }

  private createRankingSnapshotRecord(
    actor: Actor,
    project: ProjectRecord,
    candidateSet: CandidateSetRecord,
    learningMode: LearningMode,
  ): RankingSnapshotRecord {
    const candidates = [...this.repositories.candidates.values()].filter(
      (candidate) => candidate.candidateSetId === candidateSet.id && candidate.status === "eligible",
    );
    const personalizationApplied = this.consentRecord(actor.userId, "personalization_footprint").status === "granted";
    const priorJourneyFormats = [...this.repositories.journeys.values()]
      .filter((journey) => journey.ownerUserId === actor.userId)
      .map((journey) => this.repositories.candidates.get(journey.sourceCandidateId)?.format)
      .filter((format): format is string => Boolean(format));
    const formatCounts = new Map<string, number>();
    for (const format of priorJourneyFormats) formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);

    const breakdown: Record<string, JsonRecord> = {};
    const scored = candidates.map((candidate) => {
      const timeFit = candidate.estimatedMinutes <= project.timeBudgetMinutes
        ? Math.max(0.65, 1 - candidate.estimatedMinutes / Math.max(1, project.timeBudgetMinutes) * 0.25)
        : Math.max(0.1, project.timeBudgetMinutes / candidate.estimatedMinutes * 0.6);
      const personalFit = personalizationApplied
        ? Math.min(1, 0.5 + (formatCounts.get(candidate.format) ?? 0) * 0.15)
        : 0;
      const modeFit = this.modeFit(candidate.format, learningMode);
      const signals = {
        relevance: candidate.internalSignals.relevance,
        conceptCoverage: candidate.internalSignals.conceptCoverage,
        sourceQuality: candidate.internalSignals.sourceQuality,
        modeFit,
        timeFit,
        personalFit,
        internalLearningTrend: 0,
      };
      const baseScore = personalizationApplied
        ? 0.28 * signals.relevance + 0.2 * signals.conceptCoverage + 0.14 * signals.sourceQuality + 0.16 * modeFit + 0.1 * timeFit + 0.12 * personalFit
        : 0.34 * signals.relevance + 0.24 * signals.conceptCoverage + 0.16 * signals.sourceQuality + 0.16 * modeFit + 0.1 * timeFit;
      breakdown[candidate.id] = { ...signals, diversityAdjustment: 0, score: baseScore };
      return { candidate, signals, score: baseScore };
    });

    const ordered: typeof scored = [];
    const remaining = [...scored];
    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestAdjusted = -Infinity;
      for (const [index, item] of remaining.entries()) {
        const sameFormatCount = ordered.filter((selected) => selected.candidate.format === item.candidate.format).length;
        const sameModuleCount = ordered.filter((selected) => selected.candidate.moduleVersionId === item.candidate.moduleVersionId).length;
        const diversityAdjustment = -0.035 * sameFormatCount - 0.015 * sameModuleCount;
        const adjusted = item.score + diversityAdjustment;
        if (adjusted > bestAdjusted) {
          bestAdjusted = adjusted;
          bestIndex = index;
        }
        breakdown[item.candidate.id].diversityAdjustment = diversityAdjustment;
      }
      const [selected] = remaining.splice(bestIndex, 1);
      ordered.push(selected);
    }

    const reasonCodesByCandidate: Record<string, string[]> = {};
    for (const item of ordered) {
      const reasons: string[] = [];
      if (item.signals.relevance >= 0.7) reasons.push("high_relevance");
      if (item.signals.conceptCoverage >= 0.8) reasons.push("strong_concept_coverage");
      if (item.signals.modeFit >= 0.8) reasons.push("fits_learning_mode");
      if (item.signals.timeFit >= 0.75) reasons.push("fits_time_budget");
      if (item.signals.sourceQuality >= 0.9) reasons.push("source_checked");
      else if (item.signals.sourceQuality >= 0.6) reasons.push("partially_cited_sources");
      if (personalizationApplied && item.signals.personalFit >= 0.65) reasons.push("matches_learning_history");
      reasonCodesByCandidate[item.candidate.id] = reasons;
    }

    const snapshot: RankingSnapshotRecord = {
      id: createId("rank"),
      userId: actor.userId,
      projectId: project.id,
      candidateSetId: candidateSet.id,
      learningMode,
      algorithmVersion: "ranking-rules-v1-local",
      personalizationApplied,
      orderedCandidateIds: ordered.map((item) => item.candidate.id),
      explanationCodes: [
        "relevance_and_concept_coverage",
        "learning_mode_fit",
        personalizationApplied ? "personalization_enabled" : "personalization_disabled",
        "internal_trend_not_used_in_vs1",
      ],
      signalBreakdown: breakdown,
      reasonCodesByCandidate,
      createdAt: this.now(),
      staleAt: new Date(this.clock().getTime() + 60 * 60 * 1000).toISOString(),
    };
    this.repositories.rankingSnapshots.set(snapshot.id, snapshot);
    this.emit(actor, "ranking.snapshot.created", "ranking_snapshot", snapshot.id, {
      projectId: project.id,
      candidateSetId: candidateSet.id,
      learningMode,
      personalizationApplied,
    });
    return snapshot;
  }

  private rankingSnapshotDto(record: RankingSnapshotRecord): JsonRecord {
    return {
      id: record.id,
      candidateSetId: record.candidateSetId,
      learningMode: record.learningMode,
      algorithmVersion: record.algorithmVersion,
      personalizationApplied: record.personalizationApplied,
      orderedCandidateIds: record.orderedCandidateIds,
      explanationCodes: record.explanationCodes,
      createdAt: record.createdAt,
      staleAt: record.staleAt,
    };
  }

  private candidateSetDto(record: CandidateSetRecord): JsonRecord {
    return {
      id: record.id,
      status: record.status,
      targetCount: record.targetCount,
      actualCount: record.actualCount,
      shortfallReasonCodes: record.shortfallReasonCodes,
    };
  }

  private candidateDto(candidate: CandidateRecord, rank: number, rankingSnapshot: RankingSnapshotRecord | null): JsonRecord {
    return {
      id: candidate.id,
      moduleVersionId: candidate.moduleVersionId,
      rank,
      title: candidate.title,
      promise: candidate.promise,
      cluster: candidate.cluster,
      format: candidate.format,
      estimatedMinutes: candidate.estimatedMinutes,
      difficulty: candidate.difficulty,
      artifactOutcome: candidate.artifactOutcome,
      prerequisiteConceptIds: candidate.prerequisiteConceptIds,
      conceptIds: candidate.conceptIds,
      sourceStatus: candidate.sourceStatus,
      status: candidate.status,
      rankingReasonCodes: rankingSnapshot?.reasonCodesByCandidate[candidate.id] ?? [],
      preference: null,
    };
  }

  getOutputExplorer(actor: Actor, projectId: string, mode?: string): JsonRecord {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    const candidateSet = this.latestCandidateSet(project.id);
    if (!candidateSet) {
      throw conflict("CANDIDATE_SET_NOT_READY", "Chưa có Output Candidate", "Hãy chạy Search hoặc Brew để tạo CandidateSet trước.");
    }
    const requestedMode = mode && LEARNING_MODES.includes(mode as LearningMode) ? (mode as LearningMode) : project.learningMode;
    const snapshot = [...this.repositories.rankingSnapshots.values()]
      .filter((item) => item.candidateSetId === candidateSet.id && item.userId === actor.userId && item.learningMode === requestedMode)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const candidates = [...this.repositories.candidates.values()].filter((candidate) => candidate.candidateSetId === candidateSet.id);
    const orderedCandidates = snapshot
      ? snapshot.orderedCandidateIds.map((candidateId) => candidates.find((candidate) => candidate.id === candidateId)).filter((candidate): candidate is CandidateRecord => Boolean(candidate))
      : candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      projectId: project.id,
      candidateSet: this.candidateSetDto(candidateSet),
      rankingSnapshot: snapshot ? this.rankingSnapshotDto(snapshot) : null,
      candidates: orderedCandidates.map((candidate, index) => this.candidateDto(candidate, index + 1, snapshot)),
      status: candidateSet.status,
    };
  }

  createRankingSnapshot(actor: Actor, projectId: string, bodyValue: unknown): CommandResult<JsonRecord> {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    const body = ensureRecord(bodyValue);
    const candidateSetId = requiredString(body, "candidateSetId", { maxLength: 128 });
    const learningMode = requiredEnum(body, "learningMode", LEARNING_MODES);
    const candidateSet = this.repositories.candidateSets.get(candidateSetId);
    if (!candidateSet || candidateSet.projectId !== project.id) throw notFound();
    const snapshot = this.createRankingSnapshotRecord(actor, project, candidateSet, learningMode);
    return { data: this.rankingSnapshotDto(snapshot), status: 201 };
  }

  getModuleVersion(actor: Actor, moduleVersionId: string): JsonRecord {
    this.requireActiveUser(actor);
    const version = this.requireVisibleModuleVersion(actor, moduleVersionId);
    return {
      id: version.id,
      moduleId: version.moduleId,
      versionNumber: version.versionNumber,
      publicationStatus: version.publicationStatus,
      groundingStatus: version.groundingStatus,
      playerGraph: toPlayerGraph(version.graph),
    };
  }

  private async indexModuleVersion(actor: Actor, version: ModuleVersionRecord): Promise<void> {
    this.removeModuleChunks(version.id);
    const chunksText = [
      `${version.title}\n${version.summary}\n${version.graph.module.concepts.map((concept) => `${concept.name}: ${concept.description}`).join("\n")}`,
      ...version.graph.nodes.map((node) => {
        const blocks = Array.isArray(node.content.blocks)
          ? node.content.blocks.map((block) => (block && typeof block === "object" && "text" in block ? String((block as JsonRecord).text ?? "") : "")).join("\n")
          : "";
        const prompt = typeof node.content.prompt === "string" ? node.content.prompt : "";
        return `${node.title}\n${blocks}\n${prompt}`;
      }),
    ];
    for (const [index, text] of chunksText.entries()) {
      const clean = text.trim();
      if (!clean) continue;
      const embedding = await this.embeddingProvider.embed(clean);
      const chunk: ChunkRecord = {
        id: createId("evt"),
        ownerUserId: version.createdByUserId,
        sourceType: "module_version",
        sourceId: version.id,
        artifactId: null,
        moduleVersionId: version.id,
        ordinal: index,
        text: clean,
        locator: `module-chunk-${index + 1}`,
        language: version.language,
        tokenCount: tokenize(clean, { keepStopwords: true }).length,
        contentSha256: sha256Hex(clean),
        embedding: embedding.vector,
        embeddingProfile: embedding.profile,
        providerModel: embedding.providerModel,
        weight: 1,
        deletedAt: null,
      };
      this.repositories.chunks.set(chunk.id, chunk);
    }
    void actor;
  }

  async createBrewJob(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const project = this.requireOwnedProject(actor, projectId);
    const body = ensureRecord(bodyValue);
    const searchAttemptId = requiredString(body, "searchAttemptId", { maxLength: 128 });
    if (body.confirmed !== true) {
      throw unprocessable("BREW_CONFIRMATION_REQUIRED", "Cần xác nhận Brew", "GON không tự chạy Brew khi user chưa xác nhận.");
    }
    if (!this.featureFlags.brew_enabled || this.persistentKillSwitchActive("brew_enabled")) {
      throw serviceUnavailable("BREW_DISABLED", "Brew đang tạm dừng", "Kill switch Brew đang bật. Search và module đã có vẫn có thể dùng nếu an toàn.");
    }
    const searchAttempt = this.repositories.searchAttempts.get(searchAttemptId);
    if (!searchAttempt || searchAttempt.projectId !== project.id || searchAttempt.ownerUserId !== actor.userId) throw notFound();
    if (searchAttempt.status !== "completed" || !searchAttempt.verdict || !["missing", "related", "found"].includes(searchAttempt.verdict)) {
      throw conflict("INVALID_STATE_TRANSITION", "Search chưa sẵn sàng để Brew", "Chỉ Brew từ Search đã hoàn tất với verdict missing/related hoặc biến thể từ found.");
    }

    const artifacts = searchAttempt.artifactIds
      .map((artifactId) => this.repositories.artifacts.get(artifactId))
      .filter((artifact): artifact is ArtifactRecord => Boolean(artifact && !artifact.deletedAt));
    const fingerprint = stableHash({
      projectId: project.id,
      searchAttemptId,
      artifactVersions: artifacts.map((artifact) => ({ id: artifact.id, version: artifact.version, sha256: artifact.sha256 })),
      context: {
        goal: project.goal,
        learningMode: project.learningMode,
        depth: project.depth,
        timeBudgetMinutes: project.timeBudgetMinutes,
        locale: project.locale,
      },
      graphSchemaVersion: "gon.module-graph/1.0",
      pipelineVersion: "vs1-local-brew-v1",
    });

    const payload = { projectId, searchAttemptId, confirmed: true };
    const replay = this.findIdempotentReplay(actor, "createBrewJob", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.jobs.get(replay.resourceId);
      if (existing) return { data: await this.brewJobDto(existing.id), status: 200, replay: true };
    }
    const existingByFingerprint = await this.repositories.targetedQueries.findJobByInputFingerprint({
      userId: actor.userId,
      jobType: "brew_module",
      fingerprint,
      statuses: ["queued", "running", "succeeded"],
    });
    if (existingByFingerprint) {
      return { data: await this.brewJobDto(existingByFingerprint.id), status: 200, replay: true };
    }

    const { windowStart: dayStart, windowEnd: dayEnd } = utcDayWindow(this.clock());

    const job = this.createJob({
      actor,
      jobType: "brew_module",
      aggregateType: "learning_project",
      aggregateId: project.id,
      idempotencyKey: options.idempotencyKey,
      inputFingerprint: fingerprint,
      estimatedCostUnits: 1,
      payload: { projectId: project.id, searchAttemptId, stepsCompleted: [] },
    });

    // Persistent quota/budget reservations (P05-R1.6) run through the
    // targeted port. Failing either reservation throws before COMMIT, so the
    // job insert above rolls back with the Unit of Work.
    const brewQuota = await this.repositories.targetedQueries.reserveQuotaUnits({
      userId: actor.userId,
      quotaKey: "brew_per_day",
      windowStart: dayStart,
      windowEnd: dayEnd,
      units: 1,
      limit: this.quotas.brewPerDay,
      mode: "consume",
      jobId: job.id,
      createdAt: this.now(),
    });
    if (!brewQuota.reserved) {
      throw quotaExceeded(`Private Alpha cho phép tối đa ${this.quotas.brewPerDay} Brew job/người/ngày.`);
    }
    const costBudget = await this.repositories.targetedQueries.reserveQuotaUnits({
      userId: actor.userId,
      quotaKey: "brew_cost_units_per_day",
      windowStart: dayStart,
      windowEnd: dayEnd,
      units: job.estimatedCostUnits,
      limit: this.quotas.brewCostUnitsPerDay,
      mode: "reserve",
      jobId: job.id,
      createdAt: this.now(),
    });
    if (!costBudget.reserved) {
      throw quotaExceeded(`Ngân sách AI trong ngày đã hết (${this.quotas.brewCostUnitsPerDay} cost units/người/ngày).`);
    }
    // Budget alert hooks (P05-R1.10): reservation crossed one or more usage
    // thresholds — fire each exactly once via the distributed claim store.
    await this.checkBudgetAlerts({
      userId: actor.userId,
      quotaKey: "brew_cost_units_per_day",
      windowStart: dayStart,
      windowEnd: dayEnd,
      limitUnits: this.quotas.brewCostUnitsPerDay,
      usedUnits: costBudget.usedUnitsAfter,
    });
    const brew = { jobId: job.id, projectId: project.id, searchAttemptId, resultModuleVersionId: null as string | null };
    this.repositories.brewJobs.set(job.id, brew);
    project.currentBrewJobId = job.id;
    this.emit(actor, "brew.job.queued", "brew_job", job.id, { projectId: project.id, searchAttemptId });

    // Inline processing is orchestrated by GonService.createBrewJob after this
    // Unit of Work commits: AI provider calls must run outside DB transactions.
    this.saveIdempotentResult(actor, "createBrewJob", options.idempotencyKey, payload, "brew_job", job.id, 202);
    return { data: await this.brewJobDto(job.id), status: 202 };
  }

  /**
   * Phase 1 of queued Brew processing (one Unit of Work): claim/lease the job,
   * run the deterministic local gates, and either settle the job from existing
   * state or return a generation work package whose AI provider calls run
   * OUTSIDE any database transaction (phase 2), followed by
   * `finishBrewJobProcessing` (phase 3).
   */
  async beginBrewJobProcessing(
    jobId: string,
    options: ProcessQueuedBrewJobOptions = {},
  ): Promise<BrewPhaseOneResult> {
    const workerId = options.workerId ?? "gon-brew-worker";
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workerId)) {
      throw new Error("workerId must be a bounded ASCII identifier");
    }
    const leaseMs = options.leaseMs ?? 5 * 60_000;
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 15 * 60_000) {
      throw new Error("leaseMs must be an integer between 5000 and 900000");
    }

    const job = this.repositories.jobs.get(jobId);
    if (!job || job.jobType !== "brew_module" || !this.repositories.brewJobs.get(jobId)) throw notFound();
    if (["succeeded", "failed_terminal", "cancelled", "needs_input"].includes(job.status)) {
      return { kind: "settled", job: await this.brewJobDto(jobId) };
    }

    const owner = this.repositories.users.get(job.ownerUserId);
    if (!owner || owner.status === "deleted") throw notFound();

    const nowMs = this.clock().getTime();
    const leaseExpired = !job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= nowMs;
    if (job.status === "running" && !leaseExpired) {
      if (!options.alreadyClaimed || job.leaseOwner !== workerId) {
        return { kind: "settled", job: await this.brewJobDto(jobId) };
      }
    } else {
      if (job.status !== "running" && Date.parse(job.availableAt) > nowMs && !options.alreadyClaimed) {
        return { kind: "settled", job: await this.brewJobDto(jobId) };
      }
      if (job.attemptCount >= job.maxAttempts) {
        this.failJob(job, "JOB_LEASE_EXPIRED", false, job.currentStep);
        return { kind: "settled", job: await this.brewJobDto(jobId) };
      }
      job.status = "running";
      job.attemptCount += 1;
      job.startedAt = this.now();
      job.completedAt = null;
      job.cancelledAt = null;
      job.leaseOwner = workerId;
      job.leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();
    }

    const actor: Actor = {
      userId: owner.id,
      roles: owner.roles,
      authProvider: "service",
      requestId: createId("req"),
    };
    const brew = this.repositories.brewJobs.get(jobId)!;
    const steps = job.payload.stepsCompleted as string[];
    const completeStep = (step: string) => {
      job.currentStep = step;
      if (!steps.includes(step)) steps.push(step);
    };

    try {
      this.startJob(job, "validate_request");
      const project = this.requireOwnedProject(actor, brew.projectId);
      const searchAttempt = this.repositories.searchAttempts.get(brew.searchAttemptId);
      if (!searchAttempt) throw new Error("SEARCH_ATTEMPT_NOT_FOUND");
      completeStep("validate_request");

      if (brew.resultModuleVersionId) {
        const version = this.repositories.moduleVersions.get(brew.resultModuleVersionId);
        if (!version) throw new Error("BREW_RESULT_MODULE_VERSION_NOT_FOUND");
        const validation = validateModuleGraph(version.graph, {
          evidenceSourceIds: version.graph.sources.map((source) => source.id),
        });
        if (!validation.valid) {
          this.failJob(job, "MODULE_GRAPH_INVALID", false, "verify_citations");
          this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
          return { kind: "settled", job: await this.brewJobDto(jobId) };
        }

        job.currentStep = "persist_draft";
        if (!steps.includes("persist_draft")) {
          await this.indexModuleVersion(actor, version);
          completeStep("persist_draft");
          this.emit(actor, "module.version.created", "module_version", version.id, {
            moduleId: version.moduleId,
            publicationStatus: version.publicationStatus,
            groundingStatus: version.groundingStatus,
          }, job.id);
        }

        job.currentStep = "build_candidate_set";
        await this.buildCandidateSet(actor, project, searchAttempt, [{
          moduleVersionId: version.id,
          rank: 1,
          title: version.title,
          sourceStatus: version.groundingStatus,
          reasonCodes: ["same_source_topic"],
          matchedConcepts: version.graph.module.concepts
            .filter((concept) => concept.role === "core")
            .map((concept) => concept.name),
          missingConcepts: [],
          internalScores: { vector: 1, lexical: 1, conceptCoverage: 1, specificity: 1, quality: 0.7, hybrid: 0.92 },
        }], version.id);
        completeStep("build_candidate_set");
        job.actualCostUnits = 0;
        this.succeedJob(job, "succeeded");
        this.emit(actor, "brew.job.succeeded", "brew_job", job.id, {
          projectId: project.id,
          resultModuleVersionId: version.id,
        }, job.id);
        return { kind: "settled", job: await this.brewJobDto(jobId) };
      }

      job.currentStep = "topic_and_safety_check";
      const artifacts = searchAttempt.artifactIds
        .map((artifactId) => this.repositories.artifacts.get(artifactId))
        .filter((artifact): artifact is ArtifactRecord => Boolean(artifact && !artifact.deletedAt && artifact.safetyStatus === "allowed"));
      const evidenceText = [project.title, project.goal, ...artifacts.flatMap((artifact) => this.artifactChunks(artifact.id).map((chunk) => chunk.text))].join("\n");
      if (this.topicIsBlocked(evidenceText)) {
        this.failJob(job, "TOPIC_BLOCKED_BY_POLICY", false, "topic_and_safety_check");
        this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
        return { kind: "settled", job: await this.brewJobDto(jobId) };
      }
      completeStep("topic_and_safety_check");

      job.currentStep = "build_evidence_bundle";
      const graphArtifacts: EvidenceArtifactForGraph[] = artifacts.map((artifact) => ({
        artifactId: artifact.id,
        kind: artifact.kind,
        displayName: artifact.displayName,
        originUri: artifact.originUri,
        isPrompt: artifact.id === project.rawPromptArtifactId,
        chunks: this.artifactChunks(artifact.id).map((chunk) => ({
          text: chunk.text,
          locator: chunk.locator,
          weight: chunk.weight,
        })),
      }));
      const usableEvidence = graphArtifacts.filter((artifact) => artifact.chunks.length > 0);
      if (usableEvidence.length === 0) {
        job.status = "needs_input";
        job.currentStep = "build_evidence_bundle";
        job.failureCode = "EVIDENCE_REQUIRED";
        job.retryable = false;
        job.completedAt = this.now();
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        this.emit(actor, "brew.job.needs_input", "brew_job", job.id, { projectId: project.id }, job.id);
        return { kind: "settled", job: await this.brewJobDto(jobId) };
      }
      completeStep("build_evidence_bundle");

      job.currentStep = "generate_module_graph";
      const evidenceBundle: GenerateModuleInput["evidenceBundle"] = usableEvidence.map(
        (artifact, index) => ({
          // Matches the source IDs the module graph assigns (`source_${index+1}`)
          // so revalidation accepts ADK citations against the same evidence.
          sourceId: `source_${index + 1}`,
          title: truncateText(artifact.displayName || artifact.originUri || `Nguồn ${index + 1}`, 280),
          ...(artifact.originUri ? { uri: artifact.originUri } : {}),
          artifactId: artifact.artifactId,
          content: truncateText(
            artifact.chunks.map((chunk) => chunk.text).join("\n"),
            100_000,
          ),
          rightsStatus: artifact.originUri ? "link_only" : "user_provided",
        }),
      );
      const contractInput: GenerateModuleInput = {
        schemaVersion: GENERATE_MODULE_INPUT_SCHEMA_VERSION,
        jobId: job.id,
        projectId: project.id,
        learningContext: {
          goal: project.goal,
          learningMode: project.learningMode,
          depth: project.depth,
          timeBudgetMinutes: project.timeBudgetMinutes,
          locale: project.locale,
        },
        evidenceBundle,
        graphSchemaVersion: "gon.module-graph/1.0",
      };
      const topicCheckInput: TopicCheckInput = {
        schemaVersion: TOPIC_CHECK_INPUT_SCHEMA_VERSION,
        jobId: job.id,
        projectId: project.id,
        intent: project.goal,
        artifactCoverage: artifacts.map((artifact) => ({
          artifactId: artifact.id,
          extractionStatus: artifact.extractionStatus,
          hasText: this.artifactChunks(artifact.id).length > 0,
          hasMetadata: Boolean(artifact.originUri) || Boolean(artifact.displayName),
        })),
        policyVersion: BREW_POLICY_VERSION,
      };
      return {
        kind: "generate",
        work: {
          jobId,
          workerId,
          actor,
          topicCheckInput,
          generateWork: {
            contractInput,
            local: {
              userId: actor.userId,
              projectTitle: project.title,
              artifacts: usableEvidence,
            },
          },
        },
      };
    } catch {
      this.failJob(job, "BREW_FAILED", true, job.currentStep);
      this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
      return { kind: "settled", job: await this.brewJobDto(jobId) };
    }
  }

  /**
   * Phase 3 of queued Brew processing (one Unit of Work): persist safe AI-run
   * telemetry, then either apply the policy-revalidated generation result or
   * record the failure decision. Only runs when this worker still holds the
   * job lease; a fenced-out worker records telemetry only.
   */
  async finishBrewJobProcessing(
    work: BrewGenerationWorkPackage,
    outcome: BrewGenerationOutcome,
    runs: readonly AiRunDraft[],
  ): Promise<JsonRecord> {
    const job = this.repositories.jobs.get(work.jobId);
    const brew = this.repositories.brewJobs.get(work.jobId);
    if (!job || !brew) throw notFound();
    const actor = work.actor;
    const steps = job.payload.stepsCompleted as string[];
    const completeStep = (step: string) => {
      job.currentStep = step;
      if (!steps.includes(step)) steps.push(step);
    };

    try {
      // Safe telemetry only (no prompts/evidence/chain-of-thought). Recorded
      // even when the lease was lost, so provider cost stays observable.
      for (const run of runs) this.recordAiRun(run, job.id);

      const leaseHeld =
        job.status === "running" &&
        job.leaseOwner === work.workerId &&
        Boolean(job.leaseExpiresAt) &&
        Date.parse(job.leaseExpiresAt!) > this.clock().getTime();
      if (!leaseHeld) {
        return await this.brewJobDto(work.jobId);
      }

      if (outcome.kind === "provider_error") {
        this.failJob(job, outcome.errorCode, outcome.retryable, "generate_module_graph");
        this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
        if (job.status === "failed_terminal") await this.settleBrewCostBudget(job, runs);
        return await this.brewJobDto(work.jobId);
      }

      if (outcome.kind === "topic_decision") {
        if (outcome.topicOutput.decision === "block") {
          this.failJob(job, "TOPIC_BLOCKED_BY_POLICY", false, "topic_and_safety_check");
          this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
        } else {
          const questions = outcome.topicOutput.clarificationQuestions.slice(0, 3);
          job.status = "needs_input";
          job.currentStep = "topic_and_safety_check";
          job.failureCode = "TOPIC_CLARIFICATION_REQUIRED";
          job.retryable = false;
          job.completedAt = this.now();
          job.leaseOwner = null;
          job.leaseExpiresAt = null;
          job.payload = { ...job.payload, clarificationQuestions: questions };
          this.emit(actor, "brew.job.needs_input", "brew_job", job.id, {
            projectId: brew.projectId,
            reasonCodes: outcome.topicOutput.reasonCodes.slice(0, 32),
            clarificationQuestionCount: questions.length,
          }, job.id);
        }
        await this.settleBrewCostBudget(job, runs);
        return await this.brewJobDto(work.jobId);
      }

      // Policy revalidation of the provider output (TS stays the authority).
      const graph = outcome.generateOutput.moduleGraph;
      const validation = validateModuleGraph(graph, {
        evidenceSourceIds: graph.sources.map((source) => source.id),
      });
      if (!validation.valid) {
        this.failJob(job, "MODULE_GRAPH_INVALID", false, "verify_citations");
        this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
        await this.settleBrewCostBudget(job, runs);
        return await this.brewJobDto(work.jobId);
      }
      graph.quality.citationCoverage = validation.citationCoverage;
      completeStep("verify_citations");
      completeStep("safety_and_policy_review");

      job.currentStep = "persist_draft";
      const project = this.requireOwnedProject(actor, brew.projectId);
      const searchAttempt = this.repositories.searchAttempts.get(brew.searchAttemptId);
      if (!searchAttempt) throw new Error("SEARCH_ATTEMPT_NOT_FOUND");
      const artifacts = searchAttempt.artifactIds
        .map((artifactId) => this.repositories.artifacts.get(artifactId))
        .filter((artifact): artifact is ArtifactRecord => Boolean(artifact && !artifact.deletedAt));
      const attributionName =
        this.brewAiProvider.kind === "adk_http" ? "GON ADK draft generator" : "GON local draft generator";
      const moduleRecord = {
        id: createId("mod"),
        ownerUserId: actor.userId,
        creatorType: "system_seed" as const,
        attributionSnapshot: { displayName: attributionName },
        createdAt: this.now(),
      };
      const version: ModuleVersionRecord = {
        id: createId("modv"),
        moduleId: moduleRecord.id,
        versionNumber: 1,
        graphSchemaVersion: "gon.module-graph/1.0",
        graph,
        language: graph.module.locale,
        title: graph.module.title,
        summary: graph.module.summary,
        estimatedMinutes: graph.module.estimatedMinutes,
        difficulty: graph.module.difficulty,
        visibility: "private",
        publicationStatus: "draft_private",
        groundingStatus: validation.citationCoverage >= 1 ? "partially_cited" : "unverified",
        generationLineage: {
          brewJobId: job.id,
          agentPipelineVersion: outcome.generateOutput.generation.agentPipelineVersion,
          modelIds: [...outcome.generateOutput.generation.modelIds],
          promptTemplateVersions: [...outcome.generateOutput.generation.promptTemplateVersions],
          evidenceBundleHash: outcome.generateOutput.generation.evidenceBundleHash,
        },
        sourceArtifactVersions: artifacts.map((artifact) => ({ artifactId: artifact.id, version: artifact.version })),
        parentModuleVersionId: null,
        contentSha256: validation.contentSha256,
        createdByUserId: actor.userId,
        createdAt: this.now(),
      };
      this.repositories.modules.set(moduleRecord.id, moduleRecord);
      this.repositories.moduleVersions.set(version.id, version);
      // Checkpoint the result before any fallible indexing work. A retry can
      // then resume from this exact ModuleVersion instead of generating a
      // duplicate module.
      brew.resultModuleVersionId = version.id;
      await this.indexModuleVersion(actor, version);
      completeStep("persist_draft");
      this.emit(actor, "module.version.created", "module_version", version.id, {
        moduleId: version.moduleId,
        publicationStatus: version.publicationStatus,
        groundingStatus: version.groundingStatus,
      }, job.id);

      job.currentStep = "build_candidate_set";
      const brewResult: SearchResultRecord = {
        moduleVersionId: version.id,
        rank: 1,
        title: version.title,
        sourceStatus: version.groundingStatus,
        reasonCodes: ["same_source_topic"],
        matchedConcepts: graph.module.concepts.filter((concept) => concept.role === "core").map((concept) => concept.name),
        missingConcepts: [],
        internalScores: { vector: 1, lexical: 1, conceptCoverage: 1, specificity: 1, quality: 0.7, hybrid: 0.92 },
      };
      await this.buildCandidateSet(actor, project, searchAttempt, [brewResult], version.id);
      completeStep("build_candidate_set");

      this.succeedJob(job, "succeeded");
      await this.settleBrewCostBudget(job, runs);
      this.emit(actor, "brew.job.succeeded", "brew_job", job.id, {
        projectId: project.id,
        resultModuleVersionId: version.id,
      }, job.id);
      return await this.brewJobDto(work.jobId);
    } catch {
      this.failJob(job, "BREW_FAILED", true, job.currentStep);
      this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
      if (job.status === "failed_terminal") await this.settleBrewCostBudget(job, runs);
      return await this.brewJobDto(work.jobId);
    }
  }

  /**
   * Settle the persistent AI-cost budget reservation (P05-R1.6) when a Brew
   * job reaches a terminal state. Consumed units equal the recorded AiRun
   * cost for this processing pass; the unspent remainder is refunded inside
   * the same reservation. Retryable failures keep the reservation open so
   * in-flight budget stays held until the final attempt.
   */
  private async settleBrewCostBudget(job: JobRecord, runs: readonly AiRunDraft[]): Promise<void> {
    const reservations = await this.repositories.targetedQueries.findReservationsByJobId(job.id);
    const costReservation = reservations.find(
      (reservation) => reservation.quotaKey === "brew_cost_units_per_day",
    );
    if (!costReservation || costReservation.status !== "reserved") return;
    const consumedUnits = runs.reduce(
      (sum, run) => sum + (Number.isFinite(run.telemetry.costUnits) ? run.telemetry.costUnits : 0),
      0,
    );
    await this.repositories.targetedQueries.settleQuotaReservation({
      reservationId: costReservation.id,
      consumedUnits: Math.max(0, consumedUnits),
      at: this.now(),
    });
    job.actualCostUnits = Math.max(0, consumedUnits);
    // Budget alert hooks (P05-R1.10): re-check usage after the actual AI-run
    // cost settles (the remainder refund can move usage across thresholds).
    const { windowStart, windowEnd } = utcDayWindow(this.clock());
    const usedAfterSettle = await this.repositories.targetedQueries.sumActiveQuotaUnits({
      userId: job.ownerUserId,
      quotaKey: "brew_cost_units_per_day",
      windowStart,
      windowEnd,
    });
    await this.checkBudgetAlerts({
      userId: job.ownerUserId,
      quotaKey: "brew_cost_units_per_day",
      windowStart,
      windowEnd,
      limitUnits: this.quotas.brewCostUnitsPerDay,
      usedUnits: usedAfterSettle,
    });
  }

  private recordAiRun(run: AiRunDraft, jobId: string): void {
    const telemetry = run.telemetry;
    this.repositories.aiRuns.append({
      id: createId("airun"),
      jobId,
      operation: run.operation,
      provider: telemetry.provider,
      modelId: telemetry.modelId,
      agentPipelineVersion: telemetry.agentPipelineVersion,
      promptTemplateVersions: [...telemetry.promptTemplateVersions],
      inputSchemaVersion: telemetry.inputSchemaVersion,
      outputSchemaVersion: telemetry.outputSchemaVersion,
      evidenceBundleHash: telemetry.evidenceBundleHash,
      inputTokens: telemetry.inputTokens,
      outputTokens: telemetry.outputTokens,
      costUnits: telemetry.costUnits,
      latencyMs: telemetry.latencyMs,
      finishReason: telemetry.finishReason,
      errorCode: telemetry.errorCode,
      createdAt: this.now(),
    });
  }

  async getBrewJob(actor: Actor, jobId: string): Promise<JsonRecord> {
    this.requireActiveUser(actor);
    const job = this.repositories.jobs.get(jobId);
    if (!job || job.ownerUserId !== actor.userId || job.jobType !== "brew_module") throw notFound();
    return await this.brewJobDto(jobId);
  }

  async getJob(actor: Actor, jobId: string): Promise<JsonRecord> {
    this.requireActiveUser(actor);
    const job = this.repositories.jobs.get(jobId);
    if (!job || job.ownerUserId !== actor.userId) throw notFound();
    return job.jobType === "brew_module" ? await this.brewJobDto(jobId) : this.jobDto(job);
  }

  /**
   * Find the next claimable queued Brew job (domain-level availability scan).
   * Claiming and processing happen in `beginBrewJobProcessing`.
   */
  findNextQueuedBrewJobId(): string | null {
    const nowMs = this.clock().getTime();
    const candidate = [...this.repositories.jobs.values()]
      .filter((job) => {
        if (job.jobType !== "brew_module") return false;
        if (["queued", "failed_retryable"].includes(job.status)) {
          return Date.parse(job.availableAt) <= nowMs;
        }
        return job.status === "running" && (!job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= nowMs);
      })
      .sort((a, b) => a.availableAt.localeCompare(b.availableAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
    return candidate ? candidate.id : null;
  }

  private requireOwnedJourney(actor: Actor, journeyId: string): JourneyRecord {
    const journey = this.repositories.journeys.get(journeyId);
    if (!journey || journey.ownerUserId !== actor.userId || journey.deletedAt || journey.status === "deleted") throw notFound();
    return journey;
  }

  private journeyDto(journey: JourneyRecord): JsonRecord {
    return {
      id: journey.id,
      projectId: journey.projectId,
      sourceCandidateId: journey.sourceCandidateId,
      upstreamModuleVersionId: journey.upstreamModuleVersionId,
      title: journey.title,
      goal: journey.goal,
      visibility: "private",
      status: journey.status,
      attribution: journey.attribution,
      version: journey.version,
      currentNodeId: journey.currentNodeId,
      createdAt: journey.createdAt,
      updatedAt: journey.updatedAt,
    };
  }

  private appendCommit(journey: JourneyRecord, actor: Actor, type: string, summary: string, payloadRef: JsonRecord = {}): void {
    const sequence = [...this.repositories.branchCommits.values()].filter((commit) => commit.journeyId === journey.id).length + 1;
    const commit = {
      id: createId("commit"),
      journeyId: journey.id,
      parentCommitId: journey.headCommitId,
      sequence,
      type,
      actorUserId: actor.userId,
      payloadRef,
      summary,
      createdAt: this.now(),
    };
    this.repositories.branchCommits.set(commit.id, commit);
    journey.headCommitId = commit.id;
    journey.updatedAt = commit.createdAt;
  }

  createJourney(actor: Actor, bodyValue: unknown, options: { idempotencyKey?: string } = {}): CommandResult<JsonRecord> {
    this.requireActiveUser(actor);
    const body = ensureRecord(bodyValue);
    const candidateId = requiredString(body, "candidateId", { maxLength: 128 });
    const moduleVersionId = optionalString(body, "moduleVersionId", { maxLength: 128 });
    const titleInput = optionalString(body, "title", { maxLength: 220 });
    const goalInput = optionalString(body, "goal", { maxLength: 500 });
    const ifExists = optionalEnum(body, "ifExists", ["return_existing", "create_new"] as const, "return_existing");
    const payload = { candidateId, moduleVersionId, title: titleInput, goal: goalInput, ifExists };

    const replay = this.findIdempotentReplay(actor, "createJourney", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.journeys.get(replay.resourceId);
      if (existing) return { data: this.journeyDto(existing), status: 200, replay: true };
    }

    const candidate = this.repositories.candidates.get(candidateId);
    if (!candidate || candidate.status !== "eligible") throw notFound();
    const project = this.requireOwnedProject(actor, candidate.projectId);
    if (candidate.projectId !== project.id) throw notFound();
    if (moduleVersionId && moduleVersionId !== candidate.moduleVersionId) {
      throw unprocessable("CANDIDATE_MODULE_MISMATCH", "Candidate và ModuleVersion không khớp", "Hãy tải lại Output Explorer trước khi Fork.");
    }
    const version = this.requireVisibleModuleVersion(actor, candidate.moduleVersionId);

    if (ifExists === "return_existing") {
      const existing = [...this.repositories.journeys.values()].find(
        (journey) => journey.ownerUserId === actor.userId && journey.upstreamModuleVersionId === version.id && journey.status === "active" && !journey.deletedAt,
      );
      if (existing) return { data: this.journeyDto(existing), status: 200, replay: true };
    }

    const now = this.now();
    const journey: JourneyRecord = {
      id: createId("jrn"),
      ownerUserId: actor.userId,
      projectId: project.id,
      sourceCandidateId: candidate.id,
      upstreamModuleVersionId: version.id,
      parentJourneyId: null,
      title: titleInput ?? truncateText(`${candidate.title} — hành trình của tôi`, 220),
      goal: goalInput ?? project.goal,
      status: "active",
      attribution: {
        displayName: String((version.graph.provenance.attribution as JsonRecord | undefined)?.displayName ?? "GON"),
        upstreamModuleVersionId: version.id,
        sourceCandidateId: candidate.id,
      },
      headCommitId: null,
      currentNodeId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.repositories.journeys.set(journey.id, journey);
    this.appendCommit(journey, actor, "fork_created", `Fork từ ${version.title}`, {
      upstreamModuleVersionId: version.id,
      sourceCandidateId: candidate.id,
    });
    for (const concept of version.graph.module.concepts) {
      this.upsertMastery(actor.userId, concept.id, "exposed", null);
    }
    journey.currentNodeId = this.computeCurrentNodeId(journey, version.graph);
    this.emit(actor, "journey.created", "journey_branch", journey.id, {
      projectId: project.id,
      upstreamModuleVersionId: version.id,
      sourceCandidateId: candidate.id,
    });
    this.saveIdempotentResult(actor, "createJourney", options.idempotencyKey, payload, "journey_branch", journey.id, 201);
    return { data: this.journeyDto(journey), status: 201 };
  }

  listJourneys(actor: Actor, query: { limit?: number; cursor?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const journeys = [...this.repositories.journeys.values()]
      .filter((journey) => journey.ownerUserId === actor.userId && !journey.deletedAt && journey.status !== "deleted")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return this.paginate(journeys, query.limit ?? 20, query.cursor, (journey) => this.journeyDto(journey));
  }

  getJourney(actor: Actor, journeyId: string): JsonRecord {
    this.requireActiveUser(actor);
    return this.journeyDto(this.requireOwnedJourney(actor, journeyId));
  }

  listJourneyCommits(actor: Actor, journeyId: string, query: { limit?: number; cursor?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const journey = this.requireOwnedJourney(actor, journeyId);
    const commits = [...this.repositories.branchCommits.values()]
      .filter((commit) => commit.journeyId === journey.id)
      .sort((a, b) => a.sequence - b.sequence);
    return this.paginate(commits, query.limit ?? 20, query.cursor, (commit) => ({
      id: commit.id,
      journeyId: commit.journeyId,
      sequence: commit.sequence,
      type: commit.type,
      summary: commit.summary,
      createdAt: commit.createdAt,
    }));
  }

  private passedAttemptNodeIds(journeyId: string): Set<string> {
    return new Set(
      [...this.repositories.attempts.values()]
        .filter((attempt) => attempt.journeyId === journeyId && attempt.status === "passed")
        .map((attempt) => attempt.nodeId),
    );
  }

  private assessmentPrerequisites(graph: ModuleGraph, nodeId: string): string[] {
    const assessedNodeIds = new Set(graph.nodes.filter((node) => node.assessment).map((node) => node.id));
    return graph.edges
      .filter((edge) => edge.toNodeId === nodeId && edge.type === "prerequisite" && assessedNodeIds.has(edge.fromNodeId))
      .map((edge) => edge.fromNodeId);
  }

  private computeCurrentNodeId(journey: JourneyRecord, graph: ModuleGraph): string | null {
    const passed = this.passedAttemptNodeIds(journey.id);
    for (const node of graph.nodes) {
      if (!node.assessment || passed.has(node.id)) continue;
      const prerequisites = this.assessmentPrerequisites(graph, node.id);
      if (prerequisites.every((prerequisite) => passed.has(prerequisite))) return node.id;
    }
    return null;
  }

  private attemptDto(attempt: AttemptRecord): JsonRecord {
    return {
      id: attempt.id,
      journeyId: attempt.journeyId,
      moduleVersionId: attempt.moduleVersionId,
      nodeId: attempt.nodeId,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      answerText: attempt.answerText,
      artifactIds: attempt.artifactIds,
      rubricId: attempt.rubricId,
      rubricVersion: attempt.rubricVersion,
      assessment: attempt.assessment,
      xpAwarded: attempt.xpAwarded,
      version: attempt.version,
      sourceDisclosure: attempt.sourceDisclosure,
      aiAssistanceDisclosure: attempt.aiAssistanceDisclosure,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      submittedAt: attempt.submittedAt,
    };
  }

  getJourneyPlayer(actor: Actor, journeyId: string): JsonRecord {
    this.requireActiveUser(actor);
    const journey = this.requireOwnedJourney(actor, journeyId);
    const version = this.requireVisibleModuleVersion(actor, journey.upstreamModuleVersionId);
    const attempts = [...this.repositories.attempts.values()]
      .filter((attempt) => attempt.journeyId === journey.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const passed = this.passedAttemptNodeIds(journey.id);
    const submittedNodeIds = new Set(attempts.filter((attempt) => attempt.status !== "draft").map((attempt) => attempt.nodeId));
    journey.currentNodeId = this.computeCurrentNodeId(journey, version.graph);

    const nodeStates = version.graph.nodes.map((node) => {
      const prerequisites = this.assessmentPrerequisites(version.graph, node.id);
      const unmet = prerequisites.filter((prerequisite) => !passed.has(prerequisite));
      let status: string;
      if (node.assessment && passed.has(node.id)) status = "completed";
      else if (node.id === journey.currentNodeId) status = "current";
      else if (!node.assessment) status = "available";
      else if (unmet.length === 0) status = "available";
      else status = "locked";
      return {
        id: node.id,
        status,
        lockedReason: status === "locked" ? `requires_passed_attempt:${unmet.join(",")}` : null,
      };
    });

    const mastery = version.graph.module.concepts.map((concept) => {
      const record = this.repositories.mastery.get(`${actor.userId}:${concept.id}`);
      return record ? this.masteryDto(record) : { conceptId: concept.id, level: "exposed", evidenceAttemptId: null, achievedAt: null, reviewDueAt: null };
    });

    return {
      journey: this.journeyDto(journey),
      playerGraph: toPlayerGraph(version.graph, submittedNodeIds),
      currentNodeId: journey.currentNodeId,
      nodeStates,
      attempts: attempts.map((attempt) => this.attemptDto(attempt)),
      mastery,
    };
  }

  createAttempt(actor: Actor, journeyId: string, bodyValue: unknown, options: { idempotencyKey?: string } = {}): CommandResult<JsonRecord> {
    this.requireActiveUser(actor);
    const journey = this.requireOwnedJourney(actor, journeyId);
    if (journey.status === "archived") throw conflict("INVALID_STATE_TRANSITION", "Journey đã archived", "Hãy khôi phục journey trước khi tạo attempt mới.");
    const body = ensureRecord(bodyValue);
    const nodeId = requiredString(body, "nodeId", { maxLength: 128 });
    const payload = { journeyId, nodeId };
    const replay = this.findIdempotentReplay(actor, "createAttempt", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.attempts.get(replay.resourceId);
      if (existing) return { data: this.attemptDto(existing), status: 201, replay: true };
    }

    const version = this.requireVisibleModuleVersion(actor, journey.upstreamModuleVersionId);
    const node = version.graph.nodes.find((item) => item.id === nodeId);
    if (!node) throw notFound("Node không thuộc module của journey này.");
    if (!node.assessment) throw unprocessable("NODE_NOT_ASSESSABLE", "Node này không có bài nộp", "Concept node chỉ để đọc; hãy tạo attempt cho Retrieval, Transfer hoặc Boss Proof.");
    const passed = this.passedAttemptNodeIds(journey.id);
    const prerequisites = this.assessmentPrerequisites(version.graph, node.id);
    if (!prerequisites.every((prerequisite) => passed.has(prerequisite))) {
      throw conflict("NODE_LOCKED", "Node đang bị khóa", "Hãy đạt các node prerequisite trước khi mở node này.");
    }
    const rubric = version.graph.rubrics.find((item) => item.id === node.assessment?.rubricId);
    if (!rubric) throw unprocessable("RUBRIC_NOT_FOUND", "Module thiếu rubric", "ModuleVersion không hợp lệ cho assessment.");
    const attemptNumber = [...this.repositories.attempts.values()].filter((attempt) => attempt.journeyId === journey.id && attempt.nodeId === nodeId).length + 1;
    const now = this.now();
    const attempt: AttemptRecord = {
      id: createId("att"),
      journeyId: journey.id,
      ownerUserId: actor.userId,
      moduleVersionId: version.id,
      nodeId,
      attemptNumber,
      status: "draft",
      answerText: null,
      artifactIds: [],
      sourceDisclosure: {},
      aiAssistanceDisclosure: {},
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      assessment: null,
      xpAwarded: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };
    this.repositories.attempts.set(attempt.id, attempt);
    this.saveIdempotentResult(actor, "createAttempt", options.idempotencyKey, payload, "learning_attempt", attempt.id, 201);
    return { data: this.attemptDto(attempt), status: 201 };
  }

  private requireOwnedAttempt(actor: Actor, journeyId: string, attemptId: string): { journey: JourneyRecord; attempt: AttemptRecord } {
    const journey = this.requireOwnedJourney(actor, journeyId);
    const attempt = this.repositories.attempts.get(attemptId);
    if (!attempt || attempt.journeyId !== journey.id || attempt.ownerUserId !== actor.userId) throw notFound();
    return { journey, attempt };
  }

  updateAttempt(
    actor: Actor,
    journeyId: string,
    attemptId: string,
    bodyValue: unknown,
    options: { ifMatchVersion?: number } = {},
  ): JsonRecord {
    this.requireActiveUser(actor);
    const { attempt } = this.requireOwnedAttempt(actor, journeyId, attemptId);
    if (attempt.status !== "draft") {
      throw conflict("INVALID_STATE_TRANSITION", "Attempt đã khóa", "Attempt đã nộp không thể sửa; hãy tạo attempt mới nếu cần làm lại.");
    }
    if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== attempt.version) {
      throw conflict("RESOURCE_VERSION_CONFLICT", "Nháp đã thay đổi ở nơi khác", "Hãy tải lại attempt trước khi lưu tiếp.");
    }
    const body = ensureRecord(bodyValue);
    if (body.answerText !== undefined) {
      if (typeof body.answerText !== "string" || body.answerText.length > 100_000) throw validationError("answerText vượt giới hạn.");
      attempt.answerText = body.answerText;
    }
    if (body.artifactIds !== undefined) {
      const artifactIds = stringArray(body, "artifactIds", { maxItems: 20 });
      for (const artifactId of artifactIds) this.requireOwnedArtifact(actor, artifactId);
      attempt.artifactIds = artifactIds;
    }
    attempt.sourceDisclosure = optionalRecord(body, "sourceDisclosure");
    attempt.aiAssistanceDisclosure = optionalRecord(body, "aiAssistanceDisclosure");
    attempt.version += 1;
    attempt.updatedAt = this.now();
    return this.attemptDto(attempt);
  }

  getAttempt(actor: Actor, journeyId: string, attemptId: string): JsonRecord {
    this.requireActiveUser(actor);
    return this.attemptDto(this.requireOwnedAttempt(actor, journeyId, attemptId).attempt);
  }

  private upsertMastery(userId: string, conceptId: string, level: MasteryLevel, evidenceAttemptId: string | null): void {
    const key = `${userId}:${conceptId}`;
    const existing = this.repositories.mastery.get(key);
    if (existing && MASTERY_ORDER[existing.level] > MASTERY_ORDER[level]) {
      existing.lastEvidenceAt = this.now();
      existing.version += 1;
      return;
    }
    const achievedAt = existing?.level === level ? existing.achievedAt : this.now();
    this.repositories.mastery.set(key, {
      userId,
      conceptId,
      level,
      evidenceAttemptId: evidenceAttemptId ?? existing?.evidenceAttemptId ?? null,
      achievedAt,
      lastEvidenceAt: this.now(),
      reviewDueAt: new Date(this.clock().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      version: (existing?.version ?? 0) + 1,
    });
  }

  private lifetimeXp(userId: string): number {
    return [...this.repositories.xpLedger.values()]
      .filter((entry) => entry.userId === userId)
      .reduce((sum, entry) => sum + entry.delta, 0);
  }

  private postXpForPassedAttempt(actor: Actor, journey: JourneyRecord, attempt: AttemptRecord, ruleId: string | undefined): number {
    if (!ruleId || !(ruleId in XP_RULE_VALUES)) return 0;
    const delta = XP_RULE_VALUES[ruleId];
    const sourceEventId = `evt_${stableHash({
      userId: actor.userId,
      journeyId: journey.id,
      nodeId: attempt.nodeId,
      rubricId: attempt.rubricId,
      rubricVersion: attempt.rubricVersion,
      ruleId,
    }).slice(0, 40)}`;
    const existing = [...this.repositories.xpLedger.values()].find(
      (entry) => entry.userId === actor.userId && entry.sourceEventId === sourceEventId && entry.status === "posted",
    );
    if (existing) return 0;

    const lifetimeXpAfter = this.lifetimeXp(actor.userId) + delta;
    if (lifetimeXpAfter < 0) {
      throw conflict("XP_LEDGER_INCONSISTENT", "XP Ledger không nhất quán", "Transaction XP bị chặn vì Lifetime XP sẽ âm.");
    }
    const entry = {
      id: createId("xp"),
      userId: actor.userId,
      sequence: this.repositories.nextXpSequence(actor.userId),
      delta,
      sourceEventId,
      sourceType: "learning_attempt",
      sourceId: attempt.id,
      ruleVersion: ruleId,
      formulaVersion: "gon-level-v1" as const,
      status: "posted" as const,
      reversesEntryId: null,
      reasonCode: null,
      lifetimeXpAfter,
      createdAt: this.now(),
    };
    this.repositories.xpLedger.set(entry.id, entry);
    this.emit(actor, "xp.entry.posted", "xp_ledger_entry", entry.id, {
      attemptId: attempt.id,
      journeyId: journey.id,
      nodeId: attempt.nodeId,
      delta,
      ruleVersion: ruleId,
    });
    return delta;
  }

  private createSystemProof(actor: Actor, journey: JourneyRecord, attempt: AttemptRecord, version: ModuleVersionRecord): ProofRecord {
    const existing = [...this.repositories.proofs.values()].find(
      (proof) => proof.ownerUserId === actor.userId && proof.attemptId === attempt.id && proof.verificationLevel === "system_recorded" && !proof.deletedAt,
    );
    if (existing) return existing;
    const now = this.now();
    const proof: ProofRecord = {
      id: createId("proof"),
      ownerUserId: actor.userId,
      proofType: "boss_proof",
      title: `Boss Proof — ${version.title}`,
      description: "Artifact Boss Proof đạt rubric trong GON và được liên kết với Journey Branch.",
      journeyId: journey.id,
      attemptId: attempt.id,
      artifactIds: attempt.artifactIds,
      issuerDisplayName: "GON",
      externalReference: null,
      verificationLevel: "system_recorded",
      status: "active",
      proves: [
        "Người học đã nộp artifact và đạt rubric của Boss Proof trong hệ thống GON.",
        "Proof liên kết tới journey, attempt và rubric version đã chấm.",
      ],
      doesNotProve: [
        "Không chứng minh danh tính pháp lý hoặc bằng cấp bên ngoài.",
        "Không phải chứng nhận do issuer bên ngoài cấp.",
      ],
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.repositories.proofs.set(proof.id, proof);
    this.emit(actor, "proof.created", "proof", proof.id, {
      journeyId: journey.id,
      attemptId: attempt.id,
      verificationLevel: proof.verificationLevel,
    });
    return proof;
  }

  async submitAttempt(
    actor: Actor,
    journeyId: string,
    attemptId: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<SubmitAttemptPhaseOne> {
    this.requireActiveUser(actor);
    await this.enforceUserRateLimit(actor, "write", options.idempotencyKey);
    const { journey, attempt } = this.requireOwnedAttempt(actor, journeyId, attemptId);
    if (attempt.status !== "draft") {
      return { kind: "settled", result: { data: this.attemptDto(attempt), status: 200, replay: true } };
    }
    const payload = { journeyId, attemptId, version: attempt.version, answerHash: sha256Hex(attempt.answerText ?? "") };
    const replay = this.findIdempotentReplay(actor, "submitAttempt", options.idempotencyKey, payload);
    if (replay) return { kind: "settled", result: { data: this.attemptDto(attempt), status: 200, replay: true } };

    if (!attempt.answerText || attempt.answerText.trim().length === 0) {
      throw validationError("Cần nhập bài làm trước khi nộp.", [
        { field: "answerText", code: "required", message: "Bài làm không được để trống." },
      ]);
    }

    const version = this.requireVisibleModuleVersion(actor, journey.upstreamModuleVersionId);
    const node = version.graph.nodes.find((item) => item.id === attempt.nodeId);
    const rubric = version.graph.rubrics.find((item) => item.id === attempt.rubricId && item.version === attempt.rubricVersion);
    if (!node || !rubric || !node.assessment) {
      throw unprocessable("ASSESSMENT_CONTRACT_INVALID", "Module thiếu node/rubric để chấm", "Hãy báo cáo module này để reviewer kiểm tra.");
    }

    const job = this.createJob({
      actor,
      jobType: "assess_attempt",
      aggregateType: "learning_attempt",
      aggregateId: attempt.id,
      idempotencyKey: options.idempotencyKey,
      payload: { journeyId: journey.id, nodeId: attempt.nodeId, rubricId: rubric.id, rubricVersion: rubric.version },
    });
    this.startJob(job, "assess_attempt");
    attempt.status = "submitted";
    attempt.submittedAt = this.now();
    attempt.updatedAt = attempt.submittedAt;
    attempt.status = "assessing";
    this.emit(actor, "learning.attempt.submitted", "learning_attempt", attempt.id, {
      journeyId: journey.id,
      nodeId: attempt.nodeId,
    }, job.id);

    const sourceTexts = this.projectArtifacts(journey.projectId)
      .flatMap((artifact) => this.artifactChunks(artifact.id))
      .slice(0, 4)
      .map((chunk) => chunk.text);
    const assessment = assessAttemptDeterministically({
      node,
      rubric,
      answerText: attempt.answerText,
      artifactIds: attempt.artifactIds,
      sourceDisclosure: attempt.sourceDisclosure,
      aiAssistanceDisclosure: attempt.aiAssistanceDisclosure,
      sourceTexts,
    });
    // P03 §8: deterministic rules first. Only unresolved rubric criteria go
    // to the AI assessor — that provider call runs OUTSIDE this Unit of Work
    // (R1.5 rule), orchestrated by the GonService wrapper.
    const wantsAiAssessment =
      assessment.decision === "pending_human_review" && assessment.integritySignals.length === 0;
    if (wantsAiAssessment) {
      attempt.assessment = assessment;
      attempt.updatedAt = this.now();
      return {
        kind: "assess_ai",
        work: {
          actor,
          journeyId: journey.id,
          attemptId: attempt.id,
          jobId: job.id,
          idempotencyKey: options.idempotencyKey,
          payload,
          deterministic: assessment,
          work: {
            contractInput: {
              schemaVersion: ASSESS_ATTEMPT_INPUT_SCHEMA_VERSION,
              attemptId: attempt.id,
              node: node as unknown as JsonRecord,
              rubric: rubric as unknown as JsonRecord,
              answer: { text: attempt.answerText ?? "", artifactSummaries: [] },
            },
            local: {
              node,
              rubric,
              answerText: attempt.answerText ?? "",
              artifactIds: attempt.artifactIds,
              sourceDisclosure: attempt.sourceDisclosure,
              aiAssistanceDisclosure: attempt.aiAssistanceDisclosure,
              sourceTexts,
            },
          },
        },
      };
    }

    attempt.assessment = assessment;
    attempt.status = assessment.decision;
    attempt.updatedAt = this.now();
    this.applyAssessmentAndAdvance(actor, journey, attempt, node, version, rubric, assessment, job.id);
    this.succeedJob(job, "assessment_recorded");
    this.saveIdempotentResult(actor, "submitAttempt", options.idempotencyKey, payload, "learning_attempt", attempt.id, 202);
    return { kind: "settled", result: { data: this.attemptDto(attempt), status: 202 } };
  }

  /** Apply a settled assessment: XP/mastery/proofs and journey advancement. */
  private applyAssessmentAndAdvance(
    actor: Actor,
    journey: JourneyRecord,
    attempt: AttemptRecord,
    node: ModuleGraphNode,
    version: ModuleVersionRecord,
    rubric: ModuleGraphRubric,
    assessment: AssessmentResult,
    jobId: string,
  ): void {
    if (node.type === "boss_proof") {
      this.appendCommit(journey, actor, "boss_submitted", "Đã nộp Boss Proof", { attemptId: attempt.id });
    }

    if (assessment.decision === "passed") {
      for (const conceptId of node.conceptIds) {
        this.upsertMastery(actor.userId, conceptId, node.assessment!.masteryTarget, attempt.id);
      }
      attempt.xpAwarded = this.postXpForPassedAttempt(actor, journey, attempt, rubric.xpRuleId);
      this.appendCommit(journey, actor, "attempt_passed", `Đạt node ${node.title}`, {
        attemptId: attempt.id,
        nodeId: node.id,
        xpAwarded: attempt.xpAwarded,
      });
      this.emit(actor, "learning.attempt.passed", "learning_attempt", attempt.id, {
        journeyId: journey.id,
        nodeId: node.id,
        rubricVersion: rubric.version,
      }, jobId);
      this.emit(actor, "mastery.changed", "journey_branch", journey.id, {
        nodeId: node.id,
        masteryTarget: node.assessment!.masteryTarget,
      }, jobId);

      if (node.type === "boss_proof") {
        const proof = this.createSystemProof(actor, journey, attempt, version);
        this.appendCommit(journey, actor, "proof_recorded", "Đã ghi System-recorded Proof vào Proof Vault", {
          proofId: proof.id,
          attemptId: attempt.id,
        });
      }

      const passed = this.passedAttemptNodeIds(journey.id);
      const requiredAssessedNodes = version.graph.nodes.filter(
        (item) => item.assessment && item.assessment.requiredForCompletion !== false,
      );
      const hasBossPassed = version.graph.nodes.some((item) => item.type === "boss_proof" && passed.has(item.id));
      if (hasBossPassed && requiredAssessedNodes.every((item) => passed.has(item.id))) {
        journey.status = "completed";
      }
    } else if (assessment.decision === "needs_revision") {
      this.emit(actor, "learning.attempt.needs_revision", "learning_attempt", attempt.id, {
        journeyId: journey.id,
        nodeId: node.id,
      }, jobId);
    }

    journey.currentNodeId = this.computeCurrentNodeId(journey, version.graph);
    journey.version += 1;
    journey.updatedAt = this.now();
  }

  /** Merge an AI rubric assessment with the deterministic first pass (P03 §8). */
  private mergeAiAssessment(
    deterministic: AssessmentResult,
    output: AssessAttemptOutput,
    telemetry: AiCallTelemetry,
  ): AssessmentResult {
    // P03: confidence < 0.70 must stay pending human review; AI never
    // auto-upgrades proofs and never concludes fraud from similarity alone.
    const decision: AssessmentResult["decision"] =
      output.confidence < 0.7 ? "pending_human_review" : output.decision;
    return {
      decision,
      criteria: output.criteria.map((item) => ({
        criterionId: item.criterionId,
        passed: item.passed,
        feedback: item.feedback,
      })),
      feedback: output.feedback || deterministic.feedback,
      confidence: output.confidence,
      assessorType: "ai",
      assessorVersion: telemetry.agentPipelineVersion,
      integritySignals: [
        ...deterministic.integritySignals,
        ...(output.integritySignals ?? []).filter(
          (signal) => !deterministic.integritySignals.includes(signal),
        ),
      ],
    };
  }

  /** Phase 3 of AI-assisted submission: settle the attempt in a fresh UoW. */
  async finishAttemptAiAssessment(
    workPackage: AttemptAssessWorkPackage,
    outcome: AttemptAssessOutcome,
    runs: readonly AiRunDraft[],
  ): Promise<CommandResult<JsonRecord>> {
    const { actor, journeyId, attemptId, jobId } = workPackage;
    const journey = this.repositories.journeys.get(journeyId);
    const attempt = this.repositories.attempts.get(attemptId);
    const job = this.repositories.jobs.get(jobId);
    if (!journey || !attempt || !job) throw notFound();
    for (const run of runs) this.recordAiRun(run, job.id);

    let assessment = workPackage.deterministic;
    if (outcome.kind === "assessed") {
      assessment = this.mergeAiAssessment(workPackage.deterministic, outcome.output, outcome.telemetry);
    }
    // provider_error keeps the deterministic pending_human_review outcome:
    // fail-closed, no XP without an assessment decision.
    attempt.assessment = assessment;
    attempt.status = assessment.decision;
    attempt.updatedAt = this.now();

    const version = this.requireVisibleModuleVersion(actor, journey.upstreamModuleVersionId);
    const node = version.graph.nodes.find((item) => item.id === attempt.nodeId);
    const rubric = version.graph.rubrics.find(
      (item) => item.id === attempt.rubricId && item.version === attempt.rubricVersion,
    );
    if (!node || !rubric || !node.assessment) {
      throw unprocessable("ASSESSMENT_CONTRACT_INVALID", "Module thiếu node/rubric để chấm", "Hãy báo cáo module này để reviewer kiểm tra.");
    }
    this.applyAssessmentAndAdvance(actor, journey, attempt, node, version, rubric, assessment, job.id);
    this.succeedJob(job, "assessment_recorded");
    this.saveIdempotentResult(
      actor,
      "submitAttempt",
      workPackage.idempotencyKey,
      workPackage.payload,
      "learning_attempt",
      attempt.id,
      202,
    );
    return { data: this.attemptDto(attempt), status: 202 };
  }

  getMyProgress(actor: Actor): JsonRecord {
    this.requireActiveUser(actor);
    return this.progressDto(actor.userId);
  }

  listMyXpLedger(actor: Actor, query: { limit?: number; cursor?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const entries = [...this.repositories.xpLedger.values()]
      .filter((entry) => entry.userId === actor.userId)
      .sort((a, b) => b.sequence - a.sequence);
    return this.paginate(entries, query.limit ?? 20, query.cursor, (entry) => ({
      id: entry.id,
      delta: entry.delta,
      sourceEventId: entry.sourceEventId,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      ruleVersion: entry.ruleVersion,
      formulaVersion: entry.formulaVersion,
      status: entry.status,
      reversesEntryId: entry.reversesEntryId,
      createdAt: entry.createdAt,
    }));
  }

  private proofDto(proof: ProofRecord): JsonRecord {
    return {
      id: proof.id,
      proofType: proof.proofType,
      title: proof.title,
      description: proof.description,
      journeyId: proof.journeyId,
      attemptId: proof.attemptId,
      artifactIds: proof.artifactIds,
      issuerDisplayName: proof.issuerDisplayName,
      externalReference: proof.externalReference,
      verificationLevel: proof.verificationLevel,
      status: proof.status,
      visibility: "private",
      proves: proof.proves,
      doesNotProve: proof.doesNotProve,
      version: proof.version,
      createdAt: proof.createdAt,
      updatedAt: proof.updatedAt,
    };
  }

  listProofs(actor: Actor, query: { limit?: number; cursor?: string; verificationLevel?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const proofs = [...this.repositories.proofs.values()]
      .filter((proof) => proof.ownerUserId === actor.userId && !proof.deletedAt && proof.status !== "deleted")
      .filter((proof) => !query.verificationLevel || proof.verificationLevel === query.verificationLevel)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.paginate(proofs, query.limit ?? 20, query.cursor, (proof) => this.proofDto(proof));
  }

  createExternalProof(actor: Actor, bodyValue: unknown, options: { idempotencyKey?: string } = {}): CommandResult<JsonRecord> {
    this.requireActiveUser(actor);
    const body = ensureRecord(bodyValue);
    const proofType = requiredString(body, "proofType", { maxLength: 100 });
    const title = requiredString(body, "title", { maxLength: 220 });
    const description = optionalString(body, "description", { maxLength: 2000 }) ?? null;
    const journeyId = optionalString(body, "journeyId", { maxLength: 128 }) ?? null;
    const externalUri = optionalString(body, "externalUri", { maxLength: 4096 }) ?? null;
    const issuerDisplayName = optionalString(body, "issuerDisplayName", { maxLength: 200 }) ?? null;
    const artifactIds = stringArray(body, "artifactIds", { maxItems: 20 });
    const payload = { proofType, title, description, journeyId, externalUri, issuerDisplayName, artifactIds };

    const replay = this.findIdempotentReplay(actor, "createExternalProof", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.proofs.get(replay.resourceId);
      if (existing) return { data: this.proofDto(existing), status: 201, replay: true };
    }
    if (journeyId) this.requireOwnedJourney(actor, journeyId);
    for (const artifactId of artifactIds) this.requireOwnedArtifact(actor, artifactId);
    let externalReference: string | null = null;
    if (externalUri) {
      const parsed = assertPublicHttpUrl(externalUri);
      externalReference = parsed.toString();
    }

    const verificationLevel = externalReference || artifactIds.length > 0 ? "source_linked" : "self_declared";
    const now = this.now();
    const proof: ProofRecord = {
      id: createId("proof"),
      ownerUserId: actor.userId,
      proofType,
      title,
      description,
      journeyId,
      attemptId: null,
      artifactIds,
      issuerDisplayName,
      externalReference,
      verificationLevel,
      status: "active",
      proves: verificationLevel === "source_linked"
        ? ["Người dùng đã liên kết một nguồn/artifact với tuyên bố học tập này trong Proof Vault."]
        : ["Người dùng tự khai bằng chứng này trong Proof Vault."],
      doesNotProve: [
        "GON chưa xác minh issuer hoặc tính xác thực của nguồn bên ngoài.",
        "Proof này không tự động trở thành Issuer-verified chỉ vì có link hoặc ảnh chứng chỉ.",
      ],
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.repositories.proofs.set(proof.id, proof);
    this.emit(actor, "proof.created", "proof", proof.id, {
      proofType,
      verificationLevel,
      journeyId,
    });
    this.saveIdempotentResult(actor, "createExternalProof", options.idempotencyKey, payload, "proof", proof.id, 201);
    return { data: this.proofDto(proof), status: 201 };
  }

  getProof(actor: Actor, proofId: string): JsonRecord {
    this.requireActiveUser(actor);
    const proof = this.repositories.proofs.get(proofId);
    if (!proof || proof.ownerUserId !== actor.userId || proof.deletedAt || proof.status === "deleted") throw notFound();
    return this.proofDto(proof);
  }

  createReport(actor: Actor, bodyValue: unknown, options: { idempotencyKey?: string } = {}): CommandResult<JsonRecord> {
    this.requireActiveUser(actor);
    const body = ensureRecord(bodyValue);
    const targetType = requiredEnum(body, "targetType", [
      "module_version",
      "output_candidate",
      "proof",
      "source_artifact",
      "user_behavior",
    ] as const);
    const targetId = requiredString(body, "targetId", { maxLength: 160 });
    const targetVersion = optionalString(body, "targetVersion", { maxLength: 160 }) ?? null;
    const reasonCode = requiredString(body, "reasonCode", { maxLength: 120 });
    const detail = optionalString(body, "detail", { maxLength: 2000 }) ?? null;
    const payload = { targetType, targetId, targetVersion, reasonCode, detail };

    const replay = this.findIdempotentReplay(actor, "createReport", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.repositories.reports.get(replay.resourceId);
      if (existing) return { data: this.reportDto(existing), status: 201, replay: true };
    }

    if (targetType === "module_version") this.requireVisibleModuleVersion(actor, targetId);
    if (targetType === "output_candidate") {
      const candidate = this.repositories.candidates.get(targetId);
      if (!candidate) throw notFound();
      this.requireOwnedProject(actor, candidate.projectId);
    }
    if (targetType === "proof") this.getProof(actor, targetId);
    if (targetType === "source_artifact") this.requireOwnedArtifact(actor, targetId);

    const report = {
      id: createId("rpt"),
      reporterUserId: actor.userId,
      targetType,
      targetId,
      targetVersion,
      reasonCode,
      detail,
      status: "received" as const,
      createdAt: this.now(),
    };
    this.repositories.reports.set(report.id, report);
    const riskText = normalizeForSearch(`${reasonCode} ${detail ?? ""}`);
    const riskLevel = /(child|self harm|suicide|weapon|violence|malware|tre em|tu tu|vu khi|bao luc)/.test(riskText)
      ? "high"
      : /(copyright|privacy|cheat|fraud|ban quyen|rieng tu|gian lan)/.test(riskText)
        ? "normal"
        : "low";
    const reviewCase = {
      id: createId("case"),
      reportId: report.id,
      riskLevel: riskLevel as "low" | "normal" | "high",
      status: "open",
      assigneeUserId: null,
      createdAt: report.createdAt,
    };
    this.repositories.reviewCases.set(reviewCase.id, reviewCase);
    this.emit(actor, "report.created", "report", report.id, { targetType, targetId, reasonCode });
    this.Audit(actor, "report.created", "report", report.id, reasonCode);
    this.saveIdempotentResult(actor, "createReport", options.idempotencyKey, payload, "report", report.id, 201);
    return { data: this.reportDto(report), status: 201 };
  }

  private reportDto(report: { id: string; targetType: string; targetId: string; status: string; createdAt: string }): JsonRecord {
    return {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  getReport(actor: Actor, reportId: string): JsonRecord {
    this.requireActiveUser(actor);
    const report = this.repositories.reports.get(reportId);
    const isOperator = actor.roles.includes("reviewer") || actor.roles.includes("admin");
    if (!report || (report.reporterUserId !== actor.userId && !isOperator)) throw notFound();
    return this.reportDto(report);
  }
}

/**
 * Transactional application-service facade.
 *
 * Every public use case runs in exactly one Unit of Work. The domain core is
 * instantiated with that Unit of Work's repositories; nested facade calls in
 * an explicitly composed operation join the same transaction through
 * AsyncLocalStorage instead of opening a second transaction.
 */
export class GonService {
  readonly store: GonStore;

  private readonly objectStorage?: ObjectStorage;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly requireInvite?: boolean;
  private readonly brewExecutionMode?: BrewExecutionMode;
  private readonly brewAiProvider?: BrewAiProvider;
  private readonly featureFlags?: Record<string, boolean>;
  private readonly contentSafetyScanner?: ContentSafetyScanner;
  private readonly urlFetcher?: SafeUrlFetcher;
  private readonly now?: () => Date;
  private readonly quotas?: GonServiceOptions["quotas"];
  /**
   * Shared across every Unit-of-Work core: token buckets and flood strikes
   * must survive the per-transaction core instances (P05-R1.10).
   */
  private readonly abuseControls: AbuseController;
  private readonly budgetAlertSink?: BudgetAlertSink;
  private readonly coreContext = new AsyncLocalStorage<GonServiceCore>();

  constructor(options: GonServiceOptions = {}) {
    this.store = options.store ?? new MemoryGonStore();
    this.objectStorage = options.objectStorage;
    this.embeddingProvider = options.embeddingProvider ?? createEmbeddingProvider();
    this.requireInvite = options.requireInvite;
    this.brewExecutionMode = options.brewExecutionMode;
    if (this.brewExecutionMode !== undefined && !["inline", "queued"].includes(this.brewExecutionMode)) {
      throw new Error(`Unsupported Brew execution mode: ${String(this.brewExecutionMode)}`);
    }
    this.brewAiProvider = options.brewAiProvider;
    this.featureFlags = options.featureFlags;
    this.contentSafetyScanner = options.contentSafetyScanner;
    this.urlFetcher = options.urlFetcher;
    this.now = options.now;
    this.quotas = options.quotas;
    this.abuseControls = options.abuseControls ?? new AbuseController({ store: new MemoryAbuseStateStore() });
    this.budgetAlertSink = options.budgetAlertSink;
  }

  private async run<T>(work: (core: GonServiceCore) => T | Promise<T>): Promise<T> {
    const existing = this.coreContext.getStore();
    if (existing) return work(existing);

    return this.store.runInTransaction(async (repositories) => {
      const core = new GonServiceCore({
        repositories,
        objectStorage: this.objectStorage,
        embeddingProvider: this.embeddingProvider,
        requireInvite: this.requireInvite,
        brewExecutionMode: this.brewExecutionMode,
        brewAiProvider: this.brewAiProvider,
        featureFlags: this.featureFlags,
        contentSafetyScanner: this.contentSafetyScanner,
        urlFetcher: this.urlFetcher,
        now: this.now,
        quotas: this.quotas,
        abuseControls: this.abuseControls,
        budgetAlertSink: this.budgetAlertSink,
      });
      return this.coreContext.run(core, async () => work(core));
    });
  }

  async runInTransaction<T>(work: (service: this) => Promise<T>): Promise<T> {
    return this.run(() => work(this));
  }

  async ensureIdentityUser(input: {
    provider: "google" | "dev";
    providerSubject: string;
    email?: string | null;
    displayName?: string | null;
    authUserId?: string | number;
  }): Promise<UserRecord> {
    return this.run((core) => core.ensureIdentityUser(input));
  }

  async ensureGoogleUser(input: {
    providerSubject: string;
    email?: string | null;
    displayName?: string | null;
    authUserId?: string | number;
  }): Promise<UserRecord> {
    return this.run((core) => core.ensureGoogleUser(input));
  }

  async ensureDevUser(displayName: string): Promise<UserRecord> {
    return this.run((core) => core.ensureDevUser(displayName));
  }

  async findUserIdByAuthUserId(authUserId: string | number): Promise<string | undefined> {
    return this.run((core) => core.findUserIdByAuthUserId(authUserId));
  }

  async findUserById(userId: string): Promise<UserRecord | undefined> {
    return this.run((core) => core.findUserById(userId));
  }

  async seedInvite(code: string, expiresAt?: string): Promise<InviteRecord> {
    return this.run((core) => core.seedInvite(code, expiresAt));
  }

  async createDevSession(userId: string): Promise<{ token: string; expiresAt: string }> {
    return this.run((core) => core.createDevSession(userId));
  }

  async resolveDevSession(token: string | null | undefined): Promise<Actor | null> {
    return this.run((core) => core.resolveDevSession(token));
  }

  async revokeDevSession(token: string | null | undefined): Promise<void> {
    return this.run((core) => core.revokeDevSession(token));
  }

  async getBootstrap(actor: Actor): Promise<JsonRecord> {
    return this.run((core) => core.getBootstrap(actor));
  }

  async createAgeAttestation(
    actor: Actor,
    bodyValue: unknown,
    options: { inviteCode?: string; idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createAgeAttestation(actor, bodyValue, options));
  }

  async listConsents(actor: Actor): Promise<JsonRecord[]> {
    return this.run((core) => core.listConsents(actor));
  }

  async setConsent(actor: Actor, purpose: string, bodyValue: unknown): Promise<JsonRecord> {
    return this.run((core) => core.setConsent(actor, purpose, bodyValue));
  }

  async getPersonalization(actor: Actor): Promise<JsonRecord> {
    return this.run((core) => core.getPersonalization(actor));
  }

  async patchPersonalization(actor: Actor, bodyValue: unknown): Promise<JsonRecord> {
    return this.run((core) => core.patchPersonalization(actor, bodyValue));
  }

  async createDataRequest(
    actor: Actor,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createDataRequest(actor, bodyValue, options));
  }

  async deleteFootprint(
    actor: Actor,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.deleteFootprint(actor, options));
  }

  async getDataRequest(actor: Actor, requestId: string): Promise<JsonRecord> {
    return this.run((core) => core.getDataRequest(actor, requestId));
  }

  async processDataRequest(requestId: string): Promise<JsonRecord | null> {
    return this.run((core) => core.processDataRequest(requestId));
  }

  async createProject(
    actor: Actor,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createProject(actor, bodyValue, options));
  }

  async listProjects(
    actor: Actor,
    query: { limit?: number; cursor?: string; search?: string; status?: string } = {},
  ): Promise<{ data: JsonRecord[]; page: JsonRecord }> {
    return this.run((core) => core.listProjects(actor, query));
  }

  async getProject(actor: Actor, projectId: string): Promise<JsonRecord> {
    return this.run((core) => core.getProject(actor, projectId));
  }

  async getProjectWorkspace(actor: Actor, projectId: string): Promise<JsonRecord> {
    return this.run((core) => core.getProjectWorkspace(actor, projectId));
  }

  async addProjectArtifact(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.addProjectArtifact(actor, projectId, bodyValue, options));
  }

  async listProjectArtifacts(actor: Actor, projectId: string): Promise<JsonRecord[]> {
    return this.run((core) => core.listProjectArtifacts(actor, projectId));
  }

  async getArtifact(actor: Actor, artifactId: string): Promise<JsonRecord> {
    return this.run((core) => core.getArtifact(actor, artifactId));
  }

  async deleteArtifact(actor: Actor, artifactId: string): Promise<void> {
    return this.run((core) => core.deleteArtifact(actor, artifactId));
  }

  async retryArtifactProcessing(
    actor: Actor,
    artifactId: string,
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.retryArtifactProcessing(actor, artifactId));
  }

  async initiateArtifactUpload(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string; baseUrl?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.initiateArtifactUpload(actor, projectId, bodyValue, options));
  }

  async authorizeLocalUpload(
    artifactId: string,
    token: string | null,
  ): Promise<{ artifactId: string; maxByteSize: number }> {
    return this.run((core) => core.authorizeLocalUpload(artifactId, token));
  }

  async acceptLocalUpload(
    artifactId: string,
    token: string | null,
    bytes: Uint8Array,
    contentType: string | null,
  ): Promise<JsonRecord> {
    return this.run((core) => core.acceptLocalUpload(artifactId, token, bytes, contentType));
  }

  async completeArtifactUpload(
    actor: Actor,
    projectId: string,
    artifactId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) =>
      core.completeArtifactUpload(actor, projectId, artifactId, bodyValue, options),
    );
  }

  async createSearchAttempt(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createSearchAttempt(actor, projectId, bodyValue, options));
  }

  async getSearchAttempt(actor: Actor, projectId: string, attemptId: string): Promise<JsonRecord> {
    return this.run((core) => core.getSearchAttempt(actor, projectId, attemptId));
  }

  async getOutputExplorer(actor: Actor, projectId: string, mode?: string): Promise<JsonRecord> {
    return this.run((core) => core.getOutputExplorer(actor, projectId, mode));
  }

  async createRankingSnapshot(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createRankingSnapshot(actor, projectId, bodyValue));
  }

  async getModuleVersion(actor: Actor, moduleVersionId: string): Promise<JsonRecord> {
    return this.run((core) => core.getModuleVersion(actor, moduleVersionId));
  }

  async createBrewJob(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    const result = await this.run((core) => core.createBrewJob(actor, projectId, bodyValue, options));
    // Inline mode preserves its synchronous UX, but the Brew processing itself
    // is orchestrated after this Unit of Work commits so AI provider calls
    // never run inside a database transaction.
    const effectiveMode = this.brewExecutionMode ?? "inline";
    if (effectiveMode === "inline" && result.status === 202 && !result.replay) {
      const processed = await this.processQueuedBrewJob(String(result.data.id), {
        workerId: "gon-inline-worker",
      });
      return { data: processed, status: 202 };
    }
    return result;
  }

  async getBrewJob(actor: Actor, jobId: string): Promise<JsonRecord> {
    return this.run((core) => core.getBrewJob(actor, jobId));
  }

  async getJob(actor: Actor, jobId: string): Promise<JsonRecord> {
    return this.run((core) => core.getJob(actor, jobId));
  }

  async processQueuedBrewJob(
    jobId: string,
    options: ProcessQueuedBrewJobOptions = {},
  ): Promise<JsonRecord> {
    // Multi-transaction orchestration on purpose: phase 1 and phase 3 are
    // separate database Units of Work, and the AI provider calls between them
    // run OUTSIDE any database transaction.
    const phase1 = await this.run((core) => core.beginBrewJobProcessing(jobId, options));
    if (phase1.kind === "settled") return phase1.job;
    const { outcome, runs } = await this.executeBrewGeneration(phase1.work);
    return this.run((core) => core.finishBrewJobProcessing(phase1.work, outcome, runs));
  }

  async processNextQueuedBrewJob(
    options: ProcessQueuedBrewJobOptions = {},
  ): Promise<JsonRecord | null> {
    const candidateId = await this.run((core) => core.findNextQueuedBrewJobId());
    if (!candidateId) return null;
    return this.processQueuedBrewJob(candidateId, options);
  }

  /**
   * Run the stateless AI provider calls for one prepared Brew job. Never
   * touches the store: the ADK/provider holds no DB-write or publishing
   * authority, and failures become fail-closed job transitions in phase 3.
   */
  private async executeBrewGeneration(
    work: BrewGenerationWorkPackage,
  ): Promise<{ outcome: BrewGenerationOutcome; runs: AiRunDraft[] }> {
    const provider = this.brewAiProvider ?? new LocalDeterministicBrewAiProvider();
    const runs: AiRunDraft[] = [];
    try {
      const topic = await provider.topicCheck(work.topicCheckInput);
      runs.push({ operation: "topic_check", telemetry: topic.telemetry });
      if (topic.output.decision !== "allow") {
        return { outcome: { kind: "topic_decision", topicOutput: topic.output }, runs };
      }
      const generated = await provider.generateModule(work.generateWork);
      runs.push({ operation: "generate_module", telemetry: generated.telemetry });
      return { outcome: { kind: "generated", generateOutput: generated.output }, runs };
    } catch (error) {
      const operation: AiRunDraft["operation"] = runs.length === 0 ? "topic_check" : "generate_module";
      if (error instanceof AiProviderError) {
        runs.push({ operation, telemetry: error.telemetry });
        return {
          outcome: { kind: "provider_error", errorCode: error.code, retryable: error.retryable },
          runs,
        };
      }
      runs.push({
        operation,
        telemetry: {
          provider: provider.id,
          modelId: "unknown",
          agentPipelineVersion: provider.pipelineVersion,
          promptTemplateVersions: [],
          inputSchemaVersion:
            operation === "topic_check"
              ? TOPIC_CHECK_INPUT_SCHEMA_VERSION
              : GENERATE_MODULE_INPUT_SCHEMA_VERSION,
          outputSchemaVersion:
            operation === "topic_check"
              ? TOPIC_CHECK_OUTPUT_SCHEMA_VERSION
              : GENERATE_MODULE_OUTPUT_SCHEMA_VERSION,
          evidenceBundleHash: null,
          inputTokens: null,
          outputTokens: null,
          costUnits: 0,
          latencyMs: 0,
          finishReason: null,
          errorCode: "BREW_AI_PROVIDER_FAILED",
        },
      });
      return {
        outcome: { kind: "provider_error", errorCode: "BREW_AI_PROVIDER_FAILED", retryable: true },
        runs,
      };
    }
  }

  async createJourney(
    actor: Actor,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createJourney(actor, bodyValue, options));
  }

  async listJourneys(
    actor: Actor,
    query: { limit?: number; cursor?: string } = {},
  ): Promise<{ data: JsonRecord[]; page: JsonRecord }> {
    return this.run((core) => core.listJourneys(actor, query));
  }

  async getJourney(actor: Actor, journeyId: string): Promise<JsonRecord> {
    return this.run((core) => core.getJourney(actor, journeyId));
  }

  async listJourneyCommits(
    actor: Actor,
    journeyId: string,
    query: { limit?: number; cursor?: string } = {},
  ): Promise<{ data: JsonRecord[]; page: JsonRecord }> {
    return this.run((core) => core.listJourneyCommits(actor, journeyId, query));
  }

  async getJourneyPlayer(actor: Actor, journeyId: string): Promise<JsonRecord> {
    return this.run((core) => core.getJourneyPlayer(actor, journeyId));
  }

  async createAttempt(
    actor: Actor,
    journeyId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createAttempt(actor, journeyId, bodyValue, options));
  }

  async updateAttempt(
    actor: Actor,
    journeyId: string,
    attemptId: string,
    bodyValue: unknown,
    options: { ifMatchVersion?: number } = {},
  ): Promise<JsonRecord> {
    return this.run((core) => core.updateAttempt(actor, journeyId, attemptId, bodyValue, options));
  }

  async getAttempt(actor: Actor, journeyId: string, attemptId: string): Promise<JsonRecord> {
    return this.run((core) => core.getAttempt(actor, journeyId, attemptId));
  }

  async submitAttempt(
    actor: Actor,
    journeyId: string,
    attemptId: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    // Phase 1: deterministic submission inside one Unit of Work. Unresolved
    // rubric criteria hand back an AI work package instead of settling.
    const phase1 = await this.run((core) => core.submitAttempt(actor, journeyId, attemptId, options));
    if (phase1.kind === "settled") return phase1.result;

    // Phase 2: the AI rubric call runs OUTSIDE any database transaction
    // (P05-R1.5 rule). Failures fall back to the deterministic assessment.
    const workPackage = phase1.work;
    let outcome: AttemptAssessOutcome;
    const runs: AiRunDraft[] = [];
    try {
      const provider = this.brewAiProvider ?? new LocalDeterministicBrewAiProvider();
      const result = await provider.assessAttempt(workPackage.work);
      outcome = { kind: "assessed", output: result.output, telemetry: result.telemetry };
      runs.push({ operation: "assess_attempt", telemetry: result.telemetry });
    } catch (error) {
      outcome = {
        kind: "provider_error",
        errorCode: error instanceof AiProviderError ? error.code : "ASSESS_AI_FAILED",
        retryable: error instanceof AiProviderError ? error.retryable : true,
      };
      runs.push({
        operation: "assess_attempt",
        telemetry: {
          provider: "none",
          modelId: "none",
          agentPipelineVersion: "none",
          promptTemplateVersions: [],
          inputSchemaVersion: ASSESS_ATTEMPT_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: "gon.agent.assess-attempt.output/1.0",
          evidenceBundleHash: null,
          inputTokens: null,
          outputTokens: null,
          costUnits: 0,
          latencyMs: 0,
          finishReason: null,
          errorCode: outcome.errorCode,
        },
      });
    }

    // Phase 3: settle in a fresh Unit of Work (XP/mastery only on decision).
    return this.run((core) => core.finishAttemptAiAssessment(workPackage, outcome, runs));
  }

  async getMyProgress(actor: Actor): Promise<JsonRecord> {
    return this.run((core) => core.getMyProgress(actor));
  }

  async listMyXpLedger(
    actor: Actor,
    query: { limit?: number; cursor?: string } = {},
  ): Promise<{ data: JsonRecord[]; page: JsonRecord }> {
    return this.run((core) => core.listMyXpLedger(actor, query));
  }

  async listProofs(
    actor: Actor,
    query: { limit?: number; cursor?: string; verificationLevel?: string } = {},
  ): Promise<{ data: JsonRecord[]; page: JsonRecord }> {
    return this.run((core) => core.listProofs(actor, query));
  }

  async createExternalProof(
    actor: Actor,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createExternalProof(actor, bodyValue, options));
  }

  async getProof(actor: Actor, proofId: string): Promise<JsonRecord> {
    return this.run((core) => core.getProof(actor, proofId));
  }

  async createReport(
    actor: Actor,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    return this.run((core) => core.createReport(actor, bodyValue, options));
  }

  async getReport(actor: Actor, reportId: string): Promise<JsonRecord> {
    return this.run((core) => core.getReport(actor, reportId));
  }
}
