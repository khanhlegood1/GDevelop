-- GON P04 migration 0006: transactional outbox, idempotency, AI runs, quota,
-- audit, flags and notifications.

create table outbox_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9x]+$'),
  event_type text not null,
  event_version integer not null check (event_version >= 1),
  occurred_at timestamptz not null default now(),
  aggregate_type text not null,
  aggregate_id text not null,
  actor_type text not null,
  actor_id text not null,
  correlation_id text not null,
  causation_id text,
  data jsonb not null default '{}'::jsonb,
  publish_state text not null default 'pending' check (
    publish_state in ('pending', 'publishing', 'published', 'failed')
  ),
  available_at timestamptz not null default now(),
  published_at timestamptz,
  publish_attempt_count integer not null default 0 check (publish_attempt_count >= 0),
  last_error_code text,
  constraint outbox_events_published_coherent check (
    publish_state <> 'published' or published_at is not null
  )
);

create index outbox_events_publish_queue_idx
  on outbox_events (publish_state, available_at, occurred_at)
  where publish_state in ('pending', 'failed');
create index outbox_events_aggregate_idx
  on outbox_events (aggregate_type, aggregate_id, occurred_at);
create index outbox_events_correlation_idx on outbox_events (correlation_id);

comment on table outbox_events is
  'Transactional outbox. Payloads contain minimum event data/references, never raw private answers or provider chain-of-thought.';

create table idempotency_records (
  actor_user_id text not null references gon_users(id) on delete cascade,
  operation text not null,
  idempotency_key text not null check (
    char_length(idempotency_key) between 8 and 128
  ),
  request_fingerprint char(64) not null check (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  resource_type text not null,
  resource_id text not null,
  http_status integer not null check (http_status between 100 and 599),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (actor_user_id, operation, idempotency_key)
);

create index idempotency_records_expiry_idx on idempotency_records (expires_at);

create table ai_runs (
  id bigint generated always as identity primary key,
  job_id text references async_jobs(id) on delete set null,
  operation text not null check (
    operation in ('topic_check', 'generate_module', 'assess_attempt', 'plan_candidates')
  ),
  provider text not null,
  model_id text not null,
  agent_pipeline_version text not null,
  prompt_template_versions text[] not null default '{}',
  input_schema_version text not null,
  output_schema_version text not null,
  evidence_bundle_hash char(64) check (
    evidence_bundle_hash is null or evidence_bundle_hash ~ '^[a-f0-9]{64}$'
  ),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  cost_units numeric(18, 6) not null default 0 check (cost_units >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  finish_reason text,
  error_code text,
  created_at timestamptz not null default now()
);

create index ai_runs_job_idx on ai_runs (job_id, created_at) where job_id is not null;
create index ai_runs_model_time_idx on ai_runs (provider, model_id, created_at desc);

comment on table ai_runs is
  'AI observability without raw private prompts or chain-of-thought by default.';

create table quota_reservations (
  id text primary key,
  user_id text not null references gon_users(id) on delete restrict,
  quota_key text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  reserved_units numeric(18, 6) not null check (reserved_units >= 0),
  consumed_units numeric(18, 6) not null default 0 check (consumed_units >= 0),
  refunded_units numeric(18, 6) not null default 0 check (refunded_units >= 0),
  status text not null check (
    status in ('reserved', 'consumed', 'partially_refunded', 'refunded', 'expired')
  ),
  job_id text references async_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quota_reservations_window_ordered check (window_end > window_start),
  constraint quota_reservations_units_coherent check (
    consumed_units + refunded_units <= reserved_units
  )
);

create index quota_reservations_user_window_idx
  on quota_reservations (user_id, quota_key, window_start, window_end);

create table audit_logs (
  id text primary key check (id ~ '^evt_[A-Za-z0-9x]+$'),
  actor_type text not null,
  actor_id text not null,
  action text not null,
  object_type text not null,
  object_id text not null,
  request_id text not null,
  reason text,
  before_hash char(64) check (
    before_hash is null or before_hash ~ '^[a-f0-9]{64}$'
  ),
  after_hash char(64) check (
    after_hash is null or after_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default now()
);

create index audit_logs_object_idx
  on audit_logs (object_type, object_id, created_at desc);
create index audit_logs_actor_idx
  on audit_logs (actor_type, actor_id, created_at desc);
create index audit_logs_request_idx on audit_logs (request_id);

create trigger audit_logs_append_only
before update or delete on audit_logs
for each row execute function gon_prevent_append_only_mutation();

create table feature_flags (
  key text primary key,
  enabled boolean not null,
  scope jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

insert into feature_flags (key, enabled) values
  ('brew_enabled', true),
  ('arena_enabled', true),
  ('internal_publish_enabled', false),
  ('trend_enabled', false),
  ('game_events_enabled', false)
on conflict (key) do nothing;

create table notifications (
  id text primary key,
  user_id text not null references gon_users(id) on delete cascade,
  notification_type text not null,
  entity_type text,
  entity_id text,
  title_template_key text not null,
  body_template_key text,
  template_params jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on notifications (user_id, created_at desc)
  where read_at is null;
