import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  assertPublicHttpUrl,
  isPrivateIpv4,
  isPrivateIpv6,
} from "./artifacts";
import { serviceUnavailable, unprocessable } from "./errors";

/**
 * SSRF-safe URL fetcher (P05-R1.8, P03 §8).
 *
 * Defenses (each hop of a redirect chain is re-validated):
 * 1. URL literal checks (`assertPublicHttpUrl`): http/https only, no embedded
 *    credentials, no localhost/.local/.internal, no private/reserved IPs.
 * 2. DNS resolution check: every resolved address of the hostname must be a
 *    public IP — this is the DNS-rebinding defense at resolution time.
 * 3. Redirects are followed manually, one hop at a time, re-running (1)+(2) on
 *    every `Location` target; chains are bounded and loop-guarded.
 * 4. No cookies or credentials are ever sent (`credentials: "omit"`); response
 *    statuses 401/402/403 are treated as restricted (paywall/login walls are
 *    never bypassed, per P03).
 * 5. Response bodies are capped and content types allow-listed; the request
 *    is bounded by an abort timeout.
 *
 * Known limit (documented, staging item): pinning the TCP connection to the
 * validated IP (custom lookup/agent) is not available in the standard fetch
 * API; resolution-time validation covers the standard rebinding cases but a
 * hostile authoritative DNS can still race. Production fetches must run from
 * a network-isolated egress with no route to private ranges.
 */
export interface SafeUrlFetcherOptions {
  fetchImpl?: typeof fetch;
  lookup?: (hostname: string) => Promise<string[]>;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface SafeUrlFetchResult {
  finalUrl: string;
  contentType: string;
  bytes: Buffer;
  redirectChain: string[];
  fetchedAt: string;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/pdf", "application/json", "text/markdown"];

async function defaultLookup(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function assertPublicAddresses(hostname: string, addresses: readonly string[]): void {
  for (const address of addresses) {
    const version = isIP(address);
    if (
      (version === 4 && isPrivateIpv4(address)) ||
      (version === 6 && isPrivateIpv6(address)) ||
      version === 0
    ) {
      throw unprocessable(
        "ARTIFACT_URL_BLOCKED",
        "Địa chỉ IP bị chặn",
        `Tên miền ${hostname} phân giải tới địa chỉ không công khai; không được phép trong Private Alpha.`,
      );
    }
  }
}

export class SafeUrlFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly lookup: (hostname: string) => Promise<string[]>;
  private readonly maxRedirects: number;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(options: SafeUrlFetcherOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookup = options.lookup ?? defaultLookup;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async assertResolvablePublicUrl(rawUrl: string): Promise<URL> {
    const parsed = assertPublicHttpUrl(rawUrl);
    const addresses = await this.lookup(parsed.hostname);
    if (addresses.length === 0) {
      throw serviceUnavailable("URL_DNS_FAILED", "Không phân giải được tên miền", `Không tìm thấy địa chỉ IP cho ${parsed.hostname}.`);
    }
    assertPublicAddresses(parsed.hostname, addresses);
    return parsed;
  }

  async fetchContent(rawUrl: string): Promise<SafeUrlFetchResult> {
    const redirectChain: string[] = [];
    let currentUrl = rawUrl;

    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      const parsed = await this.assertResolvablePublicUrl(currentUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(parsed.toString(), {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers: { accept: "text/html, text/plain, application/pdf, application/json, text/markdown" },
          signal: controller.signal,
        });
      } catch {
        throw serviceUnavailable("URL_FETCH_FAILED", "Không tải được nội dung URL", "Kết nối tới URL thất bại hoặc quá thời gian chờ.");
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw unprocessable("URL_FETCH_INVALID_REDIRECT", "Redirect không hợp lệ", "Phản hồi redirect không kèm Location.");
        }
        if (hop === this.maxRedirects) {
          throw unprocessable("URL_FETCH_TOO_MANY_REDIRECTS", "Quá nhiều redirect", "Chuỗi redirect vượt giới hạn cho phép.");
        }
        const nextUrl = new URL(location, parsed.toString()).toString();
        redirectChain.push(nextUrl);
        if (redirectChain.slice(0, -1).includes(nextUrl)) {
          throw unprocessable("URL_FETCH_REDIRECT_LOOP", "Vòng lặp redirect", "Phát hiện vòng lặp redirect.");
        }
        currentUrl = nextUrl;
        continue;
      }

      if (response.status === 401 || response.status === 402 || response.status === 403) {
        // P03: never bypass login walls or paywalls.
        throw unprocessable("URL_ACCESS_RESTRICTED", "Nội dung yêu cầu đăng nhập/trả phí", "GON không vượt đăng nhập hoặc paywall để lấy nội dung.");
      }
      if (!response.ok) {
        throw serviceUnavailable("URL_FETCH_FAILED", "Không tải được nội dung URL", `Mã phản hồi HTTP ${response.status}.`);
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw unprocessable("URL_CONTENT_TYPE_BLOCKED", "Định dạng nội dung không hỗ trợ", `Content-Type ${contentType || "(trống)"} không nằm trong danh sách cho phép.`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > this.maxBytes) {
        throw unprocessable("URL_FETCH_TOO_LARGE", "Nội dung URL quá lớn", `Nội dung vượt giới hạn ${Math.floor(this.maxBytes / (1024 * 1024))} MB.`);
      }

      return {
        finalUrl: parsed.toString(),
        contentType: contentType || "text/plain",
        bytes: buffer,
        redirectChain,
        fetchedAt: new Date().toISOString(),
      };
    }

    throw unprocessable("URL_FETCH_TOO_MANY_REDIRECTS", "Quá nhiều redirect", "Chuỗi redirect vượt giới hạn cho phép.");
  }
}
