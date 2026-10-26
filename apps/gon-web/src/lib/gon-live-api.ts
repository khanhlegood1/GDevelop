/**
 * Apply-3b (27/10) — FE wiring helper cho các endpoint /v1 đã có backend thật:
 * - Arena live (Apply-2): POST /projects/{id}/arena-matches · POST /arena-matches/{id}/votes
 * - Game session live (Apply-3): POST /journeys/{id}/game-sessions · POST /game-sessions/{id}/events
 * Logic thuần (không fetch) để test được theo pattern fe-apply.test.ts.
 */

/** Choice vote P03 — đúng enum backend (Apply-2). */
export const ARENA_VOTE_CHOICES = [
  { id: "left_better", label: "⬅️ A tốt hơn" },
  { id: "right_better", label: "➡️ B tốt hơn" },
  { id: "tie", label: "🤝 Hoà" },
  { id: "both_bad", label: "👎 Cả hai chưa đạt" },
  { id: "merge", label: "🔀 Gộp cả hai" },
] as const;

export type ArenaLiveChoice = (typeof ARENA_VOTE_CHOICES)[number]["id"];

export interface ArenaLiveCandidate {
  id: string;
  title?: unknown;
  format?: unknown;
}

/**
 * Chọn 2 id unique đầu tiên từ danh sách candidate của Output Explorer.
 * Trả null khi chưa đủ điều kiện mở trận /v1 (backend yêu cầu đúng 2 id khác nhau).
 */
export function arenaLiveCandidateIds(candidates: ArenaLiveCandidate[]): [string, string] | null {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate?.id !== "string" || candidate.id.length === 0) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    ids.push(candidate.id);
    if (ids.length === 2) return [ids[0]!, ids[1]!];
  }
  return null;
}

/** Nhãn slot ẩn danh trước vote (summary/format/phút) — không lộ title đầy đủ. */
export function arenaLiveSlotLabel(slot: unknown): { summary: string; format: string; estimatedMinutes: string } {
  const record = (slot ?? {}) as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" && record.summary.length > 0 ? record.summary : "Output ẩn danh",
    format: typeof record.format === "string" ? record.format : "",
    estimatedMinutes: record.estimatedMinutes == null ? "?" : String(record.estimatedMinutes),
  };
}

/** Game event batch đúng schema gon.game-events/1.0 (P03). */
export const GAME_EVENT_SCHEMA_VERSION = "gon.game-events/1.0";

export const GAME_EVENT_TYPES = [
  "session_started",
  "objective_viewed",
  "action_performed",
  "checkpoint_reached",
  "question_answered",
  "session_completed",
  "session_abandoned",
] as const;

export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

/** Session còn nhận event khi created/active (backend chặn 409 khi đã đóng). */
export const GAME_SESSION_OPEN_STATUSES = new Set(["created", "active"]);

export interface GameEventInput {
  clientEventId: string;
  sequence: number;
  eventType: GameEventType;
  occurredAtClient?: string;
  data?: Record<string, unknown>;
}

export function gameEvent(input: GameEventInput): Record<string, unknown> {
  const clientEventId = input.clientEventId.length >= 8 && input.clientEventId.length <= 128
    ? input.clientEventId
    : `live-evt-${input.clientEventId}`.slice(0, 128);
  return {
    clientEventId,
    sequence: input.sequence,
    eventType: input.eventType,
    occurredAtClient: input.occurredAtClient ?? new Date(0).toISOString(),
    data: input.data ?? {},
  };
}

export function gameEventBatch(sessionId: string, events: GameEventInput[]): Record<string, unknown> {
  return {
    schemaVersion: GAME_EVENT_SCHEMA_VERSION,
    sessionId,
    events: events.map((event) => gameEvent(event)),
  };
}

/** TemplateId cho node — format node ưu tiên, mặc định web_lesson. */
export function gameTemplateIdForNode(node: unknown): string {
  const record = (node ?? {}) as Record<string, unknown>;
  const format = typeof record.format === "string" && /^[a-z0-9_]{3,64}$/.test(record.format) ? record.format : "web_lesson";
  return `gdevelop_${format}`;
}
