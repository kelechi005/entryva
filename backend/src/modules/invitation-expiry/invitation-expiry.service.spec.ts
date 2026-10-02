import { InvitationExpiryService } from './invitation-expiry.service';

const NOW = new Date('2026-10-02T20:00:00+01:00');

function setup(rows: { id: string; validUntil: Date; status: string }[]) {
  const store = rows.map((r) => ({ ...r }));
  const prisma = {
    invitation: {
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        const hit = store.filter(
          (r) =>
            r.status === where.status &&
            (where.id === undefined || r.id === where.id) &&
            r.validUntil.getTime() < where.validUntil.lt.getTime(),
        );
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) =>
        store
          .filter((r) => r.status === where.status && r.validUntil.getTime() < where.validUntil.lt.getTime())
          .map((r) => ({ id: r.id, resident: { userId: `u-${r.id}` }, visitor: { fullName: `Visitor ${r.id}` } })),
      ),
    },
  };
  const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const service = new InvitationExpiryService(prisma as never, notifications as never);
  return { service, store, notifications, prisma };
}

describe('InvitationExpiryService.sweep', () => {
  it('marks a pass expired once its time has run out, and tells the resident', async () => {
    const { service, store, notifications } = setup([
      { id: 'a', status: 'ACTIVE', validUntil: new Date('2026-10-01T22:14:00+01:00') },
    ]);
    const r = await service.sweep(NOW);
    expect(r.expired).toBe(1);
    expect(store[0].status).toBe('EXPIRED');
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-a', type: 'INVITATION_EXPIRED' }),
    );
  });

  it('leaves passes that are still valid, and ones already used or revoked', async () => {
    const { service, store, notifications } = setup([
      { id: 'valid', status: 'ACTIVE', validUntil: new Date('2026-10-02T21:00:00+01:00') },
      { id: 'used', status: 'USED', validUntil: new Date('2026-10-01T10:00:00+01:00') },
      { id: 'revoked', status: 'REVOKED', validUntil: new Date('2026-10-01T10:00:00+01:00') },
    ]);
    const r = await service.sweep(NOW);
    expect(r.expired).toBe(0);
    expect(store.map((s) => s.status)).toEqual(['ACTIVE', 'USED', 'REVOKED']);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('expires old backlog quietly, without a flood of messages', async () => {
    const { service, store, notifications } = setup([
      { id: 'old', status: 'ACTIVE', validUntil: new Date('2026-08-01T10:00:00+01:00') },
    ]);
    const r = await service.sweep(NOW);
    expect(r.expired).toBe(1);
    expect(store[0].status).toBe('EXPIRED');
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('a second sweep changes and sends nothing more', async () => {
    const { service, notifications } = setup([
      { id: 'a', status: 'ACTIVE', validUntil: new Date('2026-10-01T22:14:00+01:00') },
    ]);
    await service.sweep(NOW);
    const again = await service.sweep(NOW);
    expect(again.expired).toBe(0);
    expect(notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'INVITATION_EXPIRED' }));
    expect(notifications.dispatch.mock.calls.length).toBe(1);
  });

  it('survives a database error instead of crashing the server', async () => {
    const { service, prisma } = setup([]);
    prisma.invitation.updateMany.mockImplementation(async () => {
      throw new Error('db down');
    });
    expect(await service.sweep(NOW)).toEqual({ expired: 0 });
  });
});
