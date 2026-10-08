import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../../../prisma/prisma.service';
import { isAllowedPushEndpoint } from './push-endpoint';
import type { PushMessage } from './push-message';
import { SubscribePushDto } from './dto/subscribe-push.dto';

// More than this many phones/browsers per person is almost certainly stale
// registrations; the oldest are dropped.
export const MAX_DEVICES_PER_USER = 10;
const SEND_BATCH_SIZE = 20;

/**
 * Web Push delivery (the browser's built-in push, no third-party app).
 *
 * Optional by design: without the VAPID keys in the environment push is
 * simply "off" - the in-app bell keeps working exactly as before, and
 * nothing here ever throws into the code that raised the notification.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
      this.logger.warn('Push notifications are OFF: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to turn them on.');
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.enabled = true;
    } catch (err) {
      this.logger.error('Push notifications are OFF: the VAPID settings are invalid.', err as Error);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getConfig(): { enabled: boolean; publicKey: string | null } {
    return { enabled: this.enabled, publicKey: this.enabled ? this.publicKey : null };
  }

  async subscribe(userId: string, dto: SubscribePushDto, userAgent?: string): Promise<void> {
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException('That push service is not supported.');
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      // Same device, possibly a different person signing in: it moves to them.
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });

    const mine = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (mine.length > MAX_DEVICES_PER_USER) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: mine.slice(MAX_DEVICES_PER_USER).map((s) => s.id) } },
      });
    }
  }

  /** Scoped to the caller: nobody can unsubscribe someone else's device. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    await this.sendToUsers([userId], message);
  }

  /**
   * Best effort. A failed or slow push service must never break whatever
   * triggered the notification, so every error is caught here.
   */
  async sendToUsers(userIds: string[], message: PushMessage): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: userIds } },
      });
      const body = JSON.stringify(message);
      const options = {
        TTL: message.urgent ? 60 * 60 : 24 * 60 * 60,
        urgency: message.urgent ? ('high' as const) : ('normal' as const),
        timeout: 10_000,
      };

      for (let i = 0; i < subscriptions.length; i += SEND_BATCH_SIZE) {
        const batch = subscriptions.slice(i, i + SEND_BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                body,
                options,
              );
            } catch (err) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                // The device unsubscribed or the app was uninstalled.
                await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
              } else {
                this.logger.warn(`Push to a device failed (status ${status ?? 'none'}).`);
              }
            }
          }),
        );
      }
    } catch (err) {
      this.logger.error('Sending push notifications failed.', err as Error);
    }
  }
}
