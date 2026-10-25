# Quyết định PO — FE Final Sweep: đóng toàn bộ quyết định còn sót vào standalone trước khi chốt

- **ID quyết định:** `PO-2026-10-25-FE-FINAL-SWEEP` (FE-Confirm-14)
- **Ngày:** 25/10/2026
- **Kênh:** chat Arena — PO: *"Cập nhật tất cả những quyết định còn sót của tôi vào web stand alone: để tôi chốt trước khi apply vào toàn bộ source code."*
- **Code chính:** `src/lib/product-decisions.ts` → `FE_FINAL_SWEEP_DECISION`
- **Demo:** `ux-prototype/standalone/index.html` **v2.12** · E2E **188/188** (15/15 flows)

---

## 1. Phương pháp audit

Đối chiếu **toàn bộ decision log** (`docs/00-process/PO-DECISION-*.md` + bảng ủy quyền FE-Confirm-1…13 + các chỉ thị gốc của PO trong Task brief) với từng bề mặt của demo standalone. Mỗi quyết định được đánh dấu: ✅ đã có trong demo / ❌ còn sót.

## 2. Kết quả audit — bảng chốt của PO

| # | Quyết định của PO | Nơi trong demo v2.12 | Trạng thái |
|---|---|---|---|
| 1 | Đăng nhập ẩn danh first-class (UUID, không bắt tài khoản) + Google | S01 login | ✅ từ v1 |
| 2 | TikTok-style: feed dọc, tab bar, sidebar trái, thanh tìm trên | S02 + layout | ✅ từ v1–v2.1 |
| 3 | Tab Đang Hot/Dành cho bạn TRÊN thanh tìm kiếm; bỏ topsearch ở Khám phá | feedtabs | ✅ v2.2 (FE-Confirm-4) |
| 4 | Input = CẢ search query LẪN learning content (file/ảnh/YouTube/Facebook/Web) | Khám phá — ô tìm + attach | ✅ |
| 5 | Search yếu/không kết quả → Brew full module (recovery) | Khám phá — Brew inline | ✅ |
| 6 | Khám phá đồng bộ dữ liệu từ thanh tìm kiếm (hai chiều) | topsearch ↔ uni-input | ✅ v2.5 (FE-Confirm-6) |
| 7 | IndexedDB cho toàn bộ dự án (fallback + migrate localStorage) | `browser-storage` pattern + demo IDB | ✅ v2.5 (FE-Confirm-6) |
| 8 | KHÔNG cho chọn Persona/Độ sâu — chạy đủ 12 tổ hợp; persona bộc lộ qua lựa chọn | Khám phá — 12 tổ hợp + footprint | ✅ v2.4 (FE-Confirm-5) |
| 9 | Brew + Arena gộp vào Khám phá (Unified Discover) | Khám phá | ✅ v2.4 (FE-Confirm-5) |
| 10 | Bộ 6 hành động xã hội: like/comment/💜love(gated)/share/remix/fork + trọng số | rail trên card | ✅ v2.6 (FE-Confirm-8) |
| 11 | 💜 "Đã hiểu thật" CHỈ mở sau checkpoint của chính output đó | gate learnedCards | ✅ v2.6 |
| 12 | Checkpoint hiểu thật, chống copy-paste | S06 learn | ✅ từ v1 |
| 13 | 6 định dạng GDevelop render (web/infographic/video/image/game/easy-task) | S07 output + S08 game | ✅ |
| 14 | GDevelop: lấy động cơ (GDJS Runtime + project JSON + Extensions), LLM sinh payload CÓ KIỂU không sinh game code | nút 🧩 blueprint + `game-blueprint.ts` | ✅ v2.8 (FE-Confirm-10) |
| 15 | Arena kiểu arena.ai: 4 vote, 1 vote/cặp, ±Elo, Đấu cặp khác | khối Arena trong Khám phá | ✅ v2.7 (FE-Confirm-9) |
| 16 | Leaderboard chuyên mục + mũi tên ↑↓ + bảng persona | S15 (tab Model/Agent/Người học) | ✅ v2.7 |
| 17 | Embed arena THẬT cùng origin (`?embed=1` kiểu Gradio) + postMessage; KHÔNG nhúng arena.ai/proxy lách | nút 📺 trong Khám phá | ✅ v2.9 (FE-Confirm-11) |
| 18 | Menu ⚔️ Arena TRƯỚC Leaderboard, nhúng iframe arena FastChat | màn #/arena + `arena-fastchat-frame` | ✅ v2.11 (FE-Confirm-13) |
| 19 | Journey Agent kiểu Agent Mode (1 lệnh → trọn hành trình), orchestrator mù ngẫu nhiên | khối 🤖 Journey Agent | ✅ v2.10 (FE-Confirm-12) |
| 20 | 5 tín hiệu Agent Arena → map GON (checkpoint/praise/steer/recovery/honesty) + Net Improvement (recovery ×0.5) | bảng tín hiệu + tab Agent | ✅ v2.10 |
| 21 | **Trending token/XP niche-KOL path — KHÔNG BAO GIỜ hứa fame/income** | Hồ sơ → 🌱 Đường KOL ngách | ✅ **v2.12 (mới)** |
| 22 | **Arena Side-by-side: user tự chọn 2 output để so trực tiếp** (đã ghi "giai đoạn sau" §4 ARENA doc) | màn #/arena → ⚖️ So trực tiếp | ✅ **v2.12 (mới)** |
| 23 | **Ẩn danh → nâng cấp Google bất cứ lúc nào, giữ tiến trình** (trước đây chỉ có chip chữ) | Hồ sơ → ☁️ Đồng bộ tài khoản + modal nâng cấp giữ UUID | ✅ **v2.12 (mới)** |
| 24 | POAP / Proof of Learning (timeline, huy hiệu, chứng nhận) | S12 proof | ✅ |
| 25 | GitHub-like Fork + chủ đề liên quan | S10 related | ✅ |
| 26 | Level suốt đời `floor(LifetimeXP/100)` uncapped | S09 journey | ✅ |
| 27 | 18+ REVERSED — không age gate | demo sạch (E2E assert "no 18+ text") | ✅ demo (production sweep xếp hàng đợi) |
| 28 | Gate 0: FastChat (Apache-2.0) · WSIC (ADK/Gemini/768D) · GDevelop (MIT) | ghi trong docs + nhãn production | ✅ (hạ tầng thật = phase apply) |

**Kết luận audit:** 25/28 đã có từ các slice trước; **3 quyết định còn sót (hàng 21–23) được đóng trong slice này** — demo v2.12 giờ phủ 100% quyết định FE của PO.

## 3. Triển khai 3 mục còn sót (v2.12)

1. **🌱 Đường KOL ngách** (Hồ sơ, sau Dấu chân đẳng cấp):
   - Tier theo metric THẬT: 🌱 Mầm ngách → 🌿 Chủ ngách (≥1 output ≥40 xu hướng) → ⭐ KOL ngách (≥3 output ≥40 hoặc token ≥100) + thanh tiến độ + "bước tới".
   - **🔥 Token xu hướng** = tổng điểm xu hướng các output CỦA MÌNH (Brew + Remix, tính live bằng `trendOf`) — không phải đồng tiền mới bịa ra.
   - Ngách = persona dominant từ footprint (không tự chọn — đúng quyết định FE-Confirm-5).
   - **⚠️ Disclaimer trung thực ghim ngay trong card:** *"GON KHÔNG hứa hẹn nổi tiếng hay thu nhập. Token xu hướng & XP không quy đổi thành tiền, không bảo đảm fame/income — chỉ ghi nhận việc học thật (checkpoint, learningEvents) và đóng góp thật."*
2. **⚖️ So trực tiếp (Side-by-side)** (màn #/arena, dưới card FastChat embed): 2 `<select>` chọn từ 12 output → "⚖️ So sánh" → 2 card cạnh nhau (user TỰ chọn, không ẩn danh như Battle) → vote a/b → mở nhãn model + chip ±Elo (+8/−5) + "So cặp khác"; vote ghi `S.votes {via:"side-by-side"}` → tín hiệu Arena + persona + POAP; bộ mode arena.ai trong GON giờ đầy đủ: **Battle (ẩn danh) · Side-by-side (tự chọn) · Agent (Journey Agent)**.
3. **🔑 Nâng cấp ẩn danh → Google (mock)** (Hồ sơ → ☁️ Đồng bộ tài khoản): modal chọn tài khoản Google → **GIỮ NGUYÊN UUID + toàn bộ tiến trình** (kiểm chứng bằng E2E: `account.uuid` không đổi, `brewed`/`xpLedger` nguyên vẹn) → event "🔑 Nâng cấp Google" vào POAP. Không cộng XP (chống farm).

## 4. Kiểm chứng

- **E2E 188/188** (175 cũ + 13 mới: side-by-side stage/vote/Elo/via, KOL card + disclaimer + token + tier, upgrade modal/UUID-kept/POAP, map **15/15 flows**).
- `tsc --strict` OK (`FE_FINAL_SWEEP_DECISION`) · legacy `node --test` 14/14 · links trong scope slice 0 đứt.
- Demo vẫn 1 tệp, không dependency, không network — IndexedDB.

## 5. Hàng đợi cho phase "apply vào toàn bộ source code" (PO chốt xong thì chạy)

1. **Port demo → source chính**: các bề mặt mới (KOL ngách, Side-by-side, nâng cấp Google) vào `apps/gon-web/src` theo đúng contract trong `src/lib/product-decisions.ts` + `game-blueprint.ts`.
2. **GDJS Runtime thật + extension GonLearningEvents thật** (tách khỏi demo 1 file — theo quyết định GDevelop mục "giai đoạn sau").
3. ~~Production de-18+ sweep~~ **✅ ĐÃ XONG trong Apply-1** (PO đảo ngược 24/10; Vs1App đã gỡ cổng độ tuổi, contract P03 giữ nguyên — ghi tại [`PO-DECISION-APPLY-PHASE-1-2026-10-25.md`](PO-DECISION-APPLY-PHASE-1-2026-10-25.md)).
4. Artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).

## 6. Liên kết chéo

- Ủy quyền: [`PO-CONTINUOUS-DELEGATION-2026-10-24.md`](PO-CONTINUOUS-DELEGATION-2026-10-24.md) — hàng FE-Confirm-14
- Quyết định liên quan: [`PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md`](PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md) (§4 side-by-side — đã xong) · [`PO-DECISION-SOCIAL-ACTIONS-2026-10-24.md`](PO-DECISION-SOCIAL-ACTIONS-2026-10-24.md) (trọng số xu hướng cho token) · [`PO-DECISION-AGENT-MODE-2026-10-25.md`](PO-DECISION-AGENT-MODE-2026-10-25.md)
- Demo: [`../../ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) · E2E: [`../../ux-prototype/standalone/tests/e2e.js`](../../ux-prototype/standalone/tests/e2e.js)
