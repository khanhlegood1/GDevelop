import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { assertRuntimeStoreAllowed, readConfig } from "@/server/config";
import { ApiError } from "@/server/errors";
import {
  assertSameOrigin,
  getRequestOrigin,
  readBoundedBody,
  readJsonBody,
} from "@/server/http";
import { EMBEDDING_DIMENSIONS, GeminiEmbeddingProvider } from "@/server/embeddings";
import { GonService } from "@/server/service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function streamedRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  url = "https://gon.example/v1/test",
): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request(url, {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("bounded request body handling", () => {
  it("accepts a streamed body exactly at the limit", async () => {
    const body = await readBoundedBody(
      streamedRequest([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
      4,
    );
    expect([...body]).toEqual([1, 2, 3, 4]);
  });

  it("rejects as soon as streamed chunks cross the limit", async () => {
    await expect(
      readBoundedBody(
        streamedRequest([new Uint8Array([1, 2, 3]), new Uint8Array([4])]),
        3,
      ),
    ).rejects.toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" } satisfies Partial<ApiError>);
  });

  it("uses an oversized Content-Length as an early rejection", async () => {
    const request = new Request("https://gon.example/v1/test", {
      method: "POST",
      headers: { "content-length": "99" },
      body: "x",
    });
    await expect(readBoundedBody(request, 3)).rejects.toMatchObject({ status: 413 });
  });

  it("parses valid bounded JSON and rejects invalid UTF-8", async () => {
    await expect(
      readJsonBody(streamedRequest([new TextEncoder().encode('{"ok":true}')]), 32),
    ).resolves.toEqual({ ok: true });
    await expect(
      readJsonBody(streamedRequest([new Uint8Array([0xc3, 0x28])]), 32),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
  });
});

describe("proxy-aware origin handling", () => {
  it("ignores forwarded headers unless proxy trust is explicit", () => {
    const request = new Request("http://internal.invalid:3000/v1/test", {
      headers: {
        host: "gon.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(getRequestOrigin(request, { trustProxyHeaders: false })).toBe("http://gon.example");
    expect(getRequestOrigin(request, { trustProxyHeaders: true })).toBe("https://attacker.example");
    expect(
      getRequestOrigin(request, {
        trustProxyHeaders: true,
        publicOrigin: "https://gon.org",
      }),
    ).toBe("https://gon.org");
  });

  it("does not let a spoofed forwarded host satisfy same-origin by default", () => {
    vi.stubEnv("GON_TRUST_PROXY_HEADERS", "0");
    const request = new Request("https://gon.example/v1/test", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "x-forwarded-host": "attacker.example",
      },
    });
    expect(() => assertSameOrigin(request)).toThrowError(
      expect.objectContaining({ status: 403, code: "CSRF_VALIDATION_FAILED" }),
    );
  });
});

describe("runtime store guard", () => {
  it("fails closed for process-local memory in production unless explicitly overridden", () => {
    const productionMemory = readConfig({
      NODE_ENV: "production",
      GON_STORE: "memory",
    } as NodeJS.ProcessEnv);
    expect(() => assertRuntimeStoreAllowed(productionMemory)).toThrow(/disabled in production/);

    const explicitIsolatedoverride = readConfig({
      NODE_ENV: "production",
      GON_STORE: "memory",
      GON_ALLOW_MEMORY_STORE_IN_PRODUCTION: "1",
    } as NodeJS.ProcessEnv);
    expect(() => assertRuntimeStoreAllowed(explicitIsolatedoverride)).not.toThrow();
  });
});

describe("Auth.js identity mapping", () => {
  it("normalizes numeric PostgreSQL adapter IDs before domain lookup", () => {
    const service = new GonService({ requireInvite: false });
    const user = service.ensureGoogleUser({
      providerSubject: "google-subject-123",
      authUserId: 42,
    });
    expect(user.authUserId).toBe("42");
    expect(service.findUserIdByAuthUserId(42)).toBe(user.id);
    expect(service.findUserIdByAuthUserId("42")).toBe(user.id);
  });
});

describe("Gemini embedding response validation", () => {
  it("rejects non-finite and zero vectors instead of storing invalid embeddings", async () => {
    const provider = new GeminiEmbeddingProvider("test-key-not-real");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          embedding: {
            values: Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
              index === 0 ? Number.NaN : 0,
            ),
          },
        }),
      })),
    );
    await expect(provider.embed("test")).rejects.toThrow(/non-finite/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          embedding: { values: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0) },
        }),
      })),
    );
    await expect(provider.embed("test")).rejects.toThrow(/zero vector/);
  });
});

describe("web security headers", () => {
  it("sets browser isolation headers and production CSP/HSTS", async () => {
    vi.stubEnv("NODE_ENV", "production");
    if (!nextConfig.headers) throw new Error("Next headers are not configured");
    const rules = await nextConfig.headers();
    const headers = new Map(rules[0].headers.map((header) => [header.key, header.value]));

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });
});
