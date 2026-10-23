-- 0008: persistent quota guardrail backfill, targeted-query indexes and
-- row-level security policies (P05-R1.6).
--
-- Scope notes:
-- * quota_reservations/feature_flags already exist in 0006; this migration
--   backfills count-quota history so enforcement stays continuous across the
--   R1.6 deploy, adds indexes for the targeted guardrail queries, and locks
--   the database RLS model decided in R1.6.
-- * RLS is ENABLEd but deliberately not FORCEd: the identity-map Unit of Work
--   runs as the table owner/service role (documented R1.6 decision) while any
--   non-owner role is denied by default and only sees rows whose user column
--   equals current_setting('gon.user_id', true). Deploy-time role setup is
--   documented in P05-R1.6 evidence; roles are intentionally not created here
--   because managed platforms (Cloud SQL) administer roles outside app
--   migrations.

-- ---------------------------------------------------------------------------
-- 1. Targeted-query indexes
-- ---------------------------------------------------------------------------

-- Budget reservations reference jobs created in the same Unit of Work; the
-- identity-map flush writes async_jobs at COMMIT, so the FK must be checked
-- at COMMIT time (deferred) instead of at the reservation insert.
alter table quota_reservations
  drop constraint quota_reservations_job_id_fkey;
alter table quota_reservations
  add constraint quota_reservations_job_id_fkey
  foreign key (job_id) references async_jobs(id) on delete set null
  deferrable initially deferred;

-- Window-sum used by persistent quota enforcement (reserve/sum/count paths).
create index quota_reservations_active_window_idx
  on quota_reservations (user_id, quota_key, window_start)
  where status in ('reserved', 'consumed', 'partially_refunded');

-- Owner/fingerprint lookup for idempotent Brew replay across all replayable
-- statuses (the 0004 partial unique index only covers queued/running).
create index async_jobs_owner_fingerprint_idx
  on async_jobs (owner_user_id, job_type, input_fingerprint, created_at desc);

-- Owner-window listing used by quota diagnostics DTOs.
create index search_attempts_owner_created_idx
  on search_attempts (owner_user_id, created_at desc);

create index source_artifacts_owner_created_idx
  on source_artifacts (owner_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Backfill count-quota history into quota_reservations
-- ---------------------------------------------------------------------------
-- Deterministic ids make the backfill idempotent (safe on rerun). Windows are
-- fixed buckets: hour for search_per_hour, UTC day for brew_per_day and
-- artifact_per_day (R1.6 decision: fixed windows for distributed correctness).

insert into quota_reservations
  (id, user_id, quota_key, window_start, window_end,
   reserved_units, consumed_units, refunded_units, status, job_id,
   created_at, updated_at)
select
  'qrsv_bf1_' || substr(md5('search_attempts:' || sa.id), 1, 24),
  sa.owner_user_id,
  'search_per_hour',
  (date_trunc('hour', sa.created_at at time zone 'UTC') at time zone 'UTC'),
  (date_trunc('hour', sa.created_at at time zone 'UTC') at time zone 'UTC') + interval '1 hour',
  1, 1, 0, 'consumed', null,
  sa.created_at, sa.created_at
from search_attempts sa
on conflict (id) do nothing;

insert into quota_reservations
  (id, user_id, quota_key, window_start, window_end,
   reserved_units, consumed_units, refunded_units, status, job_id,
   created_at, updated_at)
select
  'qrsv_bf2_' || substr(md5('brew_per_day:' || j.id), 1, 24),
  j.owner_user_id,
  'brew_per_day',
  (date_trunc('day', j.created_at at time zone 'UTC') at time zone 'UTC'),
  (date_trunc('day', j.created_at at time zone 'UTC') at time zone 'UTC') + interval '1 day',
  1, 1, 0, 'consumed', j.id,
  j.created_at, j.created_at
from async_jobs j
where j.job_type = 'brew_module'
on conflict (id) do nothing;

insert into quota_reservations
  (id, user_id, quota_key, window_start, window_end,
   reserved_units, consumed_units, refunded_units, status, job_id,
   created_at, updated_at)
select
  'qrsv_bf3_' || substr(md5('artifact_per_day:' || a.id), 1, 24),
  a.owner_user_id,
  'artifact_per_day',
  (date_trunc('day', a.created_at at time zone 'UTC') at time zone 'UTC'),
  (date_trunc('day', a.created_at at time zone 'UTC') at time zone 'UTC') + interval '1 day',
  1, 1, 0, 'consumed', null,
  a.created_at, a.created_at
from source_artifacts a
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Row-level security model
-- ---------------------------------------------------------------------------
-- Policy form: deny-by-default for every non-owner role. Rows become visible
-- only when the session/transaction sets 'gon.user_id' to the row's user
-- column. The table owner (service role for the identity-map Unit of Work and
-- the worker) bypasses RLS unless FORCE ROW LEVEL SECURITY is added later.

alter table gon_users enable row level security;
create policy gon_rls_owner_gon_users on gon_users
  for all
  using (id = current_setting('gon.user_id', true))
  with check (id = current_setting('gon.user_id', true));

alter table age_attestations enable row level security;
create policy gon_rls_owner_age_attestations on age_attestations
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table consents enable row level security;
create policy gon_rls_owner_consents on consents
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table data_requests enable row level security;
create policy gon_rls_owner_data_requests on data_requests
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table learning_projects enable row level security;
create policy gon_rls_owner_learning_projects on learning_projects
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table source_artifacts enable row level security;
create policy gon_rls_owner_source_artifacts on source_artifacts
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table content_chunks enable row level security;
create policy gon_rls_owner_content_chunks on content_chunks
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table search_attempts enable row level security;
create policy gon_rls_owner_search_attempts on search_attempts
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table async_jobs enable row level security;
create policy gon_rls_owner_async_jobs on async_jobs
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table journeys enable row level security;
create policy gon_rls_owner_journeys on journeys
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table learning_attempts enable row level security;
create policy gon_rls_owner_learning_attempts on learning_attempts
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table proofs enable row level security;
create policy gon_rls_owner_proofs on proofs
  for all
  using (owner_user_id = current_setting('gon.user_id', true))
  with check (owner_user_id = current_setting('gon.user_id', true));

alter table xp_ledger_entries enable row level security;
create policy gon_rls_owner_xp_ledger_entries on xp_ledger_entries
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table mastery_states enable row level security;
create policy gon_rls_owner_mastery_states on mastery_states
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table footprint_events enable row level security;
create policy gon_rls_owner_footprint_events on footprint_events
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));

alter table notifications enable row level security;
create policy gon_rls_owner_notifications on notifications
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));
