# P05 — Đặc tả NFR và kết quả đo

> **Mục đích:** biến các yêu cầu phi chức năng thành ngưỡng có thể đo trên staging, đồng thời ghi rõ kết quả local hiện tại chứng minh được gì và chưa chứng minh được gì.<br>
> **Baseline:** merge commit `ef594dea3512f32dabe5c88b83ee6cb4ab24cc62` cộng hardening P05 trên nhánh review.<br>
> **Trạng thái:** **IN REVIEW — NOT YET PASS**. Các target ở mục 3 là đề xuất cho PO duyệt tại D-P05-03, không phải SLA đã cam kết với người dùng.

## 1. Phạm vi hệ thống được rà soát

### Đã có runtime local

- Next.js/TypeScript VS1 tại `apps/gon-web/src` với 38 method-operation trong dispatcher `/v1` trên tổng 69 operation của OpenAPI P03; operation chưa triển khai trả 404 Problem Details.
- Python ADK contract service tại `apps/gon-adk` với `/healthz`, topic-check, generate-module và assess-attempt.
- Sáu PostgreSQL migrations và migration runner ở mức SQL/static contract.
- Deterministic local embedding/Brew/assessment trong web; ADK local provider và ba Google agent definitions chưa gọi model thật.

### Chưa được tính là runtime production

- PostgreSQL domain repositories và transaction boundaries thật;
- signed Cloud Storage, malware scanning, PDF/OCR/transcript và external URL fetching;
- durable queue/outbox publisher/reconciler;
- TypeScript worker → ADK và Gemini generation/embedding thật;
- Arena vote/realtime, GDevelop game sessions, trend/creator analytics của các slice sau;
- staging/production infrastructure, CI/CD và observability platform.

## 2. Giới hạn bảo vệ hiện có trong code

| Nhóm | Giới hạn hiện tại | Nguồn sự thật |
|---|---|---|
| JSON body | 2.500.000 bytes, áp dụng theo stream | `src/server/http.ts` |
| Prompt khởi tạo project | 20.000 ký tự | `MAX_PROMPT_CHARS`/service validation |
| Text artifact | 200.000 ký tự; chunk tối đa khoảng 3.600 ký tự | `src/server/artifacts.ts`, service |
| Document/image | 25 MB / 15 MB mỗi file | `validateUploadDeclaration` |
| Artifact theo project | tối đa 5 URL, 5 file/ảnh, tổng upload khai báo 100 MB | service quotas |
| Search | 60 attempts/người/giờ trong memory | `GonServiceOptions.quotas` |
| Brew | 5 jobs/người/ngày trong memory | `GonServiceOptions.quotas` |
| Artifact processing | 20/người/ngày trong memory | `GonServiceOptions.quotas` |
| ADK body | 2.500.000 bytes theo stream; timeout cấu hình mặc định 120 giây | `apps/gon-adk/src/gon_adk/{main,config}.py` |
| Gemini embedding adapter | timeout 20 giây, bắt buộc vector 768D | `src/server/embeddings.ts` |
| Session | Auth.js max age 30 ngày; database strategy chỉ khi có PG pool | `src/server/auth.ts` |
| Lifelong Level | `floor(LifetimeXP / 100)`, Forever là Era mở từ Lv.35+, không cap | `gon-level-v1` |

Các quota trên là **domain guardrails local**; chúng mất hiệu lực khi restart/khác instance và không thay thế rate limit ở edge hay quota persistence.

## 3. Target NFR đề xuất cho staging Private Alpha

### 3.1 Điều kiện đo chuẩn đề xuất

Để tránh đo trên dữ liệu rỗng, staging verification nên dùng tối thiểu:

- 100 người dùng tổng hợp, 20 phiên đồng thời;
- 1.000 projects, 100 module versions, 20.000 chunks cho baseline và một stress corpus 100.000 chunks;
- hỗn hợp VI/EN, text ngắn/dài, URL metadata, file text, ảnh metadata và các artifact bị chặn;
- 5 Brew jobs đồng thời qua queue;
- PostgreSQL/pgvector, Auth.js database sessions, object storage, ADK/Google test project và network staging thật;
- ghi riêng cold start, provider latency và lỗi provider; không loại chúng khỏi báo cáo một cách âm thầm.

### 3.2 Performance và capacity

| ID | Target đề xuất | Cách đo | Kết quả hiện tại |
|---|---|---|---|
| NFR-PERF-01 | Read API không-AI: p50 ≤ 200 ms, p95 ≤ 500 ms, 5xx < 0,1% tại tải chuẩn | Load test staging 30 phút | Local dev p95 12,6–18,7 ms; **không suy ra staging** |
| NFR-PERF-02 | Tạo search job/attempt được chấp nhận p95 ≤ 300 ms; kết quả Search p95 ≤ 2 giây trên corpus chuẩn | Job timestamps + Search latency | Local search POST p95 28,2 ms trên 1 project; S-P03-01 **NOT RUN** |
| NFR-PERF-03 | Brew được chấp nhận bất đồng bộ p95 ≤ 300 ms; completion p50 ≤ 60 giây, p95 ≤ 180 giây cho profile module Alpha | Queue/job/AiRun telemetry | Local synchronous Brew 155 ms/1 mẫu; Gemini **NOT RUN** |
| NFR-PERF-04 | Workspace/player không tải toàn bộ graph/chunk không cần thiết; response JSON p95 ≤ 250 KB cho VS1 điển hình | Response-size budget tại staging | Chưa đo payload budget |
| NFR-PERF-05 | Web Vitals field/lab: LCP ≤ 2,5 giây, INP ≤ 200 ms, CLS ≤ 0,1 trên thiết bị/mạng tham chiếu đã duyệt | Browser lab + RUM không chứa nội dung học | Bundle 633.356 bytes raw JS/CSS, 192.519 bytes gzip; browser **NOT RUN** |
| NFR-PERF-06 | Không có request path nào quét toàn bộ chunks/module versions theo cấp số nhân khi corpus tăng; Search dùng index + authorization filter trước limit | EXPLAIN/benchmark S-P03-01 | Memory implementation hiện quét tuyến tính lặp; **chưa đạt kiến trúc scale** |

### 3.3 Availability, reliability và data integrity

| ID | Target đề xuất | Cách đo | Kết quả hiện tại |
|---|---|---|---|
| NFR-REL-01 | Availability Private Alpha ≥ 99,5%/tháng cho web/API, không tính downtime bảo trì đã thông báo theo policy PO duyệt | Uptime + error budget | Chưa deploy |
| NFR-REL-02 | RPO ≤ 1 giờ bằng PITR/backup; RTO ≤ 4 giờ cho Private Alpha | Restore drill có timestamp và kiểm tra dữ liệu | **NOT RUN**; memory hiện mất toàn bộ khi restart |
| NFR-REL-03 | Job chạy lại sau crash không tạo module/XP/proof trùng; stale running jobs được lease/reconciler thu hồi | Chaos/retry tests trên queue/DB | Idempotency local có test tuần tự; race/multi-instance chưa đạt |
| NFR-REL-04 | Provider 429/5xx/timeout được phân loại retryable/terminal, có backoff+jitter, circuit breaker và không fallback giả danh provider khác | Fault injection Gemini/ADK | Local fail-closed một phần; provider thật **NOT RUN** |
| NFR-REL-05 | Migration chỉ tiến về phía trước, checksum immutable; rollback app tương thích schema trước/sau theo expand-contract | Migration rehearsal trên bản sao staging | Static checker đạt; execution **NOT RUN** |
| NFR-REL-06 | XP/mastery/proof chỉ thay đổi từ server rules đã version; reversal có Audit và không sửa lịch sử âm thầm | Concurrency + Audit tests trên DB | Local service đạt các case chính; DB transaction chưa có |

### 3.4 Security và privacy

| ID | Target đề xuất | Cách đo | Kết quả hiện tại |
|---|---|---|---|
| NFR-SEC-01 | 100% object-level operations kiểm tra owner/role phía server trước khi đọc/ghi/xếp hạng | Negative authorization tests hai/ba người dùng | Local source/tests tốt; staging **NOT RUN** |
| NFR-SEC-02 | Mutation browser bắt buộc authenticated session + same-origin/CSRF; command quan trọng có idempotency và optimistic concurrency khi contract yêu cầu | DAST + contract tests | Local probe 7/7; Google session thật **NOT RUN** |
| NFR-SEC-03 | Không có critical/high dependency vulnerability chưa có kế hoạch; secret scanning chặn push/PR | CI SCA/SAST/secret gates | npm 0; Python còn 1 CVE transitive; CI chưa có |
| NFR-SEC-04 | File/URL chỉ được xử lý sau scan, parser sandbox, content limits và SSRF defense theo từng loại | S-P03-02 adversarial corpus | Magic/hash/size local only; **chưa đạt** |
| NFR-SEC-05 | Secrets qua Secret Manager, least privilege, rotation và không xuất hiện trong log/error/telemetry | IAM review + log sampling | Chưa có môi trường Cloud |
| NFR-PRI-01 | Người dùng xem/sửa consent, export, xóa footprint/account và biết trạng thái xử lý trong SLA PO duyệt | E2E data-request + deletion verification | Endpoint/jobs chưa triển khai đầy đủ |
| NFR-PRI-02 | Footprint/personalization mặc định tối thiểu; tắt consent thì ranking mới không dùng footprint và dữ liệu liên quan được purge theo retention | Consent regression + data lineage Audit | Consent VS1 có; purge/retention job chưa có |

### 3.5 AI quality, safety và cost

| ID | Target đề xuất | Cách đo | Kết quả hiện tại |
|---|---|---|---|
| NFR-AI-01 | 100% module được persist phải qua JSON Schema + semantic validation; citation ngoài evidence bundle bị reject 100% | Contract/adversarial tests | Local đạt; Gemini output **NOT RUN** |
| NFR-AI-02 | Golden set tối thiểu 100 cases VI/EN; factual claims có nguồn hỗ trợ ≥ 90%, lỗi factual nghiêm trọng = 0 trong mẫu phát hành | Human-labelled evaluation | **NOT RUN** |
| NFR-AI-03 | Ít nhất 30 adversarial cases cho prompt injection/toxic/copy-paste; không case nào làm lộ dữ liệu, tự publish, cộng XP sai hoặc bypass policy | Red-team suite | Chỉ có safeguard cases hẹp |
| NFR-AI-04 | Assessment auto-pass chỉ khi agreement với human rubric đạt ngưỡng PO duyệt (đề xuất Cohen's κ ≥ 0,70); low-confidence/similarity cao → human review 100% | Double-labelled attempts | Deterministic local; **NOT RUN** |
| NFR-AI-05 | 100% AI runs có model/version, token/cost estimate, latency, job/request correlation; không lưu chain-of-thought/raw sensitive prompt ngoài policy | AiRun Audit | Schema có hướng; runtime chưa nối |
| NFR-AI-06 | Có budget theo user/project/ngày và global kill switch; alert tại 50/80/100% ngân sách PO đặt | Billing/quota drill | Local quotas đếm job, chưa meter token/tiền |

### 3.6 Accessibility, usability và compatibility

| ID | Target đề xuất | Cách đo | Kết quả hiện tại |
|---|---|---|---|
| NFR-A11Y-01 | WCAG 2.2 AA cho onboarding, input, Search/Brew, Output Explorer, Player, Progress và Proof Vault | axe + keyboard + screen reader + zoom 200% | Static Audit đạt một phần; browser **NOT RUN** |
| NFR-A11Y-02 | Mọi control có tên truy cập; lỗi field được liên kết bằng `aria-describedby`/invalid state; focus sau chuyển view có thể dự đoán | Manual AT script | Labels tốt; field-error/focus management còn gap |
| NFR-A11Y-03 | Touch target chính ≥ 48 px; nội dung không mất ở 320 px và zoom 200% | Responsive browser matrix | CSS đặt 48 px/breakpoints; chưa chụp kiểm chứng |
| NFR-COMP-01 | Chrome/Edge/Firefox/Safari evergreen gần nhất; tiếng Việt hiển thị đúng dấu và không vỡ layout | Browser matrix | **NOT RUN** trong sandbox |
| NFR-COMP-02 | API/Module Graph thay đổi theo version và backward-compatibility plan P03; không trộn embedding profiles | Contract compatibility tests | P03 validator đạt; migration runtime chưa chạy |

### 3.7 Maintainability và operability

| ID | Target đề xuất | Cách đo | Kết quả hiện tại |
|---|---|---|---|
| NFR-MAINT-01 | CI đúng path chạy unit/contract/typecheck/build/scan cho web + ADK trên mọi PR chạm code | Branch protection/required checks | Chưa có workflow GON |
| NFR-MAINT-02 | Domain/security boundary có coverage trend; đề xuất tối thiểu 80% lines cho service/security modules khi coverage tool được bật | Coverage report | Chưa cấu hình coverage |
| NFR-MAINT-03 | Không có module nghiệp vụ đơn lẻ tiếp tục phình không kiểm soát; refactor theo repository/use-case boundaries trước khi nối DB | Architecture review | `service.ts` khoảng 3.200 dòng, `Vs1App.tsx` khoảng 1.300 dòng |
| NFR-OPS-01 | Mọi request/job/provider call có correlation ID; log không chứa token, raw answer, file bytes hoặc PII ngoài allowlist | Log schema test/sampling | requestId + Problem Details có; metrics/traces chưa |
| NFR-OPS-02 | Alert có owner/runbook cho 5xx, queue age, job failure, provider cost, DB saturation và auth anomalies | Alert drill | Chưa có |
| NFR-OPS-03 | Feature/kill switches cho Brew/AI provider/registration có thể áp dụng ≤ 5 phút và có Audit | Ops drill | Env flags có một phần; chưa có ops workflow |

## 4. Kết quả đo local đã chạy

### 4.1 HTTP benchmark

Điều kiện: Next.js **dev server**, memory store, deterministic local embedding/Brew, một user tổng hợp, một project. Lệnh nằm trong [`scripts/http_benchmark.py`](scripts/http_benchmark.py).

| Endpoint | Mẫu | p50 | p95 | Max | Trạng thái |
|---|---:|---:|---:|---:|---|
| `GET /` | 20 | 26,303 ms | 39,348 ms | 41,134 ms | 20×200 |
| `GET /v1/me/bootstrap` | 50 | 7,314 ms | 18,741 ms | 35,881 ms | 50×200 |
| `GET /v1/projects?limit=30` | 50 | 7,166 ms | 15,820 ms | 18,260 ms | 50×200 |
| `GET /v1/projects/{id}/workspace` | 50 | 6,849 ms | 12,629 ms | 19,783 ms | 50×200 |
| `POST /v1/projects/{id}/search-attempts` | 10 | 10,888 ms | 28,209 ms | 28,209 ms | 10×202 |
| `GET /v1/me/bootstrap`, 50 requests/10 workers | 50 | 62,519 ms | 87,029 ms | 87,782 ms | 142,614 req/s wall-clock |
| Brew local | 1 | — | — | 155,2 ms | job `succeeded` |

Các số trên chỉ chứng minh đường local không có độ trễ bất thường ở quy mô rất nhỏ. Chúng **không** bao gồm PostgreSQL, pgvector, Google network, Cloud Run cold start, queue, browser rendering hoặc dữ liệu nhiều người dùng.

### 4.2 Bundle và build

- Next production build passed cho `/`, Auth, CSRF, dev-session, local-upload và `/v1/[...segments]`.
- Tổng JS/CSS trong `.next/static/chunks`: **633.356 bytes raw**, **192.519 bytes gzip** theo phép nén cục bộ.
- UI hiện là một client component lớn; chưa có route-level code splitting theo từng màn hình, budget CI hoặc Web Vitals.

### 4.3 Test và contract

- Web production tests: **30/30**;
- legacy prototype tests: **14/14**;
- ADK tests: **11/11**;
- TypeScript typecheck: passed;
- P03 validator: 56 paths, 69 operations, 5 JSON schemas, examples/fixtures checked;
- migration static check: 6 files passed; dry-run S-P03-01 không tạo bằng chứng PostgreSQL.

## 5. Kết luận theo từng target

P05 chưa thể đóng các target production vì phần lớn phép đo bắt buộc cần staging. Trạng thái đúng là:

- **Đạt ở local:** regression chính, bounded bodies, CSRF/origin probes, owner/answer-safety safeguards, contract validators, bundle/build cơ bản.
- **Đạt một phần:** accessibility static, dependency hygiene, AI contract safety, quota/kill-switch design.
- **Chưa đạt/NOT RUN:** PostgreSQL Search, Gemini/ADK quality/cost, load/concurrency, backup/restore, DAST staging, browser/AT, privacy lifecycle và observability.

Chi tiết findings và thứ tự xử lý nằm ở ba tài liệu còn lại của gói P05.
