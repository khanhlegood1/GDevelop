import { afterEach, describe, expect, it } from "vitest";
import { readConfig } from "@/server/config";
import { POSTGRES_REQUIRED_TABLES } from "@/server/db";
import { getReadiness } from "@/server/health";
import {
  configureObservability,
  logRequest,
  logStructured,
  resetObservability,
  sanitizeLogFields,
  startRequestTimer,
} from "@/server/observability";

afterEach(() => {
  resetObservability();
});

describe("structured log sanitization (P05-R1.11)", () => {
  it("drops secret- and content-bearing keys, keeps safe scalar telemetry", () => {
    const clean = sanitizeLogFields({
      requestId: "req_1",
      method: "POST",
      status: 429,
      durationMs: 12.4,
      outcome: "rejected",
      userId: "usr_abc",
      errorCode: "RATE_LIMITED",
      // Must never survive:
      authorization: "Bearer xyz",
      cookie: "session=abc",
      password: "hunter2",
      apiToken: "tok",
      apiKey: "key",
      body: { prompt: "learner text" },
      content: "learner text",
      prompt: "learner text",
      transcript: "learner speech",
      email: "learner@example.com",
      inviteCode: "GON-ALPHA",
      embedding: [0.1, 0.2],
      nested: { secret: "hidden" },
    });
    expect(clean).toEqual({
      requestId: "req_1",
      method: "POST",
      status: 429,
      durationMs: 12.4,
      outcome: "rejected",
      userId: "usr_abc",
      errorCode: "RATE_LIMITED",
    });
  });

  it("truncates long strings and keeps only compact scalar arrays", () => {
    const clean = sanitizeLogFields({
      route: "/v1/projects",
      tags: ["a", "b"],
      long: "x".repeat(600),
      matrix: [[1], [2]],
    });
    expect(String(clean.long)).toHaveLength(513); // 512 + ellipsis
    expect(clean.tags).toEqual(["a", "b"]);
    expect(clean.matrix).toBeUndefined();
  });
});

describe("structured log emission (P05-R1.11)", () => {
  it("emits one JSON line per event with ts/level/event and sanitized fields", () => {
    const lines: Array<{ line: string; level: string }> = [];
    configureObservability({
      now: () => new Date("2026-10-24T12:00:00.000Z"),
      sink: (line, level) => lines.push({ line, level }),
    });
    logStructured("warn", "budget_alert", { quotaKey: "brew_cost_units_per_day", thresholdPct: 80, prompt: "no" });
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe("warn");
    const parsed = JSON.parse(lines[0].line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      ts: "2026-10-24T12:00:00.000Z",
      level: "warn",
      event: "budget_alert",
      quotaKey: "brew_cost_units_per_day",
      thresholdPct: 80,
    });
    expect(parsed.prompt).toBeUndefined();
  });

  it("maps request outcomes to log levels and never logs query strings", () => {
    const lines: Array<{ line: string; level: string }> = [];
    configureObservability({ sink: (line, level) => lines.push({ line, level }) });
    logRequest({
      requestId: "req_1",
      method: "GET",
      route: "/v1/me/bootstrap",
      status: 200,
      durationMs: 8.6,
      outcome: "ok",
      userId: "usr_1",
    });
    logRequest({
      requestId: "req_2",
      method: "POST",
      route: "/v1/projects",
      status: 429,
      durationMs: 3,
      outcome: "rejected",
    });
    logRequest({
      requestId: "req_3",
      method: "POST",
      route: "/v1/projects",
      status: 500,
      durationMs: 5,
      outcome: "error",
      errorCode: "INTERNAL_ERROR",
    });
    expect(lines.map((entry) => entry.level)).toEqual(["info", "warn", "error"]);
    const access = JSON.parse(lines[0].line) as Record<string, unknown>;
    expect(access.event).toBe("http_request");
    expect(access.route).toBe("/v1/me/bootstrap");
    expect(Math.round(access.durationMs as number)).toBeGreaterThanOrEqual(0);
  });

  it("measures request duration monotonically", () => {
    const timer = startRequestTimer();
    const first = timer();
    const second = timer();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe("deep readiness: migrations + outbox backlog (P05-R1.11)", () => {
  const baseEnv = {
    NODE_ENV: "production",
    GON_STORE: "postgres",
    DATABASE_URL: "postgresql://db.example/gon",
    AUTH_GOOGLE_ID: "google-client-id",
    AUTH_GOOGLE_SECRET: "google-client-secret",
    AUTH_SECRET: "auth-secret",
    GON_OBJECT_STORAGE: "gcs",
    GON_GCS_BUCKET: "gon-private-test",
    GON_GCS_SERVICE_ACCOUNT_EMAIL: "gon@example.iam.gserviceaccount.com",
    GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
  } as NodeJS.ProcessEnv;

  const healthyDeps = {
    ensureRuntime: () => undefined,
    checkDatabase: async () => ({ configured: true, ok: true, latencyMs: 2 }),
    checkMigrations: async () => ({ ok: true as const, appliedCount: 10, expectedCount: 10 }),
    checkOutbox: async () => ({ ok: true as const, backlogCount: 0, threshold: 1000 }),
  };

  it("reports not_ready while a shipped migration is pending (fail-closed)", async () => {
    const report = await getReadiness({
      config: readConfig(baseEnv),
      ...healthyDeps,
      checkMigrations: async () => ({
        ok: false,
        appliedCount: 9,
        expectedCount: 10,
        pendingVersions: ["0010_abuse_cost_controls.sql"],
        errorCode: "MIGRATIONS_PENDING",
      }),
    });
    expect(report.status).toBe("not_ready");
    expect(report.checks.migrations).toMatchObject({
      ok: false,
      pendingVersions: ["0010_abuse_cost_controls.sql"],
      errorCode: "MIGRATIONS_PENDING",
    });
  });

  it("flags a saturated outbox backlog without flipping readiness", async () => {
    const report = await getReadiness({
      config: readConfig(baseEnv),
      ...healthyDeps,
      checkOutbox: async () => ({
        ok: false,
        backlogCount: 5000,
        threshold: 1000,
        errorCode: "OUTBOX_BACKLOG_SATURATED",
      }),
    });
    // Alerting signal only: cycling instances cannot drain a stuck consumer.
    expect(report.status).toBe("ready");
    expect(report.checks.outbox).toMatchObject({
      ok: false,
      backlogCount: 5000,
      errorCode: "OUTBOX_BACKLOG_SATURATED",
    });
  });

  it("marks both deep checks DATABASE_NOT_READY when the database is down", async () => {
    const report = await getReadiness({
      config: readConfig(baseEnv),
      ...healthyDeps,
      checkDatabase: async () => ({ configured: true, ok: false, errorCode: "DATABASE_UNAVAILABLE" }),
    });
    expect(report.status).toBe("not_ready");
    expect(report.checks.migrations).toMatchObject({ ok: false, errorCode: "DATABASE_NOT_READY" });
    expect(report.checks.outbox).toMatchObject({ ok: false, errorCode: "DATABASE_NOT_READY" });
  });

  it("skips deep checks entirely for the memory runtime without a database", async () => {
    const report = await getReadiness({
      config: readConfig({ NODE_ENV: "test", GON_STORE: "memory" } as NodeJS.ProcessEnv),
      ensureRuntime: () => undefined,
      checkDatabase: async () => ({ configured: false, ok: false }),
    });
    expect(report.status).toBe("ready");
    expect(report.checks.migrations).toMatchObject({ ok: true });
    expect(report.checks.outbox).toMatchObject({ ok: true });
  });
});

describe("readiness schema contract covers guardrail/privacy tables (P05-R1.11)", () => {
  it("requires the R1.6–R1.10 schema tables before serving traffic", () => {
    for (const table of [
      "quota_reservations",
      "feature_flags",
      "data_requests",
      "user_personalization",
      "footprint_events",
      "ai_runs",
      "budget_alert_claims",
      "abuse_rate_buckets",
      "abuse_flood_strikes",
      "abuse_idempotency_markers",
    ]) {
      expect(POSTGRES_REQUIRED_TABLES).toContain(table);
    }
  });
});
