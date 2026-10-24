# P02 — Interaction States & Content

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md).

> **Trạng thái:** APPROVED tại P02 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Mục tiêu:** Mọi trạng thái đều trả lời ba câu hỏi: **Chuyện gì đang xảy ra? Điều đó có nghĩa gì? Tôi làm gì tiếp theo?**

## 1. Nguyên tắc trạng thái

1. **Không spinner vô danh quá một nhịp ngắn.** Sau khi bắt đầu thao tác, hiện bước/trạng thái có chữ và cho biết có thể rời đi hay không.
2. **Không dùng lỗi kỹ thuật làm copy chính.** Không hiển thị stack trace, raw provider error, vector score hoặc account ID.
3. **Không biến thiếu dữ liệu thành khẳng định.** Metadata-only/partial/unverified phải giữ nhãn đến tận nơi claim xuất hiện.
4. **Không mất việc của user.** Retry, quay lại và session recovery giữ input/nháp khi an toàn.
5. **Không có dead-end.** Ngay cả blocked/permission cũng có hành động: sửa input, yêu cầu quyền, xem nội dung thay thế hoặc quay về project.
6. **Không màu đơn độc.** Success/warning/danger luôn có nhãn chữ.

## 2. Ma trận trạng thái theo bề mặt

| Bề mặt | Loading | Empty | Error có thể thử lại | Blocked / Permission | Partial / Cần quyết định | Thành công |
|---|---|---|---|---|---|---|
| `SCR-01` | Đang chuyển tới Google | — | Đăng nhập chưa hoàn tất, thử lại | Chưa đủ 18+ / invite hết hạn | Thiếu checkbox | Vào GON |
| `SCR-02` | Đang nhận artifact | Chưa có input/project | Upload/link lỗi theo từng artifact | File/URL không an toàn | Metadata-only/partial extraction | Artifact sẵn sàng |
| `SCR-03` | Đang đối chiếu + bước | Missing có Brew | Tìm kiếm gián đoạn, chạy lại an toàn | Nội dung bị chặn | Related/Clarify | Found |
| `SCR-04` | Queued/processing theo bước | Chưa xác nhận Brew | Failed retryable | Quota/safety block | Needs input | AI draft ready/private |
| `SCR-05` | Skeleton cards | Lọc/ẩn hết, có recovery | Không tải được candidates | Candidate bị ẩn bởi policy | Ít hơn 10 và giải thích | Danh sách sẵn sàng |
| `SCR-06` | Đang tải cặp | Chưa đủ 2 hướng | Gửi vote không chắc chắn | Cặp đã bị gỡ | — | Vote đã ghi + reveal |
| `SCR-07` | Đang tạo branch | Chưa có branch | Tạo branch lỗi, thử lại | Hết quyền với upstream | Đã có branch trùng | Branch riêng sẵn sàng |
| `SCR-08` | Đang tải/lưu nháp | Chưa có block khả dụng | Nộp bài lỗi, giữ nháp | Nội dung bị ẩn pending review | Needs revision | Recall/Apply đạt |
| `SCR-09` | Đang nộp/đánh giá | Chưa có artifact | Upload/submit lỗi | Proof bị từ chối theo policy | Pending human review | Proof + Mastery/XP cập nhật |
| `SCR-10` | Đang tải tiến bộ | Chưa có journey | Không tải được một cụm | — | Có next step cần chọn | Timeline hiện tại |
| `SCR-11` | Đang tải proof | Chưa có proof | Gắn proof lỗi | Proof bị thu hồi | Source chưa đối chiếu | Proof đã lưu đúng nhãn |
| `SCR-12` | Đang lưu lựa chọn | Chưa có footprint | Lưu preference lỗi | — | Delete request pending | Preference đã áp dụng |
| `SCR-16` | Đang tải queue | Queue trống | Quyết định không gửi được | Không có role | Cần thêm thông tin | Quyết định đã ghi audit |

## 3. Trạng thái toàn cục

### 3.1 Offline

- Banner: `Bạn đang ngoại tuyến. Nội dung đã mở vẫn đọc được; thao tác cần server sẽ được đánh dấu chưa gửi.`
- Composer/answer có thể giữ nháp cục bộ nếu P03 cho phép.
- Không hiển thị XP/Proof mới như đã xác nhận khi chưa đồng bộ.
- Khi online lại, thông báo mục nào đã gửi, mục nào xung đột.

Prototype không giả lập offline; đây là contract UX cho P04.

### 3.2 Session hết hạn

- Copy: `Phiên đăng nhập đã hết hạn. Đăng nhập lại để quay đúng nơi bạn đang làm.`
- Không lộ title/proof private trong màn hình login.
- Sau login, quay lại đích an toàn; nếu quyền đã đổi, chuyển sang permission state.

### 3.3 Không có quyền

- Copy: `Bạn không có quyền xem nội dung này.`
- Không xác nhận nội dung private có tồn tại hay thuộc về ai ngoài mức policy cho phép.
- CTA: `Về dự án của tôi`, và `Yêu cầu quyền` chỉ khi tính năng chia sẻ được đưa vào contract.

### 3.4 Nội dung bị ẩn/gỡ

- Nếu user là owner/creator: nêu trạng thái `Đang được kiểm tra`, `Cần sửa`, hoặc `Đã gỡ` và đường xem lý do/appeal theo policy.
- Nếu là learner trên branch: giữ progress/proof hợp lệ, thay block bị ảnh hưởng bằng placeholder có giải thích và next step.

### 3.5 Không chắc chắn sau submit

Khi request timeout, không nói chắc chắn thất bại/thành công:

> `Chúng tôi chưa xác nhận được thao tác đã được ghi hay chưa. Hãy kiểm tra trạng thái trước khi gửi lại.`

CTA chính là `Kiểm tra trạng thái`, không phải `Gửi lại` cho tới khi biết an toàn.

## 4. Nhãn tin cậy bắt buộc

### 4.1 Artifact extraction

| Nhãn EN nội bộ | Copy VI | Ý nghĩa |
|---|---|---|
| `ready` | Đã đọc | Phần nội dung dự kiến đã được trích xuất |
| `partial` | Đã đọc một phần | Có phần thiếu; phải nói phần nào nếu biết |
| `metadata_only` | Chỉ có metadata | Chưa đọc nội dung chính/transcript |
| `unsupported` | Chưa hỗ trợ định dạng này | Có thể thay artifact khác |
| `failed` | Chưa xử lý được | Có thể thử lại/thay thế |
| `blocked` | Đã dừng vì an toàn/quyền | Không xử lý tiếp ở dạng hiện tại |

### 4.2 Nội dung AI và nguồn

| Nhãn | Copy giải thích |
|---|---|
| `AI draft` | Bản nháp do AI tạo, chưa được duyệt xuất bản |
| `Has citations` | Có nguồn gắn với các claim chính; mở citation để kiểm tra |
| `Needs verification` | Có claim chưa đủ nguồn — không nên coi là kết luận |
| `Reviewed` | Đã qua quy trình review được ghi trong version |
| `Remix` | Dựa trên upstream có attribution |

Không dùng từ “chính xác”, “đã kiểm chứng khoa học” hoặc “được bảo chứng” nếu không có quy trình/bằng chứng tương ứng.

### 4.3 Proof verification

| Mức | Copy ngắn | Chưa chứng minh |
|---|---|---|
| `Self-declared` | Bạn tự khai/gắn bằng chứng này | Tính xác thực của issuer/chủ sở hữu |
| `Source-linked` | Đã gắn tới nguồn có thể mở | Nguồn thuộc về bạn hoặc issuer công nhận |
| `System-recorded` | GON ghi nhận theo event/rubric trong hệ thống | Chứng nhận bên ngoài GON |
| `Issuer-verified` | Tổ chức phát hành đã xác minh qua kênh được chấp nhận | Mọi năng lực ngoài phạm vi chứng nhận |

### 4.4 Ranking/Trend

- Luôn có nút/câu `Vì sao thứ tự này?`
- Copy mẫu: `Đang ưu tiên vì khớp mục tiêu tạo artifact, thời lượng bạn chọn và các hướng bạn từng hoàn thành. Bạn có thể tắt cá nhân hóa.`
- Trend nội bộ dùng: `Đang được quan tâm trong GON` kèm cửa sổ thời gian/nhóm nếu P03 cung cấp.
- Không dùng: `sắp viral`, `đảm bảo nổi tiếng`, `cơ hội đổi đời`, `mọi người đang bỏ lỡ`.

## 5. Microcopy VI/EN cốt lõi

Tiếng Việt là ngôn ngữ chính của Private Alpha. Bản EN dưới đây khóa ý nghĩa, không yêu cầu P02 prototype song ngữ đầy đủ.

| Ngữ cảnh | VI | EN |
|---|---|---|
| Age gate | Tôi xác nhận mình đủ 18 tuổi. | I confirm that I am at least 18 years old. |
| Privacy default | Mặc định: Riêng tư | Private by default |
| Search CTA | Tìm hoặc Brew | Search or Brew |
| Missing | Phần này chưa có trong kho tri thức. GON có thể tạo một bản nháp riêng cho bạn. | This is not in the knowledge base yet. GON can create a private draft for you. |
| Related | Đã có phần nền tảng, nhưng còn thiếu góc bạn cần. | A related foundation exists, but part of your goal is missing. |
| Brew confirm | Module mới sẽ là bản nháp AI và chỉ mình bạn thấy. | The new module will be an AI draft visible only to you. |
| Brew CTA | Bắt đầu Brew | Start Brew |
| Output label | Hướng học | Learning path |
| Ranking reason | Vì sao hướng này hiện ở đây? | Why is this recommended? |
| Fork CTA | Tạo hành trình của tôi | Create my journey |
| Fork explain | Bản gốc không thay đổi. Tiến bộ và ghi chú nằm trong hành trình riêng của bạn. | The original stays unchanged. Your progress and notes live in your private journey. |
| Arena intro | Vote giúp GON hiểu mức phù hợp với mục tiêu của bạn; vote không xác minh nội dung đúng sai. | Your vote helps GON understand fit for your goal; it does not verify factual correctness. |
| Vote: left | Trái phù hợp hơn | Left fits better |
| Vote: tie | Hòa | Tie |
| Vote: both bad | Cả hai chưa phù hợp | Neither fits |
| Vote: merge | Kết hợp hai hướng | Combine both |
| Vote: right | Phải phù hợp hơn | Right fits better |
| Vote success | Đã ghi nhận lựa chọn của bạn. | Your choice has been recorded. |
| Exposed only | Bạn mới tiếp xúc nội dung. Hãy tự truy hồi để chứng minh mức nhớ. | You have only been exposed so far. Retrieve it in your own words to show recall. |
| Retrieval prompt | Giải thích bằng lời của bạn. | Explain it in your own words. |
| Needs revision | Chưa đạt rubric. Xem phần cần sửa và thử lại. | This does not meet the rubric yet. Review the feedback and try again. |
| Boss CTA | Nộp Boss Proof | Submit Boss Proof |
| Boss success | Boss Proof đã đạt rubric và được ghi vào Proof Vault. | Your Boss Proof meets the rubric and has been added to your Proof Vault. |
| XP explain | XP chỉ tăng khi hành động học được xác thực; xem, vote hoặc chia sẻ đơn thuần không tạo XP cốt lõi. | XP increases only for validated learning actions; viewing, voting or sharing alone does not earn core XP. |
| Level | Cấp số học tập suốt đời · không có cấp cuối | Lifelong numeric level · no final level |
| Proof: self | Tự khai — chưa được tổ chức phát hành xác minh. | Self-declared — not verified by the issuer. |
| Proof: source | Đã gắn nguồn — chưa đối chiếu chủ sở hữu. | Source-linked — ownership has not been matched. |
| Proof: system | GON ghi nhận theo rubric/sự kiện trong hệ thống. | Recorded by GON from an in-system event or rubric. |
| Personalization off | Đã tắt cá nhân hóa. Gợi ý sẽ dùng input hiện tại và tiêu chí chung. | Personalization is off. Recommendations will use your current input and general criteria. |
| Delete footprint | Yêu cầu xóa footprint | Request footprint deletion |
| Report | Báo cáo nội dung | Report content |
| Not interested | Không phù hợp với tôi | Not for me |
| Offline | Bạn đang ngoại tuyến. Thay đổi chưa gửi sẽ được đánh dấu rõ. | You are offline. Unsynced changes will be clearly marked. |
| No guarantee | GON không hứa nội dung sẽ viral hay tạo thu nhập. | GON does not promise virality or income. |

## 6. Phong cách viết

### Nên

- Động từ rõ hành động: `Tạo`, `Xem nguồn`, `Thử lại`, `Sửa input`.
- Một câu giải thích hệ quả ngay dưới CTA quan trọng.
- Số đếm cụ thể khi biết chắc: `10 hướng`, `còn 20 XP tới Lv.13`.
- Nhận trách nhiệm hệ thống: `GON chưa xử lý được file này`.

### Không nên

- Đổ lỗi: `Bạn nhập sai`.
- Thao túng khan hiếm: `Chỉ còn 3 phút để không bị bỏ lại`.
- Cường điệu AI: `AI đã hiểu hoàn toàn`.
- Thuật ngữ lập trình không giải thích: `Fork branch ngay`, `commit để nhận XP` cho learner phổ thông.
- Gọi vote là “chọn đáp án đúng”.

## 7. Thông báo và toast

Toast chỉ cho kết quả ngắn, không chứa quyết định quan trọng duy nhất:

- đã lưu/bỏ lưu;
- đã ẩn hướng;
- đã ghi yêu cầu;
- đã sao chép liên kết nội bộ.

Kết quả Brew, Boss, report và delete footprint phải có trạng thái bền vững trong trang/notification, không chỉ toast biến mất.

## 8. Nội dung cần P03/P05 cung cấp thêm

- Mã lỗi có thể map sang nhóm copy mà không lộ chi tiết nhạy cảm.
- Thời gian ước lượng job theo khoảng hoặc trạng thái “có thể rời đi”.
- Quota copy: còn bao nhiêu lượt, reset khi nào, điều gì xảy ra khi hết.
- Policy/appeal copy cho blocked/rejected content.
- Retention/deletion wording đã được rà soát pháp lý.
- Citation bị hỏng/nguồn rút lại và cách hiển thị trên module cũ.

Cho tới khi các nội dung trên được chốt, UI production không được tự hứa thời hạn xử lý, mức xác minh hay quyền kháng nghị không tồn tại trong contract.
