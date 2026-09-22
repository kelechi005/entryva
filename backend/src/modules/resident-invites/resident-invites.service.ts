import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../../common/email/email.service';
import type { EmailSendResult } from '../../common/email/email.service';
import { generateSecureToken, hashSecret } from '../../common/crypto/token.util';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateResidentInviteDto } from './dto/create-resident-invite.dto';
import { CompleteResidentInviteDto } from './dto/complete-resident-invite.dto';
import { CancelResidentInviteDto } from './dto/cancel-resident-invite.dto';

const INVITE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours, per the agreed design

export interface PublicResidentInvitePreview {
  apartmentLabel: string;
  buildingName: string;
  estateName: string;
  email: string;
  expiresAt: string;
}

@Injectable()
export class ResidentInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogs: AuditLogsService,
    private readonly email: EmailService,
  ) {}

  // Same estate-scoping rule as AdministrationService.resolveEstateId —
  // duplicated rather than shared across modules to avoid coupling two
  // otherwise-independent modules to one private implementation detail.
  private resolveEstateId(user: AuthenticatedUser, requestedEstateId?: string): string {
    if (user.role === 'SUPER_ADMIN') {
      if (!requestedEstateId) {
        throw new ForbiddenException('estateId is required for SUPER_ADMIN requests.');
      }
      return requestedEstateId;
    }
    if (user.role === 'ESTATE_ADMIN' && user.estateId) {
      return user.estateId;
    }
    throw new ForbiddenException('No estate scope available for this account.');
  }

  /**
   * Admin picks the apartment + types the email — this is the one and
   * only place identity/apartment binding is decided. Everything the
   * resident fills in later (name, password) can never change which
   * apartment the resulting account is attached to.
   */
  async createInvite(user: AuthenticatedUser, estateId: string | undefined, dto: CreateResidentInviteDto) {
    const scopedEstateId = this.resolveEstateId(user, estateId);

    const apartment = await this.prisma.apartment.findFirst({
      where: { id: dto.apartmentId, estateId: scopedEstateId },
      include: { building: true },
    });
    if (!apartment) {
      throw new NotFoundException('Apartment not found in this estate.');
    }

    // Hard stop, not a warning the admin can click past — per the agreed
    // design, an apartment already assigned to a resident cannot have a
    // second invite created for it. (A household with multiple adults
    // is a real, deliberate product decision to revisit separately —
    // this endpoint enforces "one invite flow per apartment" as asked.)
    if (apartment.status === 'OCCUPIED') {
      throw new ConflictException(
        `Apartment "${apartment.flatNumber}" already has a resident assigned. ` +
          `Remove the existing resident first if this is a re-assignment.`,
      );
    }

    // An email already tied to any account (any role) can't be reused —
    // prevents silently issuing a second account to the same address.
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('An account with that email already exists.');
    }

    // A stale, still-PENDING invite for the same apartment (e.g. the
    // admin picked the wrong email and is redoing it) is superseded
    // rather than left dangling — only one live invite per apartment.
    await this.prisma.residentInvite.updateMany({
      where: { apartmentId: apartment.id, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });

    const rawToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.residentInvite.create({
      data: {
        estateId: scopedEstateId,
        apartmentId: apartment.id,
        email: dto.email,
        tokenHash: hashSecret(rawToken),
        expiresAt,
        invitedById: user.userId,
      },
    });

    const estate = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    const inviteUrl = this.buildInviteUrl(rawToken);
    const emailStatus = await this.sendInviteEmail({
      to: invite.email,
      apartmentLabel: `${apartment.building.name} \u00b7 ${apartment.flatNumber}`,
      estateName: estate?.name ?? 'your estate',
      rawToken,
      expiresAt: invite.expiresAt,
    });

    await this.auditLogs.log({
      action: 'RESIDENT_INVITE_CREATED',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentInvite',
      entityId: invite.id,
      metadata: { apartmentId: apartment.id, email: dto.email, emailStatus },
    });

    // inviteUrl is included regardless of emailStatus so the admin can
    // always copy/share it by hand — the one-time token only exists in
    // memory here (only its hash is persisted), so this response is the
    // only chance to hand it to anyone. Genuinely necessary, not just a
    // nice-to-have, whenever emailStatus isn't 'sent'.
    return {
      id: invite.id,
      email: invite.email,
      apartmentId: invite.apartmentId,
      expiresAt: invite.expiresAt,
      inviteUrl,
      emailSent: emailStatus === 'sent',
      emailStatus,
    };
  }

  /**
   * Invalidates whatever token was already out (if the resident never
   * got it, or it expired) and issues + sends a fresh one. Deliberately
   * a full replace, not an extension — an old link a resident might
   * still have sitting in their email stops working the moment a new
   * one is requested.
   */
  async resendInvite(user: AuthenticatedUser, estateId: string | undefined, inviteId: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const existing = await this.prisma.residentInvite.findFirst({
      where: { id: inviteId, estateId: scopedEstateId },
      include: { apartment: { include: { building: true } } },
    });
    if (!existing) throw new NotFoundException('Invite not found in this estate.');
    if (existing.status === 'USED') {
      throw new ConflictException('This invite has already been used to create an account.');
    }

    const rawToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.residentInvite.update({
      where: { id: existing.id },
      data: { tokenHash: hashSecret(rawToken), expiresAt, status: 'PENDING' },
    });

    const estate = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    const inviteUrl = this.buildInviteUrl(rawToken);
    const emailStatus = await this.sendInviteEmail({
      to: invite.email,
      apartmentLabel: `${existing.apartment.building.name} \u00b7 ${existing.apartment.flatNumber}`,
      estateName: estate?.name ?? 'your estate',
      rawToken,
      expiresAt: invite.expiresAt,
    });

    await this.auditLogs.log({
      action: 'RESIDENT_INVITE_RESENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentInvite',
      entityId: invite.id,
      metadata: { emailStatus },
    });

    return {
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
      inviteUrl,
      emailSent: emailStatus === 'sent',
      emailStatus,
    };
  }

  /**
   * Cancels a not-yet-used invite — e.g. the admin picked the wrong
   * apartment, or the person backed out before ever opening the link.
   * Unlike resendInvite, this does NOT issue a new token; the invite is
   * simply dead. The resident (who has no account yet, just an email
   * address on file) is told by email, since there's no in-app
   * notification target until an account actually exists.
   */
  async cancelInvite(
    user: AuthenticatedUser,
    estateId: string | undefined,
    inviteId: string,
    dto: CancelResidentInviteDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const invite = await this.prisma.residentInvite.findFirst({
      where: { id: inviteId, estateId: scopedEstateId },
      include: { apartment: { include: { building: true } } },
    });
    if (!invite) throw new NotFoundException('Invite not found in this estate.');
    if (invite.status === 'USED') {
      throw new ConflictException('This invite has already been used; the resident already has an account.');
    }
    if (invite.status === 'REVOKED') {
      throw new ConflictException('This invite was already cancelled.');
    }

    await this.prisma.residentInvite.update({
      where: { id: invite.id },
      data: { status: 'REVOKED' },
    });

    const estate = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    await this.email.sendResidentInviteCancelledEmail({
      to: invite.email,
      apartmentLabel: `${invite.apartment.building.name} \u00b7 ${invite.apartment.flatNumber}`,
      estateName: estate?.name ?? 'your estate',
      reason: dto.reason,
    });

    await this.auditLogs.log({
      action: 'RESIDENT_INVITE_CANCELLED',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentInvite',
      entityId: invite.id,
      metadata: { reason: dto.reason ?? null },
    });

    return { cancelled: true };
  }

  async listInvites(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    return this.prisma.residentInvite.findMany({
      where: { estateId: scopedEstateId },
      include: { apartment: { include: { building: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildInviteUrl(rawToken: string): string {
    return `${process.env.FRONTEND_ORIGIN ?? ''}/onboard/${rawToken}`;
  }

  private async sendInviteEmail(params: {
    to: string;
    apartmentLabel: string;
    estateName: string;
    rawToken: string;
    expiresAt: Date;
  }): Promise<EmailSendResult> {
    return this.email.sendResidentInviteEmail({
      to: params.to,
      apartmentLabel: params.apartmentLabel,
      estateName: params.estateName,
      inviteUrl: this.buildInviteUrl(params.rawToken),
      expiresAt: params.expiresAt,
    });
  }

  // ---- Public (unauthenticated) side: the resident's own view ----

  /**
   * GET-time lookup only — deliberately does NOT consume the token.
   * Some email clients/security scanners pre-fetch links automatically
   * before a human ever opens the email; if a mere page load burned the
   * token, those scanners would silently kill real invites. Only
   * completeInvite() (the actual POST) consumes it.
   */
  async previewByToken(rawToken: string): Promise<PublicResidentInvitePreview> {
    const invite = await this.findLiveInviteByToken(rawToken);
    return {
      apartmentLabel: invite.apartment.flatNumber,
      buildingName: invite.apartment.building.name,
      estateName: invite.estate.name,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async completeInvite(rawToken: string, dto: CompleteResidentInviteDto) {
    const invite = await this.findLiveInviteByToken(rawToken);

    // Re-check occupancy at the moment of completion, not just at
    // invite-creation time — closes the race where two invites for
    // different apartments somehow overlap, or where an admin manually
    // assigned a resident to this apartment in the meantime.
    const apartment = await this.prisma.apartment.findUnique({ where: { id: invite.apartmentId } });
    if (!apartment) throw new NotFoundException('Apartment no longer exists.');
    if (apartment.status === 'OCCUPIED') {
      throw new ConflictException(
        'This apartment already has a resident. Contact your estate admin if this is unexpected.',
      );
    }

    const passwordHash = await this.authService.hashPassword(dto.password);

    const resident = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email: invite.email, phone: dto.phone, passwordHash, role: 'RESIDENT' },
      });
      const created = await tx.residentProfile.create({
        data: {
          userId: newUser.id,
          estateId: invite.estateId,
          apartmentId: invite.apartmentId,
          displayName: dto.displayName,
          phone: dto.phone,
        },
      });
      await tx.apartment.update({ where: { id: invite.apartmentId }, data: { status: 'OCCUPIED' } });
      await tx.residentInvite.update({
        where: { id: invite.id },
        data: { status: 'USED', usedAt: new Date() },
      });
      return created;
    });

    await this.auditLogs.log({
      action: 'RESIDENT_INVITE_COMPLETED',
      userId: resident.userId,
      estateId: invite.estateId,
      entity: 'ResidentProfile',
      entityId: resident.id,
      metadata: { apartmentId: invite.apartmentId, viaInviteId: invite.id },
    });

    return { residentId: resident.id };
  }

  /**
   * Shared lookup for both the preview and the completion endpoints:
   * hash the presented token, find the invite, and reject anything
   * that isn't PENDING and unexpired. GoneException (410) rather than
   * NotFoundException (404) once we know the row exists but is
   * dead — a clearer signal to the frontend ("this link expired") than
   * "this link never existed".
   */
  private async findLiveInviteByToken(rawToken: string) {
    const tokenHash = hashSecret(rawToken);
    const invite = await this.prisma.residentInvite.findUnique({
      where: { tokenHash },
      include: { apartment: { include: { building: true } }, estate: true },
    });
    if (!invite) {
      throw new NotFoundException('This invite link is invalid.');
    }
    if (invite.status === 'USED') {
      throw new GoneException('This invite link has already been used.');
    }
    if (invite.status !== 'PENDING' || invite.expiresAt.getTime() < Date.now()) {
      throw new GoneException('This invite link has expired. Ask your estate admin to resend it.');
    }
    return invite;
  }
}
