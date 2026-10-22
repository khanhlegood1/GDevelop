import {
  assertPublicHttpUrl,
  chunkText,
  classifyUrlKind,
  detectFile,
  MAX_FILES_PER_PROJECT,
  MAX_PROJECT_UPLOAD_BYTES,
  MAX_TEXT_ARTIFACT_CHARS,
  MAX_URLS_PER_PROJECT,
  validateUploadDeclaration,
} from "./artifacts";
import { assessAttemptDeterministically } from "./assessment";
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
  serviceUnavailable,
  unauthorized,
  unprocessable,
  validationError,
} from "./errors";
import { sha256Hex, stableHash, timingSafeStringEqual } from "./hash";
import { createId, createOpaqueToken } from "./ids";
import { MemoryGonStore } from "./memory-store";
import {
  generateLocalModuleGraph,
  toPlayerGraph,
  validateModuleGraph,
  type EvidenceArtifactForGraph,
} from "./module-graph";
import { progressFromXp, XP_RULE_VALUES } from "./progression";
import { jaccardSimilarity, normalizeForSearch, slugifyAscii, tokenize, tokenSet, truncateText } from "./text";
import {
  LEARNING_MODES,
  type Actor,
  type ArtifactRecord,
  type AttemptRecord,
  type CandidateRecord,
  type CandidateSetRecord,
  type ChunkRecord,
  type ConsentRecord,
  type JobRecord,
  type JourneyRecord,
  type LearningMode,
  type MasteryLevel,
  type ModuleGraph,
  type ModuleVersionRecord,
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

export interface GonServiceOptions {
  store?: MemoryGonStore;
  embeddingProvider?: EmbeddingProvider;
  requireInvite?: boolean;
  featureFlags?: Record<string, boolean>;
  now?: () => Date;
  quotas?: Partial<{
    searchPerHour: number;
    brewPerDay: number;
    artifactProcessingPerDay: number;
  }>;
}

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

export class GonService {
  readonly store: MemoryGonStore;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly requireInvite: boolean;
  private readonly featureFlags: Record<string, boolean>;
  private readonly clock: () => Date;
  private readonly quotas: Required<NonNullable<GonServiceOptions["quotas"]>>;

  constructor(options: GonServiceOptions = {}) {
    this.store = options.store ?? new MemoryGonStore();
    this.embeddingProvider = options.embeddingProvider ?? createEmbeddingProvider();
    this.requireInvite = options.requireInvite ?? true;
    this.featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...(options.featureFlags ?? {}) };
    this.clock = options.now ?? (() => new Date());
    this.quotas = {
      searchPerHour: options.quotas?.searchPerHour ?? 60,
      brewPerDay: options.quotas?.brewPerDay ?? 5,
      artifactProcessingPerDay: options.quotas?.artifactProcessingPerDay ?? 20,
    };
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
    this.store.outboxEvents.push({
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
    });
  }

  private Audit(actor: Actor, action: string, objectType: string, objectId: string, reason: string | null = null): void {
    this.store.auditLogs.push({
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
    const record = this.store.idempotencyRecords.get(this.idempotencyScope(actor, operation, key));
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
    this.store.idempotencyRecords.set(this.idempotencyScope(actor, operation, key), {
      key,
      requestFingerprint: stableHash(payload),
      resourceType,
      resourceId,
      status,
      createdAt: this.now(),
    });
  }

  private requireUser(actor: Actor): UserRecord {
    const user = this.store.users.get(actor.userId);
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
    return [...this.store.attestations.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.attestedAt.localeCompare(a.attestedAt))[0];
  }

  private consentRecord(userId: string, purpose: string): ConsentRecord {
    const existing = this.store.consents.get(`${userId}:${purpose}`);
    if (existing) return existing;
    const user = this.store.users.get(userId);
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
    this.store.consents.set(`${userId}:${purpose}`, record);
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
    const lifetimeXp = [...this.store.xpLedger.values()]
      .filter((entry) => entry.userId === userId)
      .reduce((sum, entry) => sum + entry.delta, 0);
    const progress = progressFromXp(lifetimeXp);
    const mastery = [...this.store.mastery.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.conceptId.localeCompare(b.conceptId))
      .map((item) => this.masteryDto(item));
    const latestProof = [...this.store.proofs.values()]
      .filter((proof) => proof.ownerUserId === userId && !proof.deletedAt && proof.status !== "deleted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const nextSteps = [...this.store.journeys.values()]
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
    authUserId?: string;
  }): UserRecord {
    const subject = input.providerSubject.trim();
    if (!subject) throw validationError("Provider subject không được để trống.");
    const key = `${input.provider}:${subject}`;
    const existingLink = this.store.identityLinks.get(key);
    if (existingLink) {
      const user = this.store.users.get(existingLink.userId);
      if (!user) throw unauthorized("Identity link không còn hợp lệ.");
      if (input.authUserId) user.authUserId = input.authUserId;
      const profile = this.store.profiles.get(user.id);
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
      authUserId: input.authUserId,
    };
    this.store.users.set(user.id, user);
    this.store.identityLinks.set(key, {
      userId: user.id,
      provider: input.provider,
      providerSubject: subject,
      emailAtLink: input.email ?? null,
      linkedAt: now,
    });
    this.store.profiles.set(user.id, {
      userId: user.id,
      displayName: truncateText(input.displayName?.trim() || "Người học GON", 120),
      selfDeclaredHeadline: null,
      version: 1,
    });
    this.setConsentRecord(user.id, "ai_model_training", "denied", PRIVACY_VERSION, "alpha_default");
    this.setConsentRecord(user.id, "external_social_connection", "denied", PRIVACY_VERSION, "alpha_default");
    return user;
  }

  ensureGoogleUser(input: { providerSubject: string; email?: string | null; displayName?: string | null; authUserId?: string }): UserRecord {
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

  findUserIdByAuthUserId(authUserId: string): string | undefined {
    return [...this.store.users.values()].find((user) => user.authUserId === authUserId)?.id;
  }

  createDevSession(userId: string): { token: string; expiresAt: string } {
    const token = createOpaqueToken(32);
    const expiresAt = new Date(this.clock().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.store.devSessions.set(sha256Hex(token), {
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
    const session = this.store.devSessions.get(tokenHash);
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= this.clock().getTime()) {
      this.store.devSessions.delete(tokenHash);
      return null;
    }
    const user = this.store.users.get(session.userId);
    if (!user || user.status === "deleted") return null;
    return { userId: user.id, roles: user.roles, authProvider: "dev" };
  }

  revokeDevSession(token: string | null | undefined): void {
    if (token) this.store.devSessions.delete(sha256Hex(token));
  }

  getBootstrap(actor: Actor): JsonRecord {
    const user = this.requireUser(actor);
    const profile = this.store.profiles.get(user.id);
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
      const existing = this.store.attestations.get(replay.resourceId);
      if (existing) return { data: this.attestationDto(existing), status: 201, replay: true };
    }

    const existing = this.latestAttestation(user.id);
    if (existing && existing.termsVersion === termsVersion && existing.privacyVersion === privacyVersion) {
      this.setConsentRecord(user.id, "personalization_footprint", personalization, privacyVersion, "onboarding");
      return { data: this.attestationDto(existing), status: 201, replay: true };
    }

    let invite: ReturnType<MemoryGonStore["invitesByHash"]["get"]>;
    if (this.requireInvite && !existing) {
      const code = optionalString(body, "inviteCode", { maxLength: 256 }) ?? options.inviteCode?.trim();
      if (!code) {
        throw forbidden("INVITE_REQUIRED", "Cần mã mời Private Alpha", "Hãy dùng invite link hoặc nhập mã mời hợp lệ.", "redeem_invite");
      }
      invite = this.store.invitesByHash.get(sha256Hex(code));
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
    this.store.attestations.set(attestation.id, attestation);
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

  private requireOwnedProject(actor: Actor, projectId: string): ProjectRecord {
    const project = this.store.projects.get(projectId);
    if (!project || project.ownerUserId !== actor.userId || project.deletedAt) throw notFound();
    return project;
  }

  private projectArtifacts(projectId: string): ArtifactRecord[] {
    return [...this.store.artifacts.values()]
      .filter((artifact) => artifact.projectId === projectId && !artifact.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private latestSearch(projectId: string): SearchAttemptRecord | undefined {
    return [...this.store.searchAttempts.values()]
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  private latestBrewJob(projectId: string): (JobRecord & { brew: { projectId: string; searchAttemptId: string; resultModuleVersionId: string | null } }) | undefined {
    const brew = [...this.store.brewJobs.values()]
      .filter((item) => item.projectId === projectId)
      .map((item) => ({ brew: item, job: this.store.jobs.get(item.jobId) }))
      .filter((item): item is { brew: NonNullable<typeof item.brew>; job: JobRecord } => Boolean(item.job))
      .sort((a, b) => b.job.createdAt.localeCompare(a.job.createdAt))[0];
    return brew ? { ...brew.job, brew: brew.brew } : undefined;
  }

  private latestCandidateSet(projectId: string): CandidateSetRecord | undefined {
    return [...this.store.candidateSets.values()]
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
    const activeJourney = [...this.store.journeys.values()].find(
      (journey) => journey.projectId === project.id && journey.ownerUserId === project.ownerUserId && journey.status === "active" && !journey.deletedAt,
    );
    const completedJourney = [...this.store.journeys.values()].find(
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
    return [...this.store.chunks.values()]
      .filter((chunk) => chunk.artifactId === artifactId && !chunk.deletedAt)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  private removeArtifactChunks(artifactId: string): void {
    for (const chunk of this.artifactChunks(artifactId)) this.store.chunks.delete(chunk.id);
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
      attemptCount: 1,
      maxAttempts: 3,
      estimatedCostUnits: input.estimatedCostUnits ?? 0,
      actualCostUnits: 0,
      failureCode: null,
      retryable: false,
      createdAt: this.now(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      payload: input.payload ?? {},
    };
    this.store.jobs.set(job.id, job);
    return job;
  }

  private startJob(job: JobRecord, step: string): void {
    job.status = "running";
    job.currentStep = step;
    job.startedAt = job.startedAt ?? this.now();
  }

  private succeedJob(job: JobRecord, step: string | null = null): void {
    job.status = "succeeded";
    job.currentStep = step;
    job.completedAt = this.now();
    job.failureCode = null;
    job.retryable = false;
  }

  private failJob(job: JobRecord, failureCode: string, retryable: boolean, step: string | null = null): void {
    job.status = retryable ? "failed_retryable" : "failed_terminal";
    job.currentStep = step;
    job.completedAt = this.now();
    job.failureCode = failureCode;
    job.retryable = retryable;
  }

  private jobDto(job: JobRecord): JsonRecord {
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      currentStep: job.currentStep,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      failureCode: job.failureCode,
      retryable: job.retryable,
    };
  }

  private brewJobDto(jobId: string): JsonRecord {
    const job = this.store.jobs.get(jobId);
    const brew = this.store.brewJobs.get(jobId);
    if (!job || !brew) throw notFound();
    return {
      ...this.jobDto(job),
      projectId: brew.projectId,
      searchAttemptId: brew.searchAttemptId,
      resultModuleVersionId: brew.resultModuleVersionId,
      quota: {
        usedToday: [...this.store.brewJobs.values()].filter((item) => {
          const related = this.store.jobs.get(item.jobId);
          return related?.ownerUserId === job.ownerUserId && related.createdAt.slice(0, 10) === this.now().slice(0, 10);
        }).length,
        dailyLimit: this.quotas.brewPerDay,
      },
    };
  }

  private countArtifactsProcessedSince(userId: string, sinceIso: string): number {
    return [...this.store.artifacts.values()].filter(
      (artifact) => artifact.ownerUserId === userId && artifact.createdAt >= sinceIso,
    ).length;
  }

  private enforceArtifactQuota(actor: Actor): void {
    const startOfDay = new Date(this.clock());
    startOfDay.setUTCHours(0, 0, 0, 0);
    if (this.countArtifactsProcessedSince(actor.userId, startOfDay.toISOString()) >= this.quotas.artifactProcessingPerDay) {
      throw quotaExceeded(`Private Alpha cho phép tối đa ${this.quotas.artifactProcessingPerDay} artifact xử lý/người/ngày.`);
    }
  }

  private async processTextArtifact(actor: Actor, artifact: ArtifactRecord, text: string): Promise<void> {
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
        this.store.chunks.set(chunk.id, chunk);
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
      this.store.chunks.set(chunk.id, chunk);
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
      const existing = this.store.projects.get(replay.resourceId);
      if (existing) return { data: this.projectDto(existing), status: 201, replay: true };
    }

    this.enforceArtifactQuota(actor);
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

    this.store.projects.set(project.id, project);
    this.store.artifacts.set(artifact.id, artifact);
    await this.processTextArtifact(actor, artifact, prompt);
    project.updatedAt = this.now();
    this.emit(actor, "project.created", "learning_project", project.id, { learningMode, depth, timeBudgetMinutes });
    this.saveIdempotentResult(actor, "createProject", options.idempotencyKey, payload, "learning_project", project.id, 201);
    return { data: this.projectDto(project), status: 201 };
  }

  listProjects(actor: Actor, query: { limit?: number; cursor?: string; search?: string; status?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const search = query.search ? normalizeForSearch(query.search) : "";
    const all = [...this.store.projects.values()]
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

  getProjectWorkspace(actor: Actor, projectId: string): JsonRecord {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    const { nextAction } = this.projectStatusAndNextAction(project);
    const latestSearch = this.latestSearch(project.id);
    const latestBrew = this.latestBrewJob(project.id);
    const candidateSet = this.latestCandidateSet(project.id);
    const hasJourney = [...this.store.journeys.values()].some((journey) => journey.projectId === project.id && !journey.deletedAt);
    const hasProof = [...this.store.proofs.values()].some((proof) => {
      const journey = proof.journeyId ? this.store.journeys.get(proof.journeyId) : undefined;
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
      latestBrewJob: latestBrew ? this.brewJobDto(latestBrew.id) : null,
    };
  }

  async addProjectArtifact(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    const project = this.requireOwnedProject(actor, projectId);
    const body = ensureRecord(bodyValue);
    const kind = requiredEnum(body, "kind", ["text", "website_url", "youtube_url", "facebook_url"] as const);
    const rightsBasis = requiredEnum(body, "rightsBasis", RIGHTS_BASES);
    const rightsNote = optionalString(body, "rightsNote", { maxLength: 500 }) ?? null;
    const displayNameInput = optionalString(body, "displayName", { maxLength: 300 });
    const payload = { projectId, kind, rightsBasis, rightsNote, displayName: displayNameInput, text: body.text, uri: body.uri };

    const replay = this.findIdempotentReplay(actor, "addProjectArtifact", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.store.artifacts.get(replay.resourceId);
      if (existing) return { data: this.artifactDto(existing), status: 200, replay: true };
    }

    this.enforceArtifactQuota(actor);
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
      this.store.artifacts.set(artifact.id, artifact);
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
    this.store.artifacts.set(artifact.id, artifact);
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
    const artifact = this.store.artifacts.get(artifactId);
    if (!artifact || artifact.ownerUserId !== actor.userId || artifact.deletedAt) throw notFound();
    return artifact;
  }

  getArtifact(actor: Actor, artifactId: string): JsonRecord {
    this.requireActiveUser(actor);
    return this.artifactDto(this.requireOwnedArtifact(actor, artifactId));
  }

  deleteArtifact(actor: Actor, artifactId: string): void {
    this.requireActiveUser(actor);
    const artifact = this.requireOwnedArtifact(actor, artifactId);
    artifact.deletedAt = this.now();
    artifact.version += 1;
    this.removeArtifactChunks(artifact.id);
    if (artifact.storageObjectKey) this.store.objects.delete(artifact.storageObjectKey);
    artifact.sourceText = null;
    const project = this.store.projects.get(artifact.projectId);
    if (project) project.updatedAt = this.now();
    this.emit(actor, "artifact.deleted", "source_artifact", artifact.id, { projectId: artifact.projectId });
    this.Audit(actor, "artifact.deleted", "source_artifact", artifact.id);
  }

  async retryArtifactProcessing(actor: Actor, artifactId: string): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    const artifact = this.requireOwnedArtifact(actor, artifactId);
    if (artifact.extractionStatus !== "failed_retryable") {
      throw conflict("INVALID_STATE_TRANSITION", "Artifact không ở trạng thái retryable", "Chỉ artifact lỗi tạm thời mới được xử lý lại.");
    }
    if (artifact.kind === "text" && artifact.sourceText) {
      await this.processTextArtifact(actor, artifact, artifact.sourceText);
    } else if (artifact.originUri) {
      await this.processUrlArtifact(actor, artifact, new URL(artifact.originUri));
    } else if (artifact.storageObjectKey) {
      const object = this.store.objects.get(artifact.storageObjectKey);
      if (!object) throw notFound("Object của artifact không còn tồn tại.");
      await this.processUploadedObject(actor, artifact, object.bytes);
    }
    return { data: this.artifactDto(artifact), status: 202 };
  }

  initiateArtifactUpload(
    actor: Actor,
    projectId: string,
    bodyValue: unknown,
    options: { idempotencyKey?: string; baseUrl?: string } = {},
  ): CommandResult<JsonRecord> {
    this.requireActiveUser(actor);
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
      const session = this.store.uploadSessions.get(replay.resourceId);
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

    this.enforceArtifactQuota(actor);
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
    this.store.artifacts.set(artifact.id, artifact);
    this.store.uploadSessions.set(artifact.id, {
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

    const baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    return {
      status: 201,
      data: {
        artifactId: artifact.id,
        uploadUrl: `${baseUrl}/api/local-uploads/${artifact.id}`,
        method: "PUT",
        headers: {
          "Content-Type": declaredMimeType,
          "X-GON-Upload-Token": token,
        },
        expiresAt,
      },
    };
  }

  acceptLocalUpload(artifactId: string, token: string | null, bytes: Uint8Array, contentType: string | null): JsonRecord {
    const session = this.store.uploadSessions.get(artifactId);
    const artifact = this.store.artifacts.get(artifactId);
    if (!session || !artifact || artifact.deletedAt) throw notFound("Upload session không tồn tại.");
    if (!token || !timingSafeStringEqual(sha256Hex(token), session.tokenHash)) {
      throw unauthorized("Token upload không hợp lệ.");
    }
    if (Date.parse(session.expiresAt) <= this.clock().getTime() || session.completedAt) {
      throw conflict("UPLOAD_SESSION_EXPIRED", "Upload session đã hết hạn hoặc hoàn tất", "Hãy khởi tạo upload session mới.");
    }
    const buffer = Buffer.from(bytes);
    if (buffer.length === 0) throw validationError("File upload rỗng.");
    if (buffer.length > session.declaredByteSize) {
      throw validationError("File thực tế lớn hơn kích thước đã khai báo cho upload session.");
    }
    this.store.objects.set(session.objectKey, {
      key: session.objectKey,
      bytes: buffer,
      contentType: contentType ?? session.declaredMimeType,
      createdAt: this.now(),
    });
    session.uploadedAt = this.now();
    session.actualByteSize = buffer.length;
    session.actualSha256 = sha256Hex(buffer);
    return {
      artifactId,
      byteSize: buffer.length,
      sha256: session.actualSha256,
    };
  }

  private async processUploadedObject(actor: Actor, artifact: ArtifactRecord, bytes: Buffer): Promise<void> {
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
      artifact.safetyStatus = "blocked";
      artifact.extractionStatus = "blocked";
      artifact.failureCode = detected.category === "unknown" ? "ARTIFACT_TYPE_UNSUPPORTED" : "ARTIFACT_MIME_MISMATCH";
      artifact.coverage = { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 };
      this.emit(actor, "artifact.blocked", "source_artifact", artifact.id, { failureCode: artifact.failureCode });
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
    const project = this.requireOwnedProject(actor, projectId);
    const artifact = this.requireOwnedArtifact(actor, artifactId);
    if (artifact.projectId !== project.id) throw notFound();
    const session = this.store.uploadSessions.get(artifactId);
    if (!session) throw notFound("Upload session không tồn tại.");
    const body = bodyValue ? ensureRecord(bodyValue) : {};
    const payload = { projectId, artifactId, sha256: body.sha256, byteSize: body.byteSize };

    const replay = this.findIdempotentReplay(actor, "completeArtifactUpload", options.idempotencyKey, payload);
    if (replay || session.completedAt) return { data: this.artifactDto(artifact), status: 200, replay: true };
    if (!session.uploadedAt || !session.actualSha256 || !session.actualByteSize) {
      throw conflict("UPLOAD_NOT_RECEIVED", "Server chưa nhận object upload", "Hãy PUT file tới upload URL trước khi complete-upload.");
    }
    if (typeof body.sha256 === "string" && body.sha256.toLocaleLowerCase() !== session.actualSha256) {
      throw unprocessable("ARTIFACT_HASH_MISMATCH", "Hash file không khớp", "SHA-256 client gửi khi complete không khớp object server đã nhận.");
    }
    if (typeof body.byteSize === "number" && body.byteSize !== session.actualByteSize) {
      throw unprocessable("ARTIFACT_SIZE_MISMATCH", "Kích thước file không khớp", "Byte size client gửi khi complete không khớp object server đã nhận.");
    }
    if (session.actualSha256 !== session.declaredSha256 || session.actualByteSize !== session.declaredByteSize) {
      artifact.safetyStatus = "blocked";
      artifact.extractionStatus = "blocked";
      artifact.failureCode = "ARTIFACT_HASH_OR_SIZE_MISMATCH";
      session.completedAt = this.now();
      this.saveIdempotentResult(actor, "completeArtifactUpload", options.idempotencyKey, payload, "source_artifact", artifact.id, 202);
      return { data: this.artifactDto(artifact), status: 202 };
    }

    const object = this.store.objects.get(session.objectKey);
    if (!object) throw notFound("Object upload không tồn tại.");
    session.completedAt = this.now();
    artifact.byteSize = session.actualByteSize;
    artifact.sha256 = session.actualSha256;
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
    return [...this.store.moduleVersions.values()].filter((version) => {
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
    return [...this.store.chunks.values()].filter((chunk) => chunk.moduleVersionId === moduleVersionId && !chunk.deletedAt);
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
    const project = this.requireOwnedProject(actor, projectId);
    const body = bodyValue ? ensureRecord(bodyValue) : {};
    const requestedArtifactIds = stringArray(body, "artifactIds", { maxItems: 50 });
    const payload = { projectId, artifactIds: requestedArtifactIds };
    const replay = this.findIdempotentReplay(actor, "createSearchAttempt", options.idempotencyKey, payload);
    if (replay) {
      const existing = this.store.searchAttempts.get(replay.resourceId);
      if (existing) return { data: this.searchAttemptDto(existing), status: 200, replay: true };
    }

    const oneHourAgo = new Date(this.clock().getTime() - 60 * 60 * 1000).toISOString();
    const recentSearches = [...this.store.searchAttempts.values()].filter(
      (attempt) => attempt.ownerUserId === actor.userId && attempt.createdAt >= oneHourAgo,
    ).length;
    if (recentSearches >= this.quotas.searchPerHour) {
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
    this.store.searchAttempts.set(attempt.id, attempt);
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
        .map((artifactId) => this.store.artifacts.get(artifactId))
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
      const scored = this.visibleModuleVersions(actor).map((version) => {
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
    const attempt = this.store.searchAttempts.get(attemptId);
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
    const existing = [...this.store.candidateSets.values()].find(
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
    this.store.candidateSets.set(set.id, set);

    const relevanceByModule = new Map(results.map((result) => [result.moduleVersionId, result.internalScores.hybrid]));
    const versions = results
      .map((result) => this.store.moduleVersions.get(result.moduleVersionId))
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
        this.store.candidates.set(candidate.id, candidate);
      }
    }

    set.actualCount = [...this.store.candidates.values()].filter((candidate) => candidate.candidateSetId === set.id).length;
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
    const candidates = [...this.store.candidates.values()].filter(
      (candidate) => candidate.candidateSetId === candidateSet.id && candidate.status === "eligible",
    );
    const personalizationApplied = this.consentRecord(actor.userId, "personalization_footprint").status === "granted";
    const priorJourneyFormats = [...this.store.journeys.values()]
      .filter((journey) => journey.ownerUserId === actor.userId)
      .map((journey) => this.store.candidates.get(journey.sourceCandidateId)?.format)
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
    this.store.rankingSnapshots.set(snapshot.id, snapshot);
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
    const snapshot = [...this.store.rankingSnapshots.values()]
      .filter((item) => item.candidateSetId === candidateSet.id && item.userId === actor.userId && item.learningMode === requestedMode)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const candidates = [...this.store.candidates.values()].filter((candidate) => candidate.candidateSetId === candidateSet.id);
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
    const candidateSet = this.store.candidateSets.get(candidateSetId);
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
      this.store.chunks.set(chunk.id, chunk);
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
    const project = this.requireOwnedProject(actor, projectId);
    const body = ensureRecord(bodyValue);
    const searchAttemptId = requiredString(body, "searchAttemptId", { maxLength: 128 });
    if (body.confirmed !== true) {
      throw unprocessable("BREW_CONFIRMATION_REQUIRED", "Cần xác nhận Brew", "GON không tự chạy Brew khi user chưa xác nhận.");
    }
    if (!this.featureFlags.brew_enabled) {
      throw serviceUnavailable("BREW_DISABLED", "Brew đang tạm dừng", "Kill switch Brew đang bật. Search và module đã có vẫn có thể dùng nếu an toàn.");
    }
    const searchAttempt = this.store.searchAttempts.get(searchAttemptId);
    if (!searchAttempt || searchAttempt.projectId !== project.id || searchAttempt.ownerUserId !== actor.userId) throw notFound();
    if (searchAttempt.status !== "completed" || !searchAttempt.verdict || !["missing", "related", "found"].includes(searchAttempt.verdict)) {
      throw conflict("INVALID_STATE_TRANSITION", "Search chưa sẵn sàng để Brew", "Chỉ Brew từ Search đã hoàn tất với verdict missing/related hoặc biến thể từ found.");
    }

    const artifacts = searchAttempt.artifactIds
      .map((artifactId) => this.store.artifacts.get(artifactId))
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
      const existing = this.store.jobs.get(replay.resourceId);
      if (existing) return { data: this.brewJobDto(existing.id), status: 200, replay: true };
    }
    const existingByFingerprint = [...this.store.jobs.values()].find(
      (job) => job.ownerUserId === actor.userId && job.jobType === "brew_module" && job.inputFingerprint === fingerprint && ["queued", "running", "succeeded"].includes(job.status),
    );
    if (existingByFingerprint) {
      return { data: this.brewJobDto(existingByFingerprint.id), status: 200, replay: true };
    }

    const startOfDay = new Date(this.clock());
    startOfDay.setUTCHours(0, 0, 0, 0);
    const brewToday = [...this.store.jobs.values()].filter(
      (job) => job.ownerUserId === actor.userId && job.jobType === "brew_module" && job.createdAt >= startOfDay.toISOString(),
    ).length;
    if (brewToday >= this.quotas.brewPerDay) {
      throw quotaExceeded(`Private Alpha cho phép tối đa ${this.quotas.brewPerDay} Brew job/người/ngày.`);
    }

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
    const brew = { jobId: job.id, projectId: project.id, searchAttemptId, resultModuleVersionId: null as string | null };
    this.store.brewJobs.set(job.id, brew);
    project.currentBrewJobId = job.id;
    this.emit(actor, "brew.job.queued", "brew_job", job.id, { projectId: project.id, searchAttemptId });

    await this.processBrewJob(actor, job);
    this.saveIdempotentResult(actor, "createBrewJob", options.idempotencyKey, payload, "brew_job", job.id, 202);
    return { data: this.brewJobDto(job.id), status: 202 };
  }

  private async processBrewJob(actor: Actor, job: JobRecord): Promise<void> {
    const brew = this.store.brewJobs.get(job.id);
    if (!brew) return;
    const steps = job.payload.stepsCompleted as string[];
    const completeStep = (step: string) => {
      job.currentStep = step;
      if (!steps.includes(step)) steps.push(step);
    };

    try {
      this.startJob(job, "validate_request");
      const project = this.requireOwnedProject(actor, brew.projectId);
      const searchAttempt = this.store.searchAttempts.get(brew.searchAttemptId);
      if (!searchAttempt) throw new Error("SEARCH_ATTEMPT_NOT_FOUND");
      completeStep("validate_request");

      job.currentStep = "topic_and_safety_check";
      const artifacts = searchAttempt.artifactIds
        .map((artifactId) => this.store.artifacts.get(artifactId))
        .filter((artifact): artifact is ArtifactRecord => Boolean(artifact && !artifact.deletedAt && artifact.safetyStatus === "allowed"));
      const evidenceText = [project.title, project.goal, ...artifacts.flatMap((artifact) => this.artifactChunks(artifact.id).map((chunk) => chunk.text))].join("\n");
      if (this.topicIsBlocked(evidenceText)) {
        this.failJob(job, "TOPIC_BLOCKED_BY_POLICY", false, "topic_and_safety_check");
        this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
        return;
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
        this.emit(actor, "brew.job.needs_input", "brew_job", job.id, { projectId: project.id }, job.id);
        return;
      }
      completeStep("build_evidence_bundle");

      job.currentStep = "generate_module_graph";
      const graph = generateLocalModuleGraph({
        jobId: job.id,
        userId: actor.userId,
        projectTitle: project.title,
        goal: project.goal,
        locale: project.locale,
        depth: project.depth,
        timeBudgetMinutes: project.timeBudgetMinutes,
        artifacts: usableEvidence,
        pipelineVersion: "vs1-local-brew-v1",
        modelIds: ["local-deterministic-brew-v1"],
        createdByType: "system_seed",
        attributionDisplayName: "GON local draft generator",
      });
      completeStep("generate_module_graph");
      completeStep("design_assessments");

      job.currentStep = "verify_citations";
      const validation = validateModuleGraph(graph, {
        evidenceSourceIds: graph.sources.map((source) => source.id),
      });
      if (!validation.valid) {
        this.failJob(job, "MODULE_GRAPH_INVALID", false, "verify_citations");
        this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
        return;
      }
      graph.quality.citationCoverage = validation.citationCoverage;
      completeStep("verify_citations");
      completeStep("safety_and_policy_review");

      job.currentStep = "persist_draft";
      const moduleRecord = {
        id: createId("mod"),
        ownerUserId: actor.userId,
        creatorType: "system_seed" as const,
        attributionSnapshot: { displayName: "GON local draft generator" },
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
          agentPipelineVersion: "vs1-local-brew-v1",
          modelIds: ["local-deterministic-brew-v1"],
          evidenceBundleHash: stableHash(usableEvidence.map((artifact) => artifact.artifactId)),
        },
        sourceArtifactVersions: artifacts.map((artifact) => ({ artifactId: artifact.id, version: artifact.version })),
        parentModuleVersionId: null,
        contentSha256: validation.contentSha256,
        createdByUserId: actor.userId,
        createdAt: this.now(),
      };
      this.store.modules.set(moduleRecord.id, moduleRecord);
      this.store.moduleVersions.set(version.id, version);
      await this.indexModuleVersion(actor, version);
      brew.resultModuleVersionId = version.id;
      completeStep("persist_draft");
      this.emit(actor, "module.version.created", "module_version", version.id, {
        moduleId: version.moduleId,
        publicationStatus: version.publicationStatus,
        groundingStatus: version.groundingStatus,
      }, job.id);

      job.currentStep = "build_candidate_set";
      const now = this.now();
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
      void now;
      await this.buildCandidateSet(actor, project, searchAttempt, [brewResult], version.id);
      completeStep("build_candidate_set");

      job.actualCostUnits = 0;
      this.succeedJob(job, "succeeded");
      this.emit(actor, "brew.job.succeeded", "brew_job", job.id, {
        projectId: project.id,
        resultModuleVersionId: version.id,
      }, job.id);
    } catch {
      this.failJob(job, "BREW_FAILED", true, job.currentStep);
      this.emit(actor, "brew.job.failed", "brew_job", job.id, { failureCode: job.failureCode }, job.id);
    }
  }

  getBrewJob(actor: Actor, jobId: string): JsonRecord {
    this.requireActiveUser(actor);
    const job = this.store.jobs.get(jobId);
    if (!job || job.ownerUserId !== actor.userId || job.jobType !== "brew_module") throw notFound();
    return this.brewJobDto(jobId);
  }

  getJob(actor: Actor, jobId: string): JsonRecord {
    this.requireActiveUser(actor);
    const job = this.store.jobs.get(jobId);
    if (!job || job.ownerUserId !== actor.userId) throw notFound();
    return job.jobType === "brew_module" ? this.brewJobDto(jobId) : this.jobDto(job);
  }

  private requireOwnedJourney(actor: Actor, journeyId: string): JourneyRecord {
    const journey = this.store.journeys.get(journeyId);
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
    const sequence = [...this.store.branchCommits.values()].filter((commit) => commit.journeyId === journey.id).length + 1;
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
    this.store.branchCommits.set(commit.id, commit);
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
      const existing = this.store.journeys.get(replay.resourceId);
      if (existing) return { data: this.journeyDto(existing), status: 200, replay: true };
    }

    const candidate = this.store.candidates.get(candidateId);
    if (!candidate || candidate.status !== "eligible") throw notFound();
    const project = this.requireOwnedProject(actor, candidate.projectId);
    if (candidate.projectId !== project.id) throw notFound();
    if (moduleVersionId && moduleVersionId !== candidate.moduleVersionId) {
      throw unprocessable("CANDIDATE_MODULE_MISMATCH", "Candidate và ModuleVersion không khớp", "Hãy tải lại Output Explorer trước khi Fork.");
    }
    const version = this.requireVisibleModuleVersion(actor, candidate.moduleVersionId);

    if (ifExists === "return_existing") {
      const existing = [...this.store.journeys.values()].find(
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
    this.store.journeys.set(journey.id, journey);
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
    const journeys = [...this.store.journeys.values()]
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
    const commits = [...this.store.branchCommits.values()]
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
      [...this.store.attempts.values()]
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
    const attempts = [...this.store.attempts.values()]
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
      const record = this.store.mastery.get(`${actor.userId}:${concept.id}`);
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
      const existing = this.store.attempts.get(replay.resourceId);
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
    const attemptNumber = [...this.store.attempts.values()].filter((attempt) => attempt.journeyId === journey.id && attempt.nodeId === nodeId).length + 1;
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
    this.store.attempts.set(attempt.id, attempt);
    this.saveIdempotentResult(actor, "createAttempt", options.idempotencyKey, payload, "learning_attempt", attempt.id, 201);
    return { data: this.attemptDto(attempt), status: 201 };
  }

  private requireOwnedAttempt(actor: Actor, journeyId: string, attemptId: string): { journey: JourneyRecord; attempt: AttemptRecord } {
    const journey = this.requireOwnedJourney(actor, journeyId);
    const attempt = this.store.attempts.get(attemptId);
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
    const existing = this.store.mastery.get(key);
    if (existing && MASTERY_ORDER[existing.level] > MASTERY_ORDER[level]) {
      existing.lastEvidenceAt = this.now();
      existing.version += 1;
      return;
    }
    const achievedAt = existing?.level === level ? existing.achievedAt : this.now();
    this.store.mastery.set(key, {
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
    return [...this.store.xpLedger.values()]
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
    const existing = [...this.store.xpLedger.values()].find(
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
      sequence: this.store.nextXpSequence(actor.userId),
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
    this.store.xpLedger.set(entry.id, entry);
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
    const existing = [...this.store.proofs.values()].find(
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
    this.store.proofs.set(proof.id, proof);
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
  ): Promise<CommandResult<JsonRecord>> {
    this.requireActiveUser(actor);
    const { journey, attempt } = this.requireOwnedAttempt(actor, journeyId, attemptId);
    if (attempt.status !== "draft") {
      return { data: this.attemptDto(attempt), status: 200, replay: true };
    }
    const payload = { journeyId, attemptId, version: attempt.version, answerHash: sha256Hex(attempt.answerText ?? "") };
    const replay = this.findIdempotentReplay(actor, "submitAttempt", options.idempotencyKey, payload);
    if (replay) return { data: this.attemptDto(attempt), status: 200, replay: true };

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
    attempt.assessment = assessment;
    attempt.status = assessment.decision;
    attempt.updatedAt = this.now();

    if (node.type === "boss_proof") {
      this.appendCommit(journey, actor, "boss_submitted", "Đã nộp Boss Proof", { attemptId: attempt.id });
    }

    if (assessment.decision === "passed") {
      for (const conceptId of node.conceptIds) {
        this.upsertMastery(actor.userId, conceptId, node.assessment.masteryTarget, attempt.id);
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
      }, job.id);
      this.emit(actor, "mastery.changed", "journey_branch", journey.id, {
        nodeId: node.id,
        masteryTarget: node.assessment.masteryTarget,
      }, job.id);

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
      }, job.id);
    }

    journey.currentNodeId = this.computeCurrentNodeId(journey, version.graph);
    journey.version += 1;
    journey.updatedAt = this.now();
    this.succeedJob(job, "assessment_recorded");
    this.saveIdempotentResult(actor, "submitAttempt", options.idempotencyKey, payload, "learning_attempt", attempt.id, 202);
    return { data: this.attemptDto(attempt), status: 202 };
  }

  getMyProgress(actor: Actor): JsonRecord {
    this.requireActiveUser(actor);
    return this.progressDto(actor.userId);
  }

  listMyXpLedger(actor: Actor, query: { limit?: number; cursor?: string } = {}): { data: JsonRecord[]; page: JsonRecord } {
    this.requireActiveUser(actor);
    const entries = [...this.store.xpLedger.values()]
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
    const proofs = [...this.store.proofs.values()]
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
      const existing = this.store.proofs.get(replay.resourceId);
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
    this.store.proofs.set(proof.id, proof);
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
    const proof = this.store.proofs.get(proofId);
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
      const existing = this.store.reports.get(replay.resourceId);
      if (existing) return { data: this.reportDto(existing), status: 201, replay: true };
    }

    if (targetType === "module_version") this.requireVisibleModuleVersion(actor, targetId);
    if (targetType === "output_candidate") {
      const candidate = this.store.candidates.get(targetId);
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
    this.store.reports.set(report.id, report);
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
    this.store.reviewCases.set(reviewCase.id, reviewCase);
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
    const report = this.store.reports.get(reportId);
    const isOperator = actor.roles.includes("reviewer") || actor.roles.includes("admin");
    if (!report || (report.reporterUserId !== actor.userId && !isOperator)) throw notFound();
    return this.reportDto(report);
  }
}
