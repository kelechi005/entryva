import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EstateLocationService } from './estate-location.service';
import { UpdateEstateLocationDto } from './dto/update-estate-location.dto';
import { haversineMeters } from './geo.util';
import { hashSecret } from '../../common/crypto/token.util';
import type { AuthenticatedUser } from '../auth/auth.types';

const admin: AuthenticatedUser = {
  userId: 'admin-1',
  role: 'ESTATE_ADMIN',
  displayName: 'Ada Admin',
  estateId: 'estate-1',
};

const validDto = {
  latitude: 7.7337,
  longitude: 8.5214,
  mainGateName: 'Main Gate',
  mainGateLatitude: 7.7345,
  mainGateLongitude: 8.5221,
  entranceInstructions: 'Beside the filling station',
  arrivalRadiusMeters: 80,
};

function estateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'estate-1',
    name: 'Emerald Gardens',
    address: '1 Estate Road',
    latitude: null,
    longitude: null,
    mainGateName: null,
    mainGateLatitude: null,
    mainGateLongitude: null,
    entranceInstructions: null,
    arrivalRadiusMeters: 100,
    ...overrides,
  };
}

describe('haversineMeters', () => {
  it('is ~111 km per degree of latitude and 0 for the same point', () => {
    expect(haversineMeters(7, 8, 7, 8)).toBe(0);
    expect(haversineMeters(0, 0, 1, 0)).toBeGreaterThan(110_000);
    expect(haversineMeters(0, 0, 1, 0)).toBeLessThan(112_000);
  });
});

describe('UpdateEstateLocationDto', () => {
  const check = async (patch: Record<string, unknown>) =>
    validate(plainToInstance(UpdateEstateLocationDto, { ...validDto, ...patch }));

  it('accepts a complete, valid location', async () => {
    expect(await check({})).toHaveLength(0);
  });

  it.each([
    ['latitude above 90', { latitude: 91 }],
    ['longitude below -180', { longitude: -181 }],
    ['non-numeric gate latitude', { mainGateLatitude: 'abc' }],
    ['missing gate name', { mainGateName: '' }],
    ['arrival radius too small', { arrivalRadiusMeters: 5 }],
    ['arrival radius too large', { arrivalRadiusMeters: 5000 }],
    ['non-integer radius', { arrivalRadiusMeters: 80.5 }],
  ])('rejects %s', async (_label, patch) => {
    expect((await check(patch)).length).toBeGreaterThan(0);
  });
});

describe('EstateLocationService', () => {
  let prisma: any;
  let auditLogs: any;
  let service: EstateLocationService;

  beforeEach(() => {
    prisma = {
      estate: {
        findUnique: jest.fn().mockResolvedValue(estateRow()),
        update: jest.fn().mockImplementation(async ({ data }: any) => estateRow(data)),
      },
      invitation: { findUnique: jest.fn() },
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new EstateLocationService(prisma, auditLogs);
  });

  describe('getLocation', () => {
    it('reports an unconfigured estate as configured:false', async () => {
      const result = await service.getLocation(admin);
      expect(result.configured).toBe(false);
      expect(result.arrivalRadiusMeters).toBe(100);
    });

    it('reports a fully set gate as configured:true', async () => {
      prisma.estate.findUnique.mockResolvedValue(
        estateRow({ mainGateName: 'Main Gate', mainGateLatitude: 7.7, mainGateLongitude: 8.5 }),
      );
      expect((await service.getLocation(admin)).configured).toBe(true);
    });

    it("always uses the admin's own estate and ignores a ?estateId= for another one", async () => {
      await service.getLocation(admin, 'someone-elses-estate');
      expect(prisma.estate.findUnique).toHaveBeenCalledWith({ where: { id: 'estate-1' } });
    });

    it('requires an estateId for SUPER_ADMIN', async () => {
      await expect(service.getLocation({ ...admin, role: 'SUPER_ADMIN', estateId: undefined })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses roles with no estate scope', async () => {
      await expect(service.getLocation({ ...admin, estateId: undefined })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('updateLocation', () => {
    it('saves the pin, gate, tip and radius, scoped to the admin estate, and audits it', async () => {
      const result = await service.updateLocation(admin, 'another-estate', validDto);

      const call = prisma.estate.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'estate-1' });
      expect(call.data).toMatchObject({
        latitude: 7.7337,
        mainGateName: 'Main Gate',
        mainGateLatitude: 7.7345,
        arrivalRadiusMeters: 80,
        entranceInstructions: 'Beside the filling station',
      });
      expect(result.configured).toBe(true);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_CHANGED_ESTATE', estateId: 'estate-1', userId: 'admin-1' }),
      );
    });

    it('keeps the existing radius when none is sent, and clears an empty tip', async () => {
      prisma.estate.findUnique.mockResolvedValue(estateRow({ arrivalRadiusMeters: 150 }));

      await service.updateLocation(admin, undefined, {
        ...validDto,
        arrivalRadiusMeters: undefined,
        entranceInstructions: '',
      });

      const data = prisma.estate.update.mock.calls[0][0].data;
      expect(data.arrivalRadiusMeters).toBe(150);
      expect(data.entranceInstructions).toBeNull();
    });

    it('rejects a gate absurdly far from the estate pin and saves nothing', async () => {
      await expect(
        service.updateLocation(admin, undefined, { ...validDto, mainGateLatitude: 8.7 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.estate.update).not.toHaveBeenCalled();
    });

    it('rejects (0, 0) placeholders', async () => {
      await expect(
        service.updateLocation(admin, undefined, {
          ...validDto,
          mainGateLatitude: 0,
          mainGateLongitude: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s when the estate does not exist', async () => {
      prisma.estate.findUnique.mockResolvedValue(null);
      await expect(service.updateLocation(admin, undefined, validDto)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getEntranceForInvitation', () => {
    const live = (overrides: Record<string, unknown> = {}) => ({
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 60_000),
      estate: estateRow({
        mainGateName: 'Main Gate',
        mainGateLatitude: 7.7345,
        mainGateLongitude: 8.5221,
        entranceInstructions: 'Beside the filling station',
        latitude: 7.7337,
        longitude: 8.5214,
      }),
      ...overrides,
    });

    it('looks the invitation up by token hash and returns only the entrance', async () => {
      prisma.invitation.findUnique.mockResolvedValue(live());

      const result = await service.getEntranceForInvitation('raw-token');

      expect(prisma.invitation.findUnique.mock.calls[0][0].where).toEqual({
        secureTokenHash: hashSecret('raw-token'),
      });
      expect(result).toEqual({
        estateName: 'Emerald Gardens',
        gateName: 'Main Gate',
        latitude: 7.7345,
        longitude: 8.5221,
        instructions: 'Beside the filling station',
        arrivalRadiusMeters: 100,
      });
      // The estate-centre pin and address must not leak to visitors.
      expect(result).not.toHaveProperty('address');
      expect(JSON.stringify(result)).not.toContain('7.7337');
    });

    it('allows PENDING (scheduled) invitations too', async () => {
      prisma.invitation.findUnique.mockResolvedValue(live({ status: 'PENDING' }));
      await expect(service.getEntranceForInvitation('t')).resolves.toBeDefined();
    });

    it('404s an unknown token', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(service.getEntranceForInvitation('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['REVOKED', 'CANCELLED', 'USED', 'EXPIRED'])('410s a %s invitation', async (status) => {
      prisma.invitation.findUnique.mockResolvedValue(live({ status }));
      await expect(service.getEntranceForInvitation('t')).rejects.toBeInstanceOf(GoneException);
    });

    it('410s an ACTIVE invitation whose window has passed', async () => {
      prisma.invitation.findUnique.mockResolvedValue(live({ validUntil: new Date(Date.now() - 1) }));
      await expect(service.getEntranceForInvitation('t')).rejects.toBeInstanceOf(GoneException);
    });

    it('404s when the estate has not configured an entrance', async () => {
      prisma.invitation.findUnique.mockResolvedValue(live({ estate: estateRow() }));
      await expect(service.getEntranceForInvitation('t')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
