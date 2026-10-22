# P02 — Frontend UX Agreement Package

> **Trạng thái:** **APPROVED — Product Owner đã duyệt ngày 22/10/2026**<br>
> **Commit được duyệt:** `33c2641e8710a3792150827d93500f7a1b930315`<br>
> **Ngày trình duyệt:** 22/10/2026<br>
> **Cơ sở đã khóa:** P01 được PO duyệt tại commit `9a09fa21fd8a27536eddb97ad179d14db3aab7ac`, bao gồm toàn bộ `D-P01-01`…`D-P01-14`<br>
> **Phạm vi thiết kế:** VS1 đầy đủ và các bề mặt UX cần thiết cho VS2 theo [Backlog đã duyệt](../02-requirements/BACKLOG-MOSCOW-AND-VERTICAL-SLICES.md)<br>
> **Trạng thái tiếp theo:** P03 đã được phê duyệt và P04 được PO duyệt ngày 22/10/2026 cho baseline VS1 local/test; P05 đang **IN REVIEW — NOT YET PASS**. Usability test với người dùng thật vẫn phải hoàn thành trước khi khóa production UI.

## 1. P02 chốt điều gì?

P02 biến PRD đã duyệt thành một thỏa thuận frontend có thể nhìn, click và truy vết:

```text
18+ Consent
  → Universal Input
  → Search / Brew
  → 10+ Hướng học
  → Arena khi cần
  → Hành trình riêng (Fork)
  → Học thật
  → Boss Proof
  → Level + Proof Vault
  → Personalization trong quyền kiểm soát của user
```

P02 không khóa framework, database, endpoint hay model AI. Mọi screen/component/state trong gói này là input cho P03; P03 có thể thay route slug hoặc field name, nhưng không được âm thầm thay đổi hành vi đã được PO duyệt ở P02.

## 2. Artifact đã được phê duyệt

| # | Artifact | Nội dung đã chốt |
|---|---|---|
| 1 | [Information Architecture](INFORMATION-ARCHITECTURE.md) | Cấu trúc điều hướng, đối tượng người dùng nhìn thấy, route đề xuất, quyền truy cập theo vai trò |
| 2 | [User Flows](USER-FLOWS.md) | Các luồng chính, nhánh lỗi, trạng thái chờ, đường quay lại và tiêu chí hoàn thành |
| 3 | [Wireframe & Screen Specification](WIREFRAME-SCREEN-SPEC.md) | Từng màn hình `SCR-*`, component `CMP-*`, CTA, validation và điều kiện chuyển màn |
| 4 | [Design System, Responsive & Accessibility](DESIGN-SYSTEM-RESPONSIVE-ACCESSIBILITY.md) | Cách dùng GON tokens, breakpoint, keyboard/focus/contrast và motion |
| 5 | [Interaction States & Content](INTERACTION-STATES-AND-CONTENT.md) | Loading/empty/error/offline/permission, nhãn tin cậy và microcopy VI/EN cốt lõi |
| 6 | [P02 Traceability Matrix](P02-TRACEABILITY-MATRIX.md) | Mỗi `REQ/US/BDD` xuất hiện ở màn nào, bằng chứng prototype nào và câu hỏi nào chuyển sang P03 |
| 7 | [Usability Review Plan](USABILITY-REVIEW-PLAN.md) | Cách PO/tester kiểm tra prototype và ngưỡng đề xuất để coi flow là hiểu được |
| 8 | [Clickable mock-data prototype](../../ux-prototype/README.md) | Bản click được cho SCR-01…SCR-12; không gọi backend/AI thật |

## 3. Nguyên tắc UX khóa theo P01

1. **Không dead-end:** không có trang trống kiểu “No results”. User luôn có bước tiếp theo an toàn: học nội dung liên quan, sửa input, làm rõ, Brew, hoặc dừng có lý do.
2. **Riêng tư mặc định và nhìn thấy được:** trạng thái Private xuất hiện ở đầu project/journey/proof, không chỉ nằm trong Settings.
3. **Fork được nói bằng ngôn ngữ người học:** CTA chính là **“Tạo hành trình của tôi”**; thuật ngữ Fork chỉ là giải thích phụ.
4. **Ba tín hiệu không được trộn:** Level, Mastery và Verification dùng nhãn, biểu đồ và copy riêng.
5. **Vote không phải fact-check:** Arena vote chỉ nói về mức phù hợp/chất lượng cảm nhận trong một mục tiêu.
6. **AI phải thành thật về trạng thái:** metadata-only, partial, unverified claim, AI draft và reviewed không được hiển thị như nhau.
7. **Không gây nghiện để thắng metric:** không streak trừng phạt, không XP cho xem/vote rỗng, không hứa viral/thu nhập.
8. **Mobile là flow đầy đủ, không phải bản rút gọn:** người dùng phải hoàn thành Input → Learn → Proof trên 360px.

## 4. Các quyết định P02 đã được PO phê duyệt

Ngày 22/10/2026, Product Owner đã duyệt P02 và toàn bộ `D-P02-01`…`D-P02-12`. Các mục này không thay đổi phạm vi P01; chúng khóa cách phạm vi ấy xuất hiện trên giao diện.

| ID | Quyết định UX đã duyệt | Lý do |
|---|---|---|
| `D-P02-01` | App shell dùng project stepper `Input → Tìm/Brew → Hướng học → Hành trình → Proof`; desktop có rail trái, mobile có bottom nav | User luôn biết mình đang ở đâu trong vòng đời một project |
| `D-P02-02` | Màn hình chính sau đăng nhập là **composer-first**, không phải feed trend | Giá trị cốt lõi bắt đầu từ tò mò/input của chính user; giảm FOMO |
| `D-P02-03` | Search và Brew dùng cùng một workspace liên tục, đổi bằng verdict panel thay vì điều hướng sang “trang AI” riêng | “Không có kết quả đủ tốt” trở thành bước tiếp theo tự nhiên, không phải lỗi |
| `D-P02-04` | Output Explorer hiển thị ranking giải thích được, Top 3 nổi bật và đủ 10 hướng có thể lọc/theo cụm | Giữ lựa chọn đa dạng nhưng giảm quá tải |
| `D-P02-05` | Arena là hành động **theo yêu cầu** từ hai card đang phân vân, không bắt user vote ở mọi lần chọn | Tránh biến học tập thành nhiệm vụ vote; vẫn thu tín hiệu chất lượng khi có ngữ cảnh |
| `D-P02-06` | CTA fork dùng chữ **“Tạo hành trình của tôi”** và giữ upstream/attribution trong Branch Header | Dễ hiểu với non-developer nhưng vẫn truy vết được nguồn |
| `D-P02-07` | Module Player dùng stepper Concept → Retrieval → Transfer → Boss Proof; đáp án mẫu khóa cho tới khi submit | Thể hiện rõ học thật thay vì đọc/checklist trang trí |
| `D-P02-08` | Journey/Progress hiển thị ba cụm riêng: Lifelong Level, Topic Mastery, Proof verification | Ngăn hiểu lầm “nhiều XP = đã giỏi = proof đã xác minh” |
| `D-P02-09` | Personalization Center có lối vào từ Profile và ngay tại khu vực gợi ý; tắt/xóa footprint không chặn học lõi | Quyền kiểm soát xuất hiện đúng nơi dữ liệu được dùng |
| `D-P02-10` | Giữ Midnight theme làm nền chính; form dài/độ tin cậy cao dùng panel sáng | Theo GON tokens, đồng thời tăng khả năng đọc cho onboarding/Boss Proof |
| `D-P02-11` | “AI System” không còn là nav chính; đổi thành vùng minh bạch “Cách GON hoạt động” trong Help/Profile | Điều hướng theo việc của user, không theo kiến trúc hệ thống |
| `D-P02-12` | Màn hình vận hành/reviewer tách namespace `/review` và không lẫn với learner nav | Giảm nguy cơ lộ quyền và giúp P03 định authorization rõ ràng |

Thay đổi các quyết định này sau P02 phải được ghi thành amendment hoặc ADR được duyệt, không âm thầm thay đổi trong P03/P04.

## 5. Phạm vi prototype

Prototype P02 phủ các bề mặt người học cốt lõi:

- `SCR-01` 18+ consent và personalization choice;
- `SCR-02` Universal Input + Learning Mode + artifact states;
- `SCR-03` năm search verdicts;
- `SCR-04` Brew confirmation/progress/ready;
- `SCR-05` đúng 10 mock outputs, ranking theo năm mode, tắt personalization, filter/save/hide;
- `SCR-06` Blind Arena, vote một lần, reveal sau vote, merge/both-bad;
- `SCR-07` Journey Branch header;
- `SCR-08` Concept/Retrieval/Transfer;
- `SCR-09` Boss Proof rubric-first;
- `SCR-10` Journey Map + Lifelong Level + Mastery;
- `SCR-11` Proof Vault với ba mức xác minh Alpha;
- `SCR-12` Personalization/Privacy Center và delete-footprint mock.

Các bề mặt `SCR-13` Projects, `SCR-14` Notifications, `SCR-15` Report Status, `SCR-16` Review Queue và `SCR-17` Account Settings được đặc tả trong wireframe doc nhưng chưa dựng thành section riêng trong prototype vì chúng không quyết định vòng VS1 đầu tiên. Chúng là input bắt buộc cho P03/P04 thay vì bị bỏ quên.

## 6. Những nội dung P02 chuyển sang P03

- Stack production, component library, route implementation và state management.
- API endpoint, schema, vector threshold, ranking formula, Elo/BT parameter và trend formula.
- File/media limits, provider/storage, queue timing, quota và cost thật.
- Assessment engine, anti-cheat threshold và quy trình human review chi tiết.
- Số/trọng số XP cho từng event. Prototype cộng XP mô phỏng chỉ để duyệt hiển thị.
- Kết quả usability thật. P02 cung cấp kế hoạch kiểm tra; không tuyên bố đã test với người dùng.

Các điểm trên đang được chuyển thành contract/ADR trong gói P03; chúng không được “đoán” trong lúc viết production UI ở P04.

## 7. Kết quả phê duyệt P02

- [x] Vòng `Input → Search/Brew → Outputs → Learn → Proof → Level` dễ hiểu ngay từ điều hướng và CTA.
- [x] Cách nói “Tạo hành trình của tôi” thay cho Fork được chấp nhận.
- [x] Output Explorer đủ 10 lựa chọn nhưng không gây quá tải; ranking explanation đủ minh bạch.
- [x] Arena không bắt buộc ở mọi lựa chọn và copy nói rõ vote không xác minh sự thật.
- [x] Level/Mastery/Proof được phân biệt đủ rõ trên giao diện.
- [x] Các trạng thái không có kết quả, partial, AI draft, blocked, loading và revision đều có lối đi tiếp theo.
- [x] Quyền tắt/xóa footprint dễ tìm và không có dark pattern.
- [x] Mobile bottom nav và bố cục một cột vẫn hoàn thành được flow chính.
- [x] Toàn bộ mặc định `D-P02-01`…`D-P02-12` đã được duyệt.
- [x] Cho phép bắt đầu P03.

## 8. Hành động tiếp theo

P03 — API Contract & Data Model First đã được phép bắt đầu tại [`../04-contracts/README.md`](../04-contracts/README.md). P03 phải giữ nguyên hành vi UX đã duyệt; usability test với người dùng thật vẫn chưa được thực hiện và phải được xử lý như một điều kiện kiểm chứng trước khi khóa production UI ở P04, thay vì tuyên bố UX đã được người dùng xác thực.
