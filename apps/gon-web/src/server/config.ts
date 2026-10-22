export const TERMS_VERSION = "terms-alpha-v1";
export const PRIVACY_VERSION = "privacy-alpha-v1";

export interface GonConfig {
  storeKind: string;
  requireInvite: boolean;
  brewEnabled: boolean;
  arenaEnabled: boolean;
  trendEnabled: boolean;
  gameEventsEnabled: boolean;
  devAuthEnabled: boolean;
  devInviteCode?: string;
  googleConfigured: boolean;
  databaseConfigured: boolean;
}

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLocaleLowerCase());
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): GonConfig {
  return {
    storeKind: env.GON_STORE ?? "memory",
    requireInvite: envFlag(env.GON_REQUIRE_INVITE, true),
    brewEnabled: envFlag(env.GON_BREW_ENABLED, true),
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
