import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export interface GonAuthIdentityPort {
  ensureGoogleUser(input: {
    providerSubject: string;
    email?: string | null;
    displayName?: string | null;
    authUserId?: string | number;
  }): Promise<{ id: string }>;
  findUserIdByAuthUserId(authUserId: string | number): Promise<string | undefined>;
}

export interface CreateGonAuthOptionsInput {
  adapter?: NextAuthConfig["adapter"];
  googleClientId?: string;
  googleClientSecret?: string;
  secret?: string;
  trustHost?: boolean;
  identity: GonAuthIdentityPort;
}

export interface ResolvedAuthEnv {
  googleClientId?: string;
  googleClientSecret?: string;
  googleConfigured: boolean;
  secret?: string;
  secretConfigured: boolean;
  trustHost: boolean;
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveAuthEnv(env: NodeJS.ProcessEnv = process.env): ResolvedAuthEnv {
  const authPair = {
    clientId: nonEmpty(env.AUTH_GOOGLE_ID),
    clientSecret: nonEmpty(env.AUTH_GOOGLE_SECRET),
  };
  const googlePair = {
    clientId: nonEmpty(env.GOOGLE_CLIENT_ID),
    clientSecret: nonEmpty(env.GOOGLE_CLIENT_SECRET),
  };
  const selectedPair = authPair.clientId && authPair.clientSecret
    ? authPair
    : googlePair.clientId && googlePair.clientSecret
      ? googlePair
      : { clientId: undefined, clientSecret: undefined };
  const secret = nonEmpty(env.AUTH_SECRET) ?? nonEmpty(env.NEXTAUTH_SECRET);
  const trustHost = env.AUTH_TRUST_HOST === undefined
    // Production must opt in only after P06 proves the edge proxy overwrites
    // forwarded Host/proto headers. Auth.js treats trusted hosts as
    // deployment input, not user input to accept unconditionally.
    ? env.NODE_ENV !== "production"
    : ["1", "true", "yes", "on"].includes(env.AUTH_TRUST_HOST.trim().toLocaleLowerCase());

  return {
    ...(selectedPair.clientId ? { googleClientId: selectedPair.clientId } : {}),
    ...(selectedPair.clientSecret ? { googleClientSecret: selectedPair.clientSecret } : {}),
    googleConfigured: Boolean(selectedPair.clientId && selectedPair.clientSecret),
    ...(secret ? { secret } : {}),
    secretConfigured: Boolean(secret),
    trustHost,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function isVerifiedGoogleProfile(profile: unknown): boolean {
  const record = recordValue(profile);
  return (
    typeof record.email === "string" &&
    record.email.trim().length > 0 &&
    record.email_verified === true
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function createGonAuthOptions(input: CreateGonAuthOptionsInput): NextAuthConfig {
  const googleConfigured = Boolean(input.googleClientId && input.googleClientSecret);
  const provisionGoogleIdentity = async (value: {
    authUserId?: string | number | null;
    providerSubject?: string | null;
    email?: string | null;
    displayName?: string | null;
  }): Promise<string | undefined> => {
    if (!value.providerSubject) return undefined;
    const user = await input.identity.ensureGoogleUser({
      providerSubject: value.providerSubject,
      email: value.email,
      displayName: value.displayName,
      authUserId: value.authUserId === undefined || value.authUserId === null
        ? undefined
        : String(value.authUserId),
    });
    return user.id;
  };

  return {
    ...(input.adapter ? { adapter: input.adapter } : {}),
    ...(input.secret ? { secret: input.secret } : {}),
    trustHost: input.trustHost,
    session: {
      // P03 requires revocable database sessions for production. JWT is only
      // a local fallback when no Auth.js PostgreSQL adapter is configured.
      strategy: input.adapter ? "database" : "jwt",
      maxAge: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    providers: googleConfigured
      ? [
          Google({
            clientId: input.googleClientId!,
            clientSecret: input.googleClientSecret!,
          }),
        ]
      : [],
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google" || !account.providerAccountId) return false;
        // Do not provision the GON domain identity here. On a first OAuth
        // login Auth.js invokes signIn before the adapter creates the Auth
        // database user, so `user.id` can still be the Google subject rather
        // than the future Auth.js user ID. The signIn event below runs after
        // handleLoginOrRegister and receives the persisted user.
        return isVerifiedGoogleProfile(profile);
      },
      async jwt({ token, user, account, profile }) {
        if (user && account?.provider === "google" && account.providerAccountId) {
          const profileRecord = recordValue(profile);
          token.gonUserId = await provisionGoogleIdentity({
            authUserId: user.id,
            providerSubject: account.providerAccountId,
            email: stringValue(profileRecord.email) ?? user.email,
            displayName: stringValue(profileRecord.name) ?? user.name,
          });
          return token;
        }
        if (typeof token.gonUserId === "string") return token;
        const authUserId = user?.id === undefined || user?.id === null ? token.sub : String(user.id);
        if (authUserId) {
          token.gonUserId = await input.identity.findUserIdByAuthUserId(authUserId);
        }
        return token;
      },
      async session({ session, user, token }) {
        let gonUserId: string | undefined;
        if (typeof user?.gonUserId === "string") gonUserId = user.gonUserId;
        if (!gonUserId && typeof token?.gonUserId === "string") gonUserId = token.gonUserId;
        if (!gonUserId && user?.id !== undefined && user?.id !== null) {
          gonUserId = await input.identity.findUserIdByAuthUserId(String(user.id));
        }
        if (!gonUserId && typeof token?.sub === "string") {
          gonUserId = await input.identity.findUserIdByAuthUserId(token.sub);
        }

        const sourceUser = user ?? session.user;
        // Return an allow-listed session shape. In database strategy Auth.js
        // passes persisted session fields (including sessionToken and userId)
        // into this callback; echoing the original object would expose the
        // HttpOnly session token to browser JavaScript at /api/auth/session.
        return {
          expires: session.expires,
          user: {
            name: sourceUser?.name,
            email: sourceUser?.email,
            image: sourceUser?.image,
            gonUserId,
          },
        };
      },
    },
    events: {
      async signIn({ user, account, profile }) {
        if (account?.provider !== "google" || !account.providerAccountId) return;
        const profileRecord = recordValue(profile);
        await provisionGoogleIdentity({
          authUserId: user.id,
          providerSubject: account.providerAccountId,
          email: stringValue(profileRecord.email) ?? user.email,
          displayName: stringValue(profileRecord.name) ?? user.name,
        });
      },
    },
  };
}
