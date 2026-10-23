import {
  createHash,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import {
  createObjectStorage,
  FilesystemObjectStorage,
  GoogleCloudStorageObjectStorage,
  InMemoryObjectStorage,
  type CreateSignedUploadInput,
  type ObjectStorage,
  type SignedUploadPlan,
} from "@/server/object-storage";
import { inspectObjectStorageConfig } from "@/server/object-storage-config";
import { GonService } from "@/server/service";
import type { Actor } from "@/server/types";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values } as NodeJS.ProcessEnv;
}

describe("object-storage configuration", () => {
  it("fails closed for invalid kinds and incomplete local/GCS settings", () => {
    expect(
      inspectObjectStorageConfig(env({ GON_OBJECT_STORAGE: "sometimes" })),
    ).toMatchObject({ configured: false, errorCode: "OBJECT_STORAGE_KIND_INVALID" });
    expect(
      inspectObjectStorageConfig(env({ GON_OBJECT_STORAGE: "filesystem" })),
    ).toMatchObject({ configured: false, errorCode: "LOCAL_OBJECT_DIR_NOT_CONFIGURED" });
    expect(
      inspectObjectStorageConfig(env({ GON_OBJECT_STORAGE: "gcs" })),
    ).toMatchObject({ configured: false, errorCode: "GCS_OBJECT_STORAGE_NOT_CONFIGURED" });
  });

  it("normalizes an escaped service-account PEM without exposing it in errors", () => {
    const config = inspectObjectStorageConfig(env({
      GON_OBJECT_STORAGE: "gcs",
      GON_GCS_BUCKET: "gon-private-test",
      GON_GCS_SERVICE_ACCOUNT_EMAIL: "gon@example.iam.gserviceaccount.com",
      GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\\nplaceholder\\n-----END PRIVATE KEY-----",
    }));
    expect(config).toMatchObject({ kind: "gcs", configured: true });
    expect(config.gcs?.privateKey).toContain("\nplaceholder\n");
  });

  it("rejects process-local storage in production composition", () => {
    expect(() =>
      createObjectStorage({ NODE_ENV: "production" } as NodeJS.ProcessEnv, { production: true }),
    ).toThrow(/Production requires GON_OBJECT_STORAGE=gcs/);
    expect(
      createObjectStorage({ NODE_ENV: "production" } as NodeJS.ProcessEnv, {
        production: true,
        allowLocalInProduction: true,
      }).kind,
    ).toBe("memory");
  });
});

describe("local object-storage adapters", () => {
  it("stores, reads, bounds and deletes private objects on the filesystem", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gon-object-storage-"));
    tempDirectories.push(directory);
    const storage = new FilesystemObjectStorage(directory, {
      now: () => new Date("2026-10-23T00:00:00.000Z"),
    });
    const key = "private/usr_1/prj_1/art_1/notes.txt";
    const bytes = Buffer.from("private learning notes");

    const plan = await storage.createSignedUpload({
      key,
      contentType: "text/plain",
      byteSize: bytes.length,
      sha256: sha256(bytes),
      expiresAt: "2026-10-23T00:15:00.000Z",
      localUpload: { url: "http://localhost:3000/api/local-uploads/art_1", token: "one-time" },
    });
    expect(plan.headers["X-GON-Upload-Token"]).toBe("one-time");

    await storage.putObject({ key, bytes, contentType: "text/plain", sha256: sha256(bytes) });
    await expect(storage.headObject(key)).resolves.toMatchObject({
      byteSize: bytes.length,
      contentType: "text/plain",
      sha256: sha256(bytes),
    });
    await expect(storage.getObject(key, { maxBytes: bytes.length })).resolves.toMatchObject({
      bytes,
    });
    await expect(storage.getObject(key, { maxBytes: bytes.length - 1 })).rejects.toMatchObject({
      code: "OBJECT_TOO_LARGE",
    });
    await expect(storage.putObject({
      key: "private/../secret.txt",
      bytes,
      contentType: "text/plain",
    })).rejects.toMatchObject({ code: "OBJECT_KEY_INVALID" });

    await storage.deleteObject(key);
    await expect(storage.headObject(key)).resolves.toBeNull();
  });
});

describe("Google Cloud Storage adapter contract", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const now = new Date("2026-10-23T01:02:03.000Z");

  it("creates a verifiable V4 signed PUT scoped to content type and declared hash metadata", async () => {
    const storage = new GoogleCloudStorageObjectStorage(
      {
        bucket: "gon-private-test",
        serviceAccountEmail: "gon@example.iam.gserviceaccount.com",
        privateKey: privateKeyPem,
      },
      { now: () => now, fetchFn: async () => { throw new Error("fetch must not be called"); } },
    );
    const key = "private/usr_1/prj_1/art_1/my notes.txt";
    const hash = "a".repeat(64);
    const plan = await storage.createSignedUpload({
      key,
      contentType: "text/plain",
      byteSize: 12,
      sha256: hash,
      expiresAt: "2026-10-23T01:17:03.000Z",
    });

    const url = new URL(plan.url);
    expect(url.origin).toBe("https://storage.googleapis.com");
    expect(url.pathname).toBe("/gon-private-test/private/usr_1/prj_1/art_1/my%20notes.txt");
    expect(url.searchParams.get("X-Goog-Algorithm")).toBe("GOOG4-RSA-SHA256");
    expect(url.searchParams.get("X-Goog-Expires")).toBe("900");
    expect(url.searchParams.get("X-Goog-SignedHeaders")).toBe(
      "content-type;host;x-goog-meta-gon-sha256",
    );
    expect(plan.headers).toEqual({
      "Content-Type": "text/plain",
      "x-goog-meta-gon-sha256": hash,
    });

    const canonicalQuery = url.search.slice(1, url.search.indexOf("&X-Goog-Signature="));
    const canonicalRequest = [
      "PUT",
      url.pathname,
      canonicalQuery,
      `content-type:text/plain\nhost:storage.googleapis.com\nx-goog-meta-gon-sha256:${hash}\n`,
      "content-type;host;x-goog-meta-gon-sha256",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "GOOG4-RSA-SHA256",
      "20261023T010203Z",
      "20261023/auto/storage/goog4_request",
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signature = Buffer.from(url.searchParams.get("X-Goog-Signature")!, "hex");
    expect(verify("RSA-SHA256", Buffer.from(stringToSign), publicKey, signature)).toBe(true);
  });

  it("uses a service-account JWT for bounded private metadata, media, upload and delete calls", async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; body?: string }> = [];
    const objectBytes = Buffer.from("bounded object");
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method,
        authorization: headers.get("authorization"),
        ...(typeof init?.body === "string" ? { body: init.body } : {}),
        ...(init?.body instanceof URLSearchParams ? { body: init.body.toString() } : {}),
      });
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "test-access-token", expires_in: 3600 });
      }
      if (url.includes("/upload/storage/v1/")) {
        return new Response(null, {
          status: 200,
          headers: { Location: "https://storage.googleapis.com/upload/session/test" },
        });
      }
      if (url === "https://storage.googleapis.com/upload/session/test") {
        return Response.json({
          size: String(objectBytes.length),
          contentType: "text/plain",
          etag: "etag-1",
          updated: now.toISOString(),
          metadata: { "gon-sha256": sha256(objectBytes) },
        });
      }
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (url.includes("alt=media")) {
        return new Response(objectBytes, {
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": String(objectBytes.length),
            "x-goog-meta-gon-sha256": sha256(objectBytes),
          },
        });
      }
      return Response.json({
        size: String(objectBytes.length),
        contentType: "text/plain",
        etag: "etag-1",
        updated: now.toISOString(),
        metadata: { "gon-sha256": sha256(objectBytes) },
      });
    }) as typeof fetch;
    const storage = new GoogleCloudStorageObjectStorage(
      {
        bucket: "gon-private-test",
        serviceAccountEmail: "gon@example.iam.gserviceaccount.com",
        privateKey: privateKeyPem,
      },
      { now: () => now, fetchFn },
    );
    const key = "private/usr_1/prj_1/art_1/notes.txt";

    await expect(storage.putObject({
      key,
      bytes: objectBytes,
      contentType: "text/plain",
      sha256: sha256(objectBytes),
    })).resolves.toMatchObject({ byteSize: objectBytes.length, sha256: sha256(objectBytes) });
    await expect(storage.headObject(key)).resolves.toMatchObject({ byteSize: objectBytes.length });
    await expect(storage.getObject(key, { maxBytes: objectBytes.length })).resolves.toMatchObject({
      bytes: objectBytes,
    });
    await expect(storage.getObject(key, { maxBytes: objectBytes.length - 1 })).rejects.toMatchObject({
      code: "OBJECT_TOO_LARGE",
    });
    await storage.deleteObject(key);

    const tokenCall = calls.find((call) => call.url === "https://oauth2.googleapis.com/token")!;
    const assertion = new URLSearchParams(tokenCall.body).get("assertion")!;
    expect(assertion.split(".")).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({
      iss: "gon@example.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(calls.filter((call) =>
      call.url !== "https://oauth2.googleapis.com/token" &&
      call.url !== "https://storage.googleapis.com/upload/session/test",
    ).every((call) => call.authorization === "Bearer test-access-token")).toBe(true);
    expect(calls.find((call) => call.url === "https://storage.googleapis.com/upload/session/test")?.authorization).toBeNull();
    expect(calls.filter((call) => call.url === "https://oauth2.googleapis.com/token")).toHaveLength(1);
  });
});

class FakeDirectStorage implements ObjectStorage {
  readonly kind = "gcs" as const;
  readonly inner = new InMemoryObjectStorage();
  signedKey?: string;

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan> {
    this.signedKey = input.key;
    return {
      url: `https://storage.example.test/private-upload?signature=fake&key=${encodeURIComponent(input.key)}`,
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

async function activate(service: GonService, inviteCode: string): Promise<Actor> {
  const user = await service.ensureDevUser("Người dùng direct upload");
  const actor: Actor = { userId: user.id, roles: user.roles, authProvider: "test", requestId: "req_storage" };
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "denied",
    inviteCode,
  });
  return actor;
}

describe("domain upload completion through the storage port", () => {
  it("completes a direct signed-storage upload without writing process-local repository bytes", async () => {
    const store = new MemoryGonStore();
    const storage = new FakeDirectStorage();
    const service = new GonService({
      store,
      objectStorage: storage,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
    });
    const actor = await activate(service, "GON-DIRECT-UPLOAD-001");
    const project = (await service.createProject(actor, {
      title: "Direct upload",
      prompt: "Tôi muốn kiểm tra file riêng tư được xác minh từ object storage ngoài process.",
      goal: "Kiểm tra signed upload",
      learningMode: "deep_mastery",
      locale: "vi-VN",
    })).data;
    const projectId = String(project.id);
    const bytes = Buffer.from("Kiến thức được đối chiếu bằng hash và nội dung thật từ private storage.");
    const hash = sha256(bytes);

    const upload = (await service.initiateArtifactUpload(actor, projectId, {
      kind: "file",
      fileName: "evidence.txt",
      declaredMimeType: "text/plain",
      byteSize: bytes.length,
      sha256: hash,
      rightsBasis: "created_by_user",
    })).data;
    expect(upload.uploadUrl).toContain("https://storage.example.test/");
    expect(upload.headers).not.toHaveProperty("X-GON-Upload-Token");
    await expect(
      service.authorizeLocalUpload(String(upload.artifactId), "not-a-local-upload"),
    ).rejects.toMatchObject({ status: 404 });

    expect(storage.signedKey).toBeDefined();
    await storage.putObject({
      key: storage.signedKey!,
      bytes,
      contentType: "text/plain",
      sha256: hash,
    });
    const completed = await service.completeArtifactUpload(
      actor,
      projectId,
      String(upload.artifactId),
      { sha256: hash, byteSize: bytes.length },
    );
    expect(completed.data).toMatchObject({ extractionStatus: "ready", safetyStatus: "allowed" });
    expect(store.objects.size).toBe(0);
    expect([...store.chunks.values()].some((chunk) => chunk.artifactId === upload.artifactId)).toBe(true);

    await service.deleteArtifact(actor, String(upload.artifactId));
    await expect(storage.headObject(storage.signedKey!)).resolves.toBeNull();
  });

  it("blocks a direct upload whose stored bytes do not match the signed declaration", async () => {
    const store = new MemoryGonStore();
    const storage = new FakeDirectStorage();
    const service = new GonService({
      store,
      objectStorage: storage,
      embeddingProvider: new LocalHashEmbeddingProvider(),
      requireInvite: true,
    });
    const actor = await activate(service, "GON-DIRECT-UPLOAD-002");
    const project = (await service.createProject(actor, {
      title: "Mismatch upload",
      prompt: "Kiểm tra object bị thay đổi sau khi ký declaration sẽ bị chặn trước khi trích xuất.",
      goal: "Kiểm tra hash mismatch",
      learningMode: "deep_mastery",
      locale: "vi-VN",
    })).data;
    const declaredBytes = Buffer.from("declared content");
    const upload = (await service.initiateArtifactUpload(actor, String(project.id), {
      kind: "file",
      fileName: "declared.txt",
      declaredMimeType: "text/plain",
      byteSize: declaredBytes.length,
      sha256: sha256(declaredBytes),
      rightsBasis: "created_by_user",
    })).data;

    await storage.putObject({
      key: storage.signedKey!,
      bytes: Buffer.from("tampered content"),
      contentType: "text/plain",
    });
    const completed = await service.completeArtifactUpload(
      actor,
      String(project.id),
      String(upload.artifactId),
      {},
    );
    expect(completed.data).toMatchObject({ extractionStatus: "blocked", safetyStatus: "blocked" });
    expect([...store.chunks.values()].filter((chunk) => chunk.artifactId === upload.artifactId)).toHaveLength(0);
  });
});
