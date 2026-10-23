-- 0009: per-user personalization preferences (P05-R1.7 privacy slice).
--
-- `data_requests` (0002) already stores export/delete requests; this migration
-- adds the missing personalization-preferences row referenced by the P03
-- `/me/personalization` contract. RLS follows the deny-by-default model fixed
-- in 0008.

create table user_personalization (
  user_id text primary key references gon_users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table user_personalization enable row level security;
create policy gon_rls_owner_user_personalization on user_personalization
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));
