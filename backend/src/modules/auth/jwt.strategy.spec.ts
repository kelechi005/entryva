import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    role: 'RESIDENT',
    status: 'ACTIVE',
    email: 'someone@example.com',
    phone: null,
    adminEstateId: null,
    ...overrides,
  };
}

describe('JwtStrategy', () => {
  let prisma: any;
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret';
    prisma = {
      user: { findUnique: jest.fn() },
      residentProfile: { findUnique: jest.fn() },
      securityOfficerProfile: { findUnique: jest.fn() },
    };
    strategy = new JwtStrategy(prisma);
  });

  it('rejects when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'ghost' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-ACTIVE account even with a valid, unexpired token', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a RESIDENT-role user missing its resident profile row', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'RESIDENT' }));
    prisma.residentProfile.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      'No resident profile found.',
    );
  });

  it('attaches residentId/estateId/apartmentId for a RESIDENT — never another resident\'s data', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'RESIDENT' }));
    prisma.residentProfile.findUnique.mockResolvedValue({
      id: 'resident-42',
      displayName: 'Rita Resident',
      estateId: 'estate-1',
      apartmentId: 'apt-9',
      userId: 'user-1',
    });

    const result = await strategy.validate({ sub: 'user-1' });
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        role: 'RESIDENT',
        residentId: 'resident-42',
        estateId: 'estate-1',
        apartmentId: 'apt-9',
      }),
    );
    // The lookup must be scoped to this authenticated user, not any resident.
    expect(prisma.residentProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('rejects a SECURITY_OFFICER-role user missing its officer profile row', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'SECURITY_OFFICER' }));
    prisma.securityOfficerProfile.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      'No security officer profile found.',
    );
  });

  it('attaches securityOfficerId/estateId for a SECURITY_OFFICER', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'SECURITY_OFFICER' }));
    prisma.securityOfficerProfile.findUnique.mockResolvedValue({
      id: 'officer-7',
      fullName: 'Samuel Officer',
      employeeCode: 'SEC-007',
      estateId: 'estate-1',
      userId: 'user-1',
    });

    const result = await strategy.validate({ sub: 'user-1' });
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        role: 'SECURITY_OFFICER',
        securityOfficerId: 'officer-7',
        estateId: 'estate-1',
      }),
    );
  });

  it('scopes an ESTATE_ADMIN to their own adminEstateId and does not query other profile tables', async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: 'ESTATE_ADMIN', adminEstateId: 'estate-1' }),
    );

    const result = await strategy.validate({ sub: 'user-1' });
    expect(result).toEqual(
      expect.objectContaining({ role: 'ESTATE_ADMIN', estateId: 'estate-1' }),
    );
    expect(prisma.residentProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.securityOfficerProfile.findUnique).not.toHaveBeenCalled();
  });

  it('leaves SUPER_ADMIN unscoped to any single estate', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'SUPER_ADMIN' }));
    const result = await strategy.validate({ sub: 'user-1' });
    expect(result.role).toBe('SUPER_ADMIN');
    expect((result as any).estateId).toBeUndefined();
  });
});
