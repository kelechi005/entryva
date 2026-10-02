import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdatePassRulesDto } from './dto/update-pass-rules.dto';
import { evaluateExtension, type ExtensionDecision, type ExtensionRules } from './extension.rules';

export interface ExtendContext {
  userId: string;
  residentId: string;
  estateId: string;
  displayName: string;
}

const RULE_SELECT = {
  timezone: true,
  passExtensionsEnabled: true,
  passExtendMaxMinutes: true,
  passMaxTotalMinutes: true,
  passQuietFromMinute: true,
  passQuietToMinute: true,
} as const;

interface EstateRuleRow {
  timezone: string;
  passExtensionsEnabled: boolean;
  passExtendMaxMinutes: number;
  passMaxTotalMinutes: number;
  passQuietFromMinute: number | null;
  passQuietToMinute: number | null;
}

function toRules(e: EstateRuleRow): ExtensionRules {
  return {
    enabled: e.passExtensionsEnabled,
    maxExtendMinutes: e.passExtendMaxMinutes,
    maxTotalMinutes: e.passMaxTotalMinutes,
    quietFromMinute: e.passQuietFromMinute,
    quietToMinute: e.passQuietToMinute,
  };
}

function exceptionFor(d: Extract<ExtensionDecision, { ok: false }>): HttpException {
  switch (d.code) {
    case 'ALREADY_USED':
      return new ConflictException(d.message);
    case 'INVALID_AMOUNT':
    case 'TOO_LONG_REQUEST':
    case 'TOO_LONG_TOTAL':
      return new BadRequestException(d.message);
    default:
      return new ForbiddenException(d.message);
  }
}

@Injectable()
export class InvitationExtensionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Only the resident who created the pass can extend it (checked here, on the server). */
  async extend(ctx: ExtendContext, invitationId: string, minutes: number) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, residentId: ctx.residentId, estateId: ctx.estateId },
      include: { visitor: true, resident: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');

    const estate = await this.prisma.estate.findUnique({ where: { id: ctx.estateId }, select: RULE_SELECT });
    if (!estate) throw new NotFoundException('Estate not found.');

    const decision = evaluateExtension({
      target: {
        status: invitation.status,
        entryPolicy: invitation.entryPolicy,
        validFrom: invitation.validFrom,
        validUntil: invitation.validUntil,
      },
      rules: toRules(estate),
      requestedMinutes: minutes,
      now: new Date(),
      timeZone: estate.timezone,
    });
    if (!decision.ok) throw exceptionFor(decision);

    // Only succeeds if nobody changed or revoked the pass since we read it.
    const reactivate = invitation.status === 'EXPIRED';
    const updated = await this.prisma.invitation.updateMany({
      where: {
        id: invitation.id,
        validUntil: invitation.validUntil,
        status: { notIn: ['REVOKED', 'CANCELLED'] },
      },
      data: {
        validUntil: decision.newValidUntil,
        ...(reactivate ? { status: 'ACTIVE' as const } : {}),
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('This pass was just changed. Reload the page and try again.');
    }

    const oldValidUntil = invitation.validUntil.toISOString();
    const newValidUntil = decision.newValidUntil.toISOString();

    await this.auditLogs.log({
      action: 'INVITATION_EXTENDED',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'Invitation',
      entityId: invitation.id,
      metadata: { oldValidUntil, newValidUntil, minutes: decision.minutes, extendedBy: ctx.displayName },
    });

    await this.notifications.dispatch({
      userId: invitation.resident.userId,
      type: 'INVITATION_EXTENDED',
      payload: {
        invitationId: invitation.id,
        visitorName: invitation.visitor.fullName,
        oldValidUntil,
        newValidUntil,
        minutes: decision.minutes,
      },
    });

    return {
      id: invitation.id,
      validFrom: invitation.validFrom.toISOString(),
      validUntil: newValidUntil,
      status: reactivate ? 'ACTIVE' : invitation.status,
    };
  }

  // ---- Estate-configurable rules (admin) ----

  private async resolveEstateId(userId: string, estateIdParam?: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, adminEstateId: true },
    });
    if (!user) throw new ForbiddenException('Not authenticated.');
    if (user.role === 'ESTATE_ADMIN') {
      if (!user.adminEstateId) throw new ForbiddenException('This admin is not linked to an estate.');
      return user.adminEstateId;
    }
    if (!estateIdParam) throw new BadRequestException('Choose an estate (estateId).');
    return estateIdParam;
  }

  private shape(e: EstateRuleRow) {
    return {
      enabled: e.passExtensionsEnabled,
      maxExtendMinutes: e.passExtendMaxMinutes,
      maxTotalMinutes: e.passMaxTotalMinutes,
      quietFromMinute: e.passQuietFromMinute,
      quietToMinute: e.passQuietToMinute,
      timeZone: e.timezone,
    };
  }

  async getRules(userId: string, estateIdParam?: string) {
    const estateId = await this.resolveEstateId(userId, estateIdParam);
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId }, select: RULE_SELECT });
    if (!estate) throw new NotFoundException('Estate not found.');
    return this.shape(estate);
  }

  async updateRules(userId: string, estateIdParam: string | undefined, dto: UpdatePassRulesDto) {
    const estateId = await this.resolveEstateId(userId, estateIdParam);

    const from = dto.quietFromMinute ?? null;
    const to = dto.quietToMinute ?? null;
    if ((from === null) !== (to === null)) {
      throw new BadRequestException('Set both quiet-hours times, or neither.');
    }
    if (from !== null && from === to) {
      throw new BadRequestException('Quiet hours must start and end at different times.');
    }
    if (dto.maxTotalMinutes < dto.maxExtendMinutes) {
      throw new BadRequestException('The total pass length must be at least the longest single extension.');
    }

    const before = await this.prisma.estate.findUnique({ where: { id: estateId }, select: RULE_SELECT });
    if (!before) throw new NotFoundException('Estate not found.');

    const after = await this.prisma.estate.update({
      where: { id: estateId },
      data: {
        passExtensionsEnabled: dto.enabled,
        passExtendMaxMinutes: dto.maxExtendMinutes,
        passMaxTotalMinutes: dto.maxTotalMinutes,
        passQuietFromMinute: from,
        passQuietToMinute: to,
      },
      select: RULE_SELECT,
    });

    await this.auditLogs.log({
      action: 'PASS_RULES_UPDATED',
      userId,
      estateId,
      entity: 'Estate',
      entityId: estateId,
      metadata: { before: this.shape(before), after: this.shape(after) },
    });

    return this.shape(after);
  }
}
