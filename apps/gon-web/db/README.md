# GON PostgreSQL schema — P04

Thư mục này chứa SQL-first migrations cho canonical datastore đã được duyệt tại P03/ADR-0006.

## Trạng thái trung thực hiện tại

- **Đã có:** sáu migration cho Auth.js, GON identity/consent, project/artifact, chunk + `vector(768)`, job/search/module/candidate/ranking, journey/attempt/XP/proof/moderation, outbox/audit/quota/AI run.
- **Chưa được chứng minh trong sandbox:** migration chưa chạy trên PostgreSQL thật vì môi trường hiện tại không có PostgreSQL/container runtime và không có `DATABASE_URL` dùng cho kiểm thử.
- **Chưa wired:** runtime hiện tại vẫn chỉ chấp nhận `GON_STORE=memory` cho increment VS1 đầu tiên. `GON_STORE=postgres` cố tình fail-fast thay vì âm thầm fallback.
- Vì vậy các file này là **schema + migration tooling đã sẵn sàng để Audit/spike**, chưa phải bằng chứng PostgreSQL production đã hoạt động.

## Chạy migration

```bash
cd apps/gon-web
npm run db:check
DATABASE_URL='postgresql://...' npm run db:migrate
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

## Những gì còn cần để wired PostgreSQL

1. Tách `GonService` khỏi `MemoryGonStore` thành repository interface theo aggregate và Unit of Work.
2. Implement PostgreSQL write repositories với transaction cho attestation, upload completion, search result, Brew persist, vote về sau, attempt pass → mastery/XP/commit/proof/outbox.
3. Nối `PostgresHybridSearchRepository` vào cùng transaction/read model sau khi project/artifact/module data đã được persist thật.
4. Chạy toàn bộ production service tests một lần với memory adapter và một lần với PostgreSQL adapter; sau đó lặp lại migration/S-P03-01 trên managed PostgreSQL staging với corpus đại diện.
5. Chốt database role/RLS, backup/restore, retention, region/tier và alert trước Go-Live.
