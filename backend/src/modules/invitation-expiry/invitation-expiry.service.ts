import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How often passes whose time has run out are marked expired. */
export const EXPIRY_SWEEP_MS = 60_000;
/** Residents are only told about passes that expired in the last day. */
export const NOTIFY_WITHIN_MS = 24 * 3600_000;
const BATCH = 200;

/**
 * A pass used to turn "expired" only when somebody scanned it or opened its
 * link, so an unused pass stayed "Active" for ever. This marks them expired
 * soon after their time runs out, whether or not anyone touches them.
 */
@Injectable()
export class InvitationExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvitationExpiryService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), EXPIRY_SWEEP_MS);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now: Date = new Date()): Promise<{ expired: number }> {
    if (this.running) return { expired: 0 };
    this.running = true;
    try {
      const recentCutoff = new Date(now.getTime() - NOTIFY_WITHIN_MS);

      // Long gone: mark expired quietly. Nobody needs a message about last month.
      const quiet = await this.prisma.invitation.updateMany({
        where: { status: 'ACTIVE', validUntil: { lt: recentCutoff } },
        data: { status: 'EXPIRED' },
      });

      // Recently run out: mark expired and tell the resident once.
      const recent = await this.prisma.invitation.findMany({
        where: { status: 'ACTIVE', validUntil: { lt: now } },
        take: BATCH,
        select: {
          id: true,
          resident: { select: { userId: true } },
          visitor: { select: { fullName: true } },
        },
      });

      let expired = quiet.count;
      for (const inv of recent) {
        // Only the sweep that really changes the row sends the message.
        const changed = await this.prisma.invitation.updateMany({
          where: { id: inv.id, status: 'ACTIVE', validUntil: { lt: now } },
          data: { status: 'EXPIRED' },
        });
        if (changed.count !== 1) continue;
        expired += 1;
        await this.notifications.dispatch({
          userId: inv.resident.userId,
          type: 'INVITATION_EXPIRED',
          payload: { invitationId: inv.id, visitorName: inv.visitor.fullName },
        });
      }
      return { expired };
    } catch (err) {
      this.logger.warn(`Expiry sweep failed: ${err instanceof Error ? err.message : String(err)}`);
      return { expired: 0 };
    } finally {
      this.running = false;
    }
  }
}
