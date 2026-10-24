import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { PostgresGonStore, PostgresTargetedQueries, type PostgresTransactionRunner } from "@/server/postgres-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * P05-R1.13 integration: the targeted pagination port bound to a POOL-LEVEL
 * executor (outside any Unit of Work — the production wiring in runtime.ts)
 * pages the user-facing ledger/list tables with LIMIT/OFFSET SQL over the
 * real migrations. PGlite is the hermetic PostgreSQL engine only; this does
 * not prove managed-PostgreSQL latency or corpus-scale EXPLAIN plans.
 */
const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let store: PostgresGonStore;
let service: GonService;

async function raw(query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const result = await db.query(query, params as never[]);
  return result.rows as Record<string, unknown>[];
}

async function activate(name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: "req_pglite_targeted_pagination",
  };
  const inviteCode = `GON-PGLITE-PAGE-${name}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode,
  });
  return { user, actor };
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
  expect(files).toHaveLength(10);
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }

  const runner: PostgresTransactionRunner = {
    async transaction(work) {
      return db.transaction(async (tx) =>
        work({
          query: async (text, params) => tx.query(text, params as never[]),
        }),
      );
    },
  };
  store = new PostgresGonStore(runner);
  // Pool-level executor: exactly what runtime.ts binds for production. The
  // port therefore runs OUTSIDE every Unit of Work (no identity-map load).
  const poolExecutor = {
    query: async (text: string, params: unknown[] = []) => db.query(text, params as never[]),
  };
  service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    brewExecutionMode: "queued",
    featureFlags: { brew_enabled: true },
    targetedPagination: new PostgresTargetedQueries(poolExecutor),
  });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL targeted pagination outside the Unit of Work (P05-R1.13)", () => {
  it("pages journeys, commits, XP ledger and proofs with SQL LIMIT/OFFSET and identical semantics", async () => {
    const { user, actor } = await activate("Người học phân trang SQL");

    // One real journey through the domain flow (project -> artifact -> search
    // -> queued Brew -> Fork), so the SQL pages hydrate domain-written rows.
    const project = await service.createProject(actor, {
      title: "Kiến trúc phân trang",
      prompt: "Vì sao danh sách người dùng phải phân trang bằng SQL thay vì load toàn bộ?",
      goal: "Hiểu targeted pagination",
      learningMode: "deep_mastery",
      depth: "standard",
      timeBudgetMinutes: 30,
      locale: "vi-VN",
    }, { idempotencyKey: "page-project-1" });
    const projectId = String(project.data.id);
    await service.addProjectArtifact(actor, projectId, {
      kind: "youtube_url",
      uri: "https://www.youtube.com/watch?v=paginationSqlTest",
      displayName: "Video phân trang",
      rightsBasis: "publicly_available_link",
    });
    const search = await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "page-search-1" });
    const brew = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: String(search.data.id), confirmed: true },
      { idempotencyKey: "page-brew-1" },
    );
    const processed = await service.processQueuedBrewJob(String(brew.data.id), { workerId: "page-worker" });
    expect(processed).toMatchObject({ status: "succeeded" });

    const candidateRows = await raw(
      "select id from output_candidates where project_id = $1 order by created_at limit 1",
      [projectId],
    );
    expect(candidateRows).toHaveLength(1);
    const journey = await service.createJourney(actor, { candidateId: String(candidateRows[0]!.id) });
    const journeyId = String(journey.data.id);

    // Extra fixtures written directly (SQL): more commits, XP entries and
    // proofs with controlled sequences/timestamps/levels.
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      await raw(
        `insert into branch_commits (id, journey_id, parent_commit_id, sequence, type, actor_user_id, payload_ref, summary, created_at)
         values ($1, $2, null, $3, 'system_note', $4, '{}'::jsonb, $5, now())`,
        [`commit_pgpage${sequence}`, journeyId, sequence, user.id, `Ghi chú hệ thống ${sequence}`],
      );
    }
    for (const [index, sequence] of [101, 102, 103, 104].entries()) {
      await raw(
        `insert into xp_ledger_entries (id, user_id, sequence, delta, source_event_id, source_type, source_id, rule_version, formula_version, status, lifetime_xp_after, created_at)
         values ($1, $2, $3, $4, $5, 'manual_test', $6, 'xp-v1', 'gon-level-v1', 'posted', $7, now())`,
        [`xp_pgpage${sequence}`, user.id, sequence, 10, `evt_pgpage${sequence}`, `src_pgpage${index}`, (index + 1) * 10],
      );
    }
    await raw(
      `insert into proofs (id, owner_user_id, proof_type, title, verification_level, status, created_at)
       values ('proof_pgpagea', $1, 'external_link', 'Chứng minh A', 'self_declared', 'active', '2026-10-20T09:00:00Z')`,
      [user.id],
    );
    await raw(
      `insert into proofs (id, owner_user_id, proof_type, title, verification_level, status, created_at)
       values ('proof_pgpageb', $1, 'external_link', 'Chứng minh B', 'source_linked', 'active', '2026-10-22T09:00:00Z')`,
      [user.id],
    );
    await raw(
      `insert into proofs (id, owner_user_id, proof_type, title, verification_level, status, created_at)
       values ('proof_pgpagec', $1, 'external_link', 'Chứng minh C', 'source_linked', 'active', '2026-10-22T09:00:00Z')`,
      [user.id],
    );

    // Journeys: the forked journey, newest-updated first, correct page meta.
    const journeys = await service.listJourneys(actor, { limit: 10 });
    expect(journeys.data.map((item) => item.id)).toEqual([journeyId]);
    expect(journeys.data[0]).toMatchObject({ status: "active", visibility: "private" });
    expect(journeys.page.hasMore).toBe(false);
    expect(journeys.page.nextCursor).toBeNull();

    // Commits: ascending sequence across pages of two (domain fork commit +
    // the four SQL fixtures).
    const commitsPage1 = await service.listJourneyCommits(actor, journeyId, { limit: 2 });
    const sequences: number[] = commitsPage1.data.map((item) => Number(item.sequence));
    let cursor = commitsPage1.page.nextCursor as string | null;
    let guard = 0;
    while (cursor && guard < 10) {
      const next = await service.listJourneyCommits(actor, journeyId, { limit: 2, cursor });
      sequences.push(...next.data.map((item) => Number(item.sequence)));
      cursor = next.page.nextCursor as string | null;
      guard += 1;
    }
    expect(sequences).toEqual([1, 2, 3, 4, 5]);

    // XP ledger: sequence descending, SQL-written rows included.
    const ledger = await service.listMyXpLedger(actor, { limit: 3 });
    expect(ledger.data.map((item) => item.id)).toEqual(["xp_pgpage104", "xp_pgpage103", "xp_pgpage102"]);
    expect(ledger.page.hasMore).toBe(true);
    const ledgerTail = await service.listMyXpLedger(actor, { limit: 3, cursor: ledger.page.nextCursor as string });
    expect(ledgerTail.data.map((item) => item.id)).toEqual(["xp_pgpage101"]);
    expect(ledgerTail.page.hasMore).toBe(false);

    // Proofs: newest first with id tiebreak, level filter narrows rows+total.
    const proofs = await service.listProofs(actor, { limit: 10 });
    expect(proofs.data.map((item) => item.id)).toEqual(["proof_pgpagec", "proof_pgpageb", "proof_pgpagea"]);
    const linked = await service.listProofs(actor, { verificationLevel: "source_linked", limit: 10 });
    expect(linked.data.map((item) => item.id)).toEqual(["proof_pgpagec", "proof_pgpageb"]);
    expect(linked.page.hasMore).toBe(false);

    // Account gate through the port: suspended accounts get the same 403 as
    // the Unit-of-Work path.
    await raw("update gon_users set status = 'suspended' where id = $1", [user.id]);
    await expect(service.listJourneys(actor, {})).rejects.toMatchObject({ status: 403 });
    await raw("update gon_users set status = 'active' where id = $1", [user.id]);
    const restored = await service.listJourneys(actor, { limit: 10 });
    expect(restored.data.map((item) => item.id)).toEqual([journeyId]);
  }, 240_000);
});
