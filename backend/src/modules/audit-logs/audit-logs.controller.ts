import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

// Read-only for now (CLAUDE.md §33 admin audit log screen). Write access
// only ever happens internally via AuditLogsService.log() from other
// modules — never through an API route — so logs stay append-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    // SUPER_ADMIN has no estateId — until platform-level audit views
    // exist, scope this endpoint to estate admins only in practice.
    if (!user.estateId) {
      return [];
    }
    return this.auditLogsService.listForEstate(user.estateId);
  }
}
