import { ArrivalAlertsService } from './arrival-alerts.service';
import { hashSecret } from '../../common/crypto/token.util';

describe('ArrivalAlertsService', () => {
  let prisma: any;
  let notifications: any;
  let service: ArrivalAlertsService;

  const invitation = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    liveArrivedAt: new Date(),
    resident: { userId: 'res-1' },
    visitor: { fullName: 'Chidi Visitor' },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      invitation: { findUnique: jest.fn().mockResolvedValue(invitation()) },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    service = new ArrivalAlertsService(prisma, notifications);
  });

  it('tells the resident who invited the visitor - and only them', async () => {
    await service.notifyHostOfArrival('raw-token');

    expect(prisma.invitation.findUnique.mock.calls[0][0].where).toEqual({ secureTokenHash: hashSecret('raw-token') });
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    expect(notifications.dispatch).toHaveBeenCalledWith({
      userId: 'res-1',
      type: 'VISITOR_ARRIVED',
      payload: { invitationId: 'inv-1', visitorName: 'Chidi Visitor' },
    });
  });

  it('does not include any position in the alert', async () => {
    await service.notifyHostOfArrival('raw-token');
    const json = JSON.stringify(notifications.dispatch.mock.calls[0][0]);
    expect(json).not.toMatch(/lat|lng|live/i);
  });

  it('stays quiet when the visitor was not actually sharing their trip', async () => {
    prisma.invitation.findUnique.mockResolvedValue(invitation({ liveArrivedAt: null }));
    await service.notifyHostOfArrival('raw-token');
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('stays quiet for an unknown link', async () => {
    prisma.invitation.findUnique.mockResolvedValue(null);
    await service.notifyHostOfArrival('nope');
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('sends one alert per arrival even if the phone reports it twice', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: 'already' });
    await service.notifyHostOfArrival('raw-token');
    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(prisma.notification.findFirst.mock.calls[0][0].where).toMatchObject({
      userId: 'res-1',
      type: 'VISITOR_ARRIVED',
      payload: { path: ['invitationId'], equals: 'inv-1' },
    });
  });

  it('never throws into the visitor\'s request', async () => {
    prisma.invitation.findUnique.mockRejectedValue(new Error('db down'));
    await expect(service.notifyHostOfArrival('raw-token')).resolves.toBeUndefined();
  });
});
