import { sha256Hex } from "./hash";
import { normalizeForSearch, tokenize } from "./text";

export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_PROFILE = "gon-semantic-v1";

export interface EmbeddingResult {
  vector: number[];
  dimensions: typeof EMBEDDING_DIMENSIONS;
  profile: typeof EMBEDDING_PROFILE;
  providerModel: string;
  normalized: boolean;
}

export interface EmbeddingProvider {
  readonly providerModel: string;
  embed(text: string): Promise<EmbeddingResult>;
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) return vector;
  return vector.map((value) => value / norm);
}

function hashToInt(value: string, salt: string): number {
  const hex = sha256Hex(`${salt}:${value}`).slice(0, 8);
  return Number.parseInt(hex, 16);
}

/**
 * Deterministic local adapter for development and contract tests.
 * It preserves the 768D/normalization contract but is not a substitute for
 * Gemini semantic quality and must never be reported as Gemini.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly providerModel = "local-hash-embedding-v1";

  async embed(text: string): Promise<EmbeddingResult> {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const tokens = tokenize(text, { keepStopwords: false });
    const features: Array<{ value: string; weight: number }> = tokens.map((token) => ({ value: token, weight: 1 }));

    for (let index = 0; index < tokens.length - 1; index += 1) {
      features.push({ value: `${tokens[index]} ${tokens[index + 1]}`, weight: 1.35 });
    }

    for (const feature of features) {
      for (let probe = 0; probe < 4; probe += 1) {
        const hashed = hashToInt(feature.value, `probe-${probe}`);
        const dimension = hashed % EMBEDDING_DIMENSIONS;
        const sign = hashed % 2 === 0 ? 1 : -1;
        vector[dimension] += sign * feature.weight / (probe + 1);
      }
    }

    const normalized = normalizeVector(vector);
    return {
      vector: normalized,
      dimensions: EMBEDDING_DIMENSIONS,
      profile: EMBEDDING_PROFILE,
      providerModel: this.providerModel,
      normalized: normalized.some((value) => value !== 0),
    };
  }
}

interface GeminiEmbeddingResponse {
  embedding?: { values?: number[] };
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly providerModel = "gemini-embedding-001";

  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.providerModel}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          content: { parts: [{ text: normalizeForSearch(text) || text }] },
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini embedding request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GeminiEmbeddingResponse;
    const values = payload.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error("Gemini embedding response did not contain a 768-dimensional vector");
    }

    const numericValues = values.map(Number);
    if (numericValues.some((value) => !Number.isFinite(value))) {
      throw new Error("Gemini embedding response contained a non-finite vector value");
    }
    const vector = normalizeVector(numericValues);
    if (vector.every((value) => value === 0)) {
      throw new Error("Gemini embedding response contained a zero vector");
    }

    return {
      vector,
      dimensions: EMBEDDING_DIMENSIONS,
      profile: EMBEDDING_PROFILE,
      providerModel: this.providerModel,
      normalized: true,
    };
  }
}

export function createEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  const requested = env.GON_EMBEDDING_PROVIDER ?? "local";
  if (requested === "gemini") {
    const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GON_EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY or GOOGLE_API_KEY");
    }
    return new GeminiEmbeddingProvider(apiKey);
  }
  if (requested !== "local") {
    throw new Error(`Unsupported GON_EMBEDDING_PROVIDER: ${requested}`);
  }
  return new LocalHashEmbeddingProvider();
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (denominator === 0) return 0;
  return Math.max(-1, Math.min(1, dot / denominator));
}
