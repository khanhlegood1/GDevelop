import { assertRuntimeStoreAllowed, readConfig } from "./config";
import { getPostgresPool } from "./db";
import { MemoryGonStore } from "./memory-store";
import {
  createPgPoolTransactionRunner,
  PostgresGonStore,
  type PgPoolLike,
} from "./postgres-store";
import { GonService } from "./service";

interface GonGlobal {
  __gonService?: GonService;
}

const gonGlobal = globalThis as typeof globalThis & GonGlobal;

export function getGonService(): GonService {
  if (gonGlobal.__gonService) return gonGlobal.__gonService;

  const config = readConfig();
  assertRuntimeStoreAllowed(config);

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
    requireInvite: config.requireInvite,
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
