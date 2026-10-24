# P06-S1 — Cloud deployment package

> **Phạm vi:** slice **P06-S1** theo ủy quyền liên tục 24/10/2026: đóng gói
> toàn bộ hạ tầng GCP để PO có thể chạy staging/production (Cloud Run ×3,
> Cloud SQL PG17 + pgvector, GCS, Secret Manager, HTTPS LB + Cloud Armor,
> monitoring/budget, DR drill) kèm Docker images và pipeline build tuỳ chọn.
> **Execution/Go-Live NOT RUN** — sandbox không có gcloud/GCP; không có lệnh
> nào trong package được chạy thật; không claim SLO/RTO/RPO nào.

## 1. Vì sao P06-S1 chạy trước khi P05 đóng

Kế hoạch gốc (06-nfr §7.4) yêu cầu P05 APPROVED trước P06. Dưới ủy quyền
"chạy hết các giai đoạn còn lại" ngày 24/10/2026, slice này chỉ **đóng gói**
(không tiêu tốn hạ tầng, không deploy, không Go-Live) để rút ngắn thời gian
khi PO phê duyệt P05. **Điều kiện để thực thi package vẫn là P05 APPROVED +
quyết định Go-Live riêng của PO** (D1).

## 2. Bàn giao

| Thành phần | Vị trí | Vai trò |
|---|---|---|
| Worker entrypoint | [`src/instrumentation.ts`](../../src/instrumentation.ts) | Next.js instrumentation hook: cùng một image trở thành worker khi `GON_WORKER_ENABLED=1`; fail-closed nếu composition không phải PostgreSQL |
| Web image | [`Dockerfile`](../../Dockerfile) + [`.dockerignore`](../../.dockerignore) | Multi-stage, non-root, **một image ba vai trò** (web/migrate/worker), không đổi `next.config.ts` |
| ADK image | [`apps/gon-adk/Dockerfile`](../../../gon-adk/Dockerfile) | python:3.12-slim + `requirements.lock` có hash (R1.12); P03 contracts staged vào image tại build |
| Gói lệnh GCP | [`deploy/gcp/`](../../deploy/gcp/README.md) | `gcp.env.example` + 11 script đánh số (00→80) + `lib/common.sh`; mọi script `set -euo pipefail`, chạy lại được |
| Build pipeline (tuỳ chọn) | [`.github/workflows/gon-deploy.yml`](../../../../../.github/workflows/gon-deploy.yml) | dispatch-only, khoá repo + WIF secrets, chỉ build+push images |
| Evidence probe re-run | `deploy/staging-verification/results/local-20261024T102454Z-*.json` | chứng minh dev flow + 4 phase probe không hồi quy sau khi thêm instrumentation hook |

## 3. Kiểm chứng đã chạy local (battery, 24/10/2026)

| Kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:coverage` | **154/154** (151 cũ + 3 test mới cho instrumentation: no-op khi thiếu flag, no-op ngoài nodejs runtime, fail-closed khi memory store) — coverage 65,59 / 55,64 / 71,25 / 68,2 (không đổi sàn) |
| `npm run build` | PASS — warning Edge Runtime `process.pid` đã xử lý (thay fallback edge-safe); còn 1 warning **có sẵn từ R1.11** (`db.ts` readdir migrations — cũng là lý do giữ hướng full-image thay vì standalone) |
| `bash -n` 12 script | PASS toàn bộ |
| `npx js-yaml` + assertion workflow | PASS (dispatch-only, không trigger push/PR, khoá `khanhlegood1/GDevelop` + WIF) |
| Probe 4-phase re-run | **4/4 PASS** (stamp `20261024T102454Z`): security 7/7 default policy; benchmark relaxed; **guard-engagement: 400 GET → 280× 429 kèm Retry-After** (engagement tại đúng ngưỡng 120 strikes như R1.15) |

## 4. Quyết định (D1–D10)

- **D1 — Thứ tự gate:** P06-S1 là packaging-only, không thực thi; thực thi
  package vẫn chờ P05 APPROVED + quyết định Go-Live của PO.
- **D2 — Một image ba vai trò:** giữ `node_modules` prod + `.next` + `db/` +
  `scripts/` trong image (không dùng `output: "standalone"`). Lý do: job
  migrate và worker cần chạy `node scripts/*.mjs` với `pg` + `db/migrations`
  y như battery local; tránh hai build drift nhau.
- **D3 — Worker qua instrumentation hook opt-in:** `GON_WORKER_ENABLED` mặc
  định tắt; bật sai composition (memory store) thì **crash khi boot** (đúng
  triết lý fail-closed của runtime). Cloud Run worker: `--no-cpu-throttling`
  + `min-instances 1` — không có hai flag này Cloud Run đóng băng CPU ngoài
  request và worker ngừng poll.
- **D4 — Cloud SQL PG17:** connection bằng unix socket
  `/cloudsql/<instance>` (built-in Cloud Run connector, không cần VPC);
  instance để public IP **không có authorized networks** (chỉ IAM/proxy với
  Cloud Run và SQL Admin API chạm được); backup hằng ngày + PITR 7 ngày +
  deletion protection.
- **D5 — ADK exposure:** `--allow-unauthenticated` ở tầng Cloud Run (web
  authenticate bằng static service token, không phải ID token) **+**
  `--ingress internal-and-cloud-internal` (không đường public) **+** token
  check fail-closed trong app khi `GON_ADK_ENV != local`. Ba lớp, khớp thiết
  kế R1.5.
- **D6 — Contracts vào image ADK tại build:** `40-deploy-adk.sh` stage
  `docs/04-contracts` (P03 locked) vào `apps/gon-adk/docs-contracts`
  (git-ignored) rồi mới `gcloud builds submit`; image chạy với
  `GON_CONTRACTS_DIR=/app/contracts`. P03 schema không bị copy trôi nguồn.
- **D7 — Secrets:** mọi giá trị nhạy cảm qua Secret Manager, runtime SA chỉ
  có `secretAccessor` từng secret; `DATABASE_URL` được dựng dạng socket URL
  và lưu sebagai secret; các giá trị sinh được (auth secret, salt, ADK token,
  invite code, GCS signer key) sinh tại chỗ, các giá trị **[PO]** (OAuth
  Google, Gemini key, outbox sink) để trống có hướng dẫn điền.
- **D8 — Observability là reference:** alert policies (5xx, p95, Cloud SQL
  up), uptime check, budget 50/90/100% viết qua Monitoring/Billing APIs với
  ngưỡng tạm cho staging — **PO phải review thresholds trên traffic thật**;
  script 70 không idempotent với policies (chạy lại sẽ tạo bản trùng).
- **D9 — DR drill có guard:** `80-restore-drill.sh` chỉ chạy với
  `CONFIRM_DRILL=yes`; clone từ point-in-time (không chạm instance chính),
  có đồng hồ RTO + checklist SQL xác minh; số RPO ≤ 24h / RTO ≤ 4h **chỉ được
  ghi sau khi drill thật** (D-P05-06).
- **D10 — Workflow thu hẹp còn build+push:** vì `gcp.env` cố tình không
  commit, deploy bằng script có audit; workflow chỉ đảm bảo phần build lặp
  lại được (WIF, dispatch-only, khoá repo + secrets — không ảnh hưởng fork,
  đúng tinh thần D-SB R1.14).

## 5. Map blocker P05 → package

| Blocker | Package đáp ứng | Trạng thái |
|---|---|---|
| B-P05-01 | `20-database.sh` (managed PG) + `10-storage.sh` (GCS) + `50-migrate.sh` (job) + `55-worker.sh` (worker + outbox sink) | **packaged, NOT RUN** |
| B-P05-02 | `45-deploy-web.sh` (Auth.js qua secrets, redirect URI in 30-secrets) | **packaged, NOT RUN** |
| B-P05-03 | `40-deploy-adk.sh` (ADK + Gemini thật) | **packaged, NOT RUN** |
| B-P05-05 | exports bucket retention 30 ngày (privacy export), legal review vẫn là việc PO | **packaged, NOT RUN** |
| B-P05-06 | `60-edge.sh` (LB + Cloud Armor policy R1.10) + budget alerts `70` | **packaged, NOT RUN** |
| B-P05-07 | `70-observability.sh` + `80-restore-drill.sh` | **packaged, NOT RUN** |
| B-P05-08 | chạy lại staging-checklist §5–§8 trên hạ tầng vừa dựng | **NOT RUN (đúng nghĩa)** |
| B-P05-09 | workflow build manual-dispatch + image tags từ git SHA | **packaged, NOT RUN** |

(B-P05-04 malware scan/parser sandbox không thuộc package hạ tầng — vẫn mở,
ghi nhận trong 06-nfr README §5.)

## 6. NOT RUN (trung thực)

- Mọi lệnh gcloud/Docker trong package: **chưa chạy lần nào**. Lần chạy đầu
  có thể cần chỉnh cú pháp nhỏ theo phiên bản gcloud — mọi chỉnh sửa ghi vào
  doc này như decision bổ sung.
- Không deploy, không DNS, không cert, không Go-Live, không phát sinh chi
  phí GCP nào từ slice này.
- CI runner: Actions của repo vẫn không spawn run từ `92f3092a` (23/10) —
  workflow mới cũng chưa được chạy thật.

## 7. Việc của PO để Go-Live

Theo `07-deployment/README.md`: GCP project + billing → điền `gcp.env` → điền
secrets [PO] → chạy 00→70 → DNS → ghi kết quả thật vào staging-checklist →
DR drill → quyết định Go-Live.
