import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateDisplayCode, generateSecureToken, hashSecret } from '../../common/crypto/token.util';
import { resolveVisitWindow } from '../../common/time/visit-window.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

/** Minimal identity of the authenticated resident making the request. */
export interface ResidentContext {
  userId: string;
  residentId: string;
  estateId: string;
  apartmentId: string;
  displayName: string;
}

export interface CreatedInvitationResponse {
  id: string;
  visitorName: string;
  visitorPhone?: string | null;
  residentName: string;
  apartmentLabel: string;
  validFrom: string;
  validUntil: string;
  status: string;
  displayCode: string; // plaintext — shown to the resident exactly once
  shareUrl: string; // plaintext — shown to the resident exactly once
}

export interface PublicInvitationResponse {
  visitorName: string;
  residentName: string;
  apartmentLabel: string;
  estateName: string;
  validFrom: string;
  validUntil: string;
  status: string;
  // No displayCode here — see findPublicByToken for why. This response
  // shape was previously typed as if a code were always available and
  // filled it with a hardcoded '\u2022\u2022\u2022\u2022\u2022\u2022'
  // placeholder, which rendered as six literal bullet characters with
  // no way for the visitor to tell it apart from a real (if oddly
  // styled) code — reported as "the manual code was not displayed."
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async createInvitation(
    ctx: ResidentContext,
    dto: CreateInvitationDto,
  ): Promise<CreatedInvitationResponse> {
    const apartment = await this.prisma.apartment.findFirst({
      where: { id: ctx.apartmentId, estateId: ctx.estateId },
    });
    if (!apartment) {
      throw new ForbiddenException('Apartment does not belong to this resident/estate.');
    }

    // Resolve the estate's own timezone rather than assuming UTC/the
    // server's local zone — see resolveVisitWindow's doc comment for
    // why this matters concretely. Falls back to 'UTC' only in the
    // (should-be-impossible) case where the estate row is somehow gone
    // by the time we get here; Estate.timezone always has a DB default.
    const estate = await this.prisma.estate.findUnique({
      where: { id: ctx.estateId },
      select: { timezone: true },
    });
    const { validFrom, validUntil } = resolveVisitWindow(
      estate?.timezone ?? 'UTC',
      dto.visitDate,
      dto.startTime,
      dto.endTime,
    );

    const visitor = await this.prisma.visitor.create({
      data: {
        estateId: ctx.estateId,
        fullName: dto.visitorName,
        phone: dto.visitorPhone,
      },
    });

    const secureToken = generateSecureToken();
    const displayCode = generateDisplayCode();

    const invitation = await this.prisma.invitation.create({
      data: {
        estateId: ctx.estateId,
        residentId: ctx.residentId,
        apartmentId: ctx.apartmentId,
        visitorId: visitor.id,
        secureTokenHash: hashSecret(secureToken),
        displayCodeHash: hashSecret(displayCode),
        validFrom,
        validUntil,
        status: 'ACTIVE',
        entryPolicy: dto.entryPolicy ?? 'ONE_TIME',
      },
    });

    await this.prisma.invitationEvent.create({
      data: { invitationId: invitation.id, type: 'CREATED' },
    });

    await this.auditLogs.log({
      action: 'INVITATION_CREATED',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'Invitation',
      entityId: invitation.id,
      metadata: { entryPolicy: invitation.entryPolicy },
    });

    // CLAUDE.md §27 lists "Visitor Invitation Created" as an event type,
    // but the only person who could receive it here is the resident who
    // just created it themselves — so no NotificationsService.dispatch()
    // call is made. If this event ever needs a recipient (e.g. notifying
    // an estate admin), this is the call site to add it.

    const shareUrl = `${process.env.FRONTEND_ORIGIN ?? ''}/invite/${secureToken}`;

    return {
      id: invitation.id,
      visitorName: visitor.fullName,
      visitorPhone: visitor.phone,
      residentName: ctx.displayName,
      apartmentLabel: apartment.flatNumber,
      validFrom: invitation.validFrom.toISOString(),
      validUntil: invitation.validUntil.toISOString(),
      status: invitation.status,
      displayCode, // plaintext, this response only
      shareUrl, // plaintext, this response only
    };
  }

  /**
   * Public, unauthenticated lookup used by the visitor link page. Must
   * never leak internal IDs, hashes, or data beyond what the visitor
   * legitimately needs at the gate.
   */
  async findPublicByToken(token: string): Promise<PublicInvitationResponse> {
    const tokenHash = hashSecret(token);

    const invitation = await this.prisma.invitation.findUnique({
      where: { secureTokenHash: tokenHash },
      include: {
        visitor: true,
        resident: true,
        apartment: true,
        estate: true,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }
    if (invitation.status === 'REVOKED' || invitation.status === 'CANCELLED') {
      throw new GoneException('This invitation has been revoked.');
    }
    if (invitation.validUntil.getTime() < Date.now() && invitation.status !== 'USED') {
      // Lazily reflect expiry rather than relying solely on a cron job.
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      invitation.status = 'EXPIRED';

      // CLAUDE.md §27 "Invitation Expired" — this branch fires when the
      // *visitor* opens their link after it's expired, i.e. someone other
      // than the resident, so it's a genuine "learn something new" signal
      // for the resident (unlike invitation creation, which they already
      // know about because they just did it).
      await this.notifications.dispatch({
        userId: invitation.resident.userId,
        type: 'INVITATION_EXPIRED',
        payload: { invitationId: invitation.id, visitorName: invitation.visitor.fullName },
      });
    }

    return {
      visitorName: invitation.visitor.fullName,
      residentName: invitation.resident.displayName,
      apartmentLabel: invitation.apartment.flatNumber,
      estateName: invitation.estate.name,
      validFrom: invitation.validFrom.toISOString(),
      validUntil: invitation.validUntil.toISOString(),
      status: invitation.status,
      // The plaintext display code only ever exists in memory, once, at
      // creation (see createInvitation below) — only displayCodeHash is
      // persisted, by design (schema.prisma: "Never store raw secrets").
      // It genuinely cannot be recovered here to show the visitor later,
      // so this response doesn't pretend to have one. The resident is
      // the one who sees and relays the real code, at creation time, if
      // they choose to share it as a fallback alongside the link.
    };
  }

  /**
   * Used by the resident's "Visitor history" list. Deliberately re-shaped
   * rather than returning the raw Prisma rows: those include
   * secureTokenHash/displayCodeHash, which — while not directly usable —
   * are still secrets that have no reason to ever reach the client past
   * the one-time creation response (CLAUDE.md §8: "never store a raw
   * secret token unnecessarily" extends to never re-exposing its hash).
   */
  async listForResident(ctx: ResidentContext) {
    const invitations = await this.prisma.invitation.findMany({
      where: { residentId: ctx.residentId, estateId: ctx.estateId },
      include: { visitor: true, apartment: true },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      visitorName: invitation.visitor.fullName,
      visitorPhone: invitation.visitor.phone,
      apartmentLabel: invitation.apartment.flatNumber,
      validFrom: invitation.validFrom.toISOString(),
      validUntil: invitation.validUntil.toISOString(),
      status: invitation.status,
      entryPolicy: invitation.entryPolicy,
      createdAt: invitation.createdAt.toISOString(),
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
      usedAt: invitation.usedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Backs the resident dashboard (CLAUDE.md §12). "Currently inside" and
   * "Total visits" need real Visit/entry data, not just Invitation status —
   * an invitation can be USED (one-time, entry recorded) while the visitor
   * has already exited, so status alone can't answer "is anyone here right
   * now?". Computed with count() queries rather than pulling full rows.
   */
  async getResidentOverview(ctx: ResidentContext) {
    const now = new Date();
    const scope = { residentId: ctx.residentId, estateId: ctx.estateId };

    const [activeInvitations, upcomingVisitors, totalVisits, currentlyInside] =
      await Promise.all([
        this.prisma.invitation.count({ where: { ...scope, status: 'ACTIVE' } }),
        this.prisma.invitation.count({
          where: { ...scope, status: 'ACTIVE', validFrom: { gt: now } },
        }),
        this.prisma.visit.count({
          where: { invitation: scope, enteredAt: { not: null } },
        }),
        this.prisma.visit.count({
          where: { invitation: scope, enteredAt: { not: null }, exitedAt: null },
        }),
      ]);

    return { activeInvitations, upcomingVisitors, totalVisits, currentlyInside };
  }

  async revoke(invitationId: string, ctx: ResidentContext): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, residentId: ctx.residentId, estateId: ctx.estateId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.prisma.invitationEvent.create({
      data: { invitationId, type: 'REVOKED' },
    });

    await this.auditLogs.log({
      action: 'INVITATION_REVOKED',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'Invitation',
      entityId: invitationId,
    });

    // Same reasoning as INVITATION_CREATED above: today only the owning
    // resident can revoke their own invitation, so there's no one else to
    // notify yet. Once an admin/officer-initiated revocation path exists,
    // dispatch NotificationsService.dispatch({ type: 'INVITATION_REVOKED' })
    // to the resident here.
  }
}
