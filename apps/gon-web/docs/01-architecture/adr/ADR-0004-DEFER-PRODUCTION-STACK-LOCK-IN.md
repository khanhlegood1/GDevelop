# ADR-0004 — Chưa khóa stack production tại Gate 0

## Trạng thái

**Accepted — Product Owner đã duyệt Gate 0 ngày 22/10/2026 tại commit `5482dac`.**

## Bối cảnh

Gate 0 đã xác định nguồn tính năng và logical components. Tuy nhiên, các yêu cầu chi tiết (P01), UX chính thức (P02), quy mô dữ liệu, ngân sách AI, yêu cầu riêng tư và cách tích hợp GDevelop chưa đủ dữ kiện để khóa vendor/framework lâu dài.

WSIC dùng Next.js, Convex, PostgreSQL/Better Auth, QStash và ADK services. Đây là **ứng viên tham khảo**, không tự động trở thành stack production của GON chỉ vì GON học Brew/Search patterns từ WSIC. Tương tự, prototype GON tĩnh không tự động quyết định frontend production.

## Quyết định

Tại Gate 0 chỉ khóa các contract cấp sản phẩm đã có:

- embedding semantic search theo hướng Gemini **768 dimensions**;
- no-result phải có đường Brew;
- Google ADK là hướng multi-agent được PO chỉ định;
- Arena dùng pairwise voting/ranking;
- Lifelong Level theo `gon-level-v1`;
- production code trong `khanhlegood1/GDevelop`.

Các lựa chọn sau để P03 quyết bằng ADR và bằng chứng/spike:

- frontend framework và rendering strategy;
- backend language/service boundaries vật lý;
- relational/document database và vector store;
- auth provider/session model;
- queue/job platform và nơi chạy ADK;
- object storage/media pipeline;
- observability stack;
- cloud/hosting target;
- cách sinh/chạy GDevelop game;
- model cụ thể cho từng agent/task ngoài embedding contract.

## Tiêu chí đánh giá tại P03

Mỗi ứng viên phải được chấm tối thiểu theo:

1. phù hợp requirements và UX đã duyệt;
2. authorization/data-isolation model;
3. chi phí AI/infra theo user/topic và khả năng đặt quota;
4. độ trễ search/generation/realtime;
5. khả năng backup/export/thoát vendor;
6. độ trưởng thành SDK và kiểm thử;
7. bảo mật, privacy, retention và xóa dữ liệu;
8. vận hành bởi đội hiện tại;
9. khả năng tích hợp GDevelop;
10. tổng chi phí sở hữu và rủi ro lock-in.

## Hệ quả

- P01/P02 không bị ép theo giới hạn của một vendor chưa chọn.
- P03 có thể yêu cầu spike nhỏ trước ADR cuối, ví dụ Convex vector search so với PostgreSQL + pgvector, hoặc GDevelop project generation so với embedded runtime.
- Mọi đoạn WSIC/FastChat được viết lại quanh contracts của GON để giảm coupling.

## Hệ quả tiêu cực / rủi ro

- Chưa thể ước lượng chi phí/lịch trình production chính xác tại G0.
- P03 cần thời gian đánh giá; không được biến việc hoãn quyết định thành trì hoãn vô hạn.
- Một số prototype ở P02 có thể phải thay đổi khi stack được khóa.

## Điều kiện đóng ADR

ADR này được thay bằng các ADR stack cụ thể tại P03. Các ADR-0005…ADR-0008 đang ở trạng thái Proposed trong gói P03 IN REVIEW; chỉ khi PO duyệt P03, trạng thái của ADR-0004 mới chuyển thành `Superseded` và liên kết tới từng quyết định thay thế.
