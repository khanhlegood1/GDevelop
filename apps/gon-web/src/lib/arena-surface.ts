/**
 * BỀ MẶT ARENA (production port của FE-Confirm-9/11/13/14):
 * - Battle ẩn danh 4 lựa chọn vote + ±Elo (kiểu arena.ai)
 * - Side-by-side: user TỰ CHỌN 2 output để so trực tiếp (FE-Confirm-14)
 * - Embed FastChat: same-origin `/arena-embed.html?embed=1` (stand-in demo)
 *   và công thức production `https://<space>.hf.space/?embed=true` (self-host,
 *   Gate 0 — Apache-2.0). KHÔNG nhúng arena.ai/lmarena trực tiếp (bị chặn
 *   iframe + phạm ToS).
 *
 * Ghi chú trung thực: trong VS1 các vote này là bề mặt CỤC BỘ (chưa ghi vào
 * /v1 — backend arena xếp sau P05). Hợp đồng vote đã định kiểu tại đây để
 * backend nối đúng khi sẵn sàng.
 */

export type ArenaVoteChoice = "a" | "b" | "tie" | "bothbad";

export interface ArenaEloDelta {
  a: number;
  b: number;
}

export const ARENA_ELO_DELTAS: Readonly<Record<ArenaVoteChoice, ArenaEloDelta>> = {
  a: { a: 8, b: -5 },
  b: { a: -5, b: 8 },
  tie: { a: 1, b: 1 },
  bothbad: { a: -4, b: -4 },
} as const;

export interface ArenaBattlePair {
  topic: string;
  a: { title: string; model: string };
  b: { title: string; model: string };
}

/** Pool cặp đấu (mirror standalone — dữ liệu mô phỏng, gắn nhãn rõ trong UI). */
export const ARENA_PAIRS: readonly ArenaBattlePair[] = [
  {
    topic: "5 bước phân tích lập luận",
    a: { title: "Infographic: 5 bước phân tích", model: "ADK · gemini" },
    b: { title: "Video 6 phút: 7 bias", model: "ADK · veo-style" },
  },
  {
    topic: "7 bias nhận thức",
    a: { title: "Bài đọc 8 phút: bias là gì", model: "ADK · fast-mode" },
    b: { title: "Mini-game: né bias", model: "GDevelop render" },
  },
  {
    topic: "fact / opinion / claim",
    a: { title: "Easy-task: soát 1 tin giả", model: "ADK · task-gen" },
    b: { title: "Bộ ảnh: 6 phép loại suy sai", model: "ADK · imagen-style" },
  },
] as const;

export interface SideBySideOutput {
  id: string;
  title: string;
  /** pipeline sinh output — mở nhãn SAU vote (nguyên tắc mù) */
  model: string;
}

/** Danh sách output cho Side-by-side (mirror standalone, gắn nhãn mô phỏng). */
export const SIDE_BY_SIDE_OUTPUTS: readonly SideBySideOutput[] = [
  { id: "OUT-01", title: "Bài đọc 8 phút: Phản biện là gì", model: "ADK · checker-pass" },
  { id: "OUT-02", title: "Infographic: 5 bước phân tích lập luận", model: "ADK · gemini" },
  { id: "OUT-03", title: "Video 6 phút: 7 bias nhận thức", model: "ADK · veo-style" },
  { id: "OUT-04", title: "Giáo trình chi tiết + 14 trích dẫn", model: "ADK · scholar-mode" },
  { id: "OUT-05", title: "Mini-game: nhận diện ngụy biện", model: "GDevelop render" },
  { id: "OUT-06", title: "Bộ ảnh: 6 phép loại suy sai", model: "ADK · imagen-style" },
  { id: "OUT-07", title: "Easy-task: soát 1 tin giả", model: "ADK · task-gen" },
  { id: "OUT-08", title: "Chế độ lướt nhanh 90 giây", model: "ADK · fast-mode" },
] as const;

export interface ArenaVoteRecord {
  choice: ArenaVoteChoice;
  /** model được chọn (chỉ có khi choice là a/b), null với tie/bothbad */
  model: string | null;
  /** bề mặt ghi vote: battle (ẩn danh) · side-by-side (tự chọn) · embed (FastChat iframe) */
  via: "battle" | "side-by-side" | "embed";
  t: number;
}

export function applyArenaVote(choice: ArenaVoteChoice, pair: ArenaBattlePair): ArenaVoteRecord {
  return {
    choice,
    model: choice === "a" ? pair.a.model : choice === "b" ? pair.b.model : null,
    via: "battle",
    t: Date.now(),
  };
}

/** Side-by-side chỉ hợp lệ khi 2 output khác nhau (mirror standalone). */
export function canStageSideBySide(indexA: number, indexB: number, poolSize: number): boolean {
  if (!Number.isInteger(indexA) || !Number.isInteger(indexB)) return false;
  if (indexA < 0 || indexB < 0 || indexA >= poolSize || indexB >= poolSize) return false;
  return indexA !== indexB;
}

/** URL nhúng arena same-origin của chính GON (asset public/arena-embed.html). */
export function gonArenaEmbedUrl(): string {
  return "/arena-embed.html?embed=1";
}

/** Công thức production: self-host FastChat dưới Gradio/HF Space (?embed=true kiểu Gradio). */
export function fastChatEmbedUrl(spaceName: string): string {
  const clean = spaceName.trim().replace(/^https?:\/\//, "").replace(/[/.]+$/, "");
  if (!clean || /[^a-z0-9-]/i.test(clean)) {
    throw new Error("Tên FastChat Space không hợp lệ (chỉ a–z, 0–9, gạch ngang)");
  }
  return `https://${clean}.hf.space/?embed=true`;
}
