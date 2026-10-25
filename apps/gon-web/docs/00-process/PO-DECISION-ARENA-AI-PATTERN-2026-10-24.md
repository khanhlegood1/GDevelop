# PO DECISION — Áp dụng mô hình arena.ai vào GON (Đấu trường kiểu arena.ai)

> **Ngày:** 24/10/2026 (tối muộn, sau FE-Confirm-8)
> **Người quyết:** Product Owner (GON) — hỏi *"làm giống arena.ai áp dụng vào GON ntn?"*
> **Lựa chọn PO:** phương án **Đầy đủ** (4 nút vote + Đấu cặp khác + ±Elo + Leaderboard chuyên mục + mũi tên xu hướng + E2E + docs).
> **Trạng thái:** ✅ Demo standalone v2.7 (E2E 130/130, 13/13 flows) · `ARENA_PATTERN_DECISION` trong `src/lib/product-decisions.ts`.
> **Ghi chú:** mô hình Arena của GON bắt nguồn từ **Gate 0 — FastChat (Apache-2.0)**; tài liệu này mô tả cách vận hành mô hình đó theo trải nghiệm arena.ai.

## 1. Vòng lặp lõi arena.ai và cách GON áp dụng

```
Prompt/Topic → 2 OUTPUT ẩn danh cạnh nhau (cùng chủ đề)
→ vote: A · B · Hoà · Cả hai chưa đạt
→ MỞ nhãn model sau vote (chống thiên vị thương hiệu)
→ vote cộng dồn thành Elo → Leaderboard cộng đồng (tổng + theo chuyên mục)
→ "Đấu cặp khác" → vòng lặp tiếp tục
```

Đặc sản GON: arena.ai đấu *model chat* — GON đấu **output học tập 6 định dạng GDevelop**, và **vote đồng thời là tín hiệu bộc lộ persona** (dấu chân đẳng cấp) — vòng lặp *học → đấu → xếp hạng → cá nhân hoá*.

## 2. Đã triển khai trong demo (v2.7)

| Cơ chế arena.ai | Triển khai trong GON demo |
|---|---|
| 4 lựa chọn vote | **A · B · 🤝 Hoà — cả hai đều tốt · 👎 Cả hai chưa đạt** |
| Cặp đấu mới liên tục | Nút **"⚔️ Đấu cặp khác"** — pool 3 cặp (Infographic vs Video · Bài đọc vs Mini-game · Easy-task vs Bộ ảnh), xoay vòng, **1 vote mỗi cặp** (`S.arenaBattles`) |
| Vote → Elo thay đổi thấy được | Sau vote mỗi bên hiện chip **📈 Elo +8 / -5** (Hoà +1/+1 · Cả hai chưa đạt -4/-4) + mở nhãn model |
| Leaderboard chuyên mục | Tab Model có **filter định dạng** (Web · Video · Game · Infographic · Ảnh · Easy-task) + bảng **👥 Xếp hạng theo persona** (điểm cộng đồng từ bình chọn) |
| Xu hướng thứ hạng | Mũi tên **↑2 / ↓1 / –** trên từng hàng leaderboard |
| Mù nhãn tới khi vote | Giữ nguyên (là cơ chế gốc của khối Arena trong Khám phá) |
| Vote là tín hiệu persona | Vote a/b lưu **tên model** → hiện "🗳 vote của bạn" trên đúng hàng leaderboard đó; vote tính vào flow F9 |

## 3. Quy tắc sản phẩm chốt

1. Arena **nằm trong màn hình Khám phá** (đúng quyết định Unified Discover) — không tạo màn hình riêng.
2. **Một vote mỗi cặp đấu**; vote a/b ghi tên model để leaderboard gắn đúng; Hoà/Cả hai chưa đạt không gắn model.
3. Elo trong demo là **mô phỏng** (+8/-5/+1/-4); production dùng Elo thật (Bradley-Terry / Elo chuẩn từ `S.arenaBattles`).
4. XP vote (+15) vẫn giữ; badge `arena` chỉ cấp một lần.

## 4. Ghi chú production

- Elo thật: hệ thống chấm điểm Bradley-Terry với khoảng tin cậy (CI) như leaderboard chuẩn; batch cập nhật hằng giờ.
- Chống gian lận vote: cooldown theo thiết bị/tài khoản, phát hiện vote hàng loạt, cân bằng cặp đấu (mỗi model số lượt đấu tương đương).
- Chuyên mục leaderboard mở rộng theo định dạng GDevelop thật (6 format) và persona; "rank movement" tính theo cửa sổ thời gian (7 ngày).
- So sánh trực tiếp 2 output do người dùng chọn (side-by-side) — giai đoạn sau.

## 5. Mục embed "THẬT" (FE-Confirm-11, PO chốt sau câu hỏi iframe arena.ai)

PO hỏi: *"Trong stand-alone web nếu thêm iframe để đưa arena.ai vào có chạy được không?"* → kết luận: **gần như chắc chắn không** (arena.ai chặn iframe bằng X-Frame-Options/CSP + reCAPTCHA; cross-origin chỉ nhìn được; phá nguyên tắc demo offline + E2E jsdom). PO chốt hướng đúng: **embed thứ cho phép embed, cùng origin**.

Triển khai (v2.9):
- **`ux-prototype/standalone/arena-embed.html`** — trang arena nhúng được của GON (1 tệp, không dependency, same-origin): 4 lựa chọn vote, 1 vote/cặp, ±Elo sau vote, "Đấu cặp khác", hỗ trợ **`?embed=1`** (kiểu Gradio embed mode — gọn, không chrome thừa).
- **Demo chính:** nút **"📺 Chế độ embed (iframe)"** trong khối Arena → thay battle inline bằng `<iframe src="arena-embed.html?embed=1">` cùng origin; vote trong khung gửi về trang chính qua **`postMessage`** (`{app:"gon-arena-embed", type:"vote", pairId, choice, model, t}`) → ghi vào `S.votes` (IndexedDB) + **+15 XP** + toast.
- **Production:** đường "đấu trường thật" = tự host **FastChat (Gate 0, Apache-2.0)** dưới dạng **Gradio/HF Space** (Gradio sinh ra để embed, có `?embed=true`) hoặc GON arena cùng origin — đúng hợp đồng postMessage ở trên. **Không** nhúng arena.ai trực tiếp; không proxy để lách header (phạm ý đồ site + ToS).
