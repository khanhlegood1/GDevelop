import { readConfig, type GonConfig } from "./config";
import { checkPostgresReadiness, type PostgresReadiness } from "./db";
import { getGonService } from "./runtime";

export interface ReadinessReport {
  status: "ready" | "not_ready";
  checks: {
    store: {
      kind: string;
      ok: boolean;
      errorCode?: string;
    };
    database: {
      configured: boolean;
      required: boolean;
      ok: boolean;
      latencyMs?: number;
      errorCode?: string;
    };
  };
}

interface ReadinessDependencies {
  config?: GonConfig;
  ensureRuntime?: () => unknown;
  checkDatabase?: () => Promise<PostgresReadiness>;
}

export function getLiveness(): { status: "ok" } {
  return { status: "ok" };
}

export async function getReadiness(
  dependencies: ReadinessDependencies = {},
): Promise<ReadinessReport> {
  const config = dependencies.config ?? readConfig();
  const ensureRuntime = dependencies.ensureRuntime ?? (() => getGonService());
  const checkDatabase = dependencies.checkDatabase ?? (() => checkPostgresReadiness());

  let storeOk = false;
  let storeErrorCode: string | undefined;

  if (config.storeKind !== "memory" && config.storeKind !== "postgres") {
    storeErrorCode = "STORE_NOT_CONFIGURED";
  } else {
    try {
      ensureRuntime();
      storeOk = true;
    } catch {
      storeErrorCode = "RUNTIME_STORE_NOT_ALLOWED";
    }
  }

  const databaseRequired = config.storeKind === "postgres" || config.production;
  let database: PostgresReadiness = {
    configured: config.databaseConfigured,
    ok: !config.databaseConfigured && !databaseRequired,
    ...(config.databaseConfigured ? {} : { errorCode: "DATABASE_NOT_CONFIGURED" }),
  };

  if (config.databaseConfigured) {
    database = await checkDatabase();
  }

  const databaseOk = databaseRequired ? database.ok : database.ok || !database.configured;

  return {
    status: storeOk && databaseOk ? "ready" : "not_ready",
    checks: {
      store: {
        kind: config.storeKind,
        ok: storeOk,
        ...(storeErrorCode ? { errorCode: storeErrorCode } : {}),
      },
      database: {
        configured: database.configured,
        required: databaseRequired,
        ok: databaseOk,
        ...(database.latencyMs !== undefined ? { latencyMs: database.latencyMs } : {}),
        ...(database.errorCode ? { errorCode: database.errorCode } : {}),
      },
    },
  };
}
