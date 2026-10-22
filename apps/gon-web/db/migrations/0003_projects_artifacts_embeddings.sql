-- GON P04 migration 0003: projects, source artifacts, chunks and 768D embeddings.

create table learning_projects (
  id text primary key check (id ~ '^prj_[A-Za-z0-9x]+$'),
  owner_user_id text not null references gon_users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  goal text not null check (char_length(goal) between 1 and 500),
  raw_prompt_artifact_id text not null,
  visibility text not null default 'private' check (
    visibility in ('private', 'internal_reviewed')
  ),
  learning_mode text not null check (
    learning_mode in (
      'deep_mastery',
      'apply_at_work',
      'create_publish',
      'fast_entertaining',
      'prove_impact'
    )
  ),
  depth text not null default 'standard' check (
    depth in ('intro', 'standard', 'deep')
  ),
  time_budget_minutes integer not null check (
    time_budget_minutes between 1 and 600
  ),
  locale text not null default 'vi-VN',
  current_search_attempt_id text,
  current_brew_job_id text,
  current_candidate_set_id text,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz
);

create index learning_projects_owner_updated_idx
  on learning_projects (owner_user_id, updated_at desc)
  where deleted_at is null;
create index learning_projects_title_trgm_idx
  on learning_projects using gin (title gin_trgm_ops)
  where deleted_at is null;

create table source_artifacts (
  id text primary key check (id ~ '^art_[A-Za-z0-9x]+$'),
  project_id text not null references learning_projects(id) on delete restrict,
  owner_user_id text not null references gon_users(id) on delete restrict,
  kind text not null check (
    kind in ('text', 'website_url', 'youtube_url', 'facebook_url', 'file', 'image')
  ),
  origin_uri text,
  display_name text not null check (char_length(display_name) between 1 and 500),
  source_platform text,
  storage_object_key text,
  declared_mime_type text,
  detected_mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 char(64) not null check (sha256 ~ '^[a-f0-9]{64}$'),
  rights_basis text not null check (
    rights_basis in (
      'created_by_user',
      'licensed_to_user',
      'publicly_available_link',
      'permission_claimed',
      'unknown'
    )
  ),
  rights_note text,
  source_text text,
  safety_status text not null check (
    safety_status in ('pending_scan', 'allowed', 'blocked', 'needs_review')
  ),
  extraction_status text not null check (
    extraction_status in (
      'queued',
      'processing',
      'ready',
      'partial',
      'metadata_only',
      'unsupported',
      'failed_retryable',
      'failed_terminal',
      'blocked'
    )
  ),
  failure_code text,
  coverage jsonb not null default
    '{"hasMetadata":false,"hasText":false,"hasTranscript":false,"chunkCount":0}'::jsonb,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint source_artifacts_origin_by_kind check (
    kind not in ('website_url', 'youtube_url', 'facebook_url')
    or origin_uri is not null
  ),
  constraint source_artifacts_text_present check (
    kind <> 'text' or source_text is not null
  )
);

alter table learning_projects
  add constraint learning_projects_raw_prompt_artifact_fk
  foreign key (raw_prompt_artifact_id)
  references source_artifacts(id)
  on delete restrict
  deferrable initially deferred;

create index source_artifacts_project_created_idx
  on source_artifacts (project_id, created_at)
  where deleted_at is null;
create index source_artifacts_owner_sha_idx
  on source_artifacts (owner_user_id, sha256)
  where deleted_at is null;
create index source_artifacts_processing_idx
  on source_artifacts (extraction_status, created_at)
  where deleted_at is null and extraction_status in ('queued', 'processing', 'failed_retryable');

comment on column source_artifacts.source_text is
  'Inline text only for bounded text artifacts. Binary/original file bytes belong in private object storage, never in PostgreSQL.';

create table artifact_extractions (
  id text primary key,
  artifact_id text not null references source_artifacts(id) on delete restrict,
  pipeline_version text not null,
  status text not null check (
    status in (
      'queued',
      'processing',
      'ready',
      'partial',
      'metadata_only',
      'unsupported',
      'failed_retryable',
      'failed_terminal',
      'blocked'
    )
  ),
  has_text boolean not null default false,
  has_metadata boolean not null default false,
  has_transcript boolean not null default false,
  has_ocr boolean not null default false,
  coverage_ratio double precision check (
    coverage_ratio is null or coverage_ratio between 0 and 1
  ),
  extracted_text_object_key text,
  language text,
  page_count integer check (page_count is null or page_count >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index artifact_extractions_artifact_started_idx
  on artifact_extractions (artifact_id, started_at desc);

create table artifact_upload_sessions (
  artifact_id text primary key references source_artifacts(id) on delete cascade,
  project_id text not null references learning_projects(id) on delete restrict,
  owner_user_id text not null references gon_users(id) on delete restrict,
  token_hash char(64) not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  object_key text not null,
  declared_mime_type text not null,
  declared_byte_size bigint not null check (declared_byte_size >= 0),
  declared_sha256 char(64) not null check (declared_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  uploaded_at timestamptz,
  actual_byte_size bigint check (actual_byte_size is null or actual_byte_size >= 0),
  actual_sha256 char(64) check (
    actual_sha256 is null or actual_sha256 ~ '^[a-f0-9]{64}$'
  ),
  completed_at timestamptz,
  constraint artifact_upload_sessions_uploaded_coherent check (
    uploaded_at is null
    or (actual_byte_size is not null and actual_sha256 is not null)
  )
);

create index artifact_upload_sessions_expiry_idx
  on artifact_upload_sessions (expires_at)
  where completed_at is null;

create table content_chunks (
  id text primary key,
  owner_user_id text references gon_users(id) on delete restrict,
  source_type text not null check (
    source_type in ('source_artifact', 'module_version')
  ),
  source_id text not null,
  artifact_id text references source_artifacts(id) on delete restrict,
  module_version_id text,
  ordinal integer not null check (ordinal >= 0),
  chunk_text text not null,
  locator text not null,
  language text not null default 'vi',
  token_count integer not null check (token_count >= 0),
  content_sha256 char(64) not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  weight double precision not null default 1 check (weight > 0),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(chunk_text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_chunks_source_reference_coherent check (
    (
      source_type = 'source_artifact'
      and artifact_id is not null
      and source_id = artifact_id
      and module_version_id is null
    )
    or (
      source_type = 'module_version'
      and module_version_id is not null
      and source_id = module_version_id
      and artifact_id is null
    )
  )
);

create unique index content_chunks_active_source_ordinal_unique_idx
  on content_chunks (source_type, source_id, ordinal)
  where deleted_at is null;
create index content_chunks_source_idx
  on content_chunks (source_type, source_id, ordinal)
  where deleted_at is null;
create index content_chunks_owner_artifact_idx
  on content_chunks (owner_user_id, artifact_id)
  where deleted_at is null;
create index content_chunks_search_vector_idx
  on content_chunks using gin (search_vector)
  where deleted_at is null;
create index content_chunks_text_trgm_idx
  on content_chunks using gin (chunk_text gin_trgm_ops)
  where deleted_at is null;
create index content_chunks_hash_idx on content_chunks (content_sha256);

create table chunk_embeddings (
  chunk_id text not null references content_chunks(id) on delete cascade,
  embedding_profile text not null,
  provider_model text not null,
  model_version text,
  task_type text not null default 'SEMANTIC_SIMILARITY',
  dimensions integer not null check (dimensions = 768),
  embedding vector(768) not null,
  normalized boolean not null check (normalized),
  index_version text not null default 'gon-semantic-v1',
  created_at timestamptz not null default now(),
  primary key (chunk_id, embedding_profile)
);

create index chunk_embeddings_hnsw_cosine_idx
  on chunk_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

comment on table chunk_embeddings is
  'Internal-only 768D vectors for gon-semantic-v1. Public APIs must never return raw vectors. A dimension/model/task change requires a new embedding_profile and backfill; profiles must never be mixed in one comparison.';
