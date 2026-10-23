import { NextResponse } from "next/server";
import { getReadiness } from "@/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getReadiness();
  const ready = readiness.status === "ready";

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
