import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { SignupService, SIGNUP_LINK_TTL_MS } from './signup.service';
import { hashSecret } from '../../common/crypto/token.util';
import type { StartSignupDto } from './dto/start-signup.dto';

const dto: StartSignupDto = {
  estateName: 'Sunset Gardens',
  address: '12 Palm Avenue',
  city: 'Port Harcourt',
  state: 'Rivers',
  country: 'Nigeria',
  timezone: 'Africa/Lagos',
  adminName: 'Ada Admin',
  email: 'ada@example.com',
  password: 'correct-horse-9',
};

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pending-1',
    email: 'ada@example.com',
    tokenHash: 'hash',
    passwordHash: 'stored-hash',
    adminName: 'Ada Admin',
    adminPhone: null,
    estateName: 'Sunset Gardens',
    address: '12 Palm Avenue',
    city: 'Port Harcourt',
    state: 'Rivers',
    country: 'Nigeria',
    timezone: 'Africa/Lagos',
    contactPhone: null,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe('SignupService', () => {
  let prisma: any;
  let authService: any;
  let auditLogs: any;
  let email: any;
  let service: SignupService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      estate: { create: jest.fn().mockResolvedValue({ id: 'estate-1' }) },
      pendingSignup: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'pending-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    authService = {
      hashPassword: jest.fn().mockResolvedValue('bcrypt-hash'),
      startSession: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    email = { sendSignupVerificationEmail: jest.fn().mockResolvedValue('sent') };
    service = new SignupService(prisma, authService, auditLogs, email);
  });

  describe('startSignup', () => {
    it('stores a pending signup (hash only) and emails a one-time link; creates no estate or user', async () => {
      await service.startSignup(dto);

      const data = prisma.pendingSignup.create.mock.calls[0][0].data;
      expect(data.passwordHash).toBe('bcrypt-hash');
      expect(data).not.toHaveProperty('password');
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + SIGNUP_LINK_TTL_MS - 5_000);

      expect(email.sendSignupVerificationEmail).toHaveBeenCalledTimes(1);
      const { verifyUrl } = email.sendSignupVerificationEmail.mock.calls[0][0];
      const rawToken = verifyUrl.split('/signup/verify/')[1];
      expect(hashSecret(rawToken)).toBe(data.tokenHash);

      expect(prisma.estate.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('does nothing visible for an email that already has an account (no email, no row) but still hashes first', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'someone' });

      await expect(service.startSignup(dto)).resolves.toBeUndefined();

      expect(authService.hashPassword).toHaveBeenCalled();
      expect(prisma.pendingSignup.create).not.toHaveBeenCalled();
      expect(email.sendSignupVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends nothing when the same email re-submits inside the cooldown', async () => {
      prisma.pendingSignup.findFirst.mockResolvedValue(pendingRow());

      await service.startSignup(dto);

      expect(prisma.pendingSignup.create).not.toHaveBeenCalled();
      expect(email.sendSignupVerificationEmail).not.toHaveBeenCalled();
    });

    it('supersedes an older pending signup for the same email', async () => {
      await service.startSignup(dto);

      expect(prisma.pendingSignup.updateMany).toHaveBeenCalledWith({
        where: { email: 'ada@example.com', status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });
    });

    it('does not throw when the email fails to send', async () => {
      email.sendSignupVerificationEmail.mockResolvedValue('failed');
      await expect(service.startSignup(dto)).resolves.toBeUndefined();
    });
  });

  describe('previewByToken', () => {
    it('404s an unknown token', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(null);
      await expect(service.previewByToken('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('410s an expired link', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow({ expiresAt: new Date(Date.now() - 1) }));
      await expect(service.previewByToken('t')).rejects.toBeInstanceOf(GoneException);
    });

    it('410s a superseded link', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow({ status: 'SUPERSEDED' }));
      await expect(service.previewByToken('t')).rejects.toBeInstanceOf(GoneException);
    });

    it('looks the row up by hash and does not consume it', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow());
      const preview = await service.previewByToken('raw-token');

      expect(prisma.pendingSignup.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashSecret('raw-token') },
      });
      expect(preview.estateName).toBe('Sunset Gardens');
      expect(prisma.pendingSignup.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('completeSignup', () => {
    it('creates the estate and an active ESTATE_ADMIN, then signs them in', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow());

      const result = await service.completeSignup('raw-token');

      expect(prisma.estate.create.mock.calls[0][0].data).toMatchObject({
        name: 'Sunset Gardens',
        city: 'Port Harcourt',
        state: 'Rivers',
        country: 'Nigeria',
        timezone: 'Africa/Lagos',
      });
      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        email: 'ada@example.com',
        role: 'ESTATE_ADMIN',
        status: 'ACTIVE',
        adminEstateId: 'estate-1',
        passwordHash: 'stored-hash',
        displayName: 'Ada Admin',
      });
      expect(authService.startSession).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({ userId: 'user-1', estateId: 'estate-1', accessToken: 'a' });
    });

    it('rejects a reused link and creates nothing', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow({ status: 'VERIFIED' }));

      await expect(service.completeSignup('t')).rejects.toBeInstanceOf(GoneException);
      expect(prisma.estate.create).not.toHaveBeenCalled();
    });

    it('loses cleanly when a concurrent request already claimed the link', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow());
      prisma.pendingSignup.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.completeSignup('t')).rejects.toBeInstanceOf(GoneException);
      expect(prisma.estate.create).not.toHaveBeenCalled();
      expect(authService.startSession).not.toHaveBeenCalled();
    });

    it('turns a unique-email collision at activation time into a 409', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow());
      prisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(service.completeSignup('t')).rejects.toBeInstanceOf(ConflictException);
      expect(authService.startSession).not.toHaveBeenCalled();
    });

    it('drops an admin phone that is already on another account instead of failing', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(pendingRow({ adminPhone: '+2348000000000' }));
      prisma.user.findUnique.mockResolvedValue({ id: 'other' });

      await service.completeSignup('t');

      expect(prisma.user.create.mock.calls[0][0].data.phone).toBeNull();
    });
  });
});
