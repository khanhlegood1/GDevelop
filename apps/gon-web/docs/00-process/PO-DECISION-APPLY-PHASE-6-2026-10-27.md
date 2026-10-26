# PO Decision — Apply-6: validatedLearningEffect thật (2026-10-27)

**Kết luận: SHIPPED — chờ PO xác nhận.** Món nợ "null trung thực" cuối của game session đã đóng: `validatedLearningEffect` giờ được tính từ **event thật tích lũy của session**.

**Đính chính PO (27/10):** Apply-4/5 PO bấm nhầm "chưa đạt" lúc đầu, đã đính chính là **ĐẠT** — canvas GDJS render + event trong game chạy thật trong preview (đã ghi lại trong PO-DECISION-APPLY-PHASE-5).

## Logic (service `appendGameEvents`, khi session → completed)

- Đếm `objective_viewed` theo nodeId phân biệt + kiểm tra có `checkpoint_reached`.
- `validatedLearningEffect = { source: "game_events", distinctObjectivesViewed, checkpointReached, validated, validatedAt }`.
- `validated = distinctObjectivesViewed > 0 && checkpointReached` — hoàn thành mà không chạm node nào trong game → `validated: false` (trung thực, không tự thưởng).
- FE: badge ✅/⚠️ hiển thị số objective + checkpoint trong GameSessionLauncher.

## Bằng chứng

- `tsc` binary thật PASS · battery **204/204** (game-sessions test cập nhật: batch có objective_viewed → validated true; hoàn thành không chạm node → validated false).
- Live port 3000: session mới → null; chuỗi event game thật (started → 2×objective_viewed → checkpoint → completed) → `{"source":"game_events","distinctObjectivesViewed":2,"checkpointReached":true,"validated":true}`.

## Queue sau Apply-6

JsExtension declaration (editor GDevelop) · KOL token backend (P05+) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
