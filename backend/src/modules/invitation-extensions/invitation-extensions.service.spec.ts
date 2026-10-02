import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvitationExtensionsService } from './invitation-extensions.service';

const NOW = new Date('2026-10-05T12:00:00+01:00');
const OLD_EXPIRY = new Date('2026-10-05T14:00:00+01:00');

const ctx = { userId: 'user1', residentId: 'res1', estateId: 'e1', displayName: 'Ada Eze' };

const baseEstate = {
  timezone: 'Africa/Lagos',
  passExtensionsEnabled: true,
  passExtendMaxMinutes: 120,
  passMaxTotalMinutes: 720,
  passQuietFromMinute: null,
  passQuietToMinute: null,
};

const makeInvitation = (over: object = {}) => ({
  id: 'i1',
  status: 'ACTIVE',
  entryPolicy: 'ONE_TIME',
  validFrom: new Date('2026-10-05T10:00:00+01:00'),
  validUntil: OLD_EXPIRY,
  visitor: { fullName: 'Tom Okafor' },
  resident: { userId: 'user1' },
  ...over,
});

function setup(over: { invitation?: object | null; estate?: object; updateCount?: number } = {}) {
  const prisma = {
    invitation: {
      findFirst: jest.fn().mockResolvedValue(over.invitation === undefined ? makeInvitation() : over.invitation),
      updateMany: jest.fn().mockResolvedValue({ count: over.updateCount ?? 1 }),
    },
    estate: { findUnique: jest.fn().mockResolvedValue({ ...baseEstate, ...(over.estate ?? {}) }) },
  };
  const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new InvitationExtensionsService(prisma as never, notifications as never, auditLogs as never);
  return { service, prisma, notifications, auditLogs };
}

describe('InvitationExtensionsService.extend', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves the expiry, logs who/when/old/new and notifies the resident', async () => {
    const { service, prisma, notifications, auditLogs } = setup();
    const result = await service.extend(ctx, 'i1', 60);

    const expected = new Date('2026-10-05T15:00:00+01:00');
    const call = prisma.invitation.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'i1', validUntil: OLD_EXPIRY });
    expect(call.data.validUntil).toEqual(expected);
    expect(result).toMatchObject({ id: 'i1', validUntil: expected.toISOString(), status: 'ACTIVE' });

    expect(auditLogs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVITATION_EXTENDED',
        userId: 'user1',
        entityId: 'i1',
        metadata: expect.objectContaining({
          oldValidUntil: OLD_EXPIRY.toISOString(),
          newValidUntil: expected.toISOString(),
          minutes: 60,
        }),
      }),
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', type: 'INVITATION_EXTENDED' }),
    );
  });

  it('only finds the pass for the resident who created it', async () => {
    const { service, prisma } = setup({ invitation: null });
    await expect(service.extend(ctx, 'i1', 30)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1', residentId: 'res1', estateId: 'e1' } }),
    );
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a revoked pass without changing anything', async () => {
    const { service, prisma, auditLogs } = setup({ invitation: makeInvitation({ status: 'REVOKED' }) });
    await expect(service.extend(ctx, 'i1', 30)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    expect(auditLogs.log).not.toHaveBeenCalled();
  });

  it('refuses an already-used one-time pass', async () => {
    const { service } = setup({ invitation: makeInvitation({ status: 'USED' }) });
    await expect(service.extend(ctx, 'i1', 30)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses more than the estate allows per request', async () => {
    const { service, prisma } = setup();
    await expect(service.extend(ctx, 'i1', 121)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('refuses during the estate\'s quiet hours', async () => {
    const { service } = setup({ estate: { passQuietFromMinute: 11 * 60, passQuietToMinute: 13 * 60 } });
    await expect(service.extend(ctx, 'i1', 30)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('brings a just-expired pass back to active', async () => {
    const { service, prisma } = setup({
      invitation: makeInvitation({ status: 'EXPIRED', validUntil: new Date('2026-10-05T11:30:00+01:00') }),
    });
    const result = await service.extend(ctx, 'i1', 60);
    const data = prisma.invitation.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.validUntil).toEqual(new Date('2026-10-05T13:00:00+01:00'));
    expect(result.status).toBe('ACTIVE');
  });

  it('fails cleanly if the pass changed while extending', async () => {
    const { service, auditLogs } = setup({ updateCount: 0 });
    await expect(service.extend(ctx, 'i1', 30)).rejects.toBeInstanceOf(ConflictException);
    expect(auditLogs.log).not.toHaveBeenCalled();
  });
});
