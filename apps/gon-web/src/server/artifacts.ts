import { isIP } from "node:net";
import { unprocessable, validationError } from "./errors";
import type { ArtifactKind } from "./types";

export const MAX_PROMPT_CHARS = 20_000;
export const MAX_TEXT_ARTIFACT_CHARS = 200_000;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_URLS_PER_PROJECT = 5;
export const MAX_FILES_PER_PROJECT = 5;
export const MAX_PROJECT_UPLOAD_BYTES = 100 * 1024 * 1024;

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function classifyUrlKind(rawUrl: string): Extract<ArtifactKind, "website_url" | "youtube_url" | "facebook_url"> {
  const hostname = new URL(rawUrl).hostname.toLocaleLowerCase();
  if (
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "youtu.be" ||
    hostname === "youtube-nocookie.com"
  ) {
    return "youtube_url";
  }
  if (hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.watch") {
    return "facebook_url";
  }
  return "website_url";
}

export function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLocaleLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff")
  );
}

/**
 * Validates the URL stored as a link artifact. The VS1 local adapter does not
 * fetch third-party pages. A future fetcher must additionally resolve DNS,
 * pin/validate every redirect hop and defend against DNS rebinding.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw validationError("URL chưa đúng định dạng.", [
      { field: "uri", code: "invalid_uri", message: "Cần URL HTTP/HTTPS hợp lệ." },
    ]);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw unprocessable("ARTIFACT_URL_BLOCKED", "URL không được hỗ trợ", "GON chỉ nhận liên kết HTTP/HTTPS công khai.");
  }
  if (parsed.username || parsed.password) {
    throw unprocessable("ARTIFACT_URL_BLOCKED", "URL chứa thông tin đăng nhập", "Hãy loại bỏ username/password khỏi URL.");
  }

  const hostname = parsed.hostname.toLocaleLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw unprocessable("ARTIFACT_URL_BLOCKED", "URL nội bộ bị chặn", "Liên kết tới mạng nội bộ không được phép trong Private Alpha.");
  }

  const ipVersion = isIP(hostname);
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw unprocessable("ARTIFACT_URL_BLOCKED", "Địa chỉ IP bị chặn", "Địa chỉ private/reserved không được phép trong Private Alpha.");
  }

  return parsed;
}

export function validateUploadDeclaration(input: {
  kind: "file" | "image";
  declaredMimeType: string;
  byteSize: number;
}): void {
  const mime = input.declaredMimeType.toLocaleLowerCase().split(";")[0].trim();
  if (input.kind === "image") {
    if (!IMAGE_MIME_TYPES.has(mime)) {
      throw unprocessable("ARTIFACT_TYPE_UNSUPPORTED", "Định dạng ảnh chưa được hỗ trợ", "Ảnh Alpha chỉ nhận PNG, JPEG hoặc WebP.");
    }
  } else {
    if (!DOCUMENT_MIME_TYPES.has(mime)) {
      throw unprocessable(
        "ARTIFACT_TYPE_UNSUPPORTED",
        "Định dạng file chưa được hỗ trợ",
        "File Alpha chỉ nhận PDF, TXT, Markdown, CSV hoặc JSON; archive/executable bị từ chối.",
      );
    }
    if (input.byteSize > MAX_DOCUMENT_BYTES) {
      throw validationError("File vượt giới hạn 25 MB của Private Alpha.", [
        { field: "byteSize", code: "artifact_too_large", message: "Tối đa 25 MB/file tài liệu." },
      ]);
    }
  }

  if (input.kind === "image" && input.byteSize > MAX_IMAGE_BYTES) {
    throw validationError("Ảnh vượt giới hạn 15 MB của Private Alpha.", [
      { field: "byteSize", code: "artifact_too_large", message: "Tối đa 15 MB/ảnh." },
    ]);
  }
}

export type DetectedFile =
  | { category: "png"; mimeType: "image/png" }
  | { category: "jpeg"; mimeType: "image/jpeg" }
  | { category: "webp"; mimeType: "image/webp" }
  | { category: "pdf"; mimeType: "application/pdf" }
  | { category: "text"; mimeType: string; text: string }
  | { category: "unknown"; mimeType: null };

export function detectFile(bytes: Buffer, declaredMimeType: string): DetectedFile {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { category: "png", mimeType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { category: "jpeg", mimeType: "image/jpeg" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { category: "webp", mimeType: "image/webp" };
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { category: "pdf", mimeType: "application/pdf" };
  }

  const declared = declaredMimeType.toLocaleLowerCase().split(";")[0].trim();
  const textLikeDeclared = DOCUMENT_MIME_TYPES.has(declared) && declared !== "application/pdf";
  const hasNul = bytes.includes(0);
  if (textLikeDeclared && !hasNul) {
    const text = bytes.toString("utf8");
    // Reject strongly replacement-heavy payloads instead of treating arbitrary bytes as text.
    const replacementCount = [...text].filter((char) => char === "\uFFFD").length;
    if (replacementCount <= Math.max(2, Math.floor(text.length * 0.01))) {
      return { category: "text", mimeType: declared, text };
    }
  }

  return { category: "unknown", mimeType: null };
}

export interface TextChunkDraft {
  text: string;
  locator: string;
  tokenCount: number;
}

export function chunkText(input: string, maxChars = 3600): TextChunkDraft[] {
  const clean = input.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const units: string[] = [];
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [clean]) {
    if (paragraph.length <= maxChars) {
      units.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(/[^.!?…\n]+[.!?…]+|[^.!?…\n]+$/g) ?? [paragraph];
    let current = "";
    for (const sentence of sentences) {
      const piece = sentence.trim();
      if (!piece) continue;
      if ((current + " " + piece).trim().length > maxChars && current) {
        units.push(current.trim());
        current = piece;
      } else {
        current = `${current} ${piece}`.trim();
      }
    }
    if (current) units.push(current.trim());
  }

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if ((current + "\n\n" + unit).trim().length > maxChars && current) {
      chunks.push(current.trim());
      const overlapSource = current.split(/\n\s*\n/).at(-1) ?? "";
      current = overlapSource.length <= 500 ? `${overlapSource}\n\n${unit}` : unit;
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.map((text, index) => ({
    text,
    locator: `chunk-${index + 1}`,
    tokenCount: text.split(/\s+/).filter(Boolean).length,
  }));
}
