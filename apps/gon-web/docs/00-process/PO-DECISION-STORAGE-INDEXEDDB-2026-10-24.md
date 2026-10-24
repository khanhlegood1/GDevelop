# PO DECISION — IndexedDB cho toàn bộ dự án + đồng bộ dữ liệu tìm kiếm sang Khám phá

> **Ngày:** 24/10/2026 (23:36, kèm screenshot)
> **Người quyết:** Product Owner (GON)
> **Loại:** Quyết định kỹ thuật/sản phẩm có hiệu lực ngay; PO chỉ thị "Ghi vào tất cả tài liệu + code chính".
> **Trạng thái:** ✅ Demo standalone đã chuyển sang IndexedDB (E2E 91/91 với fake-indexeddb, có test reload + persistence) · code chính có adapter `src/lib/browser-storage.ts` + registry `src/lib/product-decisions.ts` · ghi chú đã thêm vào toàn bộ tài liệu liên quan.

## 1. Nguyên văn PO

> "Trang 🔍 Khám phá: phải mang dữ liệu từ thanh tìm kiếm qua cho đồng bộ tất cả dữ liệu: Chuyển sang dùng IndexedDB cho toàn bộ dự án này. **Ghi vào tất cả tài liệu + code chính**"

## 2. Quyết định

### 2.1 Đồng bộ dữ liệu tìm kiếm (Discover carry-over)

- Query gõ ở **thanh tìm kiếm trên cùng** (hoặc chọn từ "Chủ đề nổi bật") phải được **mang sang trang Khám phá**: ô tìm trong trang Khám phá luôn hiển thị query cuối (`LAST_QUERY`), verdict/kết quả gắn với cùng query đó.
- Đồng bộ **hai chiều**: thanh tìm trên cũng luôn mang theo query cuối khi quay lại các tab chính (trừ khi user đang gõ — không đè chữ đang nhập).
- File/ảnh/link đính kèm (attach chips) đã đi cùng query vào Khám phá (giữ nguyên).

### 2.2 IndexedDB cho toàn bộ dự án

- **IndexedDB là kho phía client chính của toàn bộ dự án** (thay cho localStorage): state, tiến trình, hồ sơ ẩn danh, footprint…
- **localStorage chỉ còn 2 vai trò phụ:** (a) fallback cho môi trường không có IndexedDB; (b) **nguồn migrate một lần** — dữ liệu localStorage cũ được chuyển vào IndexedDB ở lần mở app đầu tiên.
- Luồng **"Xoá dữ liệu"** xoá cả IndexedDB lẫn localStorage cũ.
- **Guard an toàn:** không ghi gì vào kho trước khi nạp xong state (`BOOTED`) — tránh race ghi đè dữ liệu thật bằng state mặc định khi trang vừa mở (bug đã được E2E bắt ra và sửa trong demo).

## 3. Nơi đã ghi (theo chỉ thị "tất cả tài liệu + code chính")

| Nơi | Nội dung |
|---|---|
| `ux-prototype/standalone/index.html` | Storage layer IndexedDB (DB `gon-standalone-fe-demo-v2`, store `state`, key `main`) + fallback/migrate + guard `BOOTED`; đồng bộ query 2 chiều |
| `ux-prototype/standalone/tests/e2e.js` | E2E 91/91: inject `fake-indexeddb`, đọc state từ IndexedDB, assert localStorage rỗng, test **reload → phục hồi tiến trình** |
| `src/lib/browser-storage.ts` (code chính) | Adapter IndexedDB production: `readPersistedState` / `writePersistedState` / `clearPersistedState` / `migrateFromLocalStorage` — `tsc --strict` sạch |
| `src/lib/product-decisions.ts` (code chính) | `INDEXEDDB_STORAGE_DECISION` — registry quyết định có kiểu |
| `docs/` (28 tài liệu + README app) | Ghi chú quyết định ở đầu mỗi tài liệu (cùng đợt với ghi chú Unified Discover) |
| `docs/00-process/PO-CONTINUOUS-DELEGATION-2026-10-24.md` | Hàng FE-Confirm-6 |

## 4. Quan hệ với các gate

- **P03 (contracts) LOCKED:** quyết định này nằm ở tầng lưu trữ phía client của demo/spec FE; **không thay đổi hợp đồng API/data đã chốt**. Nếu production cần API đồng bộ server cho IndexedDB (sync/conflict), phải đi qua quy trình thay đổi P03.
- Production hiện dùng PostgreSQL (server) — IndexedDB là kho **client**; hai tầng bổ sung nhau, không thay thế nhau.
