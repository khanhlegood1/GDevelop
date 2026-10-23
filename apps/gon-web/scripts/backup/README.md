# Backup/restore/DR scripts (P05-R1.11)

> **STATUS: NOT RUN — chờ hạ tầng thật.** Ba script này đóng gói sẵn quy trình
> backup/restore/verify cho PostgreSQL thật (Cloud SQL/managed). Sandbox không
> có PostgreSQL server thật lẫn `pg_dump`/`pg_restore` bản server — vì vậy
> **chưa có kết quả backup/restore nào được thực thi hay claim**. Ngữ nghĩa
> đã được thiết kế theo chuẩn `pg_dump --format=custom` và checklist trong
> [P05-R1.11 evidence](../../docs/06-nfr/P05-R1.11-OBSERVABILITY-BACKUP-DR.md).

| Script | Việc làm |
|---|---|
| `backup-postgres.sh` | `pg_dump` custom format + `sha256` sidecar + `pg_restore --list` integrity check |
| `restore-postgres.sh` | Checksum check + `pg_restore --clean --if-exists` vào **scratch DB** (không bao giờ thẳng production) |
| `verify-backup.sh` | Restore vào scratch DB, kiểm tra `gon_schema_migrations` + số bảng public trước khi tin backup |

Chạy `bash -n` trên cả ba script là cách kiểm tra cú pháp duy nhất đã thực
hiện trong sandbox (không phải bằng chứng restore).
