import { readConfig, type GonConfig } from "./config";
import {
  checkPostgresMigrationState,
  checkPostgresOutboxBacklog,
  checkPostgresReadiness,
  type MigrationReadiness,
  type OutboxBacklogReadiness,
  type PostgresReadiness,
} from "./db";
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
    /**
     * Migration freshness (P05-R1.11): every shipped migration file must be
     * applied. A pending migration flips readiness to `not_ready` — the
     * deploy pipeline must run `migrate.mjs` first (fail-closed).
     */
    migrations: {
      ok: boolean;
      appliedCount?: number;
      expectedCount?: number;
      pendingVersions?: string[];
      errorCode?: string;
    };
    /**
     * Stale outbox delivery backlog (P05-R1.11). Reported for alerting but
     * deliberately does NOT gate `status`: cycling instances cannot drain a
     * stuck consumer, so LB churn would make the backlog worse.
     */
    outbox: {
      ok: boolean;
      backlogCount?: number;
      threshold: number;
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
  checkMigrations?: () => Promise<MigrationReadiness>;
  checkOutbox?: () => Promise<OutboxBacklogReadiness>;
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
  const checkMigrations = dependencies.checkMigrations ?? (() => checkPostgresMigrationState());
  const checkOutbox = dependencies.checkOutbox ?? (() => checkPostgresOutboxBacklog());

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

  // Deep readiness (P05-R1.11): migration freshness gates the LB (deploy
  // must migrate first); the outbox backlog is reported for alerting only.
  let migrations: MigrationReadiness = { ok: true };
  let outbox: OutboxBacklogReadiness = { ok: true, threshold: 1_000 };
  if (config.databaseConfigured) {
    if (database.ok) {
      migrations = await checkMigrations();
      outbox = await checkOutbox();
    } else {
      migrations = { ok: false, errorCode: "DATABASE_NOT_READY" };
      outbox = { ok: false, threshold: 1_000, errorCode: "DATABASE_NOT_READY" };
    }
  }

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
    status: storeOk && databaseOk && migrations.ok && authOk && objectStorageOk ? "ready" : "not_ready",
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
      migrations: {
        ok: migrations.ok,
        ...(migrations.appliedCount !== undefined ? { appliedCount: migrations.appliedCount } : {}),
        ...(migrations.expectedCount !== undefined ? { expectedCount: migrations.expectedCount } : {}),
        ...(migrations.pendingVersions ? { pendingVersions: migrations.pendingVersions } : {}),
        ...(migrations.errorCode ? { errorCode: migrations.errorCode } : {}),
      },
      outbox: {
        ok: outbox.ok,
        threshold: outbox.threshold,
        ...(outbox.backlogCount !== undefined ? { backlogCount: outbox.backlogCount } : {}),
        ...(outbox.errorCode ? { errorCode: outbox.errorCode } : {}),
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
