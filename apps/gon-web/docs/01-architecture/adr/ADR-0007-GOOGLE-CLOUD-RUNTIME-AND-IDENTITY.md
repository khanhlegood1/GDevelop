# ADR-0007 — Google identity và runtime Google Cloud-first

## Trạng thái

**Proposed — IN REVIEW tại P03 ngày 22/10/2026.** Chỉ chuyển Accepted khi PO duyệt P03. Region, tier và ngân sách thật vẫn cần quyết định trước P06.

## Bối cảnh

PO đã chốt Google sign-in, Gemini và Google ADK. Hệ thống cần session có thể thu hồi, async jobs, object storage và secret management. WSIC dùng Better Auth/PostgreSQL, QStash và các service rời; snapshot Audit của WSIC có dependency/trust-boundary debt không nên sao chép.

## Quyết định đề xuất

- Google OAuth/OIDC qua Auth.js; database sessions trong PostgreSQL.
- Cloud Run cho web/API, TypeScript workers và Python ADK service.
- Cloud SQL for PostgreSQL cho canonical data.
- Cloud Storage cho artifact/proof/export qua signed URL.
- Cloud Tasks cho delivery; PostgreSQL jobs/outbox là nguồn sự thật.
- Secret Manager cho provider keys và service secrets.
- Mỗi service dùng service account riêng theo least privilege.

## Hệ quả

- Identity/AI/runtime cùng hệ sinh thái Google giúp giảm tích hợp.
- Vẫn giữ container/SQL/object-key boundaries để có đường thoát vendor ở mức khả thi.
- P06 phải chốt region, networking, backup, billing alerts, môi trường dev/staging/production và runbooks.
- Không dùng anonymous auth trong Private Alpha; invite + 18+ attestation là domain policy phía server.

## Phương án đã cân nhắc

| Phương án | Lý do không đề xuất làm baseline |
|---|---|
| Vercel + Neon/Supabase + Upstash | Khả thi nhưng chia nhiều vendor hơn trong khi AI/ADK ở Google |
| Better Auth như WSIC snapshot | Cần baseline version/Audit mới; không có lý do vượt Auth.js đủ mạnh ở P03 |
| Tự viết OAuth/session | Rủi ro bảo mật không cần thiết |
| Firebase làm canonical backend | Khác mô hình relational/ledger đã chọn |
