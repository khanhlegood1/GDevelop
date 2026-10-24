# P06 — Cloud Deployment

> **Trạng thái: IN PROGRESS — package đã bàn giao, execution/Go-Live NOT RUN.**
> Theo kế hoạch gốc (06-nfr §7), P06 bắt đầu sau khi P05 APPROVED. Dưới ủy
> quyền liên tục 24/10/2026, slice P06-S1 đóng gói toàn bộ hạ tầng cần để PO
> chạy staging/production, **không tiêu tốn hạ tầng và không claim gì đã chạy
> thật**. Mọi kết luận gate vẫn là quyết định của PO.

## Nội dung chính

1. [P06-S1 — Cloud deployment package (evidence + quyết định D1–D10)](P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md)
2. Gói lệnh hạ tầng: [`apps/gon-web/deploy/gcp/`](../../deploy/gcp/README.md) — Cloud Run (web/ADK/worker), Cloud SQL PG17, GCS, Secret Manager, LB + Cloud Armor, monitoring, DR drill
3. Docker images: [`apps/gon-web/Dockerfile`](../../Dockerfile) (một image ba vai trò: web / migrate / worker) + [`apps/gon-adk/Dockerfile`](../../../gon-adk/Dockerfile)
4. Pipeline build (tuỳ chọn, manual): [`.github/workflows/gon-deploy.yml`](../../../../.github/workflows/gon-deploy.yml)
5. Runbook nghiệm thu khi có hạ tầng: [`deploy/staging-verification/staging-checklist.md`](../../deploy/staging-verification/staging-checklist.md) (P06 §0–§10)

## Điều PO cần làm để Go-Live (tóm tắt)

1. Cung cấp GCP project + billing; điền `deploy/gcp/gcp.env`.
2. Điền các secret đánh dấu **[PO]**: Google OAuth client, Gemini API key, outbox sink receiver.
3. Chạy `00 → 70` theo thứ tự; trỏ DNS theo hướng dẫn của `60-edge.sh`.
4. Ghi kết quả thật vào staging-checklist (§1–§10) — đó là bằng chứng P06 chính thức.
5. Diễn tập DR (`80-restore-drill.sh`) và xác nhận RPO ≤ 24h / RTO ≤ 4h.
6. Quyết định Go-Live riêng (D-P05-06 và gate table của [docs README](../README.md)).
