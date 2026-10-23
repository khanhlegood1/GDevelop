# GON Web production source — P04 VS1 increment + P05 hardening

Đây là Next.js/TypeScript modular monolith cho GON Private Alpha. Nó không thay thế các prototype tĩnh ở `../index.html` và `../ux-prototype/`; prototype được giữ làm bằng chứng P02/lịch sử, còn thư mục này là nơi triển khai contract P03.

> **Trạng thái:** P04 đã được PO duyệt ngày 22/10/2026 cho baseline local/test VS1 tại PR #13/head `76eac20`/merge `ef594de`. P05 đang **IN REVIEW — NOT YET PASS**. Source vẫn chạy end-to-end bằng memory store và deterministic adapters; đây chưa phải production deployment vì PostgreSQL repository, durable queue, Gemini/ADK thật, Google credentials thật và P06 chưa hoàn tất. Xem [gói P05](../docs/06-nfr/README.md).

## Cấu trúc

| Đường dẫn | Trách nhiệm |
|---|---|
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Entry/layout/CSS của VS1 UI |
| `components/Vs1App.tsx` | Màn hình sign-in/onboarding, project intake, Search/Brew, Output Explorer, Journey Player, Progress và Proof Vault |
| `lib/api.ts` | Browser client: envelope/Problem Details, CSRF, Idempotency-Key, SHA-256 upload |
| `app/v1/[...segments]/route.ts` | Mount `/v1` vào dispatcher phía server |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js handlers |
| `app/api/csrf/route.ts` | Double-submit CSRF cookie/token |
| `app/api/dev/session/route.ts` | Dev session chỉ khi không phải production và `GON_DEV_AUTH=1` |
| `app/api/local-uploads/[artifactId]/route.ts` | Authorize upload token trước, sau đó mới đọc bytes theo stream trong giới hạn đã khai báo cho local signed-upload simulation |
| `server/routes.ts` | Dispatcher cho tập VS1 endpoints hiện đã implement |
| `server/service.ts` | Domain service đồng bộ cho increment đầu: identity, project/artifact, search, Brew local, candidates/ranking, journey/attempt, mastery/XP/proof/report |
| `server/memory-store.ts` | Local/test store; không phải persistence production |
| `server/artifacts.ts` | Giới hạn intake, URL safety, magic-byte/MIME checks và chunking |
| `server/module-graph.ts` | AJV + semantic validation cho `gon.module-graph/1.0`, local graph, player projection không lộ đáp án |
| `server/assessment.ts` | Deterministic rubric, disclosure và human-review safeguards |
| `server/embeddings.ts` | Biên `gon-semantic-v1` 768D; local hash provider và Gemini adapter chưa có bằng chứng chạy thật |
| `server/auth.ts`, `actor.ts` | Auth.js Google boundary và actor resolution từ session server-side |
| `server/http.ts` | Request ID, envelope, Problem Details, same-origin/CSRF, streamed body limits, proxy-header trust có điều kiện, If-Match/Idempotency-Key parsing |
| `server/db.ts` | Optional `pg.Pool` cho Auth.js adapter với timeout/TLS bounds, redacted pool-error log, readiness ping và close helper |
| `server/postgres-search.ts` | Production PostgreSQL hybrid Search repository; authorization trước candidate limit, chưa wired vào `GonService` cho tới R1.2 |
| `server/health.ts` | Liveness/readiness semantics có thể test bằng dependency injection |
| `server/runtime.ts` | Singleton local service; `GON_STORE=postgres` cố tình fail-fast vì repository chưa wired; memory bị cấm trong production nếu không có override cô lập tường minh |

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

Kiểm chứng:

```bash
npm test
npm run typecheck
npm run build
npm run db:check
```

## Biến môi trường chính

| Biến | Ý nghĩa hiện tại |
|---|---|
| `GON_STORE=memory` | Store duy nhất đã wired. Giá trị `postgres` sẽ throw thay vì fallback. |
| `GON_ALLOW_MEMORY_STORE_IN_PRODUCTION` | Mặc định tắt. Chỉ bật cho môi trường production-build cô lập không có dữ liệu thật; không dùng cho Private Alpha thật. |
| `DATABASE_URL` | Bật Auth.js PG adapter/database sessions và là điều kiện để chạy migration; chưa bật domain repository. |
| `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` hoặc `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` | Google OAuth credentials cho Auth.js. |
| `AUTH_SECRET` hoặc `NEXTAUTH_SECRET` | Secret của Auth.js. |
| `AUTH_TRUST_HOST` | Production mặc định không tin forwarded host. Chỉ bật sau khi P06 chứng minh edge proxy ghi đè các forwarded headers. |
| `GON_TRUST_PROXY_HEADERS` | Mặc định tắt. Chỉ bật khi proxy tin cậy tự đặt `X-Forwarded-Host/Proto`; không bật cho traffic trực tiếp từ client. |
| `GON_PUBLIC_ORIGIN` | Origin công khai dạng `https://...` không path/query; khi hợp lệ sẽ được ưu tiên hơn request host để tạo upload URL. |
| `GON_REQUIRE_INVITE` | Mặc định bật; invite chỉ lưu SHA-256 hash. |
| `GON_DEV_AUTH=1` | Chỉ có hiệu lực ngoài production. |
| `GON_DEV_INVITE_CODE` | Seed một invite cho local dev; không dùng secret/code thật trong repo. |
| `GON_BREW_ENABLED` | Kill switch Brew phía domain service. |
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
8. PostgreSQL là canonical target theo ADR-0006. Schema/migration nằm ở [`../db/README.md`](../db/README.md), nhưng repository phải được implement và chạy contract tests trên database thật trước khi đổi runtime mặc định.
9. ADK là worker không trạng thái ở [`../../gon-adk/README.md`](../../gon-adk/README.md); nó không có quyền DB/publish.

## Phần chưa implement trong dispatcher

OpenAPI P03 rộng hơn increment VS1 hiện tại. Chưa có hoặc chưa hoàn chỉnh: profile/data-request endpoints, artifact/Brew retry-cancel đầy đủ, Arena, game session/events, admin/moderation workflow, trend/creator analytics, durable jobs/outbox publisher, external fetch/extraction/OCR/transcript và các slice VS2–VS5. Endpoint chưa hỗ trợ phải trả Problem Details thay vì giả vờ thành công.
