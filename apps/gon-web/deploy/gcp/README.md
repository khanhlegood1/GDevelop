# GON — GCP deployment package (P06-S1)

> **TRẠNG THÁI: NOT RUN.** Toàn bộ package này được viết và review trong
> sandbox **không có gcloud/GCP thật** — chưa lệnh nào được thực thi trên hạ
> tầng thật. Lần chạy đầu có thể cần chỉnh nhỏ cú pháp theo phiên bản gcloud
> của PO; mọi chỉnh sửa cần được ghi lại làm decision trong
> `docs/07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md`.

Đóng gói hạ tầng staging/production cho GON trên GCP: Cloud Run (web + ADK +
worker), Cloud SQL PostgreSQL 17 (pgvector), GCS private buckets, Secret
Manager, HTTPS LB + Cloud Armor, monitoring/budget alerts, và DR drill.

## Thứ tự chạy

```bash
cp gcp.env.example gcp.env   # sửa các giá trị (project, region, domain...)
./00-prereqs.sh              # APIs + billing + auth
./10-storage.sh              # GCS uploads/exports + signer SA
./20-database.sh             # Cloud SQL PG17 + runtime SA + DATABASE_URL secret
./30-secrets.sh              # sinh được thì sinh; các mục [PO] cần PO điền
#   ... điền các secret đánh dấu [PO] trong output của 30-secrets.sh ...
./40-deploy-adk.sh           # build + deploy gon-adk (internal + token)
./45-deploy-web.sh           # build + deploy gon-web (Cloud SQL socket)
./50-migrate.sh              # job migrate + job check (chính là db:check)
./55-worker.sh               # deploy gon-worker (GON_WORKER_ENABLED=1)
./60-edge.sh                 # LB + Cloud Armor + cert quản lý + DNS hướng dẫn
./70-observability.sh        # uptime + alert policies + budget
./80-restore-drill.sh        # chỉ khi diễn tập DR (CONFIRM_DRILL=yes)
```

Mọi script đều `set -euo pipefail`, đọc `gcp.env`, và in rõ bước đang làm.
Chạy lại được phần lớn (resource tồn tại → ghi "exists"); **70-observability
tạo alert policy mới mỗi lần chạy** — xoá policy trùng trong console nếu chạy
lại.

## Mô hình triển khai (tóm tắt)

| Thành phần | Hình thức | Ghi chú |
|---|---|---|
| gon-web | Cloud Run, public, qua LB | `--allow-unauthenticated` ở tầng run.app trong staging; siết lại bằng `--ingress` sau khi DNS/cert sống |
| gon-adk | Cloud Run, **internal ingress** + service token fail-closed | app tự chặn request không token khi `GON_ADK_ENV != local` |
| gon-worker | Cloud Run, internal, `GON_WORKER_ENABLED=1`, `--no-cpu-throttling`, min 1 | cùng image gon-web; instrumentation hook (đã test battery) bật worker loop |
| DB | Cloud SQL PG17 + pgvector, backups hằng ngày + PITR 7 ngày, deletion protection | kết nối unix socket `/cloudsql/...` — không cần VPC |
| Storage | 2 bucket private: uploads (signed URL, versioning 30 ngày) + exports (retention 30 ngày) | signer SA riêng, key nằm trong Secret Manager |
| Edge | Global external LB + managed cert + Cloud Armor (policy R1.10) | tệp policy: `../edge-rate-limit/cloud-armor-policy.yaml` |
| Bí mật | Secret Manager, runtime SA chỉ có `secretAccessor` từng secret | DATABASE_URL dựng dạng socket URL |

## Những gì PO phải tự điền (30-secrets.sh in hướng dẫn)

1. Google OAuth client id/secret (redirect `${GON_PUBLIC_ORIGIN}/api/auth/callback/google`).
2. Gemini API key (web embeddings + ADK generation).
3. Outbox sink URL + token (bất kỳ receiver HTTPS nào nhận batch event P03 kèm bearer token — ví dụ Pub/Sub push endpoint).

## Quyết định đã ghi (D1–D9)

Xem `docs/07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md` — trong đó có:
một image ba vai trò (D2), ADK internal+token (D5), worker `--no-cpu-throttling`
(D7), alert thresholds là reference cho PO chỉnh (D8), DR drill thủ tục (D9).

## Ràng buộc trung thực

- Chưa có lệnh nào ở đây được chạy thật; kết quả staging thật phải được ghi
  theo `deploy/staging-verification/staging-checklist.md` (P06 runbook §0–§10).
- Không claim SLO/RTO/RPO nào từ package này. Budget/uptime/alert chỉ có ý
  nghĩa sau khi PO verify channel + thresholds trên traffic thật.
