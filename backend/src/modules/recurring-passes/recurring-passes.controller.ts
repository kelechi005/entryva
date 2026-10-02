import { Body, Controller, Delete, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RecurringPassesService, type ResidentPassContext } from './recurring-passes.service';
import { RecurringScanService } from './recurring-scan.service';
import {
  CreateRecurringPassDto,
  ExtraDayDto,
  RenewPassDto,
  ScanRecurringDto,
  SkipDayDto,
} from './dto/recurring-pass.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SecurityContextGuard } from '../../common/guards/security-context.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentSecurityContext } from '../../common/decorators/current-security-context.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { SecurityContext } from '../verification/verification.service';

function residentCtx(user: AuthenticatedUser): ResidentPassContext {
  return {
    userId: user.userId,
    residentId: user.residentId!,
    estateId: user.estateId!,
    apartmentId: user.apartmentId,
    displayName: user.displayName,
  };
}

// The resident manages their own recurring passes.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
@Controller('recurring-passes')
export class RecurringPassesController {
  constructor(private readonly service: RecurringPassesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecurringPassDto) {
    return this.service.create(residentCtx(user), dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(residentCtx(user));
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.history(residentCtx(user), id);
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.pause(residentCtx(user), id);
  }

  @Post(':id/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.resume(residentCtx(user), id);
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.revoke(residentCtx(user), id);
  }

  @Post(':id/skip')
  skip(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SkipDayDto) {
    return this.service.skipDay(residentCtx(user), id, dto.date);
  }

  @Post(':id/extra')
  extra(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ExtraDayDto) {
    return this.service.addExtraDay(residentCtx(user), id, dto);
  }

  @Delete(':id/exceptions/:date')
  removeException(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('date') date: string) {
    return this.service.removeException(residentCtx(user), id, date);
  }

  @Post(':id/renew')
  renew(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RenewPassDto) {
    return this.service.renew(residentCtx(user), id, dto.days);
  }

  @Post(':id/reset-phone')
  resetPhone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.resetPhone(residentCtx(user), id);
  }
}

// The guard scans a recurring pass's QR.
@UseGuards(JwtAuthGuard, RolesGuard, SecurityContextGuard)
@Roles('SECURITY_OFFICER')
@Controller('recurring-passes')
export class RecurringScanController {
  constructor(private readonly scanService: RecurringScanService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('scan')
  scan(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSecurityContext() ctx: SecurityContext,
    @Body() dto: ScanRecurringDto,
  ) {
    return this.scanService.scan(ctx, dto.token, user.userId);
  }
}

// The person's own pass page. No login: the secret link is the key, and the
// first phone that opens it is the only phone that can.
@Controller('recurring-passes/public')
export class RecurringPublicController {
  constructor(private readonly service: RecurringPassesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  view(@Param('token') token: string, @Headers('x-device-id') deviceId?: string) {
    return this.service.publicView(token, deviceId);
  }
}
