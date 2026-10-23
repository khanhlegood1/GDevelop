-- 0010: distributed abuse/cost control state (P05-R1.10).
--
-- Scope notes:
-- * abuse_rate_buckets / abuse_flood_strikes hold hashed rate-limit and
--   flood-guard subjects (sha256 of IP/user id + deployment salt) — no raw
--   IPs or user ids are stored. They are cross-request infrastructure state,
--   written outside the identity-map Unit of Work through targeted statements.
-- * abuse_idempotency_markers powers the idempotent flood guard: a request
--   replaying a recently-seen Idempotency-Key is exempt from token/strike
--   accounting, so client retries cannot self-lockout.
-- * budget_alert_claims deduplicates AI-cost budget alert hooks across all
--   app instances: each (user, quota window, threshold) is claimed once.
-- * Optimistic concurrency uses an integer `version` column (CAS on read
--   version) so every app instance shares exact token/strike accounting
--   without timestamp-precision races.
-- * RLS follows the R1.6 model: ENABLEd, not FORCEd. The two hash-keyed
--   infra tables intentionally have NO policies (deny-by-default even under
--   gon.user_id — they contain no user rows), while budget_alert_claims is
--   user-scoped like the other user-data tables. Roles stay deploy-time.

-- ---------------------------------------------------------------------------
-- 1. Token buckets (per-IP / per-user, read/write classes)
-- ---------------------------------------------------------------------------

create table abuse_rate_buckets (
  bucket_key text primary key,
  tokens double precision not null check (tokens >= 0),
  capacity double precision not null check (capacity > 0),
  refill_per_sec double precision not null check (refill_per_sec >= 0),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null,
  created_at timestamptz not null
);

comment on table abuse_rate_buckets is
  'Token-bucket rate-limit state keyed by hashed subject (P05-R1.10). No raw IPs/user ids.';

create index abuse_rate_buckets_updated_idx on abuse_rate_buckets (updated_at);

-- ---------------------------------------------------------------------------
-- 2. Flood-guard strikes and penalty box
-- ---------------------------------------------------------------------------

create table abuse_flood_strikes (
  flood_key text primary key,
  strikes integer not null default 0 check (strikes >= 0),
  window_start timestamptz not null,
  offense_count integer not null default 0 check (offense_count >= 0),
  blocked_until timestamptz,
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null
);

comment on table abuse_flood_strikes is
  'Flood-guard strike windows and penalty box keyed by hashed subject (P05-R1.10).';

create index abuse_flood_strikes_updated_idx on abuse_flood_strikes (updated_at);

-- ---------------------------------------------------------------------------
-- 3. Idempotency markers (flood-guard replay exemption)
-- ---------------------------------------------------------------------------

create table abuse_idempotency_markers (
  marker_key text primary key,
  first_seen_at timestamptz not null
);

comment on table abuse_idempotency_markers is
  'Hashed Idempotency-Key sightings; replays inside the TTL are flood-exempt (P05-R1.10).';

create index abuse_idempotency_markers_first_seen_idx on abuse_idempotency_markers (first_seen_at);

-- ---------------------------------------------------------------------------
-- 4. Budget alert claims (exactly-once AI-cost alert hooks)
-- ---------------------------------------------------------------------------

create table budget_alert_claims (
  id text primary key,
  user_id text not null references gon_users(id) on delete cascade,
  quota_key text not null,
  window_start timestamptz not null,
  threshold_pct integer not null check (threshold_pct > 0 and threshold_pct <= 100),
  claimed_at timestamptz not null,
  unique (user_id, quota_key, window_start, threshold_pct)
);

comment on table budget_alert_claims is
  'Exactly-once claims for AI-cost budget alert thresholds per user/quota window (P05-R1.10).';

create index budget_alert_claims_user_idx on budget_alert_claims (user_id, quota_key, window_start);

-- ---------------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------------

-- Hash-keyed infrastructure tables: no user-scoped policies on purpose.
-- Non-owner roles are denied by default; only the owner / BYPASSRLS service
-- role (see P05-R1.6 evidence) may read or write them.
alter table abuse_rate_buckets enable row level security;
alter table abuse_flood_strikes enable row level security;
alter table abuse_idempotency_markers enable row level security;

-- Budget alert claims carry user_id and follow the 0008 user-scoped model.
alter table budget_alert_claims enable row level security;
create policy gon_rls_owner_budget_alert_claims on budget_alert_claims
  for all
  using (user_id = current_setting('gon.user_id', true))
  with check (user_id = current_setting('gon.user_id', true));
