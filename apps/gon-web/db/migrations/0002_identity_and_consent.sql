-- GON P04 migration 0002: domain identity, invite, 18+ attestation and consent.

create or replace function gon_prevent_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table % cannot be %d through the application schema', tg_table_name, lower(tg_op);
  return null;
end;
$$;

create table gon_users (
  id text primary key check (id ~ '^usr_[A-Za-z0-9x]+$'),
  auth_user_id text unique,
  status text not null check (
    status in ('invited', 'onboarding', 'active', 'suspended', 'deletion_pending', 'deleted')
  ),
  locale text not null default 'vi-VN',
  time_zone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint gon_users_deleted_status_coherent check (
    (status = 'deleted' and deleted_at is not null)
    or status <> 'deleted'
  )
);

create index gon_users_status_idx on gon_users (status) where deleted_at is null;

create table identity_links (
  user_id text not null references gon_users(id) on delete cascade,
  provider text not null check (provider in ('google', 'dev')),
  provider_subject text not null,
  email_at_link text,
  linked_at timestamptz not null default now(),
  primary key (provider, provider_subject),
  constraint identity_links_one_google_per_user unique (user_id, provider)
);

comment on table identity_links is
  'Google provider subject -> GON user mapping. Email is evidence at link time, never the domain identity key. The dev provider is accepted by the schema only for non-production test data; application config disables it in production.';

create table user_profiles (
  user_id text primary key references gon_users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  avatar_object_key text,
  self_declared_headline text check (
    self_declared_headline is null or char_length(self_declared_headline) <= 240
  ),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create table role_grants (
  id bigint generated always as identity primary key,
  user_id text not null references gon_users(id) on delete cascade,
  role text not null check (role in ('learner', 'reviewer', 'admin')),
  scope text not null default 'global',
  granted_by_user_id text references gon_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint role_grants_expiry_after_grant check (
    expires_at is null or expires_at > granted_at
  )
);

create unique index role_grants_active_unique_idx
  on role_grants (user_id, role, scope)
  where revoked_at is null;
create index role_grants_user_idx on role_grants (user_id) where revoked_at is null;

create table invites (
  id text primary key check (id ~ '^inv_[A-Za-z0-9x]+$'),
  code_hash char(64) not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('active', 'redeemed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  redeemed_by_user_id text references gon_users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_redemption_coherent check (
    (
      status = 'redeemed'
      and redeemed_by_user_id is not null
      and redeemed_at is not null
    )
    or (
      status <> 'redeemed'
      and redeemed_by_user_id is null
      and redeemed_at is null
    )
  )
);

create index invites_active_expiry_idx on invites (expires_at) where status = 'active';

create table age_attestations (
  id text primary key check (id ~ '^age_[A-Za-z0-9x]+$'),
  user_id text not null references gon_users(id) on delete cascade,
  method text not null check (method = 'self_attested_18_plus'),
  terms_version text not null,
  privacy_version text not null,
  evidence_hash char(64) check (
    evidence_hash is null or evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  attested_at timestamptz not null default now()
);

create index age_attestations_user_latest_idx
  on age_attestations (user_id, attested_at desc);

create trigger age_attestations_append_only
before update or delete on age_attestations
for each row execute function gon_prevent_append_only_mutation();

comment on table age_attestations is
  'Append-only 18+ self-attestation. This is not government-ID or identity verification.';

create table consents (
  user_id text not null references gon_users(id) on delete cascade,
  purpose text not null check (
    purpose in (
      'essential_service',
      'personalization_footprint',
      'product_analytics',
      'ai_model_training',
      'external_social_connection'
    )
  ),
  status text not null check (
    status in ('not_set', 'granted', 'denied', 'withdrawn')
  ),
  policy_version text not null,
  source text not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

create table data_requests (
  id text primary key check (id ~ '^data_[A-Za-z0-9x]+$'),
  user_id text not null references gon_users(id) on delete cascade,
  request_type text not null check (
    request_type in ('export', 'delete_footprint', 'delete_account')
  ),
  scope jsonb not null default '{}'::jsonb,
  status text not null check (
    status in ('requested', 'processing', 'completed', 'failed', 'cancelled')
  ),
  receipt jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint data_requests_completion_coherent check (
    (status = 'completed' and completed_at is not null)
    or status <> 'completed'
  )
);

create index data_requests_user_status_idx
  on data_requests (user_id, status, requested_at desc);
