# P05-R1.1 — PostgreSQL Foundation, Hybrid Search Repository và CI Gates

> **Ngày thực hiện:** 23/10/2026<br>
> **Baseline:** merge PR #14 tại `cad7d9fc810b68d1969bc5615f5a41fea88d64d0`<br>
> **Trạng thái sau lát cắt:** **P05 vẫn IN REVIEW — NOT YET PASS**<br>
> **Mục tiêu:** chuyển PostgreSQL từ trạng thái “schema tĩnh/NOT RUN” sang bằng chứng thực thi được, đồng thời tạo nền repository/readiness/CI cho các lát cắt P05-R1 tiếp theo. Lát cắt này **không** tuyên bố domain runtime đã dùng PostgreSQL.

## 1. Đã triển khai

### 1.1 PostgreSQL execution bằng PGlite

- Thêm dev-only dependencies `@electric-sql/pglite@0.5.11` và `@electric-sql/pglite-pgvector@0.0.12`.
- Integration test `tests/integration/postgres-hybrid-search.test.ts` khởi tạo PostgreSQL 18.6 dạng WASM với `pgcrypto`, `pg_trgm`, `unaccent` và `vector`, sau đó áp dụng toàn bộ sáu migrations.
- Test kiểm chứng trên engine PostgreSQL thật:
  1. migrations và extensions hoạt động;
  2. authorization nằm trước vector candidate `LIMIT` bằng fixture 11 module riêng tư của người khác có vector gần hơn module của actor;
  3. vector + lexical FTS + concept coverage kết hợp đúng;
  4. module của người khác chỉ searchable sau `internal_reviewed`;
  5. tombstone chunk làm module biến mất khỏi Search.
- Trong sandbox, `db:migrate` và `spike:search` cũng đã chạy qua PostgreSQL wire protocol tới PGlite socket; S-P03-01 fixture trả `passed`. Harness socket chỉ là bằng chứng phụ trong sandbox, không phải dependency runtime.

PGlite là hermetic test harness. Nó không chứng minh Cloud SQL/managed PostgreSQL latency, IAM, TLS, backup hoặc network behavior.

### 1.2 Production hybrid Search repository

Thêm `src/server/postgres-search.ts`:

- interface executor tối thiểu tương thích `pg` Pool/Client và PGlite test harness;
- validate actor, query text, concept IDs, limit/candidate pool và embedding đúng 768D/finite/non-zero;
- candidate generation riêng cho vector, lexical và concepts;
- authorization filter trong `authorized_chunks` trước mọi candidate `ORDER BY ... LIMIT`;
- chỉ dùng profile `gon-semantic-v1`, vector 768D đã normalized;
- tính vector/lexical/concept/specificity/quality/hybrid theo cùng trọng số nền của VS1;
- trả `SearchResultRecord` nội bộ, không trả raw vector ra API.

Repository chưa được nối vào `GonService` vì identity/project/artifact/module write repositories vẫn chưa có. Không bật một “PostgreSQL mode” nửa vời có thể đọc dữ liệu không tồn tại hoặc fallback âm thầm về memory.

### 1.3 Database pool và readiness

`src/server/db.ts` nay có:

- validate `DATABASE_URL` scheme mà không echo secret trong error;
- giới hạn pool, idle/connection/statement/query timeout qua env có bounds;
- `application_name`, keep-alive và TLS mode tường minh (`disable`, `require`, `verify-ca`, `verify-full`);
- pool error log chỉ gồm event/error name/code, không log message/connection details;
- readiness ping có timeout và hàm đóng pool.

Thêm:

- `GET /healthz`: liveness tối thiểu;
- `GET /readyz`: chỉ trả `ready`/`not_ready` cho load balancer, không lộ topology;
- readiness nội bộ vẫn trả `not_ready` khi `GON_STORE=postgres` vì domain repositories chưa wired, kể cả khi database ping thành công.

### 1.4 CI gates

Thêm `.github/workflows/gon-ci.yml` với ba job path-filtered:

- **GON Web:** `npm ci`, unit tests, PostgreSQL integration tests, legacy tests, typecheck, `db:check`, production build và `npm audit --audit-level=high`;
- **GON ADK:** pytest, `pip check`, `pip-audit` với ngoại lệ hẹp cho `CVE-2026-114603`, Bandit gating ở mức high;
- **GON Contracts:** P03 validator bằng `openapi-spec-validator==0.8.2`.

Workflow đã được parse kiểm tra cục bộ. Nó chưa được coi là “required check đã khóa” cho tới khi branch protection trên GitHub được cấu hình và một PR chạy xanh trên GitHub Actions.

### 1.5 Lỗi thật đã phát hiện và sửa

Fixture `spike-hybrid-search.mjs` trước đây insert `module_versions` thiếu cột bắt buộc `graph_schema_version`; trên PostgreSQL thật nó sẽ fail. Lỗi đã được sửa ở cả spike và integration fixture.

## 2. Bằng chứng đã chạy trong lát cắt

| Kiểm chứng | Kết quả |
|---|---|
| `npm run test:postgres` | **5/5 passed** trên PGlite/PostgreSQL 18.6 + pgvector |
| `DATABASE_URL=<PGlite socket> npm run db:migrate` | Áp dụng đủ 6 migrations |
| `DATABASE_URL=<PGlite socket> npm run spike:search` | **S-P03-01 fixture passed**, latency fixture 8,03 ms — không phải production latency |
| `npm test` | Web production tests tăng lên **38/38 passed** |
| `npm run typecheck` | Passed sau khi sửa test typings |
| `npm run build` | Passed; route list có `/healthz` và `/readyz` |
| Production HTTP smoke | `/healthz` → 200; `/readyz` → 503 đúng kỳ vọng khi chưa có durable domain store |

## 3. Tác động lên blocker P05

| Blocker | Trạng thái sau R1.1 |
|---|---|
| B-P05-01 PostgreSQL/storage/queue | **Partial:** migrations + Search repository đã thực thi; domain write repositories, object storage và durable queue vẫn mở |
| B-P05-03 S-P03-01/S-P03-03 + AI | **Partial:** S-P03-01 fixture passed trên PGlite; managed PostgreSQL/representative corpus và Gemini/ADK vẫn NOT RUN |
| B-P05-07 Observability/DR | **Partial:** có liveness/readiness và DB ping; metrics/traces/alerts/backup/restore vẫn mở |
| B-P05-09 CI/supply chain | **Partial:** workflow đã có; branch protection, Python lock/hashes, SBOM và đóng CVE vẫn mở |
| B-P05-02/04/05/06/08 | Chưa đóng bởi lát cắt này |

## 4. Lát cắt tiếp theo được khuyến nghị

**P05-R1.2 — Domain repository boundaries:** tách `GonService` khỏi Map trực tiếp theo aggregate, implement PostgreSQL repositories và Unit of Work cho identity/onboarding → project/artifact/chunk → Search/Brew → journey/attempt/XP/proof, sau đó chạy cùng bộ service tests trên memory và PostgreSQL. Chỉ khi toàn bộ đường VS1 chạy trên PostgreSQL mới được phép bật `GON_STORE=postgres` cho staging.

Sau R1.2 mới tới durable outbox/queue, object storage, Auth E2E và staging verification. P06 vẫn chưa bắt đầu.
