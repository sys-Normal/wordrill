import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type MemberUnreadCounts = {
  mentionCount: number;
  unreadCount: number;
};

type MemberUnreadCountRow = {
  mentionCount?: bigint | number;
  roomId: string;
  unreadCount?: bigint | number;
  userId: string;
};

type MessageUnreadCountRow = {
  messageId: string;
  unreadCount: bigint | number;
};

export async function loadMemberUnreadCounts(filter: {
  roomId?: string;
  userId?: string;
}) {
  if (Boolean(filter.roomId) === Boolean(filter.userId)) {
    throw new Error("Exactly one unread-count filter is required.");
  }

  const where = filter.roomId
    ? Prisma.sql`rm."roomId" = ${filter.roomId}`
    : Prisma.sql`rm."userId" = ${filter.userId}`;

  const [messageRows, mentionRows] = await Promise.all([
    prisma.$queryRaw<MemberUnreadCountRow[]>(Prisma.sql`
      SELECT
        rm."roomId",
        rm."userId",
        COUNT(m."id")::integer AS "unreadCount"
      FROM "RoomMember" rm
      JOIN "Message" m
        ON m."roomId" = rm."roomId"
       AND m."userId" IS DISTINCT FROM rm."userId"
       AND m."createdAt" > rm."createdAt"
       AND (
         (rm."lastReadSequence" IS NOT NULL AND m."sequence" > rm."lastReadSequence")
         OR (
           rm."lastReadSequence" IS NULL
           AND m."createdAt" > CASE
             WHEN rm."lastReadAt" IS NOT NULL AND rm."lastReadAt" > rm."createdAt"
               THEN rm."lastReadAt"
             ELSE rm."createdAt"
           END
         )
       )
      WHERE ${where}
      GROUP BY rm."roomId", rm."userId"
    `),
    prisma.$queryRaw<MemberUnreadCountRow[]>(Prisma.sql`
      SELECT
        rm."roomId",
        rm."userId",
        COUNT(mm."id")::integer AS "mentionCount"
      FROM "RoomMember" rm
      JOIN "MessageMention" mm
        ON mm."mentionedUserId" = rm."userId"
      JOIN "Message" m
       ON m."id" = mm."messageId"
       AND m."roomId" = rm."roomId"
       AND m."createdAt" > rm."createdAt"
       AND (
         (rm."lastReadSequence" IS NOT NULL AND m."sequence" > rm."lastReadSequence")
         OR (
           rm."lastReadSequence" IS NULL
           AND m."createdAt" > CASE
             WHEN rm."lastReadAt" IS NOT NULL AND rm."lastReadAt" > rm."createdAt"
               THEN rm."lastReadAt"
             ELSE rm."createdAt"
           END
         )
       )
      WHERE ${where}
      GROUP BY rm."roomId", rm."userId"
    `)
  ]);

  const counts = new Map<string, MemberUnreadCounts>();

  for (const row of messageRows) {
    counts.set(memberKey(row.roomId, row.userId), {
      mentionCount: 0,
      unreadCount: Number(row.unreadCount || 0)
    });
  }

  for (const row of mentionRows) {
    const key = memberKey(row.roomId, row.userId);
    const current = counts.get(key) || { mentionCount: 0, unreadCount: 0 };
    current.mentionCount = Number(row.mentionCount || 0);
    counts.set(key, current);
  }

  return counts;
}

export async function loadMessageUnreadCounts(messageIds: string[]) {
  if (messageIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await prisma.$queryRaw<MessageUnreadCountRow[]>(Prisma.sql`
    SELECT
      m."id" AS "messageId",
      COUNT(rm."id")::integer AS "unreadCount"
    FROM "Message" m
    LEFT JOIN "RoomMember" rm
      ON rm."roomId" = m."roomId"
     AND rm."userId" IS DISTINCT FROM m."userId"
     AND rm."createdAt" <= m."createdAt"
     AND (
       (rm."lastReadSequence" IS NOT NULL AND rm."lastReadSequence" < m."sequence")
       OR (
         rm."lastReadSequence" IS NULL
         AND (rm."lastReadAt" IS NULL OR rm."lastReadAt" < m."createdAt")
       )
     )
    WHERE m."id" IN (${Prisma.join(messageIds)})
    GROUP BY m."id"
  `);

  return new Map(rows.map((row) => [row.messageId, Number(row.unreadCount)]));
}

export function memberKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}
