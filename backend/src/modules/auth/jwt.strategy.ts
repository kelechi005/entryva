import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

interface JwtPayload {
  sub: string; // userId
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.AUTH_SECRET,
    });
  }

  /**
   * Runs on every authenticated request. Resolves the minimal user record
   * plus whichever role-specific profile applies, so downstream
   * controllers/services always get a fully-formed, trustworthy context —
   * never partial data they'd have to re-fetch (and could get wrong).
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    const base = { userId: user.id, role: user.role as AuthenticatedUser['role'] };

    if (user.role === 'RESIDENT') {
      const resident = await this.prisma.residentProfile.findUnique({ where: { userId: user.id } });
      if (!resident) throw new UnauthorizedException('No resident profile found.');
      return {
        ...base,
        displayName: resident.displayName,
        residentId: resident.id,
        estateId: resident.estateId,
        apartmentId: resident.apartmentId,
      };
    }

    if (user.role === 'SECURITY_OFFICER') {
      const officer = await this.prisma.securityOfficerProfile.findUnique({
        where: { userId: user.id },
      });
      if (!officer) throw new UnauthorizedException('No security officer profile found.');
      return {
        ...base,
        displayName: officer.fullName,
        securityOfficerId: officer.id,
        estateId: officer.estateId,
      };
    }

    // ESTATE_ADMIN — scoped to the one estate it administers.
    if (user.role === 'ESTATE_ADMIN') {
      return {
        ...base,
        displayName: user.email ?? user.phone ?? 'Estate Admin',
        estateId: user.adminEstateId ?? undefined,
      };
    }

    // SUPER_ADMIN — intentionally not scoped to any single estate.
    return { ...base, displayName: user.email ?? user.phone ?? 'Admin' };
  }
}
