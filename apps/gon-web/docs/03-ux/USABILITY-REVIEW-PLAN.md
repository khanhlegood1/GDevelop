# P02 — Usability Review Plan

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md).

> **Trạng thái:** APPROVED tại P02 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Lưu ý trung thực:** Chưa có phiên usability test với người dùng thật được thực hiện trước khi P02 được duyệt. PO đã cho phép bắt đầu P03; tài liệu này vẫn là kế hoạch kiểm chứng phải thực hiện trước khi khóa production UI ở P04, không phải báo cáo kết quả.

## 1. Mục tiêu

Kiểm tra xem người trưởng thành không biết trước GON có thể:

1. hiểu GON không phải chỉ là công cụ hỏi đáp AI;
2. tạo một input và biết artifact nào chưa được đọc đầy đủ;
3. phân biệt Found/Related/Missing và lý do Brew xuất hiện;
4. chọn một hướng trong 10 lựa chọn mà không bị quá tải;
5. hiểu Arena vote không xác minh sự thật;
6. hiểu “Tạo hành trình của tôi” tạo bản riêng mà không sửa bản gốc;
7. hoàn thành một vòng Concept → Retrieval → Transfer → Boss;
8. phân biệt Level, Mastery và mức xác minh Proof;
9. tìm được cách tắt cá nhân hóa;
10. hoàn thành flow trên mobile và chỉ dùng bàn phím.

## 2. Hồ sơ người tham gia đề xuất

Tối thiểu một vòng khám phá 5–7 người 18+ tại Việt Nam, không thu thập dữ liệu nhạy cảm không cần thiết:

- 2 người học tự định hướng/người đi làm;
- 1–2 creator hoặc người từng tạo nội dung giáo dục;
- 1 người học sâu/nghiên cứu;
- 1 người ít kinh nghiệm công nghệ nhưng dùng smartphone hằng ngày;
- nếu có thể, 1 người dùng bàn phím/công nghệ hỗ trợ.

Đây là cỡ mẫu tìm vấn đề UX định tính, không đủ để kết luận thị trường hay tỷ lệ chuyển đổi. Việc tuyển chọn/đồng thuận ghi hình phải được PO/tổ chức vận hành duyệt theo quy trình riêng.

## 3. Thiết lập phiên

- Prototype: `apps/gon-web/ux-prototype`.
- Thiết bị: một vòng desktop 1280px và một vòng mobile khoảng 360px.
- Người điều phối không giải thích thuật ngữ trước. Chỉ can thiệp khi người tham gia bế tắc quá lâu và ghi đó là hỗ trợ.
- Dùng think-aloud: “Hãy nói bạn đang kỳ vọng điều gì xảy ra trước khi bấm.”
- Không yêu cầu tài khoản cá nhân, file cá nhân hay bằng chứng thật.

## 4. Kịch bản nhiệm vụ

| Task | Lời giao việc không dẫn dắt | Quan sát chính | Hoàn thành |
|---|---|---|---|
| T01 | “Bạn vừa nhận lời mời GON. Hãy vào hệ thống.” | Có hiểu 18+ self-attestation và lựa chọn footprint không? | Tới SCR-02 không cần gợi ý |
| T02 | “Bạn tò mò vì sao một bài hát viral sau một đêm và muốn tạo nội dung học từ đó. Hãy bắt đầu.” | Chọn input/mode, nhận ra metadata-only | Gửi tới SCR-03 và nói được artifact chưa đọc đủ |
| T03 | “Hệ thống nói mới có nội dung liên quan một phần. Bạn muốn có phần còn thiếu.” | Phân biệt Related, tìm Brew | Bắt đầu Brew có chủ đích |
| T04 | “Hãy chọn cách học hợp nhất với mục tiêu tạo nội dung trong khoảng 30 phút.” | Đọc card, filter, dùng Top 3 hay toàn bộ | Chọn/so sánh và giải thích chọn |
| T05 | “Bạn phân vân giữa hai hướng đầu. Hãy dùng cách hệ thống cung cấp để quyết định.” | Tìm Compare/Arena, hiểu blind | Vote và nói đúng vote không chứng minh đúng sai |
| T06 | “Hãy bắt đầu học mà không làm thay đổi bản gốc của người khác.” | Hiểu CTA Fork và Private | Tạo hành trình và nhận ra upstream |
| T07 | “Hãy học đến khi hệ thống công nhận bạn có bằng chứng.” | Gating Retrieval/Transfer/Boss có gây khó chịu/hiểu lầm? | Đạt Boss mock hoặc nói rõ lý do chưa đạt |
| T08 | “Cho tôi biết cấp độ, mức thành thạo và bằng chứng của bạn khác nhau thế nào.” | Đọc ba panel ở SCR-10/11 | Phân biệt đúng cả ba |
| T09 | “Bạn không muốn hệ thống dùng lịch sử trong GON để xếp gợi ý nữa.” | Tìm toggle từ Output hoặc Privacy | Tắt và biết học vẫn tiếp tục |
| T10 | “Bạn thấy một claim không có nguồn đáng tin. Hãy xử lý.” | Phân biệt Not for me/report/cần kiểm chứng | Mở report đúng đối tượng |
| T11 | Lặp T04/T06 trên mobile | Bottom nav, CTA bị che, card dài | Hoàn thành không cần zoom ngang |
| T12 | Lặp T05/T07 chỉ bằng bàn phím | Focus order/visibility, dialog | Không mất focus hoặc kẹt |

## 5. Câu hỏi sau task

- “Bạn nghĩ GON vừa làm gì với input của bạn?”
- “Từ nào khó hiểu nhất: Brew, Hướng học, Hành trình, Boss Proof, Proof Vault?”
- “Khi nào bạn tin một nội dung là đã được kiểm chứng?”
- “Vote vừa rồi thay đổi điều gì?”
- “Bạn có cảm thấy bị ép phải viral, vote hoặc học tiếp không?”
- “Nếu đóng app giữa chừng, bạn kỳ vọng quay lại ở đâu?”
- “Điều gì khiến bạn không muốn đưa file/link thật vào?”

Không hỏi “Bạn có thích giao diện không?” như tiêu chí duy nhất.

## 6. Chỉ số quan sát và ngưỡng đề xuất

Ngưỡng là tiêu chí rà soát UX cho vòng định tính, không phải SLO production.

| Chỉ số | Ngưỡng đề xuất để không chặn P03 | Nếu không đạt |
|---|---|---|
| Hoàn thành T01–T07 không hỗ trợ | Ít nhất 4/5 người ở mỗi task lõi | Sửa IA/CTA/copy và test lại task bị lỗi |
| Hiểu Fork/private | Ít nhất 4/5 giải thích đúng | Làm lại `SCR-07` confirmation/onboarding hint |
| Hiểu vote không xác minh sự thật | Ít nhất 4/5 | Tăng độ rõ ở Arena header/result |
| Phân biệt Level/Mastery/Proof | Ít nhất 4/5 đúng cả ba | Tách visual/copy mạnh hơn |
| Tìm tắt personalization | Ít nhất 4/5 trong 60 giây | Thêm lối vào tại RankingExplanation |
| Lỗi nghiêm trọng gây mất dữ liệu/kẹt flow | 0 | Dừng duyệt cho tới khi sửa |
| Mobile CTA bị che/kẹt | 0 | Sửa layout trước P04 |
| Keyboard mất focus ở flow lõi | 0 | Sửa prototype/component pattern |

Thời gian hoàn thành chỉ dùng để tìm điểm ngập ngừng; không biến “nhanh hơn” thành mục tiêu nếu nó làm giảm học thật.

## 7. Phân loại phát hiện

| Severity | Ví dụ | Hành động |
|---|---|---|
| S1 Blocker | Không qua được consent, mất nháp, không phân biệt proof giả/verified | Sửa trong P02 hoặc tạo điều kiện phê duyệt bắt buộc |
| S2 Major | Không tìm thấy Brew/Fork/Privacy, hiểu vote là đúng sai | Sửa trước P04; PO quyết có chặn P03 không |
| S3 Minor | Từ ngữ dài, card scan chậm, icon khó hiểu | Ghi backlog UX, sửa khi làm component thật |
| S4 Preference | Thích màu/layout khác nhưng vẫn hoàn thành | Không tự đổi scope nếu không có bằng chứng lặp lại |

## 8. Cách ghi bằng chứng

Mỗi phát hiện ghi:

```text
ID:
Task / Screen / Component:
Điều người tham gia kỳ vọng:
Điều hệ thống làm:
Trích lời ngắn (đã được đồng ý):
Severity:
Giả thuyết nguyên nhân:
Đề xuất sửa:
Requirement/BDD bị ảnh hưởng:
Cần PO quyết định? Có/Không
```

Không đưa ghi âm, dữ liệu cá nhân hoặc artifact thật của người tham gia vào Git.

## 9. Tự kiểm tra không cần người ngoài

Trước khi mời người tham gia, nhóm thực hiện phải:

- chạy toàn bộ kịch bản trong prototype README;
- kiểm tra 360px/768px/1280px;
- thử chỉ dùng Tab/Shift+Tab/Enter/Space/Esc;
- bật reduced motion;
- kiểm tra text ở grayscale;
- đọc mọi badge và tự hỏi nhãn có phóng đại xác minh không;
- kiểm tra reload ở mỗi màn không gây tuyên bố dữ liệu đã được lưu ở production.

## 10. Quyết định cần PO xác nhận nếu muốn chạy test thật

P02 không tự tuyển người hoặc thu dữ liệu. PO cần duyệt riêng:

- ai điều phối và ai được xem bản ghi;
- mẫu đồng thuận ghi hình/ghi chú;
- thù lao nếu có;
- dữ liệu được giữ bao lâu và ở đâu;
- việc kết quả test có chặn P03 hay chỉ tạo điều kiện sửa trước P04.

Nếu PO duyệt P02 mà chưa chạy usability test, quyết định nên ghi rõ đây là **điều kiện còn mở cho P04**, không ghi “UX đã được người dùng xác thực”.
