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

[`standalone/index.html`](standalone/index.html) — **một tệp duy nhất, không dependency, không backend**: toàn bộ 14 màn hình (S01–S14) và 11 luồng chính (F1–F11) của GON để PO xác nhận Front End, bao gồm cả tính năng V2.1:

- S01 Chào mừng & 18+ → Google (mock) · S02 Input phổ quát + Trending TikTok-style + gợi ý theo footprint (bật/tắt được) · S03 Tìm kiếm 5 trạng thái (có sẵn / liên quan / chưa có → Brew / cần làm rõ / **bị chặn**) + **12 đầu ra xếp theo 4 persona** (PhD/KOL/Giải trí/Nâng cao) · S04 Brew pipeline 4 bước · S05 Module 5 mục · S06 Học tương tác + **checkpoint chống copy-paste** (phát hiện paste, từ chối) · S07 **6 định dạng GDevelop** (web/infographic/video/ảnh/game/easy-task) · S08 Mini-game · S09 Tiến bộ — `level = floor(LifetimeXP/100)` **uncapped**, Mastery tách khỏi Level, Forever ở Lv.35+ · S10 Liên quan + **Fork kiểu GitHub** · S11 **Arena** (vote rồi mới mở nhãn model) · S12 **Proof of Learning/POAP** (timeline đầu vào, huy hiệu, chứng nhận, chia sẻ mock) · S13 Hồ sơ & quyền riêng tư (xuất JSON, xoá dữ liệu, personalization) · S14 **Sơ đồ xác nhận** (checklist F1–F11 tự tick).

Trạng thái lưu `localStorage` (có nút reset/xuất). Mở trực tiếp bằng trình duyệt hoặc:

```bash
python3 -m http.server 4173 --bind 0.0.0.0 --directory apps/gon-web/ux-prototype/standalone
```

Kiểm chứng: `node --check` script nhúng + E2E jsdom **40/40 pass, 11/11 flow hoàn tất** ([`standalone/tests/e2e.js`](standalone/tests/e2e.js), cần `npm i jsdom`). Một bug thật đã được E2E bắt và sửa trước khi bàn giao: điều hướng cùng-route không render lại (đổi định dạng/mục học/truy vấn). Vẫn là **mock 100%** — không thay thế P03 contract, không phải production frontend.
