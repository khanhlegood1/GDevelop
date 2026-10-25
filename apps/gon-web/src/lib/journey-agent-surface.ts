/**
 * JOURNEY AGENT (production port của FE-Confirm-12 — Agent Mode arena.ai vào GON):
 * 1 lệnh → agent tự lập kế hoạch & thực thi trọn hành trình học bằng tools.
 * Orchestrator gán ngẫu nhiên kín tên mỗi phiên (nguyên tắc mù của arena.ai).
 *
 * 5 tín hiệu Agent Arena map sang GON; Net Improvement = trung bình có trọng số
 * (recovery ×0.5 — như Arena tính bash recovery nửa trọng số).
 */

export type JourneyAgentTool =
  | "plan"
  | "eval_query"
  | "brew_module"
  | "gen_payload"
  | "gd_render"
  | "checkpoint"
  | "grant_xp";

export interface JourneyAgentStep {
  tool: JourneyAgentTool;
  title: string;
  detail: string;
}

export const JOURNEY_AGENT_STEPS: readonly JourneyAgentStep[] = [
  { tool: "plan", title: "Lập kế hoạch hành trình", detail: "1 lệnh → agent tự bẻ hành trình thành các bước" },
  { tool: "eval_query", title: "Đánh giá truy vấn", detail: "độ mạnh của query + nội dung đã dính kèm" },
  { tool: "brew_module", title: "Brew module (phục hồi)", detail: "query yếu/không khớp → tự sinh module đầy đủ" },
  { tool: "gen_payload", title: "Sinh payload 6 định dạng", detail: "payload CÓ KIỂU (GonGamePayload) — không sinh game code" },
  { tool: "gd_render", title: "Render GDJS Runtime", detail: "blueprint → game chơi được, bắn GonLearningEvents" },
  { tool: "checkpoint", title: "Gắn checkpoint hiểu thật", detail: "XP chỉ tính khi có learningEvents thật (chống khai man)" },
  { tool: "grant_xp", title: "Chấm XP + chủ đề liên quan", detail: "level = floor(LifetimeXP/100) — uncapped" },
] as const;

export type AgentSignalId = "confirmedSuccess" | "praiseVsComplaint" | "steerability" | "recovery" | "honesty";

export interface AgentSignalSpec {
  id: AgentSignalId;
  label: string;
  /** tương đương GON (map từ tín hiệu Agent Arena của arena.ai) */
  gonMeaning: string;
  /** trọng số trong Net Improvement — recovery ×0.5 như bash recovery của Arena */
  weight: number;
}

export const AGENT_SIGNALS: readonly AgentSignalSpec[] = [
  { id: "confirmedSuccess", label: "✅ Confirmed success", gonMeaning: "💜 Đã hiểu thật — chỉ qua checkpoint/learningEvents thật", weight: 1 },
  { id: "praiseVsComplaint", label: "🗣️ Praise vs complaint", gonMeaning: "tim · bình luận · 💜 và phản hồi 👎 chưa đạt", weight: 1 },
  { id: "steerability", label: "🎯 Steerability", gonMeaning: "🎨 Remix — agent chỉnh hướng output theo ý người học", weight: 1 },
  { id: "recovery", label: "🔧 Recovery", gonMeaning: "🧪 Brew — query yếu → tự sinh module (tín hiệu hồi phục)", weight: 0.5 },
  { id: "honesty", label: "👻 Honesty", gonMeaning: "khai đã kiểm tra mà không có learningEvents → XP bị chặn", weight: 1 },
] as const;

export interface OrchestratorSignals {
  confirmedSuccess: number;
  praiseVsComplaint: number;
  steerability: number;
  recovery: number;
  honesty: number;
}

export interface OrchestratorProfile {
  name: string;
  tools: readonly JourneyAgentTool[];
  sig: OrchestratorSignals;
}

/** Pool orchestrator (mirror standalone v2.10 — mô phỏng, gắn nhãn trong UI). */
export const ORCHESTRATOR_POOL: readonly OrchestratorProfile[] = [
  {
    name: "ADK · gemini-orchestrator",
    tools: ["plan", "eval_query", "brew_module", "gen_payload", "gd_render", "checkpoint", "grant_xp"],
    sig: { confirmedSuccess: 8, praiseVsComplaint: 6, steerability: 9, recovery: 2, honesty: 11 },
  },
  {
    name: "ADK · fast-orchestrator",
    tools: ["plan", "eval_query", "gen_payload", "gd_render", "checkpoint"],
    sig: { confirmedSuccess: -6, praiseVsComplaint: -4, steerability: -5, recovery: -8, honesty: 3 },
  },
  {
    name: "ADK · brew-first-orchestrator",
    tools: ["plan", "eval_query", "brew_module", "gen_payload", "gd_render", "checkpoint"],
    sig: { confirmedSuccess: 3, praiseVsComplaint: 2, steerability: -2, recovery: 12, honesty: 5 },
  },
] as const;

/**
 * Net Improvement = trung bình CÓ TRỌNG SỐ của 5 tín hiệu (điểm % so với
 * orchestrator trung bình — randomized trial → so sánh nhân quả).
 * Ví dụ: {8,6,9,2,11} → (8+6+9+2*0.5+11)/5 = 7.
 */
export function agentNetImprovement(sig: OrchestratorSignals): number {
  const weighted =
    sig.confirmedSuccess * 1 +
    sig.praiseVsComplaint * 1 +
    sig.steerability * 1 +
    sig.recovery * 0.5 +
    sig.honesty * 1;
  return Math.round(weighted / 5);
}

/** Chọn orchestrator ngẫu nhiên kín tên cho một phiên (nguyên tắc mù arena.ai). */
export function pickBlindOrchestrator(pool: readonly OrchestratorProfile[] = ORCHESTRATOR_POOL): OrchestratorProfile {
  if (pool.length === 0) throw new Error("Orchestrator pool rỗng");
  return pool[Math.floor(Math.random() * pool.length)]!;
}
