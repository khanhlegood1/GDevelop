# GON Web production source — P04 VS1 increment + P05 hardening

Đây là Next.js/TypeScript modular monolith cho GON Private Alpha. Nó không thay thế các prototype tĩnh ở `../index.html` và `../ux-prototype/`; prototype được giữ làm bằng chứng P02/lịch sử, còn thư mục này là nơi triển khai contract P03.

> **Trạng thái:** P04 đã được PO duyệt ngày 22/10/2026 cho baseline local/test VS1 tại PR #13/head `76eac20`/merge `ef594de`. P05 đang **IN REVIEW — NOT YET PASS**. Source chạy end-to-end bằng memory UoW cho local/test và PostgreSQL normalized repositories cho `GON_STORE=postgres` sau khi migrations đã áp dụng; durable job/outbox primitives, queued Brew, Auth.js DB-session contract và private object-storage port đã được kiểm chứng trên PGlite/fake transport. Đây vẫn chưa phải production deployment vì worker process/sink đích thật, bucket/Google/managed staging thật, Gemini/ADK thật và P06 chưa hoàn tất. Xem [gói P05](../docs/06-nfr/README.md), [R1.3 evidence](../docs/06-nfr/P05-R1.3-DURABLE-JOBS-OUTBOX.md), [R1.4 evidence](../docs/06-nfr/P05-R1.4-AUTH-STAGING-OBJECT-STORAGE.md), [R1.5 evidence](../docs/06-nfr/P05-R1.5-WORKER-RUNTIME-ADK-INTEGRATION.md) (worker runtime/loop, outbox sink idempotent, TS→ADK stateless với `ai_runs`, evidence hermetic + live loopback local) và [R1.6 evidence](../docs/06-nfr/P05-R1.6-PERSISTENT-GUARDRAILS-RLS-TARGETED-QUERIES.md) (persistent quotas/budget reservations, kill switches, circuit breaker, targeted queries và RLS), [R1.7 evidence](../docs/06-nfr/P05-R1.7-PRIVACY-EXPORT-DELETE.md) (privacy export/delete, account lifecycle theo P03), [R1.8 evidence](../docs/06-nfr/P05-R1.8-UPLOAD-URL-SAFETY.md) (content-safety scanner, SSRF-safe URL fetcher), [R1.9 evidence](../docs/06-nfr/P05-R1.9-ASSESS-ATTEMPT-AI.md) (assess-attempt AI tích hợp qua provider port, 3-phase submitAttempt) và [R1.10 evidence](../docs/06-nfr/P05-R1.10-ABUSE-COST-DISTRIBUTED-CONTROLS.md) (token bucket per-IP/user, idempotent flood guard, budget alert hooks, edge module đóng gói NOT RUN) và [R1.11 evidence](../docs/06-nfr/P05-R1.11-OBSERVABILITY-BACKUP-DR.md) (structured logs có sanitize, readiness sâu migrations/outbox, backup/restore scripts + DR runbook — backup/DR drill NOT RUN chờ hạ tầng) và [R1.12 evidence](../docs/06-nfr/P05-R1.12-SUPPLY-CHAIN-QUALITY-GATES.md) (Python lock hash-verified + SBOM CycloneDX, governed exceptions thay `--ignore-vuln`, coverage gate chống hồi quy) và [R1.13 evidence](../docs/06-nfr/P05-R1.13-INDEXING-PHASE-TARGETED-PAGINATION.md) (Brew indexing embedding chạy ngoài Unit of Work, targeted pagination SQL ngoài UoW cho journeys/commits/XP/proofs).

## Cấu trúc

| Đường dẫn | Trách nhiệm |
|---|---|
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Entry/layout/CSS của VS1 UI |
| `components/Vs1App.tsx` | Màn hình sign-in/onboarding, project intake, Search/Brew, Output Explorer, Journey Player, Progress và Proof Vault |
| `components/Vs1App.stories.tsx` | Storybook stories chạy `Vs1App` thật với mock API theo từng trạng thái signed-out/onboarding/workspace/outputs/player/progress/proofs/lỗi/loading |
| `stories/gonFixtures.ts`, `stories/gonStorybookApi.ts` | Fixture DTO xác định và fetch mock chỉ dùng trong Storybook; mô phỏng envelope/page/Problem Details cùng chuyển trạng thái attempt/XP/proof mà không gọi backend thật |
| `stories/GonDesignSystem.stories.tsx`, `stories/Introduction.mdx` | Catalog token/pattern dùng CSS production và tài liệu ranh giới Storybook; chưa phải component library đã tách khỏi `Vs1App` |
| `../.storybook/` | Cấu hình Storybook 10 + Next.js/Vite, manager theme GON, preview tiếng Việt và CSS chỉ dành cho specimen |
| `lib/api.ts` | Browser client: envelope/Problem Details, CSRF, Idempotency-Key, SHA-256 upload |
| `app/v1/[...segments]/route.ts` | Mount `/v1` vào dispatcher phía server |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js handlers |
| `app/api/csrf/route.ts` | Double-submit CSRF cookie/token |
| `app/api/dev/session/route.ts` | Dev session chỉ khi không phải production và `GON_DEV_AUTH=1` |
| `app/api/local-uploads/[artifactId]/route.ts` | Authorize upload token trước, sau đó mới đọc bytes theo stream trong giới hạn đã khai báo cho local/memory/filesystem adapters; route bị vô hiệu khi storage là GCS |
| `server/routes.ts` | Dispatcher cho tập VS1 endpoints hiện đã implement |
| `server/service.ts` | `GonServiceCore` chứa domain rules trên repositories/object-storage port và async `GonService` facade mở một Unit of Work cho mỗi use case |
| `server/object-storage-config.ts` | Parse/validate `GON_OBJECT_STORAGE`, local directory và GCS service-account config không lộ secret |
| `server/object-storage.ts` | Private object-storage port; repository/memory/filesystem adapters và GCS V4 signed PUT, bounded download, resumable server-side put |
| `server/repositories.ts` | Boundary `GonRepositories`/`GonStore`, identity-map collections theo aggregate và capability Search tùy chọn |
| `server/memory-store.ts` | Local/test Unit-of-Work adapter: clone identity map, rollback khi lỗi, swap khi commit; không phải persistence production |
| `server/postgres-store.ts` | PostgreSQL Unit-of-Work adapter: load normalized aggregates, diff/flush theo FK order, serializable transaction và retry có giới hạn |
| `server/postgres-job-queue.ts` | Durable job claim/heartbeat/complete/fail/reconciler/stats bằng PostgreSQL lease và fencing |
| `server/postgres-outbox.ts` | Transactional outbox claim/publish/fail/stats; completion được fence bằng publish attempt và yêu cầu sink thật |
| `server/ai-provider.ts` | Cổng Brew AI (`BrewAiProvider`): local deterministic + HTTP client cho ADK stateless (`/v1/topic-check`, `/v1/generate-module`), telemetry `AiRun` an toàn, fail-closed bounded I/O |
| `server/adk-config.ts` | Compose provider từ env `GON_BREW_PROVIDER=local\|adk` fail-closed (queued mode, HTTPS, service token) |
| `server/outbox-sink.ts` | `HttpOutboxEventSink` (idempotency headers, bounded) + `EventIdDeduplicatingOutboxSink` + compose fail-closed từ env |
| `server/job-worker.ts` | Chạy một Brew job từ SQL queue vào domain xử lý đa-transaction (claim → AI calls ngoài DB → apply), có heartbeat lease tùy chọn; `runNextPostgresBrewJob` là entry one-shot |
| `server/worker-runtime.ts` | Worker invocation/loop có heartbeat, graceful shutdown (SIGTERM/SIGINT) và concurrency budget; outbox consumer loop idempotent chạy song song |
| `server/artifacts.ts` | Giới hạn intake, URL safety, magic-byte/MIME checks và chunking |
| `server/module-graph.ts` | AJV + semantic validation cho `gon.module-graph/1.0`, local graph, player projection không lộ đáp án |
| `server/assessment.ts` | Deterministic rubric, disclosure và human-review safeguards |
| `server/embeddings.ts` | Biên `gon-semantic-v1` 768D; local hash provider và Gemini adapter chưa có bằng chứng chạy thật |
| `server/auth-config.ts`, `auth.ts`, `actor.ts` | Auth.js options có thể test độc lập: verified Google profile, persisted-ID identity provisioning ở `events.signIn`, allow-listed session response và actor resolution server-side |
| `server/http.ts` | Request ID, envelope, Problem Details, same-origin/CSRF, streamed body limits, proxy-header trust có điều kiện, If-Match/Idempotency-Key parsing |
| `server/db.ts` | `pg.Pool` dùng chung cho Auth.js adapter/domain store với timeout/TLS bounds, redacted pool-error log, schema-aware readiness và close helper |
| `server/postgres-search.ts` | PostgreSQL hybrid Search repository; authorization trước candidate limit và được thực thi bằng savepoint trong Unit of Work |
| `server/health.ts` | Liveness/readiness semantics có thể test bằng dependency injection; production phải qua runtime + PostgreSQL schema + Google/Auth secret/database sessions + GCS checks |
| `server/runtime.ts` | Composition root: chọn memory/PostgreSQL store và memory/filesystem/GCS object storage tường minh; thiếu cấu hình durable trong production thì fail-fast/readiness fail-closed |

## Chạy local

```bash
cd apps/gon-web
npm install
GON_STORE=memory \
GON_DEV_AUTH=1 \
GON_DEV_INVITE_CODE='replace-with-a-local-test-code' \
AUTH_SECRET='replace-with-a-local-secret' \
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Dev Auth bị tắt trong `NODE_ENV=production` kể cả khi đặt biến môi trường. Production build có thể render UI và Auth boundary, nhưng domain API dùng memory sẽ fail-closed nếu không có `GON_ALLOW_MEMORY_STORE_IN_PRODUCTION=1`. Override này chỉ dành cho môi trường cô lập không chứa dữ liệu thật; nó không biến memory thành persistence production.

## Storybook custom cho GON

Storybook dùng `Vs1App` và CSS production nhưng thay toàn bộ API bằng fixture/mock deterministic trong trình duyệt. Nó phù hợp để rà soát signed-out, onboarding 18+, workspace, Search/Brew, Output Explorer, Journey Player, Lifelong Progress, Proof Vault, lỗi bootstrap và loading mà không cần Google/PostgreSQL/GCS/Gemini/ADK thật.

```bash
cd apps/gon-web
npm ci
npm run storybook
# mở http://localhost:6006
npm run storybook:build
npm run storybook:smoke
```

`storybook-static/` là artifact build và đã được ignore. Storybook không phải bằng chứng staging/production, không thay đổi trạng thái P05 **IN REVIEW — NOT YET PASS** và không phải quyết định bắt đầu P06/Go-Live. Phân tích phạm vi ảnh hưởng và các quyết định core GDevelop chờ PO chốt sau production được ghi tại [Storybook scope, impact & core decision](../docs/05-build/STORYBOOK-SCOPE-IMPACT-AND-CORE-DECISION.md) (`D-SB-01`…`D-SB-06`).

Kiểm chứng:

```bash
npm test
npm run test:postgres
npm run typecheck
npm run build
npm run storybook:build
npm run db:check
```

## Biến môi trường chính

| Biến | Ý nghĩa hiện tại |
|---|---|
| `GON_STORE=memory|postgres` | `memory` chỉ cho local/test. `postgres` dùng domain Unit-of-Work trên PostgreSQL và yêu cầu `DATABASE_URL` + migrations đã áp dụng; cấu hình sai sẽ throw thay vì fallback. |
| `GON_ALLOW_MEMORY_STORE_IN_PRODUCTION` | Mặc định tắt. Chỉ bật cho môi trường production-build cô lập không có dữ liệu thật; không dùng cho Private Alpha thật. |
| `DATABASE_URL` | Connection dùng cho Auth.js PG adapter/database sessions và domain repositories khi `GON_STORE=postgres`; web runtime không tự chạy migrations. |
| `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` hoặc `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` | Google OAuth credentials cho Auth.js. |
| `AUTH_SECRET` hoặc `NEXTAUTH_SECRET` | Secret của Auth.js. |
| `AUTH_TRUST_HOST` | Production mặc định không tin forwarded host. Chỉ bật sau khi P06 chứng minh edge proxy ghi đè các forwarded headers. |
| `GON_OBJECT_STORAGE=memory\|filesystem\|gcs` | Mặc định `memory` cho local/test. Production yêu cầu `gcs`; `filesystem` chỉ durable trên cùng host/PVC và không đạt production readiness. |
| `GON_LOCAL_OBJECT_DIR` | Thư mục gốc bắt buộc khi dùng filesystem adapter; object key bị khóa dưới root này. |
| `GON_GCS_BUCKET`, `GON_GCS_SERVICE_ACCOUNT_EMAIL`, `GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY` | Private bucket và service-account signer cho GCS V4 signed PUT/metadata/download/delete. Private key nhận PEM newline thật hoặc literal `\n`; không commit secret thật. Bucket vẫn phải cấu hình IAM/CORS/lifecycle ngoài repo. |
| `GON_TRUST_PROXY_HEADERS` | Mặc định tắt. Chỉ bật khi proxy tin cậy tự đặt `X-Forwarded-Host/Proto`; không bật cho traffic trực tiếp từ client. |
| `GON_PUBLIC_ORIGIN` | Origin công khai dạng `https://...` không path/query; khi hợp lệ sẽ được ưu tiên hơn request host để tạo upload URL. |
| `GON_REQUIRE_INVITE` | Mặc định bật; invite chỉ lưu SHA-256 hash. |
| `GON_DEV_AUTH=1` | Chỉ có hiệu lực ngoài production. |
| `GON_DEV_INVITE_CODE` | Seed một invite cho local dev; không dùng secret/code thật trong repo. |
| `GON_BREW_ENABLED` | Kill switch Brew phía domain service. |
| `GON_BREW_EXECUTION_MODE=inline|queued` | Mặc định `inline`. `queued` chỉ persist durable Brew job và cần worker gọi `runNextPostgresBrewJob`/domain worker method; không bật ở môi trường chưa có worker vận hành. |
| `GON_EMBEDDING_PROVIDER=local|gemini` | Mặc định local deterministic. `gemini` yêu cầu `GEMINI_API_KEY` hoặc `GOOGLE_API_KEY`, nhưng chưa được kiểm chứng bằng call thật. |
| `GON_TREND_ENABLED`, `GON_GAME_EVENTS_ENABLED` | Mặc định tắt cho VS1. |

## Ranh giới không được phá

1. Client không bao giờ được tự khai `ownerUserId`, XP, mastery, proof level hay publication status.
2. Mọi mutation browser đi qua same-origin + CSRF; command có Idempotency-Key theo dispatcher/contract.
3. Player graph không chứa scoring internals và chỉ lộ sample answer theo reveal policy.
4. Module do Brew tạo luôn bắt đầu `draft_private`; không auto-publish.
5. External proof không được nâng lên Issuer-verified bởi client.
6. Artifact `metadata_only` không được trình bày như đã đọc transcript/nội dung chính.
7. PDF hiện là `unsupported`; ảnh là `metadata_only`; URL chưa fetch ngoài trong increment local.
8. PostgreSQL là canonical target theo ADR-0006. Domain repositories, durable queues, Auth adapter/session và object-storage boundary đã chạy trên PGlite/PostgreSQL WASM/fake transport qua R1.2–R1.4, nhưng chưa được coi là staging/production evidence cho tới khi lặp lại trên managed PostgreSQL + Google OAuth + private GCS với dữ liệu/tải đại diện, TLS/IAM/CORS, backup/restore và RLS/role policy đã chốt.
9. ADK là worker không trạng thái ở [`../../gon-adk/README.md`](../../gon-adk/README.md); nó không có quyền DB/publish.

## Phần chưa implement trong dispatcher

OpenAPI P03 rộng hơn increment VS1 hiện tại. Chưa có hoặc chưa hoàn chỉnh: profile/data-request endpoints, artifact/Brew retry-cancel đầy đủ, Arena, game session/events, admin/moderation workflow, trend/creator analytics, worker process/outbox sink production, external fetch/extraction/OCR/transcript và các slice VS2–VS5. Durable job/outbox primitives và queued Brew đã có ở R1.3, nhưng chưa phải deployment worker hoàn chỉnh. Endpoint chưa hỗ trợ phải trả Problem Details thay vì giả vờ thành công.
