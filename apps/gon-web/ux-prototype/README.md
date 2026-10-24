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
- **Thanh tìm kiếm trên cùng (persistent, kiểu TikTok):** ô tìm pill + nút "Tìm", hiện ở các tab chính (ẩn ở Brew/login/sub-screen); Enter hoặc bấm nút → chuyển Khám phá + chạy verdict; mọi route khi chưa đăng nhập đều redirect về login (guard E2E).

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
