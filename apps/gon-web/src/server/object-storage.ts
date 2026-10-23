import { createHash, createPrivateKey, createSign, randomUUID, type KeyObject } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertObjectStorageConfigUsable,
  inspectObjectStorageConfig,
  type GcsObjectStorageConfig,
  type ObjectStorageKind,
} from "./object-storage-config";
import type { RepositoryCollection } from "./repositories";
import type { StoredObjectRecord } from "./types";

export type { ObjectStorageKind } from "./object-storage-config";

export interface ObjectMetadata {
  key: string;
  byteSize: number;
  contentType: string | null;
  sha256?: string | null;
  etag?: string | null;
  updatedAt?: string | null;
}

export interface StoredObject {
  bytes: Buffer;
  metadata: ObjectMetadata;
}

export interface LocalUploadPlanInput {
  url: string;
  token: string;
}

export interface CreateSignedUploadInput {
  key: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  expiresAt: string;
  localUpload?: LocalUploadPlanInput;
}

export interface SignedUploadPlan {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface PutObjectInput {
  key: string;
  bytes: Uint8Array;
  contentType: string | null;
  sha256?: string;
}

export interface GetObjectOptions {
  maxBytes?: number;
}

/**
 * Private object-storage port. Implementations must never make an object
 * public. Browser writes are either proxied through GON's token-authorized
 * local endpoint or sent directly to a short-lived GCS V4 signed URL; reads
 * remain server-side and bounded by the caller.
 */
export interface ObjectStorage {
  readonly kind: ObjectStorageKind;
  createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan>;
  putObject(input: PutObjectInput): Promise<ObjectMetadata>;
  getObject(key: string, options?: GetObjectOptions): Promise<StoredObject | null>;
  headObject(key: string): Promise<ObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
}

export class ObjectStorageError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ObjectStorageError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_SIGNED_UPLOAD_SECONDS = 15 * 60;

export function assertPrivateObjectKey(key: string): string {
  if (
    typeof key !== "string" ||
    key.length < 1 ||
    key.length > 1_024 ||
    !key.startsWith("private/") ||
    key.endsWith("/") ||
    key.includes("\\") ||
    key.includes("//") ||
    /[\u0000-\u001f\u007f]/.test(key)
  ) {
    throw new ObjectStorageError("OBJECT_KEY_INVALID", "Object key is not a valid private GON key.");
  }
  const segments = key.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new ObjectStorageError("OBJECT_KEY_INVALID", "Object key contains an unsafe path segment.");
  }
  return key;
}

function assertMaxBytes(maxBytes: number | undefined): number {
  const limit = maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DEFAULT_MAX_DOWNLOAD_BYTES) {
    throw new ObjectStorageError("OBJECT_DOWNLOAD_LIMIT_INVALID", "Object download limit is invalid.");
  }
  return limit;
}

function assertDownloadSize(byteSize: number, maxBytes: number): void {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > maxBytes) {
    throw new ObjectStorageError(
      "OBJECT_TOO_LARGE",
      `Object exceeds the ${maxBytes}-byte server-side download limit.`,
    );
  }
}

function localSignedUpload(input: CreateSignedUploadInput): SignedUploadPlan {
  assertPrivateObjectKey(input.key);
  if (!input.localUpload?.url || !input.localUpload.token) {
    throw new ObjectStorageError(
      "LOCAL_UPLOAD_PLAN_REQUIRED",
      "Local object storage requires a GON local upload URL and one-time token.",
    );
  }
  return {
    url: input.localUpload.url,
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
      "X-GON-Upload-Token": input.localUpload.token,
    },
    expiresAt: input.expiresAt,
  };
}

interface MemoryObjectValue {
  bytes: Buffer;
  contentType: string | null;
  sha256?: string;
  updatedAt: string;
}

export class InMemoryObjectStorage implements ObjectStorage {
  readonly kind = "memory" as const;
  private readonly objects: Map<string, MemoryObjectValue>;
  private readonly now: () => Date;

  constructor(
    objects: Map<string, MemoryObjectValue> = new Map(),
    options: { now?: () => Date } = {},
  ) {
    this.objects = objects;
    this.now = options.now ?? (() => new Date());
  }

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan> {
    return localSignedUpload(input);
  }

  async putObject(input: PutObjectInput): Promise<ObjectMetadata> {
    const key = assertPrivateObjectKey(input.key);
    const bytes = Buffer.from(input.bytes);
    const value: MemoryObjectValue = {
      bytes,
      contentType: input.contentType,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      updatedAt: this.now().toISOString(),
    };
    this.objects.set(key, value);
    return this.metadata(key, value);
  }

  async getObject(keyValue: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const key = assertPrivateObjectKey(keyValue);
    const maxBytes = assertMaxBytes(options.maxBytes);
    const value = this.objects.get(key);
    if (!value) return null;
    assertDownloadSize(value.bytes.length, maxBytes);
    return { bytes: Buffer.from(value.bytes), metadata: this.metadata(key, value) };
  }

  async headObject(keyValue: string): Promise<ObjectMetadata | null> {
    const key = assertPrivateObjectKey(keyValue);
    const value = this.objects.get(key);
    return value ? this.metadata(key, value) : null;
  }

  async deleteObject(keyValue: string): Promise<void> {
    this.objects.delete(assertPrivateObjectKey(keyValue));
  }

  private metadata(key: string, value: MemoryObjectValue): ObjectMetadata {
    return {
      key,
      byteSize: value.bytes.length,
      contentType: value.contentType,
      sha256: value.sha256 ?? null,
      updatedAt: value.updatedAt,
    };
  }
}

/**
 * Adapter over the repository collection retained for the local simulator.
 * It lets the domain core use the same storage port in tests while the
 * memory/PostgreSQL Unit-of-Work adapters continue to own that ephemeral map.
 */
export class RepositoryObjectStorage implements ObjectStorage {
  readonly kind = "memory" as const;

  constructor(
    private readonly objects: RepositoryCollection<string, StoredObjectRecord>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan> {
    return localSignedUpload(input);
  }

  async putObject(input: PutObjectInput): Promise<ObjectMetadata> {
    const key = assertPrivateObjectKey(input.key);
    const record: StoredObjectRecord = {
      key,
      bytes: Buffer.from(input.bytes),
      contentType: input.contentType,
      createdAt: this.now().toISOString(),
    };
    this.objects.set(key, record);
    return this.metadata(record);
  }

  async getObject(keyValue: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const key = assertPrivateObjectKey(keyValue);
    const maxBytes = assertMaxBytes(options.maxBytes);
    const record = this.objects.get(key);
    if (!record) return null;
    assertDownloadSize(record.bytes.length, maxBytes);
    return { bytes: Buffer.from(record.bytes), metadata: this.metadata(record) };
  }

  async headObject(keyValue: string): Promise<ObjectMetadata | null> {
    const record = this.objects.get(assertPrivateObjectKey(keyValue));
    return record ? this.metadata(record) : null;
  }

  async deleteObject(keyValue: string): Promise<void> {
    this.objects.delete(assertPrivateObjectKey(keyValue));
  }

  private metadata(record: StoredObjectRecord): ObjectMetadata {
    return {
      key: record.key,
      byteSize: record.bytes.length,
      contentType: record.contentType,
      updatedAt: record.createdAt,
    };
  }
}

interface FilesystemSidecar {
  contentType: string | null;
  sha256?: string;
  updatedAt: string;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}

export class FilesystemObjectStorage implements ObjectStorage {
  readonly kind = "filesystem" as const;
  private readonly rootDir: string;
  private readonly now: () => Date;

  constructor(rootDir: string, options: { now?: () => Date } = {}) {
    if (!rootDir.trim()) {
      throw new ObjectStorageError("LOCAL_OBJECT_DIR_NOT_CONFIGURED", "Filesystem object directory is required.");
    }
    this.rootDir = path.resolve(rootDir);
    this.now = options.now ?? (() => new Date());
  }

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan> {
    return localSignedUpload(input);
  }

  async putObject(input: PutObjectInput): Promise<ObjectMetadata> {
    const key = assertPrivateObjectKey(input.key);
    const objectPath = this.objectPath(key);
    const sidecarPath = this.sidecarPath(objectPath);
    const bytes = Buffer.from(input.bytes);
    const sidecar: FilesystemSidecar = {
      contentType: input.contentType,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      updatedAt: this.now().toISOString(),
    };

    await mkdir(path.dirname(objectPath), { recursive: true });
    const tempObjectPath = `${objectPath}.tmp-${randomUUID()}`;
    const tempSidecarPath = `${sidecarPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempObjectPath, bytes, { mode: 0o600 });
      await rename(tempObjectPath, objectPath);
      await writeFile(tempSidecarPath, JSON.stringify(sidecar), { mode: 0o600 });
      await rename(tempSidecarPath, sidecarPath);
    } finally {
      await unlink(tempObjectPath).catch(() => undefined);
      await unlink(tempSidecarPath).catch(() => undefined);
    }

    return {
      key,
      byteSize: bytes.length,
      contentType: sidecar.contentType,
      sha256: sidecar.sha256 ?? null,
      updatedAt: sidecar.updatedAt,
    };
  }

  async getObject(keyValue: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const key = assertPrivateObjectKey(keyValue);
    const maxBytes = assertMaxBytes(options.maxBytes);
    const metadata = await this.headObject(key);
    if (!metadata) return null;
    assertDownloadSize(metadata.byteSize, maxBytes);
    try {
      const bytes = await readFile(this.objectPath(key));
      assertDownloadSize(bytes.length, maxBytes);
      return { bytes, metadata: { ...metadata, byteSize: bytes.length } };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async headObject(keyValue: string): Promise<ObjectMetadata | null> {
    const key = assertPrivateObjectKey(keyValue);
    const objectPath = this.objectPath(key);
    try {
      const fileStat = await stat(objectPath);
      if (!fileStat.isFile()) return null;
      const sidecar = await this.readSidecar(this.sidecarPath(objectPath));
      return {
        key,
        byteSize: fileStat.size,
        contentType: sidecar?.contentType ?? null,
        sha256: sidecar?.sha256 ?? null,
        updatedAt: sidecar?.updatedAt ?? fileStat.mtime.toISOString(),
      };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async deleteObject(keyValue: string): Promise<void> {
    const objectPath = this.objectPath(assertPrivateObjectKey(keyValue));
    await unlink(objectPath).catch((error) => {
      if (!isMissingFile(error)) throw error;
    });
    await unlink(this.sidecarPath(objectPath)).catch((error) => {
      if (!isMissingFile(error)) throw error;
    });
  }

  private objectPath(key: string): string {
    const segments = key.split("/").map((segment) => encodeURIComponent(segment));
    const resolved = path.resolve(this.rootDir, ...segments);
    const rootWithSeparator = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : `${this.rootDir}${path.sep}`;
    if (resolved !== this.rootDir && !resolved.startsWith(rootWithSeparator)) {
      throw new ObjectStorageError("OBJECT_KEY_INVALID", "Object key resolves outside the storage root.");
    }
    return resolved;
  }

  private sidecarPath(objectPath: string): string {
    return `${objectPath}.gon-meta.json`;
  }

  private async readSidecar(sidecarPath: string): Promise<FilesystemSidecar | null> {
    try {
      const parsed = JSON.parse(await readFile(sidecarPath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      const record = parsed as Record<string, unknown>;
      return {
        contentType: typeof record.contentType === "string" ? record.contentType : null,
        ...(typeof record.sha256 === "string" ? { sha256: record.sha256 } : {}),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
      };
    } catch (error) {
      if (isMissingFile(error) || error instanceof SyntaxError) return null;
      throw error;
    }
  }
}

interface GcsObjectStorageOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
  storageOrigin?: string;
  tokenUrl?: string;
  timeoutMs?: number;
}

interface CachedAccessToken {
  value: string;
  expiresAtMs: number;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

function formatSigningDates(date: Date): { dateStamp: string; requestDateTime: string } {
  const iso = date.toISOString();
  const dateStamp = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");
  return { dateStamp, requestDateTime: `${dateStamp}T${time}Z` };
}

function signRsaSha256(privateKey: KeyObject, value: string): Buffer {
  const signer = createSign("RSA-SHA256");
  signer.update(value);
  signer.end();
  return signer.sign(privateKey);
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function metadataFromGcsResource(key: string, value: unknown): ObjectMetadata {
  const resource = parseRecord(value);
  const custom = parseRecord(resource.metadata);
  const byteSize = Number(resource.size);
  return {
    key,
    byteSize: Number.isSafeInteger(byteSize) && byteSize >= 0 ? byteSize : 0,
    contentType: typeof resource.contentType === "string" ? resource.contentType : null,
    sha256: typeof custom["gon-sha256"] === "string" ? custom["gon-sha256"] : null,
    etag: typeof resource.etag === "string" ? resource.etag : null,
    updatedAt: typeof resource.updated === "string" ? resource.updated : null,
  };
}

export class GoogleCloudStorageObjectStorage implements ObjectStorage {
  readonly kind = "gcs" as const;
  private readonly bucket: string;
  private readonly serviceAccountEmail: string;
  private readonly privateKey: KeyObject;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly storageOrigin: URL;
  private readonly tokenUrl: string;
  private readonly timeoutMs: number;
  private cachedAccessToken?: CachedAccessToken;
  private accessTokenPromise?: Promise<string>;

  constructor(config: GcsObjectStorageConfig, options: GcsObjectStorageOptions = {}) {
    this.bucket = config.bucket;
    this.serviceAccountEmail = config.serviceAccountEmail;
    try {
      this.privateKey = createPrivateKey(config.privateKey);
    } catch {
      throw new ObjectStorageError(
        "GCS_SERVICE_ACCOUNT_KEY_INVALID",
        "The configured GCS service-account private key is invalid.",
      );
    }
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.storageOrigin = new URL(options.storageOrigin ?? "https://storage.googleapis.com");
    this.tokenUrl = options.tokenUrl ?? "https://oauth2.googleapis.com/token";
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) {
      throw new ObjectStorageError("GCS_TIMEOUT_INVALID", "GCS request timeout is invalid.");
    }
  }

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadPlan> {
    const key = assertPrivateObjectKey(input.key);
    const now = this.now();
    const expiresAtMs = Date.parse(input.expiresAt);
    const expiresSeconds = Math.ceil((expiresAtMs - now.getTime()) / 1_000);
    if (
      !Number.isFinite(expiresAtMs) ||
      expiresSeconds < 1 ||
      expiresSeconds > MAX_SIGNED_UPLOAD_SECONDS
    ) {
      throw new ObjectStorageError(
        "SIGNED_UPLOAD_EXPIRY_INVALID",
        "Signed uploads must expire within fifteen minutes.",
      );
    }
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
      throw new ObjectStorageError("SIGNED_UPLOAD_HASH_INVALID", "Signed upload SHA-256 is invalid.");
    }

    const { dateStamp, requestDateTime } = formatSigningDates(now);
    const credentialScope = `${dateStamp}/auto/storage/goog4_request`;
    const credential = `${this.serviceAccountEmail}/${credentialScope}`;
    const headers: Record<string, string> = {
      "content-type": input.contentType,
      host: this.storageOrigin.host,
      "x-goog-meta-gon-sha256": input.sha256,
    };
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name].trim().replace(/\s+/g, " ")}\n`)
      .join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalUri = `/${rfc3986Encode(this.bucket)}/${key.split("/").map(rfc3986Encode).join("/")}`;
    const query: Record<string, string> = {
      "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
      "X-Goog-Credential": credential,
      "X-Goog-Date": requestDateTime,
      "X-Goog-Expires": String(expiresSeconds),
      "X-Goog-SignedHeaders": signedHeaders,
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((name) => `${rfc3986Encode(name)}=${rfc3986Encode(query[name])}`)
      .join("&");
    const canonicalRequest = [
      "PUT",
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const canonicalRequestHash = createSignHash(canonicalRequest);
    const stringToSign = [
      "GOOG4-RSA-SHA256",
      requestDateTime,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");
    const signature = signRsaSha256(this.privateKey, stringToSign).toString("hex");
    const url = `${this.storageOrigin.origin}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;

    return {
      url,
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "x-goog-meta-gon-sha256": input.sha256,
      },
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  async putObject(input: PutObjectInput): Promise<ObjectMetadata> {
    const key = assertPrivateObjectKey(input.key);
    const bytes = Buffer.from(input.bytes);
    const contentType = input.contentType ?? "application/octet-stream";
    const initiateUrl = new URL(
      `/upload/storage/v1/b/${rfc3986Encode(this.bucket)}/o`,
      this.storageOrigin,
    );
    initiateUrl.searchParams.set("uploadType", "resumable");

    // Server-side writes use the JSON API resumable protocol so custom
    // SHA-256 metadata is stored with the object and the 5 MB simple-upload
    // limit does not silently apply to GON's 25 MB artifact limit.
    const initiate = await this.authenticatedFetch(initiateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: JSON.stringify({
        name: key,
        contentType,
        ...(input.sha256 ? { metadata: { "gon-sha256": input.sha256 } } : {}),
      }),
    });
    if (!initiate.ok) {
      throw new ObjectStorageError(
        "GCS_PUT_INITIATE_FAILED",
        "Google Cloud Storage rejected the resumable upload initiation.",
        initiate.status,
      );
    }
    const sessionLocation = initiate.headers.get("location");
    if (!sessionLocation) {
      throw new ObjectStorageError(
        "GCS_PUT_SESSION_MISSING",
        "Google Cloud Storage did not return a resumable upload session.",
      );
    }
    const sessionUrl = new URL(sessionLocation, this.storageOrigin);
    if (sessionUrl.origin !== this.storageOrigin.origin) {
      throw new ObjectStorageError(
        "GCS_PUT_SESSION_INVALID",
        "Google Cloud Storage returned an upload session outside the configured storage origin.",
      );
    }

    // The resumable session URI is itself a delegated upload capability.
    // Do not attach the service-account bearer token to that second request.
    const response = await this.fetchFn(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Range": bytes.length === 0
          ? "bytes */0"
          : `bytes 0-${bytes.length - 1}/${bytes.length}`,
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new ObjectStorageError("GCS_PUT_FAILED", "Google Cloud Storage rejected the object upload.", response.status);
    }
    const metadata = metadataFromGcsResource(key, await response.json().catch(() => ({})));
    return {
      ...metadata,
      byteSize: metadata.byteSize || bytes.length,
      contentType: metadata.contentType ?? input.contentType,
      sha256: metadata.sha256 ?? input.sha256 ?? null,
    };
  }

  async getObject(keyValue: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const key = assertPrivateObjectKey(keyValue);
    const maxBytes = assertMaxBytes(options.maxBytes);
    const url = this.objectApiUrl(key);
    url.searchParams.set("alt", "media");
    const response = await this.authenticatedFetch(url, { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ObjectStorageError("GCS_GET_FAILED", "Google Cloud Storage object download failed.", response.status);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isSafeInteger(declaredLength) && declaredLength >= 0) {
      assertDownloadSize(declaredLength, maxBytes);
    }
    const bytes = await this.readBoundedBody(response, maxBytes);
    const lastModified = response.headers.get("last-modified");
    const lastModifiedMs = lastModified ? Date.parse(lastModified) : Number.NaN;
    return {
      bytes,
      metadata: {
        key,
        byteSize: bytes.length,
        contentType: response.headers.get("content-type"),
        sha256: response.headers.get("x-goog-meta-gon-sha256"),
        etag: response.headers.get("etag"),
        updatedAt: Number.isFinite(lastModifiedMs) ? new Date(lastModifiedMs).toISOString() : null,
      },
    };
  }

  async headObject(keyValue: string): Promise<ObjectMetadata | null> {
    const key = assertPrivateObjectKey(keyValue);
    const response = await this.authenticatedFetch(this.objectApiUrl(key), { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ObjectStorageError("GCS_HEAD_FAILED", "Google Cloud Storage metadata lookup failed.", response.status);
    }
    return metadataFromGcsResource(key, await response.json());
  }

  async deleteObject(keyValue: string): Promise<void> {
    const key = assertPrivateObjectKey(keyValue);
    const response = await this.authenticatedFetch(this.objectApiUrl(key), { method: "DELETE" });
    if (response.status === 404 || response.ok) return;
    throw new ObjectStorageError("GCS_DELETE_FAILED", "Google Cloud Storage object deletion failed.", response.status);
  }

  private objectApiUrl(key: string): URL {
    return new URL(
      `/storage/v1/b/${rfc3986Encode(this.bucket)}/o/${rfc3986Encode(key)}`,
      this.storageOrigin,
    );
  }

  private async authenticatedFetch(url: URL, init: RequestInit): Promise<Response> {
    const accessToken = await this.getAccessToken();
    return this.fetchFn(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private async getAccessToken(): Promise<string> {
    const nowMs = this.now().getTime();
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAtMs - 60_000 > nowMs) {
      return this.cachedAccessToken.value;
    }
    if (!this.accessTokenPromise) {
      this.accessTokenPromise = this.requestAccessToken().finally(() => {
        this.accessTokenPromise = undefined;
      });
    }
    return this.accessTokenPromise;
  }

  private async requestAccessToken(): Promise<string> {
    const nowSeconds = Math.floor(this.now().getTime() / 1_000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
      iss: this.serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      aud: this.tokenUrl,
      iat: nowSeconds,
      exp: nowSeconds + 3_600,
    }));
    const unsigned = `${header}.${claims}`;
    const assertion = `${unsigned}.${base64Url(signRsaSha256(this.privateKey, unsigned))}`;
    const response = await this.fetchFn(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new ObjectStorageError(
        "GCS_ACCESS_TOKEN_FAILED",
        "Google Cloud Storage service-account token exchange failed.",
        response.status,
      );
    }
    const payload = parseRecord(await response.json().catch(() => ({})));
    const token = typeof payload.access_token === "string" ? payload.access_token : "";
    const expiresIn = Number(payload.expires_in);
    if (!token || !Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 3_600) {
      throw new ObjectStorageError(
        "GCS_ACCESS_TOKEN_INVALID",
        "Google Cloud Storage returned an invalid access-token response.",
      );
    }
    this.cachedAccessToken = {
      value: token,
      expiresAtMs: this.now().getTime() + expiresIn * 1_000,
    };
    return token;
  }

  private async readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
    if (!response.body) {
      const bytes = Buffer.from(await response.arrayBuffer());
      assertDownloadSize(bytes.length, maxBytes);
      return bytes;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          assertDownloadSize(total, maxBytes);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }
}

function createSignHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createObjectStorage(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    production?: boolean;
    allowLocalInProduction?: boolean;
    gcs?: GcsObjectStorageOptions;
    now?: () => Date;
  } = {},
): ObjectStorage {
  const config = inspectObjectStorageConfig(env);
  assertObjectStorageConfigUsable(config, options);
  if (config.kind === "filesystem") {
    return new FilesystemObjectStorage(config.localObjectDir!, { now: options.now });
  }
  if (config.kind === "gcs") {
    return new GoogleCloudStorageObjectStorage(config.gcs!, {
      ...options.gcs,
      now: options.gcs?.now ?? options.now,
    });
  }
  return new InMemoryObjectStorage(new Map(), { now: options.now });
}
