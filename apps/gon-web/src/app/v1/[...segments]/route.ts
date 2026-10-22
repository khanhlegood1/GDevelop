import { handleV1 } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ segments: string[] }>;
}

async function dispatch(request: Request, context: RouteContext) {
  const { segments } = await context.params;
  return handleV1(request, segments);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
