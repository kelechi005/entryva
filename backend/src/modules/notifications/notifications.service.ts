import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { buildPushMessage } from '../push/push-message';

/**
 * CLAUDE.md §27: "Support an internal notification abstraction... do not
 * tightly couple business logic to one notification provider." These are
 * the event types other modules dispatch.
 */
export type NotificationType =
  | 'INVITATION_CREATED'
  | 'VISITOR_VERIFIED'
  | 'VISITOR_ENTERED'
  | 'VISITOR_EXITED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_EXTENDED'
  | 'RECURRING_PASS_ENTERED'
  | 'RECURRING_PASS_EXITED'
  | 'RECURRING_PASS_OVERDUE'
  | 'VISITOR_ARRIVED'
  | 'ANNOUNCEMENT_POSTED'
  | 'SECURITY_ALERT'
  | 'EMERGENCY_RAISED'
  | 'EMERGENCY_ACKNOWLEDGED'
  | 'EMERGENCY_RESOLVED';

export interface DispatchNotificationInput {
  userId: string;
  type: NotificationType;
  payload?: Record<string, unknown>;
}

/**
 * Internal notification abstraction (CLAUDE.md §27). Callers never talk to
 * a delivery provider directly — they call `dispatch()` with a userId and
 * an event type, and this service owns:
 *   1. persisting an in-app `Notification` row (always — this is what
 *      backs the resident-facing notification list/bell today), and
 *   2. handing the event to whatever provider(s) are configured (§ below).
 *
 * Delivery is in-app (the bell, always) plus Web Push to the person's
 * phones/browsers when push is switched on (`PushService`; off without the
 * VAPID keys, in which case the bell works exactly as before). SMS /
 * WhatsApp / email are still not wired. Adding one later is a change to
 * `deliver()` alone; no caller of `dispatch()` needs to change.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async dispatch(input: DispatchNotificationInput): Promise<void> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          payload: (input.payload ?? undefined) as any,
        },
      });
      await this.deliver(notification.id, input);
    } catch (err) {
      // A notification failure must never break the operation that
      // triggered it (e.g. don't fail an entry scan because a
      // notification write hiccuped) — same principle as AuditLogsService.
      this.logger.error(
        `Failed to dispatch notification "${input.type}" to user ${input.userId}`,
        err as Error,
      );
    }
  }

  /**
   * Tell many people at once (announcements, emergencies): one saved bell
   * entry each, and a single push fan-out. Same never-throws rule as
   * `dispatch()`.
   */
  async dispatchMany(
    userIds: string[],
    type: NotificationType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const recipients = [...new Set(userIds)];
    if (recipients.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: recipients.map((userId) => ({ userId, type, payload: (payload ?? undefined) as any })),
      });
      // Not awaited: a slow push service must never hold up the request
      // (an emergency being raised, a post being published).
      void this.push.sendToUsers(recipients, buildPushMessage(type, payload)).catch(() => undefined);
    } catch (err) {
      this.logger.error(`Failed to dispatch notification "${type}" to ${recipients.length} users`, err as Error);
    }
  }

  /**
   * Phone/browser delivery. Fire-and-forget on purpose: Web Push talks to
   * outside servers that can be slow, and a gate scan must never wait on
   * them. `PushService` swallows its own errors; the .catch is a belt and
   * braces for anything unexpected.
   */
  private async deliver(
    notificationId: string,
    input: DispatchNotificationInput,
  ): Promise<void> {
    void notificationId;
    void this.push
      .sendToUser(input.userId, buildPushMessage(input.type, input.payload))
      .catch(() => undefined);
  }

  /** Resident/officer-facing in-app list — most recent first. */
  async listForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    // Scoped to userId so one user can never mark (or even discover the
    // existence of) another user's notification as read.
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification not found.');
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
