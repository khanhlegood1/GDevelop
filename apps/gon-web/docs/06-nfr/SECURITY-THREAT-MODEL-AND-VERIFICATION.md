# P05 — Threat Model, Kiểm chứng Bảo mật và Findings

> **Kết luận:** không phát hiện lỗ hổng Critical có thể khai thác ngay trong bề mặt VS1 local sau hardening P05. Tuy vậy P05 **chưa đạt** vì các bề mặt production quan trọng nhất — PostgreSQL/Auth thật, storage/fetcher, queue, Gemini/ADK, edge rate limit và staging — chưa tồn tại hoặc chưa được kiểm chứng.<br>
> **Phương pháp:** STRIDE theo trust boundary, OWASP ASVS-style control review, source review, SAST/SCA/secret scan và HTTP DAST-equivalent probes.<br>
> **Baseline:** `ef594dea3512f32dabe5c88b83ee6cb4ab24cc62` cộng thay đổi P05 được liệt kê tại mục 6.

## 1. Tài sản cần bảo vệ

| Nhóm tài sản | Ví dụ | Tác động nếu lộ/sai |
|---|---|---|
| Identity/session | Google subject, Auth.js session, invite, CSRF/upload/dev tokens | Chiếm tài khoản, truy cập hành trình riêng tư |
| Nội dung người dùng | prompt, goal, text/file/image/URL, chunks, embeddings | Lộ dữ liệu cá nhân/tài liệu, dùng sai mục đích, vi phạm bản quyền |
| Học tập và bằng chứng | answers, rubric results, mastery, XP Ledger, proofs/certificates | Gian lận level/proof, kết luận học sai, mất niềm tin |
| AI assets | evidence bundle, module graph, prompts/instructions, model/provider keys, ngân sách token | Prompt injection, nội dung sai/độc, tốn chi phí, lộ dữ liệu qua provider |
| Vận hành | DB, object bytes, Audit/outbox, feature flags, secrets, CI/CD | Mất dữ liệu, sửa lịch sử, downtime, supply-chain compromise |
| Quyền riêng tư/pháp lý | age attestation, consents, footprint, retention/deletion records | Thu thập vượt consent, không xóa được, rủi ro tuân thủ |

Embeddings phải được coi là dữ liệu suy ra từ nội dung người dùng, không phải dữ liệu vô hại. Chúng cần cùng owner/retention/deletion boundary như chunks nguồn.

## 2. Tác nhân đe dọa

1. Người lạ trên Internet dò endpoint/invite/session và gây DoS.
2. Người học độc hại thử IDOR, sửa XP/proof, spam Search/Brew hoặc tạo nhiều tài khoản.
3. Nội dung nguồn độc hại chứa prompt injection, script/polyglot, malware hoặc tuyên bố sai.
4. Website/fetcher target dùng redirect/DNS rebinding để chạm metadata/private network.
5. Trình duyệt/extension bị xâm nhập hoặc website khác thực hiện CSRF/clickjacking.
6. Dependency/CI bị compromise hoặc secret bị lộ.
7. Insider/operator lạm dụng quyền xem nội dung, sửa XP/proof hoặc publish không Audit.
8. Provider AI/outage trả output sai schema, nội dung không an toàn hoặc gây chi phí bất thường.

## 3. Trust boundaries

```text
Browser (untrusted input/session cookie)
  │ HTTPS + CSRF trên staging/production
  ▼
Next.js web/API ── Auth.js ↔ Google OAuth
  ├─ PostgreSQL/pgvector (wired; bằng chứng hiện tại là PGlite, staging NOT RUN)
  ├─ Object Storage signed uploads (chưa wired)
  ├─ Durable queue/outbox (primitives + Brew runner đã wired local; worker process/sink staging chưa có)
  │    └─ Worker ── service identity ──► Python ADK ──► Gemini
  └─ Embedding provider ───────────────────────────────► Gemini

User URL/file/image = untrusted content ở mọi lớp xử lý.
ADK không có DB/publish quyền; TypeScript policy service phải validate lại và quyết định persist.
```

## 4. STRIDE review

| STRIDE | Kịch bản chính | Kiểm soát hiện có | Khoảng trống / finding |
|---|---|---|---|
| **S — Spoofing** | Giả Google/dev user, đoán invite, dùng lại upload token | Actor được resolve server-side; Dev Auth tắt ở production; token 32-byte random được lưu dạng hash; upload token hết hạn 15 phút | Google/DB session **NOT RUN**; invite chưa có rate limit/entropy policy production — F-P05-09/11 |
| **T — Tampering** | Sửa XP/mastery/proof/status, replay mutation, đổi payload theo Idempotency-Key | Client DTO không nhận XP/owner/status; server state rules; idempotency fingerprint; If-Match ở các route yêu cầu; XP không cộng trùng trong test | Transaction/unique constraints chỉ có ở schema; async/multi-instance race còn — F-P05-16 |
| **R — Repudiation** | Phủ nhận consent, attestation, XP reversal, report/review hoặc publish | Consent/attestation records, XP sequence/ledger, outbox events, Audit cho một số hành động, requestId | Audit chưa bao phủ auth failures/admin/provider; chưa có immutable sink/alert — F-P05-18 |
| **I — Information disclosure** | Đọc project/journey/proof của người khác; lộ đáp án; rò secret qua log/error | Owner-first checks và 404 cho object không thuộc actor; Search lọc visible modules trước scoring; player projection bỏ hidden answers; errors không trả stack; log lỗi chỉ ghi error name | Chưa có staging negative tests; URL query có thể chứa token do user dán; CSP còn unsafe-inline — F-P05-19/20 |
| **D — Denial of service** | Body khổng lồ, file nén/giải nén, Search/Brew spam, provider cost exhaustion | Stream body limits sau P05; file/text/project limits; quotas Search/Brew/artifact; provider timeout | Chưa có edge/IP/distributed limit, queue/backpressure, parser sandbox, cost reservation — F-P05-08/12/15 |
| **E — Elevation of privilege** | Learner tự lên reviewer/admin, ADK tự publish/ghi DB, file/script thực thi | Roles chỉ từ server user record; ADK stateless/không DB/publish/tool; React escaping, không `dangerouslySetInnerHTML`; module luôn `draft_private` | Review/admin workflow chưa triển khai để kiểm chứng; ADK vẫn dùng shared token thay vì IAM/OIDC — F-P05-21 |

## 5. Kiểm soát đã xác minh trong code

### Identity, session và authorization

- `requireActor` resolve actor từ Dev session hoặc Auth.js session ở server; client không tự khai `userId`/roles.
- `requireActiveUser` chặn tài khoản chưa hoàn tất onboarding, suspended và deletion-pending khỏi các thao tác học chính.
- Project/artifact/search/brew/journey/attempt/proof dùng owner checks; object không thuộc actor trả 404 để giảm enumeration signal.
- Search gọi `visibleModuleVersions(actor)` trước scoring; module `draft_private` của người khác không được đưa vào tập ứng viên.
- Report cho phép reporter hoặc role reviewer/admin đọc; chưa có route admin làm thay đổi trạng thái trong VS1.
- Dev session token được hash trước khi lưu, có expiry/revoke; route bị tắt trong production. P05 siết thêm CSRF cho cả tạo và xóa dev session.
- Auth.js dùng database sessions khi có PG pool; JWT chỉ là fallback local. Đây là cấu hình **chưa đủ cho production nếu thiếu `DATABASE_URL`**.

### CSRF, browser và HTTP

- Mutation qua dispatcher dùng same-origin + double-submit CSRF; cookie CSRF là HttpOnly/SameSite=Lax và token được trả qua endpoint riêng cho JS client.
- P05 bỏ việc tin `X-Forwarded-Host` vô điều kiện; chỉ tin khi `GON_TRUST_PROXY_HEADERS` được bật cho proxy đã kiểm chứng, hoặc dùng `GON_PUBLIC_ORIGIN`.
- `AUTH_TRUST_HOST` phải opt-in trong production.
- Production headers gồm CSP, HSTS, COOP/CORP, frame/content-type/referrer protections và Permissions-Policy tối thiểu.
- API JSON dùng Problem Details, `Cache-Control: no-store`, requestId và không trả stack trace.
- JSON/upload/ADK bodies được đếm theo stream; Content-Length chỉ là early-exit hint.
- Không dùng `eval`, `Function`, `dangerouslySetInnerHTML` hoặc `innerHTML` trong production source được rà soát.

### Input, file và URL

- Validation helper giới hạn kiểu/độ dài/enum/integer/array và pagination tối đa 100.
- URL chỉ nhận HTTP/HTTPS, chặn credentials nhúng, localhost, `.local`, `.internal` và IP literal private/reserved chính.
- Upload khai báo MIME/size/SHA-256 trước; server kiểm hash/size thật và magic bytes cho PNG/JPEG/WebP/PDF/text.
- Artifact không khớp bị `blocked`; PDF là `unsupported`, ảnh/URL là `metadata_only` và UI/service không được trình bày như đã đọc nội dung chính.
- Xóa artifact loại object/chunks trong memory và ghi event/Audit.

Các kiểm soát trên **không** tương đương malware scanning hoặc SSRF-safe fetcher; xem F-P05-12/13.

### AI và integrity

- Canonical Module Graph qua AJV + semantic validation; citation phải thuộc evidence bundle.
- Player projection loại sample answers/scoring internals trừ node đã được reveal theo policy.
- Assessment deterministic kiểm tra độ dài/rubric/disclosure/similarity; similarity cao hoặc thiếu disclosure chuyển `pending_human_review`, không tự kết luận gian lận.
- Brew cần user confirmation, có kill switch, quota ngày và luôn tạo `draft_private`.
- ADK agents không tools/transfer, output schema + semantic validators, Google provider fail-closed khi thiếu model/credentials.
- XP chỉ phát sinh từ passed attempts phía server; duplicate passed work không cộng lại trong local tests.

## 6. Findings đã sửa trong P05

| ID | Mức ban đầu | Finding | Cách sửa / bằng chứng | Residual |
|---|---|---|---|---|
| F-P05-01 | High | Web JSON, local upload và ADK đọc toàn bộ body trước khi kiểm giới hạn | `readBoundedBody` theo stream; upload authorize trước khi đọc; ADK stream limit; unit + HTTP 413 probe | Edge vẫn phải có header/body/timeout limits |
| F-P05-02 | Medium | `X-Forwarded-Host/Proto` và Auth `trustHost: true` được tin vô điều kiện | Proxy trust opt-in, public origin override, `AUTH_TRUST_HOST` opt-in; spoof probe trả 403 | P06 phải chứng minh proxy overwrite headers |
| F-P05-03 | Medium | Thiếu CSP/HSTS/COOP/CORP/Permissions-Policy | Bổ sung trong `next.config.ts`; production server đã kiểm headers | CSP còn `unsafe-inline`; cần nonce/reporting ở P06 |
| F-P05-04 | High (nếu deploy nhầm) | Production có thể chạy memory store và mất dữ liệu âm thầm | `assertRuntimeStoreAllowed` fail-closed; Problem Details cho lỗi runtime | Override chỉ dành cho môi trường cô lập không dữ liệu thật |
| F-P05-05 | Medium | ADK unauthenticated flag có thể bật ngoài local | Chỉ hiệu lực khi `GON_ADK_ENV=local`; pytest staging case | Production vẫn cần IAM/OIDC hoặc token rotation |
| F-P05-06 | Low | Dev-session mutation chỉ dựa Origin | Dùng CSRF token cho POST/DELETE và UI dùng API client | Dev Auth vẫn tuyệt đối không phải production identity |
| F-P05-07 | Medium reliability | Auth PG serial ID dạng số có thể không map được sang GON user | Chuẩn hóa `authUserId` sang string tại service/Auth callbacks; unit test số 42 | Vẫn cần Google + DB E2E thật |

## 7. Findings còn mở

Mức độ dưới đây tính theo tác động nếu đưa bề mặt tương ứng lên staging/production mà chưa xử lý.

| ID | Mức | Finding | Điều kiện đóng / owner đề xuất |
|---|---|---|---|
| F-P05-08 | **High** | Chưa có edge/IP rate limit, distributed quota, queue backpressure hoặc budget reservation; quota hiện chỉ trong một process | Cloud Armor/API gateway + persistent quotas/token budget; load/abuse test — Platform + Web/API |
| F-P05-09 | **High** | Google OAuth, DB session revoke, account linking/suspension/deletion chưa chạy thật; thiếu DB sẽ rơi xuống JWT fallback | Staging Auth E2E và production config gate bắt buộc DB sessions — Web/API |
| F-P05-10 | **Medium** | Transitive `opentelemetry-api 1.42.1` có `CVE-2026-114603`; fix `1.45.1` xung đột `google-adk 2.12.0` | Nâng ADK khi có bản tương thích hoặc ngoại lệ D-P05-07 có hạn; không gắn ASGI propagation middleware; giới hạn header tại edge — AI/Platform |
| F-P05-11 | **Medium** | Invite code dùng SHA-256 nhanh và chưa có rate limit/entropy/expiry policy production | Mã mời high-entropy, rate limit theo IP/account, Audit failures, revoke/rotation — Web/API |
| F-P05-12 | **High** | Upload mới dừng ở magic bytes; chưa có malware scan, parser sandbox, image dimension/decompression/polyglot defenses hoặc re-encode khi phục vụ file | S-P03-02 trên staging; không serve/parser file ngoài allowlist đã kiểm chứng — Platform + Web/API |
| F-P05-13 | **High nếu bật fetcher** | URL validator chưa resolve DNS, chưa chặn redirect/rebinding/IPv4-mapped IPv6 theo từng hop | Fetcher riêng có DNS pinning/allowlist egress, redirect revalidation, timeout/size/content-type limits — Platform |
| F-P05-14 | **High** | Prompt injection, factuality, moderation và assessment agreement chưa được đánh giá bằng Gemini/golden set | AI evaluation tại [tài liệu AI](PERFORMANCE-ACCESSIBILITY-AND-AI-EVALUATION.md) đạt ngưỡng PO duyệt — AI + Product |
| F-P05-15 | **High** | Search/Brew đồng bộ trong memory, quét nhiều tập dữ liệu lặp lại; chưa có durable job isolation | PostgreSQL indexed Search + queue/outbox + concurrency/load tests — Web/API + Platform |
| F-P05-16 | **Medium** | Idempotency được lưu sau một số `await`; hai request đồng thời hoặc hai instance có thể tạo trùng | DB unique constraint + reserve-before-work transaction/lease; concurrency tests — Web/API |
| F-P05-17 | **Medium** | Deterministic assessment có thể bị keyword stuffing; chưa có Sybil/multi-account, vote anti-cheat vì Arena chưa triển khai | Human/AI evaluation, attempt budgets, anomaly review; thiết kế vote ledger riêng trước VS2 — Product + AI |
| F-P05-18 | **High** | Observability/Audit chưa đủ: một log lỗi JSON ở web, ADK stack log nội bộ, chưa metrics/traces/alerts/log retention | Observability plan tại [tài liệu reliability](RELIABILITY-OBSERVABILITY-AND-WELL-ARCHITECTED.md) được triển khai và drill — Platform/SRE |
| F-P05-19 | **High** | Export/delete/footprint purge/retention jobs và rà soát pháp lý 18+ chưa hoàn tất | Data-request E2E + deletion proof + legal/policy approval — Product/Legal + Web/API |
| F-P05-20 | **Medium** | CSP dùng `unsafe-inline`; CSRF token không rotate theo auth transition; URL query token do user dán có thể được lưu | Nonce CSP/report-only rollout, CSRF rotation policy, URL secret redaction/warning trước fetch/share — Web/API |
| F-P05-21 | **Medium** | ADK dùng shared service token tĩnh; health endpoint công khai metadata cấu hình dạng boolean | Google IAM/OIDC/mTLS hoặc rotation ngắn hạn; tách liveness công khai tối thiểu khỏi readiness nội bộ — Platform/AI |
| F-P05-22 | **Medium** | Python chưa có lock/constraints và repo chưa có CI security gates/SBOM; transitive versions có thể trôi giữa các lần cài | Lock/constraints có hash, SBOM, path-filtered CI + required checks — Platform |
| F-P05-23 | **Low** | Bandit B104: Uvicorn bind `0.0.0.0` | Chấp nhận chỉ trong container có ingress nội bộ/IAM; ghi rõ trong IaC/P06 — Platform |
| F-P05-24 | **Low** | Fixture P03 `agent-generate-output.json` dùng hash placeholder không khớp evidence bundle thật | Sửa fixture qua governance hoặc đánh dấu illustrative-only; strict validator phải tiếp tục reject hash sai — Architecture |

## 8. Kết quả scan và DAST-equivalent

### SCA / SAST / secrets

| Công cụ | Phạm vi | Kết quả | Diễn giải |
|---|---|---|---|
| `npm Audit` | Lockfile web, 145 dependency records | **0 vulnerabilities** | Snapshot tại ngày quét; cần CI lặp lại |
| `pip-audit` | Clean runtime venv ADK, 51 packages | 1 CVE tại `opentelemetry-api 1.42.1` | App code không trực tiếp parse `tracestate`/gắn OTel ASGI middleware; vẫn là dependency risk |
| Bandit | `apps/gon-adk/src`, 1.405 LOC | 1 medium B104 bind all interfaces | Cần ingress control tại P06 |
| ESLint + `eslint-plugin-security` (config tạm ngoài repo) | 35 files web/src/scripts/config | 0 errors; 2 warnings `detect-non-literal-fs-filename` trong migration CLI đọc file từ thư mục migrations cố định | Không thấy eval/unsafe regex/child-process sinks; rule object-injection bị tắt vì nhiễu cao trên DTO typed |
| Targeted source search | Dangerous sinks/log/secrets | Không có `eval`, `Function`, `dangerouslySetInnerHTML`, `innerHTML`, child-process trong production source | Manual/lexical evidence, không thay CodeQL/Semgrep CI |
| `detect-secrets` + regex patterns | GON web/ADK tracked scope | 3 candidates: 2 placeholder trong docs, 1 URL có `user:pass@` trong test chặn credential | Không phát hiện secret thật; GitHub scanning vẫn cần bật |

GitHub API trong sandbox cho thấy Dependabot alerts đang disabled; code-scanning alerts không truy cập được bằng integration hiện tại. R1.1 đã thêm workflow riêng cho `apps/gon-web`/`apps/gon-adk`, nhưng chưa có bằng chứng GitHub Actions run hoặc branch-protection required checks. Đây vẫn là một phần của B-P05-09.

### HTTP probes

[`scripts/http_security_probe.py`](scripts/http_security_probe.py) đạt 7/7 trên local dev server:

1. bootstrap chưa đăng nhập → 401 `AUTH_REQUIRED`;
2. mutation thiếu CSRF → 403;
3. Origin attacker + spoofed `X-Forwarded-Host` → 403;
4. mutation thiếu Idempotency-Key → 400;
5. JSON sai → 400 Problem Details;
6. body > 2.500.000 bytes → 413;
7. browser security headers kỳ vọng xuất hiện.

Production build server cũng đã được kiểm riêng: `/` trả CSP/HSTS, Dev Auth trả 404 và memory-store guard fail-closed bằng Problem Details. Đây vẫn không phải authenticated staging DAST, ZAP baseline/full scan hay pentest độc lập.

## 9. OWASP ASVS-style mapping

| Nhóm | Đánh giá P05 |
|---|---|
| Architecture & threat modeling | Có P03 boundaries/STRIDE; production topology chưa triển khai |
| Authentication/session | Local boundary tốt; Google/DB/revoke NOT RUN |
| Access control | Owner checks nhất quán trong VS1; cần DB/staging negative tests |
| Validation/encoding | Typed helpers, AJV/semantic validation, React escaping; parser/file sandbox chưa đủ |
| Cryptography | Random tokens/IDs và SHA-256 dùng đúng cho integrity/hash lookup; invite cần entropy/rate-limit policy |
| Error/logging | Problem Details không lộ stack; Audit/metrics/alerts chưa đạt vận hành |
| Data protection | Private-by-default/consent có; encryption/IAM/retention thuộc Cloud P06 và chưa kiểm chứng |
| Communications | HSTS/headers ở production build; TLS/cert/ingress chưa có môi trường |
| Malicious code/files | Magic/size/hash; AV/parser sandbox chưa có |
| Business logic/anti-cheat | XP/proof server-side; assessment/vote/Sybil defenses chưa hoàn chỉnh |
| API/web service | Auth/CSRF/idempotency/body limits tốt ở local; rate limit/DAST staging thiếu |
| Configuration/supply chain | Fail-closed tăng lên; CI/lock/SBOM/secret scanning platform chưa khóa |

## 10. Điều kiện bảo mật tối thiểu trước P06 Go-Live

1. Staging dùng đúng topology production: PostgreSQL/Auth DB, private ADK ingress, object storage, queue, Secret Manager và edge limits.
2. Chạy authenticated DAST/ZAP, authorization matrix hai người dùng + operator, upload/URL adversarial corpus và AI red-team suite.
3. Đóng mọi High finding hoặc có ngoại lệ bằng văn bản với owner, hạn xử lý và biện pháp bù trừ đã kiểm chứng.
4. Bật CI required checks cho tests/typecheck/build, SCA/SAST/secret scanning; khóa Python dependencies và sinh SBOM.
5. Rà soát IAM/service accounts theo least privilege; ADK không public unauthenticated và không có DB/publish credentials.
6. Chứng minh log/alert/Audit không chứa secrets/raw learner content ngoài allowlist; diễn tập revoke session, tắt Brew/AI và rollback.
