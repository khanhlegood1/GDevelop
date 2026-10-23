import { NextResponse } from "next/server";
import { getReadiness } from "@/server/health";
import { logStructured } from "@/server/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getReadiness();
  const ready = readiness.status === "ready";

  if (!ready) {
    // Ops signal with error codes only (P05-R1.11) — no topology details in
    // the response; the detailed checks stay server-side as before. Flattened
    // to scalar strings so log sanitization keeps the payload.
    const failed = Object.entries(readiness.checks)
      .filter(([, check]) => check.ok === false)
      .map(([name, check]) => (check.errorCode ? `${name}:${check.errorCode}` : name));
    logStructured("warn", "readiness_not_ready", { failedChecks: failed });
  }

  // The detailed checks stay server-side. Load balancers only need the
  // boolean result; unauthenticated callers do not need topology details.
  return NextResponse.json(
    { status: readiness.status },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        ...(ready ? {} : { "Retry-After": "10" }),
      },
    },
  );
}
