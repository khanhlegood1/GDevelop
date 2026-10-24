# PO DECISION — Bộ hành động xã hội: Fork · Remix · Like · Love · Share

> **Ngày:** 24/10/2026 (tối, sau FE-Confirm-7)
> **Người quyết:** Product Owner (GON) — hỏi "Fork khác Remix, Like, Love, share ntn? Và trong dự án này nên làm ntn cho tốt?"
> **Lựa chọn PO:** phương án **Đầy đủ** (Remix + 💜 "Đã hiểu thật" gated + bộ 6 hành động + weights + docs + E2E).
> **Trạng thái:** ✅ Demo standalone v2.6 (E2E 118/118, 13/13 flows) · `SOCIAL_ACTIONS_DECISION` trong `src/lib/product-decisions.ts`.

## 1. Phân biệt khái niệm

| | **Fork** | **Remix** | **Like** | **Love** | **Share** |
|---|---|---|---|---|---|
| Bản chất | Sao chép **toàn bộ** để đi tiếp theo đường riêng | Tạo **phái sinh** trên nền gốc (gốc vẫn được ghi công) | Tín hiệu quý thích (nhẹ) | Tín hiệu quý thích (mạnh hơn) | **Phân phối lại** |
| Tạo object mới? | ✅ bản sao độc lập, sở hữu riêng | ✅ output mới gắn "remixed from @gốc" | ❌ | ❌ | ❌ |
| Ghi công nguồn | ✅ fork network, góp ngược kiểu PR | ✅ luôn gắn nguồn | — | — | ✅ nguồn giữ nguyên |
| Nền tảng đặc trưng | GitHub | TikTok Remix/Duet, SoundCloud | mọi MXH | Facebook reactions | mọi nền tảng |
| Độ nặng tín hiệu | rất cao | rất cao | thấp | trung bình | cao |

**Chốt một câu:** Like/Love = *phản ứng*; Share = *phân phối*; **Remix = sáng tạo phái sinh trên NỘI DUNG**; **Fork = mang về cả HÀNH TRÌNH để tự chủ**.

## 2. Thiết kế chọn cho GON (bộ 6 hành động trên card, rail kiểu TikTok)

| Hành động | Ý nghĩa trong GON | Trọng số xu hướng | XP |
|---|---|---|---|
| ❤️ Like | quý thích nhẹ | +3 | 0 (chống farm) |
| 💬 Comment | thảo luận | +6 | nhỏ |
| 💜 **"Đã hiểu thật"** (Love của GON) | reaction **chỉ mở sau khi vượt checkpoint "hiểu thật" của output đó** — reaction phải học mới có, chống like ảo | +5 | +2 |
| 📤 Share | phân phối, bảo đảm danh dự | +4 | nhỏ |
| 🎨 **Remix (mới)** | output phái sinh: chọn tổ hợp persona × độ sâu **của bạn** trên topic của người khác (12 tổ hợp sinh sẵn — đúng quyết định Unified Discover); lựa chọn = persona bộc lộ (dấu chân đẳng cấp); output mới ghi "Remix từ @tác giả", vào feed của bạn | +6 cho output gốc | +15 cho người remix |
| 🍴 Fork (giữ) | copy **cả module/hành trình** về làm của mình (GitHub-like); fork count = chỉ số ảnh hưởng; hướng tới "đề xuất merge ngược" như PR | +8 | +20 |

Quy tắc phân biệt cốt lõi ghi trong UI/docs: **Remix = làm lại NỘI DUNG theo cách mình · Fork = mang về cả HÀNH TRÌNH.**

## 3. Triển khai trong demo (v2.6)

- Rail card: ❤️ like · 💬 comment · 💜 love (**🔒 khoá** khi chưa qua checkpoint của card đó; mở khoá qua luồng học) · ↗️ share · 🎨 Remix (sheet chọn 1 trong 12 tổ hợp — không pre-select) · 🍴 Fork.
- Remix: sheet 12 tổ hợp → chọn → `S.remixes` + persona reveal vào `S.picks` → card mới "🎨 Remix từ @author" trong feed (base 12 xu hướng) → boost +6 cho gốc → +15 XP → POAP "🎨 Remix: …".
- Love: `S.learnedCards` mở khoá khi vượt checkpoint của card đang học (`card-learn` → checkpoint pass) → thả 💜 một chiều → `S.loves` + boost +5 → +2 XP → POAP "💜 Đã hiểu thật: …".
- POAP timeline hiển thị tới 30 sự kiện gần nhất (tăng từ 14 để đủ dung lượng hoạt động mới).
- Flow **F13** trên Sơ đồ xác nhận: "Remix output (persona reveal) + 💜 Đã hiểu thật (gated sau checkpoint)" — map 13/13 flows.

## 4. Ghi chú production (khi build FE thật)

- Data model lineage: `parent_output_id`, `remix_depth`, `fork_root`; ghi công kiểu CC-BY (tên tác giả gốc hiển thị mọi nơi bản phái sinh xuất hiện).
- Anti-abuse: weights tách bạch, cooldown, 💜 gate bằng sự kiện checkpoint thật (server-verified), không cho remix/fork hàng loạt.
- Metrics tách riêng từng hành động (like rate ≠ remix rate ≠ fork rate) để đo "chất học" chứ không chỉ "độ viral".
- XP/xu hướng chỉ tính cho tương tác sau điều kiện gate tương ứng — chống farming xu hướng.
