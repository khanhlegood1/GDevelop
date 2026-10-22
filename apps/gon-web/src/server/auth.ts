import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getPostgresPool } from "./db";
import { getGonService } from "./runtime";

const pool = getPostgresPool();
const googleClientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
const googleConfigured = Boolean(googleClientId && googleClientSecret);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(pool ? { adapter: PostgresAdapter(pool) } : {}),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    // P03 requires revocable database sessions for production. JWT is only a
    // local fallback when no Auth.js PostgreSQL database is configured.
    strategy: pool ? "database" : "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: googleConfigured
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      ]
    : [],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google" || !account.providerAccountId) return false;
      const service = getGonService();
      service.ensureGoogleUser({
        providerSubject: account.providerAccountId,
        email: typeof profile?.email === "string" ? profile.email : user.email,
        displayName: typeof profile?.name === "string" ? profile.name : user.name,
        authUserId: user.id,
      });
      return true;
    },
    async jwt({ token, user }) {
      const authUserId = user?.id ?? token.sub;
      if (authUserId) {
        token.gonUserId = getGonService().findUserIdByAuthUserId(authUserId);
      }
      return token;
    },
    async session({ session, user, token }) {
      const service = getGonService();
      let gonUserId: string | undefined;
      if (typeof user?.gonUserId === "string") gonUserId = user.gonUserId;
      if (!gonUserId && typeof token?.gonUserId === "string") gonUserId = token.gonUserId;
      if (!gonUserId && typeof user?.id === "string") {
        gonUserId = service.findUserIdByAuthUserId(user.id);
      }
      if (!gonUserId && typeof token?.sub === "string") {
        gonUserId = service.findUserIdByAuthUserId(token.sub);
      }
      if (session.user) session.user.gonUserId = gonUserId;
      return session;
    },
  },
});
