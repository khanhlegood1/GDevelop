# PO Decision — Apply-8: KOL token backend — GET /v1/me/kol-path (2026-10-27)

**Kết luận: SHIPPED — chờ PO xác nhận.** PO duyệt slice "KOL token backend" (27/10) → mở rộng hợp đồng bằng cách **THÊM** path mới `/me/kol-path` + schemas `KolPath`/`KolTier`/`KolPathOutput` (các path P03 cũ không đổi — LOCKED giữ nguyên).

## Logic (toàn bộ từ dữ liệu thật)

- **Trend mỗi output** = tổng Elo từ vote Arena trên match đã vote mà output là slot (mirror FE-9): thắng +8, thua -5, hoà +1, cả hai chưa đạt -4, **merge 0** (không tính điểm).
- **Output** = candidate của CandidateSet hiện tại thuộc project chưa xoá của người học.
- **trendToken** = Σ max(0, trend) mỗi output (âm không kéo token xuống — không bao giờ âm token).
- **hot** = trend ≥ 40; **tier** mirror `src/lib/kol-path.ts` (sprout → niche_owner khi ≥1 hot → niche_kol khi ≥3 hot hoặc token ≥100), progressPct/nextStep cùng công thức FE.
- Riêng tư theo owner; FE KolPathCard wiring thật (bỏ dataNote "chưa có backend xu hướng").

## Bằng chứng

- `tsc` binary thật PASS · battery **211/211** (+3 test: 5 thắng + 1 hoà → 41 token/1 hot/niche_owner 65%; both_bad −4 + merge 0 + match chưa vote không tính; riêng tư theo user).
- Live port 3000: sau 5 trận thắng + 1 hoà → `tier: niche_owner 🌿 · trendToken: 41 · hotOutputs: 1 · nextStep: "còn 2 output ≥40 xu hướng hoặc 59 token tới ⭐ KOL ngách"`; per-output trend 41/0/−24 hiển thị đúng.

## Queue sau Apply-8

Creator analytics toàn cục (cần hợp đồng) · P05 verdict + P06 Go-Live (final call PO) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06.
