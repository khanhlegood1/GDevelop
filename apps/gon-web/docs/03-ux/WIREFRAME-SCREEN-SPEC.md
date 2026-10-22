# P02 — Wireframe & Screen Specification

> **Trạng thái:** IN REVIEW tại P02<br>
> **Quy ước:** `SCR-*` là màn hình/bề mặt ổn định để truy vết. `CMP-*` là component UX, chưa phải tên class/code production. P03 phải map API/data vào các nhu cầu giao diện dưới đây.

## 1. Component inventory

| ID | Component UX | Trách nhiệm |
|---|---|---|
| `CMP-01` | AppShell | Header, global search, progress tóm tắt, account, role-aware nav |
| `CMP-02` | ProjectStepper | Bối cảnh project: Input → Tìm/Brew → Hướng học → Hành trình → Proof |
| `CMP-03` | AgeConsentCard | 18+ self-attestation + alpha terms |
| `CMP-04` | PersonalizationChoice | Bật/tắt footprint bằng ngôn ngữ dễ hiểu |
| `CMP-05` | UniversalComposer | Text/topic/input chính |
| `CMP-06` | LearningModePicker | Chọn một trong năm mode cho phiên |
| `CMP-07` | SourceArtifactList | Artifact và trạng thái extracted/partial/metadata/failed/blocked |
| `CMP-08` | ProcessingTimeline | Bước xử lý có chữ, thời gian chờ và khôi phục |
| `CMP-09` | SearchVerdictPanel | Found/Related/Missing/Clarify/Blocked + gaps |
| `CMP-10` | BrewConfirmation | Phạm vi, AI draft/private, quota placeholder, xác nhận |
| `CMP-11` | BrewProgress | Queue/pipeline/job recovery/failed/needs-input |
| `CMP-12` | RankingExplanation | “Vì sao thứ tự này?” và liên kết tắt personalization |
| `CMP-13` | OutputCard | Một hướng học, nguồn, artifact, save/hide/compare/Fork |
| `CMP-14` | OutputFilterBar | Mode, cluster, format, thời lượng, đã lưu/chưa học |
| `CMP-15` | CompareTray | 0/2, 1/2, 2/2 và mở Arena |
| `CMP-16` | BlindArenaPair | Hai output ẩn danh có thông tin công bằng |
| `CMP-17` | VoteBar | Left/Tie/Both bad/Merge/Right, chống double-submit |
| `CMP-18` | ForkConfirmation | Upstream/version/attribution/private và branch trùng |
| `CMP-19` | BranchHeader | Hành trình hiện tại, privacy, upstream, next step |
| `CMP-20` | ConceptBlock | Nội dung + citation/unverified label |
| `CMP-21` | RetrievalTask | Prompt, đáp án khóa, submit, feedback |
| `CMP-22` | TransferTask | Tình huống mới, Branch Commit |
| `CMP-23` | BossProofForm | Artifact, source/AI disclosure |
| `CMP-24` | RubricPanel | Rubric trước và kết quả theo từng tiêu chí |
| `CMP-25` | LifelongProgressSummary | Lifetime XP, numeric Level, Era, XP tới level tiếp theo |
| `CMP-26` | MasteryProgress | Exposed/Recall/Apply/Create/Teach theo concept/topic |
| `CMP-27` | JourneyTimeline | Input, Fork, Commits, assessments, proof |
| `CMP-28` | ProofCard | Artifact + verification explanation + link về journey |
| `CMP-29` | PersonalizationControls | Tắt ranking footprint, chủ đề không quan tâm, delete request |
| `CMP-30` | ReportDialog | Lý do, chi tiết, target version |
| `CMP-31` | SystemStateMessage | Empty/loading/error/offline/permission/removed |
| `CMP-32` | ReviewQueueItem | Risk, version, trạng thái và quyết định của reviewer |

## 2. Quy tắc bố cục chung

- Một màn hình chỉ có **một CTA chính có thứ hạng cao nhất** tại mỗi trạng thái.
- Nội dung quan trọng theo thứ tự: bối cảnh/privacy → quyết định của user → bằng chứng/nguồn → hành động phụ.
- Không đặt hành động phá hủy cạnh CTA chính.
- Trạng thái async không làm layout nhảy mạnh; dành sẵn vùng cho progress/ready/error.
- Desktop ưu tiên so sánh hai cột ở Arena/Output Explorer; mobile xếp một cột và giữ CTA trong tầm chạm.
- Focus sau chuyển màn đi tới heading của màn mới; sau khi dialog đóng, focus quay lại nút đã mở.

## 3. Đặc tả từng màn hình

### SCR-01 — 18+ & Consent

- **Mục đích:** xác nhận điều kiện vào Private Alpha và lựa chọn footprint trước đăng nhập.
- **Entry:** invite link, mở app chưa đăng nhập, deep link cần đăng nhập.
- **Layout Desktop:** bên trái là value proposition ngắn; bên phải là thẻ sáng chứa consent và Google CTA.
- **Layout Mobile:** value proposition rút gọn phía trên, consent card ngay sau; không carousel bắt buộc.
- **Components:** `CMP-03`, `CMP-04`, `CMP-31`.
- **CTA chính:** `Tiếp tục với Google`.
- **CTA phụ:** `Tôi chưa đủ 18 tuổi`.
- **Validation:** thiếu 18+ hoặc terms thì inline error tại form, không chỉ rung/disabled khó hiểu.
- **States:** initial, validation-error, under-18-blocked, auth-loading, auth-error, invited/expired invite.
- **Exit:** thành công tới `SCR-02` hoặc đích deep-link đã lưu.
- **P03 cần:** invite validity, attestation timestamp/version, terms version, footprint consent default/state.
- **Prototype:** đầy đủ.

### SCR-02 — Bắt đầu / Universal Input

- **Mục đích:** tạo Learning Project từ bất kỳ input nào trong phạm vi Alpha.
- **Entry:** sau login, brand click, “Input mới”, quay lại từ Search để sửa.
- **Layout:** composer là vùng lớn nhất; phía trên có privacy badge; phía dưới là “Tiếp tục gần nhất”/project gần đây khi có.
- **Components:** `CMP-01`, `CMP-02`, `CMP-05`, `CMP-06`, `CMP-07`, `CMP-31`.
- **Fields:** text/topic; thêm URL; thêm file/image; mục tiêu; thời gian khả dụng; Learning Mode; độ sâu tùy chọn.
- **CTA chính:** `Tìm hoặc Brew`.
- **Validation:** cần ít nhất text/topic hoặc một artifact có mô tả; URL sai định dạng được báo tại field; artifact lỗi không xóa text.
- **Artifact states:** queued, extracting, ready, partial, metadata-only, unsupported, failed, blocked, deleted.
- **Exit:** tạo project và tới `SCR-03`. Nếu mọi artifact blocked, dừng tại `CMP-31` có đường thay thế.
- **P03 cần:** project draft/idempotency, artifact metadata/hash/status, rights attestation, mode/goal/time context.
- **Prototype:** đầy đủ ở mức mock; file/image chỉ thêm artifact mẫu, không upload thật.

### SCR-03 — Search Verdict

- **Mục đích:** nói trung thực kho tri thức có gì, thiếu gì và bước tiếp theo.
- **Entry:** submit từ `SCR-02`, notification quay lại, project card.
- **Layout:** topic summary + processing timeline; verdict panel; kết quả liên quan; recommendation tiếp theo.
- **Components:** `CMP-02`, `CMP-08`, `CMP-09`, `CMP-31`.
- **CTA theo state:**
  - Found → `Xem hướng học`;
  - Related → `Học phần sẵn có` hoặc `Brew phần còn thiếu`;
  - Missing → `Brew Your Topic`;
  - Clarify → trả lời/chọn trọng tâm;
  - Blocked → sửa/thay input an toàn.
- **Không hiển thị:** raw vector score như tuyên bố chất lượng; nếu hiển thị mức khớp, phải kèm matched/missing concepts.
- **States:** searching, five verdicts, partial-sources, search-failed-recoverable, permission-denied.
- **P03 cần:** verdict enum, matched/missing concepts, result module/version/citation state, failure category.
- **Prototype:** chuyển được cả năm verdict để duyệt copy.

### SCR-04 — Brew Studio

- **Mục đích:** xác nhận và theo dõi tạo AI module draft riêng tư.
- **Entry:** từ `SCR-03` khi Missing/Related hoặc user yêu cầu biến thể.
- **Layout:** cùng workspace với Search; phần confirmation nổi bật nhưng không modal ép buộc.
- **Components:** `CMP-10`, `CMP-11`, `CMP-08`, `CMP-31`.
- **Trước khi chạy phải thấy:** chủ đề/phạm vi, nguồn sẽ dùng, `AI draft`, `Riêng tư`, quota/giới hạn nếu P03 chốt, thời gian ước lượng dạng khoảng hoặc “có thể rời đi”.
- **CTA chính:** `Bắt đầu Brew`.
- **Trong lúc chạy:** bước hiện tại có chữ, có thể rời màn hình, thông báo khi xong, không tạo job trùng khi bấm lại.
- **States:** confirmation, queued, processing step 1..n, needs-input, ready-private-draft, failed-retryable, failed-terminal, quota-exceeded, cancelled.
- **Exit:** ready → `SCR-05`; needs-input → bổ sung ngay tại chỗ; failed → giữ project/input.
- **P03 cần:** job ID/idempotency, step state, retryability, quota/cost fields, output draft visibility, source lineage.
- **Prototype:** progress năm bước mô phỏng, disable double-start trong phiên.

### SCR-05 — Output Explorer

- **Mục đích:** giúp user chọn một hướng học từ tối thiểu 10 khả năng đầu tiên phù hợp.
- **Entry:** Search Found/Related, Brew ready, Project card, quay lại từ Arena.
- **Layout Desktop:** explanation + controls phía trên; grid hai cột; Top 3 có viền/nhãn riêng nhưng vẫn cùng danh sách.
- **Layout Mobile:** controls thu gọn thành nhóm cuộn ngang/collapsible; card một cột.
- **Components:** `CMP-02`, `CMP-06`, `CMP-12`, `CMP-13`, `CMP-14`, `CMP-15`, `CMP-31`.
- **Mỗi OutputCard bắt buộc có:** title, summary, cluster, format, thời lượng, độ khó, điều kiện tiên quyết nếu có, artifact đầu ra, nguồn/citation status, ranking reason ở mức nhóm, `Đã học/Đã lưu` nếu đúng.
- **Hành động:** `Tạo hành trình của tôi`, `So sánh`, `Lưu`, `Không phù hợp`, overflow `Báo cáo`.
- **Ranking controls:** đổi Learning Mode; bật/tắt personalization; tùy chọn cân bằng Trend ↔ Depth, Speed ↔ Mastery, Novelty ↔ Familiarity chỉ xuất hiện nếu P03 chứng minh các slider có tác dụng thật.
- **States:** loading skeleton, ready, fewer-than-10-explained, all-hidden/filtered-empty, ranking-unavailable-fallback, stale-results.
- **Exit:** Fork sang `SCR-07` hoặc Arena `SCR-06`.
- **P03 cần:** candidate set/version, rank basis categories, diversity/cluster, trend basis, save/hide state, eligibility.
- **Prototype:** 10 card, năm mode cho top khác nhau, tắt personalization đổi cơ sở xếp hạng, filter/save/hide/compare.

### SCR-06 — Blind Arena

- **Mục đích:** so sánh công bằng khi user phân vân, đồng thời tạo preference signal có ngữ cảnh.
- **Entry:** chọn đúng hai card ở `SCR-05` hoặc nút dùng Top 2.
- **Layout Desktop:** A/B hai cột bằng nhau; VoteBar cố định cuối vùng nội dung.
- **Layout Mobile:** A trên, B dưới; VoteBar 2 cột; không yêu cầu vuốt để vote.
- **Components:** `CMP-16`, `CMP-17`, `CMP-12`, `CMP-31`.
- **Blind rule:** ẩn model/agent/creator và mọi popularity score; format/artifact/source state vẫn được hiện vì ảnh hưởng quyết định học.
- **Vote:** Left better, Tie, Both bad, Merge, Right better.
- **Sau vote:** reveal, khóa double vote, giải thích hệ quả, CTA Fork winner/merged hoặc quay lại.
- **States:** ready, submitting, recorded, duplicate/conflict, pair-no-longer-available.
- **P03 cần:** match ID, ẩn danh assignment, vote enum, edit window, anti-brigading signals.
- **Prototype:** đầy đủ five actions và reveal.

### SCR-07 — Tạo hành trình của tôi / Branch Home

- **Mục đích:** xác nhận Fork và đặt bối cảnh cho branch.
- **Entry:** CTA từ `SCR-05`/`SCR-06`, deep link journey.
- **Layout:** khi lần đầu Fork có confirmation panel; sau đó trở thành BranchHeader ở đầu Module Player.
- **Components:** `CMP-18`, `CMP-19`, `CMP-02`.
- **Phải thấy:** upstream module + version, creator attribution, nguồn/license nếu có, `Hành trình riêng tư`, ngày tạo, lần học gần nhất.
- **Branch trùng:** hỏi `Tiếp tục hành trình hiện có` hoặc `Tạo hành trình mới`.
- **CTA chính xác nhận:** `Tạo hành trình của tôi`.
- **P03 cần:** fork lineage, idempotent branch creation, existing branch lookup, attribution snapshot.
- **Prototype:** Branch Header có upstream/private/attribution; confirmation được rút gọn thành chuyển màn để duyệt flow nhanh.

### SCR-08 — Module Player

- **Mục đích:** học và chuyển từ tiếp xúc sang truy hồi/áp dụng.
- **Entry:** `SCR-07`, tiếp tục từ `SCR-10`, notification.
- **Layout:** BranchHeader; stepper Concept/Retrieval/Transfer/Boss; nội dung theo bước.
- **Components:** `CMP-19`, `CMP-20`, `CMP-21`, `CMP-22`, `CMP-26`, `CMP-30`, `CMP-31`.
- **Concept:** mỗi block có mục tiêu, nội dung chính, citation hoặc nhãn unverified; media có text alternative theo khả năng của format.
- **Retrieval:** prompt trước, đáp án mẫu khóa; submit mới mở feedback/tham chiếu.
- **Transfer:** nhiệm vụ tình huống mới; lưu Branch Commit thân thiện (“Bản thực hành 2”).
- **Điều hướng:** quay lại được; đi tiếp có thể bị gate theo rubric. Nếu bị khóa, lý do hiển thị ngay tại stepper.
- **States:** draft-saved, submitting, needs-revision, passed, content-hidden-pending-review, media-failed-with-text-fallback.
- **P03 cần:** canonical blocks, attempt state, rubric result, draft autosave/version, mastery events.
- **Prototype:** tab bốn bước, retrieval mock rubric, transfer mock và mở đáp án sau khi đạt.

### SCR-09 — Boss Proof

- **Mục đích:** tạo bằng chứng hoàn thành có rubric của branch.
- **Entry:** bước cuối `SCR-08`, trạng thái needs-revision, notification review.
- **Layout:** panel sáng để tăng đọc/gõ; RubricPanel luôn nhìn thấy hoặc sticky tóm tắt trên desktop.
- **Components:** `CMP-23`, `CMP-24`, `CMP-07`, `CMP-31`.
- **Fields:** artifact/title, mô tả quá trình, nguồn, AI/remix disclosure, core-value explanation, liên kết file/link nếu có.
- **CTA chính:** `Nộp Boss Proof`.
- **Kết quả:** từng rubric đạt/chưa đạt, verification cấp được cấp, mastery mới, XP/Level thay đổi do server xác nhận.
- **States:** ready, draft, submitting, passed, needs-revision, pending-human-review, rejected-with-appeal-path nếu policy có.
- **P03 cần:** rubric version, artifact provenance, assessment result, proof issuance, XP ledger event.
- **Prototype:** form + bốn rubric checks + thành công mock.

### SCR-10 — Journey & Lifelong Progress

- **Mục đích:** trả lời “tôi đang ở đâu, đã chứng minh gì, nên làm gì tiếp?”
- **Entry:** nav Hành trình, sau Boss Proof, Level chip.
- **Layout:** ba cụm tách biệt ở hàng đầu: Lifelong Level, Topic Mastery, Latest Proof. Dưới là JourneyTimeline và next-step recommendations.
- **Components:** `CMP-25`, `CMP-26`, `CMP-27`, `CMP-12`, `CMP-31`.
- **Level copy:** luôn là `Lv.N · Era`, tiến độ tới `Lv.N+1`, không max/100% hoàn thành.
- **Mastery:** theo topic/concept, không gộp thành một “điểm thông minh” toàn cục.
- **Next step:** tối đa ba gợi ý ưu tiên ở đầu; mỗi gợi ý có lý do và hành động `Không quan tâm`.
- **P03 cần:** lifetime XP read model, mastery graph, branch commits, proof links, recommendation explanations.
- **Prototype:** ba metric panel + timeline được cập nhật bởi các bước học mock.

### SCR-11 — Proof Vault

- **Mục đích:** quản lý bằng chứng và mức xác minh không gây hiểu lầm.
- **Entry:** nav Proof Vault, Latest Proof, Boss success.
- **Layout:** bộ lọc theo verification; ProofCard; hành động thêm proof ngoài.
- **Components:** `CMP-28`, `CMP-07`, `CMP-31`.
- **Mỗi card có:** artifact, ngày, journey liên kết, issuer/source nếu có, verification label + câu giải thích giới hạn, privacy.
- **Hành động:** xem artifact, liên kết/gỡ liên kết journey, thêm ghi chú, xóa theo policy, báo cáo gian lận nếu là proof được chia sẻ nội bộ.
- **Không có trong Alpha:** nút “chia sẻ công khai” hoặc “bán proof”.
- **P03 cần:** proof type, verification evidence, revocation, ownership, audit history.
- **Prototype:** Source-linked, Self-declared và System-recorded xuất hiện có điều kiện.

### SCR-12 — Personalization & Privacy Center

- **Mục đích:** cho user hiểu và kiểm soát footprint dùng cho ranking.
- **Entry:** Profile/Bạn, liên kết từ RankingExplanation.
- **Layout:** “Đang dùng”, “Không dùng mặc định”, “Quyền của bạn” theo ba vùng; các nguy hiểm/xóa ở cuối.
- **Components:** `CMP-04`, `CMP-29`, `CMP-31`.
- **Controls:** footprint ranking on/off; interest topics; not-interested list; download/export request nếu P05 hỗ trợ; delete footprint request; trạng thái xử lý.
- **Nguyên tắc:** không hiển thị raw event log khó hiểu như bằng chứng minh bạch; tóm tắt theo nhóm và thời gian.
- **P03 cần:** consent state, signal categories, retention/deletion workflow, audit receipt.
- **Prototype:** toggle đồng bộ với Output Explorer và delete mock.

### SCR-13 — Dự án của tôi

- **Mục đích:** tìm lại mọi Learning Project và next action.
- **Layout:** search/filter; project cards/list; trạng thái async nổi bật.
- **Components:** `CMP-01`, `CMP-02`, `CMP-07`, `CMP-31`.
- **Mỗi item:** title, artifact summary, state, updated time, privacy, một next-action CTA, overflow rename/delete.
- **Empty state:** giải thích project là gì và CTA tạo input đầu tiên.
- **Prototype:** chưa dựng section riêng; sidebar project summary chứng minh bối cảnh tối thiểu.

### SCR-14 — Notifications

- **Mục đích:** thông báo job/assessment/review thay vì ép user chờ.
- **Loại:** Brew ready/failed/needs-input; Boss passed/needs revision/pending review; report decision; upstream hidden/updated nếu ảnh hưởng.
- **Quy tắc:** mỗi thông báo deep-link đến đúng entity/version và trạng thái hiện tại; không dùng copy gây FOMO.
- **Prototype:** chưa dựng; toast nội bộ chỉ minh họa thông báo tức thời, không phải notification contract.

### SCR-15 — Report & Moderation Status

- **Mục đích:** cho reporter/creator biết report đang ở đâu mà không lộ dữ liệu không cần thiết.
- **Components:** `CMP-30`, `CMP-31`, timeline trạng thái.
- **States:** received, triaged, action-taken, no-action, escalated, closed.
- **Prototype:** ReportDialog từ `SCR-10`; trang status riêng chưa dựng.

### SCR-16 — Review Queue

- **Mục đích:** reviewer xử lý AI drafts và reports theo version.
- **Layout:** queue/list bên trái; chi tiết version, nguồn/citation và quyết định bên phải trên desktop.
- **Components:** `CMP-32`, `CMP-20`, `CMP-24`, `CMP-31`.
- **Actions:** approve internal, request changes, hide, escalate; mọi action yêu cầu lý do có cấu trúc.
- **Quyền:** role mới thấy route trong nav; server vẫn là nơi chặn quyền.
- **Prototype:** chưa dựng vì không thuộc flow learner VS1 được click chính.

### SCR-17 — Account Settings

- **Mục đích:** profile tối thiểu, ngôn ngữ VI/EN, đăng xuất, phiên và liên kết tới Privacy.
- **Không có:** public handle bắt buộc, follower count, token wallet.
- **Prototype:** avatar điều hướng tới khu vực progress/privacy; trang settings riêng chưa dựng.

## 4. Tương tác bắt buộc trên nhiều màn hình

### 4.1 Lưu nháp và rời đi

- Composer, Retrieval, Transfer và Boss Proof phải có trạng thái nháp rõ: `Chưa lưu`, `Đang lưu`, `Đã lưu lúc…`, `Không lưu được`.
- Rời màn khi còn thay đổi quan trọng phải không mất dữ liệu hoặc phải cảnh báo có thể truy cập bằng keyboard.

### 4.2 Hành động một lần

Vote, Fork, Brew start, Boss submit và delete request đều cần chống double-click ở UI và idempotency ở P03. Nút disable phải kèm nhãn trạng thái, ví dụ `Đã ghi nhận`, không chỉ mờ đi.

### 4.3 Nguồn và citation

- Citation mở được trong ngữ cảnh và cho biết nguồn hỗ trợ claim nào.
- Claim chưa kiểm chứng có badge chữ `Cần kiểm chứng`, không dùng cùng style với nguồn đã gắn.
- Metadata-only không được trình bày như transcript/nội dung đã đọc.

### 4.4 Báo cáo

Report nằm trong overflow của module/output/proof để tránh biến mọi màn thành nút cảnh báo, nhưng người dùng bàn phím phải tới được bằng cấu trúc nút/menu chuẩn. Prototype đặt nút Report dễ thấy cho mục đích review; production có thể đưa vào overflow theo spec này.

### 4.5 GDevelop/game surface trong VS4

Khi format là game, `SCR-08` phải vẫn giữ BranchHeader, mục tiêu học, rubric tóm tắt, nút thoát/lưu và fallback khi WebGL/game không chạy. Canvas không được nuốt toàn bộ điều hướng bàn phím; kết quả game chỉ thành mastery khi có event/rubric được P03 công nhận.
