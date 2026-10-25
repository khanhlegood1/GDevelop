# Quyết định PO — Apply Phase 1: đưa FE đã chốt vào source code chính

- **ID:** `PO-2026-10-25-APPLY-1` (Apply-1)
- **Ngày:** 25/10/2026
- **Kênh:** chat Arena — PO chốt FE Final Sweep (FE-Confirm-14) xong, nói **"Apply đi"** → bắt đầu phase *"apply vào toàn bộ source code"* theo hàng đợi đã ghi trong [`PO-DECISION-FE-FINAL-SWEEP-2026-10-25.md`](PO-DECISION-FE-FINAL-SWEEP-2026-10-25.md) mục 5.
- **Kiểm chứng:** `tsc --noEmit` OK · production battery **170/170** (154 baseline + 16 mới) · legacy 14/14.

---

## 1. Phạm vi Apply-1 (lát cắt đầu của phase apply)

1. **Production de-18+ sweep** (PO đảo ngược 24/10 — *"toàn bộ dự án không quan tâm user có trên 18 tuổi hay không"*):
   - `src/components/Vs1App.tsx`: gỡ **toàn bộ cổng độ tuổi** — checkbox "Tôi tự xác nhận mình đã đủ 18 tuổi", nút "Tôi chưa đủ 18 tuổi", state `under18Blocked`/`is18`/`termsAccepted`, error box chặn, nhãn "GAME OF NURTURE · 18+", "Private Alpha 18+", "18+ self-attestation".
   - **Contract P03 GIỮ NGUYÊN**: endpoint `/v1/me/age-attestation` + payload `isAtLeast18/termsVersion/privacyVersion` vẫn gửi đúng fields (không đổi API — P03 locked). UI ghi rõ: "Không còn cổng độ tuổi (quyết định PO 24/10); payload attestation giữ nguyên contract P03".
   - Story onboarding cập nhật (bỏ bước click 18+).
   - **Không âm thầm sửa docs P01 đã duyệt** — quyết định đảo ngược được ghi tại đây + ghi chú trong UI.
2. **Port 3 bề mặt đã PO chốt** từ standalone v2.12 sang React/TS production:
   - `src/lib/kol-path.ts` — Đường KOL ngách: 3 tier theo metric thật, `sumTrendToken`, **`KOL_HONESTY_NOTICE`** (KHÔNG hứa fame/income — bắt buộc hiển thị).
   - `src/lib/arena-surface.ts` — hợp đồng vote có kiểu (`ArenaVoteRecord`, 4 lựa chọn ±Elo), Side-by-side (`canStageSideBySide`), URL embed (`gonArenaEmbedUrl` same-origin + `fastChatEmbedUrl` self-host `?embed=true`), pool dữ liệu mirror standalone (gắn nhãn mô phỏng).
   - `src/lib/journey-agent-surface.ts` — 7 bước tool, 5 tín hiệu Agent Arena (recovery ×0.5), `agentNetImprovement`, `pickBlindOrchestrator`.
   - Components: `src/components/gon/KolPathCard.tsx` · `ArenaPanel.tsx` (Battle + Side-by-side + iframe FastChat-style + postMessage listener) · `JourneyAgentPanel.tsx` (trace 7 bước, orchestrator mù, feedback ✅/👎).
   - `public/arena-embed.html` — asset embed same-origin (copy từ standalone, phục vụ `/arena-embed.html?embed=1`).
3. **Wiring trong `Vs1App`:** nav mới **"⚔️ Arena & Agent"** (view `arena`: JourneyAgentPanel + ArenaPanel); **KolPathCard** trên view Hành trình (lifetimeXp thật; token/hot = 0 kèm ghi chú trung thực "backend xu hướng P05+").

## 2. Nhãn trung thực (ranh giới của Apply-1)

- Vote Arena / trace Journey Agent trong Vs1App là **bề mặt cục bộ** — chưa ghi vào `/v1` (backend arena + orchestrator thật xếp sau P05). Hợp đồng vote đã định kiểu để backend nối đúng.
- Pool cặp đấu/output/orchestrator là **dữ liệu mô phỏng mirror standalone**, gắn nhãn rõ trong UI.
- KOL token & "output ≥40 xu hướng" sẽ sống khi **backend xu hướng (P05+)** được nối; tier hiện tính trên dữ liệu thật khả dụng (Lifetime XP).
- Attestation vẫn gửi `isAtLeast18: true` vì contract P03 yêu cầu field — FE không còn hỏi độ tuổi.

## 3. Kiểm chứng

- **tsc --noEmit:** PASS (toàn bộ `src` + `tests`, gồm 3 lib + 3 component mới).
- **Production battery: 170/170** (`tests/production/fe-apply.test.ts` mới — 16 test: KOL tier/token/disclaimer, Elo 4 lựa chọn, vote model, side-by-side validation, FastChat URL, 7 bước agent, 5 tín hiệu ×0.5, Net Improvement ±, blind orchestrator, de-18+ sweep guard đọc source Vs1App, asset public, 3 bề mặt được mount).
- **Legacy: 14/14.** Standalone demo không đổi (v2.12, E2E 188/188 từ FE-Confirm-14 vẫn有效).

## 4. Hàng đợi còn lại của phase apply

1. Nối Arena/Journey Agent vào `/v1` thật (backend vote + orchestrator ADK) — sau P05.
2. GDJS Runtime thật + extension GonLearningEvents thật (tách khỏi demo 1 file).
3. Backend xu hướng cho KOL token (trend API) — P05+.
4. Artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).

## 5. Liên kết chéo

- [`PO-DECISION-FE-FINAL-SWEEP-2026-10-25.md`](PO-DECISION-FE-FINAL-SWEEP-2026-10-25.md) — bảng chốt 28 mục (nguồn của phase apply)
- [`PO-CONTINUOUS-DELEGATION-2026-10-24.md`](PO-CONTINUOUS-DELEGATION-2026-10-24.md) — hàng Apply-1
- Code: [`src/lib/kol-path.ts`](../../src/lib/kol-path.ts) · [`src/lib/arena-surface.ts`](../../src/lib/arena-surface.ts) · [`src/lib/journey-agent-surface.ts`](../../src/lib/journey-agent-surface.ts) · [`src/components/gon/`](../../src/components/gon/) · [`public/arena-embed.html`](../../public/arena-embed.html)
