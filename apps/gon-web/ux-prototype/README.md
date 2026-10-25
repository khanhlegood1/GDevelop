# GON P02 — Clickable UX Prototype

> **Vai trò:** Mock-data frontend agreement cho P02. Đây **không phải production frontend** và không thay thế P03 API/Data Contract.<br>
> **Cơ sở:** [GON PRD v1.0 đã duyệt](../docs/02-requirements/GON-PRD-V1.md), [`D-P01-01`…`D-P01-14`](../docs/02-requirements/METRICS-RISKS-AND-OPEN-DECISIONS.md), [P02 package](../docs/03-ux/README.md).

## Cách mở

Từ thư mục `apps/gon-web`:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Sau đó mở:

```text
http://localhost:4173/ux-prototype/
```

Không cần tài khoản, API key hay network call. Mọi AI/Brew/rank/assessment/XP đều là dữ liệu/hàm mô phỏng trong trình duyệt.

## Kịch bản duyệt chính

1. **SCR-01:** tích đủ 18+ và điều khoản → `Tiếp tục với Google (Mock)`.
2. **SCR-02:** kiểm tra Universal Input, Learning Mode và Source Artifact → `Tìm hoặc Brew`.
3. **SCR-03/04:** thử trạng thái Found/Related/Missing/Cần làm rõ/Bị chặn → `Bắt đầu Brew` → chờ module sẵn sàng.
4. **SCR-05:** đổi Learning Mode, tắt/bật cá nhân hóa, lọc cụm, lưu/ẩn và chọn hai hướng so sánh.
5. **SCR-06:** vote Arena một lần; nhãn thật chỉ mở sau vote.
6. **SCR-07/08/09:** tạo hành trình riêng, học Concept, làm Retrieval/Transfer và nộp Boss Proof đạt rubric mẫu.
7. **SCR-10/11/12:** kiểm tra phân tách Level/Mastery/Proof, Proof Vault, Privacy Center và Report dialog.

Mẹo cho các bước text: prototype dùng rubric rất đơn giản. Retrieval cần tối thiểu 80 ký tự và nêu ít nhất hai nhóm yếu tố; Transfer/Boss mô tả cần tối thiểu 90 ký tự. Đây chỉ là cơ chế demo, không phải assessment contract.

## Test

Từ thư mục gốc repository:

```bash
node --check apps/gon-web/ux-prototype/app.js
node --test apps/gon-web/ux-prototype/tests/prototype.test.js
```

Test kiểm tra screen IDs, đúng 10 candidates, ranking thay đổi theo mode, tắt personalization dùng quality chung, năm search verdicts, retrieval mock, level không giới hạn và vài nhãn an toàn/accessibility cốt lõi.

## Giới hạn cố ý của P02

- Không có auth thật, Google OAuth hay xác minh tuổi.
- Không upload/download file và không đọc URL thật.
- Không gọi Gemini, vector search, Google ADK, queue hay GDevelop runtime.
- Không có persistence; tải lại trang sẽ reset XP/trạng thái mô phỏng.
- Vote/rank/Trend chỉ là UX model, chưa phải thuật toán production.
- XP cộng trong prototype chỉ để duyệt hiển thị. Production phải ghi XP bằng server-side validated events.
- Không có trang operator đầy đủ; wireframe spec mô tả Review Queue để P03/P04 tiếp nối.

Prototype V2 hiện có tại [`../index.html`](../index.html) được giữ nguyên làm bằng chứng lịch sử và tham chiếu tính liên tục. P02 prototype là bản agreement mới bám PRD đã duyệt.

## Standalone Front-End Confirmation Demo (24/10/2026)

**Phiên bản v2.1 (thêm menu trái + thanh tìm kiếm trên kiểu TikTok desktop, theo chỉ thị PO):** [`standalone/index.html`](standalone/index.html) — **một tệp duy nhất, không dependency, không backend**, tổ chức lại toàn bộ theo phong cách TikTok:

- **Menu bên trái (sidebar, kiểu TikTok desktop):** brand GON + 8 mục điều hướng (Bảng tin · Khám phá · Brew · Hành trình · Arena · POAP · Hồ sơ · Sơ đồ xác nhận), khối **"Chủ đề nổi bật"** gợi ý theo xu hướng (click là tìm), footer demo. Desktop ≥900px: sidebar thay tab bar dưới; mobile: giữ tab bar 5 mục, sidebar ẩn.
- **Thanh tìm kiếm trên cùng (persistent, kiểu TikTok):** ô tìm pill + nút "Tìm", hiện ở các tab chính (ẩn ở Brew, **Khám phá** — trang này có ô tìm riêng — và login/sub-screen); Enter hoặc bấm nút → chuyển Khám phá + chạy verdict; mọi route khi chưa đăng nhập đều redirect về login (guard E2E).
- **v2.2 (góp ý PO 24/10 tối muộn):** tab **🔥 Đang Hot / 🎯 Dành cho bạn** chuyển lên **trên cùng, trên cả thanh tìm kiếm** (thanh tab kiểu TikTok, active có thanh chỉ báo gradient) vì phần tìm kiếm là dùng chung; **xoá thanh tìm kiếm trên cùng ở trang Khám phá** (bị dư so với ô tìm trong trang).
- **v2.10 (PO 25/10 — Agent Mode (arena.ai) áp vào GON: Journey Agent + 5 tín hiệu):** khối **🤖 Journey Agent — 1 lệnh, trọn hành trình** trong Khám phá (sau khối Arena): một đầu vào duy nhất → agent **tự thực thi 7 bước** `plan → eval_query → brew_module → gen_payload → gd_render → checkpoint → grant_xp` (trace kiểu tool-call, tag `tool: …`), **orchestrator gán ngẫu nhiên kín tên** mỗi phiên — chỉ mở nhãn sau khi xong (nguyên tắc mù của arena.ai) → +25 XP + phản hồi **"✅ Hành trình xong tốt"** (Confirmed success, +5 XP) / **"👎 Chưa đạt"**; query yếu gắn tag **🔧 tín hiệu recovery** (Brew); bảng **5 tín hiệu Agent Arena → map sang GON** (Confirmed success = 💜 checkpoint thật · Praise vs complaint = social rail · Steerability = 🎨 Remix · Recovery ×0.5 = 🧪 Brew · Honesty = chống khai man learningEvents) cập nhật live; Leaderboard thêm tab thứ 3 **"🤖 Agent (Net Improvement)"** — 3 orchestrator × 5 cột tín hiệu + Net có trọng số (recovery ×0.5 như bash recovery của Arena), xếp nhân quả kiểu randomized trial; POAP ghi event mỗi phiên; flow F14; state `S.agentJourneys` (IndexedDB). E2E 163/163. Quyết định gốc: [`PO-DECISION-AGENT-MODE-2026-10-25.md`](../docs/00-process/PO-DECISION-AGENT-MODE-2026-10-25.md) · code chính: `JOURNEY_AGENT_DECISION` trong [`src/lib/product-decisions.ts`](../src/lib/product-decisions.ts).
- **v2.9 (PO 24/10 tối muộn — embed arena THẬT cùng origin):** sau câu hỏi *"iframe đưa arena.ai vào có chạy được không?"* (đáp: không — bị chặn X-Frame-Options/CSP + reCAPTCHA, cross-origin chỉ nhìn được) → PO chốt hướng đúng: **embed thứ cho phép embed**. Thêm [`standalone/arena-embed.html`](standalone/arena-embed.html) — trang arena nhúng được (1 tệp, 4 nút vote, ±Elo, "Đấu cặp khác", **`?embed=1`** kiểu Gradio) + nút **"📺 Chế độ embed (iframe)"** trong khối Arena: battle inline được thay bằng `<iframe>` **cùng origin**, vote trong khung gửi về trang chính qua **postMessage** → ghi `S.votes` (IndexedDB) + 15 XP. Production: tự host FastChat (Gate 0) dạng Gradio/HF Space (`?embed=true`) hoặc GON arena cùng origin — xem [`PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md`](../docs/00-process/PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md) mục 5.
- **v2.8 (PO 24/10 tối muộn — GDevelop source áp vào GON, chọn Đầy đủ):** màn Game có nút **"🧩 Xem blueprint GDevelop"** — sheet mô tả pipeline (ADK sinh **payload có kiểu**, KHÔNG sinh game code → validate → template GDevelop (project JSON) → **GDJS Runtime** render → **GonLearningEvents** bắn kết quả chơi thật về GON để tính checkpoint + XP) + payload JSON sinh từ chính bộ câu hỏi của game (blueprint `quiz-3`, 6 blueprint: quiz-3 · sort-bins · match-pairs · flashcard-run · fact-opinion-swipe · escape-review). Code chính: contract [`src/lib/game-blueprint.ts`](../src/lib/game-blueprint.ts) (typed + `validateGonGamePayload`). Quyết định gốc: [`PO-DECISION-GDEVELOP-INTEGRATION-2026-10-24.md`](../docs/00-process/PO-DECISION-GDEVELOP-INTEGRATION-2026-10-24.md).
- **v2.7 (PO 24/10 tối muộn — áp dụng mô hình arena.ai, chọn Đầy đủ):** khối **Arena trong Khám phá** lên chuẩn arena.ai — **4 lựa chọn vote** (Chọn A · Chọn B · 🤝 Hoà · 👎 Cả hai chưa đạt), nút **"⚔️ Đấu cặp khác"** (pool 3 cặp, xoay vòng, 1 vote mỗi cặp — `arenaBattles`), sau vote hiện chip **±Elo** (+8/−5, hoà +1/+1, cả hai chưa đạt −4/−4) + mở nhãn model; **Leaderboard** thêm filter chuyên mục theo **định dạng** (Web/Video/Game/Infographic/Ảnh/Easy-task), bảng **👥 Xếp hạng theo persona**, mũi tên **↑↓ xu hướng thứ hạng**; vote a/b lưu tên model → tag "vote của bạn" gắn đúng hàng. Quyết định gốc: [`PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md`](../docs/00-process/PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md).
- **v2.6 (PO 24/10 tối — bộ hành động xã hội, chọn phương án Đầy đủ):** rail card giờ đủ 6 hành động — ❤️ Like (+3, không XP) · 💬 Comment (+6) · 💜 **"Đã hiểu thật"** (reaction **gated**: 🔒 khoá tới khi vượt checkpoint của output đó — reaction phải học mới có; +5 xu hướng, +2 XP) · ↗️ Share (+4) · 🎨 **Remix** (mới: sheet 12 tổ hợp persona × độ sâu, chọn = persona bộc lộ, output mới "Remix từ @tác giả" vào feed, +6 cho gốc, +15 XP) · 🍴 Fork (+8). Nguyên tắc: **Remix = làm lại NỘI DUNG · Fork = mang về cả HÀNH TRÌNH**; POAP timeline 30 sự kiện; flow F13. Quyết định gốc: [`PO-DECISION-SOCIAL-ACTIONS-2026-10-24.md`](../docs/00-process/PO-DECISION-SOCIAL-ACTIONS-2026-10-24.md).
- **v2.5 (PO 24/10 23:54 — Leaderboard kiểu arena.ai):** menu **🥇 Leaderboard** trên mục 👤 Hồ sơ (sidebar 7 mục; nút thêm ở Hành trình; mobile vào từ Hành trình vì tabbar giữ 5 mục). Hai bảng kiểu arena.ai: **🤖 Model sinh output** — xếp hạng Elo theo bình chọn cộng đồng, top-3 huy chương, hai model đang đấu trong Khám phá hiện standings + tag "🗳 vote của bạn" khi user đã vote; **👤 Người học** — xếp hạng Lifetime XP (level = floor(XP/100), uncapped), user hiện "👉 BẠN" kèm dấu chân đẳng cấp. Flow F12 + màn S15 ("15 màn hình", map 12/12 flows).
- **v2.4 (quyết định PO 24/10 23:36 — IndexedDB + đồng bộ tìm kiếm):** toàn bộ demo chuyển sang **IndexedDB** (DB `gon-standalone-fe-demo-v2`, store `state`, key `main`) — localStorage chỉ còn fallback + nguồn **migrate một lần**; guard `BOOTED` chặn ghi đè dữ liệu thật bằng state mặc định khi trang vừa mở (race do hashchange — E2E bắt ra); luồng xoá dữ liệu dọn cả hai kho. Trang **Khám phá mang theo dữ liệu từ thanh tìm kiếm**: ô tìm trong trang luôn prefilled query cuối, thanh tìm trên cũng đồng bộ ngược (không đè khi đang gõ). Quyết định gốc: [`PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md`](../docs/00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md) · code chính: [`src/lib/browser-storage.ts`](../src/lib/browser-storage.ts).
- **v2.3 (quyết định PO 24/10 tối muộn — Unified Discover):** **bỏ hoàn toàn UI chọn Persona/Độ sâu** — mặc định **chạy tất cả 12 tổ hợp Persona × Độ sâu**, xuất nhiều output xếp hạng như feed TikTok trong Khám phá; **output user chọn chính là Persona đầu ra** của họ (tín hiệu Arena + **dấu chân đẳng cấp**, hiển thị ở Hồ sơ/Hành trình, ghi POAP). **Màn hình Brew & Arena gộp vào Khám phá:** Brew chạy inline khi tìm yếu/chưa có (không form, không chuyển màn), vote Arena là khối trong Khám phá, `#/brew` `#/arena` redirect về `#/discover`, sidebar 6 mục (nút ➕ mở Khám phá). Quyết định gốc: [`docs/00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../docs/00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md) · đã ghi vào code chính: [`src/lib/product-decisions.ts`](../src/lib/product-decisions.ts).

- **Bỏ cổng 18+ hoàn toàn** (quyết định PO: dự án không quan tâm user có ≥18 tuổi hay không — production docs/code còn sót 18+ sẽ cần slice dọn riêng).
- **Đăng nhập ẩn danh UUID** ("🌿 Bắt đầu với ẩn danh" — không cần tài khoản, tiến trình lưu trên thiết bị, có thể nâng cấp lên Google sau; tham khảo `ai-doctor-admin` `LoginPage.jsx`) hoặc Google (mock).
- **Bảng tin (feed dọc toàn màn hình, scroll-snap như TikTok):** card topic với tâm ❤️/💬/↗/🍴 ở rail phải + đĩa nhạc xu hướng; **tab "🔥 Đang Hot" / "🎯 Dành cho bạn"**; **output sau Brew trở thành card topic "OUTPUT CỦA BẠN"** trong feed với điểm xu hướng tăng theo tương tác (like +3, comment +6, share +4, fork +8, học +12) — đủ tương tác là lên xu hướng (badge 🔥 tại ≥40 điểm).
- **Tab bar 5 mục:** 🏠 Bảng tin · 🔍 Khám phá · ➕ Brew · 🏆 Hành trình · 👤 Hồ sơ.
- **Khám phá:** input phổ quát (6 loại đầu vào) + bảng xu hướng hot + 5 trạng thái kết quả + 12 đầu ra xếp theo 4 persona.
- Giữ nguyên các luồng lõi: Brew pipeline 4 bước, học tương tác + **checkpoint chống copy-paste**, 6 định dạng GDevelop, mini-game, cấp suốt đời `floor(LifetimeXP/100)` uncapped, Fork kiểu GitHub, Arena vote, POAP, quyền riêng tư (xuất JSON/xoá).
- **S14 Sơ đồ xác nhận** (từ Hồ sơ): 11 flow F1–F11 tự tick — F10 = "Output của bạn lên ≥40 điểm xu hướng".

Trạng thái lưu `localStorage` (key `gon-standalone-fe-demo-v2`, có nút reset/xuất). Mở trực tiếp bằng trình duyệt hoặc:

```bash
python3 -m http.server 4173 --bind 0.0.0.0 --directory apps/gon-web/ux-prototype/standalone
```

Kiểm chứng: `node --check` script nhúng + E2E jsdom **48/48 pass, 11/11 flow hoàn tất** ([`standalone/tests/e2e.js`](standalone/tests/e2e.js), cần `npm i jsdom`). E2E bắt và sửa **2 bug thật** trước khi bàn giao: (1) quên ghi lịch sử tìm kiếm vào state (mất event timeline POAP + flow F3), (2) thiếu ghi nhận tương tác social. Vẫn là **mock 100%** — không thay thế P03 contract, không phải production frontend.
