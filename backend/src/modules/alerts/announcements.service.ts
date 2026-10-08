import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { findRecipientUserIds } from './alert-recipients';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

export interface AnnouncementView {
  id: string;
  kind: 'ANNOUNCEMENT' | 'SECURITY_ALERT';
  title: string;
  body: string;
  authorName: string;
  createdAt: Date;
}

const LIST_LIMIT = 50;

// The lock-screen text of the push: short, single line.
export function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= 140 ? flat : `${flat.slice(0, 139).trimEnd()}\u2026`;
}

/**
 * Estate notices and urgent security alerts.
 *
 *   - Admin: can post notices AND security alerts, and delete either.
 *   - Security officer: can post security alerts only.
 *   - Resident: read-only.
 * Everyone only ever sees their OWN estate's posts. Nothing here touches
 * visitor data (CLAUDE.md §6.1): the text is whatever the author typed.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private estateOf(user: AuthenticatedUser): string {
    if (!user.estateId) throw new ForbiddenException('No estate scope available for this account.');
    return user.estateId;
  }

  async create(user: AuthenticatedUser, dto: CreateAnnouncementDto): Promise<AnnouncementView> {
    const estateId = this.estateOf(user);
    if (user.role === 'SECURITY_OFFICER' && dto.kind !== 'SECURITY_ALERT') {
      throw new ForbiddenException('Security officers can only send security alerts.');
    }

    const created = await this.prisma.announcement.create({
      data: {
        estateId,
        authorId: user.userId,
        authorName: user.displayName,
        kind: dto.kind,
        title: dto.title,
        body: dto.body,
      },
    });

    // Everyone in the estate except the author. Delivery is best effort and
    // never fails the post: the notice is already saved and visible in the feed.
    const recipients = (await findRecipientUserIds(this.prisma, estateId, ['RESIDENTS', 'OFFICERS', 'ADMINS'])).filter(
      (id) => id !== user.userId,
    );
    await this.notifications.dispatchMany(
      recipients,
      dto.kind === 'SECURITY_ALERT' ? 'SECURITY_ALERT' : 'ANNOUNCEMENT_POSTED',
      { announcementId: created.id, title: created.title, preview: previewOf(created.body) },
    );

    await this.auditLogs.log({
      action: 'ANNOUNCEMENT_POSTED',
      userId: user.userId,
      estateId,
      entity: 'Announcement',
      entityId: created.id,
      metadata: { kind: created.kind },
    });

    return this.toView(created);
  }

  async list(user: AuthenticatedUser, kind?: 'ANNOUNCEMENT' | 'SECURITY_ALERT'): Promise<AnnouncementView[]> {
    const estateId = this.estateOf(user);
    const rows = await this.prisma.announcement.findMany({
      where: { estateId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map((r) => this.toView(r));
  }

  async remove(user: AuthenticatedUser, id: string): Promise<{ deleted: true }> {
    const estateId = this.estateOf(user);
    const result = await this.prisma.announcement.deleteMany({ where: { id, estateId } });
    if (result.count === 0) throw new NotFoundException('Announcement not found.');
    await this.auditLogs.log({
      action: 'ANNOUNCEMENT_DELETED',
      userId: user.userId,
      estateId,
      entity: 'Announcement',
      entityId: id,
    });
    return { deleted: true };
  }

  private toView(row: {
    id: string;
    kind: string;
    title: string;
    body: string;
    authorName: string;
    createdAt: Date;
  }): AnnouncementView {
    return {
      id: row.id,
      kind: row.kind as AnnouncementView['kind'],
      title: row.title,
      body: row.body,
      authorName: row.authorName,
      createdAt: row.createdAt,
    };
  }
}
