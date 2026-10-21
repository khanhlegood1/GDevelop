# GON — Game Of Nurture · Bộ nhận diện thương hiệu v1.0

**Game giáo dục cho trẻ em và người lớn ở mọi lứa tuổi** — *Chơi. Học. Lớn khôn.*
Bộ nhận diện này học **cấu trúc** của `poap-branding-guidelines.pdf` (Logo → Typography → Color → Partnerships → Integrators)
và **định hướng nội dung** từ nurture.games (game giáo dục an toàn, thích ứng, rèn kỹ năng điều hành),
nhưng logo, màu, chữ, minh họa và câu chữ đều là **sáng tạo riêng cho GON** — xem cảnh báo pháp lý cuối file.

## Bắt đầu ở đâu?
1. **`02-Brandbook/GON-Brandbook-2026.pdf`** — sách thương hiệu 30 trang (bản trình bày chính).
2. **`index.html`** — bản web tương tác (mở bằng server tĩnh, xem dưới đây).
3. Cần logo ngay: **`01-Logo/svg/`** (master) + `01-Logo/png/` (đã xuất sẵn). Đọc `01-Logo/LOGO-README.md`.

## Cây thư mục
```
01-Logo/            Logo master SVG + PNG + 3 phương án exploration (A được chọn, B = huy hiệu, C = khối chữ trẻ em)
02-Brandbook/       PDF brandbook + bản HTML
03-Color-Typography/  Token màu/font: gon-tokens.css · gon-tokens.json · FONTS.md
04-Templates/       Mẫu cover mạng xã hội, bài vuông, slide, giấy khen (SVG+PNG) + họa tiết hạt giống
05-Product-GDevelop/ Cách áp dụng vào game xây bằng GDevelop trong repo này
06-Content/         Ngân hàng nội dung VI/EN: định vị, FAQ, tính năng, giọng nói, thang tuyên bố
assets-illustration/ Minh họa bìa/lớp học (AI hỗ trợ phác thảo — xem lưu ý)
tools/              Script tái tạo toàn bộ (generate_logos.py, generate_templates.py, build_brandbook.py, render_pngs.js)
```

## Tái tạo file (reproducible)
```bash
python3 -m venv /tmp/venv-branding && /tmp/venv-branding/bin/pip install pymupdf pillow reportlab fonttools brotli
cd branding/GON-GameOfNurture
/tmp/venv-branding/bin/python tools/generate_logos.py
/tmp/venv-branding/bin/python tools/generate_templates.py
npm --prefix tools install && node tools/render_pngs.js .
/tmp/venv-branding/bin/python tools/make_favicon.py
/tmp/venv-branding/bin/python tools/build_brandbook.py
python3 -m http.server 8123   # xem index.html tại http://localhost:8123/
```
Font build để trong `tools/fonts-ttf/` (merge subset latin+latin-ext+vietnamese từ Fontsource, OFL).

## Lưu ý quan trọng (đọc trước khi dùng thương mại)
- **Nhãn hiệu:** tên "Game Of Nurture/GON" gần với "Nurture Games" cùng lĩnh vực game giáo dục → **tra cứu & đăng ký nhãn hiệu (VN + thị trường mục tiêu) trước khi ra mắt**; không dùng logo/câu chữ của Nurture Games. Logo POAP (rosette) là nhãn hiệu của POAP Inc — GON chủ đích **không** dùng rosette.
- **Tuyên bố hiệu quả:** chỉ dùng tuyên bố thuộc "Thang tuyên bố" (06-Content). GON không phải thiết bị y tế.
- **Dữ liệu trẻ em:** tuân thủ COPPA/GDPR-K/PDPD (NĐ 13/2023) — cần tư vấn pháp lý riêng.
- **Minh họa:** 2 tranh trong `assets-illustration/` do AI hỗ trợ tạo để định hướng phong cách; khi thương mại hóa nên thuê họa sĩ vẽ lại/hoàn thiện để đảm bảo quyền sử dụng & tính độc bản. **Logo là vector vẽ bằng hình học trong `tools/generate_logos.py`, không phải ảnh AI.**
- Font Baloo 2 & Be Vietnam Pro: SIL Open Font License 1.1.

Phiên bản: 1.0 · 2026-10-21 · Thiết kế trên nhánh `arena/735ff871-gdevelop` (không sửa thương hiệu/engine GDevelop).
