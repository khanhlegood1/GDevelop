import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation register() (P06-S1 worker entrypoint)", () => {
  it("is a no-op when GON_WORKER_ENABLED is unset", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("GON_STORE", "memory");
    delete process.env.GON_WORKER_ENABLED;
    await expect(register()).resolves.toBeUndefined();
  });

  it("is a no-op outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("GON_WORKER_ENABLED", "1");
    vi.stubEnv("GON_STORE", "memory");
    await expect(register()).resolves.toBeUndefined();
  });

  it("fails closed when the worker is enabled without the PostgreSQL composition", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("GON_WORKER_ENABLED", "1");
    // No DATABASE_URL and the default memory store: the durable job queue
    // and outbox cannot exist, so composition must refuse to start.
    vi.stubEnv("GON_STORE", "memory");
    delete process.env.DATABASE_URL;
    await expect(register()).rejects.toThrow(/GON_STORE=postgres/);
  });
});
