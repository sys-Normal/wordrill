import { prisma } from "./prisma";
import {
  type RoomSummary,
  sortRoomSummaries
} from "./room-summary-types";

const roomSummarySelect = {
  id: true,
  name: true,
  slug: true,
  updatedAt: true,
  messages: {
    orderBy: { createdAt: "desc" as const },
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
};

export async function listRoomSummaries(userId: string) {
  const memberships = await prisma.roomMember.findMany({
    where: { userId },
    select: {
      createdAt: true,
      lastReadAt: true,
      room: { select: roomSummarySelect }
    }
  });

  return sortRoomSummaries(
    await Promise.all(memberships.map(async (membership) => {
      const unreadInput = {
        joinedAt: membership.createdAt,
        lastReadAt: membership.lastReadAt,
        roomId: membership.room.id,
        userId
      };
      const [unreadCount, mentionCount] = await Promise.all([
        countUnreadRoomMessages(unreadInput),
        countUnreadRoomMentions(unreadInput)
      ]);

      return serializeRoomSummary(membership.room, unreadCount, mentionCount);
    }))
  );
}

export async function getRoomSummaryWithMemberIds(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      ...roomSummarySelect,
      members: {
        select: {
          createdAt: true,
          lastReadAt: true,
          userId: true
        }
      }
    }
  });

  if (!room) {
    return null;
  }

  return {
    summaries: await Promise.all(room.members.map(async (member) => {
      const unreadInput = {
        joinedAt: member.createdAt,
        lastReadAt: member.lastReadAt,
        roomId: room.id,
        userId: member.userId
      };
      const [unreadCount, mentionCount] = await Promise.all([
        countUnreadRoomMessages(unreadInput),
        countUnreadRoomMentions(unreadInput)
      ]);

      return {
        summary: serializeRoomSummary(room, unreadCount, mentionCount),
        userId: member.userId
      };
    }))
  };
}

function serializeRoomSummary(room: {
  id: string;
  name: string;
  slug: string;
  updatedAt: Date;
  messages: Array<{
    createdAt: Date;
    nickname: string;
    text: string;
  }>;
  _count: { messages: number };
}, unreadCount: number, mentionCount: number): RoomSummary {
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
    mentionCount,
    name: room.name,
    slug: room.slug,
    unreadCount,
    updatedAt: room.updatedAt.toISOString()
  };
}

function countUnreadRoomMentions({
  joinedAt,
  lastReadAt,
  roomId,
  userId
}: {
  joinedAt: Date;
  lastReadAt: Date | null;
  roomId: string;
  userId: string;
}) {
  const unreadAfter = lastReadAt && lastReadAt > joinedAt ? lastReadAt : joinedAt;

  return prisma.messageMention.count({
    where: {
      mentionedUserId: userId,
      message: {
        roomId,
        createdAt: { gt: unreadAfter }
      }
    }
  });
}

function countUnreadRoomMessages({
  joinedAt,
  lastReadAt,
  roomId,
  userId
}: {
  joinedAt: Date;
  lastReadAt: Date | null;
  roomId: string;
  userId: string;
}) {
  const unreadAfter = lastReadAt && lastReadAt > joinedAt ? lastReadAt : joinedAt;

  return prisma.message.count({
    where: {
      roomId,
      userId: { not: userId },
      createdAt: { gt: unreadAfter }
    }
  });
}
