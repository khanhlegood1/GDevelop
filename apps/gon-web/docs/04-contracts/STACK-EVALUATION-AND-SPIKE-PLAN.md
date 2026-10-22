# P03 — Stack Evaluation, Cost Guardrails & Spike Plan

> **Trạng thái:** IN REVIEW tại P03<br>
> **Mục tiêu:** Chọn baseline đủ chắc cho VS1/VS2 mà không biến WSIC/FastChat thành production nguyên trạng và không hứa chi phí chưa đo.

## 1. Tiêu chí từ ADR-0004

Mỗi ứng viên được xét theo:

1. khớp PRD/UX đã duyệt;
2. authorization/data isolation;
3. khả năng đặt quota/chi phí AI;
4. độ trễ search/generation/job;
5. backup/export/thoát vendor;
6. độ trưởng thành SDK/test;
7. privacy/retention/deletion;
8. khả năng vận hành bởi đội hiện tại;
9. tích hợp GDevelop;
10. tổng chi phí sở hữu và lock-in.

## 2. Ứng viên kiến trúc

### Phương án A — Google Cloud-first modular monolith (**đề xuất**)

```text
Next.js/TypeScript (Cloud Run)
  ├─ Web UI + /v1 API/BFF
  ├─ PostgreSQL + pgvector/JSONB/FTS (Cloud SQL)
  ├─ Cloud Storage (signed upload/download)
  ├─ Transactional outbox + Cloud Tasks
  ├─ TypeScript workers: extraction/search/assessment orchestration
  └─ Python Google ADK service (Cloud Run)
```

Ưu điểm:

- PostgreSQL transaction phù hợp XP Ledger, vote uniqueness, version graph, consent và audit.
- `vector(768)` + lexical search nằm cùng canonical store nên authorization filter nhất quán.
- Dữ liệu có đường export/backup SQL rõ; giảm lock-in hơn database proprietary.
- Gemini/ADK/Cloud Run cùng hệ sinh thái Google; service identity và Secret Manager thống nhất.
- Modular monolith giảm số service phải vận hành ở VS1; worker/ADK tách vì runtime/quyền khác nhau.

Nhược điểm:

- Phải tự xây job polling/realtime và search operations hơn Convex.
- Cloud SQL/Cloud Run vẫn có chi phí nền và cần chọn region/kích thước ở P06.
- Next.js trên Cloud Run cần Docker/CI kỷ luật trong monorepo lớn.

### Phương án B — WSIC-like Next.js + Convex + QStash

Ưu điểm:

- Gần WSIC nhất; realtime và vector index có sẵn.
- Có thể dựng nhanh một số flow nếu đội chấp nhận mô hình Convex.

Nhược điểm:

- Data/auth có thể tách nhiều nơi; WSIC snapshot đã cho thấy trust boundary cần viết lại.
- Ledger/version/relational constraints phải tự mô phỏng nhiều hơn.
- Export/thoát vendor và truy vấn audit phức tạp hơn SQL.
- Dependency baseline WSIC tại Audit có nhiều vulnerability; không được dùng lockfile cũ.

Kết luận: giữ WSIC làm pattern Search/Brew/ADK, **không** chọn Convex làm canonical production store trong baseline P03.

### Phương án C — Managed Postgres/BaaS khác (Supabase/Neon + storage/queue rời)

Ưu điểm: vẫn là PostgreSQL/pgvector, có thể triển khai nhanh và giảm vận hành database.

Nhược điểm: thêm vendor ngoài Google Cloud; auth/storage/realtime của BaaS có thể kéo domain logic vào RLS/config khó truy vết nếu không kỷ luật.

Kết luận: là fallback triển khai hạ tầng tương thích nếu Cloud SQL không phù hợp chi phí/region, nhưng domain contract vẫn giữ PostgreSQL và API phía server là nơi thực thi authorization chính.

## 3. Baseline được đề xuất chi tiết

| Thành phần | Đề xuất | Điều kiện P04/P05 |
|---|---|---|
| Web/API | Next.js App Router + TypeScript trong `apps/gon-web` | Pin versions mới đã qua SCA; không copy WSIC lockfile |
| Auth | Auth.js Google provider + database sessions | Kiểm tra adapter/schema và session revocation |
| DB | Cloud SQL for PostgreSQL + pgvector | Chốt major version/region/tier trước P06 |
| Migrations | SQL-first migrations được review | Expand–migrate–contract; test rollback/forward fix |
| Storage | Cloud Storage private buckets theo môi trường | Signed URL, lifecycle, malware scan |
| Queue | PostgreSQL job/outbox + Cloud Tasks | Reconciler cho message mất/trùng |
| Workers | Cloud Run services/jobs | Service accounts tách quyền |
| ADK | Python service trên Cloud Run | Không DB write/publish trực tiếp |
| Secrets | Secret Manager | Không secret trong repo/client bundle |
| Observability | Structured logs/metrics/traces có redaction | P05 chốt retention/alerts |
| Game | GDJS/template trong cùng monorepo ở VS4 | Spike trước khi cam kết exporter |

Tên thư viện ORM, validation, test runner và deployment tooling cụ thể được chốt bằng dependency baseline đầu P04 sau khi P03 được duyệt; chúng không được thay đổi contract này.

## 4. Vì sao không dùng GDevelop làm web/backend?

GDevelop/GDJS là lớp game/templates/export. Nó không thay thế:

- identity/session;
- PostgreSQL authorization;
- embedding/search;
- queue/ADK;
- XP Ledger;
- Proof verification.

Ngược lại, backend không tự phát minh game runtime. Canonical Module Graph là cầu nối.

## 5. Artifact và quota mặc định đề xuất

### 5.1 Artifact limits

| Loại | Giới hạn Alpha đề xuất | Mức xử lý cam kết |
|---|---|---|
| Prompt text | 20.000 ký tự/request | Lưu + embed theo chunks |
| Text artifact dán trực tiếp | 200.000 ký tự | Lưu + chunks |
| URL | Tối đa 5 URL/project ở VS1 | Metadata + fetch an toàn khi được phép |
| File tài liệu | PDF/TXT/MD/CSV/JSON, 25 MB/file | PDF/TXT/MD ưu tiên text extraction |
| Ảnh | PNG/JPEG/WebP, 15 MB/file | Metadata; OCR chỉ khi provider được bật |
| Tổng upload | 5 file/project, 100 MB/project | Vượt trả lỗi rõ ràng |
| Video link | YouTube/Facebook/website URL | Mặc định metadata-only; transcript chỉ qua connector hợp lệ |
| Archive/executable | Không nhận | `ARTIFACT_TYPE_UNSUPPORTED` hoặc blocked |

### 5.2 Quota

- Brew: 5/người/ngày, 2 active/người.
- Search: 60 attempts/người/giờ.
- Artifact processing: 20/người/ngày.
- Assessment AI: theo attempt hợp lệ và ngân sách job; chống spam bằng rate limit riêng.
- Arena: 100 votes/người/ngày.

Các con số là trần Alpha để tránh chi phí bất ngờ, không phải giới hạn sản phẩm dài hạn.

## 6. Cost model phải đo ở P04/P05

Không chốt số tiền trong P03 vì chưa có region, model cụ thể và traffic thật. Mọi job ghi:

```text
costUnits = inputTokens*rateInput
          + outputTokens*rateOutput
          + embeddingTokens*rateEmbedding
          + researchCalls*rateResearch
          + storage/processing units
```

Dashboard tối thiểu:

- cost per Brew succeeded;
- cost per module được học tới Boss;
- cost per Verified Learning Gain;
- quota rejection và budget-exceeded rate;
- provider latency/error theo model/version.

Kill switch `brew_enabled` và ngân sách job là điều kiện trước khi mời user thật.

## 7. Spike bắt buộc

### S-P03-01 — Postgres hybrid search fixture

**Thời điểm:** đầu P04 trước khi khóa search implementation.

Chứng minh:

- `vector(768)` + lexical + concept filter trong cùng query có authorization filter;
- seed verdict không false-found trên fixture;
- xóa artifact/module làm chunk biến mất khỏi kết quả;
- latency chấp nhận được trên dữ liệu mẫu đại diện.

### S-P03-02 — Upload/extraction safety

Chứng minh PDF/text/image/URL đi qua signed upload/fetch, MIME/magic kiểm tra, SSRF block và extraction states đúng.

### S-P03-03 — ADK structured output

Chứng minh checker/generator trả JSON theo schema, citation ngoài evidence bundle bị reject và job retry không tạo module thứ hai.

### S-P03-04 — Auth/session/deep link

Chứng minh Google login, invite, attestation, session revoke và return-to an toàn.

### S-P03-05 — GDevelop template

**Thời điểm:** trước VS4, không chặn VS1.

Chứng minh:

- một template project JSON cố định nhận cấu hình từ Module Graph;
- game chạy trên web/mobile target đã chọn;
- launch token + event batch không tự cấp XP;
- web/text equivalent đạt cùng outcome lõi;
- bundle/asset rights và accessibility fallback đo được.

## 8. Điều kiện đổi baseline

Phải tạo ADR mới nếu P04/P05 chứng minh:

- PostgreSQL/pgvector không đạt latency/quality ở quy mô Alpha dự kiến;
- Cloud SQL/Cloud Run không có region/chi phí phù hợp;
- Auth.js adapter không đáp ứng session/revocation;
- Cloud Tasks không đáp ứng job semantics;
- GDevelop template không chạy ổn định trên target.

Đổi implementation không được đổi âm thầm API/domain invariants trong gói P03 đã duyệt.

## 9. Nguồn kiểm chứng nền

- Gate 0 Audit WSIC: vector index 768D, Brew/ADK patterns và các cảnh báo authorization/dependencies.
- Gate 0 Audit FastChat: Arena/rating patterns và cảnh báo logging/privacy.
- Gate 0 Audit GDevelop: GDJS runtime/game direction, prototype chưa phải production.
- Google Cloud SQL documentation: Cloud SQL for PostgreSQL hỗ trợ lưu/index/query embeddings bằng pgvector.
- Google ADK documentation: ADK có đường deploy Cloud Run.
- Auth.js documentation: Google provider và PostgreSQL adapter/database session là hướng tích hợp khả thi cho Next.js.

Các nguồn ngoài chỉ chứng minh khả thi nền; chất lượng/chi phí trên workload GON vẫn phải đo bằng spike và P05.
