import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntryExitService } from './entry-exit.service';
import type { SecurityContext } from '../verification/verification.service';

function makeCtx(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return { securityOfficerId: 'officer-1', estateId: 'estate-1', ...overrides };
}

function makeInvitation(overrides: Record<string, any> = {}) {
  return {
    id: 'inv1',
    estateId: 'estate-1',
    status: 'ACTIVE',
    entryPolicy: 'ONE_TIME',
    validUntil: new Date(Date.now() + 60_000),
    resident: { userId: 'res-user-1' },
    visitor: { fullName: 'Vic Visitor' },
    ...overrides,
  };
}

describe('EntryExitService', () => {
  let prisma: any;
  let tx: any;
  let auditLogs: any;
  let notifications: any;
  let service: EntryExitService;

  beforeEach(() => {
    tx = {
      invitation: { findFirst: jest.fn(), updateMany: jest.fn() },
      visit: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      entryExitEvent: { create: jest.fn().mockResolvedValue({}) },
      invitationEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      visit: { findFirst: jest.fn() },
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    service = new EntryExitService(prisma, auditLogs, notifications);
  });

  describe('tenant isolation', () => {
    it('404s when the invitation does not belong to the officer\'s estate, even with a valid ID', async () => {
      tx.invitation.findFirst.mockResolvedValue(null); // scoped query returns nothing cross-estate
      await expect(
        service.recordEntry(makeCtx({ estateId: 'estate-1' }), {
          invitationId: 'inv-from-other-estate',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(tx.invitation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ estateId: 'estate-1' }),
        }),
      );
    });
  });

  describe('one-time-entry atomic redemption (CLAUDE.md §52)', () => {
    beforeEach(() => {
      tx.visit.findFirst.mockResolvedValue(null);
      tx.visit.create.mockResolvedValue({ id: 'visit1', enteredAt: new Date() });
    });

    it('succeeds and consumes a ONE_TIME invitation via compare-and-swap', async () => {
      tx.invitation.findFirst.mockResolvedValue(makeInvitation({ entryPolicy: 'ONE_TIME' }));
      tx.invitation.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any);

      expect(tx.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv1', status: 'ACTIVE' },
        data: { status: 'USED', usedAt: expect.any(Date) },
      });
      expect(result.visitId).toBe('visit1');
    });

    it('fails cleanly (ConflictException) when the CAS loses a race — invitation already consumed', async () => {
      tx.invitation.findFirst.mockResolvedValue(makeInvitation({ entryPolicy: 'ONE_TIME' }));
      // Simulates a second, concurrent request that already flipped the
      // status away from ACTIVE between the findFirst read and this update.
      tx.invitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any),
      ).rejects.toThrow(ConflictException);

      // Must not have gone on to create a Visit/EntryExitEvent for the loser.
      expect(tx.visit.create).not.toHaveBeenCalled();
    });

    it('does not attempt a CAS at all for a MULTI_ENTRY invitation', async () => {
      tx.invitation.findFirst.mockResolvedValue(makeInvitation({ entryPolicy: 'MULTI_ENTRY' }));

      await service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any);

      expect(tx.invitation.updateMany).not.toHaveBeenCalled();
    });

    it('rejects entry for a revoked invitation', async () => {
      tx.invitation.findFirst.mockResolvedValue(makeInvitation({ status: 'REVOKED' }));
      await expect(
        service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects entry for an expired invitation', async () => {
      tx.invitation.findFirst.mockResolvedValue(
        makeInvitation({ validUntil: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a second entry while the visitor is already recorded as inside', async () => {
      tx.invitation.findFirst.mockResolvedValue(makeInvitation({ entryPolicy: 'MULTI_ENTRY' }));
      tx.visit.findFirst.mockResolvedValue({ id: 'existing-open-visit' });

      await expect(
        service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('notifies the resident on a successful entry', async () => {
      tx.invitation.findFirst.mockResolvedValue(makeInvitation({ entryPolicy: 'MULTI_ENTRY' }));

      await service.recordEntry(makeCtx(), { invitationId: 'inv1' } as any);

      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'res-user-1', type: 'VISITOR_ENTERED' }),
      );
    });
  });

  describe('recordExit', () => {
    it('404s when the visit does not exist within the officer\'s estate', async () => {
      tx.visit.findFirst.mockResolvedValue(null);
      await expect(
        service.recordExit(makeCtx(), { visitId: 'visit1' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects exit for a visit that never had an entry recorded', async () => {
      tx.visit.findFirst.mockResolvedValue({
        id: 'visit1',
        enteredAt: null,
        exitedAt: null,
        invitation: { resident: { userId: 'r1' }, visitor: { fullName: 'V' } },
      });
      await expect(
        service.recordExit(makeCtx(), { visitId: 'visit1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a double exit', async () => {
      tx.visit.findFirst.mockResolvedValue({
        id: 'visit1',
        enteredAt: new Date(),
        exitedAt: new Date(),
        invitation: { resident: { userId: 'r1' }, visitor: { fullName: 'V' } },
      });
      await expect(
        service.recordExit(makeCtx(), { visitId: 'visit1' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('records a valid exit', async () => {
      tx.visit.findFirst.mockResolvedValue({
        id: 'visit1',
        enteredAt: new Date(),
        exitedAt: null,
        invitation: { resident: { userId: 'r1' }, visitor: { fullName: 'V' } },
      });
      tx.visit.update.mockResolvedValue({ id: 'visit1', exitedAt: new Date() });

      const result = await service.recordExit(makeCtx(), { visitId: 'visit1' } as any);

      expect(result.visitId).toBe('visit1');
    });
  });

  describe('denyEntry', () => {
    it('does not mutate the invitation — it is purely an audited decision', async () => {
      prisma.invitation = { findFirst: jest.fn().mockResolvedValue({ id: 'inv1' }) };
      await service.denyEntry(makeCtx(), { invitationId: 'inv1', reason: 'no id' } as any);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ENTRY_DENIED' }),
      );
    });

    it('404s for an invitation outside the officer\'s estate', async () => {
      prisma.invitation = { findFirst: jest.fn().mockResolvedValue(null) };
      await expect(
        service.denyEntry(makeCtx(), { invitationId: 'inv1', reason: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
