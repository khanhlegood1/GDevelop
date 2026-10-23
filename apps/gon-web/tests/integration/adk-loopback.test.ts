import { describe, expect, it } from "vitest";
import {
  GENERATE_MODULE_INPUT_SCHEMA_VERSION,
  HttpAdkBrewAiProvider,
  TOPIC_CHECK_INPUT_SCHEMA_VERSION,
  type GenerateModuleWork,
} from "@/server/ai-provider";
import { validateModuleGraph } from "@/server/module-graph";

// Opt-in live loopback: start the real Python ADK service first (see
// docs/06-nfr/P05-R1.5-WORKER-RUNTIME-ADK-INTEGRATION.md), then run
// `GON_ADK_LOOPBACK_URL=http://127.0.0.1:8099 npx vitest run tests/integration/adk-loopback.test.ts`.
// Skipped by default so the suite stays hermetic.
const loopbackUrl = process.env.GON_ADK_LOOPBACK_URL;

describe.skipIf(!loopbackUrl)("LIVE TS→ADK loopback (real Python service, local deterministic provider)", () => {
  it("exchanges real topic-check and generate-module contract calls", async () => {
    const provider = new HttpAdkBrewAiProvider({
      baseUrl: String(loopbackUrl),
      serviceToken: process.env.GON_ADK_LOOPBACK_TOKEN ?? "smoke-token-12345678",
      timeoutMs: 30_000,
    });
    const work: GenerateModuleWork = {
      contractInput: {
        schemaVersion: GENERATE_MODULE_INPUT_SCHEMA_VERSION,
        jobId: "job_loopback_smoke",
        projectId: "prj_loopback_smoke",
        learningContext: {
          goal: "Hiểu hệ thống thủy triều qua bằng chứng người dùng cung cấp",
          learningMode: "deep_mastery",
          depth: "standard",
          timeBudgetMinutes: 30,
          locale: "vi-VN",
        },
        evidenceBundle: [
          {
            sourceId: "source_1",
            title: "Ghi chú người dùng về thủy triều",
            artifactId: "art_loopback_smoke",
            content:
              "Thủy triều chịu ảnh hưởng của mặt trăng; phù sa và xâm nhập mặn thay đổi theo mùa vụ ở đồng bằng.",
            rightsStatus: "user_provided",
          },
        ],
        graphSchemaVersion: "gon.module-graph/1.0",
      },
      local: {
        userId: "usr_loopback_smoke",
        projectTitle: "Thủy triều và đồng bằng",
        artifacts: [
          {
            artifactId: "art_loopback_smoke",
            kind: "text",
            displayName: "Ghi chú người dùng về thủy triều",
            originUri: null,
            isPrompt: true,
            chunks: [
              {
                text: "Thủy triều chịu ảnh hưởng của mặt trăng; phù sa và xâm nhập mặn thay đổi theo mùa vụ ở đồng bằng.",
                locator: "prompt-1",
                weight: 1,
              },
            ],
          },
        ],
      },
    };

    const topic = await provider.topicCheck({
      schemaVersion: TOPIC_CHECK_INPUT_SCHEMA_VERSION,
      jobId: "job_loopback_smoke",
      projectId: "prj_loopback_smoke",
      intent: "Hiểu hệ thống thủy triều qua bằng chứng người dùng cung cấp",
      artifactCoverage: [
        { artifactId: "art_loopback_smoke", extractionStatus: "done", hasText: true, hasMetadata: false },
      ],
      policyVersion: "gon-brew-policy/1.0",
    });
    console.log("TOPIC-CHECK:", JSON.stringify(topic.output), "telemetry:", JSON.stringify({ provider: topic.telemetry.provider, latencyMs: topic.telemetry.latencyMs, finishReason: topic.telemetry.finishReason }));

    const generated = await provider.generateModule(work);
    console.log("GENERATE:", JSON.stringify({
      schemaVersion: generated.output.schemaVersion,
      moduleTitle: generated.output.moduleGraph.module.title,
      nodes: generated.output.moduleGraph.nodes.length,
      sources: generated.output.moduleGraph.sources.length,
      generation: generated.output.generation,
    }));
    console.log("TELEMETRY:", JSON.stringify({ provider: generated.telemetry.provider, modelId: generated.telemetry.modelId, latencyMs: generated.telemetry.latencyMs, finishReason: generated.telemetry.finishReason, errorCode: generated.telemetry.errorCode }));

    const validation = validateModuleGraph(generated.output.moduleGraph, {
      evidenceSourceIds: generated.output.moduleGraph.sources.map((s) => s.id),
    });
    console.log("TS-REVALIDATION:", JSON.stringify({ valid: validation.valid, errors: validation.errors, citationCoverage: validation.citationCoverage, contentSha256: validation.contentSha256 }));
    expect(topic.output.decision).toBe("allow");
    expect(validation.valid).toBe(true);
  }, 60_000);

  it("fails closed on a bad service token", async () => {
    const provider = new HttpAdkBrewAiProvider({
      baseUrl: String(loopbackUrl),
      serviceToken: "wrong-token-xxxxxxx",
      timeoutMs: 30_000,
    });
    const failure = await provider.topicCheck({
      schemaVersion: TOPIC_CHECK_INPUT_SCHEMA_VERSION,
      jobId: "job_loopback_smoke",
      projectId: "prj_loopback_smoke",
      intent: "x",
      artifactCoverage: [{ artifactId: "art_loopback_smoke", extractionStatus: "done" }],
      policyVersion: "gon-brew-policy/1.0",
    }).then(() => null, (error: unknown) => error as { code?: string; retryable?: boolean });
    console.log("AUTH-FAIL:", JSON.stringify(failure));
    expect(failure?.code).toBe("ADK_AUTH_FAILED");
    expect(failure?.retryable).toBe(false);
  }, 60_000);
});
