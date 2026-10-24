# PO DECISION — Unified Discover (Gộp Brew + Arena vào Khám phá, Persona bộc lộ qua hành vi)

> **Ngày:** 24/10/2026 (tối muộn, kèm screenshot)
> **Người quyết:** Product Owner (GON)
> **Loại:** Quyết định sản phẩm có hiệu lực ngay cho luồng front-end; thay đổi docs mọi tầng + code chính theo chỉ thị của PO.
> **Trạng thái:** ✅ Đã ghi vào tài liệu + demo standalone (`ux-prototype/standalone/index.html`, E2E 82/82) + code chính (`src/lib/product-decisions.ts`). Production build sẽ theo quyết định này khi triển khai FE thật.

## 1. Nguyên văn PO

> "Persona đầu ra 🔬 PhD / Nghiên cứu 🎬 KOL / Sáng tạo 🎈 Giải trí 🚀 Nâng cao và các Độ sâu: **không hiện ra cho user chọn mà mặc định chạy tất cả cả các tổ hợp đó và xuất ra nhiều output như hình tiktok**; Nếu user chọn kết quả nào thì đó chính là Persona đầu ra … đó cũng chính là Arena và là dấu chân đẳng cấp của user. Vì vậy **hãy gộp màn hình Brew và màn hình Arena vào chung màn hình Khám phá**. Hãy ghi nội dung này vào tất cả tài liệu và cả code chính."

## 2. Quyết định

1. **Không có UI chọn Persona / Độ sâu.** Bỏ mọi selector (persona tabs, dropdown persona/độ sâu trong Brew). Hệ thống **mặc định chạy TẤT CẢ các tổ hợp** Persona × Độ sâu (4 persona × 3 độ sâu = 12 tổ hợp) và **xuất nhiều output** hiển thị như feed TikTok (xếp hạng, cuộn dọc).
2. **Persona bộc lộ qua hành vi.** Output nào user chọn → đó chính là **Persona đầu ra** của user cho lượt đó; tích luỹ thành **dấu chân đẳng cấp** (phân bố persona + độ sâu, persona dominant) — hiển thị ở Hồ sơ và Hành trình; ghi vào POAP timeline. Mỗi lần chọn cũng là **tín hiệu Arena** (+XP, tín hiệu xếp hạng output).
3. **Gộp màn hình.** Màn hình **Brew** (S04) và màn hình **Arena** (S11) **không còn là màn hình riêng** — toàn bộ chạy trong màn hình **Khám phá (S03)**:
   - Tìm yếu/chưa có → pipeline Brew chạy **ngay trong Khám phá** (không form chọn persona/độ sâu, không chuyển màn).
   - Vote Arena (2 output ẩn danh, mở nhãn sau vote) là một khối **nằm trong Khám phá**.
   - Hash `#/brew`, `#/arena` redirect về `#/discover`; sidebar/tab bar không còn mục Brew/Arena riêng (chỉ còn nút ➕ mở Khám phá).
4. **Ghi vào tất cả tài liệu và code chính** (chỉ thị dứt khoát của PO): mọi docs mô tả persona/Brew/Arena đều có ghi chú trỏ về quyết định này; code chính (production source) mang quyết định này dưới dạng `src/lib/product-decisions.ts` để FE production triển khai theo.

## 3. Phạm vi áp dụng

| Nơi | Trạng thái |
|---|---|
| Demo standalone (`ux-prototype/standalone/index.html`) | ✅ Triển khai đầy đủ (v2.3) — E2E jsdom 82/82, 11/11 flow |
| `src/lib/product-decisions.ts` (code chính) | ✅ Tạo mới — registry quyết định có kiểu, FE production sẽ tiêu thụ |
| `docs/` (02-requirements, 03-ux, 04-contracts, README…) | ✅ Đã thêm ghi chú trỏ về doc này ở đầu mỗi tài liệu liên quan |
| Production FE (Next.js pages) | ⏳ Chưa có màn hình tương ứng để sửa — quyết định này là spec bắt buộc khi build |

## 4. Quan hệ với các gate đã chốt

- **P03 (contracts) LOCKED:** quyết định này **không thay đổi hợp đồng API/data đã chốt**. Việc gộp màn hình là thay đổi luồng FE/sản phẩm; nếu triển khai production cần đụng contract (endpoint, event, schema persona/pick) thì phải đi qua quy trình thay đổi P03.
- **P05 IN REVIEW (NOT PASS) / P06 packaged:** kết luận các gate này vẫn thuộc PO.
- **18+ positioning:** đã được PO đảo ngược trước đó cùng ngày (không age gate) — không liên quan trực tiếp nhưng cùng đợt quyết định sản phẩm 24/10.
