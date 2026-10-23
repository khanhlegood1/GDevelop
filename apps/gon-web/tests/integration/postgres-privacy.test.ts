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
import { PostgresGonStore, type PostgresTransactionRunner } from "@/server/postgres-store";
import { GonService } from "@/server/service";
import type { Actor, FootprintEventRecord } from "@/server/types";

const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let store: PostgresGonStore;
let service: GonService;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
}

async function activate(name: string): Promise<Actor> {
  await service.seedInvite(`GON-R17-${name}`);
  const user = await service.ensureDevUser(name);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: "req_r17",
  };
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "granted",
    inviteCode: `GON-R17-${name}`,
  });
  return actor;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  const files = await migrationFiles();
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
  service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: false,
    brewExecutionMode: "queued",
    featureFlags: { brew_enabled: true },
  });
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("privacy lifecycle over PostgreSQL (PGlite execution, P05-R1.7)", () => {
  it("persists data requests with receipts and erases footprint events transactionally", async () => {
    const actor = await activate("Người học R1.7 PG");
    await service.patchPersonalization(actor, { preferences: { topics: ["privacy"] } });

    // Seed detailed footprint events through the Unit of Work.
    await store.runInTransaction(async (repositories) => {
      for (const id of ["1", "2"]) {
        const event: FootprintEventRecord = {
          id,
          userId: actor.userId,
          category: "journey_started",
          entityType: "journey",
          entityId: "jrn_r17",
          attributes: {},
          consentPurpose: "personalization_footprint",
          consentStatusAtEvent: "granted",
          occurredAt: new Date().toISOString(),
        };
        repositories.footprintEvents.set(id, event);
      }
    });
    expect(
      (await db.query("select count(*)::int as count from footprint_events where user_id = $1", [actor.userId]))
        .rows[0],
    ).toMatchObject({ count: 2 });

    // Export: request + process; receipt and object round-trip through SQL.
    const created = await service.createDataRequest(
      actor,
      { type: "export" },
      { idempotencyKey: "r17-export-1" },
    );
    expect(created.status).toBe(202);
    const processed = await service.processDataRequest(String(created.data.id));
    expect(processed).toMatchObject({ type: "export", status: "completed" });
    const row = (
      await db.query("select status, receipt from data_requests where id = $1", [String(created.data.id)])
    ).rows[0] as { status: string; receipt: Record<string, unknown> };
    expect(row.status).toBe("completed");
    expect(row.receipt.kind).toBe("export");
    expect(String(row.receipt.objectKey)).toContain(`private/exports/${actor.userId}/`);

    // Footprint deletion: detailed rows disappear; preferences row is gone;
    // the request receipt stays.
    const requested = await service.deleteFootprint(actor, { idempotencyKey: "r17-fp-1" });
    const fp = await service.processDataRequest(String(requested.data.id));
    expect(fp).toMatchObject({ status: "completed" });
    expect(fp!.receipt).toMatchObject({ deletedFootprintEvents: 2, footprintDisabled: true });
    expect(
      (await db.query("select count(*)::int as count from footprint_events where user_id = $1", [actor.userId]))
        .rows[0],
    ).toMatchObject({ count: 0 });
    expect(
      (await db.query("select count(*)::int as count from user_personalization where user_id = $1", [actor.userId]))
        .rows[0],
    ).toMatchObject({ count: 0 });
  }, 120_000);

  it("keeps data_requests and user_personalization behind RLS for scoped roles", async () => {
    const actor = await activate("Người học R1.7 RLS");
    await service.patchPersonalization(actor, { preferences: { locale: "vi-VN" } });
    const created = await service.createDataRequest(
      actor,
      { type: "export" },
      { idempotencyKey: "r17-export-rls" },
    );

    try {
      await db.exec(`
        do $$ begin
          if not exists (select from pg_roles where rolname = 'gon_scoped_r17') then
            create role gon_scoped_r17;
          end if;
        end $$;
        grant usage on schema public to gon_scoped_r17;
        grant select on data_requests, user_personalization to gon_scoped_r17;
      `);
      await db.query("set role gon_scoped_r17");

      // Deny-by-default without the GUC.
      await db.query("select set_config('gon.user_id', '', false)");
      expect((await db.query("select id from data_requests")).rows).toHaveLength(0);
      expect((await db.query("select user_id from user_personalization")).rows).toHaveLength(0);

      // With the GUC only the owner's rows appear.
      await db.query("select set_config('gon.user_id', $1, false)", [actor.userId]);
      const scopedRequests = (await db.query("select id from data_requests order by id")).rows as Array<{
        id: string;
      }>;
      expect(scopedRequests.map((r) => r.id)).toEqual([String(created.data.id)]);
      expect((await db.query("select user_id from user_personalization")).rows).toHaveLength(1);
    } finally {
      await db.query("reset role");
      await db.query("select set_config('gon.user_id', '', false)");
    }

    // Service/worker path (table owner) still sees every row: two requests
    // from the previous test plus this one.
    expect(
      (await db.query("select count(*)::int as count from data_requests")).rows[0],
    ).toMatchObject({ count: 3 });
  }, 120_000);
});
