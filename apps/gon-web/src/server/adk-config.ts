import {
  CircuitBreakingBrewAiProvider,
  HttpAdkBrewAiProvider,
  LocalDeterministicBrewAiProvider,
  type BrewAiProvider,
  type CircuitBreakerOptions,
} from "./ai-provider";

export type BrewAiProviderKind = "local" | "adk" | "invalid";

export interface BrewAiConfigInspection {
  kind: BrewAiProviderKind;
  configured: boolean;
  timeoutMs: number;
  errorCode?: string;
}

interface ParsedBrewAiConfig extends BrewAiConfigInspection {
  baseUrl?: string;
  serviceToken?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function envFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function parseTimeoutMs(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 1_000 && parsed <= 180_000
    ? parsed
    : null;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function parseBrewAiConfig(env: NodeJS.ProcessEnv): ParsedBrewAiConfig {
  const rawKind = (env.GON_BREW_PROVIDER ?? "local").trim().toLowerCase();
  const timeoutMs = parseTimeoutMs(env.GON_ADK_TIMEOUT_MS);
  if (timeoutMs === null) {
    return {
      kind: rawKind === "local" || rawKind === "adk" ? rawKind : "invalid",
      configured: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      errorCode: "ADK_TIMEOUT_INVALID",
    };
  }

  if (rawKind === "local") {
    return { kind: "local", configured: true, timeoutMs };
  }
  if (rawKind !== "adk") {
    return {
      kind: "invalid",
      configured: false,
      timeoutMs,
      errorCode: "BREW_AI_PROVIDER_INVALID",
    };
  }

  if ((env.GON_BREW_EXECUTION_MODE ?? "inline").trim().toLowerCase() !== "queued") {
    return {
      kind: "adk",
      configured: false,
      timeoutMs,
      errorCode: "BREW_ADK_REQUIRES_QUEUED_MODE",
    };
  }

  const baseUrl = env.GON_ADK_BASE_URL ? normalizeBaseUrl(env.GON_ADK_BASE_URL) : null;
  if (!baseUrl) {
    return {
      kind: "adk",
      configured: false,
      timeoutMs,
      errorCode: "ADK_BASE_URL_NOT_CONFIGURED",
    };
  }

  const parsedBaseUrl = new URL(baseUrl);
  if (env.NODE_ENV === "production" && parsedBaseUrl.protocol !== "https:") {
    return {
      kind: "adk",
      configured: false,
      timeoutMs,
      errorCode: "ADK_BASE_URL_MUST_BE_HTTPS_IN_PRODUCTION",
    };
  }

  const serviceToken = env.GON_ADK_SERVICE_TOKEN?.trim() || undefined;
  if (!serviceToken) {
    const unauthenticatedLocalAllowed =
      env.NODE_ENV !== "production" &&
      envFlag(env.GON_ADK_ALLOW_UNAUTHENTICATED_LOCAL) &&
      isLoopbackHostname(parsedBaseUrl.hostname);
    if (!unauthenticatedLocalAllowed) {
      return {
        kind: "adk",
        configured: false,
        timeoutMs,
        errorCode: "ADK_SERVICE_TOKEN_NOT_CONFIGURED",
      };
    }
  } else if (serviceToken.length < 8) {
    return {
      kind: "adk",
      configured: false,
      timeoutMs,
      errorCode: "ADK_SERVICE_TOKEN_TOO_SHORT",
    };
  }

  return {
    kind: "adk",
    configured: true,
    timeoutMs,
    baseUrl,
    ...(serviceToken ? { serviceToken } : {}),
  };
}

export function inspectBrewAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): BrewAiConfigInspection {
  const parsed = parseBrewAiConfig(env);
  return {
    kind: parsed.kind,
    configured: parsed.configured,
    timeoutMs: parsed.timeoutMs,
    ...(parsed.errorCode ? { errorCode: parsed.errorCode } : {}),
  };
}

export function createBrewAiProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { fetch?: typeof fetch; circuitBreaker?: CircuitBreakerOptions | false } = {},
): BrewAiProvider {
  const parsed = parseBrewAiConfig(env);
  let provider: BrewAiProvider;
  if (parsed.kind === "local") {
    provider = new LocalDeterministicBrewAiProvider();
  } else if (parsed.kind !== "adk" || !parsed.configured || !parsed.baseUrl) {
    throw new Error(
      `Brew AI provider is not configured (${parsed.errorCode ?? "BREW_AI_PROVIDER_INVALID"}).`,
    );
  } else {
    provider = new HttpAdkBrewAiProvider({
      baseUrl: parsed.baseUrl,
      serviceToken: parsed.serviceToken,
      timeoutMs: parsed.timeoutMs,
      fetch: options.fetch,
    });
  }
  if (options.circuitBreaker === false) return provider;
  const threshold = Number(env.GON_AI_CIRCUIT_FAILURE_THRESHOLD ?? "");
  const cooldownMs = Number(env.GON_AI_CIRCUIT_COOLDOWN_MS ?? "");
  return new CircuitBreakingBrewAiProvider(provider, {
    ...(options.circuitBreaker ?? {}),
    ...(Number.isSafeInteger(threshold) && threshold >= 1 ? { failureThreshold: threshold } : {}),
    ...(Number.isFinite(cooldownMs) && cooldownMs >= 1_000 ? { cooldownMs } : {}),
  });
}
