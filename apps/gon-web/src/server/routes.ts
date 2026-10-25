import { NextResponse } from "next/server";
import { requireActor } from "./actor";
import { actionClassFromMethod, clientIpFromRequest } from "./abuse-controls";
import { readConfig } from "./config";
import { notFound, rateLimited } from "./errors";
import {
  assertMutation,
  createRequestId,
  getRequestOrigin,
  jsonData,
  jsonPage,
  parseCookies,
  parseIfMatchVersion,
  problemResponse,
  readJsonBody,
} from "./http";
import { logRequest, startRequestTimer } from "./observability";
import { getAbuseController, getGonService } from "./runtime";
import { paginationFromSearchParams } from "./validation";

function requestOrigin(request: Request): string {
  const config = readConfig();
  return getRequestOrigin(request, {
    trustProxyHeaders: config.trustProxyHeaders,
    publicOrigin: config.publicOrigin,
  });
}

function splitActionSegment(segment: string, action: string): string | null {
  const suffix = `:${action}`;
  return segment.endsWith(suffix) ? segment.slice(0, -suffix.length) : null;
}

/**
 * Actor attribution for the per-request access log (P05-R1.11). The inner
 * handler records the authenticated user on the Request; the wrapper logs one
 * sanitized line per request after the response is built.
 */
const requestActors = new WeakMap<Request, string>();

export async function handleV1(request: Request, rawSegments: string[]): Promise<NextResponse> {
  const requestId = createRequestId(request);
  const timer = startRequestTimer();
  const method = request.method.toUpperCase();
  // Route label only — query strings can carry learner data and are never logged.
  const route = `/${rawSegments.slice(0, 2).join("/")}`;
  let response: NextResponse;
  try {
    response = await handleV1Inner(request, rawSegments, requestId);
  } catch (error) {
    logRequest({
      requestId,
      method,
      route,
      status: 500,
      durationMs: timer(),
      outcome: "error",
      errorCode: "INTERNAL_ERROR",
    });
    throw error;
  }
  const userId = requestActors.get(request);
  logRequest({
    requestId,
    method,
    route,
    status: response.status,
    durationMs: timer(),
    outcome: response.status < 400 ? "ok" : response.status >= 500 ? "error" : "rejected",
    ...(userId ? { userId } : {}),
  });
  return response;
}

async function handleV1Inner(
  request: Request,
  rawSegments: string[],
  requestId: string,
): Promise<NextResponse> {
  const segments = rawSegments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  try {
    // Edge admission (P05-R1.10): per-IP token bucket + idempotent flood
    // guard before authentication, then the same policy per user after.
    // Idempotent replays (same Idempotency-Key) are exempt inside the
    // controller so client retries cannot self-lockout.
    const config = readConfig();
    const abuse = getAbuseController();
    const actionClass = actionClassFromMethod(method);
    const idempotencyKey = request.headers.get("idempotency-key");
    const ipDecision = await abuse.admit({
      scope: "ip",
      subject: clientIpFromRequest(request, config.trustProxyHeaders),
      actionClass,
      idempotencyKey,
    });
    if (!ipDecision.allowed) throw rateLimited(ipDecision.detail, ipDecision.retryAfterSeconds);

    const actor = await requireActor(request, requestId);
    requestActors.set(request, actor.userId);
    const service = getGonService();
    const userDecision = await abuse.admit({
      scope: "user",
      subject: actor.userId,
      actionClass,
      idempotencyKey,
    });
    if (!userDecision.allowed) throw rateLimited(userDecision.detail, userDecision.retryAfterSeconds);

    if (segments[0] === "me") {
      if (method === "GET" && segments[1] === "bootstrap" && segments.length === 2) {
        return jsonData(await service.getBootstrap(actor), 200, requestId);
      }
      if (method === "POST" && segments[1] === "age-attestation" && segments.length === 2) {
        const { idempotencyKey } = assertMutation(request);
        const cookies = parseCookies(request.headers.get("cookie"));
        const result = await service.createAgeAttestation(actor, await readJsonBody(request), {
          idempotencyKey,
          inviteCode: cookies.gon_invite,
        });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments[1] === "consents" && segments.length === 2) {
        return jsonData(await service.listConsents(actor), 200, requestId);
      }
      if (method === "PUT" && segments[1] === "consents" && segments.length === 3) {
        assertMutation(request);
        return jsonData(await service.setConsent(actor, segments[2], await readJsonBody(request)), 200, requestId);
      }
      if (method === "GET" && segments[1] === "progress" && segments.length === 2) {
        return jsonData(await service.getMyProgress(actor), 200, requestId);
      }
      if (method === "GET" && segments[1] === "xp-ledger" && segments.length === 2) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = await service.listMyXpLedger(actor, pagination);
        return jsonPage(result.data, result.page, requestId);
      }
      if (method === "GET" && segments[1] === "personalization" && segments.length === 2) {
        return jsonData(await service.getPersonalization(actor), 200, requestId);
      }
      if (method === "PATCH" && segments[1] === "personalization" && segments.length === 2) {
        assertMutation(request);
        return jsonData(await service.patchPersonalization(actor, await readJsonBody(request)), 200, requestId);
      }
      if (
        method === "DELETE" &&
        segments[1] === "personalization" &&
        segments.length === 3 &&
        segments[2] === "footprint"
      ) {
        const { idempotencyKey } = assertMutation(request);
        const result = await service.deleteFootprint(actor, { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "POST" && segments[1] === "data-requests" && segments.length === 2) {
        const { idempotencyKey } = assertMutation(request);
        const result = await service.createDataRequest(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments[1] === "data-requests" && segments.length === 3) {
        return jsonData(await service.getDataRequest(actor, segments[2]), 200, requestId);
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
        const result = await service.listProjects(actor, {
          ...pagination,
          search: url.searchParams.get("search") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
        });
        return jsonPage(result.data, result.page, requestId);
      }

      const projectId = segments[1];
      if (projectId) {
        if (method === "GET" && segments.length === 2) {
          return jsonData(await service.getProject(actor, projectId), 200, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "workspace") {
          return jsonData(await service.getProjectWorkspace(actor, projectId), 200, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "artifacts") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.addProjectArtifact(actor, projectId, await readJsonBody(request), { idempotencyKey });
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "artifacts") {
          return jsonPage(await service.listProjectArtifacts(actor, projectId), { nextCursor: null, hasMore: false }, requestId);
        }
        if (method === "POST" && segments.length === 4 && segments[2] === "artifacts" && segments[3] === "uploads") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.initiateArtifactUpload(actor, projectId, await readJsonBody(request), {
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
          return jsonData(await service.getSearchAttempt(actor, projectId, segments[3]), 200, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "brew-jobs") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.createBrewJob(actor, projectId, await readJsonBody(request), { idempotencyKey });
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "output-explorer") {
          return jsonData(
            await service.getOutputExplorer(actor, projectId, url.searchParams.get("mode") ?? undefined),
            200,
            requestId,
          );
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "ranking-snapshots") {
          assertMutation(request);
          const result = await service.createRankingSnapshot(actor, projectId, await readJsonBody(request));
          return jsonData(result.data, result.status, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "arena-matches") {
          assertMutation(request);
          const result = await service.createArenaMatch(actor, projectId, await readJsonBody(request));
          return jsonData(result.data, result.status, requestId);
        }
      }
    }

    if (segments[0] === "artifacts" && segments[1]) {
      const artifactId = segments[1];
      if (method === "GET" && segments.length === 2) {
        return jsonData(await service.getArtifact(actor, artifactId), 200, requestId);
      }
      if (method === "DELETE" && segments.length === 2) {
        assertMutation(request, { idempotency: false });
        await service.deleteArtifact(actor, artifactId);
        const response = new NextResponse(null, { status: 204 });
        response.headers.set("X-Request-Id", requestId);
        return response;
      }
    }

    if (segments[0] === "arena-matches" && segments[1]) {
      const matchId = segments[1];
      if (method === "GET" && segments.length === 2) {
        return jsonData(await service.getArenaMatch(actor, matchId), 200, requestId);
      }
      if (method === "POST" && segments.length === 3 && segments[2] === "votes") {
        assertMutation(request);
        const result = await service.createArenaVote(actor, matchId, await readJsonBody(request));
        return jsonData(result.data, result.status, requestId);
      }
    }

    if (segments[0] === "brew-jobs" && method === "GET" && segments.length === 2) {
      return jsonData(await service.getBrewJob(actor, segments[1]), 200, requestId);
    }
    if (segments[0] === "jobs" && method === "GET" && segments.length === 2) {
      return jsonData(await service.getJob(actor, segments[1]), 200, requestId);
    }
    if (segments[0] === "module-versions" && method === "GET" && segments.length === 2) {
      return jsonData(await service.getModuleVersion(actor, segments[1]), 200, requestId);
    }

    if (segments[0] === "journeys") {
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = await service.createJourney(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 1) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = await service.listJourneys(actor, pagination);
        return jsonPage(result.data, result.page, requestId);
      }

      const journeyId = segments[1];
      if (journeyId) {
        if (method === "GET" && segments.length === 2) {
          return jsonData(await service.getJourney(actor, journeyId), 200, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "player") {
          return jsonData(await service.getJourneyPlayer(actor, journeyId), 200, requestId);
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "commits") {
          const pagination = paginationFromSearchParams(url.searchParams);
          const result = await service.listJourneyCommits(actor, journeyId, pagination);
          return jsonPage(result.data, result.page, requestId);
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "attempts") {
          const { idempotencyKey } = assertMutation(request);
          const result = await service.createAttempt(actor, journeyId, await readJsonBody(request), { idempotencyKey });
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
              await service.updateAttempt(actor, journeyId, attemptId, await readJsonBody(request), {
                ifMatchVersion: parseIfMatchVersion(request),
              }),
              200,
              requestId,
            );
          }
          if (method === "GET") {
            return jsonData(await service.getAttempt(actor, journeyId, attemptId), 200, requestId);
          }
        }
      }
    }

    if (segments[0] === "proofs") {
      if (method === "GET" && segments.length === 1) {
        const pagination = paginationFromSearchParams(url.searchParams);
        const result = await service.listProofs(actor, {
          ...pagination,
          verificationLevel: url.searchParams.get("verificationLevel") ?? undefined,
        });
        return jsonPage(result.data, result.page, requestId);
      }
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = await service.createExternalProof(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 2) {
        return jsonData(await service.getProof(actor, segments[1]), 200, requestId);
      }
    }

    if (segments[0] === "reports") {
      if (method === "POST" && segments.length === 1) {
        const { idempotencyKey } = assertMutation(request);
        const result = await service.createReport(actor, await readJsonBody(request), { idempotencyKey });
        return jsonData(result.data, result.status, requestId);
      }
      if (method === "GET" && segments.length === 2) {
        return jsonData(await service.getReport(actor, segments[1]), 200, requestId);
      }
    }

    throw notFound("Operation này chưa được triển khai trong VS1 increment hiện tại hoặc không tồn tại.");
  } catch (error) {
    return problemResponse(error, requestId);
  }
}
