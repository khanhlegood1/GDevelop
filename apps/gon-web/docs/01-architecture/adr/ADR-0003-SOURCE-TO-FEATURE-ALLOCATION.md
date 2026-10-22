# ADR-0003 — Phân bổ FastChat, WSIC và GDevelop theo tính năng

## Trạng thái

**Accepted — Product Owner đã duyệt Gate 0 ngày 22/10/2026 tại commit `5482dac`.**

## Bối cảnh

PO yêu cầu xác nhận trước GitHub/link nguồn nào sẽ dùng cho tính năng nào để toàn bộ kiến trúc và công nghệ GON rõ ràng. Ba codebase có thế mạnh khác nhau và không codebase nào bao phủ toàn bộ GON.

## Quyết định

| Nguồn | Phân bổ chính |
|---|---|
| **FastChat** | Learning/Output Arena side-by-side, vote left/right/tie/both-bad, conversation/output snapshot, Elo/Bradley–Terry ranking và provider-adapter patterns |
| **WSIC** | Gemini embeddings 768D/vector search, ngưỡng no-result → Brew Your Topic, Google ADK checker/generator, content blocks, async queue/retry và realtime patterns |
| **GDevelop/GON hiện tại** | Production monorepo, product/brand/White Paper source of truth, game templates/runtime/export direction và lifelong-level contract |
| **GON tự xây** | Universal Input provenance, Canonical Module Graph, Journey Fork, XP Ledger, Proof Vault, trend/footprint recommender, creator attribution, assessment integrity, GDevelop bridge, production security/operations |
| **ZOFO/Arena.ai/TikTok/Facebook** | Tham chiếu định vị và hành vi sản phẩm; không phải nguồn code |

## Hệ quả

- P01 viết requirements theo các boundary này và gán Requirement ID vào Feature-Source Traceability.
- P02 thiết kế Arena theo hành vi FastChat nhưng bằng UX/brand GON.
- P03 biến WSIC blocks thành Canonical Module Graph thay vì khóa GON vào schema WSIC nguyên trạng.
- P03 làm spike GDevelop bridge trước khi hứa lịch trình game generation.
- Không một upstream nào được dùng làm lý do bỏ qua authz, privacy, moderation, anti-cheat hay AI evaluation của GON.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Dùng WSIC cho cả Arena/vote | WSIC không phải nguồn mạnh cho pairwise Arena/rating |
| Dùng FastChat cho Search/Brew | FastChat không cung cấp vector-learning-content pipeline tương đương WSIC |
| Dùng GDevelop cho toàn bộ web/backend | GDevelop mạnh về game/editor, không phải identity/vector/AI backend |
| Chọn thêm codebase lớn khác ngay tại G0 | PO yêu cầu ưu tiên nguồn đã cung cấp; thêm nguồn mới cần Audit và lý do riêng |
