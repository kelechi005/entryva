import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Runs after JwtAuthGuard + RolesGuard(RESIDENT). Looks up the
 * ResidentProfile owned by the authenticated user and attaches it to
 * req.residentContext, so downstream services never take estateId /
 * apartmentId / residentId from the request body — only from a value
 * the backend itself resolved from the verified token (CLAUDE.md §6, §58).
 */
@Injectable()
export class ResidentContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Not authenticated.');
    }

    const profile = await this.prisma.residentProfile.findUnique({
      where: { userId },
    });

    if (!profile || profile.status !== 'ACTIVE') {
      throw new ForbiddenException('No active resident profile for this account.');
    }

    req.residentContext = {
      residentId: profile.id,
      estateId: profile.estateId,
      apartmentId: profile.apartmentId,
      displayName: profile.displayName,
    };
    return true;
  }
}
