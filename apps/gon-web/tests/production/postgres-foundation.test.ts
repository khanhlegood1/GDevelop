import { describe, expect, it, vi } from "vitest";
import { readConfig } from "@/server/config";
import {
  createPostgresPoolConfig,
  POSTGRES_REQUIRED_TABLES,
  POSTGRES_SCHEMA_READINESS_SQL,
} from "@/server/db";
import { getLiveness, getReadiness } from "@/server/health";
import {
  formatPostgresTextArray,
  formatPostgresVector,
  POSTGRES_HYBRID_SEARCH_SQL,
  PostgresHybridSearchRepository,
  validateEmbeddingVector,
} from "@/server/postgres-search";

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values } as NodeJS.ProcessEnv;
}

describe("PostgreSQL pool configuration", () => {
  it("uses bounded timeouts and explicit TLS verification settings", () => {
    const config = createPostgresPoolConfig(env({
      DATABASE_URL: "postgresql://gon:placeholder@db.example.internal:5432/gon",
      DATABASE_SSL_MODE: "verify-full",
      DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----placeholder-----END CERTIFICATE-----",
      DATABASE_POOL_MAX: "7",
      DATABASE_STATEMENT_TIMEOUT_MS: "9000",
    }));

    expect(config).toMatchObject({
      application_name: "gon-web",
      max: 7,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 9_000,
      query_timeout: 20_000,
      ssl: { rejectUnauthorized: true },
    });
  });

  it("fails closed for invalid URLs, pool bounds and TLS modes without echoing secrets", () => {
    expect(() =>
      createPostgresPoolConfig(env({ DATABASE_URL: "mysql://user:secret@example/db" })),
    ).toThrow(/postgres/);
    expect(() =>
      createPostgresPoolConfig(env({
        DATABASE_URL: "postgresql://db.example/gon",
        DATABASE_POOL_MAX: "1000",
      })),
    ).toThrow(/DATABASE_POOL_MAX/);
    expect(() =>
      createPostgresPoolConfig(env({
        DATABASE_URL: "postgresql://db.example/gon",
        DATABASE_SSL_MODE: "sometimes",
      })),
    ).toThrow(/DATABASE_SSL_MODE/);
  });
});

describe("PostgreSQL schema readiness contract", () => {
  it("requires Auth and domain tables rather than accepting an empty database", () => {
    expect(POSTGRES_REQUIRED_TABLES).toContain("sessions");
    expect(POSTGRES_REQUIRED_TABLES).toContain("gon_users");
    expect(POSTGRES_REQUIRED_TABLES).toContain("xp_projections");
    expect(POSTGRES_REQUIRED_TABLES).toContain("idempotency_records");
    expect(POSTGRES_SCHEMA_READINESS_SQL).toContain("to_regclass(required.table_name)");
    expect(new Set(POSTGRES_REQUIRED_TABLES).size).toBe(POSTGRES_REQUIRED_TABLES.length);
  });
});

describe("PostgreSQL hybrid Search repository contract", () => {
  it("rejects degenerate embeddings and encodes validated concept arrays", () => {
    expect(() => validateEmbeddingVector(Array.from({ length: 768 }, () => 0))).toThrow(/zero vector/);
    expect(() => formatPostgresVector([1, 2, 3])).toThrow(/768/);
    expect(formatPostgresTextArray(["content_diffusion", "evidence_limits"])).toBe(
      '{"content_diffusion","evidence_limits"}',
    );
  });

  it("places authorization before candidate limits and maps internal scores", async () => {
    expect(POSTGRES_HYBRID_SEARCH_SQL.indexOf("authorized_chunks as")).toBeLessThan(
      POSTGRES_HYBRID_SEARCH_SQL.indexOf("vector_candidates as"),
    );
    expect(POSTGRES_HYBRID_SEARCH_SQL).toContain("mv.publication_status not in ('hidden', 'retired')");

    const query = vi.fn(async () => ({
      rows: [{
        module_version_id: "modv_test123",
        title: "Lan truyền nội dung",
        grounding_status: "citation_checked",
        vector_score: 0.9,
        lexical_score: 0.4,
        concept_coverage: 0.5,
        specificity_score: 0.2,
        quality_score: 1,
        hybrid_score: 0.695,
        matched_concept_ids: ["content_diffusion"],
      }],
    }));
    const repository = new PostgresHybridSearchRepository({ query });
    const output = await repository.search({
      actorUserId: "usr_test123",
      queryText: "lan truyền nội dung",
      queryEmbedding: Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)),
      conceptIds: ["content_diffusion", "evidence_limits"],
    });

    expect(query).toHaveBeenCalledOnce();
    expect(output.results[0]).toMatchObject({
      moduleVersionId: "modv_test123",
      matchedConcepts: ["content_diffusion"],
      missingConcepts: ["evidence_limits"],
      internalScores: { vector: 0.9, hybrid: 0.695 },
    });
    expect(output.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("health and readiness semantics", () => {
  it("keeps liveness minimal", () => {
    expect(getLiveness()).toEqual({ status: "ok" });
  });

  it("allows the explicit local memory runtime outside production", async () => {
    const report = await getReadiness({
      config: readConfig({ NODE_ENV: "test", GON_STORE: "memory" } as NodeJS.ProcessEnv),
      ensureRuntime: () => undefined,
      checkDatabase: async () => ({ configured: false, ok: false }),
    });
    expect(report).toMatchObject({ status: "ready", checks: { store: { ok: true } } });
  });

  it("calls PostgreSQL ready only when runtime, database, Auth and object storage pass", async () => {
    const report = await getReadiness({
      config: readConfig({
        NODE_ENV: "production",
        GON_STORE: "postgres",
        DATABASE_URL: "postgresql://db.example/gon",
        AUTH_GOOGLE_ID: "google-client-id",
        AUTH_GOOGLE_SECRET: "google-client-secret",
        AUTH_SECRET: "auth-secret",
        GON_OBJECT_STORAGE: "gcs",
        GON_GCS_BUCKET: "gon-private-test",
        GON_GCS_SERVICE_ACCOUNT_EMAIL: "gon@example.iam.gserviceaccount.com",
        GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY:
          "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
      } as NodeJS.ProcessEnv),
      ensureRuntime: () => undefined,
      checkDatabase: async () => ({ configured: true, ok: true, latencyMs: 3 }),
      checkMigrations: async () => ({ ok: true, appliedCount: 10, expectedCount: 10 }),
      checkOutbox: async () => ({ ok: true, backlogCount: 0, threshold: 1000 }),
    });
    expect(report.status).toBe("ready");
    expect(report.checks.store).toMatchObject({ kind: "postgres", ok: true });
    expect(report.checks.database).toMatchObject({ configured: true, required: true, ok: true });
    expect(report.checks.auth).toMatchObject({
      googleConfigured: true,
      secretConfigured: true,
      databaseSessions: true,
      required: true,
      ok: true,
    });
    expect(report.checks.objectStorage).toMatchObject({
      kind: "gcs",
      configured: true,
      required: true,
      ok: true,
    });
  });

  it("keeps production not-ready without database Auth or durable private object storage", async () => {
    const report = await getReadiness({
      config: readConfig({
        NODE_ENV: "production",
        GON_STORE: "postgres",
        DATABASE_URL: "postgresql://db.example/gon",
      } as NodeJS.ProcessEnv),
      ensureRuntime: () => undefined,
      checkDatabase: async () => ({ configured: true, ok: true, latencyMs: 3 }),
      checkMigrations: async () => ({ ok: true, appliedCount: 10, expectedCount: 10 }),
      checkOutbox: async () => ({ ok: true, backlogCount: 0, threshold: 1000 }),
    });
    expect(report.status).toBe("not_ready");
    expect(report.checks.auth.errorCode).toBe("GOOGLE_AUTH_NOT_CONFIGURED");
    expect(report.checks.objectStorage.errorCode).toBe("OBJECT_STORAGE_NOT_DURABLE");
  });

  it("keeps PostgreSQL not-ready when runtime construction fails", async () => {
    const report = await getReadiness({
      config: readConfig({
        NODE_ENV: "production",
        GON_STORE: "postgres",
        DATABASE_URL: "postgresql://db.example/gon",
      } as NodeJS.ProcessEnv),
      ensureRuntime: () => {
        throw new Error("DATABASE_URL missing in this injected runtime");
      },
      checkDatabase: async () => ({ configured: true, ok: true, latencyMs: 3 }),
      checkMigrations: async () => ({ ok: true, appliedCount: 10, expectedCount: 10 }),
      checkOutbox: async () => ({ ok: true, backlogCount: 0, threshold: 1000 }),
    });
    expect(report.status).toBe("not_ready");
    expect(report.checks.store.errorCode).toBe("RUNTIME_STORE_NOT_ALLOWED");
  });

  it("requires a database in production even for an isolated memory override", async () => {
    const report = await getReadiness({
      config: readConfig({
        NODE_ENV: "production",
        GON_STORE: "memory",
        GON_ALLOW_MEMORY_STORE_IN_PRODUCTION: "1",
      } as NodeJS.ProcessEnv),
      ensureRuntime: () => undefined,
      checkDatabase: async () => ({ configured: false, ok: false }),
    });
    expect(report.status).toBe("not_ready");
    expect(report.checks.database).toMatchObject({ required: true, ok: false });
  });
});
