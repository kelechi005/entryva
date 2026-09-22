import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ResidentContextGuard } from './resident-context.guard';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ResidentContextGuard', () => {
  it('throws when there is no authenticated user on the request', async () => {
    const prisma = { residentProfile: { findUnique: jest.fn() } };
    const guard = new ResidentContextGuard(prisma as any);
    const req: Record<string, unknown> = {};
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('throws when the user has no resident profile at all', async () => {
    const prisma = { residentProfile: { findUnique: jest.fn().mockResolvedValue(null) } };
    const guard = new ResidentContextGuard(prisma as any);
    const req = { user: { userId: 'u1' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('throws when the resident profile exists but is not ACTIVE', async () => {
    const prisma = {
      residentProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'res1',
          estateId: 'estate1',
          apartmentId: 'apt1',
          displayName: 'Jane',
          status: 'SUSPENDED',
        }),
      },
    };
    const guard = new ResidentContextGuard(prisma as any);
    const req = { user: { userId: 'u1' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('attaches residentContext derived only from the server-resolved profile, never from the request body', async () => {
    const prisma = {
      residentProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'res1',
          estateId: 'estate1',
          apartmentId: 'apt1',
          displayName: 'Jane',
          status: 'ACTIVE',
        }),
      },
    };
    const guard = new ResidentContextGuard(prisma as any);
    // A malicious/buggy client tries to smuggle a different estateId in
    // the body — this must be ignored entirely; only the DB-resolved
    // profile may populate residentContext (CLAUDE.md §6/§58).
    const req: any = { user: { userId: 'u1' }, body: { estateId: 'someone-elses-estate' } };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(req.residentContext).toEqual({
      residentId: 'res1',
      estateId: 'estate1',
      apartmentId: 'apt1',
      displayName: 'Jane',
    });
    expect(prisma.residentProfile.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
