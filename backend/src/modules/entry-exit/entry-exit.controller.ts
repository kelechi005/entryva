import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { EntryExitService } from './entry-exit.service';
import { RecordEntryDto } from './dto/record-entry.dto';
import { RecordExitDto } from './dto/record-exit.dto';
import { DenyEntryDto } from './dto/deny-entry.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SecurityContextGuard } from '../../common/guards/security-context.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSecurityContext } from '../../common/decorators/current-security-context.decorator';
import type { SecurityContext } from '../verification/verification.service';

@UseGuards(JwtAuthGuard, RolesGuard, SecurityContextGuard)
@Roles('SECURITY_OFFICER')
@Controller('entry-exit')
export class EntryExitController {
  constructor(private readonly entryExitService: EntryExitService) {}

  @Post('entry')
  async allowEntry(@CurrentSecurityContext() ctx: SecurityContext, @Body() dto: RecordEntryDto) {
    return this.entryExitService.recordEntry(ctx, dto);
  }

  @Post('exit')
  async recordExit(@CurrentSecurityContext() ctx: SecurityContext, @Body() dto: RecordExitDto) {
    return this.entryExitService.recordExit(ctx, dto);
  }

  @Post('deny')
  async denyEntry(@CurrentSecurityContext() ctx: SecurityContext, @Body() dto: DenyEntryDto) {
    await this.entryExitService.denyEntry(ctx, dto);
    return { denied: true };
  }

  @Get('current')
  async currentlyInside(@CurrentSecurityContext() ctx: SecurityContext) {
    return this.entryExitService.listCurrentlyInside(ctx);
  }

  @Get('history')
  async history(
    @CurrentSecurityContext() ctx: SecurityContext,
    @Query('limit') limit?: string,
  ) {
    return this.entryExitService.listHistory(ctx, limit ? Number(limit) : undefined);
  }
}
