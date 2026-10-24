/**
 * GON — Product Decision Registry (code chính)
 * ------------------------------------------------------------------
 * Nơi ghi các quyết định sản phẩm của Product Owner có hiệu lực
 * bắt buộc đối với front-end production khi triển khai.
 *
 * QUYẾT ĐỊNH 24/10/2026 (tối muộn) — UNIFIED DISCOVER:
 * "Persona đầu ra (🔬 PhD / Nghiên cứu, 🎬 KOL / Sáng tạo, 🎈 Giải trí,
 *  🚀 Nâng cao) và các Độ sâu: KHÔNG hiện ra cho user chọn mà mặc định
 *  chạy tất cả các tổ hợp đó và xuất ra nhiều output như TikTok; nếu user
 *  chọn kết quả nào thì đó chính là Persona đầu ra — cũng chính là Arena
 *  và là dấu chân đẳng cấp của user. Vì vậy gộp màn hình Brew và màn hình
 *  Arena vào chung màn hình Khám phá."
 * (nguyên văn PO — xem docs/00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md)
 *
 * Demo tham chiếu đã triển khai: ux-prototype/standalone/index.html (E2E 82/82).
 */
export const UNIFIED_DISCOVER_DECISION = {
  id: "PO-2026-10-24-UNIFIED-DISCOVER",
  date: "2026-10-24",
  source: "Product Owner (GON) — kèm screenshot, 24/10/2026 tối muộn",
  decisionDoc: "docs/00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md",
  implementedInDemo: "apps/gon-web/ux-prototype/standalone/index.html",
} as const;

/** Các persona đầu ra — KHÔNG cho user chọn (quyết định 24/10). */
export const OUTPUT_PERSONAS = [
  { id: "phd", label: "PhD / Nghiên cứu", em: "🔬" },
  { id: "kol", label: "KOL / Sáng tạo", em: "🎬" },
  { id: "fun", label: "Giải trí", em: "🎈" },
  { id: "adv", label: "Nâng cao", em: "🚀" },
] as const;

export type OutputPersonaId = (typeof OUTPUT_PERSONAS)[number]["id"];

/** Các độ sâu — KHÔNG cho user chọn (quyết định 24/10). */
export const OUTPUT_DEPTHS = [
  { id: "light", label: "Nhẹ", em: "🌤️", items: 3 },
  { id: "mid", label: "Vừa", em: "☀️", items: 5 },
  { id: "deep", label: "Sâu", em: "🌌", items: 8 },
] as const;

export type OutputDepthId = (typeof OUTPUT_DEPTHS)[number]["id"];

/**
 * Mặc định chạy TẤT CẢ tổ hợp Persona × Độ sâu và xuất nhiều output
 * (feed kiểu TikTok). FE production KHÔNG được render UI chọn
 * persona/độ sâu cho user.
 */
export const RUN_ALL_PERSONA_DEPTH_COMBOS = true;

/**
 * Persona của user được BỘC LỘ qua output họ chọn (không tự chọn):
 * mỗi lần chọn = persona reveal + tín hiệu Arena + dấu chân đẳng cấp.
 */
export const PERSONA_REVEAL_FROM_PICKS = true;

/**
 * Màn hình riêng cho Brew (S04) và Arena (S11) bị BỎ — gộp vào Khám phá (S03):
 *  - Brew pipeline chạy inline trong Khám phá (tìm yếu/chưa có chủ đề).
 *  - Vote Arena là một khối trong Khám phá.
 *  - Route cũ #/brew, #/arena phải redirect về #/discover.
 */
export const MERGED_SCREENS = {
  brew: "discover",
  arena: "discover",
} as const;

/** Một "lượt chọn output" của user (dấu chân đẳng cấp / persona reveal). */
export interface OutputPick {
  outputId: string;
  title: string;
  persona: OutputPersonaId;
  depth: OutputDepthId;
  pickedAt: string; // ISO timestamp
}

/**
 * "Dấu chân đẳng cấp" — persona dominant được tính từ các lượt chọn
 * (chưa có lựa chọn nào → chưa có dấu chân).
 */
export function dominantPersona(picks: ReadonlyArray<OutputPick>): OutputPersonaId | null {
  if (picks.length === 0) return null;
  const counts = new Map<OutputPersonaId, number>();
  for (const p of picks) counts.set(p.persona, (counts.get(p.persona) ?? 0) + 1);
  let best: OutputPersonaId = picks[0].persona;
  let bestCount = -1;
  for (const [persona, count] of counts) {
    if (count > bestCount) {
      best = persona;
      bestCount = count;
    }
  }
  return best;
}
