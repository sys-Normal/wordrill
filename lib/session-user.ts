import type { Session } from "next-auth";
import { prisma } from "./prisma";

export function getSessionUser(session: Session | null) {
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        id: true,
        image: true,
        name: true,
        nickname: true
      }
    });
  }

  if (email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        id: true,
        image: true,
        name: true,
        nickname: true
      }
    });
  }

  return null;
}
