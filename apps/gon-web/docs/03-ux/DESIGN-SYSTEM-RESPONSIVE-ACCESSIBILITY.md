# P02 — Design System, Responsive & Accessibility

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md).

> 🗄️ **Cập nhật PO — 24/10/2026 (23:36) — IndexedDB cho toàn bộ dự án:** toàn bộ dữ liệu phía client chuyển sang **IndexedDB** (localStorage chỉ còn fallback + nguồn migrate một lần); trang **Khám phá mang theo dữ liệu từ thanh tìm kiếm** (đồng bộ tất cả dữ liệu, hai chiều). Chi tiết: [`PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md`](../00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md) — code chính: `src/lib/browser-storage.ts`.

> **Trạng thái:** APPROVED tại P02 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Nguồn brand:** [`gon-tokens.json`](../../../../branding/GON-GameOfNurture/03-Color-Typography/gon-tokens.json) và [GON Brandbook 2026](../../../../branding/GON-GameOfNurture/02-Brandbook/GON-Brandbook-2026.pdf)<br>
> **Phạm vi:** Map brand tokens sang UI semantics cho Private Alpha. Không chọn CSS framework/component library.

## 1. Bản sắc giao diện

GON nên cảm thấy như một **hệ điều hành học tập nghiêm túc nhưng giàu năng lượng**, không phải app trẻ em, crypto dashboard hay mạng xã hội gây nghiện.

- Midnight là nền chính để tạo cảm giác tập trung và “night practice”.
- Emerald đại diện tiến bộ/hành động chính.
- Gold dành cho thành tựu, Brew và Level; không dùng Gold cho mọi CTA.
- Cyan là thông tin/proof/trạng thái đang xử lý.
- Crimson chỉ cho nguy hiểm/block và việc hiến máu/ngữ cảnh nhân đạo khi có nội dung liên quan; không dùng để tạo khẩn cấp giả.
- Violet là điểm nhấn AI/sáng tạo có kiểm soát, không bao phủ toàn bộ màn hình.

Prototype dùng đúng ngữ nghĩa trên: Emerald cho CTA học chính, Gold cho Brew/Level/Boss, Cyan cho thông tin, panel sáng cho consent và Boss form.

## 2. Token mapping

| Brand token | Giá trị gốc | Vai trò UI P02 | Không dùng cho |
|---|---|---|---|
| `gon.midnight.900` | `#101B33` | App background | Text trên nền sáng |
| `gon.midnight.800/700` | `#172541` / `#203355` | Card, panel, header | Trạng thái lỗi |
| `gon.ascentEmerald` | `#12B981` | Primary CTA, passed, progress | Text dài trên nền sáng nếu không đạt contrast |
| `gon.heroGold` | `#FFC531` | Level, Brew, achievement, prototype banner | Text nhỏ trên trắng |
| `gon.humanityCrimson` | `#D22630` | Danger/block, destructive | Deadline/streak/FOMO |
| `gon.proofCyan` | `#28B9D8` | Info, processing, proof links | Khẳng định đã verified một mình |
| `gon.neuralViolet` | `#7C5CFF` | AI/creative accent | Primary CTA |
| `gon.neutral.paper` | `#F7F8FB` | Light surface | Toàn bộ app theme |
| `gon.neutral.card` | `#FFFFFF` | Consent/Boss/form | Card lồng quá nhiều lớp |
| `gon.neutral.ink` | `#182233` | Text trên sáng | Text trên Midnight |
| `gon.neutral.muted` | `#65738A` | Secondary text trên sáng | Thông tin thiết yếu tương phản thấp |
| `gon.neutral.fog` | `#AEBBD2` | Secondary text trên Midnight | — |

Các cặp đã ghi trong token file như Ink trên White, White trên Midnight, Ink trên Gold và Ink trên Emerald là cặp mặc định. Mọi cặp mới trong production phải được kiểm contrast trước P04/P05.

## 3. Typography

- Font chính: **Be Vietnam Pro**.
- Display/brand moments có thể dùng Be Vietnam Pro ExtraBold; không đưa Baloo 2 vào product UI vì định vị hiện tại là 18+.
- Kích thước tối thiểu:
  - body: 16px trên web;
  - secondary: 14px;
  - nhãn trạng thái: 12–13px nhưng phải đi cùng text dễ đọc;
  - H1: 32–54px tùy breakpoint;
  - card title: 20–24px.
- Line-height body 1.5–1.65; heading 1.05–1.25.
- Không dùng chữ in hoa cho đoạn dài. Eyebrow uppercase chỉ tối đa một dòng ngắn.
- Số Level/XP dùng tabular numerals khi font stack hỗ trợ.

Prototype hiện dùng font stack có `Be Vietnam Pro` trước system fonts nhưng không tải font ngoài để chạy offline. P04 mới quyết định cơ chế đóng gói font.

## 4. Spacing, radius và elevation

- Đơn vị nền: 4px; khoảng cách thường dùng 8/12/16/24/32/48.
- Radius từ tokens: control 10–14px, card 16–24px, pill 999px.
- Chỉ dùng tối đa hai cấp elevation trong một màn: nền Midnight và panel nổi; form sáng là ngoại lệ có chủ đích.
- Border trong theme tối dùng đường sáng mờ nhưng vẫn phân biệt được vùng tương tác.
- Không dùng glassmorphism quá mức tới mức làm giảm contrast hoặc nhận diện focus.

## 5. Component semantics

### 5.1 Buttons

| Loại | Hành vi | Ví dụ |
|---|---|---|
| Primary Emerald | Một hành động tiến flow | Tìm hoặc Brew, Tạo hành trình, Kiểm tra |
| Gold | Thành tựu/Brew/Boss có trọng lượng đặc biệt | Bắt đầu Brew, Nộp Boss Proof |
| Secondary outline | Hành động thay thế an toàn | Xem hướng học, Quay lại |
| Ghost | Hành động phụ/low emphasis | Tôi chưa đủ 18 tuổi, Không phù hợp |
| Danger | Xóa/gỡ/hành động không thể đảo | Xóa footprint request, gỡ nội dung |
| Chip/Segmented | Lựa chọn trạng thái có thể thay đổi | Learning Mode, cụm output, search state |

Mọi button có chiều cao chạm tối thiểu **48px**, theo `minimumTouchTarget` của GON tokens. Icon không đứng một mình nếu hành động không phổ quát; luôn có text hoặc accessible name.

### 5.2 Status và badge

Badge phải có chữ đầy đủ, ví dụ `AI draft · Riêng tư`, `Cần kiểm chứng`, `Metadata-only`, thay vì chỉ chấm màu.

| Nhóm | Màu gợi ý | Nhãn |
|---|---|---|
| Success/passed | Emerald | Đạt rubric, Sẵn sàng |
| Warning/partial | Gold trên nền tối hoặc nền vàng nhạt | Chưa khớp hoàn toàn, Một phần |
| Info/processing | Cyan | Đang xử lý, System-recorded |
| Danger/blocked | Crimson | Bị chặn, Không thể xử lý |
| Neutral/self-declared | Fog | Tự khai, Nháp |

Màu không bao giờ là kênh duy nhất: luôn có icon phụ hoặc text status.

### 5.3 Progress

- **Lifetime Level:** thanh tới level tiếp theo và vẫn ghi tổng Lifetime XP; không bao giờ ghi `100% hoàn thành`.
- **Brew/Processing:** bước hiện tại/tổng bước + câu mô tả; progressbar phải có accessible value.
- **Mastery:** năm mức có nhãn, mức hiện tại nổi bật; không dùng phần trăm giả chính xác nếu backend chỉ có mức rời rạc.
- **Journey:** timeline dọc trên mobile, có thể ngang trên desktop nếu đủ rộng.

### 5.4 Cards

OutputCard, ProofCard và ProjectCard dùng cùng thứ tự:

1. badge trạng thái;
2. title;
3. một câu giá trị;
4. bằng chứng/giới hạn;
5. metadata;
6. CTA.

Không đặt giá/token/probability viral trên OutputCard trong Alpha.

## 6. Responsive specification

### 6.1 Breakpoints UX

| Kích thước | Layout | Điều hướng | Ghi chú |
|---|---|---|---|
| `320–639px` | Một cột, padding 16–20px | Bottom nav 4 mục | Kiểm tra chính ở 360×800 |
| `640–1023px` | Một/hai cột; form ưu tiên một cột | Rail thu gọn hoặc top tabs | Arena có thể một cột ở đầu khoảng này |
| `1024px+` | Rail + main content tối đa khoảng 1240px | Rail trái + header | Arena/Output hai cột |

Đây là breakpoint hành vi, không khóa media query implementation của P04.

### 6.2 Quy tắc từng bề mặt

- **SCR-01:** consent không bị đẩy xuống dưới fold bởi hero quá dài.
- **SCR-02:** composer và CTA xuất hiện trước danh sách project gần đây.
- **SCR-03/04:** verdict và CTA tiếp theo thấy được trước danh sách dài.
- **SCR-05:** controls có thể cuộn ngang có kiểm soát; card không bị cắt ngang. Người dùng phải biết đang xem bao nhiêu/tổng số hướng.
- **SCR-06:** A/B xếp dọc trên mobile; VoteBar vẫn tới được sau khi đọc B. Không dùng cử chỉ vuốt làm cách vote duy nhất.
- **SCR-08:** tabs/stepper không che prompt; textarea đủ cao và không bị bottom nav che.
- **SCR-09:** rubric tóm tắt có thể mở/đóng phía trên form trên mobile.
- **SCR-10:** ba cụm Level/Mastery/Proof xếp theo thứ tự trên và không trộn thành một card.
- **Dialog:** chiếm gần toàn màn hình trên mobile, có nút đóng/hủy tới được bằng bàn phím.

### 6.3 Nội dung dài và quốc tế hóa

- Layout chịu được text tiếng Anh dài hơn tiếng Việt khoảng 30% mà không vỡ CTA.
- Tránh chiều cao cố định cho card chứa text.
- Không nhúng câu copy quan trọng vào hình ảnh.
- Ngày/giờ/số XP phải format theo locale; ID kỹ thuật không bị dịch.

## 7. Accessibility baseline

Mục tiêu tối thiểu cho P04/P05 là **WCAG 2.2 AA cho các flow cốt lõi**. P02 prototype đã áp dụng một phần để kiểm tra tính khả thi.

### 7.1 Bàn phím và focus

- Mọi hành động click được đều dùng phần tử tương tác gốc hoặc có keyboard behavior tương đương.
- Thứ tự tab theo thứ tự đọc: skip link → header/nav → heading/context → controls theo DOM.
- Focus visible tối thiểu outline 3px, không bị loại bỏ bởi CSS reset.
- Chuyển màn trong SPA đưa focus tới H1 của màn mới.
- Dialog giữ focus bên trong khi mở, đóng bằng Esc/hành động rõ ràng và trả focus về trigger.
- Segmented controls/tabs phải có semantics và phím mũi tên nếu P04 implement theo pattern tablist đầy đủ.

Prototype dùng button gốc, skip link, `tabindex="-1"` trên H1 và native `<dialog>`. P04 phải kiểm tra lại trên component library thật; nguyên mẫu không tự chứng nhận WCAG.

### 7.2 Screen reader và nội dung động

- Search/Brew/ranking/vote/assessment status dùng `aria-live` phù hợp, tránh đọc lặp mỗi phần trăm.
- Progress có tên và giá trị có thể truy cập.
- Icon trang trí dùng `aria-hidden`; icon mang nghĩa có text phụ.
- Form field có label thật. Placeholder không thay label.
- Lỗi field liên kết mô tả bằng `aria-describedby` trong bản production.
- A/B trong Arena có heading và thứ tự đọc rõ trước VoteBar.

### 7.3 Nhận thức và vận động

- Touch target tối thiểu 48×48px cho hành động chính.
- Không có giới hạn thời gian ẩn cho Retrieval/Boss trong Alpha.
- Không dùng drag-and-drop làm cách duy nhất để sắp xếp/so sánh.
- Nội dung quan trọng không chỉ xuất hiện khi hover.
- Cung cấp tóm tắt/thay thế text cho media khi format cho phép; game phải có cách thoát và tóm tắt kết quả bằng text.

### 7.4 Motion

- Tôn trọng `prefers-reduced-motion`: tắt smooth scroll, transition không thiết yếu và animation ăn mừng.
- Không dùng confetti/nhấp nháy quá mức khi lên Level.
- Animation tối đa khoảng 150–300ms cho thay đổi trạng thái nhỏ; progress xác định không dùng chuyển động gây hiểu lầm đã xong.

### 7.5 Contrast kiểm tra tối thiểu

| Cặp | Dùng cho | Yêu cầu |
|---|---|---|
| White trên Midnight 900 | Heading/body tối | Đạt AA text thường |
| Fog trên Midnight 900 | Secondary text tối | Chỉ cho text phụ nhưng vẫn đạt AA nếu là thông tin cần đọc |
| Ink trên White/Paper | Form sáng | Đạt AA |
| Ink trên Hero Gold | Gold CTA/banner | Đạt AA |
| Ink trên Emerald | Primary CTA | Đạt AA |
| White/Fog trên Violet/Cyan | Badge | Kiểm từng tổ hợp; không mặc định đạt |

Gold trên trắng và Emerald trên trắng bị cấm theo token guidance cho text thường.

## 8. Hình ảnh, media và game

- Logo GON phải dùng asset gốc khi production có asset pipeline; prototype dùng mark chữ `G` tự chứa để không phụ thuộc đường dẫn.
- Thumbnail output không được dùng ảnh stock gây hiểu lầm nội dung đã được xác minh.
- Video cần poster/tiêu đề/nguồn và trạng thái trích xuất.
- Infographic phải có text summary và không truyền đạt rubric chỉ bằng ảnh.
- Game canvas phải có: tiêu đề, mục tiêu học, hướng điều khiển text, nút tạm dừng/thoát, trạng thái lưu và fallback nếu không chạy.

## 9. Design QA trước P04 đóng băng

1. Kiểm 360px, 768px, 1280px cho mọi flow VS1.
2. Tab toàn bộ flow mà không dùng chuột; không mất focus.
3. Kiểm text 200% zoom không che CTA chính.
4. Kiểm mọi status vẫn hiểu khi chuyển sang grayscale.
5. Kiểm reduced motion.
6. Kiểm nhãn verification và lifetime level bằng grayscale + screen reader text.
7. Kiểm chuỗi tiếng Anh dài trên nút/segmented control.
8. Kiểm bottom nav không che nút submit cuối form.

Những kiểm tra này thuộc P04/P05 với bản production; prototype P02 dùng chúng làm tiêu chí duyệt cấu trúc chứ chưa phải chứng nhận tuân thủ.
