# P01 Traceability Matrix

> **Artifact:** P01-TRACE<br>
> **Trạng thái:** APPROVED tại P01 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Mục đích:** nối tính năng Gate 0 (`GON-Fxx`) → requirement P01 (`REQ-*`) → user story (`US-*`) → BDD → gate triển khai. Khi P02/P03/P04 bắt đầu, các cột màn hình/API/schema/test/PR sẽ được bổ sung thay vì tạo ID mới tùy tiện.

## 1. Ma trận chính

| Gate 0 Feature | P01 Requirements | Stories chính | BDD chính | MoSCoW / Slice | Gate chốt tiếp |
|---|---|---|---|---|---|
| GON-F01 — 18+, Google, consent | REQ-ID-001…006 | US-101…105 | BDD-01, BDD-17 | Must / VS1 | P02 flow, P03 auth, P05 legal review |
| GON-F02 — Universal Input | REQ-INP-001…008 | US-201…205 | BDD-02, BDD-03 | Must / VS1 | P02 composer states, P03 ingestion contracts |
| GON-F03 — Semantic Search 768D | REQ-SCH-001…004 | US-301 | BDD-04…06, BDD-17 | Must / VS1 | P03 embedding/vector ADR và eval set |
| GON-F04 — Brew Your Topic | REQ-BRW-001…007 | US-302…305 | BDD-05…08, BDD-18, BDD-22 | Must / VS1 | P03 job/ADK contracts, P05 AI eval |
| GON-F05 — Interactive module blocks | REQ-BRW-004…006, REQ-LRN-001 | US-304, US-502 | BDD-08, BDD-13 | Must / VS1 | P02 player UX, P03 Canonical Module Graph |
| GON-F06 — Arena vote | REQ-ARN-001…004 | US-403 | BDD-11 | Must / VS2 | P02 Arena UX, P03 vote ledger |
| GON-F07 — Pairwise ranking | REQ-RNK-001…002 | US-402, US-405 | BDD-10…11 | Must personal, Should public / VS2 | P03 rating model và confidence rules |
| GON-F08 — Multi-provider outputs | REQ-OUT-001…005, REQ-ARN-001 | US-401…403 | BDD-09…11 | Must ở mức output competition / VS2 | P03 provider contracts, P05 cost/quality eval |
| GON-F09 — 10+ next outputs | REQ-OUT-001…005 | US-401…404 | BDD-09…10 | Must / VS2, bản cơ bản có thể xuất hiện ở VS1 | P02 grouping UX, P03 candidate schema |
| GON-F10 — Community trend | REQ-RNK-003 | US-801 | BDD-19 | Should / VS5 | P03 event/features, P05 anti-manipulation |
| GON-F11 — Personal footprint | REQ-PRV-001…004, REQ-RNK-001 | US-103, US-402, US-404 | BDD-10, BDD-17 | Must controls / VS1-VS2 | P02 Personalization Center, P03 consent/data model |
| GON-F12 — Journey Fork | REQ-JRN-001…006 | US-501, US-505…506 | BDD-12, BDD-17 | Must Fork / VS1; Could diff-merge / VS3 | P02 journey UX, P03 graph/version model |
| GON-F13 — Lifelong XP/Level | REQ-XP-001…006 | US-601…603 | BDD-15 | Must / VS1 | P03 XP Ledger, P05 anti-cheat |
| GON-F14 — Proof Vault | REQ-PRF-001…005 | US-604…605 | BDD-14, BDD-16…17 | Must / VS1 | P03 evidence model, P05 verifier policy |
| GON-F15 — Creator attribution/path | REQ-CRT-001…004 | US-802…805 | BDD-12, BDD-18…19 | Must attribution; public path Later | P03 attribution graph; VS5/VS6 và legal |
| GON-F16 — Assessment integrity | REQ-LRN-001…007 | US-502…504 | BDD-13…15 | Must / VS1 | P02 assessment UX, P03 rubric/event schemas |
| GON-F17 — Multi-format render | REQ-RND-001…002 | US-701…702 | BDD-20 | Must web, Should briefs | P03 renderer contracts |
| GON-F18 — GDevelop game/export | REQ-GDV-001…003 | US-703…704 | BDD-20 | Should template / VS4 | P03 GDevelop spike/ADR |
| GON-F19 — Async/realtime jobs | REQ-BRW-002…003, REQ-OPS-002 | US-303, US-903 | BDD-06…07, BDD-22 | Must / VS1 | P03 queue/job ADR |
| GON-F20 — Moderation/provenance | REQ-SAF-001…004, REQ-BRW-005…007 | US-305, US-901…904 | BDD-03, BDD-08, BDD-18, BDD-21 | Must / VS1 | P03 lifecycle, P05 policy/eval |
| GON-F21 — Analytics/observability/AI eval | REQ-OPS-001…003 | US-903 | BDD-19, BDD-22 | Must foundations | P03 event taxonomy, P05 dashboards/evals |
| GON-F22 — CI/CD/deployment | Không có product REQ riêng trong PRD | Không áp dụng | Không áp dụng | Process requirement | P03/P05/P06; Go-Live riêng của PO |

## 2. Truy vết ngược về nguồn yêu cầu gốc

| Nguồn gốc | Phần được P01 chính thức hóa |
|---|---|
| `GON-ORG-PRODUCT-SPEC-18PLUS.md` | Sáu bước Sign in → Search → Explore/Brew → Choose/Fork → Learn → Grow; thuật ngữ Source Artifact, Boss Proof, Proof Vault |
| `GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md` | 10+ outputs, Learning Modes, trend theo học thật, Arena, Fork, creator path, chống copy-paste |
| `GON-WHITEPAPER.md` | `gon-level-v1`, Lifelong XP, Era, tách Lifetime Earned khỏi spendable balance, chưa phát hành token |
| Gate 0 Charter | FastChat/WSIC/GDevelop allocation, selective reuse, GON-owned components và deferred stack decisions |
| Prototype `apps/gon-web` | Bằng chứng khả thi UX/logic cho demo embedding/search/Brew/level; không phải production implementation |

## 3. Những yêu cầu dài hạn được chủ động hoãn

| Năng lực dài hạn | Lý do hoãn | Điều kiện mở lại |
|---|---|---|
| Public Success Path/social graph | Cần privacy, moderation, legal và anti-fraud | Sau VS5 + PO duyệt phase riêng |
| External TikTok/Facebook/YouTube trend ingestion | Điều khoản/API và chất lượng tín hiệu chưa được Audit | P03/P05 Audit nguồn hợp pháp |
| Diff/merge Journey đầy đủ | Độ phức tạp UX/model cao | VS3 sau khi Fork cơ bản được dùng thật |
| GDevelop exporter tổng quát | Chưa có spike tích hợp | P03 spike + VS4 template |
| Issuer-verified/Anchored proof at scale | Chưa có verifier/issuer integrations | Từng loại proof có quy trình được duyệt |
| Token/tiền/marketplace | Pháp lý, thuế/KYC khi áp dụng, gian lận và kỳ vọng tài chính | Quyết định và rà soát độc lập ngoài Private Alpha |
| ML recommender | Chưa có dữ liệu học thật đủ và baseline rules | Sau khi event/learning-gain data đủ chất lượng |

## 4. Quy tắc duy trì truy vết

- Không đổi nghĩa một `REQ-*` đã được duyệt mà không ghi amendment.
- Story mới phải trỏ về ít nhất một `REQ-*` hoặc ghi rõ là process/operations work.
- BDD mới phải ghi Requirement IDs ở đầu scenario group.
- P02 đã bổ sung Screen/Component IDs vào [`P02-TRACEABILITY-MATRIX.md`](../03-ux/P02-TRACEABILITY-MATRIX.md); P03 nối tiếp bằng [`P03-TRACEABILITY-MATRIX.md`](../04-contracts/P03-TRACEABILITY-MATRIX.md) mà không đổi ID đã duyệt.
- P03 bổ sung API operation, event, table/schema và ADR tương ứng.
- P04 bổ sung PR/files/tests; một requirement chỉ được đánh dấu implemented khi BDD/evidence tương ứng đạt.
- Requirement bị hoãn/bác vẫn giữ dòng với trạng thái `Deferred`/`Rejected`, không xóa lịch sử.
