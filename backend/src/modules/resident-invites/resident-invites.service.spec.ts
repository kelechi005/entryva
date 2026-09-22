import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { ResidentInvitesService } from './resident-invites.service';
import type { AuthenticatedUser } from '../auth/auth.types';

function estateAdmin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: 'admin-1',
    role: 'ESTATE_ADMIN',
    displayName: 'Ada Admin',
    estateId: 'estate-1',
    ...overrides,
  };
}

describe('ResidentInvitesService', () => {
  let prisma: any;
  let authService: any;
  let auditLogs: any;
  let email: any;
  let service: ResidentInvitesService;

  const apartment = {
    id: 'apt-1',
    estateId: 'estate-1',
    flatNumber: 'B-204',
    status: 'VACANT',
    building: { id: 'building-1', name: 'Block B' },
  };

  beforeEach(() => {
    prisma = {
      apartment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      residentInvite: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
      },
      residentProfile: { create: jest.fn() },
      estate: { findUnique: jest.fn().mockResolvedValue({ id: 'estate-1', name: 'Sunset Gardens' }) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    authService = { hashPassword: jest.fn().mockResolvedValue('hashed-pw') };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    email = {
      sendResidentInviteEmail: jest.fn().mockResolvedValue('sent'),
      sendResidentInviteCancelledEmail: jest.fn().mockResolvedValue('sent'),
    };
    service = new ResidentInvitesService(prisma, authService, auditLogs, email);
  });

  describe('createInvite', () => {
    it('rejects inviting into an apartment that already has a resident (hard stop, not a warning)', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ ...apartment, status: 'OCCUPIED' });

      await expect(
        service.createInvite(estateAdmin(), undefined, { apartmentId: 'apt-1', email: 'new@example.com' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.residentInvite.create).not.toHaveBeenCalled();
      expect(email.sendResidentInviteEmail).not.toHaveBeenCalled();
    });

    it('rejects an apartment that does not belong to the admin\'s estate', async () => {
      prisma.apartment.findFirst.mockResolvedValue(null);
      await expect(
        service.createInvite(estateAdmin(), undefined, {
          apartmentId: 'apt-in-other-estate',
          email: 'new@example.com',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an email already tied to an existing account', async () => {
      prisma.apartment.findFirst.mockResolvedValue(apartment);
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.createInvite(estateAdmin(), undefined, { apartmentId: 'apt-1', email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.residentInvite.create).not.toHaveBeenCalled();
    });

    it('creates a hashed, expiring invite and emails the resident — never the raw token in the return value', async () => {
      prisma.apartment.findFirst.mockResolvedValue(apartment);
      prisma.residentInvite.create.mockResolvedValue({
        id: 'invite-1',
        email: 'new@example.com',
        apartmentId: 'apt-1',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
      prisma.residentInvite.findUniqueOrThrow.mockResolvedValue({
        id: 'invite-1',
        email: 'new@example.com',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });

      const result = await service.createInvite(estateAdmin(), undefined, {
        apartmentId: 'apt-1',
        email: 'new@example.com',
      });

      const createCall = prisma.residentInvite.create.mock.calls[0][0].data;
      expect(createCall.tokenHash).toBeDefined();
      expect(createCall.email).toBe('new@example.com');
      expect(result).not.toHaveProperty('token');
      expect(email.sendResidentInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@example.com' }),
      );
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESIDENT_INVITE_CREATED' }),
      );
    });

    it('reports emailSent: false and still returns the link when Resend fails', async () => {
      // Real-world case this guards against: the resend/create request
      // returning 201 while the resident never actually got an email,
      // with no way to tell from the response — the admin's only signal
      // was a server-side log line they'd never see.
      prisma.apartment.findFirst.mockResolvedValue(apartment);
      prisma.residentInvite.create.mockResolvedValue({
        id: 'invite-1',
        email: 'new@example.com',
        apartmentId: 'apt-1',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
      email.sendResidentInviteEmail.mockResolvedValue('failed');

      const result = await service.createInvite(estateAdmin(), undefined, {
        apartmentId: 'apt-1',
        email: 'new@example.com',
      });

      expect(result.emailSent).toBe(false);
      expect(result.emailStatus).toBe('failed');
      expect(result.inviteUrl).toEqual(expect.stringContaining('/onboard/'));
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ emailStatus: 'failed' }) }),
      );
    });

    it("reports emailSent: false when RESEND_API_KEY isn't configured — the exact real-world case that motivated emailStatus: a dev/prod deploy with no email provider set up looked identical to a successful send until this distinction existed", async () => {
      prisma.apartment.findFirst.mockResolvedValue(apartment);
      prisma.residentInvite.create.mockResolvedValue({
        id: 'invite-1',
        email: 'new@example.com',
        apartmentId: 'apt-1',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
      email.sendResidentInviteEmail.mockResolvedValue('not_configured');

      const result = await service.createInvite(estateAdmin(), undefined, {
        apartmentId: 'apt-1',
        email: 'new@example.com',
      });

      expect(result.emailSent).toBe(false);
      expect(result.emailStatus).toBe('not_configured');
      expect(result.inviteUrl).toEqual(expect.stringContaining('/onboard/'));
    });

    it('supersedes any existing PENDING invite for the same apartment', async () => {
      prisma.apartment.findFirst.mockResolvedValue(apartment);
      prisma.residentInvite.create.mockResolvedValue({
        id: 'invite-2',
        email: 'new@example.com',
        apartmentId: 'apt-1',
        expiresAt: new Date(),
      });
      prisma.residentInvite.findUniqueOrThrow.mockResolvedValue({
        id: 'invite-2',
        email: 'new@example.com',
        expiresAt: new Date(),
      });

      await service.createInvite(estateAdmin(), undefined, { apartmentId: 'apt-1', email: 'new@example.com' });

      expect(prisma.residentInvite.updateMany).toHaveBeenCalledWith({
        where: { apartmentId: 'apt-1', status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
    });
  });

  describe('resendInvite', () => {
    const existingInvite = {
      id: 'invite-1',
      email: 'resident@example.com',
      status: 'PENDING',
      estateId: 'estate-1',
      apartment: { building: { name: 'Block B' }, flatNumber: 'B-204' },
    };

    it('issues a fresh token and reports success', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(existingInvite);
      prisma.residentInvite.update.mockResolvedValue({
        id: 'invite-1',
        email: 'resident@example.com',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });

      const result = await service.resendInvite(estateAdmin(), undefined, 'invite-1');

      expect(prisma.residentInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invite-1' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
      expect(result.emailSent).toBe(true);
      expect(result.emailStatus).toBe('sent');
      expect(result.inviteUrl).toEqual(expect.stringContaining('/onboard/'));
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESIDENT_INVITE_RESENT', metadata: { emailStatus: 'sent' } }),
      );
    });

    it('reports emailSent: false — the exact bug this test guards against: a resend that returns 201 while the email silently failed', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(existingInvite);
      prisma.residentInvite.update.mockResolvedValue({
        id: 'invite-1',
        email: 'resident@example.com',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
      email.sendResidentInviteEmail.mockResolvedValue('failed');

      const result = await service.resendInvite(estateAdmin(), undefined, 'invite-1');

      expect(result.emailSent).toBe(false);
      expect(result.emailStatus).toBe('failed');
      expect(result.inviteUrl).toEqual(expect.stringContaining('/onboard/'));
    });

    it('rejects resending an already-used invite', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue({ ...existingInvite, status: 'USED' });
      await expect(service.resendInvite(estateAdmin(), undefined, 'invite-1')).rejects.toThrow(ConflictException);
      expect(email.sendResidentInviteEmail).not.toHaveBeenCalled();
    });

    it("404s for an invite outside the admin's estate", async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(null);
      await expect(service.resendInvite(estateAdmin(), undefined, 'invite-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelInvite', () => {
    function pendingInvite(overrides: Record<string, unknown> = {}) {
      return {
        id: 'invite-1',
        estateId: 'estate-1',
        apartmentId: 'apt-1',
        email: 'new@example.com',
        status: 'PENDING',
        apartment: { ...apartment },
        ...overrides,
      };
    }

    it('marks the invite REVOKED and emails the resident (no account exists yet)', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(pendingInvite());

      const result = await service.cancelInvite(estateAdmin(), undefined, 'invite-1', {
        reason: 'Wrong apartment selected',
      });

      expect(prisma.residentInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        data: { status: 'REVOKED' },
      });
      expect(email.sendResidentInviteCancelledEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@example.com', reason: 'Wrong apartment selected' }),
      );
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESIDENT_INVITE_CANCELLED' }),
      );
      expect(result).toEqual({ cancelled: true });
    });

    it('allows cancelling with no reason given', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(pendingInvite());
      await service.cancelInvite(estateAdmin(), undefined, 'invite-1', {});
      expect(email.sendResidentInviteCancelledEmail).toHaveBeenCalledWith(
        expect.objectContaining({ reason: undefined }),
      );
    });

    it('rejects cancelling an invite that has already been used', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(pendingInvite({ status: 'USED' }));
      await expect(service.cancelInvite(estateAdmin(), undefined, 'invite-1', {})).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.residentInvite.update).not.toHaveBeenCalled();
    });

    it('rejects cancelling an invite that was already cancelled', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(pendingInvite({ status: 'REVOKED' }));
      await expect(service.cancelInvite(estateAdmin(), undefined, 'invite-1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects cancelling an invite from a different estate', async () => {
      prisma.residentInvite.findFirst.mockResolvedValue(null);
      await expect(
        service.cancelInvite(estateAdmin(), undefined, 'someone-elses-invite', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('previewByToken / completeInvite — token lifecycle', () => {
    function liveInvite(overrides: Record<string, unknown> = {}) {
      return {
        id: 'invite-1',
        estateId: 'estate-1',
        apartmentId: 'apt-1',
        email: 'new@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        apartment: { ...apartment },
        estate: { id: 'estate-1', name: 'Sunset Gardens' },
        ...overrides,
      };
    }

    it('rejects an unknown token', async () => {
      prisma.residentInvite.findUnique.mockResolvedValue(null);
      await expect(service.previewByToken('nope')).rejects.toThrow(NotFoundException);
    });

    it('rejects (410 Gone) a token that has already been used', async () => {
      prisma.residentInvite.findUnique.mockResolvedValue(liveInvite({ status: 'USED' }));
      await expect(service.previewByToken('used-token')).rejects.toThrow(GoneException);
    });

    it('rejects (410 Gone) an expired token even if still marked PENDING', async () => {
      prisma.residentInvite.findUnique.mockResolvedValue(
        liveInvite({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.previewByToken('expired-token')).rejects.toThrow(GoneException);
    });

    it('does not consume the token on preview — a GET never marks it used', async () => {
      prisma.residentInvite.findUnique.mockResolvedValue(liveInvite());
      await service.previewByToken('valid-token');
      expect(prisma.residentInvite.update).not.toHaveBeenCalled();
    });

    it('completeInvite creates the account, marks the apartment OCCUPIED, and consumes the token', async () => {
      prisma.residentInvite.findUnique.mockResolvedValue(liveInvite());
      prisma.apartment.findUnique.mockResolvedValue({ ...apartment, status: 'VACANT' });
      prisma.user.create.mockResolvedValue({ id: 'user-9' });
      prisma.residentProfile.create.mockResolvedValue({ id: 'resident-9', userId: 'user-9' });

      const result = await service.completeInvite('valid-token', {
        displayName: 'Rita Resident',
        password: 'a-strong-password',
      });

      expect(authService.hashPassword).toHaveBeenCalledWith('a-strong-password');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'new@example.com', role: 'RESIDENT' }) }),
      );
      expect(prisma.apartment.update).toHaveBeenCalledWith({
        where: { id: 'apt-1' },
        data: { status: 'OCCUPIED' },
      });
      expect(prisma.residentInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'invite-1' }, data: expect.objectContaining({ status: 'USED' }) }),
      );
      expect(result).toEqual({ residentId: 'resident-9' });
    });

    it('refuses to complete if the apartment became occupied since the invite was created', async () => {
      prisma.residentInvite.findUnique.mockResolvedValue(liveInvite());
      prisma.apartment.findUnique.mockResolvedValue({ ...apartment, status: 'OCCUPIED' });

      await expect(
        service.completeInvite('valid-token', { displayName: 'Rita', password: 'a-strong-password' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
