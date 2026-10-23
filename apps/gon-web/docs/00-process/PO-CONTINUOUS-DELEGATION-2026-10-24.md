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
| R1.9 | Assess-attempt AI + AI evaluation | Tích hợp `assess_attempt` qua AI provider port + `ai_runs`, eval harness | chờ |
| R1.10 | Abuse/cost distributed controls | Rate-limit per-IP/edge module, token bucket, budget alert hooks, idempotent flood guard | chờ |
| R1.11 | Observability + backup/restore/DR | Metrics/logs có cấu trúc, readiness sâu, backup/restore scripts, DR runbook | chờ |
| R1.12 | Supply-chain & quality gates | Python locks + SBOM, đóng `CVE-2026-114603`, coverage gate, npm audit pin | chờ |
| R1.13 | Tàn dư hiệu năng/kiến trúc | `indexModuleVersion` ra ngoài UoW, targeted pagination còn lại | chờ |
| R1.14 | Storybook CI xanh (thực thi `D-SB-01`) | Sửa build storybook GDevelop-core tối thiểu để CI xanh | chờ |
| R1.15 | Staging verification package + P05 re-review | DAST/load probe local, gói evidence tổng, trình PO duyệt P05 | chờ |
| P06 | Cloud deployment package | Cloud Run/Cloud SQL manifests, deploy workflows, migration/worker deploy, Go-Live checklist (NOT RUN) | chờ |

Mỗi lát cắt: code + test + validation battery + evidence doc + cross-links →
commit trên `arena/4be72878-gdevelop` → PR → **tự merge** vào `master` (CI
UNSTABLE do `build-storybook` được chấp nhận cho tới R1.14; sau R1.14 kỳ vọng
CI xanh).
