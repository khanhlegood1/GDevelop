-- GON P04 migration 0004: async jobs, hybrid search, modules, candidates and ranking.

create table async_jobs (
  id text primary key check (id ~ '^job_[A-Za-z0-9x]+$'),
  job_type text not null,
  owner_user_id text not null references gon_users(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id text not null,
  status text not null check (
    status in (
      'queued',
      'running',
      'succeeded',
      'needs_input',
      'failed_retryable',
      'failed_terminal',
      'cancelled'
    )
  ),
  current_step text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  input_fingerprint char(64) not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  estimated_cost_units numeric(18, 6) not null default 0 check (estimated_cost_units >= 0),
  actual_cost_units numeric(18, 6) not null default 0 check (actual_cost_units >= 0),
  failure_code text,
  retryable boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint async_jobs_unique_idempotency
    unique (owner_user_id, job_type, idempotency_key)
);

create unique index async_jobs_active_fingerprint_unique_idx
  on async_jobs (owner_user_id, job_type, input_fingerprint)
  where status in ('queued', 'running');
create index async_jobs_claim_idx
  on async_jobs (status, available_at, created_at)
  where status in ('queued', 'failed_retryable');
create index async_jobs_aggregate_idx
  on async_jobs (aggregate_type, aggregate_id, created_at desc);

create table modules (
  id text primary key check (id ~ '^mod_[A-Za-z0-9x]+$'),
  owner_user_id text references gon_users(id) on delete restrict,
  creator_type text not null check (
    creator_type in ('user', 'ai_assisted', 'system_seed')
  ),
  attribution_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table module_versions (
  id text primary key check (id ~ '^modv_[A-Za-z0-9x]+$'),
  module_id text not null references modules(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  graph_schema_version text not null check (
    graph_schema_version = 'gon.module-graph/1.0'
  ),
  graph jsonb not null,
  language text not null default 'vi-VN',
  title text not null check (char_length(title) between 1 and 180),
  summary text not null check (char_length(summary) between 1 and 1200),
  estimated_minutes integer not null check (estimated_minutes between 1 and 600),
  difficulty text not null check (
    difficulty in ('beginner', 'intermediate', 'advanced', 'expert')
  ),
  visibility text not null check (visibility in ('private', 'internal_reviewed')),
  publication_status text not null check (
    publication_status in (
      'draft_private',
      'pending_review',
      'internal_reviewed',
      'hidden',
      'retired'
    )
  ),
  grounding_status text not null check (
    grounding_status in ('unverified', 'partially_cited', 'citation_checked')
  ),
  generation_lineage jsonb not null default '{}'::jsonb,
  source_artifact_versions jsonb not null default '[]'::jsonb,
  parent_module_version_id text references module_versions(id) on delete restrict,
  content_sha256 char(64) not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by_user_id text references gon_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint module_versions_module_number_unique
    unique (module_id, version_number),
  constraint module_versions_visibility_publication_coherent check (
    (visibility = 'private' and publication_status <> 'internal_reviewed')
    or (visibility = 'internal_reviewed' and publication_status = 'internal_reviewed')
    or publication_status in ('hidden', 'retired')
  )
);

create index module_versions_catalog_idx
  on module_versions (publication_status, visibility, created_at desc);
create index module_versions_created_by_idx
  on module_versions (created_by_user_id, created_at desc)
  where created_by_user_id is not null;
create index module_versions_title_trgm_idx
  on module_versions using gin (title gin_trgm_ops);
create index module_versions_graph_gin_idx
  on module_versions using gin (graph jsonb_path_ops);
create index module_versions_content_hash_idx on module_versions (content_sha256);

alter table content_chunks
  add constraint content_chunks_module_version_fk
  foreign key (module_version_id)
  references module_versions(id)
  on delete restrict;

create or replace function gon_prevent_module_version_graph_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.module_id is distinct from old.module_id
     or new.version_number is distinct from old.version_number
     or new.graph_schema_version is distinct from old.graph_schema_version
     or new.graph is distinct from old.graph
     or new.language is distinct from old.language
     or new.title is distinct from old.title
     or new.summary is distinct from old.summary
     or new.estimated_minutes is distinct from old.estimated_minutes
     or new.difficulty is distinct from old.difficulty
     or new.generation_lineage is distinct from old.generation_lineage
     or new.source_artifact_versions is distinct from old.source_artifact_versions
     or new.parent_module_version_id is distinct from old.parent_module_version_id
     or new.content_sha256 is distinct from old.content_sha256
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'module_versions content and identity fields are immutable; create a new version';
  end if;
  return new;
end;
$$;

create trigger module_versions_graph_immutable
before update on module_versions
for each row execute function gon_prevent_module_version_graph_mutation();

create table concepts (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'),
  slug text not null unique,
  canonical_name text not null,
  aliases text[] not null default '{}',
  parent_concept_id text references concepts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now()
);

create table module_concepts (
  module_version_id text not null references module_versions(id) on delete cascade,
  concept_id text not null references concepts(id) on delete restrict,
  role text not null check (role in ('core', 'supporting', 'prerequisite')),
  weight double precision not null default 1 check (weight > 0),
  primary key (module_version_id, concept_id)
);

create index module_concepts_concept_idx on module_concepts (concept_id);

create table citation_references (
  id bigint generated always as identity primary key,
  module_version_id text not null references module_versions(id) on delete cascade,
  node_id text not null,
  claim_id text,
  graph_source_id text not null,
  source_artifact_id text references source_artifacts(id) on delete set null,
  external_source_uri text,
  locator text,
  support_status text not null,
  created_at timestamptz not null default now()
);

create index citation_references_module_idx
  on citation_references (module_version_id, node_id);
create index citation_references_artifact_idx
  on citation_references (source_artifact_id)
  where source_artifact_id is not null;

create table search_attempts (
  id text primary key check (id ~ '^srch_[A-Za-z0-9x]+$'),
  project_id text not null references learning_projects(id) on delete restrict,
  owner_user_id text not null references gon_users(id) on delete restrict,
  status text not null check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  verdict text check (
    verdict in (
      'found',
      'related',
      'missing',
      'needs_clarification',
      'blocked_by_policy'
    )
  ),
  context_snapshot jsonb not null default '{}'::jsonb,
  matched_concepts text[] not null default '{}',
  missing_concepts text[] not null default '{}',
  clarification_questions jsonb not null default '[]'::jsonb,
  search_policy_version text not null,
  embedding_profile text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint search_attempts_completed_verdict check (
    status <> 'completed' or (verdict is not null and completed_at is not null)
  )
);

create index search_attempts_project_latest_idx
  on search_attempts (project_id, created_at desc);
create index search_attempts_owner_status_idx
  on search_attempts (owner_user_id, status, created_at desc);

create table search_attempt_artifacts (
  search_attempt_id text not null references search_attempts(id) on delete cascade,
  artifact_id text not null references source_artifacts(id) on delete restrict,
  artifact_version integer not null check (artifact_version >= 1),
  primary key (search_attempt_id, artifact_id)
);

create table search_results (
  search_attempt_id text not null references search_attempts(id) on delete cascade,
  module_version_id text not null references module_versions(id) on delete restrict,
  rank integer not null check (rank >= 1),
  title_snapshot text not null,
  source_status text not null check (
    source_status in ('unverified', 'partially_cited', 'citation_checked')
  ),
  reason_codes text[] not null default '{}',
  matched_concepts text[] not null default '{}',
  missing_concepts text[] not null default '{}',
  vector_score double precision not null check (vector_score between -1 and 1),
  lexical_score double precision not null check (lexical_score between 0 and 1),
  concept_coverage double precision not null check (concept_coverage between 0 and 1),
  specificity_score double precision not null check (specificity_score between 0 and 1),
  quality_score double precision not null check (quality_score between 0 and 1),
  hybrid_score double precision not null check (hybrid_score between 0 and 1),
  primary key (search_attempt_id, module_version_id),
  constraint search_results_rank_unique unique (search_attempt_id, rank)
);

comment on table search_results is
  'Internal scores support verdict/eval only; APIs must not expose them as an absolute percentage of correctness.';

create table brew_jobs (
  job_id text primary key references async_jobs(id) on delete restrict,
  project_id text not null references learning_projects(id) on delete restrict,
  search_attempt_id text not null references search_attempts(id) on delete restrict,
  result_module_version_id text references module_versions(id) on delete restrict
);

create index brew_jobs_project_idx on brew_jobs (project_id);
create unique index brew_jobs_result_unique_idx
  on brew_jobs (result_module_version_id)
  where result_module_version_id is not null;

create table candidate_sets (
  id text primary key check (id ~ '^cset_[A-Za-z0-9x]+$'),
  project_id text not null references learning_projects(id) on delete restrict,
  search_attempt_id text not null references search_attempts(id) on delete restrict,
  source_module_version_id text references module_versions(id) on delete restrict,
  generation_method text not null,
  generator_version text not null,
  status text not null check (
    status in ('building', 'ready', 'ready_with_shortfall', 'failed', 'stale')
  ),
  target_count integer not null default 10 check (target_count >= 1),
  actual_count integer not null default 0 check (actual_count >= 0),
  shortfall_reason_codes text[] not null default '{}',
  diversity_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint candidate_sets_shortfall_coherent check (
    status <> 'ready_with_shortfall' or actual_count < target_count
  )
);

create index candidate_sets_project_latest_idx
  on candidate_sets (project_id, created_at desc);

create table output_candidates (
  id text primary key check (id ~ '^cand_[A-Za-z0-9x]+$'),
  candidate_set_id text not null references candidate_sets(id) on delete cascade,
  project_id text not null references learning_projects(id) on delete restrict,
  module_version_id text not null references module_versions(id) on delete restrict,
  derived_from_candidate_ids text[] not null default '{}',
  title text not null,
  promise text not null,
  cluster text not null,
  format text not null check (
    format in (
      'web_lesson',
      'infographic',
      'video',
      'image_sequence',
      'game',
      'easy_task',
      'teach_back',
      'workshop_case',
      'research_pack'
    )
  ),
  estimated_minutes integer not null check (estimated_minutes between 1 and 600),
  difficulty text not null,
  artifact_outcome text not null,
  prerequisite_concept_ids text[] not null default '{}',
  concept_ids text[] not null default '{}',
  source_status text not null check (
    source_status in ('unverified', 'partially_cited', 'citation_checked')
  ),
  status text not null check (
    status in ('eligible', 'hidden_by_policy', 'retired')
  ),
  semantic_fingerprint char(64) not null check (
    semantic_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  internal_signals jsonb not null default '{}'::jsonb,
  attribution_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index output_candidates_set_idx
  on output_candidates (candidate_set_id, status);
create index output_candidates_fingerprint_idx
  on output_candidates (candidate_set_id, semantic_fingerprint);
create index output_candidates_format_idx
  on output_candidates (candidate_set_id, cluster, format)
  where status = 'eligible';

create table ranking_snapshots (
  id text primary key check (id ~ '^rank_[A-Za-z0-9x]+$'),
  user_id text not null references gon_users(id) on delete restrict,
  project_id text not null references learning_projects(id) on delete restrict,
  candidate_set_id text not null references candidate_sets(id) on delete restrict,
  learning_mode text not null check (
    learning_mode in (
      'deep_mastery',
      'apply_at_work',
      'create_publish',
      'fast_entertaining',
      'prove_impact'
    )
  ),
  algorithm_version text not null,
  personalization_applied boolean not null,
  consent_version_at_ranking text,
  explanation_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  stale_at timestamptz not null
);

create index ranking_snapshots_lookup_idx
  on ranking_snapshots (user_id, project_id, candidate_set_id, created_at desc);

create table ranking_snapshot_items (
  ranking_snapshot_id text not null references ranking_snapshots(id) on delete cascade,
  candidate_id text not null references output_candidates(id) on delete restrict,
  rank integer not null check (rank >= 1),
  signal_breakdown jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}',
  primary key (ranking_snapshot_id, candidate_id),
  constraint ranking_snapshot_items_rank_unique
    unique (ranking_snapshot_id, rank)
);

alter table learning_projects
  add constraint learning_projects_current_search_fk
  foreign key (current_search_attempt_id)
  references search_attempts(id)
  on delete set null;

alter table learning_projects
  add constraint learning_projects_current_brew_fk
  foreign key (current_brew_job_id)
  references brew_jobs(job_id)
  on delete set null;

alter table learning_projects
  add constraint learning_projects_current_candidate_set_fk
  foreign key (current_candidate_set_id)
  references candidate_sets(id)
  on delete set null;
