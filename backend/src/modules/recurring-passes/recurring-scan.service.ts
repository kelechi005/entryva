import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { hashSecret } from '../../common/crypto/token.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SecurityContext } from '../verification/verification.service';
import {
  DEFAULT_TIME_ZONE,
  evaluateRecurringScan,
  isOverdueInside,
  localMoment,
  type PassException,
  type PassRules,
  type ScanDirection,
  type ScanDenyReason,
} from './recurring-pass.rules';
import { dateKeyOf, parseRecurringQr, phoneKey } from './recurring-qr';

/** A second scan this soon after an allowed one is the same person, scanned twice. */
export const DUPLICATE_SCAN_SECONDS = 10;

export interface RecurringScanResponse {
  allowed: boolean;
  message: string;
  reason?: ScanDenyReason;
  direction?: ScanDirection;
  /** Same person scanned again within seconds: nothing new was recorded. */
  duplicate?: boolean;
  /** Still marked inside after the window ended, or from an earlier day. */
  overdue: boolean;
  /** An earlier day's visit was never closed with an OUT scan. */
  previousVisitOpen: boolean;
  pass?: {
    id: string;
    fullName: string;
    role: string;
    residentName: string | null;
    apartmentLabel: string | null;
    startMinute: number;
    endMinute: number;
  };
}

@Injectable()
export class RecurringScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
  ) {}

  async scan(ctx: SecurityContext, rawToken: string, userId?: string): Promise<RecurringScanResponse> {
    const now = new Date();
    const parsed = parseRecurringQr(rawToken);

    const found = parsed
      ? await this.prisma.recurringPass.findUnique({
          where: { tokenHash: hashSecret(parsed.token) },
          include: { exceptions: true },
        })
      : null;
    // Another estate's pass looks exactly like a pass that doesn't exist.
    const pass = found && found.estateId === ctx.estateId ? found : null;

    const estate = await this.prisma.estate.findUnique({ where: { id: ctx.estateId }, select: { timezone: true } });
    const timeZone = estate?.timezone || DEFAULT_TIME_ZONE;
    const local = localMoment(now, timeZone);

    if (!pass || !parsed) {
      const decision = evaluateRecurringScan({
        pass: null,
        exceptions: [],
        blacklisted: false,
        now,
        timeZone,
        codeRequired: true,
      });
      await this.auditLogs.log({
        action: 'RECURRING_SCAN_DENIED',
        estateId: ctx.estateId,
        entity: 'RecurringPass',
        metadata: { reason: decision.reason, officerId: ctx.securityOfficerId },
      });
      return { allowed: false, message: decision.message, reason: decision.reason, overdue: false, previousVisitOpen: false };
    }

    const rules: PassRules = {
      status: pass.status,
      validFrom: dateKeyOf(pass.validFrom),
      validUntil: dateKeyOf(pass.validUntil),
      days: pass.days,
      startMinute: pass.startMinute,
      endMinute: pass.endMinute,
      graceMinutes: pass.graceMinutes,
      tokenHash: pass.tokenHash,
    };
    const exceptions: PassException[] = pass.exceptions.map((e) => ({
      date: dateKeyOf(e.date),
      type: e.type,
      startMinute: e.startMinute,
      endMinute: e.endMinute,
    }));

    const myKey = phoneKey(pass.phone);
    let blacklisted = false;
    if (myKey) {
      const blocked = await this.prisma.estateBlockedPerson.findMany({
        where: { estateId: ctx.estateId },
        select: { phone: true },
      });
      blacklisted = blocked.some((b) => phoneKey(b.phone) === myKey);
    }

    const last = await this.prisma.recurringPassScan.findFirst({
      where: { passId: pass.id, result: 'ALLOWED' },
      orderBy: { scannedAt: 'desc' },
    });
    const lastScanDate = last ? localMoment(last.scannedAt, timeZone).date : null;
    const lastDirection = last?.direction ?? null;
    const previousVisitOpen = lastDirection === 'IN' && lastScanDate !== null && lastScanDate < local.date;
    const overdue = isOverdueInside({ lastDirection, lastScanDate, pass: rules, now, timeZone });

    const [resident, apartment] = await Promise.all([
      this.prisma.residentProfile.findUnique({ where: { id: pass.residentId } }),
      this.prisma.apartment.findUnique({ where: { id: pass.apartmentId } }),
    ]);
    const passInfo = {
      id: pass.id,
      fullName: pass.fullName,
      role: pass.role,
      residentName: resident?.displayName ?? null,
      apartmentLabel: apartment?.flatNumber ?? null,
      startMinute: pass.startMinute,
      endMinute: pass.endMinute,
    };

    // The same person scanned twice in a row must not flip IN to OUT.
    if (last && now.getTime() - last.scannedAt.getTime() < DUPLICATE_SCAN_SECONDS * 1000) {
      return {
        allowed: true,
        message: 'Already scanned a moment ago',
        direction: (last.direction as ScanDirection | null) ?? undefined,
        duplicate: true,
        overdue,
        previousVisitOpen,
        pass: passInfo,
      };
    }

    const decision = evaluateRecurringScan({
      pass: rules,
      exceptions,
      blacklisted,
      now,
      timeZone,
      presentedCode: parsed.code,
      codeRequired: true,
      // A visit left open on an earlier day does not turn today's arrival into an exit.
      lastDirection: previousVisitOpen ? null : lastDirection,
    });

    await this.prisma.recurringPassScan.create({
      data: {
        passId: pass.id,
        officerUserId: userId ?? null,
        direction: decision.allowed ? (decision.direction ?? null) : null,
        result: decision.allowed ? 'ALLOWED' : 'DENIED',
        reason: decision.allowed ? null : (decision.reason ?? null),
      },
    });

    await this.auditLogs.log({
      action: decision.allowed ? 'RECURRING_SCAN_ALLOWED' : 'RECURRING_SCAN_DENIED',
      userId,
      estateId: ctx.estateId,
      entity: 'RecurringPass',
      entityId: pass.id,
      metadata: {
        reason: decision.reason,
        direction: decision.direction,
        overdue,
        previousVisitOpen,
        officerId: ctx.securityOfficerId,
      },
    });

    if (decision.allowed && resident?.userId) {
      await this.notifications.dispatch({
        userId: resident.userId,
        type: decision.direction === 'OUT' ? 'RECURRING_PASS_EXITED' : 'RECURRING_PASS_ENTERED',
        payload: { passId: pass.id, visitorName: pass.fullName },
      });
      if (overdue || previousVisitOpen) {
        await this.notifications.dispatch({
          userId: resident.userId,
          type: 'RECURRING_PASS_OVERDUE',
          payload: { passId: pass.id, visitorName: pass.fullName },
        });
      }
    }

    return {
      allowed: decision.allowed,
      message: decision.message,
      reason: decision.reason,
      direction: decision.direction,
      overdue,
      previousVisitOpen,
      pass: passInfo,
    };
  }
}
