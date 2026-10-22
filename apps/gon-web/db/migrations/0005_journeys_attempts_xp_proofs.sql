-- GON P04 migration 0005: Journey Fork, attempts, mastery, XP Ledger, Proof and moderation intake.

create table journeys (
  id text primary key check (id ~ '^jrn_[A-Za-z0-9x]+$'),
  owner_user_id text not null references gon_users(id) on delete restrict,
  project_id text not null references learning_projects(id) on delete restrict,
  source_candidate_id text not null references output_candidates(id) on delete restrict,
  upstream_module_version_id text not null references module_versions(id) on delete restrict,
  parent_journey_id text references journeys(id) on delete restrict,
  title text not null,
  goal text not null,
  visibility text not null default 'private' check (visibility = 'private'),
  attribution jsonb not null default '{}'::jsonb,
  status text not null check (
    status in ('active', 'completed', 'archived', 'deleted')
  ),
  head_commit_id text,
  current_node_id text,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint journeys_deleted_status_coherent check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create index journeys_owner_status_updated_idx
  on journeys (owner_user_id, status, updated_at desc)
  where deleted_at is null;
create index journeys_project_idx
  on journeys (project_id, created_at desc)
  where deleted_at is null;
create index journeys_upstream_idx
  on journeys (upstream_module_version_id)
  where deleted_at is null;

create table branch_commits (
  id text primary key check (id ~ '^commit_[A-Za-z0-9x]+$'),
  journey_id text not null references journeys(id) on delete restrict,
  parent_commit_id text references branch_commits(id) on delete restrict,
  sequence integer not null check (sequence >= 1),
  type text not null check (
    type in (
      'fork_created',
      'attempt_passed',
      'artifact_created',
      'reflection',
      'boss_submitted',
      'proof_recorded',
      'system_note'
    )
  ),
  actor_user_id text not null references gon_users(id) on delete restrict,
  payload_ref jsonb not null default '{}'::jsonb,
  summary text not null,
  created_at timestamptz not null default now(),
  constraint branch_commits_sequence_unique unique (journey_id, sequence)
);

alter table journeys
  add constraint journeys_head_commit_fk
  foreign key (head_commit_id)
  references branch_commits(id)
  on delete restrict;

create trigger branch_commits_append_only
before update or delete on branch_commits
for each row execute function gon_prevent_append_only_mutation();

create table learning_attempts (
  id text primary key check (id ~ '^att_[A-Za-z0-9x]+$'),
  journey_id text not null references journeys(id) on delete restrict,
  owner_user_id text not null references gon_users(id) on delete restrict,
  module_version_id text not null references module_versions(id) on delete restrict,
  node_id text not null,
  attempt_number integer not null check (attempt_number >= 1),
  status text not null check (
    status in (
      'draft',
      'submitted',
      'assessing',
      'passed',
      'needs_revision',
      'pending_human_review',
      'rejected'
    )
  ),
  answer_text text,
  source_disclosure jsonb not null default '{}'::jsonb,
  ai_assistance_disclosure jsonb not null default '{}'::jsonb,
  rubric_id text not null,
  rubric_version text not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint learning_attempts_number_unique
    unique (journey_id, node_id, attempt_number),
  constraint learning_attempts_submitted_coherent check (
    status = 'draft' or submitted_at is not null
  )
);

create index learning_attempts_journey_node_idx
  on learning_attempts (journey_id, node_id, attempt_number desc);
create index learning_attempts_owner_status_idx
  on learning_attempts (owner_user_id, status, updated_at desc);
create unique index learning_attempts_one_draft_per_node_idx
  on learning_attempts (journey_id, node_id)
  where status = 'draft';

create table learning_attempt_artifacts (
  attempt_id text not null references learning_attempts(id) on delete cascade,
  artifact_id text not null references source_artifacts(id) on delete restrict,
  primary key (attempt_id, artifact_id)
);

create table assessment_results (
  id bigint generated always as identity primary key,
  attempt_id text not null references learning_attempts(id) on delete restrict,
  decision text not null check (
    decision in ('passed', 'needs_revision', 'pending_human_review', 'rejected')
  ),
  criteria jsonb not null,
  feedback text not null,
  confidence double precision not null check (confidence between 0 and 1),
  assessor_type text not null check (
    assessor_type in ('deterministic', 'ai', 'human')
  ),
  assessor_version text not null,
  rubric_snapshot jsonb not null,
  integrity_signals text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index assessment_results_attempt_latest_idx
  on assessment_results (attempt_id, created_at desc, id desc);

create trigger assessment_results_append_only
before update or delete on assessment_results
for each row execute function gon_prevent_append_only_mutation();

create table mastery_states (
  user_id text not null references gon_users(id) on delete cascade,
  concept_id text not null references concepts(id) on delete restrict,
  level text not null check (
    level in ('exposed', 'recall', 'apply', 'create', 'teach')
  ),
  evidence_attempt_id text references learning_attempts(id) on delete set null,
  achieved_at timestamptz,
  last_evidence_at timestamptz,
  review_due_at timestamptz,
  version integer not null default 1 check (version >= 1),
  primary key (user_id, concept_id)
);

create table xp_ledger_entries (
  id text primary key check (id ~ '^xp_[A-Za-z0-9x]+$'),
  user_id text not null references gon_users(id) on delete restrict,
  sequence bigint not null check (sequence >= 1),
  delta integer not null check (delta <> 0),
  source_event_id text not null unique,
  source_type text not null,
  source_id text not null,
  rule_version text not null,
  formula_version text not null check (formula_version = 'gon-level-v1'),
  status text not null check (status in ('posted', 'reversed', 'reversal')),
  reverses_entry_id text references xp_ledger_entries(id) on delete restrict,
  reason_code text,
  lifetime_xp_after bigint not null check (lifetime_xp_after >= 0),
  created_at timestamptz not null default now(),
  constraint xp_ledger_user_sequence_unique unique (user_id, sequence),
  constraint xp_ledger_reversal_coherent check (
    (status = 'reversal' and reverses_entry_id is not null)
    or (status <> 'reversal' and reverses_entry_id is null)
  )
);

create index xp_ledger_user_history_idx
  on xp_ledger_entries (user_id, created_at desc, sequence desc);
create index xp_ledger_source_idx
  on xp_ledger_entries (source_type, source_id);

create trigger xp_ledger_entries_append_only
before update or delete on xp_ledger_entries
for each row execute function gon_prevent_append_only_mutation();

comment on table xp_ledger_entries is
  'Append-only canonical XP history. Corrections use reversal entries; existing rows are never edited to rewrite history. Numeric level is always floor(lifetime_xp/100) under gon-level-v1.';

create table xp_projections (
  user_id text primary key references gon_users(id) on delete cascade,
  lifetime_xp bigint not null default 0 check (lifetime_xp >= 0),
  last_entry_sequence bigint not null default 0 check (last_entry_sequence >= 0),
  updated_at timestamptz not null default now()
);

create table proofs (
  id text primary key check (id ~ '^proof_[A-Za-z0-9x]+$'),
  owner_user_id text not null references gon_users(id) on delete restrict,
  proof_type text not null,
  title text not null,
  description text,
  journey_id text references journeys(id) on delete set null,
  attempt_id text references learning_attempts(id) on delete set null,
  issuer_display_name text,
  external_reference text,
  verification_level text not null check (
    verification_level in (
      'self_declared',
      'source_linked',
      'system_recorded',
      'issuer_verified',
      'anchored'
    )
  ),
  status text not null check (
    status in ('active', 'pending_verification', 'revoked', 'superseded', 'deleted')
  ),
  visibility text not null default 'private' check (visibility = 'private'),
  proves text[] not null default '{}',
  does_not_prove text[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint proofs_deleted_status_coherent check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create index proofs_owner_level_created_idx
  on proofs (owner_user_id, verification_level, created_at desc)
  where deleted_at is null;

create table proof_artifacts (
  proof_id text not null references proofs(id) on delete cascade,
  artifact_id text not null references source_artifacts(id) on delete restrict,
  primary key (proof_id, artifact_id)
);

create table proof_verification_events (
  id bigint generated always as identity primary key,
  proof_id text not null references proofs(id) on delete restrict,
  from_level text,
  to_level text not null check (
    to_level in (
      'self_declared',
      'source_linked',
      'system_recorded',
      'issuer_verified',
      'anchored'
    )
  ),
  verifier_user_id text references gon_users(id) on delete set null,
  evidence_refs jsonb not null default '[]'::jsonb,
  decision text not null,
  reason text,
  created_at timestamptz not null default now()
);

create trigger proof_verification_events_append_only
before update or delete on proof_verification_events
for each row execute function gon_prevent_append_only_mutation();

create table footprint_events (
  id bigint generated always as identity primary key,
  user_id text not null references gon_users(id) on delete cascade,
  category text not null check (
    category in (
      'goal_selected',
      'candidate_saved',
      'candidate_hidden',
      'arena_voted',
      'journey_started',
      'attempt_passed',
      'artifact_created',
      'proof_recorded',
      'not_interested'
    )
  ),
  entity_type text not null,
  entity_id text not null,
  attributes jsonb not null default '{}'::jsonb,
  consent_purpose text not null default 'personalization_footprint',
  consent_status_at_event text not null,
  occurred_at timestamptz not null default now()
);

create index footprint_events_user_time_idx
  on footprint_events (user_id, occurred_at desc);

comment on table footprint_events is
  'Minimal in-product footprint only. Raw answers, proof contents and external social feeds must not be copied into attributes.';

create table personalization_preferences (
  user_id text primary key references gon_users(id) on delete cascade,
  preferred_topics text[] not null default '{}',
  preferred_formats text[] not null default '{}',
  hidden_topics text[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create table reports (
  id text primary key check (id ~ '^rpt_[A-Za-z0-9x]+$'),
  reporter_user_id text not null references gon_users(id) on delete restrict,
  target_type text not null,
  target_id text not null,
  target_version text,
  reason_code text not null,
  detail text check (detail is null or char_length(detail) <= 2000),
  status text not null check (
    status in ('received', 'triaged', 'action_taken', 'no_action', 'escalated', 'closed')
  ),
  created_at timestamptz not null default now()
);

create index reports_target_idx on reports (target_type, target_id, created_at desc);
create index reports_queue_idx on reports (status, created_at);

create table moderation_cases (
  id text primary key check (id ~ '^case_[A-Za-z0-9x]+$'),
  report_id text not null unique references reports(id) on delete restrict,
  risk_level text not null check (
    risk_level in ('low', 'normal', 'high', 'critical')
  ),
  status text not null default 'open',
  assignee_user_id text references gon_users(id) on delete set null,
  sla_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_cases_queue_idx
  on moderation_cases (status, risk_level, created_at);

create table moderation_actions (
  id bigint generated always as identity primary key,
  case_id text not null references moderation_cases(id) on delete restrict,
  actor_user_id text not null references gon_users(id) on delete restrict,
  action text not null,
  structured_reason jsonb not null default '{}'::jsonb,
  before_status text,
  after_status text,
  created_at timestamptz not null default now()
);

create trigger moderation_actions_append_only
before update or delete on moderation_actions
for each row execute function gon_prevent_append_only_mutation();
