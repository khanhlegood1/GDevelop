# P01 — Requirement Intelligence cho GON

> **Gate:** P01<br>
> **Trạng thái:** **IN REVIEW — chờ Product Owner phê duyệt**<br>
> **Ngày lập:** 22/10/2026<br>
> **Điều kiện vào gate:** Gate 0 đã được PO duyệt tại commit `5482dac`<br>
> **Phạm vi của P01:** chốt bài toán, người dùng, MVP, backlog, tiêu chí nghiệm thu và quyết định sản phẩm. **Không viết production code trong gate này.**

## Kết luận P01 trong 60 giây

P01 đề xuất phát hành đầu tiên là **GON Private Alpha** cho nhóm người dùng 18+ được mời, ưu tiên tiếng Việt, với một vòng học khép kín:

```text
Google + 18+ + consent
→ Universal Input
→ Search hoặc Brew
→ chọn trong tối đa 10+ Output Candidates khi chủ đề đủ rộng
→ Arena vote nếu cần so sánh
→ Fork vào Journey Branch riêng tư
→ học, truy hồi, chuyển giao, Boss Proof
→ XP Ledger → Lv.N · Era vô hạn
→ Proof Vault và gợi ý bước tiếp theo
```

Private Alpha **chưa** mở marketplace, token, phần thưởng tiền, public viral feed, scrape trend mạng xã hội, tự động xác minh chứng chỉ/POAP hoặc cam kết biến creator thành KOL/người giàu. Các năng lực đó nằm trong roadmap có điều kiện sau khi vòng học lõi được chứng minh an toàn và có giá trị.

## Bộ tài liệu trình PO duyệt

| # | Artifact | PO cần quyết định gì? |
|---:|---|---|
| 1 | [`GON-PRD-V1.md`](GON-PRD-V1.md) | Tầm nhìn, bài toán, phạm vi MVP, functional requirements, non-goals và nguyên tắc sản phẩm |
| 2 | [`PERSONAS-JTBD-AND-LEARNING-MODES.md`](PERSONAS-JTBD-AND-LEARNING-MODES.md) | Người dùng mục tiêu, Learning Mode và hành trình giá trị |
| 3 | [`BACKLOG-MOSCOW-AND-VERTICAL-SLICES.md`](BACKLOG-MOSCOW-AND-VERTICAL-SLICES.md) | Must/Should/Could/Won't, thứ tự vertical slice và slice đầu tiên sau P03 |
| 4 | [`ACCEPTANCE-CRITERIA-BDD.md`](ACCEPTANCE-CRITERIA-BDD.md) | “Xong” được kiểm chứng thế nào bằng Given/When/Then |
| 5 | [`METRICS-RISKS-AND-OPEN-DECISIONS.md`](METRICS-RISKS-AND-OPEN-DECISIONS.md) | Chỉ số thành công/guardrail, rủi ro, giả định và các lựa chọn còn mở |
| 6 | [`P01-TRACEABILITY-MATRIX.md`](P01-TRACEABILITY-MATRIX.md) | Mỗi yêu cầu truy vết về Gate 0, nguồn mở, story, BDD và gate triển khai |

## Nguồn yêu cầu đầu vào

P01 tổng hợp, không thay thế lịch sử của:

- [`GON-ORG-PRODUCT-SPEC-18PLUS.md`](../../../../branding/GON-GameOfNurture/07-Product-AI/GON-ORG-PRODUCT-SPEC-18PLUS.md)
- [`GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md`](../../../../branding/GON-GameOfNurture/07-Product-AI/GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md)
- [`GON-WHITEPAPER.md`](../../../../branding/GON-GameOfNurture/07-Product-AI/GON-WHITEPAPER.md)
- [Gate 0 Charter đã duyệt](../01-architecture/GATE0-SOURCE-ARCHITECTURE-CHARTER.md)
- [Feature–Source Traceability đã duyệt](../01-architecture/FEATURE-SOURCE-TRACEABILITY.md)
- [Prototype và kiến trúc đích hiện tại](../../ARCHITECTURE.md)

## Các mặc định P01 đang đề xuất

Đây là **đề xuất trình duyệt**, chưa phải quyết định đã khóa nếu PO yêu cầu sửa:

1. **Private Alpha, invite-only**, chưa public launch.
2. **Việt Nam và tiếng Việt trước**; kiến trúc nội dung sẵn sàng cho tiếng Anh.
3. Google sign-in + tự xác nhận 18+ cho alpha; không gọi đây là xác minh giấy tờ và sẽ rà soát lại trước public launch.
4. Journey, Fork, footprint và Proof **private theo mặc định**; công khai phải opt-in từng artifact.
5. Input được chấp nhận rộng, nhưng mức trích xuất tự động theo từng loại được ghi minh bạch; artifact chưa xử lý được vẫn được lưu có kiểm soát thay vì giả vờ đã hiểu.
6. Nội dung AI mới là `draft/private` trước; không tự động publish.
7. Trend trong Private Alpha chỉ dùng tín hiệu học thật bên trong GON; không scrape TikTok/Facebook.
8. Footprint chỉ gồm dữ liệu trong GON mà user đã đồng ý dùng cho cá nhân hóa; user xem/tắt/xóa được.
9. Creator nhận XP/reputation/attribution nội bộ; chưa có tiền, token giao dịch hay marketplace.
10. GDevelop ở MVP là một template/game slice có kiểm chứng sau vòng web lõi, không hứa “mọi topic thành game hoàn chỉnh ngay”.

## Checklist PO duyệt P01

- [ ] Persona và nhóm người dùng Private Alpha đúng ưu tiên.
- [ ] MVP đủ nhỏ để xây nhưng vẫn chứng minh vòng `Input → Learn → Proof → Level`.
- [ ] Must/Should/Could/Won't đúng thứ tự giá trị.
- [ ] Vertical Slice 1 là lát cắt nên xây đầu tiên sau P02/P03.
- [ ] BDD đủ rõ để thiết kế UX và viết test sau này.
- [ ] Các mặc định 18+, privacy, publish, footprint và reward ở trên được chấp nhận hoặc đã ghi yêu cầu sửa.
- [ ] North-star và guardrail không khuyến khích học vẹt, farm XP hay tương tác rỗng.
- [ ] P02 chỉ bắt đầu sau khi P01 được duyệt.

## Cách PO phản hồi

```text
APPROVED — P01, commit <sha>.
Cho phép bắt đầu P02.
Điều kiện kèm theo: <nếu có>.
```

hoặc:

```text
CHANGES REQUESTED — P01.
1. <phạm vi/persona/quyết định cần sửa>
2. <tiêu chí cần làm rõ>
Chưa bắt đầu P02.
```
