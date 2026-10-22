# GON — Software Delivery & Architecture

> **Mục đích:** Khu vực tài liệu kỹ thuật chính thức cho quá trình phát triển GON theo AI-Agile/HITL. Đây là nơi lưu quyết định kiến trúc, truy vết nguồn mở, tiêu chí từng gate và bằng chứng bàn giao.<br>
> **Repository sản xuất:** [`khanhlegood1/GDevelop`](https://github.com/khanhlegood1/GDevelop)<br>
> **Trạng thái hiện tại:** **Gate 0 APPROVED · P01 APPROVED · P02 APPROVED · P03 APPROVED · P04 APPROVED · P05 IN REVIEW — NOT YET PASS**<br>
> **Product Owner:** Người sở hữu dự án GON trong cuộc trao đổi phê duyệt.<br>
> **Gate 0 được PO duyệt:** 22/10/2026 tại commit `5482dac`<br>
> **P01 được PO duyệt:** 22/10/2026 tại commit `9a09fa2`, gồm toàn bộ `D-P01-01`…`D-P01-14`<br>
> **P02 được PO duyệt:** 22/10/2026 tại commit `33c2641`, gồm toàn bộ `D-P02-01`…`D-P02-12`<br>
> **P03 được PO duyệt:** 22/10/2026 tại commit `b4e6ec2`, gồm toàn bộ `D-P03-01`…`D-P03-14`<br>
> **P04 được PO duyệt:** 22/10/2026 cho PR #13, implementation head `76eac20`, merge `ef594de`; PO đồng thời cho phép bắt đầu P05

## Trạng thái các gate

| Gate | Tên | Trạng thái | Điều kiện mở gate tiếp theo |
|---|---|---|---|
| G0 | Source & Architecture Charter | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 |
| P01 | Requirement Intelligence | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 tại `9a09fa2` |
| P02 | Frontend UX Agreement | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 tại `33c2641` |
| P03 | API Contract & Data Model First | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 tại `b4e6ec2` |
| P04 | Vertical Slice Build | **APPROVED** | Đã được PO duyệt ngày 22/10/2026 cho PR #13/head `76eac20`/merge `ef594de` |
| P05 | NFR & Well-Architected Review | **IN REVIEW — NOT YET PASS** | Đóng các blocker production và được PO duyệt sau re-review |
| P06 | Cloud Deployment | Chưa bắt đầu | P05 đạt và PO ra quyết định Go-Live riêng |
| R0 | Review / Retrospective | Chưa bắt đầu | Sau mỗi release hoặc khi PO yêu cầu |

## Tài liệu P05 đang review

1. [P05 — NFR & Well-Architected Review: cổng gói và blockers](06-nfr/README.md) — **IN REVIEW — NOT YET PASS**
2. [Đặc tả NFR và kết quả đo](06-nfr/NFR-SPECIFICATION-AND-RESULTS.md)
3. [Threat model, kiểm chứng bảo mật và findings](06-nfr/SECURITY-THREAT-MODEL-AND-VERIFICATION.md)
4. [Performance, Accessibility và AI Evaluation](06-nfr/PERFORMANCE-ACCESSIBILITY-AND-AI-EVALUATION.md)
5. [Reliability, Observability, DR và Well-Architected gaps](06-nfr/RELIABILITY-OBSERVABILITY-AND-WELL-ARCHITECTED.md)

## Tài liệu P04 đã được phê duyệt

1. [P04 — Vertical Slice Build: baseline, spike và bằng chứng VS1](05-build/README.md) — **APPROVED**
2. [Production GON Web application](../src/README.md) — Next.js/TypeScript modular monolith theo P03; vẫn là local/test increment, không phải deployment
3. [PostgreSQL schema & migrations](../db/README.md) — SQL-first schema đã có; chưa chạy trên PostgreSQL thật trong sandbox
4. [GON ADK contract service](../../gon-adk/README.md) — Python/FastAPI/ADK harness; local provider đã test, Gemini thật chưa chạy

## Tài liệu P03 đã được phê duyệt

1. [P03 — API Contract & Data Model First: cổng gói và kết quả phê duyệt](04-contracts/README.md) — **APPROVED**
2. [Domain Model & ERD](04-contracts/DOMAIN-MODEL-AND-ERD.md)
3. [API Contract](04-contracts/API-CONTRACT.md) và [OpenAPI 3.1](04-contracts/openapi.json)
4. [Canonical Module Graph](04-contracts/CANONICAL-MODULE-GRAPH.md)
5. [Search, Brew & ADK Contracts](04-contracts/SEARCH-BREW-AND-ADK-CONTRACTS.md)
6. [State Machines & Business Rules](04-contracts/STATE-MACHINES-AND-BUSINESS-RULES.md)
7. [Events, Jobs & Integrations](04-contracts/EVENTS-JOBS-AND-INTEGRATIONS.md)
8. [Identity, Authorization, Privacy & Retention](04-contracts/IDENTITY-AUTHORIZATION-PRIVACY-AND-RETENTION.md)
9. [Stack Evaluation, Cost Guardrails & Spike Plan](04-contracts/STACK-EVALUATION-AND-SPIKE-PLAN.md)
10. [Migration & Backward Compatibility Plan](04-contracts/MIGRATION-AND-BACKWARD-COMPATIBILITY.md)
11. [P03 Traceability Matrix](04-contracts/P03-TRACEABILITY-MATRIX.md)
12. Machine-readable contracts: [Canonical Module Graph schema](04-contracts/schemas/canonical-module-graph.schema.json), [ADK agent schemas](04-contracts/schemas/agent-contracts.schema.json), [event schema](04-contracts/schemas/domain-event-envelope.schema.json), [job schema](04-contracts/schemas/job-command.schema.json), [game-event schema](04-contracts/schemas/game-event.schema.json), [mock API fixture](04-contracts/fixtures/mock-api-responses.json) và [contract validator](04-contracts/tests/validate_contracts.py)

## Tài liệu P02 đã được phê duyệt

1. [P02 — Frontend UX Agreement: cổng gói và kết quả phê duyệt](03-ux/README.md) — **APPROVED**
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
- [ADR-0004 — Chưa khóa stack production tại Gate 0](01-architecture/adr/ADR-0004-DEFER-PRODUCTION-STACK-LOCK-IN.md) — **Superseded tại P03**
- [ADR-0005 — Modular monolith TypeScript cho web/API, Python ADK tách riêng](01-architecture/adr/ADR-0005-TYPESCRIPT-MODULAR-MONOLITH-AND-PYTHON-ADK.md) — **Accepted tại P03**
- [ADR-0006 — PostgreSQL + pgvector là canonical datastore](01-architecture/adr/ADR-0006-POSTGRESQL-PGVECTOR-CANONICAL-DATASTORE.md) — **Accepted tại P03**
- [ADR-0007 — Google identity và runtime Google Cloud-first](01-architecture/adr/ADR-0007-GOOGLE-CLOUD-RUNTIME-AND-IDENTITY.md) — **Accepted tại P03**
- [ADR-0008 — GDevelop template-first integration](01-architecture/adr/ADR-0008-GDEVELOP-TEMPLATE-FIRST-INTEGRATION.md) — **Accepted tại P03**

## Quyết định PO đã chọn trước khi lập gói Gate 0

Các lựa chọn sau đã được PO xác nhận trong phiên làm việc ngày 22/10/2026:

- **FastChat** là nguồn chính cho Learning/Output Arena, so sánh side-by-side, vote và provider/conversation patterns.
- **WSIC** là nguồn chính cho Search 768D, Brew Your Topic, Google ADK, hàng đợi bất đồng bộ và realtime patterns.
- **GDevelop/repository hiện tại** là nguồn sự thật của GON và là hướng renderer/exporter cho game học tập.
- Tái sử dụng code **có chọn lọc sau Audit**; không fork nguyên FastChat/WSIC thành production.
- Mã production của GON nằm trong **`khanhlegood1/GDevelop`**.

PO đã duyệt Gate 0 tại `5482dac`, P01 tại `9a09fa2`, P02 tại `33c2641`, P03 tại `b4e6ec2` và P04 cho PR #13/head `76eac20`/merge `ef594de`, đồng thời duyệt toàn bộ các mặc định `D-P01-*`, `D-P02-*`, `D-P03-*` tương ứng. PO đã cho phép bắt đầu P05; P05 hiện **IN REVIEW — NOT YET PASS**, còn P06 chưa bắt đầu và vẫn cần P05 APPROVED cộng quyết định Go-Live riêng.

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
