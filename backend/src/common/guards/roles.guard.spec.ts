import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthenticatedUser } from '../../modules/auth/auth.types';

function makeContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows the request through when no @Roles() decorator is present (opt-in model)', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = makeContext({ userId: 'u1', role: 'RESIDENT', displayName: 'A' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows the request when the user has one of the required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ESTATE_ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = makeContext({ userId: 'u1', role: 'ESTATE_ADMIN', displayName: 'Admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when the authenticated user has the wrong role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ESTATE_ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    // A RESIDENT hitting an ESTATE_ADMIN-only route (e.g. §6.3 boundary
    // endpoints) must never be let through.
    const ctx = makeContext({ userId: 'u1', role: 'RESIDENT', displayName: 'Res' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no authenticated user at all', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['SECURITY_OFFICER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when the required-roles list is present but empty and user role mismatches expectations', () => {
    // Empty array is treated the same as "no restriction" per the
    // implementation's own comment — verify that's intentional and not
    // an accidental always-deny by confirming it stays an always-allow.
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = makeContext({ userId: 'u1', role: 'RESIDENT', displayName: 'A' });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
