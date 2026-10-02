import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { hashSecret } from '../../common/crypto/token.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateRecurringPassDto, ExtraDayDto } from './dto/recurring-pass.dto';
import { MAX_PASS_DAYS, DEFAULT_TIME_ZONE, dailyCodeFor, localMoment, validatePassSchedule } from './recurring-pass.rules';
import { addDays, dateFromKey, dateKeyOf } from './recurring-qr';

export interface ResidentPassContext {
  userId: string;
  residentId: string;
  estateId: string;
  apartmentId?: string;
  displayName: string;
}

@Injectable()
export class RecurringPassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private async timeZone(estateId: string): Promise<string> {
    const estate = await this.prisma.estate.findUnique({ where: { id: estateId }, select: { timezone: true } });
    return estate?.timezone || DEFAULT_TIME_ZONE;
  }

  /** Only the resident who created the pass can find it here. */
  private async owned(ctx: ResidentPassContext, id: string) {
    const pass = await this.prisma.recurringPass.findFirst({
      where: { id, residentId: ctx.residentId, estateId: ctx.estateId },
    });
    if (!pass) throw new NotFoundException('Pass not found.');
    return pass;
  }

  private view(
    p: {
      id: string;
      fullName: string;
      phone: string | null;
      role: string;
      days: number[];
      startMinute: number;
      endMinute: number;
      validFrom: Date;
      validUntil: Date;
      graceMinutes: number;
      status: string;
      linkedDeviceHash: string | null;
      createdAt: Date;
    },
    today: string,
    extras: {
      exceptions?: { date: Date; type: string; startMinute: number | null; endMinute: number | null }[];
      inside?: boolean;
    } = {},
  ) {
    const validUntil = dateKeyOf(p.validUntil);
    const status = p.status === 'ACTIVE' && validUntil < today ? 'EXPIRED' : p.status;
    return {
      id: p.id,
      fullName: p.fullName,
      phone: p.phone,
      role: p.role,
      days: p.days,
      startMinute: p.startMinute,
      endMinute: p.endMinute,
      validFrom: dateKeyOf(p.validFrom),
      validUntil,
      graceMinutes: p.graceMinutes,
      status,
      phoneLinked: !!p.linkedDeviceHash,
      inside: extras.inside ?? false,
      upcomingExceptions: (extras.exceptions ?? []).map((e) => ({
        date: dateKeyOf(e.date),
        type: e.type,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
      })),
      createdAt: p.createdAt.toISOString(),
    };
  }

  async create(ctx: ResidentPassContext, dto: CreateRecurringPassDto) {
    if (!ctx.apartmentId) throw new ForbiddenException('Your account is not linked to an apartment.');
    const tz = await this.timeZone(ctx.estateId);
    const today = localMoment(new Date(), tz).date;
    const days = [...new Set(dto.days)].sort((a, b) => a - b);
    const graceMinutes = dto.graceMinutes ?? 30;

    const errors = validatePassSchedule({
      days,
      startMinute: dto.startMinute,
      endMinute: dto.endMinute,
      graceMinutes,
      validFrom: dto.validFrom,
      validUntil: dto.validUntil,
    });
    if (errors.length === 0 && dto.validUntil < today) errors.push('Valid until is already in the past.');
    if (errors.length > 0) throw new BadRequestException(errors.join(' '));

    const token = randomBytes(24).toString('base64url');
    const pass = await this.prisma.recurringPass.create({
      data: {
        estateId: ctx.estateId,
        residentId: ctx.residentId,
        apartmentId: ctx.apartmentId,
        fullName: dto.fullName.trim(),
        phone: dto.phone?.trim() || null,
        role: dto.role,
        days,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        validFrom: dateFromKey(dto.validFrom),
        validUntil: dateFromKey(dto.validUntil),
        graceMinutes,
        tokenHash: hashSecret(token),
      },
    });

    await this.auditLogs.log({
      action: 'RECURRING_PASS_CREATED',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
      metadata: { role: dto.role, days, validFrom: dto.validFrom, validUntil: dto.validUntil },
    });

    // The plain token is returned this once. Only its hash is stored.
    return { ...this.view(pass, today), shareToken: token };
  }

  async list(ctx: ResidentPassContext) {
    const tz = await this.timeZone(ctx.estateId);
    const today = localMoment(new Date(), tz).date;
    const passes = await this.prisma.recurringPass.findMany({
      where: { residentId: ctx.residentId, estateId: ctx.estateId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        exceptions: { where: { date: { gte: dateFromKey(today) } }, orderBy: { date: 'asc' }, take: 30 },
      },
    });
    const ids = passes.map((p) => p.id);
    const scans = ids.length
      ? await this.prisma.recurringPassScan.findMany({
          where: { passId: { in: ids }, result: 'ALLOWED' },
          orderBy: { scannedAt: 'desc' },
          take: 500,
        })
      : [];
    const lastDirection = new Map<string, string | null>();
    for (const s of scans) if (!lastDirection.has(s.passId)) lastDirection.set(s.passId, s.direction);

    return passes.map((p) =>
      this.view(p, today, { exceptions: p.exceptions, inside: lastDirection.get(p.id) === 'IN' }),
    );
  }

  /** Recent scans on one pass, so the resident can see when the person came and left. */
  async history(ctx: ResidentPassContext, id: string) {
    await this.owned(ctx, id);
    const tz = await this.timeZone(ctx.estateId);
    const scans = await this.prisma.recurringPassScan.findMany({
      where: { passId: id },
      orderBy: { scannedAt: 'desc' },
      take: 30,
    });
    return scans.map((s) => ({
      id: s.id,
      at: s.scannedAt.toISOString(),
      localDate: localMoment(s.scannedAt, tz).date,
      direction: s.direction,
      result: s.result,
      reason: s.reason,
    }));
  }

  private async setStatus(
    ctx: ResidentPassContext,
    id: string,
    from: string[],
    to: 'ACTIVE' | 'PAUSED' | 'REVOKED',
    action: string,
    failMessage: string,
  ) {
    const pass = await this.owned(ctx, id);
    const changed = await this.prisma.recurringPass.updateMany({
      where: { id: pass.id, status: { in: from as never[] } },
      data: { status: to },
    });
    if (changed.count === 0) throw new ConflictException(failMessage);
    await this.auditLogs.log({
      action,
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
      metadata: { from: pass.status, to },
    });
    return { id: pass.id, status: to };
  }

  pause(ctx: ResidentPassContext, id: string) {
    return this.setStatus(ctx, id, ['ACTIVE'], 'PAUSED', 'RECURRING_PASS_PAUSED', 'Only an active pass can be paused.');
  }

  resume(ctx: ResidentPassContext, id: string) {
    return this.setStatus(ctx, id, ['PAUSED'], 'ACTIVE', 'RECURRING_PASS_RESUMED', 'Only a paused pass can be resumed.');
  }

  revoke(ctx: ResidentPassContext, id: string) {
    return this.setStatus(
      ctx,
      id,
      ['ACTIVE', 'PAUSED', 'EXPIRED'],
      'REVOKED',
      'RECURRING_PASS_REVOKED',
      'This pass is already revoked.',
    );
  }

  private async checkDayInRange(ctx: ResidentPassContext, pass: { validFrom: Date; validUntil: Date }, date: string) {
    const today = localMoment(new Date(), await this.timeZone(ctx.estateId)).date;
    if (date < today) throw new BadRequestException('Choose today or a later date.');
    if (date < dateKeyOf(pass.validFrom) || date > dateKeyOf(pass.validUntil)) {
      throw new BadRequestException('That date is outside the pass dates.');
    }
  }

  async skipDay(ctx: ResidentPassContext, id: string, date: string) {
    const pass = await this.owned(ctx, id);
    await this.checkDayInRange(ctx, pass, date);
    await this.prisma.recurringPassException.upsert({
      where: { passId_date: { passId: pass.id, date: dateFromKey(date) } },
      create: { passId: pass.id, date: dateFromKey(date), type: 'SKIP' },
      update: { type: 'SKIP', startMinute: null, endMinute: null },
    });
    await this.auditLogs.log({
      action: 'RECURRING_PASS_DAY_SKIPPED',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
      metadata: { date },
    });
    return { id: pass.id, date, type: 'SKIP' };
  }

  async addExtraDay(ctx: ResidentPassContext, id: string, dto: ExtraDayDto) {
    const pass = await this.owned(ctx, id);
    await this.checkDayInRange(ctx, pass, dto.date);
    const hasStart = dto.startMinute !== undefined;
    const hasEnd = dto.endMinute !== undefined;
    if (hasStart !== hasEnd) throw new BadRequestException('Set both the start and end time, or neither.');
    if (hasStart && (dto.endMinute as number) <= (dto.startMinute as number)) {
      throw new BadRequestException('End time must be after the start time.');
    }
    const startMinute = dto.startMinute ?? null;
    const endMinute = dto.endMinute ?? null;
    await this.prisma.recurringPassException.upsert({
      where: { passId_date: { passId: pass.id, date: dateFromKey(dto.date) } },
      create: { passId: pass.id, date: dateFromKey(dto.date), type: 'EXTRA', startMinute, endMinute },
      update: { type: 'EXTRA', startMinute, endMinute },
    });
    await this.auditLogs.log({
      action: 'RECURRING_PASS_EXTRA_DAY',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
      metadata: { date: dto.date, startMinute, endMinute },
    });
    return { id: pass.id, date: dto.date, type: 'EXTRA', startMinute, endMinute };
  }

  async removeException(ctx: ResidentPassContext, id: string, date: string) {
    const pass = await this.owned(ctx, id);
    await this.prisma.recurringPassException.deleteMany({ where: { passId: pass.id, date: dateFromKey(date) } });
    return { id: pass.id, date };
  }

  /** Starts a fresh window from today for the given number of days. */
  async renew(ctx: ResidentPassContext, id: string, days: number) {
    const pass = await this.owned(ctx, id);
    if (pass.status === 'REVOKED') throw new ConflictException('A revoked pass cannot be renewed. Create a new one.');
    if (days > MAX_PASS_DAYS) throw new BadRequestException(`A pass can last at most ${MAX_PASS_DAYS} days.`);
    const today = localMoment(new Date(), await this.timeZone(ctx.estateId)).date;
    const validUntil = addDays(today, days - 1);
    const updated = await this.prisma.recurringPass.updateMany({
      where: { id: pass.id, status: { not: 'REVOKED' } },
      data: {
        validFrom: dateFromKey(today),
        validUntil: dateFromKey(validUntil),
        ...(pass.status === 'EXPIRED' ? { status: 'ACTIVE' as const } : {}),
      },
    });
    if (updated.count === 0) throw new ConflictException('This pass was just changed. Reload and try again.');
    await this.auditLogs.log({
      action: 'RECURRING_PASS_RENEWED',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
      metadata: { validFrom: today, validUntil },
    });
    return { id: pass.id, validFrom: today, validUntil, status: pass.status === 'EXPIRED' ? 'ACTIVE' : pass.status };
  }

  /** Lets the person open the pass on a different phone. */
  async resetPhone(ctx: ResidentPassContext, id: string) {
    const pass = await this.owned(ctx, id);
    await this.prisma.recurringPass.update({
      where: { id: pass.id },
      data: { linkedDeviceHash: null, linkedAt: null },
    });
    await this.auditLogs.log({
      action: 'RECURRING_PASS_PHONE_RESET',
      userId: ctx.userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
    });
    return { id: pass.id, phoneLinked: false };
  }

  /**
   * What the person's own pass page shows. The first phone to open the link is
   * remembered; any other phone is refused until the resident resets it.
   */
  async publicView(token: string, deviceId: string | undefined) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new NotFoundException('Pass not found.');
    if (!deviceId || deviceId.length < 16 || deviceId.length > 128) {
      throw new BadRequestException('Open this pass in your phone browser to continue.');
    }
    const pass = await this.prisma.recurringPass.findUnique({ where: { tokenHash: hashSecret(token) } });
    if (!pass) throw new NotFoundException('Pass not found.');

    const deviceHash = hashSecret(deviceId);
    if (!pass.linkedDeviceHash) {
      const linked = await this.prisma.recurringPass.updateMany({
        where: { id: pass.id, linkedDeviceHash: null },
        data: { linkedDeviceHash: deviceHash, linkedAt: new Date() },
      });
      if (linked.count === 0) {
        const fresh = await this.prisma.recurringPass.findUnique({ where: { id: pass.id } });
        if (fresh?.linkedDeviceHash !== deviceHash) throw new ForbiddenException(OTHER_PHONE);
      }
    } else if (pass.linkedDeviceHash !== deviceHash) {
      throw new ForbiddenException(OTHER_PHONE);
    }

    const [tz, resident, apartment] = await Promise.all([
      this.timeZone(pass.estateId),
      this.prisma.residentProfile.findUnique({ where: { id: pass.residentId } }),
      this.prisma.apartment.findUnique({ where: { id: pass.apartmentId } }),
    ]);
    const local = localMoment(new Date(), tz);
    const validFrom = dateKeyOf(pass.validFrom);
    const validUntil = dateKeyOf(pass.validUntil);
    const insideDates = local.date >= validFrom && local.date <= validUntil;
    const status = pass.status === 'ACTIVE' && local.date > validUntil ? 'EXPIRED' : pass.status;

    return {
      fullName: pass.fullName,
      role: pass.role,
      status,
      residentName: resident?.displayName ?? null,
      apartmentLabel: apartment?.flatNumber ?? null,
      days: pass.days,
      startMinute: pass.startMinute,
      endMinute: pass.endMinute,
      validFrom,
      validUntil,
      // Today's code goes in the QR. Only handed out while the pass can work.
      code: status === 'ACTIVE' && insideDates ? dailyCodeFor(pass.tokenHash, local.date) : null,
      codeDate: local.date,
    };
  }
}

const OTHER_PHONE = 'This pass is already open on another phone. Ask the resident to reset it.';
