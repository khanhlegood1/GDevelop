# Acceptance Criteria dạng BDD

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md).

> **Artifact:** P01-BDD<br>
> **Trạng thái:** APPROVED tại P01 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Mục đích:** định nghĩa hành vi có thể kiểm chứng cho PRD. Các scenario này sẽ được chuyển thành UX states ở P02, contract/API tests ở P03/P04 và AI evals ở P05.

## Quy ước

- `Given` là điều kiện ban đầu.
- `When` là hành động/sự kiện.
- `Then` là kết quả user hoặc hệ thống quan sát được.
- Scenario không quy định framework/database; đó là việc của P03.
- Từ “user” mặc định là tài khoản 18+ đã đăng nhập, trừ khi scenario nói khác.

## BDD-01 — Cổng 18+ trung thực

**Requirements:** REQ-ID-001…003

```gherkin
Scenario: User chưa xác nhận 18+
  Given một tài khoản Google mới chưa hoàn tất onboarding
  When user cố vào trải nghiệm học tập 18+
  Then hệ thống yêu cầu xác nhận đủ 18+ và đồng ý điều khoản alpha
  And hệ thống không ghi user là "đã xác minh giấy tờ"

Scenario: User từ chối xác nhận
  Given user đang ở màn hình onboarding
  When user không xác nhận đủ 18+
  Then user không vào được trải nghiệm 18+
  And không có Learning Project nào được tạo cho phiên đó
```

## BDD-02 — Input trở thành Source Artifact, không bị mất khi xử lý lỗi

**Requirements:** REQ-INP-001…006

```gherkin
Scenario: Tạo project từ text và URL
  Given user nhập một câu hỏi và một website URL hợp lệ
  And user chọn Learning Mode "Apply at Work"
  When user gửi input
  Then một Learning Project được tạo
  And text và URL là hai Source Artifact riêng có provenance
  And mỗi artifact có hash, owner, privacy và extraction status

Scenario: Artifact chưa trích xuất được
  Given user tải lên một artifact thuộc loại được phép lưu nhưng chưa hỗ trợ trích xuất tự động
  When quá trình xử lý hoàn tất ở trạng thái metadata-only
  Then artifact vẫn thuộc về project
  And giao diện nói rõ nội dung chưa được dùng đầy đủ cho search/Brew
  And AI không trình bày như thể đã đọc nội dung đó
```

## BDD-03 — Artifact nguy hiểm hoặc không được phép

**Requirements:** REQ-INP-002, REQ-INP-008, REQ-SAF-001

```gherkin
Scenario: File hoặc URL bị chặn bởi safety policy
  Given user gửi một file/URL thuộc loại bị cấm hoặc bị đánh giá nguy hiểm
  When hệ thống kiểm tra artifact
  Then artifact không được thực thi hoặc fetch theo cách nguy hiểm
  And user nhận lý do dễ hiểu và lựa chọn thay thế an toàn nếu có
  And sự kiện chặn được ghi audit ở mức không lưu nội dung nhạy cảm không cần thiết
```

## BDD-04 — Search có kết quả đủ sát

**Requirements:** REQ-SCH-001…004

```gherkin
Scenario: Search trả trạng thái found
  Given kho nội dung có module khớp mạnh với intent của input
  And user có quyền xem module đó
  When search hoàn tất
  Then trạng thái là "found"
  And module được hiển thị kèm lý do liên quan và trạng thái nguồn
  And user có thể học ngay hoặc Fork module
```

## BDD-05 — Search liên quan nhưng chưa đủ

**Requirements:** REQ-SCH-002…003, REQ-BRW-001

```gherkin
Scenario: Search trả trạng thái related
  Given chỉ có module liên quan một phần với intent
  When user xem kết quả
  Then hệ thống hiển thị phần đã khớp và phần còn thiếu
  And user được chọn học module liên quan, làm rõ intent hoặc Brew biến thể
  And hệ thống không gọi kết quả là khớp hoàn toàn
```

## BDD-06 — Không có kết quả thì Brew, không phải trang trống

**Requirements:** REQ-SCH-002, REQ-BRW-001…005

```gherkin
Scenario: Search trả trạng thái missing
  Given không có module đủ liên quan trong kho user được quyền xem
  When search hoàn tất
  Then trạng thái là "missing"
  And user được mời Brew Your Topic hoặc làm rõ input
  And màn hình không kết thúc bằng thông điệp "không có kết quả" trống

Scenario: User xác nhận Brew
  Given trạng thái search là "missing"
  When user bấm Brew
  Then một job bất đồng bộ được tạo với trạng thái queued
  And user có thể rời trang và nhận thông báo khi module sẵn sàng
```

## BDD-07 — Brew retry không nhân đôi module hoặc chi phí vô hạn

**Requirements:** REQ-BRW-002…003, REQ-OPS-002

```gherkin
Scenario: User bấm Brew hai lần cho cùng request
  Given một Brew request hợp lệ đang queued hoặc running
  When user gửi lại cùng request
  Then hệ thống trả về cùng job/module result
  And không có module trùng được tạo cho request đó

Scenario: Brew thất bại tạm thời
  Given pipeline gặp lỗi tạm thời có thể retry
  When số lần retry cho phép đã hết
  Then job ở trạng thái failed với thông điệp dễ hiểu
  And user có lựa chọn thử lại có kiểm soát hoặc sửa input
  And lỗi không tạo module rỗng được gắn nhãn hoàn thành
```

## BDD-08 — Module có nguồn và trạng thái tin cậy

**Requirements:** REQ-BRW-004…006

```gherkin
Scenario: Module Brew sẵn sàng
  Given Brew job hoàn tất
  When user mở module
  Then module có outcome, 3-5 concept lõi, quest, retrieval, transfer và Boss Proof
  And claim trọng yếu có citation hoặc nhãn "chưa kiểm chứng"
  And module hiển thị version và trạng thái draft/review
  And module chưa tự động public cho user khác
```

## BDD-09 — 10+ output phải khác nhau thật

**Requirements:** REQ-OUT-001…003

```gherkin
Scenario: Chủ đề đủ rộng
  Given một input có nhiều hướng học khả thi
  When candidate generation hoàn tất
  Then user thấy tối thiểu 10 Output Candidates
  And các candidates thuộc ít nhất 4 cụm hướng hoặc 3 format khác nhau
  And candidates trùng ngữ nghĩa đã bị gom hoặc loại

Scenario: Chủ đề hẹp
  Given một input chỉ có ít hướng học chất lượng
  When candidate generation hoàn tất
  Then hệ thống hiển thị số hướng chất lượng thực có
  And không bịa thêm candidates trùng lặp để đủ số 10
  And user được gợi ý mở rộng input nếu muốn thêm hướng
```

## BDD-10 — Learning Mode làm ranking thay đổi có giải thích

**Requirements:** REQ-OUT-005, REQ-RNK-001

```gherkin
Scenario: Cùng input ở hai Learning Mode
  Given cùng một input và cùng candidate pool
  When user xem ở "Deep Mastery" rồi đổi sang "Create / Publish"
  Then thứ hạng top candidates thay đổi theo tiêu chí của từng mode
  And mỗi candidate hiển thị lý do ngắn cho mức phù hợp hiện tại
  And hệ thống lưu ranking snapshot để tái lập thứ hạng đã hiển thị
```

## BDD-11 — Blind Arena vote và merge

**Requirements:** REQ-ARN-001…004

```gherkin
Scenario: Vote trong Blind Arena
  Given hai output được hiển thị ẩn model/agent/creator
  And vị trí trái/phải đã được xáo trộn
  When user chọn "Trái tốt hơn"
  Then vote được ghi với user, input, output versions và Learning Mode
  And nhãn output mới được tiết lộ sau vote nếu policy cho phép
  And personal ranking cập nhật kèm giải thích thay đổi

Scenario: User muốn kết hợp hai output
  Given user đang so sánh hai output
  When user chọn "Merge hai hướng"
  Then hệ thống tạo một merge intent hoặc candidate hợp nhất để user review
  And hai output gốc vẫn giữ attribution và version riêng

Scenario: Vote bị gửi trùng
  Given user đã gửi vote hợp lệ cho một Arena match
  When client gửi lại cùng vote do double-click hoặc retry
  Then chỉ một vote hợp lệ được tính
```

## BDD-12 — Fork tạo hành trình riêng tư có lineage

**Requirements:** REQ-JRN-001…004, REQ-CRT-001

```gherkin
Scenario: Fork một output
  Given user đã chọn một output/module version
  When user bấm Fork hoặc "Tạo hành trình của tôi"
  Then một Journey Branch mới được tạo cho user
  And branch mặc định là private
  And branch trỏ về upstream version và creator attribution gốc
  And thay đổi sau này ở branch không sửa output gốc

Scenario: Upstream được cập nhật
  Given branch đã Fork từ module version 1
  When module gốc phát hành version 2
  Then branch vẫn giữ version 1 cho tới khi user chọn cập nhật
  And user được thông báo về thay đổi quan trọng nếu tính năng thông báo đã bật
```

## BDD-13 — Học thật: retrieval và transfer trước khi tính mastery

**Requirements:** REQ-LRN-001…005

```gherkin
Scenario: User chỉ xem nội dung
  Given user đã mở toàn bộ phần đọc của một concept
  When chưa có retrieval hoặc transfer đạt rubric
  Then mastery tối đa là "Exposed"
  And user chưa nhận XP cốt lõi cho concept đó chỉ vì đã xem

Scenario: User áp dụng sang tình huống mới
  Given user đã retrieval đạt rubric
  When user hoàn thành transfer task không có trong ví dụ và đạt rubric
  Then mastery của concept tăng lên "Apply"
  And một Branch Commit được tạo từ bằng chứng đó
```

## BDD-14 — Boss Proof và chống copy-paste

**Requirements:** REQ-LRN-004, REQ-LRN-006, REQ-PRF-001…003

```gherkin
Scenario: Nộp Boss Proof
  Given rubric và artifact yêu cầu đã hiển thị trước
  When user nộp artifact kèm quá trình/nguồn và phần giải thích core value
  Then proof được chấm hoặc đưa vào review theo rubric
  And trạng thái đạt/không đạt có lý do và bước sửa tiếp theo

Scenario: Artifact bị nghi sao chép
  Given hệ thống phát hiện artifact rất giống nguồn mẫu
  When đánh giá artifact
  Then hệ thống yêu cầu giải thích/transfer bổ sung hoặc review
  And user không bị kết luận gian lận chỉ bằng một điểm AI-detector
  And XP trọng yếu chưa được ghi cho tới khi rubric được thỏa
```

## BDD-15 — XP Ledger và Lifelong Level vô hạn

**Requirements:** REQ-XP-001…006

```gherkin
Scenario Outline: Lifetime XP đổi thành Numeric Level và Era
  Given một tài khoản có <lifetime_xp> Lifetime XP hợp lệ
  When hệ thống tính level theo gon-level-v1
  Then Numeric Level là <level>
  And Era là <era>
  And luôn có một level tiếp theo

  Examples:
    | lifetime_xp | level | era     |
    | 0           | Lv.0  | Zero    |
    | 1250        | Lv.12 | Hero    |
    | 3500        | Lv.35 | Forever |
    | 9999        | Lv.99 | Forever |

Scenario: Client cố tự cộng XP
  Given client gửi một yêu cầu tự khai đã hoàn thành quest với số XP tự chọn
  When server không xác minh được learning event đạt rubric
  Then XP chính thức không tăng
  And yêu cầu bị ghi ở mức audit phù hợp

Scenario: XP bị reversal
  Given một XP entry được xác minh là trùng hoặc gian lận
  When reviewer/system tạo reversal có lý do
  Then Lifetime XP và Numeric Level được tính lại từ ledger
  And user thấy lý do và đường khiếu nại
```

## BDD-16 — Proof không bị phóng đại mức xác minh

**Requirements:** REQ-PRF-001…005

```gherkin
Scenario: User gắn ảnh chứng chỉ
  Given user tải ảnh chứng chỉ lên Proof Vault
  When proof được lưu mà chưa có issuer verifier
  Then cấp hiển thị là "Source-linked" hoặc thấp hơn theo policy
  And giao diện không ghi "đã xác minh bởi issuer"

Scenario: GON tự ghi kết quả Boss Proof
  Given Boss Proof đạt rubric trong hệ thống
  When proof được tạo
  Then cấp hiển thị là "System-recorded"
  And proof liên kết tới branch, artifact và rubric version
```

## BDD-17 — Privacy của journey, footprint và proof

**Requirements:** REQ-PRV-001…004, REQ-SCH-004, REQ-PRF-004

```gherkin
Scenario: User khác cố truy cập branch private
  Given một Journey Branch ở trạng thái private
  When user khác truy cập bằng ID hoặc qua search
  Then nội dung branch không được trả về
  And search không tiết lộ tiêu đề/proof private ngoài mức policy cho phép

Scenario: User tắt cá nhân hóa
  Given personalization đang bật
  When user tắt personalization
  Then ranking tiếp theo không dùng footprint của user
  And user vẫn học được nội dung lõi
  And trạng thái tắt được tôn trọng cho tới khi user bật lại

Scenario: User yêu cầu xóa footprint
  Given user có footprint đã lưu
  When user xác nhận yêu cầu xóa
  Then yêu cầu có trạng thái xử lý và thời hạn công bố
  And footprint không còn được dùng cho ranking trong thời gian chờ theo policy
```

## BDD-18 — Nội dung AI không tự động public

**Requirements:** REQ-BRW-005, REQ-SAF-001…003, REQ-CRT-003

```gherkin
Scenario: Module AI mới hoàn tất
  Given một Brew module vừa được tạo
  When job chuyển sang ready
  Then module ở trạng thái draft/private theo chủ sở hữu
  And module không xuất hiện trong public search/trend
  And publish yêu cầu user opt-in và qua safety/quality gate của phase tương ứng
```

## BDD-19 — Trend nội bộ không bị đẩy bằng tương tác rỗng

**Requirements:** REQ-RNK-003, REQ-CRT-002, REQ-SAF-001

```gherkin
Scenario: Output có nhiều view nhưng ít học thật
  Given một output có nhiều view/like nhưng tỷ lệ completion và proof thấp
  When trend snapshot được tính
  Then output không được xếp trên output có nhiều unique learners hoàn thành và tạo proof
  And lý do trend hiển thị dựa trên tín hiệu học thật và cỡ mẫu

Scenario: Mẫu trend quá nhỏ
  Given một output mới chỉ có rất ít learner
  When giao diện hiển thị trend
  Then tín hiệu được gắn nhãn "tín hiệu sớm"
  And phần trăm tăng trưởng gây hiểu nhầm không được hiển thị như kết luận chắc chắn
```

## BDD-20 — GDevelop không phải điều kiện bắt buộc để học

**Requirements:** REQ-RND-001, REQ-GDV-001…003

```gherkin
Scenario: Module có bản game
  Given một module có GDevelop render
  When user không muốn hoặc không thể chơi game
  Then user có đường web/text tương đương để đạt cùng learning outcome cốt lõi

Scenario: Game gửi kết quả bị sửa ở client
  Given game client gửi score/completion bất thường
  When server không xác thực được event
  Then XP/proof chính thức không được ghi
  And user được yêu cầu chơi lại hoặc dùng đường đánh giá thay thế
```

## BDD-21 — Report và moderation

**Requirements:** REQ-SAF-001…004

```gherkin
Scenario: User báo cáo nội dung nguy hiểm
  Given user thấy một module/output có vấn đề
  When user gửi report với lý do
  Then report vào review queue với module/version liên quan
  And user nhận trạng thái đã tiếp nhận
  And reviewer có thể ẩn nội dung trong lúc điều tra nếu mức rủi ro yêu cầu
```

## BDD-22 — Kill switch cho chi phí và safety

**Requirements:** REQ-OPS-001…003

```gherkin
Scenario: Operator tắt Brew
  Given chi phí Brew hoặc sự cố safety vượt ngưỡng vận hành
  When operator bật kill switch
  Then Brew request mới bị tạm dừng bằng thông điệp trung thực
  And search/module đã có vẫn hoạt động nếu an toàn
  And hành động tắt được ghi audit
```
