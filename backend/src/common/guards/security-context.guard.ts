import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Mirror of ResidentContextGuard for SECURITY_OFFICER routes. Applied
 * alongside JwtAuthGuard + RolesGuard(SECURITY_OFFICER) so a scan request
 * can only ever act within the officer's own estate.
 */
@Injectable()
export class SecurityContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Not authenticated.');
    }

    const profile = await this.prisma.securityOfficerProfile.findUnique({
      where: { userId },
    });

    if (!profile || profile.status !== 'ACTIVE') {
      throw new ForbiddenException('No active security officer profile for this account.');
    }

    req.securityContext = {
      securityOfficerId: profile.id,
      estateId: profile.estateId,
    };
    return true;
  }
}
