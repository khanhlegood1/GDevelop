import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import PostgresAdapter from "@auth/pg-adapter";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { Auth } from "@auth/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGonAuthOptions } from "@/server/auth-config";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import {
  InMemoryObjectStorage,
  type CreateSignedUploadInput,
  type ObjectStorage,
  type SignedUploadPlan,
} from "@/server/object-storage";
import {
  PostgresGonStore,
  type PostgresTransactionRunner,
} from "@/server/postgres-store";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

/**
 * P05-R1.4 executable contract proof. PGlite runs the real PostgreSQL
 * migrations and Auth.js PG adapter SQL, while a fake direct-to-storage
 * adapter stands in for the signed GCS data plane. This does not prove a
 * live Google OAuth consent flow, a real bucket's IAM/CORS policy or a
 * managed-PostgreSQL deployment.
 */
const migrationsDir = path.resolve(import.meta.dirname, "../../db/migrations");

class FakeDirectStorage implements ObjectStorage {
  readonly kind = "gcs" as const;
  readonly inner = new InMemoryObjectStorage();
  signedKey?: string;

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan> {
    this.signedKey = input.key;
    return {
      url: `https://storage.example.test/upload?signature=fake&key=${encodeURIComponent(input.key)}`,
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "x-goog-meta-gon-sha256": input.sha256,
      },
      expiresAt: input.expiresAt,
    };
  }

  putObject(input: Parameters<InMemoryObjectStorage["putObject"]>[0]) {
    return this.inner.putObject(input);
  }

  getObject(key: string, options?: { maxBytes?: number }) {
    return this.inner.getObject(key, options);
  }

  headObject(key: string) {
    return this.inner.headObject(key);
  }

  deleteObject(key: string) {
    return this.inner.deleteObject(key);
  }
}

let db: PGlite;
let runner: PostgresTransactionRunner;
let service: GonService;
let adapter: ReturnType<typeof PostgresAdapter>;
let authOptions: ReturnType<typeof createGonAuthOptions>;
const storage = new FakeDirectStorage();

let authUserId: string;
let domainUserId: string;
let actor: Actor;

function normalizeParams(params: unknown[] = []): unknown[] {
  return params.map((value) => (value instanceof Date ? value.toISOString() : value));
}

function normalizeRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = { ...row };
    for (const key of ["id", "userId"]) {
      if (typeof normalized[key] === "number") normalized[key] = String(normalized[key]);
    }
    for (const key of ["expires", "emailVerified"]) {
      if (typeof normalized[key] === "string") normalized[key] = new Date(normalized[key]);
    }
    return normalized;
  });
}

function createPGlitePool(): Pool {
  return {
    query: async (text: string, params: unknown[] = []) => {
      const result = await db.query(text, normalizeParams(params) as never[]);
      const rows = normalizeRows(result.rows as Array<Record<string, unknown>>);
      const affectedRows = (result as { affectedRows?: number }).affectedRows;
      return {
        rows,
        // node-postgres reports selected rows in rowCount; PGlite reports 0
        // affected rows for a SELECT. Preserve the adapter contract.
        rowCount: rows.length > 0 ? rows.length : (affectedRows ?? 0),
      };
    },
  } as unknown as Pool;
}

async function count(table: string, where = "true", params: unknown[] = []): Promise<number> {
  const result = await db.query<{ count: number | string }>(
    `select count(*)::int as count from ${table} where ${where}`,
    params as never[],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function sessionResponse(sessionToken: string): Promise<unknown> {
  // NextAuth's Next.js handler delegates to this Auth core request handler.
  // Calling the core directly keeps the hermetic PostgreSQL test independent
  // of Next's dev-server module loader while exercising the same adapter,
  // expiry/revocation and GON session-callback code.
  const response = (await Auth(
    new Request("http://localhost/api/auth/session", {
      headers: {
        cookie: `authjs.session-token=${encodeURIComponent(sessionToken)}`,
      },
    }),
    { ...authOptions, basePath: "/api/auth" } as never,
  )) as unknown as Response;
  expect(response.status).toBe(200);
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent, vector } });
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
  expect(files).toHaveLength(9);
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }

  runner = {
    async transaction(work) {
      return db.transaction(async (tx) =>
        work({
          query: async (text, params) => tx.query(text, params as never[]),
        }),
      );
    },
  };
  service = new GonService({
    store: new PostgresGonStore(runner),
    objectStorage: storage,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
  });

  adapter = PostgresAdapter(createPGlitePool());
  authOptions = createGonAuthOptions({
    adapter,
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
    secret: "r14-auth-test-secret",
    trustHost: true,
    identity: {
      ensureGoogleUser: (input) => service.ensureGoogleUser(input),
      findUserIdByAuthUserId: (value) => service.findUserIdByAuthUserId(value),
    },
  });
  const authUser = await adapter.createUser!({
    name: "R1.4 Google Learner",
    email: "r14@example.com",
    emailVerified: new Date(),
    image: null,
  } as never);
  authUserId = String(authUser.id);
  await adapter.linkAccount!({
    userId: authUserId,
    provider: "google",
    type: "oidc",
    providerAccountId: "google-sub-r14",
    access_token: "not-used-by-domain",
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    token_type: "Bearer",
    scope: "openid email profile",
    id_token: "not-used-by-domain",
  } as never);

  // This is the callback Auth.js invokes after the adapter has persisted the
  // user/account/session. It is the safe point to bind Auth's serial user ID
  // to GON's domain identity; the earlier signIn callback can still carry
  // Google's subject as `user.id` on first login.
  await authOptions.events!.signIn!({
    user: authUser,
    account: { provider: "google", providerAccountId: "google-sub-r14", type: "oidc" },
    profile: {
      email: "r14@example.com",
      email_verified: true,
      name: "R1.4 Google Learner",
    },
    isNewUser: true,
  } as never);

  domainUserId = (await service.findUserIdByAuthUserId(authUserId))!;
  expect(domainUserId).toMatch(/^usr_/);
  const domainUser = await service.findUserById(domainUserId);
  actor = {
    userId: domainUserId,
    roles: domainUser!.roles,
    authProvider: "google",
    requestId: "req_r14_auth_storage",
  };
  await service.seedInvite("GON-R14-AUTH-001");
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode: "GON-R14-AUTH-001",
  });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("Auth.js PostgreSQL adapter and database-session contract (PGlite execution)", () => {
  it("persists the Google account link and resolves it back to the Auth user", async () => {
    const byAccount = await adapter.getUserByAccount!({
      provider: "google",
      providerAccountId: "google-sub-r14",
    });
    expect(String(byAccount?.id)).toBe(authUserId);
    expect(await count("accounts", `provider = 'google' and "providerAccountId" = 'google-sub-r14'`)).toBe(1);
    expect(await count(
      "identity_links",
      "provider = 'google' and provider_subject = 'google-sub-r14' and user_id = $1",
      [domainUserId],
    )).toBe(1);
    expect(await count("gon_users", "id = $1 and auth_user_id = $2", [domainUserId, authUserId])).toBe(1);
  });

  it("serves a database session through Auth.js and stops serving it after revocation", async () => {
    const sessionToken = `r14-session-${randomUUID()}`;
    await adapter.createSession!({
      sessionToken,
      userId: authUserId,
      expires: new Date(Date.now() + 60 * 60 * 1_000),
    });

    const active = await sessionResponse(sessionToken) as {
      user?: { gonUserId?: string; email?: string };
    };
    expect(active.user).toMatchObject({ gonUserId: domainUserId, email: "r14@example.com" });
    expect(JSON.stringify(active)).not.toContain(sessionToken);
    expect(JSON.stringify(active)).not.toContain("sessionToken");

    await adapter.deleteSession!(sessionToken);
    await expect(sessionResponse(sessionToken)).resolves.toBeNull();
    expect(await count("sessions", `"sessionToken" = $1`, [sessionToken])).toBe(0);
  });

  it("rejects and deletes an expired database session", async () => {
    const sessionToken = `r14-expired-${randomUUID()}`;
    await adapter.createSession!({
      sessionToken,
      userId: authUserId,
      expires: new Date(Date.now() - 60_000),
    });
    await expect(sessionResponse(sessionToken)).resolves.toBeNull();
    expect(await count("sessions", `"sessionToken" = $1`, [sessionToken])).toBe(0);
  });

  it("updates a database-session expiry through the adapter", async () => {
    const sessionToken = `r14-update-${randomUUID()}`;
    const initialExpiry = new Date(Date.now() + 10 * 60 * 1_000);
    const nextExpiry = new Date(Date.now() + 2 * 60 * 60 * 1_000);
    await adapter.createSession!({ sessionToken, userId: authUserId, expires: initialExpiry });
    await adapter.updateSession!({ sessionToken, expires: nextExpiry });
    const result = await db.query<{ expires: string }>(
      `select expires::text as expires from sessions where "sessionToken" = $1`,
      [sessionToken],
    );
    expect(Date.parse(result.rows[0].expires)).toBeGreaterThan(initialExpiry.getTime());
    await adapter.deleteSession!(sessionToken);
  });
});

describe("PostgreSQL upload completion through private object storage", () => {
  it("reloads domain state from PostgreSQL and bytes only from the shared storage port", async () => {
    const project = (await service.createProject(actor, {
      title: "R1.4 storage project",
      prompt: "Kiểm tra upload riêng tư vẫn hoàn tất khi service được tạo lại từ PostgreSQL.",
      goal: "Chứng minh object storage boundary",
      learningMode: "deep_mastery",
      locale: "vi-VN",
    })).data;
    const projectId = String(project.id);
    const bytes = Buffer.from(
      "Object storage riêng tư giữ bytes ngoài PostgreSQL và ngoài bộ nhớ process của web service.",
    );
    const hash = createHash("sha256").update(bytes).digest("hex");

    const upload = (await service.initiateArtifactUpload(actor, projectId, {
      kind: "file",
      fileName: "r14-notes.txt",
      declaredMimeType: "text/plain",
      byteSize: bytes.length,
      sha256: hash,
      rightsBasis: "created_by_user",
    })).data;
    expect(upload.uploadUrl).toContain("https://storage.example.test/upload");
    expect(upload.headers).not.toHaveProperty("X-GON-Upload-Token");
    await storage.putObject({
      key: storage.signedKey!,
      bytes,
      contentType: "text/plain",
      sha256: hash,
    });

    const reloadedService = new GonService({
      store: new PostgresGonStore(runner),
      objectStorage: storage,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
    });
    const completed = await reloadedService.completeArtifactUpload(
      actor,
      projectId,
      String(upload.artifactId),
      { sha256: hash, byteSize: bytes.length },
    );
    expect(completed.data).toMatchObject({ extractionStatus: "ready", safetyStatus: "allowed" });
    expect(await count(
      "artifact_upload_sessions",
      "artifact_id = $1 and actual_sha256 = $2 and completed_at is not null",
      [upload.artifactId, hash],
    )).toBe(1);
    expect(await count("content_chunks", "artifact_id = $1", [upload.artifactId])).toBeGreaterThan(0);

    await reloadedService.deleteArtifact(actor, String(upload.artifactId));
    await expect(storage.headObject(storage.signedKey!)).resolves.toBeNull();
    expect(await count(
      "content_chunks",
      "artifact_id = $1 and deleted_at is null",
      [upload.artifactId],
    )).toBe(0);
    expect(await count(
      "source_artifacts",
      "id = $1 and deleted_at is not null",
      [upload.artifactId],
    )).toBe(1);
  });
});
