import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  formatPostgresVector,
  PostgresHybridSearchRepository,
} from "@/server/postgres-search";

/**
 * This is an executable PostgreSQL integration test, not a SQL-string test.
 * PGlite is a WASM PostgreSQL engine used only as a hermetic test harness;
 * production continues to use node-postgres against the managed PostgreSQL
 * selected in P06. The test therefore proves migration/query compatibility,
 * not Cloud SQL latency, IAM, backup or network behavior.
 */
const suffix = "pglite2026";
const ownerId = `usr_${suffix}owner`;
const strangerId = `usr_${suffix}other`;
const ownerModuleId = `mod_${suffix}owner`;
const ownerVersionId = `modv_${suffix}owner`;
const ownerChunkId = `chunk_${suffix}owner`;
const hash = "a".repeat(64);
const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let repository: PostgresHybridSearchRepository;

function sparseVector(weights: Record<number, number>): number[] {
  const values = Array.from({ length: 768 }, () => 0);
  for (const [index, value] of Object.entries(weights)) values[Number(index)] = value;
  return values;
}

function graph(title: string): string {
  return JSON.stringify({
    schemaVersion: "gon.module-graph/1.0",
    module: {
      title,
      summary: "PGlite integration fixture",
      locale: "vi-VN",
      estimatedMinutes: 15,
      difficulty: "beginner",
      outcomes: [],
      concepts: [],
      prerequisites: [],
      safetyNotices: [],
    },
    sources: [],
    nodes: [],
    edges: [],
    rubrics: [],
    renderTargets: ["web"],
    provenance: { createdByType: "system_seed" },
    quality: { citationCoverage: 0, unverifiedClaimIds: [] },
  });
}

async function insertModule(input: {
  moduleId: string;
  versionId: string;
  chunkId: string;
  ownerId: string;
  title: string;
  vector: number[];
  conceptIds?: string[];
}) {
  await db.query(
    `insert into modules (id, owner_user_id, creator_type, attribution_snapshot)
     values ($1, $2, 'system_seed', '{"displayName":"PGlite fixture"}'::jsonb)`,
    [input.moduleId, input.ownerId],
  );
  await db.query(
    `insert into module_versions
       (id, module_id, version_number, graph_schema_version, graph, title, summary, estimated_minutes,
        difficulty, visibility, publication_status, grounding_status,
        content_sha256, created_by_user_id)
     values ($1, $2, 1, 'gon.module-graph/1.0', $3::jsonb, $4, 'Fixture module', 15, 'beginner',
             'private', 'draft_private', 'citation_checked', $5, $6)`,
    [input.versionId, input.moduleId, graph(input.title), input.title, hash, input.ownerId],
  );
  await db.query(
    `insert into content_chunks
       (id, owner_user_id, source_type, source_id, module_version_id, ordinal,
        chunk_text, locator, token_count, content_sha256)
     values ($1, $2, 'module_version', $3, $3, 0,
             'Lan truyền nội dung phụ thuộc mạng lưới thời điểm bằng chứng và giới hạn.',
             'concept', 14, $4)`,
    [input.chunkId, input.ownerId, input.versionId, hash],
  );
  await db.query(
    `insert into chunk_embeddings
       (chunk_id, embedding_profile, provider_model, task_type, dimensions, embedding, normalized)
     values ($1, 'gon-semantic-v1', 'pglite-fixture', 'SEMANTIC_SIMILARITY', 768, $2::vector, true)`,
    [input.chunkId, formatPostgresVector(input.vector)],
  );
  for (const conceptId of input.conceptIds ?? []) {
    await db.query(
      "insert into module_concepts (module_version_id, concept_id, role) values ($1, $2, 'core')",
      [input.versionId, conceptId],
    );
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  repository = new PostgresHybridSearchRepository({
    query: async (text, params) => db.query(text, params),
  });

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
  expect(files).toHaveLength(7);
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }

  await db.query("insert into gon_users (id, status) values ($1, 'active'), ($2, 'active')", [
    ownerId,
    strangerId,
  ]);
  await db.query(
    `insert into concepts (id, slug, canonical_name) values
       ('content_diffusion', 'content-diffusion', 'Lan truyền nội dung'),
       ('evidence_limits', 'evidence-limits', 'Bằng chứng và giới hạn')`,
  );

  await insertModule({
    moduleId: ownerModuleId,
    versionId: ownerVersionId,
    chunkId: ownerChunkId,
    ownerId,
    title: "Lan truyền nội dung bằng bằng chứng",
    vector: sparseVector({ 0: 0.8, 1: 0.6 }),
    conceptIds: ["content_diffusion", "evidence_limits"],
  });

  // Eleven invisible modules are all vector-closer than the owner's module.
  // With a candidate pool of ten, the owner can only survive candidate
  // generation if authorization is applied before LIMIT in every branch.
  for (let index = 0; index < 11; index += 1) {
    await insertModule({
      moduleId: `mod_${suffix}other${index}`,
      versionId: `modv_${suffix}other${index}`,
      chunkId: `chunk_${suffix}other${index}`,
      ownerId: strangerId,
      title: `Module riêng tư ${index}`,
      vector: sparseVector({ 0: 0.999 - index * 0.0001, 2: 0.01 + index * 0.0001 }),
    });
  }
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL migrations and hybrid Search (PGlite execution)", () => {
  it("applies all seven migrations with pgvector/pg_trgm available", async () => {
    const extensions = await db.query<{ extname: string }>(
      `select extname from pg_extension
        where extname in ('vector', 'pg_trgm', 'pgcrypto', 'unaccent')
        order by extname`,
    );
    expect(extensions.rows.map((row) => row.extname)).toEqual([
      "pg_trgm",
      "pgcrypto",
      "unaccent",
      "vector",
    ]);

    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('gon_users', 'content_chunks', 'chunk_embeddings', 'module_versions')
        order by table_name`,
    );
    expect(tables.rows).toHaveLength(4);
  }, 30_000);

  it("applies authorization before vector candidate LIMIT", async () => {
    const output = await repository.search({
      actorUserId: ownerId,
      // A token absent from every chunk prevents the lexical branch from
      // rescuing the owner module; this assertion isolates vector ordering.
      queryText: "zzzzuniqueunmatchedtoken",
      queryEmbedding: sparseVector({ 0: 1 }),
      candidatePoolSize: 10,
      limit: 1,
    });

    expect(output.results.map((result) => result.moduleVersionId)).toEqual([ownerVersionId]);
    expect(output.latencyMs).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("combines vector, lexical and concept signals for a visible module", async () => {
    const output = await repository.search({
      actorUserId: ownerId,
      queryText: "lan truyền nội dung bằng chứng giới hạn",
      queryEmbedding: sparseVector({ 0: 0.8, 1: 0.6 }),
      conceptIds: ["content_diffusion", "evidence_limits"],
      limit: 5,
    });

    expect(output.results[0]).toMatchObject({
      moduleVersionId: ownerVersionId,
      matchedConcepts: ["content_diffusion", "evidence_limits"],
      missingConcepts: [],
    });
    expect(output.results[0].internalScores.vector).toBeGreaterThan(0.99);
    expect(output.results[0].internalScores.lexical).toBeGreaterThan(0);
    expect(output.results[0].internalScores.conceptCoverage).toBe(1);
  }, 30_000);

  it("makes another learner module searchable only after internal review", async () => {
    const publishedVersionId = `modv_${suffix}other0`;
    await db.query(
      `update module_versions
          set visibility = 'internal_reviewed', publication_status = 'internal_reviewed'
        where id = $1`,
      [publishedVersionId],
    );

    const output = await repository.search({
      actorUserId: ownerId,
      queryText: "zzzzuniqueunmatchedtoken",
      queryEmbedding: sparseVector({ 0: 1 }),
      limit: 5,
    });
    expect(output.results.map((result) => result.moduleVersionId)).toContain(publishedVersionId);
  }, 30_000);

  it("removes a module when its only searchable chunk is tombstoned", async () => {
    await db.query("update content_chunks set deleted_at = now() where id = $1", [ownerChunkId]);
    const output = await repository.search({
      actorUserId: ownerId,
      queryText: "lan truyền nội dung bằng chứng giới hạn",
      queryEmbedding: sparseVector({ 0: 0.8, 1: 0.6 }),
      conceptIds: ["content_diffusion", "evidence_limits"],
      limit: 5,
    });
    expect(output.results.map((result) => result.moduleVersionId)).not.toContain(ownerVersionId);
  }, 30_000);
});
