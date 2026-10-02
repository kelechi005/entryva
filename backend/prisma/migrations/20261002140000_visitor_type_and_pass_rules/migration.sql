-- CreateEnum
CREATE TYPE "VisitorType" AS ENUM ('GUEST', 'COURIER');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "visitorType" "VisitorType" NOT NULL DEFAULT 'GUEST';

-- AlterTable
ALTER TABLE "Estate" ADD COLUMN     "passExtendMaxMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "passExtensionsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passMaxTotalMinutes" INTEGER NOT NULL DEFAULT 720,
ADD COLUMN     "passQuietFromMinute" INTEGER,
ADD COLUMN     "passQuietToMinute" INTEGER;
