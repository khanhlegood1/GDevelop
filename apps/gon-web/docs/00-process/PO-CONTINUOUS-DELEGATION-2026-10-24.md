# Ủy quyền phát triển liên tục của PO — 24/10/2026

> **Quyết định PO (ngày 24/10/2026, chat Arena):** *"tôi muốn bạn chạy tất cả các
> giai đoạn phát triển dự án GON này xem như tôi approved tất cả để bạn tự tạo
> PR mới, rồi tự merge vào nhánh chính master cho đến khi bạn làm xong dự án
> thì tôi mới xem lại và quyết định sửa đổi phần nào cho hợp lý."*

## 1. Nghĩa vụ hành chính (diễn giải chỉ thị)

1. **Phê duyệt trước toàn bộ giai đoạn phát triển còn lại** của GON (P05 hoàn
   tất + P06 triển khai) — agent **không cần xin sign-off từng gate** nữa.
2. **Agent tự tạo PR và tự merge vào `master`** cho từng lát cắt (đảo ngược
   quy tắc "chỉ merge khi PO yêu cầu riêng" trước đây — quy tắc cũ hết hiệu lực
   kể từ chỉ thị này).
3. **PO tổng review sau cùng** và quyết định sửa đổi — mọi quyết định triển
   khai trong giai đoạn ủy quyền này được ghi trong evidence doc của lát cắt
   để phục vụ review.
4. Các phê duyệt cũ (Gate 0 `5482dac`, P01 `9a09fa2`, P02 `33c2641`, P03
   `b4e6ec2`, P04 `76eac20`/`ef594de`) giữ nguyên hiệu lực; `D-SB-01`–`D-SB-06`
   (sửa GDevelop-core cho storybook) **được coi là đã được phê duyệt** trong
   khuôn khổ ủy quyền này và sẽ được thực thi.

## 2. Ranh giới trung thực (không thay đổi theo ủy quyền)

Ủy quyền phát triển **không** biến evidence thành production evidence:

- Bằng chứng chạy trong sandbox (PGlite/memory/fake transport) luôn gắn nhãn
  **local/hermetic**.
- Các mục cần hạ tầng/credentials thật — Gemini API thật, managed PostgreSQL/
  Cloud SQL + IAM, GCS, staging DAST/load/accessibility, deploy Cloud Run,
  Go-Live — **không thể thực thi trong sandbox** (mạng hạn chế GitHub/npm/PyPI,
  không có credentials nhà cung cấp). Chúng được **đóng gói sẵn** (manifests,
  workflow, runbook, checklist, script) và đánh dấu **NOT RUN — chờ chạy trên
  hạ tầng thật**, tuyệt đối không bịa kết quả.
- Gate P05/P06 được *chuẩn bị gói re-review đầy đủ* cho PO quyết định cuối;
  mọi claim "production-ready" chỉ được viết khi có evidence hạ tầng thật.

## 3. Lộ trình lát cắt trong giai đoạn ủy quyền (mỗi lát cắt = PR → tự merge)

| # | Lát cắt | Nội dung chính | Trạng thái |
|---|---|---|---|
| R1.7 | Privacy export/delete + account lifecycle | Chuẩn P03 `privacy.request.*`, xóa/ẩn danh dữ liệu user, E2E lifecycle | **xong** — [evidence](../06-nfr/P05-R1.7-PRIVACY-EXPORT-DELETE.md) |
| R1.8 | Upload/URL safety hardening | SSRF guard, MIME/magic-byte, quarantine theo `safety_status`, chặn URL nội bộ | **xong** — [evidence](../06-nfr/P05-R1.8-UPLOAD-URL-SAFETY.md) |
| R1.9 | Assess-attempt AI + AI evaluation | Tích hợp `assess_attempt` qua AI provider port + `ai_runs`, eval harness | **xong** — [evidence](../06-nfr/P05-R1.9-ASSESS-ATTEMPT-AI.md) (eval harness → R1.15/P05-R2) |
| R1.10 | Abuse/cost distributed controls | Rate-limit per-IP/edge module, token bucket, budget alert hooks, idempotent flood guard | **xong** — [evidence](../06-nfr/P05-R1.10-ABUSE-COST-DISTRIBUTED-CONTROLS.md) (edge module `deploy/edge-rate-limit/` NOT RUN chờ hạ tầng) |
| R1.11 | Observability + backup/restore/DR | Metrics/logs có cấu trúc, readiness sâu, backup/restore scripts, DR runbook | **xong** — [evidence](../06-nfr/P05-R1.11-OBSERVABILITY-BACKUP-DR.md) (backup/DR drill NOT RUN chờ hạ tầng thật) |
| R1.12 | Supply-chain & quality gates | Python locks + SBOM, đóng `CVE-2026-114603`, coverage gate, npm audit pin | **xong** — [evidence](../06-nfr/P05-R1.12-SUPPLY-CHAIN-QUALITY-GATES.md) (google-adk 2.13.0 + governed exception có expiry 2027-01-31; SBOM publishing NOT RUN chờ ops) |
| R1.13 | Tàn dư hiệu năng/kiến trúc | `indexModuleVersion` ra ngoài UoW, targeted pagination còn lại | **xong** — [evidence](../06-nfr/P05-R1.13-INDEXING-PHASE-TARGETED-PAGINATION.md) (embedding indexing tách khỏi transaction + 4 list endpoint phân trang SQL ngoài UoW; `listProjects`/ingest embeds còn mở — xem §4 evidence) |
| R1.14 | Storybook CI xanh (thực thi `D-SB-01`) | Sửa build storybook GDevelop-core tối thiểu để CI xanh | **xong** — [evidence](../06-nfr/P05-R1.14-STORYBOOK-CI-D-SB-ENACTMENT.md) (path-filter `D-SB-01(a)` + guards secrets AWS/Crowdin; root cause = fork thiếu secrets upstream; artifact GON Storybook mỗi PR `D-SB-04(b)`; CI xanh trên runner chưa quan sát được vì Actions không spawn run từ 23/10 22:28 UTC — xem §4) |
| R1.15 | Staging verification package + P05 re-review | DAST/load probe local, gói evidence tổng, trình PO duyệt P05 | **xong** — [evidence](../06-nfr/P05-R1.15-STAGING-VERIFICATION-PACKAGE.md) + [gói staging](../../deploy/staging-verification/staging-checklist.md) (probe 7/7 + benchmark refresh + guard-engagement 120-strikes đo end-to-end; P05 đề xuất giữ NOT YET PASS — chờ PO phán quyết) |
| P06-S1 | Cloud deployment package | Đóng gói hạ tầng GCP + Docker images + worker entrypoint + workflow build; execution/Go-Live KHÔNG chạy | **xong (packaging only, NOT RUN)** — [evidence](../07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md) + [gói lệnh](../../deploy/gcp/README.md) (D1–D10; thực thi vẫn chờ P05 APPROVED + quyết định Go-Live của PO) |
| R0 | Final Review Package | Gói tổng kết toàn dự án cho buổi review tổng của PO: biên niên sử, kiểm kê quyết định, ma trận trạng thái, checklist phán quyết một trang | **xong** — [R0-FINAL-REVIEW-PACKAGE.md](R0-FINAL-REVIEW-PACKAGE.md) (kết luận gate vẫn thuộc PO) |
| FE-Confirm | Standalone web xác nhận Front End | Một tệp HTML duy nhất, 14 màn hình S01–S14 + 11 luồng F1–F11 (kể cả V2.1: persona/fork/arena/POAP/cấp suốt đời), mock 100%, localStorage; E2E jsdom 40/40 | **xong** — [`ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) + [README](../../ux-prototype/README.md) (PO duyệt trực tiếp trên bản demo; không đụng source production) |
| FE-Confirm-2 | Redesign TikTok-style theo phản hồi PO | Bỏ cổng 18+ (PO quyết định dự án không lọc tuổi), đăng nhập ẩn danh UUID (kiểu ai-doctor-admin) + Google, feed dọc + tab bar 5 mục, output sau Brew thành topic có điểm xu hướng trong Bảng tin; E2E jsdom 48/48 + 11/11 flow | **xong** — [`ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) (quyết định PO 24/10 tối: de-18+ — **production docs/code còn sót 18+ cần slice dọn riêng, ghi vào hàng chờ**) |
| FE-Confirm-3 | Menu trái + thanh tìm kiếm trên (TikTok desktop) | Sidebar trái 8 mục + "Chủ đề nổi bật" theo xu hướng (desktop thay tab bar; mobile giữ tab bar), top search persistent (Enter/nút → Khám phá), guard redirect mọi route về login khi chưa đăng nhập; E2E jsdom 62/62 + 11/11 flow | **xong** — [`ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) |
| FE-Confirm-4 | Góp ý PO: tab Hot/Dành cho bạn lên trên cùng (trên cả thanh tìm kiếm), xoá top search ở Khám phá | Tab 🔥 Đang Hot / 🎯 Dành cho bạn chuyển thành thanh tab trên cùng của cột chính (kiểu TikTok, thanh chỉ báo gradient dưới tab active) — phần tìm kiếm là dùng chung nên nằm dưới; top search ẩn thêm ở Khám phá vì trang này đã có ô tìm riêng; E2E jsdom 68/68 + 11/11 flow | **xong** — [`ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) |
| FE-Confirm-5 | Quyết định PO: Unified Discover — bỏ UI chọn Persona/Độ sâu (chạy mặc định tất cả 12 tổ hợp, output như feed TikTok; chọn output = persona reveal + Arena + dấu chân đẳng cấp), gộp Brew + Arena vào Khám phá; ghi vào tất cả tài liệu + code chính | Standalone v2.3: mọi tổ hợp Persona × Độ sâu render trong Khám phá (không selector), Brew inline (redirect #/brew,#/arena → #/discover, sidebar 6 mục), Arena là khối trong Khám phá, pick-output ghi dấu chân đẳng cấp (Hồ sơ/Hành trình/POAP); ghi chú quyết định ở 28 docs + doc quyết định riêng + `src/lib/product-decisions.ts`; E2E jsdom 82/82 + 11/11 flow | **xong** — [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md) · [`ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) |
| FE-Confirm-6 | Quyết định PO 23:36: Khám phá mang dữ liệu từ thanh tìm kiếm (đồng bộ tất cả dữ liệu) + chuyển toàn bộ dự án sang IndexedDB; ghi vào tất cả tài liệu + code chính | Standalone v2.4: storage layer IndexedDB (fallback + migrate localStorage, guard BOOTED chống race clobber), ô tìm Khám phá prefilled query cuối + đồng bộ hai chiều với top search; E2E 91/91 (fake-indexeddb, reload → phục hồi tiến trình, localStorage rỗng); code chính: `src/lib/browser-storage.ts` + `INDEXEDDB_STORAGE_DECISION`; ghi chú ở 29 tài liệu + doc quyết định riêng | **xong** — [`PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md`](PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md) · [`ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) |
| P06 | Cloud deployment package | Cloud Run/Cloud SQL manifests, deploy workflows, migration/worker deploy, Go-Live checklist (NOT RUN) | chờ |

Mỗi lát cắt: code + test + validation battery + evidence doc + cross-links →
commit trên `arena/4be72878-gdevelop` → PR → **tự merge** vào `master` (CI
UNSTABLE do `build-storybook` được chấp nhận cho tới R1.14; **R1.14 đã path-filter
+ guard secrets nên kỳ vọng CI xanh khi Actions chạy lại** — lưu ý Actions của
repo ngừng spawn run cho commit mới từ 23/10 22:28 UTC, chưa quan sát được trên
runner).
