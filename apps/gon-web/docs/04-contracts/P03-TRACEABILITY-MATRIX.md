# P03 Traceability Matrix

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md). Không thay đổi hợp đồng P03 đã chốt — nếu việc triển khai cần đụng contract thì đi qua quy trình thay đổi P03.

> **Artifact:** P03-TRACE<br>
> **Trạng thái:** **APPROVED — Product Owner đã duyệt P03 ngày 22/10/2026**<br>
> **Ngày lập:** 22/10/2026<br>
> **Nguồn đã duyệt:** P01 commit `9a09fa2`, P02 commit `33c2641`<br>
> **Ý nghĩa của “Contracted”:** API/entity/schema/state đã được mô tả đủ để P04 triển khai; **không** có nghĩa production code đã tồn tại.
>
> Chuỗi truy vết: `GON-Fxx → REQ-* → US-* → BDD-* → SCR/Flow → API operation → entity/schema/event → slice P04 → evidence P05`.

## 1. Quy ước trạng thái

| Trạng thái P03 | Nghĩa |
|---|---|
| `Contracted — VS1` | Đã có operation/entity/state cho lát cắt đầu tiên của P04 |
| `Contracted — VS2` | Đã có operation/entity/state cho output/ranking/Arena, xây sau khi vòng lõi VS1 đạt |
| `Contracted extension — VS3/VS4/VS5` | Đã khóa ranh giới và điểm mở rộng; chưa được phép hứa trong giao diện VS1 nếu chưa bật |
| `Partial` | Một phần được contract ngay; phần còn lại được ghi rõ là additive work của lát cắt sau |
| `Policy / no public API` | Quy tắc được thực thi bằng state, review, copy hoặc việc cố ý không có endpoint |
| `Later / excluded` | Ngoài Private Alpha; giữ ID để không mất lịch sử yêu cầu |

OpenAPI operation là nguồn định danh chuẩn. Các đường dẫn HTTP trong ma trận được hiểu dưới base `/v1`; chi tiết nằm tại [`openapi.json`](openapi.json) và [`API-CONTRACT.md`](API-CONTRACT.md).

## 2. Truy vết theo tính năng Gate 0

| Gate 0 feature | REQ / US / BDD | Screen & flow chính | Contract cốt lõi P03 | Slice / bằng chứng tiếp theo |
|---|---|---|---|---|
| GON-F01 — 18+, Google, consent | REQ-ID-001…006; US-101…105; BDD-01, BDD-17 | SCR-01, SCR-12, SCR-17; F01, F11, F14 | `getBootstrap`, `createAgeAttestation`, consent operations; `UserAccount`, `AgeAttestation`, `ConsentDecision`, Auth.js database session | VS1; P05 kiểm chứng session/deep-link và copy không gọi self-attestation là xác minh giấy tờ |
| GON-F02 — Universal Input | REQ-INP-001…008; US-201…205; BDD-02, BDD-03 | SCR-02, SCR-13; F02 | Project/artifact/upload operations; `LearningProject`, `SourceArtifact`, `ArtifactExtraction`, `ContentChunk` | VS1; S-P03-02 và kiểm chứng SSRF/file safety ở P04/P05 |
| GON-F03 — Semantic Search 768D | REQ-SCH-001…004; US-301; BDD-04…06, BDD-17 | SCR-03; F03, F04 | `createSearchAttempt`, `getSearchAttempt`; embedding profile `gon-semantic-v1`, `vector(768)`, `search-policy-v0` | VS1; S-P03-01 và labeled eval VI/EN trước release |
| GON-F04 — Brew Your Topic | REQ-BRW-001…007; US-302…305; BDD-05…08, BDD-18, BDD-22 | SCR-03, SCR-04, SCR-14; F04 | BrewJob operations; transactional outbox; ADK `GenerateModuleInput/Output`; module bắt đầu `draft_private` | VS1; S-P03-03, quota/cost evidence ở P05 |
| GON-F05 — Interactive module blocks | REQ-BRW-004…006, REQ-LRN-001; US-304, US-502; BDD-08, BDD-13 | SCR-08; F08 | [`canonical-module-graph.schema.json`](schemas/canonical-module-graph.schema.json), `ModuleVersion`, `JourneyPlayer` projection | VS1; contract validator và player accessibility tests |
| GON-F06 — Arena vote | REQ-ARN-001…004; US-403; BDD-11 | SCR-06; F06 | `createArenaMatch`, `getArenaMatch`, `castArenaVote`; unique `(matchId, voterUserId)` | VS2; blind/reveal và anti-duplicate tests |
| GON-F07 — Pairwise ranking | REQ-RNK-001…002; US-402, US-405; BDD-10…11 | SCR-05, SCR-06; F05, F06 | `createRankingSnapshot`; `RankingSnapshot`, explanation codes; public leaderboard không có endpoint trong Alpha | VS2 cho personal ranking; public pairwise vẫn bị gate theo số trận/khoảng tin cậy |
| GON-F08 — Multi-provider outputs | REQ-OUT-001…005, REQ-ARN-001; US-401…403; BDD-09…11 | SCR-05, SCR-06; F05, F06 | CandidateSet/OutputCandidate; provenance/provider lineage bị ẩn trước vote | VS2; provider/model cụ thể chọn bằng eval/cost ở P04 |
| GON-F09 — 10+ next outputs | REQ-OUT-001…005; US-401…404; BDD-09…10 | SCR-05; F05 | `getOutputExplorer`, `setCandidatePreference`; target count, actual count, shortfall reason codes | VS2; không bịa đủ 10 nếu hướng chất lượng không đủ |
| GON-F10 — Community/internal trend | REQ-RNK-003; US-801; BDD-19 | Chưa có màn public trong Alpha | `FootprintEvent`, `TrendSnapshot`, `trend_enabled` | VS5; chỉ dùng tín hiệu học thật và phải qua anti-manipulation review |
| GON-F11 — Personal footprint | REQ-PRV-001…004, REQ-RNK-001; US-103, US-402, US-404; BDD-10, BDD-17 | SCR-05, SCR-12; F05, F11 | Consent purpose riêng; `getPersonalization`, `updatePersonalization`, `deleteFootprint` | Controls ở VS1, ranking dùng ở VS2; P05 kiểm chứng tắt/xóa có hiệu lực thật |
| GON-F12 — Journey Fork | REQ-JRN-001…006; US-501, US-505…506; BDD-12, BDD-17 | SCR-07, SCR-08, SCR-10; F07, F08 | Journey operations; `JourneyBranch`, upstream snapshot, `BranchCommit`, ETag/version | Fork cơ bản ở VS1; diff/merge thuộc VS3 |
| GON-F13 — Lifelong XP/Level | REQ-XP-001…006; US-601…603; BDD-15 | SCR-08…10; F08, F09 | `getMyProgress`, `listMyXpLedger`; `XpLedgerEntry`, `gon-level-v1`, `floor(LifetimeXP/100)` | VS1; property tests cho 0/1.250/3.500/9.999 XP |
| GON-F14 — Proof Vault | REQ-PRF-001…005; US-604…605; BDD-14, BDD-16…17 | SCR-09, SCR-11; F09, F10 | Proof operations; 5 verification levels; `ProofVerificationEvent` append-only | VS1 cho ba cấp đầu; issuer/anchored cần verifier/policy riêng |
| GON-F15 — Creator attribution/path | REQ-CRT-001…004; US-802…805; BDD-12, BDD-18…19 | SCR-05, SCR-07; public path chưa có màn | Attribution snapshot + `AttributionEdge`; không có token/marketplace API | Attribution ở VS1; creator analytics VS5; public Success Path là phase riêng |
| GON-F16 — Assessment integrity | REQ-LRN-001…007; US-502…504; BDD-13…15 | SCR-08, SCR-09; F08, F09 | Attempt operations; rubric trong graph; ADK assess contract; mastery mapping; human-review path | VS1; P05 hiệu chuẩn AI assessment và chống farm |
| GON-F17 — Multi-format render | REQ-RND-001…002; US-701…702; BDD-20 | SCR-08 là renderer bắt buộc | Graph `renderTargets`, node `media_brief`, job type `render_module` | Web ở VS1; brief/export là Should và additive endpoint sau |
| GON-F18 — GDevelop game/export | REQ-GDV-001…003; US-703…704; BDD-20 | SCR-08 + web/text fallback | Game session/event operations; [`game-event.schema.json`](schemas/game-event.schema.json); template-first | VS4 sau S-P03-05; không có exporter tổng quát trong Alpha |
| GON-F19 — Async/realtime jobs | REQ-BRW-002…003, REQ-OPS-002; US-303, US-903; BDD-06…07, BDD-22 | SCR-03, SCR-04, SCR-14; F04, F14 | `AsyncJob`, `OutboxEvent`, `JobCommand`, polling trước, notification | VS1; queue vendor không phải nguồn sự thật |
| GON-F20 — Moderation/provenance | REQ-SAF-001…004, REQ-BRW-005…007; US-305, US-901…904; BDD-03, BDD-08, BDD-18, BDD-21 | SCR-15, SCR-16; F12, F13 | Report/review operations; `ModerationCase`, `ModerationAction`, audit events | VS1 tối thiểu; SLA/policy chi tiết chốt tại P05 |
| GON-F21 — Analytics/observability/AI eval | REQ-OPS-001…003; US-903; BDD-19, BDD-22 | Không có màn learner; review/ops surface giới hạn | Domain events, `AiRun`, quota, kill switches, redacted telemetry | Nền VS1; dashboard/eval/alert thuộc P05 |
| GON-F22 — CI/CD/deployment | Process requirement, không có product REQ riêng | Không áp dụng | ADR-0005…0007 nêu runtime đề xuất; contract không phải bằng chứng deployment | P06 chỉ khi PO Go-Live riêng |

## 3. Chỉ mục từng requirement

### 3.1 Identity, input và search

| REQ | Operation / cơ chế chính | Entity, schema hoặc state | Trạng thái P03 |
|---|---|---|---|
| REQ-ID-001 | Google sign-in qua Auth.js; `getBootstrap` khôi phục trạng thái/deep link | `UserAccount`, provider subject tách khỏi domain user ID, database session | Contracted — VS1; S-P03-04 |
| REQ-ID-002 | `createAgeAttestation`, `listConsents`, `setConsent` | `AgeAttestation`, `ConsentDecision`, terms/privacy versions | Contracted — VS1 |
| REQ-ID-003 | Bootstrap/profile/proof chỉ trả method và verification level đúng nguồn | `method=self_attested_18_plus`; không có trường “ID verified” giả | Contracted — VS1 |
| REQ-ID-004 | `getBootstrap`, `updateProfile` | `UserProfile`; self-declared headline tách khỏi `Proof` | Contracted — VS1 |
| REQ-ID-005 | `createDataRequest`, `getDataRequest` | `DataRequest` export/delete với receipt/status | Contracted — VS1 |
| REQ-ID-006 | Learning Mode nằm trên project/ranking snapshot, không khóa vào persona | `LearningProject.learningMode`, `RankingSnapshot.learningMode` | Contracted — VS1/VS2 |
| REQ-INP-001 | `createProject`, `addProjectArtifact` | Project + initial artifacts trong cùng workspace | Contracted — VS1 |
| REQ-INP-002 | `initiateArtifactUpload`, `completeArtifactUpload` | Signed upload, hash/size/MIME, artifact limits D-P03-12 | Contracted — VS1; S-P03-02 |
| REQ-INP-003 | `addProjectArtifact` cho website/YouTube/Facebook URL | `SourceArtifact.originUri`, kind, retrieval timestamp/status | Contracted — VS1 |
| REQ-INP-004 | `getArtifact`, `listProjectArtifacts`, `getProjectWorkspace` | Owner, hash, provenance, visibility, extraction/safety status | Contracted — VS1 |
| REQ-INP-005 | `retryArtifactProcessing`; workspace trả coverage | `ArtifactExtraction`, `ContentChunk`; full/partial/metadata-only/blocked/failed | Contracted — VS1 |
| REQ-INP-006 | `createProject`, `updateProject`; context truyền vào search/Brew/ranking | Goal, mode, depth, time budget snapshots | Contracted — VS1 |
| REQ-INP-007 | `updateProject`, `deleteProject`, `deleteArtifact` | Tombstone + retention workflow | Contracted — VS1 |
| REQ-INP-008 | Rejection problem response; fetch pipeline kiểm policy trước extraction | URL allow/deny rules, malware/content safety states | Contracted — VS1 |
| REQ-SCH-001 | `createSearchAttempt`, `getSearchAttempt` | PostgreSQL FTS/trigram + `pgvector vector(768)` + concept coverage | Contracted — VS1; S-P03-01 |
| REQ-SCH-002 | `getSearchAttempt`, `answerSearchClarification`, `createBrewJob` | Verdict found/related/missing/needs_clarification/blocked_by_policy | Contracted — VS1 |
| REQ-SCH-003 | `getSearchAttempt` | `SearchResult.reasonCodes`, matched/missing concepts, source status | Contracted — VS1 |
| REQ-SCH-004 | Authorization filter chạy trước ranking/limit | Owner/visibility trên module/chunk; negative authorization tests bắt buộc ở P04 | Contracted — VS1 |

### 3.2 Brew, outputs, Arena và ranking

| REQ | Operation / cơ chế chính | Entity, schema hoặc state | Trạng thái P03 |
|---|---|---|---|
| REQ-BRW-001 | `createBrewJob` yêu cầu `confirmed=true` sau verdict | `BrewJob`, quota reservation | Contracted — VS1 |
| REQ-BRW-002 | `getBrewJob`, `getJob`, `cancelBrewJob`, notifications | Job states/steps, `Notification` | Contracted — VS1 |
| REQ-BRW-003 | `retryBrewJob`; mọi create đều có `Idempotency-Key` | Input fingerprint + unique idempotency; retry không tạo hai module hợp lệ | Contracted — VS1 |
| REQ-BRW-004 | `getModuleVersion`; ADK generate output | `gon.module-graph/1.0`: outcomes, concepts, citations, quest, retrieval, transfer, Boss Proof | Contracted — VS1 |
| REQ-BRW-005 | Module chỉ `ready` sau schema/citation/safety gates | `quality.citationCoverage`, unverified claims, grounding/publication status | Contracted — VS1 |
| REQ-BRW-006 | `getModuleVersion`; Fork ghi đúng version đã chọn | `Module`, immutable `ModuleVersion`, content hash | Contracted — VS1 |
| REQ-BRW-007 | `createReport` cho lỗi nội dung/nguồn | `Report`, parent module version lineage | **Partial — Should:** report có ngay; node-level re-Brew là additive operation sau VS1 |
| REQ-OUT-001 | `getOutputExplorer` | `CandidateSet.targetCount=10`, output candidates phân cụm | Contracted — VS2; danh sách cơ bản có thể xuất hiện cuối VS1 |
| REQ-OUT-002 | Candidate dedupe trước ranking | Semantic fingerprint, `actualCount`, `shortfallReasonCodes` | Contracted — VS2 |
| REQ-OUT-003 | `getOutputExplorer` | Candidate card: promise, artifact outcome, format, time, difficulty, prerequisites/source/reason codes | Contracted — VS2 |
| REQ-OUT-004 | `setCandidatePreference`, `createArenaMatch`, `createJourney`, `createReport` | Saved/hidden/not-interested tách khỏi học/Fork | Contracted — VS2 |
| REQ-OUT-005 | `createRankingSnapshot` | Snapshot bất biến theo mode và algorithm version | Contracted — VS2 |
| REQ-ARN-001 | `createArenaMatch`, `getArenaMatch` | Blind slots; identity/provider/creator chỉ reveal sau vote | Contracted — VS2 |
| REQ-ARN-002 | `castArenaVote` | Choices left/right/tie/both-bad/merge; mode và candidate versions trong match context | Contracted — VS2 |
| REQ-ARN-003 | Idempotent vote + database uniqueness | Unique `(matchId, voterUserId)`; vote Alpha không sửa sau ghi | Contracted — VS2 |
| REQ-ARN-004 | Vote trả personal ranking explanation; merge đi qua candidate/job trước Fork | `ArenaVoteResult`, merged candidate/job references | Contracted — VS2 |
| REQ-RNK-001 | `getOutputExplorer`, `createRankingSnapshot` | `ranking-rules-v1`, signal groups, personalization flag tại thời điểm snapshot | Contracted — VS2 |
| REQ-RNK-002 | Cố ý không có public leaderboard endpoint trong Alpha | Nội bộ phải lưu match count/confidence trước khi xem xét hiển thị | **Policy / no public API — Should gate** |
| REQ-RNK-003 | Không có learner-facing trend endpoint trong VS1/VS2 | `TrendSnapshot` ưu tiên unique learners/completion/Fork/proof | Contracted extension — VS5 |

### 3.3 Journey, học tập, XP và Proof

| REQ | Operation / cơ chế chính | Entity, schema hoặc state | Trạng thái P03 |
|---|---|---|---|
| REQ-JRN-001 | `createJourney` từ candidate đã chọn | `ifExists=return_existing` để tránh branch trùng vô ý | Contracted — VS1 |
| REQ-JRN-002 | `getJourney` | Upstream module version, attribution, goal, visibility private | Contracted — VS1 |
| REQ-JRN-003 | `listJourneyCommits`; commit tạo bởi sự kiện học có ý nghĩa | `BranchCommit` nối attempt/artifact/proof; click thường chỉ là telemetry | Contracted — VS1 |
| REQ-JRN-004 | `listJourneys`, `getJourney`, `getJourneyPlayer` | Node states, mastery, next action projection | Contracted — VS1 |
| REQ-JRN-005 | Chưa có diff/merge endpoint | Branch snapshots cho phép thiết kế additive ở VS3 | Contracted extension — VS3; không hứa ở VS1 |
| REQ-JRN-006 | `deleteJourney` | Tombstone cho branch private; public lineage chỉ phát sinh ở phase publish sau | Contracted — VS1 cho phạm vi Alpha |
| REQ-LRN-001 | `getJourneyPlayer`, attempt create/update | Graph nodes concept/flashcards/retrieval/quiz/quest | Contracted — VS1 |
| REQ-LRN-002 | `submitAttempt`; sample answer khóa bởi server state | `revealPolicy=after_submit`, attempt/assessment states | Contracted — VS1 |
| REQ-LRN-003 | Transfer node + `submitAttempt` | Rubric bắt buộc bối cảnh mới | Contracted — VS1 |
| REQ-LRN-004 | Boss node + attempt artifact/disclosures | Rubric hiển thị trước; provenance và AI assistance disclosure | Contracted — VS1 |
| REQ-LRN-005 | `getJourneyPlayer`, `getMyProgress` | Mastery Exposed/Recall/Apply/Create/Teach theo bằng chứng attempt | Contracted — VS1 |
| REQ-LRN-006 | Attempt đã có source/AI disclosure; publish công khai bị tắt | Graph provenance + attempt disclosures | **Policy / later publish gate** |
| REQ-LRN-007 | XP rule có `xp.delayed_review_pass.v1`; graph hỗ trợ delayed-review bước tùy chọn | Chưa có schedule/reminder endpoint riêng | **Partial — VS3** |
| REQ-XP-001 | XP chỉ phát sinh trong transaction sau assessment đạt | Client/game không có endpoint cộng XP trực tiếp | Contracted — VS1 |
| REQ-XP-002 | `listMyXpLedger`; reviewer reversal qua review decision/audit path | `XpLedgerEntry` append-only, source, rule version, reversal entry | Contracted — VS1 |
| REQ-XP-003 | `getMyProgress` | `gon-level-v1`, numeric level, era, xpInLevel, xpToNextLevel | Contracted — VS1 |
| REQ-XP-004 | Cùng progress projection, không có hằng số max level | Luôn tồn tại `Lv.N+1` | Contracted — VS1 |
| REQ-XP-005 | XP rules chỉ nhận mốc học đã đạt rubric | View/like/share/empty Fork/vote loop không có XP rule | Contracted — VS1 |
| REQ-XP-006 | `getMyProgress` trả ba trục tách nhau | Lifelong Level / Topic Mastery / latest Proof verification | Contracted — VS1 |
| REQ-PRF-001 | `listProofs`, `createExternalProof`; Boss tạo system proof nội bộ | `Proof`, artifact links/external refs | Contracted — VS1 |
| REQ-PRF-002 | Proof responses luôn mang một `verificationLevel` | Self-declared/Source-linked/System-recorded/Issuer-verified/Anchored | Contracted — VS1 |
| REQ-PRF-003 | `requestProofVerification`; chỉ verifier mới tạo nâng cấp | `ProofVerificationEvent` audit trail; ảnh/link tự nó không nâng cấp | Contracted — VS1 policy; issuer integration sau |
| REQ-PRF-004 | `updateProof`, `deleteProof`; mặc định private | Không có public share endpoint trong Alpha | Contracted — VS1 |
| REQ-PRF-005 | `createReport` + review decisions cho revoke/reverse | Proof status/revocation và ModerationAction | Contracted — Should path qua Safety |

### 3.4 Privacy, creator, render, GDevelop, safety và operations

| REQ | Operation / cơ chế chính | Entity, schema hoặc state | Trạng thái P03 |
|---|---|---|---|
| REQ-PRV-001 | Consent purpose kiểm tra trước khi ghi/đọc footprint | `ConsentDecision`, `FootprintEvent.consentStatusAtEvent` | Contracted — VS1 |
| REQ-PRV-002 | `getPersonalization`, `updatePersonalization`, `deleteFootprint` | Signal groups đã dùng/chưa dùng; deletion là `DataRequest` | Contracted — VS1 |
| REQ-PRV-003 | Learning operations không phụ thuộc footprint consent | Ranking snapshot đánh dấu personalization off và dùng rules không cá nhân | Contracted — VS1/VS2 |
| REQ-PRV-004 | Ranking input allowlist; không có field sensitive inference | Cấm dùng thuộc tính nhạy cảm suy luận nếu chưa có phê duyệt riêng | Contracted — policy gate |
| REQ-CRT-001 | Candidate/module/journey responses giữ attribution | Graph provenance, journey upstream, `AttributionEdge` | Contracted — VS1 |
| REQ-CRT-002 | Chưa có creator score endpoint | Attribution/downstream learning events làm nền cho VS5 | Contracted extension — VS5 |
| REQ-CRT-003 | Không có publish/Success Path endpoint trong Alpha | Public visibility bị loại khỏi enum Alpha | Later phase |
| REQ-CRT-004 | Không có wallet/token/marketplace/payout operations | XP là learning ledger, không phải spendable balance | Won't for Alpha |
| REQ-RND-001 | `getJourneyPlayer` render cùng graph trên web | `renderTargets` bắt buộc chứa `web` trong JSON Schema | Contracted — VS1 |
| REQ-RND-002 | Graph có `media_brief` và job `render_module` | Infographic/image/video brief và checklist dùng cùng citations | **Partial — Should:** public render/export endpoint là additive sau VS1 |
| REQ-GDV-001 | `createGameSession` | Một/hai template cố định cấu hình từ Module Graph | Contracted extension — VS4; S-P03-05 |
| REQ-GDV-002 | `submitGameEvents`, `getGameSession` | Signed/sequenced/idempotent events; server mới công nhận learning effect | Contracted extension — VS4 |
| REQ-GDV-003 | Player luôn trả web/text equivalent | Graph accessibility text alternative + template outcome/sources | Contracted extension — VS4 |
| REQ-SAF-001 | State gates trước internal publish/trend; review decisions | Safety status, `internal_publish_enabled`, `trend_enabled` | Contracted — VS1 |
| REQ-SAF-002 | `createReport`, `getReport` | `Report` theo target/version/reason | Contracted — VS1 |
| REQ-SAF-003 | `listReviewQueue`, `getReviewCase`, `decideReviewCase` | `ModerationCase`, `ModerationAction`, audit log | Contracted — VS1 |
| REQ-SAF-004 | Graph validation/policy yêu cầu safety notices với chủ đề rủi ro | `module.safetyNotices`; nội dung disclaimer/chuyên gia chốt ở P05 | Contracted — VS1 policy |
| REQ-OPS-001 | `getJob` chỉ là bề mặt user; vận hành dùng events/metrics nội bộ | `DomainEvent`, `AiRun`, quota; telemetry mặc định không chứa raw private content | Contracted foundations — VS1/P05 |
| REQ-OPS-002 | `setFeatureFlag` cho operator có quyền | Brew/internal-publish/trend/game kill switches | Contracted — VS1 |
| REQ-OPS-003 | Immutable versions + audit trên đổi rule/flag/review | Rule versions, graph hashes, before/after hashes | Contracted — VS1 |

## 4. Phủ màn hình P02 bằng aggregate API

| Screen | Aggregate/operation nạp chính | Fixture/example P03 |
|---|---|---|
| SCR-01 — 18+ & Consent | `getBootstrap`, `createAgeAttestation`, consents | `fixtures.mock-api-responses.bootstrap` |
| SCR-02 — Universal Input | `createProject`, artifact operations, `getProjectWorkspace` | `fixtures.mock-api-responses.workspace` |
| SCR-03 — Search Verdict | `createSearchAttempt`, `getSearchAttempt`, workspace | `fixtures.mock-api-responses.workspace.latestSearch` |
| SCR-04 — Brew Studio | `createBrewJob`, `getBrewJob`, cancel/retry | Job example + workspace stepper |
| SCR-05 — Output Explorer | `getOutputExplorer`, ranking/preference | `fixtures.mock-api-responses.outputExplorer` |
| SCR-06 — Blind Arena | `createArenaMatch`, `getArenaMatch`, `castArenaVote` | `fixtures.mock-api-responses.arenaBlind` |
| SCR-07 — Branch Home | `createJourney`, `getJourney` | Journey aggregate trong `journeyPlayer` |
| SCR-08 — Module Player | `getJourneyPlayer`, attempts, game sessions ở VS4 | `fixtures.mock-api-responses.journeyPlayer`; module graph example |
| SCR-09 — Boss Proof | Attempt create/update/submit/get | Module graph Boss rubric + assess output example |
| SCR-10 — Journey & Lifelong Progress | `getMyProgress`, journeys, commits, XP ledger | `fixtures.mock-api-responses.progress` |
| SCR-11 — Proof Vault | Proof CRUD/verification request | Progress/proof fields; proof levels trong OpenAPI |
| SCR-12 — Personalization & Privacy | Personalization + consents + data requests | Bootstrap consent state |
| SCR-13 — Dự án của tôi | `listProjects`, project update/delete, journeys | Workspace project fixture |
| SCR-14 — Notifications | `listNotifications`, mark read, job status | Job/event contracts |
| SCR-15 — Report Status | `createReport`, `getReport` | Report schema trong OpenAPI |
| SCR-16 — Review Queue | Review queue/case/decision; feature flag | ReviewCase schema trong OpenAPI |
| SCR-17 — Account Settings | Bootstrap, profile, data requests | Bootstrap fixture |

Mapping component chi tiết `CMP-01…CMP-32` vẫn thuộc [`P02-TRACEABILITY-MATRIX.md`](../03-ux/P02-TRACEABILITY-MATRIX.md). P03 không đổi ID hoặc hành vi UX đã duyệt; client nhận trạng thái/quyền từ aggregate thay vì tự suy luận.

## 5. Phủ BDD-01…22

| BDD | Điểm contract kiểm chứng được ở P04 |
|---|---|
| BDD-01 — Cổng 18+ trung thực | Attestation method, terms/privacy versions, trạng thái onboarding trong bootstrap |
| BDD-02 — Input thành Source Artifact | Artifact tồn tại độc lập với kết quả extraction; lỗi không xóa input gốc |
| BDD-03 — Artifact nguy hiểm | Safety status + problem response; artifact bị chặn không vào embedding/Brew |
| BDD-04 — Search đủ sát | `found` cần hybrid signals + concept coverage, không chỉ một cosine score |
| BDD-05 — Search liên quan chưa đủ | `related` trả matched/missing concepts và lựa chọn Brew phần thiếu |
| BDD-06 — Không kết quả thì Brew | `missing` có next action, không có trạng thái kết quả trống vô hướng |
| BDD-07 — Brew retry không nhân đôi | Idempotency key, input fingerprint, quota reservation, job uniqueness |
| BDD-08 — Module có nguồn/tin cậy | Graph sources/citations/quality + grounding/publication gates |
| BDD-09 — 10+ outputs khác thật | Candidate clusters, semantic dedupe, actual/target counts |
| BDD-10 — Mode đổi ranking có giải thích | Ranking snapshots riêng theo mode, explanation codes, footprint off |
| BDD-11 — Arena vote/merge | Blind match, một vote hợp lệ, reveal sau vote, merge thành candidate mới |
| BDD-12 — Fork riêng tư có lineage | Journey snapshot upstream version + attribution, visibility private |
| BDD-13 — Retrieval/transfer trước mastery | Attempt states, reveal policy, rubric, mastery theo evidence |
| BDD-14 — Boss Proof/chống copy-paste | Provenance/disclosures, transfer context, assessment criteria; similarity không tự kết luận gian lận |
| BDD-15 — XP/Lifelong Level | Append-only ledger, formula không cap, reversal bằng entry đối ứng |
| BDD-16 — Proof không phóng đại | Verification levels + append-only verification events |
| BDD-17 — Privacy | Owner/visibility filters, consent, export/delete workflows |
| BDD-18 — AI không tự public | AI module `draft_private`; agent không có DB write/publish quyền |
| BDD-19 — Trend không bị tương tác rỗng | VS5 snapshot dựa trên completion/Fork/proof; trend tắt mặc định ở fixture Alpha |
| BDD-20 — GDevelop không bắt buộc | Web target bắt buộc; game có fallback và server-validated events |
| BDD-21 — Report/moderation | Report → case → audited decision; user theo dõi status |
| BDD-22 — Kill switch | Feature flags cho Brew/publish/trend/game với actor/reason/version |

## 6. Trả lời Q-P03-01…14

| Câu hỏi từ P02 | Quyết định/trả lời P03 | Artifact chuẩn |
|---|---|---|
| Q-P03-01 — Invite/auth/attestation và deep link | Google identity tách khỏi 18+ self-attestation; session database có thể thu hồi; bootstrap trả onboarding/next step để khôi phục deep link an toàn | Identity/Privacy §§1–2; API bootstrap; D-P03-04 |
| Q-P03-02 — Giới hạn artifact/extraction/rights | Mọi artifact có kind, rights basis, owner/hash, safety/extraction status và coverage; giới hạn mặc định thuộc D-P03-12 | Domain Model §4; State Machines §3; Stack §5 |
| Q-P03-03 — Search verdict ngoài vector | Hybrid lexical + vector 768D + concept coverage + specificity/quality guards; trả matched/missing concepts và reason codes | Search/Brew/ADK §§2–3; D-P03-07 |
| Q-P03-04 — Brew idempotency/retry/quota/steps | Durable job + outbox, fingerprint, quota reservation, step taxonomy, retry có giới hạn; người dùng xác nhận mới chạy | Events/Jobs §§4–5; State Machines §6; D-P03-06 |
| Q-P03-05 — Không đủ 10 candidates | Trả ít hơn kèm shortfall reasons thay vì nhân bản hướng trùng; dedupe theo semantic fingerprint/cluster | Search/Brew/ADK §4; D-P03-09 |
| Q-P03-06 — Ranking signals/consent/delete | Ranking rules theo nhóm tín hiệu được phép; footprint chỉ khi consent còn hiệu lực; tắt có hiệu lực cho snapshot mới, xóa đi qua DataRequest | Search/Brew/ADK §5; Identity/Privacy §§4–7 |
| Q-P03-07 — Arena pair/vote/brigade | Pair ẩn identity, vị trí server quyết, một vote hợp lệ mỗi user/match, vote bất biến ở Alpha; public rating bị gate theo dữ kiện | API Arena; State Machines §9; D-P03-09 |
| Q-P03-08 — Fork/version/commit/autosave | Branch giữ upstream version snapshot/attribution; attempts dùng version/ETag; commit chỉ từ mốc học có ý nghĩa | Domain Model §7; API Journey; D-P03-10 |
| Q-P03-09 — Rubric/AI disclosure/human review | Rubric nằm trong graph; attempt có source/AI disclosures; AI assess có confidence/criteria và đường `pending_human_review` | Module Graph §5; Search/Brew/ADK §8; State Machines §11 |
| Q-P03-10 — XP hợp lệ/số lượng/thu hồi | XP rules v1 gán số cho retrieval/transfer/Boss/teach-back/delayed review; first-pass uniqueness; reversal bằng ledger entry có audit | State Machines §12; D-P03-11 |
| Q-P03-11 — Proof storage/revocation/evidence | Năm cấp verification, append-only verification events, proof private mặc định, revocation qua status/review | Domain Model §7.5; State Machines §13 |
| Q-P03-12 — Game event nào là học thật | Chỉ event thuộc template, đúng session/sequence/idempotency và qua rule server mới tạo attempt/XP/proof | Events/Integrations §8; ADR-0008; D-P03-13 |
| Q-P03-13 — Moderation lifecycle/SLA/audit/appeal | Report → ModerationCase → structured decision, audit before/after; SLA số học là vận hành P05, trạng thái/appeal path đã có | API Review; State Machines §15 |
| Q-P03-14 — Error/offline/session/permission | RFC 9457-style problems với code/message key/retryable/next action; 401/403/404 che tài nguyên không có quyền; async dùng polling/job ID | API §§1.2, 1.5–1.6, 4–5 |

## 7. Truy vết D-P03 và ADR

| Quyết định trình duyệt | ADR / cơ chế thực thi | Cách kiểm chứng ở P04/P05 |
|---|---|---|
| D-P03-01 — HTTP JSON `/v1` + OpenAPI + aggregates | ADR-0005; OpenAPI 3.1 | Contract tests từ OpenAPI/fixtures; không để client truy cập DB trực tiếp |
| D-P03-02 — Next.js/TS monolith + Python ADK | ADR-0005 | Module boundaries, ADK schema tests, service auth |
| D-P03-03 — PostgreSQL + pgvector | ADR-0006 | S-P03-01; migration constraints và authorization tests |
| D-P03-04 — Google OIDC/Auth.js + domain consent | ADR-0007 | S-P03-04; session revoke/deep-link tests |
| D-P03-05 — Google Cloud-first | ADR-0007 | P06 chốt region/budget/backup; P03 không tự tạo cam kết chi phí |
| D-P03-06 — Durable jobs/outbox, ADK stateless | ADR-0005/0007; job/event schemas | Duplicate delivery, lease expiry, retry và agent DB-access tests |
| D-P03-07 — `search-policy-v0` seed | Search contract; ADR-0006 | Labeled eval bắt buộc trước khi gọi là production threshold |
| D-P03-08 — `gon.module-graph/1.0` bất biến | JSON Schema + content hash | Schema validator, cross-reference validator, version migration tests |
| D-P03-09 — Ranking giải thích được, ít hơn 10 khi cần | RankingSnapshot/Arena state machines | Snapshot fixtures theo mode; vote uniqueness/blind tests |
| D-P03-10 — Fork snapshot/attribution | Journey model | Upstream đổi version không làm branch cũ đổi nội dung |
| D-P03-11 — XP rules v1 | XP ledger + rubric IDs | Ledger uniqueness/reversal/level property tests |
| D-P03-12 — Limits/quota/retention mặc định | Identity/Privacy + Stack Evaluation | Quota/rate-limit tests; deletion receipts; P05 legal/privacy review |
| D-P03-13 — GDevelop template-first | ADR-0008 | S-P03-05; forged/duplicate game-event tests |
| D-P03-14 — Additive evolution, expand–migrate–contract | [Migration & Backward Compatibility](MIGRATION-AND-BACKWARD-COMPATIBILITY.md) + fixture contract tests | Backward-compatibility tests trong CI của P04 |

## 8. Những điểm cố ý chưa contract thành tính năng Alpha

| Mục | Lý do giữ ngoài/chưa mở | Điều kiện mở lại |
|---|---|---|
| Diff/merge Journey đầy đủ | Fork cơ bản còn phải chứng minh bằng người dùng thật | VS3 + quyết định PO dựa trên evidence VS1 |
| Public leaderboard/Success Path/social graph | Thiếu privacy, moderation, anti-fraud và legal gate cho public | Phase riêng sau VS5 |
| Trend từ TikTok/Facebook/YouTube bên ngoài | Điều khoản/API/chất lượng tín hiệu chưa Audit | Nguồn hợp pháp được Audit và PO duyệt |
| External research provider cụ thể | Chi phí/điều khoản/chất lượng chưa chốt | P04 evaluation có ngân sách rõ |
| Issuer-verified/Anchored ở quy mô | Chưa có verifier/issuer integration và policy | Từng loại proof được duyệt quy trình riêng |
| GDevelop exporter tổng quát/arbitrary code | Rủi ro format, bảo mật và chất lượng học | Sau VS4 template evidence; ADR mới |
| Token/tiền/marketplace | Ngoài scope Alpha và có rủi ro pháp lý/kỳ vọng tài chính | Quyết định độc lập ngoài P03 |
| ML recommender | Chưa có dữ liệu học thật đủ chất lượng | Sau baseline rules + learning-gain data |

## 9. Điểm vào kiểm chứng cho P04

P04 chỉ bắt đầu sau khi PO duyệt P03. Khi bắt đầu VS1, thứ tự bằng chứng tối thiểu là:

1. Sinh/kiểm tra client/server types từ `openapi.json` và chạy [`tests/validate_contracts.py`](tests/validate_contracts.py).
2. Viết migration/constraint tests cho owner/visibility, vote uniqueness, attempt uniqueness, XP source uniqueness và immutable module versions.
3. Chạy S-P03-01…04 trước khi khóa implementation search, upload, ADK và auth.
4. Dùng [`fixtures/mock-api-responses.json`](fixtures/mock-api-responses.json) để frontend không phụ thuộc backend chưa xong.
5. Mỗi BDD phải có acceptance test tương ứng; P03 trace không tự biến thành “implemented”.
6. Giữ nguyên cảnh báo còn mở từ P02: usability test với người dùng thật phải hoàn thành trước khi khóa production UI.
