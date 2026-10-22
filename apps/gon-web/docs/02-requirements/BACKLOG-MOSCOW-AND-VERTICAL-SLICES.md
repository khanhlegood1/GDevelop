# Backlog, MoSCoW và Vertical Slices

> **Artifact:** P01-BACKLOG<br>
> **Trạng thái:** IN REVIEW tại P01<br>
> **Mục tiêu:** biến PRD thành thứ tự xây dựng có thể kiểm chứng mà không phình Private Alpha thành toàn bộ tầm nhìn dài hạn.

## 1. Cách dùng MoSCoW trong GON

| Mức | Nghĩa trong Private Alpha |
|---|---|
| **Must** | Thiếu thì vòng học lõi không an toàn hoặc không chứng minh được giá trị |
| **Should** | Rất nên có sau khi Must chạy; có thể vào cuối alpha hoặc release kế tiếp |
| **Could** | Hữu ích nhưng không được chặn vòng lõi |
| **Won't (for Alpha)** | Cố ý không làm trong Private Alpha; có thể xét lại bằng quyết định/gate riêng |

## 2. Epics và user stories

### E01 — Access, hồ sơ và quyền kiểm soát dữ liệu

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-101 | Là người dùng mới 18+, tôi đăng nhập Google và xác nhận điều kiện alpha để bắt đầu an toàn | Must | REQ-ID-001…003 |
| US-102 | Là người học, tôi chọn Learning Mode theo phiên để cùng một tài khoản phục vụ nhiều mục tiêu | Must | REQ-ID-006 |
| US-103 | Là người học, tôi xem/tắt/xóa footprint để kiểm soát cá nhân hóa | Must | REQ-PRV-001…003 |
| US-104 | Là người học, tôi yêu cầu xuất/xóa dữ liệu và thấy trạng thái xử lý | Must | REQ-ID-005 |
| US-105 | Là creator, tôi phân biệt thông tin tự khai với credential đã xác minh | Must | REQ-ID-004 |

### E02 — Universal Input thành Learning Project

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-201 | Là người học, tôi dán text hoặc URL để tạo project mà không cần biết trước khóa học | Must | REQ-INP-001, 003 |
| US-202 | Là người học, tôi tải file/ảnh trong giới hạn rõ ràng để biến tài liệu của mình thành input | Must | REQ-INP-002 |
| US-203 | Là người học, tôi thấy artifact nào đã đọc được, artifact nào mới lưu metadata để không bị AI “đoán” | Must | REQ-INP-004…005 |
| US-204 | Là người học, tôi chọn goal/depth/time để kết quả phù hợp phiên học | Must | REQ-INP-006 |
| US-205 | Là người học, tôi bị chặn trước file/URL nguy hiểm bằng thông điệp dễ hiểu | Must | REQ-INP-008 |

### E03 — Search, Brew và Canonical Module

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-301 | Là người học, tôi tìm thấy module liên quan bằng ngữ nghĩa chứ không chỉ trùng từ khóa | Must | REQ-SCH-001…004 |
| US-302 | Là người học, khi chưa có module đủ tốt, tôi được mời Brew thay vì gặp trang rỗng | Must | REQ-SCH-002, REQ-BRW-001 |
| US-303 | Là người học, tôi theo dõi Brew đang chạy/lỗi/xong và quay lại sau mà không mất job | Must | REQ-BRW-002…003 |
| US-304 | Là người học, module có nguồn và nhãn chưa kiểm chứng rõ ràng để tôi quyết mức tin cậy | Must | REQ-BRW-004…006 |
| US-305 | Là người học, tôi báo claim/nguồn sai và yêu cầu sửa một phần module | Should | REQ-BRW-007 |

### E04 — Output Candidates và Arena

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-401 | Là người học, tôi thấy nhiều hướng output thật sự khác nhau từ cùng input | Must | REQ-OUT-001…003 |
| US-402 | Là người học, tôi đổi Learning Mode và thấy ranking/lý do thay đổi | Must | REQ-OUT-005, REQ-RNK-001 |
| US-403 | Là người học, tôi so sánh hai output ẩn nhãn và vote/merge để chọn hướng hợp với mình | Must | REQ-ARN-001…004 |
| US-404 | Là người học, tôi ẩn output không quan tâm để phiên sau ít bị gợi ý tương tự hơn | Must | REQ-OUT-004 |
| US-405 | Là operator, tôi chỉ mở public leaderboard khi đủ trận và có khoảng tin cậy | Should | REQ-RNK-002 |

### E05 — Journey Fork và module player

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-501 | Là người học, tôi Fork output thành hành trình riêng tư có ghi nguồn upstream | Must | REQ-JRN-001…002 |
| US-502 | Là người học, tôi học từng quest và biết concept nào đã Recall/Apply/Create | Must | REQ-LRN-001, 005 |
| US-503 | Là người học, tôi tự truy hồi và làm transfer task để chứng minh không học vẹt | Must | REQ-LRN-002…003 |
| US-504 | Là người học, tôi nộp Boss Proof theo rubric đã thấy trước | Must | REQ-LRN-004 |
| US-505 | Là người học, tôi quay lại branch và thấy bước tiếp theo phù hợp | Must | REQ-JRN-004 |
| US-506 | Là người học nâng cao, tôi diff/merge hai branch khi muốn kết hợp hai hướng | Could | REQ-JRN-005 |

### E06 — XP Ledger, Lifelong Level và Proof Vault

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-601 | Là người học, tôi nhận XP khi đạt rubric và thấy XP đến từ sự kiện nào | Must | REQ-XP-001…002 |
| US-602 | Là người học, level của tôi luôn là `Lv.N · Era` và luôn có level tiếp theo | Must | REQ-XP-003…004 |
| US-603 | Là người học, tôi không bị thưởng XP cốt lõi chỉ vì xem/like/Fork rỗng | Must | REQ-XP-005 |
| US-604 | Là người học, tôi lưu proof hệ thống/link/ảnh/chứng chỉ với cấp xác minh trung thực | Must | REQ-PRF-001…004 |
| US-605 | Là người học, tôi khiếu nại XP/proof bị ghi sai | Should | REQ-PRF-005, REQ-XP-002 |

### E07 — Render đa định dạng và GDevelop

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-701 | Là người học, tôi học module trên web mà không bắt buộc chơi game | Must | REQ-RND-001 |
| US-702 | Là creator, tôi xuất infographic/video brief/task từ cùng module graph | Should | REQ-RND-002 |
| US-703 | Là người học, tôi chơi một game template từ module và kết quả được ghi nhận an toàn | Should | REQ-GDV-001…003 |
| US-704 | Là creator, tôi tải/mở project GDevelop để sửa sâu | Could | Nghiên cứu ở P03 |

### E08 — Trend nội bộ, creator attribution và publish có kiểm soát

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-801 | Là người học, tôi thấy “đang được học hiệu quả trong GON” dựa trên completion/Fork/proof | Should | REQ-RNK-003 |
| US-802 | Là creator, output của tôi giữ attribution khi được Fork/cải tiến | Must | REQ-CRT-001 |
| US-803 | Là creator, tôi xem downstream learners đã hoàn thành/proof từ output của mình | Should | REQ-CRT-002 |
| US-804 | Là creator, tôi chủ động publish Success Path sau moderation | Later | REQ-CRT-003 |
| US-805 | Là creator, tôi nhận tiền/token/marketplace | Won't for Alpha | REQ-CRT-004 |

### E09 — Safety, moderation và operations

| Story | Nội dung | MoSCoW | Requirements |
|---|---|---|---|
| US-901 | Là người học, tôi báo cáo nội dung/proof/hành vi và theo dõi trạng thái | Must | REQ-SAF-002 |
| US-902 | Là reviewer, tôi ẩn/khóa/sửa/phê duyệt nội dung có audit | Must | REQ-SAF-001, 003 |
| US-903 | Là operator, tôi theo dõi search/Brew cost và tắt pipeline khi có sự cố | Must | REQ-OPS-001…003 |
| US-904 | Là user học chủ đề rủi ro cao, tôi thấy disclaimer và nguồn chuyên môn phù hợp | Must | REQ-SAF-004 |

## 3. Won't for Private Alpha

Các mục sau bị loại có chủ đích để bảo vệ phạm vi:

- Public registration và public social feed.
- Public Success Path/guild/marketplace.
- Token, ví, mua bán, chia sẻ doanh thu và cam kết thu nhập.
- Xác minh giấy tờ tùy thân, issuer verification tự động hoặc POAP/SBT anchoring nếu chưa có verifier/policy.
- Kết nối tài khoản TikTok/Facebook/YouTube để đọc footprint cá nhân.
- External social trend scraping.
- ML recommender huấn luyện từ dữ liệu lớn; alpha dùng rules/signals minh bạch.
- Tự động publish AI module cho mọi user.
- GDevelop exporter tổng quát cho mọi loại topic/game.
- Native iOS/Android app.

## 4. Vertical Slices đề xuất

Thứ tự dưới đây là để P02 thiết kế và P03 khóa contract; chưa phải lịch cam kết.

### VS1 — Curiosity to Proof

**Mục tiêu:** chứng minh vòng lõi từ input đến bằng chứng học đầu tiên.

**Bao gồm**

- Google + 18+ self-attestation + consent.
- Text/URL/file-image artifact intake theo mức P03 chốt.
- Search `found/related/missing` trên corpus được phép.
- Brew một web module có citation và trạng thái draft.
- Danh sách candidate outputs cơ bản; chọn một hướng.
- Fork private branch.
- Web player: concept → retrieval → transfer → Boss Proof.
- XP Ledger và Lifelong Level.
- Proof Vault ở các cấp Self-declared/Source-linked/System-recorded.
- Report/khóa nội dung tối thiểu và telemetry funnel.

**Không bao gồm:** public leaderboard, trend cộng đồng, public publish, GDevelop playable export, token/reward.

**Exit evidence:** user alpha hoàn thành ít nhất một hành trình end-to-end; mọi XP truy được về event/rubric; module có nguồn; không lộ dữ liệu private trong test authorization.

### VS2 — Choose Better: 10+ Outputs & Arena

**Mục tiêu:** chứng minh đa hướng và vote giúp chọn đúng hơn.

**Bao gồm**

- Candidate generation/gom cụm hướng tới 10+ khi đủ độ rộng.
- Learning Mode reranking có giải thích.
- Blind Arena, merge intent và personal ranking.
- Pairwise rating nội bộ có số trận/khoảng tin cậy.
- “Không quan tâm” và preference controls.

**Exit evidence:** cùng input cho thứ hạng khác nhau giữa các mode theo cách kiểm chứng được; vote không trùng; user hiểu lý do output được đề xuất.

### VS3 — Journey Depth

**Mục tiêu:** làm Fork thành hành trình dài hạn thay vì bản sao một lần.

**Bao gồm**

- Branch timeline/commits rõ hơn.
- Delayed review/retention.
- Diff hai branch ở mức concept/artifact/proof.
- Merge có xử lý mâu thuẫn nguồn.
- Upstream update notifications.

**Exit evidence:** user quay lại sau nhiều ngày vẫn hiểu tiến độ; merge không ghi đè âm thầm.

### VS4 — Playable GDevelop Template

**Mục tiêu:** chứng minh Canonical Module Graph biến thành game học thật.

**Bao gồm**

- Một hoặc hai template mechanic được P03 spike chọn.
- Sinh cấu hình/scene từ graph trong phạm vi template.
- Game telemetry có xác thực/idempotency.
- Web/text equivalent.

**Exit evidence:** game chạy được trong test tự động phù hợp; XP không thể bị cộng chỉ bằng sửa client.

### VS5 — Internal Trend & Creator Attribution

**Mục tiêu:** khám phá nội dung đang tạo học thật trong cộng đồng alpha mà không biến GON thành feed gây nghiện.

**Bao gồm**

- Trend snapshots theo cửa sổ thời gian từ unique learners/completion/Fork/proof.
- Creator attribution và downstream learning analytics.
- Publish nội bộ/alpha có moderation.

**Exit evidence:** trend không thể bị đẩy chỉ bằng view/like; nội dung rủi ro bị gate trước khuếch đại.

### VS6 — Public Success Path (phase riêng)

Chỉ mở sau khi có moderation, privacy, legal, anti-fraud và quyết định PO riêng. Không thuộc Private Alpha.

## 5. Thứ tự ưu tiên sau P01

1. **P02** thiết kế VS1 + các bề mặt cần cho VS2 ở mức UX agreement.
2. **P03** khóa API/data/event/module graph và ADR stack; làm spike GDevelop đủ để không chặn VS4.
3. **P04** xây VS1 trước, sau đó VS2. VS3/VS4/VS5 chỉ vào build khi evidence của slice trước đạt và PO duyệt.
4. **P05** rà soát NFR/security/AI eval trên phạm vi release thật.
5. **P06** chỉ triển khai khi PO Go-Live riêng.

## 6. Ràng buộc chống phình scope

Một story chỉ vào Must nếu trả lời “có” cho ít nhất một câu:

- Thiếu nó, user không hoàn thành được vòng học lõi?
- Thiếu nó, XP/proof/ranking có thể bị hiểu sai hoặc gian lận nghiêm trọng?
- Thiếu nó, dữ liệu private hoặc nội dung nguy hiểm có thể bị lộ/khuếch đại?
- Thiếu nó, đội không đo được sản phẩm có tạo học thật hay không?

Nếu không, story mặc định là Should/Could.
