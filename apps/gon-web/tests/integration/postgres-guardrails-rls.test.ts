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
import { PostgresTargetedQueries, PostgresGonStore, type PostgresTransactionRunner } from "@/server/postgres-store";
import type { SqlExecutor } from "@/server/postgres-search";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let executor: SqlExecutor;
let store: PostgresGonStore;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
}

async function execMigrations(target: PGlite, files: string[]): Promise<void> {
  for (const file of files) {
    await target.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }
}

async function countRows(where = "true", params: unknown[] = []): Promise<number> {
  const result = await db.query(
    `select count(*)::int as count from quota_reservations where ${where}`,
    params as never[],
  );
  return Number((result.rows[0] as { count: number | string }).count);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  await execMigrations(db, await migrationFiles());

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
  executor = { query: async (text, params = []) => db.query(text, params as never[]) };
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("quota history backfill (migration 0008)", () => {
  it("backfills count-quota history idempotently from domain rows", async () => {
    // A second database seeded with domain rows BEFORE 0008 proves the
    // backfill keeps quota accounting continuous across the deploy.
    const seedDb = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
    try {
      const files = await migrationFiles();
      await execMigrations(seedDb, files.filter((file) => !file.startsWith("0008_")));

      await seedDb.exec(`
        begin;
        insert into gon_users (id, status) values ('usr_bfa', 'active'), ('usr_bfb', 'active');
        insert into learning_projects
          (id, owner_user_id, title, goal, raw_prompt_artifact_id, learning_mode, time_budget_minutes)
        values
          ('prj_xbfa', 'usr_bfa', 'Backfill A', 'Goal A', 'art_xbfa', 'deep_mastery', 30),
          ('prj_xbfb', 'usr_bfb', 'Backfill B', 'Goal B', 'art_xbfb', 'deep_mastery', 30);
        insert into source_artifacts
          (id, project_id, owner_user_id, kind, display_name, sha256, rights_basis, safety_status,
           extraction_status, source_text, created_at)
        values
          ('art_xbfa', 'prj_xbfa', 'usr_bfa', 'text', 'Prompt A', repeat('a', 64), 'created_by_user',
           'allowed', 'ready', 'Prompt A text', now() - interval '2 hours'),
          ('art_xbfb', 'prj_xbfb', 'usr_bfb', 'text', 'Prompt B', repeat('b', 64), 'created_by_user',
           'allowed', 'ready', 'Prompt B text', now() - interval '2 hours');
        insert into search_attempts
          (id, project_id, owner_user_id, status, verdict, search_policy_version, embedding_profile,
           created_at, completed_at)
        values
          ('srch_xbfa1', 'prj_xbfa', 'usr_bfa', 'completed', 'missing', 'gon.search/1.0',
           'local-hash-768d', now() - interval '90 minutes', now() - interval '89 minutes'),
          ('srch_xbfa2', 'prj_xbfa', 'usr_bfa', 'completed', 'missing', 'gon.search/1.0',
           'local-hash-768d', now() - interval '30 minutes', now() - interval '29 minutes');
        insert into async_jobs
          (id, job_type, owner_user_id, aggregate_type, aggregate_id, status, idempotency_key,
           input_fingerprint, created_at)
        values
          ('job_xbfa1', 'brew_module', 'usr_bfa', 'learning_project', 'prj_xbfa', 'queued',
           'idem-backfill-0001', repeat('c', 64), now() - interval '60 minutes');
        commit;
      `);

      await execMigrations(seedDb, files.filter((file) => file.startsWith("0008_")));

      const byKey = async (key: string) =>
        (await seedDb.query(
          "select id, user_id, status, job_id, window_start, window_end, reserved_units, consumed_units from quota_reservations where quota_key = $1 order by id",
          [key],
        )).rows as Record<string, unknown>[];

      const searches = await byKey("search_per_hour");
      expect(searches).toHaveLength(2);
      expect(searches.every((row) => row.user_id === "usr_bfa")).toBe(true);
      expect(searches.every((row) => row.status === "consumed")).toBe(true);
      expect(searches.every((row) => String(row.id).startsWith("qrsv_bf1_"))).toBe(true);

      const brews = await byKey("brew_per_day");
      expect(brews).toHaveLength(1);
      expect(brews[0]).toMatchObject({ user_id: "usr_bfa", job_id: "job_xbfa1", status: "consumed" });

      const artifacts = await byKey("artifact_per_day");
      expect(artifacts).toHaveLength(2);
      expect(artifacts.map((row) => row.user_id).sort()).toEqual(["usr_bfa", "usr_bfb"]);

      // Rerun the backfill statements exactly as written: deterministic ids
      // make the backfill idempotent.
      const migrationSql = await readFile(path.join(migrationsDir, "0008_guardrails_targeted_queries_rls.sql"), "utf8");
      const backfills = migrationSql.match(/insert into quota_reservations[\s\S]*?on conflict \(id\) do nothing;/g);
      expect(backfills).toHaveLength(3);
      for (const statement of backfills!) await seedDb.exec(statement);
      expect(await byKey("search_per_hour")).toHaveLength(2);
      expect(await byKey("brew_per_day")).toHaveLength(1);
      expect(await byKey("artifact_per_day")).toHaveLength(2);
    } finally {
      await seedDb.close();
    }
  }, 240_000);
});

describe("targeted guardrail queries over PostgreSQL (PGlite execution)", () => {
  const userId = "usr_r16quota";

  it("reserves against the window limit atomically and settles/refunds budget rows", async () => {
    await db.query("insert into gon_users (id, status) values ($1, 'active')", [userId]);
    const queries = new PostgresTargetedQueries(executor);
    const window = { windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-02T00:00:00.000Z" };

    const first = await queries.reserveQuotaUnits({
      userId,
      quotaKey: "brew_per_day",
      ...window,
      units: 1,
      limit: 2,
      mode: "consume",
      createdAt: new Date().toISOString(),
    });
    expect(first).toMatchObject({ reserved: true, usedUnitsBefore: 0, usedUnitsAfter: 1 });

    const second = await queries.reserveQuotaUnits({
      userId,
      quotaKey: "brew_per_day",
      ...window,
      units: 1,
      limit: 2,
      mode: "consume",
      createdAt: new Date().toISOString(),
    });
    expect(second).toMatchObject({ reserved: true, usedUnitsAfter: 2 });

    // Third insert is rejected inside the same statement (no row written).
    const third = await queries.reserveQuotaUnits({
      userId,
      quotaKey: "brew_per_day",
      ...window,
      units: 1,
      limit: 2,
      mode: "consume",
      createdAt: new Date().toISOString(),
    });
    expect(third).toMatchObject({ reserved: false, usedUnitsBefore: 2, reservationId: null });
    expect(
      await queries.sumActiveQuotaUnits({ userId, quotaKey: "brew_per_day", ...window }),
    ).toBe(2);

    // Budget semantics: reserve -> settle with actual spend (remainder refunded).
    const budget = await queries.reserveQuotaUnits({
      userId,
      quotaKey: "brew_cost_units_per_day",
      ...window,
      units: 2,
      limit: 10,
      mode: "reserve",
      createdAt: new Date().toISOString(),
    });
    expect(budget.reserved).toBe(true);
    const settled = await queries.settleQuotaReservation({
      reservationId: budget.reservationId!,
      consumedUnits: 0.5,
      at: new Date().toISOString(),
    });
    expect(settled).toMatchObject({
      status: "partially_refunded",
      consumedUnits: 0.5,
      refundedUnits: 1.5,
    });

    // Open reservation refunds fully on terminal failure.
    const open = await queries.reserveQuotaUnits({
      userId,
      quotaKey: "brew_cost_units_per_day",
      ...window,
      units: 3,
      limit: 10,
      mode: "reserve",
      createdAt: new Date().toISOString(),
    });
    const refunded = await queries.refundQuotaReservation({
      reservationId: open.reservationId!,
      refundedUnits: 3,
      at: new Date().toISOString(),
    });
    expect(refunded).toMatchObject({ status: "refunded", refundedUnits: 3 });

    const byJob = await queries.findReservationsByJobId("job_missing_r16");
    expect(byJob).toEqual([]);
  });

  it("finds jobs by input fingerprint newest-first with status filtering", async () => {
    const fingerprint = "f".repeat(64);
    await db.query(
      `insert into async_jobs
         (id, job_type, owner_user_id, aggregate_type, aggregate_id, status, idempotency_key,
          input_fingerprint, created_at)
       values
         ('job_r16fpold', 'brew_module', $1, 'learning_project', 'prj_r16fp', 'succeeded',
          'idem-fp-old', $2, now() - interval '1 hour'),
         ('job_r16fpnew', 'brew_module', $1, 'learning_project', 'prj_r16fp', 'queued',
          'idem-fp-new', $2, now()),
         ('job_r16fpother', 'brew_module', $1, 'learning_project', 'prj_r16fp', 'cancelled',
          'idem-fp-other', $2, now() + interval '1 minute')`,
      [userId, fingerprint],
    );
    const queries = new PostgresTargetedQueries(executor);
    const found = await queries.findJobByInputFingerprint({
      userId,
      jobType: "brew_module",
      fingerprint,
      statuses: ["queued", "running", "succeeded"],
    });
    expect(found).toMatchObject({ id: "job_r16fpnew", status: "queued" });

    const none = await queries.findJobByInputFingerprint({
      userId: "usr_r16other",
      jobType: "brew_module",
      fingerprint,
      statuses: ["queued", "running", "succeeded"],
    });
    expect(none).toBeNull();
  });

  it("uses the targeted quota window index (EXPLAIN evidence)", async () => {
    await db.query("insert into gon_users (id, status) values ($1, 'active')", ["usr_r16explain"]);
    await db.query(
      `insert into quota_reservations
         (id, user_id, quota_key, window_start, window_end, reserved_units, consumed_units, status)
       select 'qrsv_explain_' || g, 'usr_r16explain', 'search_per_hour',
              '2031-02-03T00:00:00Z'::timestamptz, '2031-02-04T00:00:00Z'::timestamptz,
              1, 1, 'consumed'
         from generate_series(1, 2500) g`,
    );
    const plan = await db.query(
      `explain select coalesce(sum(reserved_units - refunded_units), 0)
         from quota_reservations
        where user_id = $1 and quota_key = $2
          and window_start = $3::timestamptz and window_end = $4::timestamptz
          and status in ('reserved', 'consumed', 'partially_refunded')`,
      ["usr_r16explain", "search_per_hour", "2031-02-03T00:00:00.000Z", "2031-02-04T00:00:00.000Z"] as never[],
    );
    const planText = (plan.rows as Array<Record<string, string>>)
      .map((row) => row["QUERY PLAN"])
      .join("\n");
    expect(planText).toMatch(/Index (Only )?Scan using quota_reservations_(active_window_idx|user_window_idx)/);
  });
});

describe("persistent feature flags and service wiring over PostgreSQL", () => {
  it("persists feature-flag kill switches through the Unit of Work", async () => {
    await db.query("insert into gon_users (id, status) values ($1, 'active')", ["usr_r16flags"]);
    await store.runInTransaction(async (repositories) => {
      repositories.featureFlags.set("brew_enabled", {
        key: "brew_enabled",
        enabled: false,
        scope: { reason: "ops_drill" },
        version: 2,
        updatedAt: new Date().toISOString(),
      });
    });
    const row = (await db.query("select enabled, version from feature_flags where key = 'brew_enabled'"))
      .rows[0] as { enabled: boolean; version: number };
    expect(row).toMatchObject({ enabled: false, version: 2 });

    // A fresh Unit of Work sees the persisted kill switch.
    await store.runInTransaction(async (repositories) => {
      expect(repositories.featureFlags.get("brew_enabled")).toMatchObject({ enabled: false, version: 2 });
      repositories.featureFlags.set("brew_enabled", {
        key: "brew_enabled",
        enabled: true,
        scope: {},
        version: 3,
        updatedAt: new Date().toISOString(),
      });
    });
  });

  it("writes persistent quota reservations through the domain service and reads them back", async () => {
    const service = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
      brewExecutionMode: "queued",
      featureFlags: { brew_enabled: true },
      quotas: { searchPerHour: 10, brewPerDay: 5, brewCostUnitsPerDay: 5 },
    });
    await service.seedInvite("GON-R16-INVITE");
    const user = await service.ensureDevUser("Người học R1.6 PG");
    const actor: Actor = {
      userId: user.id,
      roles: user.roles,
      authProvider: "test",
      requestId: "req_r16pg",
    };
    await service.createAgeAttestation(actor, {
      isAtLeast18: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      personalizationFootprint: "denied",
      inviteCode: "GON-R16-INVITE",
    });

    const project = (
      await service.createProject(
        actor,
        {
          title: "Guardrails PG",
          prompt: "Vì sao quota cần bền vững qua các transaction?",
          goal: "Kiểm chứng persistent quota trên PostgreSQL",
          learningMode: "deep_mastery",
          depth: "standard",
          timeBudgetMinutes: 30,
          locale: "vi-VN",
        },
        { idempotencyKey: "r16-pg-project" },
      )
    ).data;
    const projectId = String(project.id);

    const search = (
      await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "r16-pg-search" })
    ).data;
    const queued = await service.createBrewJob(
      actor,
      projectId,
      { searchAttemptId: String(search.id), confirmed: true },
      { idempotencyKey: "r16-pg-brew" },
    );
    expect(queued.status).toBe(202);

    // Reservations were written as targeted SQL rows and survive the Unit of
    // Work: the next transaction reads them back through the same port.
    expect(await countRows("user_id = $1", [user.id])).toBeGreaterThanOrEqual(3);
    const keys = (
      (await db.query(
        "select distinct quota_key from quota_reservations where user_id = $1 order by quota_key",
        [user.id],
      )).rows as Array<{ quota_key: string }>
    ).map((row) => row.quota_key);
    expect(keys).toEqual(expect.arrayContaining(["artifact_per_day", "brew_per_day", "brew_cost_units_per_day", "search_per_hour"]));

    const dto = await service.getBrewJob(actor, String(queued.data.id));
    expect(dto.quota).toMatchObject({ usedToday: 1, dailyLimit: 5 });
    const costRow = (
      await db.query(
        "select status from quota_reservations where user_id = $1 and quota_key = 'brew_cost_units_per_day'",
        [user.id],
      )
    ).rows[0] as { status: string };
    expect(costRow.status).toBe("reserved");
  }, 120_000);
});

describe("row-level security model (RLS, P05-R1.6)", () => {
  it("isolates user rows for non-owner roles and keeps the service path working", async () => {
    await db.exec(`
      insert into gon_users (id, status) values ('usr_rlsa', 'active'), ('usr_rlsb', 'active');
      insert into xp_ledger_entries
        (id, user_id, sequence, delta, source_event_id, source_type, source_id, rule_version,
         formula_version, status, lifetime_xp_after)
      values
        ('xp_rlsa1', 'usr_rlsa', 1, 100, 'evt_rlsa1', 'assessment', 'att_rlsa1', 'gon.xp/1.0',
         'gon-level-v1', 'posted', 100),
        ('xp_rlsb1', 'usr_rlsb', 1, 50, 'evt_rlsb1', 'assessment', 'att_rlsb1', 'gon.xp/1.0',
         'gon-level-v1', 'posted', 50);
    `);

    try {
      await db.exec(`
        do $$ begin
          if not exists (select from pg_roles where rolname = 'gon_scoped_r16') then
            create role gon_scoped_r16;
          end if;
        end $$;
        grant usage on schema public to gon_scoped_r16;
        grant select, insert, update on gon_users, xp_ledger_entries to gon_scoped_r16;
      `);

      // Deny-by-default: without the GUC a scoped role sees nothing.
      await db.query("set role gon_scoped_r16");
      await db.query("select set_config('gon.user_id', '', false)");
      expect((await db.query("select id from gon_users")).rows).toHaveLength(0);
      expect((await db.query("select id from xp_ledger_entries")).rows).toHaveLength(0);

      // With the GUC the scoped role sees exactly its own rows.
      await db.query("select set_config('gon.user_id', 'usr_rlsa', false)");
      expect(
        ((await db.query("select id from gon_users order by id")).rows as Array<{ id: string }>).map((r) => r.id),
      ).toEqual(["usr_rlsa"]);
      expect(
        ((await db.query("select id from xp_ledger_entries order by id")).rows as Array<{ id: string }>).map((r) => r.id),
      ).toEqual(["xp_rlsa1"]);

      // WITH CHECK blocks writing rows for another user.
      await expect(
        db.query(
          `insert into xp_ledger_entries
             (id, user_id, sequence, delta, source_event_id, source_type, source_id, rule_version,
              formula_version, status, lifetime_xp_after)
           values ('xp_rlsbad', 'usr_rlsb', 2, 1, 'evt_rlsbad', 'assessment', 'att_rlsbad',
                   'gon.xp/1.0', 'gon-level-v1', 'posted', 1)`,
        ),
      ).rejects.toThrow();

      // Updating another user's row matches zero rows under the policy.
      await db.query("update xp_ledger_entries set delta = 999 where id = 'xp_rlsb1'");
      await db.query("select set_config('gon.user_id', 'usr_rlsb', false)");
      expect(
        ((await db.query("select delta from xp_ledger_entries where id = 'xp_rlsb1'")).rows as Array<{ delta: number | string }>)[0].delta,
      ).not.toBe(999);
    } finally {
      await db.query("reset role");
      await db.query("select set_config('gon.user_id', '', false)");
    }

    // The table owner (service/worker path) still sees every row.
    expect(
      (await db.query("select id from gon_users where id like 'usr_rls%' order by id")).rows,
    ).toHaveLength(2);
  });
});
