# PO Decision — Apply-3: Game sessions & events trên `/v1` thật (2026-10-27)

**Kết luận: SHIPPED (backend slice) — chờ PO xác nhận.** Game session theo hợp đồng P03 + schema `gon.game-events/1.0`, cùng pattern Apply-2 (backend-first, memory + postgres + migration + tests + live verify).

## 1. Endpoints

| Endpoint | Hành vi |
| --- | --- |
| `POST /v1/journeys/{id}/game-sessions` | Body `{nodeId, templateId}` → 201 `GameSessionLaunch`: session dto + `launchToken` (chỉ trả lúc tạo) + `config` = player graph **đã lọc, không chứa sampleAnswer/conceptTermGroups**. nodeId phải thuộc journey graph; status `created`; expiresAt +24h. |
| `GET /v1/game-sessions/{id}` | Chỉ session dto — **không** trả lại launchToken/config. |
| `POST /v1/game-sessions/{id}/events` | Batch `gon.game-events/1.0` (schemaVersion const, sessionId khớp URL, events 1–100, clientEventId 8–128, sequence ≥1, eventType ∈ 7 giá trị, occurredAtClient date-time, data object) → 201 session dto với trạng thái mới. |

## 2. Máy trạng thái & idempotency

- `created` → (`session_started`) → `active` → (`session_completed`) → `completed` | (`session_abandoned`) → `abandoned`.
- Session đóng (completed/abandoned/expired/invalidated) → batch mới **409 `GAME_SESSION_NOT_OPEN`**.
- **Idempotent theo clientEventId**: event trùng (replay batch) bị bỏ qua, không double-apply; DB có `unique(session_id, client_event_id)` (migration 0012).
- `validatedLearningEffect` trả `null` trung thực — chưa có máy đánh giá learning effect thật (nợ, gắn với GDJS extension GonLearningEvents).
- `launchUrl` trả `null` trung thực — GDJS Runtime launcher thật là bước kế tiếp (Apply-4).

## 3. Diff

- `db/migrations/0012_game_sessions_events.sql` — 2 bảng + RLS owner (`current_setting('gon.user_id', true)`).
- `src/server/types.ts` — `GameSessionRecord`, `GameEventRecord`.
- `repositories.ts` / `memory-store.ts` / `postgres-store.ts` — collections `gameSessions`/`gameEvents` đầy đủ (DURABLE, mapDiff, flush, save/load jsonb theo pattern personalization).
- `service.ts` — core `createGameSession`/`getGameSession`/`appendGameEvents` + `gameSessionDto` + wrappers.
- `routes.ts` — 3 endpoint; `check-migrations.mjs` — 2 bảng mới; `postgres-migrations.test.ts` — 12 files.
- `tests/production/game-sessions.test.ts` — 4 test (launch + state flow + filter đáp án ẩn, replay idempotent + lock, validation batch đầy đủ, ownership).
- `src/README.md` — game session/events ra khỏi gap list VS1.

## 4. Bằng chứng

- `npx tsc --noEmit` PASS · `node scripts/check-migrations.mjs` PASS (12 files).
- `npx vitest run tests/production` → **178/178** (24 files; +4 mới).
- Live E2E port 3000: create → launchToken + config 4 nodes (không sampleAnswer) → GET không lộ token → batch 1 `active` → batch 2 `completed` → 409 GAME_SESSION_NOT_OPEN → 400 VALIDATION_FAILED sai schemaVersion.

## 5. Nợ (đã ghi README)

1. `launchUrl` thật = GDJS Runtime launcher (embed iframe + launchToken exchange).
2. `validatedLearningEffect` thật (extension GonLearningEvents + checkpoint rubric).
3. Sweep `expired` session; idempotency record cho POST create (hiện tự nhiên an toàn: replay tạo session mới).
4. FE: JourneyAgentPanel/Player nút "Học tương tác" gọi endpoint này; ArenaPanel real API (Apply-3b).

## 6. Queue sau Apply-3 (backend)

FE wiring ArenaPanel + JourneyAgentPanel/GameSession · GDJS Runtime + extension thật · xu hướng KOL token (P05+) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
