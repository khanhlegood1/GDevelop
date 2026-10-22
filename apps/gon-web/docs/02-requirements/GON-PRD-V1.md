# GON Product Requirements Document

> **Artifact:** P01-PRD<br>
> **Phiên bản:** 1.0<br>
> **Ngày:** 22/10/2026<br>
> **Trạng thái:** **APPROVED — Product Owner đã duyệt ngày 22/10/2026**<br>
> **Commit được duyệt:** `9a09fa21fd8a27536eddb97ad179d14db3aab7ac`<br>
> **Gate nền:** Gate 0 APPROVED tại commit `5482dac`<br>
> **Sản phẩm:** GON — Game Of Nurture cho người trưởng thành 18+

## 1. Tóm tắt điều hành

GON biến bất kỳ điều gì người trưởng thành tò mò — một câu hỏi, đoạn text, file, hình ảnh, video link hoặc website — thành một **dự án học có bằng chứng**, thay vì một câu trả lời chat dùng một lần.

Người dùng đưa input vào GON. Hệ thống tìm module phù hợp bằng search ngữ nghĩa; nếu chưa có kết quả đủ tốt, GON đề xuất **Brew Your Topic**. Từ cùng input, GON mở nhiều hướng output khác nhau để người học so sánh bằng Arena, chọn hoặc hợp nhất, rồi **Fork** thành hành trình riêng. Người học tiến bộ qua nhiệm vụ truy hồi, áp dụng, sáng tạo và Boss Proof. XP chỉ được ghi khi hành động đạt rubric; Numeric Level tăng suốt đời theo `floor(LifetimeXP / 100)`.

### Phát hành đầu tiên đã được duyệt

**GON Private Alpha** phục vụ một nhóm người dùng 18+ được mời, ưu tiên tiếng Việt. Mục tiêu không phải chứng minh mọi tính năng xã hội/token/game cùng lúc, mà chứng minh bốn điều:

1. Người dùng biến được input thật thành dự án học có cấu trúc.
2. Search/Brew tạo được module có nguồn và đủ hữu ích để bắt đầu học.
3. Người dùng chọn được hướng phù hợp nhờ Output Candidates và Arena.
4. Người dùng hoàn thành được một vòng học có kiểm chứng và thấy tiến bộ qua Journey, XP/Level, Mastery và Proof.

## 2. Bài toán

Người trưởng thành học suốt đời đang gặp đồng thời năm vấn đề:

| Vấn đề | Hệ quả hiện nay | GON cần thay đổi điều gì? |
|---|---|---|
| Nội dung phân mảnh giữa search, video, mạng xã hội, file và ghi chú | Học xong khó quay lại, khó biết đã học gì | Mỗi input thành Source Artifact và Learning Project có provenance |
| AI trả lời nhanh nhưng dùng một lần, khó kiểm chứng | Người học tưởng đã hiểu vì đọc thấy quen | Module có citation, truy hồi, chuyển giao, artifact và Boss Proof |
| Một đáp án không phù hợp mọi mục tiêu | Researcher, creator, người đi làm và người học giải trí bị ép vào cùng format | 10+ output theo Learning Mode khi chủ đề đủ rộng; Arena giúp chọn và merge |
| Xu hướng xã hội tối ưu cho chú ý, không tối ưu cho hiểu thật | Người học copy trend, tương tác nhiều nhưng mastery thấp | Trend của GON ưu tiên completion, Fork tạo artifact, mastery và proof |
| Thành tích học nằm rải rác và dễ tự phong | Chứng chỉ/ảnh/link không nói rõ mức xác minh | Proof Vault có năm cấp xác minh và không phóng đại bằng chứng |

## 3. Tầm nhìn và nguyên tắc sản phẩm

### 3.1 Tầm nhìn

> Mọi tò mò của người trưởng thành đều có thể trở thành hành trình học, sáng tạo và đóng góp được ghi nhận suốt đời.

### 3.2 Lời hứa sản phẩm

```text
Search anything.
Choose your path.
Fork your journey.
Prove you became.
Level up for life.
```

### 3.3 Nguyên tắc bất biến

1. **Input vừa là truy vấn vừa là tài sản học tập.** Không vứt bỏ ngữ cảnh sau một lượt chat.
2. **Không có “no results” trống rỗng.** Luôn có kết quả liên quan, câu hỏi làm rõ hoặc Brew.
3. **Nhiều hướng, một hành trình của riêng user.** Output đa dạng nhưng phải dẫn tới lựa chọn/Fork rõ ràng.
4. **Vote không biến ý kiến số đông thành sự thật.** Arena đo mức phù hợp/chất lượng cảm nhận; đúng/sai cần nguồn và rubric.
5. **XP là hệ quả của học thật.** View/click/like/share thuần túy không tạo tiến bộ cốt lõi.
6. **Forever không phải đích cuối.** `Lv.N · Era` vô hạn theo White Paper `gon-level-v1`.
7. **Private by default.** Journey, footprint và proof chỉ công khai khi user chủ động chọn.
8. **Trend phục vụ học tập.** Không tối ưu cho nghiện lướt, phẫn nộ hoặc clickbait.
9. **AI phải để lại dấu vết kiểm chứng được.** Nguồn, trạng thái draft/review, version và lý do gợi ý phải nhìn thấy ở mức phù hợp.
10. **Không hứa hẹn tài chính/danh tiếng.** Creator có cơ hội được khám phá nhờ giá trị học thật; GON không hứa làm giàu hay thành KOL sau một đêm.

## 4. Người dùng và phạm vi thị trường đề xuất

Chi tiết nằm tại [`PERSONAS-JTBD-AND-LEARNING-MODES.md`](PERSONAS-JTBD-AND-LEARNING-MODES.md).

### 4.1 Nhóm chính của Private Alpha

- Người trưởng thành tự học và người đi làm cần học nhanh một chủ đề mới.
- Creator/educator muốn biến input thành nội dung, game hoặc thử thách học.
- Người học chuyên sâu cần nguồn, phản biện và lộ trình mastery.
- Community Hero muốn biến kiến thức thành hành động thật có bằng chứng.

Cùng một tài khoản có thể đổi **Learning Mode** theo phiên: Deep Mastery, Apply at Work, Create/Publish, Fast & Entertaining, Prove & Impact.

### 4.2 Thị trường/ngôn ngữ đề xuất

- **Private Alpha:** Việt Nam, giao diện và nội dung ưu tiên tiếng Việt.
- Nội dung nguồn tiếng Anh được phép dùng khi có citation và phần tóm tắt/giải thích phù hợp ngôn ngữ user chọn.
- Kiến trúc nội dung phải lưu `language/locale` để mở English UX ở giai đoạn sau mà không viết lại module graph.

Phạm vi thị trường/ngôn ngữ này đã được PO duyệt tại P01; nó không phải tuyên bố đã nghiên cứu thị trường định lượng.

## 5. Hành trình sản phẩm cốt lõi

| Bước | Người dùng làm gì? | Hệ thống phải tạo ra gì? | Điều kiện hoàn thành |
|---:|---|---|---|
| 1 | Đăng nhập Google, xác nhận 18+, đọc consent | Tài khoản, hồ sơ tối thiểu, lựa chọn privacy/personalization | User hiểu GON dành cho 18+ và dữ liệu nào được lưu |
| 2 | Nhập text/file/ảnh/link/video, chọn mục tiêu và Learning Mode | Learning Project + Source Artifacts có hash/provenance/trạng thái xử lý | Input không bị mất; phần chưa trích xuất được được báo rõ |
| 3 | Xem kết quả search hoặc Brew | Module sẵn có, kết quả liên quan hoặc job Brew có tiến độ | Không kết thúc bằng trang rỗng |
| 4 | Khám phá Output Candidates | Tối đa 10+ hướng khi chủ đề đủ rộng, có format/thời lượng/độ khó/lý do gợi ý | Các hướng khác nhau thật, không phải 10 tiêu đề thay chữ |
| 5 | So sánh trong Arena khi cần | Vote trái/phải/hòa/cả hai chưa tốt/merge; personal ranking cập nhật có giải thích | Vote gắn đúng output version và không bị tính trùng |
| 6 | Fork output đã chọn | Journey Branch private có upstream, version, goal và attribution | User sở hữu không gian phát triển riêng |
| 7 | Học qua quest/module/game/task | Concept, retrieval, transfer, artifact, feedback và mastery state | Tiến bộ dựa trên trả lời/sản phẩm, không dựa trên click hoàn thành |
| 8 | Nộp Boss Proof | Proof record có rubric và cấp xác minh trung thực | Đạt rubric mới mở thành tích/XP trọng yếu |
| 9 | Xem tiến bộ | Lifetime XP, `Lv.N · Era`, mastery theo topic, timeline và next outputs | Luôn có level tiếp theo; level không bị hiểu thành chứng chỉ chuyên môn |
| 10 | Tiếp tục hoặc chia sẻ có kiểm soát | Related outputs, branch mới hoặc Success Path nếu user opt-in ở giai đoạn sau | Không công khai dữ liệu riêng tư theo mặc định |

## 6. Phạm vi Private Alpha

### 6.1 Trong phạm vi

#### Tài khoản và an toàn truy cập

- Google sign-in.
- Tự xác nhận 18+ và lưu bằng chứng consent tối thiểu theo policy được P03/P05 chốt.
- Hồ sơ hiển thị tối thiểu; credential tự khai không được gắn nhãn đã xác minh.
- Quyền xem, xuất và xóa dữ liệu cá nhân theo khả năng của alpha; quy trình thủ công phải được công bố nếu chưa tự động hoàn toàn.

#### Universal Input và Learning Project

- Text tự do.
- URL website, YouTube và Facebook dưới dạng link artifact.
- File/ảnh được tải lên trong giới hạn loại/dung lượng do P03 chốt.
- Mỗi artifact có owner, loại, nguồn, hash, thời gian, quyền riêng tư, trạng thái trích xuất và thông điệp lỗi dễ hiểu.
- User chọn mục tiêu, Learning Mode, thời lượng mong muốn và mức độ sâu.

Mức xử lý tự động trong Private Alpha phải minh bạch theo loại. Nếu chưa OCR/transcript/đọc được một artifact, hệ thống vẫn lưu artifact và nói rõ phần nào đã dùng để search/Brew.

#### Search và Brew

- Hybrid search: full-text + Gemini vector embedding 768D + specificity guard.
- Trạng thái kết quả: `found`, `related`, `missing`, `needs_clarification`, `blocked_by_policy`.
- Brew bất đồng bộ khi thiếu kết quả hoặc user muốn biến thể riêng.
- Module Brew tối thiểu: learning brief, 3–5 concept lõi có nguồn, diagnostic/retrieval, quest tăng dần, flashcards/reorder hoặc tương đương, transfer task, Boss Proof và related outputs.
- Job có tiến độ, lỗi có thể hiểu, retry an toàn và không tạo module trùng khi retry.
- Module AI mới ở trạng thái draft/private và có nhãn nguồn/grounding.

#### Output Candidates, Arena và chọn hướng

- Mục tiêu hiển thị 10+ output khi chủ đề đủ rộng; nếu không đủ dữ liệu/độ đa dạng, hiển thị ít hơn và giải thích thay vì bịa output trùng lặp.
- Output được gom theo hướng như For You, Deep, Fast, Apply/Create, Prove/Impact và Trending-in-GON khi có tín hiệu thật.
- Mỗi card có artifact cuối, format, thời lượng, độ khó, prerequisite, source status và lý do gợi ý.
- Blind Arena cho hai output: trái/phải/hòa/cả hai chưa tốt/merge.
- Vote cập nhật personal ranking. Public leaderboard chỉ xuất hiện khi đủ mẫu và qua các gate chống thao túng.

#### Journey Fork và học tập

- Fork output/module thành branch private có upstream/version/attribution.
- Branch Commit chỉ ghi bước có ý nghĩa: câu trả lời kiểm chứng, artifact, phản tư quan trọng hoặc proof.
- Web learning player cho module; trạng thái mastery theo concept: Exposed → Recall → Apply → Create → Teach.
- Retrieval trước đáp án, transfer sang tình huống mới và Boss Proof cuối module.
- XP Ledger phía server, Lifelong Level và lịch sử điều chỉnh có audit.
- Proof Vault nhận proof hệ thống, link, ảnh và file chứng chỉ; hiển thị cấp Self-declared/Source-linked/System-recorded trong alpha. Issuer-verified/Anchored chỉ bật khi có verifier thật.

#### Cá nhân hóa và trend nội bộ

- Learning Mode do user chọn trong phiên.
- Footprint trong GON sau consent: mục tiêu, lựa chọn, vote, completion, mastery, Fork, artifact và “không quan tâm”.
- Ranking có giải thích ngắn và điều khiển tắt cá nhân hóa.
- Trend alpha chỉ tính từ learner độc lập bắt đầu, Fork, hoàn thành, tạo artifact/proof trong GON; like/share là tín hiệu phụ hoặc chưa dùng.

#### Vận hành nội bộ tối thiểu

- Review queue cho nội dung bị báo cáo hoặc cần publish.
- Tắt/khóa module nguy hiểm, xử lý report và ghi audit.
- Theo dõi chi phí AI, tỷ lệ Brew lỗi, search quality và sự kiện học cốt lõi.

### 6.2 Ngoài phạm vi Private Alpha

- Public launch không giới hạn.
- Native mobile app.
- Token giao dịch, ví, mua bán, marketplace hoặc chia sẻ doanh thu.
- Hứa hẹn thu nhập, danh tiếng hay “KOL sau một đêm”.
- Scrape hoặc mua dữ liệu trend/footprint từ TikTok/Facebook/YouTube.
- Tự động gọi ảnh/link là chứng chỉ đã xác minh; tự động neo POAP/SBT.
- Public Success Path và social graph đầy đủ.
- Mọi topic đều sinh game GDevelop hoàn chỉnh ngay lập tức.
- Chẩn đoán y tế, tư vấn tài chính cá nhân hóa hoặc thay thế chuyên gia/issuer.
- Dùng dữ liệu user để huấn luyện mô hình nếu chưa có consent và quyết định riêng.

## 7. Functional Requirements

Mức ưu tiên dùng MoSCoW. Chi tiết story/backlog nằm ở tài liệu backlog; BDD tương ứng nằm ở tài liệu acceptance.

### 7.1 Identity, 18+ và consent

| ID | Requirement | Priority |
|---|---|---|
| REQ-ID-001 | User đăng nhập bằng Google trước khi tạo dữ liệu học cá nhân; phiên hết hạn không làm mất project đã lưu | Must |
| REQ-ID-002 | Trước lần dùng đầu, user xác nhận đủ 18+ và chấp nhận điều khoản/privacy của alpha; user không xác nhận không vào được trải nghiệm 18+ | Must |
| REQ-ID-003 | Hệ thống không gọi self-attestation là “đã xác minh giấy tờ”; mọi diễn đạt về tuổi/credential phải đúng mức kiểm chứng | Must |
| REQ-ID-004 | User xem và sửa hồ sơ hiển thị tối thiểu; học hàm/nghề nghiệp tự khai phải tách khỏi credential đã xác minh | Must |
| REQ-ID-005 | User có đường yêu cầu xuất/xóa dữ liệu; yêu cầu được ghi nhận và có trạng thái xử lý | Must |
| REQ-ID-006 | Một tài khoản có nhiều Learning Mode và đổi mode theo phiên mà không bị khóa vào một persona | Must |

### 7.2 Universal Input và Source Artifact

| ID | Requirement | Priority |
|---|---|---|
| REQ-INP-001 | User tạo Learning Project từ text và ít nhất một URL trong cùng composer | Must |
| REQ-INP-002 | User đính kèm file/ảnh trong giới hạn được công bố; file bị từ chối phải nêu lý do an toàn dễ hiểu | Must |
| REQ-INP-003 | YouTube/Facebook/website URL được lưu thành artifact có URL gốc, loại nguồn, thời gian và trạng thái truy xuất | Must |
| REQ-INP-004 | Mỗi artifact có owner, hash, provenance, privacy, extraction status và liên kết project | Must |
| REQ-INP-005 | Hệ thống phân biệt nội dung đã trích xuất, metadata-only và chưa xử lý; không suy diễn nội dung không đọc được | Must |
| REQ-INP-006 | User chọn goal, Learning Mode, depth và thời lượng; các lựa chọn này đi cùng search/Brew/ranking snapshot | Must |
| REQ-INP-007 | User sửa tiêu đề/mục tiêu project và xóa artifact của mình theo policy retention | Should |
| REQ-INP-008 | Hệ thống chặn URL/file nguy hiểm hoặc nội dung bị policy cấm và đưa đường thay thế an toàn khi phù hợp | Must |

### 7.3 Search, Brew và module

| ID | Requirement | Priority |
|---|---|---|
| REQ-SCH-001 | Search kết hợp full-text, vector 768D và specificity guard trên nội dung user có quyền xem | Must |
| REQ-SCH-002 | Kết quả được phân loại found/related/missing/needs-clarification/blocked; không hiển thị trang “không có kết quả” trống | Must |
| REQ-SCH-003 | Mỗi kết quả hiển thị lý do liên quan ở mức user hiểu được và trạng thái nguồn | Must |
| REQ-SCH-004 | Search không lộ module/journey/proof private của user khác | Must |
| REQ-BRW-001 | Khi missing/related chưa đủ, user được mời Brew hoặc làm rõ intent; Brew không tự chạy gây chi phí khi user chưa xác nhận ở alpha | Must |
| REQ-BRW-002 | Brew job có trạng thái queued/running/needs-input/failed/ready, tiến độ và thông báo hoàn tất | Must |
| REQ-BRW-003 | Retry/duplicate click không tạo hai module cho cùng một request hợp lệ | Must |
| REQ-BRW-004 | Module Brew có outcome, concept, citations, quest, retrieval, transfer, Boss Proof và related outputs theo Canonical Module Graph | Must |
| REQ-BRW-005 | Claim quan trọng phải có citation hoặc nhãn chưa kiểm chứng; nội dung nguy hiểm bị chặn trước publish | Must |
| REQ-BRW-006 | Module có version; sửa module không âm thầm thay đổi branch đã Fork từ version cũ | Must |
| REQ-BRW-007 | User báo lỗi nội dung/nguồn và yêu cầu Brew lại từ một phần của module | Should |

### 7.4 Output Candidates, Arena và ranking

| ID | Requirement | Priority |
|---|---|---|
| REQ-OUT-001 | Khi chủ đề đủ rộng, hệ thống đưa tối thiểu 10 Output Candidates khác nhau về mục tiêu, format, độ sâu hoặc hành động | Must |
| REQ-OUT-002 | Candidate trùng ngữ nghĩa bị gom/loại; nếu không đủ 10 hướng chất lượng, hệ thống hiển thị ít hơn và nói rõ | Must |
| REQ-OUT-003 | Mỗi card có promise, artifact cuối, format, thời lượng, độ khó, prerequisites, source status và lý do gợi ý | Must |
| REQ-OUT-004 | User học ngay, lưu, ẩn/không quan tâm, báo cáo, đưa vào Arena hoặc Fork một candidate | Must |
| REQ-OUT-005 | Đổi Learning Mode làm thứ hạng thay đổi theo cách giải thích được trên cùng input | Must |
| REQ-ARN-001 | Blind Arena ẩn model/agent/creator cho tới sau vote; vị trí trái/phải được xáo trộn | Must |
| REQ-ARN-002 | Vote gồm left/right/tie/both-bad/merge và gắn user, input, output versions, thời gian và ngữ cảnh mode | Must |
| REQ-ARN-003 | Gửi vote hai lần cho cùng một match không tạo hai bản ghi hợp lệ | Must |
| REQ-ARN-004 | Sau vote, user thấy personal ranking thay đổi thế nào và có thể Fork bên thắng hoặc bản merge | Must |
| REQ-RNK-001 | Ranking snapshot lưu tín hiệu chính và lý do hiển thị; tắt personalization thì không dùng footprint | Must |
| REQ-RNK-002 | Public pairwise leaderboard chỉ hiển thị khi đủ số trận và có khoảng tin cậy; alpha có thể giữ ở mức internal/personal | Should |
| REQ-RNK-003 | Trend nội bộ ưu tiên unique learners hoàn thành/Fork/proof hơn view/like/share | Should |

### 7.5 Journey Fork, learning và mastery

| ID | Requirement | Priority |
|---|---|---|
| REQ-JRN-001 | User Fork output/module thành branch private trong tối đa hai thao tác chính sau khi chọn output | Must |
| REQ-JRN-002 | Branch giữ upstream output/module version, creator attribution, goal và trạng thái privacy | Must |
| REQ-JRN-003 | Branch Commit ghi bước học có ý nghĩa kèm artifact/câu trả lời/proof; click thường không thành commit | Must |
| REQ-JRN-004 | User quay lại branch, xem mình đang ở đâu, concept nào chưa nắm và bước tiếp theo | Must |
| REQ-JRN-005 | Diff hai branch theo concept/artifact/proof và merge có xử lý mâu thuẫn nguồn | Could/phase sau |
| REQ-JRN-006 | Xóa branch/artifact private phải xử lý lineage công khai theo tombstone/retention policy | Must khi có publish |
| REQ-LRN-001 | Module player hỗ trợ concept, flashcards/retrieval, quest, quiz có giải thích và trạng thái hoàn thành | Must |
| REQ-LRN-002 | Người học phải retrieval/teach-back trước khi xem đáp án mẫu ở các điểm kiểm tra cốt lõi | Must |
| REQ-LRN-003 | Ít nhất một transfer task yêu cầu áp dụng sang tình huống mới, không sao chép ví dụ | Must |
| REQ-LRN-004 | Boss Proof có rubric nhìn thấy trước, yêu cầu artifact/quá trình và provenance | Must |
| REQ-LRN-005 | Mastery theo concept đi qua Exposed/Recall/Apply/Create/Teach dựa trên bằng chứng, không dựa trên thời gian xem đơn độc | Must |
| REQ-LRN-006 | Artifact công khai ở phase sau phải khai báo nguồn/AI/remix và phần thay đổi của tác giả | Must khi có publish |
| REQ-LRN-007 | Delayed review nhắc ôn sau giãn cách và cập nhật retention | Should |

### 7.6 XP, Lifelong Level và Proof

| ID | Requirement | Priority |
|---|---|---|
| REQ-XP-001 | XP chỉ được server ghi khi learning event đạt rule/rubric; client không tự cộng XP chính thức | Must |
| REQ-XP-002 | Mỗi XP entry có source event, rule/formula version, idempotency, trạng thái và đường reversal có audit | Must |
| REQ-XP-003 | Numeric Level luôn bằng `floor(LifetimeXP/100)`; 0, 1.250, 3.500, 9.999 XP lần lượt là Lv.0 Zero, Lv.12 Hero, Lv.35 Forever, Lv.99 Forever | Must |
| REQ-XP-004 | Mọi mức XP đều có `Lv.N+1`; không tồn tại max/final level | Must |
| REQ-XP-005 | View/like/share/Fork rỗng/vote vòng lặp không tạo XP cốt lõi | Must |
| REQ-XP-006 | Global Level được hiển thị tách khỏi Topic Mastery và Proof Verification Level | Must |
| REQ-PRF-001 | Proof Vault lưu system proof và evidence user gắn: link, ảnh, file, POAP/social reference khi có | Must |
| REQ-PRF-002 | Mỗi proof hiển thị một cấp: Self-declared, Source-linked, System-recorded, Issuer-verified, Anchored | Must |
| REQ-PRF-003 | Ảnh/link không tự nâng thành Issuer-verified; nâng cấp cần verifier và audit trail | Must |
| REQ-PRF-004 | Proof private theo mặc định; user chọn từng proof để chia sẻ ở phase có public profile | Must |
| REQ-PRF-005 | Proof sai có đường sửa, thu hồi và khiếu nại | Should |

### 7.7 Footprint, creator và nội dung công khai

| ID | Requirement | Priority |
|---|---|---|
| REQ-PRV-001 | Footprint chỉ dùng tín hiệu đã công bố và được đồng ý cho personalization | Must |
| REQ-PRV-002 | Personalization Center cho user xem nhóm tín hiệu, sửa preference, tắt personalization và yêu cầu xóa footprint | Must |
| REQ-PRV-003 | Tắt personalization không chặn quyền học nội dung lõi | Must |
| REQ-PRV-004 | Không dùng thuộc tính nhạy cảm suy luận để ranking khi chưa có cơ sở hợp lệ và phê duyệt riêng | Must |
| REQ-CRT-001 | Mọi module/output có creator/source attribution và lineage khi được Fork/cải tiến | Must |
| REQ-CRT-002 | Creator Score nội bộ ưu tiên downstream completion/mastery/proof hơn like/share | Should |
| REQ-CRT-003 | Publish/Success Path công khai là opt-in, qua moderation và hiển thị giới hạn/bối cảnh của hành trình | Phase sau |
| REQ-CRT-004 | Chưa có reward tiền/token/marketplace trong Private Alpha | Won't for Alpha |

### 7.8 Đa định dạng và GDevelop

| ID | Requirement | Priority |
|---|---|---|
| REQ-RND-001 | Web là renderer bắt buộc của Canonical Module Graph trong Private Alpha | Must |
| REQ-RND-002 | Cùng graph có thể xuất infographic brief, image sequence brief, video script/storyboard và task checklist | Should |
| REQ-GDV-001 | Một template GDevelop/Slice game có kiểm thử được dùng để chứng minh Module Graph → playable learning game sau vòng web lõi | Should |
| REQ-GDV-002 | Game event không tự tạo XP/proof chính thức nếu chưa được server xác thực và chống trùng | Must khi có game |
| REQ-GDV-003 | Mọi game có outcome, hướng dẫn, nguồn và đường học web/text tương đương | Must khi có game |

### 7.9 Safety, moderation và vận hành

| ID | Requirement | Priority |
|---|---|---|
| REQ-SAF-001 | Input/output nguy hiểm, bất hợp pháp hoặc sai lệch nghiêm trọng bị chặn/giảm phân phối theo policy trước publish/trend | Must |
| REQ-SAF-002 | User báo cáo nội dung, nguồn, proof hoặc hành vi gian lận; report có trạng thái xử lý | Must |
| REQ-SAF-003 | Reviewer có queue để ẩn/khóa, yêu cầu sửa, phê duyệt publish và ghi lý do audit | Must |
| REQ-SAF-004 | Nội dung y tế/tài chính/rủi ro cao có disclaimer và đường dẫn nguồn/chuyên gia phù hợp; AI không chẩn đoán | Must |
| REQ-OPS-001 | Hệ thống đo được search outcome, Brew latency/cost/failure, learning funnel và XP reversals mà không ghi raw private content vào analytics mặc định | Must |
| REQ-OPS-002 | PO/operator có kill switch cho Brew/publish/trend khi có sự cố chi phí hoặc safety | Must |
| REQ-OPS-003 | Mọi thay đổi rule XP/ranking/module version được truy vết để tái lập quyết định | Must |

## 8. Yêu cầu chất lượng cấp sản phẩm

Các ngưỡng kỹ thuật chi tiết sẽ được P03/P05 chốt, nhưng P01 khóa kỳ vọng sau:

- **Tính đúng đắn:** claim trọng yếu có nguồn hoặc nhãn chưa kiểm chứng; search có bộ eval gán nhãn trước public alpha.
- **Tính minh bạch:** user biết nội dung là AI draft, đã review hay do creator tạo; biết vì sao output được gợi ý và proof ở cấp nào.
- **Quyền riêng tư:** private by default, data minimization, consent theo mục đích và không bán footprint.
- **Khả tiếp cận:** UX P02 hướng tới WCAG 2.2 AA cho các flow lõi; game luôn có đường tương đương không bắt buộc chơi.
- **Hiệu năng cảm nhận:** search phải có phản hồi tiến độ; Brew bất đồng bộ không khóa toàn bộ phiên học.
- **Chi phí:** mỗi Brew có quota/budget guardrail; user không bị bất ngờ bởi job AI đắt tiền tự chạy.
- **Độ tin cậy:** retry không nhân đôi module/XP/vote; trạng thái job và branch khôi phục được sau reload.
- **Ngôn ngữ:** tiếng Việt tự nhiên là mặc định đề xuất cho alpha; thuật ngữ chuyên môn có giải thích.

## 9. Mô hình niềm tin và mức xác minh

| Đối tượng | Điều GON được nói | Điều GON không được nói khi chưa đủ bằng chứng |
|---|---|---|
| Tuổi 18+ | “User đã tự xác nhận” trong alpha | “Đã xác minh giấy tờ” |
| Module AI | “AI draft”, “đã qua grounding check” hoặc “đã review” theo trạng thái thật | “Chính xác tuyệt đối” |
| Arena winner | “Được user/nhóm user ưu tiên hơn” | “Đúng khoa học nhất” |
| Global Level | “Tích lũy Lifetime XP hợp lệ” | “Chuyên gia mọi lĩnh vực” |
| Proof ảnh/link | “Đã gắn nguồn” | “Issuer đã xác minh” |
| Creator đang trend | “Đang có nhiều learner hoàn thành/Fork trong GON” | “Sẽ giàu/nổi tiếng” |

## 10. Giả định P01

Các giả định này phải được kiểm chứng trong P02/P04 hoặc pilot:

1. Người dùng sẵn sàng bắt đầu từ input tự nhiên thay vì chọn khóa học có sẵn.
2. Việc có nhiều output giúp chọn hướng tốt hơn, nếu được gom cụm và giải thích tốt.
3. Brew module có nguồn đủ hữu ích để học ngay, dù cần nhãn draft và review theo mức rủi ro.
4. Retrieval/transfer/Boss Proof làm tăng học thật hơn việc chỉ đọc/xem.
5. Journey Fork dễ hiểu nếu dùng ngôn ngữ đời thường kèm lineage rõ, không yêu cầu user biết Git.
6. Lifelong Numeric Level tạo động lực dài hạn mà không biến thành farm XP nếu XP gắn rubric.
7. Người dùng chấp nhận footprint trong GON khi có kiểm soát và lợi ích cá nhân hóa nhìn thấy.

## 11. Phụ thuộc và ràng buộc

- Gate 0 đã khóa: FastChat patterns cho Arena, WSIC patterns cho Search/Brew/ADK, GDevelop monorepo/game direction và selective reuse.
- Google sign-in, Gemini embeddings/generation và Google ADK là hướng đã nêu; model/vendor triển khai chi tiết chốt ở P03.
- Nguồn nghiên cứu/media bên ngoài chỉ dùng qua phương thức/API được phép, tôn trọng bản quyền và điều khoản nền tảng.
- Mọi quyết định lưu dữ liệu thật, external social connection, public profile, token/reward ngoài XP hoặc production deployment cần phê duyệt riêng theo gate tương ứng.

## 12. Tiêu chí hoàn thành P01 đã đạt khi được phê duyệt

- [x] PRD này xác định MVP, non-goals và functional requirements có ID.
- [x] Personas/JTBD/Learning Modes được mô tả riêng.
- [x] Backlog có MoSCoW, stories và vertical slices.
- [x] Hành vi lõi có BDD kiểm chứng được.
- [x] Metrics/guardrails/risks và quyết định `D-P01-*` được ghi riêng.
- [x] Traceability nối `GON-Fxx` → `REQ-*` → story/BDD/gate.

## 13. Quyết định P01 đã được phê duyệt

Ngày 22/10/2026, Product Owner đã duyệt P01 và **toàn bộ mặc định `D-P01-01` đến `D-P01-14`** trong [`METRICS-RISKS-AND-OPEN-DECISIONS.md`](METRICS-RISKS-AND-OPEN-DECISIONS.md), đồng thời cho phép bắt đầu P02. Thay đổi các quyết định này sau P01 phải được ghi thành amendment hoặc ADR được duyệt.
