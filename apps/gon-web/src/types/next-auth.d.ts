import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      gonUserId?: string;
    };
  }

  interface User {
    gonUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    gonUserId?: string;
  }
}

export {};
