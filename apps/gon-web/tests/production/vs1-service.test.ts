import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { ApiError } from "@/server/errors";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

function createService(options: { brewEnabled?: boolean } = {}) {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    featureFlags: { brew_enabled: options.brewEnabled ?? true },
  });
  return { store, service };
}

let activationSequence = 0;

function activate(service: GonService, name: string, personalization: "granted" | "denied" = "denied") {
  const user = service.ensureDevUser(name);
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_test" };
  activationSequence += 1;
  const inviteCode = `GON-ALPHA-TEST-${activationSequence}`;
  service.store.seedInvite(inviteCode);
  service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: personalization,
    inviteCode,
  });
  return { user, actor };
}

describe("identity boundary", () => {
  it("does not create an orphan attestation when the invite is invalid", () => {
    const { service, store } = createService();
    const user = service.ensureDevUser("Người dùng chưa có invite");
    const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test" };

    expect(() =>
      service.createAgeAttestation(actor, {
        isAtLeast18: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        personalizationFootprint: "denied",
        inviteCode: "SAI-MA",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVITE_INVALID_OR_EXPIRED" }));
    expect(store.users.get(user.id)?.status).toBe("onboarding");
    expect([...store.attestations.values()].filter((item) => item.userId === user.id)).toHaveLength(0);
  });
});

describe("VS1 Curiosity to Proof", () => {
  it("runs intake -> missing search -> Brew -> Fork -> learning -> XP -> System Proof without duplicate XP", async () => {
    const { service, store } = createService();
    const { actor } = activate(service, "Người học Alpha", "granted");

    const projectResult = await service.createProject(
      actor,
      {
        title: "Âm nhạc viral",
        prompt:
          "Vì sao một bài hát có thể viral sau một đêm? Tôi muốn hiểu hook, cộng đồng chia sẻ đầu tiên, thời điểm văn hóa và khả năng remix thay vì chỉ sao chép bề mặt.",
        goal: "Tạo một artifact giáo dục ngắn giải thích cơ chế lan truyền âm nhạc",
        learningMode: "create_publish",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "project-create-001" },
    );
    const project = projectResult.data;
    const projectId = String(project.id);

    const replayProject = await service.createProject(
      actor,
      {
        title: "Âm nhạc viral",
        prompt:
          "Vì sao một bài hát có thể viral sau một đêm? Tôi muốn hiểu hook, cộng đồng chia sẻ đầu tiên, thời điểm văn hóa và khả năng remix thay vì chỉ sao chép bề mặt.",
        goal: "Tạo một artifact giáo dục ngắn giải thích cơ chế lan truyền âm nhạc",
        learningMode: "create_publish",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "project-create-001" },
    );
    expect(replayProject.data.id).toBe(projectId);
    expect(store.projects.size).toBe(1);

    const urlArtifact = await service.addProjectArtifact(actor, projectId, {
      kind: "youtube_url",
      uri: "https://www.youtube.com/watch?v=viralMusic123",
      displayName: "Video bài hát viral",
      rightsBasis: "publicly_available_link",
    });
    expect(urlArtifact.data).toMatchObject({ extractionStatus: "metadata_only", safetyStatus: "allowed" });
    expect(urlArtifact.data.coverage).toMatchObject({ hasText: false, hasMetadata: true });

    const searchResult = await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "search-001" });
    expect(searchResult.data).toMatchObject({ status: "completed", verdict: "missing", results: [] });
    const searchAttemptId = String(searchResult.data.id);

    const brewResult = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId, confirmed: true },
      { idempotencyKey: "brew-001" },
    );
    expect(brewResult.status).toBe(202);
    expect(brewResult.data).toMatchObject({ status: "succeeded", currentStep: "succeeded" });
    const moduleVersionId = String(brewResult.data.resultModuleVersionId);
    expect(moduleVersionId.startsWith("modv_")).toBe(true);

    const replayBrew = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId, confirmed: true },
      { idempotencyKey: "brew-001" },
    );
    expect(replayBrew.status).toBe(200);
    expect(replayBrew.data.id).toBe(brewResult.data.id);
    expect(store.moduleVersions.size).toBe(1);

    const moduleVersion = store.moduleVersions.get(moduleVersionId);
    expect(moduleVersion).toMatchObject({ publicationStatus: "draft_private", visibility: "private" });
    const publicModule = service.getModuleVersion(actor, moduleVersionId);
    expect(JSON.stringify(publicModule.playerGraph)).not.toContain("sampleAnswer");
    expect(JSON.stringify(publicModule.playerGraph)).not.toContain("conceptTermGroups");

    const explorer = service.getOutputExplorer(actor, projectId);
    expect(explorer.candidateSet).toMatchObject({ targetCount: 10 });
    expect((explorer.candidates as unknown[]).length).toBeGreaterThanOrEqual(5);
    expect(explorer.rankingSnapshot).toMatchObject({ personalizationApplied: true });
    const candidate = (explorer.candidates as Array<Record<string, unknown>>).find((item) => item.format === "web_lesson") ??
      (explorer.candidates as Array<Record<string, unknown>>)[0];

    const journeyResult = service.createJourney(
      actor,
      { candidateId: String(candidate.id), ifExists: "return_existing" },
      { idempotencyKey: "journey-001" },
    );
    expect(journeyResult.status).toBe(201);
    const journeyId = String(journeyResult.data.id);
    const existingJourney = service.createJourney(actor, { candidateId: String(candidate.id), ifExists: "return_existing" });
    expect(existingJourney.status).toBe(200);
    expect(existingJourney.data.id).toBe(journeyId);

    expect(() => service.createAttempt(actor, journeyId, { nodeId: "boss_artifact" })).toThrowError(
      expect.objectContaining({ code: "NODE_LOCKED" }),
    );

    const retrieval = service.createAttempt(actor, journeyId, { nodeId: "retrieval_core" }, { idempotencyKey: "attempt-retrieval-1" }).data;
    service.updateAttempt(actor, journeyId, String(retrieval.id), {
      answerText:
        "Âm nhạc viral không chỉ nằm ở giai điệu. Bằng chứng trong nguồn cho thấy cần xét cộng đồng chia sẻ đầu tiên và thời điểm văn hóa, đồng thời giới hạn là một video chưa đủ để kết luận công thức chung nếu chưa kiểm chứng ở bối cảnh khác.",
    }, { ifMatchVersion: 1 });
    const retrievalSubmitted = await service.submitAttempt(actor, journeyId, String(retrieval.id), { idempotencyKey: "submit-retrieval-1" });
    expect(retrievalSubmitted.data).toMatchObject({ status: "passed", xpAwarded: 10 });

    const transfer = service.createAttempt(actor, journeyId, { nodeId: "transfer_new_context" }).data;
    service.updateAttempt(actor, journeyId, String(transfer.id), {
      answerText:
        "Bối cảnh mới: Tôi áp dụng cho một lớp kỹ năng mềm trong cộng đồng sinh viên y. Cách áp dụng: mở bằng một tình huống 30 giây về an toàn hiến máu, nối hook với giá trị học thật về quy trình kiểm tra điều kiện và mời người học remix thành câu hỏi. Cách đo kết quả: đo tỉ lệ trả lời đúng câu hỏi truy hồi và số người hoàn thành Boss Proof thay vì chỉ đếm lượt xem.",
    });
    const transferSubmitted = await service.submitAttempt(actor, journeyId, String(transfer.id));
    expect(transferSubmitted.data).toMatchObject({ status: "passed", xpAwarded: 15 });

    const boss = service.createAttempt(actor, journeyId, { nodeId: "boss_artifact" }).data;
    service.updateAttempt(actor, journeyId, String(boss.id), {
      answerText:
        "Mục tiêu học: Người mới sáng tạo nội dung hiểu vì sao sao chép bề mặt không tạo lại điều kiện lan truyền. Giá trị cốt lõi: hook chỉ giúp dừng lại; mạng lưới đầu tiên, thời điểm và khả năng remix mới quyết định nội dung đi xa. Nội dung artifact: một infographic bốn ô gồm Hook, Cộng đồng đầu tiên, Thời điểm, Remix và một câu hỏi kiểm tra ở ô cuối. Cách người khác sử dụng/kiểm tra: người học đọc từng ô, trả lời câu hỏi, sau đó tự áp dụng cho một ngách và đối chiếu nguồn đã khai báo.",
      sourceDisclosure: {
        sources: ["Prompt và YouTube URL người dùng cung cấp trong project"],
        changesFromInspiration: "Tự viết lại cấu trúc và ví dụ cho cộng đồng sinh viên y",
      },
      aiAssistanceDisclosure: {
        usedAi: true,
        description: "Dùng GON để tổ chức module; người học tự viết transfer và mô tả artifact",
      },
    });
    const bossSubmitted = await service.submitAttempt(actor, journeyId, String(boss.id));
    expect(bossSubmitted.data).toMatchObject({ status: "passed", xpAwarded: 35 });

    const progress = service.getMyProgress(actor);
    expect(progress).toMatchObject({ lifetimeXp: 60, numericLevel: 0, era: "Zero", xpInLevel: 60, xpToNextLevel: 40 });
    expect(progress.latestProof).toMatchObject({ verificationLevel: "system_recorded", visibility: "private" });
    expect(service.getJourney(actor, journeyId)).toMatchObject({ status: "completed", currentNodeId: null });
    expect(service.listJourneyCommits(actor, journeyId).data.length).toBeGreaterThanOrEqual(5);

    const duplicateRetrieval = service.createAttempt(actor, journeyId, { nodeId: "retrieval_core" }).data;
    service.updateAttempt(actor, journeyId, String(duplicateRetrieval.id), {
      answerText:
        "Âm nhạc viral cần được nhìn như một hệ thống gồm nội dung và mạng lưới phân phối. Nguồn là bằng chứng khởi điểm chứ không phải kết luận cuối cùng; giới hạn là mức độ phù hợp vẫn cần kiểm chứng thêm bằng dữ liệu từ bối cảnh khác.",
    });
    const duplicateSubmitted = await service.submitAttempt(actor, journeyId, String(duplicateRetrieval.id));
    expect(duplicateSubmitted.data).toMatchObject({ status: "passed", xpAwarded: 0 });
    expect(service.getMyProgress(actor).lifetimeXp).toBe(60);
  });

  it("keeps a private AI draft out of another learner's search until it is internal_reviewed", async () => {
    const { service, store } = createService();
    const owner = activate(service, "Chủ module").actor;
    const other = activate(service, "Người học khác").actor;

    const makeProject = async (actor: Actor, suffix: string) => {
      const project = await service.createProject(actor, {
        title: "Phân tích lan truyền nội dung",
        prompt:
          "Phân tích lan truyền nội dung bằng hook, mạng lưới chia sẻ, thời điểm văn hóa và khả năng remix với bằng chứng và giới hạn rõ ràng.",
        goal: "Hiểu cơ chế lan truyền nội dung",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
      }, { idempotencyKey: `iso-project-${suffix}` });
      return String(project.data.id);
    };

    const ownerProjectId = await makeProject(owner, "owner");
    const ownerSearch = await service.createSearchAttempt(owner, ownerProjectId, {}, { idempotencyKey: "iso-search-owner" });
    const brew = await service.createBrewJob(owner, ownerProjectId, {
      searchAttemptId: String(ownerSearch.data.id),
      confirmed: true,
    }, { idempotencyKey: "iso-brew-owner" });
    const moduleVersionId = String(brew.data.resultModuleVersionId);

    const otherProjectId = await makeProject(other, "other");
    const before = await service.createSearchAttempt(other, otherProjectId, {}, { idempotencyKey: "iso-search-before" });
    expect(before.data.verdict).toBe("missing");
    expect(JSON.stringify(before.data.results)).not.toContain(moduleVersionId);

    const version = store.moduleVersions.get(moduleVersionId);
    expect(version).toBeDefined();
    if (!version) throw new Error("missing version");
    version.publicationStatus = "internal_reviewed";
    version.visibility = "internal_reviewed";

    const after = await service.createSearchAttempt(other, otherProjectId, {}, { idempotencyKey: "iso-search-after" });
    expect(JSON.stringify(after.data.results)).toContain(moduleVersionId);
    expect(["found", "related"]).toContain(after.data.verdict);
  });

  it("sends near-verbatim work to human review without XP and does not accuse the learner of cheating", async () => {
    const { service, store } = createService();
    const { actor } = activate(service, "Người học copy");
    const project = await service.createProject(actor, {
      title: "Kiểm chứng thông tin",
      prompt: "Học cách kiểm chứng thông tin bằng nguồn, bằng chứng, bối cảnh và giới hạn trước khi chia sẻ một kết luận.",
      goal: "Kiểm chứng một claim trước khi chia sẻ",
      learningMode: "apply_at_work",
    });
    const projectId = String(project.data.id);
    const search = await service.createSearchAttempt(actor, projectId, {});
    const brew = await service.createBrewJob(actor, projectId, { searchAttemptId: String(search.data.id), confirmed: true });
    const moduleVersionId = String(brew.data.resultModuleVersionId);
    const explorer = service.getOutputExplorer(actor, projectId);
    const candidate = (explorer.candidates as Array<Record<string, unknown>>)[0];
    const journey = service.createJourney(actor, { candidateId: String(candidate.id) }).data;
    const journeyId = String(journey.id);

    const graph = store.moduleVersions.get(moduleVersionId)?.graph;
    const sample = graph?.nodes.find((node) => node.id === "retrieval_core")?.content.sampleAnswer;
    expect(typeof sample).toBe("string");

    const attempt = service.createAttempt(actor, journeyId, { nodeId: "retrieval_core" }).data;
    service.updateAttempt(actor, journeyId, String(attempt.id), { answerText: String(sample) });
    const submitted = await service.submitAttempt(actor, journeyId, String(attempt.id));
    expect(submitted.data).toMatchObject({ status: "pending_human_review", xpAwarded: 0 });
    expect(submitted.data.assessment).toMatchObject({ integritySignals: ["high_similarity_to_source_or_sample"] });
    expect(service.getMyProgress(actor).lifetimeXp).toBe(0);
  });

  it("handles text and image uploads with hash, magic-byte and mismatch checks", async () => {
    const { service } = createService();
    const { actor } = activate(service, "Người tải file");
    const project = await service.createProject(actor, {
      title: "Tài liệu học",
      prompt: "Tôi muốn học từ tài liệu của mình và biến nó thành một lộ trình có kiểm tra hiểu biết.",
      goal: "Học từ file đã tải",
      learningMode: "deep_mastery",
    });
    const projectId = String(project.data.id);

    const textBytes = Buffer.from("Bằng chứng là dữ kiện có thể đối chiếu với nguồn. Người học cần tách dữ kiện, diễn giải và kết luận.");
    const textHash = createHash("sha256").update(textBytes).digest("hex");
    const upload = service.initiateArtifactUpload(actor, projectId, {
      kind: "file",
      fileName: "notes.txt",
      declaredMimeType: "text/plain",
      byteSize: textBytes.length,
      sha256: textHash,
      rightsBasis: "created_by_user",
    }, { baseUrl: "http://localhost:3000" }).data;
    const headers = upload.headers as Record<string, string>;
    service.acceptLocalUpload(String(upload.artifactId), headers["X-GON-Upload-Token"], textBytes, "text/plain");
    const completed = await service.completeArtifactUpload(actor, projectId, String(upload.artifactId), {
      sha256: textHash,
      byteSize: textBytes.length,
    });
    expect(completed.data).toMatchObject({ kind: "file", extractionStatus: "ready", safetyStatus: "allowed" });

    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("fake-image-payload"),
    ]);
    const pngHash = createHash("sha256").update(pngBytes).digest("hex");
    const imageUpload = service.initiateArtifactUpload(actor, projectId, {
      kind: "image",
      fileName: "certificate.png",
      declaredMimeType: "image/png",
      byteSize: pngBytes.length,
      sha256: pngHash,
      rightsBasis: "created_by_user",
    }, { baseUrl: "http://localhost:3000" }).data;
    const imageHeaders = imageUpload.headers as Record<string, string>;
    service.acceptLocalUpload(String(imageUpload.artifactId), imageHeaders["X-GON-Upload-Token"], pngBytes, "image/png");
    const imageCompleted = await service.completeArtifactUpload(actor, projectId, String(imageUpload.artifactId), {});
    expect(imageCompleted.data).toMatchObject({ kind: "image", extractionStatus: "metadata_only", safetyStatus: "allowed" });

    const mismatchHash = createHash("sha256").update(pngBytes).digest("hex");
    const mismatchUpload = service.initiateArtifactUpload(actor, projectId, {
      kind: "file",
      fileName: "not-a-pdf.pdf",
      declaredMimeType: "application/pdf",
      byteSize: pngBytes.length,
      sha256: mismatchHash,
      rightsBasis: "created_by_user",
    }, { baseUrl: "http://localhost:3000" }).data;
    const mismatchHeaders = mismatchUpload.headers as Record<string, string>;
    service.acceptLocalUpload(String(mismatchUpload.artifactId), mismatchHeaders["X-GON-Upload-Token"], pngBytes, "application/pdf");
    const mismatchCompleted = await service.completeArtifactUpload(actor, projectId, String(mismatchUpload.artifactId), {});
    expect(mismatchCompleted.data).toMatchObject({ extractionStatus: "blocked", safetyStatus: "blocked" });
  });

  it("creates truthful external proofs and minimum moderation reports", async () => {
    const { service } = createService();
    const owner = activate(service, "Chủ Proof Vault").actor;
    const other = activate(service, "Người ngoài Proof Vault").actor;

    const proof = service.createExternalProof(owner, {
      proofType: "certificate_link",
      title: "Chứng chỉ khóa học bên ngoài",
      externalUri: "https://example.org/certificates/123",
      issuerDisplayName: "Example Issuer",
    }).data;
    expect(proof).toMatchObject({ verificationLevel: "source_linked", visibility: "private" });
    expect(() => service.getProof(other, String(proof.id))).toThrowError(expect.objectContaining({ status: 404 }));

    const project = await service.createProject(owner, {
      title: "Chủ đề cần báo cáo",
      prompt: "Tạo một module học có nguồn để kiểm tra luồng báo cáo và moderation tối thiểu.",
      goal: "Kiểm tra report",
      learningMode: "deep_mastery",
    });
    const search = await service.createSearchAttempt(owner, String(project.data.id), {});
    const brew = await service.createBrewJob(owner, String(project.data.id), {
      searchAttemptId: String(search.data.id),
      confirmed: true,
    });
    const report = service.createReport(owner, {
      targetType: "module_version",
      targetId: String(brew.data.resultModuleVersionId),
      reasonCode: "source_quality",
      detail: "Cần kiểm tra lại mức citation của module.",
    }).data;
    expect(report).toMatchObject({ status: "received", targetType: "module_version" });
    expect(() => service.getReport(other, String(report.id))).toThrowError(expect.objectContaining({ status: 404 }));
  });

  it("removes deleted artifact chunks from the local search index immediately", async () => {
    const { service, store } = createService();
    const { actor } = activate(service, "Người xóa artifact");
    const project = await service.createProject(actor, {
      title: "Xóa nguồn",
      prompt: "Một chủ đề đủ dài để kiểm tra việc loại bỏ chunk khỏi chỉ mục sau khi artifact bị xóa mềm.",
      goal: "Kiểm tra deletion propagation",
      learningMode: "deep_mastery",
    });
    const added = await service.addProjectArtifact(actor, String(project.data.id), {
      kind: "text",
      text: "Dữ liệu duy nhất marked-unique-phrase để tìm trong chỉ mục nội bộ.",
      rightsBasis: "created_by_user",
    });
    const artifactId = String(added.data.id);
    expect([...store.chunks.values()].some((chunk) => chunk.artifactId === artifactId)).toBe(true);
    service.deleteArtifact(actor, artifactId);
    expect([...store.chunks.values()].some((chunk) => chunk.artifactId === artifactId)).toBe(false);
    expect(() => service.getArtifact(actor, artifactId)).toThrowError(expect.objectContaining({ status: 404 }));
  });

  it("honours the Brew kill switch", async () => {
    const { service } = createService({ brewEnabled: false });
    const { actor } = activate(service, "Người gặp kill switch");
    const project = await service.createProject(actor, {
      title: "Kill switch",
      prompt: "Một chủ đề đủ cụ thể để Search trả missing và sau đó Brew bị kill switch chặn đúng cách.",
      goal: "Kiểm tra kill switch",
      learningMode: "deep_mastery",
    });
    const search = await service.createSearchAttempt(actor, String(project.data.id), {});
    await expect(
      service.createBrewJob(actor, String(project.data.id), { searchAttemptId: String(search.data.id), confirmed: true }),
    ).rejects.toMatchObject({ code: "BREW_DISABLED", status: 503 } satisfies Partial<ApiError>);
  });
});
