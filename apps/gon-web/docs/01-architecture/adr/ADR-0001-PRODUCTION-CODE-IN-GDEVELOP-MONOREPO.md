# ADR-0001 — Giữ mã GON production trong `khanhlegood1/GDevelop`

## Trạng thái

**Accepted — Product Owner đã duyệt Gate 0 ngày 22/10/2026 tại commit `5482dac`.**

## Bối cảnh

GON đã có prototype, đặc tả sản phẩm, White Paper, thương hiệu và tài liệu GDevelop trong `khanhlegood1/GDevelop`. GON cũng cần tích hợp hướng game của GDevelop. Nếu tạo repository production riêng ngay tại Gate 0, truy vết giữa sản phẩm, game và quyết định hiện có sẽ bị chia cắt trước khi kiến trúc thành phần được chốt.

## Quyết định

Toàn bộ mã production, contracts, tài liệu quy trình/kiến trúc và integration code của GON sẽ nằm trong **`khanhlegood1/GDevelop`** cho tới khi có ADR thay thế.

FastChat và WSIC vẫn là upstream tham chiếu/tái sử dụng có chọn lọc; chúng không trở thành repository production của GON.

## Hệ quả

### Tích cực

- Một nguồn sự thật cho product, brand, game và code.
- Dễ truy vết từ White Paper/spec tới implementation/tests.
- Tận dụng trực tiếp GDevelop runtime/extensions khi làm game bridge.
- Giảm chi phí đồng bộ version giữa nhiều repo trong giai đoạn đầu.

### Tiêu cực / cần quản trị

- Monorepo lớn; PR GON phải giới hạn phạm vi và tránh sửa engine/IDE ngoài nhu cầu.
- CI của GON cần path filters hoặc pipeline riêng để không chạy thừa toàn bộ GDevelop.
- Quyền truy cập production/secrets không được suy ra chỉ từ quyền truy cập repository.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn tại Gate 0 |
|---|---|
| Tạo repo GON độc lập ngay | Làm đứt truy vết hiện tại và tăng chi phí đồng bộ trước khi boundaries ổn định |
| Fork WSIC làm repo chính rồi ghép GDevelop | Mang theo trust-boundary/dependency debt và làm GON lệ thuộc cấu trúc WSIC |
| Fork FastChat làm repo chính | FastChat chỉ mạnh ở Arena/model serving, không phải nền tảng học tập/game của GON |

## Điều kiện xem xét lại

Mở ADR thay thế nếu một trong các điều kiện sau trở thành blocker đã đo được:

- CI/monorepo làm chậm đáng kể vòng phát triển GON;
- nhu cầu phân quyền/bảo mật không thể đáp ứng trong repo hiện tại;
- GON cần vòng đời phát hành độc lập không tương thích với GDevelop;
- PO quyết định tổ chức sản phẩm thành nhiều repo sau khi boundaries đã ổn định.
