/**
 * GON edge rate-limit worker (P05-R1.10 packaging, P05-R1.13 file added).
 *
 * Minimal Cloudflare Worker implementing the same token-bucket semantics as
 * the origin L2 layer (`src/server/abuse-controls.ts`):
 * - per-IP bucket, split read (GET) vs write (mutations);
 * - capacity = burst allowance, refillPerSec = sustained rate;
 * - defaults mirror the origin policy (240/4 read, 120/2 write) so edge and
 *   origin reject roughly the same abuse before requests cost anything.
 *
 * State is IN-MEMORY PER PoP/isolate (no KV/Durable Objects on purpose for
 * this minimal recipe): a flood spread across PoPs is still caught by the
 * origin's shared PostgreSQL buckets (L2) — this layer only sheds the
 * cheapest volumetric load. Align `GON_TRUST_PROXY_HEADERS=1` at the origin
 * when fronting with Cloudflare (CF overwrites X-Forwarded-For).
 *
 * Status: NOT RUN — packaging only. No Cloudflare deployment, load test or
 * throttling measurement has been executed in this environment; tune the
 * limits from staging observations before enabling enforce.
 */

const IP_READ = { capacity: 240, refillPerSec: 4 };
const IP_WRITE = { capacity: 120, refillPerSec: 2 };
const RETRY_AFTER_SECONDS = 60;

/** @type {Map<string, {tokens: number, updatedAt: number}>} */
const buckets = new Map();
const MAX_TRACKED_IPS = 50_000;

function admit(key, policy, nowMs) {
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_IPS) {
      // Bounded memory: shed tracking, never block legitimate traffic on it.
      buckets.clear();
    }
    bucket = { tokens: policy.capacity, updatedAt: nowMs };
    buckets.set(key, bucket);
  }
  const elapsedSec = Math.max(0, nowMs - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(policy.capacity, bucket.tokens + elapsedSec * policy.refillPerSec);
  bucket.updatedAt = nowMs;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "";
    if (!ip) return fetch(request); // no client identity: pass through to origin L2/L3
    const policy = request.method === "GET" || request.method === "HEAD" ? IP_READ : IP_WRITE;
    if (admit(`${ip}:${policy === IP_READ ? "r" : "w"}`, policy, Date.now())) {
      return fetch(request);
    }
    return new Response(
      JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          title: "Quá nhiều request",
          detail: "Vui lòng thử lại sau ít phút.",
          retryAfterSeconds: RETRY_AFTER_SECONDS,
        },
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": String(RETRY_AFTER_SECONDS),
        },
      },
    );
  },
};
