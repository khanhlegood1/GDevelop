#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import process from "node:process";
import pg from "pg";

/**
 * S-P03-01 executable fixture.
 *
 * Everything runs in one transaction and is rolled back. It is designed to
 * prove, against a real migrated PostgreSQL database:
 *   1. vector(768) + lexical + concept signals can be queried together;
 *   2. authorization filtering happens before ORDER BY/LIMIT;
 *   3. another learner's draft_private module is invisible;
 *   4. internal_reviewed changes visibility only through status transition;
 *   5. tombstoning chunks makes artifact/module evidence disappear.
 *
 * `--dry-run` only verifies this script loads. It is NOT a spike pass.
 */

const dryRun = process.argv.includes("--dry-run");
const suffix = `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
const id = (prefix, discriminator) => `${prefix}_${suffix}${discriminator}`;

function vectorLiteral(weights) {
  const vector = Array.from({ length: 768 }, () => 0);
  for (const [index, value] of Object.entries(weights)) {
    vector[Number(index)] = value;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return `[${vector.map((value) => (value / norm).toFixed(8)).join(",")}]`;
}

const HYBRID_SEARCH_SQL = `
with chunk_scores as (
  select
    mv.id as module_version_id,
    mv.title,
    mv.grounding_status,
    max(1 - (ce.embedding <=> $2::vector)) as vector_score,
    max(ts_rank(c.search_vector, plainto_tsquery('simple', $3))) as lexical_raw
  from module_versions mv
  join modules m on m.id = mv.module_id
  join content_chunks c
    on c.module_version_id = mv.id
   and c.source_type = 'module_version'
   and c.deleted_at is null
  join chunk_embeddings ce
    on ce.chunk_id = c.id
   and ce.embedding_profile = 'gon-semantic-v1'
   and ce.dimensions = 768
   and ce.normalized
  where
    (
      mv.visibility = 'private'
      and mv.publication_status = 'draft_private'
      and m.owner_user_id = $1
    )
    or (
      mv.visibility = 'internal_reviewed'
      and mv.publication_status = 'internal_reviewed'
    )
  group by mv.id, mv.title, mv.grounding_status
), scored as (
  select
    cs.module_version_id,
    cs.title,
    cs.vector_score,
    least(1, cs.lexical_raw * 5) as lexical_score,
    coalesce((
      select count(distinct mc.concept_id)::double precision
             / nullif(cardinality($4::text[]), 0)
      from module_concepts mc
      where mc.module_version_id = cs.module_version_id
        and mc.concept_id = any($4::text[])
    ), 0) as concept_coverage,
    case
      when position(lower($3) in lower(cs.title)) > 0 then 1
      else 0
    end as specificity_score,
    case cs.grounding_status
      when 'citation_checked' then 1
      when 'partially_cited' then 0.6
      else 0.25
    end as quality_score
  from chunk_scores cs
)
select
  module_version_id,
  title,
  vector_score,
  lexical_score,
  concept_coverage,
  specificity_score,
  quality_score,
  (
    0.50 * greatest(0, vector_score)
    + 0.15 * lexical_score
    + 0.25 * concept_coverage
    + 0.05 * specificity_score
    + 0.05 * quality_score
  ) as hybrid_score
from scored
order by hybrid_score desc, module_version_id
limit 20
`;

function minimalGraph(title) {
  return {
    schemaVersion: "gon.module-graph/1.0",
    module: {
      title,
      summary: "Fixture tối thiểu cho S-P03-01.",
      locale: "vi-VN",
      estimatedMinutes: 15,
      difficulty: "beginner",
      outcomes: [
        {
          id: "outcome_fixture",
          statement: "Kiểm chứng hybrid search có authorization filter.",
          conceptIds: ["content_diffusion"],
        },
      ],
      concepts: [
        {
          id: "content_diffusion",
          name: "Lan truyền nội dung",
          description: "Fixture concept.",
          role: "core",
        },
      ],
      prerequisites: [],
      safetyNotices: [],
    },
    sources: [],
    nodes: [],
    edges: [],
    rubrics: [],
    renderTargets: ["web"],
    provenance: {
      createdByType: "system_seed",
      sourceArtifactIds: [],
      attribution: { displayName: "S-P03-01 fixture" },
    },
    quality: { citationCoverage: 0, unverifiedClaimIds: [] },
  };
}

async function insertFixture(client) {
  const ownerId = id("usr", "a");
  const otherId = id("usr", "b");
  const ownerProjectId = id("prj", "a");
  const otherProjectId = id("prj", "b");
  const ownerArtifactId = id("art", "a");
  const otherArtifactId = id("art", "b");
  const ownerModuleId = id("mod", "a");
  const otherModuleId = id("mod", "b");
  const ownerVersionId = id("modv", "a");
  const otherVersionId = id("modv", "b");
  const ownerArtifactChunkId = `chunk_${suffix}artifact`;
  const ownerModuleChunkId = `chunk_${suffix}owner`;
  const otherModuleChunkId = `chunk_${suffix}other`;
  const hash = "a".repeat(64);

  await client.query(
    `insert into gon_users (id, status) values ($1, 'active'), ($2, 'active')`,
    [ownerId, otherId],
  );
  await client.query(
    `insert into concepts (id, slug, canonical_name)
     values ('content_diffusion', 'content-diffusion', 'Lan truyền nội dung'),
            ('evidence_limits', 'evidence-limits', 'Bằng chứng và giới hạn')
     on conflict (id) do nothing`,
  );

  for (const [projectId, userId, artifactId] of [
    [ownerProjectId, ownerId, ownerArtifactId],
    [otherProjectId, otherId, otherArtifactId],
  ]) {
    await client.query(
      `insert into learning_projects
        (id, owner_user_id, title, goal, raw_prompt_artifact_id, learning_mode, time_budget_minutes)
       values ($1, $2, 'Fixture hybrid search', 'Chứng minh search authorization', $3, 'deep_mastery', 15)`,
      [projectId, userId, artifactId],
    );
    await client.query(
      `insert into source_artifacts
        (id, project_id, owner_user_id, kind, display_name, sha256, rights_basis,
         source_text, safety_status, extraction_status, coverage)
       values ($1, $2, $3, 'text', 'Prompt fixture', $4, 'created_by_user',
               'Lan truyền nội dung cần bằng chứng và giới hạn.', 'allowed', 'ready',
               '{"hasMetadata":true,"hasText":true,"hasTranscript":false,"chunkCount":1}'::jsonb)`,
      [artifactId, projectId, userId, hash],
    );
  }

  await client.query(
    `insert into content_chunks
      (id, owner_user_id, source_type, source_id, artifact_id, ordinal, chunk_text,
       locator, token_count, content_sha256)
     values ($1, $2, 'source_artifact', $3, $3, 0,
             'Lan truyền nội dung cần bằng chứng và giới hạn.', 'prompt', 9, $4)`,
    [ownerArtifactChunkId, ownerId, ownerArtifactId, hash],
  );

  const moduleRows = [
    {
      moduleId: ownerModuleId,
      versionId: ownerVersionId,
      userId: ownerId,
      title: "Lan truyền nội dung bằng bằng chứng",
      chunkId: ownerModuleChunkId,
      vector: vectorLiteral({ 0: 0.95, 1: 0.31 }),
    },
    {
      moduleId: otherModuleId,
      versionId: otherVersionId,
      userId: otherId,
      title: "Lan truyền nội dung trong cộng đồng khác",
      chunkId: otherModuleChunkId,
      vector: vectorLiteral({ 0: 0.99, 2: 0.14 }),
    },
  ];

  for (const row of moduleRows) {
    await client.query(
      `insert into modules (id, owner_user_id, creator_type, attribution_snapshot)
       values ($1, $2, 'system_seed', '{"displayName":"S-P03-01 fixture"}'::jsonb)`,
      [row.moduleId, row.userId],
    );
    await client.query(
      `insert into module_versions
        (id, module_id, version_number, graph_schema_version, graph, title, summary, estimated_minutes,
         difficulty, visibility, publication_status, grounding_status,
         content_sha256, created_by_user_id)
       values ($1, $2, 1, 'gon.module-graph/1.0', $3::jsonb, $4, 'Fixture module', 15, 'beginner',
               'private', 'draft_private', 'partially_cited', $5, $6)`,
      [
        row.versionId,
        row.moduleId,
        JSON.stringify(minimalGraph(row.title)),
        row.title,
        hash,
        row.userId,
      ],
    );
    await client.query(
      `insert into module_concepts (module_version_id, concept_id, role)
       values ($1, 'content_diffusion', 'core'), ($1, 'evidence_limits', 'core')`,
      [row.versionId],
    );
    await client.query(
      `insert into content_chunks
        (id, owner_user_id, source_type, source_id, module_version_id, ordinal,
         chunk_text, locator, token_count, content_sha256)
       values ($1, $2, 'module_version', $3, $3, 0,
               'Lan truyền nội dung phụ thuộc mạng lưới, thời điểm, bằng chứng và giới hạn.',
               'concept', 14, $4)`,
      [row.chunkId, row.userId, row.versionId, hash],
    );
    await client.query(
      `insert into chunk_embeddings
        (chunk_id, embedding_profile, provider_model, task_type, dimensions, embedding, normalized)
       values ($1, 'gon-semantic-v1', 'fixture-local', 'SEMANTIC_SIMILARITY', 768, $2::vector, true)`,
      [row.chunkId, row.vector],
    );
  }

  return {
    ownerId,
    otherId,
    ownerArtifactId,
    ownerArtifactChunkId,
    ownerModuleChunkId,
    ownerVersionId,
    otherVersionId,
  };
}

async function hybridSearch(client, actorUserId) {
  const startedAt = performance.now();
  const result = await client.query(HYBRID_SEARCH_SQL, [
    actorUserId,
    vectorLiteral({ 0: 1 }),
    "lan truyền nội dung",
    ["content_diffusion", "evidence_limits"],
  ]);
  return { rows: result.rows, latencyMs: performance.now() - startedAt };
}

async function main() {
  if (dryRun) {
    console.log(
      "S-P03-01 dry-run only: script and hybrid query loaded; no PostgreSQL evidence was produced.",
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. S-P03-01 remains NOT RUN.");
    process.exitCode = 2;
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    const fixture = await insertFixture(client);

    const beforePublish = await hybridSearch(client, fixture.ownerId);
    const beforeIds = beforePublish.rows.map((row) => row.module_version_id);
    assert.ok(beforeIds.includes(fixture.ownerVersionId), "owner private module must be searchable");
    assert.ok(!beforeIds.includes(fixture.otherVersionId), "other draft_private module leaked");

    await client.query(
      `update module_versions
          set visibility = 'internal_reviewed', publication_status = 'internal_reviewed'
        where id = $1`,
      [fixture.otherVersionId],
    );
    const afterPublish = await hybridSearch(client, fixture.ownerId);
    assert.ok(
      afterPublish.rows.some((row) => row.module_version_id === fixture.otherVersionId),
      "internal_reviewed module should become searchable",
    );

    const artifactBefore = await client.query(
      `select count(*)::int as count
         from content_chunks
        where owner_user_id = $1 and artifact_id = $2 and deleted_at is null`,
      [fixture.ownerId, fixture.ownerArtifactId],
    );
    assert.equal(artifactBefore.rows[0].count, 1);

    await client.query(
      `update source_artifacts set deleted_at = now() where id = $1`,
      [fixture.ownerArtifactId],
    );
    await client.query(
      `update content_chunks set deleted_at = now() where id = $1`,
      [fixture.ownerArtifactChunkId],
    );
    const artifactAfter = await client.query(
      `select count(*)::int as count
         from content_chunks
        where owner_user_id = $1 and artifact_id = $2 and deleted_at is null`,
      [fixture.ownerId, fixture.ownerArtifactId],
    );
    assert.equal(artifactAfter.rows[0].count, 0, "deleted artifact chunk remained visible");

    await client.query(
      `update content_chunks set deleted_at = now() where id = $1`,
      [fixture.ownerModuleChunkId],
    );
    const afterDelete = await hybridSearch(client, fixture.ownerId);
    assert.ok(
      !afterDelete.rows.some((row) => row.module_version_id === fixture.ownerVersionId),
      "module remained searchable after its only chunk was tombstoned",
    );

    console.log(
      JSON.stringify(
        {
          spike: "S-P03-01",
          result: "passed",
          fixtureLatencyMs: Number(beforePublish.latencyMs.toFixed(2)),
          note: "Fixture latency is not a production latency claim. P05 must benchmark representative data.",
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await client.query("rollback");
    } finally {
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
