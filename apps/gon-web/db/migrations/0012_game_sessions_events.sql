-- 0012 · Apply-3 (27/10) — Game sessions & events.
-- Hợp đồng P03 docs/04-contracts/openapi.json + schemas/game-event.schema.json:
--   POST /journeys/{journeyId}/game-sessions  (GameSessionLaunch: +launchToken +config)
--   GET  /game-sessions/{sessionId}
--   POST /game-sessions/{sessionId}/events    (batch gon.game-events/1.0)
-- Event batch idempotent theo clientEventId — ràng buộc unique(session_id, client_event_id)
-- và lọc trùng ở tầng service (replay không tạo work mới).

create table game_sessions (
  id text primary key,
  journey_id text not null references journeys(id) on delete cascade,
  user_id text not null references gon_users(id) on delete cascade,
  node_id text not null,
  template_id text not null,
  template_version text not null,
  status text not null,
  launch_token text not null,
  expires_at timestamptz not null,
  validated_learning_effect jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table game_events (
  id text primary key,
  session_id text not null references game_sessions(id) on delete cascade,
  user_id text not null references gon_users(id) on delete cascade,
  client_event_id text not null,
  sequence integer not null,
  event_type text not null,
  occurred_at_client timestamptz not null,
  data jsonb not null,
  created_at timestamptz not null,
  unique (session_id, client_event_id)
);

alter table game_sessions enable row level security;

create policy gon_rls_owner_game_sessions on game_sessions
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table game_events enable row level security;

create policy gon_rls_owner_game_events on game_events
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));
