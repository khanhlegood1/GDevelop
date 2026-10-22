# Metrics, Risks và Open Decisions

> **Artifact:** P01-METRICS-RISK<br>
> **Trạng thái:** APPROVED tại P01 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Nguyên tắc đo:** GON tối ưu cho **học thật được chứng minh**, không tối ưu cho thời gian lướt, like/share hoặc tổng XP vô nghĩa.

## 1. North-star Metric

### Verified Learning Gain

**Định nghĩa vận hành cho Private Alpha:**

> Số concept mà một active learner đưa từ mức Exposed/Recall lên ít nhất **Apply** bằng bằng chứng đạt rubric trong kỳ đo, có kiểm tra lại ở một mốc sau đó khi dữ liệu cho phép.

Công thức báo cáo khởi điểm:

```text
Verified Learning Gain / Active Learner
= số concept đạt Apply+ lần đầu trong kỳ
  / số learner có ít nhất một Branch Commit hợp lệ trong kỳ
```

Chỉ số này phải được đọc cùng guardrails về chất lượng nội dung, gian lận, quyền riêng tư và chi phí AI. Không dùng một mình để kết luận sản phẩm tốt.

## 2. Cây chỉ số Private Alpha

| Nhóm | Chỉ số | Định nghĩa / cách đọc |
|---|---|---|
| Activation | Time to First Project | Từ đăng nhập đầu tiên tới Learning Project đầu tiên; đo median và tỷ lệ bỏ giữa chừng |
| Activation | Input → Search/Brew Outcome | Tỷ lệ found/related/missing/needs-clarification/blocked theo loại input |
| Search quality | Useful Result Rate | Tỷ lệ phiên user chọn học/Fork một kết quả hoặc xác nhận kết quả hữu ích |
| Brew | Brew Ready Rate | Job ready / job hợp lệ; tách lỗi user input, policy, provider và hệ thống |
| Brew | Brew Cost per Completed Module | Tổng chi phí AI/job chia cho module ready và module được học thật |
| Choice | Candidate Selection Rate | Phiên có chọn/Fork ít nhất một candidate / phiên có candidate |
| Choice | Mode Differentiation | Mức khác nhau của top candidates giữa các Learning Mode trên cùng input trong test set |
| Choice | Arena Helpfulness | Tỷ lệ user nói Arena giúp chọn hướng; đối chiếu completion sau vote |
| Learning | First Meaningful Commit Rate | Branch có commit retrieval/artifact/proof đầu tiên trong 7 ngày / branch đã Fork |
| Learning | Module Completion Quality | Tỷ lệ hoàn thành có retrieval + transfer đạt rubric, không tính chỉ mở hết bài |
| Learning | Boss Proof Pass / Revision | Tỷ lệ đạt lần đầu, đạt sau sửa và lý do không đạt |
| Learning | Delayed Retention | Tỷ lệ trả lời đúng/đạt lại sau khoảng giãn cách được P02/P03 chốt |
| Progression | XP Integrity | 100% XP chính thức phải truy được về source event/rule; đo reversal rate và duplicate attempts |
| Proof | Proof Level Distribution | Phân phối Self-declared/Source-linked/System-recorded; không có Issuer-verified giả |
| Trust | Citation Coverage | Claim trọng yếu có citation / tổng claim trọng yếu trong mẫu đánh giá |
| Trust | Report & Takedown Time | Thời gian từ report tới ẩn/xử lý theo mức rủi ro |
| Privacy | Personalization Control Usage | Tỷ lệ user xem/tắt/xóa footprint; lỗi dùng footprint sau khi tắt phải bằng 0 theo thiết kế |
| Creator | Downstream Learning per Output | Unique learners hoàn thành/proof từ một output; dùng trước mọi chỉ số follower/like |

## 3. Guardrail Metrics

Các chỉ số sau xấu đi thì không được “lấy tăng trưởng bù”:

- Tỷ lệ module có claim sai nghiêm trọng hoặc citation không hỗ trợ claim.
- Số sự cố lộ dữ liệu private qua search/API/log.
- Tỷ lệ XP bị reversal do trùng/gian lận tăng bất thường.
- Vote/Fork bị nghi bot hoặc phối hợp thao túng.
- Tỷ lệ user bỏ học ngay sau assessment vì rubric quá nặng/không rõ.
- Filter bubble: độ đa dạng chủ đề/quan điểm trong gợi ý giảm theo thời gian.
- Chi phí AI trên mỗi Verified Learning Gain tăng không kiểm soát.
- Nội dung viral nội bộ có completion thấp, trả lời sai cao hoặc report cao.
- Dấu hiệu ép buộc/gây nghiện: thông báo quá mức, streak trừng phạt hoặc ranking tạo áp lực xã hội.

## 4. Mục tiêu số trong P01

P01 **không bịa mục tiêu tăng trưởng** khi chưa có baseline người dùng thật. Việc PO phê duyệt P01 vào ngày 22/10/2026 bao gồm cách đo và các ngưỡng an toàn sau:

### Ngưỡng bắt buộc không thương lượng

- `0` module private của user này được trả cho user khác trong authorization tests.
- `0` XP chính thức không có source event/rule/idempotency.
- `0` proof được gắn Issuer-verified/Anchored nếu chưa có verifier thật.
- `0` AI module tự động public trong Private Alpha.
- `0` lần dùng footprint cho ranking sau khi user đã tắt personalization theo thời điểm hiệu lực đã công bố.
- Mọi Brew job phải có trạng thái cuối hoặc lỗi có thể hành động; không có job “treo vô hạn” mà không có cảnh báo vận hành.

### Cách đặt target tăng trưởng/chất lượng sau baseline

1. P02/P04 đo baseline bằng usability cohort và alpha cohort đầu tiên.
2. PO chốt target cho activation, completion, retention và cost sau khi thấy baseline.
3. Search/AI quality dùng test set gán nhãn và ngưỡng do P03/P05 đề xuất, PO/operator duyệt.
4. Không dùng target của TikTok/Facebook/Arena.ai làm mục tiêu GON nếu khác định nghĩa học thật.

## 5. Rủi ro sản phẩm và biện pháp giảm thiểu

| ID | Rủi ro | Mức | Giảm thiểu đã đưa vào P01 | Gate xử lý tiếp |
|---|---|---|---|---|
| R-01 | Scope quá lớn: search + AI + social + game + proof + creator economy | Cao | Private Alpha chỉ khóa VS1/VS2; Won't list rõ | P02/P03/P04 |
| R-02 | AI tạo nội dung sai nhưng trình bày tự tin | Cao | Citation/labels, draft/private, report/review, eval set | P03/P05 |
| R-03 | Chi phí Brew bị lạm dụng | Cao | User xác nhận Brew, quota, dedupe, kill switch | P03/P05 |
| R-04 | Bản quyền input/nguồn/media | Cao | Provenance, rights status, chỉ dùng phương thức được phép, takedown | P03/P05 |
| R-05 | Lộ hành trình/proof/footprint | Cao | Private default, consent, data minimization, authz tests | P03/P05 |
| R-06 | Farm XP/vote ring/Fork rỗng | Cao | XP gắn rubric, idempotency, trend ưu tiên proof/completion | P03/P05 |
| R-07 | 10+ output gây quá tải lựa chọn | Trung bình-Cao | Gom cụm, mode, lý do, cho phép ít hơn khi chủ đề hẹp | P02 |
| R-08 | Assessment quá nặng làm user phổ thông bỏ cuộc | Trung bình | Rubric tăng dần, hỗ trợ sửa bài, mode giải trí vẫn có cổng nhẹ phù hợp | P02/P04 |
| R-09 | Tự xác nhận 18+ không đủ khi public launch | Cao | Alpha không gọi là xác minh; rà soát pháp lý trước public | P05/P06 |
| R-10 | Hiểu nhầm level là credential hoặc token có giá trị | Cao | UI/copy tách Level/Mastery/Proof; không token trong alpha | P02/P05 |
| R-11 | GDevelop bridge khó hơn dự kiến | Trung bình | Web slice trước; GDevelop spike/template sau | P03/VS4 |
| R-12 | Trend làm méo học tập thành chạy theo viral | Cao | Trend sau VS1/VS2, chỉ dùng tín hiệu học thật nội bộ | VS5/P05 |
| R-13 | Nội dung sức khỏe/hiến máu bị AI nói quá quyền | Cao | Disclaimer, nguồn chính thức, không chẩn đoán | P02/P05 |
| R-14 | Creator kỳ vọng giàu/nổi tiếng nhanh | Trung bình-Cao | Copy minh bạch: cơ hội khám phá, không cam kết kết quả | P02 |
| R-15 | User không hiểu Fork/Branch | Trung bình | UX dùng “Tạo hành trình của tôi”, lineage trực quan | P02 |

## 6. Quyết định P01 đã được PO phê duyệt

Ngày 22/10/2026, Product Owner đã **duyệt tất cả mặc định `D-P01-01` đến `D-P01-14`** và cho phép bắt đầu P02. Bảng dưới đây được giữ làm hồ sơ quyết định; thay đổi sau này phải đi qua amendment/ADR được duyệt.

| ID | Quyết định | Nội dung đã duyệt | Hệ quả nếu sau này chọn khác |
|---|---|---|---|
| D-P01-01 | Hình thức phát hành đầu | **Private Alpha invite-only** | Public sớm cần legal/safety/ops mạnh hơn và kéo dài thời gian tới release |
| D-P01-02 | Thị trường/ngôn ngữ đầu | **Việt Nam, tiếng Việt trước; sẵn sàng i18n** | Đa ngôn ngữ ngay làm tăng chi phí content/QA |
| D-P01-03 | Mức kiểm chứng 18+ alpha | **Google + self-attestation; không gọi là xác minh giấy tờ** | Kiểm chứng giấy tờ/bên thứ ba tăng ma sát, chi phí và dữ liệu nhạy cảm |
| D-P01-04 | Privacy mặc định | **Journey/Fork/proof/footprint private; public opt-in sau** | Public mặc định tăng rủi ro lộ dữ liệu và áp lực xã hội |
| D-P01-05 | Brew activation | **User xác nhận mới chạy Brew trong alpha** | Auto-Brew tiện hơn nhưng khó kiểm soát chi phí/abuse |
| D-P01-06 | Publish module AI | **Draft/private; publish qua gate riêng sau** | Auto-publish có thể lan nội dung sai/vi phạm |
| D-P01-07 | Footprint | **Chỉ dữ liệu trong GON, opt-out được, giải thích gợi ý** | Thu thập rộng hơn cần pháp lý/consent và P05 sâu hơn |
| D-P01-08 | Trend | **Chỉ tín hiệu học thật nội bộ; không external social scrape** | External trend cần API/điều khoản và kiểm chứng chất lượng riêng |
| D-P01-09 | Creator reward alpha | **XP + attribution + reputation nội bộ; không tiền/token** | Reward có giá trị cần pháp lý, thuế/KYC khi áp dụng và anti-fraud |
| D-P01-10 | Vertical slice đầu sau P03 | **VS1 Curiosity to Proof** | Làm Arena/GDevelop/public trend trước sẽ thiếu vòng học lõi |
| D-P01-11 | Mức GDevelop alpha | **Web trước; GDevelop là VS4 template có kiểm chứng** | Exporter tổng quát ngay có thể chặn toàn bộ alpha |
| D-P01-12 | Quyền với input/output | **User giữ quyền của mình; cấp cho GON quyền xử lý/hiển thị theo privacy đã chọn; public license chốt khi có publish** | Điều khoản rộng hơn phải được PO/legal soạn rõ trước khi thu dữ liệu |
| D-P01-13 | Độ sâu xử lý artifact alpha | **Nhận rộng, xử lý theo mức minh bạch; loại chưa hỗ trợ ở trạng thái metadata-only** | Hứa xử lý mọi file/video ngay làm tăng mạnh scope/chi phí |
| D-P01-14 | Public leaderboard alpha | **Chỉ personal/internal; public khi đủ mẫu và chống thao túng** | Public sớm có thể tạo hạng giả từ rất ít vote |

## 7. Những điều P01 cố ý chưa quyết

Các mục sau thuộc P02/P03/P05 và không nên bị suy diễn từ PRD:

- Màn hình, luồng click, tên nút và visual hierarchy cuối cùng — P02.
- Frontend/backend/database/vector/auth/queue/cloud — P03 bằng ADR.
- Gemini model cho từng agent ngoài định hướng đã duyệt — P03/P04 bằng eval.
- Ngưỡng similarity production chính xác — P03 bằng labeled eval set.
- Retention period chi tiết cho từng loại artifact/log — P03/P05.
- Quy trình xác minh tuổi khi public launch — P05/legal review.
- Chính sách license khi public Fork/module — trước VS6.
- Token/reward ngoài XP — quyết định pháp lý/sản phẩm riêng, không thuộc alpha.

## 8. Điều kiện dừng hoặc quay lại P01

Phải quay lại PO trước khi tiếp tục nếu:

- pilot cho thấy người dùng không hiểu Input → Output → Fork sau P02 usability test;
- chi phí Brew cho một module được học thật vượt ngân sách PO chấp nhận tại P03;
- search/AI quality không đạt ngưỡng an toàn tại P05;
- cần thu thập thêm dữ liệu nhạy cảm để đạt mục tiêu;
- muốn mở public publish/token/reward trước khi vòng lõi được chứng minh;
- thay đổi công thức Lifelong Level hoặc biến vote thành căn cứ xác minh sự thật.
