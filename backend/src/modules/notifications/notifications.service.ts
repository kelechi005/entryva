import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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
  | 'INVITATION_EXPIRED';

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
 * V1 has no web push / SMS / WhatsApp / email provider wired up — see
 * `deliver()`. That means notifications are currently in-app/poll-based
 * only, which CLAUDE.md §27 explicitly allows ("V1 can prioritize web
 * push/in-app notifications"). Swapping in a real provider later is a
 * change to `deliver()` alone; no caller of `dispatch()` needs to change.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Provider dispatch point. No push/SMS/WhatsApp/email provider is
   * configured in this scaffold, so this is a deliberate no-op beyond a
   * debug log — the in-app `Notification` row created in `dispatch()`
   * above is the real, functioning delivery mechanism for V1. Adding a
   * provider (e.g. web push) later means implementing this method; it
   * does not touch any call site.
   */
  private async deliver(
    notificationId: string,
    input: DispatchNotificationInput,
  ): Promise<void> {
    this.logger.debug(
      `[stub] would push-deliver notification ${notificationId} (${input.type}) to user ${input.userId}`,
    );
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
