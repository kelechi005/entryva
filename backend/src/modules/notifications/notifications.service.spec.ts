import { NotificationsService } from './notifications.service';

describe('NotificationsService delivery', () => {
  let prisma: any;
  let push: any;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'n-1' }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    push = { sendToUser: jest.fn().mockResolvedValue(undefined), sendToUsers: jest.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(prisma, push);
  });

  it('dispatch saves the bell entry and sends a push with the right wording', async () => {
    await service.dispatch({ userId: 'u-1', type: 'VISITOR_ARRIVED', payload: { invitationId: 'inv-1', visitorName: 'Chidi' } });

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    const [userId, message] = push.sendToUser.mock.calls[0];
    expect(userId).toBe('u-1');
    expect(message).toMatchObject({ title: 'Your visitor is at the gate', url: '/visitors/track/inv-1', urgent: false });
    expect(message.body).toContain('Chidi');
  });

  it('does not wait for the push service (a slow one must not hold up a gate scan)', async () => {
    let finish: () => void = () => undefined;
    push.sendToUser.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    await expect(service.dispatch({ userId: 'u-1', type: 'VISITOR_ENTERED', payload: {} })).resolves.toBeUndefined();

    finish();
  });

  it('a failing push never breaks the notification', async () => {
    push.sendToUser.mockRejectedValue(new Error('push service down'));
    await expect(service.dispatch({ userId: 'u-1', type: 'VISITOR_ENTERED', payload: {} })).resolves.toBeUndefined();
  });

  it('a failing database write never throws into the caller', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db'));
    await expect(service.dispatch({ userId: 'u-1', type: 'VISITOR_ENTERED' })).resolves.toBeUndefined();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  describe('dispatchMany', () => {
    it('saves one bell entry each (no duplicates) and fans out ONE urgent push for emergencies', async () => {
      await service.dispatchMany(['a', 'b', 'a'], 'EMERGENCY_RAISED', {
        alertId: 'al-1',
        kind: 'FIRE',
        apartmentLabel: 'Block A \u00b7 12',
        raisedByName: 'Rita',
      });

      expect(prisma.notification.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ userId: 'a', type: 'EMERGENCY_RAISED' }),
        expect.objectContaining({ userId: 'b', type: 'EMERGENCY_RAISED' }),
      ]);
      expect(push.sendToUsers).toHaveBeenCalledTimes(1);
      const [ids, message] = push.sendToUsers.mock.calls[0];
      expect(ids).toEqual(['a', 'b']);
      expect(message).toMatchObject({ title: 'Emergency: Fire', urgent: true, url: '/alerts?tab=emergencies' });
    });

    it('does nothing for nobody', async () => {
      await service.dispatchMany([], 'ANNOUNCEMENT_POSTED', {});
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
      expect(push.sendToUsers).not.toHaveBeenCalled();
    });

    it('never throws if the database write fails', async () => {
      prisma.notification.createMany.mockRejectedValue(new Error('db'));
      await expect(service.dispatchMany(['a'], 'ANNOUNCEMENT_POSTED', {})).resolves.toBeUndefined();
      expect(push.sendToUsers).not.toHaveBeenCalled();
    });
  });
});
