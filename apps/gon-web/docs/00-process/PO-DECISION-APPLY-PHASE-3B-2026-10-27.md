# PO Decision — Apply-3b: FE wiring Arena + Game Session vào `/v1` thật (2026-10-27)

**Kết luận: SHIPPED — chờ PO xác nhận.** Hai bề mặt production đã nối endpoint backend thật (Apply-2 + Apply-3), không còn là state cục bộ giả.

## 1. ArenaPanel — 🔌 "Trận đấu /v1 thật (Arena live)"

- Props mới: `projectId` (project đang chọn) + `candidates` (từ Output Explorer, qua `useMemo` trong Vs1App).
- Khi đủ điều kiện (có project + ≥2 id unique): nút **"⚔️ Tạo trận đấu /v1"** → `POST /v1/projects/{id}/arena-matches` → hiển thị slot A/B **ẩn danh** (summary/format/phút).
- 5 nút vote đúng enum P03 (`left_better | right_better | tie | both_bad | merge`) → `POST /v1/arena-matches/{id}/votes` → mở **revealedCandidates** (title đầy đủ) + `personalRankingExplanationCodes` + ghi chú `mergedCandidateId: null` (trung thực).
- Chưa đủ điều kiện → hint hướng dẫn chạy Search/Brew; Battle/Side-by-side/FastChat embed giữ nguyên bề mặt cục bộ (đã ghi rõ trong hint).

## 2. GameSessionLauncher — 🎮 "Học tương tác qua Game session (/v1 thật)"

- Component mới trong Journey Player (view "Học & Boss Proof"), đúng node đang học: `journeyId` + `activeNode.id` + `templateId` sinh từ format node (`gdevelop_<format>`, fallback `web_lesson`).
- "🎮 Bắt đầu phiên" → `POST /v1/journeys/{id}/game-sessions` → tự gửi event `session_started` (batch `gon.game-events/1.0`) → badge **active**.
- "✅ Hoàn thành phiên" → batch `question_answered` + `checkpoint_reached` + `session_completed` → badge **completed**; session đóng hiện chú thích 409 GAME_SESSION_NOT_OPEN.
- `validatedLearningEffect` hiển thị `null` trung thực (rubric thật ở VS sau).

## 3. Cấu trúc code

- `src/lib/gon-live-api.ts` — logic thuần (choice enum, chọn cặp unique, batch shape, templateId) — test được theo pattern `fe-apply.test.ts`.
- `src/components/gon/GameSessionLauncher.tsx` — component mỏng gọi `apiRequest` (`@/lib/api`, CSRF + Idempotency-Key tự động).
- `src/components/gon/ArenaPanel.tsx` + `src/components/Vs1App.tsx` — wiring.
- `tests/production/fe-apply-2.test.ts` — **10 test mới** (enum/batch/template logic + source checks wiring).

## 4. Bằng chứng

- `npx tsc --noEmit` PASS.
- `npx vitest run tests/production` → **188/188** (25 files; 178 cũ + 10 mới).
- Live verify port 3000: `GET /` 200; client bundle thật (`src_*.js`) chứa cả hai bề mặt mới ("Tạo trận đấu /v1" + "Bắt đầu phiên học tương tác") — tức UI đã được serve, không chỉ nằm trong source.

## 5. Queue sau Apply-3b

GDJS Runtime launcher thật cho `launchUrl` (embed iframe + launchToken exchange) · extension GonLearningEvents + rubric `validatedLearningEffect` · xu hướng KOL token backend (P05+) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
