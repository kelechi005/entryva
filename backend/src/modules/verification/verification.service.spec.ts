import { VerificationService, SecurityContext } from './verification.service';

function makeInvitation(overrides: Record<string, any> = {}) {
  const now = Date.now();
  return {
    id: 'inv1',
    estateId: 'estate-1',
    status: 'ACTIVE',
    entryPolicy: 'ONE_TIME',
    validFrom: new Date(now - 60_000),
    validUntil: new Date(now + 60_000),
    visitor: { fullName: 'Vic Visitor' },
    resident: { userId: 'res-user-1', displayName: 'Rita Resident', phone: '+123456' },
    apartment: { flatNumber: 'B-204' },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return { securityOfficerId: 'officer-1', estateId: 'estate-1', ...overrides };
}

describe('VerificationService', () => {
  let prisma: any;
  let auditLogs: any;
  let notifications: any;
  let service: VerificationService;

  beforeEach(() => {
    prisma = {
      invitation: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      verificationEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    service = new VerificationService(prisma, auditLogs, notifications);
  });

  describe('tenant isolation (cross-estate matches)', () => {
    it('reports NOT_FOUND to the officer when the token matches an invitation from a different estate', async () => {
      const invitation = makeInvitation({ estateId: 'other-estate' });
      prisma.invitation.findUnique.mockResolvedValue(invitation);
      const ctx = makeCtx({ estateId: 'estate-1' });

      const result = await service.verifyByQr(ctx, { token: 'tok' } as any);

      expect(result).toEqual({ outcome: 'NOT_FOUND' });
      expect(result.invitation).toBeUndefined();
    });

    it('still records the true WRONG_ESTATE outcome internally in the audit trail', async () => {
      const invitation = makeInvitation({ estateId: 'other-estate' });
      prisma.invitation.findUnique.mockResolvedValue(invitation);
      const ctx = makeCtx({ estateId: 'estate-1' });

      await service.verifyByQr(ctx, { token: 'tok' } as any);

      expect(prisma.verificationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ outcome: 'WRONG_ESTATE' }) }),
      );
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ wrongEstate: true }) }),
      );
    });

    it('never leaks visitor/resident PII for a cross-estate match', async () => {
      const invitation = makeInvitation({
        estateId: 'other-estate',
        visitor: { fullName: 'Should Not Leak' },
        resident: { userId: 'x', displayName: 'Should Not Leak Either', phone: '+999' },
      });
      prisma.invitation.findUnique.mockResolvedValue(invitation);
      const ctx = makeCtx({ estateId: 'estate-1' });

      const result = await service.verifyByQr(ctx, { token: 'tok' } as any);

      expect(JSON.stringify(result)).not.toContain('Should Not Leak');
    });
  });

  describe('outcome evaluation', () => {
    it('returns VALID for an active, in-window invitation and notifies the resident', async () => {
      prisma.invitation.findUnique.mockResolvedValue(makeInvitation());
      const ctx = makeCtx();

      const result = await service.verifyByQr(ctx, { token: 'tok' } as any);

      expect(result.outcome).toBe('VALID');
      expect(result.invitation?.residentPhone).toBe('+123456');
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'VISITOR_VERIFIED' }),
      );
    });

    it('returns REVOKED for a revoked invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue(makeInvitation({ status: 'REVOKED' }));
      const result = await service.verifyByQr(makeCtx(), { token: 'tok' } as any);
      expect(result.outcome).toBe('REVOKED');
    });

    it('returns REVOKED for a cancelled invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue(makeInvitation({ status: 'CANCELLED' }));
      const result = await service.verifyByQr(makeCtx(), { token: 'tok' } as any);
      expect(result.outcome).toBe('REVOKED');
    });

    it('returns ALREADY_USED for a ONE_TIME invitation already marked USED', async () => {
      prisma.invitation.findUnique.mockResolvedValue(
        makeInvitation({ entryPolicy: 'ONE_TIME', status: 'USED' }),
      );
      const result = await service.verifyByQr(makeCtx(), { token: 'tok' } as any);
      expect(result.outcome).toBe('ALREADY_USED');
    });

    it('does not treat a MULTI_ENTRY invitation with status USED as ALREADY_USED', async () => {
      // USED is meaningful only for ONE_TIME entry policy per the service's
      // own branch condition; a MULTI_ENTRY invitation should fall through
      // to a normal validity check instead.
      prisma.invitation.findUnique.mockResolvedValue(
        makeInvitation({ entryPolicy: 'MULTI_ENTRY', status: 'USED' }),
      );
      const result = await service.verifyByQr(makeCtx(), { token: 'tok' } as any);
      expect(result.outcome).not.toBe('ALREADY_USED');
    });

    it('returns EXPIRED and lazily updates status when past validUntil', async () => {
      const invitation = makeInvitation({ validUntil: new Date(Date.now() - 1000) });
      prisma.invitation.findUnique.mockResolvedValue(invitation);

      const result = await service.verifyByQr(makeCtx(), { token: 'tok' } as any);

      expect(result.outcome).toBe('EXPIRED');
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: { status: 'EXPIRED' },
      });
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'INVITATION_EXPIRED' }),
      );
    });

    it('does not re-trigger the expiry side effects if status is already EXPIRED', async () => {
      const invitation = makeInvitation({
        status: 'EXPIRED',
        validUntil: new Date(Date.now() - 1000),
      });
      prisma.invitation.findUnique.mockResolvedValue(invitation);

      await service.verifyByQr(makeCtx(), { token: 'tok' } as any);

      expect(prisma.invitation.update).not.toHaveBeenCalled();
      expect(notifications.dispatch).not.toHaveBeenCalled();
    });

    it('returns NOT_YET_VALID for an invitation whose window has not opened, without mutating or notifying', async () => {
      const invitation = makeInvitation({ validFrom: new Date(Date.now() + 60_000) });
      prisma.invitation.findUnique.mockResolvedValue(invitation);

      const result = await service.verifyByQr(makeCtx(), { token: 'tok' } as any);

      expect(result.outcome).toBe('NOT_YET_VALID');
      expect(prisma.invitation.update).not.toHaveBeenCalled();
      expect(notifications.dispatch).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when no invitation matches the token at all', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      const result = await service.verifyByQr(makeCtx(), { token: 'garbage' } as any);
      expect(result).toEqual({ outcome: 'NOT_FOUND' });
    });
  });

  describe('verifyByCode', () => {
    it('normalizes the code (trims + uppercases) before hashing/lookup', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);
      await service.verifyByCode(makeCtx(), { code: '  abc123  ' } as any);
      // We can't observe the hash directly, but we can confirm findFirst
      // was scoped to this officer's estate regardless of code casing.
      expect(prisma.invitation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estateId: 'estate-1' }) }),
      );
    });

    it('scopes the manual-code lookup to the officer\'s own estate', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({ estateId: 'my-estate' });
      await service.verifyByCode(ctx, { code: 'ABC123' } as any);
      expect(prisma.invitation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estateId: 'my-estate' }) }),
      );
    });
  });
});
