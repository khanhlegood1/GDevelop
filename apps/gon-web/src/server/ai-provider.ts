import { stableHash } from "./hash";
import {
  generateLocalModuleGraph,
  type EvidenceArtifactForGraph,
} from "./module-graph";
import type { LearningMode, ModuleGraph } from "./types";

export const TOPIC_CHECK_INPUT_SCHEMA_VERSION =
  "gon.agent.topic-check.input/1.0" as const;
export const TOPIC_CHECK_OUTPUT_SCHEMA_VERSION =
  "gon.agent.topic-check.output/1.0" as const;
export const GENERATE_MODULE_INPUT_SCHEMA_VERSION =
  "gon.agent.generate-module.input/1.0" as const;
export const GENERATE_MODULE_OUTPUT_SCHEMA_VERSION =
  "gon.agent.generate-module.output/1.0" as const;
export const BREW_POLICY_VERSION = "gon-brew-policy/1.0" as const;

const LOCAL_PIPELINE_VERSION = "vs1-local-brew-v1";
const LOCAL_MODEL_ID = "local-deterministic-brew-v1";
const HTTP_PIPELINE_VERSION = "gon-adk-http/1.0";
const MAX_ADK_REQUEST_BYTES = 2_500_000;
const MAX_ADK_RESPONSE_BYTES = 5_000_000;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type BrewAiOperation = "topic_check" | "generate_module";

export interface TopicCheckInput {
  schemaVersion: typeof TOPIC_CHECK_INPUT_SCHEMA_VERSION;
  jobId: string;
  projectId: string;
  intent: string;
  artifactCoverage: Array<{
    artifactId: string;
    extractionStatus: string;
    hasText?: boolean;
    hasMetadata?: boolean;
  }>;
  policyVersion: string;
}

export interface TopicCheckOutput {
  schemaVersion: typeof TOPIC_CHECK_OUTPUT_SCHEMA_VERSION;
  decision: "allow" | "clarify" | "block";
  reasonCodes: string[];
  clarificationQuestions: string[];
}

export interface GenerateModuleEvidenceItem {
  sourceId: string;
  title: string;
  uri?: string;
  artifactId?: string;
  content: string;
  rightsStatus: string;
}

export interface GenerateModuleInput {
  schemaVersion: typeof GENERATE_MODULE_INPUT_SCHEMA_VERSION;
  jobId: string;
  projectId: string;
  learningContext: {
    goal: string;
    learningMode: LearningMode;
    depth?: "intro" | "standard" | "deep";
    timeBudgetMinutes?: number;
    locale: string;
  };
  evidenceBundle: GenerateModuleEvidenceItem[];
  graphSchemaVersion: "gon.module-graph/1.0";
}

export interface GenerateModuleOutput {
  schemaVersion: typeof GENERATE_MODULE_OUTPUT_SCHEMA_VERSION;
  moduleGraph: ModuleGraph;
  generation: {
    agentPipelineVersion: string;
    modelIds: string[];
    promptTemplateVersions: string[];
    evidenceBundleHash: string;
  };
}

/**
 * Internal-only context that lets the in-process deterministic provider keep
 * producing the established VS1 graph. The HTTP adapter deliberately sends
 * only `contractInput`; none of these local fields crosses the ADK boundary.
 */
export interface GenerateModuleWork {
  contractInput: GenerateModuleInput;
  local: {
    userId: string;
    projectTitle: string;
    artifacts: EvidenceArtifactForGraph[];
  };
}

export interface AiCallTelemetry {
  provider: string;
  modelId: string;
  agentPipelineVersion: string;
  promptTemplateVersions: string[];
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  evidenceBundleHash: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUnits: number;
  latencyMs: number;
  finishReason: string | null;
  errorCode: string | null;
}

export interface AiCallResult<T> {
  output: T;
  telemetry: AiCallTelemetry;
}

export class AiProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly telemetry: AiCallTelemetry;

  constructor(input: {
    code: string;
    retryable: boolean;
    telemetry: AiCallTelemetry;
    message?: string;
  }) {
    super(input.message ?? `AI provider call failed with ${input.code}`);
    this.name = "AiProviderError";
    this.code = SAFE_ERROR_CODE.test(input.code) ? input.code : "AI_PROVIDER_FAILED";
    this.retryable = input.retryable;
    this.telemetry = {
      ...input.telemetry,
      finishReason: null,
      errorCode: this.code,
    };
  }
}

export interface BrewAiProvider {
  readonly id: string;
  readonly kind: "local" | "adk_http";
  readonly pipelineVersion: string;
  topicCheck(input: TopicCheckInput): Promise<AiCallResult<TopicCheckOutput>>;
  generateModule(work: GenerateModuleWork): Promise<AiCallResult<GenerateModuleOutput>>;
}

function baseTelemetry(input: {
  provider: string;
  modelId: string;
  agentPipelineVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  evidenceBundleHash?: string | null;
  promptTemplateVersions?: string[];
}): AiCallTelemetry {
  return {
    provider: input.provider,
    modelId: input.modelId,
    agentPipelineVersion: input.agentPipelineVersion,
    promptTemplateVersions: input.promptTemplateVersions ?? [],
    inputSchemaVersion: input.inputSchemaVersion,
    outputSchemaVersion: input.outputSchemaVersion,
    evidenceBundleHash: input.evidenceBundleHash ?? null,
    inputTokens: null,
    outputTokens: null,
    costUnits: 0,
    latencyMs: 0,
    finishReason: null,
    errorCode: null,
  };
}

function elapsedMs(startedAt: number, now: () => number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

export class LocalDeterministicBrewAiProvider implements BrewAiProvider {
  readonly id = "local-deterministic";
  readonly kind = "local" as const;
  readonly pipelineVersion = LOCAL_PIPELINE_VERSION;

  constructor(private readonly now: () => number = () => Date.now()) {}

  async topicCheck(
    input: TopicCheckInput,
  ): Promise<AiCallResult<TopicCheckOutput>> {
    const startedAt = this.now();
    void input;
    // The domain service has already applied its deterministic local safety
    // and evidence gates. This adapter is a contract-compatible allow step,
    // not a second safety authority and not an LLM.
    return {
      output: {
        schemaVersion: TOPIC_CHECK_OUTPUT_SCHEMA_VERSION,
        decision: "allow",
        reasonCodes: ["local_deterministic_check_only"],
        clarificationQuestions: [],
      },
      telemetry: {
        ...baseTelemetry({
          provider: this.id,
          modelId: LOCAL_MODEL_ID,
          agentPipelineVersion: LOCAL_PIPELINE_VERSION,
          inputSchemaVersion: TOPIC_CHECK_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: TOPIC_CHECK_OUTPUT_SCHEMA_VERSION,
        }),
        latencyMs: elapsedMs(startedAt, this.now),
        finishReason: "completed",
      },
    };
  }

  async generateModule(
    work: GenerateModuleWork,
  ): Promise<AiCallResult<GenerateModuleOutput>> {
    const startedAt = this.now();
    const { contractInput, local } = work;
    const evidenceBundleHash = stableHash(contractInput.evidenceBundle);
    const promptTemplateVersions = ["vs1-local-module-generator-v1"];
    const graph = generateLocalModuleGraph({
      jobId: contractInput.jobId,
      userId: local.userId,
      projectTitle: local.projectTitle,
      goal: contractInput.learningContext.goal,
      locale: contractInput.learningContext.locale,
      depth: contractInput.learningContext.depth ?? "standard",
      timeBudgetMinutes: contractInput.learningContext.timeBudgetMinutes ?? 30,
      artifacts: local.artifacts,
      pipelineVersion: LOCAL_PIPELINE_VERSION,
      modelIds: [LOCAL_MODEL_ID],
      createdByType: "system_seed",
      attributionDisplayName: "GON local draft generator",
    });

    return {
      output: {
        schemaVersion: GENERATE_MODULE_OUTPUT_SCHEMA_VERSION,
        moduleGraph: graph,
        generation: {
          agentPipelineVersion: LOCAL_PIPELINE_VERSION,
          modelIds: [LOCAL_MODEL_ID],
          promptTemplateVersions,
          evidenceBundleHash,
        },
      },
      telemetry: {
        ...baseTelemetry({
          provider: this.id,
          modelId: LOCAL_MODEL_ID,
          agentPipelineVersion: LOCAL_PIPELINE_VERSION,
          inputSchemaVersion: GENERATE_MODULE_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: GENERATE_MODULE_OUTPUT_SCHEMA_VERSION,
          evidenceBundleHash,
          promptTemplateVersions,
        }),
        latencyMs: elapsedMs(startedAt, this.now),
        finishReason: "completed",
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (!value.every((item) => typeof item === "string" && item.length <= maxLength)) return null;
  return value;
}

function parseTopicCheckOutput(value: unknown): TopicCheckOutput {
  if (!isRecord(value) || value.schemaVersion !== TOPIC_CHECK_OUTPUT_SCHEMA_VERSION) {
    throw new Error("Invalid topic-check schemaVersion");
  }
  if (!["allow", "clarify", "block"].includes(String(value.decision))) {
    throw new Error("Invalid topic-check decision");
  }
  const reasonCodes = stringArray(value.reasonCodes, 32, 128);
  const clarificationQuestions = stringArray(value.clarificationQuestions, 3, 300);
  if (!reasonCodes || !clarificationQuestions) {
    throw new Error("Invalid topic-check arrays");
  }
  if (value.decision === "clarify" && clarificationQuestions.length === 0) {
    throw new Error("Clarify requires a question");
  }
  if (value.decision !== "clarify" && clarificationQuestions.length > 0) {
    throw new Error("Allow/block must not include clarification questions");
  }
  return {
    schemaVersion: TOPIC_CHECK_OUTPUT_SCHEMA_VERSION,
    decision: value.decision as TopicCheckOutput["decision"],
    reasonCodes,
    clarificationQuestions,
  };
}

function parseGenerateModuleOutput(value: unknown): GenerateModuleOutput {
  if (!isRecord(value) || value.schemaVersion !== GENERATE_MODULE_OUTPUT_SCHEMA_VERSION) {
    throw new Error("Invalid generate-module schemaVersion");
  }
  if (!isRecord(value.generation)) throw new Error("Missing generation metadata");
  const agentPipelineVersion = value.generation.agentPipelineVersion;
  const modelIds = stringArray(value.generation.modelIds, 16, 256);
  const promptTemplateVersions = stringArray(
    value.generation.promptTemplateVersions,
    32,
    256,
  );
  const evidenceBundleHash = value.generation.evidenceBundleHash;
  if (
    typeof agentPipelineVersion !== "string" ||
    agentPipelineVersion.length === 0 ||
    agentPipelineVersion.length > 256 ||
    !modelIds ||
    !promptTemplateVersions ||
    typeof evidenceBundleHash !== "string" ||
    !SHA256_PATTERN.test(evidenceBundleHash)
  ) {
    throw new Error("Invalid generation metadata");
  }

  const graph = value.moduleGraph;
  if (
    !isRecord(graph) ||
    graph.schemaVersion !== "gon.module-graph/1.0" ||
    !isRecord(graph.module) ||
    !Array.isArray(graph.sources) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(graph.rubrics) ||
    !Array.isArray(graph.renderTargets) ||
    !isRecord(graph.provenance) ||
    !isRecord(graph.quality)
  ) {
    throw new Error("Invalid module graph candidate shape");
  }

  return {
    schemaVersion: GENERATE_MODULE_OUTPUT_SCHEMA_VERSION,
    moduleGraph: graph as unknown as ModuleGraph,
    generation: {
      agentPipelineVersion,
      modelIds,
      promptTemplateVersions,
      evidenceBundleHash,
    },
  };
}

function problemCode(value: unknown): string | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  const code = value.code.trim().toUpperCase();
  return SAFE_ERROR_CODE.test(code) ? code : null;
}

export interface HttpAdkBrewAiProviderOptions {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export class HttpAdkBrewAiProvider implements BrewAiProvider {
  readonly id = "gon-adk-http";
  readonly kind = "adk_http" as const;
  readonly pipelineVersion = HTTP_PIPELINE_VERSION;

  private readonly baseUrl: string;
  private readonly serviceToken?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: HttpAdkBrewAiProviderOptions) {
    const parsed = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("ADK base URL must be an HTTP(S) URL without embedded credentials");
    }
    parsed.search = "";
    parsed.hash = "";
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.serviceToken = options.serviceToken?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 180_000) {
      throw new Error("ADK timeoutMs must be an integer between 1000 and 180000");
    }
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async topicCheck(
    input: TopicCheckInput,
  ): Promise<AiCallResult<TopicCheckOutput>> {
    return this.post({
      path: "/v1/topic-check",
      input,
      inputSchemaVersion: TOPIC_CHECK_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: TOPIC_CHECK_OUTPUT_SCHEMA_VERSION,
      parse: parseTopicCheckOutput,
    });
  }

  async generateModule(
    work: GenerateModuleWork,
  ): Promise<AiCallResult<GenerateModuleOutput>> {
    const evidenceBundleHash = stableHash(work.contractInput.evidenceBundle);
    const result = await this.post({
      path: "/v1/generate-module",
      input: work.contractInput,
      inputSchemaVersion: GENERATE_MODULE_INPUT_SCHEMA_VERSION,
      outputSchemaVersion: GENERATE_MODULE_OUTPUT_SCHEMA_VERSION,
      evidenceBundleHash,
      parse: parseGenerateModuleOutput,
    });
    result.telemetry = {
      ...result.telemetry,
      modelId: result.output.generation.modelIds[0] ?? "configured-at-runtime",
      agentPipelineVersion: result.output.generation.agentPipelineVersion,
      promptTemplateVersions: result.output.generation.promptTemplateVersions,
      evidenceBundleHash: result.output.generation.evidenceBundleHash,
    };
    return result;
  }

  private async post<T>(input: {
    path: string;
    input: unknown;
    inputSchemaVersion: string;
    outputSchemaVersion: string;
    evidenceBundleHash?: string;
    parse: (value: unknown) => T;
  }): Promise<AiCallResult<T>> {
    const startedAt = this.now();
    const telemetry = baseTelemetry({
      provider: this.id,
      modelId: "configured-at-runtime",
      agentPipelineVersion: HTTP_PIPELINE_VERSION,
      inputSchemaVersion: input.inputSchemaVersion,
      outputSchemaVersion: input.outputSchemaVersion,
      evidenceBundleHash: input.evidenceBundleHash ?? null,
    });
    const finishTelemetry = (): AiCallTelemetry => ({
      ...telemetry,
      latencyMs: elapsedMs(startedAt, this.now),
    });
    const fail = (code: string, retryable: boolean): never => {
      throw new AiProviderError({ code, retryable, telemetry: finishTelemetry() });
    };

    const body = JSON.stringify(input.input);
    if (new TextEncoder().encode(body).byteLength > MAX_ADK_REQUEST_BYTES) {
      fail("ADK_REQUEST_TOO_LARGE", false);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      const correlationId = isRecord(input.input) && typeof input.input.jobId === "string"
        ? input.input.jobId
        : "gon-brew-worker";
      response = await this.fetchImpl(`${this.baseUrl}${input.path}`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-gon-correlation-id": correlationId,
          ...(this.serviceToken
            ? { "x-gon-service-token": this.serviceToken }
            : {}),
        },
        body,
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        fail("ADK_TIMEOUT", true);
      }
      fail("ADK_UNAVAILABLE", true);
    } finally {
      clearTimeout(timer);
    }
    const httpResponse = response!;

    const declaredLength = Number(httpResponse.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ADK_RESPONSE_BYTES) {
      fail("ADK_RESPONSE_TOO_LARGE", false);
    }

    let raw: string;
    try {
      raw = await httpResponse.text();
    } catch {
      fail("ADK_UNAVAILABLE", true);
    }
    const responseText = raw!;
    if (new TextEncoder().encode(responseText).byteLength > MAX_ADK_RESPONSE_BYTES) {
      fail("ADK_RESPONSE_TOO_LARGE", false);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText) as unknown;
    } catch {
      fail(httpResponse.ok ? "ADK_OUTPUT_INVALID" : "ADK_UNAVAILABLE", !httpResponse.ok);
    }

    if (!httpResponse.ok) {
      const upstreamCode = problemCode(parsedJson);
      if (upstreamCode === "SERVICE_AUTH_FAILED" || upstreamCode === "SERVICE_AUTH_NOT_CONFIGURED") {
        fail("ADK_AUTH_FAILED", false);
      }
      if (
        upstreamCode === "CONTRACT_VALIDATION_FAILED" ||
        upstreamCode === "INVALID_CONTRACT_INPUT" ||
        upstreamCode === "PROVIDER_OUTPUT_INVALID" ||
        upstreamCode === "REQUEST_TOO_LARGE"
      ) {
        fail("ADK_OUTPUT_INVALID", false);
      }
      if ([401, 403].includes(httpResponse.status)) fail("ADK_AUTH_FAILED", false);
      if ([400, 409, 413, 422].includes(httpResponse.status)) {
        fail("ADK_OUTPUT_INVALID", false);
      }
      if ([408, 429, 500, 502, 503, 504].includes(httpResponse.status)) {
        fail(upstreamCode ?? "ADK_UNAVAILABLE", true);
      }
      fail("ADK_UNAVAILABLE", httpResponse.status >= 500);
    }

    try {
      return {
        output: input.parse(parsedJson!),
        telemetry: {
          ...finishTelemetry(),
          finishReason: "completed",
        },
      };
    } catch {
      return fail("ADK_OUTPUT_INVALID", false);
    }
  }
}
