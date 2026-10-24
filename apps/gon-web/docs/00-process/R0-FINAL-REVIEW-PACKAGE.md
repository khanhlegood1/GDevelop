# R0 — Final Review Package (gói tổng kết trình Product Owner)

> **Mục đích:** tài liệu một-cửa cho buổi **review tổng** mà PO yêu cầu sau khi
> ủy quyền liên tục 24/10/2026 ("chạy hết các giai đoạn còn lại, tôi approved
> tất cả, đến lúc xong thì tôi review và chỉnh"). Toàn bộ dự án GON từ V1 đến
> P06-S1 được tổng hợp ở đây: biên niên sử, kiểm kê quyết định, ma trận trạng
> thái trung thực, và **checklist phán quyết một trang** (mục 5).
> **Không có nội dung nào trong doc này tự mang giá trị phê duyệt** — mọi kết
> luận gate vẫn thuộc về PO (nguyên tắc §2 của văn bản ủy quyền).

## 1. Tóm tắt điều hành

**GON — Game Of Nurture**: nền tảng giáo dục 18+ (mô hình ZOFO), nơi mọi đầu
vào (text/file/ảnh/link YouTube/Facebook/link web) vừa là truy vấn tìm kiếm
vừa là nội dung học; tìm yếu → "Brew Your Topic"; học tương tác đa định dạng;
chứng minh việc học (POAP + input history); fork hành trình + bình chọn kiểu
Arena + gợi ý theo footprint; cấp suốt đời không trần `floor(LifetimeXP/100)`.

Dự án bàn giao **ba tầng**, tách bạch rõ:

| Tầng | Nội dung | Tình trạng |
|---|---|---|
| **T1 — Yêu cầu đã tài liệu hóa** | PRD V1/V2 (18+)/V2.1 (trend/fork/XP), hệ cấp trọn đời + White Paper 1.0, personas/acceptance/BDD, traceability P01/P02/P03, OpenAPI + data model + schema P03 (LOCKED) | **PO đã duyệt từng gate** (Gate 0, P01, P02, P03) |
| **T2 — Source production-shaped** | `apps/gon-web` (Next.js 16, VS1 vertical slice + P05 hardening R1.1–R1.15), `apps/gon-adk` (FastAPI stateless, Google ADK), Storybook GON | **Battery xanh local/hermetic** — 154/154 test, coverage 65,59/55,64/71,25/68,2 (sàn 62/52/67/65), 10 migrations, 262 link docs 0 đứt |
| **T3 — Gói triển khai** | Staging verification package (probe 4-phase + checklist §0–§10), Cloud deployment package (deploy/gcp 00→80 + Docker images + worker entrypoint + workflow build) | **PACKAGED — NOT RUN**: chưa lệnh nào chạy trên hạ tầng thật |

Nguyên tắc xuyên suốt mà mọi evidence doc giữ: **bằng chứng local/hermetic
không bao giờ bị tuyên là production-ready**; mọi gì chưa chạy thật đều dán
NOT RUN.

## 2. Biên niên sử gate (toàn bộ PR)

| # | Giai đoạn | PR | Head | Merge |
|---|---|---|---|---|
| 1 | V1 — Logo & brand identity GON | #6 | `c9600a5` | `6a808db` |
| 2 | V2 — Reposition 18+ + prototype học AI | #7 (bản ghi PR CLOSED trên GitHub; **nhánh đã merge thật** qua merge commit) | — | `fa5326dc` |
| 3 | V2.1 — Trend/fork/XP/persona outputs | #8 | `d80df3f` | `6d04c870` |
| 4 | Cấp trọn đời + White Paper 1.0 | #9 | `b3ab051` | `c1cd266e` |
| 5 | **Gate 0** — Source & Architecture Charter `5482daca` + **P01** `9a09fa21` | #10 | — | `da451257` |
| 6 | **P02** — UX agreement | #11 | `33c2641e` | (direct) |
| 7 | **P03** — API/data contracts (LOCKED) | #12 | `b4e6ec2e` | `3a03f8e` |
| 8 | **P04** — VS1 vertical slice | #13 | `76eac20` | `ef594de` |
| 9 | **P05** — NFR review + hardening (kết luận **NOT YET PASS**) | #14 | `c2bc043` | `cad7d9f` |
| 10–24 | P05 remediation R1.1→R1.14 | #15–#30 | xem bảng §3 | `d341093` … `b876bf7` |
| 25 | R1.15 — staging verification package + P05 re-review trình PO | #31 | `b075e3f` | `84e644b` |
| 26 | P06-S1 — cloud deployment package (packaged, NOT RUN) | #32 | `d3536a9` | `64889ca` |

(PR #1–#5: các slice GDevelop-core trước Gate 0 — pin binaries, self-hosted
workspace, Docker/Nginx, service worker, fix dashboard — không thuộc GON.)

## 3. Kiểm kê quyết định

| Nhóm | ID | Trạng thái | Nơi xem |
|---|---|---|---|
| Gate 0 | Điều lệ kiến trúc + mapping nguồn mở | **PO duyệt** `5482daca` | [01-architecture/GATE0-SOURCE-ARCHITECTURE-CHARTER.md](../01-architecture/GATE0-SOURCE-ARCHITECTURE-CHARTER.md) |
| P01 | `D-P01-01`…`D-P01-14` | **PO duyệt** `9a09fa21` | [02-requirements](../02-requirements/README.md) |
| P02 | `D-P02-01`…`D-P02-12` | **PO duyệt** `33c2641e` | [03-ux](../03-ux/README.md) |
| P03 | `D-P03-01`…`D-P03-14`; contracts **LOCKED** — không đổi không qua quy trình P03 | **PO duyệt** `b4e6ec2e` | [04-contracts](../04-contracts/README.md) |
| P04 | Duyệt **toàn bộ** PR #13 (không có `D-P04-*` riêng) | **PO duyệt** `ef594de` | [05-build](../05-build/README.md) |
| P05 | `D-P05-01`…`D-P05-07` | **ĐỀ XUẤT — chờ PO** | [06-nfr README §6](../06-nfr/README.md) |
| Storybook | `D-SB-01`…`D-SB-06` | **Duyệt trong ủy quyền** (R1.14 enacted `D-SB-01(a)`) | [05-build/STORYBOOK-SCOPE-IMPACT-AND-CORE-DECISION.md](../05-build/STORYBOOK-SCOPE-IMPACT-AND-CORE-DECISION.md) |
| P06-S1 | `D1`–`D10` | **Ghi nhận trong ủy quyền — PO xác nhận tại review này** | [07-deployment/P06-S1](../07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md) |
| R1.x slices | Quyết định kỹ thuật từng slice (VD: R1.15 `D1–D7`, R1.10, R1.12…) | Ghi trong từng evidence doc | [06-nfr](../06-nfr/README.md) |

Điểm nhấn remediation R1.1–R1.15 (bằng chứng local/PGlite, chi tiết từng
evidence doc): PostgreSQL repositories + Unit of Work (R1.1–R1.2); durable
jobs + transactional outbox (R1.3); Auth DB-session + private object storage
(R1.4); worker runtime + TS→ADK stateless contract (R1.5); persistent
quotas/kill switches + targeted queries + RLS targets (R1.6); privacy
export/delete/lifecycle (R1.7); upload/URL safety (R1.8); assess-attempt AI +
eval harness (R1.9); distributed abuse/cost controls + 429/Retry-After
(R1.10); observability + deep readiness + backup/DR packaging (R1.11);
supply-chain locks/SBOM/coverage gate (R1.12); indexing ngoài UoW + targeted
pagination (R1.13); CI fork-friendly (R1.14); probe staging + P05 re-review
(R1.15).

## 4. Ma trận trạng thái trung thực

| Mảng | ĐÃ CÓ BẰNG CHỨNG LOCAL/HERMETIC | PACKAGED — NOT RUN | CHỜ PO |
|---|---|---|---|
| Nền tảng dữ liệu | 10 migrations; repositories/UoW; hybrid search SQL; queue/outbox; worker runtime; PGlite verified | `deploy/gcp/00–55` | managed PG chạy thật; **outbox sink đích** |
| Xác thực | Auth.js PG adapter, DB session/revoke (PGlite) | `45-deploy-web.sh` | Google OAuth thật E2E |
| AI/Search | ADK stateless contract + loopback; assess AI; eval harness; deterministic provider | `40-deploy-adk.sh` | Gemini thật; S-P03-01/03 trên corpus; golden eval |
| Abuse/cost | Token bucket + flood guard + budget/kill-switch; **guard-engagement 429 đo end-to-end local** (R1.15) | Cloud Armor policy + LB | chạy trên edge thật; ngưỡng staging |
| Privacy | Export/delete/footprint purge + lifecycle | retention jobs (exports bucket) | legal review 18+/policy |
| Observability/DR | Structured logs; deep readiness fail-closed; backup/DR scripts | `70-observability.sh`, `80-restore-drill.sh` | alert channel verify; **drill thật đo RPO/RTO** |
| Kiểm thử | 154/154; coverage gate; DAST-equivalent 7/7; benchmark local refresh | staging-checklist §5–§8 | ZAP/load thật/axe browser/Web Vitals |
| Supply chain | Lock hashes Python + SBOM; CVE exception có hạn (hết 2027-01-31); CI path-filtered | `gon-deploy.yml` (dispatch-only) | **required checks khi Actions hồi phục**; SBOM publishing |
| Triển khai | Docker images 2 service; worker entrypoint instrumentation (test) | toàn bộ `deploy/gcp` | hạ tầng GCP + secrets [PO] + DNS + **Go-Live** |

**Vấn đề môi trường đã biết:** GitHub Actions ngừng spawn run cho commit sau
`92f3092a` (23/10 22:28 UTC) — GitHub-side; mọi slice từ đó quyết bằng
battery local, CI trên runner chưa quan sát được.

## 5. Checklist phán quyết của PO (một trang)

**A. P05 (theo [R1.15 §4](../06-nfr/P05-R1.15-STAGING-VERIFICATION-PACKAGE.md))**
1. Xác nhận P05 **IN REVIEW — NOT YET PASS** hay phán quyết khác (D-P05-01).
2. Duyệt/không `staging-checklist.md` làm cơ sở nghiệm thu P06.
3. Duyệt phương pháp probe 2-chế-độ (default cho hành vi, relaxed cho latency).
4. Chọn ngưỡng `GON_ABUSE_FLOOD_*` cho staging (mặc định 120 strikes/10s/IP).
5. Khi Actions chạy lại: bật required checks (GON CI jobs) — cần admin repo.
6. Phán quyết từng `D-P05-01`…`D-P05-07` (06-nfr README §6).

**B. P06 (theo [P06-S1](../07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md))**
7. Xác nhận/không các quyết định `D1–D10` (đặc biệt D1: thực thi vẫn chờ P05 APPROVED).
8. Cấp GCP project + billing; điền `gcp.env`; điền secrets **[PO]**: Google OAuth client, Gemini API key, outbox sink receiver.
9. Sau khi chạy 00→70 + DNS: ghi kết quả thật vào staging-checklist §1–§10.
10. Diễn tập DR (`80-restore-drill.sh`) và ghi số RPO ≤ 24h / RTO ≤ 4h thật.
11. **Quyết định Go-Live riêng** (Private Alpha).

**C. Khoảng trống kỹ thuật còn mở (không chặn phán xét, cần kế hoạch)**
12. B-P05-04: malware scan, parser sandbox, image/PDF limits, DNS-rebinding trên fetcher thật.
13. `listProjects` chưa chạy trong UoW; artifact-ingest embeds chưa tách khỏi UoW (R1.13 open items).
14. EXPLAIN kế hoạch 20k–100k chunk corpus chưa chạy.
15. Dispatcher VS1 chỉ cover một phần OpenAPI P03: profile/data-request, Arena, game events, trend/creator analytics, admin/moderation, fetch/OCR/transcript, các slice VS2–VS5 (xem [src/README](../../src/README.md)).
16. Nợ Storybook GDevelop-core theo `D-SB-02…06` (phần chưa thực thi).

## 6. Retrospective (rút kinh nghiệm quy trình)

**Hiệu quả:** khung AI-Agile "AI generates, humans approve" + gate evidence
doc khiến mọi thay đổi truy vết được về quyết định; ủy quyền liên tục với
"ranh giới trung thực" (không được fabricate staging claim) cho phép agent
tự merge 18 PR mà review cuối vẫn có đủ ngữ cảnh; nhãn local/hermetic vs
NOT RUN giữ nguyên chất bằng chứng.

**Cần cải thiện:** (1) sự cố Actions không spawn run làm mất tín hiệu CI trên
runner ~1 ngày cuối — cần required checks ngay khi hồi phục; (2) sandbox
không có hạ tầng thật nên ranh giới "local verified" ↔ "staging execution"
phải được kỷ chặt bằng checklist (đã làm ở R1.15/P06-S1, giữ tiếp); (3) khối
lượng tài liệu lớn — doc một-cửa này là đáp ứng, nhưng các slice sau Go-Live
nên giữ evidence doc ngắn hơn và dẫn chiếu thay vì lặp.

**Rủi ro đã biết tại thời điểm review:** gcp package chưa chạy lần nào (lần
đầu có thể cần chỉnh cú pháp nhỏ — ghi bổ sung decision); CVE-2026-114603
(governed exception hết hạn 2027-01-31, tripwire có sẵn); P03 locked — mọi
đổi phải qua quy trình P03.

## 7. Bước tiếp theo sau review này

1. PO phán quyết mục 5A (P05) → cập nhật gate table.
2. PO thực hiện 5B (hạ tầng + secrets) → agent/hom chạy staging-checklist
   §0–§10, ghi evidence thật, hoàn tất P05 blockers.
3. P06 execution + Go-Live Private Alpha (quyết định riêng của PO).
4. R0 retro chính thức sau release đầu tiên; cập nhật White Paper theo dữ
   liệu thật; mở VS2–VS5 theo backlog MoSCoW đã duyệt ở P01.
