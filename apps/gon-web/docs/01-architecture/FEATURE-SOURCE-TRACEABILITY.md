# Ma trận Feature ↔ Source Traceability

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md).

> 🗄️ **Cập nhật PO — 24/10/2026 (23:36) — IndexedDB cho toàn bộ dự án:** toàn bộ dữ liệu phía client chuyển sang **IndexedDB** (localStorage chỉ còn fallback + nguồn migrate một lần); trang **Khám phá mang theo dữ liệu từ thanh tìm kiếm** (đồng bộ tất cả dữ liệu, hai chiều). Chi tiết: [`PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md`](../00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md) — code chính: `src/lib/browser-storage.ts`.

> **Artifact:** G0-TRACE-001<br>
> **Trạng thái:** APPROVED tại Gate 0 ngày 22/10/2026; đang được nối sang P01<br>
> **Mục đích:** Mỗi tính năng GON phải chỉ rõ nguồn tham chiếu/tái sử dụng, mức reuse và phần GON phải tự sở hữu. P01 nối các `GON-Fxx` này sang Requirement ID, user story, BDD và MoSCoW tại `../02-requirements/P01-TRACEABILITY-MATRIX.md`.

## Cách đọc cột Reuse mode

- **Dependency:** dùng package/API chính thức, có pin/scan.
- **Port:** sao chép/sửa code ở phạm vi hẹp sau Audit bổ sung.
- **Pattern:** viết mới theo hành vi/kien trúc đã quan sát.
- **Adapt:** chuyển schema/contract upstream thành contract riêng của GON.
- **Reference:** chỉ tham chiếu hành vi/sản phẩm.
- **Build new:** GON tự thiết kế và xây.

## Ma trận chính

| ID | Tính năng GON | Nguồn chính | Thành phần đã Audit | Reuse mode | GON-owned work | Gate chốt |
|---|---|---|---|---|---|---|
| GON-F01 | Onboarding 18+, Google sign-in, consent | WSIC | `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts` | Pattern | Age policy, terms/consent, authz, session/security, account deletion | P01/P03 |
| GON-F02 | Universal Input: text, file, ảnh, URL, YouTube/Facebook/web | GON hiện tại | Prototype `classifyUrl`, ý tưởng input trong spec | Build new | Upload, URL fetcher an toàn, OCR/ASR/transcript, malware scan, rights/provenance | P01/P03 |
| GON-F03 | Semantic Search Gemini 768D | WSIC | `convex/schema.ts`, `convex/embeddings.ts`, `convex/search.ts` | Port có sửa hoặc Adapt | Chunking, model/version registry, hybrid score, threshold calibration, re-embedding | P03 |
| GON-F04 | No-result → Brew Your Topic | WSIC | `SearchResults.tsx` pattern, queue route, Generator API, ADK agents | Adapt + Pattern | Brew eligibility, idempotency, quota, progress, moderation trước publish | P01/P03 |
| GON-F05 | Module học tương tác nhiều block | WSIC + GON prototype | WSIC block validators; GON `createBrewModule` | Adapt | Canonical Module Graph, versioning, citations, difficulty, accessibility | P02/P03 |
| GON-F06 | Arena: hai output ẩn nhãn, vote left/right/tie/both-bad | FastChat | `gradio_block_arena_anony.py`, `gradio_block_arena_named.py`, conversation state | Pattern | GON UI/API, authenticated vote ledger, output snapshots, eligibility | P02/P03 |
| GON-F07 | Pairwise ranking/leaderboard | FastChat | `fastchat/serve/monitor/rating_systems.py`, `elo_analysis.py`, `monitor.py` | Port thuật toán có điều kiện hoặc Pattern | Confidence/min-votes, time decay, anti-collusion, category/persona cuts | P03 |
| GON-F08 | Nhiều model/provider tạo output cạnh tranh | FastChat | `api_provider.py`, controller/worker concepts | Pattern | Provider interface, routing, safety config, timeout/cost/quality telemetry | P03 |
| GON-F09 | 10+ next outputs theo persona/intent | GON | Yêu cầu V2.1; WSIC chỉ có interactions/trending cơ bản | Build new | Candidate generation, persona/intent features, diversity/exploration, giải thích | P01/P03 |
| GON-F10 | Trend velocity từ cộng đồng | GON | WSIC counters/trending update; TikTok/Facebook là reference | Build new + Adapt counters | Time-window trend, quality weights, bot resistance, trend provenance | P01/P03 |
| GON-F11 | Personal footprint recommendation | GON | WSIC `userTopicInteractions` là primitive | Build new | Consent, feature definitions, retention, ranking model/rules, user controls | P01/P03/P05 |
| GON-F12 | Journey Fork như Git | GON | Chưa có trong FastChat/WSIC | Build new | Branch/version graph, fork permissions, diff/merge rules, attribution chain | P01/P03 |
| GON-F13 | Lifelong Numeric Level từ Lifetime XP | GON hiện tại | `apps/gon-web/app.js`, tests, White Paper, design tokens | Evolve | Server XP Ledger, idempotent learning events, reversal/appeal, projections | P03 |
| GON-F14 | Proof Vault: POAP/Facebook/YouTube/ảnh/chứng chỉ | GON | Product spec và prototype Proof Vault | Build new | Evidence model, verifier adapters, hash/anchor options, privacy/retention | P01/P03 |
| GON-F15 | Creator attribution & success path | GON | Yêu cầu V2.1; upstream chưa có | Build new | Attribution graph, trend milestones, reward policy, dispute/anti-fraud | P01/P03 |
| GON-F16 | Kiểm tra hiểu thật, chống copy-paste | GON | WSIC quiz blocks; FastChat moderation chỉ là gợi ý | Build new + Adapt quiz schema | Assessment design, response analysis, remediation, integrity levels | P01/P02/P03 |
| GON-F17 | Render đa định dạng: web/infographic/video/image/task | GON | WSIC blocks là đầu vào nội dung | Build new trên Canonical Module Graph | Renderer contracts, media pipeline, captions/rights, QA | P02/P03 |
| GON-F18 | Game GDevelop từ topic/module | GDevelop | `GDJS`, `Core`, `newIDE`, `Extensions` | Dependency/Integration nghiên cứu tại P03 | Template mapping, exporter, embedded runtime plan, telemetry verification | P03 |
| GON-F19 | Async generation, retry, realtime status, notifications | WSIC | QStash route, Flask Generator API, Convex realtime patterns, notifications schema | Pattern | Queue được P03 chọn, DLQ, progress events, signed callbacks, cost controls | P03 |
| GON-F20 | Moderation, provenance và content lifecycle | GON | FastChat optional moderation; WSIC topic checker | Build new; Checker có thể Adapt | Policy engine, review queue, citations, takedown, appeal, audit log | P01/P03/P05 |
| GON-F21 | Analytics, observability, AI evaluation | GON | FastChat monitor concepts; WSIC chưa đủ production observability | Build new | Event taxonomy, privacy-safe logs, eval sets, dashboards/alerts | P03/P05 |
| GON-F22 | CI/CD, deployment, rollback | GDevelop repo practices + GON | CI hiện hữu của monorepo; WSIC không có workflow trong snapshot | Adapt/Build new | Pipeline riêng cho GON, IaC, environments, runbooks | P03/P06 |

## Những điều không được suy diễn từ nguồn

| Suy diễn sai cần tránh | Sự thật tại Gate 0 |
|---|---|
| “FastChat đã có Arena nên GON có sẵn hệ vote production.” | FastChat có UI/state/rating research code; GON vẫn cần identity, vote ledger, API, anti-abuse, privacy và UX riêng. |
| “WSIC đã có Brew nên chỉ cần đổi tên thành GON.” | WSIC có pipeline hữu ích nhưng authorization/data access/dependency/cost controls phải làm lại; module schema phải mở rộng thành Canonical Module Graph. |
| “GDevelop có sẵn editor/engine nên exporter là việc nhỏ.” | Cần spike tại P03 để biết nên sinh project, dùng template hay nhúng runtime; telemetry/XP vẫn thuộc GON. |
| “TikTok/Facebook có thuật toán trend nên có thể sao chép.” | Chỉ tham chiếu hành vi mong muốn. GON tự định nghĩa signals, consent và ranking có thể giải thích/kiểm chứng. |
| “Prototype đã có XP nên XP production đã xong.” | Prototype chỉ có công thức phía client. Production cần event ledger phía server, chống gian lận và reversal/appeal. |
| “Có POAP/social link là proof đã xác thực.” | Link/ảnh mới là evidence intake. Mức xác thực phụ thuộc verifier và policy tại P03/P05. |

## Truy vết sang tài liệu hiện có

| Nhóm ID | Tài liệu nguồn yêu cầu |
|---|---|
| GON-F01 → F06, F13 → F14, F16 → F18 | `GON-ORG-PRODUCT-SPEC-18PLUS.md`, prototype `apps/gon-web` |
| GON-F07 → F12, F15 → F17 | `GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md` |
| GON-F13 | `GON-WHITEPAPER.md`, `gon-level-v1` |
| GON-F18 | `GDEVELOP-GON-GUIDE.md`, kiến trúc GDevelop |
| GON-F19 → F22 | Gate 0, P03/P05/P06 trong quy trình AI-Agile |

## Quy tắc cập nhật ma trận

- P01 gán Requirement ID và acceptance criteria cho từng dòng hoặc tách dòng chi tiết hơn.
- P03 bổ sung API/schema/table/event tương ứng.
- P04 bổ sung PR, files và tests khi triển khai.
- Không xóa dòng đã bị bác; đổi trạng thái thành `Rejected`/`Deferred` và ghi ADR/PR liên quan.
