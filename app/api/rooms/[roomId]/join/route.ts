import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { authorizeRoomAction } from "../../../../../lib/room-authorization";
import { prisma } from "../../../../../lib/prisma";
import { emitRoomListUpdate } from "../../../../../lib/room-list-events";
import { getSessionUser } from "../../../../../lib/session-user";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  const user = await getSessionUser(session);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await context.params;
  const authorization = await authorizeRoomAction({
    action: "join",
    roomId,
    userId: user.id
  });

  if (!authorization.ok && authorization.code === "ROOM_NOT_FOUND") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (!authorization.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { room } = authorization;

  await prisma.roomMember.upsert({
    where: {
      userId_roomId: {
        roomId: room.id,
        userId: user.id
      }
    },
    update: {},
    create: {
      roomId: room.id,
      userId: user.id,
      lastReadAt: new Date()
    }
  });
  await emitRoomListUpdate(room.id);

  return NextResponse.json({ room });
}
