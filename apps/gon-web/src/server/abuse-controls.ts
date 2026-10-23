import { sha256Hex } from "./hash";

/**
 * Distributed abuse/cost controls (P05-R1.10).
 *
 * Three cooperating guardrails sit in front of the R1.6 per-user quotas:
 *
 * 1. **Token bucket** (per-IP and per-user, read/write classes): smooths the
 *    sustained request rate. Capacity is the burst allowance; refillPerSec is
 *    the steady-state rate. Buckets are keyed state that every app instance
 *    shares through {@link AbuseStateStore} (SQL in production, in-process
 *    memory for single-instance/test compositions).
 *
 * 2. **Flood guard** (idempotent): a short-window strike counter per subject.
 *    Volume above `strikeLimit` inside `strikeWindowMs` opens a penalty box
 *    whose duration doubles per repeat offense (capped at `blockMaxMs`).
 *    Requests replaying a previously-seen `Idempotency-Key` are EXEMPT from
 *    strikes and token consumption — a client retrying the same logical
 *    request cannot be flood-locked out ("idempotent flood guard"), while a
 *    flood of distinct requests still accrues strikes.
 *
 * 3. **Budget alert hooks**: when AI-cost budget usage crosses configured
 *    thresholds (50/80/100% of the R1.6 `brew_cost_units_per_day` budget),
 *    each (user, quota window, threshold) is claimed exactly once in
 *    distributed state and surfaced to an optional sink + the outbox. The
 *    hooks are observability signals, not enforcement — enforcement stays
 *    with the persistent budget reservations.
 *
 * All state keys are hashed (sha256 + optional deployment salt) before
 * persistence: raw IPs are personal data and are never stored. Without a
 * trusted edge (`trustProxyHeaders` off) client IPs are unverifiable, so the
 * IP scope degrades to a single shared "unverified" subject — true per-IP
 * limiting then belongs to the edge module (see
 * `deploy/edge-rate-limit/`), which this engine mirrors exactly.
 *
 * Algorithms are pure functions so the PostgreSQL binding, the in-memory
 * binding and any edge runtime share one behavior.
 */

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface TokenBucketPolicy {
  /** Maximum burst tokens held by one bucket. */
  capacity: number;
  /** Sustained refill rate in tokens per second. */
  refillPerSec: number;
}

export interface FloodPolicy {
  /** Distinct requests inside `strikeWindowMs` that open the penalty box. */
  strikeLimit: number;
  strikeWindowMs: number;
  /** First-offense penalty-box duration; doubles per repeat offense. */
  blockBaseMs: number;
  blockMaxMs: number;
}

export interface AbusePolicy {
  ipRead: TokenBucketPolicy;
  ipWrite: TokenBucketPolicy;
  userRead: TokenBucketPolicy;
  userWrite: TokenBucketPolicy;
  flood: FloodPolicy;
  /** Usage thresholds (percent of the daily AI-cost budget) that alert once. */
  budgetAlertThresholdsPct: readonly number[];
  /** Replay window in which an `Idempotency-Key` is treated as an exempt replay. */
  idempotencyMarkerTtlMs: number;
}

/**
 * Defaults are deliberately generous: they stop floods and runaway loops
 * without throttling ordinary Private-Alpha traffic. Deployments tighten
 * them via `GON_ABUSE_*` (see {@link parseAbusePolicyFromEnv}).
 */
export const DEFAULT_ABUSE_POLICY: AbusePolicy = {
  ipRead: { capacity: 240, refillPerSec: 4 },
  ipWrite: { capacity: 120, refillPerSec: 2 },
  userRead: { capacity: 600, refillPerSec: 10 },
  userWrite: { capacity: 600, refillPerSec: 10 },
  flood: {
    strikeLimit: 120,
    strikeWindowMs: 10_000,
    blockBaseMs: 30_000,
    blockMaxMs: 900_000,
  },
  budgetAlertThresholdsPct: [50, 80, 100],
  idempotencyMarkerTtlMs: 15 * 60_000,
};

function positiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** `GON_ABUSE_*` environment overrides for the default policy. */
export function parseAbusePolicyFromEnv(env: NodeJS.ProcessEnv): AbusePolicy {
  return {
    ipRead: {
      capacity: positiveNumber(env.GON_ABUSE_IP_READ_CAPACITY, DEFAULT_ABUSE_POLICY.ipRead.capacity),
      refillPerSec: positiveNumber(env.GON_ABUSE_IP_READ_REFILL_PER_SEC, DEFAULT_ABUSE_POLICY.ipRead.refillPerSec),
    },
    ipWrite: {
      capacity: positiveNumber(env.GON_ABUSE_IP_WRITE_CAPACITY, DEFAULT_ABUSE_POLICY.ipWrite.capacity),
      refillPerSec: positiveNumber(env.GON_ABUSE_IP_WRITE_REFILL_PER_SEC, DEFAULT_ABUSE_POLICY.ipWrite.refillPerSec),
    },
    userRead: {
      capacity: positiveNumber(env.GON_ABUSE_USER_READ_CAPACITY, DEFAULT_ABUSE_POLICY.userRead.capacity),
      refillPerSec: positiveNumber(env.GON_ABUSE_USER_READ_REFILL_PER_SEC, DEFAULT_ABUSE_POLICY.userRead.refillPerSec),
    },
    userWrite: {
      capacity: positiveNumber(env.GON_ABUSE_USER_WRITE_CAPACITY, DEFAULT_ABUSE_POLICY.userWrite.capacity),
      refillPerSec: positiveNumber(env.GON_ABUSE_USER_WRITE_REFILL_PER_SEC, DEFAULT_ABUSE_POLICY.userWrite.refillPerSec),
    },
    flood: {
      strikeLimit: positiveNumber(env.GON_ABUSE_FLOOD_STRIKE_LIMIT, DEFAULT_ABUSE_POLICY.flood.strikeLimit),
      strikeWindowMs: positiveNumber(env.GON_ABUSE_FLOOD_WINDOW_MS, DEFAULT_ABUSE_POLICY.flood.strikeWindowMs),
      blockBaseMs: positiveNumber(env.GON_ABUSE_BLOCK_BASE_MS, DEFAULT_ABUSE_POLICY.flood.blockBaseMs),
      blockMaxMs: positiveNumber(env.GON_ABUSE_BLOCK_MAX_MS, DEFAULT_ABUSE_POLICY.flood.blockMaxMs),
    },
    budgetAlertThresholdsPct: DEFAULT_ABUSE_POLICY.budgetAlertThresholdsPct,
    idempotencyMarkerTtlMs: positiveNumber(
      env.GON_ABUSE_IDEMPOTENCY_TTL_MS,
      DEFAULT_ABUSE_POLICY.idempotencyMarkerTtlMs,
    ),
  };
}

// ---------------------------------------------------------------------------
// Pure state algorithms (shared by every binding and the edge module)
// ---------------------------------------------------------------------------

export interface TokenBucketState {
  bucketKey: string;
  tokens: number;
  capacity: number;
  refillPerSec: number;
  updatedAt: string;
}

export interface BucketConsumeInput {
  bucketKey: string;
  capacity: number;
  refillPerSec: number;
  cost: number;
  at: string;
}

export interface BucketConsumeResult {
  allowed: boolean;
  tokensAfter: number;
  /** Milliseconds until `cost` tokens are available again (0 when allowed). */
  retryAfterMs: number;
  /** State to persist (null when the caller may skip the write). */
  nextState: TokenBucketState;
}

function elapsedSeconds(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, (to - from) / 1000);
}

/** Token-refill accounting for one consume attempt. Deterministic in `at`. */
export function consumeBucketInMemory(
  previous: TokenBucketState | null,
  input: BucketConsumeInput,
): BucketConsumeResult {
  const capacity = input.capacity;
  const refillPerSec = Math.max(0, input.refillPerSec);
  const cost = Math.max(0, input.cost);
  const baseTokens = previous ? Math.max(0, previous.tokens) : capacity;
  const refilled = previous
    ? Math.min(capacity, baseTokens + elapsedSeconds(previous.updatedAt, input.at) * refillPerSec)
    : capacity;
  const allowed = cost <= refilled && cost <= capacity;
  const tokensAfter = allowed ? refilled - cost : refilled;
  const shortfall = Math.max(0, cost - refilled);
  const retryAfterMs = allowed
    ? 0
    : refillPerSec > 0
      ? Math.ceil((shortfall / refillPerSec) * 1000)
      : Number.POSITIVE_INFINITY;
  return {
    allowed,
    tokensAfter,
    retryAfterMs,
    nextState: {
      bucketKey: input.bucketKey,
      tokens: tokensAfter,
      capacity,
      refillPerSec,
      updatedAt: input.at,
    },
  };
}

export interface FloodState {
  floodKey: string;
  strikes: number;
  windowStart: string;
  offenseCount: number;
  blockedUntil: string | null;
  updatedAt: string;
}

export interface FloodStrikeInput {
  floodKey: string;
  at: string;
  strikeLimit: number;
  strikeWindowMs: number;
  blockBaseMs: number;
  blockMaxMs: number;
}

export interface FloodStrikeResult {
  blocked: boolean;
  blockedUntil: string | null;
  strikes: number;
  /** Milliseconds until the subject may retry (0 when allowed). */
  retryAfterMs: number;
  nextState: FloodState;
}

/** Strike accounting for one non-replay request. Deterministic in `at`. */
export function applyFloodStrike(
  previous: FloodState | null,
  input: FloodStrikeInput,
): FloodStrikeResult {
  const atMs = Date.parse(input.at);
  const windowStartMs = previous ? Date.parse(previous.windowStart) : atMs;
  const windowExpired = previous !== null && atMs - windowStartMs >= input.strikeWindowMs;
  let strikes = previous === null || windowExpired ? 1 : previous.strikes + 1;
  let windowStart = previous === null || windowExpired ? input.at : previous.windowStart;
  let offenseCount = previous?.offenseCount ?? 0;
  let blockedUntil: string | null = previous?.blockedUntil ?? null;

  if (strikes > input.strikeLimit) {
    offenseCount += 1;
    const blockMs = Math.min(input.blockBaseMs * 2 ** (offenseCount - 1), input.blockMaxMs);
    blockedUntil = new Date(atMs + blockMs).toISOString();
    // The penalty box IS the punishment: reset the strike window so a
    // released subject starts clean instead of re-tripping on stale strikes
    // (which would lock out shared subjects, e.g. one NAT IP, forever).
    strikes = 0;
    windowStart = input.at;
  }

  const blocked = blockedUntil !== null && Date.parse(blockedUntil) > atMs;
  const retryAfterMs = blocked && blockedUntil !== null
    ? Math.max(1, Date.parse(blockedUntil) - atMs)
    : 0;
  return {
    blocked,
    blockedUntil,
    strikes,
    retryAfterMs,
    nextState: {
      floodKey: input.floodKey,
      strikes,
      windowStart,
      offenseCount,
      blockedUntil,
      updatedAt: input.at,
    },
  };
}

/** Current penalty-box check without registering a strike. */
export function isFloodBlocked(state: FloodState | null, at: string): boolean {
  if (!state?.blockedUntil) return false;
  return Date.parse(state.blockedUntil) > Date.parse(at);
}

// ---------------------------------------------------------------------------
// Distributed state port
// ---------------------------------------------------------------------------

export interface PeekedFloodState {
  state: FloodState | null;
  /** Optimistic-concurrency stamp (null = record absent). */
  version: number | null;
}

export interface AbuseStateStore {
  /**
   * Atomically refill+consume one token bucket. Implementations must treat
   * `cost <= refilled` as the allow condition and persist the refilled state
   * even on denial (so time heals a throttled bucket).
   */
  consumeBucket(input: BucketConsumeInput): Promise<BucketConsumeResult>;
  /** Read one flood record together with its concurrency stamp. */
  peekFlood(floodKey: string): Promise<PeekedFloodState>;
  /**
   * Persist a computed strike transition. Returns false when another writer
   * changed the record first (caller recomputes against the fresh state and
   * retries).
   */
  saveFloodStrike(floodKey: string, next: FloodState, seenVersion: number | null): Promise<boolean>;
  resetFlood(floodKey: string): Promise<void>;
  /**
   * Register an idempotency marker. "new" = first sighting (or the previous
   * marker expired past `ttlMs`); "replay" = seen recently: the request is
   * exempt from token/strike accounting.
   */
  markIdempotency(markerKey: string, at: string, ttlMs: number): Promise<"new" | "replay">;
  /**
   * Claim one (user, quotaKey, windowStart, threshold) alert slot. true =
   * first claim, the caller must emit/sink the alert exactly once.
   */
  claimBudgetAlert(input: {
    userId: string;
    quotaKey: string;
    windowStart: string;
    thresholdPct: number;
    at: string;
  }): Promise<boolean>;
  /** Best-effort eviction of expired markers/buckets (bounded state growth). */
  prune(before: string): Promise<void>;
}

  /** In-process binding for single-instance/test compositions. */
  export class MemoryAbuseStateStore implements AbuseStateStore {
  private readonly buckets = new Map<string, TokenBucketState>();
  private readonly floods = new Map<string, { state: FloodState; version: number }>();
  private readonly markers = new Map<string, string>();
  private readonly claims = new Set<string>();

  async consumeBucket(input: BucketConsumeInput): Promise<BucketConsumeResult> {
    const result = consumeBucketInMemory(this.buckets.get(input.bucketKey) ?? null, input);
    this.buckets.set(input.bucketKey, result.nextState);
    return result;
  }

  async peekFlood(floodKey: string): Promise<PeekedFloodState> {
    const entry = this.floods.get(floodKey);
    return entry ? { state: entry.state, version: entry.version } : { state: null, version: null };
  }

  async saveFloodStrike(floodKey: string, next: FloodState, seenVersion: number | null): Promise<boolean> {
    const entry = this.floods.get(floodKey);
    const currentVersion = entry?.version ?? null;
    if (currentVersion !== seenVersion) return false;
    this.floods.set(floodKey, { state: next, version: (entry?.version ?? 0) + 1 });
    return true;
  }

  async resetFlood(floodKey: string): Promise<void> {
    this.floods.delete(floodKey);
  }

  async markIdempotency(markerKey: string, at: string, ttlMs: number): Promise<"new" | "replay"> {
    const firstSeen = this.markers.get(markerKey);
    if (firstSeen === undefined) {
      this.markers.set(markerKey, at);
      return "new";
    }
    if (Date.parse(at) - Date.parse(firstSeen) >= ttlMs) {
      this.markers.set(markerKey, at);
      return "new";
    }
    return "replay";
  }

  async claimBudgetAlert(input: {
    userId: string;
    quotaKey: string;
    windowStart: string;
    thresholdPct: number;
    at: string;
  }): Promise<boolean> {
    const key = `${input.userId}:${input.quotaKey}:${input.windowStart}:${input.thresholdPct}`;
    if (this.claims.has(key)) return false;
    this.claims.add(key);
    return true;
  }

  async prune(before: string): Promise<void> {
    for (const [key, at] of this.markers) {
      if (Date.parse(at) < Date.parse(before)) this.markers.delete(key);
    }
    for (const [key, state] of this.buckets) {
      if (Date.parse(state.updatedAt) < Date.parse(before)) this.buckets.delete(key);
    }
    for (const [key, entry] of this.floods) {
      const blocked =
        entry.state.blockedUntil !== null && Date.parse(entry.state.blockedUntil) > Date.parse(before);
      if (!blocked && Date.parse(entry.state.updatedAt) < Date.parse(before)) this.floods.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Controller (policy engine)
// ---------------------------------------------------------------------------

export type AbuseScope = "ip" | "user";
export type AbuseActionClass = "read" | "write";

export interface AbuseAdmitInput {
  scope: AbuseScope;
  /** Raw subject: IP literal or user id. Hashed before any persistence. */
  subject: string;
  actionClass: AbuseActionClass;
  idempotencyKey?: string | null;
}

export type AbuseDenyReason = "rate_limit" | "flood";

export interface AbuseAdmitResult {
  allowed: boolean;
  /** True when an `Idempotency-Key` replay was exempted from accounting. */
  replay: boolean;
  reason: AbuseDenyReason | null;
  retryAfterSeconds: number;
  detail: string;
}

export interface BudgetAlert {
  userId: string;
  quotaKey: string;
  windowStart: string;
  windowEnd: string;
  limitUnits: number;
  usedUnits: number;
  thresholdPct: number;
  at: string;
}

export type BudgetAlertSink = (alert: BudgetAlert) => void | Promise<void>;

export class AbuseController {
  private readonly store: AbuseStateStore;
  private readonly policy: AbusePolicy;
  private readonly hashSalt: string;
  private readonly clock: () => Date;

  constructor(options: {
    store: AbuseStateStore;
    policy?: Partial<AbusePolicy>;
    hashSalt?: string;
    now?: () => Date;
  }) {
    this.store = options.store;
    this.policy = {
      ...DEFAULT_ABUSE_POLICY,
      ...options.policy,
      flood: { ...DEFAULT_ABUSE_POLICY.flood, ...(options.policy?.flood ?? {}) },
    };
    this.hashSalt = options.hashSalt ?? "";
    this.clock = options.now ?? (() => new Date());
  }

  get activePolicy(): AbusePolicy {
    return this.policy;
  }

  /** Hashed persistence key for a subject (raw IPs never leave this method). */
  subjectKey(scope: AbuseScope, subject: string): string {
    return `${scope}:${sha256Hex(`${this.hashSalt}:${scope}:${subject}`).slice(0, 32)}`;
  }

  /**
   * One admission decision, in order:
   * 1. Idempotent replay → free pass (no tokens, no strikes).
   * 2. Penalty box → deny (`flood`).
   * 3. Register a flood strike; entering the penalty box → deny (`flood`).
   * 4. Token bucket consume; insufficient tokens → deny (`rate_limit`).
   */
  async admit(input: AbuseAdmitInput): Promise<AbuseAdmitResult> {
    const at = this.clock().toISOString();

    if (input.idempotencyKey) {
      const markerKey = `${this.subjectKey(input.scope, input.subject)}:idem:${sha256Hex(input.idempotencyKey).slice(0, 32)}`;
      const sighting = await this.store.markIdempotency(markerKey, at, this.policy.idempotencyMarkerTtlMs);
      if (sighting === "replay") {
        return {
          allowed: true,
          replay: true,
          reason: null,
          retryAfterSeconds: 0,
          detail: "Idempotent replay: exempt from rate limiting and flood accounting.",
        };
      }
    }

    const floodKey = `${this.subjectKey(input.scope, input.subject)}:flood`;
    const { state: seen, version } = await this.store.peekFlood(floodKey);
    if (isFloodBlocked(seen, at)) {
      const blockedUntilMs = Date.parse(seen!.blockedUntil!);
      return {
        allowed: false,
        replay: false,
        reason: "flood",
        retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - Date.parse(at)) / 1000)),
        detail: "Yêu cầu bị tạm chặn do lưu lượng bất thường (flood guard). Hãy thử lại sau.",
      };
    }

    const strikeInput: FloodStrikeInput = {
      floodKey,
      at,
      strikeLimit: this.policy.flood.strikeLimit,
      strikeWindowMs: this.policy.flood.strikeWindowMs,
      blockBaseMs: this.policy.flood.blockBaseMs,
      blockMaxMs: this.policy.flood.blockMaxMs,
    };
    let current: PeekedFloodState = { state: seen, version };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const strike = applyFloodStrike(current.state, strikeInput);
      const saved = await this.store.saveFloodStrike(floodKey, strike.nextState, current.version);
      if (saved) {
        if (strike.blocked) {
          return {
            allowed: false,
            replay: false,
            reason: "flood",
            retryAfterSeconds: Math.max(1, Math.ceil(strike.retryAfterMs / 1000)),
            detail: "Yêu cầu bị tạm chặn do lưu lượng bất thường (flood guard). Hãy thử lại sau.",
          };
        }
        break;
      }
      current = await this.store.peekFlood(floodKey);
      if (isFloodBlocked(current.state, at)) {
        return {
          allowed: false,
          replay: false,
          reason: "flood",
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((Date.parse(current.state!.blockedUntil!) - Date.parse(at)) / 1000),
          ),
          detail: "Yêu cầu bị tạm chặn do lưu lượng bất thường (flood guard). Hãy thử lại sau.",
        };
      }
    }

    const bucketPolicy = this.policy[
      input.scope === "ip"
        ? input.actionClass === "read"
          ? "ipRead"
          : "ipWrite"
        : input.actionClass === "read"
          ? "userRead"
          : "userWrite"
    ];
    const bucket = await this.store.consumeBucket({
      bucketKey: `${this.subjectKey(input.scope, input.subject)}:${input.actionClass}`,
      capacity: bucketPolicy.capacity,
      refillPerSec: bucketPolicy.refillPerSec,
      cost: 1,
      at,
    });
    if (!bucket.allowed) {
      return {
        allowed: false,
        replay: false,
        reason: "rate_limit",
        retryAfterSeconds: Math.max(1, Math.ceil(bucket.retryAfterMs / 1000)),
        detail: "Bạn đang gửi yêu cầu quá nhanh. Vui lòng chờ giây lát rồi thử lại.",
      };
    }
    return {
      allowed: true,
      replay: false,
      reason: null,
      retryAfterSeconds: 0,
      detail: "ok",
    };
  }

  /**
   * Claim + return the budget-alert thresholds newly crossed at `usedUnits`.
   * Idempotent across instances: each (user, quotaKey, windowStart, threshold)
   * is claimed exactly once in the distributed store.
   */
  async collectBudgetAlerts(input: {
    userId: string;
    quotaKey: string;
    windowStart: string;
    windowEnd: string;
    limitUnits: number;
    usedUnits: number;
  }): Promise<BudgetAlert[]> {
    const at = this.clock().toISOString();
    const alerts: BudgetAlert[] = [];
    for (const thresholdPct of this.policy.budgetAlertThresholdsPct) {
      if (input.limitUnits <= 0) continue;
      if ((input.usedUnits * 100) / input.limitUnits < thresholdPct) continue;
      const claimed = await this.store.claimBudgetAlert({
        userId: input.userId,
        quotaKey: input.quotaKey,
        windowStart: input.windowStart,
        thresholdPct,
        at,
      });
      if (!claimed) continue;
      alerts.push({
        userId: input.userId,
        quotaKey: input.quotaKey,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        limitUnits: input.limitUnits,
        usedUnits: input.usedUnits,
        thresholdPct,
        at,
      });
    }
    return alerts;
  }

  async pruneExpiredState(): Promise<void> {
    const nowMs = this.clock().getTime();
    const markerCutoff = new Date(nowMs - 2 * this.policy.idempotencyMarkerTtlMs).toISOString();
    await this.store.prune(markerCutoff);
  }
}

// ---------------------------------------------------------------------------
// HTTP boundary helpers
// ---------------------------------------------------------------------------

/**
 * Client IP for abuse keying. Forwarded headers are only honored behind a
 * trusted edge that overwrites them (`GON_TRUST_PROXY_HEADERS=1`); otherwise
 * they are attacker-controlled and the scope degrades to the shared
 * "unverified" subject.
 */
export function clientIpFromRequest(request: Request, trustProxyHeaders: boolean): string {
  if (!trustProxyHeaders) return "unverified";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unverified";
}

/** Read vs write classification for the HTTP admission point. */
export function actionClassFromMethod(method: string): AbuseActionClass {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD" || upper === "OPTIONS" ? "read" : "write";
}
