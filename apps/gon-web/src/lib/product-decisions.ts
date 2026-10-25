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

/**
 * QUYẾT ĐỊNH 24/10/2026 (tối muộn) — ÁP DỤNG MÔ HÌNH arena.ai VÀO GON:
 * PO chọn phương án "Đầy đủ": 4 lựa chọn vote (A · B · Hoà · Cả hai chưa đạt),
 * "Đấu cặp khác" (pool cặp, 1 vote mỗi cặp), ±Elo hiển thị sau vote,
 * Leaderboard chuyên mục (định dạng + persona) và mũi tên xu hướng thứ hạng.
 * Nền tảng: Gate 0 — FastChat (Apache-2.0). Đặc sản GON: đấu output học tập
 * 6 định dạng; vote đồng thời là tín hiệu bộc lộ persona.
 * Chi tiết: docs/00-process/PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md
 */
export const ARENA_PATTERN_DECISION = {
  id: "PO-2026-10-24-ARENA-AI-PATTERN",
  date: "2026-10-24",
  source: "Product Owner (GON) — 'làm giống arena.ai áp dụng vào GON ntn?', chọn Đầy đủ",
  decisionDoc: "docs/00-process/PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md",
  battleOptions: ["a", "b", "tie", "bothbad"] as const,
  oneVotePerBattle: true,
  eloDeltaMock: { a: { a: 8, b: -5 }, b: { a: -5, b: 8 }, tie: { a: 1, b: 1 }, bothbad: { a: -4, b: -4 } },
  leaderboardCategories: ["all", "web", "video", "game", "infographic", "image", "easy_task"],
  rankMovementWindowDays: 7,
} as const;

/**
 * QUYẾT ĐỊNH 24/10/2026 (tối muộn) — GDEVELOP SOURCE ÁP VÀO GON:
 * Dùng GDJS Runtime + project JSON + Extensions của GDevelop (MIT) để render
 * định dạng Game (+ Easy-task). Nguyên tắc vàng: LLM/ADK sinh THAM SỐ có kiểu
 * (GonGamePayload), KHÔNG sinh game code — validate rồi nhồi vào template,
 * render bằng GDJS Runtime, game bắn GonLearningEvents về GON. Tránh newIDE
 * (172MB editor) và toolchain Core/C++ trong pipeline GON.
 * Contract: src/lib/game-blueprint.ts · Demo: nút "🧩 Xem blueprint GDevelop".
 */
export const GDEVELOP_INTEGRATION_DECISION = {
  id: "PO-2026-10-24-GDEVELOP-INTEGRATION",
  date: "2026-10-24",
  source: "Product Owner (GON) — 'Còn GDevelop source code thì áp dụng vào GON thế nào cho tốt?', chọn Đầy đủ",
  decisionDoc: "docs/00-process/PO-DECISION-GDEVELOP-INTEGRATION-2026-10-24.md",
  contract: "src/lib/game-blueprint.ts",
  useParts: ["GDJS/Runtime (engine JS)", "project JSON format", "Extensions (GonLearningEvents)"],
  avoidParts: ["newIDE (editor)", "Core/C++ emscripten toolchain"],
  goldenRule: "LLM sinh payload có kiểu (tham số), không sinh game code",
  learningEventsTo: "/api/v1 (P03) — checkpoint + XP từ kết quả chơi thật",
} as const;

/**
 * FE-Confirm-11 (24/10 tối muộn) — EMBED ARENA THẬT (cùng origin, kiểu Gradio):
 * PO hỏi "thêm iframe đưa arena.ai vào có chạy được không?" → KHÔNG (site chặn
 * iframe: X-Frame-Options/CSP + reCAPTCHA; cross-origin chỉ nhìn được).
 * Hướng chốt: embed thứ CHO PHÉP embed — GON arena riêng cùng origin
 * (standalone/arena-embed.html, ?embed=1 kiểu Gradio) + postMessage;
 * production: tự host FastChat (Gate 0) dạng Gradio/HF Space (?embed=true).
 *
 * FE-Confirm-13 (25/10) — MÀN HÌNH ARENA RIÊNG: PO chỉ thị "tạo menu arena
 * trước menu Leaderboard để nhúng iframe arena fastchat vào web stand alone"
 * → menu "⚔️ Arena" (trước Leaderboard) + route #/arena nhúng iframe cùng
 * origin; production nhúng FastChat self-host (?embed=true).
 */
export const ARENA_EMBED_SURFACE = {
  id: "PO-2026-10-24-ARENA-EMBED",
  date: "2026-10-24",
  source: "Product Owner (GON) — chốt hướng embed thật cùng origin sau câu hỏi iframe arena.ai",
  demoSurface: "ux-prototype/standalone/arena-embed.html",
  sameOrigin: true,
  gradioStyleParam: "?embed=1",
  postMessageContract: {
    app: "gon-arena-embed",
    type: "vote",
    pairId: "number",
    choice: "a | b | tie | bothbad",
    model: "string | null",
    t: "number (epoch ms)",
  } as Record<string, string>,
  embedderPath: "iframe same-origin trong khối Arena của Khám phá + window message listener",
  dedicatedScreen: "#/arena — menu '⚔️ Arena' đặt TRƯỚC Leaderboard (FE-Confirm-13), iframe #arena-fastchat-frame + bảng vote qua embed cập nhật live",
  fastChatEmbed: {
    demo: "iframe same-origin arena-embed.html?embed=1 (stand-in offline cho FastChat self-host)",
    production: "https://<fastchat-space>.hf.space/?embed=true — FastChat (Gate 0, Apache-2.0) tự host dưới Gradio/HF Space",
  } as Record<string, string>,
  productionPath: "FastChat (Gate 0, Apache-2.0) self-host dưới Gradio/HF Space — embeddable qua ?embed=true",
  doNot: ["nhúng arena.ai trực tiếp (bị chặn iframe)", "proxy để lách header (phạm ToS)"],
} as const;

/**
 * FE-Confirm-12 (25/10) — AGENT MODE (arena.ai) ÁP VÀO GON — JOURNEY AGENT:
 * 1 lệnh → agent tự lập kế hoạch & thực thi trọn hành trình học bằng tools
 * (plan → eval_query → brew_module → gen_payload → gd_render → checkpoint →
 * grant_xp) thay vì user bấm từng bước. Orchestrator gán ngẫu nhiên kín tên
 * mỗi phiên (nguyên tắc mù của arena.ai), chỉ mở sau khi xong. 5 tín hiệu
 * Agent Arena map sang đặc sản GON; Net Improvement có trọng số (recovery ×0.5
 * như Arena tính bash recovery nửa trọng số).
 * Chi tiết: docs/00-process/PO-DECISION-AGENT-MODE-2026-10-25.md
 */
export const JOURNEY_AGENT_DECISION = {
  id: "PO-2026-10-25-AGENT-MODE",
  date: "2026-10-25",
  source: "Product Owner (GON) — 'Agent Mode của arena.ai làm gì? Chạy pipeline ntn? Nên áp dụng vào GON ra sao?' → duyệt triển khai",
  decisionDoc: "docs/00-process/PO-DECISION-AGENT-MODE-2026-10-25.md",
  oneCommand: "1 đầu vào (query + nội dung học) → agent tự thực thi trọn hành trình: đánh giá query → retrieval/Brew → payload 6 định dạng → GDJS render → checkpoint → XP → related topics",
  tools: ["plan", "eval_query", "brew_module", "gen_payload", "gd_render", "checkpoint", "grant_xp"] as const,
  blindOrchestrator: "mỗi phiên gán ngẫu nhiên 1 orchestrator kín tên — chỉ mở sau khi hành trình xong",
  signals: {
    confirmedSuccess: "💜 Đã hiểu thật — chỉ công nhận qua checkpoint/learningEvents thật",
    praiseVsComplaint: "tim · bình luận · 💜 và phản hồi 👎 chưa đạt của Journey Agent",
    steerability: "🎨 Remix — agent chỉnh hướng output theo ý người học",
    recovery: "🧪 Brew — query yếu/không kết quả → tự sinh module đầy đủ (trọng số ×0.5)",
    honesty: "👻 chống tool-hallucination — khai 'đã kiểm tra' mà không có learningEvents → XP bị chặn",
  } as Record<string, string>,
  netImprovement: "trung bình có trọng số 5 tín hiệu, đối chiếu orchestrator trung bình (randomized trial → so sánh nhân quả)",
  xpRules: { journeyDone: 25, confirmedSuccess: 5 },
  productionPath: "Google ADK orchestrator (WSIC) + GDJS learningEvents về /api/v1 (P03) làm confirmed success; không bash tự do cho learner; arena nền FastChat (Gate 0)",
} as const;

/**
 * FE-Confirm-14 (25/10) — FE FINAL SWEEP: PO yêu cầu "Cập nhật tất cả những
 * quyết định còn sót của tôi vào web stand alone: để tôi chốt trước khi apply
 * vào toàn bộ source code". Audit toàn bộ decision log → 3 khoảng trống còn
 * thiếu trong demo, tất cả đã được đóng trong v2.12:
 * (1) trending token/XP niche-KOL path + disclaimer KHÔNG hứa fame/income;
 * (2) ⚖️ Side-by-side (arena.ai) — user tự chọn 2 output để so + vote;
 * (3) 🔑 nâng cấp ẩn danh → Google giữ nguyên UUID + tiến trình.
 * Chi tiết + checklist chốt: docs/00-process/PO-DECISION-FE-FINAL-SWEEP-2026-10-25.md
 */
export const FE_FINAL_SWEEP_DECISION = {
  id: "PO-2026-10-25-FE-FINAL-SWEEP",
  date: "2026-10-25",
  source: "Product Owner (GON) — 'Cập nhật tất cả những quyết định còn sót của tôi vào web stand alone: để tôi chốt trước khi apply vào toàn bộ source code'",
  decisionDoc: "docs/00-process/PO-DECISION-FE-FINAL-SWEEP-2026-10-25.md",
  kolPath: {
    tiers: ["🌱 Mầm ngách", "🌿 Chủ ngách (≥1 output ≥40 xu hướng)", "⭐ KOL ngách (≥3 output ≥40 hoặc token ≥100)"] as const,
    token: "tổng điểm xu hướng các output CỦA MÌNH (Brew + Remix, tính live bằng trendOf)",
    honesty: "GON KHÔNG hứa hẹn nổi tiếng hay thu nhập — token/XP không quy đổi tiền, chỉ ghi nhận học thật & đóng góp thật",
  },
  sideBySide: {
    surface: "màn #/arena — 2 <select> chọn output, vote a/b → reveal model + ±Elo",
    voteRecord: "S.votes {choice, model, via:'side-by-side'} — tín hiệu Arena + bộc lộ persona",
  },
  anonymousUpgrade: {
    surface: "Hồ sơ → '🔑 Nâng cấp lên Google (mock)'",
    invariant: "GIỮ NGUYÊN UUID + toàn bộ tiến trình (IndexedDB) — chỉ bật đồng bộ đa thiết bị",
  },
  productionQueue: [
    "GDJS Runtime thật + extension GonLearningEvents thật (tách khỏi demo 1 file — quyết định GDevelop)",
    "Production de-18+ sweep — ✅ ĐÃ XONG trong Apply-1 (Vs1App gỡ cổng độ tuổi, contract P03 giữ nguyên)",
    "Artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06",
    "P05 verdict + P06 Go-Live — final call của PO",
  ] as const,
} as const;
