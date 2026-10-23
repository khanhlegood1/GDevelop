import { describe, expect, it, vi } from "vitest";
import { MemoryGonStore } from "@/server/memory-store";
import {
  createPgPoolTransactionRunner,
  PostgresGonStore,
  type PgPoolLike,
} from "@/server/postgres-store";
import { GonService } from "@/server/service";

describe("memory Unit of Work", () => {
  it("composes facade calls atomically and rolls back the cloned identity map", async () => {
    const store = new MemoryGonStore();
    const service = new GonService({ store, requireInvite: false });

    await expect(
      service.runInTransaction(async (transactionalService) => {
        const user = await transactionalService.ensureDevUser("Rollback User");
        await transactionalService.createDevSession(user.id);
        expect(await transactionalService.findUserById(user.id)).toBeDefined();
        throw new Error("rollback composed memory transaction");
      }),
    ).rejects.toThrow("rollback composed memory transaction");

    expect(store.users.size).toBe(0);
    expect(store.devSessions.size).toBe(0);

    const committed = await service.runInTransaction(async (transactionalService) => {
      const user = await transactionalService.ensureDevUser("Committed User");
      const session = await transactionalService.createDevSession(user.id);
      return { user, session };
    });
    expect(store.users.get(committed.user.id)).toBeDefined();
    expect(await service.resolveDevSession(committed.session.token)).toMatchObject({
      userId: committed.user.id,
    });
  });

  it("does not leak in-place record mutations when a memory transaction fails", async () => {
    const store = new MemoryGonStore();
    const service = new GonService({ store, requireInvite: false });
    const user = await service.ensureDevUser("Mutation Rollback");

    await expect(
      store.runInTransaction(async (repositories) => {
        const workingUser = repositories.users.get(user.id);
        if (!workingUser) throw new Error("missing working user");
        workingUser.status = "suspended";
        throw new Error("rollback mutation");
      }),
    ).rejects.toThrow("rollback mutation");

    expect(store.users.get(user.id)?.status).toBe("onboarding");
  });
});

describe("PostgreSQL transaction runner", () => {
  function fakePool() {
    const statements: string[] = [];
    const release = vi.fn();
    const client = {
      async query(text: string) {
        statements.push(text);
        return { rows: [] };
      },
      release,
    };
    const pool: PgPoolLike = {
      async connect() {
        return client;
      },
    };
    return { pool, statements, release };
  }

  it("uses serializable isolation and commits successful work", async () => {
    const { pool, statements, release } = fakePool();
    const runner = createPgPoolTransactionRunner(pool);

    await expect(
      runner.transaction(async (executor) => {
        await executor.query("select 1");
        return "ok";
      }),
    ).resolves.toBe("ok");

    expect(statements).toEqual([
      "begin isolation level serializable",
      "select 1",
      "commit",
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back failed work and always releases the client", async () => {
    const { pool, statements, release } = fakePool();
    const runner = createPgPoolTransactionRunner(pool);

    await expect(
      runner.transaction(async () => {
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");

    expect(statements).toEqual(["begin isolation level serializable", "rollback"]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("retries only serialization/deadlock failures at the store boundary", async () => {
    const runner = {
      async transaction<T>(work: (executor: { query: () => Promise<{ rows: unknown[] }> }) => Promise<T>) {
        return work({ query: async () => ({ rows: [] }) });
      },
    };
    const store = new PostgresGonStore(runner, { maxTransactionAttempts: 3 });

    let retryableCalls = 0;
    await expect(
      store.runInTransaction(async () => {
        retryableCalls += 1;
        if (retryableCalls < 3) {
          throw Object.assign(new Error("serialization failure"), { code: "40001" });
        }
        return "committed";
      }),
    ).resolves.toBe("committed");
    expect(retryableCalls).toBe(3);

    let terminalCalls = 0;
    await expect(
      store.runInTransaction(async () => {
        terminalCalls += 1;
        throw Object.assign(new Error("unique violation"), { code: "23505" });
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(terminalCalls).toBe(1);
  });
});
