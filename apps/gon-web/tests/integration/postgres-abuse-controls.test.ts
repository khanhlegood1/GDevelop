import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AbuseController,
  type AbuseStateStore,
  type BudgetAlert,
  type TokenBucketPolicy,
} from "@/server/abuse-controls";
import { PostgresAbuseStateStore } from "@/server/postgres-abuse-store";
import type { SqlExecutor } from "@/server/postgres-search";

const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

let db: PGlite;
let executor: SqlExecutor;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
}

function strictPolicy(overrides: Partial<{ userWrite: TokenBucketPolicy; strikeLimit: number }> = {}) {
  return {
    userWrite: overrides.userWrite ?? { capacity: 5, refillPerSec: 0.0001 },
    flood: {
      strikeLimit: overrides.strikeLimit ?? 3,
      strikeWindowMs: 10_000,
      blockBaseMs: 4_000,
      blockMaxMs: 60_000,
    },
    idempotencyMarkerTtlMs: 5_000,
  };
}

function controller(store: AbuseStateStore, policy = strictPolicy(), now?: () => Date): AbuseController {
  return new AbuseController({ store, policy, now });
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  const files = await migrationFiles();
  expect(files).toHaveLength(10);
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }
  executor = {
    query: async (text, params) => db.query(text, params as never[]),
  };
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe("distributed abuse-control state over PostgreSQL (PGlite execution, P05-R1.10)", () => {
  it("shares one token bucket across store instances (cross-instance enforcement)", async () => {
    const storeA = new PostgresAbuseStateStore(executor);
    const storeB = new PostgresAbuseStateStore(executor);
    const policy = strictPolicy({
      userWrite: { capacity: 3, refillPerSec: 0.0001 },
      strikeLimit: 1000,
    });
    const a = controller(storeA, policy);
    const b = controller(storeB, policy);

    // Instance A drains the bucket...
    for (let i = 0; i < 3; i += 1) {
      const decision = await a.admit({ scope: "user", subject: "shared-user", actionClass: "write" });
      expect(decision.allowed).toBe(true);
    }
    // ...and instance B must see the same empty bucket.
    const denied = await b.admit({ scope: "user", subject: "shared-user", actionClass: "write" });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("rate_limit");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("never over-admits under concurrent consumes (CAS atomicity)", async () => {
    const store = new PostgresAbuseStateStore(executor);
    const policy = strictPolicy({
      userWrite: { capacity: 5, refillPerSec: 0.0001 },
      strikeLimit: 1000,
    });
    const shared = controller(store, policy);
    const decisions = await Promise.all(
      Array.from({ length: 8 }, () =>
        shared.admit({ scope: "user", subject: "concurrent-user", actionClass: "write" }),
      ),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(3);
  });

  it("persists flood-guard penalty boxes across instances", async () => {
    const storeA = new PostgresAbuseStateStore(executor);
    const storeB = new PostgresAbuseStateStore(executor);
    const policy = strictPolicy({ strikeLimit: 2 });
    let nowMs = Date.parse("2026-10-24T09:00:00.000Z");
    const clock = () => new Date(nowMs);
    const a = controller(storeA, policy, clock);
    const b = controller(storeB, policy, clock);

    expect((await a.admit({ scope: "ip", subject: "203.0.113.50", actionClass: "write" })).allowed).toBe(true);
    expect((await a.admit({ scope: "ip", subject: "203.0.113.50", actionClass: "write" })).allowed).toBe(true);
    const blocked = await a.admit({ scope: "ip", subject: "203.0.113.50", actionClass: "write" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("flood");

    // Instance B honors the penalty box opened by instance A.
    const crossBlocked = await b.admit({ scope: "ip", subject: "203.0.113.50", actionClass: "read" });
    expect(crossBlocked.allowed).toBe(false);
    expect(crossBlocked.reason).toBe("flood");

    // After the box expires both instances accept again.
    nowMs += 5_000;
    expect((await b.admit({ scope: "ip", subject: "203.0.113.50", actionClass: "read" })).allowed).toBe(true);
  });

  it("deduplicates Idempotency-Key replays in SQL and honors the TTL", async () => {
    const store = new PostgresAbuseStateStore(executor);
    expect(await store.markIdempotency("marker-1", "2026-10-24T10:00:00.000Z", 5_000)).toBe("new");
    expect(await store.markIdempotency("marker-1", "2026-10-24T10:00:01.000Z", 5_000)).toBe("replay");
    // Past the TTL the key is a brand-new request again.
    expect(await store.markIdempotency("marker-1", "2026-10-24T10:00:07.000Z", 5_000)).toBe("new");
  });

  it("claims budget alert thresholds exactly once (unique constraint)", async () => {
    await db.query(
      `insert into gon_users (id, status) values ('usr_abusepg1', 'active') on conflict (id) do nothing`,
    );
    const store = new PostgresAbuseStateStore(executor);
    const claim = {
      userId: "usr_abusepg1",
      quotaKey: "brew_cost_units_per_day",
      windowStart: "2026-10-24T00:00:00.000Z",
      thresholdPct: 80,
      at: "2026-10-24T10:00:00.000Z",
    };
    expect(await store.claimBudgetAlert(claim)).toBe(true);
    expect(await store.claimBudgetAlert(claim)).toBe(false);
    // A different threshold in the same window claims independently.
    expect(await store.claimBudgetAlert({ ...claim, thresholdPct: 100 })).toBe(true);
  });

  it("routes full budget-alert collection through SQL claims", async () => {
    await db.query(
      `insert into gon_users (id, status) values ('usr_abusepg2', 'active') on conflict (id) do nothing`,
    );
    const store = new PostgresAbuseStateStore(executor);
    const shared = controller(store);
    const windowArgs = {
      userId: "usr_abusepg2",
      quotaKey: "brew_cost_units_per_day",
      windowStart: "2026-10-24T00:00:00.000Z",
      windowEnd: "2026-10-25T00:00:00.000Z",
      limitUnits: 4,
    };
    const first: BudgetAlert[] = await shared.collectBudgetAlerts({ ...windowArgs, usedUnits: 4 });
    expect(first.map((alert) => alert.thresholdPct)).toEqual([50, 80, 100]);
    const second = await shared.collectBudgetAlerts({ ...windowArgs, usedUnits: 4 });
    expect(second).toEqual([]);
  });

  it("keeps hash-keyed infra tables deny-by-default under RLS", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relname in ('abuse_rate_buckets', 'abuse_flood_strikes', 'abuse_idempotency_markers', 'budget_alert_claims')`,
    );
    expect(rows.rows).toHaveLength(4);
    for (const row of rows.rows) expect(row.relrowsecurity).toBe(true);
  });
});
