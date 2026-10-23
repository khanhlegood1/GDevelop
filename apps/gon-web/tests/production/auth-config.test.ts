import { describe, expect, it, vi } from "vitest";
import {
  createGonAuthOptions,
  isVerifiedGoogleProfile,
  resolveAuthEnv,
  type GonAuthIdentityPort,
} from "@/server/auth-config";

function identityPort() {
  const ensureGoogleUser = vi.fn(async (input: {
    providerSubject: string;
    email?: string | null;
    displayName?: string | null;
    authUserId?: string | number;
  }) => ({ id: "usr_google", received: input }));
  const findUserIdByAuthUserId = vi.fn(async (authUserId: string | number) =>
    String(authUserId) === "42" ? "usr_google" : undefined,
  );
  return {
    port: { ensureGoogleUser, findUserIdByAuthUserId } as unknown as GonAuthIdentityPort,
    ensureGoogleUser,
    findUserIdByAuthUserId,
  };
}

function createOptions() {
  const identity = identityPort();
  const options = createGonAuthOptions({
    adapter: {} as never,
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
    secret: "auth-secret",
    trustHost: true,
    identity: identity.port,
  });
  return { options, identity };
}

describe("Auth environment resolution", () => {
  it("selects a coherent Google credential pair and explicit production trust", () => {
    const resolved = resolveAuthEnv({
      NODE_ENV: "production",
      AUTH_GOOGLE_ID: "auth-id-only",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      NEXTAUTH_SECRET: " nextauth-secret ",
      AUTH_TRUST_HOST: "true",
    } as NodeJS.ProcessEnv);
    expect(resolved).toMatchObject({
      googleClientId: "google-id",
      googleClientSecret: "google-secret",
      googleConfigured: true,
      secret: "nextauth-secret",
      secretConfigured: true,
      trustHost: true,
    });
    expect(resolveAuthEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv).trustHost).toBe(false);
  });

  it("requires a verified Google email profile", () => {
    expect(isVerifiedGoogleProfile({ email: "learner@example.com", email_verified: true })).toBe(true);
    expect(isVerifiedGoogleProfile({ email: "learner@example.com", email_verified: false })).toBe(false);
    expect(isVerifiedGoogleProfile({ email_verified: true })).toBe(false);
  });
});

describe("GON Auth.js identity callbacks", () => {
  it("uses a database session strategy when an adapter is wired", () => {
    const { options } = createOptions();
    expect(options.session).toMatchObject({
      strategy: "database",
      maxAge: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    });
    expect(options.providers).toHaveLength(1);
  });

  it("does not provision a domain identity from the pre-persistence signIn callback", async () => {
    const { options, identity } = createOptions();
    const allowed = await options.callbacks!.signIn!({
      user: { id: "google-subject-before-adapter-create", email: "learner@example.com" },
      account: { provider: "google", providerAccountId: "google-subject", type: "oidc" },
      profile: {
        email: "learner@example.com",
        email_verified: true,
        name: "Google Learner",
      },
    } as never);
    expect(allowed).toBe(true);
    expect(identity.ensureGoogleUser).not.toHaveBeenCalled();

    const denied = await options.callbacks!.signIn!({
      user: { id: "google-subject", email: "learner@example.com" },
      account: { provider: "google", providerAccountId: "google-subject", type: "oidc" },
      profile: { email: "learner@example.com", email_verified: false },
    } as never);
    expect(denied).toBe(false);
  });

  it("provisions from the persisted Auth user ID in the signIn event", async () => {
    const { options, identity } = createOptions();
    await options.events!.signIn!({
      user: { id: "42", email: "learner@example.com", name: "Persisted Learner" },
      account: { provider: "google", providerAccountId: "google-subject", type: "oidc" },
      profile: {
        email: "profile@example.com",
        email_verified: true,
        name: "Profile Learner",
      },
      isNewUser: true,
    } as never);
    expect(identity.ensureGoogleUser).toHaveBeenCalledWith({
      providerSubject: "google-subject",
      email: "profile@example.com",
      displayName: "Profile Learner",
      authUserId: "42",
    });
  });

  it("persists the GON user ID through the JWT fallback callback", async () => {
    const { options, identity } = createOptions();
    const token = await options.callbacks!.jwt!({
      token: { sub: "42" },
      user: { id: "42", email: "learner@example.com", name: "JWT Learner" },
      account: { provider: "google", providerAccountId: "google-subject", type: "oidc" },
      profile: { email: "learner@example.com", email_verified: true, name: "JWT Learner" },
      trigger: "signIn",
    } as never);
    expect(token).toMatchObject({ gonUserId: "usr_google" });
    expect(identity.ensureGoogleUser).toHaveBeenCalledOnce();
  });

  it("returns an allow-listed session without exposing the database session token", async () => {
    const { options, identity } = createOptions();
    const session = await options.callbacks!.session!({
      session: {
        expires: "2026-11-22T00:00:00.000Z",
        sessionToken: "must-not-leak",
        userId: "42",
        user: {
          name: "Persisted Learner",
          email: "learner@example.com",
          image: "https://example.test/avatar.png",
        },
      },
      user: {
        id: "42",
        name: "Persisted Learner",
        email: "learner@example.com",
        image: "https://example.test/avatar.png",
        emailVerified: null,
      },
      token: {},
    } as never);
    expect(identity.findUserIdByAuthUserId).toHaveBeenCalledWith("42");
    expect(session).toEqual({
      expires: "2026-11-22T00:00:00.000Z",
      user: {
        name: "Persisted Learner",
        email: "learner@example.com",
        image: "https://example.test/avatar.png",
        gonUserId: "usr_google",
      },
    });
    expect(JSON.stringify(session)).not.toContain("must-not-leak");
    expect(JSON.stringify(session)).not.toContain("sessionToken");
  });
});
