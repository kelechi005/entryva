import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashSecret } from '../../common/crypto/token.util';
import { VerifyQrDto } from './dto/verify-qr.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

/** Attached by SecurityContextGuard — see common/guards/security-context.guard.ts. */
export interface SecurityContext {
  securityOfficerId: string;
  estateId: string;
}

export type PublicVerificationOutcome =
  | 'VALID'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'REVOKED'
  | 'ALREADY_USED'
  | 'NOT_FOUND';

export interface VerificationResult {
  outcome: PublicVerificationOutcome;
  invitation?: {
    invitationId: string;
    visitorName: string;
    residentName: string;
    residentPhone: string | null;
    apartmentLabel: string;
    validUntil: string;
    status: string;
    entryPolicy: string;
  };
}

/**
 * Implements CLAUDE.md §8/§9/§18/§19/§58: resolve an opaque QR token or a
 * manual visitor code to an invitation, run every validity check
 * server-side, and return only the minimum information the gate needs —
 * never raw tokens, never data from another estate. Every attempt
 * (success or failure) is recorded as a VerificationEvent for the audit
 * trail, whether or not the invitation itself could be identified.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
  ) {}

  async verifyByQr(ctx: SecurityContext, dto: VerifyQrDto): Promise<VerificationResult> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { secureTokenHash: hashSecret(dto.token) },
      include: { visitor: true, resident: true, apartment: true },
    });
    return this.evaluateAndRecord(ctx, invitation, 'QR', dto.offline ?? false);
  }

  async verifyByCode(ctx: SecurityContext, dto: VerifyCodeDto): Promise<VerificationResult> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // displayCodeHash is not globally unique (only secureTokenHash is —
    // see schema.prisma), so a manual-code lookup is scoped to this
    // officer's own estate and prefers the most recently created match.
    // Collisions are astronomically unlikely given the code's entropy
    // (see token.util.ts) but are handled gracefully rather than assumed
    // impossible.
    const invitation = await this.prisma.invitation.findFirst({
      where: { estateId: ctx.estateId, displayCodeHash: hashSecret(normalizedCode) },
      include: { visitor: true, resident: true, apartment: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.evaluateAndRecord(ctx, invitation, 'MANUAL_CODE', false);
  }

  private async evaluateAndRecord(
    ctx: SecurityContext,
    invitation:
      | (import('@prisma/client').Invitation & {
          visitor: import('@prisma/client').Visitor;
          resident: import('@prisma/client').ResidentProfile;
          apartment: import('@prisma/client').Apartment;
        })
      | null,
    method: 'QR' | 'MANUAL_CODE',
    offline: boolean,
  ): Promise<VerificationResult> {
    // Cross-estate match: never reveal to the officer that *some*
    // invitation matched elsewhere — that would leak the existence of
    // another estate's data. Report NOT_FOUND to the client, but record
    // the true outcome (WRONG_ESTATE) in the append-only VerificationEvent
    // for internal audit visibility.
    const wrongEstate = !!invitation && invitation.estateId !== ctx.estateId;
    const effectiveInvitation = wrongEstate ? null : invitation;

    let justExpired = false;
    let outcome: PublicVerificationOutcome;
    if (!effectiveInvitation) {
      outcome = 'NOT_FOUND';
    } else if (
      effectiveInvitation.status === 'REVOKED' ||
      effectiveInvitation.status === 'CANCELLED'
    ) {
      outcome = 'REVOKED';
    } else if (effectiveInvitation.entryPolicy === 'ONE_TIME' && effectiveInvitation.status === 'USED') {
      outcome = 'ALREADY_USED';
    } else if (effectiveInvitation.validUntil.getTime() < Date.now()) {
      outcome = 'EXPIRED';
      // Lazily reflect expiry, same pattern as the public invitation lookup.
      if (effectiveInvitation.status !== 'EXPIRED') {
        await this.prisma.invitation.update({
          where: { id: effectiveInvitation.id },
          data: { status: 'EXPIRED' },
        });
        // Only a genuine "past validUntil" transition counts as the
        // invitation actually expiring — not the validFrom branch below,
        // which reuses the EXPIRED outcome as a stand-in for "not yet
        // valid" and must not notify the resident that it expired.
        justExpired = true;
      }
    } else if (effectiveInvitation.validFrom.getTime() > Date.now()) {
      // Distinct from EXPIRED: the invitation is real and unrevoked, it
      // just hasn't opened yet. Never mutates invitation.status — unlike
      // the EXPIRED branch above, there is nothing to lazily transition
      // here, since "not yet valid" isn't a terminal state.
      outcome = 'NOT_YET_VALID';
    } else {
      outcome = 'VALID';
    }

    const recordedOutcome: import('@prisma/client').VerificationOutcome = wrongEstate
      ? 'WRONG_ESTATE'
      : outcome;

    await this.prisma.verificationEvent.create({
      data: {
        invitationId: invitation?.id, // recorded even for WRONG_ESTATE/EXPIRED — never for a token that matched nothing at all
        securityOfficerId: ctx.securityOfficerId,
        outcome: recordedOutcome,
        method,
        offline,
      },
    });

    await this.auditLogs.log({
      action: 'INVITATION_VERIFIED',
      estateId: ctx.estateId,
      entity: 'Invitation',
      entityId: effectiveInvitation?.id,
      metadata: { outcome, method, wrongEstate },
    });

    // CLAUDE.md §27 "Visitor Verified"/"Invitation Expired" events. Both
    // are resident-facing signals triggered by someone else's action (a
    // gate scan) rather than the resident's own, unlike e.g. invitation
    // creation or a resident-initiated revocation, which the resident
    // already knows about and doesn't need notified of.
    if (effectiveInvitation) {
      if (outcome === 'VALID') {
        await this.notifications.dispatch({
          userId: effectiveInvitation.resident.userId,
          type: 'VISITOR_VERIFIED',
          payload: {
            invitationId: effectiveInvitation.id,
            visitorName: effectiveInvitation.visitor.fullName,
          },
        });
      } else if (justExpired) {
        await this.notifications.dispatch({
          userId: effectiveInvitation.resident.userId,
          type: 'INVITATION_EXPIRED',
          payload: {
            invitationId: effectiveInvitation.id,
            visitorName: effectiveInvitation.visitor.fullName,
          },
        });
      }
    }

    if (!effectiveInvitation) {
      return { outcome };
    }

    return {
      outcome,
      invitation: {
        invitationId: effectiveInvitation.id,
        visitorName: effectiveInvitation.visitor.fullName,
        residentName: effectiveInvitation.resident.displayName,
        residentPhone: effectiveInvitation.resident.phone ?? null,
        apartmentLabel: effectiveInvitation.apartment.flatNumber,
        validUntil: effectiveInvitation.validUntil.toISOString(),
        status: effectiveInvitation.status,
        entryPolicy: effectiveInvitation.entryPolicy,
      },
    };
  }
}
