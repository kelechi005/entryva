import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { hashSecret } from '../../common/crypto/token.util';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateEstateLocationDto } from './dto/update-estate-location.dto';
import { haversineMeters } from './geo.util';

// A main gate further than this from the estate pin is almost certainly a
// typo or a wrong map click, and would send every visitor to the wrong
// place. Large gated estates are well under this.
export const MAX_GATE_DISTANCE_M = 5_000;
export const DEFAULT_ARRIVAL_RADIUS_M = 100;

export interface EstateLocation {
  configured: boolean;
  estateName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mainGateName: string | null;
  mainGateLatitude: number | null;
  mainGateLongitude: number | null;
  entranceInstructions: string | null;
  arrivalRadiusMeters: number;
}

// What a visitor holding a live invitation link may learn: where to go,
// nothing else (no estate-centre pin, no resident or visitor data).
export interface PublicEstateEntrance {
  estateName: string;
  gateName: string;
  latitude: number;
  longitude: number;
  instructions: string | null;
  arrivalRadiusMeters: number;
}

@Injectable()
export class EstateLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // Same scoping rule as AdministrationService: an ESTATE_ADMIN is always
  // pinned to their own estate (any ?estateId= is ignored); only
  // SUPER_ADMIN names an estate. Enforced here, never in the browser.
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

  private toLocation(estate: {
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    mainGateName: string | null;
    mainGateLatitude: number | null;
    mainGateLongitude: number | null;
    entranceInstructions: string | null;
    arrivalRadiusMeters: number;
  }): EstateLocation {
    return {
      configured:
        estate.mainGateLatitude !== null && estate.mainGateLongitude !== null && !!estate.mainGateName,
      estateName: estate.name,
      address: estate.address,
      latitude: estate.latitude,
      longitude: estate.longitude,
      mainGateName: estate.mainGateName,
      mainGateLatitude: estate.mainGateLatitude,
      mainGateLongitude: estate.mainGateLongitude,
      entranceInstructions: estate.entranceInstructions,
      arrivalRadiusMeters: estate.arrivalRadiusMeters,
    };
  }

  async getLocation(user: AuthenticatedUser, estateId?: string): Promise<EstateLocation> {
    const scopedEstateId = this.resolveEstateId(user, estateId);
    const estate = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    if (!estate) throw new NotFoundException('Estate not found.');
    return this.toLocation(estate);
  }

  async updateLocation(
    user: AuthenticatedUser,
    estateId: string | undefined,
    dto: UpdateEstateLocationDto,
  ): Promise<EstateLocation> {
    const scopedEstateId = this.resolveEstateId(user, estateId);

    // (0, 0) is the "null island" default many tools produce for a missing
    // value - never a real estate.
    if ((dto.latitude === 0 && dto.longitude === 0) || (dto.mainGateLatitude === 0 && dto.mainGateLongitude === 0)) {
      throw new BadRequestException('Those coordinates look like a placeholder. Place the pin on the map.');
    }

    const gapM = haversineMeters(dto.latitude, dto.longitude, dto.mainGateLatitude, dto.mainGateLongitude);
    if (gapM > MAX_GATE_DISTANCE_M) {
      throw new BadRequestException(
        `The main gate is ${(gapM / 1000).toFixed(1)} km from the estate pin. ` +
          `Check both pins - the gate should be on the estate boundary.`,
      );
    }

    const existing = await this.prisma.estate.findUnique({ where: { id: scopedEstateId } });
    if (!existing) throw new NotFoundException('Estate not found.');

    const updated = await this.prisma.estate.update({
      where: { id: scopedEstateId },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        mainGateName: dto.mainGateName.trim(),
        mainGateLatitude: dto.mainGateLatitude,
        mainGateLongitude: dto.mainGateLongitude,
        // Empty string clears the tip.
        entranceInstructions: dto.entranceInstructions ? dto.entranceInstructions : null,
        arrivalRadiusMeters: dto.arrivalRadiusMeters ?? existing.arrivalRadiusMeters ?? DEFAULT_ARRIVAL_RADIUS_M,
      },
    });

    // Reuses ADMIN_CHANGED_ESTATE so the existing audit-log screen already
    // knows how to describe it. Metadata is operational only.
    await this.auditLogs.log({
      action: 'ADMIN_CHANGED_ESTATE',
      userId: user.userId,
      estateId: scopedEstateId,
      entity: 'Estate',
      entityId: scopedEstateId,
      metadata: { fields: ['location', 'main gate'], mainGateName: updated.mainGateName },
    });

    return this.toLocation(updated);
  }

  /**
   * Visitor-facing: the entrance for a live invitation. 404 when the link
   * is unknown OR navigation isn't set up (the page just hides the
   * Navigate button); 410 when the invitation is no longer usable.
   */
  async getEntranceForInvitation(rawToken: string): Promise<PublicEstateEntrance> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { secureTokenHash: hashSecret(rawToken) },
      include: { estate: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');

    const live = invitation.status === 'ACTIVE' || invitation.status === 'PENDING';
    if (!live || invitation.validUntil.getTime() < Date.now()) {
      throw new GoneException('This invitation is no longer active.');
    }

    const e = invitation.estate;
    if (e.mainGateLatitude === null || e.mainGateLongitude === null || !e.mainGateName) {
      throw new NotFoundException('Navigation has not been set up for this estate.');
    }

    return {
      estateName: e.name,
      gateName: e.mainGateName,
      latitude: e.mainGateLatitude,
      longitude: e.mainGateLongitude,
      instructions: e.entranceInstructions,
      arrivalRadiusMeters: e.arrivalRadiusMeters,
    };
  }
}
