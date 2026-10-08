import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { findRecipientUserIds } from './alert-recipients';
import { RaiseEmergencyDto } from './dto/raise-emergency.dto';

export type EmergencyKindValue = 'FIRE' | 'MEDICAL' | 'SECURITY' | 'OTHER';
export type EmergencyStatusValue = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface EmergencyView {
  id: string;
  kind: EmergencyKindValue;
  note: string | null;
  status: EmergencyStatusValue;
  apartmentLabel: string;
  raisedByName: string;
  createdAt: Date;
  acknowledgedByName: string | null;
  acknowledgedAt: Date | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  /** Only ever filled in for security officers / admins, never for the resident's own view. */
  callPhone: string | null;
}

export interface RaiseResult {
  alert: EmergencyView;
  /** How many security officers + admins were told. 0 means nobody can respond: the UI must say so. */
  notifiedCount: number;
  /** True when this was the same emergency pressed again, so no second alarm was sent. */
  duplicate: boolean;
}

// Pressing the button twice (a panicking thumb) must not alarm everyone twice.
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
// Officers see everything still open, plus what was closed in the last week.
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STAFF_LIST_LIMIT = 100;
const RESIDENT_LIST_LIMIT = 20;

const STATUS_ORDER: Record<string, number> = { OPEN: 0, ACKNOWLEDGED: 1, RESOLVED: 2 };

type AlertRow = {
  id: string;
  estateId: string;
  raisedById: string;
  raisedByName: string;
  apartmentLabel: string;
  kind: string;
  note: string | null;
  status: string;
  acknowledgedByName: string | null;
  acknowledgedAt: Date | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

/**
 * Resident emergency button.
 *
 *   Resident  -> raises an alert (and can close their own: "false alarm / I'm safe")
 *   Officer / Admin -> told immediately (urgent push + in-app), acknowledge, resolve
 *
 * Only the resident's own deliberate button press discloses their name,
 * apartment and phone to staff (CLAUDE.md §6.5). Nothing here exposes
 * visitor data.
 */
@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private estateOf(user: AuthenticatedUser): string {
    if (!user.estateId) throw new ForbiddenException('No estate scope available for this account.');
    return user.estateId;
  }

  private isStaff(user: AuthenticatedUser): boolean {
    return user.role === 'SECURITY_OFFICER' || user.role === 'ESTATE_ADMIN';
  }

  async raise(user: AuthenticatedUser, dto: RaiseEmergencyDto): Promise<RaiseResult> {
    if (user.role !== 'RESIDENT' || !user.estateId || !user.apartmentId) {
      throw new ForbiddenException('Only a resident can raise an emergency alert.');
    }

    const duplicate = await this.prisma.emergencyAlert.findFirst({
      where: {
        raisedById: user.userId,
        kind: dto.kind,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) {
      return { alert: this.toView(duplicate, false, null), notifiedCount: 0, duplicate: true };
    }

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: user.apartmentId },
      include: { building: true },
    });
    const apartmentLabel = apartment ? `${apartment.building.name} \u00b7 ${apartment.flatNumber}` : 'An apartment';

    const alert = await this.prisma.emergencyAlert.create({
      data: {
        estateId: user.estateId,
        raisedById: user.userId,
        raisedByName: user.displayName,
        apartmentLabel,
        kind: dto.kind,
        note: dto.note?.trim() ? dto.note.trim() : null,
      },
    });

    const responders = await findRecipientUserIds(this.prisma, user.estateId, ['OFFICERS', 'ADMINS']);
    await this.notifications.dispatchMany(responders, 'EMERGENCY_RAISED', {
      alertId: alert.id,
      kind: alert.kind,
      apartmentLabel: alert.apartmentLabel,
      raisedByName: alert.raisedByName,
    });

    await this.auditLogs.log({
      action: 'EMERGENCY_RAISED',
      userId: user.userId,
      estateId: user.estateId,
      entity: 'EmergencyAlert',
      entityId: alert.id,
      metadata: { kind: alert.kind, notifiedCount: responders.length },
    });

    return { alert: this.toView(alert, false, null), notifiedCount: responders.length, duplicate: false };
  }

  async list(user: AuthenticatedUser): Promise<EmergencyView[]> {
    const estateId = this.estateOf(user);

    // A resident only ever sees their own alerts.
    if (user.role === 'RESIDENT') {
      const mine = await this.prisma.emergencyAlert.findMany({
        where: { estateId, raisedById: user.userId },
        orderBy: { createdAt: 'desc' },
        take: RESIDENT_LIST_LIMIT,
      });
      return mine.map((row) => this.toView(row, false, null));
    }

    if (!this.isStaff(user)) throw new ForbiddenException('You do not have access to this resource.');

    const rows = await this.prisma.emergencyAlert.findMany({
      where: {
        estateId,
        OR: [{ status: { in: ['OPEN', 'ACKNOWLEDGED'] } }, { createdAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) } }],
      },
      orderBy: { createdAt: 'desc' },
      take: STAFF_LIST_LIMIT,
    });

    // The resident's phone, so staff can call straight from the alert. Looked up
    // here on the server and only handed to staff of the SAME estate.
    const residents = await this.prisma.residentProfile.findMany({
      where: { estateId, userId: { in: [...new Set(rows.map((r) => r.raisedById))] } },
      select: { userId: true, phone: true },
    });
    const phoneByUser = new Map(residents.map((r) => [r.userId, r.phone] as const));

    return rows
      .map((row) => this.toView(row, true, phoneByUser.get(row.raisedById) ?? null))
      .sort((a, b) => {
        const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        return byStatus !== 0 ? byStatus : b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  /** First responder wins: the OPEN -> ACKNOWLEDGED change is one atomic update. */
  async acknowledge(user: AuthenticatedUser, id: string): Promise<EmergencyView> {
    const estateId = this.estateOf(user);
    if (!this.isStaff(user)) throw new ForbiddenException('Only security or the estate admin can respond to an alert.');

    const result = await this.prisma.emergencyAlert.updateMany({
      where: { id, estateId, status: 'OPEN' },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedById: user.userId,
        acknowledgedByName: user.displayName,
        acknowledgedAt: new Date(),
      },
    });

    const alert = await this.findInEstate(id, estateId);
    if (result.count === 1) {
      // Tell the resident help is coming - once, only for the person who actually claimed it.
      await this.notifications.dispatch({
        userId: alert.raisedById,
        type: 'EMERGENCY_ACKNOWLEDGED',
        payload: { alertId: alert.id, responderName: user.displayName },
      });
      await this.auditLogs.log({
        action: 'EMERGENCY_ACKNOWLEDGED',
        userId: user.userId,
        estateId,
        entity: 'EmergencyAlert',
        entityId: alert.id,
      });
    }
    return this.toView(alert, true, await this.phoneFor(alert));
  }

  /** Staff close any alert in their estate; a resident can close only their own ("I'm safe"). */
  async resolve(user: AuthenticatedUser, id: string): Promise<EmergencyView> {
    const estateId = this.estateOf(user);
    const staff = this.isStaff(user);
    if (!staff && user.role !== 'RESIDENT') throw new ForbiddenException('You do not have access to this resource.');

    const result = await this.prisma.emergencyAlert.updateMany({
      where: {
        id,
        estateId,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        ...(staff ? {} : { raisedById: user.userId }),
      },
      data: { status: 'RESOLVED', resolvedById: user.userId, resolvedByName: user.displayName, resolvedAt: new Date() },
    });

    const alert = await this.findInEstate(id, estateId);
    if (!staff && alert.raisedById !== user.userId) {
      // Not theirs: report "not found", never reveal that it exists.
      throw new NotFoundException('Alert not found.');
    }

    if (result.count === 1) {
      if (staff && alert.raisedById !== user.userId) {
        await this.notifications.dispatch({
          userId: alert.raisedById,
          type: 'EMERGENCY_RESOLVED',
          payload: { alertId: alert.id },
        });
      }
      await this.auditLogs.log({
        action: 'EMERGENCY_RESOLVED',
        userId: user.userId,
        estateId,
        entity: 'EmergencyAlert',
        entityId: alert.id,
        metadata: { by: staff ? 'staff' : 'resident' },
      });
    }
    return this.toView(alert, staff, staff ? await this.phoneFor(alert) : null);
  }

  private async findInEstate(id: string, estateId: string): Promise<AlertRow> {
    const alert = await this.prisma.emergencyAlert.findFirst({ where: { id, estateId } });
    if (!alert) throw new NotFoundException('Alert not found.');
    return alert;
  }

  private async phoneFor(alert: AlertRow): Promise<string | null> {
    const resident = await this.prisma.residentProfile.findFirst({
      where: { userId: alert.raisedById, estateId: alert.estateId },
      select: { phone: true },
    });
    return resident?.phone ?? null;
  }

  private toView(row: AlertRow, staff: boolean, phone: string | null): EmergencyView {
    return {
      id: row.id,
      kind: row.kind as EmergencyKindValue,
      note: row.note,
      status: row.status as EmergencyStatusValue,
      apartmentLabel: row.apartmentLabel,
      raisedByName: row.raisedByName,
      createdAt: row.createdAt,
      acknowledgedByName: row.acknowledgedByName,
      acknowledgedAt: row.acknowledgedAt,
      resolvedByName: row.resolvedByName,
      resolvedAt: row.resolvedAt,
      callPhone: staff ? phone : null,
    };
  }
}
