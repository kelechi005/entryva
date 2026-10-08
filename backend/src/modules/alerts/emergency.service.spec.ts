import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const resident: AuthenticatedUser = {
  userId: 'res-1',
  role: 'RESIDENT',
  displayName: 'Rita Resident',
  estateId: 'estate-1',
  residentId: 'r-1',
  apartmentId: 'apt-1',
};
const officer: AuthenticatedUser = {
  userId: 'officer-1',
  role: 'SECURITY_OFFICER',
  displayName: 'Musa Officer',
  estateId: 'estate-1',
  securityOfficerId: 'so-1',
};
const admin: AuthenticatedUser = { userId: 'admin-1', role: 'ESTATE_ADMIN', displayName: 'Ada Admin', estateId: 'estate-1' };

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    estateId: 'estate-1',
    raisedById: 'res-1',
    raisedByName: 'Rita Resident',
    apartmentLabel: 'Block A \u00b7 12',
    kind: 'FIRE',
    note: null,
    status: 'OPEN',
    acknowledgedById: null,
    acknowledgedByName: null,
    acknowledgedAt: null,
    resolvedById: null,
    resolvedByName: null,
    resolvedAt: null,
    createdAt: new Date('2026-10-05T10:00:00Z'),
    ...overrides,
  };
}

describe('EmergencyService', () => {
  let prisma: any;
  let notifications: any;
  let auditLogs: any;
  let service: EmergencyService;

  beforeEach(() => {
    prisma = {
      emergencyAlert: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }: any) => alertRow({ ...data, id: 'alert-1' })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      apartment: { findUnique: jest.fn().mockResolvedValue({ flatNumber: '12', building: { name: 'Block A' } }) },
      residentProfile: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'res-1', phone: '+2348012345678' }]),
        findFirst: jest.fn().mockResolvedValue({ phone: '+2348012345678' }),
      },
      securityOfficerProfile: { findMany: jest.fn().mockResolvedValue([{ userId: 'officer-1' }, { userId: 'officer-2' }]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]) },
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined), dispatchMany: jest.fn().mockResolvedValue(undefined) };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new EmergencyService(prisma, notifications, auditLogs);
  });

  describe('raise', () => {
    it('creates the alert with the apartment label and alarms every officer and the admin', async () => {
      const result = await service.raise(resident, { kind: 'FIRE', note: ' Smoke in the kitchen ' });

      expect(prisma.emergencyAlert.create.mock.calls[0][0].data).toMatchObject({
        estateId: 'estate-1',
        raisedById: 'res-1',
        raisedByName: 'Rita Resident',
        apartmentLabel: 'Block A \u00b7 12',
        kind: 'FIRE',
        note: 'Smoke in the kitchen',
      });
      const [responders, type, payload] = notifications.dispatchMany.mock.calls[0];
      expect(type).toBe('EMERGENCY_RAISED');
      expect(responders.sort()).toEqual(['admin-1', 'officer-1', 'officer-2']);
      expect(payload).toMatchObject({ alertId: 'alert-1', kind: 'FIRE', apartmentLabel: 'Block A \u00b7 12' });
      expect(result).toMatchObject({ notifiedCount: 3, duplicate: false });
      expect(result.alert.callPhone).toBeNull(); // a resident never gets this field
    });

    it('tells the UI when nobody is set up to receive the alert', async () => {
      prisma.securityOfficerProfile.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.raise(resident, { kind: 'MEDICAL' });

      expect(result.notifiedCount).toBe(0);
      expect(prisma.emergencyAlert.create).toHaveBeenCalled(); // still saved
    });

    it('does not alarm everyone twice when the button is pressed again', async () => {
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow());

      const result = await service.raise(resident, { kind: 'FIRE' });

      expect(result.duplicate).toBe(true);
      expect(prisma.emergencyAlert.create).not.toHaveBeenCalled();
      expect(notifications.dispatchMany).not.toHaveBeenCalled();
      const where = prisma.emergencyAlert.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ raisedById: 'res-1', kind: 'FIRE', status: { in: ['OPEN', 'ACKNOWLEDGED'] } });
    });

    it('only residents can raise one', async () => {
      await expect(service.raise(officer, { kind: 'FIRE' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.raise(admin, { kind: 'FIRE' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('audits it with no personal details', async () => {
      await service.raise(resident, { kind: 'SECURITY', note: 'Someone at my door' });
      const entry = auditLogs.log.mock.calls[0][0];
      expect(entry).toMatchObject({ action: 'EMERGENCY_RAISED', estateId: 'estate-1', entityId: 'alert-1' });
      expect(JSON.stringify(entry)).not.toContain('Rita');
      expect(JSON.stringify(entry)).not.toContain('door');
    });
  });

  describe('list', () => {
    it('a resident sees only their own alerts, with no phone number', async () => {
      prisma.emergencyAlert.findMany.mockResolvedValue([alertRow()]);

      const result = await service.list(resident);

      expect(prisma.emergencyAlert.findMany.mock.calls[0][0].where).toEqual({ estateId: 'estate-1', raisedById: 'res-1' });
      expect(result[0].callPhone).toBeNull();
      expect(prisma.residentProfile.findMany).not.toHaveBeenCalled();
    });

    it('an officer sees the estate\'s alerts, open ones first, with the resident\'s phone to call', async () => {
      prisma.emergencyAlert.findMany.mockResolvedValue([
        alertRow({ id: 'old', status: 'RESOLVED', createdAt: new Date('2026-10-05T12:00:00Z') }),
        alertRow({ id: 'new-ack', status: 'ACKNOWLEDGED', createdAt: new Date('2026-10-05T09:00:00Z') }),
        alertRow({ id: 'new-open', status: 'OPEN', createdAt: new Date('2026-10-05T08:00:00Z') }),
      ]);

      const result = await service.list(officer);

      expect(result.map((r) => r.id)).toEqual(['new-open', 'new-ack', 'old']);
      expect(result[0].callPhone).toBe('+2348012345678');
      expect(prisma.emergencyAlert.findMany.mock.calls[0][0].where).toMatchObject({ estateId: 'estate-1' });
      expect(prisma.residentProfile.findMany.mock.calls[0][0].where).toMatchObject({ estateId: 'estate-1' });
    });

    it('refuses an account with no estate', async () => {
      await expect(service.list({ ...officer, estateId: undefined })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('acknowledge', () => {
    it('claims the alert atomically, tells the resident once, and audits it', async () => {
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow({ status: 'ACKNOWLEDGED', acknowledgedByName: 'Musa Officer' }));

      const view = await service.acknowledge(officer, 'alert-1');

      expect(prisma.emergencyAlert.updateMany.mock.calls[0][0].where).toEqual({ id: 'alert-1', estateId: 'estate-1', status: 'OPEN' });
      expect(notifications.dispatch).toHaveBeenCalledWith({
        userId: 'res-1',
        type: 'EMERGENCY_ACKNOWLEDGED',
        payload: { alertId: 'alert-1', responderName: 'Musa Officer' },
      });
      expect(auditLogs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMERGENCY_ACKNOWLEDGED' }));
      expect(view.status).toBe('ACKNOWLEDGED');
    });

    it('a second officer pressing it loses cleanly: no second "help is coming"', async () => {
      prisma.emergencyAlert.updateMany.mockResolvedValue({ count: 0 });
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow({ status: 'ACKNOWLEDGED', acknowledgedByName: 'Musa Officer' }));

      const view = await service.acknowledge({ ...officer, userId: 'officer-2', displayName: 'Second Officer' }, 'alert-1');

      expect(notifications.dispatch).not.toHaveBeenCalled();
      expect(auditLogs.log).not.toHaveBeenCalled();
      expect(view.acknowledgedByName).toBe('Musa Officer'); // the UI shows who has it
    });

    it('404s an alert from another estate', async () => {
      prisma.emergencyAlert.updateMany.mockResolvedValue({ count: 0 });
      prisma.emergencyAlert.findFirst.mockResolvedValue(null);
      await expect(service.acknowledge(officer, 'other')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.emergencyAlert.findFirst.mock.calls[0][0].where).toEqual({ id: 'other', estateId: 'estate-1' });
    });

    it('a resident cannot acknowledge', async () => {
      await expect(service.acknowledge(resident, 'alert-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.emergencyAlert.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('staff close an alert in their estate and the resident is told', async () => {
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow({ status: 'RESOLVED' }));

      await service.resolve(officer, 'alert-1');

      const where = prisma.emergencyAlert.updateMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ id: 'alert-1', estateId: 'estate-1', status: { in: ['OPEN', 'ACKNOWLEDGED'] } });
      expect(where).not.toHaveProperty('raisedById');
      expect(notifications.dispatch).toHaveBeenCalledWith({
        userId: 'res-1',
        type: 'EMERGENCY_RESOLVED',
        payload: { alertId: 'alert-1' },
      });
    });

    it('a resident can close only their own ("I\'m safe"), without alarming anyone', async () => {
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow({ status: 'RESOLVED', resolvedByName: 'Rita Resident' }));

      await service.resolve(resident, 'alert-1');

      expect(prisma.emergencyAlert.updateMany.mock.calls[0][0].where).toMatchObject({ raisedById: 'res-1' });
      expect(notifications.dispatch).not.toHaveBeenCalled();
    });

    it('a resident cannot see or close someone else\'s alert', async () => {
      prisma.emergencyAlert.updateMany.mockResolvedValue({ count: 0 });
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow({ raisedById: 'someone-else' }));

      await expect(service.resolve(resident, 'alert-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(notifications.dispatch).not.toHaveBeenCalled();
    });

    it('closing twice is harmless and sends nothing the second time', async () => {
      prisma.emergencyAlert.updateMany.mockResolvedValue({ count: 0 });
      prisma.emergencyAlert.findFirst.mockResolvedValue(alertRow({ status: 'RESOLVED' }));

      const view = await service.resolve(officer, 'alert-1');

      expect(view.status).toBe('RESOLVED');
      expect(notifications.dispatch).not.toHaveBeenCalled();
      expect(auditLogs.log).not.toHaveBeenCalled();
    });
  });
});
