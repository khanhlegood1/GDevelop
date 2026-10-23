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
    auth: {
      googleConfigured: boolean;
      secretConfigured: boolean;
      databaseSessions: boolean;
      required: boolean;
      ok: boolean;
      errorCode?: string;
    };
    objectStorage: {
      kind: string;
      configured: boolean;
      required: boolean;
      ok: boolean;
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

  const authRequired = config.production;
  let authErrorCode: string | undefined;
  if (authRequired) {
    if (!config.googleConfigured) authErrorCode = "GOOGLE_AUTH_NOT_CONFIGURED";
    else if (!config.authSecretConfigured) authErrorCode = "AUTH_SECRET_NOT_CONFIGURED";
    else if (!config.authDatabaseSessions) authErrorCode = "AUTH_DATABASE_SESSIONS_NOT_CONFIGURED";
    else if (!database.ok) authErrorCode = "AUTH_DATABASE_NOT_READY";
  }
  const authOk = !authRequired || !authErrorCode;

  const objectStorageRequired = config.production;
  let objectStorageErrorCode: string | undefined;
  if (!config.objectStorageConfigured) {
    objectStorageErrorCode = config.objectStorageErrorCode ?? "OBJECT_STORAGE_NOT_CONFIGURED";
  } else if (objectStorageRequired && config.objectStorageKind !== "gcs") {
    objectStorageErrorCode = "OBJECT_STORAGE_NOT_DURABLE";
  }
  const objectStorageOk = !objectStorageErrorCode;

  return {
    status: storeOk && databaseOk && authOk && objectStorageOk ? "ready" : "not_ready",
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
      auth: {
        googleConfigured: config.googleConfigured,
        secretConfigured: config.authSecretConfigured,
        databaseSessions: config.authDatabaseSessions,
        required: authRequired,
        ok: authOk,
        ...(authErrorCode ? { errorCode: authErrorCode } : {}),
      },
      objectStorage: {
        kind: config.objectStorageKind,
        configured: config.objectStorageConfigured,
        required: objectStorageRequired,
        ok: objectStorageOk,
        ...(objectStorageErrorCode ? { errorCode: objectStorageErrorCode } : {}),
      },
    },
  };
}
