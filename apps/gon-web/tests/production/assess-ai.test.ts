import { describe, expect, it } from "vitest";
import {
  AiProviderError,
  ASSESS_ATTEMPT_INPUT_SCHEMA_VERSION,
  ASSESS_ATTEMPT_OUTPUT_SCHEMA_VERSION,
  LocalDeterministicBrewAiProvider,
  type AiCallResult,
  type AiCallTelemetry,
  type AssessAttemptOutput,
  type AssessAttemptWork,
  type BrewAiProvider,
  type GenerateModuleWork,
  type TopicCheckInput,
} from "@/server/ai-provider";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

function telemetryFor(errorCode: string | null): AiCallTelemetry {
  return {
    provider: "spy-assess",
    modelId: "spy-model",
    agentPipelineVersion: "spy-assess/1.0",
    promptTemplateVersions: ["spy-prompt/1.0"],
    inputSchemaVersion: ASSESS_ATTEMPT_INPUT_SCHEMA_VERSION,
    outputSchemaVersion: ASSESS_ATTEMPT_OUTPUT_SCHEMA_VERSION,
    evidenceBundleHash: null,
    inputTokens: null,
    outputTokens: null,
    costUnits: 1,
    latencyMs: 5,
    finishReason: errorCode ? null : "completed",
    errorCode,
  };
}

/** Wraps the deterministic provider and spies/overrides `assessAttempt`. */
class SpyAssessProvider implements BrewAiProvider {
  readonly id = "spy-assess";
  readonly kind = "local" as const;
  readonly pipelineVersion = "spy-assess/1.0";
  readonly inner = new LocalDeterministicBrewAiProvider();
  assessCalls = 0;
  mode: "ai_pass" | "ai_low_conf" | "error" = "ai_pass";

  async topicCheck(input: TopicCheckInput) {
    return this.inner.topicCheck(input);
  }
  async generateModule(work: GenerateModuleWork) {
    return this.inner.generateModule(work);
  }
  async assessAttempt(work: AssessAttemptWork): Promise<AiCallResult<AssessAttemptOutput>> {
    this.assessCalls += 1;
    if (this.mode === "error") {
      throw new AiProviderError({
        code: "ADK_UNAVAILABLE",
        retryable: true,
        telemetry: telemetryFor("ADK_UNAVAILABLE"),
      });
    }
    const confidence = this.mode === "ai_pass" ? 0.9 : 0.5;
    return {
      output: {
        schemaVersion: ASSESS_ATTEMPT_OUTPUT_SCHEMA_VERSION,
        decision: this.mode === "ai_pass" ? "passed" : "needs_revision",
        criteria: work.local.rubric.criteria.map((criterion) => ({
          criterionId: criterion.id,
          passed: true,
          feedback: "AI rubric: đạt tiêu chí.",
        })),
        feedback: "AI rubric assessment hoàn tất.",
        confidence,
        integritySignals: [],
      },
      telemetry: telemetryFor(null),
    };
  }
}

function createService(spy: SpyAssessProvider) {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    brewExecutionMode: "inline",
    brewAiProvider: spy,
    featureFlags: { brew_enabled: true },
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
    requestId: "req_assess_ai",
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

const GOOD_ANSWER =
  "Âm nhạc viral không chỉ nằm ở giai điệu. Bằng chứng trong nguồn cho thấy cần xét cộng đồng chia sẻ đầu tiên và thời điểm văn hóa, đồng thời giới hạn là một video chưa đủ để kết luận công thức chung nếu chưa kiểm chứng ở bối cảnh khác.";

/** Full VS1 journey up to a submitted draft attempt on `retrieval_core`. */
async function prepareAttempt(spy: SpyAssessProvider, key: string) {
  const { store, service } = createService(spy);
  const { actor } = await activate(service, `Người học assess ${key}`);
  const project = (
    await service.createProject(
      actor,
      {
        title: `Assess AI ${key}`,
        prompt: "Vì sao nội dung lan truyền cần được hiểu đúng bối cảnh?",
        goal: "Kiểm chứng AI assessment",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: `assess-ai-project-${key}` },
    )
  ).data;
  const projectId = String(project.id);
  const search = (await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: `assess-ai-search-${key}` })).data;
  const brew = await service.createBrewJob(
    actor,
    projectId,
    { searchAttemptId: String(search.id), confirmed: true },
    { idempotencyKey: `assess-ai-brew-${key}` },
  );
  const moduleVersionId = String(brew.data.resultModuleVersionId);
  const explorer = await service.getOutputExplorer(actor, projectId);
  const candidate = (explorer.candidates as Array<Record<string, unknown>>)[0];
  const journey = (
    await service.createJourney(
      actor,
      { candidateId: String(candidate.id), ifExists: "return_existing" },
      { idempotencyKey: `assess-ai-journey-${key}` },
    )
  ).data;
  const journeyId = String(journey.id);
  const attempt = (
    await service.createAttempt(actor, journeyId, { nodeId: "retrieval_core" }, { idempotencyKey: `assess-ai-attempt-${key}` })
  ).data;
  await service.updateAttempt(
    actor,
    journeyId,
    String(attempt.id),
    { answerText: GOOD_ANSWER },
    { ifMatchVersion: 1 },
  );
  return { store, service, actor, journeyId, attemptId: String(attempt.id), moduleVersionId };
}

function makeRubricUnknown(store: MemoryGonStore, moduleVersionId: string): void {
  const version = store.moduleVersions.get(moduleVersionId);
  for (const rubric of version!.graph.rubrics) {
    for (const criterion of rubric.criteria) {
      criterion.id = `open_${criterion.id}`;
    }
  }
}

describe("AI assess-attempt integration (P05-R1.9)", () => {
  it("keeps the deterministic-first path AI-free when rules can decide", async () => {
    const spy = new SpyAssessProvider();
    const { service, actor, journeyId, attemptId, store } = await prepareAttempt(spy, "det");
    const submitted = await service.submitAttempt(actor, journeyId, attemptId, {
      idempotencyKey: "assess-ai-submit-det",
    });
    expect(submitted.data).toMatchObject({ status: "passed", xpAwarded: 10 });
    expect(spy.assessCalls).toBe(0);
    expect([...store.aiRuns.values()].filter((run) => run.operation === "assess_attempt")).toHaveLength(0);
  });

  it("routes unresolved rubric criteria to the AI assessor outside the UoW", async () => {
    const spy = new SpyAssessProvider();
    const { service, actor, journeyId, attemptId, moduleVersionId, store } = await prepareAttempt(spy, "ai");
    makeRubricUnknown(store, moduleVersionId);

    const submitted = await service.submitAttempt(actor, journeyId, attemptId, {
      idempotencyKey: "assess-ai-submit-ai",
    });
    expect(spy.assessCalls).toBe(1);
    expect(submitted.data).toMatchObject({ status: "passed", xpAwarded: 10 });
    const record = store.attempts.get(attemptId)!;
    expect(record.assessment).toMatchObject({
      assessorType: "ai",
      assessorVersion: "spy-assess/1.0",
      confidence: 0.9,
      decision: "passed",
    });

    // Safe AI telemetry was persisted with the assess_attempt operation.
    const runs = [...store.aiRuns.values()].filter((run) => run.operation === "assess_attempt");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ operation: "assess_attempt", provider: "spy-assess" });
    expect(JSON.stringify(runs[0])).not.toContain(GOOD_ANSWER);
  });

  it("gates low-confidence AI decisions to human review without XP", async () => {
    const spy = new SpyAssessProvider();
    spy.mode = "ai_low_conf";
    const { service, actor, journeyId, attemptId, moduleVersionId, store } = await prepareAttempt(spy, "low");
    makeRubricUnknown(store, moduleVersionId);

    const submitted = await service.submitAttempt(actor, journeyId, attemptId, {
      idempotencyKey: "assess-ai-submit-low",
    });
    expect(spy.assessCalls).toBe(1);
    // P03: confidence < 0.70 stays pending human review even if the model
    // leans needs_revision/passed — and no XP is posted.
    expect(submitted.data).toMatchObject({ status: "pending_human_review" });
    expect(submitted.data.xpAwarded ?? 0).toBe(0);
  });

  it("fails closed to human review when the AI assessor errors", async () => {
    const spy = new SpyAssessProvider();
    spy.mode = "error";
    const { service, actor, journeyId, attemptId, moduleVersionId, store } = await prepareAttempt(spy, "err");
    makeRubricUnknown(store, moduleVersionId);

    const submitted = await service.submitAttempt(actor, journeyId, attemptId, {
      idempotencyKey: "assess-ai-submit-err",
    });
    expect(spy.assessCalls).toBe(1);
    expect(submitted.data).toMatchObject({ status: "pending_human_review" });
    expect(submitted.data.xpAwarded ?? 0).toBe(0);
    const runs = [...store.aiRuns.values()].filter((run) => run.operation === "assess_attempt");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ operation: "assess_attempt", errorCode: "ADK_UNAVAILABLE" });
  });
});
