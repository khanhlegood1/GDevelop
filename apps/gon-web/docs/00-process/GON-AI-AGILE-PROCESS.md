# Quy trình AI-Agile/HITL cho GON

> **Phiên bản:** 1.0<br>
> **Trạng thái:** Gate 0, P01 và P02 APPROVED ngày 22/10/2026; P03 đang IN REVIEW<br>
> **Cơ sở:** `AI-Agile-Framework-Light_1.pdf` do Product Owner cung cấp<br>
> **Repository nguồn sự thật:** `khanhlegood1/GDevelop`

## 1. Triết lý vận hành

GON dùng mô hình **AI-Agile có Human-in-the-Loop (HITL)**. AI tăng tốc việc phân tích, thiết kế, sinh code/test/tài liệu; Product Owner giữ quyền quyết định sản phẩm và phê duyệt chuyển gate.

### 1.1 Năm nguyên tắc bắt buộc

1. **AI Generates, Humans Approve**
   - AI chuẩn bị artifacts và bằng chứng.
   - PO duyệt, yêu cầu sửa hoặc bác bỏ.
   - AI không tự xem đầu ra của mình là đã được duyệt.

2. **Code is a Side-Effect**
   - Không nhảy thẳng vào code production khi yêu cầu, UX và contract chưa rõ.
   - Thứ tự chuẩn: Requirements → UX → API/Data Model → Backend/Frontend Build → NFR → Deployment.

3. **GitHub is the Single Source of Truth**
   - Mỗi gate có branch/PR và artifacts trong repo.
   - Quyết định quan trọng thành ADR.
   - Trao đổi trong chat chỉ có hiệu lực lâu dài sau khi được ghi lại.

4. **Living Documentation**
   - Tài liệu có version/trạng thái, liên kết hai chiều tới code/test/PR.
   - Tài liệu sai lệch phải được sửa trong cùng PR gây ra thay đổi.

5. **Security & Architecture Fitness from Day One**
   - Giấy phép, dependency, quyền riêng tư, an toàn AI, chi phí và khả năng vận hành được xét ngay từ các gate đầu.
   - Không để bảo mật thành việc kiểm tra cuối dự án.

## 2. Vai trò và quyền quyết định

| Vai trò | Trách nhiệm | Quyền quyết định |
|---|---|---|
| **Product Owner (PO)** | Tầm nhìn, thứ tự ưu tiên, phạm vi, chấp nhận rủi ro sản phẩm, duyệt từng gate và Go-Live | Quyết định cuối cùng về product scope/release |
| **AI Build Partner** | Nghiên cứu, Audit, viết tài liệu/code/test, chạy kiểm chứng, báo cáo rủi ro và điểm chưa biết | Đề xuất kỹ thuật; không tự duyệt gate/merge/deploy khi chưa có chỉ thị rõ |
| **Tech Reviewer** (khi được chỉ định) | Review kiến trúc, code, bảo mật, hiệu năng | Có thể chặn gate kỹ thuật theo tiêu chí đã thống nhất |
| **Design Reviewer** (khi được chỉ định) | Review UX, accessibility, brand và nội dung | Có thể yêu cầu sửa P02 |
| **Operations/Security Reviewer** (khi được chỉ định) | Review NFR, vận hành, incident và compliance | Có thể chặn P05/P06 |

Nếu chưa có reviewer con người ngoài PO, PR vẫn phải ghi rõ phần nào mới được AI kiểm chứng tự động và phần nào chưa có independent review.

## 3. Pipeline G0 → P06 → R0

### Gate 0 — Source & Architecture Charter

**Mục đích:** biết GON sẽ dùng nguồn nào cho tính năng nào, phần nào tự xây và phần nào chưa quyết.

**Đầu vào**

- Tầm nhìn và các yêu cầu đã được PO nêu.
- FastChat, WSIC, GDevelop/GON hiện tại.
- Các tham chiếu sản phẩm: ZOFO, arena.ai, TikTok, Facebook.
- Đặc tả sản phẩm, yêu cầu trending/personalization và White Paper hiện có.

**Đầu ra bắt buộc**

- Open Source Source Map.
- Feature-to-Source Traceability Matrix.
- Audit card cho từng codebase được cân nhắc tái sử dụng.
- Logical architecture và component boundaries.
- ADR cho repository topology, reuse policy và source allocation.
- Danh sách quyết định mở cho P01/P03, rủi ro và giả định.

**Tiêu chí qua gate**

- PO hiểu rõ nguồn nào dùng cho tính năng nào.
- Không có tính năng lõi nào bị gán cho một nguồn không thực sự có năng lực đó.
- Các phần GON phải tự xây được nêu tên.
- Chưa khóa vendor/stack khi chưa đủ dữ kiện.

### P01 — Requirement Intelligence

**Mục đích:** biến ý tưởng thành phạm vi có thể kiểm chứng.

**Đầu ra bắt buộc**

- PRD versioned.
- Personas và jobs-to-be-done cho người dùng 18+.
- Scope theo MoSCoW; danh sách **Non-goals**.
- User stories/epics và thứ tự ưu tiên.
- Acceptance criteria dạng BDD (Given/When/Then).
- Success metrics và guardrail metrics.
- Risk/assumption/open-question log.
- Đề xuất vertical slice đầu tiên.

**PO duyệt:** phạm vi, persona, ưu tiên, tiêu chí thành công và những gì chưa làm.

### P02 — Frontend UX Agreement Loop

**Mục đích:** thống nhất trải nghiệm trước khi khóa API/backend.

**Đầu ra bắt buộc**

- Information architecture và user-flow diagrams.
- Wireframe/prototype có thể click hoặc frontend mock-data.
- Design system mapping từ GON brand tokens.
- Trạng thái loading, empty, error, offline, no-result/Brew, processing và permission.
- Responsive rules, keyboard/focus/contrast và accessibility checklist.
- Nội dung VI/EN chính; microcopy cho vote, XP, Proof và cảnh báo AI.
- Danh sách màn hình/component được đánh ID để truy vết sang P03/P04.

**PO duyệt:** flow, màn hình, mức độ cá nhân hóa hiển thị và các trạng thái quan trọng.

### P03 — API Contract & Data Model First

**Mục đích:** khóa hợp đồng kỹ thuật trước khi xây backend thật.

**Đầu ra bắt buộc**

- Domain model và ERD.
- OpenAPI 3.1 cho HTTP API; schema cho event/job và ADK agent I/O.
- Canonical Module Graph schema.
- Embedding contract: model, version, 768 dimensions, chunking, distance, threshold và re-embedding policy.
- Identity/authorization matrix.
- Data retention, provenance, consent và audit-log requirements.
- ADR cho database/vector store, auth, queue, object storage, cloud target và GDevelop integration.
- Mock API/fixtures để frontend chạy độc lập.
- Migration và backward-compatibility plan.

**PO duyệt cùng review kỹ thuật:** chi phí/vận hành dự kiến, vendor lock-in và các contract có ảnh hưởng lâu dài.

### P04 — Vertical Slice Build

**Mục đích:** xây từng lát cắt chạy xuyên suốt thay vì xây rời từng lớp.

Mỗi slice phải có: UI → API → data/job → kết quả thật hoặc mock được ghi rõ → test → telemetry → documentation.

Thứ tự slice dự kiến sẽ được chốt ở P01/P03. Khung ban đầu:

1. Identity 18+ → Universal Input → Semantic Search → Brew → Interactive Module.
2. Arena side-by-side → Vote Ledger → Pairwise Ranking.
3. Journey Fork → Server XP Ledger → Lifelong Level → Proof Vault.
4. Canonical Module Graph → GDevelop game/export.
5. Trending/Footprint Recommendation → Creator Attribution/Path.

**Quy tắc build**

- TDD hoặc test-first cho logic lõi.
- Contract tests giữa frontend/API/agent.
- Mỗi PR nhỏ, có demo/evidence và rollback path.
- Không port code upstream nếu chưa có audit note cập nhật cho đúng commit.
- Không ghi bí mật, dữ liệu cá nhân thật hoặc raw provider payload nhạy cảm vào repo/log mặc định.

### P05 — NFR & Well-Architected Review

**Mục đích:** chứng minh hệ thống đủ an toàn, tin cậy và vận hành được trước production.

**Đầu ra bắt buộc**

- NFR specification và kết quả đo.
- Threat model (STRIDE) và kiểm chứng OWASP phù hợp.
- SAST/SCA/secret scanning; DAST hoặc kiểm thử tương đương theo bề mặt triển khai.
- AI evaluation: factuality, nguồn tham chiếu, prompt-injection, moderation, chi phí/token và fallback.
- Accessibility audit.
- Performance/load test cho search, vote, job generation và realtime.
- Backup/restore, rate limit, abuse/anti-cheat và disaster-recovery plan.
- Observability: logs/metrics/traces/alerts không làm lộ dữ liệu nhạy cảm.
- Well-Architected gap list và ADR cho mọi ngoại lệ được chấp nhận.

**PO duyệt:** rủi ro còn lại và việc có được phép tiến tới triển khai hay không.

### P06 — Cloud Deployment

**Mục đích:** triển khai có kiểm soát, có thể rollback.

**Đầu ra bắt buộc**

- IaC hoặc cấu hình triển khai được version-control.
- Tách môi trường dev/staging/production và quản trị secrets.
- CI/CD gates, artifact provenance và release notes.
- Smoke test, health checks an toàn, dashboards/alerts.
- Runbooks: deploy, rollback, incident, backup/restore, khóa tính năng khẩn cấp.
- Data migration rehearsal nếu có dữ liệu thật.

**Go-Live cần quyết định riêng của PO.** Việc duyệt code hoặc staging không tự động là duyệt production.

### R0 — Review / Retrospective Loop

Sau mỗi release hoặc milestone: đối chiếu metrics, incident, chi phí AI, phản hồi người dùng và chất lượng nội dung; cập nhật backlog/ADR; quyết định vòng P01 tiếp theo.

## 4. Trạng thái chuẩn của một gate

```text
NOT STARTED
  → DRAFT
  → IN REVIEW
  → CHANGES REQUESTED → IN REVIEW
  → APPROVED
  → MERGED / BASELINED
  → SUPERSEDED (nếu sau này có quyết định thay thế)
```

- `DRAFT`: AI đang chuẩn bị, PO chưa cần quyết.
- `IN REVIEW`: đủ artifacts để PO review.
- `CHANGES REQUESTED`: PO nêu điểm cần sửa; gate chưa qua.
- `APPROVED`: PO chấp thuận nội dung và cho phép mở gate tiếp theo.
- `MERGED/BASELINED`: bản đã duyệt nằm trên nhánh chính theo quy trình GitHub của dự án.
- `SUPERSEDED`: giữ lịch sử, không âm thầm viết lại quyết định cũ.

## 5. Definition of Ready

Một gate/slice chỉ bắt đầu khi có:

- Mục tiêu và non-goals rõ.
- Đầu vào/artifact của gate trước đã được duyệt hoặc ngoại lệ được PO ghi nhận.
- Chủ sở hữu đầu ra và người duyệt.
- Tiêu chí hoàn thành có thể kiểm chứng.
- Rủi ro, chi phí ngoài dự kiến và dependency bên ngoài được nêu.

## 6. Definition of Done

Một gate/slice chỉ xong khi:

- Artifacts nằm trong GitHub và có trạng thái/version.
- Test/evidence đã chạy được ghi lại; lỗi hoặc phần chưa kiểm chứng không bị che giấu.
- Tài liệu liên quan được cập nhật trong cùng thay đổi.
- Security/privacy/license/dependency impact được đánh giá theo mức phù hợp.
- PO đã duyệt hoặc PR được merge theo đúng quyền đã thống nhất.
- Không còn blocker chưa có chủ sở hữu.

## 7. Quy tắc branch, PR và quyết định

- Không commit thẳng lên `master` đối với công việc GON mới.
- Mỗi gate dùng branch riêng; mỗi vertical slice nên có PR riêng đủ nhỏ để review.
- PR phải liên kết requirement/ADR, mô tả scope, evidence, rủi ro, rollback và phần chưa làm.
- Thay đổi quyết định cũ bằng ADR mới có trạng thái `Supersedes`; không sửa lịch sử như thể quyết định cũ chưa tồn tại.
- AI chỉ mở/merge PR hoặc deploy khi PO yêu cầu rõ hành động đó.
- Nếu PO nói “tiếp tục”, AI chỉ tiếp tục artifact đang dở trong gate hiện tại; không tự nhảy gate khi chưa có duyệt rõ ràng cho gate đó.

## 8. Chính sách bằng chứng

Mọi tuyên bố hoàn thành phải phân biệt:

- **Đã kiểm chứng tự động:** test, build, scan hoặc script có kết quả.
- **Đã kiểm tra thủ công:** ai kiểm tra, kiểm tra gì.
- **Suy luận/thiết kế:** chưa chạy thật.
- **Chưa kiểm chứng:** nêu rõ lý do và kế hoạch bổ sung.

Ảnh chụp/demo không thay thế test cho logic lõi; test pass không thay thế PO acceptance.
