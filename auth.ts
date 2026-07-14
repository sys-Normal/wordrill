import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "./lib/prisma";
import { verifyPassword } from "./lib/password";
import {
  readCookieValue,
  RECENT_LOGIN_COOKIE_PREFIX,
  verifyRecentLoginToken
} from "./lib/recent-login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }),
    Credentials({
      name: "Test account",
      credentials: {
        identifier: { label: "Email or ID", type: "text" },
        password: { label: "Password", type: "password" },
        recentAccountId: { label: "Recent account", type: "text" }
      },
      async authorize(credentials, request) {
        const recentAccountId = String(credentials?.recentAccountId || "").trim();

        if (recentAccountId) {
          const cookieName = `${RECENT_LOGIN_COOKIE_PREFIX}${recentAccountId}`;
          const token = readCookieValue(request.headers.get("cookie"), cookieName);
          const payload = verifyRecentLoginToken(token);

          if (!payload || payload.presetId !== recentAccountId) {
            return null;
          }

          const recentUser = await prisma.user.findUnique({
            where: { id: payload.sub }
          });

          if (!recentUser) {
            return null;
          }

          return {
            id: recentUser.id,
            email: recentUser.email,
            image: recentUser.image,
            name: recentUser.name
          };
        }

        const identifier = String(credentials?.identifier || "").trim().toLowerCase();
        const password = String(credentials?.password || "");

        const dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { loginId: identifier }
            ],
            passwordHash: { not: null }
          }
        });

        if (!dbUser || !(await verifyPassword(password, dbUser.passwordHash))) {
          return null;
        }

        return {
          id: dbUser.id,
          email: dbUser.email,
          image: dbUser.image,
          name: dbUser.name
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") {
        return true;
      }

      await upsertGoogleUser({
        email: user.email,
        googleSub: account.providerAccountId,
        image: user.image,
        name: user.name
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        const dbUser = await upsertGoogleUser({
          email: user.email,
          googleSub: account.providerAccountId,
          image: user.image,
          name: user.name
        });

        token.dbUserId = dbUser.id;
      }

      if (account?.provider === "credentials" && user?.id) {
        token.dbUserId = user.id;
      }

      if (!token.dbUserId && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true }
        });

        token.dbUserId = dbUser?.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.dbUserId) {
        session.user.id = token.dbUserId;
      }

      return session;
    }
  },
  trustHost: true
});

type GoogleUserInput = {
  email?: string | null;
  googleSub?: string | null;
  image?: string | null;
  name?: string | null;
};

function upsertGoogleUser({ email, googleSub, image, name }: GoogleUserInput) {
  const data = {
    email,
    googleSub,
    image,
    name
  };

  if (googleSub) {
    return prisma.user.upsert({
      where: { googleSub },
      update: data,
      create: data
    });
  }

  if (email) {
    return prisma.user.upsert({
      where: { email },
      update: data,
      create: data
    });
  }

  throw new Error("Google account did not include an email or subject.");
}
