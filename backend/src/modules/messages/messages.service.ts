import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface MessageDto {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface ThreadSummaryDto {
  officer: { userId: string; displayName: string };
  lastMessage: MessageDto | null;
  unreadCount: number;
}

const MAX_PAGE_SIZE = 50;

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists the message. This -- not the socket relay in CallsGateway --
   * is the source of truth: a message must survive both parties being
   * offline at the moment it's sent (the recipient reads it on next
   * open), so unlike call signaling (which is meaningless once nobody's
   * listening) this can never be socket-only.
   */
  async send(estateId: string, fromUserId: string, toUserId: string, body: string): Promise<MessageDto> {
    await this.assertSameEstateOfficer(estateId, toUserId);

    const message = await this.prisma.officerMessage.create({
      data: { estateId, fromUserId, toUserId, body },
    });
    return this.serialize(message);
  }

  /**
   * Newest-first page of the conversation between `userId` and
   * `otherUserId`. `cursor` is the id of the oldest message already
   * loaded -- standard "load older messages on scroll-up" pagination,
   * the same direction a chat thread actually scrolls.
   */
  async getThread(
    estateId: string,
    userId: string,
    otherUserId: string,
    cursor?: string,
    limit = MAX_PAGE_SIZE,
  ): Promise<MessageDto[]> {
    const messages = await this.prisma.officerMessage.findMany({
      where: {
        estateId,
        OR: [
          { fromUserId: userId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, MAX_PAGE_SIZE),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return messages.map((m) => this.serialize(m));
  }

  /** Marks every message *from* otherUserId *to* userId as read. */
  async markThreadRead(estateId: string, userId: string, otherUserId: string): Promise<void> {
    await this.prisma.officerMessage.updateMany({
      where: { estateId, toUserId: userId, fromUserId: otherUserId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * One row per other officer in the estate, each with their last
   * message (if any) and how many are unread -- the data the WhatsApp-
   * style officer list needs. Estate security teams are small (a
   * handful of officers per shift), so N+1-shaped queries here are a
   * deliberate simplicity trade-off over a single grouped raw query;
   * revisit if an estate's officer count ever grows past the dozens.
   */
  async listThreadSummaries(estateId: string, userId: string): Promise<ThreadSummaryDto[]> {
    const officers = await this.prisma.securityOfficerProfile.findMany({
      where: { estateId, status: 'ACTIVE', userId: { not: userId } },
      select: { userId: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });

    return Promise.all(
      officers.map(async (officer) => {
        const [lastMessage, unreadCount] = await Promise.all([
          this.prisma.officerMessage.findFirst({
            where: {
              estateId,
              OR: [
                { fromUserId: userId, toUserId: officer.userId },
                { fromUserId: officer.userId, toUserId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.officerMessage.count({
            where: { estateId, toUserId: userId, fromUserId: officer.userId, readAt: null },
          }),
        ]);

        return {
          officer: { userId: officer.userId, displayName: officer.fullName },
          lastMessage: lastMessage ? this.serialize(lastMessage) : null,
          unreadCount,
        };
      }),
    );
  }

  /**
   * Messaging is officer-to-officer within one estate only -- same
   * boundary CallsGateway enforces for calls. Without this check, a
   * userId from a different estate (or a non-officer account) would
   * otherwise happily receive a persisted message with no recipient who
   * could ever see it.
   */
  private async assertSameEstateOfficer(estateId: string, userId: string): Promise<void> {
    const target = await this.prisma.securityOfficerProfile.findUnique({ where: { userId } });
    if (!target || target.estateId !== estateId || target.status !== 'ACTIVE') {
      throw new ForbiddenException('Recipient is not an active security officer on your estate.');
    }
  }

  private serialize(message: {
    id: string;
    fromUserId: string;
    toUserId: string;
    body: string;
    readAt: Date | null;
    createdAt: Date;
  }): MessageDto {
    return {
      id: message.id,
      fromUserId: message.fromUserId,
      toUserId: message.toUserId,
      body: message.body,
      readAt: message.readAt ? message.readAt.toISOString() : null,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
