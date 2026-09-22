import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

describe('AdministrationService — CRUD tenant isolation', () => {
  let prisma: any;
  let authService: any;
  let auditLogs: any;
  let service: AdministrationService;

  beforeEach(() => {
    prisma = {
      building: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      apartment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      residentProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      securityOfficerProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      user: { create: jest.fn(), update: jest.fn() },
      estate: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    authService = {
      hashPassword: jest.fn().mockResolvedValue('hashed-temp-pw'),
      verifyPassword: jest.fn().mockResolvedValue(true),
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AdministrationService(prisma, authService, auditLogs);
  });

  describe('buildings & apartments', () => {
    it('creates a building scoped to the resolved estate, ignoring any other estateId the client might pass', async () => {
      prisma.building.create.mockResolvedValue({ id: 'b1' });
      await service.createBuilding(estateAdmin(), 'someone-elses-estate', {
        name: 'Tower A',
        code: 'A',
      } as any);
      expect(prisma.building.create).toHaveBeenCalledWith({
        data: { estateId: 'estate-1', name: 'Tower A', code: 'A' },
      });
    });

    it('audit-logs a building creation', async () => {
      prisma.building.create.mockResolvedValue({ id: 'b1', name: 'Tower A' });
      await service.createBuilding(estateAdmin(), undefined, { name: 'Tower A' } as any);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADMIN_CHANGED_BUILDING',
          entity: 'Building',
          entityId: 'b1',
          metadata: expect.objectContaining({ change: 'created' }),
        }),
      );
    });

    it('rejects creating a building whose name already exists in this estate, case-insensitively', async () => {
      prisma.building.findFirst.mockResolvedValue({ id: 'existing', name: 'Block B' });
      await expect(
        service.createBuilding(estateAdmin(), undefined, { name: '  block b  ' } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.building.create).not.toHaveBeenCalled();
    });

    it('rejects creating an apartment in a building that belongs to a different estate', async () => {
      prisma.building.findFirst.mockResolvedValue(null); // scoped lookup found nothing
      await expect(
        service.createApartment(estateAdmin(), undefined, {
          buildingId: 'building-in-other-estate',
          flatNumber: 'B-1',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.apartment.create).not.toHaveBeenCalled();
    });

    it('creates an apartment when the building is confirmed to belong to this estate', async () => {
      prisma.building.findFirst.mockResolvedValue({ id: 'building-1', estateId: 'estate-1' });
      prisma.apartment.create.mockResolvedValue({ id: 'apt-1' });
      await service.createApartment(estateAdmin(), undefined, {
        buildingId: 'building-1',
        flatNumber: 'B-204',
      } as any);
      expect(prisma.building.findFirst).toHaveBeenCalledWith({
        where: { id: 'building-1', estateId: 'estate-1' },
      });
      expect(prisma.apartment.create).toHaveBeenCalledWith({
        data: { estateId: 'estate-1', buildingId: 'building-1', flatNumber: 'B-204' },
      });
    });

    it('audit-logs an apartment creation', async () => {
      prisma.building.findFirst.mockResolvedValue({ id: 'building-1', estateId: 'estate-1' });
      prisma.apartment.create.mockResolvedValue({ id: 'apt-1', flatNumber: 'B-204' });
      await service.createApartment(estateAdmin(), undefined, {
        buildingId: 'building-1',
        flatNumber: 'B-204',
      } as any);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADMIN_CHANGED_APARTMENT',
          entity: 'Apartment',
          entityId: 'apt-1',
          metadata: expect.objectContaining({ change: 'created' }),
        }),
      );
    });
  });

  describe('createResident', () => {
    it('rejects onboarding a resident into an apartment from a different estate', async () => {
      prisma.apartment.findFirst.mockResolvedValue(null);
      await expect(
        service.createResident(estateAdmin(), undefined, {
          apartmentId: 'apt-in-other-estate',
          email: 'r@example.com',
          displayName: 'Rita',
          temporaryPassword: 'temp123',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the user + resident profile atomically and marks the apartment OCCUPIED', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', estateId: 'estate-1' });
      prisma.user.create.mockResolvedValue({ id: 'user-9' });
      prisma.residentProfile.create = jest.fn().mockResolvedValue({ id: 'resident-9' });

      const result = await service.createResident(estateAdmin(), undefined, {
        apartmentId: 'apt-1',
        email: 'r@example.com',
        displayName: 'Rita',
        temporaryPassword: 'temp123',
      } as any);

      expect(authService.hashPassword).toHaveBeenCalledWith('temp123');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'RESIDENT' }) }),
      );
      expect(prisma.apartment.update).toHaveBeenCalledWith({
        where: { id: 'apt-1' },
        data: { status: 'OCCUPIED' },
      });
      expect(result).toEqual({ id: 'resident-9' });
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_CHANGED_RESIDENT', estateId: 'estate-1' }),
      );
    });

    it('never stores the plaintext temporary password anywhere', async () => {
      prisma.apartment.findFirst.mockResolvedValue({ id: 'apt-1', estateId: 'estate-1' });
      prisma.user.create.mockResolvedValue({ id: 'user-9' });
      prisma.residentProfile.create = jest.fn().mockResolvedValue({ id: 'resident-9' });

      await service.createResident(estateAdmin(), undefined, {
        apartmentId: 'apt-1',
        email: 'r@example.com',
        displayName: 'Rita',
        temporaryPassword: 'super-secret-plaintext',
      } as any);

      const userCreateData = prisma.user.create.mock.calls[0][0].data;
      expect(userCreateData.passwordHash).toBe('hashed-temp-pw');
      expect(JSON.stringify(userCreateData)).not.toContain('super-secret-plaintext');
    });
  });

  describe('updateResidentStatus', () => {
    it('rejects updating a resident that does not belong to the admin\'s estate', async () => {
      prisma.residentProfile.findFirst.mockResolvedValue(null);
      await expect(
        service.updateResidentStatus(estateAdmin(), undefined, 'resident-in-other-estate', {
          status: 'SUSPENDED',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the underlying User status and logs the change', async () => {
      prisma.residentProfile.findFirst.mockResolvedValue({ id: 'resident-1', userId: 'user-1' });
      await service.updateResidentStatus(estateAdmin(), undefined, 'resident-1', {
        status: 'SUSPENDED',
      } as any);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'SUSPENDED' },
      });
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { change: 'status', newStatus: 'SUSPENDED' } }),
      );
    });
  });

  describe('createSecurityOfficer', () => {
    it('creates the user + officer profile scoped to the resolved estate', async () => {
      prisma.user.create.mockResolvedValue({ id: 'user-5' });
      prisma.securityOfficerProfile.create = jest.fn().mockResolvedValue({ id: 'officer-5' });

      await service.createSecurityOfficer(estateAdmin(), undefined, {
        fullName: 'Samuel Officer',
        email: 'sec@example.com',
        employeeCode: 'SEC-01',
        temporaryPassword: 'temp123',
      } as any);

      expect(prisma.securityOfficerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-5',
          estateId: 'estate-1',
          fullName: 'Samuel Officer',
          employeeCode: 'SEC-01',
        },
      });
    });

    it('rejects an employee code already used elsewhere in the same estate', async () => {
      prisma.securityOfficerProfile.findFirst.mockResolvedValue({ id: 'existing-officer' });

      await expect(
        service.createSecurityOfficer(estateAdmin(), undefined, {
          fullName: 'Duplicate Dan',
          email: 'dup@example.com',
          employeeCode: 'SEC-01',
          temporaryPassword: 'temp123',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('updateApartment — no duplicate apartments', () => {
    it('rejects moving an apartment to a flat number already used in the target building', async () => {
      prisma.apartment.findFirst
        // lookup of the apartment being edited (scoped to this estate)
        .mockResolvedValueOnce({ id: 'apt-1', estateId: 'estate-1', buildingId: 'building-1', flatNumber: 'A-1' })
        // duplicate check finds a clash
        .mockResolvedValueOnce({ id: 'apt-2' });

      await expect(
        service.updateApartment(estateAdmin(), undefined, 'apt-1', { flatNumber: 'A-2' } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.apartment.update).not.toHaveBeenCalled();
    });

    it('allows renaming an apartment to a flat number that is free', async () => {
      prisma.apartment.findFirst
        .mockResolvedValueOnce({ id: 'apt-1', estateId: 'estate-1', buildingId: 'building-1', flatNumber: 'A-1' })
        .mockResolvedValueOnce(null);
      prisma.apartment.update.mockResolvedValue({ id: 'apt-1', flatNumber: 'A-2' });

      await service.updateApartment(estateAdmin(), undefined, 'apt-1', { flatNumber: 'A-2' } as any);

      expect(prisma.apartment.update).toHaveBeenCalledWith({
        where: { id: 'apt-1' },
        data: { buildingId: undefined, flatNumber: 'A-2' },
      });
    });
  });

  describe('removeResident', () => {
    it('marks the account REMOVED, clears the refresh token, and frees the apartment if it was the last resident', async () => {
      prisma.residentProfile.findFirst.mockResolvedValue({
        id: 'resident-1',
        userId: 'user-1',
        apartmentId: 'apt-1',
      });
      prisma.residentProfile.count = jest.fn().mockResolvedValue(0);
      prisma.apartment.update.mockResolvedValue({ id: 'apt-1', status: 'VACANT' });

      const result = await service.removeResident(estateAdmin(), undefined, 'resident-1', {
        currentPassword: 'admin-pw',
      });

      expect(authService.verifyPassword).toHaveBeenCalledWith('admin-1', 'admin-pw');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'REMOVED', refreshTokenHash: null },
      });
      expect(prisma.apartment.update).toHaveBeenCalledWith({
        where: { id: 'apt-1' },
        data: { status: 'VACANT' },
      });
      expect(result).toEqual({ removed: true });
    });

    it('rejects removing a resident that does not belong to the admin\'s estate', async () => {
      prisma.residentProfile.findFirst.mockResolvedValue(null);
      await expect(
        service.removeResident(estateAdmin(), undefined, 'resident-in-other-estate', {
          currentPassword: 'admin-pw',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects removal when the admin\'s password confirmation is wrong', async () => {
      prisma.residentProfile.findFirst.mockResolvedValue({
        id: 'resident-1',
        userId: 'user-1',
        apartmentId: 'apt-1',
      });
      authService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.removeResident(estateAdmin(), undefined, 'resident-1', { currentPassword: 'wrong' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_REMOVAL_PASSWORD_CHECK_FAILED' }),
      );
    });
  });

  describe('removeSecurityOfficer', () => {
    it('marks the account REMOVED and clears the refresh token', async () => {
      prisma.securityOfficerProfile.findFirst.mockResolvedValue({ id: 'officer-1', userId: 'user-1' });

      const result = await service.removeSecurityOfficer(estateAdmin(), undefined, 'officer-1', {
        currentPassword: 'admin-pw',
      });

      expect(authService.verifyPassword).toHaveBeenCalledWith('admin-1', 'admin-pw');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'REMOVED', refreshTokenHash: null },
      });
      expect(result).toEqual({ removed: true });
    });
  });

  describe('updateEstate', () => {
    it('updates name, address, and timezone and audit-logs the change', async () => {
      prisma.estate.findUnique.mockResolvedValue({ id: 'estate-1', name: 'Old Name' });
      prisma.estate.update.mockResolvedValue({
        id: 'estate-1',
        name: 'Whitfield Gardens',
        address: '12 Palm Avenue, Lagos',
        timezone: 'Africa/Lagos',
      });

      const result = await service.updateEstate(estateAdmin(), undefined, {
        name: 'Whitfield Gardens',
        address: '12 Palm Avenue, Lagos',
        timezone: 'Africa/Lagos',
      });

      expect(prisma.estate.update).toHaveBeenCalledWith({
        where: { id: 'estate-1' },
        data: { name: 'Whitfield Gardens', address: '12 Palm Avenue, Lagos', timezone: 'Africa/Lagos' },
      });
      expect(result.address).toBe('12 Palm Avenue, Lagos');
      expect(auditLogs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_CHANGED_ESTATE' }));
    });

    it('leaves fields the admin did not send untouched (partial update)', async () => {
      prisma.estate.findUnique.mockResolvedValue({ id: 'estate-1' });
      prisma.estate.update.mockResolvedValue({ id: 'estate-1', address: 'New address only' });

      await service.updateEstate(estateAdmin(), undefined, { address: 'New address only' });

      expect(prisma.estate.update).toHaveBeenCalledWith({
        where: { id: 'estate-1' },
        data: { name: undefined, address: 'New address only', timezone: undefined },
      });
    });

    it("pins ESTATE_ADMIN to their own estate even if a different estateId is requested", async () => {
      prisma.estate.findUnique.mockResolvedValue({ id: 'estate-1' });
      prisma.estate.update.mockResolvedValue({ id: 'estate-1' });

      await service.updateEstate(estateAdmin(), 'someone-elses-estate', { name: 'Hijacked' });

      expect(prisma.estate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'estate-1' } }),
      );
    });

    it('404s if the estate somehow no longer exists', async () => {
      prisma.estate.findUnique.mockResolvedValue(null);
      await expect(service.updateEstate(estateAdmin(), undefined, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.estate.update).not.toHaveBeenCalled();
    });
  });
});
