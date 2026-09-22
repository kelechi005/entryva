import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'resident@example.com',
    phone: null,
    passwordHash: 'hashed-pw',
    status: 'ACTIVE',
    role: 'RESIDENT',
    adminEstateId: null,
    refreshTokenHash: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: any;
  let jwt: any;
  let auditLogs: any;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      residentProfile: { findUnique: jest.fn() },
      securityOfficerProfile: { findUnique: jest.fn() },
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      decode: jest.fn(),
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma, jwt, auditLogs);
  });

  describe('login', () => {
    it('throws Unauthorized (not a 404/different message) when no account matches', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.login({ identifier: 'nobody@example.com', password: 'x' } as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILED' }),
      );
    });

    it('throws the same UnauthorizedException type for a wrong password as for no account, and does not leak which one it was', async () => {
      const user = makeUser();
      prisma.user.findFirst.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      let noAccountMessage = '';
      let wrongPasswordMessage = '';
      prisma.user.findFirst.mockResolvedValueOnce(null);
      try {
        await service.login({ identifier: 'nobody@example.com', password: 'x' } as any);
      } catch (e: any) {
        noAccountMessage = e.message;
      }
      prisma.user.findFirst.mockResolvedValueOnce(user);
      try {
        await service.login({ identifier: 'resident@example.com', password: 'wrong' } as any);
      } catch (e: any) {
        wrongPasswordMessage = e.message;
      }
      expect(noAccountMessage).toBe(wrongPasswordMessage);
    });

    it('rejects login for a non-ACTIVE account even with the correct password', async () => {
      const user = makeUser({ status: 'SUSPENDED' });
      prisma.user.findFirst.mockResolvedValue(user);
      await expect(
        service.login({ identifier: 'resident@example.com', password: 'x' } as any),
      ).rejects.toThrow('This account is not active.');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('issues a token pair, stores a hash (never the raw refresh token), and logs LOGIN on success', async () => {
      const user = makeUser();
      prisma.user.findFirst.mockResolvedValue(user);
      prisma.residentProfile.findUnique.mockResolvedValue({ estateId: 'estate-1' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        identifier: 'resident@example.com',
        password: 'correct',
      } as any);

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.userId).toBe('user-1');

      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.refreshTokenHash).not.toBe('signed-token');
      expect(typeof updateCall.data.refreshTokenHash).toBe('string');

      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', userId: 'user-1', estateId: 'estate-1' }),
      );
    });

    it('never blocks login if estate resolution fails for a SECURITY_OFFICER without a profile', async () => {
      const user = makeUser({ role: 'SECURITY_OFFICER' });
      prisma.user.findFirst.mockResolvedValue(user);
      prisma.securityOfficerProfile.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        identifier: 'resident@example.com',
        password: 'correct',
      } as any);
      expect(result.userId).toBe('user-1');
    });
  });

  describe('refresh', () => {
    it('rejects when the user has no stored refresh token hash', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ refreshTokenHash: null }));
      await expect(service.refresh('user-1', 'presented-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('detects refresh-token reuse (hash mismatch) and invalidates the session instead of issuing new tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ refreshTokenHash: 'some-other-hash' }),
      );
      await expect(service.refresh('user-1', 'stolen-old-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });

    it('rotates the refresh token hash on a valid, matching presentation', async () => {
      // hashToken uses sha256 internally; simulate a matching stored hash
      // by hashing the same presented token the same way the service does.
      const presented = 'valid-refresh-token';
      const matchingHash = crypto.createHash('sha256').update(presented).digest('hex');
      prisma.user.findUnique.mockResolvedValue(makeUser({ refreshTokenHash: matchingHash }));

      const tokens = await service.refresh('user-1', presented);
      expect(tokens.accessToken).toBe('signed-token');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      // The newly stored hash must not be the raw token.
      const newHash = prisma.user.update.mock.calls[0][0].data.refreshTokenHash;
      expect(newHash).not.toBe(presented);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await service.logout('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });
  });

  describe('decodeSubject', () => {
    it('returns the sub claim without verifying the signature', () => {
      jwt.decode.mockReturnValue({ sub: 'user-1' });
      expect(service.decodeSubject('some.jwt.token')).toBe('user-1');
    });

    it('returns null when the token has no sub claim', () => {
      jwt.decode.mockReturnValue(null);
      expect(service.decodeSubject('garbage')).toBeNull();
    });
  });
});
