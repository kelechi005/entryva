-- CreateTable
CREATE TABLE "OfficerMessage" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficerMessage_estateId_fromUserId_toUserId_createdAt_idx" ON "OfficerMessage"("estateId", "fromUserId", "toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficerMessage_estateId_toUserId_fromUserId_createdAt_idx" ON "OfficerMessage"("estateId", "toUserId", "fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficerMessage_estateId_toUserId_readAt_idx" ON "OfficerMessage"("estateId", "toUserId", "readAt");

-- AddForeignKey
ALTER TABLE "OfficerMessage" ADD CONSTRAINT "OfficerMessage_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerMessage" ADD CONSTRAINT "OfficerMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerMessage" ADD CONSTRAINT "OfficerMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
