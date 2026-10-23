import { describe, expect, it } from "vitest";
import { LocalContentSafetyScanner } from "@/server/content-safety";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";
import { SafeUrlFetcher } from "@/server/url-fetcher";

const scanner = new LocalContentSafetyScanner();

describe("LocalContentSafetyScanner (P05-R1.8)", () => {
  it("blocks executable, archive and malware signatures regardless of declared type", () => {
    expect(scanner.scan({ kind: "file", bytes: Buffer.from("MZ\x90\x00"), sourceText: null, originUri: null })).toMatchObject({
      status: "blocked",
      reasonCodes: ["SAFETY_PE_EXECUTABLE"],
    });
    expect(
      scanner.scan({ kind: "file", bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]), sourceText: null, originUri: null }),
    ).toMatchObject({ status: "blocked", reasonCodes: ["SAFETY_ELF_EXECUTABLE"] });
    expect(
      scanner.scan({ kind: "file", bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]), sourceText: null, originUri: null }),
    ).toMatchObject({ status: "blocked", reasonCodes: ["SAFETY_ARCHIVE"] });
    expect(
      scanner.scan({ kind: "file", bytes: Buffer.from("#!/bin/sh\nrm -rf /"), sourceText: null, originUri: null }),
    ).toMatchObject({ status: "blocked", reasonCodes: ["SAFETY_SCRIPT_EXECUTABLE"] });

    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    expect(scanner.scan({ kind: "text", bytes: null, sourceText: `gửi kèm ${eicar}`, originUri: null })).toMatchObject({
      status: "blocked",
      reasonCodes: ["SAFETY_MALWARE_SIGNATURE"],
    });
    expect(scanner.scan({ kind: "file", bytes: Buffer.from(eicar), sourceText: null, originUri: null })).toMatchObject({
      status: "blocked",
    });
  });

  it("allows ordinary learning content", () => {
    expect(
      scanner.scan({ kind: "text", bytes: Buffer.from("Ôn thi môn giải tích"), sourceText: "Ôn thi môn giải tích", originUri: null }),
    ).toEqual({ status: "allowed", reasonCodes: [] });
  });
});

function stubFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler();
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const publicLookup = async () => ["93.184.216.34"];
const privateLookup = async () => ["10.0.0.5"];

describe("SafeUrlFetcher (P05-R1.8)", () => {
  it("rejects hostnames that resolve to private addresses (DNS-rebinding defense)", async () => {
    const fetcher = new SafeUrlFetcher({
      fetchImpl: stubFetch({}),
      lookup: privateLookup,
    });
    await expect(fetcher.fetchContent("https://evil.example.com/page")).rejects.toMatchObject({
      code: "ARTIFACT_URL_BLOCKED",
    });
  });

  it("re-validates every redirect hop and never follows into private networks", async () => {
    const fetcher = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://start.example.com/": () =>
          new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
      }),
      lookup: publicLookup,
    });
    await expect(fetcher.fetchContent("https://start.example.com/")).rejects.toMatchObject({
      code: "ARTIFACT_URL_BLOCKED",
    });

    const loop = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://a.example.com/": () => new Response(null, { status: 302, headers: { location: "https://b.example.com/" } }),
        "https://b.example.com/": () => new Response(null, { status: 302, headers: { location: "https://a.example.com/" } }),
      }),
      lookup: publicLookup,
    });
    await expect(loop.fetchContent("https://a.example.com/")).rejects.toMatchObject({
      code: "URL_FETCH_REDIRECT_LOOP",
    });
  });

  it("never bypasses login walls or paywalls and stays credential-free", async () => {
    let sawCredentials: RequestCredentials | undefined;
    const fetcher = new SafeUrlFetcher({
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        sawCredentials = init?.credentials;
        return new Response("subscribe to continue", { status: 402 });
      }) as typeof fetch,
      lookup: publicLookup,
    });
    await expect(fetcher.fetchContent("https://paywall.example.com/article")).rejects.toMatchObject({
      code: "URL_ACCESS_RESTRICTED",
    });
    expect(sawCredentials).toBe("omit");
  });

  it("caps body size and content types, and follows safe chains", async () => {
    const tooLarge = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://big.example.com/": () => new Response("x".repeat(2048), { status: 200, headers: { "content-type": "text/html" } }),
      }),
      lookup: publicLookup,
      maxBytes: 1024,
    });
    await expect(tooLarge.fetchContent("https://big.example.com/")).rejects.toMatchObject({
      code: "URL_FETCH_TOO_LARGE",
    });

    const wrongType = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://exe.example.com/": () => new Response("MZ", { status: 200, headers: { "content-type": "application/x-msdownload" } }),
      }),
      lookup: publicLookup,
    });
    await expect(wrongType.fetchContent("https://exe.example.com/")).rejects.toMatchObject({
      code: "URL_CONTENT_TYPE_BLOCKED",
    });

    const ok = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://a.example.com/": () => new Response(null, { status: 301, headers: { location: "https://b.example.com/final" } }),
        "https://b.example.com/final": () =>
          new Response("<html>học tập</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
      }),
      lookup: publicLookup,
    });
    const result = await ok.fetchContent("https://a.example.com/");
    expect(result.redirectChain).toEqual(["https://b.example.com/final"]);
    expect(result.bytes.toString("utf-8")).toContain("học tập");
    expect(result.contentType).toBe("text/html");
  });
});

function createService(urlFetcher?: SafeUrlFetcher) {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    brewExecutionMode: "queued",
    featureFlags: { brew_enabled: true },
    urlFetcher,
  });
  return { store, service };
}

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: "req_url_safety",
  };
  activationSequence += 1;
  const inviteCode = `GON-ALPHA-TEST-${activationSequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode,
  });
  return { user, actor };
}

async function createProject(service: GonService, actor: Actor, key: string) {
  const project = (
    await service.createProject(
      actor,
      {
        title: `URL safety ${key}`,
        prompt: "Nội dung học tập",
        goal: "Kiểm chứng upload/URL safety",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: `url-safety-project-${key}` },
    )
  ).data;
  return String(project.id);
}

describe("artifact content safety wiring (P05-R1.8)", () => {
  it("blocks text artifacts carrying malware signatures", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học text safety");
    const projectId = await createProject(service, actor, "text");
    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

    const result = await service.addProjectArtifact(
      actor,
      projectId,
      { kind: "text", rightsBasis: "created_by_user", text: `ghi chú ${eicar}` },
      { idempotencyKey: "url-safety-text-1" },
    );
    const artifact = store.artifacts.get(String(result.data.id));
    expect(artifact).toMatchObject({
      safetyStatus: "blocked",
      extractionStatus: "blocked",
      failureCode: "SAFETY_MALWARE_SIGNATURE",
    });
    expect(
      store.outboxEvents.some(
        (event) => event.eventType === "artifact.blocked" && event.aggregateId === String(result.data.id),
      ),
    ).toBe(true);
  });

  it("processes URL artifacts through the safe fetcher and blocks restricted targets", async () => {
    const fetcher = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://learn.example.com/notes": () =>
          new Response("Ghi chú học tập công khai", { status: 200, headers: { "content-type": "text/plain" } }),
      }),
      lookup: publicLookup,
    });
    const { service, store } = createService(fetcher);
    const { actor } = await activate(service, "Người học url fetch");
    const projectId = await createProject(service, actor, "fetch");

    const ok = await service.addProjectArtifact(
      actor,
      projectId,
      {
        kind: "website_url",
        rightsBasis: "publicly_available_link",
        uri: "https://learn.example.com/notes",
      },
      { idempotencyKey: "url-safety-fetch-1" },
    );
    const fetched = store.artifacts.get(String(ok.data.id));
    expect(fetched).toMatchObject({ safetyStatus: "allowed", extractionStatus: "ready" });
    expect(fetched?.sourceText).toContain("Ghi chú học tập");

    // Restricted (paywall) target fails closed into the blocked state.
    const restrictedFetcher = new SafeUrlFetcher({
      fetchImpl: stubFetch({
        "https://pay.example.com/premium": () => new Response("pay", { status: 403 }),
      }),
      lookup: publicLookup,
    });
    const restricted = createService(restrictedFetcher);
    const { actor: restrictedActor } = await activate(restricted.service, "Người học paywall");
    const restrictedProject = await createProject(restricted.service, restrictedActor, "paywall");
    const blocked = await restricted.service.addProjectArtifact(
      restrictedActor,
      restrictedProject,
      {
        kind: "website_url",
        rightsBasis: "publicly_available_link",
        uri: "https://pay.example.com/premium",
      },
      { idempotencyKey: "url-safety-fetch-2" },
    );
    expect(restricted.store.artifacts.get(String(blocked.data.id))).toMatchObject({
      safetyStatus: "blocked",
      extractionStatus: "blocked",
      failureCode: "URL_ACCESS_RESTRICTED",
    });
  });
});
