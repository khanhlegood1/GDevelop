import { Pool, type PoolConfig } from "pg";
import { readdir } from "node:fs/promises";
import path from "node:path";

interface DbGlobal {
  __gonPgPool?: Pool;
}

const dbGlobal = globalThis as typeof globalThis & DbGlobal;

export interface PostgresReadiness {
  configured: boolean;
  ok: boolean;
  latencyMs?: number;
  errorCode?: string;
}

/**
 * Migration-freshness readiness (P05-R1.11): every SQL file shipped in
 * `db/migrations` must have a `gon_schema_migrations` row. This catches the
 * gap the required-tables check cannot: a schema that predates the newest
 * migration (tables exist but e.g. 0010 guardrail state is missing).
 */
export interface MigrationReadiness {
  ok: boolean;
  appliedCount?: number;
  expectedCount?: number;
  pendingVersions?: string[];
  errorCode?: string;
}

/**
 * Outbox delivery backlog (P05-R1.11). A growing stale backlog is an
 * alerting signal for the outbox consumer — readiness reports it but does
 * NOT flip `not_ready` (cycling instances cannot drain a stuck queue).
 */
export interface OutboxBacklogReadiness {
  ok: boolean;
  backlogCount?: number;
  threshold: number;
  errorCode?: string;
}

/**
 * Tables required before the PostgreSQL domain Unit of Work or the Auth.js
 * database adapter can serve traffic. Readiness must fail closed on an empty
 * or partially migrated database instead of treating `select 1` as proof
 * that the application schema exists.
 */
export const POSTGRES_REQUIRED_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verification_token",
  "gon_users",
  "role_grants",
  "identity_links",
  "user_profiles",
  "invites",
  "age_attestations",
  "consents",
  "learning_projects",
  "source_artifacts",
  "artifact_upload_sessions",
  "content_chunks",
  "chunk_embeddings",
  "async_jobs",
  "modules",
  "module_versions",
  "concepts",
  "module_concepts",
  "citation_references",
  "search_attempts",
  "search_attempt_artifacts",
  "search_results",
  "brew_jobs",
  "candidate_sets",
  "output_candidates",
  "ranking_snapshots",
  "ranking_snapshot_items",
  "journeys",
  "branch_commits",
  "learning_attempts",
  "learning_attempt_artifacts",
  "assessment_results",
  "mastery_states",
  "xp_ledger_entries",
  "xp_projections",
  "proofs",
  "proof_artifacts",
  "proof_verification_events",
  "reports",
  "moderation_cases",
  "moderation_actions",
  "outbox_events",
  "audit_logs",
  "idempotency_records",
  "ai_runs",
  "artifact_extractions",
  "feature_flags",
  "quota_reservations",
  "notifications",
  "footprint_events",
  "data_requests",
  "user_personalization",
  "personalization_preferences",
  "abuse_rate_buckets",
  "abuse_flood_strikes",
  "abuse_idempotency_markers",
  "budget_alert_claims",
] as const;

export const POSTGRES_SCHEMA_READINESS_SQL = `
select count(*)::int as present_count
from (
  values ${POSTGRES_REQUIRED_TABLES.map((table) => `('${table}')`).join(", ")}
) as required(table_name)
where to_regclass(required.table_name) is not null
`;

function boundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function postgresSslConfig(env: NodeJS.ProcessEnv): PoolConfig["ssl"] {
  const mode = env.DATABASE_SSL_MODE?.trim().toLocaleLowerCase();
  if (!mode) return undefined;
  if (mode === "disable") return false;
  if (mode === "require") {
    // Encryption without CA verification. This exists for providers that
    // terminate TLS with a publicly trusted chain handled by the platform;
    // verify-full remains the preferred explicit production mode.
    return { rejectUnauthorized: false };
  }
  if (mode === "verify-ca" || mode === "verify-full") {
    return {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}),
    };
  }
  throw new Error("DATABASE_SSL_MODE must be disable, require, verify-ca or verify-full");
}

export function createPostgresPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig | undefined {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// scheme");
  }

  return {
    connectionString,
    application_name: env.DATABASE_APPLICATION_NAME?.trim() || "gon-web",
    max: boundedInteger(env, "DATABASE_POOL_MAX", 10, 1, 100),
    min: 0,
    idleTimeoutMillis: boundedInteger(env, "DATABASE_IDLE_TIMEOUT_MS", 30_000, 0, 300_000),
    connectionTimeoutMillis: boundedInteger(env, "DATABASE_CONNECTION_TIMEOUT_MS", 5_000, 100, 60_000),
    statement_timeout: boundedInteger(env, "DATABASE_STATEMENT_TIMEOUT_MS", 15_000, 100, 300_000),
    query_timeout: boundedInteger(env, "DATABASE_QUERY_TIMEOUT_MS", 20_000, 100, 300_000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: false,
    ssl: postgresSslConfig(env),
  };
}

function safeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

export function getPostgresPool(): Pool | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  if (!dbGlobal.__gonPgPool) {
    const config = createPostgresPoolConfig();
    if (!config) return undefined;
    const pool = new Pool(config);
    pool.on("error", (error) => {
      // Never log pg error messages or connection details: they can contain
      // hostnames, usernames or provider-specific connection metadata.
      console.error(JSON.stringify({
        level: "error",
        event: "postgres_pool_error",
        errorName: error.name,
        ...(safeErrorCode(error) ? { errorCode: safeErrorCode(error) } : {}),
      }));
    });
    dbGlobal.__gonPgPool = pool;
  }
  return dbGlobal.__gonPgPool;
}

export async function checkPostgresReadiness(timeoutMs = 2_000): Promise<PostgresReadiness> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30_000) {
    throw new Error("timeoutMs must be an integer between 50 and 30000");
  }
  let pool: Pool | undefined;
  try {
    pool = getPostgresPool();
  } catch {
    return { configured: true, ok: false, errorCode: "DATABASE_CONFIG_INVALID" };
  }
  if (!pool) return { configured: false, ok: false, errorCode: "DATABASE_NOT_CONFIGURED" };

  const startedAt = performance.now();
  let timeout: NodeJS.Timeout | undefined;
  const operation = (async () => {
    const client = await pool.connect();
    try {
      await client.query("select 1 as ok");
      const schema = await client.query(POSTGRES_SCHEMA_READINESS_SQL);
      const presentCount = Number(
        (schema.rows[0] as { present_count?: unknown } | undefined)?.present_count,
      );
      if (presentCount !== POSTGRES_REQUIRED_TABLES.length) {
        const error = new Error("PostgreSQL schema is not fully migrated") as Error & {
          code?: string;
        };
        error.code = "DATABASE_SCHEMA_NOT_READY";
        throw error;
      }
    } finally {
      client.release();
    }
  })();

  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("PostgreSQL readiness timed out") as Error & { code?: string };
          error.code = "DATABASE_READINESS_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
    return { configured: true, ok: true, latencyMs: Math.max(0, performance.now() - startedAt) };
  } catch (error) {
    // If the race lost, the operation still owns checkout/release and will be
    // bounded by the pool's connection/query timeouts. Attach a handler now
    // so a late failure cannot become an unhandled rejection.
    void operation.catch(() => undefined);
    return {
      configured: true,
      ok: false,
      latencyMs: Math.max(0, performance.now() - startedAt),
      errorCode: safeErrorCode(error) ?? "DATABASE_UNAVAILABLE",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Migrations directory: statically scoped under the app root so Next.js file
 * tracing stays bounded (a dynamic fs path would trace the whole project into
 * the server bundle). `GON_MIGRATIONS_DIR` overrides non-standard layouts.
 */
function defaultMigrationsDir(): string {
  return process.env.GON_MIGRATIONS_DIR?.trim() || path.join(process.cwd(), "db", "migrations");
}

/**
 * Compare shipped migration files against `gon_schema_migrations` rows.
 * Fail-closed: any pending file means the deploy must run `migrate.mjs`
 * before serving traffic.
 */
export async function checkPostgresMigrationState(
  migrationsDir?: string,
): Promise<MigrationReadiness> {
  const dir = migrationsDir ?? defaultMigrationsDir();
  let pool: Pool | undefined;
  try {
    pool = getPostgresPool();
  } catch {
    return { ok: false, errorCode: "DATABASE_CONFIG_INVALID" };
  }
  if (!pool) return { ok: false, errorCode: "DATABASE_NOT_CONFIGURED" };

  let expected: string[];
  try {
    expected = (await readdir(dir))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return { ok: false, errorCode: "MIGRATIONS_DIR_UNREADABLE" };
  }

  try {
    const result = await pool.query(
      "select version from gon_schema_migrations",
    );
    const applied = new Set(
      result.rows.map((row) => String((row as { version?: unknown }).version)),
    );
    const pending = expected.filter((file) => !applied.has(file));
    return {
      ok: pending.length === 0,
      appliedCount: applied.size,
      expectedCount: expected.length,
      pendingVersions: pending,
      ...(pending.length > 0 ? { errorCode: "MIGRATIONS_PENDING" } : {}),
    };
  } catch (error) {
    const code = safeErrorCode(error);
    return {
      ok: false,
      expectedCount: expected.length,
      errorCode: code === "42P01" ? "MIGRATIONS_TABLE_MISSING" : (code ?? "DATABASE_UNAVAILABLE"),
    };
  }
}

/** Stale outbox backlog count (pending/failed and older than 15 minutes). */
export async function checkPostgresOutboxBacklog(
  threshold = 1_000,
): Promise<OutboxBacklogReadiness> {
  let pool: Pool | undefined;
  try {
    pool = getPostgresPool();
  } catch {
    return { ok: false, threshold, errorCode: "DATABASE_CONFIG_INVALID" };
  }
  if (!pool) return { ok: false, threshold, errorCode: "DATABASE_NOT_CONFIGURED" };
  try {
    const result = await pool.query(
      `select count(*)::int as backlog
         from outbox_events
        where publish_state in ('pending', 'failed')
          and available_at < now() - interval '15 minutes'`,
    );
    const backlogCount = Number(
      (result.rows[0] as { backlog?: unknown } | undefined)?.backlog ?? 0,
    );
    return {
      ok: backlogCount <= threshold,
      backlogCount,
      threshold,
      ...(backlogCount > threshold ? { errorCode: "OUTBOX_BACKLOG_SATURATED" } : {}),
    };
  } catch (error) {
    return { ok: false, threshold, errorCode: safeErrorCode(error) ?? "DATABASE_UNAVAILABLE" };
  }
}

export async function closePostgresPool(): Promise<void> {
  const pool = dbGlobal.__gonPgPool;
  if (!pool) return;
  delete dbGlobal.__gonPgPool;
  await pool.end();
}
