# P03 — HTTP API Contract

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md). Không thay đổi hợp đồng P03 đã chốt — nếu việc triển khai cần đụng contract thì đi qua quy trình thay đổi P03.

> **Trạng thái:** APPROVED tại P03 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Contract máy đọc được:** [OpenAPI 3.1 `openapi.json`](openapi.json)<br>
> **Base path:** `/v1`

## 1. Nguyên tắc API

### 1.1 Resource + aggregate read model

API dùng resource chuẩn cho CRUD/command và một số aggregate endpoint đúng màn P02 để frontend không phải tự suy ra trạng thái:

- `GET /me/bootstrap` cho AppShell/onboarding.
- `GET /projects/{id}/workspace` cho Project Stepper/next action.
- `GET /projects/{id}/output-explorer` cho SCR-05.
- `GET /journeys/{id}/player` cho SCR-07/08.
- `GET /me/progress` cho SCR-10 và Level chip.

Aggregate vẫn trả ID của entity gốc để thao tác tiếp theo dùng resource API.

### 1.2 Xác thực, phiên và CSRF

- Browser dùng session cookie `HttpOnly`, `Secure`, `SameSite=Lax`, tiền tố `__Host-` ở production.
- Mọi mutation từ browser gửi header `X-CSRF-Token` do web app cùng origin cấp; server vẫn kiểm tra Origin và session phía server.
- API không nhận `ownerUserId`, `voterUserId`, `actorUserId` từ client cho thao tác của chính user; actor lấy từ session.
- Riêng `submitGameEvents` dùng header `X-GON-Game-Token` ngắn hạn, chỉ có phạm vi một GameSession; token này không thay user session cho bất kỳ API nào khác.
- Service-to-service dùng identity riêng và chữ ký/phạm vi hẹp; không dùng cookie user.
- Session hết hạn trả `401 AUTH_SESSION_EXPIRED` kèm `returnTo` an toàn; server không trả dữ liệu private trong error body.

### 1.3 Idempotency và concurrency

Header `Idempotency-Key` là bắt buộc cho các command tạo job, vote, Fork, submit attempt, tạo proof/data review và các POST có chi phí:

- Key thuộc phạm vi actor + operation.
- Gửi lại cùng key và cùng payload trả response gốc hoặc resource hiện tại.
- Cùng key nhưng payload khác trả `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
- Server giữ idempotency record tối thiểu 24 giờ; job còn sống lâu hơn vẫn truy được bằng job ID/fingerprint.

Entity sửa được có `version`. `PATCH` quan trọng dùng `If-Match: "<version>"`; lệch version trả `409 RESOURCE_VERSION_CONFLICT` và không ghi đè nháp mới hơn.

### 1.4 Pagination, sort và filter

- Danh sách dùng cursor: `?limit=20&cursor=...`; `limit` mặc định 20, tối đa 100.
- Response: `{ "data": [...], "page": { "nextCursor": "...", "hasMore": true } }`.
- Cursor là chuỗi mờ đã ký/mã hóa; client không tự tạo.
- Sort mặc định ổn định theo `createdAt desc, id desc` hoặc `updatedAt desc` tùy resource đã ghi trong OpenAPI.
- Filter chỉ dùng field đã công bố; filter không hợp lệ trả 400 thay vì âm thầm bỏ qua.

### 1.5 Async response

Command bất đồng bộ trả `202 Accepted` với resource có thể poll được theo schema của từng operation. Với job dùng chung, resource tối thiểu có dạng:

```json
{
  "data": {
    "id": "job_01...",
    "jobType": "brew_module",
    "status": "queued",
    "currentStep": "validate_request",
    "createdAt": "2026-10-22T00:00:00Z",
    "completedAt": null,
    "failureCode": null,
    "retryable": false
  }
}
```

Client poll `GET /v1/jobs/{id}` hoặc endpoint chuyên biệt của resource (ví dụ BrewJob/SearchAttempt/Attempt) như OpenAPI quy định. Nếu command là bản sao idempotent của job/resource đang chạy hoặc đã xong, API trả `200` với cùng job/result thay vì tạo việc mới; các operation bất đồng bộ trong OpenAPI đều khai báo rõ trường hợp replay này.

### 1.6 Envelope và lỗi

Response thành công dùng `data` (và `page` nếu danh sách). Lỗi dùng Problem Details mở rộng:

```json
{
  "type": "https://gon.org/problems/quota-exceeded",
  "title": "Brew quota exceeded",
  "status": 429,
  "code": "BREW_QUOTA_EXCEEDED",
  "detail": "Bạn đã dùng hết lượt Brew của giai đoạn thử nghiệm hôm nay.",
  "requestId": "req_01...",
  "retryable": false,
  "nextAction": "wait_for_quota_reset",
  "issues": []
}
```

`title/detail` trong ví dụ chỉ để minh họa. Production API trả `code`, `messageKey` và tham số an toàn; frontend chọn copy VI/EN đã duyệt ở P02. Không trả stack trace, SQL, raw provider error, raw vector hay dữ liệu của user khác.

## 2. Nhóm operation

### 2.1 Identity, onboarding và tài khoản

| Operation | Method & path | Màn hình | Ghi chú |
|---|---|---|---|
| `getBootstrap` | `GET /me/bootstrap` | Shell, SCR-01/02/10/17 | Account status, onboarding next step, profile, consent summary, Level summary |
| `createAgeAttestation` | `POST /me/age-attestation` | SCR-01 | Redeem invite từ cookie/`inviteCode`, ghi self-attested 18+, terms/privacy versions và kích hoạt tài khoản trong một transaction |
| `updateProfile` | `PATCH /me/profile` | SCR-17 | Chỉ field hiển thị tối thiểu |
| `listConsents` | `GET /me/consents` | SCR-01/12 | Theo purpose/version |
| `setConsent` | `PUT /me/consents/{purpose}` | SCR-01/12 | Tắt footprint có hiệu lực cho ranking mới ngay khi ghi nhận |
| `createDataRequest` | `POST /me/data-requests` | SCR-12/17 | Export/delete footprint/delete account |
| `getDataRequest` | `GET /me/data-requests/{requestId}` | SCR-12/17 | Trạng thái và biên nhận |

Google OAuth start/callback thuộc auth adapter (`/api/auth/*` hoặc tương đương) và không phải domain API `/v1`; P04 không tự viết OAuth handler thủ công.

### 2.2 Projects và Source Artifacts

| Operation | Method & path | Ghi chú |
|---|---|---|
| `createProject` | `POST /projects` | Tạo project + text artifact ban đầu trong một transaction |
| `listProjects` | `GET /projects` | Filter status/search của owner |
| `getProject` | `GET /projects/{projectId}` | Entity cơ bản |
| `updateProject` | `PATCH /projects/{projectId}` | Title/goal/mode/context; optimistic version |
| `deleteProject` | `DELETE /projects/{projectId}` | Tombstone + workflow xóa derived data |
| `getProjectWorkspace` | `GET /projects/{projectId}/workspace` | Stepper, artifacts, latest search/Brew/candidate/next action |
| `addProjectArtifact` | `POST /projects/{projectId}/artifacts` | Text/URL artifact; URL không fetch nguy hiểm đồng bộ |
| `initiateArtifactUpload` | `POST /projects/{projectId}/artifacts/uploads` | Trả signed upload constraints ngắn hạn |
| `completeArtifactUpload` | `POST /projects/{projectId}/artifacts/{artifactId}:complete-upload` | Kiểm hash/size/MIME rồi queue extraction |
| `listProjectArtifacts` | `GET /projects/{projectId}/artifacts` | Kèm processing state |
| `getArtifact` | `GET /artifacts/{artifactId}` | Metadata + extraction coverage |
| `retryArtifactProcessing` | `POST /artifacts/{artifactId}:retry-processing` | Chỉ lỗi retryable |
| `deleteArtifact` | `DELETE /artifacts/{artifactId}` | Xóa object/chunks/embeddings theo workflow |
| `getArtifactContent` | `GET /artifacts/{artifactId}/content` | Redirect signed URL ngắn hạn sau authz; không public link vĩnh viễn |

Artifact create không có nghĩa đã “đọc được”. Response luôn chứa `extractionStatus` và `coverage`.

### 2.3 Search và Brew

| Operation | Method & path | Ghi chú |
|---|---|---|
| `createSearchAttempt` | `POST /projects/{projectId}/search-attempts` | 202; snapshot artifact versions/context |
| `getSearchAttempt` | `GET /projects/{projectId}/search-attempts/{attemptId}` | Verdict, matched/missing, results an toàn |
| `answerSearchClarification` | `POST /projects/{projectId}/search-attempts/{attemptId}/clarifications` | Tạo attempt mới từ câu trả lời; không sửa attempt cũ |
| `createBrewJob` | `POST /projects/{projectId}/brew-jobs` | User xác nhận; quota/idempotency; 202 hoặc job cũ |
| `getBrewJob` | `GET /brew-jobs/{jobId}` | Step, status, result module khi ready |
| `cancelBrewJob` | `POST /brew-jobs/{jobId}:cancel` | Chỉ queued/running có thể hủy an toàn |
| `retryBrewJob` | `POST /brew-jobs/{jobId}:retry` | Chỉ `failed_retryable`; giữ logical request để không nhân đôi module |
| `getJob` | `GET /jobs/{jobId}` | Trạng thái job chung cho notification/deep link |

### 2.4 Output Explorer và ranking

| Operation | Method & path | Ghi chú |
|---|---|---|
| `getOutputExplorer` | `GET /projects/{projectId}/output-explorer` | CandidateSet + snapshot hiện hành; query `mode` chỉ đọc snapshot tương ứng nếu có |
| `createRankingSnapshot` | `POST /projects/{projectId}/ranking-snapshots` | Đổi mode/tắt personalization tạo snapshot mới có version |
| `setCandidatePreference` | `PUT /output-candidates/{candidateId}/preference` | `saved`, `hidden`, `not_interested`, hoặc xóa preference |
| `getModuleVersion` | `GET /module-versions/{moduleVersionId}` | Trả `playerGraph` đã lọc đáp án ẩn/internal lineage; graph canonical đầy đủ chỉ ở phía server/worker |

Nếu CandidateSet chưa sẵn sàng, Explorer trả trạng thái job/next action thay vì danh sách trống. Nếu ít hơn 10, response chứa `targetCount`, `actualCount`, `shortfallReasonCodes`.

### 2.5 Arena

| Operation | Method & path | Ghi chú |
|---|---|---|
| `createArenaMatch` | `POST /projects/{projectId}/arena-matches` | Hai candidate đã chọn hoặc Top 2 từ snapshot; response không chứa candidateId/title gốc trước vote |
| `getArenaMatch` | `GET /arena-matches/{matchId}` | Blind khi open; reveal sau vote |
| `castArenaVote` | `POST /arena-matches/{matchId}/votes` | Idempotent; Alpha không sửa vote sau khi đã ghi |

Blind payload dùng `slotA`/`slotB`, summary đã được chuẩn hóa để không lộ creator/model. Vote response reveal candidate thật, explanation thay đổi personal ranking và candidate hợp nhất nếu `merge` tạo được candidate mới; nếu merge cần job, trả trạng thái pending thay vì giả vờ đã có.

### 2.6 Journey, học và Boss Proof

| Operation | Method & path | Ghi chú |
|---|---|---|
| `createJourney` | `POST /journeys` | Fork từ candidate; tạo mới trả `201`, `ifExists=return_existing` khi đã có branch active trả `200` với branch cũ |
| `listJourneys` | `GET /journeys` | Branch của owner |
| `getJourney` | `GET /journeys/{journeyId}` | Branch header/upstream/attribution/progress summary |
| `updateJourney` | `PATCH /journeys/{journeyId}` | Title/goal/archive |
| `deleteJourney` | `DELETE /journeys/{journeyId}` | Tombstone theo policy |
| `getJourneyPlayer` | `GET /journeys/{journeyId}/player` | Graph projection, attempts, mastery, locked reasons, next node |
| `listJourneyCommits` | `GET /journeys/{journeyId}/commits` | Timeline append-only |
| `createAttempt` | `POST /journeys/{journeyId}/attempts` | Tạo draft cho node |
| `updateAttempt` | `PATCH /journeys/{journeyId}/attempts/{attemptId}` | Autosave có version |
| `submitAttempt` | `POST /journeys/{journeyId}/attempts/{attemptId}:submit` | 202 nếu assessment async; Boss dùng cùng contract với artifact/disclosure |
| `getAttempt` | `GET /journeys/{journeyId}/attempts/{attemptId}` | Result/rubric feedback/proof/XP effect đã posted |

Đáp án mẫu chỉ xuất hiện trong player payload sau khi attempt đã submit và policy của node cho phép reveal.

### 2.7 Progress, XP và Proof

| Operation | Method & path | Ghi chú |
|---|---|---|
| `getMyProgress` | `GET /me/progress` | Lifetime XP/Level/Era, mastery summaries, latest proof, next steps |
| `listMyXpLedger` | `GET /me/xp-ledger` | Entry của chính user, nguồn/rule/reversal dễ hiểu |
| `listProofs` | `GET /proofs` | Filter verification/status |
| `createExternalProof` | `POST /proofs` | Chỉ tạo Self-declared hoặc Source-linked theo evidence |
| `getProof` | `GET /proofs/{proofId}` | Kèm điều proof chứng minh/chưa chứng minh |
| `updateProof` | `PATCH /proofs/{proofId}` | Metadata/gắn journey; không đổi verification level |
| `deleteProof` | `DELETE /proofs/{proofId}` | Tombstone và xử lý artifact liên kết |
| `requestProofVerification` | `POST /proofs/{proofId}/verification-requests` | Chỉ bật khi có verifier được cấu hình; nếu không trả `FEATURE_NOT_AVAILABLE` |

### 2.8 Personalization

| Operation | Method & path | Ghi chú |
|---|---|---|
| `getPersonalization` | `GET /me/personalization` | Consent, nhóm signals đang dùng/không dùng, preferences |
| `updatePersonalization` | `PATCH /me/personalization` | Bật/tắt ranking footprint, topic controls |
| `deleteFootprint` | `DELETE /me/personalization/footprint` | Tạo DataRequest và trả 202; không giả vờ xóa tức thì trong backup |

### 2.9 Notifications, report và review

| Operation | Method & path | Quyền |
|---|---|---|
| `listNotifications` | `GET /notifications` | Owner |
| `markNotificationRead` | `POST /notifications/{notificationId}:mark-read` | Owner |
| `createReport` | `POST /reports` | Authenticated learner |
| `getReport` | `GET /reports/{reportId}` | Reporter hoặc operator theo scope |
| `listReviewQueue` | `GET /review/queue` | Reviewer/Admin |
| `getReviewCase` | `GET /review/cases/{caseId}` | Reviewer được giao/Admin |
| `decideReviewCase` | `POST /review/cases/{caseId}/decisions` | Reviewer/Admin; lý do có cấu trúc bắt buộc |
| `setFeatureFlag` | `PATCH /ops/feature-flags/{key}` | Admin; audit bắt buộc |

### 2.10 Game/GDevelop ở VS4

| Operation | Method & path | Ghi chú |
|---|---|---|
| `createGameSession` | `POST /journeys/{journeyId}/game-sessions` | Trả launch token ngắn hạn gắn journey/node/template version |
| `submitGameEvents` | `POST /game-sessions/{sessionId}/events` | Batch có sequence/idempotency; server chỉ ghi nhận event đạt rule |
| `getGameSession` | `GET /game-sessions/{sessionId}` | Trạng thái và learning effect đã xác thực |

Các operation game có mặt trong contract để tránh retrofit, nhưng chỉ được bật sau spike VS4 được duyệt.

## 3. Ánh xạ màn P02 → endpoint chính

| Screen | Endpoint/aggregate |
|---|---|
| SCR-01 | OAuth adapter, `GET /me/bootstrap`, `POST /me/age-attestation`, consent |
| SCR-02 | `POST /projects`, artifacts/uploads, workspace |
| SCR-03 | search-attempts |
| SCR-04 | brew-jobs/jobs |
| SCR-05 | output-explorer, ranking-snapshots, candidate preference |
| SCR-06 | arena-matches/votes |
| SCR-07 | `POST /journeys`, `GET /journeys/{id}` |
| SCR-08 | journey player, attempts |
| SCR-09 | attempt submit với Boss node, get attempt |
| SCR-10 | `/me/progress`, journey commits |
| SCR-11 | proofs |
| SCR-12 | consents, personalization, data-requests |
| SCR-13 | projects list/workspace |
| SCR-14 | notifications |
| SCR-15 | reports |
| SCR-16 | review queue/cases/decisions |
| SCR-17 | bootstrap/profile/data requests |

## 4. Error taxonomy tối thiểu

| HTTP | Code | Map sang P02 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Inline field error |
| 401 | `AUTH_REQUIRED` / `AUTH_SESSION_EXPIRED` | Đăng nhập lại và quay lại đích |
| 403 | `INVITE_REQUIRED`, `INVITE_INVALID_OR_EXPIRED` | SCR-01 invited/expired-invite state |
| 403 | `AGE_ATTESTATION_REQUIRED` | SCR-01 incomplete |
| 403 | `CONSENT_REQUIRED` | Cần quyết định consent cho tính năng tùy chọn |
| 403 | `FORBIDDEN` | Permission state không lộ metadata |
| 404 | `RESOURCE_NOT_FOUND` | Không tìm thấy hoặc không có quyền, theo policy chống enumeration |
| 409 | `RESOURCE_VERSION_CONFLICT` | Nháp đã thay đổi ở nơi khác |
| 409 | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` | Kiểm tra trạng thái trước khi gửi lại |
| 409 | `INVALID_STATE_TRANSITION` | Hành động không còn hợp lệ |
| 410 | `CONTENT_REMOVED` | Nội dung bị gỡ/retired |
| 413 | `ARTIFACT_TOO_LARGE` | Thay file nhỏ hơn |
| 415 | `ARTIFACT_TYPE_UNSUPPORTED` | Thay định dạng |
| 422 | `ARTIFACT_BLOCKED` | Dừng an toàn/quyền |
| 422 | `SEARCH_NEEDS_CLARIFICATION` | Chọn trọng tâm |
| 422 | `ASSESSMENT_NEEDS_REVISION` | Sửa theo rubric |
| 429 | `RATE_LIMITED`, `BREW_QUOTA_EXCEEDED` | Chờ/quota reset |
| 503 | `BREW_DISABLED`, `DEPENDENCY_UNAVAILABLE` | Kill switch hoặc thử lại sau |
| 504 | `UPSTREAM_TIMEOUT` | Trạng thái không chắc → kiểm tra job/resource |

`404` được dùng cho resource private không thuộc actor để tránh xác nhận tồn tại, trừ các bề mặt operator đã có quyền xem case.

## 5. Cache, realtime và offline

- Response private dùng `Cache-Control: private, no-store` mặc định. Chỉ asset/module public tương lai mới có cache policy riêng.
- P04 VS1 dùng polling có backoff cho job khi màn hình đang mở và notification khi quay lại. Realtime/SSE là tối ưu sau, không đổi job contract.
- Client có thể giữ draft cục bộ nhưng phải gắn `baseVersion`; khi online và version lệch, UI hiển thị conflict thay vì ghi đè.
- Offline không được hiển thị XP/Proof/vote như đã server xác nhận.

## 6. Tương thích và version

- `/v1` chỉ nhận thay đổi cộng thêm: thêm field optional, endpoint, enum value có fallback.
- Không đổi nghĩa field/enum hoặc xóa field trong cùng major.
- Enum mới từ server phải được client xử lý bằng trạng thái generic an toàn.
- OpenAPI và fixtures thay đổi trong cùng PR với code P04.
- Database migration dùng expand → backfill → switch reads/writes → contract; rollback không phụ thuộc vào việc xóa cột ngay.
- Chi tiết vòng đời version, backfill, embedding cutover và rollback nằm tại [Migration & Backward Compatibility](MIGRATION-AND-BACKWARD-COMPATIBILITY.md).
