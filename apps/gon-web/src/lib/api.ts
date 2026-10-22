"use client";

export type AnyRecord = Record<string, any>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

let csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/csrf", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new ApiClientError(response.status, "CSRF_UNAVAILABLE", "Không lấy được CSRF token.");
  const payload = (await response.json()) as { data: { csrfToken: string } };
  csrfToken = payload.data.csrfToken;
  return csrfToken;
}

function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `gon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as any;
  } catch {
    return text;
  }
}

export async function apiRequest<T = AnyRecord>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    mutation?: boolean;
    idempotency?: boolean;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isMutation = init.mutation ?? !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (isMutation) {
    headers["X-CSRF-Token"] = await ensureCsrfToken();
    if (init.idempotency !== false) headers["Idempotency-Key"] = createIdempotencyKey();
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const problem = payload && typeof payload === "object" ? payload : {};
    throw new ApiClientError(
      response.status,
      String(problem.code ?? "REQUEST_FAILED"),
      String(problem.detail ?? problem.title ?? `Yêu cầu thất bại với HTTP ${response.status}.`),
      typeof problem.requestId === "string" ? problem.requestId : undefined,
    );
  }
  return (payload?.data ?? payload) as T;
}

export async function apiPage<T = AnyRecord>(path: string): Promise<{ data: T[]; page: AnyRecord }> {
  const response = await fetch(path, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new ApiClientError(response.status, String(payload?.code ?? "REQUEST_FAILED"), String(payload?.detail ?? "Không tải được danh sách."));
  }
  return payload as { data: T[]; page: AnyRecord };
}

export async function sha256Hex(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function relativeUploadPath(uploadUrl: string): string {
  const parsed = new URL(uploadUrl, globalThis.location.origin);
  return `${parsed.pathname}${parsed.search}`;
}
