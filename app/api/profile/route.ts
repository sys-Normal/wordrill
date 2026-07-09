import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { getSessionUser } from "../../../lib/session-user";

export async function GET() {
  const session = await auth();
  const user = await getSessionUser(session);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const sessionUser = await getSessionUser(session);

  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { nickname?: unknown };
  const nickname = normalizeNickname(body.nickname);

  if (!nickname) {
    return NextResponse.json({ error: "Nickname is required" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: sessionUser.id },
    data: { nickname },
    select: {
      email: true,
      id: true,
      image: true,
      name: true,
      nickname: true
    }
  });

  return NextResponse.json({ user });
}

function normalizeNickname(value: unknown) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  return nickname.slice(0, 24);
}
