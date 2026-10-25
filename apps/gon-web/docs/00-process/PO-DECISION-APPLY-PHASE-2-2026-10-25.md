# PO Decision — Apply-2: Arena nối vào `/v1` thật (2026-10-25)

**Kết luận: SHIPPED — chờ PO xác nhận.** Vertical slice backend Arena theo đúng hợp đồng P03 đã khóa (`docs/04-contracts/openapi.json`), backend-first, chưa đụng FE.

## 1. Đã làm gì (diff thật)

| Lớp | Thay đổi |
| --- | --- |
| `db/migrations/0011_arena_matches_votes.sql` | Bảng `arena_matches` + `arena_votes`, `unique(match_id, user_id)` = một vote/user/match ở tầng DB, RLS owner theo `current_setting('gon.user_id', true)` như 0009. |
| `src/server/types.ts` | `ArenaMatchRecord`, `ArenaVoteRecord` (choice enum 5 giá trị P03). |
| `src/server/repositories.ts` | Collections `arenaMatches`/`arenaVotes` + `MAP_COLLECTION_NAMES` + `InMemoryGonRepositories`. |
| `src/server/memory-store.ts` | Getters `arenaMatches`/`arenaVotes`. |
| `src/server/postgres-store.ts` | DURABLE_COLLECTIONS, mapDiff, flush (match upsert + vote append-only), save/load theo pattern `savePersonalization`. |
| `src/server/service.ts` | Core `createArenaMatch`/`getArenaMatch`/`createArenaVote` + `arenaMatchDto`/`arenaSlotDto` + wrapper `GonService`. |
| `src/server/routes.ts` | 3 endpoint: `POST /v1/projects/{id}/arena-matches` (201), `GET /v1/arena-matches/{id}`, `POST /v1/arena-matches/{id}/votes` (201). |
| `src/server/ids.ts` | Thêm prefix `"vote"` (`"arena"` đã có). |
| `scripts/check-migrations.mjs` | Thêm `arena_matches`/`arena_votes` vào requiredTables. |
| `tests/production/arena-service.test.ts` | 4 test: happy path (open → vote → revealed), 409 vote lần 2, validation (đôi trùng/ngoài CandidateSet/choice sai/match lạ), ownership (403 người khác). |
| `src/README.md` | Arena ra khỏi gap list VS1; ghi rõ nợ merge thật. |

## 2. Hành vi theo P03

- **Tạo trận**: cần CandidateSet hiện tại (Search → Brew); 2 candidate phải khác nhau và thuộc CandidateSet; id `arena_*`; status `open`; `expiresAt` = +24h; **slot chỉ chứa summary/format/estimatedMinutes/difficulty/artifactOutcome** — không lộ title đầy đủ trước vote (slotA.summary = title để người học có gì mà so sánh, đúng tinh thần blind-so-sánh của Arena).
- **Trước vote**: `revealedCandidates: null`.
- **Vote**: choice ∈ `left_better|right_better|tie|both_bad|merge`; một vote/user/match → lần 2 bị **409 `ARENA_VOTE_ALREADY_CAST`**; status → `voted`; sau vote **mở `revealedCandidates`** (2 OutputCandidate đầy đủ qua `candidateDto`).
- **`merge`**: trả `mergedCandidateId: null, mergeJobId: null` — trung thực, vì merge thật cần Brew job riêng (VS sau, đã ghi trong README).
- **Idempotency**: endpoint mutation vẫn yêu cầu header `Idempotency-Key` (assertMutation) nhưng chưa ghi idempotency record — vote lại bị chặn tự nhiên bởi rule một-vote; match tạo lại trên retry tạo trận mới. Ghi nợ ở §4.

## 3. Bằng chứng

- `npx tsc --noEmit` PASS.
- `npx vitest run tests/production` → **174/174** (170 cũ + 4 mới), 23 files.
- `node scripts/check-migrations.mjs` PASS (11 files).
- Live E2E trên dev server port 3000 (curl đúng flow CSRF → dev session → attestation → project → search → brew → explorer → arena-matches → votes): xem PR description.

## 4. Nợ kỹ thuật (đã ghi trong README + queue)

1. Merge thật cho choice `merge` (Brew job ghép 2 output).
2. Idempotency record cho 2 POST arena (hiện chỉ có guard tự nhiên).
3. Match `expired`/`cancelled` chưa có sweep job (expiresAt đã lưu).
4. FE ArenaPanel chưa nối API thật (dùng state cục bộ từ Apply-1) — Apply-3.
5. Game-sessions/events `/v1` — Apply-3.

## 5. Queue sau Apply-2

FE wiring ArenaPanel + JourneyAgentPanel real API · game-sessions/events · GDJS Runtime + extension GonLearningEvents thật · backend xu hướng KOL token (P05+) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
