import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import { createGonAuthOptions, resolveAuthEnv } from "./auth-config";
import { getPostgresPool } from "./db";
import { getGonService } from "./runtime";

const pool = getPostgresPool();
const authEnv = resolveAuthEnv();

export const { handlers, auth, signIn, signOut } = NextAuth(
  createGonAuthOptions({
    ...(pool ? { adapter: PostgresAdapter(pool) } : {}),
    ...(authEnv.googleClientId ? { googleClientId: authEnv.googleClientId } : {}),
    ...(authEnv.googleClientSecret ? { googleClientSecret: authEnv.googleClientSecret } : {}),
    ...(authEnv.secret ? { secret: authEnv.secret } : {}),
    trustHost: authEnv.trustHost,
    identity: {
      ensureGoogleUser: (input) => getGonService().ensureGoogleUser(input),
      findUserIdByAuthUserId: (authUserId) => getGonService().findUserIdByAuthUserId(authUserId),
    },
  }),
);
