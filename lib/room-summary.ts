import { prisma } from "./prisma";
import {
  type RoomSummary,
  sortRoomSummaries
} from "./room-summary-types";
import { loadMemberUnreadCounts, memberKey } from "./unread-counts";

const roomSummarySelect = {
  id: true,
  name: true,
  slug: true,
  updatedAt: true,
  messages: {
    orderBy: { sequence: "desc" as const },
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
  const [memberships, unreadCounts] = await Promise.all([
    prisma.roomMember.findMany({
      where: { userId },
      select: {
        room: { select: roomSummarySelect }
      }
    }),
    loadMemberUnreadCounts({ userId })
  ]);

  return sortRoomSummaries(
    memberships.map((membership) => {
      const counts = unreadCounts.get(memberKey(membership.room.id, userId));
      return serializeRoomSummary(
        membership.room,
        counts?.unreadCount || 0,
        counts?.mentionCount || 0
      );
    })
  );
}

export async function getRoomSummaryWithMemberIds(roomId: string) {
  const [room, unreadCounts] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      select: {
        ...roomSummarySelect,
        members: {
          select: {
            userId: true
          }
        }
      }
    }),
    loadMemberUnreadCounts({ roomId })
  ]);

  if (!room) {
    return null;
  }

  return {
    summaries: room.members.map((member) => {
      const counts = unreadCounts.get(memberKey(room.id, member.userId));

      return {
        summary: serializeRoomSummary(
          room,
          counts?.unreadCount || 0,
          counts?.mentionCount || 0
        ),
        userId: member.userId
      };
    })
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
