import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SecurityContext } from '../verification/verification.service';
import { RecordEntryDto } from './dto/record-entry.dto';
import { RecordExitDto } from './dto/record-exit.dto';
import { DenyEntryDto } from './dto/deny-entry.dto';

/**
 * Implements CLAUDE.md §21/§22/§23/§52. Verification (VerificationService)
 * only *checks* an invitation and never mutates it; recording an actual
 * entry is the one place that consumes a ONE_TIME invitation and creates
 * the audit-relevant Visit/EntryExitEvent records, so it — not
 * verification — is where the transactional one-time-use guarantee lives.
 */
@Injectable()
export class EntryExitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
  ) {}

  async recordEntry(ctx: SecurityContext, dto: RecordEntryDto) {
    let residentUserId: string | undefined;
    let visitorName: string | undefined;

    const visit = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: { id: dto.invitationId, estateId: ctx.estateId },
        include: { resident: true, visitor: true },
      });
      if (!invitation) {
        throw new NotFoundException('Invitation not found.');
      }
      if (invitation.status === 'REVOKED' || invitation.status === 'CANCELLED') {
        throw new ForbiddenException('This invitation has been revoked.');
      }
      if (invitation.validUntil.getTime() < Date.now()) {
        throw new ForbiddenException('This invitation has expired.');
      }
      residentUserId = invitation.resident.userId;
      visitorName = invitation.visitor.fullName;

      if (invitation.entryPolicy === 'ONE_TIME') {
        // Atomic compare-and-swap: succeeds only if the invitation is
        // still ACTIVE at the moment of the update. If two gate devices
        // (or a retried request) race to allow entry on the same
        // one-time invitation, only one `updateMany` call can move
        // count from ACTIVE — the loser sees count === 0 and fails
        // cleanly instead of granting a second entry (CLAUDE.md §52).
        const cas = await tx.invitation.updateMany({
          where: { id: invitation.id, status: 'ACTIVE' },
          data: { status: 'USED', usedAt: new Date() },
        });
        if (cas.count === 0) {
          throw new ConflictException(
            'This one-time invitation has already been used.',
          );
        }
      }

      const openVisit = await tx.visit.findFirst({
        where: { invitationId: invitation.id, exitedAt: null, enteredAt: { not: null } },
      });
      if (openVisit) {
        throw new ConflictException('This visitor is already recorded as inside.');
      }

      const newVisit = await tx.visit.create({
        data: { invitationId: invitation.id, enteredAt: new Date() },
      });

      await tx.entryExitEvent.create({
        data: {
          visitId: newVisit.id,
          securityOfficerId: ctx.securityOfficerId,
          type: 'ENTRY',
        },
      });

      await tx.invitationEvent.create({
        data: { invitationId: invitation.id, type: 'ENTERED' },
      });

      return newVisit;
    });

    await this.auditLogs.log({
      action: 'ENTRY_ALLOWED',
      estateId: ctx.estateId,
      entity: 'Visit',
      entityId: visit.id,
      metadata: { invitationId: dto.invitationId },
    });

    // CLAUDE.md §27 "Visitor Entered" event. Fire-and-forget from the
    // resident's perspective: NotificationsService swallows and logs its
    // own failures rather than throwing, so a notification hiccup can
    // never undo or fail an already-recorded entry.
    if (residentUserId) {
      await this.notifications.dispatch({
        userId: residentUserId,
        type: 'VISITOR_ENTERED',
        payload: { visitId: visit.id, visitorName },
      });
    }

    return { visitId: visit.id, enteredAt: visit.enteredAt };
  }

  async recordExit(ctx: SecurityContext, dto: RecordExitDto) {
    let residentUserId: string | undefined;
    let visitorName: string | undefined;

    const visit = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.visit.findFirst({
        where: { id: dto.visitId, invitation: { estateId: ctx.estateId } },
        include: { invitation: { include: { resident: true, visitor: true } } },
      });
      if (!existing) {
        throw new NotFoundException('Visit not found.');
      }
      if (!existing.enteredAt) {
        throw new ForbiddenException('This visitor was never recorded as entering.');
      }
      if (existing.exitedAt) {
        throw new ConflictException('This visitor has already exited.');
      }
      residentUserId = existing.invitation.resident.userId;
      visitorName = existing.invitation.visitor.fullName;

      const updated = await tx.visit.update({
        where: { id: existing.id },
        data: { exitedAt: new Date() },
      });

      await tx.entryExitEvent.create({
        data: {
          visitId: updated.id,
          securityOfficerId: ctx.securityOfficerId,
          type: 'EXIT',
        },
      });

      await tx.invitationEvent.create({
        data: { invitationId: existing.invitationId, type: 'EXITED' },
      });

      return updated;
    });

    await this.auditLogs.log({
      action: 'EXIT_RECORDED',
      estateId: ctx.estateId,
      entity: 'Visit',
      entityId: visit.id,
    });

    // CLAUDE.md §27 "Visitor Exited" event.
    if (residentUserId) {
      await this.notifications.dispatch({
        userId: residentUserId,
        type: 'VISITOR_EXITED',
        payload: { visitId: visit.id, visitorName },
      });
    }

    return { visitId: visit.id, exitedAt: visit.exitedAt };
  }

  /** CLAUDE.md §23: "Who is currently inside?" */
  async listCurrentlyInside(ctx: SecurityContext) {
    const visits = await this.prisma.visit.findMany({
      where: {
        exitedAt: null,
        enteredAt: { not: null },
        invitation: { estateId: ctx.estateId },
      },
      include: {
        invitation: { include: { visitor: true, apartment: true } },
      },
      orderBy: { enteredAt: 'desc' },
    });

    return visits.map((v) => ({
      visitId: v.id,
      visitorName: v.invitation.visitor.fullName,
      apartmentLabel: v.invitation.apartment.flatNumber,
      enteredAt: v.enteredAt,
    }));
  }

  /**
   * CLAUDE.md §22/§53: security needs a record of past entries/exits, not
   * just who's inside right now. Scoped to the officer's estate the same
   * way listCurrentlyInside is.
   */
  async listHistory(ctx: SecurityContext, limit = 50) {
    const events = await this.prisma.entryExitEvent.findMany({
      where: { visit: { invitation: { estateId: ctx.estateId } } },
      include: {
        visit: { include: { invitation: { include: { visitor: true, apartment: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return events.map((e) => ({
      id: e.id,
      type: e.type,
      visitorName: e.visit.invitation.visitor.fullName,
      apartmentLabel: e.visit.invitation.apartment.flatNumber,
      occurredAt: e.createdAt,
    }));
  }

  /**
   * A denial does not revoke the invitation (the resident/officer may
   * still let the visitor try again) — it is purely an audited decision,
   * per CLAUDE.md §21 there is no "denied" invitation status to mutate.
   */
  async denyEntry(ctx: SecurityContext, dto: DenyEntryDto): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: dto.invitationId, estateId: ctx.estateId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    await this.auditLogs.log({
      action: 'ENTRY_DENIED',
      estateId: ctx.estateId,
      entity: 'Invitation',
      entityId: invitation.id,
      metadata: { reason: dto.reason },
    });
  }
}
