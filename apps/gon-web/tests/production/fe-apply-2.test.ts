/**
 * Apply-3b (27/10/2026) — FE wiring các bề mặt production vào /v1 thật:
 * Arena live (backend Apply-2) + Game session launcher (backend Apply-3).
 * Pattern: logic thuần trong src/lib/gon-live-api.ts + source check wiring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ARENA_VOTE_CHOICES,
  arenaLiveCandidateIds,
  arenaLiveSlotLabel,
  GAME_EVENT_SCHEMA_VERSION,
  GAME_EVENT_TYPES,
  GAME_SESSION_OPEN_STATUSES,
  gameEvent,
  gameEventBatch,
  gameTemplateIdForNode,
} from "@/lib/gon-live-api";

describe("Apply-3b · Arena live (P03 choice enum + điều kiện mở trận)", () => {
  it("5 choice vote đúng enum backend: left_better | right_better | tie | both_bad | merge", () => {
    expect(ARENA_VOTE_CHOICES.map((choice) => choice.id)).toEqual([
      "left_better",
      "right_better",
      "tie",
      "both_bad",
      "merge",
    ]);
  });

  it("chọn đúng 2 id unique đầu; thiếu/trùng thì null (không mở trận)", () => {
    expect(arenaLiveCandidateIds([{ id: "cand_a" }, { id: "cand_b" }, { id: "cand_c" }])).toEqual(["cand_a", "cand_b"]);
    expect(arenaLiveCandidateIds([{ id: "cand_a" }, { id: "cand_a" }])).toBeNull();
    expect(arenaLiveCandidateIds([{ id: "cand_a" }])).toBeNull();
    expect(arenaLiveCandidateIds([])).toBeNull();
    expect(arenaLiveCandidateIds([{ id: "" }, { id: "cand_b" }])).toBeNull();
  });

  it("nhãn slot ẩn danh có fallback an toàn", () => {
    expect(arenaLiveSlotLabel({ summary: "Lộ trình web", format: "web_lesson", estimatedMinutes: 30 })).toEqual({
      summary: "Lộ trình web",
      format: "web_lesson",
      estimatedMinutes: "30",
    });
    expect(arenaLiveSlotLabel(null).summary).toBe("Output ẩn danh");
    expect(arenaLiveSlotLabel({}).estimatedMinutes).toBe("?");
  });
});

describe("Apply-3b · Game event batch (schema gon.game-events/1.0)", () => {
  it("batch đúng hình dạng schema: schemaVersion const + sessionId + events", () => {
    const batch = gameEventBatch("game_abc123", [
      { clientEventId: "live-start-0001", sequence: 1, eventType: "session_started" },
    ]);
    expect(batch).toEqual({
      schemaVersion: "gon.game-events/1.0",
      sessionId: "game_abc123",
      events: [
        {
          clientEventId: "live-start-0001",
          sequence: 1,
          eventType: "session_started",
          occurredAtClient: new Date(0).toISOString(),
          data: {},
        },
      ],
    });
    expect(GAME_EVENT_SCHEMA_VERSION).toBe("gon.game-events/1.0");
  });

  it("event ép clientEventId về khoảng 8–128 ký tự", () => {
    expect(gameEvent({ clientEventId: "short", sequence: 1, eventType: "session_started" }).clientEventId.length).toBeGreaterThanOrEqual(8);
    const padded = gameEvent({ clientEventId: `x-${"a".repeat(200)}`, sequence: 1, eventType: "session_started" });
    expect(String(padded.clientEventId).length).toBeLessThanOrEqual(128);
  });

  it("7 eventType đúng enum backend; session chỉ mở khi created/active", () => {
    expect(GAME_EVENT_TYPES).toHaveLength(7);
    expect(GAME_SESSION_OPEN_STATUSES.has("created")).toBe(true);
    expect(GAME_SESSION_OPEN_STATUSES.has("active")).toBe(true);
    expect(GAME_SESSION_OPEN_STATUSES.has("completed")).toBe(false);
    expect(GAME_SESSION_OPEN_STATUSES.has("abandoned")).toBe(false);
  });

  it("templateId từ node: ưu tiên format hợp lệ, fallback web_lesson", () => {
    expect(gameTemplateIdForNode({ format: "teach_back" })).toBe("gdevelop_teach_back");
    expect(gameTemplateIdForNode({ format: "BAD FORMAT!" })).toBe("gdevelop_web_lesson");
    expect(gameTemplateIdForNode(null)).toBe("gdevelop_web_lesson");
  });
});

describe("Apply-3b · Production wiring source checks", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

  it("ArenaPanel gọi đúng 2 endpoint /v1 arena và mở revealed sau vote", () => {
    const source = read("../../src/components/gon/ArenaPanel.tsx");
    expect(source).toContain("/arena-matches");
    expect(source).toContain("/votes");
    expect(source).toContain("revealedCandidates");
    expect(source).toContain("personalRankingExplanationCodes");
    expect(source).toContain("mergedCandidateId");
  });

  it("Vs1App truyền project + candidates thật cho ArenaPanel và đặt GameSessionLauncher trong Journey Player", () => {
    const source = read("../../src/components/Vs1App.tsx");
    expect(source).toContain("<ArenaPanel projectId={selectedProjectId} candidates={arenaLiveCandidates} />");
    expect(source).toContain("<GameSessionLauncher");
    expect(source).toContain('journeyId={String(player.journey.id)}');
    expect(source).toContain('nodeId={String(activeNode.id)}');
  });

  it("GameSessionLauncher tạo session + gửi event batch đúng endpoint", () => {
    const source = read("../../src/components/gon/GameSessionLauncher.tsx");
    expect(source).toContain("/game-sessions");
    expect(source).toContain("/events");
    expect(source).toContain("session_started");
    expect(source).toContain("session_completed");
    expect(source).toContain("GAME_SESSION_NOT_OPEN");
  });
});
