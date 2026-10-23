import type { OutboxEventRecord } from "./types";
import type { OutboxEventSink } from "./postgres-outbox";

export type OutboxSinkKind = "http" | "invalid";

export interface OutboxSinkConfigInspection {
  kind: OutboxSinkKind;
  configured: boolean;
  timeoutMs: number;
  errorCode?: string;
}

interface ParsedOutboxSinkConfig extends OutboxSinkConfigInspection {
  url?: string;
  serviceToken?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_SINK_REQUEST_BYTES = 1_000_000;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;

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

function normalizeEndpointUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.hash) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseOutboxSinkConfig(env: NodeJS.ProcessEnv): ParsedOutboxSinkConfig {
  const timeoutMs = parseTimeoutMs(env.GON_OUTBOX_SINK_TIMEOUT_MS);
  if (timeoutMs === null) {
    return {
      kind: "invalid",
      configured: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      errorCode: "OUTBOX_SINK_TIMEOUT_INVALID",
    };
  }

  const url = env.GON_OUTBOX_SINK_URL ? normalizeEndpointUrl(env.GON_OUTBOX_SINK_URL) : null;
  if (!url) {
    return {
      kind: "invalid",
      configured: false,
      timeoutMs,
      errorCode: "OUTBOX_SINK_URL_NOT_CONFIGURED",
    };
  }

  const parsedUrl = new URL(url);
  if (env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    return {
      kind: "invalid",
      configured: false,
      timeoutMs,
      errorCode: "OUTBOX_SINK_URL_MUST_BE_HTTPS_IN_PRODUCTION",
    };
  }

  const serviceToken = env.GON_OUTBOX_SINK_TOKEN?.trim() || undefined;
  if (!serviceToken) {
    const unauthenticatedLocalAllowed =
      env.NODE_ENV !== "production" &&
      envFlag(env.GON_OUTBOX_ALLOW_UNAUTHENTICATED_LOCAL) &&
      isLoopbackHostname(parsedUrl.hostname);
    if (!unauthenticatedLocalAllowed) {
      return {
        kind: "invalid",
        configured: false,
        timeoutMs,
        errorCode: "OUTBOX_SINK_TOKEN_NOT_CONFIGURED",
      };
    }
  } else if (serviceToken.length < 8) {
    return {
      kind: "invalid",
      configured: false,
      timeoutMs,
      errorCode: "OUTBOX_SINK_TOKEN_TOO_SHORT",
    };
  }

  return {
    kind: "http",
    configured: true,
    timeoutMs,
    url,
    ...(serviceToken ? { serviceToken } : {}),
  };
}

export function inspectOutboxSinkConfig(
  env: NodeJS.ProcessEnv = process.env,
): OutboxSinkConfigInspection {
  const parsed = parseOutboxSinkConfig(env);
  return {
    kind: parsed.kind,
    configured: parsed.configured,
    timeoutMs: parsed.timeoutMs,
    ...(parsed.errorCode ? { errorCode: parsed.errorCode } : {}),
  };
}

export class OutboxSinkError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? `Outbox sink delivery failed with ${code}`);
    this.name = "OutboxSinkError";
    this.code = SAFE_ERROR_CODE.test(code) ? code : "OUTBOX_SINK_FAILED";
  }
}

export interface HttpOutboxEventSinkOptions {
  /** Full endpoint URL; the event envelope is POSTed to this exact URL. */
  endpointUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Delivery adapter that POSTs each claimed outbox event to an internal events
 * endpoint. Delivery is at-least-once: the envelope carries `x-gon-event-id`
 * and `Idempotency-Key` so the receiver can deduplicate by event ID and make
 * its side effects idempotent.
 */
export class HttpOutboxEventSink implements OutboxEventSink {
  readonly kind = "http" as const;

  private readonly endpointUrl: string;
  private readonly serviceToken?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpOutboxEventSinkOptions) {
    const parsed = new URL(options.endpointUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("Outbox sink URL must be an HTTP(S) URL without embedded credentials");
    }
    this.endpointUrl = parsed.toString();
    this.serviceToken = options.serviceToken?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 180_000) {
      throw new Error("Outbox sink timeoutMs must be an integer between 1000 and 180000");
    }
    this.fetchImpl = options.fetch ?? fetch;
  }

  async publish(event: OutboxEventRecord): Promise<void> {
    const body = JSON.stringify({
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      occurredAt: event.occurredAt,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actor: event.actor,
      correlationId: event.correlationId,
      causationId: event.causationId,
      data: event.data,
    });
    if (new TextEncoder().encode(body).byteLength > MAX_SINK_REQUEST_BYTES) {
      throw new OutboxSinkError("OUTBOX_SINK_EVENT_TOO_LARGE");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpointUrl, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-gon-event-id": event.eventId,
          "x-gon-correlation-id": event.correlationId,
          "idempotency-key": event.eventId,
          ...(this.serviceToken ? { "x-gon-service-token": this.serviceToken } : {}),
        },
        body,
      });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new OutboxSinkError("OUTBOX_SINK_TIMEOUT");
      }
      throw new OutboxSinkError("OUTBOX_SINK_UNAVAILABLE");
    }
    clearTimeout(timer);

    if (response.ok) return;
    if ([408, 429].includes(response.status) || response.status >= 500) {
      throw new OutboxSinkError("OUTBOX_SINK_UNAVAILABLE");
    }
    throw new OutboxSinkError("OUTBOX_SINK_REJECTED");
  }
}

/**
 * Process-local idempotence guard. The outbox publisher delivers at-least-once
 * (stale leases can be reclaimed and republished); this wrapper collapses
 * duplicate `publish` calls for an event this process already delivered, so a
 * consumer loop never double-forwards the same event from one runtime.
 * Cross-process/cross-restart dedupe remains the receiver's `eventId` contract.
 */
export class EventIdDeduplicatingOutboxSink implements OutboxEventSink {
  readonly deliveredEventIds: ReadonlySet<string>;
  private readonly seen = new Set<string>();

  constructor(private readonly target: OutboxEventSink) {
    if (!target || typeof target.publish !== "function") {
      throw new Error("A target outbox sink with publish(event) is required");
    }
    this.deliveredEventIds = this.seen;
  }

  async publish(event: OutboxEventRecord): Promise<void> {
    if (this.seen.has(event.eventId)) return;
    await this.target.publish(event);
    this.seen.add(event.eventId);
  }
}

export function createOutboxSinkFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { fetch?: typeof fetch } = {},
): OutboxEventSink {
  const parsed = parseOutboxSinkConfig(env);
  if (parsed.kind !== "http" || !parsed.configured || !parsed.url) {
    throw new Error(
      `Outbox sink is not configured (${parsed.errorCode ?? "OUTBOX_SINK_INVALID"}).`,
    );
  }
  return new EventIdDeduplicatingOutboxSink(
    new HttpOutboxEventSink({
      endpointUrl: parsed.url,
      serviceToken: parsed.serviceToken,
      timeoutMs: parsed.timeoutMs,
      fetch: options.fetch,
    }),
  );
}
