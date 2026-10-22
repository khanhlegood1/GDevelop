import { NextResponse } from "next/server";
import { readConfig } from "@/server/config";
import { notFound } from "@/server/errors";
import {
  assertCsrf,
  createRequestId,
  DEV_SESSION_COOKIE_NAME,
  jsonData,
  parseCookies,
  problemResponse,
  readJsonBody,
} from "@/server/http";
import { getGonService } from "@/server/runtime";
import { ensureRecord, requiredString } from "@/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireDevAuth(): void {
  if (!readConfig().devAuthEnabled) throw notFound();
}

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  try {
    requireDevAuth();
    const cookies = parseCookies(request.headers.get("cookie"));
    const actor = getGonService().resolveDevSession(cookies[DEV_SESSION_COOKIE_NAME]);
    return jsonData({ enabled: true, signedIn: Boolean(actor), userId: actor?.userId ?? null }, 200, requestId);
  } catch (error) {
    return problemResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  try {
    requireDevAuth();
    assertCsrf(request);
    const body = ensureRecord(await readJsonBody(request));
    const displayName = requiredString(body, "displayName", { minLength: 2, maxLength: 120 });
    const service = getGonService();
    const user = service.ensureDevUser(displayName);
    const session = service.createDevSession(user.id);
    const response = jsonData({ userId: user.id, displayName, expiresAt: session.expiresAt }, 201, requestId);
    response.cookies.set({
      name: DEV_SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return problemResponse(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId(request);
  try {
    requireDevAuth();
    assertCsrf(request);
    const cookies = parseCookies(request.headers.get("cookie"));
    getGonService().revokeDevSession(cookies[DEV_SESSION_COOKIE_NAME]);
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("X-Request-Id", requestId);
    response.cookies.set({
      name: DEV_SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return problemResponse(error, requestId);
  }
}
