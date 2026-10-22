# P04 — Vertical Slice Build

> **Trạng thái:** **IN PROGRESS — VS1 local increment**<br>
> **Gate trước:** P03 được PO duyệt ngày 22/10/2026 tại commit `b4e6ec2`, gồm `D-P03-01`…`D-P03-14`<br>
> **Chưa bắt đầu:** P05 NFR/Security Review và P06 Cloud Deployment<br>
> **Quyết định phê duyệt P04:** chưa có. Tài liệu này là bằng chứng tiến độ, không tự đóng gate.

## 1. Kết quả VS1 đã có

Luồng Curiosity → Proof đã chạy trong môi trường local/test:

```text
Dev/Google identity boundary
  → invite + 18+ self-attestation + personalization consent
  → Learning Project (text, URL metadata, file/image trong giới hạn)
  → Search verdict
  → user-confirmed local Brew
  → Canonical Module Graph draft_private
  → Candidate Outputs + RankingSnapshot
  → private Journey Fork
  → Concept → Retrieval → Transfer → Boss Proof
  → server mastery + XP Ledger + Lifelong Level
  → private System-recorded Proof
```

### Web/API

- Next.js 16.4.2 + React 19.3.1 + TypeScript strict trong [`apps/gon-web/src`](../../src/README.md).
- VS1 UI cho onboarding, Universal Input, Workspace, Search verdict, Brew confirmation, Output Explorer, Journey Player, Lifelong Progress và Proof Vault.
- `/v1` dispatcher cho tập VS1: bootstrap/attestation/consent, project/workspace, artifact/upload/search/Brew/output/ranking, journey/player/attempt, progress/XP, proof và report.
- Auth.js Google configuration + PG adapter boundary; Dev Auth chỉ bật ngoài production.
- CSRF double-submit, same-origin check, Problem Details, request ID, body-size guard, If-Match và Idempotency-Key.
- Canonical Module Graph được AJV + semantic validator kiểm tra; player projection không lộ đáp án/scoring internals.
- Deterministic rubric/human-review safeguards; passed attempt mới ghi mastery/XP; duplicate passed work không cộng XP hai lần.
- Upload local kiểm tra SHA-256/size/magic bytes; URL có SSRF-oriented validation. URL/ảnh đang ở metadata-only, PDF chưa extraction.

### PostgreSQL

Đã có sáu SQL migrations, migration runner có checksum/advisory lock và executable S-P03-01 fixture tại [`apps/gon-web/db`](../../db/README.md):

1. extensions + Auth.js tables;
2. GON identity/invite/attestation/consent;
3. project/artifact/chunk/`vector(768)`;
4. job/search/module/candidate/ranking;
5. journey/attempt/mastery/XP/proof/moderation;
6. outbox/idempotency/AI run/quota/audit/flags.

**Giới hạn:** migration mới qua static checker; chưa chạy trên PostgreSQL thật và domain repository chưa wired. Runtime vẫn fail-fast với `GON_STORE=postgres`.

### Python ADK

Đã có service độc lập tại [`apps/gon-adk`](../../../gon-adk/README.md):

- FastAPI `/healthz`, `/v1/topic-check`, `/v1/generate-module`, `/v1/assess-attempt`;
- P03 JSON Schema được đọc trực tiếp từ contracts, cộng semantic validation cho graph/citation/assessment;
- local deterministic provider cho offline contract tests;
- ba Google ADK `LlmAgent` definitions không tools và không transfer;
- Google provider fail-closed khi thiếu model/credentials.

**Giới hạn:** chưa gọi Gemini thật, chưa nối TypeScript worker sang service và chưa có durable queue. S-P03-03 chưa passed.

## 2. Bằng chứng đã chạy ngày 22/10/2026

| Kiểm chứng | Kết quả | Ý nghĩa/không chứng minh |
|---|---|---|
| `npm test` trong `apps/gon-web` | **20/20 passed** | Domain service local, progression, artifact safety, graph projection và static migration contract |
| `npm run test:legacy` | **14/14 passed** | Hai prototype lịch sử không bị phá vỡ bởi increment production |
| `npm run typecheck` | Passed sau khi sửa Auth typing | TypeScript compile, không chứng minh runtime OAuth/DB |
| `npm run build` | Passed; `/`, `/v1`, Auth, CSRF, dev-session và local-upload routes được tạo | Next production build tĩnh/route compile |
| HTTP smoke bằng cookie + CSRF thật | Search `missing` → Brew `succeeded` → 6 candidates → Fork → Retrieval/Transfer/Boss → **60 XP** → `system_recorded` proof | Vertical slice qua HTTP bằng memory/local adapters |
| `npm run db:check` + `pglast` parser | Passed cho 6 files; parser PostgreSQL đọc được 157 statements | Static schema invariants + syntax only; không phải PostgreSQL execution |
| `spike:search -- --dry-run` | Script/query load được | S-P03-01 vẫn NOT RUN |
| `pytest` + editable install trong `apps/gon-adk` | 9/9 passed, 1 deprecation warning từ TestClient stack; package `gon-adk 0.1.0` cài/import được | Contract service local + Google agent definitions instantiate được |
| Uvicorn smoke | `/healthz` OK; `generate-module` trả concept/retrieval/transfer/boss_proof | HTTP boundary local deterministic, không phải Gemini output |
| P03 contract validator | Passed: 56 paths, 69 operations, 5 JSON schemas, examples/fixtures checked | Approval/P04 documentation edits không phá vỡ machine-readable contracts |
| Markdown internal-link audit | **178/178 links resolve** trong docs portal và README của web/db/ADK | Link integrity tại thời điểm ghi bằng chứng; phải chạy lại nếu tài liệu tiếp tục thay đổi |

## 3. Spike bắt buộc

| Spike | Trạng thái | Bằng chứng hiện có | Điều còn thiếu |
|---|---|---|---|
| S-P03-01 PostgreSQL hybrid search | **NOT RUN** | SQL schema `vector(768)`, HNSW/FTS/trigram và rollback fixture script | PostgreSQL/pgvector thật, migration execution, verdict fixture và latency trên dữ liệu đại diện |
| S-P03-02 Upload/extraction safety | **PARTIAL** | Local tests cho SSRF literals, SHA-256/size, magic bytes, text/image/PDF states | Signed Cloud Storage, malware scan, URL fetch/DNS rebinding defense, PDF parser/OCR/transcript |
| S-P03-03 ADK structured output | **PARTIAL** | Pytest 9/9: schema, citation outside bundle bị reject, ba ADK agents instantiate được, Google fail-closed | Gemini credentials/model thật, TS worker integration, repair/retry không tạo module thứ hai trên durable jobs |
| S-P03-04 Auth/session/deep link | **PARTIAL** | Dev session HTTP smoke, invite/attestation atomicity, safe `returnTo` unit coverage, Auth.js config compile | Google OAuth credentials thật, database session revoke, expired/revoked invite E2E, account linking |
| S-P03-05 GDevelop template | **NOT STARTED** | Không chặn VS1 theo P03 | Bắt buộc trước VS4 |

## 4. Những phần cố tình chưa được gọi là production

- `MemoryGonStore` mất dữ liệu khi process restart và không an toàn cho nhiều instance.
- Local hash embedding không phải Gemini embedding; local Brew/assessment không phải bằng chứng chất lượng AI.
- Search chỉ dùng deterministic local signals trên memory; ngưỡng `search-policy-v0` chưa hiệu chuẩn bằng corpus VI/EN có nhãn.
- Jobs được ghi nhưng xử lý đồng bộ; chưa có Cloud Tasks/outbox publisher/reconciler.
- Candidate generation hiện cho số thật kèm shortfall (ví dụ 6/10 trong smoke), không bịa đủ 10.
- Chưa có external web fetch, PDF extraction, OCR, transcript, malware scanning hoặc signed Cloud Storage.
- Chưa có profile/data-request flow đầy đủ, admin moderation UI/workflow, Arena, game, trend/creator analytics và VS2–VS5.
- Chưa có observability/alerts, rate-limit phân tán, quota persistence, backup/restore, load/security test của P05.
- Chưa deploy; mọi quyết định Cloud Run/Cloud SQL region/tier và Go-Live thuộc P06 sau P05.

## 5. Cách chạy local để PO rà soát

Web:

```bash
cd apps/gon-web
npm install
GON_STORE=memory GON_DEV_AUTH=1 \
GON_DEV_INVITE_CODE='local-review-code' \
AUTH_SECRET='local-review-secret' \
npm run dev -- --hostname 0.0.0.0 --port 3000
```

ADK:

```bash
cd apps/gon-adk
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
GON_ADK_PROVIDER=local GON_ADK_SERVICE_TOKEN='local-review-token' \
.venv/bin/python -m uvicorn gon_adk.main:app --host 0.0.0.0 --port 8000
```

PostgreSQL migration chỉ chạy khi có database kiểm thử riêng:

```bash
cd apps/gon-web
npm run db:check
DATABASE_URL='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' npm run spike:search
```

## 6. Việc tiếp theo trong P04

1. Refactor domain service sang repository interface và implement PostgreSQL repositories theo transaction boundaries P03.
2. Chạy migration + toàn bộ service tests trên PostgreSQL/pgvector thật; hoàn tất S-P03-01.
3. Thêm durable worker/outbox publisher, quota persistence và TS → ADK integration; hoàn tất S-P03-03 bằng Gemini kiểm thử.
4. Hoàn tất S-P03-02 bằng object storage/scan/extraction adapters ở mức đã cam kết.
5. Kiểm chứng Google OAuth/database session/revoke thật cho S-P03-04; thực hiện usability validation P02 còn mở với người dùng thật.
6. Bổ sung các operation P03 còn thiếu theo thứ tự VS1 → VS2 → VS3 → VS4 → VS5.
7. Chỉ sau khi các slice trong release scope hoàn tất mới trình PO duyệt P04; P05 không bắt đầu tự động.

## 7. Tài liệu liên quan

- [P03 contracts đã duyệt](../04-contracts/README.md)
- [Production source guide](../../src/README.md)
- [PostgreSQL schema guide](../../db/README.md)
- [ADK service guide](../../../gon-adk/README.md)
- [Gate review & approval](../00-process/GATE-REVIEW-AND-APPROVAL.md)
