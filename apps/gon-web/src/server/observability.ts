/**
 * Structured observability primitives (P05-R1.11).
 *
 * One JSON line per event on stdout/stderr — the Cloud Run/ops log agent is
 * the shipping layer, so the app stays sink-agnostic. Two hard rules:
 *
 * 1. **Never log learner content or secrets.** {@link sanitizeLogFields}
 *    drops any key that could carry credentials or user content (bodies,
 *    prompts, tokens, cookies…) before serialization. Unknown keys pass
 *    through only when their values are scalars — nested objects are dropped
 *    because they hide content fields.
 * 2. **Every request line carries `requestId`** so access logs, problem+json
 *    responses, audit rows and `ai_runs` telemetry correlate without logging
 *    query strings or bodies.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const FORBIDDEN_KEY_PATTERN =
  /(authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|session|body|content|prompt|answer|transcript|text|embedding|email|invite)/i;

const SAFE_SCALAR_TYPES = new Set(["string", "number", "boolean"]);

/** Drop content/secret-bearing fields; keep only safe scalar telemetry. */
export function sanitizeLogFields(fields: LogFields): LogFields {
  const clean: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (SAFE_SCALAR_TYPES.has(typeof value)) {
      clean[key] = typeof value === "string" && value.length > 512 ? `${value.slice(0, 512)}…` : value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => SAFE_SCALAR_TYPES.has(typeof item))) {
      clean[key] = value.slice(0, 32);
      continue;
    }
    // Nested records and big values are dropped: they can smuggle content.
  }
  return clean;
}

let clock: () => Date = () => new Date();
let sink: (line: string, level: LogLevel) => void = (line, level) => {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
};

/** Test seam: deterministic clock and captured sink. */
export function configureObservability(options: {
  now?: () => Date;
  sink?: (line: string, level: LogLevel) => void;
}): void {
  if (options.now) clock = options.now;
  if (options.sink) sink = options.sink;
}

export function resetObservability(): void {
  clock = () => new Date();
  sink = (line, level) => {
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };
}

/** Emit one structured JSON log line. Fields are sanitized first. */
export function logStructured(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: clock().toISOString(),
    level,
    event,
    ...sanitizeLogFields(fields),
  });
  sink(line, level);
}

/** Monotonic request timer in milliseconds. */
export function startRequestTimer(): () => number {
  const startedAt = performance.now();
  return () => Math.max(0, performance.now() - startedAt);
}

export interface RequestLogContext {
  requestId: string;
  method: string;
  /** Path only — query strings can carry learner data and are never logged. */
  route: string;
  status: number;
  durationMs: number;
  userId?: string;
  outcome: "ok" | "rejected" | "error";
  errorCode?: string;
}

/** Access-log line for one API request (P05-R1.11). */
export function logRequest(context: RequestLogContext): void {
  const level: LogLevel =
    context.outcome === "error" ? "error" : context.outcome === "rejected" ? "warn" : "info";
  logStructured(level, "http_request", {
    requestId: context.requestId,
    method: context.method,
    route: context.route,
    status: context.status,
    durationMs: Math.round(context.durationMs),
    outcome: context.outcome,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
  });
}
