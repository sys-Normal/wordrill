import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
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

  const memberships = await prisma.roomMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      room: {
        select: {
          id: true,
          name: true,
          slug: true,
          updatedAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            select: {
              createdAt: true,
              nickname: true,
              text: true
            },
            take: 1
          },
          _count: {
            select: { messages: true }
          }
        }
      }
    }
  });

  return NextResponse.json({
    rooms: memberships.map(({ room }) => serializeRoom(room))
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

  const room = await createRoomWithUniqueSlug(name);

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
      userId: user.id
    }
  });

  return NextResponse.json({
    room: {
      id: room.id,
      lastMessage: null,
      messageCount: 0,
      name: room.name,
      slug: room.slug,
      updatedAt: room.updatedAt.toISOString()
    }
  }, { status: 201 });
}

type RoomWithSummary = {
  id: string;
  name: string;
  slug: string;
  updatedAt: Date;
  messages: Array<{
    createdAt: Date;
    nickname: string;
    text: string;
  }>;
  _count: {
    messages: number;
  };
};

function serializeRoom(room: RoomWithSummary) {
  const lastMessage = room.messages[0] || null;

  return {
    id: room.id,
    lastMessage: lastMessage
      ? {
          createdAt: lastMessage.createdAt.toISOString(),
          nickname: lastMessage.nickname,
          text: lastMessage.text
        }
      : null,
    messageCount: room._count.messages,
    name: room.name,
    slug: room.slug,
    updatedAt: room.updatedAt.toISOString()
  };
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
      userId
    }
  });
}

async function createRoomWithUniqueSlug(name: string) {
  const baseSlug = slugify(name);

  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;

    try {
      return await prisma.room.create({
        data: {
          name,
          slug
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
      slug: `${baseSlug}-${Date.now().toString(36)}`
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
