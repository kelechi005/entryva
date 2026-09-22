import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SecurityContextGuard } from './security-context.guard';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SecurityContextGuard', () => {
  it('throws when there is no authenticated user on the request', async () => {
    const prisma = { securityOfficerProfile: { findUnique: jest.fn() } };
    const guard = new SecurityContextGuard(prisma as any);
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(ForbiddenException);
  });

  it('throws when the officer profile is missing or inactive', async () => {
    const prisma = {
      securityOfficerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const guard = new SecurityContextGuard(prisma as any);
    const req = { user: { userId: 'u1' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('attaches securityOfficerId and estateId from the officer\'s real profile', async () => {
    const prisma = {
      securityOfficerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'officer1',
          estateId: 'estate1',
          status: 'ACTIVE',
        }),
      },
    };
    const guard = new SecurityContextGuard(prisma as any);
    const req: any = { user: { userId: 'u1' } };

    await guard.canActivate(makeContext(req));

    expect(req.securityContext).toEqual({
      securityOfficerId: 'officer1',
      estateId: 'estate1',
    });
  });

  it('never derives estateId/officerId from anything other than the DB-resolved profile', async () => {
    const prisma = {
      securityOfficerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'officer1',
          estateId: 'real-estate',
          status: 'ACTIVE',
        }),
      },
    };
    const guard = new SecurityContextGuard(prisma as any);
    const req: any = {
      user: { userId: 'u1' },
      body: { estateId: 'attacker-supplied-estate', securityOfficerId: 'attacker-officer' },
    };

    await guard.canActivate(makeContext(req));

    expect(req.securityContext.estateId).toBe('real-estate');
    expect(req.securityContext.securityOfficerId).toBe('officer1');
  });
});
