# P02 Traceability Matrix

> **Trạng thái:** APPROVED tại P02 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Mục đích:** Nối tiếp [P01 Traceability Matrix](../02-requirements/P01-TRACEABILITY-MATRIX.md) bằng Screen/Component IDs và bằng chứng prototype, đồng thời nêu rõ phần chuyển sang P03.

## 1. Cách đọc mức bao phủ

| Mức | Nghĩa |
|---|---|
| **Prototype** | Có bề mặt click được trong `apps/gon-web/ux-prototype` |
| **Spec only** | Đã chốt hành vi UX trong tài liệu nhưng chưa dựng màn hình riêng |
| **P03 contract** | UX cần API/data/state mà P02 không được tự chốt |
| **Later slice** | P01 đã xếp sau VS1/VS2; P02 chỉ giữ chỗ/mô hình mở rộng |

Một dòng có “Prototype” **không** nghĩa là requirement đã implemented ở production. Nó chỉ nghĩa là UX có bằng chứng để PO duyệt.

## 2. Trace từ requirement sang UX

| Gate 0 / Requirement | Stories / BDD | Screen | Components | Mức P02 | Bằng chứng / ghi chú | Chuyển sang P03 |
|---|---|---|---|---|---|---|
| GON-F01 · `REQ-ID-001…006` | US-101…105 · BDD-01, 17 | `SCR-01`, `SCR-12`, `SCR-17` | `CMP-03`, `CMP-04`, `CMP-31` | Prototype + Spec | 18+ validation, under-18 block, consent footprint, Google mock | Auth provider, invite, attestation/terms version, session recovery |
| GON-F02 · `REQ-INP-001…008` | US-201…205 · BDD-02, 03 | `SCR-02`, `SCR-13` | `CMP-05`, `CMP-06`, `CMP-07` | Prototype | Text/URL + artifact mẫu, metadata-only/partial labels | Upload/storage, extraction, MIME/url safety, rights/hash |
| GON-F03 · `REQ-SCH-001…004` | US-301 · BDD-04…06, 17 | `SCR-03` | `CMP-08`, `CMP-09` | Prototype | Found/Related/Missing/Clarify/Blocked chuyển được trên UI | 768D embedding, verdict thresholds + matched/missing concepts |
| GON-F04/F19 · `REQ-BRW-001…007` | US-302…305 · BDD-05…08, 18, 22 | `SCR-04`, `SCR-14` | `CMP-10`, `CMP-11` | Prototype + Spec | Confirm trước Brew, 5-step progress, ready private draft | Job idempotency/queue/ADK stages, quota, failed/needs-input |
| GON-F05/F16 · `REQ-LRN-001…007` | US-502…504 · BDD-13…15 | `SCR-08`, `SCR-09` | `CMP-20`…`CMP-24`, `CMP-26` | Prototype | Concept citation labels, Retrieval khóa đáp án, Transfer, Boss rubric | Canonical Module Graph, attempts, assessment/integrity |
| GON-F09/F08 · `REQ-OUT-001…005` | US-401…404 · BDD-09…11 | `SCR-05` | `CMP-12`…`CMP-15` | Prototype | Đúng 10 mock outputs, 5 modes, clusters/formats/artifacts | Candidate generation/set version, diversity/eligibility |
| GON-F07/F11 · `REQ-RNK-001…002`, `REQ-PRV-001…004` | US-103, 402, 404 · BDD-10, 17 | `SCR-05`, `SCR-12` | `CMP-04`, `CMP-12`, `CMP-29` | Prototype | Mode thay top; tắt footprint đổi sang quality basis | Ranking features/formula, consent enforcement, retention/delete |
| GON-F06 · `REQ-ARN-001…004` | US-403 · BDD-11 | `SCR-06` | `CMP-15`…`CMP-17` | Prototype | A/B ẩn danh, 5 vote, one-time, reveal, merge/both-bad | Pairing, vote ledger, anti-abuse, Elo/BT/personal rank |
| GON-F10 · `REQ-RNK-003` | US-801 · BDD-19 | `SCR-05`, `SCR-10` | `CMP-12` | Spec only / Later VS5 | Copy dùng “tín hiệu quan tâm nội bộ”; không có feed trend ở home | Internal trend windows, consent/sampling, anti-manipulation |
| GON-F12 · `REQ-JRN-001…006` | US-501, 505…506 · BDD-12, 17 | `SCR-07`, `SCR-08`, `SCR-10` | `CMP-18`, `CMP-19`, `CMP-27` | Prototype rút gọn | “Tạo hành trình của tôi”, upstream/private, timeline | Fork graph/version, duplicate branch, commits, diff/merge sau |
| GON-F13 · `REQ-XP-001…006` | US-601…603 · BDD-15 | `SCR-08`, `SCR-09`, `SCR-10`, header | `CMP-25` | Prototype hiển thị | Lv numeric uncapped; XP mock và thông điệp server-validated | XP events/ledger, số XP, anti-farm, revocation |
| GON-F14 · `REQ-PRF-001…005` | US-604…605 · BDD-14, 16, 17 | `SCR-09`, `SCR-10`, `SCR-11` | `CMP-23`, `CMP-28` | Prototype | Self/Source/System labels; Boss proof có điều kiện | Proof model/revocation, artifact storage, verifier rules |
| GON-F15 · `REQ-CRT-001…004` | US-802…805 · BDD-12, 18, 19 | `SCR-07`, `SCR-11`, tương lai Creator surface | `CMP-19`, `CMP-28` | Spec attribution; public path Later | Attribution giữ ở branch; không hứa KOL/thu nhập | Attribution graph, internal reuse/impact, legal/public phase riêng |
| GON-F17 · `REQ-RND-001…002` | US-701…702 · BDD-20 | `SCR-05`, `SCR-08` | `CMP-13`, `CMP-20` | Prototype taxonomy | Output cards có game/video/web/infographic/image/easy task/teach-back | Canonical renderers, briefs, fallback/accessibility |
| GON-F18 · `REQ-GDV-001…003` | US-703…704 · BDD-20 | `SCR-05`, `SCR-08` | `CMP-13`, `CMP-20` | Spec only / VS4 | Một candidate là GDevelop template; spec yêu cầu controls/fallback | GDevelop spike/bridge/telemetry/export ADR |
| GON-F20 · `REQ-SAF-001…004` | US-305, 901…904 · BDD-03, 08, 18, 21 | `SCR-02`, `SCR-03`, `SCR-08`, `SCR-15`, `SCR-16` | `CMP-07`, `CMP-09`, `CMP-30`…`CMP-32` | Prototype Report dialog + Spec | Blocked state, report theo version, reviewer IA | Policy lifecycle, moderation service, audit/appeal |
| GON-F21 · `REQ-OPS-001…003` | US-903 · BDD-19, 22 | Mọi màn | `CMP-31` và live/status regions | Spec only | P02 xác định user-visible state và moment cần telemetry | Event taxonomy, AI eval, dashboards, kill switches |
| GON-F22 · Process | Không có product REQ | Không áp dụng | Không áp dụng | Ngoài P02 | Không tạo UI deployment trong product | P03/P05/P06 + Go-Live PO |

## 3. Trace tới từng BDD group

| BDD | Chủ đề | Screen bao phủ trực tiếp | Prototype evidence |
|---|---|---|---|
| BDD-01 | 18+/Google/consent | `SCR-01` | Checkbox validation + under-18 blocked |
| BDD-02 | Universal input/artifacts | `SCR-02` | Text/URL và nút thêm artifact mẫu |
| BDD-03 | Artifact partial/metadata/block | `SCR-02`, `SCR-03` | Nhãn Metadata-only; Blocked verdict |
| BDD-04 | Search Found | `SCR-03`, `SCR-05` | State switch Found |
| BDD-05 | Related/Missing → Brew offer | `SCR-03`, `SCR-04` | Related mặc định + Brew panel |
| BDD-06 | Brew idempotency/progress | `SCR-04` | Start bị disable khi đang chạy + progress |
| BDD-07 | Brew failure/needs input | `SCR-03`, `SCR-04` | Spec/copy; prototype chưa giả lập terminal failure |
| BDD-08 | AI draft/private/citations | `SCR-04`, `SCR-05`, `SCR-08` | Badge AI draft/private/citation mẫu |
| BDD-09 | 10+ outputs và clusters | `SCR-05` | 10 card + filter |
| BDD-10 | Ranking theo mode/footprint | `SCR-05`, `SCR-12` | Test top thay đổi theo mode/tắt personalization |
| BDD-11 | Arena blind vote | `SCR-06` | Vote one-time và reveal |
| BDD-12 | Fork/lineage/attribution | `SCR-07`, `SCR-10` | Branch header/upstream/timeline |
| BDD-13 | Học tương tác/mastery gating | `SCR-08` | Concept/Retrieval/Transfer/Boss stepper |
| BDD-14 | Boss Proof | `SCR-09` | Rubric form và success/needs-revision |
| BDD-15 | XP/Level uncapped | Header, `SCR-10` | Test Lv.0/12/35/100 |
| BDD-16 | Proof Vault/verification | `SCR-11` | Ba nhãn Alpha |
| BDD-17 | Privacy/footprint controls | `SCR-01`, `SCR-05`, `SCR-12` | Consent + toggles đồng bộ |
| BDD-18 | Publish/review không tự động | `SCR-04`, `SCR-16` | AI draft private; Review Queue spec |
| BDD-19 | Trend/creator guardrails | `SCR-05`, `SCR-10` | Không có trend feed/FOMO; spec copy nội bộ |
| BDD-20 | Multi-format/GDevelop | `SCR-05`, `SCR-08` | Candidate formats; game fallback spec |
| BDD-21 | Moderation/report | `SCR-15`, `SCR-16`, dialog | Report dialog mock |
| BDD-22 | Ops/kill switch/failure recovery | Mọi màn | State taxonomy; backend thuộc P03/P05 |

## 4. Bằng chứng kiểm thử prototype

`apps/gon-web/ux-prototype/tests/prototype.test.js` tự động kiểm:

1. `SCR-01`…`SCR-12` xuất hiện trong HTML.
2. Có đúng 10 candidates duy nhất và mỗi candidate có điểm cho năm mode.
3. Top candidate khác nhau giữa Deep/Create/Fast.
4. Tắt personalization chuyển cơ sở xếp hạng sang quality chung.
5. Ẩn candidate không phá source list.
6. Có năm search verdict.
7. Retrieval mock cần hai nhóm yếu tố.
8. Lifetime level uncapped tại Lv.35 và Lv.100.
9. Skip link, live region và các nhãn “mock/không xác minh/private” tồn tại.

Các test này bảo vệ UX contract của prototype, không chứng minh auth, AI, vector search hoặc server ledger.

## 5. Câu hỏi bắt buộc cho P03

| ID câu hỏi | Screen liên quan | P03 phải trả lời |
|---|---|---|
| `Q-P03-01` | `SCR-01` | Invite/auth/attestation được lưu và khôi phục deep link ra sao? |
| `Q-P03-02` | `SCR-02` | Giới hạn artifact, extraction states và rights attestation chính xác là gì? |
| `Q-P03-03` | `SCR-03` | Search verdict dùng tín hiệu nào ngoài vector score; matched/missing được trả ra sao? |
| `Q-P03-04` | `SCR-04` | Brew job idempotency, retry, quota/cost và step taxonomy là gì? |
| `Q-P03-05` | `SCR-05` | Khi không đủ 10 candidates khả thi, hệ thống bổ sung/giải thích thế nào? |
| `Q-P03-06` | `SCR-05`/`12` | Ranking dùng signal classes nào, tắt consent có hiệu lực ở đâu, delete xử lý ra sao? |
| `Q-P03-07` | `SCR-06` | Arena pair được tạo, vote sửa/khóa và chống brigade thế nào? |
| `Q-P03-08` | `SCR-07`/`08` | Fork/version/commit và autosave conflict được model ra sao? |
| `Q-P03-09` | `SCR-08`/`09` | Rubric/attempt/AI disclosure/chống gian lận và human review contract là gì? |
| `Q-P03-10` | `SCR-09`/`10` | XP event nào hợp lệ, số XP bao nhiêu, khi nào thu hồi? |
| `Q-P03-11` | `SCR-11` | Proof storage/revocation và từng verification evidence yêu cầu gì? |
| `Q-P03-12` | `SCR-08` | GDevelop/game event nào mới được công nhận là học thật? |
| `Q-P03-13` | `SCR-15`/`16` | Report/moderation lifecycle, SLA nội bộ và audit/appeal vận hành ra sao? |
| `Q-P03-14` | Mọi màn | Error code/offline/session/permission nào map sang state P02? |

## 6. Những khoảng trống đã biết, không bị che giấu

- `SCR-13`…`SCR-17` chưa có section click riêng; wireframe đã đặc tả để P03 không phải phát minh lại.
- Prototype chưa giả lập Brew terminal failure, offline sync, session expiry, quota hết và permission deep link.
- Prototype dùng XP/rubric điểm thưởng mô phỏng; số liệu không được mang sang production.
- Trend internal chưa có dữ liệu mẫu theo cửa sổ thời gian vì P01 xếp ở VS5.
- Game candidate chưa chạy GDevelop runtime; P02 chỉ chốt vị trí của game trong player và fallback.
- Chưa có usability test với người dùng thật; xem [Usability Review Plan](USABILITY-REVIEW-PLAN.md).
