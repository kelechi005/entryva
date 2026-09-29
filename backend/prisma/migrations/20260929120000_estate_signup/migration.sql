-- CreateEnum
CREATE TYPE "PendingSignupStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;

-- AlterTable
ALTER TABLE "Estate" ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "contactPhone" TEXT;

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "adminPhone" TEXT,
    "estateName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "PendingSignupStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_tokenHash_key" ON "PendingSignup"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingSignup_email_status_idx" ON "PendingSignup"("email", "status");

-- CreateIndex
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");
