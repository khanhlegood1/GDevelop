# Logo GON v2 — Heroes 18+

**Ý tưởng “G Orbit / Ascent Sprout”:** giữ silhouette chữ **G** của v1 để không phá vỡ nhận biết, nhưng chuyển sang vòng **Midnight** trưởng thành. Thanh G là điểm tựa; mầm xanh là tăng trưởng, lá **Crimson** là ngọn lửa/Play của hành động nhân văn, chấm **Gold** là hạt bằng chứng và tia **Hero Spark** ở cửa mở chữ G là khoảnh khắc bứt phá từ Zero thành Hero. Wordmark dùng Be Vietnam Pro ExtraBold thay cho Baloo 2.

| File | Dùng khi |
|---|---|
| `gon-logo-horizontal.svg` | Mặc định trên nền sáng: web, tài liệu, đối tác |
| `gon-logo-horizontal-reverse.svg` | Trên Midnight/nền tối |
| `gon-logo-stacked.svg` | Không gian vuông/hẹp, bìa, hồ sơ Hero |
| `gon-icon.svg` | Avatar, app, watermark khi đã có ngữ cảnh GON |
| `gon-icon-small.svg` / `gon-favicon.svg` | <32px, favicon, tab, HUD |
| `gon-app-icon.svg` / `gon-app-icon-green.svg` | iOS/Android/PWA; xuất từ SVG, không phóng PNG nhỏ |
| `gon-badge-achievement.svg` | Hero Proof Badge, giấy chứng nhận số, đầu mối POAP-ready (chưa đồng nghĩa đã mint) |
| `gon-powered-by(-dark).svg` | Đối tác tích hợp module/AI của GON |
| `gon-made-with.svg` | Credits của game/module tạo bằng GON, đặt cạnh ghi nhận GDevelop nếu dùng engine |
| `gon-mascot-gon-mam.svg` | **Legacy v1 — không dùng trong master brand 18+** |
| `exploration/concept-C-gon-blocks.svg` | **Legacy trẻ em — không dùng** |

## Quy tắc tối thiểu
- Khoảng thở 1x quanh logo, `x` = chiều cao thanh G (12,5% bề rộng mark).
- Icon ≥24px/8mm; lockup ≥104px/28mm. Dưới 32px dùng bản small không tia spark.
- Không đổi lá Crimson thành màu tùy ý, không thêm mặt cười/linh vật vào logo, không đặt logo Midnight trực tiếp lên nền tối (dùng reverse/app tile), không kéo giãn/xoay/thêm gradient ngoài token.
- Logo không chứng minh một thành tích là thật. Khi gắn cạnh POAP/chứng chỉ, luôn hiển thị issuer và cấp xác minh.

SVG là master. Tái tạo bằng `tools/generate_logos.py` + `tools/render_pngs.js`; xem README ở thư mục gốc của gói.
