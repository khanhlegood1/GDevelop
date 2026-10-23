# P05 — NFR & Well-Architected Review

> **Trạng thái gate:** **IN REVIEW — CHƯA ĐẠT / NOT YET PASS**<br>
> **Baseline được PO duyệt cho P04:** PR #13, implementation head `76eac200703ea0ac72907b43989b5a3dc73308d2`, merge commit `ef594dea3512f32dabe5c88b83ee6cb4ab24cc62`<br>
> **Ngày PO duyệt P04 và cho phép bắt đầu P05:** 22/10/2026<br>
> **P06:** **CHƯA BẮT ĐẦU** và chưa có quyết định Go-Live<br>
> **Kết luận P05 hiện tại:** bản VS1 local/test có nhiều kiểm soát đúng hướng và đã được tăng cường thêm trong vòng review này, nhưng **chưa đủ bằng chứng production** về PostgreSQL/queue/storage, Google Auth thật, Gemini/ADK thật, tải, backup/restore, observability và quyền riêng tư. Không được suy diễn kết quả local thành production readiness.

## 1. Cách đọc gói P05

P05 được thực hiện trên đúng baseline P04 đã merge. Các thay đổi hardening trong vòng review này là thay đổi mới trên nhánh P05, không viết lại lịch sử bằng chứng P04.

Tài liệu chi tiết:

1. [Đặc tả NFR và kết quả đo](NFR-SPECIFICATION-AND-RESULTS.md)
2. [Threat model, kiểm chứng bảo mật và findings](SECURITY-THREAT-MODEL-AND-VERIFICATION.md)
3. [Performance, Accessibility và AI Evaluation](PERFORMANCE-ACCESSIBILITY-AND-AI-EVALUATION.md)
4. [Reliability, Observability, DR và Well-Architected gaps](RELIABILITY-OBSERVABILITY-AND-WELL-ARCHITECTED.md)
5. Công cụ tái lập local:
   - [`scripts/http_benchmark.py`](scripts/http_benchmark.py) — benchmark HTTP local có giới hạn rõ;
   - [`scripts/http_security_probe.py`](scripts/http_security_probe.py) — DAST-equivalent probes cho auth/CSRF/origin/body limit/headers.
6. Remediation sau vòng review gốc:
   - [P05-R1.1 — PostgreSQL Foundation, Hybrid Search Repository và CI Gates](P05-R1-POSTGRES-FOUNDATION.md);
   - [P05-R1.2 — Domain Repository Boundaries & Unit of Work](P05-R1.2-DOMAIN-REPOSITORIES-UNIT-OF-WORK.md);
   - [P05-R1.3 — Durable Jobs & Transactional Outbox](P05-R1.3-DURABLE-JOBS-OUTBOX.md);
   - [P05-R1.4 — Auth Staging Contract & Private Object Storage](P05-R1.4-AUTH-STAGING-OBJECT-STORAGE.md);
   - [P05-R1.5 — Worker runtime & ADK integration](P05-R1.5-WORKER-RUNTIME-ADK-INTEGRATION.md);
   - [P05-R1.6 — Persistent guardrails, targeted queries & RLS](P05-R1.6-PERSISTENT-GUARDRAILS-RLS-TARGETED-QUERIES.md);
   - [P05-R1.7 — Privacy export/delete & account lifecycle](P05-R1.7-PRIVACY-EXPORT-DELETE.md);
   - [P05-R1.8 — Upload/URL safety hardening](P05-R1.8-UPLOAD-URL-SAFETY.md).

> Scorecard và bảng bằng chứng gốc bên dưới là snapshot của vòng P05 review. R1.1–R1.6 đã cải thiện một phần PostgreSQL/Search/readiness/CI/queue/Auth contract/object-storage boundary/worker runtime/outbox sink/TS→ADK wiring/persistent quotas/kill switches/circuit breaker/targeted queries/RLS, nhưng chưa đóng các blocker Google/GCS/managed staging, worker deployment, Gemini thật và DR; kết luận gate vẫn **NOT YET PASS**.

Mức bằng chứng dùng trong toàn bộ gói:

| Nhãn | Nghĩa |
|---|---|
| **Automated local** | Test/scan/HTTP probe đã chạy trong sandbox trên memory/local adapters |
| **Manual source review** | Đọc code/config/schema và truy vết đường đi dữ liệu/quyền |
| **Design only** | P03/migration/ADR đã mô tả nhưng runtime chưa nối hoặc chưa chạy |
| **NOT RUN** | Chưa có môi trường/credential/dữ liệu để kết luận |
| **Production evidence** | Chỉ tính khi chạy trên staging/production-like với PostgreSQL, Auth DB, storage/queue, Gemini/ADK và dữ liệu đại diện |

## 2. Scorecard tóm tắt

| Hạng mục | Bằng chứng local hiện có | Bằng chứng production | Phán quyết P05 |
|---|---|---|---|
| Functional/NFR regression | Web 30/30, legacy 14/14, ADK 11/11, typecheck/build đạt | Chưa có staging | **Local pass; production chưa kết luận** |
| Application security | Owner checks, CSRF, idempotency, bounded bodies, headers, DAST-equivalent 7/7 | Chưa có staging DAST/pentest/Auth thật | **Chưa đạt để Go-Live** |
| Dependency/secret/SAST | npm Audit 0; Python runtime có 1 CVE transitive; Bandit 1 medium; secret scan chỉ có placeholder/test fixture | Chưa có CI gate/SBOM đã khóa | **Có ngoại lệ cần xử lý** |
| Search/Brew/AI quality | Contract/citation/human-review safeguards chạy local | Gemini/ADK thật và golden evaluation **NOT RUN** | **Blocker** |
| Performance | Local dev benchmark 1 user/1 project; bundle khoảng 192 KB gzip | PostgreSQL/pgvector, load, browser Web Vitals **NOT RUN** | **Blocker** |
| Accessibility | Static Audit, contrast các cặp màu chính > 4.5:1, tab pattern đã sửa | axe/browser/screen-reader test **NOT RUN** | **Chưa đạt WCAG evidence** |
| Reliability/DR | Migration SQL/checksum/advisory lock ở mức thiết kế/static | PostgreSQL execution, backup/restore, queue recovery **NOT RUN** | **Blocker** |
| Observability | requestId, Problem Details, outbox/audit records trong memory | Metrics/traces/dashboards/alerts/runbooks chưa có | **Blocker** |
| Privacy | Consent/age/private-by-default ở VS1 | Export//age/private-by-default ở VS1 | Export/delete/retention jobs và rà soát pháp lý chưa hoàn tất | **Blocker** |

## 3. Hardening đã thực hiện trong vòng P05

Các điểm sau đã được sửa và có test hồi quy:

1. **Bounded request bodies:** Web JSON và ADK JSON không còn đọc toàn bộ body trước khi áp giới hạn; local upload được authorize trước khi đọc bytes và bị giới hạn bởi kích thước đã khai báo/tối đa 25 MB.
2. **Proxy-header trust:** `X-Forwarded-Host`/`X-Forwarded-Proto` chỉ còn được tin khi bật `GON_TRUST_PROXY_HEADERS`; `GON_PUBLIC_ORIGIN` có thể khóa origin công khai. Auth.js `trustHost` cũng chuyển thành opt-in trong production qua `AUTH_TRUST_HOST`.
3. **Production fail-closed:** `GON_STORE=memory` bị từ chối trong production trừ khi có override tường minh cho môi trường cô lập không chứa dữ liệu thật.
4. **Browser security headers:** bổ sung COOP/CORP, Permissions-Policy, Origin-Agent-Cluster, DNS-prefetch off; production có CSP và HSTS. CSP vẫn còn `unsafe-inline` cho Next bootstrap nên đây là defense-in-depth, chưa phải nonce-based CSP.
5. **ADK local-auth guard:** cờ unauthenticated chỉ có hiệu lực khi `GON_ADK_ENV=local`.
6. **Auth identity mapping:** chuẩn hóa ID dạng số từ PostgreSQL Auth adapter sang chuỗi trước khi map sang GON user.
7. **Accessibility:** Learning Player nay có tab/tabpanel IDs, `aria-controls`, roving tabindex và phím Arrow/Home/End.
8. **Problem Details nhất quán hơn:** lỗi khởi tạo runtime trong `/v1` đi qua handler lỗi chung thay vì trả body rỗng.

Chi tiết và residual risk nằm tại [Security review](SECURITY-THREAT-MODEL-AND-VERIFICATION.md).

## 4. Bằng chứng đã chạy trong vòng review

| Kiểm chứng | Kết quả | Giới hạn |
|---|---|---|
| `npm test` (`apps/gon-web`) | **30/30 passed** sau hardening | Memory/local adapters |
| `npm run test:legacy` | **14/14 passed** | Prototype lịch sử |
| `npm run typecheck`, `npm run build` | Passed | Compile/route build, không phải OAuth/DB runtime |
| ADK `pytest` | **11/11 passed**, 1 deprecation warning của TestClient stack | Local provider + Google definitions; chưa gọi Gemini |
| P03 validator | Passed: 56 paths, 69 operations, 5 JSON schemas | Contract tĩnh |
| `npm run db:check`, `spike:search -- --dry-run` | Passed ở mức static/load | PostgreSQL **NOT RUN** |
| `npm Audit` | **0 vulnerabilities** trong snapshot lockfile | Advisory DB tại thời điểm quét; không thay CI liên tục |
| `pip-audit` trên clean runtime venv | 51 packages, **1 CVE**: `CVE-2026-114603` trong transitive `opentelemetry-api 1.42.1` | Fix `1.45.1` hiện xung đột constraint của `google-adk 2.12.0` |
| Bandit | 1 medium: bind `0.0.0.0` tại Uvicorn entrypoint | Chỉ chấp nhận được nếu ingress/IAM biến nó thành internal service |
| Secret scan | 3 candidates, đều là placeholder tài liệu/test fixture đã kiểm tra thủ công | Không thay thế GitHub secret scanning/push protection |
| HTTP security probe | **7/7 passed** trên local dev server | DAST-equivalent hẹp, không phải ZAP/pentest |
| HTTP benchmark | Bootstrap p95 18.7 ms tuần tự; 50 request/10 worker đạt 142.6 req/s trong local dev | 1 user, 1 project, Next dev + memory; không dùng làm SLO production |
| Production build server | `/` trả CSP/HSTS; Dev Auth 404; memory production guard fail-closed qua Problem Details | Chưa có Google/PostgreSQL staging |

## 5. Điều kiện chặn P06

P06 chỉ được bắt đầu theo nghĩa triển khai production-like khi các blocker sau có bằng chứng đóng hoặc PO chấp nhận ngoại lệ bằng quyết định riêng:

| ID | Blocker | Điều kiện đóng tối thiểu |
|---|---|---|
| B-P05-01 | PostgreSQL domain repositories/UoW, durable job/outbox primitives và private object-storage port/GCS adapter đã chạy local qua PGlite/fake transport; worker process/sink, bucket/IAM/CORS và managed PostgreSQL vẫn chưa kiểm chứng | Lặp lại migrations + domain/queue/Auth/storage tests trên managed PostgreSQL + private GCS staging; worker retry/lease/reconciler, outbox consumers và signed upload hoạt động trên staging |
| B-P05-02 | Auth.js PG adapter/database session/revoke/expiry và GON identity mapping đã chạy trên PostgreSQL engine; Google OAuth thật và account lifecycle staging chưa chạy | Staging Google sign-in first/repeat, sign-out/revoke, expired/revoked invite, suspended/deleted account E2E qua Next HTTPS route |
| B-P05-03 | S-P03-01 và S-P03-03 chưa passed; Gemini/ADK chưa nối | Hybrid Search trên corpus đại diện; TS worker → ADK → Gemini có AiRun/cost/repair/retry không tạo module trùng |
| B-P05-04 | Upload/URL/extraction security chưa đủ | Malware scan, parser sandbox, image/PDF limits, DNS/redirect/rebinding defense cho fetcher; chưa bật tính năng nào chưa qua kiểm chứng |
| B-P05-05 | Privacy/retention/data-rights chưa hoàn chỉnh | Export/delete/footprint purge/retention jobs, legal review cho self-attestation 18+ và policy versions |
| B-P05-06 | Rate limit/abuse/cost guardrails chưa phân tán | Edge + per-user/IP limits, persistent quotas/budget reservations, provider circuit breaker và kill switches có kiểm chứng |
| B-P05-07 | Observability/DR chưa có | Structured logs/metrics/traces/alerts, backup + restore drill đạt RPO/RTO đã duyệt, rollback và incident runbooks |
| B-P05-08 | Staging verification chưa chạy | DAST, load test, browser/axe/screen-reader checks, AI golden evaluation và independent security review theo phạm vi đã duyệt |
| B-P05-09 | Release engineering chưa bị khóa bởi CI | Path-filtered CI cho web/ADK, dependency/secret/SAST gates, Python lock/constraints + SBOM, xử lý hoặc phê duyệt ngoại lệ CVE có hạn |

## 6. Quyết định đề xuất để PO xác nhận

Các quyết định dưới đây là **đề xuất P05**, chưa tự động có hiệu lực:

| ID | Đề xuất |
|---|---|
| D-P05-01 | Chấp nhận kết luận hiện tại là **P05 IN REVIEW — NOT YET PASS**; không dùng bằng chứng local để tuyên bố production-ready |
| D-P05-02 | Production/Private Alpha thật không được chạy memory store, local hash embedding, local Brew/assessment hoặc Dev Auth |
| D-P05-03 | Dùng các SLO/NFR targets trong [NFR specification](NFR-SPECIFICATION-AND-RESULTS.md) làm baseline đo staging; mọi thay đổi phải ghi ADR/decision |
| D-P05-04 | Mục tiêu accessibility là WCAG 2.2 AA cho các luồng VS1 được phát hành |
| D-P05-05 | AI chỉ được auto-pass/auto-persist trong giới hạn evaluation đã duyệt; low-confidence, similarity cao hoặc thiếu evidence phải vào human review |
| D-P05-06 | RPO/RTO staging tối thiểu phải được diễn tập trước Go-Live; không chỉ dựa vào cấu hình backup chưa restore |
| D-P05-07 | CVE transitive của OpenTelemetry chỉ được tạm chấp nhận khi ADK là internal service, không gắn ASGI propagation middleware, có header-size limit tại edge và có ngày rà soát lại; nếu không đạt các điều kiện này phải nâng cấp/thay thế dependency path |

## 7. Lộ trình đóng P05

1. **P05-R1 — Production platform completion:** R1.1 PostgreSQL/Search/readiness/CI foundation, R1.2 domain repositories/Unit of Work, R1.3 durable jobs/outbox primitives, R1.4 Auth DB-session contract + private object-storage port, R1.5 worker runtime/outbox consumers/ADK integration và R1.6 targeted repository queries/RLS + persistent quotas/kill switches/circuit breaker đã có bằng chứng local/PGlite; còn lại của R1 là Google/GCS/managed-PostgreSQL staging verification (trong đó có roles/IAM cho RLS) và TS→ADK→Gemini với credentials thật.
2. **P05-R2 — Staging verification:** S-P03-01/02/03/04, load/DAST/AI evaluation, accessibility browser test, backup/restore và rollback drills.
3. **P05-R3 — Re-review:** chạy lại toàn bộ gates trên cùng một staging build, đóng findings hoặc xin ngoại lệ có hạn, sau đó mới trình PO duyệt P05.
4. **P06:** chỉ bắt đầu sau P05 APPROVED; Go-Live vẫn cần quyết định riêng.

## 8. Tài liệu liên quan

- [P04 build record đã được duyệt](../05-build/README.md)
- [P03 contracts đã duyệt](../04-contracts/README.md)
- [Identity, privacy & retention contract](../04-contracts/IDENTITY-AUTHORIZATION-PRIVACY-AND-RETENTION.md)
- [Production source guide](../../src/README.md)
- [PostgreSQL guide](../../db/README.md)
- [ADK service guide](../../../gon-adk/README.md)
- [Gate review & approval](../00-process/GATE-REVIEW-AND-APPROVAL.md)
README.md)
- [ADK service guide](../../../gon-adk/README.md)
- [Gate review & approval](../00-process/GATE-REVIEW-AND-APPROVAL.md)
