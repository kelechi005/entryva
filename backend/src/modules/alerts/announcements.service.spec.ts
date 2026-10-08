import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService, previewOf } from './announcements.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const admin: AuthenticatedUser = { userId: 'admin-1', role: 'ESTATE_ADMIN', displayName: 'Ada Admin', estateId: 'estate-1' };
const officer: AuthenticatedUser = {
  userId: 'officer-1',
  role: 'SECURITY_OFFICER',
  displayName: 'Musa Officer',
  estateId: 'estate-1',
  securityOfficerId: 'so-1',
};
const resident: AuthenticatedUser = {
  userId: 'res-1',
  role: 'RESIDENT',
  displayName: 'Rita Resident',
  estateId: 'estate-1',
  residentId: 'r-1',
  apartmentId: 'apt-1',
};

describe('previewOf', () => {
  it('flattens whitespace and clips long text for a lock screen', () => {
    expect(previewOf('Line one\n\n  line   two')).toBe('Line one line two');
    const long = previewOf('x'.repeat(500));
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith('\u2026')).toBe(true);
  });
});

describe('AnnouncementsService', () => {
  let prisma: any;
  let notifications: any;
  let auditLogs: any;
  let service: AnnouncementsService;

  beforeEach(() => {
    prisma = {
      announcement: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ann-1', createdAt: new Date(), ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      residentProfile: { findMany: jest.fn().mockResolvedValue([{ userId: 'res-1' }, { userId: 'res-2' }]) },
      securityOfficerProfile: { findMany: jest.fn().mockResolvedValue([{ userId: 'officer-1' }]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]) },
    };
    notifications = { dispatchMany: jest.fn().mockResolvedValue(undefined) };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AnnouncementsService(prisma, notifications, auditLogs);
  });

  describe('create', () => {
    it('saves a notice in the admin\'s own estate and notifies everyone else there', async () => {
      const view = await service.create(admin, { kind: 'ANNOUNCEMENT', title: 'Water cut', body: 'No water 9am-1pm.' });

      expect(prisma.announcement.create.mock.calls[0][0].data).toMatchObject({
        estateId: 'estate-1',
        authorId: 'admin-1',
        authorName: 'Ada Admin',
        kind: 'ANNOUNCEMENT',
      });
      const [recipients, type, payload] = notifications.dispatchMany.mock.calls[0];
      expect(type).toBe('ANNOUNCEMENT_POSTED');
      expect(recipients.sort()).toEqual(['officer-1', 'res-1', 'res-2']); // not the author
      expect(payload).toMatchObject({ announcementId: 'ann-1', title: 'Water cut', preview: 'No water 9am-1pm.' });
      expect(view).toMatchObject({ id: 'ann-1', kind: 'ANNOUNCEMENT', title: 'Water cut', authorName: 'Ada Admin' });
    });

    it('sends security alerts as the urgent type', async () => {
      await service.create(officer, { kind: 'SECURITY_ALERT', title: 'Suspicious car', body: 'Grey van near the gate.' });
      expect(notifications.dispatchMany.mock.calls[0][1]).toBe('SECURITY_ALERT');
      expect(notifications.dispatchMany.mock.calls[0][0]).not.toContain('officer-1');
    });

    it('only looks up recipients inside the author\'s estate', async () => {
      await service.create(admin, { kind: 'ANNOUNCEMENT', title: 'Hello', body: 'x' });
      expect(prisma.residentProfile.findMany.mock.calls[0][0].where).toMatchObject({ estateId: 'estate-1', status: 'ACTIVE' });
      expect(prisma.securityOfficerProfile.findMany.mock.calls[0][0].where).toMatchObject({ estateId: 'estate-1' });
      expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ adminEstateId: 'estate-1', role: 'ESTATE_ADMIN' });
    });

    it('does not let a security officer post an ordinary notice', async () => {
      await expect(
        service.create(officer, { kind: 'ANNOUNCEMENT', title: 'Party', body: 'Tonight' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.announcement.create).not.toHaveBeenCalled();
    });

    it('refuses an account with no estate', async () => {
      await expect(
        service.create({ ...admin, estateId: undefined }, { kind: 'ANNOUNCEMENT', title: 'Hello', body: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('records an audit entry with no message text in it', async () => {
      await service.create(admin, { kind: 'ANNOUNCEMENT', title: 'Secret title', body: 'Secret body' });
      const entry = auditLogs.log.mock.calls[0][0];
      expect(entry).toMatchObject({ action: 'ANNOUNCEMENT_POSTED', estateId: 'estate-1', entityId: 'ann-1' });
      expect(JSON.stringify(entry)).not.toContain('Secret');
    });
  });

  describe('list', () => {
    it('is scoped to the caller\'s estate (any role), newest first, capped', async () => {
      await service.list(resident);
      const args = prisma.announcement.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ estateId: 'estate-1' });
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(args.take).toBe(50);
    });

    it('can filter by kind', async () => {
      await service.list(resident, 'SECURITY_ALERT');
      expect(prisma.announcement.findMany.mock.calls[0][0].where).toEqual({ estateId: 'estate-1', kind: 'SECURITY_ALERT' });
    });
  });

  describe('remove', () => {
    it('deletes only inside the admin\'s estate and audits it', async () => {
      await expect(service.remove(admin, 'ann-1')).resolves.toEqual({ deleted: true });
      expect(prisma.announcement.deleteMany).toHaveBeenCalledWith({ where: { id: 'ann-1', estateId: 'estate-1' } });
      expect(auditLogs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ANNOUNCEMENT_DELETED' }));
    });

    it('404s something that is not in this estate', async () => {
      prisma.announcement.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(admin, 'other-estates')).rejects.toBeInstanceOf(NotFoundException);
      expect(auditLogs.log).not.toHaveBeenCalled();
    });
  });
});
