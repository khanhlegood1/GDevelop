# GON — Game Of Nurture · Brand & Product Package v2 (Heroes 18+)

Gói này là bản **v2** của hệ nhận diện đã merge ở PR #6. V1 định vị giáo dục cho trẻ em/mọi lứa tuổi; theo brief mới, GON.org chuyển sang người trưởng thành **18+**, lấy cảm hứng tuyên ngôn của **ZOFO — Zero to Forever** tại hienmaunhanvan.com: *Become The Hero Within*, hiến máu nhân văn, sức khỏe toàn diện, AI Coach, gamification Zero → Forever và Proof/POAP.

Bản chạy được của sản phẩm nằm ở [`../../apps/gon-web/`](../../apps/gon-web/): Google/18+ gate mô phỏng, multimodal composer, demo vector search 768D, Learning Arena kiểu FastChat, Brew Your Topic, XP/level và Proof Vault.

## Cấu trúc

| Thư mục | Nội dung v2 |
|---|---|
| `01-Logo/` | G Orbit trưởng thành: Midnight, mầm Emerald, lá/fork Crimson, chấm Gold, Hero Spark; wordmark Be Vietnam Pro ExtraBold; SVG/PNG/app/favicon/proof badge |
| `02-Brandbook/` | `GON-Brandbook-2026.pdf` — brandbook v2 18+ |
| `03-Color-Typography/` | Tokens CSS/JSON (Midnight, Ascent Emerald, Hero Gold, Humanity Crimson, Proof Cyan), typography 18+ |
| `04-Templates/` | Social cover/post, slide title, Hero Proof certificate, pattern |
| `05-Product-GDevelop/` | Hướng dẫn chuyển quest/module/XP/proof thành GDevelop |
| `06-Content/` | Định vị, giọng, copy VI/EN, claim ladder |
| `07-Product-AI/` | Đặc tả GON.org: multimodal input, Gemini 768D, ADK/Brew, FastChat Arena, Proof of Learning |
| `assets-illustration/` | Minh họa Heroes 18+; ảnh trẻ em v1 nằm trong thư mục legacy, không sử dụng |
| `tools/` | Generator logo/template/PNG/favicon/PDF và font TTF phục vụ tái lập |

Mở **`index.html`** ở thư mục này để xem brand hub v2 và mở prototype tương đối `../../apps/gon-web/`.

## Thay đổi cốt lõi so với v1

- **Đối tượng:** trẻ em/gia đình/mọi lứa tuổi → **thanh niên/người lớn 18+**.
- **Hành trình:** Hạt → Mầm → Chồi → Cây → Vườn → **Zero → Awaken → Explorer → Guardian → Hero → Legend → Forever**.
- **Tagline:** “Chơi. Học. Lớn khôn.” → **Become the Hero Within** / **Ingest. Learn. Prove. Become.**
- **Logo:** G xanh Baloo → G Midnight, Be Vietnam Pro ExtraBold, lá Crimson + Hero Spark.
- **Mascot:** Gon Mầm và concept blocks **nghỉ hưu khỏi master brand**.
- **Sản phẩm:** game giáo dục chung chung → nền tảng AI search/Brew biến mọi input thành dự án học có Proof.

## Tái tạo

Từ thư mục này, dùng Python venv có `fonttools`, `brotli`, `pillow`, `reportlab`, `pymupdf` và Node package `@resvg/resvg-js`:

```bash
python3 tools/generate_logos.py
python3 tools/generate_templates.py
NODE_PATH=/path/to/node_modules node tools/render_pngs.js .
python3 tools/make_favicon.py
python3 tools/build_brandbook.py
```

SVG là master; PDF và PNG là bản xuất. Logo của app được đồng bộ thủ công vào `../../apps/gon-web/assets/gon-app-icon-v2.svg` sau mỗi lần đổi mark.

## Kiểm chứng nguồn & giới hạn pháp lý

- Tính năng AI trong `apps/gon-web` là **prototype cục bộ**; Google OAuth, Gemini, ADK, OCR/transcript và POAP verification chưa nối API thật.
- Không dùng số liệu 100.000+ thành viên/50.000+ đơn vị máu/1.000.000+ quest của trang ZOFO làm số liệu GON.
- Nếu ZOFO và GON không cùng chủ thể hoặc chưa có quyền bằng văn bản, cần kiểm tra quyền dùng tên/thông điệp “Zero to Forever/Become The Hero Within”, đồng thời tra cứu nhãn hiệu “GON/Game Of Nurture” trước thương mại hoá.
- Nội dung hiến máu/sức khỏe chỉ mang tính chuẩn bị và ghi hành trình; không chẩn đoán/điều trị. Ảnh minh họa AI là style draft cần kiểm tra quyền trước dùng thương mại.
- Không có Pantone được khẳng định; hãy proof màu in thực tế.
