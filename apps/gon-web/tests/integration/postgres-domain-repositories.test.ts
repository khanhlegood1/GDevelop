import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import {
  PostgresGonStore,
  type PostgresTransactionRunner,
} from "@/server/postgres-store";
import { runNextPostgresBrewJob } from "@/server/job-worker";
import { PostgresJobQueue } from "@/server/postgres-job-queue";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * Executable PostgreSQL domain-repository test. PGlite is only the hermetic
 * PostgreSQL engine; production uses the same PostgresGonStore with a
 * node-postgres transaction runner. This proves normalized load/flush,
 * transaction boundaries and SQL hybrid Search over the real migrations. It
 * does not prove managed-PostgreSQL latency, IAM/TLS, backup or scaling.
 */
const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let store: PostgresGonStore;
let service: GonService;
let activationSequence = 0;

async function count(table: string, where = "true", params: unknown[] = []): Promise<number> {
  const result = await db.query<{ count: number | string }>(
    `select count(*)::int as count from ${table} where ${where}`,
    params as never[],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function activate(name: string, personalization: "granted" | "denied" = "denied") {
  const user = await service.ensureDevUser(name);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: "req_pglite_domain_test",
  };
  activationSequence += 1;
  const inviteCode = `GON-PGLITE-${activationSequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: personalization,
    inviteCode,
  });
  return { user, actor };
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
  expect(files).toHaveLength(8);
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }

  const runner: PostgresTransactionRunner = {
    async transaction(work) {
      return db.transaction(async (tx) =>
        work({
          query: async (text, params) => tx.query(text, params as never[]),
        }),
      );
    },
  };
  store = new PostgresGonStore(runner);
  service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    featureFlags: { brew_enabled: true },
  });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL domain repositories and Unit of Work (PGlite execution)", () => {
  it("runs the VS1 journey through normalized PostgreSQL aggregates", async () => {
    const { actor } = await activate("Người học PostgreSQL", "granted");

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
      { idempotencyKey: "pg-project-001" },
    );
    const projectId = String(projectResult.data.id);

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
      { idempotencyKey: "pg-project-001" },
    );
    expect(replayProject.data.id).toBe(projectId);
    expect(await count("learning_projects")).toBe(1);
    expect(await count("source_artifacts", "project_id = $1", [projectId])).toBe(1);
    expect(await count("chunk_embeddings", "dimensions = 768 and normalized")).toBeGreaterThan(0);

    const urlArtifact = await service.addProjectArtifact(actor, projectId, {
      kind: "youtube_url",
      uri: "https://www.youtube.com/watch?v=viralMusic123",
      displayName: "Video bài hát viral",
      rightsBasis: "publicly_available_link",
    });
    expect(urlArtifact.data).toMatchObject({ extractionStatus: "metadata_only", safetyStatus: "allowed" });

    const searchResult = await service.createSearchAttempt(
      actor,
      projectId,
      {},
      { idempotencyKey: "pg-search-001" },
    );
    expect(searchResult.data).toMatchObject({ status: "completed", verdict: "missing", results: [] });
    const searchAttemptId = String(searchResult.data.id);
    expect(await count("search_attempt_artifacts", "search_attempt_id = $1", [searchAttemptId])).toBe(2);

    const brewResult = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId, confirmed: true },
      { idempotencyKey: "pg-brew-001" },
    );
    expect(brewResult.status).toBe(202);
    expect(brewResult.data).toMatchObject({ status: "succeeded", currentStep: "succeeded" });
    const moduleVersionId = String(brewResult.data.resultModuleVersionId);
    expect(moduleVersionId.startsWith("modv_")).toBe(true);

    const replayBrew = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId, confirmed: true },
      { idempotencyKey: "pg-brew-001" },
    );
    expect(replayBrew.status).toBe(200);
    expect(replayBrew.data.id).toBe(brewResult.data.id);
    expect(await count("module_versions", "graph_schema_version = 'gon.module-graph/1.0'")).toBe(1);
    expect(await count("module_concepts", "module_version_id = $1", [moduleVersionId])).toBeGreaterThan(0);
    expect(await count("citation_references", "module_version_id = $1", [moduleVersionId])).toBeGreaterThan(0);
    expect(await count("candidate_sets", "project_id = $1", [projectId])).toBe(1);
    expect(await count("output_candidates", "project_id = $1", [projectId])).toBeGreaterThanOrEqual(5);
    expect(await count("ranking_snapshot_items")).toBeGreaterThanOrEqual(5);

    const explorer = await service.getOutputExplorer(actor, projectId);
    const candidate =
      (explorer.candidates as Array<Record<string, unknown>>).find((item) => item.format === "web_lesson") ??
      (explorer.candidates as Array<Record<string, unknown>>)[0];

    const journeyResult = await service.createJourney(
      actor,
      { candidateId: String(candidate.id), ifExists: "return_existing" },
      { idempotencyKey: "pg-journey-001" },
    );
    const journeyId = String(journeyResult.data.id);

    const retrieval = (
      await service.createAttempt(
        actor,
        journeyId,
        { nodeId: "retrieval_core" },
        { idempotencyKey: "pg-attempt-retrieval" },
      )
    ).data;
    await service.updateAttempt(actor, journeyId, String(retrieval.id), {
      answerText:
        "Âm nhạc viral không chỉ nằm ở giai điệu. Bằng chứng trong nguồn cho thấy cần xét cộng đồng chia sẻ đầu tiên và thời điểm văn hóa, đồng thời giới hạn là một video chưa đủ để kết luận công thức chung nếu chưa kiểm chứng ở bối cảnh khác.",
    }, { ifMatchVersion: 1 });
    const retrievalSubmitted = await service.submitAttempt(
      actor,
      journeyId,
      String(retrieval.id),
      { idempotencyKey: "pg-submit-retrieval" },
    );
    expect(retrievalSubmitted.data).toMatchObject({ status: "passed", xpAwarded: 10 });

    const transfer = (
      await service.createAttempt(actor, journeyId, { nodeId: "transfer_new_context" })
    ).data;
    await service.updateAttempt(actor, journeyId, String(transfer.id), {
      answerText:
        "Bối cảnh mới: Tôi áp dụng cho một lớp kỹ năng mềm trong cộng đồng sinh viên y. Cách áp dụng: mở bằng một tình huống 30 giây về an toàn hiến máu, nối hook với giá trị học thật về quy trình kiểm tra điều kiện và mời người học remix thành câu hỏi. Cách đo kết quả: đo tỉ lệ trả lời đúng câu hỏi truy hồi và số người hoàn thành Boss Proof thay vì chỉ đếm lượt xem.",
    });
    const transferSubmitted = await service.submitAttempt(actor, journeyId, String(transfer.id));
    expect(transferSubmitted.data).toMatchObject({ status: "passed", xpAwarded: 15 });

    const boss = (
      await service.createAttempt(actor, journeyId, { nodeId: "boss_artifact" })
    ).data;
    await service.updateAttempt(actor, journeyId, String(boss.id), {
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

    expect(await count("assessment_results", "rubric_snapshot ? 'id'")).toBe(3);
    expect(await count("branch_commits", "journey_id = $1", [journeyId])).toBeGreaterThanOrEqual(5);
    expect(await count("mastery_states", "user_id = $1", [actor.userId])).toBeGreaterThan(0);
    expect(await count("xp_ledger_entries", "user_id = $1", [actor.userId])).toBe(3);

    const projection = await db.query<{ lifetime_xp: number | string; last_entry_sequence: number | string }>(
      "select lifetime_xp, last_entry_sequence from xp_projections where user_id = $1",
      [actor.userId],
    );
    expect(Number(projection.rows[0]?.lifetime_xp)).toBe(60);
    expect(Number(projection.rows[0]?.last_entry_sequence)).toBe(3);
    expect(
      await count(
        "proofs",
        "owner_user_id = $1 and verification_level = 'system_recorded' and deleted_at is null",
        [actor.userId],
      ),
    ).toBe(1);
    expect(await count("proof_verification_events")).toBeGreaterThanOrEqual(1);
    expect(await count("outbox_events", "publish_state = 'pending'"))
      .toBeGreaterThan(0);
    expect(await count("audit_logs")).toBeGreaterThan(0);
    expect(await count("idempotency_records", "actor_user_id = $1", [actor.userId])).toBeGreaterThan(0);

    // A new service instance over the same store must reconstruct state from
    // PostgreSQL in a fresh Unit of Work rather than reuse an in-memory map.
    const reloadedService = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
    });
    expect(await reloadedService.getMyProgress(actor)).toMatchObject({ lifetimeXp: 60 });
    expect(JSON.stringify(await reloadedService.getProjectWorkspace(actor, projectId))).toContain(projectId);
    expect(await reloadedService.getJourney(actor, journeyId)).toMatchObject({
      status: "completed",
      currentNodeId: null,
    });

    // Persist upload-session/artifact/chunk metadata through PostgreSQL. Raw
    // bytes use the explicitly local object simulator in the same process.
    const textBytes = Buffer.from(
      "Bằng chứng là dữ kiện có thể đối chiếu với nguồn. Người học cần tách dữ kiện, diễn giải và kết luận.",
    );
    const textHash = createHash("sha256").update(textBytes).digest("hex");
    const upload = (
      await service.initiateArtifactUpload(actor, projectId, {
        kind: "file",
        fileName: "notes.txt",
        declaredMimeType: "text/plain",
        byteSize: textBytes.length,
        sha256: textHash,
        rightsBasis: "created_by_user",
      }, { baseUrl: "http://localhost:3000" })
    ).data;
    const uploadHeaders = upload.headers as Record<string, string>;
    await service.acceptLocalUpload(
      String(upload.artifactId),
      uploadHeaders["X-GON-Upload-Token"],
      textBytes,
      "text/plain",
    );
    const completedUpload = await service.completeArtifactUpload(
      actor,
      projectId,
      String(upload.artifactId),
      { sha256: textHash, byteSize: textBytes.length },
    );
    expect(completedUpload.data).toMatchObject({ extractionStatus: "ready", safetyStatus: "allowed" });
    expect(
      await count(
        "artifact_upload_sessions",
        "artifact_id = $1 and completed_at is not null",
        [String(upload.artifactId)],
      ),
    ).toBe(1);
    expect(
      await count(
        "content_chunks",
        "artifact_id = $1 and deleted_at is null",
        [String(upload.artifactId)],
      ),
    ).toBeGreaterThan(0);
  }, 240_000);

  it("uses SQL hybrid Search authorization before and after internal review", async () => {
    const ownerModule = await db.query<{ id: string }>(
      "select id from module_versions order by created_at, id limit 1",
    );
    const moduleVersionId = ownerModule.rows[0]?.id;
    expect(moduleVersionId).toBeTruthy();

    const { actor: other } = await activate("Người học PostgreSQL khác");
    const project = await service.createProject(other, {
      title: "Phân tích lan truyền nội dung",
      prompt:
        "Phân tích lan truyền nội dung bằng hook, mạng lưới chia sẻ, thời điểm văn hóa và khả năng remix với bằng chứng và giới hạn rõ ràng.",
      goal: "Hiểu cơ chế lan truyền nội dung",
      learningMode: "deep_mastery",
      depth: "standard",
      timeBudgetMinutes: 30,
    }, { idempotencyKey: "pg-iso-project" });
    const projectId = String(project.data.id);

    const before = await service.createSearchAttempt(
      other,
      projectId,
      {},
      { idempotencyKey: "pg-iso-before" },
    );
    expect(before.data.verdict).toBe("missing");
    expect(JSON.stringify(before.data.results)).not.toContain(moduleVersionId);

    await db.query(
      `update module_versions
          set visibility = 'internal_reviewed', publication_status = 'internal_reviewed'
        where id = $1`,
      [moduleVersionId],
    );

    const after = await service.createSearchAttempt(
      other,
      projectId,
      {},
      { idempotencyKey: "pg-iso-after" },
    );
    expect(["found", "related"]).toContain(after.data.verdict);
    expect(JSON.stringify(after.data.results)).toContain(moduleVersionId);
    expect(
      await count(
        "search_results",
        "search_attempt_id = $1 and module_version_id = $2",
        [String(after.data.id), moduleVersionId],
      ),
    ).toBe(1);
  }, 240_000);

  it("rolls back a failed Unit of Work and preserves append-only/immutable guards", async () => {
    const usersBefore = await count("gon_users");
    await expect(
      store.runInTransaction(async (repositories) => {
        repositories.users.set("usr_rollbackpglite", {
          id: "usr_rollbackpglite",
          status: "onboarding",
          locale: "vi-VN",
          timeZone: "Asia/Ho_Chi_Minh",
          createdAt: new Date().toISOString(),
          deletedAt: null,
          roles: ["learner"],
        });
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");
    expect(await count("gon_users")).toBe(usersBefore);
    expect(await service.findUserById("usr_rollbackpglite")).toBeUndefined();

    const uninvited = await service.ensureDevUser("Người dùng rollback invite");
    const actor: Actor = {
      userId: uninvited.id,
      roles: uninvited.roles,
      authProvider: "test",
      requestId: "req_pglite_rollback",
    };
    await expect(
      service.createAgeAttestation(actor, {
        isAtLeast18: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        personalizationFootprint: "denied",
        inviteCode: "SAI-MA",
      }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID_OR_EXPIRED" });
    expect(await count("age_attestations", "user_id = $1", [uninvited.id])).toBe(0);
    expect((await service.findUserById(uninvited.id))?.status).toBe("onboarding");

    await expect(
      db.query("update xp_ledger_entries set delta = delta where true"),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query("update module_versions set title = title || ' changed' where true"),
    ).rejects.toThrow(/immutable/);
  }, 180_000);

  it("claims a queued Brew job in SQL and processes it through the domain worker", async () => {
    const { actor } = await activate("Người học durable Brew");
    const queuedService = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
      brewExecutionMode: "queued",
      featureFlags: { brew_enabled: true },
    });

    const project = await queuedService.createProject(actor, {
      title: "Thủy triều và đồng bằng",
      prompt:
        "Vì sao thủy triều, phù sa, xâm nhập mặn và lịch canh tác ở đồng bằng phải được hiểu như một hệ thống có bằng chứng và giới hạn theo mùa?",
      goal: "Tạo module ngắn về hệ thống thủy triều và canh tác",
      learningMode: "deep_mastery",
      depth: "standard",
      timeBudgetMinutes: 30,
      locale: "vi-VN",
    }, { idempotencyKey: "pg-queued-project" });
    const projectId = String(project.data.id);

    const search = await queuedService.createSearchAttempt(
      actor,
      projectId,
      {},
      { idempotencyKey: "pg-queued-search" },
    );
    expect(search.data.status).toBe("completed");
    expect(["missing", "related", "found"]).toContain(search.data.verdict);

    const modulesBefore = await count("module_versions");
    const queued = await queuedService.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: String(search.data.id), confirmed: true },
      { idempotencyKey: "pg-queued-brew" },
    );
    expect(queued.data).toMatchObject({
      status: "queued",
      attemptCount: 0,
      resultModuleVersionId: null,
    });
    expect(await count("module_versions")).toBe(modulesBefore);
    expect(
      await count("async_jobs", "id = $1 and status = 'queued' and lease_owner is null", [String(queued.data.id)]),
    ).toBe(1);

    const queue = new PostgresJobQueue({
      query: async (text, params = []) => db.query(text, params as never[]),
    });
    const result = await runNextPostgresBrewJob({
      queue,
      service: queuedService,
      workerId: "pglite-worker-a",
      leaseMs: 60_000,
    });
    expect(result.claimed).toBe(true);
    if (!result.claimed) throw new Error("Expected queued Brew job to be claimed");
    expect(result.job).toMatchObject({
      id: queued.data.id,
      status: "succeeded",
      attemptCount: 1,
    });
    expect(String(result.job.resultModuleVersionId).startsWith("modv_")).toBe(true);
    expect(await count("module_versions")).toBe(modulesBefore + 1);
    expect(
      await count(
        "async_jobs",
        "id = $1 and status = 'succeeded' and attempt_count = 1 and lease_owner is null and lease_expires_at is null",
        [String(queued.data.id)],
      ),
    ).toBe(1);

    const replay = await queuedService.processQueuedBrewJob(String(queued.data.id), {
      workerId: "pglite-worker-b",
    });
    expect(replay).toMatchObject({
      id: queued.data.id,
      status: "succeeded",
      resultModuleVersionId: result.job.resultModuleVersionId,
    });
    expect(await count("module_versions")).toBe(modulesBefore + 1);
  }, 240_000);
});
