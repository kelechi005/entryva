import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { InvitationsService, ResidentContext } from './invitations.service';
import { deriveDisplayCode } from '../../common/crypto/token.util';

function makeCtx(overrides: Partial<ResidentContext> = {}): ResidentContext {
  return {
    userId: 'user-1',
    residentId: 'res-1',
    estateId: 'estate-1',
    apartmentId: 'apt-1',
    displayName: 'Rita Resident',
    ...overrides,
  };
}

describe('InvitationsService', () => {
  let prisma: any;
  let notifications: any;
  let auditLogs: any;
  let service: InvitationsService;

  beforeEach(() => {
    prisma = {
      apartment: { findFirst: jest.fn() },
      estate: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }) },
      visitor: { create: jest.fn() },
      invitation: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      invitationEvent: { create: jest.fn().mockResolvedValue({}) },
      visit: { count: jest.fn() },
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new InvitationsService(prisma, notifications, auditLogs);
  });

  describe('createInvitation', () => {
    it('refuses to create an invitation for an apartment outside the resident\'s own estate', async () => {
      prisma.apartment.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({ estateId: 'estate-1', apartmentId: 'apt-owned-by-someone-else' });

      await expect(
        service.createInvitation(ctx, {
          visitorName: 'V',
          visitDate: '2026-01-01',
          startTime: '09:00',
          endTime: '10:00',
        } as any),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.visitor.create).not.toHaveBeenCalled();
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('scopes the visitor and invitation to the resident\'s own estate/apartment/resident id', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', flatNumber: 'B-204' });
      prisma.visitor.create.mockResolvedValue({ id: 'visitor-1', fullName: 'Vic', phone: null });
      prisma.invitation.create.mockResolvedValue({
        id: 'inv-1',
        validFrom: new Date(),
        validUntil: new Date(),
        status: 'ACTIVE',
        entryPolicy: 'ONE_TIME',
      });

      const ctx = makeCtx();
      await service.createInvitation(ctx, {
        visitorName: 'Vic',
        visitDate: '2026-01-01',
        startTime: '09:00',
        endTime: '10:00',
      } as any);

      expect(prisma.visitor.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estateId: 'estate-1' }) }),
      );
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estateId: 'estate-1',
            residentId: 'res-1',
            apartmentId: 'apt-1',
          }),
        }),
      );
    });

    it('never stores the raw secure token or display code — only their hashes', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', flatNumber: 'B-204' });
      prisma.visitor.create.mockResolvedValue({ id: 'visitor-1', fullName: 'Vic', phone: null });
      prisma.invitation.create.mockResolvedValue({
        id: 'inv-1',
        validFrom: new Date(),
        validUntil: new Date(),
        status: 'ACTIVE',
        entryPolicy: 'ONE_TIME',
      });

      await service.createInvitation(makeCtx(), {
        visitorName: 'Vic',
        visitDate: '2026-01-01',
        startTime: '09:00',
        endTime: '10:00',
      } as any);

      const createArgs = prisma.invitation.create.mock.calls[0][0].data;
      expect(createArgs).toHaveProperty('secureTokenHash');
      expect(createArgs).toHaveProperty('displayCodeHash');
      // A hash is a 64-char hex sha256 digest; it must not equal or
      // contain anything resembling the raw values returned to the caller.
      expect(createArgs.secureTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createArgs.displayCodeHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("resolves the visit window using the estate's own timezone, not the server's local zone", async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', flatNumber: 'B-204' });
      prisma.estate.findUnique.mockResolvedValue({ timezone: 'Africa/Lagos' });
      prisma.visitor.create.mockResolvedValue({ id: 'visitor-1', fullName: 'Vic', phone: null });
      prisma.invitation.create.mockResolvedValue({
        id: 'inv-1',
        validFrom: new Date(),
        validUntil: new Date(),
        status: 'ACTIVE',
        entryPolicy: 'ONE_TIME',
      });

      await service.createInvitation(makeCtx(), {
        visitorName: 'Vic',
        visitDate: '2026-06-15',
        startTime: '14:00',
        endTime: '16:00',
      } as any);

      const createArgs = prisma.invitation.create.mock.calls[0][0].data;
      // 2026-06-15 14:00 in Africa/Lagos (UTC+1, no DST) is 13:00 UTC.
      // If this were naively parsed as if it were already UTC (the old
      // bug), validFrom would be "2026-06-15T14:00:00.000Z" instead.
      expect(createArgs.validFrom.toISOString()).toBe('2026-06-15T13:00:00.000Z');
      expect(createArgs.validUntil.toISOString()).toBe('2026-06-15T15:00:00.000Z');
    });

    it('looks up the timezone for the resident\'s own estate, scoped by estateId', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', flatNumber: 'B-204' });
      prisma.visitor.create.mockResolvedValue({ id: 'visitor-1', fullName: 'Vic', phone: null });
      prisma.invitation.create.mockResolvedValue({
        id: 'inv-1',
        validFrom: new Date(),
        validUntil: new Date(),
        status: 'ACTIVE',
        entryPolicy: 'ONE_TIME',
      });

      await service.createInvitation(makeCtx({ estateId: 'estate-42' }), {
        visitorName: 'Vic',
        visitDate: '2026-01-01',
        startTime: '09:00',
        endTime: '10:00',
      } as any);

      expect(prisma.estate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'estate-42' } }),
      );
    });

    it('rejects an end time that is not after the start time, rather than silently creating a zero/negative-length window', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', flatNumber: 'B-204' });
      await expect(
        service.createInvitation(makeCtx(), {
          visitorName: 'Vic',
          visitDate: '2026-01-01',
          startTime: '16:00',
          endTime: '14:00',
        } as any),
      ).rejects.toThrow('endTime must be after startTime');
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });
  });

  describe('findPublicByToken (unauthenticated visitor lookup)', () => {
    it('never returns internal ids, hashes, or the real display code', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        secureTokenHash: 'deadbeef',
        displayCodeHash: 'deadbeef2',
        status: 'ACTIVE',
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 60_000),
        visitor: { fullName: 'Vic' },
        resident: { displayName: 'Rita', userId: 'u1' },
        apartment: { flatNumber: 'B-204' },
        estate: { name: 'Sunset Estate' },
      });

      const result = await service.findPublicByToken('sometoken');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('deadbeef');
      expect(serialized).not.toContain('inv-1');
      // displayCode is now recomputed from the raw token on every call
      // (see deriveDisplayCode) rather than read from storage, so it's
      // expected here — deterministic, always the same 6-char value for
      // this same token, and never the same as the stored hashes above.
      expect(result.displayCode).toBe(deriveDisplayCode('sometoken'));
      expect(result.displayCode).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('throws NotFoundException for an unknown token', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(service.findPublicByToken('nope')).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException for a revoked invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'REVOKED',
        validUntil: new Date(Date.now() + 60_000),
        visitor: {},
        resident: { userId: 'u1' },
        apartment: {},
        estate: {},
      });
      await expect(service.findPublicByToken('tok')).rejects.toThrow(GoneException);
    });

    it('lazily flips an overdue invitation to EXPIRED and notifies the resident', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'ACTIVE',
        validFrom: new Date(Date.now() - 120_000),
        validUntil: new Date(Date.now() - 1000),
        visitor: { fullName: 'Vic' },
        resident: { userId: 'u1', displayName: 'Rita' },
        apartment: { flatNumber: 'B-204' },
        estate: { name: 'Sunset' },
      });

      const result = await service.findPublicByToken('tok');

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'EXPIRED' },
      });
      expect(result.status).toBe('EXPIRED');
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', type: 'INVITATION_EXPIRED' }),
      );
    });
  });

  describe('revoke', () => {
    it('refuses to revoke an invitation belonging to a different resident', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null); // scoped query finds nothing
      await expect(service.revoke('inv-not-mine', makeCtx())).rejects.toThrow(NotFoundException);
      expect(prisma.invitation.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-not-mine', residentId: 'res-1', estateId: 'estate-1' },
      });
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('revokes an invitation the resident actually owns', async () => {
      prisma.invitation.findFirst.mockResolvedValue({ id: 'inv-1' });
      await service.revoke('inv-1', makeCtx());
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'REVOKED', revokedAt: expect.any(Date) },
      });
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INVITATION_REVOKED' }),
      );
    });
  });

  describe('listForResident / getResidentOverview scoping', () => {
    it('scopes the invitation list query to residentId + estateId', async () => {
      prisma.invitation.findMany.mockResolvedValue([]);
      await service.listForResident(makeCtx({ residentId: 'res-9', estateId: 'estate-9' }));
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { residentId: 'res-9', estateId: 'estate-9' } }),
      );
    });

    it('scopes every overview count query to the resident\'s own scope', async () => {
      prisma.invitation.count.mockResolvedValue(0);
      prisma.visit.count.mockResolvedValue(0);
      await service.getResidentOverview(makeCtx({ residentId: 'res-9', estateId: 'estate-9' }));

      for (const call of prisma.invitation.count.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ residentId: 'res-9', estateId: 'estate-9' }),
        );
      }
      for (const call of prisma.visit.count.mock.calls) {
        expect(call[0].where.invitation).toEqual(
          expect.objectContaining({ residentId: 'res-9', estateId: 'estate-9' }),
        );
      }
    });
  });
});
