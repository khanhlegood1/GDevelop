# GON PostgreSQL schema — P04

Thư mục này chứa SQL-first migrations cho canonical datastore đã được duyệt tại P03/ADR-0006.

## Trạng thái trung thực hiện tại

- **Đã có:** sáu migration cho Auth.js, GON identity/consent, project/artifact, chunk + `vector(768)`, job/search/module/candidate/ranking, journey/attempt/XP/proof/moderation, outbox/audit/quota/AI run.
- **Đã thực thi local:** R1.1/R1.2 đã áp dụng migrations trên PGlite (PostgreSQL 18.6 WASM + pgvector), chạy hybrid Search và toàn bộ domain VS1 qua normalized repositories. Xem [R1.2 evidence](../docs/06-nfr/P05-R1.2-DOMAIN-REPOSITORIES-UNIT-OF-WORK.md).
- **Đã wired:** `GON_STORE=postgres` dùng PostgreSQL Unit-of-Work khi có `DATABASE_URL` và schema đã migrate. Web runtime không tự chạy migration; thiếu cấu hình/schema thì fail-closed thay vì âm thầm fallback.
- **Chưa được chứng minh:** managed PostgreSQL/Cloud SQL latency, IAM/TLS/network, RLS/database roles, backup/PITR/restore, load và corpus Search đại diện. PGlite không phải production evidence.

## Chạy migration

```bash
cd apps/gon-web
npm run db:check
DATABASE_URL='postgresql://...' npm run db:migrate
GON_STORE=postgres DATABASE_URL='postgresql://...' npm run dev
```

Hermetic regression không cần database ngoài:

```bash
npm run test:postgres
```

`db:migrate`:

1. lấy PostgreSQL advisory lock;
2. tạo `gon_schema_migrations` nếu chưa có;
3. kiểm tra SHA-256 của migration đã áp dụng;
4. chạy mỗi file chưa áp dụng trong một transaction;
5. từ chối sửa checksum của migration đã publish. Muốn thay đổi schema phải thêm forward migration theo expand → compatible writes → backfill → read switch → write switch → contract ở migration riêng.

## Spike S-P03-01

Sau khi migration chạy trên database kiểm thử:

```bash
DATABASE_URL='postgresql://...' npm run spike:search
```

Script chạy trong một transaction rồi rollback. Nó kiểm tra:

- `vector(768)` + lexical + concept coverage trong cùng truy vấn;
- authorization filter trước `ORDER BY/LIMIT`;
- `draft_private` của người khác không xuất hiện;
- chuyển `internal_reviewed` mới làm module searchable;
- tombstone artifact/module chunk làm bằng chứng biến mất.

`npm run spike:search -- --dry-run` chỉ kiểm tra script load được; **không** tính là spike passed.

## Quy ước bất biến

- Auth.js sở hữu `users/accounts/sessions/verification_token`; GON domain user nằm ở `gon_users` và nối bằng Google provider subject trong `identity_links`.
- `age_attestations.method` chỉ là `self_attested_18_plus`; không có cột nào biến self-attestation thành xác minh giấy tờ.
- Invite chỉ lưu SHA-256 hash, không lưu plaintext code.
- `chunk_embeddings.embedding` cố định `vector(768)` cho `gon-semantic-v1`. Đổi model/dimension/task phải tạo profile mới và backfill; không trộn profile.
- `module_versions.graph` bất biến bằng trigger; thay đổi nội dung phải tạo ModuleVersion mới. Chỉ trạng thái publication/visibility mới được chuyển theo moderation policy.
- Branch commits, assessment results, XP ledger, proof verification events, moderation actions và audit logs là append-only ở tầng trigger.
- XP không có cột level tối đa. Projection lưu Lifetime XP; level tính bằng `floor(LifetimeXP/100)` theo `gon-level-v1`.
- Raw binary không lưu trong PostgreSQL; `storage_object_key` trỏ tới private object storage trong triển khai Cloud.

## Những gì còn cần trước staging/production

1. Lặp lại migrations, domain tests và S-P03-01 trên managed PostgreSQL staging với TLS/IAM, network policy và corpus đại diện; ghi EXPLAIN/latency thật.
2. Chuyển các đường nóng từ identity-map load-all của R1.2 sang targeted repository queries/pagination khi corpus tăng, có load test chứng minh.
3. Chốt database roles/RLS, retention/deletion jobs, backup/PITR/restore drill, region/tier, metrics và alert.
4. Nối private object storage cho raw bytes và durable queue/outbox worker; PostgreSQL metadata một mình chưa làm artifact/job trở nên durable end-to-end.
5. Chạy Google/Auth.js database-session/revoke E2E và kiểm tra migration rehearsal/rollback app theo expand-contract trên bản sao staging.
