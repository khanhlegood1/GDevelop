import { Pool } from "pg";

interface DbGlobal {
  __gonPgPool?: Pool;
}

const dbGlobal = globalThis as typeof globalThis & DbGlobal;

export function getPostgresPool(): Pool | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  if (!dbGlobal.__gonPgPool) {
    dbGlobal.__gonPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return dbGlobal.__gonPgPool;
}
