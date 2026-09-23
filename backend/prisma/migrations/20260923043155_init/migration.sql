-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ESTATE_ADMIN', 'RESIDENT', 'SECURITY_OFFICER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'REMOVED');

-- CreateEnum
CREATE TYPE "EstateStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ApartmentStatus" AS ENUM ('OCCUPIED', 'VACANT');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACTIVE', 'USED', 'EXPIRED', 'REVOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResidentInviteStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EntryPolicy" AS ENUM ('ONE_TIME', 'MULTI_ENTRY');

-- CreateEnum
CREATE TYPE "EntryExitType" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VALID', 'EXPIRED', 'NOT_YET_VALID', 'REVOKED', 'ALREADY_USED', 'WRONG_ESTATE', 'NOT_FOUND', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "OfflineSyncStatus" AS ENUM ('SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "externalAuthId" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "refreshTokenHash" TEXT,
    "adminEstateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "logoUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "EstateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "flatNumber" TEXT NOT NULL,
    "status" "ApartmentStatus" NOT NULL DEFAULT 'VACANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentInvite" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ResidentInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityOfficerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityOfficerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "secureTokenHash" TEXT NOT NULL,
    "displayCodeHash" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "entryPolicy" "EntryPolicy" NOT NULL DEFAULT 'ONE_TIME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationEvent" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT,
    "securityOfficerId" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "method" TEXT NOT NULL,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3),
    "exitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryExitEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "securityOfficerId" TEXT NOT NULL,
    "type" "EntryExitType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryExitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "estateId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncEvent" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "securityOfficerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OfflineSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "errorMessage" TEXT,
    "clientEventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalAuthId_key" ON "User"("externalAuthId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Building_estateId_idx" ON "Building"("estateId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_estateId_name_key" ON "Building"("estateId", "name");

-- CreateIndex
CREATE INDEX "Apartment_estateId_idx" ON "Apartment"("estateId");

-- CreateIndex
CREATE INDEX "Apartment_buildingId_idx" ON "Apartment"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_buildingId_flatNumber_key" ON "Apartment"("buildingId", "flatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentProfile_userId_key" ON "ResidentProfile"("userId");

-- CreateIndex
CREATE INDEX "ResidentProfile_estateId_idx" ON "ResidentProfile"("estateId");

-- CreateIndex
CREATE INDEX "ResidentProfile_apartmentId_idx" ON "ResidentProfile"("apartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentInvite_tokenHash_key" ON "ResidentInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ResidentInvite_estateId_idx" ON "ResidentInvite"("estateId");

-- CreateIndex
CREATE INDEX "ResidentInvite_apartmentId_idx" ON "ResidentInvite"("apartmentId");

-- CreateIndex
CREATE INDEX "ResidentInvite_tokenHash_idx" ON "ResidentInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityOfficerProfile_userId_key" ON "SecurityOfficerProfile"("userId");

-- CreateIndex
CREATE INDEX "SecurityOfficerProfile_estateId_idx" ON "SecurityOfficerProfile"("estateId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityOfficerProfile_estateId_employeeCode_key" ON "SecurityOfficerProfile"("estateId", "employeeCode");

-- CreateIndex
CREATE INDEX "Visitor_estateId_idx" ON "Visitor"("estateId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_secureTokenHash_key" ON "Invitation"("secureTokenHash");

-- CreateIndex
CREATE INDEX "Invitation_estateId_idx" ON "Invitation"("estateId");

-- CreateIndex
CREATE INDEX "Invitation_residentId_idx" ON "Invitation"("residentId");

-- CreateIndex
CREATE INDEX "Invitation_apartmentId_idx" ON "Invitation"("apartmentId");

-- CreateIndex
CREATE INDEX "Invitation_status_idx" ON "Invitation"("status");

-- CreateIndex
CREATE INDEX "InvitationEvent_invitationId_idx" ON "InvitationEvent"("invitationId");

-- CreateIndex
CREATE INDEX "VerificationEvent_invitationId_idx" ON "VerificationEvent"("invitationId");

-- CreateIndex
CREATE INDEX "VerificationEvent_securityOfficerId_idx" ON "VerificationEvent"("securityOfficerId");

-- CreateIndex
CREATE INDEX "Visit_invitationId_idx" ON "Visit"("invitationId");

-- CreateIndex
CREATE INDEX "EntryExitEvent_visitId_idx" ON "EntryExitEvent"("visitId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_estateId_idx" ON "AuditLog"("estateId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncEvent_clientEventId_key" ON "OfflineSyncEvent"("clientEventId");

-- CreateIndex
CREATE INDEX "OfflineSyncEvent_deviceId_idx" ON "OfflineSyncEvent"("deviceId");

-- CreateIndex
CREATE INDEX "OfflineSyncEvent_estateId_idx" ON "OfflineSyncEvent"("estateId");

-- CreateIndex
CREATE INDEX "OfflineSyncEvent_securityOfficerId_idx" ON "OfflineSyncEvent"("securityOfficerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminEstateId_fkey" FOREIGN KEY ("adminEstateId") REFERENCES "Estate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentProfile" ADD CONSTRAINT "ResidentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentProfile" ADD CONSTRAINT "ResidentProfile_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentProfile" ADD CONSTRAINT "ResidentProfile_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentInvite" ADD CONSTRAINT "ResidentInvite_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentInvite" ADD CONSTRAINT "ResidentInvite_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentInvite" ADD CONSTRAINT "ResidentInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityOfficerProfile" ADD CONSTRAINT "SecurityOfficerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityOfficerProfile" ADD CONSTRAINT "SecurityOfficerProfile_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "ResidentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationEvent" ADD CONSTRAINT "InvitationEvent_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_securityOfficerId_fkey" FOREIGN KEY ("securityOfficerId") REFERENCES "SecurityOfficerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryExitEvent" ADD CONSTRAINT "EntryExitEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryExitEvent" ADD CONSTRAINT "EntryExitEvent_securityOfficerId_fkey" FOREIGN KEY ("securityOfficerId") REFERENCES "SecurityOfficerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
