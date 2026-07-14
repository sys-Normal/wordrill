import { prisma } from "./prisma";

export type RoomAction = "join" | "read" | "write";

type RoomAuthorizationFailure = {
  code: "FORBIDDEN" | "ROOM_NOT_FOUND";
  ok: false;
};

type RoomAuthorizationSuccess = {
  membership: {
    createdAt: Date;
    lastReadAt: Date | null;
    lastReadSequence: bigint | null;
  } | null;
  ok: true;
  room: {
    id: string;
    name: string;
    slug: string;
  };
};

export type RoomAuthorizationResult =
  | RoomAuthorizationFailure
  | RoomAuthorizationSuccess;

export async function authorizeRoomAction({
  action,
  roomId,
  userId
}: {
  action: RoomAction;
  roomId: string;
  userId: string;
}): Promise<RoomAuthorizationResult> {
  const room = await prisma.room.findFirst({
    where: {
      OR: [
        { id: roomId },
        { slug: roomId }
      ]
    },
    select: {
      id: true,
      name: true,
      slug: true,
      members: {
        where: { userId },
        select: {
          createdAt: true,
          lastReadAt: true,
          lastReadSequence: true
        },
        take: 1
      }
    }
  });

  if (!room) {
    return { code: "ROOM_NOT_FOUND", ok: false };
  }

  const membership = room.members[0] || null;

  // All authenticated members may currently join member rooms. Future room
  // types can extend this branch without duplicating policy in HTTP and Socket.IO.
  if (action !== "join" && !membership) {
    return { code: "FORBIDDEN", ok: false };
  }

  return {
    membership,
    ok: true,
    room: {
      id: room.id,
      name: room.name,
      slug: room.slug
    }
  };
}
