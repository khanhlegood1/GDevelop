export const OBJECT_STORAGE_KINDS = ["memory", "filesystem", "gcs"] as const;

export type ObjectStorageKind = (typeof OBJECT_STORAGE_KINDS)[number];

export interface GcsObjectStorageConfig {
  bucket: string;
  serviceAccountEmail: string;
  privateKey: string;
}

export interface ObjectStorageConfig {
  kind: ObjectStorageKind;
  configured: boolean;
  errorCode?: string;
  localObjectDir?: string;
  gcs?: GcsObjectStorageConfig;
}

function normalizedKind(value: string | undefined): ObjectStorageKind | undefined {
  const kind = value?.trim().toLocaleLowerCase();
  if (!kind) return "memory";
  return (OBJECT_STORAGE_KINDS as readonly string[]).includes(kind)
    ? (kind as ObjectStorageKind)
    : undefined;
}

function normalizePrivateKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  // Secret managers commonly expose PEM newlines as literal `\n` sequences.
  // Accept both forms without logging or returning the key anywhere else.
  return key.includes("\\n") ? key.replaceAll("\\n", "\n") : key;
}

function validBucketName(value: string | undefined): value is string {
  if (!value) return false;
  return /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(value);
}

function validServiceAccountEmail(value: string | undefined): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function inspectGcsConfig(env: NodeJS.ProcessEnv): GcsObjectStorageConfig | undefined {
  const bucket = env.GON_GCS_BUCKET?.trim();
  const serviceAccountEmail = env.GON_GCS_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(env.GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (
    !validBucketName(bucket) ||
    !validServiceAccountEmail(serviceAccountEmail) ||
    !privateKey?.includes("-----BEGIN PRIVATE KEY-----") ||
    !privateKey.includes("-----END PRIVATE KEY-----")
  ) {
    return undefined;
  }
  return { bucket, serviceAccountEmail, privateKey };
}

/**
 * Inspects object-storage environment configuration without opening network
 * connections or leaking secret values. `configured` means the selected
 * adapter has the minimum local inputs it needs; it is not proof that a real
 * bucket, IAM policy or CORS policy works in staging.
 */
export function inspectObjectStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorageConfig {
  const kind = normalizedKind(env.GON_OBJECT_STORAGE);
  if (!kind) {
    return { kind: "memory", configured: false, errorCode: "OBJECT_STORAGE_KIND_INVALID" };
  }

  if (kind === "memory") return { kind, configured: true };

  if (kind === "filesystem") {
    const localObjectDir = env.GON_LOCAL_OBJECT_DIR?.trim();
    return localObjectDir
      ? { kind, configured: true, localObjectDir }
      : { kind, configured: false, errorCode: "LOCAL_OBJECT_DIR_NOT_CONFIGURED" };
  }

  const gcs = inspectGcsConfig(env);
  return gcs
    ? { kind, configured: true, gcs }
    : { kind, configured: false, errorCode: "GCS_OBJECT_STORAGE_NOT_CONFIGURED" };
}

export function assertObjectStorageConfigUsable(
  config: ObjectStorageConfig,
  options: { production?: boolean; allowLocalInProduction?: boolean } = {},
): void {
  if (!config.configured) {
    throw new Error(
      `Object storage is not configured (${config.errorCode ?? "OBJECT_STORAGE_NOT_CONFIGURED"}).`,
    );
  }
  if (options.production && config.kind !== "gcs" && !options.allowLocalInProduction) {
    throw new Error(
      "Production requires GON_OBJECT_STORAGE=gcs with a private bucket and service-account signer.",
    );
  }
}
