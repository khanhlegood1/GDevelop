import { readConfig } from "./config";
import { MemoryGonStore } from "./memory-store";
import { GonService } from "./service";

interface GonGlobal {
  __gonService?: GonService;
}

const gonGlobal = globalThis as typeof globalThis & GonGlobal;

export function getGonService(): GonService {
  if (gonGlobal.__gonService) return gonGlobal.__gonService;

  const config = readConfig();
  if (config.storeKind !== "memory") {
    throw new Error(
      "GON_STORE=postgres is reserved for the PostgreSQL repository increment. The VS1 first increment only wires the explicit local/test memory adapter; refusing to silently fall back.",
    );
  }

  const store = new MemoryGonStore();
  if (config.devInviteCode) store.seedInvite(config.devInviteCode);

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
