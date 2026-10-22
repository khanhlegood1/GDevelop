# ADR-0005 — Modular monolith TypeScript cho web/API, Python ADK tách riêng

## Trạng thái

**Proposed — IN REVIEW tại P03 ngày 22/10/2026.** Chỉ chuyển Accepted khi PO duyệt P03.

## Bối cảnh

GON cần một web app/API có auth, authorization, search, jobs, Arena, Journey, XP và Proof. Prototype tĩnh hiện tại không phải production platform. WSIC gợi ý Next.js cho web và Python cho Google ADK; FastChat là Python/Gradio nhưng không phù hợp làm production web của GON.

## Quyết định đề xuất

- Tiến hóa `apps/gon-web` thành Next.js + TypeScript modular monolith cho Web UI và HTTP API `/v1`.
- Domain modules tách theo identity, projects, search, generation, discovery, journeys, progress, safety và operations.
- Worker TypeScript xử lý extraction/search/orchestration qua job contract.
- Google ADK chạy trong Python service riêng; service chỉ trả structured output và không ghi database/publish trực tiếp.
- OpenAPI/JSON Schema trong `docs/04-contracts` là contract giữa frontend, API, workers và ADK.

## Hệ quả

- Một ngôn ngữ chính cho product/API giúp chia sẻ validation/types với frontend.
- Python chỉ xuất hiện ở nơi ADK mạnh nhất, giảm blast radius và dependency.
- Modular monolith tránh microservices sớm nhưng vẫn có boundary để tách worker khi tải tăng.
- P04 phải dựng dependency/test baseline mới; không dùng lockfile WSIC nguyên trạng.

## Phương án đã cân nhắc

| Phương án | Lý do không đề xuất |
|---|---|
| Giữ static prototype và thêm backend rời không có framework | Khó đạt auth/session/accessibility/SSR và tăng nợ tích hợp |
| Python cho toàn bộ web/API | Tách khỏi TypeScript frontend và kinh nghiệm Next/GDevelop web trong repo |
| Microservices cho từng domain ngay | Quá sớm, tăng vận hành/transaction phức tạp khi chưa có tải |
| Dùng FastChat/Gradio | Không phù hợp brand, auth, accessibility và ledger production |
