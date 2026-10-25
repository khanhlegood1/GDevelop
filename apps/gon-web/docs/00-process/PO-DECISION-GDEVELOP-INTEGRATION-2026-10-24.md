# PO DECISION — GDevelop source code áp dụng vào GON

> **Ngày:** 24/10/2026 (tối muộn, sau FE-Confirm-9)
> **Người quyết:** Product Owner (GON) — hỏi *"Còn GDevelop source code thì áp dụng vào GON thế nào cho tốt?"*
> **Lựa chọn PO:** phương án **Đầy đủ** (demo v2.8 + contract code chính + decision doc + E2E).
> **Trạng thái:** ✅ Demo standalone v2.8 (nút "🧩 Xem blueprint GDevelop") · contract `src/lib/game-blueprint.ts` (tsc --strict ✓) · `GDEVELOP_INTEGRATION_DECISION` trong `src/lib/product-decisions.ts`.

## 1. Nguyên tắc: lấy động cơ, không lấy cả chiếc xe

Khảo sát monorepo (`GDJS/` 23MB · `Core/` 12MB · `Extensions/` 53 extension · `newIDE/` 172MB · `apps/gon-web` + `apps/gon-adk`):

| Thành phần GDevelop | Dùng cho GON? | Lý do |
|---|---|---|
| **`GDJS/Runtime`** (engine JS) | ✅ trọng tâm | Chạy game trong browser — đúng hạ tầng web của GON, không backend, không Electron |
| **Project JSON format** | ✅ | "Ngôn ngữ chung" ADK ↔ engine; output format Game = 1 project JSON |
| **`Extensions/`** | ✅ | Nơi viết `GonLearningEvents` — game bắn sự kiện học (đúng/sai/hoàn thành) về GON |
| `newIDE/` (editor Electron) | ❌ | Overkill với người học; không đưa vào pipeline GON |
| `Core/` C++/emscripten | ❌ tránh | Chỉ cần khi build lại engine — giữ ngoài critical path |

## 2. Nguyên tắc vàng: LLM sinh THAM SỐ, không sinh game code

- **GON Game Blueprints**: 6 template làm sẵn (quiz-3 · sort-bins · match-pairs · flashcard-run · fact-opinion-swipe · escape-review) — pedagogy + art làm tay, chất lượng ổn định.
- ADK/Gemini chỉ sinh **payload có kiểu** (`GonGamePayload`: topic, persona, depth, items, passThreshold, theme) → **`validateGonGamePayload()`** → nhồi vào template → project JSON → **GDJS Runtime** render trong output screen.
- Kết quả: game luôn chạy được; đúng triết lý AI-Agile *"AI generates, humans approve"*; tránh vỡ format do sinh code tự do.

## 3. Pipeline production

```
Topic × persona × độ sâu
→ ADK chọn blueprint + sinh payload (GonGamePayload — có kiểu)
→ validateGonGamePayload() (cửa an toàn)
→ template GDevelop + payload → project JSON
→ render bằng GDJS Runtime (iframe trong output screen)
→ game bắn GonLearningEvent (extension GonLearningEvents) về /api/v1 (P03)
→ checkpoint "hiểu thật" + XP tính từ KẾT QUẢ CHƠI THẬT (không phải click)
```

**Điểm khác biệt của GON:** chứng cứ học nằm trong engine — POAP/XP/dấu chân đẳng cấp được nuôi bởi sự kiện chơi thật.

## 4. Phân công 6 định dạng & vận hành repo

- GDevelop gánh **Game + Easy-task** (mini-interaction); Web/Infographic/Video/Image do ADK/Gemini render như thiết kế P01/P02.
- **Fork/Remix game:** fork = nhận project JSON + payload để tự chỉnh (GitHub-like); remix = đổi payload theo tổ hợp persona khác — nhất quán với quyết định bộ hành động xã hội.
- GON apps giữ trong monorepo (`apps/gon-web`, `apps/gon-adk` — hiện trạng); **pin version** GDJS Runtime; CI smoke-test render 1 blueprint mỗi lần nâng engine; **không** build newIDE trong pipeline GON.
- License **MIT** ✓ — dùng tự do, giữ attribution theo LICENSE của GDevelop.

## 5. Nơi đã ghi (theo lựa chọn Đầy đủ)

| Nơi | Nội dung |
|---|---|
| `ux-prototype/standalone/index.html` (v2.8) | Nút **"🧩 Xem blueprint GDevelop"** trên màn game: sheet mô tả pipeline + payload JSON có kiểu (sinh từ GAME_QUESTIONS) + danh sách 6 blueprint |
| `ux-prototype/standalone/tests/e2e.js` | E2E: mở sheet blueprint, payload hợp lệ (blueprint quiz-3, passThreshold, questions), đóng sheet, game vẫn chơi được |
| `src/lib/game-blueprint.ts` (code chính) | Contract có kiểu: `GON_GAME_BLUEPRINT_IDS`, `GonGamePayload`, `GonGameItem`, `GonGameLearningEvent`, `validateGonGamePayload()`, `GDJS_RENDER_CONTRACT` |
| `src/lib/product-decisions.ts` | `GDEVELOP_INTEGRATION_DECISION` |
| `docs/00-process/PO-CONTINUOUS-DELEGATION-2026-10-24.md` | Hàng FE-Confirm-10 |

## 6. Giai đoạn sau (chưa làm trong slice này)

- Prototype nhúng **GDJS Runtime thật** (slice riêng, tách khỏi demo 1 file không dependency).
- Viết extension `GonLearningEvents` thật (declaration JSON + JS events theo chuẩn `Extensions/`).
- Asset pack theo theme; bộ blueprint mở rộng theo persona/độ sâu; export game standalone để share.
