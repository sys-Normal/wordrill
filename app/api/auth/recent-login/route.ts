import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";
import {
  createRecentLoginPreset,
  RECENT_LOGIN_COOKIE_PREFIX,
  RECENT_LOGIN_MAX_AGE,
  verifyRecentLoginToken
} from "../../../../lib/recent-login";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieEntries = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(RECENT_LOGIN_COOKIE_PREFIX))
    .map((part) => {
      const separator = part.indexOf("=");
      return {
        name: part.slice(0, separator),
        value: decodeURIComponent(part.slice(separator + 1))
      };
    });

  const verified = cookieEntries
    .map((cookie) => ({ cookie, payload: verifyRecentLoginToken(cookie.value) }))
    .filter((entry) => entry.payload !== null);
  const users = verified.length
    ? await prisma.user.findMany({
        where: { id: { in: verified.map((entry) => entry.payload!.sub) } },
        select: { id: true, loginId: true, name: true, nickname: true, email: true }
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const presets = verified.flatMap(({ payload }) => {
    const user = usersById.get(payload!.sub);

    if (!user) {
      return [];
    }

    return [{
      id: payload!.presetId,
      label: user.nickname || user.loginId || user.name || user.email || "최근 계정"
    }];
  });
  const response = NextResponse.json({ presets });

  for (const { name } of cookieEntries) {
    if (!verified.some((entry) => entry.cookie.name === name)) {
      response.cookies.delete(name);
    }
  }

  return response;
}

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const preset = createRecentLoginPreset(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(preset.cookieName, preset.token, {
    httpOnly: true,
    maxAge: RECENT_LOGIN_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const presetId = typeof body?.presetId === "string" ? body.presetId : "";

  if (!/^[a-f0-9]{16}$/.test(presetId)) {
    return NextResponse.json({ error: "Invalid preset" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(`${RECENT_LOGIN_COOKIE_PREFIX}${presetId}`);

  return response;
}
