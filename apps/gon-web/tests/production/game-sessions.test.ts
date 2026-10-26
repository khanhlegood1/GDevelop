import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * Apply-3 (27/10) — Game sessions & events trên /v1 thật, theo hợp đồng P03:
 * POST /journeys/{id}/game-sessions (GameSessionLaunch) ·
 * GET /game-sessions/{id} · POST /game-sessions/{id}/events (batch gon.game-events/1.0).
 */

function createService() {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    featureFlags: { brew_enabled: true },
  });
  return { store, service };
}

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_test" };
  activationSequence += 1;
  const inviteCode = `GON-ALPHA-TEST-${activationSequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode,
  });
  return { user, actor };
}

async function seedJourney(service: GonService, actor: Actor) {
  const project = (
    await service.createProject(
      actor,
      {
        title: "Học qua game session",
        prompt: "Vì sao một phiên học tương tác cần event batch idempotent và state máy chủ thay vì chỉ đếm ở client?",
        goal: "Hiểu game session như đơn vị học có bằng chứng",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "game-project-001" },
    )
  ).data;
  const projectId = String(project.id);
  const search = (
    await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "game-search-001" })
  ).data;
  const brew = await service.createBrewJob(
    actor,
    projectId,
    { searchAttemptId: String(search.id), confirmed: true },
    { idempotencyKey: "game-brew-001" },
  );
  expect(brew.status).toBe(202);
  const explorer = await service.getOutputExplorer(actor, projectId);
  const candidates = explorer.candidates as Array<Record<string, unknown>>;
  const journey = (
    await service.createJourney(actor, { candidateId: String(candidates[0]!.id), ifExists: "return_existing" })
  ).data as Record<string, unknown>;
  const player = (await service.getJourneyPlayer(actor, String(journey.id))) as Record<string, unknown>;
  const graph = player.playerGraph as { nodes: Array<{ id: string }> };
  return { journeyId: String(journey.id), nodeId: graph.nodes[0]!.id };
}

function event(clientEventId: string, sequence: number, eventType: string, data: unknown = {}) {
  return { clientEventId, sequence, eventType, occurredAtClient: "2026-10-27T10:00:00.000Z", data };
}

function batch(sessionId: string, events: unknown[]) {
  return { schemaVersion: "gon.game-events/1.0", sessionId, events };
}

describe("game sessions /v1 (Apply-3)", () => {
  it("creates a launch with filtered config, then progresses created → active → completed", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học game session");
    const { journeyId, nodeId } = await seedJourney(service, actor);

    const launch = (
      await service.createGameSession(actor, journeyId, { nodeId, templateId: "gdevelop_interactive_lesson" })
    ).data as Record<string, unknown>;

    expect(String(launch.id)).toMatch(/^game_/);
    expect(launch.status).toBe("created");
    expect(typeof launch.launchToken).toBe("string");
    expect(launch.templateVersion).toMatch(/^modv_/);
    expect(launch.launchUrl).toBeNull();
    expect(launch.validatedLearningEffect).toBeNull();
    const config = launch.config as { nodes: unknown[] };
    expect(config.nodes.length).toBeGreaterThan(0);
    // Config đã lọc: không rò rỉ đáp án ẩn của module graph.
    expect(JSON.stringify(config)).not.toContain("sampleAnswer");
    expect(JSON.stringify(config)).not.toContain("conceptTermGroups");

    // GET không trả lại launchToken/config — chỉ dto session.
    const fetched = (await service.getGameSession(actor, String(launch.id))) as Record<string, unknown>;
    expect(fetched.status).toBe("created");
    expect("launchToken" in fetched).toBe(false);
    expect("config" in fetched).toBe(false);

    // Batch đầu: session_started → active.
    const started = (
      await service.appendGameEvents(actor, String(launch.id), batch(String(launch.id), [
        event("evt-start-000001", 1, "session_started"),
        event("evt-objective-01", 2, "objective_viewed", { objective: "intro" }),
      ]))
    ).data as Record<string, unknown>;
    expect(started.status).toBe("active");

    // Batch hai: học + hoàn tất → completed.
    const done = (
      await service.appendGameEvents(actor, String(launch.id), batch(String(launch.id), [
        event("evt-question-001", 3, "question_answered", { correct: true }),
        event("evt-checkpoint-1", 4, "checkpoint_reached", { checkpointId: "cp1" }),
        event("evt-complete-001", 5, "session_completed", { finalScore: 0.9 }),
      ]))
    ).data as Record<string, unknown>;
    expect(done.status).toBe("completed");

    const stored = store.gameSessions.get(String(launch.id));
    expect(stored?.status).toBe("completed");
    expect([...store.gameEvents.values()].filter((item) => item.sessionId === String(launch.id))).toHaveLength(5);
  });

  it("replays a duplicate clientEventId without duplicating work, then locks the closed session", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học replay event");
    const { journeyId, nodeId } = await seedJourney(service, actor);
    const session = (
      await service.createGameSession(actor, journeyId, { nodeId, templateId: "gdevelop_quiz" })
    ).data as Record<string, unknown>;
    const sessionId = String(session.id);

    await service.appendGameEvents(actor, sessionId, batch(sessionId, [event("evt-complete-001", 1, "session_completed")]));
    // Replay cùng clientEventId sau khi đóng: batch bị từ chối vì session đã completed.
    await expect(
      service.appendGameEvents(actor, sessionId, batch(sessionId, [event("evt-complete-001", 1, "session_completed")])),
    ).rejects.toThrowError(expect.objectContaining({ code: "GAME_SESSION_NOT_OPEN" }));
    expect([...store.gameEvents.values()].filter((item) => item.sessionId === sessionId)).toHaveLength(1);

    const abandoned = (
      await service.createGameSession(actor, journeyId, { nodeId, templateId: "gdevelop_quiz" })
    ).data as Record<string, unknown>;
    await service.appendGameEvents(actor, String(abandoned.id), batch(String(abandoned.id), [
      event("evt-start-000002", 1, "session_started"),
    ]));
    // Batch lẫn event mới + event trùng trong lúc session còn mở: event trùng bị bỏ qua.
    const mixed = (
      await service.appendGameEvents(actor, String(abandoned.id), batch(String(abandoned.id), [
        event("evt-start-000002", 2, "session_started"),
        event("evt-action-001", 3, "action_performed", { action: "click" }),
      ]))
    ).data as Record<string, unknown>;
    expect(mixed.status).toBe("active");
    expect([...store.gameEvents.values()].filter((item) => item.sessionId === String(abandoned.id))).toHaveLength(2);
  });

  it("validates batch shape per game-event.schema.json", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Người học gửi batch sai");
    const { journeyId, nodeId } = await seedJourney(service, actor);
    const session = (
      await service.createGameSession(actor, journeyId, { nodeId, templateId: "gdevelop_teach_back" })
    ).data as Record<string, unknown>;
    const sessionId = String(session.id);

    await expect(service.appendGameEvents(actor, sessionId, { schemaVersion: "gon.game-events/0.9", sessionId, events: [event("evt-a-00000001", 1, "session_started")] }))
      .rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(service.appendGameEvents(actor, sessionId, batch(sessionId, [])))
      .rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(service.appendGameEvents(actor, sessionId, batch(sessionId, [event("short", 1, "session_started")])))
      .rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(service.appendGameEvents(actor, sessionId, batch(sessionId, [event("evt-a-00000001", 0, "session_started")])))
      .rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(service.appendGameEvents(actor, sessionId, batch(sessionId, [event("evt-a-00000001", 1, "level_up")])))
      .rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(service.appendGameEvents(actor, sessionId, batch(sessionId, [event("evt-a-00000001", 1, "session_started", "khong-phai-object")])))
      .rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    // nodeId lạ khi tạo session cũng bị chặn.
    await expect(
      service.createGameSession(actor, journeyId, { nodeId: "node_khong_ton_tai", templateId: "gdevelop_teach_back" }),
    ).rejects.toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("keeps sessions private to their owner", async () => {
    const { service } = createService();
    const { actor } = await activate(service, "Chủ game session");
    const other = await activate(service, "Người học khác");
    const { journeyId, nodeId } = await seedJourney(service, actor);
    const session = (
      await service.createGameSession(actor, journeyId, { nodeId, templateId: "gdevelop_flashcards" })
    ).data as Record<string, unknown>;

    await expect(service.getGameSession(other.actor, String(session.id))).rejects.toThrowError(
      expect.objectContaining({ code: "GAME_SESSION_FORBIDDEN" }),
    );
    await expect(
      service.appendGameEvents(other.actor, String(session.id), batch(String(session.id), [event("evt-x-00000001", 1, "session_started")])),
    ).rejects.toThrowError(expect.objectContaining({ code: "GAME_SESSION_FORBIDDEN" }));
    await expect(service.getGameSession(actor, "game_khong_ton_tai")).rejects.toThrowError(
      expect.objectContaining({ code: "RESOURCE_NOT_FOUND" }),
    );
  });
});
