// Live arrival tracking, kept as plain functions so the two controllers that
// need it (the visitor's public link and the resident's screen) share one
// set of rules:
//   - only the LATEST position is stored, never a trail
//   - only while the invitation is still live
//   - cleared when the visitor stops, arrives, or the invitation ends
import { GoneException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { hashSecret } from '../../common/crypto/token.util';

const LIVE_STATUSES = ['ACTIVE', 'PENDING'];

export interface LivePositionInput {
  lat: number;
  lng: number;
  heading?: number | null;
  accuracyM?: number | null;
}

export interface LiveLocationResponse {
  invitationActive: boolean;
  sharing: boolean;
  arrived: boolean;
  arrivedAt: string | null;
  position: {
    lat: number;
    lng: number;
    heading: number | null;
    accuracyM: number | null;
    updatedAt: string;
    ageSeconds: number;
  } | null;
  gate: { lat: number; lng: number; name: string } | null;
}

const CLEARED_POSITION = {
  liveLat: null,
  liveLng: null,
  liveHeading: null,
  liveAccuracyM: null,
  liveUpdatedAt: null,
};

function isLive(inv: { status: string; validUntil: Date }): boolean {
  return LIVE_STATUSES.includes(inv.status) && inv.validUntil.getTime() > Date.now();
}

async function findByToken(prisma: PrismaService, token: string) {
  const inv = await prisma.invitation.findUnique({
    where: { secureTokenHash: hashSecret(token) },
    select: { id: true, status: true, validUntil: true },
  });
  if (!inv) throw new NotFoundException('Invitation not found.');
  return inv;
}

/** The visitor's phone reports where it is. Latest point only. */
export async function saveLivePosition(prisma: PrismaService, token: string, input: LivePositionInput) {
  const inv = await findByToken(prisma, token);
  if (!isLive(inv)) {
    await prisma.invitation.update({ where: { id: inv.id }, data: CLEARED_POSITION });
    throw new GoneException('This invitation is no longer active.');
  }
  await prisma.invitation.update({
    where: { id: inv.id },
    data: {
      liveLat: input.lat,
      liveLng: input.lng,
      liveHeading: input.heading ?? null,
      liveAccuracyM: input.accuracyM ?? null,
      liveUpdatedAt: new Date(),
      liveArrivedAt: null,
    },
  });
  return { ok: true };
}

/** The visitor stops sharing: the stored position is deleted. */
export async function stopLiveSharing(prisma: PrismaService, token: string) {
  const inv = await findByToken(prisma, token);
  await prisma.invitation.update({ where: { id: inv.id }, data: CLEARED_POSITION });
  return { ok: true };
}

/** The visitor reached the gate: delete the position, remember only that they arrived. */
export async function markLiveArrived(prisma: PrismaService, token: string) {
  const inv = await findByToken(prisma, token);
  await prisma.invitation.update({
    where: { id: inv.id },
    data: isLive(inv) ? { ...CLEARED_POSITION, liveArrivedAt: new Date() } : CLEARED_POSITION,
  });
  return { ok: true };
}

/** What the resident's screen shows. Only the resident who made the invitation. */
export async function getLiveForResident(
  prisma: PrismaService,
  invitationId: string,
  residentId: string,
): Promise<LiveLocationResponse> {
  const inv = await prisma.invitation.findFirst({
    where: { id: invitationId, residentId },
    select: {
      status: true,
      validUntil: true,
      estateId: true,
      liveLat: true,
      liveLng: true,
      liveHeading: true,
      liveAccuracyM: true,
      liveUpdatedAt: true,
      liveArrivedAt: true,
    },
  });
  if (!inv) throw new NotFoundException('Invitation not found.');

  const live = isLive(inv);
  const hasStoredPosition = inv.liveLat !== null && inv.liveLng !== null && inv.liveUpdatedAt !== null;

  // The invitation ended while a position was still stored: delete it now.
  if (!live && hasStoredPosition) {
    await prisma.invitation.update({ where: { id: invitationId }, data: CLEARED_POSITION });
  }

  const estate = await prisma.estate.findUnique({
    where: { id: inv.estateId },
    select: { mainGateName: true, mainGateLatitude: true, mainGateLongitude: true },
  });
  const gate =
    estate && estate.mainGateLatitude !== null && estate.mainGateLongitude !== null
      ? { lat: estate.mainGateLatitude, lng: estate.mainGateLongitude, name: estate.mainGateName ?? 'Main gate' }
      : null;

  const arrived = inv.liveArrivedAt !== null;
  const showPosition = live && hasStoredPosition && !arrived;

  return {
    invitationActive: live,
    sharing: showPosition,
    arrived,
    arrivedAt: inv.liveArrivedAt ? inv.liveArrivedAt.toISOString() : null,
    position: showPosition
      ? {
          lat: inv.liveLat as number,
          lng: inv.liveLng as number,
          heading: inv.liveHeading,
          accuracyM: inv.liveAccuracyM,
          updatedAt: (inv.liveUpdatedAt as Date).toISOString(),
          ageSeconds: Math.max(0, Math.round((Date.now() - (inv.liveUpdatedAt as Date).getTime()) / 1000)),
        }
      : null,
    gate,
  };
}
