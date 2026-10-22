import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "@/server/config";
import { cosineSimilarity, EMBEDDING_DIMENSIONS, LocalHashEmbeddingProvider } from "@/server/embeddings";
import { toPlayerGraph, validateModuleGraph } from "@/server/module-graph";
import { progressFromXp } from "@/server/progression";
import { detectFile, assertPublicHttpUrl } from "@/server/artifacts";
import type { ModuleGraph } from "@/server/types";

describe("lifelong progression", () => {
  it("always derives an unbounded numeric level from Lifetime XP", () => {
    expect(progressFromXp(0)).toMatchObject({ numericLevel: 0, era: "Zero", xpToNextLevel: 100 });
    expect(progressFromXp(1250)).toMatchObject({ numericLevel: 12, era: "Hero", xpInLevel: 50 });
    expect(progressFromXp(3500)).toMatchObject({ numericLevel: 35, era: "Forever", xpToNextLevel: 100 });
    expect(progressFromXp(9999).numericLevel).toBe(99);
    expect(progressFromXp(1_000_000).numericLevel).toBe(10_000);
  });
});

describe("return-to sanitizer", () => {
  it("keeps internal paths and rejects open redirects", () => {
    expect(sanitizeReturnTo("/projects/prj_1?tab=outputs#top")).toBe("/projects/prj_1?tab=outputs#top");
    expect(sanitizeReturnTo("https://evil.example/phish")).toBe("/");
    expect(sanitizeReturnTo("//evil.example/phish")).toBe("/");
    expect(sanitizeReturnTo("/\\evil.example")).toBe("/");
  });
});

describe("local 768D embedding adapter", () => {
  it("is deterministic, normalized and clearly not labelled Gemini", async () => {
    const provider = new LocalHashEmbeddingProvider();
    const first = await provider.embed("học cách phân tích bằng chứng âm nhạc");
    const second = await provider.embed("học cách phân tích bằng chứng âm nhạc");
    const related = await provider.embed("phân tích bằng chứng trong âm nhạc");
    expect(first.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(first.vector).toHaveLength(768);
    expect(first.providerModel).toBe("local-hash-embedding-v1");
    expect(cosineSimilarity(first.vector, second.vector)).toBeCloseTo(1, 10);
    expect(cosineSimilarity(first.vector, related.vector)).toBeGreaterThan(0.4);
    const norm = Math.sqrt(first.vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 8);
  });
});

describe("artifact safety primitives", () => {
  it("blocks private-network URL literals", () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1/admin")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.1.10/file")).toThrow();
    expect(() => assertPublicHttpUrl("https://user:pass@example.com/file")).toThrow();
    expect(assertPublicHttpUrl("https://www.youtube.com/watch?v=abc").hostname).toBe("www.youtube.com");
  });

  it("detects magic bytes instead of trusting the declared MIME alone", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("png-data"),
    ]);
    expect(detectFile(png, "image/png").category).toBe("png");
    expect(detectFile(Buffer.from("%PDF-1.7"), "application/pdf").category).toBe("pdf");
    expect(detectFile(Buffer.from("hello"), "application/pdf").category).toBe("unknown");
  });
});

describe("Canonical Module Graph", () => {
  it("validates the P03 example and removes hidden answers from player projection", () => {
    const graphPath = path.resolve(process.cwd(), "docs/04-contracts/examples/module-graph-viral-music.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8")) as ModuleGraph;
    const validation = validateModuleGraph(graph, {
      evidenceSourceIds: graph.sources.map((source) => source.id),
    });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const player = toPlayerGraph(graph);
    const serialized = JSON.stringify(player);
    expect(serialized).not.toContain("sampleAnswer");
    expect(serialized).not.toContain("correctChoiceIds");

    const revealed = toPlayerGraph(graph, new Set(["retrieval_explain"]));
    expect(JSON.stringify(revealed)).toContain("sampleAnswer");
  });

  it("rejects citations outside the evidence bundle", () => {
    const graphPath = path.resolve(process.cwd(), "docs/04-contracts/examples/module-graph-viral-music.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8")) as ModuleGraph;
    const validation = validateModuleGraph(graph, { evidenceSourceIds: ["src_user_video"] });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("outside the evidence bundle");
  });
});
