import { createRequestId, jsonData, problemResponse } from "@/server/http";
import { getGonService } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ artifactId: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const requestId = createRequestId(request);
  try {
    const { artifactId } = await context.params;
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = getGonService().acceptLocalUpload(
      artifactId,
      request.headers.get("x-gon-upload-token"),
      bytes,
      request.headers.get("content-type"),
    );
    return jsonData(result, 200, requestId);
  } catch (error) {
    return problemResponse(error, requestId);
  }
}
