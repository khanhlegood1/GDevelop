# P03 — Events, Jobs & Integrations

> **Trạng thái:** APPROVED tại P03 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Mục tiêu:** Mọi tác vụ bất đồng bộ đều khôi phục được, không nhân đôi kết quả và không để client/agent trở thành nguồn sự thật.

## 1. Phân biệt bốn loại bản ghi

| Loại | Mục đích | Được dùng để |
|---|---|---|
| **Domain Event** | Sự kiện nghiệp vụ đã xảy ra | Cập nhật projection, notification, analytics nội bộ |
| **Async Job** | Việc cần thực thi | Extraction, embedding, Brew, assessment, render |
| **Footprint Event** | Tín hiệu personalization sau consent | Ranking cá nhân |
| **Audit Log** | Ai đã làm gì với đối tượng nào | Điều tra, moderation, reversal |

Không dùng một bảng “events” mơ hồ cho cả bốn mục đích. Domain event có thể phát sinh footprint event chỉ khi consent cho phép; audit log không tự động thành dữ liệu huấn luyện/ranking.

## 2. Domain Event envelope

Schema: [`schemas/domain-event-envelope.schema.json`](schemas/domain-event-envelope.schema.json)

```json
{
  "eventId": "evt_01...",
  "eventType": "learning.attempt.passed",
  "eventVersion": 1,
  "occurredAt": "2026-10-22T00:00:00Z",
  "aggregateType": "learning_attempt",
  "aggregateId": "att_01...",
  "actor": { "type": "user", "id": "usr_01..." },
  "correlationId": "req_01...",
  "causationId": "job_01...",
  "data": {
    "journeyId": "jrn_01...",
    "nodeId": "retrieval_1",
    "rubricVersion": "1.0"
  }
}
```

Nguyên tắc:

- `eventId` là idempotency key cho consumer.
- Payload chứa ID và thuộc tính tối thiểu, không sao chép raw answer, file text, vector hay secret.
- Event version tăng khi thay đổi không tương thích; consumer bỏ qua field chưa biết an toàn.
- Event được ghi bằng transactional outbox cùng transaction với thay đổi aggregate.

## 3. Event taxonomy tối thiểu

| Nhóm | Events |
|---|---|
| Identity | `identity.age_attested`, `identity.consent.changed`, `identity.data_request.created`, `identity.data_request.completed` |
| Project | `project.created`, `project.updated`, `project.deleted` |
| Artifact | `artifact.created`, `artifact.upload_completed`, `artifact.extraction.completed`, `artifact.blocked`, `artifact.deleted` |
| Search | `search.attempt.completed`, `search.attempt.failed` |
| Brew | `brew.job.queued`, `brew.job.needs_input`, `brew.job.succeeded`, `brew.job.failed` |
| Module | `module.version.created`, `module.publication.changed`, `module.hidden` |
| Discovery | `candidates.set.ready`, `ranking.snapshot.created`, `candidate.preference.changed` |
| Arena | `arena.match.created`, `arena.vote.cast`, `arena.merge_candidate.created` |
| Learning | `journey.created`, `learning.attempt.submitted`, `learning.attempt.passed`, `learning.attempt.needs_revision`, `mastery.changed` |
| XP/Proof | `xp.entry.posted`, `xp.entry.reversed`, `proof.created`, `proof.verification.changed`, `proof.revoked` |
| Safety | `report.created`, `moderation.case.decided`, `feature_flag.changed` |
| Game | `game.session.completed`, `game.learning_effect.recorded` |

Analytics sản phẩm suy ra từ domain events đã lược bỏ định danh khi có thể. Không ghi raw private content vào analytics mặc định theo `REQ-OPS-001`.

## 4. Transactional outbox và delivery

1. API ghi aggregate + outbox event trong cùng PostgreSQL transaction.
2. Outbox publisher chuyển event sang queue/internal consumers.
3. Consumer xử lý theo `eventId` và ghi processed marker.
4. Lỗi tạm thời retry với backoff; lỗi độc hại vào dead-letter kèm alert.
5. Queue delivery có thể trùng; consumer phải idempotent.

Cloud Tasks được đề xuất làm delivery ở baseline Google Cloud, nhưng **PostgreSQL job/outbox mới là nguồn sự thật**. Mất một queue message không làm mất job vì reconciler quét job quá hạn.

## 5. Async Job contract

Schema command: [`schemas/job-command.schema.json`](schemas/job-command.schema.json)

Trường cốt lõi:

- `jobId`, `jobType`, `schemaVersion`;
- `aggregateType`, `aggregateId`;
- `requestedBy` actor;
- `idempotencyKey`, `inputFingerprint`;
- `payload` chỉ chứa ID/phiên bản đầu vào, không chứa toàn bộ file/văn bản lớn;
- `priority`, `availableAt`, `deadlineAt`;
- `attempt`, `maxAttempts`;
- `correlationId`.

Job types Alpha:

- `artifact_extract`
- `artifact_embed`
- `search_attempt`
- `brew_module`
- `build_candidate_set`
- `assess_attempt`
- `delete_footprint`
- `export_user_data`
- `delete_user_data`
- `render_module` (VS sau)
- `export_gdevelop_template` (VS4)

### 5.1 Lease và checkpoint

- Worker nhận job bằng lease có thời hạn; heartbeat gia hạn lease ở step dài.
- Step output nhỏ lưu ở job checkpoint/object storage nội bộ; output lớn lưu object key.
- Job quá deadline bị đánh dấu retryable/terminal tùy step; không treo vô hạn.
- Cancel là yêu cầu hợp tác: worker kiểm tra ở biên step.

### 5.2 Retry

| Lỗi | Retry |
|---|---|
| Provider 5xx/timeout, queue delivery, DB transient | Có, exponential backoff + jitter |
| Schema output sai | Tối đa 1 repair attempt |
| Safety block, quyền, quota, input không hợp lệ | Không |
| Cần user bổ sung | Không tự retry; chuyển `needs_input` |
| Chi phí vượt budget | Không cho tới khi policy/quota đổi |

## 6. Internal service calls

### 6.1 Worker → ADK

- Chỉ mạng nội bộ/service identity được phép gọi.
- Request có job ID, correlation ID, schema version và deadline.
- ADK không nhận user session cookie hay database credentials.
- Response là structured output kèm AiRun metadata; GON worker mới persist.

### 6.2 Worker → AI/search providers

- API key từ Secret Manager; không log key/payload nhạy cảm.
- Timeout, retry và circuit breaker theo provider.
- Mỗi call ghi model/config version, latency và cost units vào AiRun.
- Provider lỗi không làm lộ raw error cho user.

### 6.3 Object storage

- Upload qua signed URL ngắn hạn, khóa theo object key, content length và content type khai báo.
- Complete-upload kiểm tra object tồn tại, byte size, SHA-256 phía client/server policy và detected MIME.
- Download qua API authz rồi redirect signed URL ngắn hạn; object key không phải capability token lâu dài.
- Quét malware/policy trước extraction khi loại file yêu cầu.

### 6.4 URL fetch

- Chỉ HTTP/HTTPS công khai; chặn private/reserved IP, redirect sang nội bộ, DNS rebinding và vòng lặp.
- Tối đa 3 redirects, timeout 10 giây, response tối đa 5 MB trong baseline đề xuất.
- Không gửi cookie/credential của user tới site đích.
- YouTube/Facebook: mặc định link/metadata-only trừ khi connector/API được duyệt chứng minh quyền lấy transcript/nội dung.

## 7. Notification

Domain events tạo notification cho:

- Brew ready/needs input/failed;
- assessment passed/needs revision/pending review đã có quyết định;
- report có quyết định;
- upstream bị hidden ảnh hưởng branch;
- data request hoàn tất.

Notification chỉ chứa template key + entity ref + deep link nội bộ; khi mở, API kiểm tra quyền và trạng thái hiện tại. Không gửi XP/proof như đã xác nhận nếu transaction chưa posted.

## 8. GDevelop/game integration contract

### 8.1 Launch

Server tạo `GameSession` gồm:

- journey/node/template version;
- launch token opaque, hash lưu phía server, hết hạn ngắn;
- config đã lọc từ Module Graph (không có đáp án bí mật);
- return/deep-link state.

Token không phải user session và không dùng lại cho journey khác.

### 8.2 Event batch

Schema: [`schemas/game-event.schema.json`](schemas/game-event.schema.json)

Batch được gửi kèm header `X-GON-Game-Token` của đúng GameSession; token không nằm trong body và không được ghi log. Mỗi event có `sessionId`, `sequence`, `clientEventId`, `eventType`, `occurredAtClient`, dữ liệu tối thiểu. Server kiểm tra:

- token/session còn hiệu lực;
- sequence không lùi và không trùng;
- event thuộc template/node;
- thời lượng/điểm/kết quả nằm trong giới hạn template;
- completion event có đủ chuỗi event bắt buộc;
- idempotency theo `(sessionId, clientEventId)`.

Chỉ event đạt rule mới chuyển thành Attempt/Assessment phía server. Score client gửi không tự thành XP/Proof.

### 8.3 Template-first

VS4 chỉ map Module Graph sang template GDevelop cố định đã được kiểm thử. Sinh arbitrary scene/event/code là ngoài contract cho tới khi spike chứng minh an toàn/chất lượng và PO duyệt mở rộng.

## 9. Observability tối thiểu chuyển sang P05

Mỗi request/job có `requestId/correlationId`. Metrics bắt buộc:

- search verdict/latency/failure;
- artifact extraction coverage/failure theo loại;
- Brew queue time, step latency, model cost, failure code;
- candidate count/shortfall;
- assessment pending/pass/needs revision;
- XP posted/reversed;
- report/moderation age;
- kill switch state.

Log không chứa raw prompt, raw answer, raw file text, vector, token hay signed URL. P05 quyết retention/alert thresholds vận hành chi tiết.
