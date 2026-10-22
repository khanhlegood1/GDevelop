import { NextResponse } from "next/server";
import { requireActor } from "./actor";
import { notFound } from "./errors";
import {
  assertMutation,
  createRequestId,
  jsonData,
  jsonPage,
  parseCookies,
  parseIfMatchVersion,
  problemResponse,
  readJsonBody,
} from "./http";
import { getGonService } from "./runtime";
import { paginationFromSearchParams } from "./validation";

function requestOrigin(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}

function splitActionSegment(segment: string, action: string): string | null {
  const suffix = `:${action}`;
  return segment.endsWith(suffix) ? segment.slice(0, -suffix.length) : null;
}

export async function handleV1(request: Request, rawSegments: string[]): Promise<NextResponse> {
  const requestId = createRequestId(request);
  const segments = rawSegments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const service = getGonService();

  try {
    const actor = await requireActor(request, requestId);

    if (segments[0] === "me") {
      if (method === "GET" && segments[1] === "bootstrap" && segments.length === 2) {
        return jsonData(service.getBootstrap(actor), 200, requestId);
      }
      if (method === "POST" && segments[1] === "age-attestation" && segments.length === 2) {
        const { idempotencyKey } = assertMutation(request);
        const cookies = parseCookies(request.headers.get("cookie"));
        const result = service.createAgeAttestation(actor, await readJsonBody(request), {
          idempotencyKey,
          inviteCode: cookies.gon_invite,
        });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments[1] === "consents" && segments.length === 2) {
        return jsonData(service.listConsents(actor), 200, requestId);
      }
      if (method === "PUT" && segments[1] === "consents" && segments.length === 3) {
        assertMutation(request);
        return jsonData(service.setConsent(actor, segments[2], await readJsonBody(request)), 200, requestId);
      }
      if (method === "GET" && segments[1] === "progress" && segments.length === 2) {
        return jsonData(service.getMyProgress(actor), 200, requestId);
      }
      if (method === "GET" && segments[1] === "xp-ledger" && segments.length === 2) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = service.listMyXpLedger(actor, pagination);
        return jsonPage(result.data, result.page, requestId);
      }
    }

    if (segments[0] === "projects") {
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = await service.createProject(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 1) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = service.listProjects(actor, {
          ...pagination,
          search: url.searchParams.get("search") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
        });
        return jsonPage(result.data, result.page, requestId);
      }

      const projectId = segments[1];
      if (projectId) {
        if (method === "GET" && segments.length === 2) {
          return jsonData(service.getProject(actor, projectId), 200, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "workspace") {
          return jsonData(service.getProjectWorkspace(actor, projectId), 200, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "artifacts") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.addProjectArtifact(actor, projectId, await readJsonBody(request), { idempotencyKey });
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "artifacts") {
          return jsonPage(service.listProjectArtifacts(actor, projectId), { nextCursor: null, hasMore: false }, requestId);
        }
        if (method === "POST" && segments.length === 4 && segments[2] === "artifacts" && segments[3] === "uploads") {
          const { idempotencyKey } = assertMutation(request);
          const result = service.initiateArtifactUpload(actor, projectId, await readJsonBody(request), {
            idempotencyKey,
            baseUrl: requestOrigin(request),
          });
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "POST" && segments.length === 4 && segments[2] === "artifacts") {
          const artifactId = splitActionSegment(segments[3], "complete-upload");
          if (artifactId) {
            const { idempotencyKey } = assertMutation(request);
            const result = await service.completeArtifactUpload(actor, projectId, artifactId, await readJsonBody(request), {
              idempotencyKey,
            });
            return jsonData(result.data, result.status, requestId);
          }
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "search-attempts") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.createSearchAttempt(actor, projectId, await readJsonBody(request), { idempotencyKey });
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "GET" && segments.length === 4 && segments[2] === "search-attempts") {
          return jsonData(service.getSearchAttempt(actor, projectId, segments[3]), 200, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "brew-jobs") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.createBrewJob(actor, projectId, await readJsonBody(request), { idempotencyKey });
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "output-explorer") {
          return jsonData(
            service.getOutputExplorer(actor, projectId, url.searchParams.get("mode") ?? undefined),
            200,
            requestId,
          );
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "ranking-snapshots") {
          assertMutation(request);
          const result = service.createRankingSnapshot(actor, projectId, await readJsonBody(request));
          return jsonData(result.data, result.status, requestId);
        }
      }
    }

    if (segments[0] === "artifacts" && segments[1]) {
      const artifactId = segments[1];
      if (method === "GET" && segments.length === 2) {
        return jsonData(service.getArtifact(actor, artifactId), 200, requestId);
      }
      if (method === "DELETE" && segments.length === 2) {
        assertMutation(request, { idempotency: false });
        service.deleteArtifact(actor, artifactId);
        const response = new NextResponse(null, { status: 204 });
        response.headers.set("X-Request-Id", requestId);
        return response;
      }
    }

    if (segments[0] === "brew-jobs" && method === "GET" && segments.length === 2) {
      return jsonData(service.getBrewJob(actor, segments[1]), 200, requestId);
    }
    if (segments[0] === "jobs" && method === "GET" && segments.length === 2) {
      return jsonData(service.getJob(actor, segments[1]), 200, requestId);
    }
    if (segments[0] === "module-versions" && method === "GET" && segments.length === 2) {
      return jsonData(service.getModuleVersion(actor, segments[1]), 200, requestId);
    }

    if (segments[0] === "journeys") {
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = service.createJourney(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 1) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = service.listJourneys(actor, pagination);
        return jsonPage(result.data, result.page, requestId);
      }

      const journeyId = segments[1];
      if (journeyId) {
        if (method === "GET" && segments.length === 2) {
          return jsonData(service.getJourney(actor, journeyId), 200, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "player") {
          return jsonData(service.getJourneyPlayer(actor, journeyId), 200, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "commits") {
          const pagination = paginationFromSearchParams(url.searchParams);
          const result = service.listJourneyCommits(actor, journeyId, pagination);
          return jsonPage(result.data, result.page, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "attempts") {
          const { idempotencyKey } = assertMutation(request);
          const result = service.createAttempt(actor, journeyId, await readJsonBody(request), { idempotencyKey });
          return jsonData(result.data, result.status, requestId);
        }
        if (segments.length === 4 && segments[2] === "attempts") {
          const submitAttemptId = splitActionSegment(segments[3], "submit");
          if (method === "POST" && submitAttemptId) {
            const { idempotencyKey } = assertMutation(request);
            const result = await service.submitAttempt(actor, journeyId, submitAttemptId, { idempotencyKey });
            return jsonData(result.data, result.status, requestId);
          }
          const attemptId = segments[3];
          if (method === "PATCH") {
            assertMutation(request, { idempotency: false });
            return jsonData(
              service.updateAttempt(actor, journeyId, attemptId, await readJsonBody(request), {
                ifMatchVersion: parseIfMatchVersion(request),
              }),
              200,
              requestId,
            );
          }
          if (method === "GET") {
            return jsonData(service.getAttempt(actor, journeyId, attemptId), 200, requestId);
          }
        }
      }
    }

    if (segments[0] === "proofs") {
      if (method === "GET" && segments.length === 1) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = service.listProofs(actor, {
          ...pagination,
          verificationLevel: url.searchParams.get("verificationLevel") ?? undefined,
        });
        return jsonPage(result.data, result.page, requestId);
      }
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = service.createExternalProof(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 2) {
        return jsonData(service.getProof(actor, segments[1]), 200, requestId);
      }
    }

    if (segments[0] === "reports") {
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = service.createReport(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 2) {
        return jsonData(service.getReport(actor, segments[1]), 200, requestId);
      }
    }

    throw notFound("Operation này chưa được triển khai trong VS1 increment hiện tại hoặc không tồn tại.");
  } catch (error) {
    return problemResponse(error, requestId);
  }
}
