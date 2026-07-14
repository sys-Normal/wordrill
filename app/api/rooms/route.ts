import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { emitRoomListUpdate } from "../../../lib/room-list-events";
import { listRoomSummaries } from "../../../lib/room-summary";
import { getSessionUser } from "../../../lib/session-user";

const DEFAULT_ROOM = {
  name: "General",
  slug: "general"
};

export async function GET() {
  const session = await auth();
  const user = await getSessionUser(session);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultRoomMembership(user.id);

  return NextResponse.json({
    rooms: await listRoomSummaries(user.id)
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const user = await getSessionUser(session);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { name?: unknown };
  const name = normalizeRoomName(body.name);

  if (!name) {
    return NextResponse.json({ error: "Room name is required" }, { status: 400 });
  }

  const room = await createRoomWithUniqueSlug(name, user.id);
  await emitRoomListUpdate(room.id);

  return NextResponse.json({
    room: {
      id: room.id,
      lastMessage: null,
      messageCount: 0,
      name: room.name,
      slug: room.slug,
      unreadCount: 0,
      updatedAt: room.updatedAt.toISOString()
    }
  }, { status: 201 });
}

async function ensureDefaultRoomMembership(userId: string) {
  const room = await prisma.room.upsert({
    where: { slug: DEFAULT_ROOM.slug },
    update: {},
    create: DEFAULT_ROOM
  });

  await prisma.roomMember.upsert({
    where: {
      userId_roomId: {
        roomId: room.id,
        userId
      }
    },
    update: {},
    create: {
      roomId: room.id,
      userId,
      lastReadAt: new Date()
    }
  });
}

async function createRoomWithUniqueSlug(name: string, creatorId: string) {
  const baseSlug = slugify(name);

  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;

    try {
      return await prisma.room.create({
        data: {
          name,
          slug,
          members: {
            create: {
              userId: creatorId,
              lastReadAt: new Date()
            }
          }
        }
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  return prisma.room.create({
    data: {
      name,
      slug: `${baseSlug}-${Date.now().toString(36)}`,
      members: {
        create: {
          userId: creatorId,
          lastReadAt: new Date()
        }
      }
    }
  });
}

function normalizeRoomName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || `room-${Date.now().toString(36)}`;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
