import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { hashSecret } from '../../common/crypto/token.util';
import { NotificationsService } from '../notifications/notifications.service';

// The visitor's phone can report "arrived" more than once (a retry, a
// double tap). One alert per invitation per this long is plenty.
const ARRIVAL_DEDUPE_MS = 30 * 60 * 1000;

/**
 * "Your visitor is at the gate" - tells the resident who invited them, and
 * only them. It fires only when the visitor chose to share their trip and
 * their own phone confirmed they reached the gate; it never exposes where
 * the visitor is, only that they arrived. Security officers and admins are
 * not told (CLAUDE.md §6): they see visitors at the gate, via verification.
 */
@Injectable()
export class ArrivalAlertsService {
  private readonly logger = new Logger(ArrivalAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Best effort: never throws into the visitor's request. */
  async notifyHostOfArrival(rawToken: string): Promise<void> {
    try {
      const invitation = await this.prisma.invitation.findUnique({
        where: { secureTokenHash: hashSecret(rawToken) },
        include: { resident: { select: { userId: true } }, visitor: { select: { fullName: true } } },
      });
      // No arrival recorded (the visitor was not actually sharing): nothing to tell.
      if (!invitation || !invitation.liveArrivedAt) return;

      const recent = await this.prisma.notification.findFirst({
        where: {
          userId: invitation.resident.userId,
          type: 'VISITOR_ARRIVED',
          createdAt: { gte: new Date(Date.now() - ARRIVAL_DEDUPE_MS) },
          payload: { path: ['invitationId'], equals: invitation.id },
        },
        select: { id: true },
      });
      if (recent) return;

      await this.notifications.dispatch({
        userId: invitation.resident.userId,
        type: 'VISITOR_ARRIVED',
        payload: { invitationId: invitation.id, visitorName: invitation.visitor.fullName },
      });
    } catch (err) {
      this.logger.error('Could not send the visitor-arrival alert.', err as Error);
    }
  }
}
