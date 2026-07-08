import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    dbUserId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    dbUserId?: string;
  }
}

export {};
