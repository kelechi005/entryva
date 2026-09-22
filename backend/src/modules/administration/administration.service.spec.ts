import { ForbiddenException } from '@nestjs/common';
import { AdministrationService } from './administration.service';
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

function superAdmin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { userId: 'super-1', role: 'SUPER_ADMIN', displayName: 'Sam Super', ...overrides };
}

describe('AdministrationService — CLAUDE.md §6.3 data-access boundary', () => {
  let prisma: any;
  let authService: any;
  let auditLogs: any;
  let service: AdministrationService;

  beforeEach(() => {
    prisma = {
      estate: { create: jest.fn(), findMany: jest.fn() },
      residentProfile: { count: jest.fn().mockResolvedValue(0) },
      apartment: { count: jest.fn().mockResolvedValue(0) },
      securityOfficerProfile: { count: jest.fn().mockResolvedValue(0) },
      invitation: {
        count: jest.fn().mockResolvedValue(0),
        // Deliberately NOT stubbed: findMany/findFirst/findUnique. If
        // AdministrationService ever calls one of these on `invitation`,
        // the test should fail loudly (TypeError: not a function) rather
        // than silently succeed with an auto-mocked empty array — the
        // absence of the method here IS the assertion.
      },
    };
    authService = {};
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AdministrationService(prisma, authService, auditLogs);
  });

  describe('estate scoping (resolveEstateId)', () => {
    it('pins ESTATE_ADMIN to their own estate even if a different estateId is requested', async () => {
      const user = estateAdmin({ estateId: 'estate-1' });
      // A malicious/buggy client passes ?estateId=someone-elses-estate.
      await service.getOverview(user, 'someone-elses-estate');
      expect(prisma.residentProfile.count).toHaveBeenCalledWith({
        where: { estateId: 'estate-1', user: { status: { not: 'REMOVED' } } },
      });
    });

    it('requires SUPER_ADMIN to explicitly specify an estateId (no default estate)', async () => {
      await expect(service.getOverview(superAdmin(), undefined)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets SUPER_ADMIN act on the estate they explicitly request', async () => {
      await service.getOverview(superAdmin(), 'some-estate');
      expect(prisma.residentProfile.count).toHaveBeenCalledWith({
        where: { estateId: 'some-estate', user: { status: { not: 'REMOVED' } } },
      });
    });

    it('rejects a user with neither an ESTATE_ADMIN estate scope nor SUPER_ADMIN', async () => {
      const orphanUser = { userId: 'x', role: 'ESTATE_ADMIN', displayName: 'X' } as AuthenticatedUser; // no estateId
      await expect(service.getOverview(orphanUser, undefined)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getOverview — the only visitor-adjacent data admin can see', () => {
    it('returns only aggregate counts, never per-resident/per-visitor records', async () => {
      const result = await service.getOverview(estateAdmin(), undefined);
      expect(Object.keys(result).sort()).toEqual(
        ['totalApartments', 'totalResidents', 'totalSecurityOfficers', 'visitorsToday'].sort(),
      );
      // Every value must be a number (a count), never an array of records.
      Object.values(result).forEach((v) => expect(typeof v).toBe('number'));
    });

    it('queries invitations with count() only — never a method that returns row contents', async () => {
      await service.getOverview(estateAdmin(), undefined);
      expect(prisma.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estateId: 'estate-1' }) }),
      );
    });

    it("throws (rather than silently succeeding) if AdministrationService ever grows a call to invitation.findMany/findFirst", async () => {
      // Regression guard: if a future change makes getOverview call
      // prisma.invitation.findMany(...) to build a "recent visitors"
      // list, that method doesn't exist on this mock and the test fails.
      expect(prisma.invitation.findMany).toBeUndefined();
      expect(prisma.invitation.findFirst).toBeUndefined();
      expect(prisma.invitation.findUnique).toBeUndefined();
    });
  });

  describe('getEstateSettings', () => {
    it('returns only the resolved estate\'s own record, scoped server-side', async () => {
      prisma.estate.findUnique = jest.fn().mockResolvedValue({
        id: 'estate-1',
        name: 'Sunset Gardens',
        timezone: 'Africa/Lagos',
      });
      const result = await service.getEstateSettings(estateAdmin({ estateId: 'estate-1' }), 'someone-elses-estate');
      // Even though a different estateId was requested, ESTATE_ADMIN is pinned to their own.
      expect(prisma.estate.findUnique).toHaveBeenCalledWith({ where: { id: 'estate-1' } });
      expect(result.name).toBe('Sunset Gardens');
    });

    it('throws NotFoundException if the resolved estate no longer exists', async () => {
      prisma.estate.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.getEstateSettings(estateAdmin(), undefined)).rejects.toThrow(
        'Estate not found.',
      );
    });
  });
});
