import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, parseCookies } from "@/server/http";
import { createOpaqueToken } from "@/server/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const existing = cookies[CSRF_COOKIE_NAME];
  const csrfToken = existing && existing.length >= 24 ? existing : createOpaqueToken(32);
  const response = NextResponse.json({ data: { csrfToken } });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: csrfToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
