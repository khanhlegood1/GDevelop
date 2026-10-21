# Typography — GON

| Vai trò | Font | Weights | Vì sao |
|---|---|---|---|
| Display / Logo / Tiêu đề game | **Baloo 2** | 600 · 700 · 800 | Bo tròn, khỏe, thân thiện với trẻ nhưng đủ "thương hiệu" cho người lớn; **hỗ trợ đầy đủ tiếng Việt** |
| Body / UI / Tài liệu | **Be Vietnam Pro** | 400 · 500 · 600 · 700 · 800 | Thiết kế cho tiếng Việt, dấu thanh chuẩn, đáng tin với phụ huynh/giáo viên |
| Fallback UI | Nunito → system-ui | — | Khi không nhúng được font (HTML5 export nhẹ) |

**Không dùng Rubik như POAP cho nội dung tiếng Việt** — bộ dấu tiếng Việt của Rubik không đầy đủ/ổn định bằng hai font trên.

- Giấy phép: cả hai font theo **SIL Open Font License 1.1** (dùng thương mại được, không bán riêng font).
- Tải chính thức: Google Fonts — `Baloo 2`, `Be Vietnam Pro`. Khi subset cho web phải gồm **latin + latin-ext + vietnamese** (thiếu sẽ rớt dấu).
- Logo trong `01-Logo/svg/` đã **convert chữ thành outline** — mở/in không cần cài font.
- File TTF trong `tools/fonts-ttf/` là bản merge subset (từ Fontsource) chỉ để build PDF/HTML trong repo này; để cài đặt thiết kế, hãy tải bản đầy đủ từ Google Fonts.
- Quy tắc chữ cho trẻ: không dùng chữ <16px trong game cho trẻ <9 tuổi; line-height ≥1.4; không viết HOA cả câu dài; tránh font trang trí khó đọc cho nội dung học.
