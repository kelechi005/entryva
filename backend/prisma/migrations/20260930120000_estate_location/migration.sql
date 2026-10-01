-- Estate location + main entrance for visitor navigation.
-- All columns are nullable (or defaulted) so existing estates are untouched.
ALTER TABLE "Estate" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Estate" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Estate" ADD COLUMN "mainGateName" TEXT;
ALTER TABLE "Estate" ADD COLUMN "mainGateLatitude" DOUBLE PRECISION;
ALTER TABLE "Estate" ADD COLUMN "mainGateLongitude" DOUBLE PRECISION;
ALTER TABLE "Estate" ADD COLUMN "entranceInstructions" TEXT;
ALTER TABLE "Estate" ADD COLUMN "arrivalRadiusMeters" INTEGER NOT NULL DEFAULT 100;
