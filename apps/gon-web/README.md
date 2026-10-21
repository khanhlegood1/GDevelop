# GON.org — Web prototype 18+

Prototype chạy ngay, không cần build hay API key. Nó biến ý tưởng của GON thành một hành trình tương tác:

1. **18+ + Google gate (mô phỏng)** — người dùng tự xác nhận đủ 18 tuổi. Đây *không phải* OAuth thật và không gửi credential đi đâu.
2. **Learning Arena** — theo mẫu side-by-side của FastChat/Arena: mỗi input tạo hai lộ trình *AI Coach Path* và *Quest/Game Path* để chọn, hợp nhất hoặc “chưa hợp”.
3. **Multimodal ingestion** — text, `.txt/.md/.json/.csv`, ảnh, PDF (metadata + hash), YouTube, Facebook và website. Input vừa là truy vấn vừa là Source Artifact của dự án học.
4. **Hybrid search demo** — deterministic local embedding có đúng **768 chiều**, cosine similarity + keyword/concept + độ phủ từ khóa đặc thù trên 8 module mẫu.
5. **Brew Your Topic** — khi điểm tìm kiếm không đủ, giao diện mở 11 bước ADK mô phỏng và tạo module gồm khái niệm, 5 quest, flashcards, reorder, quiz và Boss Proof.
6. **Lifelong Hero Journey** — **Numeric Level vô hạn ngay từ đầu**: `Lv = floor(Lifetime XP / 100)`. Zero → Awaken → Explorer → Guardian → Hero → Legend là các Era; **Forever là Era mở từ Lv.35+**, sau đó vẫn lên Lv.36, Lv.37…
7. **Proof Vault** — POAP/SBT, Facebook, YouTube, ảnh chứng chỉ, chứng chỉ/chứng nhận và link; mỗi proof có hash, issuer, dự án liên kết và cấp xác minh trung thực.
8. **Persistence** — toàn bộ dự án/Lifetime XP/proof lưu trong `localStorage` key `gon-hero-18plus-v2`; có xuất JSON/GDevelop blueprint và Reset demo. Prototype chưa có Learning Token hay số dư ví.

## Chạy

```bash
cd apps/gon-web
python3 -m http.server 8130 --bind 0.0.0.0
# mở http://localhost:8130
```

Có thể mở trực tiếp `index.html`, nhưng HTTP server là cách được khuyến nghị để đường dẫn asset và hash hoạt động giống môi trường web.

## Mô hình level suốt đời

Công thức chuẩn `gon-level-v1`:

```text
Numeric Level = floor(Lifetime XP / 100)
```

| Lifetime XP | Hiển thị | Level tiếp theo |
|---:|---|---:|
| 0 | Lv.0 · Zero | Lv.1 tại 100 XP |
| 1.250 | Lv.12 · Hero | Lv.13 tại 1.300 XP |
| 3.500 | Lv.35 · Forever | Lv.36 tại 3.600 XP |
| 9.999 | Lv.99 · Forever | Lv.100 tại 10.000 XP |

Không có max/final level. Nếu Learning Token được triển khai sau này, level chỉ đối chiếu với **Lifetime Earned Token** từ hành động học hợp lệ; chi tiêu token không làm tụt level và mua/nhận token không làm tăng level. Đặc tả đầy đủ: [`GON-WHITEPAPER.md`](../../branding/GON-GameOfNurture/07-Product-AI/GON-WHITEPAPER.md).

## Test phần logic thuần

```bash
node --test apps/gon-web/tests/app.test.js
node --check apps/gon-web/app.js
```

## Ranh giới prototype vs production

| Phần | Prototype hiện tại | Production cần làm |
|---|---|---|
| Google login | form mô phỏng + 18+ self-attestation | Google OAuth/OIDC phía server, chính sách tuổi và quản trị tài khoản hợp lệ theo khu vực |
| Embedding | deterministic 768D trong browser | Gemini `gemini-embedding-001`, `SEMANTIC_SIMILARITY`, 768D ở server/worker |
| Search | 8 module cố định + hybrid score | Convex/DB index: full-text + vector, phân quyền, chống lộ dữ liệu riêng tư |
| Brew | 11 bước UI + generator cục bộ | Google ADK bất đồng bộ qua queue, schema, citation/grounding, idempotency |
| File/video | metadata/hash, text nhỏ đọc client | object storage, OCR, PDF extraction, transcript/ASR, malware scan, bản quyền |
| Proof | hash + cấp tự khai/Source-linked | đối chiếu issuer/chữ ký, POAP/SBT API, quyền riêng tư và thu hồi bằng chứng |
| Numeric Level | `calculateLevel()` chạy client theo `gon-level-v1`; XP mẫu có thể cộng qua quest | XP Ledger phía server, idempotency, điều chỉnh/thu hồi có audit; không có max level |
| Learning Token | chưa phát hành, không có ví/số dư | chỉ sau phê duyệt pháp lý; tách `LifetimeEarnedToken` dùng đối chiếu level khỏi `SpendableTokenBalance` |
| GDevelop | blueprint Markdown | converter tạo scene/events/variables hoặc template project đã kiểm thử |

White Paper về Lifelong Level/XP/Token: [`GON-WHITEPAPER.md`](../../branding/GON-GameOfNurture/07-Product-AI/GON-WHITEPAPER.md) · [bản PDF](../../branding/GON-GameOfNurture/07-Product-AI/GON-WHITEPAPER.pdf). Kiến trúc đích và hợp đồng dữ liệu: [`ARCHITECTURE.md`](ARCHITECTURE.md). Requirement V2.1 về 10+ output, trend, footprint, Arena vote và Journey Fork: [`GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md`](../../branding/GON-GameOfNurture/07-Product-AI/GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md). Tài liệu thương hiệu: [`../../branding/GON-GameOfNurture/`](../../branding/GON-GameOfNurture/).

## Quy trình phát triển và Gate 0

GON được phát triển theo AI-Agile/HITL với Product Owner duyệt từng gate. Cổng tài liệu kỹ thuật: [`docs/README.md`](docs/README.md). Tài liệu chính đang trình duyệt: [`Gate 0 — Source & Architecture Charter`](docs/01-architecture/GATE0-SOURCE-ARCHITECTURE-CHARTER.md).

> Không nhập mật khẩu Google thật vào prototype. Không dùng dữ liệu mẫu trong app làm bằng chứng y khoa, pháp lý hay thành tích thật.
