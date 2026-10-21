# Áp dụng GON trong game GDevelop (repo này)

Repo `GDevelop` là game engine no-code (Core/GDJS/newIDE). Bộ GON này là **brand layer cho game/ứng dụng giáo dục xây trên GDevelop** — không thay đổi thương hiệu GDevelop upstream, không sửa logo GDevelop.

## Ánh xạ token → game
- Màu: lấy từ `03-Color-Typography/gon-tokens.css|json`. Nút chính: nền **Green 700 `#0C7746`** + chữ trắng; nền cảnh: Paper `#FFF9EE`; chữ: Ink `#12261E`; thưởng: Sun `#FFC93C` + chữ Ink. **Không** đặt chữ trắng lên Green 500 (2.76:1).
- Font trong game: nhúng Baloo 2 (tiêu đề/mức điểm) + Be Vietnam Pro (hướng dẫn/hộp thoại) dạng webfont/bitmap font có dấu tiếng Việt; kiểm tra chuỗi thử: `Ă Â Đ Ê Ô Ơ Ư ă â đ ê ô ơ ư á à ả ã ạ 0123456789`.
- UI trẻ em: nút/vùng chạm ≥48px (khuyến nghị 56–64px cho <6 tuổi), bo góc 20–28px, icon + chữ đi cùng nhau (không chỉ màu để phân biệt đúng/sai), mỗi màn hình 1 mục tiêu.
- Âm thanh/chuyển động: tôn trọng giảm chuyển động, tắt nhạc nền độc lập với hiệu ứng, không chớp sáng >3 lần/giây.
- Vòng học theo brand: Hạt → Mầm → Chồi → Cây → Vườn; huy hiệu `gon-badge-achievement.svg` khi hoàn thành kỹ năng; màn hình kết thúc phiên gợi ý nghỉ (session lành mạnh) thay vì "chơi nữa kẻo mất chuỗi".

## Xuất icon cho store/export
Từ `gon-app-icon.svg`: iOS 1024×1024 (không bo góc sẵn khi nộp App Store — xuất bản vuông nền Paper), Android adaptive icon (foreground = icon G ở vùng an toàn 66%, background Paper/Green), favicon 32/16 từ `gon-icon-small.svg`, PWA 192/512. Script: `tools/render_pngs.js` (resvg) xuất sẵn thư mục `01-Logo/png/`.

## Ghi công trong game
Màn hình credits: dùng `gon-made-with.svg` ("Made with GON") **cạnh** ghi nhận GDevelop theo giấy phép MIT của engine — hai logo không lồng vào nhau, khoảng cách ≥1x (xem mục Co-branding).

## Checklist trước khi publish game GON
- [ ] Tương phản chữ ≥4.5:1 (cỡ lớn ≥3:1) ở mọi state (hover/disabled vẫn đọc được)
- [ ] Không quảng cáo/IAP ẩn hướng tới trẻ; cổng phụ huynh (parent gate) cho link ra ngoài
- [ ] Không thu thập dữ liệu trẻ ngoài mức cần thiết; rà soát COPPA/GDPR-K & Nghị định 13/2023 (PDPD) với tư vấn pháp lý — tài liệu này không thay thế tư vấn pháp lý
- [ ] Mọi tuyên bố hiệu quả học tập khớp "Thang tuyên bố" (`06-Content/CONTENT-VI-EN.md`)
- [ ] Test với trẻ thật + phụ huynh/giáo viên, gồm người dùng có nhu cầu hỗ trợ, trước khi gắn nhãn "hòa nhập"
