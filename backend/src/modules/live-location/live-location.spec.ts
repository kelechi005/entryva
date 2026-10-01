import { GoneException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { getLiveForResident, markLiveArrived, saveLivePosition, stopLiveSharing } from './live-location';

jest.mock('../../common/crypto/token.util', () => ({ hashSecret: (s: string) => `h:${s}` }));

const future = () => new Date(Date.now() + 60 * 60 * 1000);
const past = () => new Date(Date.now() - 60 * 60 * 1000);

function fakePrisma(overrides: { invitation?: object | null; estate?: object | null } = {}) {
  const invitation = {
    findUnique: jest.fn().mockResolvedValue(
      overrides.invitation === undefined ? { id: 'inv1', status: 'ACTIVE', validUntil: future() } : overrides.invitation,
    ),
    findFirst: jest.fn().mockResolvedValue(overrides.invitation === undefined ? null : overrides.invitation),
    update: jest.fn().mockResolvedValue({}),
  };
  const estate = {
    findUnique: jest.fn().mockResolvedValue(
      overrides.estate === undefined
        ? { mainGateName: 'Main Gate', mainGateLatitude: 9.06, mainGateLongitude: 7.38 }
        : overrides.estate,
    ),
  };
  return { prisma: { invitation, estate } as unknown as PrismaService, invitation };
}

describe('saveLivePosition', () => {
  it('stores only the latest point for a live invitation', async () => {
    const { prisma, invitation } = fakePrisma();
    await saveLivePosition(prisma, 'tok', { lat: 9.1, lng: 7.4, heading: 90, accuracyM: 12 });

    expect(invitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { secureTokenHash: 'h:tok' } }),
    );
    const call = invitation.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'inv1' });
    expect(call.data).toMatchObject({ liveLat: 9.1, liveLng: 7.4, liveHeading: 90, liveAccuracyM: 12, liveArrivedAt: null });
    expect(call.data.liveUpdatedAt).toBeInstanceOf(Date);
  });

  it('rejects an unknown link', async () => {
    const { prisma } = fakePrisma({ invitation: null });
    await expect(saveLivePosition(prisma, 'nope', { lat: 1, lng: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses and clears when the invitation has expired', async () => {
    const { prisma, invitation } = fakePrisma({ invitation: { id: 'inv1', status: 'ACTIVE', validUntil: past() } });
    await expect(saveLivePosition(prisma, 'tok', { lat: 1, lng: 1 })).rejects.toBeInstanceOf(GoneException);
    expect(invitation.update.mock.calls[0][0].data).toMatchObject({ liveLat: null, liveLng: null });
  });
});

describe('stopLiveSharing / markLiveArrived', () => {
  it('stopping deletes the stored position', async () => {
    const { prisma, invitation } = fakePrisma();
    await stopLiveSharing(prisma, 'tok');
    expect(invitation.update.mock.calls[0][0].data).toMatchObject({ liveLat: null, liveLng: null, liveUpdatedAt: null });
  });

  it('arriving deletes the position and records only the arrival', async () => {
    const { prisma, invitation } = fakePrisma();
    await markLiveArrived(prisma, 'tok');
    const data = invitation.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ liveLat: null, liveLng: null });
    expect(data.liveArrivedAt).toBeInstanceOf(Date);
  });
});

describe('getLiveForResident', () => {
  const stored = (extra: object = {}) => ({
    status: 'ACTIVE',
    validUntil: future(),
    estateId: 'e1',
    liveLat: 9.07,
    liveLng: 7.39,
    liveHeading: 45,
    liveAccuracyM: 10,
    liveUpdatedAt: new Date(Date.now() - 12_000),
    liveArrivedAt: null,
    ...extra,
  });

  it('shows the position, its age and the gate to the inviting resident', async () => {
    const { prisma, invitation } = fakePrisma({ invitation: stored() });
    const result = await getLiveForResident(prisma, 'inv1', 'res1');

    expect(invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv1', residentId: 'res1' } }),
    );
    expect(result.sharing).toBe(true);
    expect(result.position).toMatchObject({ lat: 9.07, lng: 7.39, heading: 45 });
    expect(result.position!.ageSeconds).toBeGreaterThanOrEqual(11);
    expect(result.gate).toEqual({ lat: 9.06, lng: 7.38, name: 'Main Gate' });
  });

  it('hides everything from a resident who did not make the invitation', async () => {
    const { prisma } = fakePrisma({ invitation: null });
    await expect(getLiveForResident(prisma, 'inv1', 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports arrival and no position', async () => {
    const { prisma } = fakePrisma({
      invitation: stored({ liveLat: null, liveLng: null, liveUpdatedAt: null, liveArrivedAt: new Date() }),
    });
    const result = await getLiveForResident(prisma, 'inv1', 'res1');
    expect(result.arrived).toBe(true);
    expect(result.sharing).toBe(false);
    expect(result.position).toBeNull();
  });

  it('deletes a leftover position once the invitation has ended', async () => {
    const { prisma, invitation } = fakePrisma({ invitation: stored({ validUntil: past() }) });
    const result = await getLiveForResident(prisma, 'inv1', 'res1');
    expect(result.sharing).toBe(false);
    expect(result.position).toBeNull();
    expect(invitation.update).toHaveBeenCalledTimes(1);
  });
});
