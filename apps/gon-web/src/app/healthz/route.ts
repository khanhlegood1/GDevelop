import { NextResponse } from "next/server";
import { getLiveness } from "@/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getLiveness(), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
