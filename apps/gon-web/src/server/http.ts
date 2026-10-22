import { NextResponse } from "next/server";
import { ApiError, validationError } from "./errors";
import { timingSafeStringEqual } from "./hash";
import { createId } from "./ids";

export const CSRF_COOKIE_NAME = "gon_csrf";
export const DEV_SESSION_COOKIE_NAME = "gon_dev_session";

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.split("=");
    const name = rawName?.trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue.join("=").trim());
    } catch {
      cookies[name] = rawValue.join("=").trim();
    }
  }
  return cookies;
}

export function createRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  if (incoming && /^req_[A-Za-z0-9_-]{8,100}$/.test(incoming)) return incoming;
  return createId("req");
}

export function jsonData(data: unknown, status = 200, requestId?: string): NextResponse {
  const response = NextResponse.json({ data }, { status });
  response.headers.set("Cache-Control", "no-store");
  if (requestId) response.headers.set("X-Request-Id", requestId);
  return response;
}

export function jsonPage(data: unknown, page: unknown, requestId?: string): NextResponse {
  const response = NextResponse.json({ data, page }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  if (requestId) response.headers.set("X-Request-Id", requestId);
  return response;
}

export function problemResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof ApiError) {
    const response = NextResponse.json(
      {
        type: `https://gon.org/problems/${error.code.toLocaleLowerCase().replace(/_/g, "-")}`,
        title: error.title,
        status: error.status,
        code: error.code,
        detail: error.message,
        messageKey: `errors.${error.code}`,
        requestId,
        retryable: error.retryable,
        ...(error.nextAction ? { nextAction: error.nextAction } : {}),
        ...(error.issues.length > 0 ? { issues: error.issues } : {}),
      },
      { status: error.status },
    );
    response.headers.set("Content-Type", "application/problem+json");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  // Never log request bodies, tokens or learner content at this boundary.
  console.error(JSON.stringify({ level: "error", event: "unhandled_api_error", requestId, errorName: error instanceof Error ? error.name : "UnknownError" }));
  const response = NextResponse.json(
    {
      type: "https://gon.org/problems/internal-error",
      title: "Đã xảy ra lỗi hệ thống",
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "Yêu cầu chưa hoàn tất. Hãy thử lại hoặc dùng requestId để báo hỗ trợ.",
      messageKey: "errors.INTERNAL_ERROR",
      requestId,
      retryable: true,
    },
    { status: 500 },
  );
  response.headers.set("Content-Type", "application/problem+json");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  if (Buffer.byteLength(text, "utf8") > 2_500_000) {
    throw new ApiError({
      status: 413,
      code: "REQUEST_TOO_LARGE",
      title: "Nội dung yêu cầu quá lớn",
      detail: "JSON body vượt giới hạn xử lý của API.",
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationError("Body không phải JSON hợp lệ.", [
      { field: "body", code: "invalid_json", message: "Cần gửi JSON hợp lệ." },
    ]);
  }
}

function requestHost(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) return forwardedHost;
  return new URL(request.url).host;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError({
      status: 403,
      code: "CSRF_VALIDATION_FAILED",
      title: "Origin không hợp lệ",
      detail: "Yêu cầu thay đổi dữ liệu phải đến từ cùng origin với GON web.",
    });
  }
  if (originHost !== requestHost(request)) {
    throw new ApiError({
      status: 403,
      code: "CSRF_VALIDATION_FAILED",
      title: "Origin không được phép",
      detail: "Yêu cầu thay đổi dữ liệu phải đến từ cùng origin với GON web.",
    });
  }
}

export function assertCsrf(request: Request): void {
  assertSameOrigin(request);
  const cookies = parseCookies(request.headers.get("cookie"));
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || headerToken.length < 16 || !timingSafeStringEqual(cookieToken, headerToken)) {
    throw new ApiError({
      status: 403,
      code: "CSRF_VALIDATION_FAILED",
      title: "CSRF token không hợp lệ",
      detail: "Hãy tải lại trang để nhận CSRF token mới trước khi gửi thay đổi.",
      nextAction: "refresh_csrf_token",
    });
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 8 || key.length > 128) {
    throw validationError("Mutation này cần Idempotency-Key từ 8 đến 128 ký tự.", [
      { field: "Idempotency-Key", code: "required", message: "Thiếu hoặc sai độ dài Idempotency-Key." },
    ]);
  }
  return key;
}

export function parseIfMatchVersion(request: Request): number | undefined {
  const raw = request.headers.get("if-match")?.trim();
  if (!raw) return undefined;
  const normalized = raw.replace(/^W\//, "").replace(/^"|"$/g, "");
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 1) throw validationError("If-Match phải là version nguyên dương.");
  return version;
}

export function assertMutation(request: Request, options: { idempotency?: boolean } = {}): { idempotencyKey?: string } {
  assertCsrf(request);
  return {
    idempotencyKey: options.idempotency === false ? undefined : requireIdempotencyKey(request),
  };
}
