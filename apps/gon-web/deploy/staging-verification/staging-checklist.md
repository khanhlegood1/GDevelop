# GON Staging Verification Checklist — P06 runbook (P05-R1.15 package)

> **Mục đích:** checklist thực thi **có thể chạy lại** để đóng các blocker
> P05 (`B-P05-01`…`B-P05-09`) trên **staging thật** khi PO cấp hạ tầng
> (managed PostgreSQL, GCS bucket, Google OAuth credentials, Gemini/ADK key,
> Cloud Run). Mỗi mục ghi: điều kiện tiên quyết, bước chạy, tiêu chí đạt.
>
> **Trạng thái: NOT RUN.** Sandbox phát triển không có hạ tầng thật; mọi kết
> quả local/hermetic nằm trong
> [P05-R1.15 evidence](../../docs/06-nfr/P05-R1.15-STAGING-VERIFICATION-PACKAGE.md).
> Không mục nào dưới đây được coi là đã đạt trước khi có output đính kèm từ
> staging.

## 0. Tiên quyết hạ tầng (do PO cung cấp)

| # | Mục | Ghi chú |
|---|---|---|
| 0.1 | Project GCP + billing, service accounts theo nguyên tắc least-privilege | Runbook roles/IAM: `docs/06-nfr/P05-R1.6-PERSISTENT-GUARDRAILS-RLS-TARGETED-QUERIES.md` §4.4 |
| 0.2 | Cloud SQL PostgreSQL (pgvector + pg_trgm + unaccent) hoặc PostgreSQL tương đương | Version ≥ migrations 0001–0010 đã verify trên PGlite |
| 0.3 | GCS bucket riêng staging (private, CORS cho origin staging) | `P05-R1.4` storage port |
| 0.4 | Google OAuth client (redirect URI staging HTTPS) + Auth DB table | `P05-R1.4` auth contract |
| 0.5 | Gemini API key / Vertex credentials cho `gon-adk` | `P05-R1.5` TS→ADK→Gemini |
| 0.6 | Cloud Run service (web) + worker (job) hoặc môi trường tương đương | `GON_STORE=postgres` bắt buộc; memory guard fail-closed |
| 0.7 | Secrets: `DATABASE_URL`, `AUTH_SECRET`, `GON_ABUSE_HASH_SALT`, `GON_ADK_*`, `GCS_*` | Đặt qua Secret Manager, không qua file |

## 1. Triển khai & migrations (B-P05-01)

```bash
# từ apps/gon-web sau khi build:
GON_MIGRATIONS_DIR=./db/migrations DATABASE_URL=... npm run db:migrate
DATABASE_URL=... node scripts/check-migrations.mjs   # kỳ vọng: 10 files applied
curl -fsS https://<staging>/readyz                    # kỳ vọng: 200 + {"status":"ok"}
```

**Đạt khi:** 10 migrations apply sạch (ledger `gon_schema_migrations` đủ 10
dòng, checksum khớp); `/readyz` 200; sai lệch bất kỳ = FAIL (không sửa data
thủ công — rollback theo migration).

## 2. Domain/queue/outbox/RLS trên managed PostgreSQL (B-P05-01, B-P05-03 một phần)

- Chạy `npm run test:postgres` chống `DATABASE_URL` staging **test database
  riêng** (PGlite tests hiện tại hermetic — staging cần DB disposable).
- Verify RLS: chạy 2 lượt probe cross-tenant từ
  `tests/integration/postgres-guardrails-rls.test.ts` pattern với 2 user thật.
- Worker: deploy worker loop (`runNextPostgresBrewJob`), stopkill giữa job,
  xác nhận lease reconciliation phục hồi job sau khi lease hết hạn.
- Outbox publisher chạy ≥ 1h; sink nội bộ nhận events, không duplicate
  (dedupe theo `eventId`), `publish_state` chuyển `published`.

## 3. Google Auth E2E (B-P05-02)

1. First sign-in Google (user mới) → onboarding 18+/consent → active.
2. Sign-out → session cookie vô hiệu; sign-in lại → cùng `userId` (identity
   mapping đúng).
3. Revoke session từ DB → request tiếp theo 401 `AUTH_REQUIRED`.
4. Invite hết hạn/đã dùng → `AGE_ATTESTATION_REQUIRED`; suspended user →
   403 đúng ladder (xem `P05-R1.13` §2.2 auth ladder).

## 4. TS → ADK → Gemini thật (B-P05-03)

- `GON_ADK_PROVIDER=google` + credentials thật; chạy 1 Brew E2E từ input
  YouTube/URL/text → `ai_runs` có telemetry (model, cost, latency), module
  graph pass `validateModuleGraph`, citations đúng evidence.
- Deliberate failure test: sai key → fail-closed `ADK_AUTH_FAILED` (không
  fallback local provider); timeout → retryable, không duplicate module
  (checkpoint R1.13).
- Search: `S-P03-01` hybrid search trên corpus đại diện (≥ 20k chunks) + ghi
  EXPLAIN/litterature vào evidence P06.

## 5. Abuse controls phân tán (B-P05-06)

- Chạy `deploy/staging-verification/run-local-probes.sh --base-url https://<staging>`
  **với sửa đổi**: bỏ start_server local (dùng server staging), phase 2–3
  chỉ chạy khi PO chấp nhận nới guard qua env staging; phase 1 + 4 chạy với
  policy deployed.
- Xác nhận `RATE_LIMITED` 429 + `Retry-After` từ **nhiều IP** (bucket per-IP
  độc lập); xác nhận penalty box hết hạn sau block window.
- Edge (Cloud Armor/nginx/Cloudflare) policy từ `deploy/edge-rate-limit/` áp
  tại LB; ghi kết quả throttling quan sát được.

## 6. DAST/load/accessibility trên staging (B-P05-08)

- **DAST:** OWASP ZAP baseline+active scan against staging origin (thay cho
  probe local 7/7); không finding High/Critical chưa được PO chấp nhận.
- **Load:** k6/`http_benchmark.py` (relaxed guards) 30 phút, ≥ 50 VU, p95
  mục tiêu theo `NFR-SPECIFICATION-AND-RESULTS.md` (PERF-01: p95 ≤ 500ms
  non-AI read; PERF-02: search accept ≤ 300ms) — trên PostgreSQL thật.
- **Accessibility:** axe-core trên các màn hình VS1 (signed-out, onboarding,
  search/brew, workspace, player, progress, proof) — target WCAG 2.2 AA.
- **Browser Web Vitals:** LCP/INP/CLS trên thiết bị tham chiếu (PERF-05).

## 7. Backup/restore/DR drill (B-P05-07)

- `pg_dump` custom + sha256 (script `scripts/backup/`) → scratch restore →
  `readyz` OK + smoke journey E2E trên DB restore.
- Đo RPO/RTO thực tế; so với mục tiêu RPO ≤ 24h / RTO ≤ 4h đã duyệt
  (`P05-R1.11` §6 drill table — đang trống, staging phải điền).
- Rehearse rollback 1 migration (0009→0008 pattern) trên DB disposable.

## 8. Privacy/retention (B-P05-05)

- Export data request → JSON đầy đủ (projects/artifacts/journeys/attempts/
  proofs/footprint); delete request → anonymize + receipts đúng `P05-R1.7`.
- Chạy retention job (nếu có lịch) 1 vòng; legal review 18+ self-attestation
  + policy versions được PO ký kết thúc.

## 9. Supply chain / release (B-P05-09)

- CI trên staging deploy: `npm ci` + `pip install --require-hashes -r
  requirements.lock` đúng path; `check-exceptions.py` xanh; SBOM regenerate
  khớp `requirements.lock`.
- Secrets scan trên repo + image; image build reproducible (ghi digest).

## 10. Ký kết P06

Mỗi mục trên khi chạy phải đính: lệnh chạy, output thô, ngày, người chạy.
PO duyệt từng mục → khi đủ, PO ra quyết định Go-Live riêng (P06 gate).
