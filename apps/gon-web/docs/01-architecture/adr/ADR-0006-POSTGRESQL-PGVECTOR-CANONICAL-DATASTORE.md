# ADR-0006 — PostgreSQL + pgvector là canonical datastore

## Trạng thái

**Accepted — Product Owner đã duyệt P03 ngày 22/10/2026 tại commit `b4e6ec2e91f83a48ddb139e8981928eb99d3d8bb`.**

## Bối cảnh

GON cần đồng thời quan hệ/transaction cho consent, votes, XP ledger, version lineage và audit; JSON snapshot cho Module Graph; full-text và vector 768D cho hybrid search. WSIC dùng Convex cho vector/realtime nhưng Gate 0 Audit cho thấy data-access boundary phải thiết kế lại và không có lý do bắt buộc GON nhận lock-in đó.

## Quyết định

- PostgreSQL là canonical datastore duy nhất cho domain data trong Private Alpha.
- Dùng `pgvector` với `vector(768)` cho embedding profile `gon-semantic-v1`.
- Dùng JSONB cho Module Graph/rubric/ranking snapshots đã có JSON Schema.
- Dùng PostgreSQL full-text/trigram cho lexical search.
- Dùng transactions + transactional outbox cho vote, assessment, XP, proof và jobs.
- Object files nằm ở object storage; database chỉ giữ metadata/object key.

## Hệ quả

- Authorization filter, hybrid search và transaction nằm cùng một mô hình dữ liệu.
- Dễ backup/export/migrate và truy vết ledger.
- Đội phải tự xây job polling/realtime và tối ưu search index; spike S-P03-01 ở đầu P04 là bắt buộc.
- Raw vector là dữ liệu nội bộ, không có public API.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn làm canonical baseline |
|---|---|
| Convex như WSIC | Realtime/vector tiện nhưng tăng lock-in và phải mô phỏng nhiều relational/ledger invariants |
| Vector database riêng ngay | Thêm hệ thống đồng bộ/quyền trước khi quy mô chứng minh cần |
| Document DB không transaction mạnh | Khó bảo vệ vote/XP/version constraints |
| SQLite | Không phù hợp multi-user production/queue/concurrent writes |
