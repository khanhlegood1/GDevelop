import { assertRuntimeStoreAllowed, readConfig } from "./config";
import { createBrewAiProviderFromEnv } from "./adk-config";
import {
  AbuseController,
  MemoryAbuseStateStore,
  parseAbusePolicyFromEnv,
} from "./abuse-controls";
import { getPostgresPool } from "./db";
import { PostgresTargetedQueries } from "./postgres-store";
import { PostgresJobQueue } from "./postgres-job-queue";
import { PostgresOutboxPublisher, type OutboxEventSink } from "./postgres-outbox";
import { createOutboxSinkFromEnv } from "./outbox-sink";
import type { SqlExecutor } from "./postgres-search";
import { MemoryGonStore } from "./memory-store";
import { logStructured } from "./observability";
import { createObjectStorage, type ObjectStorage } from "./object-storage";
import { PostgresAbuseStateStore } from "./postgres-abuse-store";
import {
  createPgPoolTransactionRunner,
  PostgresGonStore,
  type PgPoolLike,
} from "./postgres-store";
import { GonService, type BrewExecutionMode } from "./service";

interface GonGlobal {
  __gonService?: GonService;
  __gonObjectStorage?: ObjectStorage;
  __gonAbuseController?: AbuseController;
}

const gonGlobal = globalThis as typeof globalThis & GonGlobal;

export function getGonObjectStorage(): ObjectStorage {
  if (gonGlobal.__gonObjectStorage) return gonGlobal.__gonObjectStorage;
  const config = readConfig();
  const storage = createObjectStorage(process.env, {
    production: config.production,
    // This mirrors the explicit isolated-test memory-store override. Normal
    // production composition rejects process-local/filesystem bytes.
    allowLocalInProduction: config.allowMemoryStoreInProduction,
  });
  gonGlobal.__gonObjectStorage = storage;
  return storage;
}

/**
 * Shared abuse/cost controller (P05-R1.10). PostgreSQL compositions bind the
 * distributed state store so every app instance enforces the same token
 * buckets and flood-guard penalty boxes; memory compositions get the
 * in-process binding. Fail-closed: a postgres composition without
 * DATABASE_URL throws at composition time.
 */
export function getAbuseController(): AbuseController {
  if (gonGlobal.__gonAbuseController) return gonGlobal.__gonAbuseController;
  const config = readConfig();
  const store =
    config.storeKind === "postgres"
      ? new PostgresAbuseStateStore(requirePostgresExecutor())
      : new MemoryAbuseStateStore();
  const controller = new AbuseController({
    store,
    policy: parseAbusePolicyFromEnv(process.env),
    hashSalt: process.env.GON_ABUSE_HASH_SALT ?? "",
  });
  gonGlobal.__gonAbuseController = controller;
  return controller;
}

export function getGonService(): GonService {
  if (gonGlobal.__gonService) return gonGlobal.__gonService;

  const config = readConfig();
  assertRuntimeStoreAllowed(config);
  if (!["inline", "queued"].includes(config.brewExecutionMode)) {
    throw new Error(`Unsupported GON_BREW_EXECUTION_MODE: ${config.brewExecutionMode}`);
  }
  const brewExecutionMode = config.brewExecutionMode as BrewExecutionMode;

  let store: MemoryGonStore | PostgresGonStore;
  // P05-R1.13: pool-level targeted pagination — list endpoints page with
  // LIMIT/OFFSET SQL without opening a Unit of Work (no identity-map load).
  let targetedPagination: PostgresTargetedQueries | undefined;
  if (config.storeKind === "memory") {
    store = new MemoryGonStore();
    if (config.devInviteCode) store.seedInvite(config.devInviteCode);
  } else if (config.storeKind === "postgres") {
    const pool = getPostgresPool();
    if (!pool) {
      throw new Error("GON_STORE=postgres requires DATABASE_URL.");
    }
    store = new PostgresGonStore(
      createPgPoolTransactionRunner(pool as unknown as PgPoolLike),
      { seedInviteCode: config.devInviteCode },
    );
    targetedPagination = new PostgresTargetedQueries(requirePostgresExecutor());
  } else {
    throw new Error(`Unsupported GON_STORE: ${config.storeKind}`);
  }

  const service = new GonService({
    store,
    targetedPagination,
    objectStorage: getGonObjectStorage(),
    requireInvite: config.requireInvite,
    brewExecutionMode,
    // Fail-closed: a misconfigured ADK provider throws at composition time
    // instead of silently falling back to the local generator.
    brewAiProvider: createBrewAiProviderFromEnv(process.env),
    featureFlags: {
      brew_enabled: config.brewEnabled,
      arena_enabled: config.arenaEnabled,
      trend_enabled: config.trendEnabled,
      game_events_enabled: config.gameEventsEnabled,
    },
    // Distributed rate limits/flood guard + budget alert hooks (P05-R1.10).
    abuseControls: getAbuseController(),
    budgetAlertSink: (alert) => {
      // Structured ops signal (P05-R1.11); delivery to paging/chat webhooks
      // stays optional and pluggable at the composition root.
      logStructured("warn", "budget_alert", {
        userId: alert.userId,
        quotaKey: alert.quotaKey,
        windowStart: alert.windowStart,
        windowEnd: alert.windowEnd,
        limitUnits: alert.limitUnits,
        usedUnits: alert.usedUnits,
        thresholdPct: alert.thresholdPct,
      });
    },
  });
  gonGlobal.__gonService = service;
  return service;
}

function requirePostgresExecutor(): SqlExecutor {
  const pool = getPostgresPool();
  if (!pool) throw new Error("PostgreSQL job/outbox workers require DATABASE_URL.");
  return pool as unknown as SqlExecutor;
}

export function getPostgresJobQueue(): PostgresJobQueue {
  return new PostgresJobQueue(requirePostgresExecutor());
}

export function getPostgresOutboxPublisher(): PostgresOutboxPublisher {
  return new PostgresOutboxPublisher(requirePostgresExecutor());
}

/**
 * Production-shaped outbox sink, composed fail-closed from the environment
 * (`GON_OUTBOX_SINK_URL`/`GON_OUTBOX_SINK_TOKEN`). Delivers at-least-once with
 * event-ID idempotency headers and a process-local duplicate guard.
 */
export function getPostgresOutboxSink(): OutboxEventSink {
  return createOutboxSinkFromEnv(process.env);
}
