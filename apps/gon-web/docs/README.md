# GON — Software Delivery & Architecture

> **Mục đích:** Khu vực tài liệu kỹ thuật chính thức cho quá trình phát triển GON theo AI-Agile/HITL. Đây là nơi lưu quyết định kiến trúc, truy vết nguồn mở, tiêu chí từng gate và bằng chứng bàn giao.<br>
> **Repository sản xuất:** [`khanhlegood1/GDevelop`](https://github.com/khanhlegood1/GDevelop)<br>
> **Trạng thái hiện tại:** **Gate 0 — IN REVIEW**<br>
> **Product Owner:** Người sở hữu dự án GON trong cuộc trao đổi phê duyệt.<br>
> **Ngày lập Gate 0:** 22/10/2026

## Trạng thái các gate

| Gate | Tên | Trạng thái | Điều kiện mở gate tiếp theo |
|---|---|---|---|
| G0 | Source & Architecture Charter | **IN REVIEW** | PO duyệt gói Gate 0 |
| P01 | Requirement Intelligence | Chưa bắt đầu | G0 được duyệt |
| P02 | Frontend UX Agreement | Chưa bắt đầu | P01 được duyệt |
| P03 | API Contract & Data Model First | Chưa bắt đầu | P02 được duyệt |
| P04 | Vertical Slice Build | Chưa bắt đầu | P03 được duyệt |
| P05 | NFR & Well-Architected Review | Chưa bắt đầu | Các vertical slice trong phạm vi release hoàn tất |
| P06 | Cloud Deployment | Chưa bắt đầu | P05 đạt và PO ra quyết định Go-Live riêng |
| R0 | Review / Retrospective | Chưa bắt đầu | Sau mỗi release hoặc khi PO yêu cầu |

## Tài liệu Gate 0 cần PO duyệt

1. [Quy trình AI-Agile/HITL cho GON](00-process/GON-AI-AGILE-PROCESS.md)
2. [Cách review, yêu cầu sửa và phê duyệt gate](00-process/GATE-REVIEW-AND-APPROVAL.md)
3. [Gate 0 — Source & Architecture Charter](01-architecture/GATE0-SOURCE-ARCHITECTURE-CHARTER.md) — **tài liệu chính để duyệt**
4. [Ma trận Feature ↔ Source Traceability](01-architecture/FEATURE-SOURCE-TRACEABILITY.md)
5. [Thẻ Audit FastChat](01-architecture/audits/FASTCHAT-AUDIT.md)
6. [Thẻ Audit WSIC](01-architecture/audits/WSIC-AUDIT.md)
7. [Thẻ Audit GDevelop & GON hiện tại](01-architecture/audits/GDEVELOP-AND-CURRENT-GON-AUDIT.md)

## Architecture Decision Records

- [ADR-0001 — Giữ mã GON production trong `khanhlegood1/GDevelop`](01-architecture/adr/ADR-0001-PRODUCTION-CODE-IN-GDEVELOP-MONOREPO.md)
- [ADR-0002 — Tái sử dụng mã nguồn mở có chọn lọc sau Audit](01-architecture/adr/ADR-0002-SELECTIVE-OPEN-SOURCE-REUSE.md)
- [ADR-0003 — Phân bổ FastChat, WSIC và GDevelop theo tính năng](01-architecture/adr/ADR-0003-SOURCE-TO-FEATURE-ALLOCATION.md)
- [ADR-0004 — Chưa khóa stack production tại Gate 0](01-architecture/adr/ADR-0004-DEFER-PRODUCTION-STACK-LOCK-IN.md)

## Quyết định PO đã chọn trước khi lập gói Gate 0

Các lựa chọn sau đã được PO xác nhận trong phiên làm việc ngày 22/10/2026:

- **FastChat** là nguồn chính cho Learning/Output Arena, so sánh side-by-side, vote và provider/conversation patterns.
- **WSIC** là nguồn chính cho Search 768D, Brew Your Topic, Google ADK, hàng đợi bất đồng bộ và realtime patterns.
- **GDevelop/repository hiện tại** là nguồn sự thật của GON và là hướng renderer/exporter cho game học tập.
- Tái sử dụng code **có chọn lọc sau Audit**; không fork nguyên FastChat/WSIC thành production.
- Mã production của GON nằm trong **`khanhlegood1/GDevelop`**.

Việc PO duyệt gói Gate 0 xác nhận thêm: các biên hệ thống, phần GON phải tự xây, chính sách reuse, rủi ro và danh sách quyết định còn mở cho P01/P03.

## Tài liệu sản phẩm đã có

- [Đặc tả sản phẩm GON.org 18+](../../../branding/GON-GameOfNurture/07-Product-AI/GON-ORG-PRODUCT-SPEC-18PLUS.md)
- [Yêu cầu Trending, Footprint, Fork, Vote và Creator Path](../../../branding/GON-GameOfNurture/07-Product-AI/GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md)
- [GON White Paper 1.0](../../../branding/GON-GameOfNurture/07-Product-AI/GON-WHITEPAPER.md)
- [Kiến trúc prototype hiện tại](../ARCHITECTURE.md)
- [Prototype GON Web](../README.md)

## Nguyên tắc điều hành ngắn gọn

1. **AI Generates, Humans Approve** — AI không tự phê duyệt gate, tự merge thay PO hoặc tự Go-Live.
2. **GitHub là nguồn sự thật** — quyết định trong chat phải được ghi thành tài liệu/ADR/PR.
3. **Code là hệ quả** — Requirements → UX → API/Data → Build → NFR → Deploy.
4. **Reuse có bằng chứng** — mọi đoạn code được port phải có nguồn, commit, giấy phép, thay đổi và test.
5. **Không dùng dữ liệu/credentials production để thử nghiệm gate sớm** nếu chưa qua P05 và quyết định Go-Live riêng.
