# ADR-0008 — GDevelop template-first integration

## Trạng thái

**Accepted — Product Owner đã duyệt P03 ngày 22/10/2026 tại commit `b4e6ec2e91f83a48ddb139e8981928eb99d3d8bb`.** Việc triển khai thuộc VS4 sau spike.

## Bối cảnh

Module Graph cần biến thành game học tập mà không phụ thuộc vào việc sinh arbitrary GDevelop project/code cho mọi topic. Repository đã có GDJS runtime và nhiều game JSON mẫu có cấu trúc project/layout/object/event, nhưng chưa có bằng chứng một exporter tổng quát an toàn cho GON.

## Quyết định

- VS4 dùng một hoặc hai GDevelop template cố định đã được kiểm thử.
- Canonical Module Graph chỉ cung cấp cấu hình học tập: concept, prompt, choices/parameters, asset refs đã duyệt và event mapping.
- Server tạo GameSession/launch token ngắn hạn gắn journey/node/template version.
- Game gửi event batch có sequence/idempotency; server xác thực rule mới ghi Attempt/XP/Proof.
- Mọi game có web/text equivalent cho cùng outcome lõi.
- Không nhúng toàn bộ newIDE và không sinh executable code tùy ý trong Alpha.

## Hệ quả

- Chứng minh được giá trị GDevelop với rủi ro thấp hơn exporter tổng quát.
- Template mechanic giới hạn loại topic phù hợp ở VS4; module không hợp template vẫn học bằng web.
- Cần spike S-P03-05 để đo load/bundle/mobile/accessibility và cách đóng gói assets.

## Phương án đã cân nhắc

| Phương án | Lý do chưa chọn |
|---|---|
| Sinh toàn bộ GDevelop project từ AI | Rủi ro format, chất lượng, bảo mật và kiểm thử cao |
| Nhúng newIDE cho user sửa game | Ngoài scope learner Alpha và tăng bề mặt sản phẩm |
| Tự viết game engine riêng | Trùng năng lực GDevelop đã có trong monorepo |
| Chỉ tin score client gửi | Vi phạm server-authoritative XP/Proof |
