import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateEstateDto } from './dto/create-estate.dto';
import { UpdateEstateDto } from './dto/update-estate.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { CreateResidentDto } from './dto/create-resident.dto';
import { CreateSecurityOfficerDto } from './dto/create-security-officer.dto';
import type { UpdateStatusDto } from './dto/update-status.dto';
import type { UpdateBuildingDto } from './dto/update-building.dto';
import type { UpdateApartmentDto } from './dto/update-apartment.dto';
import type { UpdateResidentDto } from './dto/update-resident.dto';
import type { UpdateSecurityOfficerDto } from './dto/update-security-officer.dto';
import type { ConfirmPasswordDto } from './dto/confirm-password.dto';

// Prisma's unique-constraint violation code. Caught wherever a write could
// race another request into the same (buildingId, flatNumber) or
// (estateId, employeeCode) pair — the upfront findFirst check below covers
// the common case, this is the belt-and-suspenders for the race.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class AdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /**
   * Every method below scopes its query/write by this resolved estateId.
   * SUPER_ADMIN may act on any estate but must say which one explicitly
   * (requestedEstateId); ESTATE_ADMIN is pinned to their own and may not
   * override it, even if they pass a different estateId in the body —
   * that's the one place a naive implementation would let an estate
   * admin reach into another estate's data.
   */
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

  // ---- Estates (SUPER_ADMIN only, enforced by @Roles at the controller) ----

  async createEstate(dto: CreateEstateDto) {
    return this.prisma.estate.create({
      data: { name: dto.name, address: dto.address, timezone: dto.timezone ?? 'UTC' },
    });
  }

  async listEstates() {
    return this.prisma.estate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // ---- Buildings & apartments ----

  async createBuilding(user: AuthenticatedUser, estateId: string | undefined, dto: CreateBuildingDto) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    await this.assertBuildingNameIsFree(scopedEstateId, dto.name);
    let created;
    try {
      created = await this.prisma.building.create({
        data: { estateId: scopedEstateId, name: dto.name.trim(), code: dto.code },
      });
    } catch (err) {
      throw this.mapDuplicateBuildingError(err);
    }

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_BUILDING',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Building',
      entityId: created.id,
      metadata: { change: 'created', name: created.name },
    });
    return created;
  }

  async listBuildings(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    return this.prisma.building.findMany({ where: { estateId: scopedEstateId } });
  }

  async updateBuilding(
    user: AuthenticatedUser,
    estateId: string | undefined,
    buildingId: string,
    dto: UpdateBuildingDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, estateId: scopedEstateId },
    });
    if (!building) throw new NotFoundException('Building not found in this estate.');

    if (dto.name && dto.name.trim().toLowerCase() !== building.name.trim().toLowerCase()) {
      await this.assertBuildingNameIsFree(scopedEstateId, dto.name, buildingId);
    }

    let updated;
    try {
      updated = await this.prisma.building.update({
        where: { id: buildingId },
        data: { name: dto.name?.trim(), code: dto.code },
      });
    } catch (err) {
      throw this.mapDuplicateBuildingError(err);
    }

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_BUILDING',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Building',
      entityId: buildingId,
      metadata: { change: 'updated', name: updated.name },
    });
    return updated;
  }

  /**
   * Same step-up-auth pattern as removeResident / removeSecurityOfficer
   * (see assertActingAdminPassword): the admin must re-enter their own
   * current password to confirm. Unlike those two, this is a real
   * delete rather than a REMOVED-status soft delete — a building has no
   * "history" of its own worth preserving the way a resident's
   * invite/visit history does. To avoid quietly cascading that delete
   * down into occupied apartments (and, transitively, resident
   * profiles — see Apartment.residents' onDelete: Cascade in
   * schema.prisma), this refuses to proceed while any apartments still
   * exist under the building; the admin has to clear those out first,
   * same as the "no apartments yet" guidance already on this page.
   */
  async removeBuilding(
    user: AuthenticatedUser,
    estateId: string | undefined,
    buildingId: string,
    confirm: ConfirmPasswordDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, estateId: scopedEstateId },
    });
    if (!building) throw new NotFoundException('Building not found in this estate.');

    await this.assertActingAdminPassword(user, scopedEstateId, confirm.currentPassword, 'Building', buildingId);

    const apartmentCount = await this.prisma.apartment.count({ where: { buildingId } });
    if (apartmentCount > 0) {
      throw new ConflictException(
        `"${building.name}" still has ${apartmentCount} apartment${apartmentCount === 1 ? '' : 's'}. Remove them first before deleting the building.`,
      );
    }

    await this.prisma.building.delete({ where: { id: buildingId } });

    await this.auditLogs.log({
      action: 'ADMIN_REMOVED_BUILDING',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Building',
      entityId: buildingId,
      metadata: { name: building.name },
    });
    return { removed: true };
  }

  async createApartment(user: AuthenticatedUser, estateId: string | undefined, dto: CreateApartmentDto) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const building = await this.prisma.building.findFirst({
      where: { id: dto.buildingId, estateId: scopedEstateId },
    });
    if (!building) {
      throw new NotFoundException('Building not found in this estate.');
    }

    await this.assertApartmentNumberIsFree(dto.buildingId, dto.flatNumber);

    let created;
    try {
      created = await this.prisma.apartment.create({
        data: { estateId: scopedEstateId, buildingId: dto.buildingId, flatNumber: dto.flatNumber },
      });
    } catch (err) {
      throw this.mapDuplicateApartmentError(err);
    }

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_APARTMENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Apartment',
      entityId: created.id,
      metadata: { change: 'created', flatNumber: created.flatNumber, buildingId: dto.buildingId },
    });
    return created;
  }

  async listApartments(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    return this.prisma.apartment.findMany({
      where: { estateId: scopedEstateId },
      include: { building: true },
    });
  }

  async updateApartment(
    user: AuthenticatedUser,
    estateId: string | undefined,
    apartmentId: string,
    dto: UpdateApartmentDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const apartment = await this.prisma.apartment.findFirst({
      where: { id: apartmentId, estateId: scopedEstateId },
    });
    if (!apartment) throw new NotFoundException('Apartment not found in this estate.');

    const targetBuildingId = dto.buildingId ?? apartment.buildingId;
    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, estateId: scopedEstateId },
      });
      if (!building) throw new NotFoundException('Building not found in this estate.');
    }

    const targetFlatNumber = dto.flatNumber ?? apartment.flatNumber;
    await this.assertApartmentNumberIsFree(targetBuildingId, targetFlatNumber, apartmentId);

    let updated;
    try {
      updated = await this.prisma.apartment.update({
        where: { id: apartmentId },
        data: { buildingId: dto.buildingId, flatNumber: dto.flatNumber },
      });
    } catch (err) {
      throw this.mapDuplicateApartmentError(err);
    }

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_APARTMENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Apartment',
      entityId: apartmentId,
      metadata: { change: 'updated', flatNumber: updated.flatNumber },
    });
    return updated;
  }

  /**
   * Upfront check for the common case, giving a clear 409 instead of a
   * raw Prisma error. `excludeApartmentId` lets an update check against
   * every *other* apartment without tripping on itself when the flat
   * number/building isn't actually changing.
   */
  private async assertApartmentNumberIsFree(
    buildingId: string,
    flatNumber: string,
    excludeApartmentId?: string,
  ) {
    // Case-insensitive + trimmed so "B-204", "b-204" and " B-204 " are
    // all treated as the same flat number — the DB's own @@unique is
    // case-sensitive and exists only as a defense-in-depth backstop
    // against a race between this check and the write below.
    const clash = await this.prisma.apartment.findFirst({
      where: {
        buildingId,
        flatNumber: { equals: flatNumber.trim(), mode: 'insensitive' },
        ...(excludeApartmentId ? { id: { not: excludeApartmentId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(
        `Apartment "${flatNumber.trim()}" already exists in this building.`,
      );
    }
  }

  private mapDuplicateApartmentError(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return new ConflictException('An apartment with that flat number already exists in this building.');
    }
    return err;
  }

  /**
   * Same shape as assertApartmentNumberIsFree, for building names.
   * Case-insensitive + trimmed so "Block B" and "block b " can't both
   * exist in one estate — see the screenshot this was reported from,
   * where createBuilding() previously had no check at all.
   */
  private async assertBuildingNameIsFree(
    estateId: string,
    name: string,
    excludeBuildingId?: string,
  ) {
    const clash = await this.prisma.building.findFirst({
      where: {
        estateId,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeBuildingId ? { id: { not: excludeBuildingId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(`A building named "${name.trim()}" already exists in this estate.`);
    }
  }

  private mapDuplicateBuildingError(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return new ConflictException('A building with that name already exists in this estate.');
    }
    return err;
  }

  /**
   * Step-up auth for destructive admin actions: re-checks the acting
   * admin's *own* current password before letting removeResident /
   * removeSecurityOfficer proceed. Deliberately re-verified server-side
   * (not trusted from a frontend-only confirmation dialog) because a
   * client-side-only check is trivially bypassed by calling the API
   * directly. A failed attempt is audit-logged same as a failed login —
   * it's exactly as security-relevant — but never blocks the admin's
   * own account the way repeated failed logins might elsewhere; this
   * only ever prevents the one removal action from going through.
   */
  private async assertActingAdminPassword(
    user: AuthenticatedUser,
    scopedEstateId: string,
    currentPassword: string,
    entity: string,
    entityId: string,
  ) {
    const verified = await this.authService.verifyPassword(user.userId, currentPassword);
    if (!verified) {
      await this.auditLogs.log({
        action: 'ADMIN_REMOVAL_PASSWORD_CHECK_FAILED',
        userId: user.userId,
        estateId: scopedEstateId,
        entity,
        entityId,
      });
      throw new ForbiddenException('Incorrect password. Re-enter your password to confirm this removal.');
    }
  }

  // ---- Residents ----

  async createResident(user: AuthenticatedUser, estateId: string | undefined, dto: CreateResidentDto) {
    const scopedEstateId = this.resolveEstateId(user, estateId);

    const apartment = await this.prisma.apartment.findFirst({
      where: { id: dto.apartmentId, estateId: scopedEstateId },
    });
    if (!apartment) {
      throw new NotFoundException('Apartment not found in this estate.');
    }

    const passwordHash = await this.authService.hashPassword(dto.temporaryPassword);

    const resident = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email: dto.email, phone: dto.phone, passwordHash, role: 'RESIDENT' },
      });
      const created = await tx.residentProfile.create({
        data: {
          userId: newUser.id,
          estateId: scopedEstateId,
          apartmentId: dto.apartmentId,
          displayName: dto.displayName,
          phone: dto.phone,
        },
      });
      await tx.apartment.update({ where: { id: dto.apartmentId }, data: { status: 'OCCUPIED' } });
      return created;
    });

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_RESIDENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentProfile',
      entityId: resident.id,
      metadata: { change: 'created', displayName: resident.displayName, flatNumber: apartment.flatNumber },
    });
    return resident;
  }

  async listResidents(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    return this.prisma.residentProfile.findMany({
      // Removed residents are hidden from the default roster — they still
      // exist in the database (see the REMOVED status comment on the
      // schema) so their invitation/visit history stays intact, but an
      // admin looking at "who lives here" shouldn't see them.
      where: { estateId: scopedEstateId, user: { status: { not: 'REMOVED' } } },
      include: {
        apartment: { include: { building: true } },
        user: { select: { email: true, phone: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateResident(
    user: AuthenticatedUser,
    estateId: string | undefined,
    residentId: string,
    dto: UpdateResidentDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const resident = await this.prisma.residentProfile.findFirst({
      where: { id: residentId, estateId: scopedEstateId },
    });
    if (!resident) throw new NotFoundException('Resident not found in this estate.');

    let newApartmentId = resident.apartmentId;
    if (dto.apartmentId && dto.apartmentId !== resident.apartmentId) {
      const apartment = await this.prisma.apartment.findFirst({
        where: { id: dto.apartmentId, estateId: scopedEstateId },
      });
      if (!apartment) throw new NotFoundException('Apartment not found in this estate.');
      newApartmentId = dto.apartmentId;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.residentProfile.update({
        where: { id: residentId },
        data: { displayName: dto.displayName, phone: dto.phone, apartmentId: newApartmentId },
      });
      if (newApartmentId !== resident.apartmentId) {
        await this.recomputeApartmentOccupancy(tx, resident.apartmentId);
        await this.recomputeApartmentOccupancy(tx, newApartmentId);
      }
      return result;
    });

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_RESIDENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentProfile',
      entityId: residentId,
      metadata: {
        change: 'updated',
        displayName: updated.displayName,
        ...(newApartmentId !== resident.apartmentId
          ? { fromApartmentId: resident.apartmentId, toApartmentId: newApartmentId }
          : {}),
      },
    });
    return updated;
  }

  async removeResident(
    user: AuthenticatedUser,
    estateId: string | undefined,
    residentId: string,
    confirm: ConfirmPasswordDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const resident = await this.prisma.residentProfile.findFirst({
      where: { id: residentId, estateId: scopedEstateId },
    });
    if (!resident) throw new NotFoundException('Resident not found in this estate.');

    await this.assertActingAdminPassword(user, scopedEstateId, confirm.currentPassword, 'ResidentProfile', residentId);

    await this.prisma.$transaction(async (tx) => {
      // Not a real delete: their invitations/visit history must survive.
      // Setting status to REMOVED blocks login immediately (both
      // AuthService.login and JwtStrategy.validate reject non-ACTIVE
      // users) and clearing the refresh token hash kills any session
      // that's still holding a valid refresh cookie.
      await tx.user.update({
        where: { id: resident.userId },
        data: { status: 'REMOVED', refreshTokenHash: null },
      });
      await this.recomputeApartmentOccupancy(tx, resident.apartmentId);
    });

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_RESIDENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentProfile',
      entityId: residentId,
      metadata: { change: 'removed', displayName: resident.displayName },
    });
    return { removed: true };
  }

  /**
   * An apartment is OCCUPIED if any resident still assigned to it hasn't
   * been removed (a SUSPENDED resident still lives there — only their
   * login is blocked — so this only cares about REMOVED). Called after
   * any write that could change who's assigned to an apartment.
   */
  private async recomputeApartmentOccupancy(
    tx: Prisma.TransactionClient,
    apartmentId: string,
  ) {
    const remaining = await tx.residentProfile.count({
      where: { apartmentId, user: { status: { not: 'REMOVED' } } },
    });
    await tx.apartment.update({
      where: { id: apartmentId },
      data: { status: remaining > 0 ? 'OCCUPIED' : 'VACANT' },
    });
  }

  async updateResidentStatus(
    user: AuthenticatedUser,
    estateId: string | undefined,
    residentId: string,
    dto: UpdateStatusDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const resident = await this.prisma.residentProfile.findFirst({
      where: { id: residentId, estateId: scopedEstateId },
    });
    if (!resident) throw new NotFoundException('Resident not found in this estate.');

    await this.prisma.user.update({ where: { id: resident.userId }, data: { status: dto.status } });
    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_RESIDENT',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'ResidentProfile',
      entityId: resident.id,
      metadata: { change: 'status', newStatus: dto.status, displayName: resident.displayName },
    });
    return { updated: true };
  }

  // ---- Security officers ----

  async createSecurityOfficer(
    user: AuthenticatedUser,
    estateId: string | undefined,
    dto: CreateSecurityOfficerDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    await this.assertEmployeeCodeIsFree(scopedEstateId, dto.employeeCode);
    const passwordHash = await this.authService.hashPassword(dto.temporaryPassword);

    let officer;
    try {
      officer = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { email: dto.email, phone: dto.phone, passwordHash, role: 'SECURITY_OFFICER' },
        });
        return tx.securityOfficerProfile.create({
          data: {
            userId: newUser.id,
            estateId: scopedEstateId,
            fullName: dto.fullName,
            employeeCode: dto.employeeCode,
          },
        });
      });
    } catch (err) {
      throw this.mapDuplicateEmployeeCodeError(err);
    }

    await this.auditLogs.log({
      action: 'SECURITY_OFFICER_CREATED',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'SecurityOfficerProfile',
      entityId: officer.id,
      metadata: { fullName: officer.fullName, employeeCode: officer.employeeCode },
    });
    return officer;
  }

  async listSecurityOfficers(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    return this.prisma.securityOfficerProfile.findMany({
      // Removed officers are hidden from the default roster — see the
      // matching comment on listResidents.
      where: { estateId: scopedEstateId, user: { status: { not: 'REMOVED' } } },
      include: { user: { select: { email: true, phone: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSecurityOfficer(
    user: AuthenticatedUser,
    estateId: string | undefined,
    officerId: string,
    dto: UpdateSecurityOfficerDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const officer = await this.prisma.securityOfficerProfile.findFirst({
      where: { id: officerId, estateId: scopedEstateId },
    });
    if (!officer) throw new NotFoundException('Security officer not found in this estate.');

    if (dto.employeeCode && dto.employeeCode !== officer.employeeCode) {
      await this.assertEmployeeCodeIsFree(scopedEstateId, dto.employeeCode, officerId);
    }

    let updated;
    try {
      updated = await this.prisma.securityOfficerProfile.update({
        where: { id: officerId },
        data: { fullName: dto.fullName, employeeCode: dto.employeeCode },
      });
      if (dto.phone !== undefined) {
        await this.prisma.user.update({ where: { id: officer.userId }, data: { phone: dto.phone } });
      }
    } catch (err) {
      throw this.mapDuplicateEmployeeCodeError(err);
    }

    await this.auditLogs.log({
      action: 'SECURITY_OFFICER_UPDATED',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'SecurityOfficerProfile',
      entityId: officerId,
      metadata: { change: 'updated', fullName: updated.fullName },
    });
    return updated;
  }

  async removeSecurityOfficer(
    user: AuthenticatedUser,
    estateId: string | undefined,
    officerId: string,
    confirm: ConfirmPasswordDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const officer = await this.prisma.securityOfficerProfile.findFirst({
      where: { id: officerId, estateId: scopedEstateId },
    });
    if (!officer) throw new NotFoundException('Security officer not found in this estate.');

    await this.assertActingAdminPassword(
      user,
      scopedEstateId,
      confirm.currentPassword,
      'SecurityOfficerProfile',
      officerId,
    );

    // Not a real delete, same reasoning as removeResident: their
    // verification/entry-exit history must stay attributable to them.
    await this.prisma.user.update({
      where: { id: officer.userId },
      data: { status: 'REMOVED', refreshTokenHash: null },
    });

    await this.auditLogs.log({
      action: 'SECURITY_OFFICER_REMOVED',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'SecurityOfficerProfile',
      entityId: officerId,
      metadata: { fullName: officer.fullName },
    });
    return { removed: true };
  }

  private async assertEmployeeCodeIsFree(
    estateId: string,
    employeeCode: string,
    excludeOfficerId?: string,
  ) {
    const clash = await this.prisma.securityOfficerProfile.findFirst({
      where: {
        estateId,
        employeeCode,
        ...(excludeOfficerId ? { id: { not: excludeOfficerId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(`Employee code "${employeeCode}" is already in use in this estate.`);
    }
  }

  private mapDuplicateEmployeeCodeError(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return new ConflictException('That employee code is already in use in this estate.');
    }
    return err;
  }

  async updateSecurityOfficerStatus(
    user: AuthenticatedUser,
    estateId: string | undefined,
    officerId: string,
    dto: UpdateStatusDto,
  ) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const officer = await this.prisma.securityOfficerProfile.findFirst({
      where: { id: officerId, estateId: scopedEstateId },
    });
    if (!officer) throw new NotFoundException('Security officer not found in this estate.');

    await this.prisma.user.update({ where: { id: officer.userId }, data: { status: dto.status } });
    await this.auditLogs.log({
      // CLAUDE.md §33 names this "Security officer created/disabled" as
      // one line item; SUSPENDED is the "disabled" half of that pair,
      // ACTIVE is a re-enable. Same action name either way, status is
      // in the metadata for whichever it was.
      action: 'SECURITY_OFFICER_STATUS_CHANGED',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'SecurityOfficerProfile',
      entityId: officer.id,
      metadata: { newStatus: dto.status, fullName: officer.fullName },
    });
    return { updated: true };
  }

  // ---- Estate settings (CLAUDE.md §6.3 — "View estate settings and
  // configuration" for Estate Admin, read-only: renaming/rebranding an
  // estate isn't a v1 requirement, just being able to see what's
  // configured is) ----

  async getEstateSettings(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const estate = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    if (!estate) throw new NotFoundException('Estate not found.');
    return estate;
  }

  async updateEstate(user: AuthenticatedUser, estateId: string | undefined, dto: UpdateEstateDto) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const existing = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    if (!existing) throw new NotFoundException('Estate not found.');

    const updated = await this.prisma.estate.update({
      where: { id: scopedEstateId },
      data: {
        name: dto.name?.trim(),
        // Distinguishes "field not sent" (leave alone) from "field sent
        // as an empty string" (clear it) — dto.address === '' is falsy
        // but still an intentional value, unlike dto.address === undefined.
        address: dto.address !== undefined ? dto.address.trim() : undefined,
        timezone: dto.timezone,
      },
    });

    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_ESTATE',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Estate',
      entityId: scopedEstateId,
      metadata: { fields: Object.keys(dto) },
    });

    return updated;
  }

  // ---- Dashboard overview (mockup 9) ----

  async getOverview(user: AuthenticatedUser, estateId?: string) {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalResidents, totalApartments, totalSecurityOfficers, visitorsToday] =
      await Promise.all([
        this.prisma.residentProfile.count({
          where: { estateId: scopedEstateId, user: { status: { not: 'REMOVED' } } },
        }),
        this.prisma.apartment.count({ where: { estateId: scopedEstateId } }),
        this.prisma.securityOfficerProfile.count({
          where: { estateId: scopedEstateId, user: { status: { not: 'REMOVED' } } },
        }),
        this.prisma.invitation.count({
          where: { estateId: scopedEstateId, createdAt: { gte: startOfToday } },
        }),
      ]);

    return { totalResidents, totalApartments, totalSecurityOfficers, visitorsToday };
  }
}
