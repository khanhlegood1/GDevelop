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

/**
 * QUYẾT ĐỊNH 24/10/2026 (23:36, kèm screenshot) — INDEXEDDB CHO TOÀN BỘ DỰ ÁN:
 * "Trang Khám phá: phải mang dữ liệu từ thanh tìm kiếm qua cho đồng bộ
 *  tất cả dữ liệu. Chuyển sang dùng IndexedDB cho toàn bộ dự án này.
 *  Ghi vào tất cả tài liệu + code chính."
 * (nguyên văn PO — xem docs/00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md)
 *
 * Adapter production: src/lib/browser-storage.ts
 * (IndexedDB là kho chính; localStorage chỉ còn fallback + nguồn migrate.)
 */
export const INDEXEDDB_STORAGE_DECISION = {
  id: "PO-2026-10-24-STORAGE-INDEXEDDB",
  date: "2026-10-24",
  source: "Product Owner (GON) — 24/10/2026 23:36, kèm screenshot",
  decisionDoc: "docs/00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md",
  productionAdapter: "src/lib/browser-storage.ts",
  clientStorage: "IndexedDB (thay cho localStorage) cho toàn bộ dự án",
  searchSync: "Trang Khám phá mang theo dữ liệu từ thanh tìm kiếm — đồng bộ tất cả dữ liệu (query hai chiều giữa top search và ô tìm trong trang)",
} as const;

/**
 * QUYẾT ĐỊNH 24/10/2026 (tối) — BỘ HÀNH ĐỘNG XÃ HỘI (Fork · Remix · Like · Love · Share):
 * PO chọn phương án "Đầy đủ": Remix + 💜 "Đã hiểu thật" (gated sau checkpoint)
 * + bộ 6 hành động + trọng số tách bạch. Quy tắc cốt lõi:
 * Like/Love = phản ứng · Share = phân phối · Remix = sáng tạo phái sinh trên
 * NỘI DUNG (chọn tổ hợp persona × độ sâu của mình) · Fork = mang về cả
 * HÀNH TRÌNH để tự chủ (GitHub-like).
 * Chi tiết: docs/00-process/PO-DECISION-SOCIAL-ACTIONS-2026-10-24.md
 */
export const SOCIAL_ACTIONS_DECISION = {
  id: "PO-2026-10-24-SOCIAL-ACTIONS",
  date: "2026-10-24",
  source: "Product Owner (GON) — hỏi phân biệt Fork/Remix/Like/Love/Share, chọn phương án Đầy đủ",
  decisionDoc: "docs/00-process/PO-DECISION-SOCIAL-ACTIONS-2026-10-24.md",
  actions: {
    like: { trend: 3, xp: 0, meaning: "quý thích nhẹ (không cộng XP — chống farm)" },
    comment: { trend: 6, xp: "small", meaning: "thảo luận" },
    love: { trend: 5, xp: 2, meaning: '💜 "Đã hiểu thật" — CHỈ MỞ sau khi vượt checkpoint của output đó (gated reaction)' },
    share: { trend: 4, xp: "small", meaning: "phân phối — đem tên mình ra bảo đảm" },
    remix: { trend: 6, xp: 15, meaning: "output phái sinh theo tổ hợp persona × độ sâu CỦA BẠN (persona reveal); ghi công tác giả gốc" },
    fork: { trend: 8, xp: 20, meaning: "copy cả hành trình/module về làm của mình (GitHub-like)" },
  },
  learn: { trend: 12, meaning: "học từ output = tín hiệu mạnh nhất của nền tảng học" },
} as const;
