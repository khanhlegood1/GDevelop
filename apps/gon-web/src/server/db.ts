import { Pool, type PoolConfig } from "pg";

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

export async function closePostgresPool(): Promise<void> {
  const pool = dbGlobal.__gonPgPool;
  if (!pool) return;
  delete dbGlobal.__gonPgPool;
  await pool.end();
}
