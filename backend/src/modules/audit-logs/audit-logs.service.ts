import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AuditLogEntry {
  action: string;
  estateId?: string | null;
  userId?: string | null;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CLAUDE.md §33: audit logging is mandatory for security-sensitive events
 * and must be append-only from normal application workflows — there is
 * deliberately no update/delete method here.
 *
 * Called from Verification and Entry/Exit (verification attempts,
 * entry/exit), Auth (login/failed login), Invitations (create/revoke),
 * and Administration (every admin write: resident/officer onboarding,
 * status changes, building/apartment changes). Keep this list current —
 * this comment is documentation, not a queue of work still to do.
 */
@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          estateId: entry.estateId ?? null,
          userId: entry.userId ?? null,
          entity: entry.entity,
          entityId: entry.entityId,
          metadata: entry.metadata as any,
        },
      });
    } catch (err) {
      // An audit log failure must never break the actual operation (e.g.
      // don't fail an entry scan because the audit write hiccuped) — but
      // it must not be silent either.
      this.logger.error(`Failed to write audit log for action "${entry.action}"`, err as Error);
    }
  }

  /** Estate-scoped read, for the future admin audit log screen (§33). */
  async listForEstate(estateId: string, take = 100) {
    return this.prisma.auditLog.findMany({
      where: { estateId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
