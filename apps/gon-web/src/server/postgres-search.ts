import { EMBEDDING_DIMENSIONS, EMBEDDING_PROFILE } from "./embeddings";
import type { GroundingStatus, SearchResultRecord } from "./types";

/**
 * Minimal query surface shared by node-postgres (`Pool`/`Client`) and the
 * PGlite integration-test harness. Keeping this boundary intentionally small
 * lets the production Search repository be exercised against a real
 * PostgreSQL engine without coupling domain code to a test driver.
 */
export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface PostgresHybridSearchInput {
  actorUserId: string;
  queryText: string;
  queryEmbedding: readonly number[];
  conceptIds?: readonly string[];
  limit?: number;
  candidatePoolSize?: number;
  minimumHybridScore?: number;
}

export interface PostgresHybridSearchOutput {
  results: SearchResultRecord[];
  latencyMs: number;
}

interface HybridSearchRow {
  module_version_id: unknown;
  title: unknown;
  grounding_status: unknown;
  vector_score: unknown;
  lexical_score: unknown;
  concept_coverage: unknown;
  specificity_score: unknown;
  quality_score: unknown;
  hybrid_score: unknown;
  matched_concept_ids: unknown;
}

const CONCEPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function validateEmbeddingVector(
  vector: readonly number[],
  expectedDimensions = EMBEDDING_DIMENSIONS,
): number[] {
  if (!Array.isArray(vector) || vector.length !== expectedDimensions) {
    throw new Error(`Embedding must contain exactly ${expectedDimensions} dimensions`);
  }
  const values = vector.map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding contained a non-finite value");
  }
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("Embedding must not be a zero vector");
  }
  return values.map((value) => value / norm);
}

export function formatPostgresVector(vector: readonly number[]): string {
  const normalized = validateEmbeddingVector(vector);
  return `[${normalized.map((value) => value.toPrecision(10)).join(",")}]`;
}

function clamp01(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeConceptIds(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (unique.length > 50) throw new Error("At most 50 concept IDs may be searched at once");
  for (const conceptId of unique) {
    if (!CONCEPT_ID_PATTERN.test(conceptId)) throw new Error(`Invalid concept ID: ${conceptId}`);
  }
  return unique;
}

export function formatPostgresTextArray(values: readonly string[]): string {
  // Concept IDs have already passed a strict allowlist pattern. Encoding the
  // literal explicitly keeps behavior identical across node-postgres and the
  // PGlite protocol serializer, whose inferred array parameter handling can
  // otherwise differ inside CTEs.
  return `{${values.map((value) => `"${value.replace(/["\\]/g, "\\$&")}"`).join(",")}}`;
}

function integerInRange(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [trimmed];
}

function groundingStatus(value: unknown): GroundingStatus {
  return value === "partially_cited" || value === "citation_checked" ? value : "unverified";
}

/**
 * Authorization is applied in `authorized_chunks` and in every candidate
 * branch before `ORDER BY ... LIMIT`. A private module belonging to another
 * learner can therefore neither appear in the output nor consume a candidate
 * slot that should have gone to a visible module.
 */
export const POSTGRES_HYBRID_SEARCH_SQL = `
with params as (
  select
    $1::text as actor_user_id,
    $2::vector as query_embedding,
    $3::text as query_text,
    $4::text[] as concept_ids,
    $5::text as embedding_profile,
    $6::integer as candidate_pool_size
),
authorized_chunks as (
  select
    mv.id as module_version_id,
    mv.title,
    mv.grounding_status,
    c.id as chunk_id,
    c.search_vector,
    ce.embedding,
    greatest(0::double precision, least(1::double precision,
      1 - (ce.embedding <=> (select query_embedding from params))
    )) as vector_score,
    least(1::double precision,
      ts_rank(c.search_vector, plainto_tsquery('simple', (select query_text from params))) * 5
    ) as lexical_score
  from module_versions mv
  join modules m on m.id = mv.module_id
  join content_chunks c
    on c.module_version_id = mv.id
   and c.source_type = 'module_version'
   and c.deleted_at is null
  join chunk_embeddings ce
    on ce.chunk_id = c.id
   and ce.embedding_profile = (select embedding_profile from params)
   and ce.dimensions = 768
   and ce.normalized
  where mv.publication_status not in ('hidden', 'retired')
    and (
      m.owner_user_id = (select actor_user_id from params)
      or (
        mv.visibility = 'internal_reviewed'
        and mv.publication_status = 'internal_reviewed'
      )
    )
),
vector_candidates as (
  select module_version_id
  from authorized_chunks
  order by embedding <=> (select query_embedding from params), module_version_id
  limit (select candidate_pool_size from params)
),
lexical_candidates as (
  select module_version_id
  from authorized_chunks
  where search_vector @@ plainto_tsquery('simple', (select query_text from params))
  order by lexical_score desc, module_version_id
  limit (select candidate_pool_size from params)
),
concept_candidates as (
  select ac.module_version_id
  from authorized_chunks ac
  join module_concepts mc on mc.module_version_id = ac.module_version_id
  where cardinality((select concept_ids from params)) > 0
    and mc.concept_id = any((select concept_ids from params)::text[])
  group by ac.module_version_id
  order by count(distinct mc.concept_id) desc, ac.module_version_id
  limit (select candidate_pool_size from params)
),
candidate_modules as (
  select module_version_id from vector_candidates
  union
  select module_version_id from lexical_candidates
  union
  select module_version_id from concept_candidates
),
chunk_scores as (
  select
    ac.module_version_id,
    max(ac.title) as title,
    max(ac.grounding_status) as grounding_status,
    max(ac.vector_score) as vector_score,
    max(ac.lexical_score) as lexical_score
  from authorized_chunks ac
  join candidate_modules cm on cm.module_version_id = ac.module_version_id
  group by ac.module_version_id
),
concept_scores as (
  select
    cs.module_version_id,
    coalesce(array_agg(distinct mc.concept_id) filter (
      where mc.concept_id = any((select concept_ids from params)::text[])
    ), '{}'::text[]) as matched_concept_ids,
    case
      when cardinality((select concept_ids from params)) = 0 then 0::double precision
      else count(distinct mc.concept_id) filter (
        where mc.concept_id = any((select concept_ids from params)::text[])
      )::double precision / cardinality((select concept_ids from params))
    end as concept_coverage
  from chunk_scores cs
  left join module_concepts mc on mc.module_version_id = cs.module_version_id
  group by cs.module_version_id
),
scored as (
  select
    cs.module_version_id,
    cs.title,
    cs.grounding_status,
    cs.vector_score,
    cs.lexical_score,
    cps.concept_coverage,
    greatest(
      similarity(cs.title, (select query_text from params)),
      case when position(lower((select query_text from params)) in lower(cs.title)) > 0 then 1 else 0 end
    ) as specificity_score,
    case cs.grounding_status
      when 'citation_checked' then 1::double precision
      when 'partially_cited' then 0.7::double precision
      else 0.35::double precision
    end as quality_score,
    cps.matched_concept_ids
  from chunk_scores cs
  join concept_scores cps on cps.module_version_id = cs.module_version_id
)
select
  module_version_id,
  title,
  grounding_status,
  vector_score,
  lexical_score,
  concept_coverage,
  specificity_score,
  quality_score,
  (
    0.50 * vector_score
    + 0.15 * lexical_score
    + 0.25 * concept_coverage
    + 0.05 * specificity_score
    + 0.05 * quality_score
  ) as hybrid_score,
  matched_concept_ids
from scored
where (
    0.50 * vector_score
    + 0.15 * lexical_score
    + 0.25 * concept_coverage
    + 0.05 * specificity_score
    + 0.05 * quality_score
  ) >= $7::double precision
order by hybrid_score desc, module_version_id
limit $8::integer
`;

export class PostgresHybridSearchRepository {
  constructor(private readonly executor: SqlExecutor) {}

  async search(input: PostgresHybridSearchInput): Promise<PostgresHybridSearchOutput> {
    const actorUserId = input.actorUserId.trim();
    if (!actorUserId || actorUserId.length > 200) throw new Error("actorUserId is required");

    const queryText = input.queryText.trim();
    if (!queryText || queryText.length > 16_000) {
      throw new Error("queryText must contain between 1 and 16000 characters");
    }

    const conceptIds = normalizeConceptIds(input.conceptIds);
    const limit = integerInRange(input.limit, 5, 1, 20, "limit");
    const candidatePoolSize = integerInRange(
      input.candidatePoolSize,
      100,
      10,
      500,
      "candidatePoolSize",
    );
    const minimumHybridScore = input.minimumHybridScore ?? 0;
    if (!Number.isFinite(minimumHybridScore) || minimumHybridScore < 0 || minimumHybridScore > 1) {
      throw new Error("minimumHybridScore must be between 0 and 1");
    }

    const startedAt = performance.now();
    const { rows } = await this.executor.query(POSTGRES_HYBRID_SEARCH_SQL, [
      actorUserId,
      formatPostgresVector(input.queryEmbedding),
      queryText,
      formatPostgresTextArray(conceptIds),
      EMBEDDING_PROFILE,
      candidatePoolSize,
      minimumHybridScore,
      limit,
    ]);

    const results = (rows as HybridSearchRow[]).map((row, index): SearchResultRecord => {
      const vector = clamp01(row.vector_score);
      const lexical = clamp01(row.lexical_score);
      const conceptCoverage = clamp01(row.concept_coverage);
      const specificity = clamp01(row.specificity_score);
      const quality = clamp01(row.quality_score);
      const hybrid = clamp01(row.hybrid_score);
      const matchedConceptIds = stringArray(row.matched_concept_ids);
      const sourceStatus = groundingStatus(row.grounding_status);

      return {
        moduleVersionId: String(row.module_version_id),
        rank: index + 1,
        title: String(row.title),
        sourceStatus,
        reasonCodes: [
          ...(conceptCoverage >= 0.8 ? ["same_core_concepts"] : []),
          ...(vector >= 0.65 ? ["same_source_topic"] : []),
          ...(conceptIds.some((conceptId) => !matchedConceptIds.includes(conceptId))
            ? ["missing_artifact_outcome"]
            : []),
          ...(sourceStatus !== "citation_checked" ? ["source_needs_review"] : []),
        ],
        matchedConcepts: matchedConceptIds,
        missingConcepts: conceptIds.filter((conceptId) => !matchedConceptIds.includes(conceptId)),
        internalScores: { vector, lexical, conceptCoverage, specificity, quality, hybrid },
      };
    });

    return { results, latencyMs: Math.max(0, performance.now() - startedAt) };
  }
}
