import { createRequestId, jsonData, problemResponse, readBoundedBody } from "@/server/http";
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
    const service = getGonService();
    const uploadToken = request.headers.get("x-gon-upload-token");
    const { maxByteSize } = await service.authorizeLocalUpload(artifactId, uploadToken);
    const bytes = await readBoundedBody(request, maxByteSize);
    const result = await service.acceptLocalUpload(
      artifactId,
      uploadToken,
      bytes,
      request.headers.get("content-type"),
    );
    return jsonData(result, 200, requestId);
  } catch (error) {
    return problemResponse(error, requestId);
  }
}
