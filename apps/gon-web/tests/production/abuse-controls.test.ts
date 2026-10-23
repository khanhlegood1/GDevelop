import { describe, expect, it } from "vitest";
import {
  AbuseController,
  MemoryAbuseStateStore,
  actionClassFromMethod,
  applyFloodStrike,
  clientIpFromRequest,
  consumeBucketInMemory,
  type AbusePolicy,
  type BudgetAlert,
} from "@/server/abuse-controls";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { ApiError } from "@/server/errors";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService, type GonServiceOptions } from "@/server/service";
import type { Actor, OutboxEventRecord } from "@/server/types";

function controllerWith(
  options: {
    policy?: Partial<AbusePolicy>;
    now?: () => Date;
    salt?: string;
  } = {},
): AbuseController {
  return new AbuseController({
    store: new MemoryAbuseStateStore(),
    policy: options.policy,
    hashSalt: options.salt,
    now: options.now,
  });
}

describe("token bucket accounting (pure, P05-R1.10)", () => {
  it("allows the burst up to capacity, then denies with a refill-based retry hint", () => {
    const at = "2026-10-24T08:00:00.000Z";
    const input = { bucketKey: "k", capacity: 3, refillPerSec: 0.5, cost: 1, at };
    let state = null as ReturnType<typeof consumeBucketInMemory>["nextState"] | null;
    for (let i = 0; i < 3; i += 1) {
      const result = consumeBucketInMemory(state, input);
      expect(result.allowed).toBe(true);
      state = result.nextState;
    }
    const denied = consumeBucketInMemory(state, input);
    expect(denied.allowed).toBe(false);
    // Missing 1 token at 0.5 tokens/s → 2s.
    expect(denied.retryAfterMs).toBe(2000);
    expect(denied.tokensAfter).toBeCloseTo(0, 5);
  });

  it("refills over time and never exceeds capacity", () => {
    const first = consumeBucketInMemory(null, {
      bucketKey: "k",
      capacity: 2,
      refillPerSec: 1,
      cost: 2,
      at: "2026-10-24T08:00:00.000Z",
    });
    expect(first.allowed).toBe(true);
    const healed = consumeBucketInMemory(first.nextState, {
      bucketKey: "k",
      capacity: 2,
      refillPerSec: 1,
      cost: 1,
      at: "2026-10-24T08:00:30.000Z",
    });
    expect(healed.allowed).toBe(true);
    // Refill capped at capacity: 0 + 30s * 1/s would be 30, clamped to 2, minus 1.
    expect(healed.tokensAfter).toBe(1);
  });
});

describe("flood guard accounting (pure, P05-R1.10)", () => {
  it("opens the penalty box past the strike limit with exponential backoff", () => {
    const base = {
      floodKey: "f",
      strikeLimit: 2,
      strikeWindowMs: 10_000,
      blockBaseMs: 4_000,
      blockMaxMs: 60_000,
    };
    let state = null as ReturnType<typeof applyFloodStrike>["nextState"] | null;
    const first = applyFloodStrike(state, { ...base, at: "2026-10-24T08:00:00.000Z" });
    state = first.nextState;
    const second = applyFloodStrike(state, { ...base, at: "2026-10-24T08:00:01.000Z" });
    state = second.nextState;
    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
    const third = applyFloodStrike(state, { ...base, at: "2026-10-24T08:00:02.000Z" });
    expect(third.blocked).toBe(true);
    expect(third.retryAfterMs).toBe(4000);
    // Opening a penalty box resets the strike window (the box is the
    // punishment) but keeps the offense count for escalation.
    expect(third.nextState.strikes).toBe(0);
    expect(third.nextState.offenseCount).toBe(1);
    // Second offense: strikes climb past the limit again → doubled block.
    state = third.nextState;
    for (const at of ["2026-10-24T08:00:07.000Z", "2026-10-24T08:00:08.000Z"]) {
      const climb = applyFloodStrike(state, { ...base, at });
      expect(climb.blocked).toBe(false);
      state = climb.nextState;
    }
    const fifth = applyFloodStrike(state, { ...base, at: "2026-10-24T08:00:09.000Z" });
    expect(fifth.blocked).toBe(true);
    expect(fifth.nextState.offenseCount).toBe(2);
    // 2^1 * blockBaseMs = 8s past 08:00:09.
    expect(fifth.blockedUntil).toBe("2026-10-24T08:00:17.000Z");
  });

  it("resets the strike window after strikeWindowMs of quiet", () => {
    const base = {
      floodKey: "f",
      strikeLimit: 1,
      strikeWindowMs: 10_000,
      blockBaseMs: 4_000,
      blockMaxMs: 60_000,
    };
    const first = applyFloodStrike(null, { ...base, at: "2026-10-24T08:00:00.000Z" });
    expect(first.blocked).toBe(false);
    const reset = applyFloodStrike(first.nextState, { ...base, at: "2026-10-24T08:00:20.000Z" });
    expect(reset.blocked).toBe(false);
    expect(reset.strikes).toBe(1);
  });
});

describe("AbuseController admission (idempotent flood guard)", () => {
  it("exempts Idempotency-Key replays from tokens and strikes", async () => {
    let nowMs = Date.parse("2026-10-24T08:00:00.000Z");
    const controller = controllerWith({
      policy: {
        userWrite: { capacity: 1, refillPerSec: 0.0001 },
        flood: { strikeLimit: 3, strikeWindowMs: 10_000, blockBaseMs: 4_000, blockMaxMs: 60_000 },
      },
      now: () => new Date(nowMs),
    });
    const first = await controller.admit({
      scope: "user",
      subject: "u1",
      actionClass: "write",
      idempotencyKey: "idem-1",
    });
    expect(first.allowed).toBe(true);
    expect(first.replay).toBe(false);

    // Bucket is now empty and strikes are accruing — a retry with the same
    // Idempotency-Key must pass free of accounting.
    const replay = await controller.admit({
      scope: "user",
      subject: "u1",
      actionClass: "write",
      idempotencyKey: "idem-1",
    });
    expect(replay.allowed).toBe(true);
    expect(replay.replay).toBe(true);

    const distinct = await controller.admit({
      scope: "user",
      subject: "u1",
      actionClass: "write",
      idempotencyKey: "idem-2",
    });
    expect(distinct.allowed).toBe(false);
    expect(distinct.reason).toBe("rate_limit");
    expect(distinct.retryAfterSeconds).toBeGreaterThan(0);

    // Marker TTL expiry: the old key counts as a brand-new request again.
    nowMs += 16 * 60_000;
    const expired = await controller.admit({
      scope: "user",
      subject: "u1",
      actionClass: "write",
      idempotencyKey: "idem-1",
    });
    expect(expired.replay).toBe(false);
  });

  it("blocks a flooding subject and frees it after the penalty box expires", async () => {
    let nowMs = Date.parse("2026-10-24T08:00:00.000Z");
    const controller = controllerWith({
      policy: {
        userWrite: { capacity: 1000, refillPerSec: 100 },
        flood: { strikeLimit: 2, strikeWindowMs: 10_000, blockBaseMs: 4_000, blockMaxMs: 60_000 },
      },
      now: () => new Date(nowMs),
    });
    const outcomes: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      outcomes.push((await controller.admit({ scope: "ip", subject: "203.0.113.9", actionClass: "write" })).allowed);
    }
    expect(outcomes).toEqual([true, true, false]);

    const blocked = await controller.admit({ scope: "ip", subject: "203.0.113.9", actionClass: "read" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("flood");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    nowMs += 5_000; // penalty box (4s) has expired
    const freed = await controller.admit({ scope: "ip", subject: "203.0.113.9", actionClass: "read" });
    expect(freed.allowed).toBe(true);
  });

  it("hashes subjects before they ever reach persistence keys", async () => {
    const controller = controllerWith({ salt: "deploy-salt" });
    const key = controller.subjectKey("ip", "198.51.100.7");
    expect(key).not.toContain("198.51.100.7");
    expect(key).toMatch(/^ip:[0-9a-f]{32}$/);
  });
});

describe("HTTP boundary helpers (P05-R1.10)", () => {
  it("only trusts forwarded IPs behind an edge that overwrites them", () => {
    const request = new Request("https://gon.org/v1/me/bootstrap", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1", "x-real-ip": "203.0.113.6" },
    });
    expect(clientIpFromRequest(request, true)).toBe("203.0.113.5");
    expect(clientIpFromRequest(request, false)).toBe("unverified");
  });

  it("classifies methods into read/write buckets", () => {
    expect(actionClassFromMethod("get")).toBe("read");
    expect(actionClassFromMethod("HEAD")).toBe("read");
    expect(actionClassFromMethod("POST")).toBe("write");
    expect(actionClassFromMethod("DELETE")).toBe("write");
  });
});

describe("budget alert hooks (exactly-once claims)", () => {
  it("claims each crossed threshold once and stops reporting it", async () => {
    const controller = controllerWith();
    const windowArgs = {
      userId: "u1",
      quotaKey: "brew_cost_units_per_day",
      windowStart: "2026-10-24T00:00:00.000Z",
      windowEnd: "2026-10-25T00:00:00.000Z",
      limitUnits: 10,
    };
    const at50 = await controller.collectBudgetAlerts({ ...windowArgs, usedUnits: 5 });
    expect(at50.map((alert) => alert.thresholdPct)).toEqual([50]);
    const at80 = await controller.collectBudgetAlerts({ ...windowArgs, usedUnits: 8 });
    expect(at80.map((alert) => alert.thresholdPct)).toEqual([80]);
    const at100 = await controller.collectBudgetAlerts({ ...windowArgs, usedUnits: 10 });
    expect(at100.map((alert) => alert.thresholdPct)).toEqual([100]);
    const again = await controller.collectBudgetAlerts({ ...windowArgs, usedUnits: 12 });
    expect(again).toEqual([]);
  });
});

// --- Service-level integration (memory UoW, local/hermetic) -----------------

interface Harness {
  store: MemoryGonStore;
  service: GonService;
  actor: Actor;
}

let activationSequence = 0;

async function harnessWith(
  options: {
    policy?: Partial<AbusePolicy>;
    quotas?: GonServiceOptions["quotas"];
    budgetAlertSink?: (alert: BudgetAlert) => void;
  } = {},
): Promise<Harness> {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    brewExecutionMode: "queued",
    featureFlags: { brew_enabled: true },
    quotas: options.quotas,
    abuseControls: controllerWith({ policy: options.policy }),
    budgetAlertSink: options.budgetAlertSink,
  });
  const user = await service.ensureDevUser(`Abuse Tester ${activationSequence}`);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: "req_abuse",
  };
  activationSequence += 1;
  const inviteCode = `GON-ALPHA-TEST-${activationSequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: "terms-alpha-v1",
    privacyVersion: "privacy-alpha-v1",
    personalizationFootprint: "denied",
    inviteCode,
  });
  return { store, service, actor };
}

async function createProject(service: GonService, actor: Actor, key: string) {
  return (
    await service.createProject(
      actor,
      {
        title: `Abuse ${key}`,
        prompt: `Vì sao abuse control cần ${key}?`,
        goal: "Kiểm chứng rate limit",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: `abuse-project-${key}` },
    )
  ).data;
}

describe("service-level per-user enforcement (P05-R1.10)", () => {
  it("throttles writes past the injected user bucket with RATE_LIMITED + retry hint", async () => {
    const { service, actor } = await harnessWith({
      policy: {
        userWrite: { capacity: 2, refillPerSec: 0.0001 },
        flood: { strikeLimit: 1000, strikeWindowMs: 10_000, blockBaseMs: 1_000, blockMaxMs: 60_000 },
      },
    });
    await createProject(service, actor, "rl-1");
    await createProject(service, actor, "rl-2");
    let thrown: unknown;
    try {
      await createProject(service, actor, "rl-3");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    const apiError = thrown as ApiError;
    expect(apiError.status).toBe(429);
    expect(apiError.code).toBe("RATE_LIMITED");
    expect(apiError.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("lets idempotent replays through even when the bucket is empty", async () => {
    const { service, actor } = await harnessWith({
      policy: {
        userWrite: { capacity: 1, refillPerSec: 0.0001 },
        flood: { strikeLimit: 1000, strikeWindowMs: 10_000, blockBaseMs: 1_000, blockMaxMs: 60_000 },
      },
    });
    const first = await createProject(service, actor, "idem");
    // Same idempotency key: the replay is exempt from rate accounting and the
    // service returns the recorded result instead of creating a new project.
    const replay = await createProject(service, actor, "idem");
    expect(replay.id).toBe(first.id);
  });
});

describe("budget alerts through the service (P05-R1.10)", () => {
  it("fires each threshold exactly once into the sink and the outbox", async () => {
    const alerts: BudgetAlert[] = [];
    const { store, service, actor } = await harnessWith({
      quotas: { brewCostUnitsPerDay: 2 },
      budgetAlertSink: (alert) => {
        alerts.push(alert);
      },
    });

    async function brewOn(key: string) {
      const projectId = String((await createProject(service, actor, key)).id);
      const search = (
        await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: `abuse-search-${key}` })
      ).data;
      return (
        await service.createBrewJob(
          actor,
          projectId,
          { searchAttemptId: String(search.id), confirmed: true },
          { idempotencyKey: `abuse-brew-${key}` },
        )
      ).data;
    }

    await brewOn("budget-1"); // 1/2 → 50%
    await brewOn("budget-2"); // 2/2 → 80% + 100%
    expect(alerts.map((alert) => alert.thresholdPct)).toEqual([50, 80, 100]);
    expect(alerts.every((alert) => alert.quotaKey === "brew_cost_units_per_day")).toBe(true);
    expect(alerts.every((alert) => alert.usedUnits >= 1)).toBe(true);

    const budgetEvents = store.outboxEvents.filter(
      (event: OutboxEventRecord) => event.eventType === "guardrail.budget_alert",
    );
    expect(budgetEvents).toHaveLength(3);
    expect(
      budgetEvents.map((event) => Number(event.data.thresholdPct)).sort((a, b) => a - b),
    ).toEqual([50, 80, 100]);
  });

  it("never lets a failing alert sink break the learning flow", async () => {
    const { service, actor } = await harnessWith({
      quotas: { brewCostUnitsPerDay: 5 },
      budgetAlertSink: () => {
        throw new Error("pager is down");
      },
    });
    const projectId = String((await createProject(service, actor, "sink-fail")).id);
    const search = (
      await service.createSearchAttempt(actor, projectId, {}, { idempotencyKey: "abuse-search-sink" })
    ).data;
    const job = (
      await service.createBrewJob(
        actor,
        projectId,
        { searchAttemptId: String(search.id), confirmed: true },
        { idempotencyKey: "abuse-brew-sink" },
      )
    ).data;
    expect(job.status).toBe("queued");
  });
});
