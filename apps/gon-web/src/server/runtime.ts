import { assertRuntimeStoreAllowed, readConfig } from "./config";
import { getPostgresPool } from "./db";
import { PostgresJobQueue } from "./postgres-job-queue";
import { PostgresOutboxPublisher } from "./postgres-outbox";
import type { SqlExecutor } from "./postgres-search";
import { MemoryGonStore } from "./memory-store";
import { createObjectStorage, type ObjectStorage } from "./object-storage";
import {
  createPgPoolTransactionRunner,
  PostgresGonStore,
  type PgPoolLike,
} from "./postgres-store";
import { GonService, type BrewExecutionMode } from "./service";

interface GonGlobal {
  __gonService?: GonService;
  __gonObjectStorage?: ObjectStorage;
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

export function getGonService(): GonService {
  if (gonGlobal.__gonService) return gonGlobal.__gonService;

  const config = readConfig();
  assertRuntimeStoreAllowed(config);
  if (!["inline", "queued"].includes(config.brewExecutionMode)) {
    throw new Error(`Unsupported GON_BREW_EXECUTION_MODE: ${config.brewExecutionMode}`);
  }
  const brewExecutionMode = config.brewExecutionMode as BrewExecutionMode;

  let store: MemoryGonStore | PostgresGonStore;
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
  } else {
    throw new Error(`Unsupported GON_STORE: ${config.storeKind}`);
  }

  const service = new GonService({
    store,
    objectStorage: getGonObjectStorage(),
    requireInvite: config.requireInvite,
    brewExecutionMode,
    featureFlags: {
      brew_enabled: config.brewEnabled,
      arena_enabled: config.arenaEnabled,
      trend_enabled: config.trendEnabled,
      game_events_enabled: config.gameEventsEnabled,
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
