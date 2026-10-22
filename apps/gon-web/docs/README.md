# GON — Software Delivery & Architecture

> **Mục đích:** Khu vực tài liệu kỹ thuật chính thức cho quá trình phát triển GON theo AI-Agile/HITL. Đây là nơi lưu quyết định kiến trúc, truy vết nguồn mở, tiêu chí từng gate và bằng chứng bàn giao.<br>
> **Repository sản xuất:** [`khanhlegood1/GDevelop`](https://github.com/khanhlegood1/GDevelop)<br>
> **Trạng thái hiện tại:** **Gate 0 APPROVED · P01 APPROVED · P02 IN REVIEW**<br>
> **Product Owner:** Người sở hữu dự án GON trong cuộc trao đổi phê duyệt.<br>
> **Gate 0 được PO duyệt:** 22/10/2026 tại commit `5482dac`<br>
> **P01 được PO duyệt:** 22/10/2026 tại commit `9a09fa2`, gồm toàn bộ `D-P01-01`…`D-P01-14`<br>
> **Ngày trình P02:** 22/10/2026

## Trạng thái các gate

| Gate | Tên | Trạng thái | Điều kiện mở gate tiếp theo |
|---|---|---|---|
| G0 | Source & Architecture Charter | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 |
| P01 | Requirement Intelligence | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 tại `9a09fa2` |
| P02 | Frontend UX Agreement | **IN REVIEW** | PO duyệt IA/flow/wireframe/prototype và `D-P02-01`…`D-P02-12` |
| P03 | API Contract & Data Model First | Chưa bắt đầu | P02 được duyệt |
| P04 | Vertical Slice Build | Chưa bắt đầu | P03 được duyệt |
| P05 | NFR & Well-Architected Review | Chưa bắt đầu | Các vertical slice trong phạm vi release hoàn tất |
| P06 | Cloud Deployment | Chưa bắt đầu | P05 đạt và PO ra quyết định Go-Live riêng |
| R0 | Review / Retrospective | Chưa bắt đầu | Sau mỗi release hoặc khi PO yêu cầu |

## Tài liệu P02 đang trình PO duyệt

1. [P02 — Frontend UX Agreement: cổng gói, quyết định và checklist phê duyệt](03-ux/README.md) — **tài liệu chính để duyệt P02**
2. [Information Architecture](03-ux/INFORMATION-ARCHITECTURE.md)
3. [User Flows](03-ux/USER-FLOWS.md)
4. [Wireframe & Screen Specification](03-ux/WIREFRAME-SCREEN-SPEC.md)
5. [Design System, Responsive & Accessibility](03-ux/DESIGN-SYSTEM-RESPONSIVE-ACCESSIBILITY.md)
6. [Interaction States & Content](03-ux/INTERACTION-STATES-AND-CONTENT.md)
7. [P02 Traceability Matrix](03-ux/P02-TRACEABILITY-MATRIX.md)
8. [Usability Review Plan](03-ux/USABILITY-REVIEW-PLAN.md)
9. [Clickable mock-data prototype](../ux-prototype/README.md) — mở trực tiếp tại [`../ux-prototype/index.html`](../ux-prototype/index.html)

## Tài liệu P01 đã được phê duyệt

1. [P01 — Requirement Intelligence: cổng gói và kết quả phê duyệt](02-requirements/README.md)
2. [GON Product Requirements Document v1.0](02-requirements/GON-PRD-V1.md) — **APPROVED**
3. [Personas, Jobs-to-be-Done & Learning Modes](02-requirements/PERSONAS-JTBD-AND-LEARNING-MODES.md)
4. [Backlog, MoSCoW & Vertical Slices](02-requirements/BACKLOG-MOSCOW-AND-VERTICAL-SLICES.md)
5. [Acceptance Criteria dạng BDD](02-requirements/ACCEPTANCE-CRITERIA-BDD.md)
6. [Metrics, Risks & Open Decisions](02-requirements/METRICS-RISKS-AND-OPEN-DECISIONS.md)
7. [P01 Traceability Matrix](02-requirements/P01-TRACEABILITY-MATRIX.md)

## Tài liệu Gate 0 đã được phê duyệt

1. [Quy trình AI-Agile/HITL cho GON](00-process/GON-AI-AGILE-PROCESS.md)
2. [Cách review, yêu cầu sửa và phê duyệt gate](00-process/GATE-REVIEW-AND-APPROVAL.md)
3. [Gate 0 — Source & Architecture Charter](01-architecture/GATE0-SOURCE-ARCHITECTURE-CHARTER.md) — **APPROVED**
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

PO đã duyệt Gate 0 tại commit `5482daca3d8ef424e9d7aa81102f0d135c55de84`, sau đó duyệt P01 tại commit `9a09fa21fd8a27536eddb97ad179d14db3aab7ac` cùng toàn bộ `D-P01-01`…`D-P01-14` và cho phép bắt đầu P02. P02 vẫn là gate riêng: P03 chỉ bắt đầu sau khi PO duyệt gói UX này.

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
