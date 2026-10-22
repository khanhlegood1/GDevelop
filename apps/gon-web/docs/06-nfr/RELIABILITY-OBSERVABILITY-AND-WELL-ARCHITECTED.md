# P05 — Reliability, Observability, DR và Well-Architected Review

> **Kết luận:** kiến trúc mục tiêu tại P03 vẫn phù hợp — modular monolith, PostgreSQL/pgvector, ADK stateless và durable jobs — nhưng runtime hiện tại mới là local/test increment. Độ tin cậy production chưa được chứng minh vì persistence, queue, backup/restore, telemetry và runbooks chưa tồn tại ở dạng vận hành được.

## 1. Failure modes hiện tại

| Sự cố | Hành vi hiện tại | Rủi ro | Điều kiện production |
|---|---|---|---|
| Web process restart | Toàn bộ `MemoryGonStore`, objects, sessions, jobs, outbox/Audit bị mất | Mất dữ liệu và không thể scale ngang | PostgreSQL/object storage là nguồn sự thật; web stateless |
| Hai instance cùng chạy | Mỗi process có store riêng; quota/idempotency không nhất quán | Dữ liệu phân mảnh, trùng XP/module | DB transactions/unique constraints/leases |
| Crash giữa artifact/Search/Brew | Job trong memory biến mất cùng process; không có reconciler | Người dùng không biết trạng thái thật; retry thủ công có thể trùng | Outbox + queue + job lease/heartbeat + idempotent workers |
| Provider timeout/429/5xx | Embedding timeout 20 giây; Search ghi failed-retryable; ADK timeout cấu hình 120 giây và Google fail-closed | Chưa có backoff/jitter/circuit breaker/budget protection khi retry thật | Error taxonomy, bounded retries, repair tối đa theo P03, circuit breaker |
| PostgreSQL không sẵn sàng | Runtime domain chưa dùng PostgreSQL; Auth adapter có pool timeout 5 giây, max 10 | Không thể kết luận auth/domain degradation | Readiness tách liveness, pool/statement timeouts, staging fault tests |
| Migration lỗi | Runner dùng advisory lock, checksum và transaction từng file | Chưa chạy DB thật; rollback app/schema chưa diễn tập | Migration rehearsal trên snapshot staging và expand-contract |
| Artifact độc hại/quá lớn | Limits/magic/hash chặn một phần; xử lý đồng bộ | Parser CPU/memory, malware/polyglot | Quarantine bucket, scan, sandbox, resource quotas |
| Lộ secret/provider key | Chưa có Cloud secret/IAM/rotation evidence | Chiếm ngân sách/dữ liệu provider | Secret Manager, least privilege, rotation/revoke runbook |
| Region/service outage | Chưa deploy | Không có RTO thực tế | Backup/PITR, IaC redeploy, restore drill và quyết định multi-region riêng nếu cần |

## 2. Backup, restore và disaster recovery

### 2.1 Mục tiêu đề xuất

Theo [NFR-REL-02](NFR-SPECIFICATION-AND-RESULTS.md#33-availability-reliability-và-data-integrity):

- **RPO ≤ 1 giờ** cho Private Alpha bằng PostgreSQL PITR/backup đã kiểm chứng;
- **RTO ≤ 4 giờ** để khôi phục web/API/worker ở trạng thái đọc/ghi an toàn;
- object storage phải có versioning/lifecycle và kiểm tra checksum khi restore;
- cấu hình/IaC/secrets phải tái tạo được mà không phụ thuộc vào một máy cá nhân.

Đây là target đề xuất cho D-P05-06. Chưa có backup nào để diễn tập ở baseline hiện tại.

### 2.2 Kế hoạch tối thiểu cho P06

1. Bật automated backups + PITR cho Cloud SQL; ghi retention, encryption, region và owner.
2. Tách buckets quarantine/processed/exports; bật versioning, lifecycle và deny public access; checksum đối chiếu với artifact records.
3. Backup cấu hình không chứa secret trong IaC; secrets nằm ở Secret Manager với version/rotation/Audit.
4. Trước mỗi migration production: snapshot, kiểm dung lượng/khóa, chạy migration trên bản sao staging và ghi checksum.
5. Restore drill theo lịch phát hành:
   - khôi phục DB tới thời điểm đã chọn;
   - chạy `db:check`/integrity queries cho users/projects/chunks/jobs/XP/proofs;
   - đối chiếu số object/checksum và một mẫu journey end-to-end;
   - đo thời gian từ quyết định restore tới khi API sẵn sàng;
   - ghi dữ liệu mất theo RPO và quyết định mở ghi trở lại.
6. Kiểm tra deletion không bị “hồi sinh” ngoài policy sau restore: tombstone/deletion ledger phải được áp lại nếu restore về trước thời điểm xóa.
7. Diễn tập app rollback mà không rollback schema một cách phá hủy; chỉ dùng forward migration/expand-contract.

### 2.3 Thứ tự khôi phục khi sự cố

1. Đóng registration/Brew/AI writes bằng kill switches nếu integrity chưa rõ.
2. Bảo toàn logs/Audit/outbox và snapshot hiện trạng trước khi sửa dữ liệu.
3. Khôi phục DB/objects vào môi trường cô lập; chạy integrity checks.
4. Chạy reconciler cho jobs `running` quá lease, outbox pending và quota reservations.
5. Mở read-only/smoke cho operator, sau đó mới mở writes từng phần.
6. Ghi incident timeline, dữ liệu bị ảnh hưởng và quyết định thông báo người dùng/PO.

## 3. Observability review

### 3.1 Hiện có

- Mọi response API chính có `X-Request-Id`; request ID do client gửi chỉ được dùng nếu khớp định dạng `req_...` an toàn.
- Lỗi API dùng Problem Details với `code`, `requestId`, `retryable` và không trả stack.
- Web log một JSON line cho unhandled API error chỉ gồm level/event/requestId/errorName; comment trong code cấm log body/token/learner content tại boundary này.
- Domain service tạo outbox events và một số Audit records trong memory; SearchAttempt lưu latency nội bộ.
- ADK có `/healthz` báo provider/schema/auth readiness dạng boolean và khẳng định không có DB/publish access.

### 3.2 Thiếu

- Không có metrics endpoint/exporter, traces, dashboards, SLO burn alerts hoặc log retention/Access policy.
- Audit chưa bao phủ auth failures, session revoke, XP/proof decisions, provider calls, admin/review actions và feature-flag changes.
- Outbox `publishState=pending` không có publisher, dead-letter hoặc lag metric.
- ADK dùng `logger.exception` cho lỗi bất ngờ; stack trace nội bộ phải được kiểm soát để không kèm payload nhạy cảm khi nối log platform.
- Web chưa có `/healthz` liveness/readiness riêng; không nên dùng trang chủ dynamic làm health contract production.
- Chưa có correlation xuyên web → queue → ADK → provider, cũng chưa có AiRun telemetry thật.

### 3.3 Thiết kế telemetry tối thiểu

#### Structured logs

Chỉ log allowlist fields:

```text
timestamp, severity, service, version, environment,
requestId, traceId, jobId, aggregateType, aggregateId,
actorType, hashedActorId (nếu thật cần), routeTemplate,
status, errorCode, durationMs, provider, modelVersion,
inputTokens, outputTokens, estimatedCost, retryCount
```

Không log: Authorization/cookie/token, invite code, raw prompt/answer/file bytes, signed URLs, email/full URL query, sample answers, chain-of-thought hoặc provider raw payload. Mọi ngoại lệ debug phải có redaction test và quyền truy cập hạn chế.

#### Metrics

- HTTP: request rate/error/latency theo route template và status code;
- Auth: sign-in success/failure, invite failures, session revoke, CSRF failures theo loại không chứa định danh thô;
- Search: latency, verdict distribution, zero-result rate, index/DB latency;
- Jobs: queue depth/age, running/stale, retry/dead-letter, completion theo job type;
- AI: provider latency/error/token/cost, schema repair rate, human-review rate, budget consumption;
- Data: DB connections/CPU/IO/locks, storage bytes, backup age/restore drill status;
- Product safety: reports/review backlog, blocked artifacts, quota rejections.

#### Traces

Trace một request qua web → DB/storage → queue → ADK → provider bằng W3C trace context. Sampling phải loại bỏ attributes chứa nội dung người dùng. Khi propagation được bật, lỗ hổng transitive OpenTelemetry tại F-P05-10 phải đã được đóng hoặc có header limits/middleware review riêng.

#### Alerts và runbooks tối thiểu

| Alert | Runbook cần có |
|---|---|
| 5xx/error budget burn | Phân loại deploy/DB/provider, rollback hoặc tắt writes |
| Queue age/dead-letter tăng | Lease/reconciler, provider status, replay có idempotency |
| AI cost/token bất thường | Brew/provider kill switch, quota freeze, kiểm tra abuse |
| Auth/invite failure spike | Rate limit, revoke invite/session, kiểm tra credential stuffing |
| DB saturation/backup failure | Scale/kill long queries, failover/restore decision |
| Human-review backlog | Tạm dừng auto-persist/auto-pass ở nhóm rủi ro, tăng reviewer capacity |

## 4. Rate limiting, abuse và anti-cheat

### Hiện có

- Domain quotas: Search 60/giờ, Brew 5/ngày, artifact processing 20/ngày;
- giới hạn file/text/project và upload session ngắn hạn;
- XP/mastery/proof do server quyết định; attempt giống nguồn đi review; duplicate passed work không cộng XP lại;
- report tạo review case ở mức record.

### Còn thiếu

1. Edge rate limit theo IP/route và authenticated principal; protection riêng cho sign-in, invite, CSRF, upload initiation và ADK.
2. Persistent quota/budget reservation dùng chung mọi instance; global/provider budgets và concurrency caps.
3. CAPTCHA/step-up chỉ khi tín hiệu abuse tăng, tránh chặn người dùng hợp lệ mặc định.
4. Multi-account/Sybil signals, attempt velocity, vote collusion và creator/trend manipulation defenses — phải thiết kế trước VS2/VS5, không suy diễn từ XP local.
5. Review queue SLA, reviewer permissions/Audit và cơ chế appeal; similarity không được dùng như phán quyết gian lận tự động.
6. Signed URL TTL ngắn, quarantine trước scan, object download authorization và content-disposition an toàn.

## 5. Well-Architected gap list

| Trụ cột | Điểm mạnh | Gap chính | Ưu tiên |
|---|---|---|---|
| Operational excellence | Gate/ADR/traceability rõ; Problem Details/requestId; kill switch Brew dạng env | Chưa CI/CD, dashboards/alerts/runbooks/game days | **P0** |
| Security | Server-side actor/owner, CSRF, bounded bodies, private drafts, ADK không DB/publish | Auth/DB thật, edge limits, file/fetcher sandbox, IAM/secrets, staging DAST | **P0** |
| Reliability | Idempotency/state machines ở local; migration checksum/advisory lock | Memory store, synchronous jobs, không backup/restore/queue recovery | **P0** |
| Performance efficiency | Bundle vừa phải; local latency thấp; schema có HNSW/FTS/trigram design | Runtime quét memory, embedding tuần tự, chưa load/index evidence | **P0/P1** |
| Cost optimization | Quotas theo job và provider timeout; local adapters rẻ cho test | Chưa meter token/tiền, batching/caching/budget alerts; chi phí Gemini chưa biết | **P0 khi bật AI** |
| Sustainability | Modular monolith tránh vận hành thừa ở Alpha; jobs có thể batch sau này | Chưa đo compute/token/storage retention; chưa lifecycle cho objects/logs | P2 |
| Maintainability | TypeScript strict, Python typed/dataclass, contracts versioned | `service.ts` ~3.200 dòng và UI ~1.300 dòng; coverage/CI chưa có; Python lock chưa có | P1 |

## 6. Remediation backlog theo thứ tự

### P0 — Trước khi có người dùng/dữ liệu thật

1. PostgreSQL repositories + Auth DB sessions + migrations chạy thật; bỏ memory khỏi staging/production paths.
2. Durable outbox/queue/worker với lease, retry/backoff, dead-letter và reconciler.
3. Object storage quarantine/scan/signed URLs; fetcher chỉ bật sau SSRF/parser tests.
4. ADK worker integration bằng service identity; AiRun/token/cost/budget/kill switches.
5. Persistent quotas + edge rate limits; invite entropy/rate-limit/Audit.
6. Export/delete/retention jobs và legal approval cho 18+ self-attestation.
7. Observability/alerts/runbooks; backup/PITR và restore drill đạt RPO/RTO.
8. CI/SBOM/locks + đóng hoặc phê duyệt ngoại lệ CVE có hạn.

### P1 — Trước khi mở rộng Private Alpha

1. Refactor service theo repository/use-case boundaries và UI theo route/feature modules.
2. Batch embeddings, Search index tuning, payload budgets và browser performance budgets.
3. Nonce-based CSP, CSRF rotation policy và staging ZAP/pentest định kỳ.
4. Coverage gates cho domain/security boundaries; contract compatibility tests giữa các version.
5. Review/admin workflow có permissions, SLA, Audit và appeal.

### P2 — Tối ưu sau khi có dữ liệu vận hành

1. Cache/CDN cho nội dung thật sự công khai đã review; không cache private responses ngoài policy.
2. Cost/carbon reporting theo provider/job và lifecycle cho logs/objects.
3. Multi-region chỉ khi nhu cầu availability/latency và chi phí được PO duyệt riêng.

## 7. Điều kiện để P05 được re-review

Một vòng P05-R3 chỉ nên bắt đầu khi cùng một staging build có đủ:

- kết quả S-P03-01, S-P03-02, S-P03-03 và S-P03-04;
- load/DAST/AI/accessibility reports gắn với build/version cụ thể;
- backup/restore và rollback drill timestamps;
- dashboards/alerts đã kích hoạt thử;
- danh sách findings còn lại có owner, severity, hạn và quyết định ngoại lệ nếu có;
- CI required checks xanh trên commit ứng viên.

Nếu các bằng chứng trên chưa có, trạng thái đúng vẫn là **P05 IN REVIEW — NOT YET PASS**, kể cả khi demo local chạy tốt.
