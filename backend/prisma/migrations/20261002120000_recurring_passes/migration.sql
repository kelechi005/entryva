-- CreateEnum
CREATE TYPE "RecurringPassStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RecurringPassRole" AS ENUM ('HOUSE_HELP', 'DRIVER', 'CLEANER', 'DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "RecurringPassExceptionType" AS ENUM ('SKIP', 'EXTRA');

-- CreateEnum
CREATE TYPE "RecurringScanDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "RecurringScanResult" AS ENUM ('ALLOWED', 'DENIED');

-- CreateTable
CREATE TABLE "RecurringPass" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "RecurringPassRole" NOT NULL,
    "photoUrl" TEXT,
    "days" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "RecurringPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "tokenHash" TEXT NOT NULL,
    "linkedDeviceHash" TEXT,
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPassException" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "RecurringPassExceptionType" NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringPassException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPassScan" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "officerUserId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "RecurringScanDirection",
    "result" "RecurringScanResult" NOT NULL,
    "reason" TEXT,

    CONSTRAINT "RecurringPassScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstateBlockedPerson" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstateBlockedPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPass_tokenHash_key" ON "RecurringPass"("tokenHash");

-- CreateIndex
CREATE INDEX "RecurringPass_estateId_status_idx" ON "RecurringPass"("estateId", "status");

-- CreateIndex
CREATE INDEX "RecurringPass_residentId_idx" ON "RecurringPass"("residentId");

-- CreateIndex
CREATE INDEX "RecurringPass_apartmentId_status_idx" ON "RecurringPass"("apartmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPassException_passId_date_key" ON "RecurringPassException"("passId", "date");

-- CreateIndex
CREATE INDEX "RecurringPassScan_passId_scannedAt_idx" ON "RecurringPassScan"("passId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstateBlockedPerson_estateId_phone_key" ON "EstateBlockedPerson"("estateId", "phone");

-- CreateIndex
CREATE INDEX "EstateBlockedPerson_estateId_idx" ON "EstateBlockedPerson"("estateId");

-- AddForeignKey
ALTER TABLE "RecurringPassException" ADD CONSTRAINT "RecurringPassException_passId_fkey" FOREIGN KEY ("passId") REFERENCES "RecurringPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPassScan" ADD CONSTRAINT "RecurringPassScan_passId_fkey" FOREIGN KEY ("passId") REFERENCES "RecurringPass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The scan log can never be edited or deleted, even by a bug in the app.
CREATE OR REPLACE FUNCTION recurring_pass_scan_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RecurringPassScan rows cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recurring_pass_scan_append_only
BEFORE UPDATE OR DELETE ON "RecurringPassScan"
FOR EACH ROW EXECUTE FUNCTION recurring_pass_scan_is_append_only();
