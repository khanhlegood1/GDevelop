# ADR-0002 — Tái sử dụng mã nguồn mở có chọn lọc sau Audit

## Trạng thái

**Accepted — Product Owner đã duyệt Gate 0 ngày 22/10/2026 tại commit `5482dac`.**

## Bối cảnh

PO yêu cầu GON chủ yếu dựa trên mã nguồn mở đã cung cấp. Audit cho thấy FastChat và WSIC đều có phần rất hữu ích, đồng thời có phần không phù hợp production: FastChat gắn Gradio/logging/privacy patterns không mong muốn; WSIC có data-access public mutations và dependency vulnerabilities tại snapshot Audit.

Giấy phép cho phép sử dụng:

- FastChat: Apache-2.0.
- WSIC: MIT.
- GDevelop Core/GDJS/newIDE/Extensions: MIT, với giới hạn riêng cho tên/logo GDevelop.

Giấy phép hợp lệ không đồng nghĩa code an toàn hoặc phù hợp kiến trúc.

## Quyết định

GON **không wholesale-fork** FastChat hoặc WSIC thành production. Mỗi thành phần upstream phải được phân loại là:

1. `Dependency` — dùng qua package/API chính thức;
2. `Port` — sao chép/sửa phạm vi hẹp;
3. `Pattern reimplementation` — viết mới theo hành vi/kien trúc;
4. `Reference-only` — chỉ tham chiếu;
5. `Reject` — không dùng.

Một phần chỉ được port sau khi có Audit cập nhật cho đúng upstream commit, gồm license/attribution, security/privacy, dependencies, tests và mức độ stale.

## Quy tắc bắt buộc cho mọi port

PR chứa code port phải ghi:

```text
Upstream:
Commit:
License:
Files consulted/copied:
Modifications:
Tests added:
Security/privacy review:
GON owner:
```

Ngoài ra:

- giữ copyright/license/NOTICE cần thiết;
- pin version/commit và tạo SBOM khi tới P03/P05;
- không port secrets, diagnostics không an toàn, raw logging hoặc safety settings làm suy yếu moderation;
- viết test mới cho hành vi GON cần, không dựa vào danh tiếng upstream;
- cập nhật Feature-Source Traceability trong cùng PR.

## Hệ quả

### Tích cực

- Tận dụng được việc đã làm tốt ở FastChat/WSIC mà không kế thừa toàn bộ nợ kỹ thuật.
- Ranh giới pháp lý/bảo mật rõ ràng cho từng đoạn code.
- Dễ thay vendor/thuật toán khi GON có dữ liệu thật.

### Tiêu cực / cần quản trị

- Tốc độ ban đầu chậm hơn fork nguyên repo.
- Cần công sức viết lại adapters, authz, tests và contracts.
- Phải theo dõi upstream updates thay vì tự động nhận mọi thay đổi.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Fork nguyên WSIC rồi đổi thương hiệu | Authorization/data-access, auto-publish và dependencies chưa đạt baseline GON |
| Fork nguyên FastChat rồi thêm học tập/game | Gradio/model-serving không phải kiến trúc sản phẩm GON; privacy/logging không phù hợp |
| Không dùng upstream, viết mọi thứ từ đầu | Mất lợi thế từ Arena rating, Search/Brew/ADK patterns đã có |
| Chỉ dùng upstream làm cảm hứng, không bao giờ port | An toàn nhưng có thể lãng phí thuật toán/schema đủ tốt sau khi test |
