ALTER TABLE "RoomMember"
ADD COLUMN "lastReadSequence" BIGINT;

UPDATE "RoomMember" rm
SET "lastReadSequence" = history."sequence"
FROM (
  SELECT
    member."id" AS "memberId",
    MAX(message."sequence") AS "sequence"
  FROM "RoomMember" member
  JOIN "Message" message
    ON message."roomId" = member."roomId"
   AND member."lastReadAt" IS NOT NULL
   AND message."createdAt" <= member."lastReadAt"
  GROUP BY member."id"
) history
WHERE rm."id" = history."memberId";
