ALTER TABLE "User" ADD COLUMN "loginId" TEXT,
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "isTestUser" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");
