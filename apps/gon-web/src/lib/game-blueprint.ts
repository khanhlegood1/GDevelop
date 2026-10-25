/**
 * GON — Game Blueprint Contract (code chính)
 * ------------------------------------------------------------------
 * QUYẾT ĐỊNH PO 24/10/2026 (tối muộn) — GDEVELOP SOURCE ÁP VÀO GON:
 * GON dùng GDevelop (MIT, monorepo này) để render định dạng Game (+ Easy-task).
 * Nguyên tắc vàng: **LLM/ADK sinh THAM SỐ (payload có kiểu), KHÔNG sinh game code** —
 * payload validate rồi nhồi vào template GDevelop (project JSON) và render bằng
 * GDJS Runtime (GDJS/Runtime) trong output screen, không cần backend/Electron.
 * Không dùng newIDE (editor 172MB) và tránh toolchain Core/C++ trong pipeline GON.
 *
 * Pipeline: Topic × persona × độ sâu → ADK chọn blueprint + sinh payload
 * → validateGonGamePayload() → project JSON → GDJS Runtime (iframe)
 * → game bắn GonLearningEvent về /api/v1 (P03) → checkpoint "hiểu thật" + XP
 * từ KẾT QUẢ CHƠI THẬT.
 *
 * Xem: docs/00-process/PO-DECISION-GDEVELOP-INTEGRATION-2026-10-24.md
 * Demo tham chiếu: ux-prototype/standalone/index.html (nút "🧩 Xem blueprint GDevelop").
 */

/** Các blueprint game làm sẵn (pedagogy + art); ADK chỉ chọn + điền payload. */
export const GON_GAME_BLUEPRINT_IDS = [
  "quiz-3",
  "sort-bins",
  "match-pairs",
  "flashcard-run",
  "fact-opinion-swipe",
  "escape-review",
] as const;

export type GonGameBlueprintId = (typeof GON_GAME_BLUEPRINT_IDS)[number];

export type GonGameTheme = "emerald-midnight" | "gold-arena" | "violet-focus" | "cyan-clear";

/** Một mục chơi (câu hỏi / thẻ ghép / mảnh phân loại…) — khoá mở theo blueprint. */
export interface GonGameItem {
  itemId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  hint?: string;
  /** Nhãn học tập (bias, khái niệm…) để báo cáo về POAP. */
  conceptTag?: string;
}

/** Payload có kiểu mà ADK/Gemini sinh ra — KHÔNG PHẢI game code. */
export interface GonGamePayload {
  blueprint: GonGameBlueprintId;
  topic: string;
  persona: "phd" | "kol" | "fun" | "adv";
  depth: "light" | "mid" | "deep";
  locale: "vi" | "en";
  theme: GonGameTheme;
  passThreshold: number;
  items: GonGameItem[];
}

/** Sự kiện học bắn từ trong game về GON (qua extension GonLearningEvents). */
export interface GonGameLearningEvent {
  type: "answer" | "finish";
  itemId?: string;
  correct?: boolean;
  score?: number;
  playedAt: string; // ISO timestamp
}

/** Kết quả validate payload trước khi render. */
export interface GonGameValidation {
  ok: boolean;
  errors: string[];
}

/** Validate payload — cửa an toàn để game LUÔN chạy được (AI generates, humans approve). */
export function validateGonGamePayload(payload: GonGamePayload): GonGameValidation {
  const errors: string[] = [];
  if (!GON_GAME_BLUEPRINT_IDS.includes(payload.blueprint)) {
    errors.push(`blueprint không hợp lệ: ${String(payload.blueprint)}`);
  }
  if (!payload.topic || payload.topic.trim().length < 2) errors.push("topic quá ngắn");
  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push("items rỗng");
  if (Array.isArray(payload.items)) {
    payload.items.forEach((item, i) => {
      if (!item.prompt) errors.push(`items[${i}].prompt rỗng`);
      if (!Array.isArray(item.options) || item.options.length < 2) errors.push(`items[${i}].options cần ≥2`);
      if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= (item.options?.length ?? 0)) {
        errors.push(`items[${i}].correctIndex ngoài phạm vi`);
      }
    });
  }
  if (!Number.isInteger(payload.passThreshold) || payload.passThreshold < 1) {
    errors.push("passThreshold cần ≥1");
  }
  if (Array.isArray(payload.items) && Number.isInteger(payload.passThreshold) && payload.passThreshold > payload.items.length) {
    errors.push("passThreshold > số items");
  }
  return { ok: errors.length === 0, errors };
}

/** Hợp đồng render production: engine nào, chạy đâu, bắn sự kiện đâu. */
export const GDJS_RENDER_CONTRACT = {
  engine: "GDJS Runtime (GDevelop, MIT) — GDJS/Runtime trong monorepo này",
  host: "iframe trong output screen của GON (không backend, không Electron)",
  extension: "GonLearningEvents — extension GDevelop bắn GonGameLearningEvent về /api/v1 (P03)",
  pinVersion: true,
  avoid: ["newIDE (editor — overkill)", "Core/C++ emscripten toolchain (ngoài critical path)"],
} as const;
