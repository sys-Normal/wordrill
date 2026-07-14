CREATE TABLE "MessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageMention_messageId_start_end_key"
ON "MessageMention"("messageId", "start", "end");

CREATE INDEX "MessageMention_mentionedUserId_createdAt_idx"
ON "MessageMention"("mentionedUserId", "createdAt");

CREATE INDEX "MessageMention_messageId_idx"
ON "MessageMention"("messageId");

ALTER TABLE "MessageMention"
ADD CONSTRAINT "MessageMention_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageMention"
ADD CONSTRAINT "MessageMention_mentionedUserId_fkey"
FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
