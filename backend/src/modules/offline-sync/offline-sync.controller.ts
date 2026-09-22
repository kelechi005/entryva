import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OfflineSyncService } from './offline-sync.service';
import { OfflineSyncBatchDto } from './dto/offline-sync-batch.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SecurityContextGuard } from '../../common/guards/security-context.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSecurityContext } from '../../common/decorators/current-security-context.decorator';
import type { SecurityContext } from '../verification/verification.service';

@UseGuards(JwtAuthGuard, RolesGuard, SecurityContextGuard)
@Roles('SECURITY_OFFICER')
@Controller('offline-sync')
export class OfflineSyncController {
  constructor(private readonly offlineSyncService: OfflineSyncService) {}

  // Fetched while online, cached in IndexedDB on the gate device for use
  // once connectivity drops. See CLAUDE.md §25.
  @Get('manifest')
  async getManifest(@CurrentSecurityContext() ctx: SecurityContext) {
    return this.offlineSyncService.getManifest(ctx);
  }

  // CLAUDE.md §38 explicitly calls out "Offline synchronization" among
  // endpoints to rate-limit, alongside login/verification.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  async sync(
    @CurrentSecurityContext() ctx: SecurityContext,
    @Body() dto: OfflineSyncBatchDto,
  ) {
    return this.offlineSyncService.syncBatch(ctx, dto);
  }
}
