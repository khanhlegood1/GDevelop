export const TERMS_VERSION = "terms-alpha-v1";
export const PRIVACY_VERSION = "privacy-alpha-v1";

export interface GonConfig {
  storeKind: string;
  production: boolean;
  requireInvite: boolean;
  brewEnabled: boolean;
  brewExecutionMode: string;
  arenaEnabled: boolean;
  trendEnabled: boolean;
  gameEventsEnabled: boolean;
  devAuthEnabled: boolean;
  devInviteCode?: string;
  googleConfigured: boolean;
  databaseConfigured: boolean;
  trustProxyHeaders: boolean;
  allowMemoryStoreInProduction: boolean;
  publicOrigin?: string;
}

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLocaleLowerCase());
}

function normalizePublicOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function assertRuntimeStoreAllowed(config: GonConfig): void {
  if (config.production && config.storeKind === "memory" && !config.allowMemoryStoreInProduction) {
    throw new Error(
      "GON_STORE=memory is disabled in production. Configure a durable store or explicitly set " +
        "GON_ALLOW_MEMORY_STORE_IN_PRODUCTION=1 only for an isolated non-production-data environment.",
    );
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): GonConfig {
  return {
    storeKind: env.GON_STORE ?? "memory",
    production: env.NODE_ENV === "production",
    requireInvite: envFlag(env.GON_REQUIRE_INVITE, true),
    brewEnabled: envFlag(env.GON_BREW_ENABLED, true),
    brewExecutionMode: env.GON_BREW_EXECUTION_MODE ?? "inline",
    arenaEnabled: envFlag(env.GON_ARENA_ENABLED, true),
    trendEnabled: envFlag(env.GON_TREND_ENABLED, false),
    gameEventsEnabled: envFlag(env.GON_GAME_EVENTS_ENABLED, false),
    // A development identity must never become a production back door.
    devAuthEnabled: env.NODE_ENV !== "production" && envFlag(env.GON_DEV_AUTH, false),
    devInviteCode: env.GON_DEV_INVITE_CODE,
    googleConfigured: Boolean(
      (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) ||
      (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    ),
    databaseConfigured: Boolean(env.DATABASE_URL),
    // Forwarded headers are client-controlled unless a trusted edge proxy
    // overwrites them. They are therefore opt-in rather than implicit.
    trustProxyHeaders: envFlag(env.GON_TRUST_PROXY_HEADERS, false),
    allowMemoryStoreInProduction: envFlag(env.GON_ALLOW_MEMORY_STORE_IN_PRODUCTION, false),
    publicOrigin: normalizePublicOrigin(env.GON_PUBLIC_ORIGIN),
  };
}

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  const candidate = value.trim();
  if (
    candidate.length === 0 ||
    candidate.length > 500 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return "/";
  }
  try {
    const parsed = new URL(candidate, "http://gon.local");
    if (parsed.origin !== "http://gon.local") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
