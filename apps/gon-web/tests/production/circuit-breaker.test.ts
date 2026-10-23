import { describe, expect, it } from "vitest";
import {
  AiProviderError,
  CircuitBreakingBrewAiProvider,
  LocalDeterministicBrewAiProvider,
  type BrewAiProvider,
  type GenerateModuleWork,
  type TopicCheckInput,
} from "@/server/ai-provider";
import { createBrewAiProviderFromEnv } from "@/server/adk-config";

class FakeBrewAiProvider implements BrewAiProvider {
  readonly id = "fake-brew";
  readonly kind = "local" as const;
  readonly pipelineVersion = "fake/1.0";
  calls = 0;
  failures = 0;
  mode: "ok" | "fail" = "ok";

  private result() {
    this.calls += 1;
    if (this.mode === "fail") {
      this.failures += 1;
      throw new AiProviderError({
        code: "ADK_UNAVAILABLE",
        retryable: true,
        telemetry: {
          provider: "fake",
          modelId: "fake-model",
          agentPipelineVersion: "fake/1.0",
          promptTemplateVersions: [],
          inputSchemaVersion: "fake.input/1.0",
          outputSchemaVersion: "fake.output/1.0",
          evidenceBundleHash: null,
          inputTokens: null,
          outputTokens: null,
          costUnits: 0,
          latencyMs: 1,
          finishReason: null,
          errorCode: "ADK_UNAVAILABLE",
        },
      });
    }
    return {
      output: null,
      telemetry: {
        provider: "fake",
        modelId: "fake-model",
        agentPipelineVersion: "fake/1.0",
        promptTemplateVersions: [],
        inputSchemaVersion: "fake.input/1.0",
        outputSchemaVersion: "fake.output/1.0",
        evidenceBundleHash: null,
        inputTokens: null,
        outputTokens: null,
        costUnits: 0,
        latencyMs: 1,
        finishReason: "completed" as const,
        errorCode: null,
      },
    };
  }

  async topicCheck(_input: TopicCheckInput): Promise<never> {
    return this.result() as never;
  }

  async generateModule(_work: GenerateModuleWork): Promise<never> {
    return this.result() as never;
  }

  async assessAttempt(_work: unknown): Promise<never> {
    return this.result() as never;
  }
}

function topicInput(): TopicCheckInput {
  return {
    schemaVersion: "gon.agent.topic-check.input/1.0",
    jobId: "job_circuit",
    projectId: "prj_circuit",
    intent: "Hiểu circuit breaker",
    artifactCoverage: [],
    policyVersion: "gon-brew-policy/1.0",
  };
}

describe("CircuitBreakingBrewAiProvider (P05-R1.6)", () => {
  it("opens after consecutive failures, fails fast, and probes half-open after cooldown", async () => {
    let nowMs = 1_000_000;
    const inner = new FakeBrewAiProvider();
    const breaker = new CircuitBreakingBrewAiProvider(inner, {
      failureThreshold: 2,
      cooldownMs: 30_000,
      now: () => nowMs,
    });

    // Two consecutive failures trip the breaker open.
    inner.mode = "fail";
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    expect(inner.calls).toBe(2);
    expect(breaker.circuitState).toBe("open");

    // While open the breaker fails fast without touching the provider.
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({
      code: "AI_PROVIDER_CIRCUIT_OPEN",
      retryable: true,
    });
    expect(inner.calls).toBe(2);

    // After the cooldown exactly one half-open probe is admitted.
    nowMs += 30_001;
    inner.mode = "ok";
    const probe = await breaker.topicCheck(topicInput());
    expect(probe.telemetry.provider).toBe("fake");
    expect(inner.calls).toBe(3);
    expect(breaker.circuitState).toBe("closed");
  });

  it("re-opens when the half-open probe fails", async () => {
    let nowMs = 2_000_000;
    const inner = new FakeBrewAiProvider();
    const breaker = new CircuitBreakingBrewAiProvider(inner, {
      failureThreshold: 1,
      cooldownMs: 10_000,
      now: () => nowMs,
    });

    inner.mode = "fail";
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    expect(breaker.circuitState).toBe("open");

    nowMs += 10_001;
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    expect(breaker.circuitState).toBe("open");

    // Still open until the next cooldown elapses.
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({
      code: "AI_PROVIDER_CIRCUIT_OPEN",
    });
    expect(inner.calls).toBe(2);
  });

  it("counts failures across both operations and resets on any success", async () => {
    const nowMs = 3_000_000;
    const inner = new FakeBrewAiProvider();
    const breaker = new CircuitBreakingBrewAiProvider(inner, {
      failureThreshold: 3,
      cooldownMs: 60_000,
      now: () => nowMs,
    });

    inner.mode = "fail";
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    await expect(
      breaker.generateModule({
        contractInput: {
          schemaVersion: "gon.agent.generate-module.input/1.0",
          jobId: "job_circuit",
          projectId: "prj_circuit",
          learningContext: { goal: "g", learningMode: "deep_mastery", locale: "vi-VN" },
          evidenceBundle: [],
          graphSchemaVersion: "gon.module-graph/1.0",
        },
        local: { userId: "usr_circuit", projectTitle: "p", artifacts: [] },
      }),
    ).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    expect(breaker.circuitState).toBe("closed");

    // One success resets the consecutive-failure counter.
    inner.mode = "ok";
    await breaker.topicCheck(topicInput());
    inner.mode = "fail";
    await expect(breaker.topicCheck(topicInput())).rejects.toMatchObject({ code: "ADK_UNAVAILABLE" });
    expect(breaker.circuitState).toBe("closed");
  });

  it("validates breaker options and wires into the env factory by default", () => {
    expect(() => new CircuitBreakingBrewAiProvider(new FakeBrewAiProvider(), { failureThreshold: 0 })).toThrow(
      /failureThreshold/,
    );
    expect(() => new CircuitBreakingBrewAiProvider(new FakeBrewAiProvider(), { cooldownMs: 10 })).toThrow(
      /cooldownMs/,
    );

    const wrapped = createBrewAiProviderFromEnv({ GON_BREW_PROVIDER: "local" } as unknown as NodeJS.ProcessEnv);
    expect(wrapped).toBeInstanceOf(CircuitBreakingBrewAiProvider);
    expect(wrapped.kind).toBe("local");

    const bare = createBrewAiProviderFromEnv({ GON_BREW_PROVIDER: "local" } as unknown as NodeJS.ProcessEnv, {
      circuitBreaker: false,
    });
    expect(bare).toBeInstanceOf(LocalDeterministicBrewAiProvider);

    const tuned = createBrewAiProviderFromEnv(
      {
        GON_BREW_PROVIDER: "local",
        GON_AI_CIRCUIT_FAILURE_THRESHOLD: "5",
        GON_AI_CIRCUIT_COOLDOWN_MS: "45000",
      } as unknown as NodeJS.ProcessEnv,
    );
    expect(tuned).toBeInstanceOf(CircuitBreakingBrewAiProvider);
  });
});
