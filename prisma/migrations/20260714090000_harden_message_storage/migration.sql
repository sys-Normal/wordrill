ALTER TABLE "Message"
ADD COLUMN "clientMessageId" TEXT,
ADD COLUMN "sequence" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "Message_clientMessageId_key"
ON "Message"("clientMessageId");

CREATE UNIQUE INDEX "Message_sequence_key"
ON "Message"("sequence");

CREATE INDEX "Message_roomId_sequence_idx"
ON "Message"("roomId", "sequence");

CREATE INDEX "MessageMention_mentionedUserId_messageId_idx"
ON "MessageMention"("mentionedUserId", "messageId");
