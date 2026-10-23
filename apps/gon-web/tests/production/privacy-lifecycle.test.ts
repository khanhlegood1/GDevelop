import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/server/config";
import { LocalHashEmbeddingProvider } from "@/server/embeddings";
import { MemoryGonStore } from "@/server/memory-store";
import { GonService } from "@/server/service";
import type { Actor, FootprintEventRecord } from "@/server/types";

function createService() {
  const store = new MemoryGonStore();
  store.seedInvite("GON-ALPHA-TEST");
  const service = new GonService({
    store,
    embeddingProvider: new LocalHashEmbeddingProvider(),
    requireInvite: true,
    brewExecutionMode: "queued",
    featureFlags: { brew_enabled: true },
  });
  return { store, service };
}

let activationSequence = 0;

async function activate(service: GonService, name: string) {
  const user = await service.ensureDevUser(name);
  const actor: Actor = {
    userId: user.id,
    roles: user.roles,
    authProvider: "test",
    requestId: "req_privacy",
  };
  activationSequence += 1;
  const inviteCode = `GON-ALPHA-TEST-${activationSequence}`;
  await service.seedInvite(inviteCode);
  await service.createAgeAttestation(actor, {
    isAtLeast18: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    personalizationFootprint: "granted",
    inviteCode,
  });
  return { user, actor };
}

function seedFootprintEvent(store: MemoryGonStore, userId: string, id: string): void {
  const event: FootprintEventRecord = {
    id,
    userId,
    category: "journey_started",
    entityType: "journey",
    entityId: "jrn_privacy",
    attributes: {},
    consentPurpose: "personalization_footprint",
    consentStatusAtEvent: "granted",
    occurredAt: new Date().toISOString(),
  };
  store.footprintEvents.set(id, event);
}

describe("privacy personalization (P05-R1.7)", () => {
  it("reports footprint state from consent and versions preferences", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học personalization");
    // Attestation granted personalization footprint consent.
    const initial = await service.getPersonalization(actor);
    expect(initial).toMatchObject({ footprintEnabled: true, version: 1 });
    expect((initial.usedSignalGroups as string[]).length).toBeGreaterThan(0);
    expect(initial.notUsedSignalGroups).toEqual([]);

    const patched = await service.patchPersonalization(actor, {
      preferences: { topics: ["toán"] },
    });
    expect(patched).toMatchObject({ footprintEnabled: true, version: 2 });
    expect(patched.preferences).toEqual({ topics: ["toán"] });

    const disabled = await service.patchPersonalization(actor, { footprintEnabled: false });
    expect(disabled).toMatchObject({ footprintEnabled: false });
    expect(disabled.usedSignalGroups).toEqual([]);
    expect((disabled.notUsedSignalGroups as string[]).length).toBeGreaterThan(0);
    // Consent is the source of truth and got flipped to denied.
    expect(
      (await service.listConsents(actor)).find((item) => item.purpose === "personalization_footprint"),
    ).toMatchObject({ status: "denied" });

    // The stored row survives a fresh read (transactional persistence).
    expect(store.personalizations.get(actor.userId)).toMatchObject({ version: 2 });
    await service.patchPersonalization(actor, { footprintEnabled: true });
    expect(await service.getPersonalization(actor)).toMatchObject({ footprintEnabled: true });
  });
});

describe("privacy data requests (P05-R1.7)", () => {
  it("runs the export lifecycle with an audited receipt and idempotent replay", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học export");
    await service.createProject(
      actor,
      {
        title: "Dự án privacy",
        prompt: "Nội dung nguồn của tôi",
        goal: "Kiểm chứng export",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "privacy-project-1" },
    );
    await service.patchPersonalization(actor, { preferences: { topics: ["privacy"] } });
    seedFootprintEvent(store, actor.userId, "1");

    const created = await service.createDataRequest(
      actor,
      { type: "export" },
      { idempotencyKey: "privacy-export-1" },
    );
    expect(created.status).toBe(202);
    expect(created.data).toMatchObject({ type: "export", status: "received", completedAt: null });

    // Owner-only visibility: another real user cannot read the request.
    const { actor: otherActor } = await activate(service, "Người dùng khác");
    await expect(
      service.getDataRequest(otherActor, String(created.data.id)),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    const processed = await service.processDataRequest(String(created.data.id));
    expect(processed).toMatchObject({ status: "completed" });
    const receipt = processed!.receipt as Record<string, unknown>;
    expect(receipt.kind).toBe("export");
    expect(String(receipt.objectKey)).toContain(`exports/${actor.userId}/`);
    expect(receipt.expiresAt).toBeTruthy();
    expect(receipt.contents).toMatchObject({ projects: 1, artifacts: 1, footprintEvents: 1 });
    expect(processed!.completedAt).toBeTruthy();

    // The bundle object is stored privately with the export content.
    const object = await store.objects.get(String(receipt.objectKey));
    expect(object).toBeTruthy();
    const bundle = JSON.parse(object!.bytes.toString("utf-8")) as Record<string, unknown>;
    expect(bundle.schemaVersion).toBe("gon.privacy.export/1.0");
    expect((bundle.projects as unknown[]).length).toBe(1);

    // Idempotent replay returns the same request without new work.
    const replay = await service.createDataRequest(
      actor,
      { type: "export" },
      { idempotencyKey: "privacy-export-1" },
    );
    expect(replay).toMatchObject({ status: 200, replay: true });
    expect(replay.data.id).toBe(created.data.id);

    // Events reached the outbox for both lifecycle transitions.
    const events = store.outboxEvents.filter((event) =>
      event.eventType.startsWith("identity.data_request."),
    );
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "identity.data_request.completed",
      "identity.data_request.created",
    ]);
  });

  it("deletes detailed footprint without touching learning history", async () => {
    const { service, store } = createService();
    const { actor } = await activate(service, "Người học delete footprint");
    await service.createProject(
      actor,
      {
        title: "Dự án giữ lại",
        prompt: "Nội dung",
        goal: "Footprint xóa, project giữ",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "privacy-project-2" },
    );
    seedFootprintEvent(store, actor.userId, "10");
    seedFootprintEvent(store, actor.userId, "11");
    seedFootprintEvent(store, "usr_other_user", "12");
    await service.patchPersonalization(actor, { preferences: { topics: ["x"] } });

    const requested = await service.deleteFootprint(actor, { idempotencyKey: "privacy-fp-1" });
    expect(requested.status).toBe(202);
    expect(requested.data).toMatchObject({ type: "delete_footprint", status: "received" });

    const processed = await service.processDataRequest(String(requested.data.id));
    expect(processed).toMatchObject({ status: "completed" });
    expect(processed!.receipt).toMatchObject({
      kind: "delete_footprint",
      deletedFootprintEvents: 2,
      footprintDisabled: true,
      retained: ["projects", "journeys", "proofs", "xp_ledger"],
    });

    // Detailed events gone (including only this user's), preferences cleared,
    // footprint consent forced off — while the project survives.
    expect([...store.footprintEvents.keys()]).toEqual(["12"]);
    expect(store.personalizations.has(actor.userId)).toBe(false);
    expect(await service.getPersonalization(actor)).toMatchObject({ footprintEnabled: false });
    expect([...store.projects.values()].filter((p) => p.ownerUserId === actor.userId && !p.deletedAt)).toHaveLength(1);
    // Replay of the same request is idempotent.
    const replay = await service.deleteFootprint(actor, { idempotencyKey: "privacy-fp-1" });
    expect(replay).toMatchObject({ status: 200, replay: true });
  });

  it("tombstones and anonymizes on account deletion with a retention receipt", async () => {
    const { service, store } = createService();
    const { user, actor } = await activate(service, "Người học delete account");
    await service.createProject(
      actor,
      {
        title: "Dự án bị xóa",
        prompt: "Nội dung",
        goal: "Kiểm chứng delete account",
        learningMode: "deep_mastery",
        depth: "standard",
        timeBudgetMinutes: 30,
        locale: "vi-VN",
      },
      { idempotencyKey: "privacy-project-3" },
    );
    seedFootprintEvent(store, actor.userId, "20");
    store.devSessions.set("tok_privacy", {
      tokenHash: "tok_privacy",
      userId: actor.userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    } as never);

    const created = await service.createDataRequest(
      actor,
      { type: "delete_account" },
      { idempotencyKey: "privacy-acct-1" },
    );
    const processed = await service.processDataRequest(String(created.data.id));
    expect(processed).toMatchObject({ status: "completed" });
    const receipt = processed!.receipt as Record<string, unknown>;
    expect(receipt.kind).toBe("delete_account");
    expect(receipt.retained).toEqual(
      expect.arrayContaining(["xp_ledger_entries", "audit_logs", "data_request_receipts"]),
    );

    // Account tombstoned and sessions revoked immediately.
    expect(store.users.get(user.id)).toMatchObject({ status: "deleted" });
    expect(store.users.get(user.id)?.deletedAt).toBeTruthy();
    expect(store.devSessions.has("tok_privacy")).toBe(false);

    // Learning content tombstoned; footprint erased; PII anonymized.
    const project = [...store.projects.values()].find((p) => p.ownerUserId === user.id);
    expect(project?.deletedAt).toBeTruthy();
    const artifact = [...store.artifacts.values()].find((a) => a.ownerUserId === user.id);
    expect(artifact?.deletedAt).toBeTruthy();
    expect([...store.footprintEvents.values()].filter((e) => e.userId === user.id)).toHaveLength(0);
    expect(store.profiles.get(user.id)).toMatchObject({
      displayName: "Người dùng đã xóa",
      selfDeclaredHeadline: null,
    });

    // Completed request remains visible as a receipt (owner is tombstoned, so
    // the HTTP read path correctly stops serving them; the receipt stays in
    // the store for the retention schedule).
    expect(store.dataRequests.get(String(created.data.id))).toMatchObject({
      requestType: "delete_account",
      status: "completed",
    });
  });
});
