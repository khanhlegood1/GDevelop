# P03 — API Contract & Data Model First

> **Trạng thái:** **APPROVED — Product Owner đã duyệt ngày 22/10/2026**<br>
> **Commit được duyệt:** `b4e6ec2e91f83a48ddb139e8981928eb99d3d8bb`<br>
> **Ngày trình duyệt:** 22/10/2026<br>
> **Điều kiện vào gate:** P02 được PO duyệt tại commit `33c2641e8710a3792150827d93500f7a1b930315`, bao gồm toàn bộ `D-P02-01`…`D-P02-12`<br>
> **Phạm vi contract:** VS1 và VS2 đầy đủ; điểm mở rộng có kỷ luật cho VS3–VS5<br>
> **Gate tiếp theo:** P04 đang triển khai VS1; P05 NFR review và P06 deployment chưa bắt đầu

## 1. P03 chốt điều gì?

P03 biến PRD và UX đã duyệt thành hợp đồng kỹ thuật đủ rõ để P04 xây lát cắt đầu tiên mà không phải đoán:

```text
Identity/Consent
  → Project + Source Artifacts
  → Extraction + Embedding 768D
  → SearchAttempt
  → BrewJob → ADK → Canonical Module Graph
  → CandidateSet + RankingSnapshot
  → ArenaMatch/Vote
  → JourneyBranch + Attempts
  → Mastery + XP Ledger + Proof
  → Privacy/Report/Audit/Notifications
```

Các contract trong gói này là **nguồn sự thật cho P04**. Tên bảng vật lý có thể được ORM/migration ánh xạ lại, nhưng định danh, trạng thái máy, quyền sở hữu, bất biến và hành vi API không được thay đổi âm thầm.

## 2. Artifact đã được phê duyệt

| # | Artifact | Nội dung quyết định |
|---|---|---|
| 1 | [Domain Model & ERD](DOMAIN-MODEL-AND-ERD.md) | Aggregate/entity, quan hệ, khóa, index và bất biến dữ liệu |
| 2 | [API Contract](API-CONTRACT.md) | Resource, operation, auth, lỗi, idempotency, pagination và aggregate cho từng màn P02 |
| 3 | [OpenAPI 3.1](openapi.json) | Contract máy đọc được cho HTTP API công khai `/v1` |
| 4 | [Canonical Module Graph](CANONICAL-MODULE-GRAPH.md) + [JSON Schema](schemas/canonical-module-graph.schema.json) | Định dạng module bất biến dùng chung cho web/renderer/GDevelop |
| 5 | [Search, Brew & ADK Contracts](SEARCH-BREW-AND-ADK-CONTRACTS.md) | Embedding, hybrid search, candidate/ranking, ADK stages và cổng citation/safety |
| 6 | [State Machines & Business Rules](STATE-MACHINES-AND-BUSINESS-RULES.md) | Vòng đời artifact/search/Brew/Arena/Journey/assessment/XP/Proof/report |
| 7 | [Events, Jobs & Integrations](EVENTS-JOBS-AND-INTEGRATIONS.md) | Event envelope, outbox, queue, notification, game telemetry và internal service contracts |
| 8 | [Identity, Authorization, Privacy & Retention](IDENTITY-AUTHORIZATION-PRIVACY-AND-RETENTION.md) | Google identity, 18+, role/object authorization, consent, retention/deletion/audit |
| 9 | [Stack Evaluation & Spike Plan](STACK-EVALUATION-AND-SPIKE-PLAN.md) | So sánh ứng viên, baseline đề xuất, giới hạn chi phí mặc định và các spike trước P04/VS4 |
| 10 | [Migration & Backward Compatibility](MIGRATION-AND-BACKWARD-COMPATIBILITY.md) | Expand–migrate–contract, hỗ trợ version cũ, embedding cutover, rollback và dữ liệu prototype |
| 11 | [P03 Traceability Matrix](P03-TRACEABILITY-MATRIX.md) | `REQ/US/BDD/SCR/CMP → API operation → entity/schema/event → P04 slice → P05 evidence` |
| 12 | [Examples](examples/) + [Mock API fixture](fixtures/mock-api-responses.json) | Dữ liệu mẫu để frontend/contract test chạy độc lập |
| 13 | [Internal schemas](schemas/): [ADK](schemas/agent-contracts.schema.json), [domain event](schemas/domain-event-envelope.schema.json), [job command](schemas/job-command.schema.json), [game events](schemas/game-event.schema.json); [contract validator](tests/validate_contracts.py) | Ranh giới nội bộ không phụ thuộc diễn giải bằng lời; examples phải validate được bằng máy |

### ADR đi kèm — đã được PO duyệt cùng P03

- [ADR-0005 — Modular monolith TypeScript cho web/API, Python ADK tách riêng](../01-architecture/adr/ADR-0005-TYPESCRIPT-MODULAR-MONOLITH-AND-PYTHON-ADK.md)
- [ADR-0006 — PostgreSQL + pgvector là canonical datastore](../01-architecture/adr/ADR-0006-POSTGRESQL-PGVECTOR-CANONICAL-DATASTORE.md)
- [ADR-0007 — Google identity, Cloud Run, Cloud Tasks và object storage](../01-architecture/adr/ADR-0007-GOOGLE-CLOUD-RUNTIME-AND-IDENTITY.md)
- [ADR-0008 — GDevelop template-first integration](../01-architecture/adr/ADR-0008-GDEVELOP-TEMPLATE-FIRST-INTEGRATION.md)

ADR-0004 vẫn là quyết định đang hiệu lực cho tới khi P03 được duyệt. Nếu PO duyệt P03, ADR-0005…0008 chuyển sang Accepted và ADR-0004 được đánh dấu Superseded trong thay đổi ghi phê duyệt.

## 3. Baseline kỹ thuật được đề xuất

| Lớp | Baseline P03 đề xuất | Ranh giới tránh khóa cứng |
|---|---|---|
| Web/API | Next.js + TypeScript dạng modular monolith tiến hóa từ `apps/gon-web` | OpenAPI là contract; không để client gọi database/provider trực tiếp |
| Canonical data | PostgreSQL + `pgvector`, JSONB cho graph snapshot, full-text/trigram cho lexical | Repository/adapter che chi tiết truy vấn |
| Identity | Google OAuth/OIDC qua Auth.js, database session trong PostgreSQL | Domain user ID tách khỏi Google subject |
| Runtime | Google Cloud Run cho web/API và workers | Container/portable service boundaries |
| Async | Job record + transactional outbox trong PostgreSQL; Cloud Tasks làm delivery | Queue vendor không phải nguồn sự thật của job |
| Object storage | Google Cloud Storage qua signed URL và StorageAdapter | Database chỉ giữ object key/metadata |
| AI | Gemini embeddings/generation; Google ADK Python service không ghi DB trực tiếp | Model/prompt phiên bản hóa và có eval/kill switch |
| Game | GDevelop template-first ở VS4, cấu hình từ Module Graph | Không sinh arbitrary game code ở Alpha |

Đây là **đề xuất P03**, không phải tuyên bố hạ tầng đã được dựng hoặc chi phí đã được cam kết.

## 4. Nguyên tắc contract bất biến

1. **Server là nơi quyết định** quyền, trạng thái, vote hợp lệ, mastery, XP và mức proof.
2. **Private-by-default trong schema:** mọi dữ liệu người dùng có owner/visibility rõ; không suy ra quyền ở client.
3. **Version bất biến:** ModuleVersion, OutputCandidate, RankingSnapshot, Rubric và ProofVerification không bị sửa ngược lịch sử.
4. **Async có danh tính:** ingestion, embedding, Brew, assessment và render đều là job truy vết được, có idempotency và trạng thái cuối.
5. **Agent không có quyền publish/ghi DB tùy ý:** API/worker validate schema, policy, provenance và citation trước khi ghi.
6. **Không lộ vector/footprint thô:** client nhận kết quả và explanation codes, không nhận embedding hoặc toàn bộ tín hiệu cá nhân.
7. **XP là ledger, không phải counter client sửa được:** Lifetime XP là projection từ entries đã posted/trừ reversal.
8. **Xóa là workflow, không phải toggle giả:** trạng thái yêu cầu, phạm vi, tombstone và thời hạn backup được ghi rõ.
9. **Lỗi có mã ổn định:** mọi error map được sang trạng thái P02 và có hành động tiếp theo an toàn.
10. **Contract mở rộng cộng thêm:** `/v1` ưu tiên additive change; breaking change phải có version/ADR và kế hoạch migration.

## 5. Quyết định P03 trình PO duyệt

| ID | Quyết định đề xuất | Hệ quả chính |
|---|---|---|
| `D-P03-01` | HTTP JSON resource API `/v1` theo OpenAPI 3.1, kèm aggregate read model cho các màn P02 | Frontend không phải tự ghép quyền/trạng thái từ nhiều entity |
| `D-P03-02` | Next.js + TypeScript modular monolith cho web/API; Python Google ADK là service riêng | Một codebase sản phẩm chính, ranh giới AI độc lập |
| `D-P03-03` | PostgreSQL + pgvector/JSONB/FTS là canonical datastore; không dùng Convex làm production baseline | Mạnh về transaction/ledger/version/audit và khả năng xuất dữ liệu |
| `D-P03-04` | Google OIDC qua Auth.js database session; 18+ self-attestation và consent là domain record riêng | Không nhầm đăng nhập Google với xác minh tuổi |
| `D-P03-05` | Google Cloud-first: Cloud Run, Cloud SQL, Cloud Storage, Cloud Tasks, Secret Manager | Gần Gemini/ADK; region và ngân sách thật vẫn phải chốt trước P06 |
| `D-P03-06` | Durable jobs + transactional outbox; queue chỉ giao việc; ADK stateless, không direct DB write/publish | Retry không tạo module/XP/vote trùng và giảm blast radius prompt injection |
| `D-P03-07` | `search-policy-v0`: cosine trên vector 768D đã chuẩn hóa + lexical + concept coverage; ngưỡng seed phải qua labeled eval trước release | Có baseline kiểm thử được mà không giả vờ ngưỡng demo là chuẩn production |
| `D-P03-08` | `gon.module-graph/1.0`; ModuleVersion bất biến; AI module bắt đầu `draft_private` | Branch không bị thay đổi âm thầm khi upstream có version mới |
| `D-P03-09` | `ranking-rules-v1` giải thích theo nhóm tín hiệu; nếu không đủ 10 candidate chất lượng thì trả ít hơn kèm reason codes; Arena vote không sửa sau khi ghi trong Alpha | Không bịa candidate trùng và không biến vote thành fact-check |
| `D-P03-10` | Journey Fork giữ snapshot của upstream/attribution; một branch active được trả lại mặc định, tạo branch mới phải là lựa chọn rõ | Người học không bị tạo nhiều branch trùng ngoài ý muốn |
| `D-P03-11` | `xp-rules-v1`: Retrieval 10, Transfer 15, Boss/Create 35, Teach-back 20, Delayed Review 5; chỉ lần đạt đầu tiên của mỗi rubric scope | Có số XP kiểm chứng được và chống farm bằng uniqueness |
| `D-P03-12` | Giới hạn artifact/quota/retention mặc định trong tài liệu Identity/Privacy và Stack Evaluation | Có trần chi phí/lạm dụng ngay từ P04; PO có thể đổi từng con số |
| `D-P03-13` | GDevelop ở VS4 đi theo template-first; game launch token xác thực event batch có sequence/idempotency; client không tự cấp XP/Proof | Chứng minh game slice an toàn trước khi hứa exporter tổng quát |
| `D-P03-14` | API/schema dùng additive evolution và expand–migrate–contract; fixtures là contract test bắt buộc của P04 | Giảm rủi ro phá frontend/branch/module cũ khi hệ thống tiến hóa |

PO có thể **duyệt tất cả mặc định P03** hoặc yêu cầu sửa theo từng mã `D-P03-*`.

## 6. Cách P03 trả lời 14 câu hỏi từ P02

| Câu hỏi | Nơi trả lời |
|---|---|
| Q-P03-01 Identity/deep link | Identity/Authorization + API bootstrap |
| Q-P03-02 Artifact limits/extraction | Domain Model + API + Stack defaults |
| Q-P03-03 Search verdict | Search/Brew/ADK + State Machines |
| Q-P03-04 Brew job/quota | Events/Jobs + Search/Brew/ADK |
| Q-P03-05 Không đủ 10 candidates | Search/Brew/ADK + API Output Explorer |
| Q-P03-06 Ranking/consent/delete | Search/Brew/ADK + Identity/Privacy |
| Q-P03-07 Arena/anti-abuse | API + State Machines |
| Q-P03-08 Fork/autosave | Domain Model + API Journey |
| Q-P03-09 Assessment/human review | State Machines + Search/Brew/ADK agent assessment |
| Q-P03-10 XP/reversal | State Machines & Business Rules |
| Q-P03-11 Proof verification | Domain Model + Identity/Privacy |
| Q-P03-12 GDevelop learning events | Events/Integrations + ADR-0008 |
| Q-P03-13 Moderation lifecycle | API Review + State Machines |
| Q-P03-14 Error/session/offline mapping | API Contract error taxonomy |

## 7. Phạm vi chưa khóa trong P03

- Model Gemini cụ thể cho từng agent ngoài embedding model; phải chọn bằng eval/cost tại P04.
- Region Google Cloud, ngân sách tháng, quota nhà cung cấp và billing alerts thật — trước P06.
- Research provider (Exa/Serper/Google Search grounding hoặc tương đương); chỉ được dùng khi điều khoản/chi phí được chốt.
- OCR/transcription provider cho từng loại artifact; P03 khóa trạng thái và fallback, không hứa mọi file/video được đọc sâu.
- Ngưỡng similarity production cuối cùng và trọng số ranking sau labeled eval/P05.
- Elo/Bradley–Terry production cho public/internal leaderboard; VS2 bắt đầu bằng personal ranking + snapshot nội bộ.
- Diff/merge Journey đầy đủ của VS3 và trend VS5.
- Exporter GDevelop tổng quát; VS4 chỉ template-first sau spike.
- Retention pháp lý cuối cùng, quy trình xác minh tuổi public launch và issuer integrations.

Các mục còn mở có chủ sở hữu/gate xử lý và không được biến thành cam kết trong UI P04 khi chưa có quyết định.

## 8. Bằng chứng kiểm chứng P03

Ngay trong gate này, nhóm thực hiện kiểm chứng ở mức contract:

- OpenAPI JSON parse được; mọi `$ref` nội bộ/relative resolve; operationId không trùng.
- Canonical Module Graph example validate theo JSON Schema.
- Agent/event/job/game examples validate theo schemas tương ứng.
- Mock fixture chứa các aggregate chính cho SCR-01…SCR-12.
- Kiểm tất cả BDD-01…22 có ít nhất một operation/entity/state tương ứng trong traceability.
- Chạy lại test prototype hiện có để bảo đảm việc ghi P02 APPROVED không phá UX evidence.

**Kết quả kiểm chứng ngày 22/10/2026:** contract validator đạt với 56 paths, 69 operations, 81 OpenAPI component schemas và 5 JSON Schema files; 6 mock aggregate đối chiếu được với OpenAPI; traceability phủ 81/81 `REQ-*`, BDD-01…22, SCR-01…17, Q-P03-01…14 và D-P03-01…14; 155 liên kết Markdown nội bộ đều resolve; test Node hiện có đạt 14/14.

Script kiểm chứng nằm tại [`tests/validate_contracts.py`](tests/validate_contracts.py). Script này **không** chứng minh backend, bảo mật hay chất lượng AI production; đó là việc của P04/P05.

## 9. Kết quả PO review

Ngày 22/10/2026, Product Owner đã **APPROVED P03 tại commit `b4e6ec2e91f83a48ddb139e8981928eb99d3d8bb`**, duyệt toàn bộ mặc định `D-P03-01`…`D-P03-14` và cho phép bắt đầu P04 với VS1.

- [x] Baseline Next.js/TypeScript + PostgreSQL/pgvector + Python ADK được chấp nhận.
- [x] Google Cloud-first không tạo cam kết chi phí/region ngoài ý muốn; phần phải chốt trước P06 đã rõ.
- [x] Domain model giữ đúng private-by-default, lineage, immutable versions và Audit.
- [x] API đủ cho SCR-01…SCR-17 và không buộc client suy ra quyền/trạng thái.
- [x] Search/Brew/ADK contract ngăn auto-publish, direct agent DB write và chi phí không kiểm soát.
- [x] Candidate/ranking/Arena không bịa 10 hướng và không biến vote thành xác minh sự thật.
- [x] XP values/rules, mastery mapping và reversal được chấp nhận.
- [x] Artifact limits, quota và retention/deletion mặc định được chấp nhận.
- [x] GDevelop template-first là mức tham vọng đúng cho VS4.
- [x] Toàn bộ mặc định `D-P03-01`…`D-P03-14` được duyệt.
- [x] P04 bắt đầu sau khi P03 được duyệt.

Trường “Điều kiện kèm theo” không ghi điều kiện cụ thể ngoài mẫu “<nếu có>”; do đó không có điều kiện phê duyệt bổ sung. Usability test với người dùng thật, các spike `S-P03-01`…`S-P03-04`, quota/chi phí thật, legal/privacy review và quyết định hạ tầng trước P06 vẫn là kiểm chứng còn mở trong các gate tiếp theo.

## 10. Bước tiếp theo

P04 được phép bắt đầu. Vertical slice đầu tiên là **VS1 — Curiosity to Proof**, triển khai theo thứ tự spike → UI → API → data/job → kết quả thật → test → telemetry → tài liệu trong [`../05-build/README.md`](../05-build/README.md). P05 và P06 chưa được bắt đầu.
