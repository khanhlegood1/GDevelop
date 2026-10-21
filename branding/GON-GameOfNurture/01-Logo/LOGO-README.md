# Logo GON — Hướng dẫn nhanh (chi tiết: Brandbook PDF, mục 02)

**Ý tưởng "Mầm Chơi":** chữ **G** liền khối (vòng tăng trưởng/Game) — thanh ngang chữ G là "mặt đất", từ đó **mầm cây** mọc lên; lá bên phải màu nắng nghiêng như nút **Play**; chấm nắng là hạt giống. Đọc được ở kích thước nhỏ, vẽ lại được bằng hình học, khác biệt với rosette của POAP.

| File (svg/ + png/) | Dùng khi |
|---|---|
| `gon-logo-horizontal.svg` | Mặc định: web header, tài liệu, slide |
| `gon-logo-stacked.svg` | Không gian vuông/hẹp, bìa, avatar kèm chữ |
| `gon-icon.svg` | Đã có chữ GON ở ngữ cảnh, social avatar |
| `gon-icon-small.svg` | <32px: favicon, tab, HUD nhỏ (chỉ 1 lá) |
| `gon-app-icon.svg` / `-green` | Icon app iOS/Android (xuất 1024px từ SVG) |
| `gon-logo-horizontal-reverse.svg` | Trên nền Forest Ink/tối |
| `gon-*-mono-black/white/green` | In 1 màu, khắc, fax, watermark |
| `gon-powered-by(-dark).svg` | Đối tác tích hợp GON (xem mục 07) |
| `gon-made-with.svg` | Gắn ở credits game làm bằng GON/GDevelop |
| `gon-badge-achievement.svg` | Huy hiệu thành tích "Hạt nắng" trong game/giấy khen |
| `gon-mascot-gon-mam.svg` | Linh vật Gon Mầm — **chỉ ngữ cảnh trẻ em/gia đình** |
| `exploration/` | 3 phương án A/B/C lưu trữ — **không dùng B/C làm logo chính** |

Quy tắc tối thiểu: khoảng thở = 1x quanh logo (x = chiều cao thanh G); icon ≥24px / 8mm, lockup ≥96px / 25mm; không kéo giãn, đổi màu lá, thêm bóng/gradient, đặt trên nền rối (xem trang Don'ts).

SVG là file gốc (master). PNG xuất bằng `tools/render_pngs.js`. Cần PDF/EPS cho in: mở SVG bằng Illustrator/Inkscape rồi xuất — không vẽ lại từ PNG.
