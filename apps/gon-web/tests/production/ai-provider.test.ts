import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  GENERATE_MODULE_INPUT_SCHEMA_VERSION,
  HttpAdkBrewAiProvider,
  LocalDeterministicBrewAiProvider,
  TOPIC_CHECK_INPUT_SCHEMA_VERSION,
  AiProviderError,
  type GenerateModuleWork,
  type TopicCheckInput,
} from "@/server/ai-provider";
import {
  createBrewAiProviderFromEnv,
  inspectBrewAiConfig,
} from "@/server/adk-config";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { validateModuleGraph } from "@/server/module-graph";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";
import { stableHash } from "@/server/hash";

const contractsDir = path.resolve(import.meta.dirname, "../../docs/04-contracts/schemas");

function env(input: Record<string, string>): NodeJS.ProcessEnv {
  return input as NodeJS.ProcessEnv;
}
const agentSchema = JSON.parse(
  readFileSync(path.join(contractsDir, "agent-contracts.schema.json"), "utf8"),
) as Record<string, unknown>;
const moduleGraphSchema = JSON.parse(
  readFileSync(path.join(contractsDir, "canonical-module-graph.schema.json"), "utf8"),
) as Record<string, unknown>;

function compileContractValidator(name: string) {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(moduleGraphSchema);
  const defs = agentSchema.$defs as Record<string, unknown>;
  return ajv.compile(defs[name] as object);
}

const topicInput: TopicCheckInput = {
  schemaVersion: TOPIC_CHECK_INPUT_SCHEMA_VERSION,
  jobId: "job_contract_t1",
  projectId: "prj_contract_t1",
  intent: "Hiểu hệ thống thủy triều qua bằng chứng người dùng cung cấp",
  artifactCoverage: [
    { artifactId: "art_contract_t1", extractionStatus: "done", hasText: true, hasMetadata: true },
  ],
  policyVersion: "gon-brew-policy/1.0",
};

function sampleWork(): GenerateModuleWork {
  return {
    contractInput: {
      schemaVersion: GENERATE_MODULE_INPUT_SCHEMA_VERSION,
      jobId: "job_contract_t1",
      projectId: "prj_contract_t1",
      learningContext: {
        goal: "Tạo module ngắn về hệ thống thủy triều",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      evidenceBundle: [
        {
          sourceId: "source_1",
          title: "Ghi chú người dùng",
          artifactId: "art_contract_t1",
          content: "Thủy triều chịu ảnh hưởng của mặt trăng và phù sa theo mùa.",
          rightsStatus: "user_provided",
        },
      ],
      graphSchemaVersion: "gon.module-graph/1.0",
    },
    local: {
      userId: "usr_contract_t1",
      projectTitle: "Thủy triều và đồng bằng",
      artifacts: [
        {
          artifactId: "art_contract_t1",
          kind: "text",
          displayName: "Ghi chú người dùng",
          originUri: null,
          isPrompt: true,
          chunks: [
            {
              text: "Thủy triều chịu ảnh hưởng của mặt trăng và phù sa theo mùa.",
              locator: "prompt-1",
              weight: 1,
            },
          ],
        },
      ],
    },
  };
}

describe("hermetic TS↔ADK contract payloads (P03 schemas)", () => {
  it("client topic-check and generate-module inputs satisfy the exact schemas the ADK service validates", () => {
    const validateTopicInput = compileContractValidator("TopicCheckInput");
    const validateGenerateInput = compileContractValidator("GenerateModuleInput");
    const work = sampleWork();

    expect(validateTopicInput(topicInput)).toBe(true);
    expect(validateGenerateInput(work.contractInput)).toBe(true);
  });

  it("deterministic provider outputs satisfy the exact schemas the ADK service returns", async () => {
    const validateTopicOutput = compileContractValidator("TopicCheckOutput");
    const validateGenerateOutput = compileContractValidator("GenerateModuleOutput");
    const provider = new LocalDeterministicBrewAiProvider();

    const topic = await provider.topicCheck(topicInput);
    const generated = await provider.generateModule(sampleWork());

    expect(validateTopicOutput(topic.output)).toBe(true);
    expect(validateGenerateOutput(generated.output)).toBe(true);
  });
});

describe("LocalDeterministicBrewAiProvider", () => {
  it("produces a policy-valid module graph deterministically with safe telemetry", async () => {
    const provider = new LocalDeterministicBrewAiProvider(() => 1_000);
    const first = await provider.generateModule(sampleWork());
    const second = await provider.generateModule(sampleWork());

    const validation = validateModuleGraph(first.output.moduleGraph, {
      evidenceSourceIds: first.output.moduleGraph.sources.map((source) => source.id),
    });
    expect(validation.valid).toBe(true);
    expect(second.output.moduleGraph).toEqual(first.output.moduleGraph);
    expect(first.output.generation).toEqual({
      agentPipelineVersion: "vs1-local-brew-v1",
      modelIds: ["local-deterministic-brew-v1"],
      promptTemplateVersions: ["vs1-local-module-generator-v1"],
      evidenceBundleHash: stableHash(sampleWork().contractInput.evidenceBundle),
    });
    expect(first.telemetry).toMatchObject({
      provider: "local-deterministic",
      inputSchemaVersion: GENERATE_MODULE_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: "gon.agent.generate-module.output/1.0",
      finishReason: "completed",
      errorCode: null,
    });
    expect(first.telemetry.evidenceBundleHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

interface StubAdkOptions {
  status?: number;
  body?: unknown;
  raw?: string;
  delayMs?: number;
}

function stubAdkFetch(
  handler: (url: string) => StubAdkOptions,
): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const options = handler(url);
    if (options.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, options.delayMs);
        const signal = init?.signal ?? null;
        const abort = (): void => {
          clearTimeout(timer);
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    return new Response(options.raw ?? JSON.stringify(options.body ?? {}), {
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

describe("HttpAdkBrewAiProvider request contract", () => {
  it("POSTs only contractInput to the stateless ADK endpoints with service auth and no local fields", async () => {
    const local = await new LocalDeterministicBrewAiProvider().generateModule(sampleWork());
    const { fetch: fetchImpl, calls } = stubAdkFetch((url) => {
      if (url.endsWith("/v1/topic-check")) {
        return {
          body: {
            schemaVersion: "gon.agent.topic-check.output/1.0",
            decision: "allow",
            reasonCodes: ["clear_learning_intent"],
            clarificationQuestions: [],
          },
        };
      }
      return { body: local.output };
    });
    const provider = new HttpAdkBrewAiProvider({
      baseUrl: "https://adk.internal.example",
      serviceToken: "svc-token-12345678",
      timeoutMs: 5_000,
      fetch: fetchImpl,
    });

    const topic = await provider.topicCheck(topicInput);
    const work = sampleWork();
    const generated = await provider.generateModule(work);

    expect(topic.output.decision).toBe("allow");
    expect(generated.output.generation.modelIds).toEqual(local.output.generation.modelIds);

    expect(calls.map((call) => call.url)).toEqual([
      "https://adk.internal.example/v1/topic-check",
      "https://adk.internal.example/v1/generate-module",
    ]);
    for (const call of calls) {
      expect(call.init.method).toBe("POST");
      expect(call.init.redirect).toBe("error");
      const headers = call.init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["x-gon-service-token"]).toBe("svc-token-12345678");
      expect(headers["x-gon-correlation-id"]).toBe("job_contract_t1");
    }
    const generateBody = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
    expect(generateBody.schemaVersion).toBe(GENERATE_MODULE_INPUT_SCHEMA_VERSION);
    // No in-process/local fields may cross the ADK boundary.
    expect(String(calls[1].init.body)).not.toContain('"userId"');
    expect(String(calls[1].init.body)).not.toContain('"artifacts"');
    expect(String(calls[1].init.body)).not.toContain('"projectTitle"');
    expect(generateBody).toHaveProperty("evidenceBundle");
  });

  it("maps ADK problem responses fail-closed without retrying closed failures", async () => {
    const cases: Array<{ status: number; code: string; expected: string; retryable: boolean }> = [
      { status: 401, code: "SERVICE_AUTH_FAILED", expected: "ADK_AUTH_FAILED", retryable: false },
      {
        status: 422,
        code: "CONTRACT_VALIDATION_FAILED",
        expected: "ADK_OUTPUT_INVALID",
        retryable: false,
      },
      { status: 408, code: "UPSTREAM_TIMEOUT", expected: "UPSTREAM_TIMEOUT", retryable: true },
      { status: 503, code: "PROVIDER_UNAVAILABLE", expected: "PROVIDER_UNAVAILABLE", retryable: true },
      { status: 400, code: "INVALID_JSON", expected: "ADK_OUTPUT_INVALID", retryable: false },
    ];
    for (const testCase of cases) {
      const { fetch: fetchImpl } = stubAdkFetch(() => ({
        status: testCase.status,
        body: { code: testCase.code, title: "t", detail: "d", status: testCase.status },
      }));
      const provider = new HttpAdkBrewAiProvider({
        baseUrl: "https://adk.internal.example",
        serviceToken: "svc-token-12345678",
        fetch: fetchImpl,
      });
      const failure = await provider.topicCheck(topicInput).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(AiProviderError);
      const providerError = failure as AiProviderError;
      expect(providerError.code).toBe(testCase.expected);
      expect(providerError.retryable).toBe(testCase.retryable);
      expect(providerError.telemetry.errorCode).toBe(testCase.expected);
    }
  });

  it("rejects invalid outputs, oversized bodies and timeouts with bounded machine codes", async () => {
    const invalidJson = stubAdkFetch(() => ({ status: 200, raw: "not-json" }));
    const invalidSchema = stubAdkFetch(() => ({
      status: 200,
      body: { schemaVersion: "gon.agent.topic-check.output/99.9", decision: "allow" },
    }));
    const oversized = stubAdkFetch(() => ({
      status: 200,
      raw: JSON.stringify({
        schemaVersion: "gon.agent.topic-check.output/1.0",
        decision: "allow",
        reasonCodes: [],
        clarificationQuestions: [],
        pad: "x".repeat(5_100_000),
      }),
    }));
    const slow = stubAdkFetch(() => ({ status: 200, body: {}, delayMs: 1_500 }));

    const cases: Array<{ fetch: typeof fetch; expected: string; timeoutMs?: number }> = [
      { fetch: invalidJson.fetch, expected: "ADK_OUTPUT_INVALID" },
      { fetch: invalidSchema.fetch, expected: "ADK_OUTPUT_INVALID" },
      { fetch: oversized.fetch, expected: "ADK_RESPONSE_TOO_LARGE" },
      { fetch: slow.fetch, expected: "ADK_TIMEOUT", timeoutMs: 1_000 },
    ];
    for (const testCase of cases) {
      const provider = new HttpAdkBrewAiProvider({
        baseUrl: "https://adk.internal.example",
        serviceToken: "svc-token-12345678",
        timeoutMs: testCase.timeoutMs ?? 5_000,
        fetch: testCase.fetch,
      });
      const failure = await provider.topicCheck(topicInput).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(AiProviderError);
      expect((failure as AiProviderError).code).toBe(testCase.expected);
    }
  });

  it("rejects unsafe base URLs and timeouts before any call", () => {
    expect(() => new HttpAdkBrewAiProvider({ baseUrl: "file:///etc/passwd" })).toThrow(/HTTP/);
    expect(() => new HttpAdkBrewAiProvider({ baseUrl: "https://user:pass@adk.example" })).toThrow(
      /without embedded credentials/,
    );
    expect(
      () => new HttpAdkBrewAiProvider({ baseUrl: "https://adk.example", timeoutMs: 10 }),
    ).toThrow(/timeoutMs/);
  });
});

describe("adk-config fail-closed composition", () => {
  it("defaults to the local provider and refuses ADK without queued mode, URL and token", () => {
    expect(inspectBrewAiConfig(env({}))).toMatchObject({ kind: "local", configured: true });
    expect(createBrewAiProviderFromEnv(env({})).kind).toBe("local");

    const missingMode = inspectBrewAiConfig(
      env({
        GON_BREW_PROVIDER: "adk",
        GON_ADK_BASE_URL: "https://adk.internal.example",
        GON_ADK_SERVICE_TOKEN: "svc-token-12345678",
      }),
    );
    expect(missingMode).toMatchObject({ configured: false, errorCode: "BREW_ADK_REQUIRES_QUEUED_MODE" });

    const missingToken = inspectBrewAiConfig(
      env({
        GON_BREW_PROVIDER: "adk",
        GON_BREW_EXECUTION_MODE: "queued",
        GON_ADK_BASE_URL: "https://adk.internal.example",
      }),
    );
    expect(missingToken).toMatchObject({
      configured: false,
      errorCode: "ADK_SERVICE_TOKEN_NOT_CONFIGURED",
    });

    expect(() =>
      createBrewAiProviderFromEnv(
        env({
          GON_BREW_PROVIDER: "adk",
          GON_BREW_EXECUTION_MODE: "queued",
        }),
      ),
    ).toThrow(/not configured/);
  });
});

describe("service wiring: TS worker calls the stateless ADK while it holds no DB authority", () => {
  async function createQueuedBrewJob(provider?: HttpAdkBrewAiProvider) {
    const store = new MemoryGonStore();
    store.seedInvite("GON-ALPHA-TEST");
    const service = new GonService({
      store,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
      brewExecutionMode: "queued",
      ...(provider ? { brewAiProvider: provider } : {}),
      featureFlags: { brew_enabled: true },
    });
    const user = await service.ensureDevUser("Người học ADK");
    const actor: Actor = {
      userId: user.id,
      roles: user.roles,
      authProvider: "test",
      requestId: "req_adk_test",
    };
    await service.seedInvite("GON-ALPHA-ADK");
    await service.createAgeAttestation(actor, {
      isAtLeast18: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      personalizationFootprint: "denied",
      inviteCode: "GON-ALPHA-ADK",
    });
    const project = (await service.createProject(
      actor,
      {
        title: "Thủy triều ADK",
        prompt: "Vì sao thủy triều và phù sa phải được hiểu qua bằng chứng theo mùa?",
        goal: "Hiểu hệ thống thủy triều qua bằng chứng",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "adk-project" },
    )).data;
    const search = (await service.createSearchAttempt(
      actor,
      String(project.id),
      {},
      { idempotencyKey: "adk-search" },
    )).data;
    const queued = (await service.createBrewJob(
      actor,
      String(project.id),
      { searchAttemptId: String(search.id), confirmed: true },
      { idempotencyKey: "adk-brew" },
    )).data;
    return { store, service, actor, jobId: String(queued.id) };
  }

  it("persists policy-validated draft_private results and safe ai_runs from TypeScript only", async () => {
    const generated = await new LocalDeterministicBrewAiProvider().generateModule(sampleWork());
    const { fetch: fetchImpl, calls } = stubAdkFetch((url) => {
      if (url.endsWith("/v1/topic-check")) {
        return {
          body: {
            schemaVersion: "gon.agent.topic-check.output/1.0",
            decision: "allow",
            reasonCodes: ["clear_learning_intent"],
            clarificationQuestions: [],
          },
        };
      }
      return { body: generated.output };
    });
    const provider = new HttpAdkBrewAiProvider({
      baseUrl: "https://adk.internal.example",
      serviceToken: "svc-token-12345678",
      fetch: fetchImpl,
    });
    const { service, store, jobId } = await createQueuedBrewJob(provider);

    const processed = await service.processNextQueuedBrewJob({ workerId: "worker-adk" });
    expect(processed).toMatchObject({ status: "succeeded", id: jobId });

    const versions = [...store.moduleVersions.values()];
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ publicationStatus: "draft_private", visibility: "private" });
    expect(String(versions[0].generationLineage.agentPipelineVersion)).toBe("vs1-local-brew-v1");

    const runs = [...store.aiRuns.values()];
    expect(runs.map((run) => run.operation)).toEqual(["topic_check", "generate_module"]);
    for (const run of runs) {
      expect(run.provider).toBe("gon-adk-http");
      expect(run.jobId).toBe(jobId);
      expect(run.errorCode).toBeNull();
    }
    // Safe telemetry only — no prompt/evidence content in ai_runs.
    expect(JSON.stringify(runs)).not.toContain("Thủy triều chịu ảnh hưởng");
    expect(calls.some((call) => call.url.endsWith("/v1/generate-module"))).toBe(true);
  });

  it("turns provider failures into fail-closed job transitions with ai_runs error records", async () => {
    const failing = new HttpAdkBrewAiProvider({
      baseUrl: "https://adk.internal.example",
      serviceToken: "svc-token-12345678",
      fetch: (async () => {
        throw new Error("boom");
      }) as typeof fetch,
    });
    const { service, store, jobId } = await createQueuedBrewJob(failing);

    const processed = await service.processQueuedBrewJob(jobId, { workerId: "worker-fail" });
    expect(processed).toMatchObject({ status: "failed_retryable", failureCode: "ADK_UNAVAILABLE" });

    const runs = [...store.aiRuns.values()];
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ operation: "topic_check", errorCode: "ADK_UNAVAILABLE" });
    expect(store.moduleVersions.size).toBe(0);
  });

  it("routes topic_check block and clarify decisions without generating", async () => {
    for (const decision of ["block", "clarify"] as const) {
      const provider = new HttpAdkBrewAiProvider({
        baseUrl: "https://adk.internal.example",
        serviceToken: "svc-token-12345678",
        fetch: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (!url.endsWith("/v1/topic-check")) throw new Error("generate must not be called");
          return new Response(
            JSON.stringify({
              schemaVersion: "gon.agent.topic-check.output/1.0",
              decision,
              reasonCodes: ["policy_flag"],
              clarificationQuestions:
                decision === "clarify" ? ["Mục tiêu học của bạn là gì?"] : [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as typeof fetch,
      });
      const { service, store, jobId } = await createQueuedBrewJob(provider);
      const processed = await service.processQueuedBrewJob(jobId, { workerId: "worker-topic" });
      if (decision === "block") {
        expect(processed).toMatchObject({
          status: "failed_terminal",
          failureCode: "TOPIC_BLOCKED_BY_POLICY",
        });
      } else {
        expect(processed).toMatchObject({
          status: "needs_input",
          failureCode: "TOPIC_CLARIFICATION_REQUIRED",
          clarificationQuestions: ["Mục tiêu học của bạn là gì?"],
        });
      }
      expect(store.moduleVersions.size).toBe(0);
      const runs = [...store.aiRuns.values()];
      expect(runs.map((run) => run.operation)).toEqual(["topic_check"]);
    }
  });

  it("fences out a worker that lost its lease: telemetry kept, no module persisted", async () => {
    const generated = await new LocalDeterministicBrewAiProvider().generateModule(sampleWork());
    let storeRef: MemoryGonStore | null = null;
    let jobRef = "";
    const provider = new HttpAdkBrewAiProvider({
      baseUrl: "https://adk.internal.example",
      serviceToken: "svc-token-12345678",
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/topic-check")) {
          return new Response(
            JSON.stringify({
              schemaVersion: "gon.agent.topic-check.output/1.0",
              decision: "allow",
              reasonCodes: [],
              clarificationQuestions: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        // While this call is in flight (outside any DB transaction), another
        // worker takes over the job lease.
        const store = storeRef!;
        await store.runInTransaction(async (repositories) => {
          const job = repositories.jobs.get(jobRef);
          if (job) {
            job.leaseOwner = "worker-thief";
            job.leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
          }
        });
        return new Response(JSON.stringify(generated.output), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const { service, store, jobId } = await createQueuedBrewJob(provider);
    storeRef = store;
    jobRef = jobId;

    const processed = await service.processQueuedBrewJob(jobId, { workerId: "worker-slow" });
    // Fenced: the thief still owns the job, so no result is applied.
    expect(store.moduleVersions.size).toBe(0);
    expect(processed.status).toBe("running");
    const runs = [...store.aiRuns.values()];
    expect(runs.map((run) => run.operation)).toEqual(["topic_check", "generate_module"]);
    expect(runs[0].errorCode).toBeNull();
  });
});
