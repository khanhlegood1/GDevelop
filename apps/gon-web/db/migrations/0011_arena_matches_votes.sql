-- 0011 · Apply-2 (25/10) — Arena matches & votes.
-- Hợp đồng P03 docs/04-contracts/openapi.json:
--   POST /projects/{projectId}/arena-matches
--   GET  /arena-matches/{matchId}
--   POST /arena-matches/{matchId}/votes
-- Một vote mỗi (match, user) — ràng buộc bằng unique(match_id, user_id)
-- và kiểm tra ở tầng service (409 ARENA_VOTE_ALREADY_CAST).
-- Slots trỏ tới candidate id của CandidateSet hiện tại; không FK cứng
-- vì vòng đời candidate thuộc CandidateSet (snapshot ranking riêng).

create table arena_matches (
  id text primary key,
  project_id text not null references learning_projects(id) on delete cascade,
  user_id text not null references gon_users(id) on delete cascade,
  slot_a_candidate_id text not null,
  slot_b_candidate_id text not null,
  status text not null,
  ranking_snapshot_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table arena_votes (
  id text primary key,
  match_id text not null references arena_matches(id) on delete cascade,
  user_id text not null references gon_users(id) on delete cascade,
  choice text not null,
  created_at timestamptz not null,
  unique (match_id, user_id)
);

alter table arena_matches enable row level security;

create policy gon_rls_owner_arena_matches on arena_matches
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table arena_votes enable row level security;

create policy gon_rls_owner_arena_votes on arena_votes
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));
